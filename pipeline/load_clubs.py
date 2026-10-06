"""Sync data/clubs.csv into the Supabase clubs table. Handles in ACTIVE are scraped on Instagram;
toggle `active` later in the Supabase table editor.

Run from the repo root:  .venv/bin/python -m pipeline.load_clubs
"""
import csv

import requests

from pipeline.build_clubs import OUT
from pipeline.db import HEADERS, REST

ACTIVE = {
    "berkeleystudentunion", "asucsuperb", "theasuc", "caldining", "calcareercenter", "mccberkeley",
    "ucbintloffice", "berkeleyesc", "csua.berkeley", "awe.berkeley", "ucb_swe", "ieeeucb",
    "colorstack_berkeley", "calrcsa", "ucberkeleyaaa", "cal_vsa", "csaberkeley", "isaberkeley",
    "calmsa", "berkeleyhillel",
}

rows = {}
for r in csv.DictReader(OUT.open()):
    rows[r["name"]] = {"name": r["name"], "callink_url": r["callink_url"],
                       "instagram_handle": r["instagram"] or None, "is_public": True,
                       "active": r["instagram"] in ACTIVE}
resp = requests.post(f"{REST}/clubs", params={"on_conflict": "name"}, json=list(rows.values()), timeout=60,
                     headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"})
resp.raise_for_status()
active = sum(r["active"] for r in rows.values())
print(f"Loaded {len(rows)} clubs ({active} active)")
missing = ACTIVE - {r["instagram_handle"] for r in rows.values() if r["active"]}
if missing:
    print("Active handles not found in CSV:", sorted(missing))
