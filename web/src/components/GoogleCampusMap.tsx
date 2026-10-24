"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";
import { isLive, isPlaced, spreadPins, statusText, type FoodEvent } from "@/lib/events";
import { CAMPUS, CAMPUS_ZOOM, type Coords } from "@/lib/geo";
import type { Focus } from "./CampusMap";

/**
 * The same map, drawn by Google instead of MapLibre.
 *
 * Google renders the campus the way the reference screenshots do out of the box —
 * tan university buildings, green glades, Strawberry Creek — so there is no style
 * array here beyond turning off Google's own clickable POIs, which would otherwise
 * compete with our pins.
 *
 * It only runs when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; page.tsx falls back to
 * the MapLibre map otherwise. Unlike OpenFreeMap, this needs a key on a Google
 * Cloud billing account, and the key ships in the page, so restrict it by HTTP
 * referrer.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// A Google-hosted map style id. Advanced markers require one; DEMO_MAP_ID is
// Google's own placeholder and renders their default cartography.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

type Props = {
  events: FoodEvent[];
  now: Date;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClear: () => void;
  me: Coords | null;
  focus: Focus | null;
};

/** Detach a marker from the map. Kept out of the component so the hooks lint
 *  doesn't read it as mutating a captured ref. */
function detach(marker: google.maps.marker.AdvancedMarkerElement | null) {
  if (marker) marker.map = null;
}

function pinElement(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pin";
  el.setAttribute("aria-label", label);
  el.innerHTML = '<span class="pin__halo" hidden></span><span class="pin__dot"></span>';
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function meElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "me";
  el.setAttribute("aria-label", "Your location");
  el.innerHTML = '<span class="me__ring"></span><span class="me__dot"></span>';
  return el;
}

export default function GoogleCampusMap({
  events,
  now,
  selectedId,
  onSelect,
  onClear,
  me,
  focus,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pins = useRef(new Map<number, google.maps.marker.AdvancedMarkerElement>());
  const meMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const markerLib = useRef<google.maps.MarkerLibrary | null>(null);
  const [error, setError] = useState<string | null>(
    KEY ? null : "No NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set.",
  );
  const [ready, setReady] = useState(false);

  const handlers = useRef({ onSelect, onClear });
  useEffect(() => {
    handlers.current = { onSelect, onClear };
  }, [onSelect, onClear]);

  useEffect(() => {
    if (!KEY) return;
    const markers = pins.current;
    let cancelled = false;

    // v2 of the loader is a functional API; `new Loader(...)` is deprecated.
    setOptions({ key: KEY, v: "weekly" });
    importLibrary("maps")
      .then(async ({ Map }) => {
        markerLib.current = await importLibrary("marker");
        if (cancelled || !container.current) return;
        const m = new Map(container.current, {
          center: { lat: CAMPUS.lat, lng: CAMPUS.lng },
          zoom: CAMPUS_ZOOM,
          mapId: MAP_ID,
          // Google's own POI pins would compete with the event pins.
          clickableIcons: false,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          maxZoom: 19,
          minZoom: 12,
        });
        m.addListener("click", () => handlers.current.onClear());
        map.current = m;
        setReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Google Maps failed to load");
      });

    return () => {
      cancelled = true;
      for (const marker of markers.values()) detach(marker);
      markers.clear();
      detach(meMarker.current);
      meMarker.current = null;
      map.current = null;
    };
  }, []);

  // Ease the camera whenever the page asks for a new focus.
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.panTo({ lat: focus.coords.lat, lng: focus.coords.lng });
    m.setZoom(focus.zoom ?? Math.max(m.getZoom() ?? CAMPUS_ZOOM, 16));
  }, [focus, ready]);

  // Add and remove pins as the event list changes.
  useEffect(() => {
    const m = map.current;
    const lib = markerLib.current;
    if (!m || !lib) return;
    const placed = events.filter(isPlaced);
    const positions = spreadPins(placed);

    for (const [id, marker] of pins.current) {
      if (!positions.has(id)) {
        detach(marker);
        pins.current.delete(id);
      }
    }

    for (const e of placed) {
      const at = positions.get(e.id);
      if (!at) continue;
      const position = { lat: at[1], lng: at[0] };
      const existing = pins.current.get(e.id);
      if (existing) {
        existing.position = position;
        continue;
      }
      pins.current.set(
        e.id,
        new lib.AdvancedMarkerElement({
          map: m,
          position,
          content: pinElement(e.title, () => handlers.current.onSelect(e.id)),
        }),
      );
    }
  }, [events, ready]);

  // Repaint pin state: gold when live, navy when soon, larger when selected.
  useEffect(() => {
    for (const e of events) {
      const marker = pins.current.get(e.id);
      const el = marker?.content as HTMLElement | undefined;
      if (!el) continue;
      const live = isLive(e, now);
      el.classList.toggle("pin--live", live);
      el.classList.toggle("pin--selected", e.id === selectedId);
      el.querySelector<HTMLElement>(".pin__halo")!.hidden = !live;
      el.setAttribute("aria-label", `${e.title} — ${statusText(e, now)}`);
      if (marker) marker.zIndex = e.id === selectedId ? 3 : live ? 2 : 1;
    }
  }, [events, now, selectedId, ready]);

  // The "you are here" dot.
  useEffect(() => {
    const m = map.current;
    const lib = markerLib.current;
    if (!m || !lib) return;
    if (!me) {
      detach(meMarker.current);
      meMarker.current = null;
      return;
    }
    const position = { lat: me.lat, lng: me.lng };
    if (meMarker.current) {
      meMarker.current.position = position;
    } else {
      meMarker.current = new lib.AdvancedMarkerElement({
        map: m,
        position,
        content: meElement(),
      });
    }
  }, [me, ready]);

  if (error) {
    return (
      <div className="grid size-full place-items-center bg-paper-2 p-6">
        <p className="max-w-sm text-center text-sm text-muted">
          Google Maps could not load: {error}
        </p>
      </div>
    );
  }

  return <div ref={container} className="size-full" />;
}
