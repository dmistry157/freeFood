// Distance helpers for the "nearby" list. Campus-scale, so feet below a tenth of
// a mile and miles above it.

export type Coords = { lat: number; lng: number };

/** Centre of the UC Berkeley campus, used until the browser shares a location. */
export const CAMPUS: Coords = { lat: 37.8719, lng: -122.2585 };
export const CAMPUS_ZOOM = 14.4;

const EARTH_FT = 20_902_231;

/** Great-circle distance in feet. */
export function distanceFt(a: Coords, b: Coords): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_FT * Math.asin(Math.sqrt(h));
}

export function distanceText(ft: number): string {
  if (ft < 528) return `${Math.max(1, Math.round(ft / 10) * 10)} ft`;
  return `${(ft / 5280).toFixed(1)} mi`;
}

/** Roughly how long it takes to walk there, at a student's 4.5 ft/s. */
export function walkText(ft: number): string {
  const mins = Math.round(ft / 4.5 / 60);
  return mins < 1 ? "under a minute" : `${mins} min walk`;
}
