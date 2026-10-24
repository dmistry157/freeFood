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
    <article className="flex w-full flex-col border border-navy bg-paper shadow-[0_10px_30px_rgb(0_21_43/0.22)]">
      {/* Gold rule when live, navy when it starts soon — matches the pin. */}
      <span aria-hidden className={`h-1.5 w-full ${live ? "bg-gold" : "bg-navy"}`} />

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <p className={`eyebrow ${live ? "text-gold-ink" : "text-muted"}`}>
              {statusText(e, now)}
            </p>
            <h2 className="text-lg font-semibold leading-tight tracking-[-0.3px] text-navy-deep md:text-xl">
              {e.title}
            </h2>
            {likely && (
              <p className="eyebrow self-start border border-rule bg-paper-2 px-2 py-1 text-[10px] text-ink-soft">
                Food likely · not confirmed
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event details"
              className="-mr-2 -mt-2 grid size-9 shrink-0 place-items-center text-base text-muted transition-colors hover:bg-paper-2 hover:text-navy"
            >
              ✕
            </button>
          )}
        </div>

        <dl className="flex flex-col gap-2.5 border-t border-rule-soft pt-3.5">
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
            className="eyebrow grid h-11 place-items-center border border-navy bg-navy text-gold transition-colors hover:bg-navy-mid"
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
      <dt className="w-[70px] shrink-0 pt-0.5 text-[11.5px] font-semibold uppercase tracking-[0.4px] text-label">
        {label}
      </dt>
      <dd className={`flex-1 text-[15px] leading-snug text-ink ${strong ? "font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
