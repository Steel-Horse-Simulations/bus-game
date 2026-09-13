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
  ): Promise<Route>;
  delete(id: number): Promise<void>;
}

type DayType = "monday_friday" | "saturday" | "sunday";

interface TimingPoint {
  pointIndex: number;
  waitSeconds: number;
}

interface RouteTimetable {
  id: number;
  routeId: number;
  dayType: DayType;
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
}

interface RouteTimetablesApi {
  upsert(
    routeId: number,
    dayType: DayType,
    startMinutes: number,
    endMinutes: number,
    intervalMinutes: number,
    timingPoints: TimingPoint[],
    arrivalOffsetsSeconds: number[],
    departureOffsetsSeconds: number[],
  ): Promise<RouteTimetable>;
  listForRoute(routeId: number): Promise<RouteTimetable[]>;
  listAll(): Promise<RouteTimetable[]>;
  delete(id: number): Promise<void>;
}

interface Window {
  depotGroups: DepotGroupsApi;
  routes: RoutesApi;
  routeTimetables: RouteTimetablesApi;
}
