"""calevents.app (student-built aggregator of 1000+ Berkeley clubs' Instagram events) -> raw_items.

Uses the JSON endpoint its own site calls (unofficial, no auth): /api/events?direction=future, paged
by cursor. Events are already structured (date, times, location, description written from the flyer),
so we store text only, and only events that hint at food, to spare Gemini quota and storage.

Run from the repo root:  .venv/bin/python -m pipeline.sources.calevents [--dry-run]
"""
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests

from pipeline.db import insert_raw_items
from pipeline.extract import FOOD

SOURCE = "calevents"
API = "https://www.calevents.app/api/events"
HEADERS = {"User-Agent": "freeFoodTracker/0.1 (github.com/dmistry157/freeFood)"}
LA = ZoneInfo("America/Los_Angeles")
DAYS_AHEAD = 7
PAGE = 50
MAX_PAGES = 10  # ~120 events/week fit in 3 pages; this is just a safety stop
DELAY_S = 1.0
ONLINE = {"online", "virtual", "zoom", "tba", "tbd", ""}


def fetch() -> list[dict]:
    horizon = (datetime.now(LA) + timedelta(days=DAYS_AHEAD)).date().isoformat()
    events, params = [], {"direction": "future", "limit": PAGE}
    for _ in range(MAX_PAGES):
        resp = requests.get(API, headers=HEADERS, params=params, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        events += body["events"]
        cursor = body.get("nextCursor")
        if not body.get("hasMore") or not cursor or events[-1]["date"] > horizon:
            break
        params = {"direction": "future", "limit": PAGE,
                  "cursorDate": cursor["date"], "cursorCreatedAt": cursor["createdAt"]}
        time.sleep(DELAY_S)
    unique = {e["events_id"]: e for e in events}  # pages can overlap at the cursor
    return [e for e in unique.values() if e["date"] <= horizon]


STALE_AFTER = timedelta(days=3)


def is_fresh() -> bool:
    """True if calevents added an upcoming event recently (its scraper is still running)."""
    resp = requests.get(API, headers=HEADERS, params={"direction": "future", "limit": PAGE}, timeout=30)
    resp.raise_for_status()
    newest = max(datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")) for e in resp.json()["events"])
    return datetime.now(LA) - newest < STALE_AFTER


def covered_handles() -> set[str]:
    """Instagram accounts calevents already turns into events (so our Apify posts scrape can skip them).
    Empty set if calevents is down or has stopped adding events, so our scraper covers everyone again."""
    try:
        if not is_fresh():
            print(f"{SOURCE}: no new events in {STALE_AFTER.days} days; Instagram posts will cover every club")
            return set()
        time.sleep(DELAY_S)
        resp = requests.get(f"{API.rsplit('/', 1)[0]}/accounts", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return {a["club_username"].lower() for a in resp.json()
                if (a.get("past_event_count") or 0) + (a.get("upcoming_event_count") or 0) > 0}
    except (requests.RequestException, ValueError, KeyError, TypeError) as err:
        print(f"{SOURCE}: couldn't load accounts ({err}); Instagram posts will cover every club")
        return set()


def local_time(date: str, hhmm: str | None) -> str | None:
    if not hhmm:
        return None
    return datetime.fromisoformat(f"{date}T{hhmm}").replace(tzinfo=LA).isoformat()


def to_raw_item(e: dict) -> dict | None:
    location = (e.get("location") or "").strip()
    text = f"{e['title']}\n{e.get('description') or ''}"
    # Club events need food actually mentioned (extract.keep drops "likely" for clubs), so skip LIKELY-only ones.
    if location.lower() in ONLINE or not FOOD.search(text):
        return None
    posts = e.get("source_posts") or []
    url = posts[0]["permalink"] if posts and posts[0].get("permalink") else e.get("link") or ""
    clubs = dict.fromkeys([e.get("club_username") or "", *(e.get("collaborator_clubs") or [])])
    lines = [
        f"Title: {e['title']}",
        f"Start: {local_time(e['date'], e.get('start_time')) or e['date']}",
        f"End: {local_time(e['date'], e.get('end_time')) or 'unknown'}",
        f"Location: {location}",
        f"Organizer: {', '.join(c for c in clubs if c)} (Instagram)",
        f"Type: {e.get('event_type') or ''}",
        f"Registration: {e.get('invite_type') or 'none listed'}",
        f"URL: {url}",
        "",
        e.get("description") or "",
    ]
    return {
        "source": SOURCE,
        "source_id": e["events_id"],
        "text": "\n".join(lines),
        "media_paths": [],
        "posted_at": posts[0].get("posted_at") if posts else None,
    }


def run(dry_run: bool = False) -> int:
    events = fetch()
    rows = [r for r in map(to_raw_item, events) if r]
    if dry_run:
        for r in rows:
            print(r["text"].split("\n\n")[0].replace("\n", " | ")[:220])
        print(f"{SOURCE} (dry run): {len(events)} in next {DAYS_AHEAD}d, {len(rows)} in person with food hints")
        return 0
    new = insert_raw_items(rows)
    print(f"{SOURCE}: {len(events)} in next {DAYS_AHEAD}d, {len(rows)} in person with food hints, {new} new")
    return new


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
