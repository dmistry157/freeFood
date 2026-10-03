"""Sync data/buildings.csv into the Supabase buildings table (replaces its contents).

Run from the repo root:  .venv/bin/python pipeline/load_buildings.py
"""
import csv
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
URL = f"{os.environ['SUPABASE_URL']}/rest/v1/buildings"
KEY = os.environ["SUPABASE_SECRET_KEY"]
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

with (ROOT / "data" / "buildings.csv").open() as f:
    rows = [{"name": r["name"], "aliases": [a for a in r["aliases"].split("|") if a],
             "lat": float(r["lat"]), "lng": float(r["lng"])} for r in csv.DictReader(f)]

requests.delete(URL, headers=HEADERS, params={"name": "not.is.null"}, timeout=30).raise_for_status()
requests.post(URL, headers=HEADERS, json=rows, timeout=60).raise_for_status()
print(f"Loaded {len(rows)} buildings into Supabase")
