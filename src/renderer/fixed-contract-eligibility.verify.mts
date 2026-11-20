// Manual verification script for fixed-contract-eligibility.mts, run
// directly with `node --experimental-strip-types
// src/renderer/fixed-contract-eligibility.verify.mts` (this project's own
// convention — no build step, plain assert()).
import {
  haversineKm,
  GLASGOW_CITY_CENTRE,
  BUCHANAN_BUS_STATION,
  EDINBURGH_CITY_CENTRE,
  THURSO_TOWN_CENTRE,
  WICK_TOWN_CENTRE,
  CAITHNESS_TOWN_RADIUS_KM,
  isRoute398Eligible,
  isAirlink100Eligible,
  hasEnoughRoutesAtBuchanan,
  isRoute77RunningForRequiredPeriod,
  isExpress500Eligible,
  isAirEligible,
  isSkyLinkEligible,
  isDounreayRouteEligible,
  hasDepotInThurso,
  hasDepotInWick,
  countFulfilledDounreayContracts,
  is800803805Eligible,
  splitInitialFleetCost,
  computeActivationGameDay,
  type EligibilityRoute,
  type EligibilityDepot,
  type DounreayContractState,
} from "./fixed-contract-eligibility.mts";
import { addMonths } from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- haversineKm sanity -----------------------------------------------
assert(haversineKm(GLASGOW_CITY_CENTRE, GLASGOW_CITY_CENTRE) === 0, "distance from a point to itself is 0");
const edinGlasgowKm = haversineKm(GLASGOW_CITY_CENTRE, EDINBURGH_CITY_CENTRE);
assert(edinGlasgowKm > 60 && edinGlasgowKm < 90, `Glasgow<->Edinburgh real distance plausible (got ${edinGlasgowKm.toFixed(1)}km)`);

// Thurso/Wick real distance: confirmed genuinely far enough apart (~30km)
// that 5km radii each (CAITHNESS_TOWN_RADIUS_KM) leave a wide gap, not an
// overlap — the exact judgement call this module's own header flags.
const thursoWickKm = haversineKm(THURSO_TOWN_CENTRE, WICK_TOWN_CENTRE);
assert(thursoWickKm > 25 && thursoWickKm < 35, `Thurso<->Wick real distance plausible (got ${thursoWickKm.toFixed(1)}km)`);
assert(thursoWickKm > 2 * CAITHNESS_TOWN_RADIUS_KM, "Thurso/Wick radii don't overlap at all");

// --- 398 — "at least 2 services running into Glasgow city centre" ----
const routeIntoGlasgow = (id: number): EligibilityRoute => ({ id, number: String(id), points: [{ lon: GLASGOW_CITY_CENTRE.lon, lat: GLASGOW_CITY_CENTRE.lat }] });
const routeFarAway: EligibilityRoute = { id: 99, number: "99", points: [{ lon: -3.0, lat: 56.5 }] };
assert(isRoute398Eligible([]) === false, "398: no routes at all -> not eligible");
assert(isRoute398Eligible([routeIntoGlasgow(1)]) === false, "398: only 1 route into Glasgow -> not eligible");
assert(isRoute398Eligible([routeIntoGlasgow(1), routeIntoGlasgow(2)]) === true, "398: 2 routes into Glasgow -> eligible");
assert(isRoute398Eligible([routeIntoGlasgow(1), routeFarAway]) === false, "398: 1 into Glasgow + 1 far away -> not eligible");

// --- Airlink 100 — "a depot within Edinburgh's city boundaries" ------
const depotIn = (id: number, lon: number, lat: number): EligibilityDepot => ({ id, depotGroupId: 1, lon, lat });
assert(isAirlink100Eligible([]) === false, "Airlink 100: no depots -> not eligible");
assert(isAirlink100Eligible([depotIn(1, EDINBURGH_CITY_CENTRE.lon, EDINBURGH_CITY_CENTRE.lat)]) === true, "Airlink 100: depot at Princes Street -> eligible");
assert(isAirlink100Eligible([depotIn(1, -4.25, 55.86)]) === false, "Airlink 100: depot in Glasgow -> not eligible");

