// Bridges main <-> renderer.
import { contextBridge, ipcRenderer } from "electron";
import type {
  DepotGroup,
  Route,
  RoutePoint,
  DayType,
  TimingPoint,
  TimeBand,
  RouteTimetable,
  RouteTimetableDirection,
  PlayerStop,
  Depot,
  DepotEntrance,
  DepotEntranceMode,
  Dealer,
  DealerEntrance,
  DealerEntranceMode,
  DealerManufacturer,
  Livery,
  LiverySupportIconOverride,
  SupportIconKey,
  IconColour,
} from "./db.mts";

// The override layer (DESIGN.md §1, electron/db.mts) — the renderer's only
// way to read or write it, since node:sqlite lives in the main process.
contextBridge.exposeInMainWorld("overrides", {
  set: (entityType: string, osmId: number, field: string, value: unknown) =>
    ipcRenderer.invoke("overrides:set", entityType, osmId, field, value) as Promise<void>,
  get: <T>(entityType: string, osmId: number, field: string) =>
    ipcRenderer.invoke("overrides:get", entityType, osmId, field) as Promise<T | null>,
  has: (entityType: string, osmId: number, field: string) =>
    ipcRenderer.invoke("overrides:has", entityType, osmId, field) as Promise<boolean>,
  reset: (entityType: string, osmId: number, field: string) =>
    ipcRenderer.invoke("overrides:reset", entityType, osmId, field) as Promise<void>,
  list: <T>(entityType: string, field: string) =>
    ipcRenderer.invoke("overrides:list", entityType, field) as Promise<Array<{ osmId: number; value: T }>>,
});

// Depot groups (OPERATIONS.md §1) — the first real save-data object with its
// own screen.
contextBridge.exposeInMainWorld("depotGroups", {
  create: (name: string, region: string) =>
    ipcRenderer.invoke("depotGroups:create", name, region) as Promise<DepotGroup>,
  list: () => ipcRenderer.invoke("depotGroups:list") as Promise<DepotGroup[]>,
  rename: (id: number, name: string) => ipcRenderer.invoke("depotGroups:rename", id, name) as Promise<void>,
  setRegion: (id: number, region: string) =>
    ipcRenderer.invoke("depotGroups:setRegion", id, region) as Promise<void>,
  setMainBusStation: (id: number, osmId: number | null) =>
    ipcRenderer.invoke("depotGroups:setMainBusStation", id, osmId) as Promise<void>,
  delete: (id: number) => ipcRenderer.invoke("depotGroups:delete", id) as Promise<void>,
});

