// Where this build is served from, and where it points people. The site ships to two
// places: Vercel, which answers on calfreefood.com, uberkfree.com and
// berkeley-free-food.vercel.app, and GitHub Pages under dhilen.com/freefood.
//
// That is several addresses for one site, so the two ideas are kept apart. SITE_* is the
// host actually serving this build, which relative asset paths resolve against.
// CANONICAL_URL is the single address every build points search engines and share cards
// at, which is what stops the deployments competing with each other as duplicates.

/** Sub-path the site is served under ("" on Vercel, "/freefood" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Scheme + host of the deployment being built, no trailing slash. */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (BASE_PATH ? "https://dhilen.com" : "https://calfreefood.com")
).replace(/\/$/, "");

/** This build's own address, origin and sub-path together. */
export const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}`;

/** The one address every build claims as canonical and serves its share card from. */
export const CANONICAL_URL = (
  process.env.NEXT_PUBLIC_CANONICAL_URL ?? "https://calfreefood.com"
).replace(/\/$/, "");
