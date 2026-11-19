// Bridges main <-> renderer.
import { contextBridge, ipcRenderer } from "electron";
import type {
  DepotGroup,
  Route,
  RoutePoint,
  RouteHailAndRideSection,
  RouteSegment,
  RouteType,
  TicketMachineTier,
  LongDistanceSection,
  TimingPoint,
  TimeBand,
  RouteTimetable,
  RouteTimetableDirection,
  VehicleRestrictions,
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
  RepaintShop,
  RepaintShopEntrance,
  RepaintBooking,
  RepaintType,
  RepowerBooking,
  RepowerPowerType,
  DeadMileageRoute,
  DeadMileageDirection,
  DeadMileageBranch,
  DeadMileageWaypoint,
  Duty,
  DutyPiece,
  Vehicle,
  BasketItem,
  VehicleOrder,
  FareZone,
  FareZoneType,
  FareZonePoint,
  FareConfig,
  CountryZoneBand,
  IslandZoneBand,
  GameClock,
  CompanyUpgrades,
  FinanceTransaction,
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
  setTicketMachineTier: (id: number, tier: TicketMachineTier) =>
    ipcRenderer.invoke("depotGroups:setTicketMachineTier", id, tier) as Promise<void>,
  setTapOnTapOff: (id: number, hasTapOnTapOff: boolean) =>
    ipcRenderer.invoke("depotGroups:setTapOnTapOff", id, hasTapOnTapOff) as Promise<void>,
  setColour: (id: number, colour: string) => ipcRenderer.invoke("depotGroups:setColour", id, colour) as Promise<void>,
  getEnabledOperators: (id: number) => ipcRenderer.invoke("depotGroups:getEnabledOperators", id) as Promise<string[]>,
  setEnabledOperators: (id: number, operatorNames: string[]) =>
    ipcRenderer.invoke("depotGroups:setEnabledOperators", id, operatorNames) as Promise<void>,
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
    composedFromRouteIds: number[],
    hailAndRideSections: RouteHailAndRideSection[],
    segments: RouteSegment[],
    routeType: RouteType,
    isMinorVariation: boolean,
    timingPointIndexes: number[],
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
      composedFromRouteIds,
      hailAndRideSections,
      segments,
      routeType,
      isMinorVariation,
      timingPointIndexes,
    ) as Promise<Route>,
  list: () => ipcRenderer.invoke("routes:list") as Promise<Route[]>,
  depotGroupHasRouteType: (depotGroupId: number, routeType: RouteType) =>
    ipcRenderer.invoke("routes:depotGroupHasRouteType", depotGroupId, routeType) as Promise<boolean>,
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
    composedFromRouteIds: number[],
    hailAndRideSections: RouteHailAndRideSection[],
    segments: RouteSegment[],
    routeType: RouteType,
    isMinorVariation: boolean,
    timingPointIndexes: number[],
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
      composedFromRouteIds,
      hailAndRideSections,
      segments,
      routeType,
      isMinorVariation,
      timingPointIndexes,
    ) as Promise<Route>,
  refreshComposedPoints: (id: number, points: RoutePoint[]) =>
    ipcRenderer.invoke("routes:refreshComposedPoints", id, points) as Promise<void>,
  delete: (id: number) => ipcRenderer.invoke("routes:delete", id) as Promise<void>,
  setPickupDropoffOverride: (
    routeId: number,
    pointIndex: number,
    value: "pickup_only" | "setdown_only" | "skip" | null,
  ) =>
    ipcRenderer.invoke("routes:setPickupDropoffOverride", routeId, pointIndex, value) as Promise<void>,
  setTimingPoint: (routeId: number, pointIndex: number, isTimingPoint: boolean) =>
    ipcRenderer.invoke("routes:setTimingPoint", routeId, pointIndex, isTimingPoint) as Promise<void>,
  setBranding: (routeId: number, assignedLiveryId: number | null, useBrandedColour: boolean) =>
    ipcRenderer.invoke("routes:setBranding", routeId, assignedLiveryId, useBrandedColour) as Promise<void>,
  setColour: (routeId: number, colour: string) => ipcRenderer.invoke("routes:setColour", routeId, colour) as Promise<void>,
  setOrientation: (routeId: number, orientation: "inbound" | "outbound") =>
    ipcRenderer.invoke("routes:setOrientation", routeId, orientation) as Promise<void>,
  setVehicleRestrictions: (routeId: number, restrictions: VehicleRestrictions) =>
    ipcRenderer.invoke("routes:setVehicleRestrictions", routeId, restrictions) as Promise<void>,
});

