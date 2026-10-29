"""Offline checks for extract.run's failure handling and dedupe's fingerprints/links.
Gemini and Supabase are faked, so this costs nothing.  Run: .venv/bin/python pipeline/tests/test_extract_run.py"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from pipeline import dedupe, extract

NOW = datetime.now(timezone.utc)
LATER = (NOW + timedelta(hours=2)).isoformat()


def item(i, fetched=NOW):
    return {"id": i, "source": "gmail", "source_id": str(i), "text": f"Event {i}: free pizza", "media_paths": [],
            "posted_at": None, "fetched_at": fetched.isoformat()}


def http_error(status):
    resp = requests.Response()
    resp.status_code = status
    return requests.HTTPError(f"{status} error", response=resp)


def events_for(batch):
    return [{"item_id": str(it["id"]), "title": f"E{it['id']}", "start": LATER, "food_status": "stated",
             "confidence": 0.9} for it, _ in batch]


def run(items, gemini, **kw):
    """Run extract.run with fakes. Returns (marked ids, stored ids, number of Gemini calls, error raised)."""
    marked, stored, calls = [], [], []

    def fake_gemini(batch):
        calls.append([it["id"] for it, _ in batch])
        return gemini(batch, len(calls))

    def store(evs):
        kw.get("store_hook", lambda e: None)(evs)
        stored.extend(e["raw_item_id"] for e in evs)

    extract._Models.i = 0
    err = None
    with mock.patch.object(extract, "fetch_items", return_value=items), \
            mock.patch.object(extract, "call_gemini", fake_gemini), \
            mock.patch.object(extract, "load_images", return_value=[]), \
            mock.patch.object(extract, "mark_processed", lambda it: marked.append(it["id"])), \
            mock.patch.object(extract.time, "sleep"):
        try:
            extract.run(max_calls=kw.get("max_calls"), store=store)
        except Exception as e:
            err = e
    return sorted(marked), sorted(stored), len(calls), err


checks = []


def check(name, ok):
    checks.append((name, ok))
    print(("ok   " if ok else "FAIL ") + name)


# 1. Normal run: every item stored, then marked.
m, s, n, err = run([item(i) for i in range(1, 11)], lambda b, _: events_for(b))
check("all items stored and marked (2 batches)", m == s == list(range(1, 11)) and n == 2 and err is None)

# 2. Supabase down while storing the 2nd batch: 1st batch kept, 2nd left for next run.
def down(evs):
    if any(e["raw_item_id"] > 8 for e in evs):
        raise requests.ConnectionError("supabase down")
m, s, n, err = run([item(i) for i in range(1, 11)], lambda b, _: events_for(b), store_hook=down)
check("supabase outage: first batch marked, second not", m == list(range(1, 9)) and isinstance(err, requests.ConnectionError))

# 3. One item Gemini always rejects: the others still go through, only it is dropped.
def poison(b, _):
    if any(it["id"] == 1 for it, _ in b):
        raise http_error(400)
    return events_for(b)
m, s, n, err = run([item(i) for i in range(1, 9)], poison)
check("bad item dropped, other 7 stored", s == list(range(2, 9)) and m == list(range(1, 9)) and err is None)

# 4. Fallback model rejects everything after the first model worked: nothing gets dropped.
def fallback_rejects(b, call_no):
    if call_no == 1:
        return events_for(b)
    extract._Models.i = 8  # quota ran out; now on gemma, which 400s every request
    raise http_error(400)
m, s, n, err = run([item(i) for i in range(1, 17)], fallback_rejects)
check("fallback model 400s: only the stored batch is marked", m == s == list(range(1, 9)) and err is None)

# 5. Other errors (bad key, ...) stop the run without marking anything.
m, s, n, err = run([item(i) for i in range(1, 9)], lambda b, _: (_ for _ in ()).throw(http_error(403)))
check("403 stops the run, nothing marked", m == [] and n == 1)

# 6. The call cap still holds while retrying items one by one.
m, s, n, err = run([item(i) for i in range(1, 9)], poison, max_calls=3)
check("call cap respected during one-by-one retries", n == 3)

# 7. Items unread for over a week are dropped without a Gemini call.
m, s, n, err = run([item(1, NOW - timedelta(days=8)), item(2)], lambda b, _: events_for(b))
check("week-old item dropped, fresh one stored", m == [1, 2] and s == [2] and n == 1)

# 8. Fingerprint suffixes: first free one, not len + 1.
def fake_upsert(existing):
    posted = []
    get = mock.Mock(return_value=mock.Mock(json=lambda: [{"fingerprint": f, "title": f"Other {k}"} for k, f in enumerate(existing)],
                                           raise_for_status=lambda: None))
    post = mock.Mock(side_effect=lambda *a, **k: posted.append(k["json"]["fingerprint"]) or mock.Mock(raise_for_status=lambda: None))
    with mock.patch.object(dedupe.requests, "get", get), mock.patch.object(dedupe.requests, "post", post):
        dedupe.upsert({"fingerprint": "fp", "title": "Pumpkin carving"})
    return posted[0]
check("suffix: none taken -> fp", fake_upsert([]) == "fp")
check("suffix: fp taken -> fp#2", fake_upsert(["fp"]) == "fp#2")
check("suffix: only fp#2 left after cleanup -> fp (old code gave fp#2 again)", fake_upsert(["fp#2"]) == "fp")
check("suffix: fp, fp#2 taken -> fp#3", fake_upsert(["fp", "fp#2"]) == "fp#3")

# 9. Links: web links only.
ev = {"title": "T", "start": LATER, "end": LATER, "food_status": "stated", "building": None}
with mock.patch.object(dedupe, "locate", return_value=("", None, None)):
    row = lambda link, raw="": dedupe.to_row({**ev, "link": link}, raw)
    check("link: https kept", row("https://forms.gle/x")["link"] == "https://forms.gle/x")
    check("link: javascript: dropped", row("javascript:alert(1)")["link"] is None)
    check("link: bare domain falls back to the post URL",
          row("forms.gle/x", "URL: https://instagram.com/p/abc")["link"] == "https://instagram.com/p/abc")

failed = [n for n, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
