"""Tiny Supabase REST helper for the pipeline (uses the secret key)."""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
REST = f"{os.environ['SUPABASE_URL']}/rest/v1"
KEY = os.environ["SUPABASE_SECRET_KEY"]
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def insert_raw_items(rows: list[dict]) -> int:
    """Insert rows into raw_items, silently skipping (source, source_id) already stored.
    Returns how many were new."""
    if not rows:
        return 0
    resp = requests.post(
        f"{REST}/raw_items",
        params={"on_conflict": "source,source_id", "select": "id"},
        headers={**HEADERS, "Prefer": "resolution=ignore-duplicates,return=representation"},
        json=rows,
        timeout=60,
    )
    resp.raise_for_status()
    return len(resp.json())


def existing_source_ids(source: str, ids: list[str]) -> set[str]:
    """Which of these source_ids are already in raw_items (saves re-fetching them)."""
    found = set()
    for i in range(0, len(ids), 100):
        chunk = ",".join(f'"{x}"' for x in ids[i:i + 100])
        resp = requests.get(f"{REST}/raw_items", headers=HEADERS, timeout=30,
                            params={"source": f"eq.{source}", "source_id": f"in.({chunk})", "select": "source_id"})
        resp.raise_for_status()
        found |= {r["source_id"] for r in resp.json()}
    return found


RAW_ITEM_TTL_DAYS = 14  # longer than any source's lookback window, so deleted items aren't re-fetched


def cleanup() -> tuple[int, int]:
    """Delete events that have ended and processed raw_items older than the TTL."""
    now = datetime.now(timezone.utc)
    prefer = {**HEADERS, "Prefer": "return=representation"}
    ev = requests.delete(f"{REST}/events", headers=prefer, timeout=30,
                         params={"end_time": f"lt.{now.isoformat()}", "select": "id"})
    raw = requests.delete(f"{REST}/raw_items", headers=prefer, timeout=30,
                          params={"processed": "is.true", "select": "id",
                                  "fetched_at": f"lt.{(now - timedelta(days=RAW_ITEM_TTL_DAYS)).isoformat()}"})
    ev.raise_for_status(); raw.raise_for_status()
    print(f"cleanup: {len(ev.json())} ended events, {len(raw.json())} old raw items deleted")
    return len(ev.json()), len(raw.json())


STORAGE = f"{os.environ['SUPABASE_URL']}/storage/v1"
BUCKET = "media"


def upload_media(path: str, data: bytes, content_type: str) -> str:
    """Store an image in the private media bucket; returns a media_paths ref ("storage:<path>")."""
    resp = requests.post(f"{STORAGE}/object/{BUCKET}/{path}", data=data, timeout=60,
                         headers={**HEADERS, "Content-Type": content_type, "x-upsert": "true"})
    resp.raise_for_status()
    return f"storage:{path}"


def delete_media(refs: list[str]) -> None:
    """Delete stored images once they've been read (Phase 4)."""
    paths = [r.removeprefix("storage:") for r in refs if r.startswith("storage:")]
    if paths:
        requests.delete(f"{STORAGE}/object/{BUCKET}", headers=HEADERS, json={"prefixes": paths},
                        timeout=30).raise_for_status()
