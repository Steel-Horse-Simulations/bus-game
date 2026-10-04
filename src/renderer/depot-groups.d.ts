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

type RouteTimetableDirection = "both" | "outbound" | "inbound";

interface RouteTimetable {
  id: number;
  routeId: number;
  dayType: DayType;
  direction: RouteTimetableDirection;
  timeBands: TimeBand[];
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
  excludedDepartureMinutes: number[];
  customDepartureMinutes: number[];
}

interface RouteTimetablesApi {
  upsert(
    routeId: number,
    dayType: DayType,
    direction: RouteTimetableDirection,
    timeBands: TimeBand[],
    timingPoints: TimingPoint[],
    arrivalOffsetsSeconds: number[],
    departureOffsetsSeconds: number[],
    excludedDepartureMinutes: number[],
    customDepartureMinutes: number[],
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
  create(depotGroupId: number, name: string, lon: number, lat: number, entrances: { lon: number; lat: number; mode: DepotEntranceMode }[]): Promise<{ depot: Depot; entrances: DepotEntrance[] }>;
  list(): Promise<Depot[]>;
  listAllEntrances(): Promise<DepotEntrance[]>;
  rename(id: number, name: string): Promise<void>;
  addEntrance(depotId: number, lon: number, lat: number, mode: DepotEntranceMode): Promise<DepotEntrance>;
  setEntranceMode(id: number, mode: DepotEntranceMode): Promise<void>;
  deleteEntrance(id: number): Promise<void>;
  delete(id: number): Promise<void>;
}

type DealerManufacturer = "volvo" | "adl" | "western_commercial" | "wrightbus" | "yutong";
type DealerEntranceMode = DepotEntranceMode;

interface Dealer {
  id: number;
  name: string;
  manufacturer: DealerManufacturer;
  lon: number;
  lat: number;
}

interface DealerEntrance {
  id: number;
  dealerId: number;
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

interface DealersApi {
  create(name: string, manufacturer: DealerManufacturer, lon: number, lat: number, entrances: { lon: number; lat: number; mode: DealerEntranceMode }[]): Promise<{ dealer: Dealer; entrances: DealerEntrance[] }>;
  list(): Promise<Dealer[]>;
  listAllEntrances(): Promise<DealerEntrance[]>;
  rename(id: number, name: string): Promise<void>;
  setManufacturer(id: number, manufacturer: DealerManufacturer): Promise<void>;
  addEntrance(dealerId: number, lon: number, lat: number, mode: DealerEntranceMode): Promise<DealerEntrance>;
  setEntranceMode(id: number, mode: DealerEntranceMode): Promise<void>;
  deleteEntrance(id: number): Promise<void>;
  delete(id: number): Promise<void>;
}

interface StopGroupsApi {
  create(): Promise<{ id: number }>;
  list(): Promise<number[]>;
}

interface Livery {
  id: number;
  name: string;
  primaryColour: string;
  secondaryColour: string;
}

type SupportIconKey = "spanner" | "person" | "recovery" | "parcel";
type IconColour = "black" | "white";

interface LiveryIconOverride {
  liveryId: number;
  icon: SupportIconKey;
  colour: IconColour;
}

interface LiveriesApi {
  list(): Promise<Livery[]>;
  create(name: string, primaryColour: string, secondaryColour: string): Promise<Livery>;
  listIconOverrides(liveryId: number): Promise<LiveryIconOverride[]>;
  setIconOverride(liveryId: number, icon: SupportIconKey, colour: IconColour | null): Promise<void>;
}

interface Window {
  depotGroups: DepotGroupsApi;
  routes: RoutesApi;
  routeTimetables: RouteTimetablesApi;
  playerStops: PlayerStopsApi;
  depots: DepotsApi;
  dealers: DealersApi;
  stopGroups: StopGroupsApi;
  liveries: LiveriesApi;
}
