// Manual verification for fixed-contract-failures.mts (DESIGN.md "Fixed
// real contracts", OPEN-ITEMS.md "Contracts redesign", confirmed
// 2026-11-19), run directly with
// `node --experimental-strip-types src/renderer/fixed-contract-failures.verify.mts`
// — same convention as this codebase's other .verify.mts files.
import {
  fixedContractKeyForRoute,
  isFixedContractRouteNumber,
  contractUnitShape,
  scheduledUnitCountForDay,
  availableVehiclesForRoute,
  awayCountForRoute,
  missedUnitsForDay,
  fineForMissedUnitsGBPPence,
  FIXED_CONTRACT_FINE_PER_MISSED_UNIT_GBP_PENCE,
  shouldTriggerSuspension,
  SUSPENSION_TRIGGER_FINE_DAYS,
  SUSPENSION_TRIGGER_WINDOW_DAYS,
  unitsToSuspendToday,
  MAX_SUSPENDED_FRACTION,
  createSuspension,
  isExpired,
  totalActiveSuspendedUnits,
  isUnitSuspended,
  evaluateFixedContractDay,
  type ContractSuspension,
  type FixedContractTimetableComponent,
} from "./fixed-contract-failures.mts";
import { addMonths } from "./game-clock.mts";
import type { PvrRoute, PvrTimetable } from "./route-statistics.mts";
import { generateDepartureMinutesForBands } from "./route-timetable.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Contract identification -----------------------------------------------
// Real route-number strings, exactly matching livery-seed-data.mts's own
// LIVERY_SPECIFIC_ROUTE table (the same signal already used elsewhere in
// this codebase to recognise these routes) — only 398, Airlink 100,
// Express 500 and SkyLink are in scope for this mechanic.
assert(fixedContractKeyForRoute("398") === "398", "398 is recognised by its real route number");
assert(fixedContractKeyForRoute("Airlink 100") === "airlink100", "Airlink 100 is recognised");
assert(fixedContractKeyForRoute("500") === "express500", "Express 500's real route number (500, no prefix) is recognised");
assert(fixedContractKeyForRoute("SkyLink") === "skylink", "SkyLink is recognised by its placeholder route number");
assert(fixedContractKeyForRoute("Air") === null, "AIR is explicitly OUT OF SCOPE for this mechanic (DESIGN.md §10: 'genuinely zero fines for anything... a true exception to the warning-and-review pattern every other contract follows') — it must never be recognised as a fixed-contract route here");
assert(fixedContractKeyForRoute("RA1") === null, "Railair is NOT a fixed contract at all (UK-EXPANSION.md §9a: a player-created product, not a single fixed route like AIR) — an RA-numbered route must never be recognised here");
assert(fixedContractKeyForRoute("RA42") === null, "same for any other Railair instance");
assert(fixedContractKeyForRoute("Oxford Tube") === null, "Oxford Tube is NOT a fixed-contract route for this mechanic (OPEN-ITEMS.md, 2026-11-19: stays in the game, excluded from fines/suspension)");
assert(fixedContractKeyForRoute("52") === null, "an ordinary route number matches nothing");
assert(isFixedContractRouteNumber("398") === true && isFixedContractRouteNumber("52") === false, "isFixedContractRouteNumber mirrors fixedContractKeyForRoute");

// --- Unit shape: derived from the route's own real terminusIndex ----------
assert(contractUnitShape({ terminusIndex: null }) === "return_journey", "an ordinary route (terminusIndex null) is a return-journey unit — Airlink 100/Express 500's real shape per DESIGN.md");
assert(contractUnitShape({ terminusIndex: 7 }) === "circular_route", "a terminus-loop route (terminusIndex set) is a circular-route unit — 398's real shape per DESIGN.md");

// --- Scheduled units per day, grounded in 398's own real published
// timetable (DESIGN.md: every 12 min 0800-1800, then every 20 min
// 1800-2000, Mon-Fri) — using the REAL generator (route-timetable.mts's
// own generateDepartureMinutesForBands), not a hand-rolled offsets list.
// (First draft of this test built its fixture from a literal
// departureOffsetsSeconds array, mirroring an early misreading of that
// field in the module itself — see fixed-contract-failures.mts's own
// header comment on scheduledUnitCountForDay for the real correction.)
const real398WeekdayBands = [
  { startMinutes: 8 * 60, endMinutes: 18 * 60, intervalMinutes: 12 },
  { startMinutes: 18 * 60, endMinutes: 20 * 60, intervalMinutes: 20 },
];
const real398WeekdayDepartureMinutes = generateDepartureMinutesForBands(real398WeekdayBands);
assert(
  real398WeekdayDepartureMinutes.length === 57,
  `398's real weekday band structure (12-min 08:00-18:00, then 20-min 18:00-20:00) produces 57 distinct departures through the real generator, got ${real398WeekdayDepartureMinutes.length}`,
);

