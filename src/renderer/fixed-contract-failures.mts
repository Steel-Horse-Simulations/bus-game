// Failure handling for the Fixed real contracts (DESIGN.md "Fixed real
// contracts": 398, Airlink 100, Express 500, SkyLink — OPEN-ITEMS.md's
// "Contracts redesign" entry, confirmed 2026-11-19). Replaces DESIGN.md's
// old penalty line ("the contract cannot be lost outright, but is heavily
// fined for any condition not met") with a real, built mechanic:
//
//  1. A departure that the depot group genuinely can't field a vehicle for
//     is "missed" and fined.
//  2. Persistent failure suspends some of the contract's services —
//     always whole return-journey/circular-route units, never a single
//     one-way leg — for exactly 6 months, then they return automatically.
//  3. Never more than 60% of a contract's services suspended at once.
//  4. Thistle Coaches (the game's one competitor, OPEN-ITEMS.md "The
//     competitor") covers the suspended services meanwhile — no fare
//     revenue or cost to the player for them during that time.
//  5. Applies uniformly to the four contracts above, no special-casing —
//     this module deliberately has no per-contract branch anywhere in it.
//
// Two of the six routes DESIGN.md groups under "Fixed real contracts" are
// explicitly OUT of scope for this mechanic, not merely absent by
// oversight:
//  - AIR (DESIGN.md §10's own "AIR — Edinburgh Airport reward contract"):
//    "genuinely zero fines for anything, including missing the timetable
//    — a true exception to the warning-and-review pattern every other
//    contract follows." It's a one-off reward (the airport pays 15% of
//    the fleet's cost for the first vehicle order only), not an ongoing
//    service-level relationship, so there is nothing for this mechanic to
//    apply to.
//  - Railair (UK-EXPANSION.md §9a) is not a fixed contract at all —
//    "a station-to-airport express product the player creates... not a
//    single fixed route like AIR." It's a player-chosen livery/branding
//    category applied to routes the player builds and runs entirely on
//    ordinary commercial terms, with no council/airport contract
//    relationship behind it. Never appears anywhere in this module.
//
// Oxford Tube is excluded the same way as AIR (OPEN-ITEMS.md, 2026-11-19:
// it stays in the game, just not as one of these named contracts) by
// never appearing in FIXED_CONTRACT_ROUTE_NUMBERS below.
//
// Pure logic only, no DB/IPC — same convention as route-statistics.mts and
// workshop-booking.mts, which this module builds directly on rather than
// duplicating: peak vehicle requirement (computePeakVehicleRequirement)
// and the "away for repaint/re-power" away-window tracking
// (combinedAwayWindows/overlapsWindow) are REUSED, not reinvented, per the
// task brief's own instruction to check for something closer before
// building a parallel system.
//
// Every numeric threshold below (the fine amount, the suspension trigger,
// the window it's measured over) is this model's own proposed figure, NOT
// confirmed by the user — flagged individually at each constant, the same
// way this codebase already flags every other unconfirmed numeric
// threshold (see stop-upgrades.mts's own threshold comments). Only the
// 60% cap and the exactly-6-month return (revised 2026-11-19 from an
// initial 1 year, the user's own words: "I think 6 months to get a route
// back might be better") are real, confirmed numbers.
import { overlapsWindow, type AwayBooking } from "./workshop-booking.mts";
import { computePeakVehicleRequirement, type PvrRoute, type PvrTimetable } from "./route-statistics.mts";
import { generateDepartureMinutesForBands, applyExcludedDepartures, mergeCustomDepartures, type TimeBand } from "./route-timetable.mts";
import { addMonths } from "./game-clock.mts";

// --- Which routes this mechanic applies to --------------------------------

export type FixedContractKey = "398" | "airlink100" | "express500" | "skylink";

// Each is a single fixed route matched by an exact real route-number
// string — the same signal route-statistics.mts's own
// vehicleRequirementBucketForRoute and livery-seed-data.mts's own
// LIVERY_SPECIFIC_ROUTE already use to recognise these same routes (that
// table literally maps each contract's livery to this same route-number
// string), reused here rather than inventing a second identification
// scheme. Oxford Tube, AIR and Railair are all deliberately absent — see
// this file's header for why each of the three is out of scope.
const FIXED_CONTRACT_ROUTE_NUMBERS: Record<FixedContractKey, string> = {
  "398": "398",
  airlink100: "Airlink 100",
  express500: "500",
  skylink: "SkyLink",
};