// Routes (DESIGN.md §6) — the renderer's only way to persist a drawn route.
contextBridge.exposeInMainWorld("routes", {
  create: (
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
    ipcRenderer.invoke(
      "routes:create",
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
    ) as Promise<Route>,
  list: () => ipcRenderer.invoke("routes:list") as Promise<Route[]>,
  update: (
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
    ipcRenderer.invoke(
      "routes:update",
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
    ) as Promise<Route>,
  delete: (id: number) => ipcRenderer.invoke("routes:delete", id) as Promise<void>,
  setPickupDropoffOverride: (
    routeId: number,
    pointIndex: number,
    value: "pickup_only" | "setdown_only" | "skip" | null,
  ) =>
    ipcRenderer.invoke("routes:setPickupDropoffOverride", routeId, pointIndex, value) as Promise<void>,
});

// Route timetables (DESIGN.md §7) — the renderer's only way to persist a
// route's frequency generator, timing points and their computed running-
// time offsets (built from the WASM router, which only exists here).
contextBridge.exposeInMainWorld("routeTimetables", {
  upsert: (
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
    ipcRenderer.invoke(
      "routeTimetables:upsert",
      routeId,
      dayType,
      direction,
      timeBands,
      timingPoints,
      arrivalOffsetsSeconds,
      departureOffsetsSeconds,
      excludedDepartureMinutes,
      customDepartureMinutes,
    ) as Promise<RouteTimetable>,
  listForRoute: (routeId: number) =>
    ipcRenderer.invoke("routeTimetables:listForRoute", routeId) as Promise<RouteTimetable[]>,
  listAll: () => ipcRenderer.invoke("routeTimetables:listAll") as Promise<RouteTimetable[]>,
  delete: (id: number) => ipcRenderer.invoke("routeTimetables:delete", id) as Promise<void>,
});

// Player-placed stops (DESIGN.md §4 "Placement") — kerb-snapped by the WASM
// router in the renderer, persisted here.
contextBridge.exposeInMainWorld("playerStops", {
  create: (lon: number, lat: number, busLegal: boolean) =>
    ipcRenderer.invoke("playerStops:create", lon, lat, busLegal) as Promise<PlayerStop>,
  list: () => ipcRenderer.invoke("playerStops:list") as Promise<PlayerStop[]>,
  delete: (osmId: number) => ipcRenderer.invoke("playerStops:delete", osmId) as Promise<void>,
});

// Depots (OPERATIONS.md §2 "Placement and entrances") — road-snapped
// entrances computed by the WASM router in the renderer, persisted here.
contextBridge.exposeInMainWorld("depots", {
  create: (depotGroupId: number, name: string, lon: number, lat: number, entrances: { lon: number; lat: number; mode: DepotEntranceMode }[]) =>
    ipcRenderer.invoke("depots:create", depotGroupId, name, lon, lat, entrances) as Promise<{ depot: Depot; entrances: DepotEntrance[] }>,
  list: () => ipcRenderer.invoke("depots:list") as Promise<Depot[]>,
  listAllEntrances: () => ipcRenderer.invoke("depots:listAllEntrances") as Promise<DepotEntrance[]>,
  rename: (id: number, name: string) => ipcRenderer.invoke("depots:rename", id, name) as Promise<void>,
  addEntrance: (depotId: number, lon: number, lat: number, mode: DepotEntranceMode) =>
    ipcRenderer.invoke("depots:addEntrance", depotId, lon, lat, mode) as Promise<DepotEntrance>,
  setEntranceMode: (id: number, mode: DepotEntranceMode) => ipcRenderer.invoke("depots:setEntranceMode", id, mode) as Promise<void>,
  deleteEntrance: (id: number) => ipcRenderer.invoke("depots:deleteEntrance", id) as Promise<void>,
  delete: (id: number) => ipcRenderer.invoke("depots:delete", id) as Promise<void>,
});

// Dealers (T62, OPEN-ITEMS.md) — exact mirror of the depots bridge above,
// except a dealer has no owning depot group and carries a manufacturer
// instead.
contextBridge.exposeInMainWorld("dealers", {
  create: (name: string, manufacturer: DealerManufacturer, lon: number, lat: number, entrances: { lon: number; lat: number; mode: DealerEntranceMode }[]) =>
    ipcRenderer.invoke("dealers:create", name, manufacturer, lon, lat, entrances) as Promise<{ dealer: Dealer; entrances: DealerEntrance[] }>,
  list: () => ipcRenderer.invoke("dealers:list") as Promise<Dealer[]>,
  listAllEntrances: () => ipcRenderer.invoke("dealers:listAllEntrances") as Promise<DealerEntrance[]>,
  rename: (id: number, name: string) => ipcRenderer.invoke("dealers:rename", id, name) as Promise<void>,
  setManufacturer: (id: number, manufacturer: DealerManufacturer) => ipcRenderer.invoke("dealers:setManufacturer", id, manufacturer) as Promise<void>,
  addEntrance: (dealerId: number, lon: number, lat: number, mode: DealerEntranceMode) =>
    ipcRenderer.invoke("dealers:addEntrance", dealerId, lon, lat, mode) as Promise<DealerEntrance>,
  setEntranceMode: (id: number, mode: DealerEntranceMode) => ipcRenderer.invoke("dealers:setEntranceMode", id, mode) as Promise<void>,
  deleteEntrance: (id: number) => ipcRenderer.invoke("dealers:deleteEntrance", id) as Promise<void>,
  delete: (id: number) => ipcRenderer.invoke("dealers:delete", id) as Promise<void>,
});

// Stop groups (DESIGN.md §4) — player-created only (2026-09-27: dropped the
// automatic OSM stop_area-relation seeding, see stops-layer.ts). This only
// mints an id; name and membership both go through the existing `overrides`
// bridge above ('stop_group'/id for name+display state, 'stop'/osmId/
// 'group_id' for membership).
contextBridge.exposeInMainWorld("stopGroups", {
  create: () => ipcRenderer.invoke("stopGroups:create") as Promise<{ id: number }>,
  list: () => ipcRenderer.invoke("stopGroups:list") as Promise<number[]>,
});

// Liveries (OPERATIONS.md §4, minimal) — name and colours, plus each
// support icon's manual black/white override for that livery.
contextBridge.exposeInMainWorld("liveries", {
  list: () => ipcRenderer.invoke("liveries:list") as Promise<Livery[]>,
  create: (name: string, primaryColour: string, secondaryColour: string) =>
    ipcRenderer.invoke("liveries:create", name, primaryColour, secondaryColour) as Promise<Livery>,
  listIconOverrides: (liveryId: number) =>
    ipcRenderer.invoke("liveries:listIconOverrides", liveryId) as Promise<LiverySupportIconOverride[]>,
  setIconOverride: (liveryId: number, icon: SupportIconKey, colour: IconColour | null) =>
    ipcRenderer.invoke("liveries:setIconOverride", liveryId, icon, colour) as Promise<void>,
});
