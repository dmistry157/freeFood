"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { LookAheadSlider, windowLabel } from "@/components/LookAheadSlider";
import { NearbyList } from "@/components/NearbyList";
import type { Focus } from "@/components/CampusMap";
import { isPlaced, WINDOW_MS } from "@/lib/events";
import { distanceFt } from "@/lib/geo";
import { useEvents } from "@/lib/useEvents";
import { useLocation } from "@/lib/useLocation";

// Both maps need a browser, and the site is a static export, so load client-side only.
// Google draws this campus well out of the box, but its key needs a billing account,
// so it is opt-in: set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and the site switches over.
// Without one we stay on MapLibre and OpenFreeMap, which cost nothing.
const USE_GOOGLE = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

/** Width of the floating card on desktop, used to keep it inside the map. */
const CARD_W = 262;

/** Left edge of the floating card, kept inside the map whatever the pin does. */
function cardLeft(anchorX: number, width: number): number {
  const min = 12;
  const max = Math.max(width - CARD_W - 12, min);
  return Math.min(Math.max(anchorX - CARD_W / 2, min), max);
}

const CampusMap = dynamic(
  () => (USE_GOOGLE ? import("@/components/GoogleCampusMap") : import("@/components/CampusMap")),
  { ssr: false, loading: () => <div className="size-full bg-paper-2" /> },
);

