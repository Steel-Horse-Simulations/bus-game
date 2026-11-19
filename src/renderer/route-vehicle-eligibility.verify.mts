// Manual verification script for route-vehicle-eligibility.mts, run
// directly with `node --experimental-strip-types
// src/renderer/route-vehicle-eligibility.verify.mts` — same pattern as
// fare-journey.verify.mts.
import { vehicleRestrictionReason, routeRestrictionsCompatible, type EligibilityVehicle } from "./route-vehicle-eligibility.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function route(overrides: Partial<Route> = {}): Route {
  return {
    id: 1,
    depotGroupId: 1,
    number: "1",
    points: [],
    orientation: "outbound",
    terminusIndex: null,
    startIndex: null,
    colour: "#3b82f6",
    name: null,
    pickupDropoffOverrides: [],
    timingPointIndexes: [],
    parentRouteId: null,
    variationLetter: null,
    composedFromRouteIds: [],
    hailAndRideSections: [],
    segments: [],
    routeType: "ordinary",
    isMinorVariation: false,
    assignedLiveryId: null,
    useBrandedColour: false,
    vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: null },
    ...overrides,
  };
}

function vehicle(overrides: Partial<EligibilityVehicle> = {}): EligibilityVehicle {
  return {
    category: "Double-deckers",
    powerType: "diesel",
    lengthM: 10.5,
    liveryId: 1,
    ...overrides,
  };
}

// No restriction set on any axis at all, no OSM limit found either — fully
// eligible no matter what the vehicle is.
{
  const r = route();
  const reason = vehicleRestrictionReason(r, vehicle(), Infinity, Infinity, Infinity, Infinity);
  assert(reason === null, "a route with every axis unset accepts any vehicle");
}

// --- Manual axis: base type ---
{
  const r = route({ vehicleRestrictions: { baseType: "Minibus", powerType: null, axleCount: null, liveryId: null } });
  const matching = vehicleRestrictionReason(r, vehicle({ category: "Minibus" }), Infinity, Infinity, Infinity, Infinity);
  assert(matching === null, "base-type restriction: a matching category is accepted");
  const mismatching = vehicleRestrictionReason(r, vehicle({ category: "Double-deckers" }), Infinity, Infinity, Infinity, Infinity);
  assert(mismatching !== null, "base-type restriction: a mismatched category (double-decker vs minibus-only) is blocked");
}

// --- Manual axis: power type ---
{
  const r = route({ vehicleRestrictions: { baseType: null, powerType: "electric", axleCount: null, liveryId: null } });
  const matching = vehicleRestrictionReason(r, vehicle({ powerType: "electric" }), Infinity, Infinity, Infinity, Infinity);
  assert(matching === null, "power-type restriction: a matching power is accepted");
  const mismatching = vehicleRestrictionReason(r, vehicle({ powerType: "diesel" }), Infinity, Infinity, Infinity, Infinity);
  assert(mismatching !== null, "power-type restriction: a mismatched power (diesel vs electric-only) is blocked");
}

// --- Manual axis: axle count (derived from lengthM via axleCountForLength:
// twin-axle up to and including 12.9m, tri-axle above) ---
{
  const r = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: "tri-axle", liveryId: null } });
  const matching = vehicleRestrictionReason(r, vehicle({ lengthM: 13.5 }), Infinity, Infinity, Infinity, Infinity);
  assert(matching === null, "axle-count restriction: a matching (tri-axle, >12.9m) length is accepted");
  const mismatching = vehicleRestrictionReason(r, vehicle({ lengthM: 10.5 }), Infinity, Infinity, Infinity, Infinity);
  assert(mismatching !== null, "axle-count restriction: a mismatched (twin-axle, <=12.9m) length is blocked");
}

