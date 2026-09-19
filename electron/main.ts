import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import {
  openSave,
  type SaveDb,
  type RoutePoint,
  setOverride,
  getOverride,
  hasOverride,
  resetOverride,
  listOverrides,
  createDepotGroup,
  listDepotGroups,
  renameDepotGroup,
  setDepotGroupRegion,
  setDepotGroupMainBusStation,
  deleteDepotGroup,
  createRoute,
  listRoutes,
  updateRoute,
  deleteRoute,
  setRoutePickupDropoffOverride,
  type DayType,
  type TimingPoint,
  type TimeBand,
  upsertRouteTimetable,
  listRouteTimetablesForRoute,
  listAllRouteTimetables,
  deleteRouteTimetable,
  createPlayerStop,
  listPlayerStops,
  deletePlayerStop,
  type DepotEntranceMode,
  createDepot,
  listDepots,
  listAllDepotEntrances,
  renameDepot,
  addDepotEntrance,
  setDepotEntranceMode,
  deleteDepotEntrance,
  deleteDepot,
} from "./db.mts";

// Single default save for now — no save-slot UI exists yet (Phase 1 is
// scaffolding, not a playable game). The override layer and depot groups
// just need somewhere real to persist to.
let save: SaveDb;

// TEMPORARY dev-only server, serving the Rust pipeline's raw output
// directly with HTTP Range support (PMTiles needs random byte-range access,
// which a plain file:// fetch in Chromium doesn't support).
//
// The real first-run download, versioned map-data location and manifest
// format are tracked as T8 in OPEN-ITEMS.md and not built yet — this only
// exists to get the pipeline's tiles.pmtiles on screen and prove the chain
// from OSM extract to rendered map actually works. Fixed port, no auth: do
// not ship this as-is.
//
// In dev, pipeline-data sits next to the repo root. In a packaged build
// (npm run package) it's copied to resources/pipeline-data by electron-
// builder's extraResources config in package.json, so it has to be found
// via process.resourcesPath instead — __dirname points inside the packaged
// app's own files, not the resources folder alongside it.
const MAP_DATA_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "pipeline-data")
  : path.resolve(__dirname, "../pipeline-data");
const MAP_DATA_PORT = 38271;

function startMapDataServer(): void {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const filePath = path.join(MAP_DATA_DIR, requestPath);
    if (!filePath.startsWith(MAP_DATA_DIR)) {
      res.writeHead(403).end();
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404).end();
        return;
      }

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const range = req.headers.range;
      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        const start = match ? parseInt(match[1], 10) : 0;
        const end = match && match[2] ? parseInt(match[2], 10) : stats.size - 1;
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Content-Length": end - start + 1,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": stats.size });
        fs.createReadStream(filePath).pipe(res);
      }
    });
  });

  server.listen(MAP_DATA_PORT, "127.0.0.1");
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// The override layer (DESIGN.md §1) exposed to the renderer over IPC — the
// renderer never touches SQLite directly. Generic across every override
// category (stop positions, manual stop -> bus station assignment, per-
// station display settings, and so on), same as the underlying table.
function registerOverrideHandlers(): void {
  ipcMain.handle("overrides:set", (_e, entityType: string, osmId: number, field: string, value: unknown) =>
    setOverride(save, entityType, osmId, field, value),
  );
  ipcMain.handle("overrides:get", (_e, entityType: string, osmId: number, field: string) =>
    getOverride(save, entityType, osmId, field) ?? null,
  );
  ipcMain.handle("overrides:has", (_e, entityType: string, osmId: number, field: string) =>
    hasOverride(save, entityType, osmId, field),
  );
  ipcMain.handle("overrides:reset", (_e, entityType: string, osmId: number, field: string) =>
    resetOverride(save, entityType, osmId, field),
  );
  ipcMain.handle("overrides:list", (_e, entityType: string, field: string) =>
    listOverrides(save, entityType, field),
  );
}

// Depot groups (OPERATIONS.md §1) — the first real save-data object with its
// own screen, rather than shadowing imported OSM data like the override layer.
function registerDepotGroupHandlers(): void {
  ipcMain.handle("depotGroups:create", (_e, name: string, region: string) =>
    createDepotGroup(save, name, region),
  );
  ipcMain.handle("depotGroups:list", () => listDepotGroups(save));
  ipcMain.handle("depotGroups:rename", (_e, id: number, name: string) => renameDepotGroup(save, id, name));
  ipcMain.handle("depotGroups:setRegion", (_e, id: number, region: string) =>
    setDepotGroupRegion(save, id, region),
  );
  ipcMain.handle("depotGroups:setMainBusStation", (_e, id: number, osmId: number | null) =>
    setDepotGroupMainBusStation(save, id, osmId),
  );
  ipcMain.handle("depotGroups:delete", (_e, id: number) => deleteDepotGroup(save, id));
}

