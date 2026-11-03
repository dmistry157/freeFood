"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { InstallHelp, useCanInstall } from "@/components/InstallButton";

// Phone only: the ☰ in the header's top-right corner. It drops a short panel over the
// top of the map with Share (and Install on an iPhone that hasn't installed the site).
// Swipe the panel up, tap ✕, or tap the map to put it away.

/** How far up (px) a swipe has to go before the panel closes rather than snapping back. */
const CLOSE_PX = 40;

export function HeaderMenu({ className = "" }: { className?: string }) {
  const canInstall = useCanInstall();
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const startY = useRef<number | null>(null);

  const openMenu = () => {
    setHelp(false);
    setShown(true);
  };
  const close = () => {
    setShown(false);
    setDrag(0);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (shown ? close() : openMenu())}
        aria-expanded={shown}
        aria-label={shown ? "Close menu" : "Menu"}
        className={`grid size-8 place-items-center border transition-colors ${
          shown ? "border-gold text-gold" : "border-white/40 text-white active:bg-white/10"
        } ${className}`}
      >
        {shown ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* Always mounted: closed, it sits tucked up under the header (this clips it) and turns
          invisible once the slide ends, so its links can't be tapped or tabbed to. */}
      <div
        className={`absolute inset-x-0 top-full z-30 h-dvh overflow-hidden md:hidden ${
          shown ? "" : "pointer-events-none"
        }`}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={shown ? 0 : -1}
          onClick={close}
          className={`absolute inset-0 bg-navy-deep/25 transition-opacity duration-200 ${
            shown ? "opacity-100" : "opacity-0"
          }`}
        />
        <nav
          aria-label="Menu"
          onTouchStart={(e) => {
            startY.current = e.touches[0].clientY;
            setDragging(true);
          }}
          onTouchMove={(e) => {
            if (startY.current == null) return;
            setDrag(Math.min(0, e.touches[0].clientY - startY.current));
          }}
          onTouchEnd={() => {
            startY.current = null;
            setDragging(false);
            if (drag < -CLOSE_PX) close();
            else setDrag(0);
          }}
          style={{ transform: shown ? `translateY(${drag}px)` : "translateY(-100%)" }}
          className={`relative touch-none border-b border-navy bg-paper shadow-[0_8px_24px_rgb(0_21_43/0.2)] ${
            shown ? "visible" : "invisible"
          } ${dragging ? "" : "transition-[transform,visibility] duration-200 ease-out"}`}
        >
          <MenuRow href="/sharing" icon={<MailIcon />} title="Share" note="Add your department's email lists" />
          {canInstall && (
            <MenuRow
              icon={<PhoneIcon />}
              title="Install"
              note="Add to your Home Screen"
              onClick={() => {
                close();
                setHelp(true);
              }}
            />
          )}
          <span aria-hidden className="mx-auto my-2 block h-1.5 w-12 rounded-full bg-rule" />
        </nav>
      </div>

      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

function MenuRow({
  href,
  onClick,
  icon,
  title,
  note,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  const body = (
    <>
      <span aria-hidden className="text-navy">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        <span className="text-[12px] text-muted">{note}</span>
      </span>
      <span aria-hidden className="ml-auto text-label">
        ›
      </span>
    </>
  );
  const cls =
    "flex w-full items-center gap-3 border-b border-rule-soft px-4 py-3 text-left transition-colors active:bg-paper-2";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

const svg = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const MenuIcon = () => (
  <svg {...svg}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const CloseIcon = () => (
  <svg {...svg}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const MailIcon = () => (
  <svg {...svg}>
    <rect x="3" y="5" width="18" height="14" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
const PhoneIcon = () => (
  <svg {...svg}>
    <rect x="7" y="3" width="10" height="18" rx="1.5" />
    <path d="M11 17h2" />
  </svg>
);
