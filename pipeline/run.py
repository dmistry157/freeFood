"""Pipeline entry point: fetch sources -> extract -> place + dedupe -> cleanup.

Run from the repo root, choosing which sources to fetch this run (cron decides the cadence):
  .venv/bin/python -m pipeline.run berkeley_events gmail
  .venv/bin/python -m pipeline.run callink
  .venv/bin/python -m pipeline.run ig_posts
  .venv/bin/python -m pipeline.run ig_stories
  .venv/bin/python -m pipeline.run            # no sources: just extract pending items + cleanup
A failing source is logged and skipped so the others still run.
"""
import sys
import traceback

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


def main(names: list[str]) -> int:
    failed = 0
    for name in names:
        try:
            SOURCES[name]()
        except Exception:
            failed += 1
            print(f"source {name} failed:\n{traceback.format_exc()}")
    dedupe.store(extract.run())
    cleanup()
    return failed


if __name__ == "__main__":
    unknown = set(sys.argv[1:]) - set(SOURCES)
    if unknown:
        sys.exit(f"unknown sources: {sorted(unknown)}; choose from {sorted(SOURCES)}")
    sys.exit(1 if main(sys.argv[1:]) else 0)
