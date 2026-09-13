// Bridges main <-> renderer.
import { contextBridge, ipcRenderer } from "electron";
import type { DepotGroup, Route, RoutePoint, DayType, TimingPoint, RouteTimetable } from "./db.mts";

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
    ) as Promise<Route>,
  delete: (id: number) => ipcRenderer.invoke("routes:delete", id) as Promise<void>,
  setPickupDropoffOverride: (routeId: number, pointIndex: number, value: "pickup_only" | "setdown_only" | null) =>
    ipcRenderer.invoke("routes:setPickupDropoffOverride", routeId, pointIndex, value) as Promise<void>,
});

// Route timetables (DESIGN.md §7) — the renderer's only way to persist a
// route's frequency generator, timing points and their computed running-
// time offsets (built from the WASM router, which only exists here).
contextBridge.exposeInMainWorld("routeTimetables", {
  upsert: (
    routeId: number,
    dayType: DayType,
    startMinutes: number,
    endMinutes: number,
    intervalMinutes: number,
    timingPoints: TimingPoint[],
    arrivalOffsetsSeconds: number[],
    departureOffsetsSeconds: number[],
  ) =>
    ipcRenderer.invoke(
      "routeTimetables:upsert",
      routeId,
      dayType,
      startMinutes,
      endMinutes,
      intervalMinutes,
      timingPoints,
      arrivalOffsetsSeconds,
      departureOffsetsSeconds,
    ) as Promise<RouteTimetable>,
  listForRoute: (routeId: number) =>
    ipcRenderer.invoke("routeTimetables:listForRoute", routeId) as Promise<RouteTimetable[]>,
  listAll: () => ipcRenderer.invoke("routeTimetables:listAll") as Promise<RouteTimetable[]>,
  delete: (id: number) => ipcRenderer.invoke("routeTimetables:delete", id) as Promise<void>,
});
