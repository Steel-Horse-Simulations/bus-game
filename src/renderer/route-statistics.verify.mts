// Manual verification script for route-statistics.mts, run directly with
// `node --experimental-strip-types src/renderer/route-statistics.verify.mts`.
import {
  emptyRouteStatsAccumulator,
  recordTripOutcome,
  recordStopVisit,
  loadFactorPercent,
  giveUpRatePercent,
  routeOneWayDistanceMiles,
  revenueForRouteGBPPence,
  revenuePerMileGBPPence,
  computeRouteStatistics,
  computePeakVehicleRequirement,
  vehicleRequirementBucketForRoute,
  computeDepotVehicleRequirements,
  type PvrTimetable,
} from "./route-statistics.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Load factor / give-up rate: no data recorded yet -> null, not a fake 0 ---
const freshAcc = emptyRouteStatsAccumulator();
assert(loadFactorPercent(freshAcc) === null, "no stop visits recorded yet -> load factor is null, not a fabricated 0%");
assert(giveUpRatePercent(freshAcc) === null, "no trip attempts recorded yet -> give-up rate is null, not a fabricated 0%");

// --- Give-up rate: a real worked example ---
const acc1 = emptyRouteStatsAccumulator();
recordTripOutcome(acc1, true);
recordTripOutcome(acc1, true);
recordTripOutcome(acc1, true);
recordTripOutcome(acc1, false);
assert(acc1.tripsCarried === 3, "3 carried trips recorded");
assert(acc1.tripsGaveUp === 1, "1 gave-up trip recorded");
assert(giveUpRatePercent(acc1) === 25, `give-up rate should be exactly 25% (1 of 4), got ${giveUpRatePercent(acc1)}`);

// --- Load factor: weighted by real totals, not an average of percentages ---
const acc2 = emptyRouteStatsAccumulator();
// A near-empty journey (5 of 70) and a packed one (70 of 70) — a naive
// average of the two percentages would give (7.1% + 100%) / 2 = 53.6%,
// but the real combined load factor (75 on board of 140 capacity
// offered) is 53.57...% too in THIS case by coincidence of chosen
// numbers — use genuinely different weights below to actually
// distinguish the two approaches.
recordStopVisit(acc2, 5, 70, 5, 0);
recordStopVisit(acc2, 70, 70, 65, 0);
recordStopVisit(acc2, 70, 70, 65, 0);
// Naive per-visit average: (5/70 + 70/70 + 70/70) / 3 = 71.43%.
// Real totals-weighted figure: (5+70+70) / (70+70+70) = 145/210 = 69.05%.
const lf = loadFactorPercent(acc2);
assert(lf !== null && Math.abs(lf - (145 / 210) * 100) < 1e-9, `load factor must be the real totals-weighted ratio (69.047...%), got ${lf}`);
assert(lf !== null && Math.abs(lf - 71.43) > 0.1, "load factor must NOT equal the naive per-visit average (71.43%) — confirms it's weighted by real totals, not averaged");

// --- leftBehind is tracked separately from boarded, not folded in ---
const acc3 = emptyRouteStatsAccumulator();
recordStopVisit(acc3, 70, 70, 20, 5);
assert(acc3.boardedCount === 20, "boardedCount tracks real boarders only");
assert(acc3.leftBehindCount === 5, "leftBehindCount tracks real capacity-overflow passengers separately");

// --- Route distance: straight-line sum between consecutive points ---
const points = [
  { lon: 0, lat: 0 },
  { lon: 0, lat: 0.01 }, // ~1.1127 km north
  { lon: 0.01, lat: 0.01 }, // further east
];
const miles = routeOneWayDistanceMiles(points);
assert(miles > 0, `a real multi-point route has a positive distance, got ${miles}`);
assert(routeOneWayDistanceMiles([{ lon: 0, lat: 0 }]) === 0, "a single-point route has zero distance, not a crash");
assert(routeOneWayDistanceMiles([]) === 0, "an empty points array has zero distance, not a crash");

