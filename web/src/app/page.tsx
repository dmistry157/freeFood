"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { NearbyList } from "@/components/NearbyList";
import type { Focus } from "@/components/CampusMap";
import { isPlaced } from "@/lib/events";
import { distanceFt } from "@/lib/geo";
import { useEvents } from "@/lib/useEvents";
import { useLocation } from "@/lib/useLocation";

// MapLibre needs a browser, and the site is a static export, so load it client-side only.
const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="size-full bg-ground" />,
});

export default function Home() {
  const { events, now, error, loading } = useEvents();
  const { coords, status, request } = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [focus, setFocus] = useState<Focus | null>(null);
  const nonce = useRef(0);
  const centredOnMe = useRef(false);

  const focusOn = useCallback((lat: number, lng: number, zoom?: number) => {
    nonce.current += 1;
    setFocus({ coords: { lat, lng }, zoom, nonce: nonce.current });
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
      if (e && isPlaced(e)) focusOn(e.lat, e.lng);
    },
    [events, focusOn],
  );

  // Frame the user the first time their position arrives.
  useEffect(() => {
    if (coords && !centredOnMe.current) {
      centredOnMe.current = true;
      focusOn(coords.lat, coords.lng, 16);
    }
  }, [coords, focusOn]);

  const liveCount = ordered.filter((e) => new Date(e.start_time) <= now).length;

  return (
    <main className="flex h-dvh flex-col bg-ground">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 bg-cal-blue-dark px-4 py-3 md:px-6 md:py-4">
        <div className="mr-auto flex items-center gap-3">
          <svg aria-hidden viewBox="0 0 64 64" className="size-8 shrink-0 md:size-9">
            <rect width="64" height="64" rx="14" className="fill-white/10" />
            <path
              d="M32 12.5c-7.46 0-13.5 6.04-13.5 13.5 0 9.73 11.5 23.8 12.66 25.2a1.1 1.1 0 0 0 1.68 0C34 49.8 45.5 35.73 45.5 26c0-7.46-6.04-13.5-13.5-13.5z"
              className="fill-cal-gold"
            />
            <circle cx="32" cy="25.6" r="5.4" className="fill-cal-blue-dark" />
          </svg>
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.3px] text-white md:text-xl">
              Berkeley Free Food
            </h1>
            <p className="text-[13px] text-white/70 md:text-sm">
              {loading
                ? "Loading…"
                : `${ordered.length} event${ordered.length === 1 ? "" : "s"} in the next 6 hours` +
                  (liveCount ? ` · ${liveCount} now` : "")}
            </p>
          </div>
        </div>

        <p className="eyebrow hidden items-center gap-4 text-white/70 lg:flex">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-cal-gold ring-2 ring-white" /> Now
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-cal-blue ring-2 ring-white" />{" "}
            Soon
          </span>
        </p>

        <div className="flex items-center gap-2">
          <LocateButton
            status={status}
            onClick={() => (coords ? focusOn(coords.lat, coords.lng, 16) : request())}
          />
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            className="flex h-10 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-4 fill-none stroke-current stroke-[1.7]"
            >
              <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
            </svg>
            {listOpen ? "Hide list" : "Show list"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section
          className={`relative shrink-0 md:h-auto md:flex-1 ${
            listOpen ? "h-[44vh]" : "h-auto min-h-0 flex-1"
          }`}
        >
          <CampusMap
            events={ordered}
            now={now}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onClear={() => setSelectedId(null)}
            me={coords}
            focus={focus}
          />
          {selected && (
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-center md:inset-x-auto md:bottom-4 md:left-4 md:justify-start">
              <div className="pointer-events-auto w-full max-w-[360px]">
                <EventCard
                  event={selected}
                  now={now}
                  distanceFt={distances.get(selected.id) ?? null}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            </div>
          )}
        </section>

        {listOpen && (
          <aside className="flex min-h-0 flex-1 flex-col border-t-2 border-cal-blue-dark/15 bg-card md:w-[400px] md:flex-none md:border-l-2 md:border-t-0">
            <div className="flex shrink-0 items-baseline justify-between border-b border-line px-4 py-3">
              <h2 className="eyebrow text-cal-blue-dark">
                {coords ? "Nearest first" : "Starting soonest"}
              </h2>
              {status === "denied" && (
                <p className="text-xs text-muted">Location blocked — sorted by time</p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {error ? (
                <p className="px-4 py-6 text-[15px] text-muted">{error}</p>
              ) : loading ? (
                <p className="px-4 py-6 text-[15px] text-muted">Loading events…</p>
              ) : ordered.length === 0 ? (
                <div className="px-4 py-6">
                  <p className="text-base font-semibold text-ink">Nothing in the next 6 hours.</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-label">
                    Events appear here as soon as the pipeline finds them. Check back later today.
                  </p>
                </div>
              ) : (
                <NearbyList
                  events={ordered}
                  now={now}
                  selectedId={selectedId}
                  distances={distances}
                  onSelect={select}
                />
              )}

              {/* Inside the scroll area rather than pinned, so a phone spends its
                  height on events instead of a standing footnote. */}
              <footer className="border-t border-line px-4 py-3 text-xs leading-relaxed text-label">
                Free food on the UC Berkeley campus, collected automatically. Your location stays in
                your browser.
              </footer>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

function LocateButton({
  status,
  onClick,
}: {
  status: ReturnType<typeof useLocation>["status"];
  onClick: () => void;
}) {
  const label =
    status === "locating"
      ? "Locating…"
      : status === "granted"
        ? "Recentre"
        : status === "denied"
          ? "Blocked"
          : status === "unavailable"
            ? "Unavailable"
            : "Use my location";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "denied" || status === "unavailable" || status === "locating"}
      className="flex h-10 items-center gap-2 rounded-full bg-cal-gold px-4 text-[13px] font-bold text-cal-blue-dark shadow-pill transition-colors hover:bg-cal-gold-dark disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-[1.8]">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  );
}
