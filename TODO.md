# TODO

## Sources to look into
- [ ] **calevents.app** (https://www.calevents.app/): an aggregator of event info from Berkeley's student clubs, built by a student. It has no public API or feed listed. Ideas:
  - Check whether its web app loads events from a JSON endpoint we could read politely (rate-limited).
  - Check whether its calendar export works as a feed.
  - Ask the creator whether they'd share a feed.
  - It could cover many more clubs than our 20 Instagram accounts and public CalLink events, at no Apify cost.

## App
- [ ] Check the "not on the map" list in the simulator, then delete the TEST events (fingerprints `test-1`, `test-2`, `test-3`).
- [ ] Test on a phone with Expo Go.
- [ ] Add a README so friends can run the app.
- [ ] Phase 8: TestFlight. Needs the Apple Developer account ($99/yr).

## Pipeline
- [ ] If GitHub's schedule stays too sparse (about every 6 hrs), trigger runs with Supabase pg_cron.
- [ ] Update to checkout@v5 and setup-python@v6 to clear the Node 20 deprecation warning.
