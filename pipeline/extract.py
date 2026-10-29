"""Phase 4: raw_items -> structured event candidates with Gemini (text + images).

Flow per unprocessed raw item:
  1. Free keyword check: no food/event signal and no images -> done, no LLM call.
  2. Resolve images (Gmail attachment / URL / Supabase Storage), skip banners and tiny images,
     downscale to <=1024px.
  3. Items are batched (Gemini free tier is ~20 requests/day/model): one call returns
     {"events": [...]} tagged with item_id (a newsletter can hold several events).
     When a model's daily quota runs out, fall back to the next model; if all are out, stop
     and leave the rest for the next run.
  4. Keep events with food_status stated|likely (club events: stated only), confidence >= 0.6, not already over.
  5. A batch Gemini rejects (400) is retried one item at a time; an item rejected on its own is dropped.
Stored Instagram images are deleted after they're read.

Run from the repo root:  .venv/bin/python -m pipeline.extract [--dry-run] [--limit N] [--ids 1,2,3]
"""
import argparse
import base64
import io
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from PIL import Image

from pipeline.db import BUCKET, HEADERS, REST, STORAGE, delete_media

# Free-tier quotas are per model, so a long chain multiplies the daily budget. Best first; Gemma 4 last
# (slow, but its own quota and 8/8 on our text eval). Gemma 4 26B was dropped: it returned broken JSON.
MODELS = os.environ.get("GEMINI_MODELS", ",".join([
    "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3-flash-preview",
    "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview", "gemma-4-31b-it",
])).split(",")
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
TEXT_BATCH = 8      # text-only items per call
IMAGE_BATCH = 3     # items with images per call
MAX_BATCH_IMAGES = 8
LA = ZoneInfo("America/Los_Angeles")
MIN_CONFIDENCE = 0.6
DEFAULT_DURATION = timedelta(hours=1)
STALE_POST = timedelta(days=7)  # Instagram items not read within a week are dropped unread
STALE_ITEM = timedelta(days=7)  # any item still unread after a week (keeps failing, say) is dropped
MAX_IMAGES = 4
MAX_SIDE = 1024
BANNER_RATIO = 2.2
DELAY_S = 4.0  # stay under free-tier requests-per-minute

FOOD = re.compile(r"\b(free food|food|pizza|snacks?|refreshments?|lunch|dinner|breakfast|brunch|boba|catered|"
                  r"beverages?|drinks|coffee|tea|cookies|donuts?|bagels?|ice cream|tacos?|desserts?|treats|"
                  r"potluck|bbq|barbecue|dumplings|sushi|burritos?|sandwiches|bites|appetizers|cake)\b", re.I)
LIKELY = re.compile(r"\b(info(rmation)?[- ]?sessions?|infosession|tech talk|mixer|networking|social|socials|"
                    r"reception|study break|general meeting|gm\s?\d?|open house|career fair|career connect|"
                    r"fireside|recruiting|meet the|kickoff|potluck|celebration|festival|party)\b", re.I)

PROMPT = """You extract FREE FOOD events at UC Berkeley. You get one or more items (emails, event listings,
Instagram posts/stories), each starting with "=== ITEM <id>" and followed by its images. Judge every item on
its own text and its own images only. Read the images: flyers often hold the details ("Free food!" only on the flyer).

Return {"events": [...]}: one entry per distinct in-person event, with item_id set to the item it came from.
An item with no event contributes nothing:
newsletters with no dated event, job postings, deadlines, recaps of past events, online-only events,
personal/1:1 plans, events outside the Berkeley area, or anything not open to a group of students.

For each event:
- food_status: "stated" if food/drink is offered (text or image), "likely" if not mentioned but the event
  type usually has food: company/employer information sessions (e.g. "<Company> Information Session"),
  tech talks, career/networking events, receptions, mixers, socials, study breaks, club general meetings,
  celebrations/festivals, and events framed around a meal ("over lunch", "lunch talk") unless they say to
  bring your own. "none" otherwise.
  Food that must be bought (bake sale, fundraiser, restaurant outing) is "none".
  For events run by a student club, use "stated" only when the text or flyer actually offers food; never infer it.
- host: "club" if a student club/organization runs it (including GMs, club socials, club info sessions),
  "university" for departments, campus offices and programs, "company" for employer-run events, else "other".
- food_reason: short quote or reason for food_status.
- start/end: ISO 8601 with offset in America/Los_Angeles. Copy times exactly as written (6-7:30pm -> 18:00 to 19:30). Resolve relative dates ("tomorrow", "this
  Thursday", "TONIGHT") from the item's posted time. end = "" if unknown.
- building: the building/place name as written (e.g. "Cory Hall", "Memorial Glade"); "" if none.
- room: room/floor as written; "" if none.
- food: what food, as written ("" if likely/unknown).
- requirements: what you need to get in (RSVP, ticket, membership, invite-only, Cal ID); "" if open.
- link: RSVP/registration/event URL if present, else "".
- open_to: who can attend (e.g. "all students", "EECS undergrads", "members").
- confidence: 0-1 that this is a real upcoming in-person event with the stated food_status and correct time.
"""

