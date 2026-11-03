"use client";

import { useState, useSyncExternalStore } from "react";

// "Install", iPhone and iPad only: Safari has no install prompt, so it shows the
// Share → Add to Home Screen steps. Hidden everywhere else, and once it runs as an installed app.
// On desktop-width screens it's a header button; on a phone it's a row in HeaderMenu.

const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;
const ios = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)); // iPad in desktop mode

function watchStandalone(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Whether to offer Install. The static HTML says no (server snapshot), so it never flashes on other devices. */
export function useCanInstall() {
  return useSyncExternalStore(watchStandalone, () => ios() && !installed(), () => false);
}

export function InstallButton({ className = "" }: { className?: string }) {
  const show = useCanInstall();
  const [help, setHelp] = useState(false);

  if (!show) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setHelp((h) => !h)}
        aria-expanded={help}
        className={`border border-gold bg-gold font-semibold text-navy-deep transition-colors hover:bg-gold/90 ${className}`}
      >
        Install
      </button>

      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

/** The Add to Home Screen steps, dropped under the header's right edge. */
export function InstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Add to your Home Screen"
      className="absolute right-3 top-full z-30 mt-2 w-[min(320px,calc(100vw-24px))] border border-navy bg-paper p-4 text-left shadow-[0_8px_24px_rgb(0_21_43/0.25)] md:right-7"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gold" />
      <p className="text-[15px] font-semibold text-navy-deep">Add it to your Home Screen</p>
      <ol className="mt-2 flex flex-col gap-1 text-[13px] leading-snug text-ink-soft">
        <li>1. In Safari, tap the Share button (or ••• then Share).</li>
        <li>2. Choose Add to Home Screen, then Add.</li>
      </ol>
      <p className="mt-2 text-[11.5px] leading-snug text-label">
        It opens full screen like an app and always shows the latest events.
      </p>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="eyebrow px-2 py-1.5 text-[10.5px] text-navy hover:bg-paper-2"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
