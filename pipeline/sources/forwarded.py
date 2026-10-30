"""Forwarded event mail -> raw_items.

Students forward club/department event emails (LSBE, EECS, cultural orgs — lists we aren't on) to a
dedicated mailbox, and this reads that mailbox over IMAP. Opt-in per message: no OAuth, no access to
anyone's inbox, nothing to revoke. See `Email Ingestion Plan.md` for why this shape and not an
OAuth read of each user's Gmail.

Privacy (the mail belongs to people who didn't choose us):
  - Only forwards from FORWARD_ALLOWED_DOMAINS (default berkeley.edu) are read at all.
  - The forwarder's own address is used for that check and then dropped: it is never stored,
    never sent to Gemini.
  - To/Cc inside the forwarded header block are stripped, so other recipients aren't collected.
  - Personal replies (Re: with no List-Id) are skipped, as in sources/gmail.py.

Unconfigured (no FORWARD_IMAP_* set) is not an error: it prints a note and does nothing, so the
pipeline runs the same on a laptop or in Actions without the new secrets.

Run from the repo root:  .venv/bin/python -m pipeline.sources.forwarded [--dry-run]
"""
import email
import hashlib
import imaplib
import os
import re
import sys
from datetime import datetime
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime
from zoneinfo import ZoneInfo

from pipeline.db import insert_raw_items, upload_media
from pipeline.sources.gmail import MIN_IMAGE_BYTES, remote_images
from pipeline.text import strip_html

SOURCE = "forwarded"
FOLDER = os.environ.get("FORWARD_IMAP_FOLDER", "INBOX")
# Who may forward. Suffix match, so "berkeley.edu" covers eecs.berkeley.edu; empty = anyone.
ALLOWED_DOMAINS = [d.strip().lower().lstrip("@") for d in
                   os.environ.get("FORWARD_ALLOWED_DOMAINS", "berkeley.edu").split(",") if d.strip()]
MAX_PER_RUN = 30        # a forwarding burst shouldn't eat a day of Gemini quota
MAX_TEXT = 20_000       # same as sources/gmail.py
MAX_IMAGES = 4
LA = ZoneInfo("America/Los_Angeles")


def configured() -> bool:
    return all(os.environ.get(k) for k in ("FORWARD_IMAP_HOST", "FORWARD_IMAP_USER", "FORWARD_IMAP_PASSWORD"))


def allowed(from_header: str) -> bool:
    domain = parseaddr(from_header)[1].rsplit("@", 1)[-1].lower()
    return not ALLOWED_DOMAINS or any(domain == d or domain.endswith("." + d) for d in ALLOWED_DOMAINS)


FWD_PREFIX = re.compile(r"^\s*(?:fwd?\s*:\s*)+", re.I)
FWD_MARKER = re.compile(r"^(?:-+\s*Forwarded message\s*-+|Begin forwarded message:|"
                        r"-+\s*Original Message\s*-+)\s*:?\s*$", re.I | re.M)
HEADER_LINE = re.compile(r"^\s*(From|Sent|Date|Subject|To|Cc|Bcc|Reply-To):\s*(.*)$", re.I)
RECIPIENT_LINE = re.compile(r"^\s*(?:To|Cc|Bcc):", re.I)
WRAPPER_LINES = 12  # how far past the marker to look for the original headers


def unwrap(body: str) -> tuple[dict[str, str], str]:
    """Pull the original From/Date/Subject out of the client's forward wrapper.

    Returns (original headers, body with the wrapper's recipient lines removed). The original date
    matters: extract.py resolves "this Thursday" against posted_at, so stamping an item with the
    time it was forwarded would shift every relative date.
    """
    m = FWD_MARKER.search(body)
    if not m:
        return {}, body
    lines = body.split("\n")
    start = body[:m.start()].count("\n") + 1
    original, drop, misses = {}, set(), 0
    for i in range(start, min(start + WRAPPER_LINES, len(lines))):
        hit = HEADER_LINE.match(lines[i])
        if hit:
            original.setdefault(hit.group(1).lower(), hit.group(2).strip())
            misses = 0
            if RECIPIENT_LINE.match(lines[i]):
                drop.add(i)       # don't collect the other recipients
        elif lines[i].strip():
            misses += 1
            if misses > 1:        # two real lines in a row: the wrapper is over
                break
    return original, "\n".join(l for i, l in enumerate(lines) if i not in drop)


# Gmail writes "Thu, Oct 30, 2026 at 9:00 AM" in its wrapper, which isn't RFC 822.
INLINE_DATES = ["%a, %b %d, %Y at %I:%M %p", "%a, %d %b %Y at %H:%M",
                "%B %d, %Y, at %I:%M %p", "%b %d, %Y, at %I:%M %p",   # Apple Mail
                "%d %B %Y, at %H:%M", "%d %b %Y, at %H:%M", "%m/%d/%Y %I:%M %p"]


def parse_date(raw: str | None) -> datetime | None:
    raw = (raw or "").strip().replace("\u202f", " ")  # Gmail uses a narrow no-break space before AM/PM
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        pass
    for fmt in INLINE_DATES:
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=LA)
        except ValueError:
            continue
    return None


def is_personal(subject: str, list_id: str) -> bool:
    """A reply that didn't come through a mailing list: a conversation, not an announcement."""
    return bool(re.match(r"^\s*re\s*:", subject, re.I)) and not list_id