const timetables398: FixedContractTimetableComponent[] = [
  { weekdayMask: 0b0011111, direction: "both", timeBands: real398WeekdayBands, excludedDepartureMinutes: [], customDepartureMinutes: [] },
  { weekdayMask: 0b0100000, direction: "both", timeBands: [{ startMinutes: 9 * 60, endMinutes: 18 * 60, intervalMinutes: 12 }], excludedDepartureMinutes: [], customDepartureMinutes: [] },
];
assert(scheduledUnitCountForDay(timetables398, 0b0011111) === 57, "scheduledUnitCountForDay reads the real weekday departure count for 398, via the real generator");
assert(scheduledUnitCountForDay(timetables398, 0b0100000) > 0, "Saturday's own, different departure count is read independently");
assert(scheduledUnitCountForDay(timetables398, 0b1000000) === 0, "a weekday mask with no matching timetable returns 0, not a guess");

// Split-direction timetable (Airlink-shaped: separate outbound/inbound
// components) uses the OUTBOUND component's own count, not inbound's —
// and excludedDepartureMinutes/customDepartureMinutes are genuinely
// applied, not just carried as dead fields.
const splitTimetables: FixedContractTimetableComponent[] = [
  { weekdayMask: 1, direction: "outbound", timeBands: [{ startMinutes: 0, endMinutes: 20, intervalMinutes: 10 }], excludedDepartureMinutes: [10], customDepartureMinutes: [25] },
  { weekdayMask: 1, direction: "inbound", timeBands: [{ startMinutes: 0, endMinutes: 40, intervalMinutes: 10 }], excludedDepartureMinutes: [], customDepartureMinutes: [] },
];
// Outbound generates [0, 10, 20], excludes 10 -> [0, 20], adds custom 25 -> [0, 20, 25] = 3.
assert(scheduledUnitCountForDay(splitTimetables, 1) === 3, "a split outbound/inbound timetable uses the outbound component's own departure count, with its own exclusions/custom departures genuinely applied");

// --- Vehicle availability ---------------------------------------------------
assert(availableVehiclesForRoute(5, 2) === 3, "5 owned, 2 away, leaves 3 available");
assert(availableVehiclesForRoute(2, 5) === 0, "can't go negative when (implausibly) more are away than owned");

const awayBookings = [
  { vehicleId: 1, startGameDay: 100, completionGameDay: 105 },
  { vehicleId: 2, startGameDay: 200, completionGameDay: 205 },
];
assert(awayCountForRoute([1, 2, 3], awayBookings, 102) === 1, "only vehicle 1's booking overlaps day 102");
assert(awayCountForRoute([1, 2, 3], awayBookings, 203) === 1, "only vehicle 2's booking overlaps day 203");
assert(awayCountForRoute([3], awayBookings, 102) === 0, "vehicle 3 (not in either booking) is never counted away");
assert(awayCountForRoute([1, 2, 3], awayBookings, 150) === 0, "day 150 falls between both bookings — nothing away");

// --- Missed units: proportional shortfall, grounded in a real PVR --------
assert(missedUnitsForDay(61, 5, 5) === 0, "enough vehicles to cover the real PVR means nothing missed");
assert(missedUnitsForDay(61, 3, 5) === Math.round((2 / 5) * 61), "a 2-of-5 shortfall misses the same proportion of the day's real departures");
assert(missedUnitsForDay(61, 0, 5) === 61, "zero available vehicles against a real PVR misses every scheduled departure");
assert(missedUnitsForDay(61, 5, 0) === 0, "no real PVR data at all (null/0) can't tell, so nothing is faked as missed");
assert(missedUnitsForDay(0, 5, 5) === 0, "no scheduled departures at all means nothing to miss");

// --- Fines ------------------------------------------------------------------
assert(fineForMissedUnitsGBPPence(1) === FIXED_CONTRACT_FINE_PER_MISSED_UNIT_GBP_PENCE, "one missed unit is fined the flat per-unit rate");
assert(fineForMissedUnitsGBPPence(10) === 10 * FIXED_CONTRACT_FINE_PER_MISSED_UNIT_GBP_PENCE, "fines scale linearly with missed units");
assert(fineForMissedUnitsGBPPence(0) === 0, "no missed units, no fine");

