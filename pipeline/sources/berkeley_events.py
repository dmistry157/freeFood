"""events.berkeley.edu (LiveWhale) JSON feed -> raw_items.

Run from the repo root:  .venv/bin/python -m pipeline.sources.berkeley_events
"""
import html
import time
from datetime import date, datetime, timedelta, timezone

import requests

from pipeline.db import insert_raw_items
from pipeline.text import strip_html

SOURCE = "berkeley_events"
BASE = "https://events.berkeley.edu/live/json/events"
FIELDS = "location,description,custom_room,registration,tags,event_types,group_title,is_online,last_modified"
HEADERS = {"User-Agent": "freeFoodTracker/0.1 (github.com/dmistry157/freeFood)"}
DAYS_AHEAD = 7
DELAY_S = 1.0  # be polite: one request per second


def fetch(days: int = DAYS_AHEAD) -> list[dict]:
    start = date.today()
    url = f"{BASE}/start_date/{start}/end_date/{start + timedelta(days=days)}/response_fields/{FIELDS}"
    events, page = [], 1
    while True:
        resp = requests.get(url, params={"page": page}, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        events += body["data"]
        if page >= body["meta"]["total_pages"]:
            return events
        page += 1
        time.sleep(DELAY_S)


def to_raw_item(e: dict) -> dict | None:
    if e.get("is_all_day") or e.get("is_canceled") or e.get("is_online") or not e.get("title"):
        return None
    lines = [
        f"Title: {html.unescape(e['title'])}",
        f"Start: {e['date_iso']}",
        f"End: {e.get('date2_iso') or 'unknown'}",
        f"Location: {html.unescape(e.get('location') or '')}",
        f"Room: {e.get('custom_room') or ''}",
        f"Organizer: {html.unescape(e.get('group_title') or '')}",
        f"Tags: {', '.join(e.get('tags') or [])}",
        f"Type: {', '.join(e.get('event_types') or [])}",
        f"Registration: {e.get('registration') or ''}",
        f"URL: {e['url']}",
        "",
        strip_html(e.get("description")),
    ]
    return {
        "source": SOURCE,
        "source_id": f"{e['id']}@{e['date_utc']}",  # repeating events share an id
        "text": "\n".join(lines),
        "posted_at": datetime.fromtimestamp(int(e["last_modified"]), timezone.utc).isoformat()
        if e.get("last_modified") else None,
    }


def run() -> int:
    events = fetch()
    rows = [r for r in map(to_raw_item, events) if r]
    new = insert_raw_items(rows)
    print(f"{SOURCE}: {len(events)} fetched, {len(rows)} in-person timed, {new} new")
    return new


if __name__ == "__main__":
    run()
