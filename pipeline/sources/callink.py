"""CalLink (Campus Labs Engage) public event search API -> raw_items.

Only events with Public visibility are returned without a CalNet login, so this is a
small source (~20 upcoming events), but it includes exact coordinates and flyer images.

Run from the repo root:  .venv/bin/python -m pipeline.sources.callink
"""
import time
from datetime import datetime, timedelta, timezone

import requests

from pipeline.db import insert_raw_items
from pipeline.text import strip_html

SOURCE = "callink"
API = "https://callink.berkeley.edu/api/discovery/event/search"
HEADERS = {"User-Agent": "freeFoodTracker/0.1 (github.com/dmistry157/freeFood)"}
IMAGE = "https://se-images.campuslabs.com/clink/images/{}?preset=med-w"
DAYS_AHEAD = 7
PAGE = 100
DELAY_S = 1.0


def fetch() -> list[dict]:
    now = datetime.now(timezone.utc)
    events, skip = [], 0
    while True:
        resp = requests.get(API, headers=HEADERS, timeout=30, params={
            "endsAfter": now.isoformat(), "orderByField": "startsOn", "orderByDirection": "ascending",
            "status": "Approved", "take": PAGE, "skip": skip,
        })
        resp.raise_for_status()
        body = resp.json()
        events += body["value"]
        skip += PAGE
        if skip >= body["@odata.count"]:
            break
        time.sleep(DELAY_S)
    horizon = now + timedelta(days=DAYS_AHEAD)
    return [e for e in events if datetime.fromisoformat(e["startsOn"]) <= horizon]


def to_raw_item(e: dict) -> dict | None:
    location = (e.get("location") or "").strip()
    if not location or location.lower() in {"online", "virtual", "zoom"}:
        return None
    lines = [
        f"Title: {e['name']}",
        f"Start: {e['startsOn']}",
        f"End: {e.get('endsOn') or 'unknown'}",
        f"Location: {location}",
        f"Coordinates: {e['latitude']}, {e['longitude']}" if e.get("latitude") else "Coordinates: ",
        f"Organizer: {e.get('organizationName') or ''}",
        f"Categories: {', '.join(e.get('categoryNames') or [])}",
        f"Perks: {', '.join(e.get('benefitNames') or [])}",
        f"URL: https://callink.berkeley.edu/event/{e['id']}",
        "",
        strip_html(e.get("description")),
    ]
    return {
        "source": SOURCE,
        "source_id": f"{e['id']}@{e['startsOn']}",
        "text": "\n".join(lines),
        "media_paths": [f"url:{IMAGE.format(e['imagePath'])}"] if e.get("imagePath") else [],
        "posted_at": None,
    }


def run() -> int:
    events = fetch()
    rows = [r for r in map(to_raw_item, events) if r]
    new = insert_raw_items(rows)
    print(f"{SOURCE}: {len(events)} public in next {DAYS_AHEAD}d, {len(rows)} in-person, {new} new")
    return new


if __name__ == "__main__":
    run()
