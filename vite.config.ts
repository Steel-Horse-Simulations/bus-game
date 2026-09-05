import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

const root = path.resolve(__dirname, "src/renderer");

export default defineConfig({
  root,
  build: {
    outDir: path.resolve(__dirname, "dist"),
  },
  // maplibre-gl constructs its own Web Worker internally (maplibre-gl-worker),
  // which Vite's esbuild-based dep pre-bundler mishandles — dev mode logs
  // "file does not exist ... maplibre-gl-worker.mjs" and tiles silently never
  // load (the worker never starts, so no tile fetch/parse ever happens).
  // Documented Vite/MapLibre workaround: exclude it from pre-bundling.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  plugins: [
    electron({
      main: {
        entry: path.resolve(__dirname, "electron/main.ts"),
        onstart(args) {
          args.startup([__dirname, "--no-sandbox"]);
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, "dist-electron"),
          },
        },
      },
      preload: {
        input: path.resolve(__dirname, "electron/preload.ts"),
        // Default onstart relaunches with a bare relative path, which resolves
        // against the Vite root (src/renderer), not the project root where
        // package.json lives. Only reload an already-running app; the main
        // entry's onstart above owns the initial (and any cold) startup, so
        // skip entirely if nothing has started the app yet.
        onstart(args) {
          if ((process as unknown as { electronApp?: unknown }).electronApp) {
            args.reload();
          }
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, "dist-electron"),
          },
        },
      },
    }),
  ],
});
