// Eligibility gates for the real "Contracts" menu (DESIGN.md "Fixed real
// contracts": "Offered alongside council, event, lifeline and cruise
// contracts through a single contracts menu — one screen covering all four
// contract types"; OPEN-ITEMS.md "Contracts redesign", "Dounreay contracts"
// and "Three further contracts — 800, 803 & 805", all settled 2026-11-19/20
// through direct discussion this session).
//
// Pure logic only, no DOM/IPC — same split as fixed-contract-failures.mts/
// remote-route-subsidy.mts. contracts-panel.ts (the UI layer) calls into
// this with real data fetched via window.routes/window.depots/etc.
//
// Confirmed directly: eligibility is a ONE-TIME GATE per contract (not
// performance-gated progression, except where 800/803/805 explicitly gate
// on Dounreay's own progress). Once a gate is met, the contract becomes
// OFFERABLE in the menu — it does not auto-activate; the player still
// presses Accept.
//
// --- Judgement calls flagged up front, not buried -------------------------
//
// DESIGN.md's real conditions ("2 services into Glasgow city centre," "a
// depot within Edinburgh's city boundaries," "3 routes running both into
// and out of Buchanan Bus Station") all need a real geographic check this
// codebase doesn't have yet — there's no city-boundary polygon data and no
// "which real station is this stop part of" lookup anywhere in code (the
// only comparable thing, FareZone city/country zones, is player-drawn and
// may not exist in a given save at all, so it can't be relied on as the
// mechanism here). Exactly the same situation the task brief calls out for
// Dounreay's own Thurso/Wick gates ("there's no existing classification in
// code; build a reasonable one... use a reasonable radius, flag your
// choice clearly") — so every one of these uses the SAME real-coordinate +
// radius approach, flagged with the same honesty, rather than inventing a
// different kind of approximation for each:
//
//  - Glasgow city centre (George Square area): a route "runs into Glasgow
//    city centre" if any of its own drawn points falls within 1.5km of
//    George Square. 1.5km is a judgement call — big enough to cover
//    Glasgow's real core bus corridors (Buchanan St, Argyle St, the
//    station forecourts) without reaching out to e.g. the West End or
//    Finnieston, which read as "Glasgow" but not "city centre."
//  - Buchanan Bus Station: a route "runs into and out of" it if any of its
//    own points falls within 300m of the station's real site. 300m
//    (judgement call) covers the station's own stance apron and immediate
//    frontage without reaching George Square two blocks away, which would
//    double-count with the city-centre check above.
//  - Edinburgh's city boundary: there's no real polygon for this at all
//    (the City of Edinburgh council area is a large, irregular shape
//    reaching out to the Pentlands and the Forth, not just the historic
//    centre). Approximated as a 10km radius from Princes Street — a
//    judgement call, openly a rough stand-in for the real boundary, not a
//    real administrative lookup. Flagged as the roughest of these
//    approximations: a depot right at the edge of the real council area
//    (say, Kirkliston or Newtongrange) may read wrong either way. Revisit
//    if/when real administrative boundary data exists in the pipeline.
//  - Thurso / Wick (Dounreay's own gates, the task brief's own worked
//    example): 5km radius from each town's real centre. The two towns are
//    genuinely about 30km apart (checked directly: haversine on the two
//    given coordinates), so 5km each leaves a wide, deliberately
//    unclassified gap between them rather than risking overlap.
//
// None of these are confirmed by the user — flagged here exactly once,
// referenced from every function below rather than repeated at each one.
import { gameDateTimeFromSeconds, SECONDS_PER_DAY } from "./game-clock.mts";

// --- Activation date: "starts on the first Monday after a minimum of 10
// days have passed" (DESIGN.md "Fixed real contracts") ---------------------
//
// The same real lead time "the same lead time as activating a new route"
// text describes. Applies to every contract accepted through the menu,
// not just the four real fixed-content ones — DESIGN.md states it as a
// general rule for this whole contract type, so Dounreay/800/803/805 get
// the same activation delay once accepted, even before their real content
// exists (their own "accepted" state still needs a real activation day
// for 800/803/805's own "currently active" progression check).
export const FIXED_CONTRACT_LEAD_DAYS = 10;

export function computeActivationGameDay(acceptedGameDay: number, leadDays: number = FIXED_CONTRACT_LEAD_DAYS): number {
  const earliestDay = acceptedGameDay + leadDays;
  const weekday = gameDateTimeFromSeconds(earliestDay * SECONDS_PER_DAY).weekday; // 0 = Monday
  const daysUntilMonday = weekday === 0 ? 0 : 7 - weekday;
  return earliestDay + daysUntilMonday;
}