export default function Home() {
  // Six hours unless the look-ahead slider widens it.
  const [lookAheadMs, setLookAheadMs] = useState(WINDOW_MS);
  const { events, now, error, loading } = useEvents(lookAheadMs);
  const { coords, status, request } = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Starts closed, which is what a phone wants and avoids the list flashing in
  // before the media query resolves; the effect below opens it on desktop.
  const [listOpen, setListOpen] = useState(false);
  const listTouched = useRef(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const nonce = useRef(0);
  const centredOnMe = useRef(false);
  const mapSection = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [wide, setWide] = useState(false);

  // Desktop floats the card beside its pin; a phone gets a sheet along the bottom.
  const toggleList = useCallback((next: boolean) => {
    listTouched.current = true;
    setListOpen(next);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      setWide(mq.matches);
      // Default per viewport, but never override a choice they made themselves.
      if (!listTouched.current) setListOpen(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = mapSection.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMapWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  // Walking distance to every placed event, once the browser shares a location.
  const distances = useMemo(() => {
    const out = new Map<number, number>();
    if (!coords) return out;
    for (const e of events) {
      if (isPlaced(e)) out.set(e.id, distanceFt(coords, { lat: e.lat, lng: e.lng }));
    }
    return out;
  }, [events, coords]);

  // Nearest first once located; otherwise the query's start-time order.
  const ordered = useMemo(() => {
    if (!coords) return events;
    return [...events].sort((a, b) => {
      const da = distances.get(a.id);
      const db = distances.get(b.id);
      if (da == null && db == null) return a.start_time.localeCompare(b.start_time);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }, [events, coords, distances]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  const select = useCallback(
    (id: number) => {
      setSelectedId(id);
      const e = events.find((x) => x.id === id);
      if (!e || !isPlaced(e)) return;
      nonce.current += 1;
      setFocus({
        coords: { lat: e.lat, lng: e.lng },
        reveal: true,
        // Room for the card: above the pin on desktop, below it on a phone.
        pad: wide
          ? { top: 265, right: 30, bottom: 40, left: 30 }
          : { top: 30, right: 20, bottom: 235, left: 20 },
        nonce: nonce.current,
      });
    },
    [events, wide],
  );

  /** The closest event that actually has a pin, or null if none are placed. */
  const nearest = useMemo(() => {
    let best: { lat: number; lng: number } | null = null;
    let bestFt = Infinity;
    for (const e of events) {
      const d = distances.get(e.id);
      if (isPlaced(e) && d != null && d < bestFt) {
        bestFt = d;
        best = { lat: e.lat, lng: e.lng };
      }
    }
    return best;
  }, [events, distances]);

  /** Centre on the person, but pull the nearest event into frame with them. */
  const frameMe = useCallback(() => {
    if (!coords) return;
    setSelectedId(null);
    nonce.current += 1;
    setFocus({
      coords,
      zoom: 16,
      fitWith: nearest ?? undefined,
      nonce: nonce.current,
    });
  }, [coords, nearest]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clicking a pin should show you where that event sits in the list too.
  useEffect(() => {
    if (selectedId == null) return;
    document
      .querySelector(`[data-event-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // Frame the user the first time their position arrives.
  useEffect(() => {
    if (coords && !centredOnMe.current) {
      centredOnMe.current = true;
      frameMe();
    }
  }, [coords, frameMe]);

  const liveCount = ordered.filter((e) => new Date(e.start_time) <= now).length;

  // Whether the real six-hour window is empty. The slider is offered on that
  // basis and keeps standing once a wider window finds something, so the test
  // has to be this count rather than what is currently on screen.
  const sixHourCount = useMemo(
    () =>
      events.filter(
        (e) =>
          new Date(e.end_time) > now &&
          new Date(e.start_time).getTime() < now.getTime() + WINDOW_MS,
      ).length,
    [events, now],
  );
  const showLookAhead = wide && sixHourCount === 0;

  return (
    <main className="flex h-dvh flex-col bg-paper">
      {/* Modelled on CalCentral: a navy bar with the wordmark, then a thin white
          strip for status. Familiar, and only two controls. */}
      <header className="shrink-0">
        {/* Centred while it is stacked on a phone; back to wordmark-left,
            controls-right once there is room for one row. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 bg-navy px-4 py-3 md:justify-between md:px-7 md:py-3.5">
          <h1 className="w-full text-center text-xl font-semibold tracking-[-0.2px] md:w-auto md:text-left md:text-2xl">
            <span className="text-gold">Berkeley</span>
            <span className="text-white"> Free Food</span>
          </h1>

          {/* Plain text, no icon: the glyphs were doing no work at phone size. */}
          <button
            type="button"
            onClick={() => toggleList(!listOpen)}
            aria-expanded={listOpen}
            className="hidden h-10 border border-white/40 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 md:block"
          >
            {listOpen ? "Hide list" : "Show list"}
          </button>
        </div>

        {/* Desktop only: on a phone the list itself is the count, and this strip
            was just eating map. */}
        <div className="hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-rule bg-paper px-4 py-2.5 md:flex md:justify-between md:px-7">
          <p className="text-sm text-muted md:text-[15px]">
            {loading
              ? "Loading…"
              : `${ordered.length} event${ordered.length === 1 ? "" : "s"} in the next ${windowLabel(lookAheadMs)}` +
                (liveCount ? ` · ${liveCount} happening now` : "")}
          </p>
          <p className="flex items-center gap-4 text-[13px] text-label">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full bg-gold ring-1 ring-navy/40" />
              Now
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full bg-navy" />
              Soon
            </span>
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section
          ref={mapSection}
          className={`relative shrink-0 md:h-auto md:flex-1 ${
            listOpen ? "h-[44vh]" : "h-auto min-h-0 flex-1"
          }`}
        >
          <CampusMap
            events={ordered}
            now={now}
            selectedId={selectedId}
            onSelect={select}
            onClear={() => setSelectedId(null)}
            me={coords}
            focus={focus}
            onAnchor={setAnchor}
          />

          {/* Round recentre control on the map, the way every map app does it. */}
          <LocateButton
            status={status}
            onClick={() => (coords ? frameMe() : request())}
          />

          {/* z-10 clears the map markers: maplibre sets an inline z-index of 1-3 on
              each one, and .maplibregl-map is position:relative with no z-index, so
              it opens no stacking context for them to be trapped in. */}
          {selected &&
            (wide && anchor ? (
              // Floats just above its own pin, clamped so it never leaves the map.
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
                style={{
                  left: cardLeft(anchor.x, mapWidth) + CARD_W / 2,
                  top: Math.max(anchor.y - 22, 150),
                }}
              >
                <div className="pointer-events-auto" style={{ width: CARD_W }}>
                  <EventCard
                    event={selected}
                    now={now}
                    distanceFt={distances.get(selected.id) ?? null}
                    onClose={() => setSelectedId(null)}
                    tailLeft={Math.min(
                      Math.max(anchor.x - cardLeft(anchor.x, mapWidth) + CARD_W / 2, 18),
                      CARD_W - 18,
                    )}
                  />
                </div>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex justify-center">
                <div className="pointer-events-auto w-full max-w-[290px]">
                  <EventCard
                    event={selected}
                    now={now}
                    distanceFt={distances.get(selected.id) ?? null}
                    onClose={() => setSelectedId(null)}
                    compact
                  />
                </div>
              </div>
            ))}
        </section>

        {!listOpen && (
          <button
            type="button"
            onClick={() => toggleList(true)}
            className="flex shrink-0 items-center justify-center gap-2 border-t border-navy bg-paper py-3 text-sm font-semibold text-navy transition-colors active:bg-paper-2 md:hidden"
          >
            {loading
              ? "Loading…"
              : `${ordered.length} event${ordered.length === 1 ? "" : "s"} nearby`}
            <span aria-hidden className="text-[11px]">▲</span>
          </button>
        )}

        {listOpen && (
          <aside className="flex min-h-0 flex-1 flex-col border-t border-navy bg-paper md:w-[380px] md:flex-none md:border-l md:border-t-0">
            <button
              type="button"
              onClick={() => toggleList(false)}
              aria-label="Hide the list"
              className="grid shrink-0 place-items-center py-2.5 transition-colors active:bg-paper-2 md:hidden"
            >
              <span aria-hidden className="h-1 w-10 rounded-full bg-rule" />
            </button>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
              <h2 className="eyebrow text-navy">
                {coords ? "Nearest first" : "Starting soonest"}
              </h2>
              {status === "denied" && (
                <p className="text-[11px] text-muted">Location blocked — sorted by time</p>
              )}
            </div>

            {showLookAhead && (
              <LookAheadSlider
                valueMs={lookAheadMs}
                onChange={setLookAheadMs}
                found={ordered.length}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {error ? (
                <p className="px-4 py-6 text-[15px] text-muted">{error}</p>
              ) : loading ? (
                <p className="px-4 py-6 text-[15px] text-muted">Loading events…</p>
              ) : ordered.length === 0 ? (
                // The slider says what it found, so this would only repeat it.
                showLookAhead ? null : (
                  <div className="px-4 py-7">
                    <p className="text-base font-semibold text-ink">
                      Nothing in the next {windowLabel(lookAheadMs)}.
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-label">
                      Events appear here as soon as the pipeline finds them. Check back later today.
                    </p>
                  </div>
                )
              ) : (
                <NearbyList
                  events={ordered}
                  now={now}
                  selectedId={selectedId}
                  distances={distances}
                  onSelect={select}
                />
              )}

              {/* A phone keeps it in the scroll area, so the height goes on
                  events rather than a standing footnote. */}
              <SiteFooter className="md:hidden" />
            </div>

            {/* Desktop has the room to stand it at the foot of the panel. */}
            <SiteFooter className="hidden shrink-0 md:block" />
          </aside>
        )}
      </div>
    </main>
  );
}

function SiteFooter({ className = "" }: { className?: string }) {
  const credit =
    "font-semibold text-navy-mid underline underline-offset-2 transition-colors hover:text-navy";
  return (
    <footer
      className={`border-t border-rule px-4 py-3 text-[11px] leading-relaxed text-label ${className}`}
    >
      Find free food and meet people around Berkeley!
      <span className="mt-1 block">
        Built by{" "}
        <a href="https://mohul.dev/" target="_blank" rel="noopener noreferrer" className={credit}>
          mohul
        </a>{" "}
        &{" "}
        <a
          href="https://x.com/DhilenMistry"
          target="_blank"
          rel="noopener noreferrer"
          className={credit}
        >
          dhilen
        </a>
      </span>
      {/* The basemap credit OpenStreetMap's licence asks for. Off the page,
          since it is noise to anyone looking for lunch, but in the document
          for anyone or anything reading it. */}
      <span className="sr-only">
        Map data © OpenStreetMap contributors · tiles by OpenFreeMap
      </span>
    </footer>
  );
}

function LocateButton({
  status,
  onClick,
}: {
  status: ReturnType<typeof useLocation>["status"];
  onClick: () => void;
}) {
  const off = status === "denied" || status === "unavailable";
  const label =
    status === "locating"
      ? "Finding your location"
      : status === "granted"
        ? "Recentre on me"
        : off
          ? "Location unavailable"
          : "Use my location";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off || status === "locating"}
      aria-label={label}
      title={label}
      className={`absolute right-4 top-4 z-20 grid size-12 place-items-center rounded-full border border-rule bg-paper shadow-[0_2px_8px_rgb(0_21_43/0.25)] transition-colors hover:bg-paper-2 disabled:opacity-45 md:bottom-4 md:top-auto ${
        status === "granted" ? "text-navy-mid" : "text-navy"
      }`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-[1.8]">
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" strokeLinecap="round" />
      </svg>
    </button>
  );
}
