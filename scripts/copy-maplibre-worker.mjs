// maplibre-gl's worker script imports a sibling "./maplibre-gl-shared.mjs" via
// a hardcoded relative path baked into the pre-built file. Vite's normal
// asset pipeline hashes filenames, which breaks that relative import — so
// instead we copy both files verbatim (unhashed) into the renderer's public/
// dir, where Vite serves/copies them unchanged and they stay siblings.
// Re-run automatically (see package.json pre-scripts) so this never drifts
// from whatever maplibre-gl version is actually installed.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../node_modules/maplibre-gl/dist");
const dest = resolve(here, "../src/renderer/public");

mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(resolve(src, file), resolve(dest, file));
}
