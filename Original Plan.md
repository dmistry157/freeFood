# Berkeley Free Food Map — Build Plan

## Goal
A minimal mobile app showing free food and drink events at UC Berkeley on a campus map.
- **Red pin:** happening now. **Grey pin:** starts within the next 6 hours.
- **Tap a pin:** a popup shows title, time, location, food, and requirements to get in (RSVP/application link as a button).
- Design reference: https://claude.ai/artifact/C51n6BPinKsAPTU4FLCKhx

## Stack
- **Pipeline:** Python 3.12, run on a schedule with GitHub Actions cron
- **Database:** Supabase (Postgres)
- **Extraction:** a multimodal LLM (Claude Haiku or Gemini Flash) that reads both text and flyer images
- **Instagram:** Apify (a posts scraper plus a no-login public stories scraper)
- **App:** Expo (React Native) with react-native-maps

## Repo layout
```
/pipeline
  sources/berkeley_events.py   # campuswide RSS/iCal feed
  sources/callink.py           # club events
  sources/gmail.py             # labeled Berkeley email
  sources/instagram.py         # Apify posts + stories + highlights
  extract.py                   # LLM -> structured event JSON
  geocode.py                   # building name -> lat/lng
  dedupe.py
  run.py
/data
  buildings.csv                # name, aliases, lat, lng
  clubs.csv                    # name, callink_url, instagram, is_public
/supabase/schema.sql
/app                           # Expo app
.env.example                   # never commit .env
```

## Phase 0: Setup
Dhilen does these by hand before Claude Code starts:
- Create accounts and keys for Supabase, Apify, and the LLM API.
- Create a Google Cloud project with the Gmail API enabled and OAuth set up.
- On the Berkeley email, create a filter that labels likely event mail `FreeFood` (food/event words, minus calendar invites, course tools, promos, application mail — see Phase 3 Gmail), and join as many department and club lists as possible.

Claude Code: scaffold the repo, add `.env.example` listing every key, and add `.env` to `.gitignore`.

## Phase 1: Schema
- **`raw_items`:** id, source, source_id (unique), fetched_at, text, media_paths, posted_at, processed (bool)
- **`events`:** id, title, start_time, end_time, building, room, lat, lng, food, requirements, link, open_to, confidence, fingerprint, source_urls[], created_at, updated_at
- **`buildings`:** name, aliases[], lat, lng
- **`clubs`:** name, callink_url, instagram_handle, is_public, active

Done when: `schema.sql` runs cleanly on Supabase.

## Phase 2: Building lookup table
- Pull campus building names and coordinates from OpenStreetMap (Overpass API, bounded to campus and nearby Southside and Northside).
- Add the nicknames people actually use: MLK, Pauley Ballroom, Chou Hall, the Glade, Sproul, Soda, Cory, and similar.
- `geocode.py` does fuzzy matching of extracted location text against names and aliases.

Done when: 20 real location strings from flyers and emails match correctly.

## Phase 3: Sources (each writes to `raw_items`, skipping source_ids it has already seen)
- **Berkeley Events:** find the campuswide RSS/iCal feed on events.berkeley.edu and parse it with `feedparser` or `icalendar`.
- **CalLink:** use a public event feed if one exists; otherwise scrape the public events list politely (rate-limited).
- **Gmail:** read new messages with the `FreeFood` label through the Gmail API. Keep the body text and save image attachments. Pace requests (Gmail per-minute quota).
  - The pipeline reads the label only, never the wider inbox. The bmail filter does the first cut:
    `{food pizza snacks refreshments lunch dinner breakfast boba catered beverages drinks "info session" "info-session" "tech talk" mixer networking "general meeting" reception fireside "study break" "career connect" tabling} -filename:ics -from:(edstem.org OR instructure.com OR docusign.net OR amenify.com) -subject:(application OR "room confirmation") -category:promotions`
  - This catches direct invites with no unsubscribe line (e.g. Microsoft CoreAI, 2026-10-01) and drops personal calendar invites (`-filename:ics`).
