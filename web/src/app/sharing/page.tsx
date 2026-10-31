import type { Metadata } from "next";
import Link from "next/link";

// calfreefood.com/sharing: what contributors see before Google's permission screens.
// The Apps Script web app (apps-script/) that the button opens. A new deployment
// changes this URL; "Manage deployments → New version" keeps it.
const SHARING_APP_URL =
  "https://script.google.com/a/macros/berkeley.edu/s/AKfycbxkc0i2kf3PxRk-37t_aaauYPSPH-UiXQy5w2FSjOAd1AJmDlZg-fLBGrQyUpATGZLUFQ/exec";
const SCRIPT_SOURCE_URL = "https://github.com/dmistry157/freeFood/blob/main/apps-script/Code.gs";

export const metadata: Metadata = {
  title: "Share your lists · Berkeley Free Food",
  description: "Share your department's mailing lists with the Berkeley Free Food map.",
  robots: { index: false, follow: false },
};

type Mark = "yes" | "no" | "stop";

const PROMISES: { mark: Mark; text: string }[] = [
  { mark: "yes", text: "The map only ever receives emails from the lists you tick, nothing else in your inbox." },
  { mark: "yes", text: "Read-only. It never sends, changes or deletes your email." },
  { mark: "no", text: "Never your personal email or name on the map." },
  { mark: "stop", text: "Stop any time with one button." },
];

const STEPS = [
  "Sign in with your berkeley.edu account (CalNet).",
  "Google asks you to review permissions: press Review permissions, then Allow.",
  "Tick your lists and press Submit.",
];

function MarkIcon({ mark }: { mark: Mark }) {
  const common = { width: 20, height: 20, viewBox: "0 0 20 20", "aria-hidden": true, className: "mt-0.5 shrink-0" };
  if (mark === "yes") {
    return (
      <svg {...common} fill="none" stroke="#1e7a3c" strokeWidth="2">
        <circle cx="10" cy="10" r="8.25" />
        <path d="M6.2 10.3l2.5 2.5 5.1-5.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (mark === "no") {
    return (
      <svg {...common} fill="none" stroke="#b42318" strokeWidth="2">
        <circle cx="10" cy="10" r="8.25" />
        <path d="M7 7l6 6M13 7l-6 6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="3.5" width="13" height="13" />
    </svg>
  );
}

export default function SharingPage() {
  return (
    <main className="min-h-dvh bg-paper-2">
      <header className="flex items-center justify-between bg-navy px-4 py-3 md:px-7 md:py-3.5">
        <Link href="/" className="text-xl font-semibold tracking-[-0.2px] md:text-2xl">
          <span className="text-gold">Berkeley</span>
          <span className="text-white"> Free Food</span>
        </Link>
        <Link
          href="/"
          aria-label="Back to the map"
          className="grid size-9 place-items-center text-2xl leading-none text-white/85 transition-colors hover:text-white"
        >
          ×
        </Link>
      </header>

      <div className="mx-auto max-w-xl px-4 py-6 md:py-10">
        <section className="border border-rule bg-paper px-5 py-6 md:px-7">
          <h1 className="text-[26px] font-semibold tracking-[-0.3px] text-navy">Share your lists</h1>
          <p className="mt-1 text-[15px] text-muted">
            One-time setup in your bmail, so your department&apos;s free food shows up on the map.
          </p>

          <ul className="mt-5 space-y-3 text-[15.5px] leading-snug text-ink">
            {PROMISES.map(({ mark, text }) => (
              <li key={text} className="flex gap-3">
                <MarkIcon mark={mark} />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <h2 className="eyebrow mt-7 text-navy">How it works</h2>
          <ol className="mt-2 space-y-1.5 text-[15px] text-ink-soft">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="tabular w-4 shrink-0 font-semibold text-navy">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <a
            href={SHARING_APP_URL}
            className="mt-6 flex h-12 items-center justify-center bg-gold text-[16px] font-semibold text-navy transition-colors hover:bg-gold-deep"
          >
            Continue with CalNet
          </a>
          <p className="mt-3 text-center text-[13px] text-muted">
            Google will show its standard &ldquo;review permissions&rdquo; screen next. That&apos;s expected.
          </p>
          <p className="mt-4 text-center">
            <a
              href={SCRIPT_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] font-medium text-navy-mid underline underline-offset-2 hover:text-navy"
            >
              See exactly what the script does
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
