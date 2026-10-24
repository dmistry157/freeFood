"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchEvents, type FoodEvent } from "./events";

const REFETCH_MS = 5 * 60 * 1000; // the pipeline writes every few hours; this is plenty
const TICK_MS = 30 * 1000; // re-render so "In 12 min" and pin colours stay honest

type State = {
  events: FoodEvent[];
  now: Date;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

export function useEvents(): State {
  const [events, setEvents] = useState<FoodEvent[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchEvents());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount, then on a slow interval. Every setState below happens in a
    // callback or after an await, never synchronously while the effect runs.
    const refetch = setInterval(() => void load(), REFETCH_MS);
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    // load() awaits fetchEvents() before it ever calls setState, so nothing here
    // updates state synchronously; the rule can't see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      clearInterval(refetch);
      clearInterval(tick);
    };
  }, [load]);

  return { events, now, error, loading, reload: load };
}
