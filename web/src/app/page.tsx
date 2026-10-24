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
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink/10 px-4 py-3 md:px-6">
        <div className="mr-auto">
          <h1 className="text-base font-semibold tracking-[-0.2px] text-ink">
            Berkeley Free Food
          </h1>
          <p className="text-xs text-label">
            {loading
              ? "Loading…"
              : `${ordered.length} event${ordered.length === 1 ? "" : "s"} in the next 6 hours` +
                (liveCount ? ` · ${liveCount} happening now` : "")}
          </p>
        </div>

        <p className="eyebrow hidden items-center gap-4 text-label sm:flex">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-live" /> Now
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-soon" /> Soon
          </span>
        </p>

        <LocateButton status={status} onClick={() => (coords ? focusOn(coords.lat, coords.lng, 16) : request())} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="relative h-[46vh] shrink-0 md:h-auto md:flex-1">
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
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center md:inset-x-auto md:left-4 md:max-w-[300px] md:justify-start">
              <div className="pointer-events-auto w-full max-w-[320px]">
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

        <aside className="flex min-h-0 flex-1 flex-col border-t border-ink/10 bg-card/60 md:w-[380px] md:flex-none md:border-l md:border-t-0">
          <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
            <h2 className="eyebrow text-label">{coords ? "Nearest first" : "Starting soonest"}</h2>
            {status === "denied" && (
              <p className="text-[11px] text-muted">Location blocked — sorted by time</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {error ? (
              <p className="px-4 py-6 text-sm text-muted">{error}</p>
            ) : loading ? (
              <p className="px-4 py-6 text-sm text-muted">Loading events…</p>
            ) : ordered.length === 0 ? (
              <div className="px-4 py-6">
                <p className="text-sm font-medium text-ink">Nothing in the next 6 hours.</p>
                <p className="mt-1 text-xs text-label">
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
          </div>

          <footer className="shrink-0 border-t border-ink/10 px-4 py-2.5 text-[11px] leading-snug text-label">
            Free food on the UC Berkeley campus, collected automatically. Your location stays in your
            browser.
          </footer>
        </aside>
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
        ? "Recentre on me"
        : status === "denied"
          ? "Location blocked"
          : status === "unavailable"
            ? "Location unavailable"
            : "Use my location";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "denied" || status === "unavailable" || status === "locating"}
      className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-card shadow-pill transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-ink/35"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current stroke-[1.6]">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  );
}
