import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { ensureMapData, mapDataDir } from "./map-data";
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
  type RouteTimetableDirection,
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
  type DealerManufacturer,
  type DealerEntranceMode,
  createDealer,
  listDealers,
  listAllDealerEntrances,
  renameDealer,
  setDealerManufacturer,
  addDealerEntrance,
  setDealerEntranceMode,
  deleteDealerEntrance,
  deleteDealer,
  createStopGroup,
  listStopGroupIds,
  type IconColour,
  type SupportIconKey,
  createLivery,
  listLiveries,
  setLiverySupportIconOverride,
  listLiverySupportIconOverrides,
  createRepaintShop,
  listRepaintShops,
  setRepaintShopWeeklyCapacity,
  deleteRepaintShop,
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
// In dev, pipeline-data sits next to the repo root. In a packaged build the
// map data is downloaded on first run into userData (see map-data.ts), so
// the installer never carries it.
function mapDataRoot(): string {
  return app.isPackaged ? mapDataDir() : path.resolve(__dirname, "../pipeline-data");
}
const MAP_DATA_PORT = 38271;

function startMapDataServer(): void {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const root = mapDataRoot();
    const filePath = path.join(root, requestPath);
    if (!filePath.startsWith(root)) {
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
      direction: RouteTimetableDirection,
      timeBands: TimeBand[],
      timingPoints: TimingPoint[],
      arrivalOffsetsSeconds: number[],
      departureOffsetsSeconds: number[],
      excludedDepartureMinutes: number[],
      customDepartureMinutes: number[],
    ) =>
      upsertRouteTimetable(
        save,
        routeId,
        dayType,
        direction,
        timeBands,
        timingPoints,
        arrivalOffsetsSeconds,
        departureOffsetsSeconds,
        excludedDepartureMinutes,
        customDepartureMinutes,
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
    (_e, depotGroupId: number, name: string, lon: number, lat: number, entrances: { lon: number; lat: number; mode: DepotEntranceMode }[]) =>
      createDepot(save, depotGroupId, name, lon, lat, entrances),
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

// Dealers (T62, OPEN-ITEMS.md) — exact mirror of registerDepotHandlers
// above, except a dealer has no owning depot group.
function registerDealerHandlers(): void {
  ipcMain.handle(
    "dealers:create",
    (_e, name: string, manufacturer: DealerManufacturer, lon: number, lat: number, entrances: { lon: number; lat: number; mode: DealerEntranceMode }[]) =>
      createDealer(save, name, manufacturer, lon, lat, entrances),
  );
  ipcMain.handle("dealers:list", () => listDealers(save));
  ipcMain.handle("dealers:listAllEntrances", () => listAllDealerEntrances(save));
  ipcMain.handle("dealers:rename", (_e, id: number, name: string) => renameDealer(save, id, name));
  ipcMain.handle("dealers:setManufacturer", (_e, id: number, manufacturer: DealerManufacturer) => setDealerManufacturer(save, id, manufacturer));
  ipcMain.handle("dealers:addEntrance", (_e, dealerId: number, lon: number, lat: number, mode: DealerEntranceMode) =>
    addDealerEntrance(save, dealerId, lon, lat, mode),
  );
  ipcMain.handle("dealers:setEntranceMode", (_e, id: number, mode: DealerEntranceMode) => setDealerEntranceMode(save, id, mode));
  ipcMain.handle("dealers:deleteEntrance", (_e, id: number) => deleteDealerEntrance(save, id));
  ipcMain.handle("dealers:delete", (_e, id: number) => deleteDealer(save, id));
}

// Stop groups (DESIGN.md §4) — player-created only, see stop_groups'
// own comment in db.mts for why this only mints an id; name and
// membership both go through the existing override handlers above.
function registerRepaintShopHandlers(): void {
  ipcMain.handle("repaintShops:list", () => listRepaintShops(save));
  ipcMain.handle("repaintShops:create", (_e, name: string, lon: number, lat: number, weeklyCapacity: number) =>
    createRepaintShop(save, name, lon, lat, weeklyCapacity),
  );
  ipcMain.handle("repaintShops:setWeeklyCapacity", (_e, id: number, weeklyCapacity: number) =>
    setRepaintShopWeeklyCapacity(save, id, weeklyCapacity),
  );
  ipcMain.handle("repaintShops:delete", (_e, id: number) => deleteRepaintShop(save, id));
}

function registerLiveryHandlers(): void {
  ipcMain.handle("liveries:list", () => listLiveries(save));
  ipcMain.handle("liveries:create", (_e, name: string, primaryColour: string, secondaryColour: string) =>
    createLivery(save, name, primaryColour, secondaryColour),
  );
  ipcMain.handle("liveries:listIconOverrides", (_e, liveryId: number) =>
    listLiverySupportIconOverrides(save, liveryId),
  );
  ipcMain.handle(
    "liveries:setIconOverride",
    (_e, liveryId: number, icon: SupportIconKey, colour: IconColour | null) =>
      setLiverySupportIconOverride(save, liveryId, icon, colour),
  );
}

function registerStopGroupHandlers(): void {
  ipcMain.handle("stopGroups:create", () => createStopGroup(save));
  ipcMain.handle("stopGroups:list", () => listStopGroupIds(save));
}

// Checks GitHub Releases on launch and downloads in the background; the
// player is only interrupted once an update is ready to install
// (CLAUDE.md "Installation and distribution"). Packaged builds only, so dev
// runs never try to replace themselves.
function startAutoUpdate(): void {
  if (!app.isPackaged) return;
  autoUpdater.on("error", (err) => console.error("[updater]", err));
  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: "An update has been downloaded.",
      detail: "Restart Bus Game to install it.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch((err) => console.error("[updater]", err));
}

const DOWNLOAD_SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#18181b;color:#f0f0f2;font:14px/1.4 -apple-system,"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.bar{width:300px;height:6px;border-radius:3px;background:#3f3f46;overflow:hidden}
.fill{width:0;height:100%;background:#60a5fa;transition:width .2s}
</style></head><body><div id="label">Preparing map data…</div><div class="bar"><div class="fill" id="fill"></div></div>
<script>window.setProgress=function(f,l){document.getElementById('fill').style.width=Math.round(f*100)+'%';document.getElementById('label').textContent=l;};</script></body></html>`;

// Returns false if the player quits instead of retrying a failed download.
async function downloadMapDataFirst(): Promise<boolean> {
  const splash = new BrowserWindow({
    width: 440,
    height: 170,
    frame: false,
    resizable: false,
    show: true,
  });
  await splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(DOWNLOAD_SPLASH_HTML));
  let lastFraction = -1;
  let lastLabel = "";
  for (;;) {
    try {
      await ensureMapData((label, fraction) => {
        if (fraction - lastFraction < 0.002 && label === lastLabel) return;
        lastFraction = fraction;
        lastLabel = label;
        splash.webContents
          .executeJavaScript(`window.setProgress(${fraction}, ${JSON.stringify(label)})`)
          .catch(() => {});
      });
      splash.destroy();
      return true;
    } catch (err) {
      console.error("[map-data]", err);
      const { response } = await dialog.showMessageBox(splash, {
        type: "error",
        buttons: ["Retry", "Quit"],
        defaultId: 0,
        cancelId: 1,
        message: "The map data could not be downloaded.",
        detail: err instanceof Error ? err.message : String(err),
      });
      if (response === 1) {
        splash.destroy();
        return false;
      }
    }
  }
}

app.whenReady().then(async () => {
  const savePath = path.join(app.getPath("userData"), "save.sqlite");
  save = openSave(savePath);
  console.log(`Save opened: ${savePath}`);

  registerOverrideHandlers();
  registerDepotGroupHandlers();
  registerRouteHandlers();
  registerRouteTimetableHandlers();
  registerPlayerStopHandlers();
  registerDepotHandlers();
  registerDealerHandlers();
  registerStopGroupHandlers();
  registerLiveryHandlers();
  registerRepaintShopHandlers();
  if (app.isPackaged && !(await downloadMapDataFirst())) {
    app.quit();
    return;
  }
  startMapDataServer();
  createWindow();
  startAutoUpdate();
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
