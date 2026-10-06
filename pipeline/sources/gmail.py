"""Gmail `FreeFood` label -> raw_items.

Images are not downloaded. media_paths holds references that Phase 4 resolves on demand:
  gmail:<message_id>:<attachment_id>   image attachment / inline image (fetched from Gmail)
  url:<https://...>                    flyer image linked from the email's HTML

Run from the repo root:  .venv/bin/python -m pipeline.sources.gmail
"""
import base64
import os
import re
import time
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from pipeline.db import existing_source_ids, insert_raw_items
from pipeline.text import strip_html

SOURCE = "gmail"
LOOKBACK = "newer_than:2d"
DELAY_S = 0.25          # Gmail per-user quota is easy to hit; pace message fetches
MIN_IMAGE_BYTES = 15_000  # skip logos, icons, signatures
MAX_IMAGES = 4
MAX_TEXT = 20_000
SKIP_IMG = re.compile(r"logo|icon|pixel|track|spacer|signature|avatar|badge|facebook|twitter|instagram|linkedin|"
                      r"youtube|tiktok|social|footer|header|banner-small|open\.php|beacon", re.I)


def service():
    creds = Credentials(
        None,
        refresh_token=os.environ["GMAIL_REFRESH_TOKEN"],
        client_id=os.environ["GMAIL_CLIENT_ID"],
        client_secret=os.environ["GMAIL_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def list_ids(gmail) -> list[str]:
    q = f"label:{os.environ.get('GMAIL_LABEL', 'FreeFood')} {LOOKBACK}"
    ids, token = [], None
    while True:
        resp = gmail.users().messages().list(userId="me", q=q, pageToken=token, maxResults=100).execute()
        ids += [m["id"] for m in resp.get("messages", [])]
        token = resp.get("nextPageToken")
        if not token:
            return ids


def walk(part):
    yield part
    for p in part.get("parts", []):
        yield from walk(p)


def decode(data: str) -> str:
    return base64.urlsafe_b64decode(data).decode("utf-8", "ignore")


def remote_images(html: str) -> list[str]:
    urls = []
    for tag in re.findall(r"<img\b[^>]*>", html, re.I):
        src = re.search(r'src="(https?://[^"]+)"', tag, re.I)
        if not src or SKIP_IMG.search(src.group(1)) or SKIP_IMG.search(tag):
            continue
        dims = [int(x) for x in re.findall(r'(?:width|height)="?(\d+)', tag, re.I)]
        if dims and min(dims) < 150:
            continue
        urls.append(src.group(1).replace("&amp;", "&"))
    return urls


def is_personal(headers: dict) -> bool:
    """A reply in a thread that didn't come through a mailing list: a conversation, not an announcement."""
    subject = headers.get("subject", "").lstrip().lower()
    return subject.startswith(("re:", "re ")) and not headers.get("list-id")


def to_raw_item(msg: dict) -> dict:
    headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
    posted_at = datetime.fromtimestamp(int(msg["internalDate"]) / 1000, timezone.utc).isoformat()
    if is_personal(headers):
        # Keep only a "seen" marker so it isn't re-fetched; never store or send its content.
        # (Same keys as a normal row: PostgREST bulk inserts require matching keys.)
        return {"source": SOURCE, "source_id": msg["id"], "text": None, "media_paths": [],
                "processed": True, "posted_at": posted_at}
    plain, html, media = [], [], []
    for p in walk(msg["payload"]):
        mime, body = p.get("mimeType", ""), p.get("body", {})
        if mime == "text/plain" and body.get("data"):
            plain.append(decode(body["data"]))
        elif mime == "text/html" and body.get("data"):
            html.append(decode(body["data"]))
        elif mime.startswith("image/") and body.get("attachmentId") and body.get("size", 0) >= MIN_IMAGE_BYTES:
            media.append(f"gmail:{msg['id']}:{body['attachmentId']}")
    for h in html:
        media += [f"url:{u}" for u in remote_images(h)]
    body_text = "\n".join(plain) or strip_html("\n".join(html))

    text = "\n".join([
        f"Subject: {headers.get('subject', '')}",
        f"From: {headers.get('from', '')}",
        f"Date: {headers.get('date', '')}",
        f"List: {headers.get('list-id', '')}",
        "",
        body_text.strip(),
    ])[:MAX_TEXT]
    return {
        "source": SOURCE,
        "source_id": msg["id"],
        "text": text,
        "media_paths": list(dict.fromkeys(media))[:MAX_IMAGES],
        "processed": False,
        "posted_at": posted_at,
    }


def run() -> int:
    gmail = service()
    ids = list_ids(gmail)
    todo = [i for i in ids if i not in existing_source_ids(SOURCE, ids)]
    rows = []
    for i in todo:
        rows.append(to_raw_item(gmail.users().messages().get(userId="me", id=i, format="full").execute()))
        time.sleep(DELAY_S)
    new = insert_raw_items(rows)
    print(f"{SOURCE}: {len(ids)} labeled in lookback, {len(todo)} fetched, {new} new, "
          f"{sum(r['text'] is None for r in rows)} personal skipped, "
          f"{sum(len(r.get('media_paths', [])) for r in rows)} image refs")
    return new


if __name__ == "__main__":
    run()
