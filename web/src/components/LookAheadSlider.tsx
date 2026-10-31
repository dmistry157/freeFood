"use client";

import { useEffect, useState } from "react";
import { MAX_WINDOW_MS, WINDOW_MS } from "@/lib/events";

const HOUR_MS = 60 * 60 * 1000;
const MIN_H = WINDOW_MS / HOUR_MS;
const MAX_H = MAX_WINDOW_MS / HOUR_MS;

type Props = {
  /** The window the query is using, in ms. */
  valueMs: number;
  onChange: (ms: number) => void;
  /** Events the current window turned up, so the slider reports what it found. */
  found: number;
};

/** "8 hours", "1 day", "1 day 6 hr", "2 days". */
export function windowLabel(ms: number): string {
  const h = Math.round(ms / HOUR_MS);
  if (h < 24) return `${h} hours`;
  const days = Math.floor(h / 24);
  const rest = h % 24;
  const d = `${days} day${days > 1 ? "s" : ""}`;
  return rest ? `${d} ${rest} hr` : d;
}

/**
 * Widens the six-hour window, up to two days.
 *
 * The map deliberately starts with a narrow slice, since what you want at noon is
 * lunch and not next Tuesday. But there are usually days of events already stored,
 * so desktop always offers them. Dragging it refetches with a wider horizon.
 */
export function LookAheadSlider({ valueMs, onChange, found }: Props) {
  const [hours, setHours] = useState(() => Math.round(valueMs / HOUR_MS));

  // Drag freely; only go back to Supabase once the handle settles.
  useEffect(() => {
    if (hours * HOUR_MS === valueMs) return;
    const t = setTimeout(() => onChange(hours * HOUR_MS), 200);
    return () => clearTimeout(t);
  }, [hours, valueMs, onChange]);

  return (
    <div className="shrink-0 border-b border-rule bg-paper-2/60 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="look-ahead" className="eyebrow text-navy">
          Look ahead
        </label>
        <span className="tabular text-[13px] font-semibold text-ink">{windowLabel(hours * HOUR_MS)}</span>
      </div>

      <input
        id="look-ahead"
        type="range"
        min={MIN_H}
        max={MAX_H}
        step={1}
        value={hours}
        onChange={(e) => setHours(Number(e.target.value))}
        className="mt-2 w-full accent-navy"
      />

      <div className="flex justify-between text-[10px] text-label">
        <span>6 hours</span>
        <span>2 days</span>
      </div>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-label">
        {hours * HOUR_MS === WINDOW_MS
          ? `${found === 0 ? "Nothing on" : `${found} event${found === 1 ? "" : "s"}`} in the next 6 hours. ` +
            "Drag to look further ahead."
          : found === 0
            ? `Still nothing within ${windowLabel(hours * HOUR_MS)}.`
            : `${found} event${found === 1 ? "" : "s"} within ${windowLabel(hours * HOUR_MS)}.`}
      </p>
    </div>
  );
}
