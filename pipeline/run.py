"""Pipeline entry point: fetch sources -> extract -> place + dedupe -> cleanup.

Run from the repo root, choosing which sources to fetch this run (cron decides the cadence):
  .venv/bin/python -m pipeline.run berkeley_events gmail
  .venv/bin/python -m pipeline.run callink calevents
  .venv/bin/python -m pipeline.run ig_posts
  .venv/bin/python -m pipeline.run ig_stories
  .venv/bin/python -m pipeline.run            # no sources: just extract pending items + cleanup
  .venv/bin/python -m pipeline.run auto       # scheduled mode (GitHub Actions, hourly)
A failing source is logged and skipped so the others still run.

auto mode adapts to however often GitHub actually runs it (it promises hourly, often delivers ~6h).
Each job runs when enough time has passed since it last ran (pipeline_state table):
  every run                       berkeley_events + gmail
  >= 2.5h since last full run     + callink + calevents; extract everything pending (max 6 Gemini calls)
  otherwise                       extract only urgent items (tonight/today/in N mins; max 2 calls)
  >= 20h since posts, after 8am   + ig_posts
  >= 20h since stories, after 12pm + ig_stories (stories last 24h; also caps Apify spend)
Gemini's free tier is ~20 requests/day per model; extract.MODELS chains 9 free models, so overflow moves down the chain.
"""
import sys
import traceback
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pipeline import dedupe, extract
from pipeline.db import cleanup, get_state, set_state
from pipeline.sources import berkeley_events, calevents, callink, gmail, instagram

SOURCES = {
    "berkeley_events": berkeley_events.run,
    "gmail": gmail.run,
    "callink": callink.run,
    "calevents": calevents.run,
    "ig_posts": lambda: instagram.run("posts"),
    "ig_stories": lambda: instagram.run("stories"),
}


LA = ZoneInfo("America/Los_Angeles")
FULL_EVERY = timedelta(hours=2.5)
IG_EVERY = timedelta(hours=20)


def due(key: str, every: timedelta, now: datetime) -> bool:
    last = get_state(key)
    return last is None or now - last >= every


def auto_plan(now: datetime) -> tuple[list[str], bool, list[str]]:
    """(sources to fetch, urgent_only, state keys to stamp after the run)."""
    hour = now.astimezone(LA).hour
    names, stamps = ["berkeley_events", "gmail"], []
    full = due("last_full_extract", FULL_EVERY, now)
    if full:
        names += ["callink", "calevents"]
        stamps.append("last_full_extract")
    if hour >= 8 and due("last_ig_posts", IG_EVERY, now):
        names.append("ig_posts")
        stamps.append("last_ig_posts")
    if hour >= 12 and due("last_ig_stories", IG_EVERY, now):
        names.append("ig_stories")
        stamps.append("last_ig_stories")
    return names, not full, stamps


def main(names: list[str], urgent_only: bool = False, after_fetch=None) -> int:
    """Returns the number of failed steps. after_fetch runs once the sources are done, before extraction."""
    failed = 0
    for name in names:
        try:
            SOURCES[name]()
        except Exception:
            failed += 1
            print(f"source {name} failed:\n{traceback.format_exc()}")
    if after_fetch:
        after_fetch()
    for step, fn in [("extract + store", lambda: dedupe.store(extract.run(urgent_only=urgent_only,
                                                                            max_calls=2 if urgent_only else 6))),
                     ("cleanup", cleanup)]:
        try:
            fn()
        except Exception:
            failed += 1
            print(f"{step} failed:\n{traceback.format_exc()}")
    return failed


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["auto"]:
        now = datetime.now(timezone.utc)
        names, urgent_only, stamps = auto_plan(now)
        print(f"auto @ {now.astimezone(LA):%a %H:%M} PT: sources={names}, "
              f"extract={'urgent only' if urgent_only else 'all pending'}")
        # Stamp as soon as the sources finish, even if one failed or extraction later crashes,
        # so a broken step can't make Apify scrape (and bill) again next run.
        failed = main(names, urgent_only, after_fetch=lambda: [set_state(key, now) for key in stamps])
        sys.exit(1 if failed else 0)
    unknown = set(args) - set(SOURCES)
    if unknown:
        sys.exit(f"unknown sources: {sorted(unknown)}; choose from {sorted(SOURCES)} or 'auto'")
    sys.exit(1 if main(args) else 0)