EVENT_SCHEMA = {
    "type": "object",
    "properties": {"events": {"type": "array", "items": {"type": "object", "properties": {
        k: {"type": "number"} if k == "confidence" else
        {"type": "string", "enum": ["stated", "likely", "none"]} if k == "food_status" else
        {"type": "string", "enum": ["club", "university", "company", "other"]} if k == "host" else {"type": "string"}
        for k in ["item_id", "title", "host", "food_status", "food_reason", "start", "end", "building", "room", "food",
                  "requirements", "link", "open_to", "confidence"]
    }, "required": ["item_id", "title", "host", "food_status", "start", "confidence"]}}},
    "required": ["events"],
}


URGENT = re.compile(r"\b(tonight|today|happening now|right now|this (morning|afternoon|evening)|"
                    r"in \d+\s*(min|mins|minutes|hour|hours|hr|hrs))\b", re.I)


class RateLimited(Exception):
    pass


# ---------- images ----------

_gmail = None


def gmail_attachment(msg_id: str, att_id: str) -> bytes:
    global _gmail
    if _gmail is None:
        from pipeline.sources.gmail import service
        _gmail = service()
    data = _gmail.users().messages().attachments().get(userId="me", messageId=msg_id, id=att_id).execute()["data"]
    return base64.urlsafe_b64decode(data)


