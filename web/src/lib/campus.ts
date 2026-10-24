// The campus layer that sits under the pins: where Berkeley is, what counts as
// campus, which lawns are lawns, and the buildings a student actually navigates by.
//
// Every landmark coordinate here comes from the pipeline's own data/buildings.csv,
// the 425-place table the geocoder matches event locations against.

import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

/** The map never leaves Berkeley. [west, south, east, north]. */
export const BERKELEY_BOUNDS: [number, number, number, number] = [
  -122.3, 37.853, -122.233, 37.888,
];

/**
 * Central campus, traced roughly along Oxford (west), Hearst (north), Bancroft
 * (south), and out east far enough to take in the Mining Circle and the Greek
 * Theatre. Approximate on purpose — it is a highlight, not a property line.
 */
const CAMPUS_RING: [number, number][] = [
  [-122.2668, 37.8757],
  [-122.2606, 37.8762],
  [-122.256, 37.8764],
  [-122.2524, 37.8748],
  [-122.2496, 37.8734],
  [-122.2492, 37.8706],
  [-122.2513, 37.8688],
  [-122.2566, 37.8678],
  [-122.2626, 37.868],
  [-122.2668, 37.8684],
  [-122.2668, 37.8757],
];

/** A box well outside the bounds, used as the outer ring of the veil. */
const WORLD_RING: [number, number][] = [
  [-122.45, 37.74],
  [-122.08, 37.74],
  [-122.08, 37.97],
  [-122.45, 37.97],
  [-122.45, 37.74],
];

/**
 * Everything that is not campus, as one polygon with a campus-shaped hole. Filled
 * with paper at low opacity so the surrounding city fades to context and central
 * campus reads as the subject of the map.
 */
export const OFF_CAMPUS_VEIL: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [WORLD_RING, [...CAMPUS_RING].reverse()],
  },
};

export const CAMPUS_OUTLINE: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [CAMPUS_RING] },
};

/** Rough rectangle around a lawn, given its centre and a size in metres. */
function lawn(name: string, lat: number, lng: number, ew: number, ns: number): Feature<Polygon> {
  const dLat = ns / 2 / 111_320;
  const dLng = ew / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "Feature",
    properties: { name },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng - dLng, lat - dLat],
          [lng + dLng, lat - dLat],
          [lng + dLng, lat + dLat],
          [lng - dLng, lat + dLat],
          [lng - dLng, lat - dLat],
        ],
      ],
    },
  };
}

/**
 * The two glades, drawn as grass. OpenStreetMap has them, but positron renders
 * parks in the same grey as everything else, and the Glade is the one piece of
 * campus everybody pictures.
 */
export const LAWNS: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    lawn("Memorial Glade", 37.8732, -122.25937, 170, 95),
    lawn("Faculty Glade", 37.8714, -122.25653, 120, 80),
    lawn("Sproul Plaza", 37.8695, -122.25924, 70, 150),
  ],
};

/**
 * Landmarks worth labelling. `rank` 1 is always drawn; 2 appears once you zoom in.
 * Coordinates are from data/buildings.csv.
 */
const LANDMARKS: { name: string; lat: number; lng: number; rank: 1 | 2 }[] = [
  { name: "Campanile", lat: 37.87206, lng: -122.257832, rank: 1 },
  { name: "Doe Library", lat: 37.872187, lng: -122.259513, rank: 1 },
  { name: "Sproul Hall", lat: 37.869592, lng: -122.258821, rank: 1 },
  { name: "Dwinelle", lat: 37.870715, lng: -122.26063, rank: 1 },
  { name: "Soda", lat: 37.875674, lng: -122.258724, rank: 1 },
  { name: "Cory", lat: 37.875048, lng: -122.257574, rank: 1 },
  { name: "Evans", lat: 37.873622, lng: -122.257843, rank: 1 },
  { name: "VLSB", lat: 37.871476, lng: -122.262135, rank: 1 },
  { name: "The Gateway", lat: 37.874138, lng: -122.263479, rank: 1 },
  { name: "Haas", lat: 37.87194, lng: -122.25384, rank: 1 },
  { name: "Memorial Stadium", lat: 37.870998, lng: -122.250739, rank: 1 },
  { name: "RSF", lat: 37.868656, lng: -122.262766, rank: 1 },
  { name: "Moffitt", lat: 37.872552, lng: -122.260855, rank: 2 },
  { name: "Wheeler", lat: 37.871308, lng: -122.259168, rank: 2 },
  { name: "Jacobs", lat: 37.876032, lng: -122.258813, rank: 2 },
  { name: "Etcheverry", lat: 37.875686, lng: -122.259277, rank: 2 },
  { name: "Stanley", lat: 37.873983, lng: -122.256113, rank: 2 },
  { name: "Hearst Mining", lat: 37.874454, lng: -122.257265, rank: 2 },
  { name: "Greek Theatre", lat: 37.873692, lng: -122.254251, rank: 2 },
  { name: "Sather Gate", lat: 37.87024, lng: -122.25951, rank: 2 },
  { name: "Zellerbach", lat: 37.869102, lng: -122.260798, rank: 2 },
  { name: "Li Ka Shing", lat: 37.872994, lng: -122.265429, rank: 2 },
];

export const CAMPUS_LANDMARKS: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: LANDMARKS.map((l) => ({
    type: "Feature",
    properties: { name: l.name, rank: l.rank },
    geometry: { type: "Point", coordinates: [l.lng, l.lat] },
  })),
};
