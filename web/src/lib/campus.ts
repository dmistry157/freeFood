// The campus landmarks labelled under the pins.
//
// Every coordinate comes from the pipeline's own data/buildings.csv, the 425-place
// table the geocoder matches event locations against. Everything else the map draws
// — grass, parks, buildings, paths — comes from the vector tiles' real OSM
// geometry, styled in CampusMap.dressCampus.

import type { FeatureCollection, Point } from "geojson";

/**
 * Landmarks worth labelling. `rank` 1 is always drawn; 2 appears once you zoom in.
 * Coordinates are from data/buildings.csv.
 */
const LANDMARKS: { name: string; lat: number; lng: number; rank: 1 | 2 }[] = [
  { name: "Memorial Glade", lat: 37.8732, lng: -122.25937, rank: 1 },
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
  { name: "Faculty Glade", lat: 37.8714, lng: -122.25653, rank: 2 },
];

export const CAMPUS_LANDMARKS: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: LANDMARKS.map((l) => ({
    type: "Feature",
    properties: { name: l.name, rank: l.rank },
    geometry: { type: "Point", coordinates: [l.lng, l.lat] },
  })),
};
