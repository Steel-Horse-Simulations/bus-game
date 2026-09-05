// Matches the API electron/preload.ts exposes via contextBridge.
interface DepotGroup {
  id: number;
  name: string;
  region: string;
}

interface DepotGroupsApi {
  create(name: string, region: string): Promise<DepotGroup>;
  list(): Promise<DepotGroup[]>;
  rename(id: number, name: string): Promise<void>;
  setRegion(id: number, region: string): Promise<void>;
  delete(id: number): Promise<void>;
}

interface Window {
  depotGroups: DepotGroupsApi;
}
