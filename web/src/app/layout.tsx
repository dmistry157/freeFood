import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
        {/* Vercel Web Analytics: page views only, cookieless, no personal data. */}
        <Analytics />
      </body>
    </html>
  );
}
