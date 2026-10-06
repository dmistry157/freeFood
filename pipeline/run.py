"""Pipeline entry point: fetch sources -> extract -> place + dedupe -> cleanup.

Run from the repo root, choosing which sources to fetch this run (cron decides the cadence):
  .venv/bin/python -m pipeline.run berkeley_events gmail
  .venv/bin/python -m pipeline.run callink
  .venv/bin/python -m pipeline.run ig_posts
  .venv/bin/python -m pipeline.run ig_stories
  .venv/bin/python -m pipeline.run            # no sources: just extract pending items + cleanup
  .venv/bin/python -m pipeline.run auto       # scheduled mode (GitHub Actions, hourly)
A failing source is logged and skipped so the others still run.

auto mode (hour in America/Los_Angeles), sized to Gemini's free ~20 requests/day:
  every hour   berkeley_events + gmail; extract only urgent items (tonight/today/in N mins)
  every 3h     + callink; extract everything pending
  9am / 6pm    + ig_posts / ig_stories (both on 3-hour runs)
"""
import sys
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo

from pipeline import dedupe, extract
from pipeline.db import cleanup
from pipeline.sources import berkeley_events, callink, gmail, instagram

SOURCES = {
    "berkeley_events": berkeley_events.run,
    "gmail": gmail.run,
    "callink": callink.run,
    "ig_posts": lambda: instagram.run("posts"),
    "ig_stories": lambda: instagram.run("stories"),
}


def auto_plan(hour: int) -> tuple[list[str], bool]:
    """(sources to fetch, urgent_only) for this hour."""
    names = ["berkeley_events", "gmail"]
    full = hour % 3 == 0
    if full:
        names.append("callink")
    if hour == 9:
        names.append("ig_posts")
    if hour == 18:
        names.append("ig_stories")
    return names, not full


def main(names: list[str], urgent_only: bool = False) -> int:
    failed = 0
    for name in names:
        try:
            SOURCES[name]()
        except Exception:
            failed += 1
            print(f"source {name} failed:\n{traceback.format_exc()}")
    dedupe.store(extract.run(urgent_only=urgent_only, max_calls=1 if urgent_only else 3))
    cleanup()
    return failed


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["auto"]:
        hour = datetime.now(ZoneInfo("America/Los_Angeles")).hour
        names, urgent_only = auto_plan(hour)
        print(f"auto @ {hour}:00 PT: sources={names}, extract={'urgent only' if urgent_only else 'all pending'}")
        sys.exit(1 if main(names, urgent_only) else 0)
    unknown = set(args) - set(SOURCES)
    if unknown:
        sys.exit(f"unknown sources: {sorted(unknown)}; choose from {sorted(SOURCES)} or 'auto'")
    sys.exit(1 if main(args) else 0)
