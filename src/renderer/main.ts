import init, { Router } from "./wasm/game_wasm.js";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import basemapStyle from "./basemap-style.json";
import { drawStops } from "./stops-layer";
import { repairRouteOrientations } from "./route-orientation-repair";
import { drawRailwayPlatforms } from "./railway-stations-layer";
import { registerMapIcons } from "./map-icons";
import { registerSupportVehicleIcons } from "./support-vehicle-icons";
import { mountDepotGroupsPanel } from "./depot-groups-panel";
import { mountRoutePanel } from "./route-panel";
import { mountVehicleSimulation } from "./vehicle-simulation";
import { mountVehicleBuyMenu } from "./vehicle-buy-menu";
import { seedRealLiveries } from "./livery-seed-data.mts";
import { loadScotlandBoundary } from "./scotland-boundary.mts";
import { loadWalesBoundary } from "./wales-boundary.mts";
import { mountLiveryPanel } from "./livery-panel";
import { mountRepaintShops, seedRealRepaintShops } from "./repaint-shop-panel";
import { mountRepowerBookingPanel } from "./repower-booking-panel";
import { mountFleetListPanel } from "./fleet-list-panel";
import { mountDeadMileagePreview } from "./dead-mileage-preview";
import { mountDutyPanel } from "./duty-panel";
import { mountDepotPlacement } from "./depot-placement";
import { mountDealerPlacement } from "./dealer-placement";
import { mountDealerReferencePins, seedRealDealers } from "./dealer-reference-pins";
import { mountFareZones } from "./fare-zone-drawing";
import { mountFarePricingPanel } from "./fare-pricing-panel";
import { mountLongDistanceSectionsTool } from "./long-distance-sections-panel";
import { mountRouteStatisticsPanel } from "./route-statistics-panel";
import { mountContractsPanel } from "./contracts-panel";
import { mountFleetScreen } from "./fleet-screen";
import { mountFaresScreen } from "./fares-screen";
import { mountDepotsScreen } from "./depots-screen";
import { mountDutiesScreen } from "./duties-screen";
import { mountRoutesScreen } from "./routes-screen";
import { mountTimetablesScreen } from "./timetables-screen";
import { mountBottomBar, type BottomBarSection } from "./bottom-bar";
import { startGameClock } from "./game-clock-engine";
import { loadRouter } from "./router";
import { mountJourneyPlannerDebugEntryPoint, rebuildJourneyPlanner } from "./journey-planner";
import { mountFareJourneyDebugEntryPoint } from "./fare-journey-debug";
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
// MapLibre's own default Shift+drag box-zoom interaction was never
// disabled, and directly conflicted with every "hold Shift to bypass
// snapping" feature in the game (found live, 2026-11-01: "shift still
// does nothing, it still wont add a point" in fare-zone-drawing.ts) —
// MapLibre's BoxZoomHandler claims the mousedown as soon as Shift is
// held, before the game's own click handler ever sees it, so a plain
// Shift+click (no drag) silently did nothing at all. No feature in this
// game uses box-zoom itself, so it's disabled outright rather than
// trying to selectively re-enable/disable it per tool.
map.boxZoom.disable();
// A live user request: "I've also just found out I can rotate the map,
// can there be a button to snap the map to facing North again please" —
// MapLibre's own compass control does exactly this already (click resets
// bearing to 0), so no custom button needed. Zoom buttons omitted
// (showZoom: false) since scroll/pinch already covers zoom and the ask
// was specifically about rotation. top-right is already the Mon-Fri/Sat/
// Sun day-type bar's own corner (vehicle-simulation.ts, top:8px, ~42px
// tall) — same clash route-panel.ts already had to clear once for this
// exact corner, so the control container gets the same kind of offset.
const navControl = new maplibregl.NavigationControl({ showZoom: false, showCompass: true });
map.addControl(navControl, "top-right");
(navControl as unknown as { _container: HTMLElement })._container.style.marginTop = "56px";
registerMapIcons(map);
mountDepotGroupsPanel();
mountLiveryPanel();
mountRepowerBookingPanel();
mountFleetListPanel();

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

// A plain "not built yet" screen for a bottom-bar section with no real
// content of its own — Calendar and Finance, confirmed fine by the user
// (2026-11-08) rather than leaving the button doing nothing with no
// explanation at all.
function buildPlaceholderScreen(title: string, message: string): { open(): void; close(): void } {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "fixed";
  panel.style.top = "72px";
  panel.style.left = "50%";
  panel.style.transform = "translateX(-50%)";
  panel.style.zIndex = "1000";
  panel.style.width = "360px";
  panel.style.display = "none";
  panel.style.flexDirection = "column";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = title;
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "12px";
  body.className = "label-muted";
  body.textContent = message;
  panel.appendChild(body);

  return {
    open() {
      panel.style.display = "flex";
    },
    close() {
      panel.style.display = "none";
    },
  };
}