- **Instagram:**
  1. Build `clubs.csv` by scraping CalLink's organization directory for Instagram links, and keep only public accounts.
  2. Posts: run an Apify posts scraper once a day for the last 2 days of posts.
  3. Stories and highlights: run a no-login Apify stories scraper twice a day with highlights on.
  4. Download media right away, since the URLs expire. For videos, pull 1–2 frames with ffmpeg.
  5. Keep scraper IDs in config so they're easy to swap. Test 2–3 scrapers on 20 accounts before choosing one.
  - **Chosen (2026-10-06 test):**
    - Posts: `sones/instagram-posts-scraper-lowcost` (~$0.015/run).
    - Stories: `goat255/instagram-stories-highlights-scraper`, with highlights off (~$0.07/run). It returns a still image for video stories, so no ffmpeg is needed.
    - `data-slayer` was rejected (wrong "user not found" results, pricier).
  - Expected ~$2.50/mo for 20 active accounts. Toggle accounts via `clubs.active` in Supabase.
  - **Budget guard** (`pipeline/apify_budget.py`) wraps every Apify run:
    - Skip if month usage ≥ $4.50.
    - Cap each run at min($0.25, budget left).
    - Re-check and log usage after each run.
  - Apify Free plan has a hard $5/mo limit and no card.
- **Cleanup:** every run deletes events that have ended, and processed raw_items older than 14 days. Stored Instagram images are deleted once Phase 4 reads them.

## Phase 4: Extraction
Make one LLM call per raw item, with its text and images, returning this JSON:
```json
{"is_event": true, "food_status": "stated|likely|none", "food_reason": "", "title": "", "start": "", "end": "",
 "building": "", "room": "", "food": "", "requirements": "", "link": "", "open_to": "", "confidence": 0.0}
```
- `food_status`:
  - **stated**: the text or flyer mentions food or drink.
  - **likely**: not mentioned, but the event type usually has food (company info sessions, tech talks, career/networking events, receptions, mixers, study breaks, club general meetings). `food_reason` says why.
  - **none**: neither.
- Uses Gemini Flash free tier for all sources (decided 2026-10-04; accepted that Google may train on inputs).
- Use the America/Los_Angeles timezone, and resolve relative dates ("tomorrow", "this Thursday") from the item's posted date.
- Drop items that aren't events open to a group (newsletters without a dated event, job postings, personal/1:1 plans), where `food_status` is none, or where confidence is below 0.6.

Done when: it gets at least 17 of 20 hand-labeled samples right.

## Phase 5: Geocode + dedupe
- Match `building` to lat/lng. Events with no match go to a list view instead of being dropped.
- Fingerprint = date + start hour + building. When two items match, merge them: keep the richest fields and every source URL.

## Phase 6: Scheduling
Set up GitHub Actions cron jobs:
- Email and Berkeley Events: hourly
- CalLink: every 3 hours
- Instagram posts: daily
- Instagram stories: twice daily

Log Apify and LLM spend on each run. The target is under $50/mo.

## Phase 7: App
- One screen: a map centered on campus.
- Query events where `end_time > now` and `start_time < now + 6h`.
- Pin color: red if `start <= now < end`, otherwise grey.
- Tapping a pin opens a callout showing title, time, location, food, and requirements, plus a link button when there is a link.
- `food_status = likely` events use the same pins; the callout shows a "Food likely — not confirmed" tag.
- A small list view holds events that couldn't be placed on the map.
- Refresh when the app opens and every 5 minutes.

## Phase 8: Ship
TestFlight build, then get 20 friends using it and collect feedback on missed events.

## Rules for Claude Code
- Never commit secrets.
- Rate-limit every scraper.
- Build and test one phase at a time, and stop at the end of each phase for review.