def load_image(ref: str) -> bytes | None:
    try:
        if ref.startswith("gmail:"):
            _, msg_id, att_id = ref.split(":", 2)
            return gmail_attachment(msg_id, att_id)
        if ref.startswith("url:"):
            resp = requests.get(ref[4:], timeout=30)
        else:  # storage:<path>
            resp = requests.get(f"{STORAGE}/object/{BUCKET}/{ref.removeprefix('storage:')}", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return resp.content
    except Exception as err:  # an unreadable image shouldn't fail the item
        print(f"  image skipped ({ref[:60]}): {err}")
        return None


def prepare_image(data: bytes) -> str | None:
    """Return base64 JPEG, or None for banners/tiny/unreadable images."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None
    w, h = img.size
    if min(w, h) < 200 or max(w, h) / min(w, h) > BANNER_RATIO and w > h:
        return None
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


# ---------- gemini ----------

class _Models:
    """Current model; advances when one hits its daily free quota."""
    i = 0


def call_gemini(batch: list[tuple[dict, list[str]]]) -> list[dict]:
    """batch = [(raw_item, [base64 images])]. Returns raw events, each with item_id."""
    parts = [{"text": f"Now: {datetime.now(LA).isoformat()}"}]
    for item, images in batch:
        posted = item.get("posted_at") or "unknown"
        parts.append({"text": f"\n=== ITEM {item['id']} (posted {posted}, {len(images)} images)\n{item['text']}"})
        parts += [{"inline_data": {"mime_type": "image/jpeg", "data": b64}} for b64 in images]
    body = {
        "system_instruction": {"parts": [{"text": PROMPT}]},
        "contents": [{"parts": parts}],
        "generationConfig": {"response_mime_type": "application/json", "response_schema": EVENT_SCHEMA,
                             "temperature": 0},
    }
    attempt = 0
    while _Models.i < len(MODELS):
        model = MODELS[_Models.i]
        try:
            resp = requests.post(GEMINI.format(model), headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                                 json=body, timeout=300 if model.startswith("gemma") else 180)
        except requests.RequestException as err:  # timeout or dropped connection: treat like overload
            resp, net_err = None, err
        if resp is not None and resp.status_code in (404, 429):  # gone, or out of free quota today
            print(f"  {model}: {'quota hit' if resp.status_code == 429 else 'not available'}, switching model")
            _Models.i += 1
            attempt = 0
            continue
        if resp is None or resp.status_code in (500, 502, 503, 504):
            if attempt < 1:
                attempt += 1
                time.sleep(5)
                continue
            print(f"  {model}: overloaded ({resp.status_code if resp is not None else net_err}), switching model")
            _Models.i += 1
            attempt = 0
            continue
        resp.raise_for_status()
        try:
            out = resp.json()["candidates"][0]["content"]["parts"][-1]["text"]
            events = json.loads(out).get("events", [])
        except (KeyError, IndexError, ValueError, AttributeError) as err:  # blocked, empty or malformed answer
            print(f"  {model}: unusable answer ({type(err).__name__}), switching model")
            _Models.i += 1
            attempt = 0
            continue
        print(f"  {model}: {len(batch)} items in one call")
        return events
    raise RateLimited("no Gemini model available (out of free quota or overloaded)")


# ---------- per item ----------

def parse_time(s: str | None) -> datetime | None:
    try:
        t = datetime.fromisoformat(s)
        return t if t.tzinfo else t.replace(tzinfo=LA)
    except (TypeError, ValueError):
        return None


CLUB_SOURCES = {"instagram", "calevents"}  # assumed club-run if Gemini didn't say


def keep(ev: dict, now: datetime, source: str = "") -> dict | None:
    start = parse_time(ev.get("start"))
    if ev.get("food_status") not in ("stated", "likely") or ev.get("confidence", 0) < MIN_CONFIDENCE or not start:
        return None
    # Club events (GMs, socials, ...) only count when food is actually offered, so nobody walks into a
    # random club meeting expecting food.
    if ev.get("food_status") != "stated" and (ev.get("host") or ("club" if source in CLUB_SOURCES else "")) == "club":
        return None
    end = parse_time(ev.get("end")) or start + DEFAULT_DURATION
    if end <= start:
        end = start + DEFAULT_DURATION
    if end < now:
        return None
    return {**ev, "start": start.isoformat(), "end": end.isoformat()}


def needs_llm(item: dict) -> bool:
    text = item["text"] or ""
    return bool(item["media_paths"]) or bool(FOOD.search(text) or LIKELY.search(text))


def load_images(item: dict) -> list[str]:
    images = []
    for ref in (item["media_paths"] or [])[:MAX_IMAGES]:
        data = load_image(ref)
        b64 = prepare_image(data) if data else None
        if b64:
            images.append(b64)
    return images


def batches(items: list[dict]):
    """Text-only items in groups of TEXT_BATCH; image items in groups of IMAGE_BATCH / MAX_BATCH_IMAGES.
    Grouped by image refs; images are loaded only for batches actually sent."""
    n_refs = lambda it: len((it["media_paths"] or [])[:MAX_IMAGES])
    text = [it for it in items if not n_refs(it)]
    for i in range(0, len(text), TEXT_BATCH):
        yield text[i:i + TEXT_BATCH]
    group, n_img = [], 0
    for it in (it for it in items if n_refs(it)):
        if group and (len(group) >= IMAGE_BATCH or n_img + n_refs(it) > MAX_BATCH_IMAGES):
            yield group
            group, n_img = [], 0
        group.append(it)
        n_img += n_refs(it)
    if group:
        yield group


def fetch_items(limit: int, ids: list[int] | None) -> list[dict]:
    params = {"select": "id,source,source_id,text,media_paths,posted_at,fetched_at", "order": "fetched_at.asc", "limit": limit}
    params.update({"id": f"in.({','.join(map(str, ids))})"} if ids else {"processed": "is.false", "text": "not.is.null"})
    resp = requests.get(f"{REST}/raw_items", headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def mark_processed(item: dict):
    requests.patch(f"{REST}/raw_items", headers=HEADERS, params={"id": f"eq.{item['id']}"},
                   json={"processed": True}, timeout=30).raise_for_status()
    delete_media(item["media_paths"] or [])


START_LINE = re.compile(r"^Start: (\S+)", re.M)


def listed_start(item: dict) -> datetime | None:
    """Start time from structured sources (Berkeley Events, CalLink); None for email/Instagram."""
    m = START_LINE.search(item["text"] or "")
    return parse_time(m.group(1)) if m else None


def posted(item: dict) -> datetime | None:
    return parse_time(item.get("posted_at"))


def priority(item: dict):
    """Urgent first, then soonest listed start, then newest posts."""
    start = listed_start(item)
    posted = item.get("posted_at") or ""
    return (not URGENT.search(item["text"] or ""), start.timestamp() if start else float("inf"),
            "".join(chr(0x10FFFF - ord(c)) for c in posted))  # newest posted first


def bad_request(err: Exception) -> bool:
    """Gemini rejected this request itself (HTTP 400), so sending the same items again won't help."""
    return isinstance(err, requests.HTTPError) and err.response is not None and err.response.status_code == 400


def run(limit: int = 500, ids: list[int] | None = None, dry_run: bool = False,
        urgent_only: bool = False, max_calls: int | None = None, store=None) -> list[dict]:
    """Extract events from unprocessed raw items. Returns kept events (with raw_item id + source).
    urgent_only: just items that say tonight/today/in N mins (hourly runs, to spare Gemini quota).
    max_calls: Gemini calls allowed this run; the rest wait for the next run.
    store: called with each batch's events before its items are marked processed (dedupe.store),
    so a crash mid-run can't lose events whose items were already marked done."""
    now = datetime.now(timezone.utc)
    items = fetch_items(limit, ids)
    done_without_llm = [it for it in items if not needs_llm(it) or ((listed_start(it) or now) < now - DEFAULT_DURATION)
                        or (it["source"] == "instagram" and posted(it) and posted(it) < now - STALE_POST)
                        or (parse_time(it.get("fetched_at")) or now) < now - STALE_ITEM]
    if not dry_run:
        for it in done_without_llm:
            mark_processed(it)
    todo = sorted((it for it in items if it not in done_without_llm), key=priority)
    if urgent_only:
        todo = [it for it in todo if URGENT.search(it["text"] or "")]
    print(f"extract: {len(items)} pending, {len(done_without_llm)} done without Gemini (no keywords / already over / stale), "
          f"{len(todo)} to Gemini{' (urgent only)' if urgent_only else ''}, max {max_calls or 'unlimited'} calls")

    results, calls, ok_models, deferred = [], 0, set(), set()
    queue = list(batches(todo))
    while queue:
        group = queue.pop(0)
        if max_calls is not None and calls >= max_calls:
            print("Call cap reached; the remaining items wait for the next run.")
            break
        batch = [(it, load_images(it)) for it in group]
        try:
            raw = call_gemini(batch)
        except RateLimited as err:
            print(f"Stopping: {err}. The remaining items wait for the next run.")
            break
        except Exception as err:
            calls += 1
            ids_ = [it["id"] for it, _ in batch]
            if not bad_request(err):  # bad key, permissions, ...: every batch would fail the same way
                print(f"Stopping: batch {ids_} failed ({type(err).__name__}: {err}). Retrying next run.")
                break
            if len(group) > 1:  # find the item Gemini rejects: retry the batch one item at a time
                print(f"Batch {ids_} rejected (400); retrying its items one by one.")
                queue[:0] = [[it] for it in group]
            # Rejected on its own by a model that has worked this run: the item is the problem, so drop it
            # so it can't block the queue. (Not if only an earlier model worked: a fallback model that
            # rejects every request would otherwise drop good items.)
            elif MODELS[_Models.i] in ok_models:
                print(f"Item {ids_[0]} rejected by Gemini (400: {err}); dropping it.")
                if not dry_run:
                    mark_processed(group[0])
            elif ids_[0] not in deferred:  # nothing has worked yet: maybe every request fails; try others first
                deferred.add(ids_[0])
                queue.append(group)
            else:
                print(f"Stopping: every Gemini request was rejected (400: {err}). Retrying next run.")
                break
            continue
        calls += 1
        ok_models.add(MODELS[_Models.i])
        by_id = {it["id"]: it for it, _ in batch}
        kept_now = []
        for ev in raw:
            item = by_id.get(int(ev["item_id"])) if str(ev.get("item_id", "")).isdigit() else None
            kept = keep(ev, now, item["source"]) if item else None
            if kept:
                kept_now.append({**kept, "raw_item_id": item["id"], "source": item["source"]})
        results += kept_now
        if not dry_run:
            if store:
                store(kept_now)  # raises if Supabase is down, leaving these items for the next run
            for it, _ in batch:
                mark_processed(it)
        time.sleep(DELAY_S)
    print(f"extract: {calls} Gemini calls, {len(results)} events kept")
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--ids", help="comma-separated raw_item ids (for testing)")
    ap.add_argument("--dry-run", action="store_true", help="don't mark processed or delete images")
    a = ap.parse_args()
    for ev in run(a.limit, [int(x) for x in a.ids.split(",")] if a.ids else None, a.dry_run):
        print(json.dumps(ev, ensure_ascii=False))