init().then(async () => {
  setLoadingProgress(0.01, "Starting the game clock…");
  await startGameClock();
  setLoadingProgress(0.02, "Loading map style…");
  await waitForStyleLoad(map);
  setLoadingProgress(0.05, "Loading road network…");
  // The onProgress callback only tracks the download fraction — once that
  // reaches 1, loadRouter still has to synchronously decode the whole graph
  // into the WASM Router (tens of seconds for the full UK+Ireland+IoM graph,
  // ~969MB), with no progress of its own to report. Showing "100%" through
  // that whole wait reads as a hang (real user report, 2026-11-14) — once
  // the download itself is done, switch to an honest "still working, no
  // further figure available" label rather than inventing a fake percentage.
  const router = await loadRouter((f) =>
    setLoadingProgress(0.05 + f * 0.8, f < 1 ? `Loading road network… ${Math.round(f * 100)}%` : "Processing road network…"),
  );
  (window as unknown as { __router: Router }).__router = router;
  // Debug entry point only this increment (OPEN-ITEMS.md) — no real caller
  // yet, so not on the loading screen's own critical path.
  mountJourneyPlannerDebugEntryPoint();
  void rebuildJourneyPlanner();
  // T175, same debug-only-until-a-real-caller-exists treatment.
  mountFareJourneyDebugEntryPoint(router);
  setLoadingProgress(0.86, "Drawing stops…");
  await registerSupportVehicleIcons(map);
  // drawStops needs the router to kerb-snap a newly placed stop
  // (DESIGN.md §4 "Placement") — loaded first so it's ready in time,
  // rather than the previous order where stops drew before any router
  // existed at all.
  await drawStops(map, router);
  // Needs busStationsState (just populated by drawStops) and every route's
  // own depot group — see route-orientation-repair.ts for why this can't be
  // a db.mts migration instead.
  await repairRouteOrientations();
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
  // Fetched once at boot (T190, 2026-11-14) — backs National Express
  // Scottish's own route-terminus restriction. Before seedRealLiveries()
  // below only by convenience of staying near its one real consumer;
  // no real ordering dependency between the two.
  await loadScotlandBoundary();
  // Same pattern, 2026-11-15 — backs National Express Welsh's own
  // route-terminus restriction, the exact Wales mirror of the line above.
  await loadWalesBoundary();
  // Seeded before the buy menu loads its own initial liveries list, same
  // reasoning as seedRealDealers() above.
  await seedRealLiveries();
  mountVehicleBuyMenu(router);
  await mountDealerReferencePins(map);
  await seedRealRepaintShops();
  await mountRepaintShops(map, router);
  await mountFareZones(map, router);
  await mountFarePricingPanel();
  await mountLongDistanceSectionsTool(map, router);
  await mountDeadMileagePreview(map, router);
  await mountDutyPanel(router);
  await mountRouteStatisticsPanel();
  await mountContractsPanel();
  // Live request, 2026-11-08: "get all menus working... instead of
  // temporary ones" — the bottom bar (bottom-bar.ts) was shipped as a
  // visual shell only, with switching what's actually shown for each
  // section a deliberate, confirmed-not-yet follow-up. Fleet is wired
  // for real here (fleet-screen.ts, reusing vehicle-buy-menu.ts/
  // livery-panel.ts/repaint-shop-panel.ts's own content as tabs, per
  // bottom-bar.ts's own header comment for what that section should be).
  // Depots/Duties/Fares/Routes/Timetables each needed their own real
  // design work (a map-tool arm/disarm merged with a panel for Depots, a
  // depot-group picker in front of the existing full-screen tool for
  // Duties, a mode change on the always-visible route list for Routes/
  // Timetables) — all five now wired. Calendar and Finance stay plain
  // placeholders, confirmed fine by the user until each has a real screen
  // of its own.
  const fleetScreen = mountFleetScreen();
  const faresScreen = mountFaresScreen();
  const depotsScreen = mountDepotsScreen();
  const dutiesScreen = mountDutiesScreen();
  const routesScreen = mountRoutesScreen();
  const timetablesScreen = mountTimetablesScreen();
  const placeholderScreens: Partial<Record<BottomBarSection, { open(): void; close(): void }>> = {
    calendar: buildPlaceholderScreen("Calendar", "Not built yet — the day-type Mon-Fri/Sat/Sun bar (top right) is still the real control."),
    finance: buildPlaceholderScreen("Finance", "Not built yet — Phase 5's financial screen isn't built. Each depot group's own balance/transactions already show in the Depot groups panel."),
  };
  mountBottomBar((section) => {
    fleetScreen.close();
    faresScreen.close();
    depotsScreen.close();
    dutiesScreen.close();
    routesScreen.close();
    timetablesScreen.close();
    for (const screen of Object.values(placeholderScreens)) screen.close();
    if (section === "fleet") fleetScreen.open();
    else if (section === "fares") faresScreen.open();
    else if (section === "depots") depotsScreen.open();
    else if (section === "duties") dutiesScreen.open();
    else if (section === "routes") routesScreen.open();
    else if (section === "timetables") timetablesScreen.open();
    else placeholderScreens[section]?.open();
  });
  setLoadingProgress(1, "Ready");
  document.getElementById("loading-overlay")?.remove();
});
