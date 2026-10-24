import path from "node:path";
import type { NextConfig } from "next";

// Static export so the site can be served from GitHub Pages for free, like the
// Expo web build already is. All event data is fetched in the browser (pin colour
// depends on the current time), so there is nothing to render on a server.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  turbopack: {
    // Pin the workspace root; otherwise Turbopack walks up and finds an unrelated lockfile.
    root: path.resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