// --- Livery axis ---
{
  const r = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: 42 } });
  const matching = vehicleRestrictionReason(r, vehicle({ liveryId: 42 }), Infinity, Infinity, Infinity, Infinity);
  assert(matching === null, "livery restriction: the exact required liveryId is accepted");
  const mismatching = vehicleRestrictionReason(r, vehicle({ liveryId: 7 }), Infinity, Infinity, Infinity, Infinity);
  assert(mismatching !== null, "livery restriction: a different liveryId is blocked");
  const unset = vehicleRestrictionReason(r, vehicle({ liveryId: null }), Infinity, Infinity, Infinity, Infinity);
  assert(unset !== null, "livery restriction: a vehicle with no livery at all is blocked just like a mismatched one");
}

// --- OSM axis (Q18): a vehicle with no figure on record yet for an axis
// (undefined) is never blocked by it, regardless of how restrictive the
// route's own real figure is; a vehicle that DOES have a figure is blocked
// only once it strictly exceeds the route's own minimum — exactly at the
// boundary is still allowed (the posted limit is "up to and including").
{
  const r = route();
  const noFigureOnRecord = vehicleRestrictionReason(r, vehicle({ weightTonnes: undefined }), 7.5, Infinity, Infinity, Infinity);
  assert(noFigureOnRecord === null, "OSM weight axis: a vehicle with no weight figure on record is never blocked, however low the route's own limit");

  const atBoundary = vehicleRestrictionReason(r, vehicle({ weightTonnes: 7.5 }), 7.5, Infinity, Infinity, Infinity);
  assert(atBoundary === null, "OSM weight axis: a vehicle exactly at the route's own limit (7.5t = 7.5t) is allowed, not blocked");

  const overBoundary = vehicleRestrictionReason(r, vehicle({ weightTonnes: 7.6 }), 7.5, Infinity, Infinity, Infinity);
  assert(overBoundary !== null, "OSM weight axis: a vehicle just over the route's own limit (7.6t > 7.5t) is blocked");
}
{
  const r = route();
  const noFigureOnRecord = vehicleRestrictionReason(r, vehicle({ heightM: undefined }), Infinity, 4.0, Infinity, Infinity);
  assert(noFigureOnRecord === null, "OSM height axis: a vehicle with no height figure on record is never blocked");
  const atBoundary = vehicleRestrictionReason(r, vehicle({ heightM: 4.0 }), Infinity, 4.0, Infinity, Infinity);
  assert(atBoundary === null, "OSM height axis: exactly at the limit is allowed");
  const overBoundary = vehicleRestrictionReason(r, vehicle({ heightM: 4.01 }), Infinity, 4.0, Infinity, Infinity);
  assert(overBoundary !== null, "OSM height axis: just over the limit is blocked");
}
{
  // lengthM has no "undefined" state on EligibilityVehicle (every real
  // vehicle has a real length) — only the boundary behaviour is tested.
  const r = route();
  const atBoundary = vehicleRestrictionReason(r, vehicle({ lengthM: 12.0 }), Infinity, Infinity, 12.0, Infinity);
  assert(atBoundary === null, "OSM length axis: exactly at the limit is allowed");
  const overBoundary = vehicleRestrictionReason(r, vehicle({ lengthM: 12.1 }), Infinity, Infinity, 12.0, Infinity);
  assert(overBoundary !== null, "OSM length axis: just over the limit is blocked");
}
{
  const r = route();
  const noFigureOnRecord = vehicleRestrictionReason(r, vehicle({ widthM: undefined }), Infinity, Infinity, Infinity, 2.3);
  assert(noFigureOnRecord === null, "OSM width axis: a vehicle with no width figure on record is never blocked");
  const atBoundary = vehicleRestrictionReason(r, vehicle({ widthM: 2.3 }), Infinity, Infinity, Infinity, 2.3);
  assert(atBoundary === null, "OSM width axis: exactly at the limit is allowed");
  const overBoundary = vehicleRestrictionReason(r, vehicle({ widthM: 2.4 }), Infinity, Infinity, Infinity, 2.3);
  assert(overBoundary !== null, "OSM width axis: just over the limit is blocked");
}

