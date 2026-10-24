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
    <article className="flex w-full flex-col gap-3.5 overflow-hidden rounded-2xl bg-card shadow-card">
      {/* Gold rule when live, navy when it starts soon — matches the pin. */}
      <span aria-hidden className={`h-1 w-full ${live ? "bg-cal-gold" : "bg-cal-blue"}`} />

      <div className="flex flex-col gap-3.5 px-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <p className={`eyebrow ${live ? "text-live" : "text-muted"}`}>{statusText(e, now)}</p>
            <h2 className="text-lg font-semibold leading-snug tracking-[-0.2px] text-ink md:text-xl">
              {e.title}
            </h2>
            {likely && (
              <p className="eyebrow self-start rounded-md bg-tag px-2 py-1 text-[11px] text-ink-soft">
                Food likely · not confirmed
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event details"
              className="-mr-1.5 -mt-1 grid size-10 place-items-center rounded-full text-lg text-muted transition-colors hover:bg-tag"
            >
              ✕
            </button>
          )}
        </div>

        <dl className="flex flex-col gap-2.5">
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
            className="grid h-12 place-items-center rounded-xl bg-cal-blue-dark text-[15px] font-semibold text-white transition-colors hover:bg-cal-blue"
          >
            {linkLabel(e)} ↗
          </a>
        )}
      </div>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[74px] shrink-0 pt-px text-[13px] text-label">{label}</dt>
      <dd className={`flex-1 text-[15px] leading-snug text-ink ${strong ? "font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