export function fixedContractKeyForRoute(routeNumber: string): FixedContractKey | null {
  for (const [key, number] of Object.entries(FIXED_CONTRACT_ROUTE_NUMBERS)) {
    if (number === routeNumber) return key as FixedContractKey;
  }
  return null;
}

export function isFixedContractRouteNumber(routeNumber: string): boolean {
  return fixedContractKeyForRoute(routeNumber) !== null;
}

// --- Unit shape: a return journey or a circular route ---------------------
//
// "The unit of 'a service' lost is always a whole return journey or a
// whole circular route — never a single one-way leg" (OPEN-ITEMS.md, the
// user's own words). Derived from the route's own real data, not hardcoded
// per contract: `terminusIndex` is already how this codebase flags "a
// terminus loop" (PvrRoute's own doc comment, route-statistics.mts) — set
// only for a circular route whose outbound/inbound legs genuinely differ
// (398's own case, DESIGN.md: "a circular loop... the same stop serves as
// both start and terminus"), null for an ordinary there-and-back route.
// Checked against DESIGN.md directly: 398 is explicitly called a loop;
// Airlink 100 and Express 500 are each described as point A <-> point B,
// an ordinary return pattern, never called a loop. SkyLink has no real
// route built yet, so this reads whichever shape the player's own
// eventual real route turns out to have, rather than guessing ahead of it.
export type ContractUnitShape = "return_journey" | "circular_route";

export function contractUnitShape(route: { terminusIndex: number | null }): ContractUnitShape {
  return route.terminusIndex !== null ? "circular_route" : "return_journey";
}

// How many whole units (DESIGN.md's "return journey or circular route") are
// scheduled on a day using this weekday mask.
//
// Real-data correction made while building this, flagged rather than
// silently followed (same convention route-statistics.mts's own header
// comment already uses for its own corrected assumption): the first draft
// of this function read PvrTimetable.departureOffsetsSeconds.length as "how
// many departures run that day." Checked directly against
// route-timetable.mts — that field is indexed BY ROUTE POINT (the real
// published elapsed-seconds-from-trip-start AT each point along the route,
// used to compute one-way/round-trip duration), not a per-day list of
// departure clock times at all. The REAL generator for "how many departures
// a day actually has" is route-timetable.mts's own
// generateDepartureMinutesForBands/applyExcludedDepartures/
// mergeCustomDepartures, which this function now calls directly rather than
// re-deriving the same thing from the wrong field.
//
// One whole unit per departure in the route's own PRIMARY direction
// component (outbound if the timetable is split by direction, else the
// single "both" component) — reuses the same outbound/both pairing
// route-statistics.mts's own PVR math already relies on (one outbound+
// inbound pair, or one "both" component doubled, is a single real round
// trip) rather than inventing a second, parallel way of counting trips.
// Flagged simplification: assumes every outbound departure has a genuinely
// paired return leg, true for every fixed real contract DESIGN.md
// describes so far (none run one-way-only).
export interface FixedContractTimetableComponent {
  weekdayMask: number;
  direction: string; // RouteTimetableDirection (depot-groups.d.ts) — kept structural, not imported, since this module has no DOM/ambient-type dependency
  timeBands: readonly TimeBand[];
  excludedDepartureMinutes: readonly number[];
  customDepartureMinutes: readonly number[];
}

export function scheduledUnitCountForDay(timetables: readonly FixedContractTimetableComponent[], weekdayMask: number): number {
  const group = timetables.filter((t) => t.weekdayMask === weekdayMask);
  if (group.length === 0) return 0;
  const primary = group.find((t) => t.direction === "outbound") ?? group.find((t) => t.direction === "both") ?? group[0];
  const generated = generateDepartureMinutesForBands(primary.timeBands);
  const afterExclusions = applyExcludedDepartures(generated, primary.excludedDepartureMinutes);
  const final = mergeCustomDepartures(afterExclusions, primary.customDepartureMinutes);
  return final.length;
}