// Routes (DESIGN.md §6) — see electron/db.mts for what's built so far and
// what's deliberately left out (variations, timetables, activation state).
function registerRouteHandlers(): void {
  ipcMain.handle(
    "routes:create",
    (
      _e,
      depotGroupId: number,
      number: string,
      points: RoutePoint[],
      orientation: "inbound" | "outbound",
      terminusIndex: number | null,
      startIndex: number | null,
      colour: string,
      name: string | null,
      parentRouteId: number | null,
      variationLetter: string | null,
    ) =>
      createRoute(
        save,
        depotGroupId,
        number,
        points,
        orientation,
        terminusIndex,
        startIndex,
        colour,
        name,
        parentRouteId,
        variationLetter,
      ),
  );
  ipcMain.handle("routes:list", () => listRoutes(save));
  ipcMain.handle(
    "routes:update",
    (
      _e,
      id: number,
      depotGroupId: number,
      number: string,
      points: RoutePoint[],
      orientation: "inbound" | "outbound",
      terminusIndex: number | null,
      startIndex: number | null,
      colour: string,
      name: string | null,
      parentRouteId: number | null,
      variationLetter: string | null,
    ) =>
      updateRoute(
        save,
        id,
        depotGroupId,
        number,
        points,
        orientation,
        terminusIndex,
        startIndex,
        colour,
        name,
        parentRouteId,
        variationLetter,
      ),
  );
  ipcMain.handle("routes:delete", (_e, id: number) => deleteRoute(save, id));
  ipcMain.handle(
    "routes:setPickupDropoffOverride",
    (_e, routeId: number, pointIndex: number, value: "pickup_only" | "setdown_only" | "skip" | null) =>
      setRoutePickupDropoffOverride(save, routeId, pointIndex, value),
  );
}

// Route timetables (DESIGN.md §7) — see electron/db.mts for what's built so
// far (day types, a frequency generator, timing points, one component per
// route per day type) and what's deliberately left out (variations,
// padding, connections, extensions, the event calendar).
function registerRouteTimetableHandlers(): void {
  ipcMain.handle(
    "routeTimetables:upsert",
    (
      _e,
      routeId: number,
      dayType: DayType,
      timeBands: TimeBand[],
      timingPoints: TimingPoint[],
      arrivalOffsetsSeconds: number[],
      departureOffsetsSeconds: number[],
    ) =>
      upsertRouteTimetable(
        save,
        routeId,
        dayType,
        timeBands,
        timingPoints,
        arrivalOffsetsSeconds,
        departureOffsetsSeconds,
      ),
  );
  ipcMain.handle("routeTimetables:listForRoute", (_e, routeId: number) =>
    listRouteTimetablesForRoute(save, routeId),
  );
  ipcMain.handle("routeTimetables:listAll", () => listAllRouteTimetables(save));
  ipcMain.handle("routeTimetables:delete", (_e, id: number) => deleteRouteTimetable(save, id));
}

// Stops the player places directly (DESIGN.md §4), kerb-snapped by the
// WASM router before this ever runs — this layer just persists the result.
function registerPlayerStopHandlers(): void {
  ipcMain.handle("playerStops:create", (_e, lon: number, lat: number, busLegal: boolean) =>
    createPlayerStop(save, lon, lat, busLegal),
  );
  ipcMain.handle("playerStops:list", () => listPlayerStops(save));
  ipcMain.handle("playerStops:delete", (_e, osmId: number) => deletePlayerStop(save, osmId));
}

// Depots (OPERATIONS.md §2 "Placement and entrances") — just the placement
// mechanic itself, see the depots/depot_entrances tables' own comments in
// db.mts for what's deliberately not built yet.
function registerDepotHandlers(): void {
  ipcMain.handle(
    "depots:create",
    (
      _e,
      depotGroupId: number,
      name: string,
      lon: number,
      lat: number,
      entrances: { lon: number; lat: number; mode: DepotEntranceMode }[],
    ) => createDepot(save, depotGroupId, name, lon, lat, entrances),
  );
  ipcMain.handle("depots:list", () => listDepots(save));
  ipcMain.handle("depots:listAllEntrances", () => listAllDepotEntrances(save));
  ipcMain.handle("depots:rename", (_e, id: number, name: string) => renameDepot(save, id, name));
  ipcMain.handle("depots:addEntrance", (_e, depotId: number, lon: number, lat: number, mode: DepotEntranceMode) =>
    addDepotEntrance(save, depotId, lon, lat, mode),
  );
  ipcMain.handle("depots:setEntranceMode", (_e, id: number, mode: DepotEntranceMode) => setDepotEntranceMode(save, id, mode));
  ipcMain.handle("depots:deleteEntrance", (_e, id: number) => deleteDepotEntrance(save, id));
  ipcMain.handle("depots:delete", (_e, id: number) => deleteDepot(save, id));
}

app.whenReady().then(() => {
  const savePath = path.join(app.getPath("userData"), "save.sqlite");
  save = openSave(savePath);
  console.log(`Save opened: ${savePath}`);

  registerOverrideHandlers();
  registerDepotGroupHandlers();
  registerRouteHandlers();
  registerRouteTimetableHandlers();
  registerPlayerStopHandlers();
  registerDepotHandlers();
  startMapDataServer();
  createWindow();
});

app.on("window-all-closed", () => {
  save?.close();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
