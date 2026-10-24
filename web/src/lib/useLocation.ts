"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coords } from "./geo";

/**
 * Whether this browser has shared its location with us before. Per-device, never
 * sent anywhere, and only ever used to decide whether to ask again on load.
 * Storage can throw in private mode, so every access is guarded.
 */
const REMEMBER_KEY = "freefood:located";

function remembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function setRemembered(on: boolean) {
  try {
    if (on) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* private mode: fall back to asking each visit */
  }
}

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
        setRemembered(true);
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setStatus(denied ? "denied" : "unavailable");
        // Stop auto-asking once they have said no.
        if (denied) setRemembered(false);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }, [stop]);

  /**
   * Pick location back up on a return visit without making them hunt for the button.
   *
   * A page cannot grant itself geolocation — only the browser can, and only the
   * person can answer that prompt. What a page *can* do is notice it was allowed
   * before and start straight away.
   *
   * Two routes, because Chrome and Safari differ: Chrome answers
   * permissions.query({name:"geolocation"}), so a previous "Allow" resumes with no
   * prompt at all. Safari — including every iPhone — does not implement that query
   * for geolocation, so the remembered flag below is what covers it.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    const start = () => {
      if (!cancelled) request();
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((p) => {
          if (p.state === "granted" || (p.state === "prompt" && remembered())) start();
        })
        .catch(() => {
          if (remembered()) start();
        });
    } else if (remembered()) {
      // Not called straight from the effect body: request() sets state.
      queueMicrotask(start);
    }

    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => stop, [stop]);

  return { coords, accuracyFt, status, request, stop };
}
