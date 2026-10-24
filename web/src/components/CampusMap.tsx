"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isLive, isPlaced, spreadPins, statusText, type FoodEvent } from "@/lib/events";
import { CAMPUS, CAMPUS_ZOOM, type Coords } from "@/lib/geo";
import {
  BERKELEY_BOUNDS,
  CAMPUS_LANDMARKS,
  CAMPUS_OUTLINE,
  LAWNS,
  OFF_CAMPUS_VEIL,
} from "@/lib/campus";

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

// Palette mirrored from globals.css — MapLibre paint can't read CSS variables.
const C = {
  paper: "#faf8f3",
  navy: "#001e3c",
  building: "#e7dfd0",
  lawn: "#cfe0b4",
  lawnEdge: "#b6cf95",
  lawnInk: "#4a6b32",
};

/**
 * Turn a generic basemap into campus: fade everything outside central campus,
 * put grass back on the glades, warm up the building footprints, and label the
 * buildings people actually navigate by.
 */
function dressCampus(m: maplibregl.Map) {
  // Grass, where the basemap had grey.
  if (m.getLayer("park")) m.setPaintProperty("park", "fill-color", C.lawn);
  if (m.getLayer("building")) {
    m.setPaintProperty("building", "fill-color", C.building);
    m.setPaintProperty("building", "fill-opacity", 0.9);
  }

  m.addSource("off-campus", { type: "geojson", data: OFF_CAMPUS_VEIL });
  m.addSource("campus", { type: "geojson", data: CAMPUS_OUTLINE });
  m.addSource("lawns", { type: "geojson", data: LAWNS });
  m.addSource("landmarks", { type: "geojson", data: CAMPUS_LANDMARKS });

  // Everything beyond campus washes out to paper, so the city stays as context
  // without competing. The polygon has a campus-shaped hole, so campus is untouched.
  m.addLayer({
    id: "off-campus-veil",
    type: "fill",
    source: "off-campus",
    paint: { "fill-color": C.paper, "fill-opacity": 0.74 },
  });

  m.addLayer({
    id: "campus-edge",
    type: "line",
    source: "campus",
    paint: { "line-color": C.navy, "line-width": 1.25, "line-opacity": 0.5 },
  });

  m.addLayer({
    id: "lawn-fill",
    type: "fill",
    source: "lawns",
    paint: { "fill-color": C.lawn, "fill-opacity": 0.85 },
  });
  m.addLayer({
    id: "lawn-edge",
    type: "line",
    source: "lawns",
    paint: { "line-color": C.lawnEdge, "line-width": 1 },
  });
  m.addLayer({
    id: "lawn-label",
    type: "symbol",
    source: "lawns",
    minzoom: 14.6,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Italic"],
      "text-size": 11,
      "text-padding": 3,
    },
    paint: { "text-color": C.lawnInk, "text-halo-color": C.paper, "text-halo-width": 1.4 },
  });

  // Two passes so the well-known buildings survive label collisions and the rest
  // only appear once you've zoomed in far enough to want them.
  for (const [rank, minzoom, size] of [
    [1, 14.1, 11],
    [2, 15.4, 10.5],
  ] as const) {
    m.addLayer({
      id: `landmark-${rank}`,
      type: "symbol",
      source: "landmarks",
      minzoom,
      filter: ["==", ["get", "rank"], rank],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": size,
        "text-padding": 4,
        "text-optional": true,
      },
      paint: {
        "text-color": C.navy,
        "text-opacity": rank === 1 ? 0.92 : 0.75,
        "text-halo-color": C.paper,
        "text-halo-width": 1.6,
      },
    });
  }
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
      maxBounds: BERKELEY_BOUNDS,
      minZoom: 13.2,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Quieten the basemap, then draw campus on top of it.
    m.on("load", () => {
      for (const id of CLUTTER) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
      }
      dressCampus(m);
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
