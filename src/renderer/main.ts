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
import { loadRouter } from "./router";

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

// The real extracted road graph spans lon -8.58 to -0.74, lat 54.63 to
// 60.83 (checked directly against the rebuilt road_graph.bin, not
// guessed) — padded only slightly (0.15°, not the original 0.3°) so
// panning to the edge doesn't feel like hitting a hard wall right at the
// last node, without leaving a large blank margin past where real data
// actually ends (reported directly: "I can go further south than the
// edge of the map" — the original 0.3° padding put the southern limit a
// good 15km past the southernmost real road data).
const PLAYABLE_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-8.73, 54.48], // southwest
  [-0.59, 60.98], // northeast
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
(window as unknown as { __map: maplibregl.Map }).__map = map;

init().then(async () => {
  const router = await loadRouter();
  (window as unknown as { __router: Router }).__router = router;
  await registerSupportVehicleIcons(map);
  // drawStops needs the router to kerb-snap a newly placed stop
  // (DESIGN.md §4 "Placement") — loaded first so it's ready in time,
  // rather than the previous order where stops drew before any router
  // existed at all.
  await drawStops(map, router);
  await drawRailwayPlatforms(map);
  await mountRoutePanel(map, router);
  await mountVehicleSimulation(map, router);
});
