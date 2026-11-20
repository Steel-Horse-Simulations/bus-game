// Manual verification script for fixed-contract-route-seed-data.mts, run
// directly with `node --experimental-strip-types
// electron/fixed-contract-route-seed-data.verify.mts` (this project's own
// convention — no build step, plain assert()).
//
// Exercises the REAL extracted seed data through the REAL schema
// (electron/db.mts), using a `FixedContractSeedPorts` backed directly by
// db.mts's own functions rather than `window.*` (no Electron/
// contextBridge available in a plain Node script) — proves the embedded
// static seed data actually round-trips through real createRoute/
// upsertRouteTimetable/createPlayerStop calls, not just that it compiles.
import { existsSync, unlinkSync } from "node:fs";
import {
  openSave,
  createDepotGroup,
  createRoute,
  listRoutes,
  listRouteTimetablesForRoute,
  setRoutePickupDropoffOverride,
  upsertRouteTimetable,
  createPlayerStop,
  listPlayerStops,
  type RouteType,
} from "./db.mts";
import {
  ROUTE_398_SEED,
  AIRLINK_100_SEED,
  EXPRESS_500_SEED,
  AIR_PARENT_SEED,
  AIR_VIA_GARROWHILL_SEED,
  AIR_VIA_GARROWHILL_EUROCENTRAL_SEED,
  seedSingleFixedContractRoute,
  seedAirFixedContractRoutes,
  type FixedContractSeedPorts,
} from "../src/renderer/fixed-contract-route-seed-data.mts";

const path = "./electron/.verify-fixed-contract-seed.sqlite";
if (existsSync(path)) unlinkSync(path);

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const db = openSave(path);
const glasgow = createDepotGroup(db, "Glasgow", "West Scotland");
const edinburgh = createDepotGroup(db, "Edinburgh", "East Scotland");

function dbBackedPorts(): FixedContractSeedPorts {
  return {
    async createPlayerStop(lon, lat, busLegal) {
      return createPlayerStop(db, lon, lat, busLegal).osmId;
    },
    async createRoute(depotGroupId, number, points, orientation, terminusIndex, startIndex, colour, name, parentRouteId, variationLetter, segments, routeType, isMinorVariation, timingPointIndexes) {
      return createRoute(
        db,
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
        [],
        [],
        segments,
        routeType as RouteType,
        isMinorVariation,
        timingPointIndexes,
      ).id;
    },
    async setPickupDropoffOverride(routeId, pointIndex, value) {
      setRoutePickupDropoffOverride(db, routeId, pointIndex, value);
    },
    async upsertRouteTimetable(routeId, tt) {
      upsertRouteTimetable(
        db,
        routeId,
        tt.weekdayMask,
        tt.direction,
        tt.timeBands,
        tt.timingPoints,
        tt.arrivalOffsetsSeconds,
        tt.departureOffsetsSeconds,
        tt.arrivalOffsetsSecondsPeak,
        tt.departureOffsetsSecondsPeak,
        tt.excludedDepartureMinutes,
        tt.customDepartureMinutes,
        null,
        null,
      );
    },
  };
}

const ports = dbBackedPorts();

// --- 398 ----------------------------------------------------------------
await (async () => {
  const [routeId] = await seedSingleFixedContractRoute(ports, glasgow.id, ROUTE_398_SEED);
  const routes = listRoutes(db);
  const route = routes.find((r) => r.id === routeId)!;
  assert(route.number === "398", "398: real number seeded");
  assert(route.colour === "#002462", "398: real extracted colour seeded (flagged discrepancy vs DESIGN.md's #002664, see seed module header)");
  assert(route.points.length === 6, "398: real 6-point loop seeded");
  assert(route.terminusIndex === null && route.startIndex === null, "398: no terminus loop (DESIGN.md calls it one, but the real saved row has neither set — same real-save-wins convention)");
  const timetables = listRouteTimetablesForRoute(db, routeId);
  assert(timetables.length === 3, "398: 3 real timetable components (Mon-Fri/Sat/Sun) seeded");
  assert(timetables.every((t) => t.direction === "both"), "398: every component is direction 'both', matching the real saved data");
})();

