"""Offline checks for the forwarded-mail source: wrapper parsing, the sender allowlist, privacy
(the forwarder's address and other recipients never reach the row), images, and the read-only
ordering of insert vs \\Seen. IMAP and Supabase are faked, so this costs nothing and cannot touch
production.  Run: .venv/bin/python pipeline/tests/test_forwarded.py"""
import os
import sys
from email.message import EmailMessage
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
# Dummy credentials, set before the modules load: no test may reach the real Supabase or a mailbox.
for key, value in {"SUPABASE_URL": "http://localhost:0", "SUPABASE_SECRET_KEY": "test",
                   "FORWARD_IMAP_HOST": "imap.invalid", "FORWARD_IMAP_USER": "u",
                   "FORWARD_IMAP_PASSWORD": "p", "FORWARD_ALLOWED_DOMAINS": "berkeley.edu"}.items():
    os.environ.setdefault(key, value)

from pipeline import extract                      # noqa: E402
from pipeline.sources import forwarded            # noqa: E402

checks = []


def check(name, ok):
    checks.append((name, ok))
    print(("ok   " if ok else "FAIL ") + name)


GMAIL_FWD = """Here's one for the map!

---------- Forwarded message ---------
From: LSBE Board <board@lsbe.berkeley.edu>
Date: Wed, Oct 28, 2026 at 9:00 AM
Subject: Free pizza at tonight's GM
To: lsbe-announce@lists.berkeley.edu
Cc: officers@lsbe.berkeley.edu

Come to our general meeting tonight, 6pm in Cory 540. Free pizza for everyone.
"""

APPLE_FWD = """Begin forwarded message:

From: EECS Dept <grads@eecs.berkeley.edu>
Subject: Coffee and bagels Thursday
Date: October 28, 2026, at 10:30 AM
To: eecs-grads@berkeley.edu

Bagels and coffee, Thursday 9am, Soda 380.
"""


def msg(body, sender="student@berkeley.edu", subject="Fwd: Free pizza", html=None,
        images=(), message_id="<abc123@mail.gmail.com>", date="Wed, 28 Oct 2026 18:12:00 -0700"):
    m = EmailMessage()
    m["From"] = sender
    m["Subject"] = subject
    m["Date"] = date
    if message_id:
        m["Message-ID"] = message_id
    m.set_content(body)
    if html:
        m.add_alternative(html, subtype="html")
    for i, (data, mime) in enumerate(images):
        maintype, subtype = mime.split("/")
        m.add_attachment(data, maintype=maintype, subtype=subtype, filename=f"flyer{i}.{subtype}")
    return m.as_bytes()


def row(*a, **kw):
    with mock.patch.object(forwarded, "upload_media",
                           side_effect=lambda path, data, mime: f"storage:{path}"):
        return forwarded.to_raw_item(msg(*a, **kw))


# 1. A Gmail-style forward: the original sender, subject and date win over the envelope's.
r = row(GMAIL_FWD)
check("gmail wrapper: original subject kept", r["text"].startswith("Subject: Free pizza at tonight's GM"))
check("gmail wrapper: original sender kept", "From: LSBE Board <board@lsbe.berkeley.edu>" in r["text"])
check("gmail wrapper: posted_at is the original date, not the forward's",
      r["posted_at"].startswith("2026-10-28T09:00"))
check("source_id is the Message-ID", r["source_id"] == "<abc123@mail.gmail.com>")
check("body survives", "Cory 540" in r["text"])

# 2. Privacy: the forwarder's address and the original recipients are never stored.
check("forwarder's address not stored", "student@berkeley.edu" not in r["text"])
check("wrapper To: stripped", "lsbe-announce@lists.berkeley.edu" not in r["text"])
check("wrapper Cc: stripped", "officers@lsbe.berkeley.edu" not in r["text"])

# 3. Sender allowlist.
check("non-Berkeley forwarder dropped", row(GMAIL_FWD, sender="rando@gmail.com") is None)
check("berkeley subdomain allowed", row(GMAIL_FWD, sender="s@eecs.berkeley.edu") is not None)
check("display-name form allowed", row(GMAIL_FWD, sender="Sam <sam@berkeley.edu>") is not None)

# 4. Personal replies are skipped, as in sources/gmail.py (Fwd: is stripped, Re: is not).
check("Fwd: Re: with no List-Id dropped", row(GMAIL_FWD, subject="Fwd: Re: lunch tomorrow?") is None)
check("plain Fwd: kept", row(GMAIL_FWD, subject="Fwd: Free pizza") is not None)

# 5. Apple Mail's wrapper.
r = row(APPLE_FWD, subject="Fwd: Coffee and bagels Thursday")
check("apple wrapper: original sender kept", "grads@eecs.berkeley.edu" in r["text"])
check("apple wrapper: date parsed", r["posted_at"].startswith("2026-10-28T10:30"))
check("apple wrapper: To: stripped", "eecs-grads@berkeley.edu" not in r["text"])