// --- Missed departures: can the depot group actually field the bus? ------
//
// "A departure counts as 'missed' when the depot group genuinely cannot
// field enough vehicles to cover it" (the task's own framing, matching
// OPEN-ITEMS.md: "failure is just not running the service reliably, not a
// financial-ratio judgement"). Built from the closest real data that
// already exists — the peak vehicle requirement (computePeakVehicleRequirement,
// route-statistics.mts) compared against how many of the depot group's own
// vehicles are actually available for this route right now, i.e. not
// currently away for repaint/re-power (workshop-booking.mts's own
// combinedAwayWindows/overlapsWindow, reused directly below rather than a
// second away-tracking scheme).
//
// Genuine gap, flagged honestly (per the task brief's own instruction):
// this is a PROPORTIONAL approximation, not a real per-departure
// simulation. The game has no real-time vehicle rostering/duty-assignment
// model yet (Phase 6, not built) that could say "THIS specific 08:12
// departure has no bus" — so a shortfall in available vehicles is spread
// evenly across the day's own scheduled units by straight proportion
// (missedFraction = shortfall / requirement), rounded to a whole unit
// count, rather than picking which specific departures fail. Good enough
// to drive real fines and real suspensions; not a substitute for the real
// duty/rostering simulation whenever that gets built.
export function availableVehiclesForRoute(ownedOrLeasedForRoute: number, awayCount: number): number {
  return Math.max(0, ownedOrLeasedForRoute - awayCount);
}

// Convenience wrapper around workshop-booking.mts's own away-window
// machinery (its AwayBooking shape, which still carries vehicleId, rather
// than its combinedAwayWindows helper, which deliberately flattens that
// away once it's done its own depot-group-wide merge — not useful here,
// since this needs to narrow to one route's own vehicles specifically) —
// how many of a route's own dedicated vehicles are away for repaint/
// re-power on a given game day. `vehicleIdsForRoute` should already be
// narrowed to vehicles genuinely dedicated to this contract route
// (Vehicle.boughtForRouteId === route.id) — see this file's header: these
// four routes are exactly the case DESIGN.md already describes vehicles
// being "locked to a contract" for, so boughtForRouteId (elsewhere "nothing
// reads this as an enforced link," depot-groups.d.ts's own comment) is
// reused here as the one real per-route assignment signal that exists,
// specifically for this mechanic. A real "assign vehicle to route" system,
// if one is ever built, should supersede this.
export function awayCountForRoute(vehicleIdsForRoute: readonly number[], awayBookings: readonly AwayBooking[], todayGameDay: number): number {
  const idsInRoute = new Set(vehicleIdsForRoute);
  let away = 0;
  for (const booking of awayBookings) {
    if (!idsInRoute.has(booking.vehicleId)) continue;
    if (overlapsWindow({ startDay: booking.startGameDay, completionDay: booking.completionGameDay }, todayGameDay, todayGameDay)) away++;
  }
  return away;
}

export function missedUnitsForDay(scheduledUnits: number, availableVehicles: number, peakVehicleRequirement: number): number {
  if (scheduledUnits <= 0 || peakVehicleRequirement <= 0) return 0;
  const shortfall = Math.max(0, peakVehicleRequirement - availableVehicles);
  const missedFraction = Math.min(1, shortfall / peakVehicleRequirement);
  return Math.round(missedFraction * scheduledUnits);
}

// --- Fines -----------------------------------------------------------------
//
// £75 per missed unit (a missed departure, i.e. the SHARE of a day's
// scheduled units calculated above). NOT a user-confirmed figure — these
// are fictional in-game contracts with no real published penalty rate to
// ground this in, so this is this model's own placeholder, flagged the
// same way stop-upgrades.mts flags its own unconfirmed busy-hour
// thresholds. Chosen to read as "heavily fined" (DESIGN.md's own old
// wording, carried into the new mechanic) without being so large a single
// bad day could bankrupt a small operator outright — roughly 8x 398's own
// real £9/journey contract payment. Revisit once real economy tuning
// (CLAUDE.md "Economy tuning") reaches this far.
export const FIXED_CONTRACT_FINE_PER_MISSED_UNIT_GBP_PENCE = 7_500;

export const FIXED_CONTRACT_FINE_FINANCE_CATEGORY = "Fixed contract fines";

