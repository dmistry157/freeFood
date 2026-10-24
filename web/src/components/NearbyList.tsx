"use client";

import { isLive, isPlaced, statusText, whereText, type FoodEvent } from "@/lib/events";
import { distanceText } from "@/lib/geo";

type Props = {
  events: FoodEvent[];
  now: Date;
  selectedId: number | null;
  distances: Map<number, number>;
  onSelect: (id: number) => void;
};

/**
 * Every event in the window, nearest first once the browser has shared a location
 * and by start time otherwise. Events the geocoder couldn't place sit at the end,
 * since they have no pin to click.
 */
export function NearbyList({ events, now, selectedId, distances, onSelect }: Props) {
  const placed = events.filter(isPlaced);
  const unplaced = events.filter((e) => !isPlaced(e));

  return (
    <div className="flex flex-col">
      {placed.map((e) => (
        <Item
          key={e.id}
          event={e}
          now={now}
          selected={e.id === selectedId}
          distanceFt={distances.get(e.id) ?? null}
          onSelect={onSelect}
        />
      ))}

      {unplaced.length > 0 && (
        <>
          <h3 className="eyebrow px-4 pb-2 pt-5 text-label">Not on the map</h3>
          {unplaced.map((e) => (
            <Item
              key={e.id}
              event={e}
              now={now}
              selected={e.id === selectedId}
              distanceFt={null}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Item({
  event: e,
  now,
  selected,
  distanceFt,
  onSelect,
}: {
  event: FoodEvent;
  now: Date;
  selected: boolean;
  distanceFt: number | null;
  onSelect: (id: number) => void;
}) {
  const live = isLive(e, now);
  return (
    <button
      type="button"
      onClick={() => onSelect(e.id)}
      aria-current={selected}
      className={`flex w-full items-start gap-3 border-b border-ink/5 px-4 py-3 text-left transition-colors last:border-0 ${
        selected ? "bg-tag" : "hover:bg-tag/60"
      }`}
    >
      <span
        aria-hidden
        className={`mt-1.5 size-2 shrink-0 rounded-full ${live ? "bg-live" : "bg-soon"}`}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`eyebrow ${live ? "text-live" : "text-muted"}`}>{statusText(e, now)}</span>
        <span className="truncate text-sm font-medium text-ink">{e.title}</span>
        <span className="truncate text-xs text-label">{whereText(e)}</span>
      </span>
      {distanceFt != null && (
        <span className="mt-0.5 shrink-0 font-mono text-[11px] text-label">
          {distanceText(distanceFt)}
        </span>
      )}
    </button>
  );
}