// --- Revenue parsing: matches this codebase's own exact ledger description format ---
const transactions = [
  { category: "Fare revenue", description: "Route 52 fares", amountGBPPence: 150 },
  { category: "Fare revenue", description: "Route 52 fares", amountGBPPence: 220 },
  { category: "Fare revenue", description: "Route 53 fares", amountGBPPence: 999 }, // a different route — must not leak in
  { category: "Vehicle lease", description: "Route 52 fares", amountGBPPence: 500 }, // right description, wrong category — must not count
];
assert(revenueForRouteGBPPence("52", transactions) === 370, `route 52's own real revenue should be 150+220=370, got ${revenueForRouteGBPPence("52", transactions)}`);
assert(revenueForRouteGBPPence("53", transactions) === 999, "route 53's own revenue is tracked independently of route 52's");
assert(revenueForRouteGBPPence("999", transactions) === 0, "a route with no matching ledger entries at all has zero revenue, not a crash");

// --- Revenue per mile ---
assert(revenuePerMileGBPPence(1000, 10) === 100, "1000p over 10 miles is 100p/mile");
assert(revenuePerMileGBPPence(1000, 0) === null, "zero-length route -> null, not a division-by-zero artefact");
assert(revenuePerMileGBPPence(1000, -1) === null, "a nonsensical negative distance -> null, not a negative-pence artefact");

// --- The combined shape a real panel actually renders ---
const route = { id: 52, number: "52", points, terminusIndex: null, startIndex: null };
const stats = computeRouteStatistics(route, acc1, transactions.slice(0, 2), []);
assert(stats.routeId === 52 && stats.routeNumber === "52", "combined stats carry the real route identity through");
assert(stats.tripsCarried === 3 && stats.tripsGaveUp === 1, "combined stats carry the real accumulator's own trip counts through");
assert(stats.totalRevenueGBPPence === 370, "combined stats compute the real route-specific revenue");
assert(stats.revenuePerMileGBPPence !== null, "a route with real length and real revenue gets a real per-mile figure");
assert(stats.peakVehicleRequirement === null, "a route with no timetable passed in has no real peak-vehicle-requirement figure, not a fabricated one");

// A route no accumulator has ever been built for yet (undefined, not an
// empty object) still produces sensible nulls rather than throwing.
const statsNoAcc = computeRouteStatistics(route, undefined, [], []);
assert(statsNoAcc.loadFactorPercent === null, "an entirely untracked route's load factor is null");
assert(statsNoAcc.giveUpRatePercent === null, "an entirely untracked route's give-up rate is null");
assert(statsNoAcc.totalRevenueGBPPence === 0, "an entirely untracked route with no matching transactions has zero revenue");

// --- Peak vehicle requirement (PVR) ---------------------------------------

const MONDAY_FRIDAY = 0b0011111;
const SATURDAY = 0b0100000;

// A real worked example: a 90-minute round trip (one "both" component
// whose own real published one-way duration is 45 minutes, doubled by
// the documented reverse-traversal-symmetric convention) running every
// 20 minutes needs ceil(90/20) = 5 vehicles.
const ordinaryRoute = { points: [{ lon: 0, lat: 0 }, { lon: 0, lat: 1 }], terminusIndex: null, startIndex: null };
const oneWayTimetable: PvrTimetable = {
  weekdayMask: MONDAY_FRIDAY,
  direction: "both",
  timeBands: [{ intervalMinutes: 20 }],
  departureOffsetsSeconds: [0, 45 * 60],
};
const pvr1 = computePeakVehicleRequirement(ordinaryRoute, [oneWayTimetable]);
assert(pvr1 !== null && pvr1.vehicles === 5, `a 90-minute round trip every 20 minutes needs exactly 5 vehicles, got ${pvr1?.vehicles}`);
assert(pvr1 !== null && pvr1.roundTripSeconds === 90 * 60, `round trip must be DOUBLED one-way time (90 min), not the raw 45 min one-way figure, got ${pvr1?.roundTripSeconds}`);