export function fineForMissedUnitsGBPPence(missedUnits: number): number {
  return missedUnits * FIXED_CONTRACT_FINE_PER_MISSED_UNIT_GBP_PENCE;
}

export function fineDescription(routeNumber: string, missedUnits: number, scheduledUnits: number): string {
  return `Route ${routeNumber} missed ${missedUnits} of ${scheduledUnits} scheduled departures`;
}

// --- Suspension trigger: "if it continues for too long" -------------------
//
// Neither figure below is confirmed by the user — both are this model's
// own proposed thresholds for "persistent failure," flagged the same way
// as the fine amount above. The window reuses the existing 28-day company
// period (game-clock.mts's own DAYS_PER_PERIOD) rather than inventing a
// separate span: "persistent failure" should read against the same
// operational-review cadence the rest of the game already uses. 3
// fine-days within that one period (roughly one bad week in four) is a
// judgement call for "repeatedly failing," not a single bad day.
export const SUSPENSION_TRIGGER_FINE_DAYS = 3;
export const SUSPENSION_TRIGGER_WINDOW_DAYS = 28;

export function shouldTriggerSuspension(fineDayGameDays: readonly number[], todayGameDay: number): boolean {
  const windowStart = todayGameDay - SUSPENSION_TRIGGER_WINDOW_DAYS + 1;
  const count = fineDayGameDays.filter((d) => d >= windowStart && d <= todayGameDay).length;
  return count >= SUSPENSION_TRIGGER_FINE_DAYS;
}

// --- The 60% cap and whole-unit suspension selection ----------------------

// Confirmed directly by the user: "I think a maximum of 60% of services
// lost should be the maximum."
export const MAX_SUSPENDED_FRACTION = 0.6;

// How many MORE units to suspend today, given however many are already
// suspended across every still-active batch for this route+weekday-mask
// group — never exceeding the 60% ceiling, never suspending more than
// today's shortfall calls for. Returns 0 once the ceiling is already
// reached, or if the ceiling itself rounds down to 0 — a route with very
// few daily units (1-2) can genuinely never lose any under this general
// rule, which is exactly why Dounreay needed its own separate, documented
// exception (OPEN-ITEMS.md: "Dounreay should be able to lose each route as
// they normally only have 2 services a day") — NOT built here, out of
// scope for this mechanic, but this function's own behaviour is the reason
// that exception exists.
export function unitsToSuspendToday(totalUnits: number, alreadySuspended: number, missedUnitsToday: number): number {
  const maxSuspendable = Math.floor(totalUnits * MAX_SUSPENDED_FRACTION);
  const room = Math.max(0, maxSuspendable - alreadySuspended);
  if (room <= 0 || missedUnitsToday <= 0) return 0;
  return Math.min(room, missedUnitsToday);
}

// --- Suspension records: exactly 6 months, then automatic return ---------
//
// Each escalation is its own independent batch, not a merge into one
// running total: if a route is suspended further while an earlier batch is
// still active, the new batch gets its OWN fresh 6-month timer, so the
// earlier batch still returns on its own original date rather than being
// reset. Not explicitly confirmed by the user either way — this is this
// model's own reading of "the player can get the lost services back after"
// the suspension length as meaning each lost BATCH individually, which
// seems the more generous/consistent reading (an escalation shouldn't
// restart an already-ticking clock) — flagged in case the intended
// behaviour is a single combined timer instead.
export interface ContractSuspension {
  routeId: number;
  weekdayMask: number;
  suspendedUnits: number;
  totalUnits: number;
  startGameDay: number;
  returnGameDay: number;
  active: boolean;
}

// Suspension length: 6 months (revised 2026-11-19 from an initial 1 year —
// the user's own words: "I think 6 months to get a route back might be
// better"), via game-clock.mts's general addMonths helper.
const SUSPENSION_LENGTH_MONTHS = 6;

export function createSuspension(routeId: number, weekdayMask: number, suspendedUnits: number, totalUnits: number, startGameDay: number): ContractSuspension {
  return {
    routeId,
    weekdayMask,
    suspendedUnits: Math.min(suspendedUnits, totalUnits),
    totalUnits,
    startGameDay,
    returnGameDay: addMonths(startGameDay, SUSPENSION_LENGTH_MONTHS),
    active: true,
  };
}

