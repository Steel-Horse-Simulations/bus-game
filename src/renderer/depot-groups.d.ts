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
  getEnabledOperators(id: number): Promise<string[]>;
  setEnabledOperators(id: number, operatorNames: string[]): Promise<void>;
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
// "staff" (schema v57->v58, live request 2026-11-08: "add a staff bus
// route type ... to get drivers to and from work") — OPERATIONS.md §7's
// own "staff buses can run in the mornings between bus stations and
// depots" line, extended to evenings too. Free (no fare-pricing panel
// section, unlike every other type here), no enforced time window
// (unlike night's own 2345-0400 rule) — drawn and timetabled exactly
// like an ordinary route.
type RouteType = "ordinary" | "night" | "sightseeing" | "airport_express" | "long_distance" | "staff";

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
  // Which of "points" are timing points (schema v56->v57) — set via
  // RoutesApi.setTimingPoint, not create/update, same pattern as
  // pickupDropoffOverrides/branding above.
  timingPointIndexes: number[];
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
  // Manual, player-set vehicle eligibility restrictions (Q19, OPEN-ITEMS.md
  // Q18+Q19 plan) — set via RoutesApi.setVehicleRestrictions, not create/
  // update, same "dedicated setter for a less-central field" pattern as
  // assignedLiveryId/useBrandedColour above. Composes alongside the
  // automatic OSM-road-limit axis (height/weight/length/width), which has
  // no field here at all — it's computed from the pipeline road graph
  // (the router's own last_route_min_max* getters) plus the vehicle
  // catalogue, not stored on the route itself.
  vehicleRestrictions: VehicleRestrictions;
}

// The 5 real broad vehicle classes (mirrors VehicleCategory in
// vehicle-catalogue.mts — this file is ambient/global, so it duplicates
// the literal union rather than importing it, same convention as
// VehiclePowerType below duplicating PowerType).
type VehicleRestrictionBaseType =
  | "Double-deckers"
  | "Specialised (sightseeing, open-top only)"
  | "Single-deckers / midibuses"
  | "Minibus"
  | "Coaches";

interface VehicleRestrictions {
  baseType: VehicleRestrictionBaseType | null;
  powerType: VehiclePowerType | null;
  axleCount: "twin-axle" | "tri-axle" | null;
  liveryId: number | null;
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
    timingPointIndexes: number[],
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
    timingPointIndexes: number[],
  ): Promise<Route>;
  refreshComposedPoints(id: number, points: RoutePoint[]): Promise<void>;
  delete(id: number): Promise<void>;
  setPickupDropoffOverride(
    routeId: number,
    pointIndex: number,
    value: "pickup_only" | "setdown_only" | "skip" | null,
  ): Promise<void>;
  setTimingPoint(routeId: number, pointIndex: number, isTimingPoint: boolean): Promise<void>;
  setBranding(routeId: number, assignedLiveryId: number | null, useBrandedColour: boolean): Promise<void>;
  // setColour, not update — a pure colour change must never go through
  // update's unconditional route_timetables wipe (2026-11-08 bug report:
  // changing a route's colour was wiping its timetable).
  setColour(routeId: number, colour: string): Promise<void>;
  // Same "dedicated setter, not update" reasoning as setColour just above —
  // a repair pass recomputing orientation (2026-11-12 bug fix) must not
  // risk wiping every affected route's own timetable.
  setOrientation(routeId: number, orientation: "inbound" | "outbound"): Promise<void>;
  // Same "dedicated setter, not update" reasoning as setColour/
  // setOrientation above — a plain write of the 4 restriction columns,
  // nothing else, so it can never wipe route_timetables either.
  setVehicleRestrictions(routeId: number, restrictions: VehicleRestrictions): Promise<void>;
}

interface TimingPoint {
  pointIndex: number;
  // Padding ABOVE the real fastest achievable time (2026-11-15) — see
  // route-timetable.mts's own TimingPoint for the full reasoning.
  // peakPaddingMinutes null means "no separate peak figure" (every
  // island-route timing point, by the user's own restriction).
  standardPaddingMinutes: number;
  peakPaddingMinutes: number | null;
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
  weekdayMask: number;
  direction: RouteTimetableDirection;
  timeBands: TimeBand[];
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
  // Peak-variant offsets (2026-11-15) — same shape, computed with each
  // timing point's own peakPaddingMinutes (falling back to standard where
  // unset) instead of standardPaddingMinutes. buildRouteTimetableGrid
  // picks per-journey between these and the plain pair above by that
  // journey's own real departure clock time (route-timetable.mts's
  // isPeakMinute).
  arrivalOffsetsSecondsPeak: number[];
  departureOffsetsSecondsPeak: number[];
  excludedDepartureMinutes: number[];
  customDepartureMinutes: number[];
  // Schema v64->v65 — see electron/db.mts's route_timetables SCHEMA
  // comment. Both null except for a mirroring component.
  mirrorSourceTimetableId: number | null;
  mirrorOffsetMinutes: number | null;
}

