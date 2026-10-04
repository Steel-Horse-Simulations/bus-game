import init, { Router } from "./wasm/game_wasm.js";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import basemapStyle from "./basemap-style.json";
import { drawStops } from "./stops-layer";
import { drawRailwayPlatforms } from "./railway-stations-layer";
import { registerMapIcons } from "./map-icons";
import { registerSupportVehicleIcons } from "./support-vehicle-icons";
import { mountDepotGroupsPanel } from "./depot-groups-panel";
import { mountRoutePanel } from "./route-panel";
import { mountVehicleSimulation } from "./vehicle-simulation";
import { mountVehicleCataloguePanel } from "./vehicle-catalogue-panel";
import { mountLiveryPanel } from "./livery-panel";
import { mountDepotPlacement } from "./depot-placement";
import { mountDealerPlacement } from "./dealer-placement";
import { mountDealerReferencePins, seedRealDealers } from "./dealer-reference-pins";
import { loadRouter } from "./router";
import { setLoadingProgress } from "./loading-progress";

// MapLibre auto-detects its worker script from import.meta.url, which only
// resolves for http(s) origins — under file:// (Electron's loadFile default)
// it silently returns an empty URL, the worker never starts, and tiles never
// load with no visible error. Setting it explicitly, page-relative, sidesteps
// that detection entirely. The worker file (and its sibling maplibre-gl-shared.mjs,
// which it imports via a hardcoded relative path) are copied unhashed into
// public/ by scripts/copy-maplibre-worker.mjs — see that file for why.
maplibregl.setWorkerUrl(new URL("maplibre-gl-worker.mjs", window.location.href).href);

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// Whole-UK+Ireland+Isle-of-Man road graph (UK-EXPANSION.md), swapped back
// in 2026-10-03 after the CSR-flattening fix (OPEN-ITEMS.md T55-map-
// boundary): the original swap froze on startup because Router::new() took
// ~220 seconds against this graph's 11.5M edges (decode ~85s, adjacency
// build ~109s, edge_grid build ~25s) — a WASM-allocator performance bug
// from millions of small per-node/per-edge heap allocations, not corrupted
// data or an infinite loop. Flattening both Edge.geometry and
// Router.adjacency into CSR-style flat buffers (one shared Vec plus an
// offset index, instead of one Vec per edge/node) fixed it; real figures
// checked directly against the rebuilt road_graph.bin below, not guessed.
// Real extent: lon -10.5593 to 1.7622, lat 49.8886 to 60.8350 — padded
// 0.15° same as the Scotland-only figure this replaces, for the same
// "don't hit a hard wall right at the last node" reason.
const PLAYABLE_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-10.71, 49.74], // southwest
  [1.91, 60.99], // northeast
];

const map = new maplibregl.Map({
  container: "map",
  style: basemapStyle as maplibregl.StyleSpecification,
  // Roughly central Scotland — no game-specific "home" location yet.
  center: [-4.25, 55.86],
  zoom: 6,
  minZoom: 5,
  maxBounds: PLAYABLE_BOUNDS,
});

map.addControl(
  new maplibregl.AttributionControl({
    customAttribution: "© OpenMapTiles © OpenStreetMap contributors",
  }),
);
registerMapIcons(map);
mountDepotGroupsPanel();
mountVehicleCataloguePanel();
mountLiveryPanel();
(window as unknown as { __map: maplibregl.Map }).__map = map;

// The style (fetched from the local pmtiles/tile server, see
// startMapDataServer in electron/main.ts) is not guaranteed loaded by the
// time init() and loadRouter() resolve — on a cold launch it usually isn't
// yet, while on a reload it usually already is, which is why this bug
// (OPEN-ITEMS.md T55-map-boundary) only ever showed up on a genuine fresh
// start. Every draw/mount step below calls map.addSource/addLayer, which
// throws "Style is not done loading" if called too early; with no catch
// anywhere in this chain, that throw silently killed the rest of boot with
// the loading overlay stuck up forever. Waiting for "load" once, up front,
// guarantees every step after it can call addSource/addLayer safely.
async function waitForStyleLoad(m: maplibregl.Map): Promise<void> {
  if (m.isStyleLoaded()) return;
  await new Promise<void>((resolve) => m.once("load", () => resolve()));
}

init().then(async () => {
  setLoadingProgress(0.02, "Loading map style…");
  await waitForStyleLoad(map);
  setLoadingProgress(0.05, "Loading road network…");
  const router = await loadRouter((f) =>
    setLoadingProgress(0.05 + f * 0.8, `Loading road network… ${Math.round(f * 100)}%`),
  );
  (window as unknown as { __router: Router }).__router = router;
  setLoadingProgress(0.86, "Drawing stops…");
  await registerSupportVehicleIcons(map);
  // drawStops needs the router to kerb-snap a newly placed stop
  // (DESIGN.md §4 "Placement") — loaded first so it's ready in time,
  // rather than the previous order where stops drew before any router
  // existed at all.
  await drawStops(map, router);
  setLoadingProgress(0.88, "Drawing railway platforms…");
  await drawRailwayPlatforms(map);
  setLoadingProgress(0.9, "Loading routes…");
  await mountRoutePanel(map, router);
  setLoadingProgress(0.93, "Loading vehicles…");
  await mountVehicleSimulation(map, router);
  setLoadingProgress(0.95, "Loading depots…");
  await mountDepotPlacement(map, router);
  // Seeded before dealer-placement.ts loads its own initial dealers list,
  // so every real dealer shows up immediately rather than only after a
  // reload.
  setLoadingProgress(0.97, "Loading dealers…");
  await seedRealDealers();
  await mountDealerPlacement(map, router);
  await mountDealerReferencePins(map);
  setLoadingProgress(1, "Ready");
  document.getElementById("loading-overlay")?.remove();
});
