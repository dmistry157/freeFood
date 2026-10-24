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
  loading: () => <div className="size-full bg-paper-2" />,
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
    <main className="flex h-dvh flex-col bg-paper">
      {/* Masthead: a printed header, not a toolbar. Paper, navy ink, one hairline rule. */}
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-navy px-4 pb-3 pt-4 md:px-7 md:pb-4 md:pt-5">
        <div className="flex items-center gap-3">
          <svg aria-hidden viewBox="0 0 64 64" className="size-8 shrink-0">
            <rect width="64" height="64" fill="var(--color-navy-deep)" />
            <path
              d="M32 14c-7.18 0-13 5.82-13 13 0 9.37 11.07 22.92 12.19 24.27a1.06 1.06 0 0 0 1.62 0C33.93 49.92 45 36.37 45 27c0-7.18-5.82-13-13-13z"
              fill="var(--color-gold)"
            />
            <circle cx="32" cy="26.6" r="5.2" fill="var(--color-navy-deep)" />
          </svg>
          <div>
            <h1 className="text-[21px] font-semibold leading-none tracking-[-0.6px] text-navy-deep md:text-[26px]">
              Berkeley Free Food
            </h1>
            <p className="mt-1.5 text-[13px] leading-none text-muted md:text-sm">
              {loading
                ? "Loading…"
                : `${ordered.length} event${ordered.length === 1 ? "" : "s"} in the next 6 hours` +
                  (liveCount ? ` · ${liveCount} now` : "")}
            </p>
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          <LocateButton
            status={status}
            onClick={() => (coords ? focusOn(coords.lat, coords.lng, 16) : request())}
          />
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            className="eyebrow flex h-10 items-center gap-2 border border-navy px-3.5 text-navy transition-colors hover:bg-navy hover:text-paper"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-3.5 fill-none stroke-current stroke-[1.8]"
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
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center md:inset-x-auto md:bottom-5 md:left-5 md:justify-start">
              <div className="pointer-events-auto w-full max-w-[350px]">
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
          <aside className="flex min-h-0 flex-1 flex-col border-t border-navy bg-paper md:w-[380px] md:flex-none md:border-l md:border-t-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
              <h2 className="eyebrow text-navy">
                {coords ? "Nearest first" : "Starting soonest"}
              </h2>
              {status === "denied" ? (
                <p className="text-[11px] text-muted">Location blocked</p>
              ) : (
                <p className="eyebrow flex items-center gap-3 text-label">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-gold ring-1 ring-navy/40" />
                    Now
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-navy" />
                    Soon
                  </span>
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {error ? (
                <p className="px-4 py-6 text-[15px] text-muted">{error}</p>
              ) : loading ? (
                <p className="px-4 py-6 text-[15px] text-muted">Loading events…</p>
              ) : ordered.length === 0 ? (
                <div className="px-4 py-7">
                  <p className="text-base font-semibold text-ink">Nothing in the next 6 hours.</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-label">
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
              <footer className="border-t border-rule px-4 py-3 text-[11px] leading-relaxed text-label">
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
      ? "Locating"
      : status === "granted"
        ? "Recentre"
        : status === "denied"
          ? "Blocked"
          : status === "unavailable"
            ? "No GPS"
            : "Locate me";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "denied" || status === "unavailable" || status === "locating"}
      className="eyebrow flex h-10 items-center gap-2 border border-navy bg-navy px-3.5 text-gold transition-colors hover:bg-navy-mid disabled:border-rule disabled:bg-transparent disabled:text-label"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current stroke-[1.9]">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  );
}
