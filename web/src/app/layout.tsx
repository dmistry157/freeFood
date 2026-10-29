import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Sub-path on GitHub Pages (/freefood). Next doesn't add it to metadata URLs, so add it here.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Berkeley Free Food",
  applicationName: "Berkeley Free Food",
  description:
    "A live map of free food on the UC Berkeley campus. Gold means it is happening now, navy means it starts within six hours.",
  // The basemap credit OpenStreetMap's licence asks for. It is here rather than
  // on the page because the footer is for the people using the site; the page
  // also carries it as screen-reader text.
  other: {
    attribution: "Map data © OpenStreetMap contributors · tiles by OpenFreeMap",
  },
  // Installable: "Add to Home Screen" opens it full screen, like an app.
  manifest: `${BASE}/manifest.json`,
  icons: { apple: `${BASE}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Free Food", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#00264c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        {children}
        {/* Vercel Web Analytics: page views only, cookieless, no personal data.
            Only on the Vercel deployment; GitHub Pages has no analytics endpoint. */}
        {process.env.NEXT_PUBLIC_VERCEL_ENV && <Analytics />}
      </body>
    </html>
  );
}
