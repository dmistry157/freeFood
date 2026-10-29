"use client";

import {
  foodText,
  isLive,
  linkLabel,
  otherSources,
  statusText,
  webLink,
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
  /**
   * Horizontal position of the pointer along the card's bottom edge, in px.
   * Mirrors the arrow the iPhone app draws, so a floating card still reads as
   * belonging to the pin beneath it even when it has been clamped sideways.
   */
  tailLeft?: number;
};

/**
 * The event detail card, centred and narrow.
 *
 * An earlier version laid the details out as a label column beside a value
 * column, which set the card's width from the longest label rather than from the
 * content. Dropping the labels and centring everything takes roughly 70px off,
 * and the order carries the meaning well enough on its own: when, where, how far,
 * what food, who can come.
 */
export function EventCard({ event: e, now, distanceFt, onClose, compact, tailLeft }: Props) {
  const live = isLive(e, now);
  const likely = e.food_status === "likely";
  const entry = e.requirements || e.open_to || "Open to all";
  const food = foodText(e);
  const link = webLink(e);
  const others = otherSources(e);

  return (
    <article className="relative flex w-full flex-col border border-navy bg-paper text-center shadow-[0_8px_24px_rgb(0_21_43/0.2)]">
      {/* Gold rule when live, navy when it starts soon — matches the pin. */}
      <span aria-hidden className={`h-1 w-full ${live ? "bg-gold" : "bg-navy"}`} />

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close event details"
          className="absolute right-1 top-2 grid size-7 place-items-center text-sm text-muted transition-colors hover:bg-paper-2 hover:text-navy"
        >
          ✕
        </button>
      )}

      <div className={`flex flex-col ${compact ? "gap-2 px-4 py-2.5" : "gap-2.5 px-4 py-3"}`}>
        <div className="flex flex-col items-center gap-1">
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
            <p className="eyebrow border border-rule bg-paper-2 px-1.5 py-0.5 text-[9.5px] text-ink-soft">
              Food likely · not confirmed
            </p>
          )}
        </div>

        <div
          className={`flex flex-col border-t border-rule-soft pt-2 ${compact ? "gap-0.5" : "gap-1"}`}
        >
          <p className="text-[13px] font-medium text-ink">{whenText(e)}</p>
          <p className="text-[13px] leading-snug text-muted">{whereText(e)}</p>
          {distanceFt != null && (
            <p className="text-[11.5px] text-label">
              {distanceText(distanceFt)} · {walkText(distanceFt)}
            </p>
          )}
          {food && (
            <p
              className={`text-[13px] leading-snug ${likely ? "text-ink" : "font-semibold text-ink"}`}
            >
              {food}
            </p>
          )}
          <p className="text-[11.5px] text-label">Entry · {entry}</p>
        </div>

        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={`eyebrow grid place-items-center border border-navy bg-navy text-[10.5px] text-gold transition-colors hover:bg-navy-mid ${
              compact ? "h-8" : "h-9"
            }`}
          >
            {linkLabel(e)} ↗
          </a>
        )}

        {others.length > 0 && (
          <p className="-mt-1 text-[11px] leading-snug text-label">
            Also posted:{" "}
            {others.map((o, i) => (
              <span key={o.url}>
                {i > 0 && " · "}
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-soft underline underline-offset-2 hover:text-navy"
                >
                  {o.label}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>

      {tailLeft != null && (
        <span
          aria-hidden
          className="absolute size-3 rotate-45 border-b border-r border-navy bg-paper"
          style={{ left: tailLeft - 6, bottom: -7 }}
        />
      )}
    </article>
  );
}
