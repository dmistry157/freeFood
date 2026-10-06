"""Phase 5: place extracted events on the map and merge duplicates into the events table.

- Location: geocode(building) -> geocode(building + room) -> CalLink coordinates -> none (list view).
- Fingerprint: LA date + start hour + building (canonical name if geocoded, else normalized text).
- Same fingerprint + similar title -> merge (richest fields win, source URLs unioned).
  Same fingerprint + different title -> a separate event (fingerprint gets a suffix).
"""
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from rapidfuzz import fuzz

from pipeline.db import HEADERS, REST
from pipeline.geocode import geocode, normalize

LA = ZoneInfo("America/Los_Angeles")
SAME_EVENT_TITLE = 60  # token_set_ratio at or above this = same event
TEXT_FIELDS = ["title", "building", "room", "food", "food_reason", "requirements", "link", "open_to"]
RICHEST_WINS = TEXT_FIELDS[1:]  # title keeps the first version stored (shorter, cleaner on a pin)
COORDS = re.compile(r"^Coordinates: (-?\d+\.\d+), (-?\d+\.\d+)", re.M)
ORGANIZER = re.compile(r"^Organizer: (.+)$", re.M)
# Organizers whose listings often omit the building but almost always meet in one place.
DEFAULT_BUILDING = {"Law": "The Law Building"}
URL = re.compile(r"^URL: (https?://\S+)", re.M)


def locate(ev: dict, raw_text: str) -> tuple[str, float | None, float | None]:
    building, room = ev.get("building") or "", ev.get("room") or ""
    org = ORGANIZER.search(raw_text or "")
    if not building and org and org.group(1).strip() in DEFAULT_BUILDING:
        building = DEFAULT_BUILDING[org.group(1).strip()]
    hit = geocode(building) or geocode(f"{building} {room}")
    if hit:
        return hit["building"], hit["lat"], hit["lng"]
    m = COORDS.search(raw_text or "")
    if m:
        return building, float(m.group(1)), float(m.group(2))
    return building, None, None


def fingerprint(start: datetime, building: str, title: str) -> str:
    place = normalize(building) or normalize(title)
    return f"{start.astimezone(LA):%Y-%m-%d|%H}|{place}"


def to_row(ev: dict, raw_text: str) -> dict:
    start, end = datetime.fromisoformat(ev["start"]), datetime.fromisoformat(ev["end"])
    building, lat, lng = locate(ev, raw_text)
    urls = [u for u in [ev.get("link"), *URL.findall(raw_text or "")] if u and u.startswith("http")]
    return {
        "title": ev["title"].strip(),
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "building": building or None,
        "room": ev.get("room") or None,
        "lat": lat,
        "lng": lng,
        "food": ev.get("food") or None,
        "food_status": ev["food_status"],
        "food_reason": ev.get("food_reason") or None,
        "requirements": ev.get("requirements") or None,
        "link": ev.get("link") or (urls[0] if urls else None),
        "open_to": ev.get("open_to") or None,
        "confidence": ev.get("confidence"),
        "fingerprint": fingerprint(start, building, ev["title"]),
        "source_urls": list(dict.fromkeys(urls)),
    }


def merge(old: dict, new: dict) -> dict:
    out = dict(old)
    for f in RICHEST_WINS:
        if len(new.get(f) or "") > len(old.get(f) or ""):
            out[f] = new[f]
    if old.get("lat") is None and new.get("lat") is not None:
        out["lat"], out["lng"] = new["lat"], new["lng"]
    if new["food_status"] == "stated":
        out["food_status"] = "stated"
    out["confidence"] = max(old.get("confidence") or 0, new.get("confidence") or 0)
    out["source_urls"] = list(dict.fromkeys((old.get("source_urls") or []) + new["source_urls"]))
    return out


def upsert(row: dict) -> str:
    """Insert or merge one event row. Returns 'new' or 'merged'."""
    base = row["fingerprint"]
    existing = requests.get(f"{REST}/events", headers=HEADERS, timeout=30,
                            params={"fingerprint": f"like.{base}*", "select": "*"}).json()
    existing = [e for e in existing if e["fingerprint"] == base or e["fingerprint"].startswith(base + "#")]
    for e in existing:
        if fuzz.token_set_ratio(normalize(e["title"]), normalize(row["title"])) >= SAME_EVENT_TITLE:
            merged = merge(e, row)
            patch = {k: merged[k] for k in [*TEXT_FIELDS, "lat", "lng", "food_status", "confidence", "source_urls"]}
            requests.patch(f"{REST}/events", headers=HEADERS, params={"id": f"eq.{e['id']}"},
                           json=patch, timeout=30).raise_for_status()
            return "merged"
    if existing:
        row = {**row, "fingerprint": f"{base}#{len(existing) + 1}"}
    requests.post(f"{REST}/events", headers=HEADERS, json=row, timeout=30).raise_for_status()
    return "new"


def store(events: list[dict]) -> dict:
    """events = extract.run() output (each has raw_item_id). Returns counts."""
    ids = sorted({e["raw_item_id"] for e in events})
    texts = {}
    if ids:
        resp = requests.get(f"{REST}/raw_items", headers=HEADERS, timeout=30,
                            params={"id": f"in.({','.join(map(str, ids))})", "select": "id,text"})
        texts = {r["id"]: r["text"] for r in resp.json()}
    counts = {"new": 0, "merged": 0, "on_map": 0, "list_only": 0}
    for ev in events:
        row = to_row(ev, texts.get(ev["raw_item_id"], ""))
        counts[upsert(row)] += 1
        counts["on_map" if row["lat"] is not None else "list_only"] += 1
    print(f"dedupe: {counts['new']} new, {counts['merged']} merged; "
          f"{counts['on_map']} on map, {counts['list_only']} list-only")
    return counts