// --- Airlink 100 — real player-placed stops substituted -----------------
await (async () => {
  const [routeId] = await seedSingleFixedContractRoute(ports, edinburgh.id, AIRLINK_100_SEED);
  const routes = listRoutes(db);
  const route = routes.find((r) => r.id === routeId)!;
  assert(route.number === "100", "Airlink 100: real number seeded");
  assert(route.points.length === 30, "Airlink 100: real 30-point route seeded");
  assert(route.pickupDropoffOverrides.length === 21, "Airlink 100: all 21 real pickup/setdown overrides seeded");
  // Points 6 and 13 were the real save's own negative-osmId (player-placed
  // stop) points — confirm each got a REAL new player_stops row with the
  // real extracted lon/lat, not a dangling reference to the old save's id.
  const point6 = route.points[6];
  const point13 = route.points[13];
  assert(point6.osmId! < 0 && point13.osmId! < 0, "Airlink 100: both placed-stop points got fresh NEGATIVE ids (new player_stops rows), not positive OSM ids");
  assert(point6.osmId !== point13.osmId, "Airlink 100: the two distinct real positions got two DISTINCT new player stops");
  const stops = listPlayerStops(db);
  assert(stops.length === 2, "Airlink 100: exactly 2 new player_stops rows created (one per real placedStop position)");
  const timetables = listRouteTimetablesForRoute(db, routeId);
  assert(timetables.length === 7, "Airlink 100: all 7 real timetable components (incl. the saved save's own redundant 'both' row for Sunday) seeded");
})();

// --- AIR — parent + 2 minor variations, SHARED placed stops reused ------
await (async () => {
  const stopsBefore = listPlayerStops(db).length;
  const [parentId, viaGarrowhillId, viaGarrowhillEurocentralId] = await seedAirFixedContractRoutes(ports, glasgow.id);
  const routes = listRoutes(db);
  const parent = routes.find((r) => r.id === parentId)!;
  const viaGarrowhill = routes.find((r) => r.id === viaGarrowhillId)!;
  const viaGarrowhillEurocentral = routes.find((r) => r.id === viaGarrowhillEurocentralId)!;

  assert(parent.number === "AIR" && parent.name === "AIR", "AIR parent: real number/name seeded");
  assert(parent.parentRouteId === null, "AIR parent: no parent of its own");
  assert(viaGarrowhill.parentRouteId === parentId, "AIR via Garrowhill: real parent_route_id links to the NEW parent id, not the old save's 52");
  assert(viaGarrowhillEurocentral.parentRouteId === parentId, "AIR via Garrowhill & Eurocentral: same real new parent id");
  assert(viaGarrowhill.isMinorVariation === true && viaGarrowhillEurocentral.isMinorVariation === true, "both AIR variations seeded as real minor variations, matching the live save");

  assert(parent.points.length === 19, "AIR parent: real 19-point route seeded");
  assert(viaGarrowhill.points.length === 19, "AIR via Garrowhill: real 19-point route seeded");
  assert(viaGarrowhillEurocentral.points.length === 24, "AIR via Garrowhill & Eurocentral: real 24-point route seeded");

  // The two "via Garrowhill" detour positions are shared across BOTH
  // variations in the real save — confirm the seeding pass created each
  // DISTINCT position only ONCE and reused it, not duplicated per
  // variation.
  const stopsAfter = listPlayerStops(db).length;
  assert(stopsAfter - stopsBefore === 2, `AIR: exactly 2 NEW player stops created across both variations combined (shared, not duplicated) — got ${stopsAfter - stopsBefore}`);
  const garrowhillStopId = viaGarrowhill.points[7].osmId!;
  const garrowhillStopIdInEurocentral = viaGarrowhillEurocentral.points[10].osmId!;
  assert(garrowhillStopId === garrowhillStopIdInEurocentral, "the same real detour position reuses the SAME new player-stop id across both AIR variations");

  const parentTimetables = listRouteTimetablesForRoute(db, parentId);
  const viaGarrowhillTimetables = listRouteTimetablesForRoute(db, viaGarrowhillId);
  const viaGarrowhillEurocentralTimetables = listRouteTimetablesForRoute(db, viaGarrowhillEurocentralId);
  assert(parentTimetables.length === 2, "AIR parent: 2 real timetable components seeded");
  assert(viaGarrowhillTimetables.length === 2, "AIR via Garrowhill: 2 real timetable components seeded");
  assert(viaGarrowhillEurocentralTimetables.length === 2, "AIR via Garrowhill & Eurocentral: 2 real timetable components seeded");
})();

// --- Express 500 ----------------------------------------------------------
await (async () => {
  const [routeId] = await seedSingleFixedContractRoute(ports, glasgow.id, EXPRESS_500_SEED);
  const routes = listRoutes(db);
  const route = routes.find((r) => r.id === routeId)!;
  assert(route.number === "500", "Express 500: real number seeded");
  assert(route.routeType === "airport_express", "Express 500: real airport_express route type seeded");
  assert(route.points.length === 14, "Express 500: real 14-point route seeded");
  assert(route.terminusIndex === 7 && route.startIndex === 7, "Express 500: real terminus/start index (7) seeded");
  const timetables = listRouteTimetablesForRoute(db, routeId);
  assert(timetables.length === 2, "Express 500: 2 real timetable components (inbound/outbound) seeded");
})();

console.log("All fixed-contract-route-seed-data.mts round-trip checks passed.");
