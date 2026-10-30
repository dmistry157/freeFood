# Berkeley Free Food Map

An iPhone app that shows a map of UC Berkeley campus events with free food. A **red pin** means it's happening now. A **grey pin** means it starts within 6 hours. Tapping a pin opens a card with the title, time, location, food, entry requirements and a link.

`Original Plan.md` is the full design and the source of truth. `TODO.md` lists open work.

## How it works
```
sources ──► raw_items (Supabase) ──► Gemini extraction ──► geocode + dedupe ──► events (Supabase) ──► Expo app
```
- **The pipeline** (`pipeline/`, Python 3.13) runs on GitHub Actions (`.github/workflows/pipeline.yml`, cron hourly; GitHub actually fires it about every 6 hrs, so Supabase pg_cron also starts it every 3 hours: `supabase/cron.sql`). The entry point is `python -m pipeline.run auto`.
  - `auto_plan()` in `run.py` decides which sources run, based on how long it's been since each last ran. Those times are kept in the `pipeline_state` table.
- **Sources** (`pipeline/sources/`):
  - `berkeley_events.py`: events.berkeley.edu, LiveWhale JSON, 7 days ahead.
  - `gmail.py`: the owner's bmail `FreeFood` label only. It needs the owner's OAuth credentials, so skip it locally.
  - `apps-script/` (source `gmail_shared`): other students share their hidden department lists (Berkeley blocks forwarding). A web app they open with their own bmail; an hourly trigger in their account sends matching list emails to Supabase's `submit_email`. Setup: `apps-script/README.md`.
  - `callink.py`: CalLink events. **Off** (not in `auto_plan`): since 2026-10-16 the whole site needs a CalNet login.
  - `calevents.py`: calevents.app, an aggregator of 1,000+ clubs' Instagram events. We read the JSON its own site uses (unofficial), about 3 requests every 2.5 hrs, keeping only events with food keywords. Text only, no images.
  - `instagram.py`: club (and a few business) accounts via Apify, posts and stories once a day. The accounts are `ACTIVE` in `load_clubs.py` (`EXTRA` adds ones not on CalLink); `.github/workflows/clubs.yml` syncs them to Supabase when that file changes on `main`. Spending is capped by `apify_budget.py` (≤ $4.50/month, ≤ $0.25/run).
- **Extraction** (`extract.py`): Gemini free tier, batched. It falls back through 9 free models (`extract.MODELS`: Flash, then Flash-Lite, then Gemma 4); each has its own daily quota. Every event gets a `food_status` of `stated` or `likely`. "Likely" covers info sessions, "over lunch" and similar, and the app labels those "Food likely · not confirmed". **Club-run events (any source) must have `stated` food**, so club GMs and socials never show up on a guess (`extract.keep`, using the `host` field Gemini returns).
- **Geocoding** (`geocode.py`): matches location text against `data/buildings.csv` (415 campus places from OpenStreetMap plus aliases). Events with no match have no lat/lng and appear in the app's "not on the map" list.
- **Dedupe** (`dedupe.py`): fingerprint = date + start hour + building, then a fuzzy title match.
- **Database**: Supabase Postgres. The schema is in `supabase/schema.sql`. Row-level security is on, and the only public policy is "read events".
- **Website** (dhilen.com/freefood, `web/`): Next.js 16 + MapLibre with free OpenFreeMap tiles, statically exported (originally Mohul's design). Berkeley Blue/California Gold palette (gold pin = now, navy = soon), pins clustered when they overlap, a collapsible event list with a look-ahead slider, a "you are here" dot and walking distances. Same Supabase table and read-only key as the app (`NEXT_PUBLIC_*` in `web/.env.local`). It's installable ("Add to Home Screen"): `web/public/` holds the manifest and icons, and `InstallButton.tsx` shows an Install button until it runs as an installed app. `.github/workflows/web.yml` builds it on every push to `web/` or `site/` and deploys to GitHub Pages under `/freefood` (`site/` holds the dhilen.com root page, which redirects to LinkedIn). See `web/README.md`; run it with `cd web && npm install && npm run dev`.
- **App** (`app/`): Expo SDK 58, TypeScript, react-native-maps (Apple Maps). Main files: `App.tsx` and `src/` (`events.ts`, `theme.ts`, `components/`). It reads events straight from Supabase's REST API with the read-only publishable key. Before changing app code, see `app/AGENTS.md` (Expo-version rules). Its web build (`Map.web.tsx`, `npx expo start --web`) still works but is no longer what the website serves.

## Setup
- **Publish the app** (friends open it in Expo Go, no laptop needed): `cd app && npx eas-cli@latest update --channel production --environment production --message "..."`. Expo project `@dhilens-team/freefood`; the two `EXPO_PUBLIC_*` values live in its EAS `production` environment. Link that always opens the latest version: `exp://u.expo.dev/789ba935-9128-4c2a-8862-db0a48fb7770?channel-name=production&runtime-version=1.0.0`. If you change `version` in `app.json`, update `runtime-version` in that link.
- **App:** `cd app && npm install`. Create `app/.env` from `app/.env.example`; the owner sends the two values. Then `npx expo start` and scan the QR code with Expo Go.
- **Pipeline:**
  1. `python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt`.
  2. Create `.env` from `.env.example`, using your own Gemini and Apify keys.
  3. Run one source with `python -m pipeline.run berkeley_events`.
  4. Geocode test: `.venv/bin/python pipeline/tests/test_geocode.py`.

## Rules
- **Never commit secrets.** `.env`, `app/.env` and `credentials.json` are gitignored, so keep them that way. Before committing, check `git status`, and grep for `sb_secret_`, `AIza` and `apify_api_`.
- **Spend as little money as possible.** Use free tiers only. Don't add paid services, and don't raise the Apify budget or call limits, without asking the owner.
- **Rate-limit every scraper** (there are delays between requests). Gemini's free tier allows about 20 requests per day per model, which is why calls are batched and capped per run.
- **Plan each change before making it, and build and test one piece at a time.**
- Gmail must only ever read the `FreeFood` label, never the wider inbox. The shared-lists script only ever sends emails whose `List-Id` exactly matches a list the contributor ticked.
- `SUPABASE_SECRET_KEY` bypasses row-level security. Use it only in the pipeline, never in the app.
- Work on a branch and open a PR to `main`. `main` is what GitHub Actions runs.
- Commit messages: no `Co-Authored-By: Claude` line.
