"use client";

import { useCallback, useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isLive, isPlaced, spreadPins, statusText, type FoodEvent } from "@/lib/events";
import { CAMPUS, CAMPUS_ZOOM, type Coords } from "@/lib/geo";
import { CAMPUS_LANDMARKS } from "@/lib/campus";

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

// Campus palette, matched against how Google renders this part of Berkeley:
// a light grey ground, tan university buildings, soft green lawns, a blue creek.
const C = {
  paper: "#ffffff",
  navy: "#00264c",
  ground: "#f1f1f3",
  grass: "#d9e8d2",
  wood: "#cfe0c3",
  building: "#f6efdf",
  buildingEdge: "#e7dabc",
  path: "#c4ced9",
  water: "#4fb3e8",
  grassInk: "#44632f",
};

/**
 * Restyle the basemap into a campus map, using the vector tiles' own layers
 * (`landcover`, `landuse`, `building`, `transportation`, `waterway`) rather than
 * shapes we invent — an earlier version drew its own rectangles for the glades
 * and they looked exactly like that.
 *
 * Compared against Google's rendering of the same blocks, which differs from a
 * stock basemap in three ways worth copying: the ground stays light grey and the
 * *buildings* carry the warm tone, lawns are green, and footpaths are wide soft
 * ribbons rather than hairlines. Paths only appear from zoom 16.5, because campus
 * has hundreds of sidewalks and at any lower zoom they read as spaghetti.
 */
function dressCampus(m: maplibregl.Map) {
  const src = "openmaptiles";
  // Land fills go directly beneath this layer: above positron's own
  // landuse_residential / landcover_wood, below roads, buildings and labels.
  const ANCHOR = "waterway";

  if (m.getLayer("background")) m.setPaintProperty("background", "background-color", C.ground);

  // Real tree cover and grass, straight from OSM. Wood first so grass sits on top.
  m.addLayer(
    {
      id: "campus-wood",
      type: "fill",
      source: src,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "forest"]]],
      paint: { "fill-color": C.wood, "fill-opacity": 0.75 },
    },
    ANCHOR,
  );
  m.addLayer(
    {
      id: "campus-grass",
      type: "fill",
      source: src,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["grass", "farmland"]]],
      paint: { "fill-color": C.grass, "fill-opacity": 0.95 },
    },
    ANCHOR,
  );
  if (m.getLayer("park")) {
    m.setPaintProperty("park", "fill-color", C.grass);
    m.setPaintProperty("park", "fill-opacity", 0.9);
  }

  // Strawberry Creek, which Google draws as a clear blue thread through campus.
  if (m.getLayer("waterway")) {
    m.setPaintProperty("waterway", "line-color", C.water);
    m.setPaintProperty("waterway", "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      13,
      0.8,
      18,
      3.2,
    ]);
  }

  // Footpaths, as wide soft ribbons and only once you're properly zoomed in.
  // Drawn under the buildings, the way Google layers them.
  m.addLayer(
    {
      id: "campus-paths",
      type: "line",
      source: src,
      "source-layer": "transportation",
      minzoom: 16.5,
      filter: ["in", ["get", "subclass"], ["literal", ["path", "footway", "pedestrian"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": C.path,
        "line-opacity": 0.75,
        "line-width": ["interpolate", ["linear"], ["zoom"], 16.5, 2, 18, 5],
      },
    },
    "building",
  );

  // Buildings carry the warm campus tone; the ground stays light.
  if (m.getLayer("building")) {
    m.setPaintProperty("building", "fill-color", C.building);
    m.setPaintProperty("building", "fill-opacity", 1);
  }
  m.addLayer({
    id: "building-edge",
    type: "line",
    source: src,
    "source-layer": "building",
    minzoom: 16,
    paint: { "line-color": C.buildingEdge, "line-width": 0.9 },
  });

  // Park names from OSM, in italic like the map's other natural features.
  m.addLayer({
    id: "park-label",
    type: "symbol",
    source: src,
    "source-layer": "park",
    minzoom: 14.4,
    layout: {
      "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
      "text-font": ["Noto Sans Italic"],
      "text-size": 11,
      "text-padding": 3,
      "text-optional": true,
    },
    paint: { "text-color": C.grassInk, "text-halo-color": C.paper, "text-halo-width": 1.4 },
  });

  // Landmarks, from data/buildings.csv. Two passes so the well-known ones survive
  // label collisions and the rest appear once you've zoomed in enough to want them.
  m.addSource("landmarks", { type: "geojson", data: CAMPUS_LANDMARKS });
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
        "text-opacity": rank === 1 ? 0.95 : 0.8,
        "text-halo-color": C.paper,
        "text-halo-width": 1.6,
      },
    });
  }
}