def decoded(value: str) -> str:
    """Headers arrive RFC 2047-encoded ("=?UTF-8?B?...?=") whenever a subject has an emoji or accent."""
    try:
        return str(make_header(decode_header(value)))
    except (UnicodeDecodeError, LookupError, ValueError):
        return value


def body_parts(msg: Message) -> tuple[list[str], list[str], list[tuple[bytes, str]]]:
    plain, html, images = [], [], []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        mime, data = part.get_content_type(), part.get_payload(decode=True)
        if not data:
            continue
        if mime == "text/plain":
            plain.append(data.decode(part.get_content_charset() or "utf-8", "ignore"))
        elif mime == "text/html":
            html.append(data.decode(part.get_content_charset() or "utf-8", "ignore"))
        elif mime.startswith("image/") and len(data) >= MIN_IMAGE_BYTES:
            images.append((data, mime))
    return plain, html, images


def store_images(images: list[tuple[bytes, str]], key: str, dry_run: bool) -> list[str]:
    """Attached flyers go to the private media bucket; extract.py reads then deletes them.
    The path is derived from the Message-ID, so re-reading a message after a failed insert
    overwrites its images instead of piling up copies."""
    refs = []
    for i, (data, mime) in enumerate(images[:MAX_IMAGES]):
        ext = {"image/png": "png", "image/gif": "gif", "image/webp": "webp"}.get(mime, "jpg")
        path = f"fwd/{key}-{i}.{ext}"
        refs.append(f"storage:{path}" if dry_run else upload_media(path, data, mime))
    return refs


def to_raw_item(raw: bytes, dry_run: bool = False) -> dict | None:
    """One forwarded message -> a raw_items row, or None if it isn't ours to read."""
    msg = email.message_from_bytes(raw)
    if not allowed(msg.get("from", "")):
        return None
    envelope_subject = decoded(str(msg.get("subject", "") or ""))
    if is_personal(FWD_PREFIX.sub("", envelope_subject), msg.get("list-id", "")):
        return None

    plain, html, images = body_parts(msg)
    body = "\n".join(plain).strip() or strip_html("\n".join(html))
    original, body = unwrap(body)

    subject = original.get("subject") or FWD_PREFIX.sub("", envelope_subject).strip()
    when = parse_date(original.get("date") or original.get("sent")) or parse_date(msg.get("date"))
    # The forwarder's address stays out of the row entirely; only the original sender is kept.
    sender = original.get("from", "")
    message_id = (msg.get("message-id") or "").strip()
    key = hashlib.sha256((message_id or f"{envelope_subject}|{msg.get('date', '')}").encode()).hexdigest()[:16]

    media = store_images(images, key, dry_run)
    for h in html:
        media += [f"url:{u}" for u in remote_images(h)]
    text = "\n".join([
        f"Subject: {subject}",
        f"From: {sender}",
        f"Date: {original.get('date') or original.get('sent') or msg.get('date', '')}",
        f"List: {msg.get('list-id', '')}",
        "",
        body.strip(),
    ])[:MAX_TEXT]
    return {
        "source": SOURCE,
        "source_id": message_id or key,
        "text": text,
        "media_paths": list(dict.fromkeys(media))[:MAX_IMAGES],
        "processed": False,
        "posted_at": when.isoformat() if when else None,
    }


def connect(readonly: bool = False) -> imaplib.IMAP4_SSL:
    box = imaplib.IMAP4_SSL(os.environ["FORWARD_IMAP_HOST"])
    box.login(os.environ["FORWARD_IMAP_USER"], os.environ["FORWARD_IMAP_PASSWORD"])
    box.select(FOLDER, readonly=readonly)
    return box


def fetch(box, dry_run: bool = False) -> tuple[list[dict], list[bytes], int]:
    """(rows, UIDs to flag, messages read). Reads with PEEK so nothing is marked \\Seen until the
    rows are safely inserted: a crash leaves them for the next run, and raw_items' unique
    (source, source_id) stops that retry from duplicating anything."""
    _, data = box.uid("SEARCH", None, "UNSEEN")
    uids = (data[0] or b"").split()[-MAX_PER_RUN:]  # oldest first; take the most recent
    rows, done = [], []
    for uid in uids:
        _, parts = box.uid("FETCH", uid, "(BODY.PEEK[])")
        raw = next((p[1] for p in parts or [] if isinstance(p, tuple)), None)
        if not raw:
            continue
        row = to_raw_item(raw, dry_run)
        done.append(uid)
        if row:
            rows.append(row)
    return rows, done, len(uids)


def mark_read(box, uids: list[bytes]) -> None:
    for uid in uids:
        box.uid("STORE", uid, "+FLAGS", "\\Seen")


def run(dry_run: bool = False) -> int:
    if not configured():
        print(f"{SOURCE}: no FORWARD_IMAP_* configured, skipping (see 'Email Ingestion Plan.md')")
        return 0
    box = connect(readonly=dry_run)
    try:
        rows, uids, seen = fetch(box, dry_run)
        if dry_run:
            for r in rows:
                print(r["text"].split("\n\n")[0].replace("\n", " | ")[:220])
            print(f"{SOURCE} (dry run): {seen} unread, {len(rows)} usable")
            return 0
        new = insert_raw_items(rows)
        mark_read(box, uids)      # only once the rows are stored
    finally:
        try:
            box.logout()
        except Exception:         # a dead connection shouldn't fail the run
            pass
    print(f"{SOURCE}: {seen} unread, {len(rows)} from allowed senders, {new} new, "
          f"{sum(len(r['media_paths']) for r in rows)} image refs")
    return new


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
