"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coords } from "./geo";

export type LocationStatus = "idle" | "locating" | "granted" | "denied" | "unavailable";

type State = {
  coords: Coords | null;
  accuracyFt: number | null;
  status: LocationStatus;
  /** Ask the browser for a position and keep watching it. */
  request: () => void;
  stop: () => void;
};

/**
 * Wraps navigator.geolocation. Nothing leaves the browser: the position is only
 * used to drop a dot on the map and sort the nearby list.
 */
export function useLocation(): State {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [accuracyFt, setAccuracyFt] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const watch = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    stop();
    setStatus("locating");
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracyFt(pos.coords.accuracy * 3.28084);
        setStatus("granted");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }, [stop]);

  // If the user already granted location to this origin, start without a prompt.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (!cancelled && p.state === "granted") request();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => stop, [stop]);

  return { coords, accuracyFt, status, request, stop };
}
