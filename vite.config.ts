import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

const root = path.resolve(__dirname, "src/renderer");

export default defineConfig({
  root,
  build: {
    outDir: path.resolve(__dirname, "dist"),
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
