// Q18+Q19 — vehicle eligibility for a route (OPEN-ITEMS.md Q18+Q19 plan).
// Pure logic, no DOM/IPC dependency (same convention as fare-journey.mts),
// so it's safely importable from the vehicle buy/configure screen, the
// duty panel, and a verify script alike.
//
// Two independent axes, both hard blocks (a vehicle that fails either one
// simply cannot be assigned, full stop — confirmed in the plan, not a soft
// warning):
//   1. Manual, player-set (Q19) — base type/power type/axle count/livery,
//      each one only checked when the route actually has that axis set
//      (`route.vehicleRestrictions.<axis> !== null`); unset means "any
//      vehicle qualifies on that axis."
//   2. Automatic, from real OSM road data (Q18) — the route's own
//      most-restrictive maxweight/maxheight/maxlength/maxwidth tag,
//      already resolved by the caller via the router's §B getters
//      (`last_route_min_maxweight_tonnes` etc. in game-wasm) and passed in
//      as plain numbers, `Infinity` meaning "no restriction found on this
//      axis" (the router's own sentinel — never a real OSM figure). A
//      vehicle with no figure set yet on a given axis (vehicle-
//      catalogue.mts's own "a deliberate exception to vehicle specs last,
//      still being populated model by model" state) never fails that axis
//      either — `undefined` there means "no real figure on record," not
//      "zero," so it can't be compared at all.
//
// Deliberately NOT built here (see the plan's own "flagged, not resolved"
// section): no real vehicle-to-duty/journey assignment exists anywhere in
// this codebase yet, so `vehicleRestrictionReason` below is only ever
// called where a route AND a specific vehicle are both genuinely in hand
// (buy/configure, when buying for a specific route) — not at duty-build
// time, where `routeRestrictionsCompatible` (route-to-route, no vehicle)
// is the real, buildable-today check instead.

import { axleCountForLength, type PowerType, type VehicleCategory } from "./vehicle-catalogue.mts";

export interface EligibilityVehicle {
  category: VehicleCategory;
  powerType: PowerType;
  lengthM: number;
  liveryId: number | null;
  // Real-world dimensions — undefined means "no real figure on record yet"
  // (vehicle-catalogue.mts's own LengthVariant.heightM/widthM/weightTonnes
  // doc comment), never "zero" or "no restriction." Only ever compared
  // against a route's own min-along-route figure when both this and that
  // figure are real numbers.
  heightM?: number;
  weightTonnes?: number;
  widthM?: number;
}

// Combines both axes into a single reason a vehicle can't run a route, or
// `null` if it's fully eligible. `minMaxweightTonnes`/`minMaxheightM`/
// `minMaxlengthM`/`minMaxwidthM` are the route's own most-restrictive real
// OSM figures (§B's router getters) — `Infinity` for "none found," never a
// real figure of 0.
export function vehicleRestrictionReason(
  route: Route,
  vehicle: EligibilityVehicle,
  minMaxweightTonnes: number,
  minMaxheightM: number,
  minMaxlengthM: number,
  minMaxwidthM: number,
): string | null {
  const r = route.vehicleRestrictions;

  // --- Manual axis (Q19) ---
  if (r.baseType !== null && vehicle.category !== r.baseType) {
    return `Route ${route.number} is restricted to ${r.baseType} vehicles.`;
  }
  if (r.powerType !== null && vehicle.powerType !== r.powerType) {
    return `Route ${route.number} is restricted to ${r.powerType} vehicles.`;
  }
  if (r.axleCount !== null && axleCountForLength(vehicle.lengthM) !== r.axleCount) {
    return `Route ${route.number} is restricted to ${r.axleCount} vehicles.`;
  }

  // --- Livery axis — a new, route-level lock, additional to (not
  // replacing) the existing per-vehicle-model livery locks checked
  // elsewhere (liveryUnavailableReason). ---
  if (r.liveryId !== null && vehicle.liveryId !== r.liveryId) {
    return `Route ${route.number} is restricted to a specific livery.`;
  }

  // --- Automatic axis (Q18): real OSM road limits. A vehicle with no
  // figure set yet on an axis (`undefined`) never fails that axis; a
  // route with no restricted road on an axis (`Infinity`) never blocks
  // anything on it either. Only ever a hard "exceeds the real limit"
  // check, never "exactly at the limit" — a vehicle at precisely the
  // posted limit is allowed, matching how a real maxweight/maxheight/
  // maxlength/maxwidth tag is read on the road (it's the figure you're
  // allowed up to and including, not excluded at). ---
  if (vehicle.weightTonnes !== undefined && Number.isFinite(minMaxweightTonnes) && vehicle.weightTonnes > minMaxweightTonnes) {
    return `This vehicle (${vehicle.weightTonnes}t) is too heavy for a road used by route ${route.number} (limit ${minMaxweightTonnes}t).`;
  }
  if (vehicle.heightM !== undefined && Number.isFinite(minMaxheightM) && vehicle.heightM > minMaxheightM) {
    return `This vehicle (${vehicle.heightM}m) is too tall for a road used by route ${route.number} (limit ${minMaxheightM}m).`;
  }
  if (Number.isFinite(minMaxlengthM) && vehicle.lengthM > minMaxlengthM) {
    return `This vehicle (${vehicle.lengthM}m) is too long for a road used by route ${route.number} (limit ${minMaxlengthM}m).`;
  }
  if (vehicle.widthM !== undefined && Number.isFinite(minMaxwidthM) && vehicle.widthM > minMaxwidthM) {
    return `This vehicle (${vehicle.widthM}m) is too wide for a road used by route ${route.number} (limit ${minMaxwidthM}m).`;
  }

  return null;
}

// Route-to-route compatibility for a duty's own pieces (OPEN-ITEMS.md's own
// confirmed ground truth: no `Duty.vehicleId` exists, so "this duty can't
// mix a minibus-only route and a double-decker-only route" is checked here
// at the route level — not real vehicle-to-duty assignment, which doesn't
// exist yet). For each of the 4 manual axes, a conflict only exists when
// BOTH routes have that axis set AND the values differ; either route
// leaving the axis unset is always compatible with anything on it. The
// automatic OSM axis has no equivalent here — it's a per-vehicle physical
// limit, not a property either route "is," so there's nothing to compare
// between two routes on it.
export function routeRestrictionsCompatible(a: Route, b: Route): boolean {
  const ra = a.vehicleRestrictions;
  const rb = b.vehicleRestrictions;
  if (ra.baseType !== null && rb.baseType !== null && ra.baseType !== rb.baseType) return false;
  if (ra.powerType !== null && rb.powerType !== null && ra.powerType !== rb.powerType) return false;
  if (ra.axleCount !== null && rb.axleCount !== null && ra.axleCount !== rb.axleCount) return false;
  if (ra.liveryId !== null && rb.liveryId !== null && ra.liveryId !== rb.liveryId) return false;
  return true;
}
