"""Build data/buildings.csv from OpenStreetMap plus hand-added places and nicknames.

One-time / occasional. Run from the repo root:  .venv/bin/python pipeline/build_buildings.py
"""
import csv
import re
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "buildings.csv"
OVERPASS = "https://overpass-api.de/api/interpreter"
BBOX = "37.8620,-122.2700,37.8790,-122.2470"  # campus + Southside + Northside
QUERY = f"""[out:json][timeout:60];(
nwr["building"]["name"]({BBOX});
nwr["leisure"~"park|garden|pitch|stadium|sports_centre"]["name"]({BBOX});
nwr["amenity"~"library|theatre|arts_centre|community_centre|place_of_worship"]["name"]({BBOX});
);out center tags;"""

# Not real event venues, or names too generic to match safely.
SKIP = {
    "Residence Hall", "Suites", "Child Care", "Child Care Center", "Berkeley Central",
    "Downtown Berkeley", "The Edge", "The Standard", "The Ivy", "The Metropolitan",
    "The Berk", "The Berk on Arch", "The Artisan", "The Blake", "The Dwight", "The Durant",
    "CVS Pharmacy", "Sweetgreen", "AT&T", "Eureka!", "Rapa Nui", "Panormic", "Steam Plant",
    "Central Heating Plant", "Site Access Office", "Hazardous Materials Facility",
    "Recreation Maintenance", "Ace Berkeley", "Andronico's", "Patelco Credit Union",
    "Pacific Union International", "Berkeley T Substation", "timberline geodesics",
}
SKIP_RE = re.compile(r"^[\dA-Z]{1,4}$|garage|parking|[Ͱ-Ͽ]", re.I)

# Places OSM doesn't tag as buildings (coords taken from OSM by name).
EXTRA = {
    "Memorial Glade": (37.87320, -122.25937),
    "Sproul Plaza": (37.86950, -122.25924),
    "Lower Sproul Plaza": (37.86917, -122.26022),
    "Sather Gate": (37.87024, -122.25951),
    "Faculty Glade": (37.87140, -122.25653),
    "Hearst Mining Circle": (37.87365, -122.25704),
    "Kroeber Plaza": (37.86973, -122.25453),
    "People's Park": (37.86576, -122.25714),
    "Crossroads": (37.86704, -122.25636),
    "Cafe 3": (37.86729, -122.26052),
    "Golden Bear Cafe": (37.86983, -122.25970),
    "Free Speech Movement Cafe": (37.87242, -122.26101),
    "Haas School of Business": (37.87194, -122.25384),
    "Hearst Museum of Anthropology": (37.86953, -122.25526),
    "Clark Kerr Campus": (37.86423, -122.24935),
    "Foothill Student Housing": (37.87565, -122.25582),
    "Unit 1": (37.86782, -122.25523),
    "Unit 2": (37.86605, -122.25488),
    "Unit 3": (37.86717, -122.26037),
}

