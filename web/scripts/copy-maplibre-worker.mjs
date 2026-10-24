// MapLibre loads its tile-parsing worker as a separate module script. Turbopack
// doesn't emit it, so the bundle asks for a URL the dev server answers with HTML
// and the map never starts. Copy the worker that ships with the installed version
// into public/ instead of pulling it from a CDN, so it can never drift out of sync.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const name = "maplibre-gl-worker.mjs";
const out = join(import.meta.dirname, "..", "public");

await mkdir(out, { recursive: true });
await copyFile(join(dist, name), join(out, name));
console.log(`copied ${name} -> public/`);