// A route with NO real timetable at all -> null, not a fabricated 0.
assert(computePeakVehicleRequirement(ordinaryRoute, []) === null, "a route with no timetable at all has no real PVR figure, not a fabricated one");

// Multiple bands with different headways -> the MAXIMUM across bands
// (the busiest moment), never a sum.
const multiBandTimetable: PvrTimetable = {
  weekdayMask: MONDAY_FRIDAY,
  direction: "both",
  timeBands: [{ intervalMinutes: 60 }, { intervalMinutes: 15 }, { intervalMinutes: 30 }],
  departureOffsetsSeconds: [0, 30 * 60], // one-way 30 min -> round trip 60 min
};
const pvr2 = computePeakVehicleRequirement(ordinaryRoute, [multiBandTimetable]);
// ceil(60/60)=1, ceil(60/15)=4, ceil(60/30)=2 -> max is 4, not the sum (7).
assert(pvr2 !== null && pvr2.vehicles === 4, `must take the MAX across bands (4, from the 15-minute band), not the sum, got ${pvr2?.vehicles}`);
assert(pvr2 !== null && pvr2.busiestIntervalMinutes === 15, `the busiest band's own interval (15) should be reported, got ${pvr2?.busiestIntervalMinutes}`);

// A genuine real outbound+inbound split (e.g. a terminus loop, or an
// ordinary route the player has deliberately split per timing) sums the
// two real published durations directly — no doubling.
const splitOutbound: PvrTimetable = {
  weekdayMask: MONDAY_FRIDAY,
  direction: "outbound",
  timeBands: [{ intervalMinutes: 30 }],
  departureOffsetsSeconds: [0, 1, 40 * 60], // terminusIndex is 2 below
};
const splitInbound: PvrTimetable = {
  weekdayMask: MONDAY_FRIDAY,
  direction: "inbound",
  timeBands: [{ intervalMinutes: 30 }],
  departureOffsetsSeconds: [0, 1, 50 * 60],
};
const loopRoute = { points: [{ lon: 0, lat: 0 }, { lon: 0, lat: 0.5 }, { lon: 0, lat: 1 }], terminusIndex: 2, startIndex: 2 };
const pvr3 = computePeakVehicleRequirement(loopRoute, [splitOutbound, splitInbound]);
// Round trip = 40 + 50 = 90 min, every 30 min -> ceil(90/30) = 3.
assert(pvr3 !== null && pvr3.roundTripSeconds === 90 * 60, `a real outbound+inbound split must SUM its two real durations (90 min total), not double either one, got ${pvr3?.roundTripSeconds}`);
assert(pvr3 !== null && pvr3.vehicles === 3, `90 min round trip every 30 min needs 3 vehicles, got ${pvr3?.vehicles}`);

// Different weekday masks can genuinely have different round-trip times
// (different timing-point padding) — the overall figure must be the max
// across every real mask group, not just the first one found.
const saturdayTimetable: PvrTimetable = {
  weekdayMask: SATURDAY,
  direction: "both",
  timeBands: [{ intervalMinutes: 10 }],
  departureOffsetsSeconds: [0, 5 * 60], // one-way 5 min -> round trip 10 min -> ceil(10/10)=1
};
const pvr4 = computePeakVehicleRequirement(ordinaryRoute, [oneWayTimetable, saturdayTimetable]);
assert(pvr4 !== null && pvr4.vehicles === 5, `the weekday group's own 5-vehicle requirement must still win over the quieter Saturday group's 1, got ${pvr4?.vehicles}`);

// A non-positive interval is never divided by.
const zeroIntervalTimetable: PvrTimetable = { weekdayMask: MONDAY_FRIDAY, direction: "both", timeBands: [{ intervalMinutes: 0 }], departureOffsetsSeconds: [0, 60] };
assert(computePeakVehicleRequirement(ordinaryRoute, [zeroIntervalTimetable]) === null, "a zero-interval band is skipped, not divided by (which would be Infinity)");

