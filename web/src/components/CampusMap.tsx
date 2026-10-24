"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isLive, isPlaced, spreadPins, statusText, type FoodEvent } from "@/lib/events";
import { CAMPUS, CAMPUS_ZOOM, type Coords } from "@/lib/geo";

// OpenFreeMap serves these tiles free with no API key and no account.
const STYLE = "https://tiles.openfreemap.org/styles/positron";

// Basemap layers hidden on load. Positron is already minimal, so this is aimed at
// what actually competes on a campus-scale map: shouted neighbourhood names
// (GOURMET GHETTO, SOUTHSIDE), creek labels crossing the middle of campus, and
// highway route shields. Street names and place names stay — those help you walk there.
const CLUTTER = new Set([
  "label_other",
  "waterway_line_label",
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  "airport",
  "aeroway-taxiway",
  "aeroway-runway-casing",
  "aeroway-area",
  "aeroway-runway",
]);

// Turbopack doesn't emit MapLibre's worker, so serve the copy that
// scripts/copy-maplibre-worker.mjs places in public/ (see next.config.ts basePath).
maplibregl.setWorkerUrl(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/maplibre-gl-worker.mjs`);

/** A place to ease the camera to. `nonce` changes to re-trigger the same target. */
export type Focus = { coords: Coords; zoom?: number; nonce: number };

type Props = {
  events: FoodEvent[];
  now: Date;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClear: () => void;
  me: Coords | null;
  focus: Focus | null;
};

function pinElement(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pin";
  el.setAttribute("aria-label", label);
  el.innerHTML = '<span class="pin__halo" hidden></span><span class="pin__dot"></span>';
  // Stop the click here so the map's own handler (which clears the selection) doesn't also fire.
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

export default function CampusMap({
  events,
  now,
  selectedId,
  onSelect,
  onClear,
  me,
  focus,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pins = useRef(new Map<number, maplibregl.Marker>());
  const meMarker = useRef<maplibregl.Marker | null>(null);
  // Keep the latest callbacks without tearing the map down when they change.
  const handlers = useRef({ onSelect, onClear });
  useEffect(() => {
    handlers.current = { onSelect, onClear };
  }, [onSelect, onClear]);

  useEffect(() => {
    const markers = pins.current;
    const m = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      center: [CAMPUS.lng, CAMPUS.lat],
      zoom: CAMPUS_ZOOM,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Quieten the basemap so the pins are the only thing worth looking at.
    m.on("load", () => {
      for (const id of CLUTTER) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
      }
    });
    m.on("click", () => handlers.current.onClear());
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.clear();
      meMarker.current = null;
    };
  }, []);

  // Ease the camera whenever the page asks for a new focus.
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.easeTo({
      center: [focus.coords.lng, focus.coords.lat],
      zoom: focus.zoom ?? Math.max(m.getZoom(), 16),
      duration: 600,
    });
  }, [focus]);

  // Add and remove pins as the event list changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const placed = events.filter(isPlaced);
    const positions = spreadPins(placed);

    for (const [id, marker] of pins.current) {
      if (!positions.has(id)) {
        marker.remove();
        pins.current.delete(id);
      }
    }

    for (const e of placed) {
      const at = positions.get(e.id);
      if (!at) continue;
      const existing = pins.current.get(e.id);
      if (existing) {
        existing.setLngLat(at);
        continue;
      }
      const marker = new maplibregl.Marker({
        element: pinElement(e.title, () => handlers.current.onSelect(e.id)),
      })
        .setLngLat(at)
        .addTo(m);
      pins.current.set(e.id, marker);
    }
  }, [events]);

  // Repaint pin state: red when live, grey when soon, larger when selected.
  useEffect(() => {
    for (const e of events) {
      const marker = pins.current.get(e.id);
      if (!marker) continue;
      const live = isLive(e, now);
      const el = marker.getElement();
      el.classList.toggle("pin--live", live);
      el.classList.toggle("pin--selected", e.id === selectedId);
      el.querySelector<HTMLElement>(".pin__halo")!.hidden = !live;
      el.setAttribute("aria-label", `${e.title} — ${statusText(e, now)}`);
      el.style.zIndex = String(e.id === selectedId ? 3 : live ? 2 : 1);
    }
  }, [events, now, selectedId]);

  // The "you are here" dot.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!me) {
      meMarker.current?.remove();
      meMarker.current = null;
      return;
    }
    // A Marker must know where it is before it joins the map, or addTo() reads an
    // undefined position.
    if (meMarker.current) {
      meMarker.current.setLngLat([me.lng, me.lat]);
    } else {
      meMarker.current = new maplibregl.Marker({ element: meElement() })
        .setLngLat([me.lng, me.lat])
        .addTo(m);
    }
  }, [me]);

  // size-full rather than absolute inset-0: maplibre-gl.css sets
  // .maplibregl-map { position: relative } and loads after Tailwind's utilities.
  return <div ref={container} className="size-full" />;
}
