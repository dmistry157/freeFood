"use client";

import {
  foodText,
  isLive,
  linkLabel,
  statusText,
  whenText,
  whereText,
  type FoodEvent,
} from "@/lib/events";
import { distanceText, walkText } from "@/lib/geo";

type Props = {
  event: FoodEvent;
  now: Date;
  distanceFt?: number | null;
  onClose?: () => void;
};

/** The event detail card: status, title, When / Where / Food / To get in, link button. */
export function EventCard({ event: e, now, distanceFt, onClose }: Props) {
  const live = isLive(e, now);
  const likely = e.food_status === "likely";

  return (
    <article className="flex w-full flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <p className={`eyebrow flex items-center gap-1.5 ${live ? "text-live" : "text-muted"}`}>
            <span
              aria-hidden
              className={`size-2 rounded-full ${live ? "bg-live" : "bg-muted"}`}
            />
            {statusText(e, now)}
          </p>
          <h2 className="text-[17px] font-semibold leading-tight tracking-[-0.17px] text-ink">
            {e.title}
          </h2>
          {likely && (
            <p className="eyebrow self-start rounded-md bg-tag px-[7px] py-[3px] text-[10px] text-ink-soft">
              Food likely · not confirmed
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event details"
            className="-mr-2 -mt-2 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-tag"
          >
            ✕
          </button>
        )}
      </div>

      <dl className="flex flex-col gap-2">
        <Row label="When" value={whenText(e)} />
        <Row label="Where" value={whereText(e)} />
        {distanceFt != null && (
          <Row label="Distance" value={`${distanceText(distanceFt)} · ${walkText(distanceFt)}`} />
        )}
        <Row label="Food" value={foodText(e)} strong={!likely} />
        <Row label="To get in" value={e.requirements || e.open_to || "Open to all"} />
      </dl>

      {e.link && (
        <a
          href={e.link}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-11 place-items-center rounded-xl bg-ink text-sm font-semibold text-card transition-opacity hover:opacity-85"
        >
          {linkLabel(e)} ↗
        </a>
      )}
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-2.5">
      <dt className="w-[68px] shrink-0 pt-px text-xs text-label">{label}</dt>
      <dd className={`flex-1 text-sm leading-tight text-ink ${strong ? "font-medium" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