interface RouteTimetablesApi {
  upsert(
    routeId: number,
    weekdayMask: number,
    direction: RouteTimetableDirection,
    timeBands: TimeBand[],
    timingPoints: TimingPoint[],
    arrivalOffsetsSeconds: number[],
    departureOffsetsSeconds: number[],
    arrivalOffsetsSecondsPeak: number[],
    departureOffsetsSecondsPeak: number[],
    excludedDepartureMinutes: number[],
    customDepartureMinutes: number[],
    mirrorSourceTimetableId: number | null,
    mirrorOffsetMinutes: number | null,
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
  // Schema v57->v58 — non-null only for a depot's own staff-route stop
  // (PlayerStopsApi.createForDepot).
  depotId: number | null;
}

interface PlayerStopsApi {
  create(lon: number, lat: number, busLegal: boolean): Promise<PlayerStop>;
  list(): Promise<PlayerStop[]>;
  delete(osmId: number): Promise<void>;
  createForDepot(depotId: number): Promise<PlayerStop>;
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
  getNarrowedLiveries(id: number): Promise<number[] | null>;
  setNarrowedLiveries(id: number, liveryIds: number[]): Promise<void>;
}

// western_commercial -> evm (T179, schema v58->v59): Western Commercial's
// Scottish ADL dealership role is superseded by EVM as the UK-wide
// re-power/EV specialist — see db.mts's own dealers table SCHEMA comment.
type DealerManufacturer = "volvo" | "adl" | "evm" | "wrightbus" | "yutong";
type DealerEntranceMode = DepotEntranceMode;

interface Dealer {
  id: number;
  name: string;
  manufacturer: DealerManufacturer;
  lon: number;
  lat: number;
  isEntrancesComplete: boolean;
  // T179: at most one dealer per manufacturer is the re-power site —
  // enforced by setDealerRepowerSite (db.mts), not by this type.
  isRepowerSite: boolean;
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
  setRepowerSite(id: number, isRepowerSite: boolean): Promise<void>;
}

interface StopGroupsApi {
  create(): Promise<{ id: number }>;
  list(): Promise<number[]>;
}

interface PlayerBusStationsApi {
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

// Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9 redesign:
// stop ownership dropped...", 2026-11-16). Keyed by real OSM stop id, not
// a player-owned entity — see stop_upgrades' own CREATE TABLE comment in
// db.mts.
type StopUpgradeType = "seating" | "lighting" | "shelter";

interface StopUpgradeState {
  stopOsmId: number;
  hasSeating: boolean;
  hasLighting: boolean;
  hasShelter: boolean;
  seatingInstalledGameDay: number | null;
  lightingInstalledGameDay: number | null;
  shelterInstalledGameDay: number | null;
}

interface StopUpgradesApi {
  listAll(): Promise<StopUpgradeState[]>;
  get(stopOsmId: number): Promise<StopUpgradeState | null>;
  install(stopOsmId: number, upgradeType: StopUpgradeType, gameDay: number): Promise<StopUpgradeState>;
}

// Route advertising (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
// dropped...", confirmed 2026-11-16) — player-bought only, never
// council-triggered; see route_advertising_bookings' own CREATE TABLE
// comment in db.mts for the full real design.
type RouteAdvertisingMode = "specific_route" | "long_distance";

interface RouteAdvertisingBooking {
  id: number;
  stopOsmId: number;
  depotGroupId: number;
  mode: RouteAdvertisingMode;
  routeId: number | null;
  operatorName: string | null;
  bookedGameDay: number;
  liveFromGameDay: number;
  // True only for the one free, permanent booking a Fixed real contract
  // grants its own real terminus stop on acceptance (OPEN-ITEMS.md
  // "exactly ONE stop per contract" — see stop-route-locks.mts and
  // contracts-panel.ts's acceptRealContract) — bypasses the setup fee/
  // monthly fee/14-day delay entirely. False for every ordinary
  // player-bought booking.
  isContractBundle: boolean;
}

interface RouteAdvertisingApi {
  listAll(): Promise<RouteAdvertisingBooking[]>;
  listForStop(stopOsmId: number): Promise<RouteAdvertisingBooking[]>;
  create(
    stopOsmId: number,
    depotGroupId: number,
    mode: RouteAdvertisingMode,
    routeId: number | null,
    operatorName: string | null,
    bookedGameDay: number,
    liveFromGameDay: number,
    isContractBundle?: boolean,
  ): Promise<RouteAdvertisingBooking>;
  delete(id: number): Promise<void>;
  listGeneratedMonths(bookingId: number): Promise<string[]>;
  recordMonthsBilled(bookingId: number, monthKeys: string[]): Promise<void>;
}

// Stop route locks (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
// dropped...") — the one shared "a stop is exclusively tied to one
// route" primitive behind contract-stop bundling (398/Airlink 100/
// Express 500/AIR's own real terminus stop) and player-initiated
// airport-stop purchase (flat £15,000 placeholder — stop-route-
// locks.mts's own AIRPORT_STOP_PURCHASE_PRICE_GBP_PENCE). See
// stop_route_locks' own CREATE TABLE comment in db.mts for the full
// real design.
type StopRouteLockSource = "contract" | "purchased";

interface StopRouteLock {
  stopOsmId: number;
  lockedRouteId: number;
  source: StopRouteLockSource;
  contractKey: string | null;
  purchasePriceGbpPence: number | null;
  lockedGameDay: number;
}

interface StopRouteLocksApi {
  listAll(): Promise<StopRouteLock[]>;
  get(stopOsmId: number): Promise<StopRouteLock | null>;
  create(
    stopOsmId: number,
    lockedRouteId: number,
    source: StopRouteLockSource,
    contractKey: string | null,
    purchasePriceGbpPence: number | null,
    lockedGameDay: number,
  ): Promise<StopRouteLock>;
}

// Remote/rural route subsidies (OPEN-ITEMS.md "Contracts redesign",
// settled 2026-11-19) — replaces the dropped council-contracts bidding
// mechanic; see remote_route_subsidies' own CREATE TABLE comment in
// db.mts and src/renderer/remote-route-subsidy.mts's own header comment
// for the full real design. Keyed by (routeId, departureMinutes,
// weekdayMask) — one real SCHEDULED journey, not a live per-instance key.
type RemoteRouteSubsidyState = "offered" | "accepted" | "declined" | "withdrawal_warned" | "withdrawn";

interface RemoteRouteSubsidy {
  id: number;
  routeId: number;
  departureMinutes: number;
  weekdayMask: number;
  state: RemoteRouteSubsidyState;
  offeredGameDay: number;
  decidedGameDay: number | null;
  warningStartedGameDay: number | null;
}

interface RemoteRouteSubsidyApi {
  listAll(): Promise<RemoteRouteSubsidy[]>;
  get(routeId: number, departureMinutes: number, weekdayMask: number): Promise<RemoteRouteSubsidy | null>;
  // `state: null` deletes the stored record outright (remote-route-
  // subsidy.mts's evaluateSubsidyDay returns `null` for "no subsidy
  // relationship exists at all").
  upsert(
    routeId: number,
    departureMinutes: number,
    weekdayMask: number,
    state: RemoteRouteSubsidyState | null,
    offeredGameDay: number,
    decidedGameDay: number | null,
    warningStartedGameDay: number | null,
  ): Promise<RemoteRouteSubsidy | null>;
  delete(routeId: number, departureMinutes: number, weekdayMask: number): Promise<void>;
}

// The real "Contracts" menu (DESIGN.md "Fixed real contracts";
// OPEN-ITEMS.md "Contracts redesign"/"Dounreay contracts"/"Three further
// contracts — 800, 803 & 805") — see fixed_contract_fine_events/
// fixed_contract_suspensions/fixed_contract_acceptances/route_milestones'
// own CREATE TABLE comments in db.mts, and fixed-contract-failures.mts/
// fixed-contract-eligibility.mts for the real logic this storage API
// persists.
interface FixedContractFineEvent {
  id: number;
  routeId: number;
  gameDay: number;
  scheduledUnits: number;
  missedUnits: number;
  fineGBPPence: number;
}

interface FixedContractSuspensionRecord {
  id: number;
  routeId: number;
  weekdayMask: number;
  suspendedUnits: number;
  totalUnits: number;
  startGameDay: number;
  returnGameDay: number;
  active: boolean;
}

interface FixedContractAcceptance {
  contractKey: string;
  routeIds: number[];
  depotGroupId: number;
  acceptedGameDay: number;
  activationGameDay: number;
  grantedDepotId: number | null;
}

interface FixedContractsApi {
  recordFineEvent(routeId: number, routeNumber: string, depotGroupId: number, gameDay: number, scheduledUnits: number, missedUnits: number, fineGBPPence: number): Promise<FixedContractFineEvent>;
  listFineEvents(routeId: number): Promise<FixedContractFineEvent[]>;
  createSuspension(routeId: number, weekdayMask: number, suspendedUnits: number, totalUnits: number, startGameDay: number, returnGameDay: number): Promise<FixedContractSuspensionRecord>;
  listSuspensions(routeId: number): Promise<FixedContractSuspensionRecord[]>;
  listAllActiveSuspensions(): Promise<FixedContractSuspensionRecord[]>;
  deactivateSuspension(id: number): Promise<void>;
  createAcceptance(contractKey: string, routeIds: number[], depotGroupId: number, acceptedGameDay: number, activationGameDay: number, grantedDepotId: number | null): Promise<FixedContractAcceptance>;
  getAcceptance(contractKey: string): Promise<FixedContractAcceptance | null>;
  listAcceptances(): Promise<FixedContractAcceptance[]>;
  ensureRouteMilestone(routeId: number, todayGameDay: number): Promise<void>;
  getRouteMilestone(routeId: number): Promise<number | null>;
  // Daily evaluation cursor (schema v70->v71, 2026-11-20) — see
  // fixed_contract_evaluation_cursor's own SCHEMA comment in db.mts. Real
  // caller: contracts-panel.ts's own lazy daily catch-up loop.
  getEvaluationCursor(routeId: number): Promise<number | null>;
  setEvaluationCursor(routeId: number, throughGameDay: number): Promise<void>;
}

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

type RepowerPowerType = "electric" | "hydrogen";

interface RepowerBooking {
  id: number;
  vehicleId: number;
  dealerId: number;
  toPowerType: RepowerPowerType;
  finalPriceGBP: number;
  bookedGameDay: number;
  startGameDay: number;
  completionGameDay: number;
}

interface RepowerBookingsApi {
  listAll(): Promise<RepowerBooking[]>;
  create(
    vehicleId: number,
    dealerId: number,
    toPowerType: RepowerPowerType,
    finalPriceGBP: number,
    bookedGameDay: number,
    startGameDay: number,
    completionGameDay: number,
  ): Promise<RepowerBooking>;
  collect(id: number): Promise<Vehicle>;
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
  weekdayMask: number;
  dutyNumber: string;
  locked: boolean;
  // Schema v57->v58 — set via DutiesApi.setDriver, not create. Null means
  // unassigned.
  driverId: number | null;
  pieces: DutyPiece[];
}

interface DutiesApi {
  listForDepotGroup(depotGroupId: number, weekdayMask: number): Promise<Duty[]>;
  create(depotGroupId: number, depotId: number, weekdayMask: number): Promise<Duty>;
  delete(dutyId: number): Promise<void>;
  setLocked(dutyId: number, locked: boolean): Promise<void>;
  rename(dutyId: number, dutyNumber: string): Promise<void>;
  addPiece(dutyId: number, routeId: number, departureMinutes: number): Promise<DutyPiece>;
  removePiece(pieceId: number): Promise<void>;
  setDriver(dutyId: number, driverId: number | null): Promise<void>;
}

// A driver (OPERATIONS.md §6), schema v57->v58 — see db.mts's own
// "drivers" SCHEMA comment for this increment's deliberate scope.
type DriverScore = "trainee" | "novice" | "competent" | "professional" | "fleet_elite";

interface Driver {
  id: number;
  depotGroupId: number;
  depotId: number;
  name: string;
  score: DriverScore;
  // Schema v60->v61 (T183 — private hire revival, Q20/OPEN-ITEMS.md). Null
  // for every ordinary driver; set only on one auto-hired onto a private-
  // hire vehicle (see db.mts's own drivers SCHEMA comment).
  privateHireVehicleId: number | null;
}

interface DriversApi {
  listForDepotGroup(depotGroupId: number): Promise<Driver[]>;
  create(depotGroupId: number, depotId: number, name: string, score: DriverScore): Promise<Driver>;
  rename(driverId: number, name: string): Promise<void>;
  setScore(driverId: number, score: DriverScore): Promise<void>;
  delete(driverId: number): Promise<void>;
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
  // The real in-game day this vehicle was bought on (T179) — see
  // db.mts's own vehicles table SCHEMA comment for why boughtAt (a real
  // wall-clock timestamp) can't serve the re-power age gate.
  boughtGameDay: number;
  liveryId: number | null;
  // Which route this vehicle was bought for (T153, confirmed 2026-11-07)
  // — recorded for reference only, same as the comment on Route.
  // assignedLiveryId above; nothing reads this as an enforced link.
  boughtForRouteId: number | null;
  // How this vehicle was paid for (T185) — see db.mts's own vehicles
  // table SCHEMA comment for the full reasoning.
  paymentMethod: PaymentMethod;
  // Whether GreenRoad is fitted (schema v68->v69, user request
  // 2026-11-20) — see db.mts's own vehicles table SCHEMA comment.
  greenroadFitted: boolean;
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
  greenroadFitted: boolean;
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
    greenroadFitted?: boolean,
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
  greenroadFitted: boolean;
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
  // One-way, never cleared once true (user request 2026-11-20) — see
  // db.mts's own company_upgrades table SCHEMA comment.
  hasAdoptedGreenroad: boolean;
}

interface CompanyUpgradesApi {
  get(): Promise<CompanyUpgrades>;
  setHasUpgradableTicketApp(value: boolean): Promise<void>;
  setHasMobileAppLiveData(value: boolean): Promise<void>;
  setHasUpgradedAvlData(value: boolean): Promise<void>;
}

// Separate from CompanyUpgradesApi's own setters above — no
// setHasAdoptedGreenroad(value) exists at all, by design: the only way
// this ever becomes true is buyVehicle/collectGreenroadRetrofitBooking
// actually fitting it (db.mts's markGreenroadAdopted), never a direct
// renderer-side toggle.
interface GreenroadRetrofitBooking {
  id: number;
  vehicleId: number;
  depotId: number;
  depotGroupId: number;
  bookedGameDay: number;
  readyGameDay: number;
}

interface GreenroadRetrofitApi {
  // readyGameDay is computed by the caller (fleet-list-panel.ts, via
  // greenroad-retrofit-scheduling.mts's own real 14-day-lead-time-plus-
  // nightly-capacity-per-depot-group math) and passed in here, not
  // derived on the main-process side.
  create(vehicleId: number, depotId: number, depotGroupId: number, bookedGameDay: number, readyGameDay: number): Promise<GreenroadRetrofitBooking>;
  listAll(): Promise<GreenroadRetrofitBooking[]>;
  collect(id: number): Promise<Vehicle>;
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

// T183 (private hire revival, Q20/OPEN-ITEMS.md) — plain storage only, see
// private_hire_income_months' own SCHEMA comment in db.mts.
interface PrivateHireIncomeApi {
  listGeneratedMonths(vehicleId: number): Promise<string[]>;
  markMonthsGenerated(vehicleId: number, monthKeys: string[]): Promise<void>;
}

// T185 (real lease billing, follow-up to T184) — plain storage only, see
// lease_billing_months' own SCHEMA comment in db.mts.
interface LeaseBillingApi {
  listGeneratedMonths(vehicleId: number): Promise<string[]>;
  recordMonthsBilled(vehicleId: number, monthKeys: string[], flipToOutright: boolean): Promise<void>;
}

// GreenRoad recurring billing (user request 2026-11-20) — plain storage
// only, see greenroad_billing_months' own SCHEMA comment in db.mts.
interface GreenroadBillingApi {
  listGeneratedMonths(vehicleId: number): Promise<string[]>;
  recordMonthsBilled(vehicleId: number, monthKeys: string[]): Promise<void>;
}

interface Window {
  deadMileage: DeadMileageApi;
  duties: DutiesApi;
  drivers: DriversApi;
  vehicles: VehiclesApi;
  basket: BasketApi;
  farePricing: FarePricingApi;
  orders: OrdersApi;
  fareZones: FareZonesApi;
  repaintShops: RepaintShopsApi;
  repaintBookings: RepaintBookingsApi;
  stopUpgrades: StopUpgradesApi;
  routeAdvertising: RouteAdvertisingApi;
  stopRouteLocks: StopRouteLocksApi;
  remoteRouteSubsidy: RemoteRouteSubsidyApi;
  fixedContracts: FixedContractsApi;
  repowerBookings: RepowerBookingsApi;
  depotGroups: DepotGroupsApi;
  routes: RoutesApi;
  longDistanceSections: LongDistanceSectionsApi;
  routeTimetables: RouteTimetablesApi;
  playerStops: PlayerStopsApi;
  depots: DepotsApi;
  dealers: DealersApi;
  stopGroups: StopGroupsApi;
  playerBusStations: PlayerBusStationsApi;
  liveries: LiveriesApi;
  gameClock: GameClockApi;
  companyUpgrades: CompanyUpgradesApi;
  finance: FinanceApi;
  privateHireIncome: PrivateHireIncomeApi;
  leaseBilling: LeaseBillingApi;
  greenroadBilling: GreenroadBillingApi;
  greenroadRetrofit: GreenroadRetrofitApi;
}