/**
 * Two pins closer than this on screen are treated as one spot. Roughly the width
 * of a pin's tap target, so anything that would overlap gets collapsed instead.
 */
const CLUSTER_PX = 38;

function clusterElement(count: number, live: boolean, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `pin pin--cluster${live ? " pin--live" : ""}`;
  el.setAttribute("aria-label", `${count} events here — zoom in to separate them`);
  el.innerHTML = `<span class="pin__count">${count}</span>`;
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
  const clusters = useRef<maplibregl.Marker[]>([]);
  const positions = useRef(new Map<number, [number, number]>());
  const liveIds = useRef(new Set<number>());
  // Keep the latest callbacks without tearing the map down when they change.
  const handlers = useRef({ onSelect, onClear });
  // Held in a ref so the map-init effect can subscribe to moveend without taking
  // recluster as a dependency and tearing the map down every time it changes.
  const reclusterRef = useRef<() => void>(() => {});

  /**
   * Collapse pins that land on top of each other at the current zoom into a single
   * marker showing how many there are.
   *
   * spreadPins offsets co-located events by a fixed ~14m, which is a usable gap
   * once you are zoomed right in but barely a pixel at campus zoom — where the
   * pins just overlap and the one underneath cannot be clicked. Grouping in screen
   * space instead means the behaviour follows the zoom: a "2" when they overlap,
   * two separate pins as soon as there is room, and clicking the cluster zooms to
   * the point where they split.
   */
  const recluster = useCallback(() => {
    const m = map.current;
    if (!m) return;

    for (const c of clusters.current) c.remove();
    clusters.current = [];

    const pts = [...positions.current.entries()].map(([id, lngLat]) => ({
      id,
      lngLat,
      pt: m.project(lngLat),
    }));

    const taken = new Set<number>();
    for (const a of pts) {
      if (taken.has(a.id)) continue;
      taken.add(a.id);
      const group = [a];
      for (const b of pts) {
        if (taken.has(b.id)) continue;
        if (Math.hypot(a.pt.x - b.pt.x, a.pt.y - b.pt.y) <= CLUSTER_PX) {
          taken.add(b.id);
          group.push(b);
        }
      }

      const alone = group.length === 1;
      for (const g of group) {
        pins.current.get(g.id)?.getElement().classList.toggle("pin--clustered", !alone);
      }
      if (alone) continue;

      const lng = group.reduce((t, g) => t + g.lngLat[0], 0) / group.length;
      const lat = group.reduce((t, g) => t + g.lngLat[1], 0) / group.length;
      const live = group.some((g) => liveIds.current.has(g.id));
      clusters.current.push(
        new maplibregl.Marker({
          element: clusterElement(group.length, live, () =>
            m.easeTo({ center: [lng, lat], zoom: Math.min(m.getZoom() + 2.5, 18), duration: 500 }),
          ),
        })
          .setLngLat([lng, lat])
          .addTo(m),
      );
    }
  }, []);

  useEffect(() => {
    reclusterRef.current = recluster;
  }, [recluster]);

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
      minZoom: 11.5,
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
    m.on("moveend", () => reclusterRef.current());
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
    const spread = spreadPins(placed);
    positions.current = spread;

    for (const [id, marker] of pins.current) {
      if (!spread.has(id)) {
        marker.remove();
        pins.current.delete(id);
      }
    }

    for (const e of placed) {
      const at = spread.get(e.id);
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
      if (live) liveIds.current.add(e.id);
      else liveIds.current.delete(e.id);
    }
    recluster();
  }, [events, now, selectedId, recluster]);

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
