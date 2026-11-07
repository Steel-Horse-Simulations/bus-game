// Matches the API electron/preload.ts exposes via contextBridge.
type TicketMachineTier = "basic" | "mid" | "advanced";

interface DepotGroup {
  id: number;
  name: string;
  region: string;
  mainBusStationOsmId: number | null;
  ticketMachineTier: TicketMachineTier;
  hasTapOnTapOff: boolean;
  // T154, confirmed 2026-11-07 — earmarked for a second branding-mask
  // region on the Sightseeing livery specifically, data side only; no
  // mask-tinting renderer exists in code at all yet.
  colour: string;
}

interface DepotGroupsApi {
  create(name: string, region: string): Promise<DepotGroup>;
  list(): Promise<DepotGroup[]>;
  rename(id: number, name: string): Promise<void>;
  setRegion(id: number, region: string): Promise<void>;
  setMainBusStation(id: number, osmId: number | null): Promise<void>;
  setTicketMachineTier(id: number, tier: TicketMachineTier): Promise<void>;
  setTapOnTapOff(id: number, hasTapOnTapOff: boolean): Promise<void>;
  setColour(id: number, colour: string): Promise<void>;
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

interface RouteHailAndRideSection {
  fromIndex: number;
  toIndex: number;
}

// Confirmed 2026-10-31, live user request: chosen when a route is made
// ("+ New route" asks before drawing starts), mutually exclusive. Drives
// the fare-pricing panel's gating (Night/Sightseeing/Airport Express/
// Long-distance fields only show once the depot group has a route of that
// type) and, for "night", limits that route's own timetable to UK-
// EXPANSION.md §10's real window (2345-0400).
type RouteType = "ordinary" | "night" | "sightseeing" | "airport_express" | "long_distance";

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
  composedFromRouteIds: number[];
  hailAndRideSections: RouteHailAndRideSection[];
  segments: RouteSegment[];
  routeType: RouteType;
  isMinorVariation: boolean;
  // Route branding (T153, confirmed 2026-11-07) — set via RoutesApi.
  // setBranding, not createRoute/update, same "dedicated setter for a
  // less-central field" pattern as depot groups' own ticket machine tier.
  assignedLiveryId: number | null;
  // When true, the assigned livery's branding-mask region should be
  // tinted with this route's own `colour` above instead of that livery's
  // plain default colours. The actual mask-tint rendering doesn't exist
  // yet (OPERATIONS.md §4's masks aren't built) — this is the data side
  // only, confirmed as the deliberate first step.
  useBrandedColour: boolean;
}

// A route's own build sequence (shared long-distance sections) — see
// long_distance_sections' own SCHEMA comment in db.mts.
type RouteSegment = { kind: "custom"; points: RoutePoint[] } | { kind: "section"; sectionId: number };

interface LongDistanceSection {
  id: number;
  name: string;
  points: RoutePoint[];
}

interface LongDistanceSectionsApi {
  list(): Promise<LongDistanceSection[]>;
  create(name: string, points: RoutePoint[]): Promise<LongDistanceSection>;
  rename(id: number, name: string): Promise<void>;
  setPoints(id: number, points: RoutePoint[]): Promise<void>;
  delete(id: number): Promise<void>;
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
    composedFromRouteIds: number[],
    hailAndRideSections: RouteHailAndRideSection[],
    segments: RouteSegment[],
    routeType: RouteType,
    isMinorVariation: boolean,
  ): Promise<Route>;
  list(): Promise<Route[]>;
  depotGroupHasRouteType(depotGroupId: number, routeType: RouteType): Promise<boolean>;
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
    composedFromRouteIds: number[],
    hailAndRideSections: RouteHailAndRideSection[],
    segments: RouteSegment[],
    routeType: RouteType,
    isMinorVariation: boolean,
  ): Promise<Route>;
  refreshComposedPoints(id: number, points: RoutePoint[]): Promise<void>;
  delete(id: number): Promise<void>;
  setPickupDropoffOverride(
    routeId: number,
    pointIndex: number,
    value: "pickup_only" | "setdown_only" | "skip" | null,
  ): Promise<void>;
  setBranding(routeId: number, assignedLiveryId: number | null, useBrandedColour: boolean): Promise<void>;
}

