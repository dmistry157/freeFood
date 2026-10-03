"""Run: .venv/bin/python pipeline/tests/test_geocode.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from geocode import geocode

MLK = "Martin Luther King Jr. Student Union"
CASES = [
    ("Pauley Ballroom, MLK Student Union", MLK),
    ("Martin Luther King Jr. Student Union, Tilden Room", MLK),
    ("Soda 306", "Soda Hall"),
    ("Cory Hall 540AB", "Cory Hall"),
    ("Memorial Glade", "Memorial Glade"),
    ("on Sproul!", "Sproul Plaza"),
    ("Upper Sproul Plaza", "Sproul Plaza"),
    ("Lower Sproul", "Lower Sproul Plaza"),
    ("Chou Hall 6th floor", "Chou Hall (North Academic Building)"),
    ("Haas Pavilion", "Haas Pavilion"),
    ("VLSB 2050", "Valley Life Sciences Building"),
    ("Dwinelle 155", "Dwinelle Hall"),
    ("Wheeler Auditorium", "Wheeler Hall"),
    ("ASUC Senate Chambers, Eshleman Hall 5th floor", "Eshleman Hall"),
    ("Kroeber 221", "Anthropology and Art Practice Building"),
    ("Barrows Hall 8th floor", "Social Sciences Building"),
    ("QARC Center, Hearst Annex, Room A15", "Hearst Field Annex"),
    ("Sutardja Dai Hall Banatao Auditorium", "Sutardja Dai Hall (CITRIS)"),
    ("Etcheverry 3106", "Etcheverry Hall"),
    ("Moffitt Library 4th floor", "Moffitt Undergraduate Library"),
    ("Evans 1015", "Evans Hall"),
    ("Clark Kerr Campus Garden Room", "Clark Kerr Campus"),
    ("Bechtel Engineering Center", "Grimes Engineering Center"),
    ("LeConte 1", "Physics North & Physics South"),
    ("Hearst Mining Building Auditorium", "Hearst Memorial Mining Building"),
    ("Berkeley Way West 1102", "Berkeley Way West"),
    ("I-House Great Hall", "International House"),
    ("the Campanile", "The Campanile (Sather Tower)"),
    ("Dwinele Hall 145", "Dwinelle Hall"),          # typo
    ("Etchevery Hall", "Etcheverry Hall"),         # typo
    ("Zoom", None),
    ("Online (link in bio)", None),
    ("Palace of Fine Arts (3601 Lyon St, San Francisco)", None),
    ("TBA", None),
    ("DM for location", None),
]

fails = 0
for text, want in CASES:
    got = geocode(text)
    name = got and got["building"]
    ok = name == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {text!r:55} -> {name} {'(' + got['match'] + ')' if got else ''}{'' if ok else f'   WANT {want}'}")
print(f"\n{len(CASES) - fails}/{len(CASES)} correct")
sys.exit(1 if fails else 0)
