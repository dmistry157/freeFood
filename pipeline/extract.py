"""Phase 4: raw_items -> structured event candidates with Gemini (text + images).

Flow per unprocessed raw item:
  1. Free keyword check: no food/event signal and no images -> done, no LLM call.
  2. Resolve images (Gmail attachment / URL / Supabase Storage), skip banners and tiny images,
     downscale to <=1024px.
  3. Items are batched (Gemini free tier is ~20 requests/day/model): one call returns
     {"events": [...]} tagged with item_id (a newsletter can hold several events).
     When a model's daily quota runs out, fall back to the next model; if all are out, stop
     and leave the rest for the next run.
  4. Keep events with food_status stated|likely, confidence >= 0.6, not already over.
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

MODELS = os.environ.get("GEMINI_MODELS", "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",")
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
TEXT_BATCH = 8      # text-only items per call
IMAGE_BATCH = 3     # items with images per call
MAX_BATCH_IMAGES = 8
LA = ZoneInfo("America/Los_Angeles")
MIN_CONFIDENCE = 0.6
DEFAULT_DURATION = timedelta(hours=1)
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
        {"type": "string", "enum": ["stated", "likely", "none"]} if k == "food_status" else {"type": "string"}
        for k in ["item_id", "title", "food_status", "food_reason", "start", "end", "building", "room", "food",
                  "requirements", "link", "open_to", "confidence"]
    }, "required": ["item_id", "title", "food_status", "start", "confidence"]}}},
    "required": ["events"],
}


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
        resp = requests.post(GEMINI.format(model), headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                             json=body, timeout=180)
        if resp.status_code == 429:
            print(f"  {model}: quota hit, switching model")
            _Models.i += 1
            continue
        if resp.status_code in (500, 503) and attempt < 2:
            attempt += 1
            time.sleep(10 * attempt)
            continue
        resp.raise_for_status()
        out = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        print(f"  {model}: {len(batch)} items in one call")
        return json.loads(out).get("events", [])
    raise RateLimited("all Gemini models are out of free quota for today")


# ---------- per item ----------

def parse_time(s: str | None) -> datetime | None:
    try:
        t = datetime.fromisoformat(s)
        return t if t.tzinfo else t.replace(tzinfo=LA)
    except (TypeError, ValueError):
        return None


def keep(ev: dict, now: datetime) -> dict | None:
    start = parse_time(ev.get("start"))
    if ev.get("food_status") not in ("stated", "likely") or ev.get("confidence", 0) < MIN_CONFIDENCE or not start:
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


def batches(items: list[tuple[dict, list[str]]]):
    """Text-only items in groups of TEXT_BATCH; image items in groups of IMAGE_BATCH / MAX_BATCH_IMAGES."""
    text = [x for x in items if not x[1]]
    for i in range(0, len(text), TEXT_BATCH):
        yield text[i:i + TEXT_BATCH]
    group, n_img = [], 0
    for x in (x for x in items if x[1]):
        if group and (len(group) >= IMAGE_BATCH or n_img + len(x[1]) > MAX_BATCH_IMAGES):
            yield group
            group, n_img = [], 0
        group.append(x)
        n_img += len(x[1])
    if group:
        yield group


def fetch_items(limit: int, ids: list[int] | None) -> list[dict]:
    params = {"select": "id,source,source_id,text,media_paths,posted_at", "order": "fetched_at.asc", "limit": limit}
    params.update({"id": f"in.({','.join(map(str, ids))})"} if ids else {"processed": "is.false", "text": "not.is.null"})
    resp = requests.get(f"{REST}/raw_items", headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def mark_processed(item: dict):
    requests.patch(f"{REST}/raw_items", headers=HEADERS, params={"id": f"eq.{item['id']}"},
                   json={"processed": True}, timeout=30).raise_for_status()
    delete_media(item["media_paths"] or [])


def run(limit: int = 60, ids: list[int] | None = None, dry_run: bool = False) -> list[dict]:
    """Extract events from unprocessed raw items. Returns kept events (with raw_item id + source)."""
    items = fetch_items(limit, ids)
    skipped = [it for it in items if not needs_llm(it)]
    for it in skipped:
        if not dry_run:
            mark_processed(it)
    todo = [(it, load_images(it)) for it in items if needs_llm(it)]
    print(f"extract: {len(items)} items, {len(skipped)} skipped by keyword check, {len(todo)} to Gemini")

    now, results = datetime.now(timezone.utc), []
    for batch in batches(todo):
        try:
            raw = call_gemini(batch)
        except RateLimited as err:
            print(f"Stopping: {err}. The remaining items wait for the next run.")
            break
        by_id = {it["id"]: it for it, _ in batch}
        for ev in raw:
            item = by_id.get(int(ev.get("item_id") or 0)) if str(ev.get("item_id", "")).isdigit() else None
            kept = keep(ev, now) if item else None
            if kept:
                results.append({**kept, "raw_item_id": item["id"], "source": item["source"]})
        if not dry_run:
            for it, _ in batch:
                mark_processed(it)
        time.sleep(DELAY_S)
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=60)
    ap.add_argument("--ids", help="comma-separated raw_item ids (for testing)")
    ap.add_argument("--dry-run", action="store_true", help="don't mark processed or delete images")
    a = ap.parse_args()
    for ev in run(a.limit, [int(x) for x in a.ids.split(",")] if a.ids else None, a.dry_run):
        print(json.dumps(ev, ensure_ascii=False))
