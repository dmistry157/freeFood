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
  /** Tighter again, for the sheet along the bottom of a phone. */
  compact?: boolean;
};

/**
 * The event detail card. Deliberately small: it floats over the map beside its
 * own pin, so every extra row of padding is map you cannot see.
 */
export function EventCard({ event: e, now, distanceFt, onClose, compact }: Props) {
  const live = isLive(e, now);
  const likely = e.food_status === "likely";

  return (
    <article className="flex w-full flex-col border border-navy bg-paper shadow-[0_8px_24px_rgb(0_21_43/0.2)]">
      {/* Gold rule when live, navy when it starts soon — matches the pin. */}
      <span aria-hidden className={`h-1 w-full ${live ? "bg-gold" : "bg-navy"}`} />

      <div className={`flex flex-col ${compact ? "gap-2 px-3 py-2.5" : "gap-2.5 px-3.5 py-3"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <p className={`eyebrow text-[10.5px] ${live ? "text-gold-ink" : "text-muted"}`}>
              {statusText(e, now)}
            </p>
            <h2
              className={`font-semibold leading-tight tracking-[-0.2px] text-navy-deep ${
                compact ? "text-[15px]" : "text-base"
              }`}
            >
              {e.title}
            </h2>
            {likely && (
              <p className="eyebrow self-start border border-rule bg-paper-2 px-1.5 py-0.5 text-[9.5px] text-ink-soft">
                Food likely · not confirmed
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event details"
              className="-mr-1.5 -mt-1 grid size-7 shrink-0 place-items-center text-sm text-muted transition-colors hover:bg-paper-2 hover:text-navy"
            >
              ✕
            </button>
          )}
        </div>

        <dl className={`flex flex-col border-t border-rule-soft pt-2 ${compact ? "gap-1" : "gap-1.5"}`}>
          <Row label="When" value={whenText(e)} />
          <Row label="Where" value={whereText(e)} />
          {distanceFt != null && (
            <Row label="Distance" value={`${distanceText(distanceFt)} · ${walkText(distanceFt)}`} />
          )}
          <Row label="Food" value={foodText(e)} strong={!likely} />
          <Row label="Entry" value={e.requirements || e.open_to || "Open to all"} />
        </dl>

        {e.link && (
          <a
            href={e.link}
            target="_blank"
            rel="noopener noreferrer"
            className={`eyebrow grid place-items-center border border-navy bg-navy text-[10.5px] text-gold transition-colors hover:bg-navy-mid ${
              compact ? "h-8" : "h-9"
            }`}
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
    <div className="flex gap-2.5">
      <dt className="w-[52px] shrink-0 pt-px text-[10px] font-semibold uppercase tracking-[0.4px] text-label">
        {label}
      </dt>
      <dd className={`flex-1 text-[13px] leading-snug text-ink ${strong ? "font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