export interface LatLon {
  readonly lon: number;
  readonly lat: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// --- Real reference points -------------------------------------------------

export const GLASGOW_CITY_CENTRE: LatLon = { lon: -4.2514, lat: 55.8609 }; // George Square
export const GLASGOW_CITY_CENTRE_RADIUS_KM = 1.5; // judgement call, see header

// Buchanan Bus Station's own real site — cross-checked directly against
// this save's own real Express 500/AIR data (extracted 2026-11-20): the
// real stop/stand point both routes actually use there is
// lon -4.2518/-4.2663, lat 55.8652/55.8617 depending on which stance —
// close to, but not identical to, George Square. Centred here between the
// two real extracted points rather than re-guessed from scratch.
export const BUCHANAN_BUS_STATION: LatLon = { lon: -4.2524, lat: 55.8635 };
export const BUCHANAN_BUS_STATION_RADIUS_KM = 0.3; // judgement call, see header

export const EDINBURGH_CITY_CENTRE: LatLon = { lon: -3.1883, lat: 55.9533 }; // Princes Street
export const EDINBURGH_BOUNDARY_APPROX_RADIUS_KM = 10; // judgement call, see header — a rough stand-in for the real council boundary, flagged as the roughest of these approximations

export const THURSO_TOWN_CENTRE: LatLon = { lon: -3.5225, lat: 58.5953 };
export const WICK_TOWN_CENTRE: LatLon = { lon: -3.088, lat: 58.4387 };
export const CAITHNESS_TOWN_RADIUS_KM = 5; // judgement call, see header

// --- Generic point-near-route / point-near-depot helpers ------------------

export interface EligibilityRoute {
  readonly id: number;
  readonly number: string;
  readonly points: readonly LatLon[];
}

export interface EligibilityDepot {
  readonly id: number;
  readonly depotGroupId: number;
  readonly lon: number;
  readonly lat: number;
}

export function routePassesNear(route: EligibilityRoute, point: LatLon, radiusKm: number): boolean {
  return route.points.some((p) => haversineKm(p, point) <= radiusKm);
}

export function countRoutesPassingNear(routes: readonly EligibilityRoute[], point: LatLon, radiusKm: number): number {
  return routes.filter((r) => routePassesNear(r, point, radiusKm)).length;
}

export function isDepotNear(depot: EligibilityDepot, point: LatLon, radiusKm: number): boolean {
  return haversineKm(depot, point) <= radiusKm;
}

export function hasDepotNear(depots: readonly EligibilityDepot[], point: LatLon, radiusKm: number): boolean {
  return depots.some((d) => isDepotNear(d, point, radiusKm));
}

// --- 398 — "at least 2 services running into Glasgow city centre" ---------

export const ROUTE_398_MIN_SERVICES_INTO_GLASGOW = 2;

export function isRoute398Eligible(routes: readonly EligibilityRoute[]): boolean {
  return countRoutesPassingNear(routes, GLASGOW_CITY_CENTRE, GLASGOW_CITY_CENTRE_RADIUS_KM) >= ROUTE_398_MIN_SERVICES_INTO_GLASGOW;
}

// --- Airlink 100 — "a depot within Edinburgh's city boundaries" ----------

export function isAirlink100Eligible(depots: readonly EligibilityDepot[]): boolean {
  return hasDepotNear(depots, EDINBURGH_CITY_CENTRE, EDINBURGH_BOUNDARY_APPROX_RADIUS_KM);
}

// --- Express 500 — "3 routes running both into and out of Buchanan Bus
// Station, AND Route 77 has been running for 1 month" ---------------------
//
// Route 77 itself isn't one of the real fixed-content contracts (DESIGN.md:
// "Not a fixed real contract... runs on ordinary commercial economics") —
// it's an ordinary player-drawn route with a fixed livery/colour/vehicle,
// built the normal way once ITS OWN gate (the same "3 routes at Buchanan"
// condition) is met. This module has no opinion on whether a specific
// route IS "Route 77" beyond its real number "77" — the same lightweight
// number-matching convention fixed-contract-failures.mts/livery-seed-
// data.mts already use elsewhere for these fixed identities.
export const EXPRESS_500_MIN_ROUTES_AT_BUCHANAN = 3;
export const ROUTE_77_MIN_RUNNING_DAYS_MONTHS = 1;

export function hasEnoughRoutesAtBuchanan(routes: readonly EligibilityRoute[]): boolean {
  return countRoutesPassingNear(routes, BUCHANAN_BUS_STATION, BUCHANAN_BUS_STATION_RADIUS_KM) >= EXPRESS_500_MIN_ROUTES_AT_BUCHANAN;
}

// `route77FirstSeenGameDay` is null when Route 77 doesn't exist in this
// save yet (electron/db.mts's route_milestones table — the generic
// "first observed" tracker this module needed built for exactly this
// case, since Route 77 is an ordinary route with no "accepted" event of
// its own to time off instead).
export function isRoute77RunningForRequiredPeriod(route77FirstSeenGameDay: number | null, todayGameDay: number, addMonthsFn: (gameDay: number, months: number) => number): boolean {
  if (route77FirstSeenGameDay === null) return false;
  return todayGameDay >= addMonthsFn(route77FirstSeenGameDay, ROUTE_77_MIN_RUNNING_DAYS_MONTHS);
}

export function isExpress500Eligible(routes: readonly EligibilityRoute[], route77FirstSeenGameDay: number | null, todayGameDay: number, addMonthsFn: (gameDay: number, months: number) => number): boolean {
  return hasEnoughRoutesAtBuchanan(routes) && isRoute77RunningForRequiredPeriod(route77FirstSeenGameDay, todayGameDay, addMonthsFn);
}

// --- AIR — "run BOTH Express 500 AND Airlink 100 successfully for 2 weeks
// each" -----------------------------------------------------------------
//
// JUDGEMENT CALL, flagged: "successfully" has no further definition in
// DESIGN.md. Read here as: the contract has been ACTIVE (past its own
// 10-day-lead-time + first-Monday activation date, DESIGN.md "Fixed real
// contracts") for at least 14 running days, AND is not CURRENTLY under an
// active fixed-contract-failures.mts suspension. This does not check
// whether a suspension occurred earlier within the 14-day window and has
// since expired/returned — a stricter reading ("no suspension at any point
// in the last 14 days") is equally defensible and not ruled out by the
// source text. Chosen because it's the simpler, real signal already being
// tracked (current suspension state), not because it's confirmed.
export const AIR_REQUIRED_SUCCESSFUL_DAYS = 14;

export function hasRunSuccessfullyFor(activationGameDay: number | null, todayGameDay: number, isCurrentlySuspended: boolean): boolean {
  if (activationGameDay === null) return false;
  if (isCurrentlySuspended) return false;
  return todayGameDay - activationGameDay >= AIR_REQUIRED_SUCCESSFUL_DAYS;
}

export function isAirEligible(
  express500ActivationGameDay: number | null,
  express500CurrentlySuspended: boolean,
  airlink100ActivationGameDay: number | null,
  airlink100CurrentlySuspended: boolean,
  todayGameDay: number,
): boolean {
  return (
    hasRunSuccessfullyFor(express500ActivationGameDay, todayGameDay, express500CurrentlySuspended) &&
    hasRunSuccessfullyFor(airlink100ActivationGameDay, todayGameDay, airlink100CurrentlySuspended)
  );
}

// --- SkyLink — dormant placeholder -----------------------------------------
//
// "SkyLink: no real gate yet — dormant, not offered (no real route
// exists to gate)," confirmed directly. Same pattern livery-seed-data.mts's
// LIVERY_SPECIFIC_ROUTE already uses for a contract that "doesn't exist in
// the game yet" — kept here as a named, always-false function so the menu
// has somewhere real to call rather than a magic `false` inlined at the
// call site, and so this becomes the one place to update once SkyLink
// gets real content.
export function isSkyLinkEligible(): boolean {
  return false;
}

// --- Dounreay, 8 real routes — "a depot in Thurso unlocks 74, 274, 280,
// 921; a depot in Wick unlocks 275, 276, 281, 282" -------------------------

export const DOUNREAY_THURSO_ROUTE_NUMBERS: readonly string[] = ["74", "274", "280", "921"];
export const DOUNREAY_WICK_ROUTE_NUMBERS: readonly string[] = ["275", "276", "281", "282"];
export const DOUNREAY_ALL_ROUTE_NUMBERS: readonly string[] = [...DOUNREAY_THURSO_ROUTE_NUMBERS, ...DOUNREAY_WICK_ROUTE_NUMBERS];

export function hasDepotInThurso(depots: readonly EligibilityDepot[]): boolean {
  return hasDepotNear(depots, THURSO_TOWN_CENTRE, CAITHNESS_TOWN_RADIUS_KM);
}

export function hasDepotInWick(depots: readonly EligibilityDepot[]): boolean {
  return hasDepotNear(depots, WICK_TOWN_CENTRE, CAITHNESS_TOWN_RADIUS_KM);
}

// Each of the 8 becomes offerable independently the moment its OWN town's
// gate is met (confirmed directly: "not sequential") — this takes the real
// route number (e.g. "274") and says whether THAT one route is eligible.
export function isDounreayRouteEligible(routeNumber: string, depots: readonly EligibilityDepot[]): boolean {
  if (DOUNREAY_THURSO_ROUTE_NUMBERS.includes(routeNumber)) return hasDepotInThurso(depots);
  if (DOUNREAY_WICK_ROUTE_NUMBERS.includes(routeNumber)) return hasDepotInWick(depots);
  return false;
}

// --- 800, 803 & 805 — "unlocked when half of the Dounreay services are
// fulfilled" -----------------------------------------------------------
//
// A genuinely new gate SHAPE: progression against other contracts, not a
// depot/geography check. "Fulfilled" is read as "accepted AND currently
// active, not suspended/failed" (OPEN-ITEMS.md's own flagged reading,
// carried straight through here) — NOT explicitly re-confirmed by the
// user this round, flagged again rather than silently treated as settled.
// "Any 4 of the 8, regardless of Thurso/Wick split" — also the OPEN-ITEMS.md
// reasonable default, since nothing suggests the split matters.
export const DOUNREAY_CONTRACTS_REQUIRED_FOR_800_803_805 = 4; // half of 8

export interface DounreayContractState {
  readonly routeNumber: string;
  readonly isAccepted: boolean;
  // true if EVERY route created for this contract is currently fully
  // suspended (fixed-contract-failures.mts's own suspendedUnits >=
  // totalUnits for an active, unexpired batch) — Dounreay's own confirmed
  // exception to the general 60% cap means a single route CAN be suspended
  // in its entirety, unlike the other four contracts. A contract with no
  // routes created yet (no real content exists) is never "failed" — it's
  // either accepted-and-pending-content or not accepted at all.
  readonly isFullySuspended: boolean;
}

export function isDounreayContractFulfilled(state: DounreayContractState): boolean {
  return state.isAccepted && !state.isFullySuspended;
}

export function countFulfilledDounreayContracts(states: readonly DounreayContractState[]): number {
  return states.filter(isDounreayContractFulfilled).length;
}

export function is800803805Eligible(dounreayStates: readonly DounreayContractState[]): boolean {
  return countFulfilledDounreayContracts(dounreayStates) >= DOUNREAY_CONTRACTS_REQUIRED_FOR_800_803_805;
}

export const DOUNREAY_800_803_805_ROUTE_NUMBERS: readonly string[] = ["800", "803", "805"];

// "This contract will provide it's own depot at the end of the road at
// this location 58.567887, -4.751181" — confirmed automatic and free, same
// shape as 398's own pre-owned terminus stop. Real coordinates supplied
// directly by the user, not guessed.
export const DOUNREAY_END_OF_ROAD_DEPOT: LatLon = { lon: -4.751181, lat: 58.567887 };

// "The council will pay for 75% of the cost of a new fleet of Minibuses" —
// confirmed one-off, initial fleet only. Pure arithmetic only: the caller
// supplies the real fleet size (derived from the eventual real route's own
// peak vehicle requirement, once it exists — NOT fabricated here, see
// OPEN-ITEMS.md's own note) and the real unit list price.
export const COUNCIL_INITIAL_FLEET_SUBSIDY_FRACTION = 0.75;

export interface InitialFleetSubsidySplit {
  readonly councilPaysGBPPence: number;
  readonly playerPaysGBPPence: number;
}

export function splitInitialFleetCost(fleetSize: number, unitPriceGBPPence: number): InitialFleetSubsidySplit {
  const totalGBPPence = fleetSize * unitPriceGBPPence;
  const councilPaysGBPPence = Math.round(totalGBPPence * COUNCIL_INITIAL_FLEET_SUBSIDY_FRACTION);
  return { councilPaysGBPPence, playerPaysGBPPence: totalGBPPence - councilPaysGBPPence };
}