// A route with no restricted road at all on an axis (Infinity, the
// router's own "no restriction found" sentinel) never blocks any vehicle
// on that axis, no matter how large the vehicle's own real figure is.
{
  const r = route();
  const reason = vehicleRestrictionReason(r, vehicle({ heightM: 99 }), Infinity, Infinity, Infinity, Infinity);
  assert(reason === null, "OSM axis: Infinity (no restricted road found) never blocks any vehicle, however tall/heavy/long/wide");
}

// --- routeRestrictionsCompatible: route-to-route (no vehicle involved at
// all), used by duty-panel's own canFollow/cachedCanFollow ---
{
  const unset = route();
  assert(routeRestrictionsCompatible(unset, unset) === true, "two routes with every axis unset are compatible");
}
{
  const minibusOnly = route({ vehicleRestrictions: { baseType: "Minibus", powerType: null, axleCount: null, liveryId: null } });
  const doubleDeckerOnly = route({ vehicleRestrictions: { baseType: "Double-deckers", powerType: null, axleCount: null, liveryId: null } });
  assert(
    routeRestrictionsCompatible(minibusOnly, doubleDeckerOnly) === false,
    "base-type conflict: a minibus-only route and a double-decker-only route are incompatible (the user's own worked example)",
  );
  assert(
    routeRestrictionsCompatible(minibusOnly, route()) === true,
    "base-type: a restricted route is compatible with an unrestricted one (nothing to conflict with)",
  );
  const alsoMinibus = route({ vehicleRestrictions: { baseType: "Minibus", powerType: null, axleCount: null, liveryId: null } });
  assert(routeRestrictionsCompatible(minibusOnly, alsoMinibus) === true, "base-type: two routes requiring the SAME category are compatible");
}
{
  const electricOnly = route({ vehicleRestrictions: { baseType: null, powerType: "electric", axleCount: null, liveryId: null } });
  const dieselOnly = route({ vehicleRestrictions: { baseType: null, powerType: "diesel", axleCount: null, liveryId: null } });
  assert(routeRestrictionsCompatible(electricOnly, dieselOnly) === false, "power-type conflict: electric-only vs diesel-only routes are incompatible");
  assert(routeRestrictionsCompatible(electricOnly, route()) === true, "power-type: a restricted route is compatible with an unrestricted one");
}
{
  const twinOnly = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: "twin-axle", liveryId: null } });
  const triOnly = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: "tri-axle", liveryId: null } });
  assert(routeRestrictionsCompatible(twinOnly, triOnly) === false, "axle-count conflict: twin-axle-only vs tri-axle-only routes are incompatible");
  assert(routeRestrictionsCompatible(twinOnly, route()) === true, "axle-count: a restricted route is compatible with an unrestricted one");
}
{
  const liveryA = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: 1 } });
  const liveryB = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: 2 } });
  assert(routeRestrictionsCompatible(liveryA, liveryB) === false, "livery conflict: two different required liveries are incompatible");
  const liveryAAgain = route({ vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: 1 } });
  assert(routeRestrictionsCompatible(liveryA, liveryAAgain) === true, "livery: two routes requiring the SAME livery are compatible");
  assert(routeRestrictionsCompatible(liveryA, route()) === true, "livery: a restricted route is compatible with an unrestricted one");
}
{
  // Compatible together: every axis individually either matches or is
  // unset on at least one side — a realistic "both happen to be minibus
  // routes, one also diesel-only" pairing.
  const a = route({ vehicleRestrictions: { baseType: "Minibus", powerType: "diesel", axleCount: null, liveryId: null } });
  const b = route({ vehicleRestrictions: { baseType: "Minibus", powerType: null, axleCount: null, liveryId: null } });
  assert(routeRestrictionsCompatible(a, b) === true, "every axis either matches or is unset on at least one side: compatible");
}

console.log("All route-vehicle-eligibility checks passed.");
