/**
 * Gate for controls that exist for development only.
 *
 * The look-ahead slider queries a wider window than the app is meant to show,
 * so it must never reach the Vercel deploy or GitHub Pages. Checking the
 * hostname rather than NODE_ENV means a production build served from a laptop
 * still gets it, and a dev build that somehow ships does not.
 */
export function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}
