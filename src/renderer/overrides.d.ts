// Matches the API electron/preload.ts exposes via contextBridge.
interface OverridesApi {
  set(entityType: string, osmId: number, field: string, value: unknown): Promise<void>;
  get<T>(entityType: string, osmId: number, field: string): Promise<T | null>;
  has(entityType: string, osmId: number, field: string): Promise<boolean>;
  reset(entityType: string, osmId: number, field: string): Promise<void>;
  list<T>(entityType: string, field: string): Promise<Array<{ osmId: number; value: T }>>;
}

interface Window {
  overrides: OverridesApi;
}
