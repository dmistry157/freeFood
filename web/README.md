# Berkeley Free Food — website

The map as a plain website: no Expo, no app install, works in any browser. It reads
the same Supabase `events` table the iPhone app does, with the same read-only key.

A **gold pin** means free food is happening now; a **navy pin** means it starts within
six hours. Grant location and the map drops a dot where you are and reorders the list
nearest-first, with walking distances. The list collapses so the map can fill the
screen — useful on a phone.

```
Supabase events (read-only key) ──► useEvents ──► MapLibre pins + nearby list
                     navigator.geolocation ──► "you are here" + distances
```

## Running it

```bash
cd web
npm install
cp .env.example .env.local   # fill in the two NEXT_PUBLIC_ values
npm run dev                  # http://localhost:3000
```

The two values are the same ones in `app/.env`, renamed from `EXPO_PUBLIC_*` to
`NEXT_PUBLIC_*`. They only permit reading events.

```bash
npm run build      # static export into web/out
npx tsc --noEmit   # typecheck
npm run lint
```

## Layout

| Path | What it is |
| --- | --- |
| `src/app/page.tsx` | The whole shell: header, map, nearby list, selected card |
| `src/app/globals.css` | Berkeley palette, type scale, and the pin and location-dot CSS |
| `src/app/icon.svg` | Favicon: gold pin on Berkeley navy |
| `src/components/CampusMap.tsx` | MapLibre map, pins as DOM markers, the "you are here" dot |
| `src/components/EventCard.tsx` | Event detail card |
| `src/components/NearbyList.tsx` | The list, including "not on the map" |
| `src/lib/events.ts` | Supabase fetch and the time logic, ported from `app/src/events.ts` |
| `src/lib/geo.ts` | Haversine distance, "350 ft" / "0.4 mi", walking time |
| `src/lib/useEvents.ts` | Fetch on mount, refetch every 5 min, re-tick every 30 s |
| `src/lib/useLocation.ts` | `navigator.geolocation` wrapper |

## Notes

- **Colours** are Berkeley's own: Berkeley Blue `#003262`, California Gold `#FDB515`,
  taken from the `uberk-eats` promo theme so the two projects match. Gold reads as
  "happening now", navy as "starting soon". Status *text* uses a darker gold
  (`--color-live`) because `#FDB515` on white fails contrast; the bright gold is kept
  for pins and fills.
- **The basemap is deliberately quietened.** `CLUTTER` in `CampusMap.tsx` hides
  neighbourhood shout-caps, creek labels and highway shields on load. Street and place
  names stay, since those are what you navigate by.
- **Static export.** `output: "export"` in `next.config.ts`, so it can sit on GitHub
  Pages for free like the Expo web build. Every fetch happens in the browser, because
  whether a pin is red depends on the current time.
- **Sub-path deploys.** Set `NEXT_PUBLIC_BASE_PATH` (e.g. `/freefood-web`) to serve it
  under a path. `basePath` and the MapLibre worker URL both read it.
- **The MapLibre worker.** Turbopack doesn't emit MapLibre's tile-parsing worker, so
  `scripts/copy-maplibre-worker.mjs` copies it out of `node_modules` into `public/` on
  every `dev` and `build`. Without it the map draws pins but no streets.
- **Tiles** come from OpenFreeMap, which needs no key and no account.
- **Location never leaves the browser.** It is used for the dot and the distances; it
  is not stored and not sent to Supabase.