// --- Suspension trigger: a rolling window, not a single bad day ----------
assert(SUSPENSION_TRIGGER_FINE_DAYS === 3 && SUSPENSION_TRIGGER_WINDOW_DAYS === 28, "the flagged placeholder thresholds are what this file documents them as");
assert(shouldTriggerSuspension([10, 15, 20], 20) === true, "3 fine-days within the 28-day window triggers a suspension review");
assert(shouldTriggerSuspension([10], 20) === false, "a single fine-day does not trigger anything");
assert(shouldTriggerSuspension([10, 15], 20) === false, "only 2 fine-days within the window is still not enough");
assert(shouldTriggerSuspension([10, 15, 20], 50) === false, "fine-days that have fallen OUTSIDE the rolling window (50 - 28 + 1 = 23) no longer count");

// --- The 60% cap, including the Dounreay-shaped edge case -----------------
assert(MAX_SUSPENDED_FRACTION === 0.6, "the confirmed 60% ceiling");
assert(unitsToSuspendToday(61, 0, 61) === Math.floor(61 * 0.6), "a total network failure is still capped at 60% of the day's units, never 100%");
assert(unitsToSuspendToday(61, 30, 20) === Math.floor(61 * 0.6) - 30, "escalation is capped by remaining room under the ceiling, not the raw missed count");
assert(unitsToSuspendToday(61, Math.floor(61 * 0.6), 20) === 0, "once the ceiling is already reached, nothing more can be suspended");
assert(unitsToSuspendToday(2, 0, 2) === 1, "a Dounreay-shaped 2-unit day can only lose 1 of its 2 units under this general 60% rule (floor(2*0.6)=1) — the real reason Dounreay needed its own separate exception, OPEN-ITEMS.md");
assert(unitsToSuspendToday(1, 0, 1) === 0, "a single-unit-a-day route can NEVER be suspended under the general 60% rule at all (floor(1*0.6)=0) — confirms the general mechanism genuinely cannot touch a very sparse route");

// --- Suspensions: exactly 6 months, via the real calendar -----------------
const startDay = 10_000;
const suspension = createSuspension(42, 0b0011111, 20, 61, startDay);
assert(suspension.returnGameDay === addMonths(startDay, 6), "a suspension's return day is exactly addMonths(startGameDay, 6), the real calendar helper, not a flat day-count approximation");
assert(isExpired(suspension, startDay) === false, "not expired on the very day it starts");
assert(isExpired(suspension, suspension.returnGameDay - 1) === false, "not expired the day before its return day");
assert(isExpired(suspension, suspension.returnGameDay) === true, "expired exactly on its return day");
assert(isExpired(suspension, suspension.returnGameDay + 10) === true, "stays expired after its return day");

const earlierBatch: ContractSuspension = { routeId: 42, weekdayMask: 0b0011111, suspendedUnits: 10, totalUnits: 61, startGameDay: 100, returnGameDay: 100 + 364, active: true };
const laterBatch: ContractSuspension = { routeId: 42, weekdayMask: 0b0011111, suspendedUnits: 15, totalUnits: 61, startGameDay: 300, returnGameDay: 300 + 364, active: true };
assert(totalActiveSuspendedUnits([earlierBatch, laterBatch], 350) === 25, "two still-active batches for the same route+weekday-mask sum their suspended units");
assert(totalActiveSuspendedUnits([earlierBatch, laterBatch], 465) === 15, "once the earlier batch's own return day has passed, only the later batch's units still count — each batch returns on ITS OWN date, not a shared/reset timer");
// totalActiveSuspendedUnits itself is weekday-mask-agnostic (it just sums
// whatever array it's given) — isUnitSuspended below is what actually
// filters by weekday-mask group before calling it, which is what the next
// few assertions check.
assert(isUnitSuspended([earlierBatch, laterBatch], 0b0011111, 24, 350) === true, "unit index 24 is covered (25 total suspended, 0-indexed up to 24)");
assert(isUnitSuspended([earlierBatch, laterBatch], 0b0011111, 25, 350) === false, "unit index 25 is the first one still run by the player (only 25 units are suspended)");
assert(isUnitSuspended([earlierBatch, laterBatch], 0b0011111, 20, 465) === false, "after the earlier batch expires (only laterBatch's 15 units remain active), unit index 20 — which only the now-expired earlier batch used to cover — goes back to the player");
assert(isUnitSuspended([earlierBatch, laterBatch], 0b0011111, 5, 465) === true, "unit index 5 is still covered by laterBatch alone, which hasn't expired yet");

const saturdayBatch: ContractSuspension = { ...earlierBatch, weekdayMask: 0b0100000 };
assert(isUnitSuspended([earlierBatch, laterBatch, saturdayBatch], 0b0100000, 5, 350) === true, "a Saturday-only batch is checked against the Saturday mask");
assert(totalActiveSuspendedUnits([earlierBatch, laterBatch, saturdayBatch].filter((s) => s.weekdayMask === 0b0011111), 350) === 25, "filtering to just the weekday-mask group first (as isUnitSuspended does) excludes the Saturday batch from the weekday total");

