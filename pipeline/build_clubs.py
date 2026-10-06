"""Build data/clubs.csv from CalLink's public org directory (Instagram links included).

One-time / occasional; ~1 request per second, ~25 min for ~1,350 orgs.
Run from the repo root:  .venv/bin/python -m pipeline.build_clubs
"""
import csv
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "clubs.csv"
BASE = "https://callink.berkeley.edu"
HEADERS = {"User-Agent": "freeFoodTracker/0.1 (github.com/dmistry157/freeFood)"}
DELAY_S = 1.0
HANDLE = re.compile(r"instagram\.com/([A-Za-z0-9_.]{1,30})", re.I)
NOT_HANDLES = {"p", "reel", "reels", "explore", "stories", "accounts", "tv"}


def get(path: str, **params):
    for wait in (10, 30, 60, None):  # retry network blips (e.g. laptop Wi-Fi drop)
        try:
            resp = requests.get(f"{BASE}{path}", params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            time.sleep(DELAY_S)
            return resp.json()
        except (requests.ConnectionError, requests.Timeout):
            if wait is None:
                raise
            time.sleep(wait)


def instagram_handle(url: str | None) -> str:
    url = (url or "").strip()
    m = HANDLE.search(url)
    if m and m.group(1).lower() not in NOT_HANDLES:
        return m.group(1).lower().rstrip(".")
    if url.startswith("@"):
        return url[1:].lower()
    return ""


def save(rows: list[dict]):
    rows = list({r["callink_url"]: r for r in rows}.values())  # one row per club
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "callink_url", "instagram", "category", "is_public"])
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["name"].lower()))


def main():
    orgs, skip = [], 0
    while True:
        page = get("/api/discovery/search/organizations", top=100, skip=skip)
        orgs += page["value"]
        skip += 100
        if skip >= page["@odata.count"]:
            break
    orgs = [o for o in orgs if o.get("Status") == "Active"]
    # Resume: keep clubs already in the CSV, fetch only the rest.
    rows = list(csv.DictReader(OUT.open())) if OUT.exists() else []
    done = {r["callink_url"] for r in rows}
    orgs = [o for o in orgs if f"{BASE}/organization/{o['WebsiteKey']}" not in done]
    print(f"{len(done)} clubs already saved; fetching {len(orgs)} more…", flush=True)

    for n, o in enumerate(orgs, 1):
        try:
            detail = get(f"/api/discovery/organization/bykey/{o['WebsiteKey']}")
        except requests.RequestException as err:
            print(f"  skip {o['WebsiteKey']}: {err}", flush=True)
            continue
        rows.append({
            "name": o["Name"].strip(),
            "callink_url": f"{BASE}/organization/{o['WebsiteKey']}",
            "instagram": instagram_handle((detail.get("socialMedia") or {}).get("InstagramUrl")),
            "category": ", ".join(o.get("CategoryNames") or []),
            "is_public": "",  # unknown until checked on Instagram
        })
        if n % 100 == 0:
            save(rows)  # checkpoint so an interruption doesn't lose progress
            print(f"  {n}/{len(orgs)}", flush=True)

    save(rows)
    print(f"Wrote {len(rows)} clubs ({sum(bool(r['instagram']) for r in rows)} with Instagram) to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
