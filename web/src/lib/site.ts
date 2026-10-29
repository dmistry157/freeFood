// Where this build will be served from. The site ships to two places: Vercel, which
// answers on both uberkfree.com and berkeley-free-food.vercel.app, and GitHub Pages
// under dhilen.com/freefood. Share-card and canonical URLs have to be absolute, so
// both halves are needed at build time.
//
// The Vercel default is uberkfree.com rather than the vercel.app address, so that the
// one build those two hostnames share points search engines and share cards at the
// real domain.

/** Sub-path the site is served under ("" on Vercel, "/freefood" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Scheme + host, no trailing slash. Set NEXT_PUBLIC_SITE_URL to override. */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (BASE_PATH ? "https://dhilen.com" : "https://uberkfree.com")
).replace(/\/$/, "");

/** The page's own canonical address, origin and sub-path together. */
export const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}`;