export function isExpired(suspension: ContractSuspension, todayGameDay: number): boolean {
  return suspension.active && todayGameDay >= suspension.returnGameDay;
}

export function totalActiveSuspendedUnits(suspensions: readonly ContractSuspension[], todayGameDay: number): number {
  return suspensions.filter((s) => s.active && !isExpired(s, todayGameDay)).reduce((sum, s) => sum + s.suspendedUnits, 0);
}

// Thistle Coaches runs the first N departures of a weekday-mask group's own
// timetable while suspended — an arbitrary but stable, deterministic rule
// (not scattered across the day) for WHICH departures within a day are
// covered; nothing in the brief requires any particular subset, only that
// whole units are suspended.
export function isUnitSuspended(suspensions: readonly ContractSuspension[], weekdayMask: number, unitIndexInDay: number, todayGameDay: number): boolean {
  const relevant = suspensions.filter((s) => s.weekdayMask === weekdayMask);
  return unitIndexInDay < totalActiveSuspendedUnits(relevant, todayGameDay);
}

// --- The full daily pipeline, wired together -------------------------------
//
// Follows this codebase's own "lazy catch-up" convention for day-based
// accrual (private-hire-income.mts, route-advertising-billing — evaluated
// whenever the relevant screen is opened, not on a central tick) rather
// than inventing a central daily-tick mechanism: a caller re-runs this once
// per real game day that's elapsed since it last checked, for each
// fixed-contract route it holds. No UI/tick currently calls this — see this
// module's own verify file and the handover report for that flagged gap.
export interface DailyEvaluationInput {
  route: PvrRoute & { id: number };
  // Two different existing read-shapes of the SAME real route_timetables
  // rows (not two parallel data sources): `pvrTimetables` is
  // route-statistics.mts's own stripped-down shape, used only for the peak
  // vehicle requirement (how many vehicles the busiest headway needs);
  // `timetableComponents` carries the real time bands/exclusions/custom
  // departures needed to generate the actual day's departure list. A real
  // caller derives both from the same RouteTimetable row.
  pvrTimetables: readonly PvrTimetable[];
  timetableComponents: readonly FixedContractTimetableComponent[];
  weekdayMask: number;
  todayGameDay: number;
  availableVehicles: number;
  // Fine-day history for this route, NOT including today.
  recentFineDayGameDays: readonly number[];
  // Every suspension batch ever created for this route+weekdayMask,
  // expired or not — expiry is recomputed here, not pre-filtered by the
  // caller.
  existingSuspensions: readonly ContractSuspension[];
}

export interface DailyEvaluationResult {
  scheduledUnits: number;
  missedUnits: number;
  fineGBPPence: number;
  newSuspension: ContractSuspension | null;
  justExpired: readonly ContractSuspension[];
}

export function evaluateFixedContractDay(input: DailyEvaluationInput): DailyEvaluationResult {
  const scheduledUnits = scheduledUnitCountForDay(input.timetableComponents, input.weekdayMask);
  const pvr = computePeakVehicleRequirement(input.route, input.pvrTimetables);
  const peakVehicleRequirement = pvr?.vehicles ?? 0;
  const missedUnits = missedUnitsForDay(scheduledUnits, input.availableVehicles, peakVehicleRequirement);
  const fineGBPPence = fineForMissedUnitsGBPPence(missedUnits);

  const justExpired = input.existingSuspensions.filter((s) => s.active && isExpired(s, input.todayGameDay));

  let newSuspension: ContractSuspension | null = null;
  if (missedUnits > 0 && shouldTriggerSuspension([...input.recentFineDayGameDays, input.todayGameDay], input.todayGameDay)) {
    const stillActive = input.existingSuspensions.filter((s) => s.active && !isExpired(s, input.todayGameDay));
    const alreadySuspended = totalActiveSuspendedUnits(stillActive, input.todayGameDay);
    const toSuspend = unitsToSuspendToday(scheduledUnits, alreadySuspended, missedUnits);
    if (toSuspend > 0) newSuspension = createSuspension(input.route.id, input.weekdayMask, toSuspend, scheduledUnits, input.todayGameDay);
  }

  return { scheduledUnits, missedUnits, fineGBPPence, newSuspension, justExpired };
}
