# TODO

## Sources to look into
- [x] **calevents.app** (https://www.calevents.app/): added as a source on 2026-10-14 (`pipeline/sources/calevents.py`). Instagram posts now skip the clubs it covers.
- [ ] Message calevents' creator to ask permission and credit them.
- Notes from looking into it:
  - It's an aggregator built by a student, Sunny Jayaram. It scrapes Instagram for 1,000+ clubs and turns posts into structured events.
  - It has an undocumented JSON API, the one its own site uses: `GET /api/events?direction=future&limit=50`. Paging uses the `nextCursor` value with `cursorDate` and `cursorCreatedAt`. No login is needed, and there's no robots.txt.
  - Each event has: title, description, date, start_time, end_time, location, club_username, event_type, invite_type, the Instagram permalink, and CloudFront image URLs.
  - Oct 14–21 sample: 118 events from 84 clubs; 40 mention food; only 4 of those come from clubs we already scrape. Every event had a time and a location. A full week took 3 requests.
  - Plan: a `calevents` source that runs every 2.5 hrs (about 3 requests, 1s apart). Keep only food-keyword events, then send their text to Gemini for food_status (no images). Set the link to the Instagram permalink.
  - Before relying on it: message the creator to ask permission and credit them. It's an unofficial API, so it could change without notice. Keep our Apify Instagram scraper as a fallback, or cut it back to save credit.
  - Geocoder aliases its locations need: HMMB (Hearst Memorial Mining Building), HFA (Hearst Field Annex), Found Study, SoCo, The Den.

## App
- [x] Phase 7 verified in the simulator; TEST events deleted.
- [x] Published with EAS Update (2026-10-17); opens in Expo Go without the laptop (tested in the simulator).
- [ ] Test the published link on a real iPhone, yours and one friend's (Apple may block opening another account's project in Expo Go).
- [ ] Add a README so friends can run the app.
- [ ] Phase 8: TestFlight. Needs the Apple Developer account ($99/yr).

## Pipeline
- [ ] CalLink's API started redirecting to a CalNet login on 2026-10-16, so it's turned off in `auto_plan` (the code stays; it also skips itself on the login redirect). It was ~3 items/2 weeks. Re-enable if the site goes public again.
- [ ] Around 2026-10-21, check Apify spend now that 38 clubs are active (stories for all, posts for the 16 calevents misses). The budget guard stops runs at $4.50/month; if it's tight, drop clubs whose stories never produce food.
- [ ] Optional: add Groq's free tier (or GitHub Models) as a non-Google fallback for when every Gemini model is overloaded at once.
- [ ] Two events still have no pin: "F580" (no building given) and "Inclusive Excellence Hub" (location unknown).
- [ ] Duplicate event: "Trick or Treat with TannerTan36" is stored twice (Anna Head). Check why dedupe didn't merge them.
- [ ] If GitHub's schedule stays too sparse (about every 6 hrs), trigger runs with Supabase pg_cron.
- [ ] Update to checkout@v5 and setup-python@v6 to clear the Node 20 deprecation warning.
