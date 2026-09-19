// Matches the API electron/preload.ts exposes via contextBridge.
interface DepotGroup {
  id: number;
  name: string;
  region: string;
  mainBusStationOsmId: number | null;
}

interface DepotGroupsApi {
  create(name: string, region: string): Promise<DepotGroup>;
  list(): Promise<DepotGroup[]>;
  rename(id: number, name: string): Promise<void>;
  setRegion(id: number, region: string): Promise<void>;
  setMainBusStation(id: number, osmId: number | null): Promise<void>;
  delete(id: number): Promise<void>;
}

interface RoutePoint {
  kind: "stop" | "waypoint";
  osmId?: number;
  lon: number;
  lat: number;
}

interface RoutePickupDropoffOverride {
  pointIndex: number;
  value: "pickup_only" | "setdown_only" | "skip";
}

interface Route {
  id: number;
  depotGroupId: number;
  number: string;
  points: RoutePoint[];
  orientation: "inbound" | "outbound";
  terminusIndex: number | null;
  startIndex: number | null;
  colour: string;
  name: string | null;
  pickupDropoffOverrides: RoutePickupDropoffOverride[];
  parentRouteId: number | null;
  variationLetter: string | null;
}

interface RoutesApi {
  create(
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
  ): Promise<Route>;
  list(): Promise<Route[]>;
  update(
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
  ): Promise<Route>;
  delete(id: number): Promise<void>;
  setPickupDropoffOverride(
    routeId: number,
    pointIndex: number,
    value: "pickup_only" | "setdown_only" | "skip" | null,
  ): Promise<void>;
}

type DayType = "monday_friday" | "saturday" | "sunday";

interface TimingPoint {
  pointIndex: number;
  legMinutes: number;
  dwellSeconds: number;
}

interface TimeBand {
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
}

interface RouteTimetable {
  id: number;
  routeId: number;
  dayType: DayType;
  timeBands: TimeBand[];
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
}

interface RouteTimetablesApi {
  upsert(
    routeId: number,
    dayType: DayType,
    timeBands: TimeBand[],
    timingPoints: TimingPoint[],
    arrivalOffsetsSeconds: number[],
    departureOffsetsSeconds: number[],
  ): Promise<RouteTimetable>;
  listForRoute(routeId: number): Promise<RouteTimetable[]>;
  listAll(): Promise<RouteTimetable[]>;
  delete(id: number): Promise<void>;
}

interface PlayerStop {
  osmId: number;
  lon: number;
  lat: number;
  busLegal: boolean;
}

interface PlayerStopsApi {
  create(lon: number, lat: number, busLegal: boolean): Promise<PlayerStop>;
  list(): Promise<PlayerStop[]>;
  delete(osmId: number): Promise<void>;
}

type DepotEntranceMode = "entry" | "exit" | "both";

interface Depot {
  id: number;
  depotGroupId: number;
  name: string;
  lon: number;
  lat: number;
}

interface DepotEntrance {
  id: number;
  depotId: number;
  lon: number;
  lat: number;
  mode: DepotEntranceMode;
}

interface DepotsApi {
  create(
    depotGroupId: number,
    name: string,
    lon: number,
    lat: number,
    entrances: { lon: number; lat: number; mode: DepotEntranceMode }[],
  ): Promise<{ depot: Depot; entrances: DepotEntrance[] }>;
  list(): Promise<Depot[]>;
  listAllEntrances(): Promise<DepotEntrance[]>;
  rename(id: number, name: string): Promise<void>;
  addEntrance(depotId: number, lon: number, lat: number, mode: DepotEntranceMode): Promise<DepotEntrance>;
  setEntranceMode(id: number, mode: DepotEntranceMode): Promise<void>;
  deleteEntrance(id: number): Promise<void>;
  delete(id: number): Promise<void>;
}

interface Window {
  depotGroups: DepotGroupsApi;
  routes: RoutesApi;
  routeTimetables: RouteTimetablesApi;
  playerStops: PlayerStopsApi;
  depots: DepotsApi;
}
