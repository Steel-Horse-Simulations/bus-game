import init, { Router } from "./wasm/game_wasm.js";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import basemapStyle from "./basemap-style.json";
import { drawStops } from "./stops-layer";
import { registerMapIcons } from "./map-icons";
import { registerSupportVehicleIcons } from "./support-vehicle-icons";
import { mountDepotGroupsPanel } from "./depot-groups-panel";
import { mountRoutePanel } from "./route-panel";
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

const map = new maplibregl.Map({
  container: "map",
  style: basemapStyle as maplibregl.StyleSpecification,
  // Roughly central Scotland — no game-specific "home" location yet.
  center: [-4.25, 55.86],
  zoom: 6,
});

map.addControl(
  new maplibregl.AttributionControl({
    customAttribution: "© OpenMapTiles © OpenStreetMap contributors",
  }),
);
registerMapIcons(map);
mountDepotGroupsPanel();
(window as unknown as { __map: maplibregl.Map }).__map = map;

init().then(async () => {
  await registerSupportVehicleIcons(map);
  await drawStops(map);
  const router = await loadRouter();
  (window as unknown as { __router: Router }).__router = router;
  await mountRoutePanel(map, router);
});