// --- Vehicle-type bucketing for the per-depot breakdown -------------------

const liverySpecificRoute = { ScotRail: "398", Citylink: "909", "National Express": "909" };
assert(vehicleRequirementBucketForRoute("398", liverySpecificRoute) === "Single-deckers/midibuses, electric (ScotRail)", "route 398 is special-cased to ScotRail's own real lock");
assert(vehicleRequirementBucketForRoute("909", liverySpecificRoute) === "Coaches", "a route locked to a coach-only livery (Citylink) buckets as Coaches");
assert(vehicleRequirementBucketForRoute("52", liverySpecificRoute) === "unrestricted", "a route with no real vehicle-type lock buckets as unrestricted");

// --- Per-depot breakdown, real separation by bucket ------------------------

const depotRoutes = [
  { id: 1, number: "398", depotGroupId: 10, points: ordinaryRoute.points, terminusIndex: null, startIndex: null },
  { id: 2, number: "909", depotGroupId: 10, points: ordinaryRoute.points, terminusIndex: null, startIndex: null },
  { id: 3, number: "52", depotGroupId: 10, points: ordinaryRoute.points, terminusIndex: null, startIndex: null },
  { id: 4, number: "999", depotGroupId: 99, points: ordinaryRoute.points, terminusIndex: null, startIndex: null }, // a different depot group — must not leak in
];
const timetablesByRouteId = new Map<number, PvrTimetable[]>([
  [1, [oneWayTimetable]], // 5 vehicles, ScotRail bucket
  [2, [multiBandTimetable]], // 4 vehicles, Coaches bucket
  [3, [oneWayTimetable]], // 5 vehicles, unrestricted bucket
  [4, [oneWayTimetable]], // different depot group entirely
]);
const breakdown = computeDepotVehicleRequirements(10, depotRoutes, timetablesByRouteId, liverySpecificRoute);
const scotRailEntry = breakdown.find((b) => b.bucket === "Single-deckers/midibuses, electric (ScotRail)");
const coachEntry = breakdown.find((b) => b.bucket === "Coaches");
const unrestrictedEntry = breakdown.find((b) => b.bucket === "unrestricted");
assert(breakdown.length === 3, `depot 10 has exactly 3 real buckets, got ${breakdown.length}`);
assert(scotRailEntry?.vehicles === 5, `ScotRail bucket should show 5 vehicles, got ${scotRailEntry?.vehicles}`);
assert(coachEntry?.vehicles === 4, `Coaches bucket should show 4 vehicles, got ${coachEntry?.vehicles}`);
assert(unrestrictedEntry?.vehicles === 5, `unrestricted bucket should show 5 vehicles, got ${unrestrictedEntry?.vehicles}`);
assert(breakdown.every((b) => !b.routeNumbers.includes("999")), "a route from a DIFFERENT depot group must never leak into this depot's breakdown");

// Two routes sharing the same bucket are genuinely SUMMED, not just the
// last one overwriting the first.
const sharedBucketRoutes = [
  { id: 5, number: "52", depotGroupId: 20, points: ordinaryRoute.points, terminusIndex: null, startIndex: null },
  { id: 6, number: "53", depotGroupId: 20, points: ordinaryRoute.points, terminusIndex: null, startIndex: null },
];
const sharedBucketTimetables = new Map<number, PvrTimetable[]>([
  [5, [oneWayTimetable]], // 5 vehicles
  [6, [oneWayTimetable]], // 5 vehicles
]);
const sharedBreakdown = computeDepotVehicleRequirements(20, sharedBucketRoutes, sharedBucketTimetables, {});
assert(sharedBreakdown.length === 1 && sharedBreakdown[0].vehicles === 10, `two unrestricted routes needing 5 vehicles each must SUM to 10 in one bucket, got ${JSON.stringify(sharedBreakdown)}`);
assert(sharedBreakdown[0].routeNumbers.length === 2, "both real route numbers are recorded against the shared bucket");

console.log("\nAll route-statistics checks passed.");
