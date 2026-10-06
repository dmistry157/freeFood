"""Instagram posts + stories (via Apify) for active clubs -> raw_items.

Instagram media URLs expire within hours, so images are downloaded immediately into the
private Supabase Storage bucket `media` (media_paths "storage:ig/<id>.jpg"). Phase 4 deletes
each image after reading it. Video posts/stories use their still thumbnail (no ffmpeg needed).

Every Apify call goes through apify_budget.run_actor (monthly cap, per-run cap, logged cost).
Scraper IDs are config so they're easy to swap.

Run from the repo root:
  .venv/bin/python -m pipeline.sources.instagram posts
  .venv/bin/python -m pipeline.sources.instagram stories
"""
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

from pipeline.apify_budget import BudgetExceeded, run_actor
from pipeline.db import HEADERS, REST, existing_source_ids, insert_raw_items, upload_media

SOURCE = "instagram"
POSTS_ACTOR = "sones/instagram-posts-scraper-lowcost"
STORIES_ACTOR = "goat255/instagram-stories-highlights-scraper"
POST_LOOKBACK = timedelta(days=2)
POSTS_PER_PROFILE = 3


def active_handles() -> list[str]:
    resp = requests.get(f"{REST}/clubs", headers=HEADERS, timeout=30,
                        params={"active": "is.true", "instagram_handle": "not.is.null", "select": "instagram_handle"})
    resp.raise_for_status()
    return sorted({r["instagram_handle"] for r in resp.json() if r["instagram_handle"]})


def iso(ts) -> str:
    return datetime.fromtimestamp(int(ts), timezone.utc).isoformat()


def save_image(url: str | None, name: str) -> list[str]:
    if not url:
        return []
    try:
        img = requests.get(url, timeout=30)
        img.raise_for_status()
        return [upload_media(f"ig/{name}.jpg", img.content, img.headers.get("content-type", "image/jpeg"))]
    except requests.RequestException as err:
        print(f"  image download failed for {name}: {err}")
        return []


def fetch_posts(handles: list[str]) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - POST_LOOKBACK
    items = run_actor(POSTS_ACTOR, {"usernames": handles, "postsPerProfile": POSTS_PER_PROFILE,
                                    "newerThan": cutoff.strftime("%Y-%m-%d")})
    posts = []
    for it in items:
        if not it.get("taken_at") or int(it["taken_at"]) < cutoff.timestamp():
            continue  # pinned/old posts
        caption = it.get("caption") or ""
        if isinstance(caption, dict):
            caption = caption.get("text", "")
        posts.append({
            "source_id": f"post:{it['code']}",
            "handle": it.get("scraped_username") or "",
            "taken_at": it["taken_at"],
            "url": it.get("post_url") or f"https://www.instagram.com/p/{it['code']}/",
            "body": caption,
            "image": it.get("image_url"),
        })
    return posts


def fetch_stories(handles: list[str]) -> list[dict]:
    items = run_actor(STORIES_ACTOR, {"usernames": handles, "includeStories": True, "includeHighlights": False})
    stories = []
    for acct in items:
        for s in acct.get("stories") or []:
            stories.append({
                "source_id": f"story:{s['id']}",
                "handle": acct.get("username") or "",
                "taken_at": s["takenAt"],
                "url": f"https://www.instagram.com/stories/{acct.get('username')}/{s['id']}/",
                "body": "(Instagram story, no caption. Read the image.)\n" + (s.get("accessibilityCaption") or ""),
                "image": s.get("imageUrl"),
            })
    return stories


def run(kind: str) -> int:
    handles = active_handles()
    try:
        found = fetch_posts(handles) if kind == "posts" else fetch_stories(handles)
    except BudgetExceeded as err:
        print(f"{SOURCE} {kind}: skipped. {err}")
        return 0
    seen = existing_source_ids(SOURCE, [f["source_id"] for f in found])
    rows = []
    for f in found:
        if f["source_id"] in seen:
            continue
        rows.append({
            "source": SOURCE,
            "source_id": f["source_id"],
            "text": f"Account: @{f['handle']}\nPosted: {iso(f['taken_at'])}\nURL: {f['url']}\n\n{f['body']}",
            "media_paths": save_image(f["image"], f["source_id"].replace(":", "_")),
            "posted_at": iso(f["taken_at"]),
        })
        time.sleep(0.2)
    new = insert_raw_items(rows)
    print(f"{SOURCE} {kind}: {len(handles)} accounts, {len(found)} found, {new} new, "
          f"{sum(len(r['media_paths']) for r in rows)} images stored")
    return new


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "posts")