// --- Express 500 — Buchanan + Route 77 running for 1 month -----------
const routeAtBuchanan = (id: number): EligibilityRoute => ({ id, number: String(id), points: [{ lon: BUCHANAN_BUS_STATION.lon, lat: BUCHANAN_BUS_STATION.lat }] });
assert(hasEnoughRoutesAtBuchanan([routeAtBuchanan(1), routeAtBuchanan(2)]) === false, "Buchanan: only 2 routes -> not enough");
assert(hasEnoughRoutesAtBuchanan([routeAtBuchanan(1), routeAtBuchanan(2), routeAtBuchanan(3)]) === true, "Buchanan: 3 routes -> enough");
assert(isRoute77RunningForRequiredPeriod(null, 100, addMonths) === false, "Route 77: never seen -> not running long enough");
assert(isRoute77RunningForRequiredPeriod(0, 29, addMonths) === false, "Route 77: seen 29 days ago, 1 month not yet up");
assert(isRoute77RunningForRequiredPeriod(0, 31, addMonths) === true, "Route 77: seen 31 days ago (a real calendar month later) -> running long enough");
const threeAtBuchanan = [routeAtBuchanan(1), routeAtBuchanan(2), routeAtBuchanan(3)];
assert(isExpress500Eligible(threeAtBuchanan, 0, 31, addMonths) === true, "Express 500: both conditions met -> eligible");
assert(isExpress500Eligible(threeAtBuchanan, 0, 20, addMonths) === false, "Express 500: Buchanan met but Route 77 not long enough -> not eligible");
assert(isExpress500Eligible([routeAtBuchanan(1)], 0, 31, addMonths) === false, "Express 500: Route 77 long enough but not enough Buchanan routes -> not eligible");

// --- AIR — both run successfully for 2 weeks each ---------------------
assert(isAirEligible(null, false, null, false, 100) === false, "AIR: neither accepted -> not eligible");
assert(isAirEligible(0, false, 0, false, 13) === false, "AIR: both activated but only 13 days elapsed -> not eligible");
assert(isAirEligible(0, false, 0, false, 14) === true, "AIR: both activated, exactly 14 days -> eligible");
assert(isAirEligible(0, true, 0, false, 30) === false, "AIR: Express 500 currently suspended -> not eligible");
assert(isAirEligible(0, false, 0, true, 30) === false, "AIR: Airlink 100 currently suspended -> not eligible");

// --- SkyLink — dormant forever -----------------------------------------
assert(isSkyLinkEligible() === false, "SkyLink is always false (dormant, no real route exists yet)");

// --- Dounreay, 8 real routes, town-gated -------------------------------
const depotInThurso = [depotIn(1, THURSO_TOWN_CENTRE.lon, THURSO_TOWN_CENTRE.lat)];
const depotInWick = [depotIn(2, WICK_TOWN_CENTRE.lon, WICK_TOWN_CENTRE.lat)];
assert(hasDepotInThurso(depotInThurso) === true, "a depot at Thurso's own real centre reads as in Thurso");
assert(hasDepotInThurso(depotInWick) === false, "a depot at Wick does not read as in Thurso");
assert(hasDepotInWick(depotInWick) === true, "a depot at Wick's own real centre reads as in Wick");
assert(isDounreayRouteEligible("74", depotInThurso) === true, "74 (Thurso route) eligible with a Thurso depot");
assert(isDounreayRouteEligible("74", depotInWick) === false, "74 (Thurso route) NOT eligible with only a Wick depot");
assert(isDounreayRouteEligible("276", depotInWick) === true, "276 (Wick route) eligible with a Wick depot");
assert(isDounreayRouteEligible("276", depotInThurso) === false, "276 (Wick route) NOT eligible with only a Thurso depot");
assert(isDounreayRouteEligible("921", depotInThurso) === true, "921 (Thurso route) eligible with a Thurso depot");
assert(isDounreayRouteEligible("999", depotInThurso) === false, "a non-Dounreay number is never eligible through this gate");
// Each independently, not sequential — Wick eligible with no Thurso depot at all.
assert(isDounreayRouteEligible("281", []) === false, "281 (Wick route) not eligible with no depots at all");

