// Manual verification for fare-pricing-panel.ts's pure gating logic
// (fareRequirements/missingFields), run directly with `npx tsx
// src/renderer/fare-pricing-panel.verify.mts`. Route types (2026-10-31):
// Night/Airport Express/Sightseeing/Long-distance sections are derived
// from whether the depot group has a route of that type, replacing the
// old manual "runs night services" checkbox — this is the real proof that
// derivation actually works, not just that it compiles.
import { fareRequirements, missingFields } from "./fare-pricing-panel.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function emptyConfig(): FareConfig {
  return {
    depotGroupId: 1,
    citySingleGBPPence: null,
    beyondDepotGroupPerMileGBPPence: null,
    longDistanceBaseGBPPence: null,
    longDistancePerMileGBPPence: null,
    airportExpressSingleGBPPence: null,
    airportExpressReturnGBPPence: null,
    nightExtraBaseGBPPence: null,
    nightExtraPerZoneGBPPence: null,
    lateGBPPence: null,
    networkMarkupPercent: null,
    sightseeingDayGBPPence: null,
    sightseeingSingleGBPPence: null,
    cityDayGBPPence: null,
    cityWeeklyGBPPence: null,
    countryDayGBPPence: null,
    countryWeeklyGBPPence: null,
    combinedDayGBPPence: null,
    combinedWeeklyGBPPence: null,
    islandDayGBPPence: null,
    islandWeeklyGBPPence: null,
    islandLateGBPPence: null,
  };
}

function route(routeType: RouteType, depotGroupId = 1): Route {
  return {
    id: 1,
    depotGroupId,
    number: "1",
    points: [],
    orientation: "outbound",
    terminusIndex: null,
    startIndex: null,
    colour: "#000000",
    name: null,
    pickupDropoffOverrides: [],
    parentRouteId: null,
    variationLetter: null,
    composedFromRouteIds: [],
    hailAndRideSections: [],
    segments: [],
    routeType,
  };
}

// --- A depot group with no night-type route shows no LATE/night fields ---
const noNightReq = fareRequirements([], [route("ordinary")], emptyConfig());
assert(noNightReq.needsNight === false, "no night-type route -> needsNight is false, no manual toggle anywhere");
assert(noNightReq.needsAirportExpress === false, "no airport_express-type route -> needsAirportExpress is false");
assert(noNightReq.needsSightseeing === false, "no sightseeing-type route -> needsSightseeing is false");
assert(noNightReq.needsLongDistance === false, "no long_distance-type route -> needsLongDistance is false");

// --- One with a night-type route does ---
const withNightReq = fareRequirements([], [route("ordinary"), route("night")], emptyConfig());
assert(withNightReq.needsNight === true, "a night-type route among others -> needsNight is true");

// --- Each type gates independently ---
assert(fareRequirements([], [route("airport_express")], emptyConfig()).needsAirportExpress === true, "airport_express route -> needsAirportExpress true");
assert(fareRequirements([], [route("sightseeing")], emptyConfig()).needsSightseeing === true, "sightseeing route -> needsSightseeing true");
assert(fareRequirements([], [route("long_distance")], emptyConfig()).needsLongDistance === true, "long_distance route -> needsLongDistance true");

// --- missingFields reflects the same derivation, not a stale/manual flag ---
assert(
  missingFields([], [route("ordinary")], [], [], emptyConfig()).includes("LATE") === false,
  "no night-type route -> LATE is never flagged missing, since the section wouldn't even show",
);
assert(
  missingFields([], [route("night")], [], [], emptyConfig()).includes("LATE"),
  "a night-type route with no LATE price set -> LATE is flagged missing",
);
assert(
  missingFields([], [route("airport_express")], [], [], emptyConfig()).includes("Airport Express Single"),
  "an airport_express-type route with no Single price set -> flagged missing",
);
assert(
  missingFields([], [route("sightseeing")], [], [], emptyConfig()).includes("Sightseeing day ticket"),
  "a sightseeing-type route with no day-ticket price set -> flagged missing",
);
assert(
  missingFields([], [route("long_distance")], [], [], emptyConfig()).includes("Long distance base fare"),
  "a long_distance-type route with no base fare set -> flagged missing",
);

console.log("All fare-pricing-panel gating checks passed.");