// Shared long-distance sections (live design discussion, 2026-10-31) — see
// long_distance_sections' own SCHEMA comment in db.mts. A route references
// one via its own `segments` field (above), resolved live in the renderer
// (long-distance-sections.mts), the same live-reference principle this
// project already uses for composed route variations.
contextBridge.exposeInMainWorld("longDistanceSections", {
  list: () => ipcRenderer.invoke("longDistanceSections:list") as Promise<LongDistanceSection[]>,
  create: (name: string, points: RoutePoint[]) =>
    ipcRenderer.invoke("longDistanceSections:create", name, points) as Promise<LongDistanceSection>,
  rename: (id: number, name: string) => ipcRenderer.invoke("longDistanceSections:rename", id, name) as Promise<void>,
  setPoints: (id: number, points: RoutePoint[]) =>
    ipcRenderer.invoke("longDistanceSections:setPoints", id, points) as Promise<void>,
  delete: (id: number) => ipcRenderer.invoke("longDistanceSections:delete", id) as Promise<void>,
});

// Route timetables (DESIGN.md §7) — the renderer's only way to persist a
// route's frequency generator, timing points and their computed running-
// time offsets (built from the WASM router, which only exists here).
contextBridge.exposeInMainWorld("routeTimetables", {
  upsert: (
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
  ) =>
    ipcRenderer.invoke(
      "routeTimetables:upsert",
      routeId,
      weekdayMask,
      direction,
      timeBands,
      timingPoints,
      arrivalOffsetsSeconds,
      departureOffsetsSeconds,
      arrivalOffsetsSecondsPeak,
      departureOffsetsSecondsPeak,
      excludedDepartureMinutes,
      customDepartureMinutes,
      mirrorSourceTimetableId,
      mirrorOffsetMinutes,
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
  createForDepot: (depotId: number) => ipcRenderer.invoke("playerStops:createForDepot", depotId) as Promise<PlayerStop>,
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
  getNarrowedLiveries: (id: number) => ipcRenderer.invoke("depots:getNarrowedLiveries", id) as Promise<number[] | null>,
  setNarrowedLiveries: (id: number, liveryIds: number[]) => ipcRenderer.invoke("depots:setNarrowedLiveries", id, liveryIds) as Promise<void>,
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
  setEntrancesComplete: (id: number, isComplete: boolean) => ipcRenderer.invoke("dealers:setEntrancesComplete", id, isComplete) as Promise<void>,
  setRepowerSite: (id: number, isRepowerSite: boolean) => ipcRenderer.invoke("dealers:setRepowerSite", id, isRepowerSite) as Promise<void>,
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

// Player-created bus stations — same "mints only an id" shape as stopGroups
// above, see player_bus_stations' own SCHEMA comment (electron/db.mts) for
// why this exists as a separate table rather than reusing stop_groups.
contextBridge.exposeInMainWorld("playerBusStations", {
  create: () => ipcRenderer.invoke("playerBusStations:create") as Promise<{ id: number }>,
  list: () => ipcRenderer.invoke("playerBusStations:list") as Promise<number[]>,
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

// Repaint shops (T63) — player-placed, each with its own concurrent
// capacity (bays) and turnaround time (working days per vehicle).
contextBridge.exposeInMainWorld("repaintShops", {
  list: () => ipcRenderer.invoke("repaintShops:list") as Promise<RepaintShop[]>,
  create: (name: string, lon: number, lat: number, concurrentCapacity: number, turnaroundDays: number) =>
    ipcRenderer.invoke("repaintShops:create", name, lon, lat, concurrentCapacity, turnaroundDays) as Promise<RepaintShop>,
  setConcurrentCapacity: (id: number, concurrentCapacity: number) =>
    ipcRenderer.invoke("repaintShops:setConcurrentCapacity", id, concurrentCapacity) as Promise<void>,
  setTurnaroundDays: (id: number, turnaroundDays: number) =>
    ipcRenderer.invoke("repaintShops:setTurnaroundDays", id, turnaroundDays) as Promise<void>,
  delete: (id: number) => ipcRenderer.invoke("repaintShops:delete", id) as Promise<void>,
  listAllEntrances: () => ipcRenderer.invoke("repaintShops:listAllEntrances") as Promise<RepaintShopEntrance[]>,
  addEntrance: (repaintShopId: number, lon: number, lat: number, mode: DealerEntranceMode) =>
    ipcRenderer.invoke("repaintShops:addEntrance", repaintShopId, lon, lat, mode) as Promise<RepaintShopEntrance>,
  setEntranceMode: (id: number, mode: DealerEntranceMode) => ipcRenderer.invoke("repaintShops:setEntranceMode", id, mode) as Promise<void>,
  deleteEntrance: (id: number) => ipcRenderer.invoke("repaintShops:deleteEntrance", id) as Promise<void>,
});

// Repaint bookings (OPERATIONS.md §5, capacity/scheduling only — see
// repaint_bookings' own CREATE TABLE comment in db.mts for why there's no
// real cost deduction or travel simulation yet).
contextBridge.exposeInMainWorld("repaintBookings", {
  listAll: () => ipcRenderer.invoke("repaintBookings:listAll") as Promise<RepaintBooking[]>,
  create: (
    vehicleId: number,
    repaintShopId: number | null,
    repaintType: RepaintType,
    basePriceGBP: number,
    discountPercent: number,
    finalPriceGBP: number,
    bookedGameDay: number,
    startGameDay: number,
    completionGameDay: number,
  ) =>
    ipcRenderer.invoke(
      "repaintBookings:create",
      vehicleId,
      repaintShopId,
      repaintType,
      basePriceGBP,
      discountPercent,
      finalPriceGBP,
      bookedGameDay,
      startGameDay,
      completionGameDay,
    ) as Promise<RepaintBooking>,
  delete: (id: number) => ipcRenderer.invoke("repaintBookings:delete", id) as Promise<void>,
});

// Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9 redesign:
// stop ownership dropped...", 2026-11-16).
contextBridge.exposeInMainWorld("stopUpgrades", {
  listAll: () => ipcRenderer.invoke("stopUpgrades:listAll") as Promise<StopUpgradeState[]>,
  get: (stopOsmId: number) => ipcRenderer.invoke("stopUpgrades:get", stopOsmId) as Promise<StopUpgradeState | null>,
  install: (stopOsmId: number, upgradeType: StopUpgradeType, gameDay: number) =>
    ipcRenderer.invoke("stopUpgrades:install", stopOsmId, upgradeType, gameDay) as Promise<StopUpgradeState>,
});

// Route advertising (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
// dropped...", confirmed 2026-11-16) — player-bought only, never
// council-triggered.
contextBridge.exposeInMainWorld("routeAdvertising", {
  listAll: () => ipcRenderer.invoke("routeAdvertising:listAll") as Promise<RouteAdvertisingBooking[]>,
  listForStop: (stopOsmId: number) => ipcRenderer.invoke("routeAdvertising:listForStop", stopOsmId) as Promise<RouteAdvertisingBooking[]>,
  create: (
    stopOsmId: number,
    depotGroupId: number,
    mode: RouteAdvertisingMode,
    routeId: number | null,
    operatorName: string | null,
    bookedGameDay: number,
    liveFromGameDay: number,
  ) =>
    ipcRenderer.invoke("routeAdvertising:create", stopOsmId, depotGroupId, mode, routeId, operatorName, bookedGameDay, liveFromGameDay) as Promise<RouteAdvertisingBooking>,
  delete: (id: number) => ipcRenderer.invoke("routeAdvertising:delete", id) as Promise<void>,
  listGeneratedMonths: (bookingId: number) => ipcRenderer.invoke("routeAdvertising:listGeneratedMonths", bookingId) as Promise<string[]>,
  recordMonthsBilled: (bookingId: number, monthKeys: string[]) => ipcRenderer.invoke("routeAdvertising:recordMonthsBilled", bookingId, monthKeys) as Promise<void>,
});

// Remote/rural route subsidies (OPEN-ITEMS.md "Contracts redesign",
// settled 2026-11-19) — replaces the dropped council-contracts bidding
// mechanic. See remote-route-subsidy.mts for the real offer/accept/
// decline/withdrawal logic this storage API persists.
contextBridge.exposeInMainWorld("remoteRouteSubsidy", {
  listAll: () => ipcRenderer.invoke("remoteRouteSubsidy:listAll") as Promise<RemoteRouteSubsidy[]>,
  get: (routeId: number, departureMinutes: number, weekdayMask: number) =>
    ipcRenderer.invoke("remoteRouteSubsidy:get", routeId, departureMinutes, weekdayMask) as Promise<RemoteRouteSubsidy | null>,
  upsert: (
    routeId: number,
    departureMinutes: number,
    weekdayMask: number,
    state: RemoteRouteSubsidyState | null,
    offeredGameDay: number,
    decidedGameDay: number | null,
    warningStartedGameDay: number | null,
  ) =>
    ipcRenderer.invoke("remoteRouteSubsidy:upsert", routeId, departureMinutes, weekdayMask, state, offeredGameDay, decidedGameDay, warningStartedGameDay) as Promise<RemoteRouteSubsidy | null>,
  delete: (routeId: number, departureMinutes: number, weekdayMask: number) =>
    ipcRenderer.invoke("remoteRouteSubsidy:delete", routeId, departureMinutes, weekdayMask) as Promise<void>,
});

// Re-power bookings (T179, OPEN-ITEMS.md) — same capacity/scheduling
// storage shape as repaintBookings above, plus collect() to actually
// apply the conversion once a booking's completion day has passed (see
// collectRepowerBooking's own comment in db.mts).
contextBridge.exposeInMainWorld("repowerBookings", {
  listAll: () => ipcRenderer.invoke("repowerBookings:listAll") as Promise<RepowerBooking[]>,
  create: (vehicleId: number, dealerId: number, toPowerType: RepowerPowerType, finalPriceGBP: number, bookedGameDay: number, startGameDay: number, completionGameDay: number) =>
    ipcRenderer.invoke("repowerBookings:create", vehicleId, dealerId, toPowerType, finalPriceGBP, bookedGameDay, startGameDay, completionGameDay) as Promise<RepowerBooking>,
  collect: (id: number) => ipcRenderer.invoke("repowerBookings:collect", id) as Promise<Vehicle>,
  delete: (id: number) => ipcRenderer.invoke("repowerBookings:delete", id) as Promise<void>,
});

// Dead mileage routes (DESIGN.md "Dead mileage routes") — saved per depot entrance pair, with waypoints the player added.
contextBridge.exposeInMainWorld("deadMileage", {
  listForDepot: (depotId: number) => ipcRenderer.invoke("deadMileage:listForDepot", depotId) as Promise<DeadMileageRoute[]>,
  createRoute: (dealerEntranceId: number, depotId: number, direction: DeadMileageDirection, trunkWaypoints: DeadMileageWaypoint[]) =>
    ipcRenderer.invoke("deadMileage:createRoute", dealerEntranceId, depotId, direction, trunkWaypoints) as Promise<DeadMileageRoute>,
  setTrunkWaypoints: (routeId: number, waypoints: DeadMileageWaypoint[]) =>
    ipcRenderer.invoke("deadMileage:setTrunkWaypoints", routeId, waypoints) as Promise<void>,
  addBranch: (routeId: number, depotEntranceId: number, waypoints: DeadMileageWaypoint[]) =>
    ipcRenderer.invoke("deadMileage:addBranch", routeId, depotEntranceId, waypoints) as Promise<DeadMileageBranch>,
  setBranchWaypoints: (branchId: number, waypoints: DeadMileageWaypoint[]) =>
    ipcRenderer.invoke("deadMileage:setBranchWaypoints", branchId, waypoints) as Promise<void>,
  deleteBranch: (branchId: number) => ipcRenderer.invoke("deadMileage:deleteBranch", branchId) as Promise<void>,
  deleteRoute: (routeId: number) => ipcRenderer.invoke("deadMileage:deleteRoute", routeId) as Promise<void>,
});

// Duties (OPERATIONS.md §7, Phase 3) — one vehicle's own chained work
// pattern for a depot group + day type, built from the day's already-
// published journeys (see db.mts's own "duties"/"duty_pieces" comments).
contextBridge.exposeInMainWorld("duties", {
  listForDepotGroup: (depotGroupId: number, weekdayMask: number) =>
    ipcRenderer.invoke("duties:listForDepotGroup", depotGroupId, weekdayMask) as Promise<Duty[]>,
  create: (depotGroupId: number, depotId: number, weekdayMask: number) =>
    ipcRenderer.invoke("duties:create", depotGroupId, depotId, weekdayMask) as Promise<Duty>,
  delete: (dutyId: number) => ipcRenderer.invoke("duties:delete", dutyId) as Promise<void>,
  setLocked: (dutyId: number, locked: boolean) => ipcRenderer.invoke("duties:setLocked", dutyId, locked) as Promise<void>,
  rename: (dutyId: number, dutyNumber: string) => ipcRenderer.invoke("duties:rename", dutyId, dutyNumber) as Promise<void>,
  addPiece: (dutyId: number, routeId: number, departureMinutes: number) =>
    ipcRenderer.invoke("duties:addPiece", dutyId, routeId, departureMinutes) as Promise<DutyPiece>,
  removePiece: (pieceId: number) => ipcRenderer.invoke("duties:removePiece", pieceId) as Promise<void>,
  setDriver: (dutyId: number, driverId: number | null) => ipcRenderer.invoke("duties:setDriver", dutyId, driverId) as Promise<void>,
});

// Drivers (OPERATIONS.md §6), schema v57->v58 — see db.mts's own
// "drivers" SCHEMA comment for this increment's deliberate scope.
contextBridge.exposeInMainWorld("drivers", {
  listForDepotGroup: (depotGroupId: number) => ipcRenderer.invoke("drivers:listForDepotGroup", depotGroupId) as Promise<Driver[]>,
  create: (depotGroupId: number, depotId: number, name: string, score: DriverScore) =>
    ipcRenderer.invoke("drivers:create", depotGroupId, depotId, name, score) as Promise<Driver>,
  rename: (driverId: number, name: string) => ipcRenderer.invoke("drivers:rename", driverId, name) as Promise<void>,
  setScore: (driverId: number, score: DriverScore) => ipcRenderer.invoke("drivers:setScore", driverId, score) as Promise<void>,
  delete: (driverId: number) => ipcRenderer.invoke("drivers:delete", driverId) as Promise<void>,
});

// Owned vehicles (OPERATIONS.md §3). Direct buying moved to the basket
// flow below (addBasketItem -> placeOrder -> collectOrder) — the Configure
// screen no longer buys a vehicle outright in one step.
contextBridge.exposeInMainWorld("vehicles", {
  listForDepotGroup: (depotGroupId: number) => ipcRenderer.invoke("vehicles:listForDepotGroup", depotGroupId) as Promise<Vehicle[]>,
  listAll: () => ipcRenderer.invoke("vehicles:listAll") as Promise<Vehicle[]>,
  delete: (vehicleId: number) => ipcRenderer.invoke("vehicles:delete", vehicleId) as Promise<void>,
  transfer: (vehicleId: number, newDepotId: number) => ipcRenderer.invoke("vehicles:transfer", vehicleId, newDepotId) as Promise<Vehicle>,
});

// The buy menu's basket (OPERATIONS.md §3 "Buying") — one company-wide
// basket, see basket_items' own SCHEMA comment in db.mts.
contextBridge.exposeInMainWorld("basket", {
  add: (
    depotGroupId: number,
    depotId: number,
    modelId: string,
    lengthM: number,
    variantLabel: string | null,
    powerType: "diesel" | "electric" | "hybrid" | "hydrogen",
    liveryId: number | null,
    manufacturer: string,
    quantity: number,
    unitPriceGBP: number,
    paymentMethod: "buy_outright" | "lease" | "lease_to_own",
    isUsed: boolean,
    usedCondition: number | null,
    boughtForRouteId: number | null = null,
  ) =>
    ipcRenderer.invoke(
      "basket:add",
      depotGroupId,
      depotId,
      modelId,
      lengthM,
      variantLabel,
      powerType,
      liveryId,
      manufacturer,
      quantity,
      unitPriceGBP,
      paymentMethod,
      isUsed,
      usedCondition,
      boughtForRouteId,
    ) as Promise<BasketItem>,
  list: () => ipcRenderer.invoke("basket:list") as Promise<BasketItem[]>,
  setQuantity: (basketItemId: number, quantity: number) => ipcRenderer.invoke("basket:setQuantity", basketItemId, quantity) as Promise<void>,
  setDepot: (basketItemId: number, depotGroupId: number, depotId: number) => ipcRenderer.invoke("basket:setDepot", basketItemId, depotGroupId, depotId) as Promise<void>,
  setLivery: (basketItemId: number, liveryId: number | null) => ipcRenderer.invoke("basket:setLivery", basketItemId, liveryId) as Promise<void>,
  remove: (basketItemId: number) => ipcRenderer.invoke("basket:remove", basketItemId) as Promise<void>,
  placeOrder: () => ipcRenderer.invoke("basket:placeOrder") as Promise<number>,
});

// Orders awaiting collection (OPERATIONS.md §3 "Delivery and transfers") —
// see vehicle_orders' own SCHEMA comment in db.mts for the deliberate
// "immediately available to collect" simplification.
contextBridge.exposeInMainWorld("orders", {
  list: () => ipcRenderer.invoke("orders:list") as Promise<VehicleOrder[]>,
  collect: (orderId: number) => ipcRenderer.invoke("orders:collect", orderId) as Promise<Vehicle>,
});

// Fare zones (DESIGN.md §9) — geometry only, per depot group. See
// fare_zones' own SCHEMA comment in db.mts.
contextBridge.exposeInMainWorld("fareZones", {
  listForDepotGroup: (depotGroupId: number) =>
    ipcRenderer.invoke("fareZones:listForDepotGroup", depotGroupId) as Promise<FareZone[]>,
  listAll: () => ipcRenderer.invoke("fareZones:listAll") as Promise<FareZone[]>,
  create: (depotGroupId: number, name: string, zoneType: FareZoneType, points: FareZonePoint[], colour: string, parentZoneId: number | null = null) =>
    ipcRenderer.invoke("fareZones:create", depotGroupId, name, zoneType, points, colour, parentZoneId) as Promise<FareZone>,
  rename: (zoneId: number, name: string) => ipcRenderer.invoke("fareZones:rename", zoneId, name) as Promise<void>,
  setType: (zoneId: number, zoneType: FareZoneType, parentZoneId: number | null = null) =>
    ipcRenderer.invoke("fareZones:setType", zoneId, zoneType, parentZoneId) as Promise<void>,
  setColour: (zoneId: number, colour: string) => ipcRenderer.invoke("fareZones:setColour", zoneId, colour) as Promise<void>,
  delete: (zoneId: number) => ipcRenderer.invoke("fareZones:delete", zoneId) as Promise<void>,
  merge: (sourceZoneId: number, targetZoneId: number) => ipcRenderer.invoke("fareZones:merge", sourceZoneId, targetZoneId) as Promise<void>,
});

// Fare pricing config (DESIGN.md §9, Phase 4 increment 2b) — see
// fare_configs' own SCHEMA comment in db.mts.
contextBridge.exposeInMainWorld("farePricing", {
  getConfig: (depotGroupId: number) => ipcRenderer.invoke("farePricing:getConfig", depotGroupId) as Promise<FareConfig>,
  setConfigFields: (depotGroupId: number, fields: Partial<Omit<FareConfig, "depotGroupId">>) =>
    ipcRenderer.invoke("farePricing:setConfigFields", depotGroupId, fields) as Promise<void>,
  listCountryZoneBands: (depotGroupId: number) =>
    ipcRenderer.invoke("farePricing:listCountryZoneBands", depotGroupId) as Promise<CountryZoneBand[]>,
  setCountryZoneBand: (depotGroupId: number, zoneCount: number, priceGBPPence: number) =>
    ipcRenderer.invoke("farePricing:setCountryZoneBand", depotGroupId, zoneCount, priceGBPPence) as Promise<void>,
  deleteCountryZoneBand: (depotGroupId: number, zoneCount: number) =>
    ipcRenderer.invoke("farePricing:deleteCountryZoneBand", depotGroupId, zoneCount) as Promise<void>,
  listIslandZoneBands: (depotGroupId: number) =>
    ipcRenderer.invoke("farePricing:listIslandZoneBands", depotGroupId) as Promise<IslandZoneBand[]>,
  setIslandZoneBand: (depotGroupId: number, zoneCount: number, priceGBPPence: number) =>
    ipcRenderer.invoke("farePricing:setIslandZoneBand", depotGroupId, zoneCount, priceGBPPence) as Promise<void>,
  deleteIslandZoneBand: (depotGroupId: number, zoneCount: number) =>
    ipcRenderer.invoke("farePricing:deleteIslandZoneBand", depotGroupId, zoneCount) as Promise<void>,
});

// The game clock (DESIGN.md §3) — see game_clock's own SCHEMA comment in
// db.mts.
contextBridge.exposeInMainWorld("gameClock", {
  get: () => ipcRenderer.invoke("gameClock:get") as Promise<GameClock>,
  set: (clock: GameClock) => ipcRenderer.invoke("gameClock:set", clock) as Promise<void>,
});

contextBridge.exposeInMainWorld("companyUpgrades", {
  get: () => ipcRenderer.invoke("companyUpgrades:get") as Promise<CompanyUpgrades>,
  setHasUpgradableTicketApp: (value: boolean) => ipcRenderer.invoke("companyUpgrades:setHasUpgradableTicketApp", value) as Promise<void>,
  setHasMobileAppLiveData: (value: boolean) => ipcRenderer.invoke("companyUpgrades:setHasMobileAppLiveData", value) as Promise<void>,
  setHasUpgradedAvlData: (value: boolean) => ipcRenderer.invoke("companyUpgrades:setHasUpgradedAvlData", value) as Promise<void>,
});

contextBridge.exposeInMainWorld("finance", {
  getBalance: () => ipcRenderer.invoke("finance:getBalance") as Promise<number>,
  record: (amountGBPPence: number, category: string, depotGroupId: number | null, description: string, gameDay: number) =>
    ipcRenderer.invoke("finance:record", amountGBPPence, category, depotGroupId, description, gameDay) as Promise<FinanceTransaction>,
  list: (depotGroupId?: number) => ipcRenderer.invoke("finance:list", depotGroupId) as Promise<FinanceTransaction[]>,
});

// Private hire income tracking (T183 — private hire revival, Q20/OPEN-
// ITEMS.md) — plain storage only, see private_hire_income_months' own
// SCHEMA comment in db.mts.
contextBridge.exposeInMainWorld("privateHireIncome", {
  listGeneratedMonths: (vehicleId: number) => ipcRenderer.invoke("privateHireIncome:listGeneratedMonths", vehicleId) as Promise<string[]>,
  markMonthsGenerated: (vehicleId: number, monthKeys: string[]) =>
    ipcRenderer.invoke("privateHireIncome:markMonthsGenerated", vehicleId, monthKeys) as Promise<void>,
});

// Lease billing tracking (T185, follow-up to T184) — plain storage only,
// see lease_billing_months' own SCHEMA comment in db.mts.
contextBridge.exposeInMainWorld("leaseBilling", {
  listGeneratedMonths: (vehicleId: number) => ipcRenderer.invoke("leaseBilling:listGeneratedMonths", vehicleId) as Promise<string[]>,
  recordMonthsBilled: (vehicleId: number, monthKeys: string[], flipToOutright: boolean) =>
    ipcRenderer.invoke("leaseBilling:recordMonthsBilled", vehicleId, monthKeys, flipToOutright) as Promise<void>,
});