// --- The full daily pipeline, including escalation across several days
// and the eventual 6-month return -------------------------------------------
{
  const weekdayMask = 0b0011111;
  // A 398-shaped loop: route-statistics.mts's own T159 convention is that
  // a terminus loop ALWAYS has a genuine outbound+inbound pair, never a
  // single "both" component (roundTripSecondsForGroup's own comment) — 3
  // points, outbound ends at index 1 (6 min), inbound covers index 1->2
  // (11 min), for a real 17-minute round trip matching 398's own published
  // 6+4+7 = 17 minutes (DESIGN.md).
  const route: PvrRoute & { id: number } = { id: 42, points: [{ lon: 0, lat: 0 }, { lon: 0, lat: 0 }, { lon: 0, lat: 0 }], terminusIndex: 1, startIndex: 1 };
  const pvrTimetables: PvrTimetable[] = [
    { weekdayMask, direction: "outbound", timeBands: [{ intervalMinutes: 12 }], departureOffsetsSeconds: [0, 360] },
    { weekdayMask, direction: "inbound", timeBands: [], departureOffsetsSeconds: [0, 0, 660] },
  ];
  // PVR for this fixture (round trip 360+660=1020s=17min, 12-min headway) is ceil(17/12) = 2 vehicles.
  const timetableComponents: FixedContractTimetableComponent[] = [
    { weekdayMask, direction: "outbound", timeBands: real398WeekdayBands, excludedDepartureMinutes: [], customDepartureMinutes: [] },
  ];
  let fineDays: number[] = [];
  const suspensions: ContractSuspension[] = [];
  let day = 1_000;

  function evalDay(todayGameDay: number, availableVehicles: number, recentFineDayGameDays: readonly number[]) {
    return evaluateFixedContractDay({ route, pvrTimetables, timetableComponents, weekdayMask, todayGameDay, availableVehicles, recentFineDayGameDays, existingSuspensions: suspensions });
  }

  // Day 1: only 1 of 2 required vehicles available — a real, persistent
  // shortfall, but a single bad day must not trigger anything yet.
  let result = evalDay(day, 1, fineDays);
  assert(result.missedUnits > 0, "day 1: a genuine shortfall produces missed units");
  assert(result.newSuspension === null, "day 1: a single fine-day never triggers a suspension on its own");
  fineDays.push(day);

  // Day 2, same shortfall — still only 2 fine-days in the window.
  day += 1;
  result = evalDay(day, 1, fineDays);
  assert(result.newSuspension === null, "day 2: still only 2 fine-days, not enough to trigger yet");
  fineDays.push(day);

  // Day 3 — the 3rd fine-day inside the window triggers a real suspension.
  day += 1;
  result = evalDay(day, 1, fineDays);
  assert(result.newSuspension !== null, "day 3: the 3rd fine-day inside the 28-day window triggers a new suspension");
  assert(result.newSuspension!.suspendedUnits <= Math.floor(result.scheduledUnits * MAX_SUSPENDED_FRACTION), "the new suspension itself never exceeds the 60% ceiling");
  suspensions.push(result.newSuspension!);
  fineDays.push(day);
  const firstSuspension = result.newSuspension!;

  // Day 4 — shortfall persists, ceiling not yet reached: it keeps escalating.
  day += 1;
  result = evalDay(day, 1, fineDays);
  if (result.newSuspension) suspensions.push(result.newSuspension);
  fineDays.push(day);
  const totalSoFar = totalActiveSuspendedUnits(suspensions, day);
  assert(totalSoFar <= Math.floor(result.scheduledUnits * MAX_SUSPENDED_FRACTION), "across multiple escalations, the combined suspended total still never exceeds 60%");
  assert(totalSoFar >= firstSuspension.suspendedUnits, "escalation only ever adds to the suspended total, never removes from it while still failing");

  // Jump forward exactly 6 months from the first suspension's own start day
  // — it must return automatically, independently of any later batch.
  const sixMonthsLater = firstSuspension.returnGameDay;
  const stillActiveBeforeReturn = totalActiveSuspendedUnits(suspensions, sixMonthsLater - 1);
  const activeOnReturnDay = totalActiveSuspendedUnits(suspensions, sixMonthsLater);
  assert(activeOnReturnDay < stillActiveBeforeReturn, "on the first batch's own exact return day, its units stop counting as suspended — a real automatic return, not a lost-forever contract");

  const resultOnReturnDay = evalDay(sixMonthsLater, 2, []);
  assert(resultOnReturnDay.justExpired.some((s) => s.startGameDay === firstSuspension.startGameDay), "evaluateFixedContractDay itself reports the first batch as justExpired on its own real return day");
}

console.log("\nAll fixed-contract-failures checks passed.");
