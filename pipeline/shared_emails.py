"""Check the emails contributors share through apps-script/ (raw_items with source gmail_shared).

Uses the secret key from .env, like the rest of the pipeline. "waiting" = not read by Gemini yet (next
pipeline run); "read" = extracted. Read emails are deleted after RAW_ITEM_TTL_DAYS (14).

Run from the repo root:
  .venv/bin/python -m pipeline.shared_emails              # counts per list + newest emails
  .venv/bin/python -m pipeline.shared_emails --full 3     # also print the 3 newest in full
  .venv/bin/python -m pipeline.shared_emails --json > shared.json   # save them all
"""
import argparse
import json
import re
from collections import Counter

import requests

from pipeline.db import HEADERS, REST


def fetch(limit: int) -> list[dict]:
    resp = requests.get(f"{REST}/raw_items", headers=HEADERS, timeout=30, params={
        "source": "eq.gmail_shared", "select": "source_id,fetched_at,posted_at,processed,text",
        "order": "fetched_at.desc", "limit": limit})
    resp.raise_for_status()
    return resp.json()


def field(text: str | None, name: str) -> str:
    m = re.search(rf"^{name}: (.*)$", text or "", re.M)
    return m.group(1).strip() if m else ""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=100, help="newest N emails (default 100)")
    ap.add_argument("--full", type=int, default=0, metavar="N", help="print the N newest in full")
    ap.add_argument("--json", action="store_true", help="print everything as JSON")
    args = ap.parse_args()

    rows = fetch(args.limit)
    if args.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        return
    if not rows:
        print("No shared emails yet.")
        return
    waiting = sum(not r["processed"] for r in rows)
    print(f"{len(rows)} shared emails: {len(rows) - waiting} read by the pipeline, {waiting} waiting\n")
    for lst, n in Counter(field(r["text"], "List") for r in rows).most_common():
        print(f"  {n:3}  {lst}")
    print()
    for r in rows:
        print(f"{r['fetched_at'][:16].replace('T', ' ')}  {'read   ' if r['processed'] else 'waiting'}  "
              f"{field(r['text'], 'Subject')[:80]}")
    for r in rows[:args.full]:
        print(f"\n{'=' * 80}\n{r['text']}")


if __name__ == "__main__":
    main()