type DayType = "monday_friday" | "saturday" | "sunday";

interface TimingPoint {
  pointIndex: number;
  legMinutes: number;
  dwellMinutes: number;
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
  isEntrancesComplete: boolean;
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
  setEntrancesComplete(id: number, isComplete: boolean): Promise<void>;
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

interface RepaintShop {
  id: number;
  name: string;
  lon: number;
  lat: number;
  concurrentCapacity: number;
  turnaroundDays: number;
}

interface RepaintShopEntrance {
  id: number;
  repaintShopId: number;
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

interface RepaintShopsApi {
  list(): Promise<RepaintShop[]>;
  create(name: string, lon: number, lat: number, concurrentCapacity: number, turnaroundDays: number): Promise<RepaintShop>;
  setConcurrentCapacity(id: number, concurrentCapacity: number): Promise<void>;
  setTurnaroundDays(id: number, turnaroundDays: number): Promise<void>;
  delete(id: number): Promise<void>;
  listAllEntrances(): Promise<RepaintShopEntrance[]>;
  addEntrance(repaintShopId: number, lon: number, lat: number, mode: DealerEntranceMode): Promise<RepaintShopEntrance>;
  setEntranceMode(id: number, mode: DealerEntranceMode): Promise<void>;
  deleteEntrance(id: number): Promise<void>;
}

type RepaintType = "full" | "simple";

interface RepaintBooking {
  id: number;
  vehicleId: number;
  repaintShopId: number | null;
  repaintType: RepaintType;
  basePriceGBP: number;
  discountPercent: number;
  finalPriceGBP: number;
  bookedGameDay: number;
  startGameDay: number;
  completionGameDay: number;
}

interface RepaintBookingsApi {
  listAll(): Promise<RepaintBooking[]>;
  create(
    vehicleId: number,
    repaintShopId: number | null,
    repaintType: RepaintType,
    basePriceGBP: number,
    discountPercent: number,
    finalPriceGBP: number,
    bookedGameDay: number,
    startGameDay: number,
    completionGameDay: number,
  ): Promise<RepaintBooking>;
  delete(id: number): Promise<void>;
}

interface DeadMileageBranch {
  id: number;
  routeId: number;
  depotEntranceId: number;
  waypoints: { lon: number; lat: number }[];
}

type DeadMileageDirection = "inbound" | "outbound";

interface DeadMileageRoute {
  id: number;
  dealerEntranceId: number;
  depotId: number;
  direction: DeadMileageDirection;
  trunkWaypoints: { lon: number; lat: number }[];
  branches: DeadMileageBranch[];
}

interface DeadMileageApi {
  listForDepot(depotId: number): Promise<DeadMileageRoute[]>;
  createRoute(dealerEntranceId: number, depotId: number, direction: DeadMileageDirection, trunkWaypoints: { lon: number; lat: number }[]): Promise<DeadMileageRoute>;
  setTrunkWaypoints(routeId: number, waypoints: { lon: number; lat: number }[]): Promise<void>;
  addBranch(routeId: number, depotEntranceId: number, waypoints: { lon: number; lat: number }[]): Promise<DeadMileageBranch>;
  setBranchWaypoints(branchId: number, waypoints: { lon: number; lat: number }[]): Promise<void>;
  deleteBranch(branchId: number): Promise<void>;
  deleteRoute(routeId: number): Promise<void>;
}

// Duties (OPERATIONS.md §7, Phase 3) — see db.mts's own "duties"/
// "duty_pieces" SCHEMA comments for why a piece is only enough to re-find
// its journey (which route, which generated departure), not the journey
// itself.
interface DutyPiece {
  id: number;
  routeId: number;
  departureMinutes: number;
}

interface Duty {
  id: number;
  depotGroupId: number;
  depotId: number;
  dayType: DayType;
  dutyNumber: string;
  locked: boolean;
  pieces: DutyPiece[];
}

interface DutiesApi {
  listForDepotGroup(depotGroupId: number, dayType: DayType): Promise<Duty[]>;
  create(depotGroupId: number, depotId: number, dayType: DayType): Promise<Duty>;
  delete(dutyId: number): Promise<void>;
  setLocked(dutyId: number, locked: boolean): Promise<void>;
  rename(dutyId: number, dutyNumber: string): Promise<void>;
  addPiece(dutyId: number, routeId: number, departureMinutes: number): Promise<DutyPiece>;
  removePiece(pieceId: number): Promise<void>;
}

type VehiclePowerType = "diesel" | "electric" | "hybrid" | "hydrogen";

interface Vehicle {
  id: number;
  depotGroupId: number;
  depotId: number;
  modelId: string;
  lengthM: number;
  variantLabel: string | null;
  powerType: VehiclePowerType;
  fleetNumber: string;
  plate: string;
  condition: number;
  purchasePriceGBP: number;
  boughtAt: string;
  liveryId: number | null;
  // Which route this vehicle was bought for (T153, confirmed 2026-11-07)
  // — recorded for reference only, same as the comment on Route.
  // assignedLiveryId above; nothing reads this as an enforced link.
  boughtForRouteId: number | null;
}

interface VehiclesApi {
  listForDepotGroup(depotGroupId: number): Promise<Vehicle[]>;
  listAll(): Promise<Vehicle[]>;
  delete(vehicleId: number): Promise<void>;
  transfer(vehicleId: number, newDepotId: number): Promise<Vehicle>;
}

type PaymentMethod = "buy_outright" | "lease" | "lease_to_own";

interface BasketItem {
  id: number;
  depotGroupId: number;
  depotId: number;
  modelId: string;
  lengthM: number;
  variantLabel: string | null;
  powerType: VehiclePowerType;
  liveryId: number | null;
  manufacturer: string;
  quantity: number;
  unitPriceGBP: number;
  paymentMethod: PaymentMethod;
  isUsed: boolean;
  usedCondition: number | null;
  boughtForRouteId: number | null;
}

interface BasketApi {
  add(
    depotGroupId: number,
    depotId: number,
    modelId: string,
    lengthM: number,
    variantLabel: string | null,
    powerType: VehiclePowerType,
    liveryId: number | null,
    manufacturer: string,
    quantity: number,
    unitPriceGBP: number,
    paymentMethod: PaymentMethod,
    isUsed: boolean,
    usedCondition: number | null,
    boughtForRouteId?: number | null,
  ): Promise<BasketItem>;
  list(): Promise<BasketItem[]>;
  setQuantity(basketItemId: number, quantity: number): Promise<void>;
  setDepot(basketItemId: number, depotGroupId: number, depotId: number): Promise<void>;
  setLivery(basketItemId: number, liveryId: number | null): Promise<void>;
  remove(basketItemId: number): Promise<void>;
  placeOrder(): Promise<number>;
}

interface VehicleOrder {
  id: number;
  depotGroupId: number;
  depotId: number;
  modelId: string;
  lengthM: number;
  variantLabel: string | null;
  powerType: VehiclePowerType;
  liveryId: number | null;
  unitPriceGBP: number;
  paymentMethod: PaymentMethod;
  isUsed: boolean;
  usedCondition: number | null;
  orderedAt: string;
  boughtForRouteId: number | null;
}

interface OrdersApi {
  list(): Promise<VehicleOrder[]>;
  collect(orderId: number): Promise<Vehicle>;
}

type FareZoneType = "city" | "country" | "island" | "town";

interface FareZonePoint {
  lon: number;
  lat: number;
}

interface FareZone {
  id: number;
  depotGroupId: number;
  name: string;
  zoneType: FareZoneType;
  points: FareZonePoint[];
  colour: string;
  parentZoneId: number | null;
}

interface FareZonesApi {
  listForDepotGroup(depotGroupId: number): Promise<FareZone[]>;
  listAll(): Promise<FareZone[]>;
  create(depotGroupId: number, name: string, zoneType: FareZoneType, points: FareZonePoint[], colour: string, parentZoneId?: number | null): Promise<FareZone>;
  rename(zoneId: number, name: string): Promise<void>;
  setType(zoneId: number, zoneType: FareZoneType, parentZoneId?: number | null): Promise<void>;
  setColour(zoneId: number, colour: string): Promise<void>;
  delete(zoneId: number): Promise<void>;
  merge(sourceZoneId: number, targetZoneId: number): Promise<void>;
}

interface FareConfig {
  depotGroupId: number;
  citySingleGBPPence: number | null;
  beyondDepotGroupPerMileGBPPence: number | null;
  longDistanceBaseGBPPence: number | null;
  longDistancePerMileGBPPence: number | null;
  airportExpressSingleGBPPence: number | null;
  airportExpressReturnGBPPence: number | null;
  nightExtraBaseGBPPence: number | null;
  nightExtraPerZoneGBPPence: number | null;
  lateGBPPence: number | null;
  networkMarkupPercent: number | null;
  sightseeingDayGBPPence: number | null;
  sightseeingSingleGBPPence: number | null;
  cityDayGBPPence: number | null;
  cityWeeklyGBPPence: number | null;
  countryDayGBPPence: number | null;
  countryWeeklyGBPPence: number | null;
  combinedDayGBPPence: number | null;
  combinedWeeklyGBPPence: number | null;
  islandDayGBPPence: number | null;
  islandWeeklyGBPPence: number | null;
  islandLateGBPPence: number | null;
}

interface CountryZoneBand {
  zoneCount: number;
  priceGBPPence: number;
}

interface IslandZoneBand {
  zoneCount: number;
  priceGBPPence: number;
}

interface FarePricingApi {
  getConfig(depotGroupId: number): Promise<FareConfig>;
  setConfigFields(depotGroupId: number, fields: Partial<Omit<FareConfig, "depotGroupId">>): Promise<void>;
  listCountryZoneBands(depotGroupId: number): Promise<CountryZoneBand[]>;
  setCountryZoneBand(depotGroupId: number, zoneCount: number, priceGBPPence: number): Promise<void>;
  deleteCountryZoneBand(depotGroupId: number, zoneCount: number): Promise<void>;
  listIslandZoneBands(depotGroupId: number): Promise<IslandZoneBand[]>;
  setIslandZoneBand(depotGroupId: number, zoneCount: number, priceGBPPence: number): Promise<void>;
  deleteIslandZoneBand(depotGroupId: number, zoneCount: number): Promise<void>;
}

interface GameClock {
  accumulatedGameSeconds: number;
  speedMultiplier: 1 | 4 | 10 | 20 | 60;
  isPaused: boolean;
}

interface GameClockApi {
  get(): Promise<GameClock>;
  set(clock: GameClock): Promise<void>;
}

interface CompanyUpgrades {
  hasUpgradableTicketApp: boolean;
  hasMobileAppLiveData: boolean;
  hasUpgradedAvlData: boolean;
}

interface CompanyUpgradesApi {
  get(): Promise<CompanyUpgrades>;
  setHasUpgradableTicketApp(value: boolean): Promise<void>;
  setHasMobileAppLiveData(value: boolean): Promise<void>;
  setHasUpgradedAvlData(value: boolean): Promise<void>;
}

interface FinanceTransaction {
  id: number;
  amountGBPPence: number;
  category: string;
  depotGroupId: number | null;
  description: string;
  gameDay: number;
}

interface FinanceApi {
  getBalance(): Promise<number>;
  record(amountGBPPence: number, category: string, depotGroupId: number | null, description: string, gameDay: number): Promise<FinanceTransaction>;
  list(depotGroupId?: number): Promise<FinanceTransaction[]>;
}

interface Window {
  deadMileage: DeadMileageApi;
  duties: DutiesApi;
  vehicles: VehiclesApi;
  basket: BasketApi;
  farePricing: FarePricingApi;
  orders: OrdersApi;
  fareZones: FareZonesApi;
  repaintShops: RepaintShopsApi;
  repaintBookings: RepaintBookingsApi;
  depotGroups: DepotGroupsApi;
  routes: RoutesApi;
  longDistanceSections: LongDistanceSectionsApi;
  routeTimetables: RouteTimetablesApi;
  playerStops: PlayerStopsApi;
  depots: DepotsApi;
  dealers: DealersApi;
  stopGroups: StopGroupsApi;
  liveries: LiveriesApi;
  gameClock: GameClockApi;
  companyUpgrades: CompanyUpgradesApi;
  finance: FinanceApi;
}