# Nicknames and old names people actually use on flyers.
ALIASES = {
    "Martin Luther King Jr. Student Union": ["MLK", "MLK Student Union", "MLK Jr Student Union",
        "Pauley Ballroom", "Pauley", "Tilden Room", "Heller Lounge", "ASUC Student Union", "Student Union"],
    "Eshleman Hall": ["Eshleman", "ASUC Senate Chambers", "Senate Chambers"],
    "César E. Chavez Student Center": ["Chavez Center", "Chavez Student Center", "Cesar Chavez"],
    "The Lair": ["Bear's Lair"],
    "Memorial Glade": ["The Glade", "Glade"],
    "Sproul Plaza": ["Upper Sproul", "Sproul"],
    "Lower Sproul Plaza": ["Lower Sproul"],
    "Chou Hall (North Academic Building)": ["Chou", "Chou Hall"],
    "Haas School of Business": ["Haas", "Haas School", "Haas Business School"],
    "Soda Hall": ["Soda"],
    "Cory Hall": ["Cory"],
    "Sutardja Dai Hall (CITRIS)": ["SDH", "Sutardja Dai", "Sutardja Dai Hall", "CITRIS"],
    "Jacobs Hall": ["Jacobs"],
    "Etcheverry Hall": ["Etcheverry", "Etch"],
    "Grimes Engineering Center": ["Bechtel", "Bechtel Engineering Center", "Grimes", "Jarvis Auditorium",
        "Eugene Jarvis Auditorium"],
    "The Gateway": ["Gateway", "Gateway Building", "CDSS Gateway"],
    "Earl F. Cheit Hall": ["Cheit", "Cheit Hall"],
    "Moffitt Undergraduate Library": ["Moffitt", "Moffitt Library"],
    "Free Speech Movement Cafe": ["FSM Cafe"],
    "Doe Memorial Library": ["Doe", "Doe Library"],
    "The Campanile (Sather Tower)": ["Campanile", "Sather Tower"],
    "Valley Life Sciences Building": ["VLSB", "Valley Life Sciences"],
    "Anthropology and Art Practice Building": ["Kroeber", "Kroeber Hall"],
    "Social Sciences Building": ["Barrows", "Barrows Hall", "SSB"],
    "Physics North & Physics South": ["LeConte", "LeConte Hall", "Physics North", "Physics South"],
    "The Law Building": ["Boalt", "Boalt Hall", "Berkeley Law", "Law School"],
    "Bauer Wurster Hall": ["Wurster", "Wurster Hall"],
    "International House": ["I-House", "IHouse"],
    "Recreational Sports Facility": ["RSF"],
    "Tang Center": ["Tang"],
    "Berkeley Art Museum - Pacific Film Archive": ["BAMPFA", "Berkeley Art Museum"],
    "Li Ka Shing Center": ["Li Ka Shing", "LKS"],
    "California Memorial Stadium": ["Memorial Stadium", "Simpson Center"],
    "Hearst Memorial Gymnasium": ["Hearst Gym"],
    "Hearst Memorial Mining Building": ["Hearst Mining Building", "HMMB"],
    "Hearst Greek Theatre": ["Greek Theatre", "Greek Theater", "The Greek"],
    "Hearst Mining Circle": ["Mining Circle"],
    "Genetics and Plant Biology": ["GPB"],
    "Evans Hall": ["Evans"],
    "Dwinelle Hall": ["Dwinelle"],
    "Wheeler Hall": ["Wheeler"],
    "Stanley Hall": ["Stanley"],
    "Pimentel Hall": ["Pimentel"],
    "Latimer Hall": ["Latimer"],
    "Hildebrand Hall": ["Hildebrand"],
    "Zellerbach Hall": ["Zellerbach"],
    "Hertz Hall": ["Hertz"],
    "Wellman Hall": ["Wellman"],
    "Mulford Hall": ["Mulford"],
    "Giannini Hall": ["Giannini"],
    "Hilgard Hall": ["Hilgard"],
    "Haviland Hall": ["Haviland"],
    "Koshland Hall": ["Koshland"],
    "Stephens Hall": ["Stephens"],
    "California Hall": ["Cal Hall"],
    "Hearst Field Annex": ["HFA", "Hearst Annex"],
    "Berkeley Way West": ["BWW"],
    "David Blackwell Hall": ["Blackwell", "Blackwell Hall"],
    "Berkeley Hillel Reutlinger Center": ["Hillel", "Berkeley Hillel"],
    "Clark Kerr Campus": ["Clark Kerr", "CKC"],
    "Foothill Student Housing": ["Foothill"],
    "Crossroads": ["Crossroads Dining"],
    "Cafe 3": ["Cafe Three"],
    "Golden Bear Cafe": ["GBC"],
    "Unit 1": ["Unit One"],
    "Unit 2": ["Unit Two"],
    "Unit 3": ["Unit Three"],
}


def main():
    resp = requests.post(OVERPASS, data={"data": QUERY}, timeout=120,
                         headers={"User-Agent": "freeFoodTracker/0.1 (github.com/dmistry157/freeFood)"})
    resp.raise_for_status()

    rows = {}
    for e in resp.json()["elements"]:
        name = e["tags"]["name"].strip()
        c = e.get("center", e)
        if name in rows or name in SKIP or SKIP_RE.search(name) or "lat" not in c:
            continue
        rows[name] = (c["lat"], c["lon"])
    rows.update(EXTRA)

    missing = set(ALIASES) - set(rows)
    if missing:
        raise SystemExit(f"Aliases point at unknown buildings: {sorted(missing)}")

    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "aliases", "lat", "lng"])
        for name in sorted(rows):
            lat, lng = rows[name]
            w.writerow([name, "|".join(ALIASES.get(name, [])), f"{lat:.6f}", f"{lng:.6f}"])
    print(f"Wrote {len(rows)} buildings to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