// --- 800/803/805 — half of Dounreay fulfilled --------------------------
const state = (routeNumber: string, isAccepted: boolean, isFullySuspended = false): DounreayContractState => ({ routeNumber, isAccepted, isFullySuspended });
const noneAccepted = ["74", "274", "275", "276", "280", "281", "282", "921"].map((n) => state(n, false));
assert(countFulfilledDounreayContracts(noneAccepted) === 0, "0 Dounreay contracts accepted -> 0 fulfilled");
assert(is800803805Eligible(noneAccepted) === false, "0/8 fulfilled -> 800/803/805 not eligible");
const threeAccepted = [state("74", true), state("274", true), state("275", true), state("276", false), state("280", false), state("281", false), state("282", false), state("921", false)];
assert(countFulfilledDounreayContracts(threeAccepted) === 3, "3 accepted -> 3 fulfilled");
assert(is800803805Eligible(threeAccepted) === false, "3/8 fulfilled -> 800/803/805 not eligible yet");
const fourAccepted = [state("74", true), state("274", true), state("275", true), state("276", true), state("280", false), state("281", false), state("282", false), state("921", false)];
assert(countFulfilledDounreayContracts(fourAccepted) === 4, "4 accepted -> 4 fulfilled");
assert(is800803805Eligible(fourAccepted) === true, "4/8 fulfilled (exactly half) -> 800/803/805 eligible");
// Dounreay's own confirmed exception: a fully-suspended route doesn't count as fulfilled, even if accepted.
const oneFullySuspended = [state("74", true, true), state("274", true), state("275", true), state("276", true), state("280", false), state("281", false), state("282", false), state("921", false)];
assert(countFulfilledDounreayContracts(oneFullySuspended) === 3, "an accepted-but-fully-suspended route does not count as fulfilled");
assert(is800803805Eligible(oneFullySuspended) === false, "3 real fulfilled (one accepted route is fully suspended) -> 800/803/805 not eligible");
// Split doesn't matter — "any 4 of the 8," confirmed reading.
const fourAllThurso = [state("74", true), state("274", true), state("280", true), state("921", true), state("275", false), state("276", false), state("281", false), state("282", false)];
assert(is800803805Eligible(fourAllThurso) === true, "4 fulfilled, all from Thurso's own 4 -> still eligible (split doesn't matter)");

// --- Initial fleet subsidy split: 75%/25% ------------------------------
const split = splitInitialFleetCost(3, 10_000_00); // 3 vehicles at £10,000 each (illustrative, not a real price)
assert(split.councilPaysGBPPence + split.playerPaysGBPPence === 3 * 10_000_00, "split adds back up to the full real total");
assert(split.councilPaysGBPPence === Math.round(3 * 10_000_00 * 0.75), "council pays exactly 75%");

// --- computeActivationGameDay — "first Monday after a minimum of 10
// days have passed" -----------------------------------------------------
// Game day 0 is Year 1, January 1st, a Monday (game-clock.mts's own
// epoch comment) — weekday cycles flat every 7 days from there, so
// weekday(day) = day % 7 (0 = Monday).
assert(computeActivationGameDay(4) === 14, "accepted on day 4 (Friday): day 4+10=14 is itself a Monday -> activates exactly on day 14, no extra wait");
assert(computeActivationGameDay(0) === 14, "accepted on day 0 (Monday): day 10 is a Thursday -> next Monday is day 14");
assert(computeActivationGameDay(1) === 14, "accepted on day 1 (Tuesday): day 11 is a Friday -> next Monday is day 14");
assert(computeActivationGameDay(5) === 21, "accepted on day 5 (Saturday): day 15 is a Tuesday -> next Monday is day 21");

console.log("All fixed-contract-eligibility.mts checks passed.");
