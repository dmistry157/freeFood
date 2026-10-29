import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { BASE_PATH, SITE_ORIGIN, SITE_URL } from "@/lib/site";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const TITLE = "Berkeley Free Food";
const DESCRIPTION = "A map of free food around Berkeley.";

export const metadata: Metadata = {
  // Everything below may use a path; Next resolves it against this.
  metadataBase: new URL(SITE_ORIGIN),
  title: TITLE,
  applicationName: "Berkeley Free Food",
  description: DESCRIPTION,
  keywords: [
    "free food Berkeley", "UC Berkeley free food", "Cal free food", "free food map",
    "Berkeley campus events", "free pizza Berkeley", "student food Berkeley", "Berkeley events today",
  ],
  authors: [{ name: "Mohul Shukla" }, { name: "Dhilen Mistry" }],
  creator: "Mohul Shukla and Dhilen Mistry",
  category: "food",
  alternates: { canonical: SITE_URL },

  openGraph: {
    type: "website",
    siteName: "Berkeley Free Food",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [{
      url: `${BASE_PATH}/share-card.png`,
      width: 1200,
      height: 630,
      alt: "A cheering bear holding a slice of free pizza, above the words FREE FOOD",
      type: "image/png",
    }],
    // Facebook, Discord and Slack play this inline. iMessage, WhatsApp, LinkedIn and
    // Instagram ignore og:video entirely and show the image above, and X needs an
    // allowlisted twitter:player card — so the image is what most people will see.
    // Spelled out absolutely: Next resolves og:image against metadataBase but leaves
    // og:video as written, and a relative og:video is ignored by every crawler.
    videos: [{
      url: `${SITE_URL}/share-card.mp4`,
      secureUrl: `${SITE_URL}/share-card.mp4`,
      type: "video/mp4",
      width: 1200,
      height: 630,
    }],
  },

  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${BASE_PATH}/share-card.png`],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large", // let Google show the share card, not a thumbnail
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  // The basemap credit OpenStreetMap's licence asks for. It is here rather than
  // on the page because the footer is for the people using the site; the page
  // also carries it as screen-reader text.
  other: {
    attribution: "Map data © OpenStreetMap contributors · tiles by OpenFreeMap",
  },

  // Installable: "Add to Home Screen" opens it full screen, like an app.
  manifest: `${BASE_PATH}/manifest.json`,
  icons: { apple: `${BASE_PATH}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Free Food", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#00264c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Lets the page read the iPhone's safe areas, so the bottom bar can clear the home bar.
  viewportFit: "cover",
};

// Structured data, so search engines can describe the site rather than guess at it.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Berkeley Free Food",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  image: `${SITE_ORIGIN}${BASE_PATH}/share-card.png`,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  about: { "@type": "CollegeOrUniversity", name: "University of California, Berkeley" },
  areaServed: { "@type": "Place", name: "Berkeley, California" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <head>
        <script
          type="application/ld+json"
          // Static, author-written object; nothing here comes from user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>
        {children}
        {/* Vercel Web Analytics: page views only, cookieless, no personal data.
            Only on the Vercel deployment; GitHub Pages has no analytics endpoint. */}
        {process.env.NEXT_PUBLIC_VERCEL_ENV && <Analytics />}
      </body>
    </html>
  );
}
