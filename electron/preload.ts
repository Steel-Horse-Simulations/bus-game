// Bridges main <-> renderer.
import { contextBridge, ipcRenderer } from "electron";
import type { DepotGroup } from "./db.mts";

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
  delete: (id: number) => ipcRenderer.invoke("depotGroups:delete", id) as Promise<void>,
});
