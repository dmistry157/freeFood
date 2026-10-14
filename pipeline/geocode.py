"""Match free-text locations ("Pauley Ballroom, MLK", "Soda 306") to a building and lat/lng.

1. Exact phrase match against every building name and alias; the longest match wins,
   so "Sproul Hall" beats "Sproul" and "Haas Pavilion" beats "Haas".
2. Otherwise fuzzy match (typos, word order) with a high cutoff.
Returns None when nothing is close; those events go to the app's list view.
"""
import csv
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

CSV = Path(__file__).resolve().parent.parent / "data" / "buildings.csv"
FUZZY_CUTOFF = 88
NOISE = re.compile(r"\b(uc berkeley|ucb|berkeley|university of california|campus|room|rm|floor|fl|suite|ste)\b")


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^the ", "", s)  # "Law Building" == "The Law Building"


@lru_cache(maxsize=1)
def _index():
    """normalized key -> (name, lat, lng)"""
    keys = {}
    with CSV.open() as f:
        for row in csv.DictReader(f):
            place = (row["name"], float(row["lat"]), float(row["lng"]))
            for key in [row["name"], *filter(None, row["aliases"].split("|"))]:
                keys.setdefault(normalize(key), place)
    return keys


# Short hall names that are also ordinary words or street names; never match these alone.
NOT_SHORT = {"california", "south", "senior", "minor", "christian", "philosophy", "north gate", "durant",
             "durant residence", "oxford", "euclid", "tan", "chu", "lewis", "davis", "simon", "stern"}


@lru_cache(maxsize=1)
def _short():
    """'mccone' -> McCone Hall, for "X Hall" buildings, used only when a room number follows ("McCone 141")."""
    keys, out = _index(), {}
    with CSV.open() as f:
        for row in csv.DictReader(f):
            m = re.match(r"^(.*\S) Hall$", row["name"])
            k = normalize(m.group(1)) if m else None
            if k and k not in keys and k not in NOT_SHORT:
                out[k] = (row["name"], float(row["lat"]), float(row["lng"]))
    return out


def geocode(text: str | None) -> dict | None:
    if not text:
        return None
    keys = _index()
    norm = f" {normalize(text)} "

    hits = [k for k in keys if f" {k} " in norm]
    if hits:
        name, lat, lng = keys[max(hits, key=len)]
        return {"building": name, "lat": lat, "lng": lng, "match": "exact"}

    short = _short()
    hits = [k for k in short if re.search(rf" {re.escape(k)} [a-z]?\d", norm)]
    if hits:
        name, lat, lng = short[max(hits, key=len)]
        return {"building": name, "lat": lat, "lng": lng, "match": "short + room"}

    # Fuzzy: drop room numbers and filler words, only compare against longer keys.
    query = re.sub(r"\b\d+[a-z]?\b", " ", NOISE.sub(" ", norm)).strip()
    if len(query) < 4:
        return None
    best = process.extractOne(query, [k for k in keys if len(k) >= 6],
                              scorer=fuzz.token_sort_ratio, score_cutoff=FUZZY_CUTOFF)
    if not best:
        return None
    name, lat, lng = keys[best[0]]
    return {"building": name, "lat": lat, "lng": lng, "match": f"fuzzy {best[1]:.0f}"}


if __name__ == "__main__":
    import sys
    print(geocode(" ".join(sys.argv[1:])))