# 6. No wrapper at all (some clients strip it): fall back to the envelope, minus the Fwd: prefix.
r = row("Free bagels, Thursday 9am, Soda 380.", subject="Fwd: Fwd: Bagels")
check("no wrapper: Fwd: prefixes stripped from subject", r["text"].startswith("Subject: Bagels"))
check("no wrapper: envelope date used", r["posted_at"].startswith("2026-10-28T18:12"))

# 7. Images: attachments over the size floor are stored, small ones (logos) skipped;
#    remote images in HTML become url: refs, trackers and logos filtered out.
big, small = b"\xff\xd8" + b"x" * 20_000, b"\xff\xd8" + b"x" * 100
r = row(GMAIL_FWD, images=[(big, "image/jpeg"), (small, "image/png")])
check("attached flyer stored once", sum(p.startswith("storage:") for p in r["media_paths"]) == 1)
check("tiny attachment skipped", not any(p.endswith(".png") for p in r["media_paths"]))
r = row("", html='<p>Free pizza tonight</p><img src="https://x.test/flyer.jpg" width="600">'
                 '<img src="https://x.test/logo.png" width="600"><img src="https://x.test/a.gif" width="1">')
check("remote flyer kept as a url: ref", "url:https://x.test/flyer.jpg" in r["media_paths"])
check("logo and tracker images skipped", len(r["media_paths"]) == 1)
check("html stripped to text", "Free pizza tonight" in r["text"] and "<p>" not in r["text"])

# 8. Encoded headers (any subject with an emoji or accent arrives RFC 2047-encoded).
check("encoded subject decoded",
      row("Boba Thursday", subject="Fwd: =?utf-8?q?Caf=C3=A9_night?=")["text"].startswith("Subject: Caf\u00e9 night"))

# 9. Oversized mail is truncated, not dropped.
check("long body truncated to MAX_TEXT", len(row(GMAIL_FWD + "pizza " * 10_000)["text"]) == forwarded.MAX_TEXT)


# 10. One IMAP connection, UID-addressed: rows are inserted before anything is marked \Seen.
class FakeBox:
    def __init__(self, uids, bodies=None):
        self.uids, self.bodies, self.flagged, self.out = uids, bodies or {}, [], False

    def uid(self, cmd, *args):
        if cmd == "SEARCH":
            return "OK", [b" ".join(self.uids)]
        if cmd == "FETCH":
            return "OK", [(b"1 (BODY[] {1}", self.bodies.get(args[0], msg(GMAIL_FWD))), b")"]
        if cmd == "STORE":
            self.flagged.append(args[0])
            return "OK", [b""]
        raise AssertionError(cmd)

    def logout(self):
        self.out = True


def run_with(box, insert=lambda rows: len(rows)):
    with mock.patch.object(forwarded, "connect", return_value=box), \
            mock.patch.object(forwarded, "insert_raw_items", side_effect=insert), \
            mock.patch.object(forwarded, "upload_media", side_effect=lambda p, d, m: f"storage:{p}"):
        try:
            return forwarded.run(), None
        except Exception as err:
            return None, err


box = FakeBox([b"7", b"8"])
new, err = run_with(box)
check("run: both messages stored and flagged", (new, box.flagged, err) == (2, [b"7", b"8"], None))
check("run: connection closed", box.out)

box = FakeBox([b"7"])
new, err = run_with(box, insert=lambda rows: (_ for _ in ()).throw(RuntimeError("supabase down")))
check("run: nothing flagged when the insert fails", box.flagged == [] and isinstance(err, RuntimeError))
check("run: connection closed even then", box.out)

box = FakeBox([str(i).encode() for i in range(100)])
run_with(box)
check("run: capped at MAX_PER_RUN per run", len(box.flagged) == forwarded.MAX_PER_RUN)

# A message from a stranger is flagged read (so it isn't re-read) but never stored.
box = FakeBox([b"1"], {b"1": msg(GMAIL_FWD, sender="spam@example.com")})
new, err = run_with(box)
check("run: disallowed sender flagged but not stored", (new, box.flagged) == (0, [b"1"]))

# 11. Unconfigured: a no-op, not a failure, and it never opens a connection.
with mock.patch.dict(os.environ, {"FORWARD_IMAP_HOST": ""}), \
        mock.patch.object(forwarded, "connect", side_effect=AssertionError("must not connect")):
    check("unconfigured: returns 0 without connecting", forwarded.run() == 0)

# 12. extract.py is reused unchanged, so club events still need food actually stated.
now = forwarded.parse_date("Wed, 28 Oct 2026 18:12:00 -0700")
ev = {"title": "GM", "start": "2026-10-29T18:00:00-07:00", "confidence": 0.9, "food_status": "likely"}
check("club event with only 'likely' food is dropped",
      extract.keep({**ev, "host": "club"}, now, "forwarded") is None)
check("department event with 'likely' food is kept",
      extract.keep({**ev, "host": "university"}, now, "forwarded") is not None)
check("club event with stated food is kept",
      extract.keep({**ev, "host": "club", "food_status": "stated"}, now, "forwarded") is not None)

failed = [n for n, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
