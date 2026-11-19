// Manual verification script for duty-journeys.mts, run directly with
// `node --experimental-strip-types src/renderer/duty-journeys.verify.mts`
// — same pattern as route-timetable.verify.mts.
import { journeysForRoute, journeysForDepotGroup, journeyKey } from "./duty-journeys.mts";
import { MONDAY_FRIDAY_MASK, SATURDAY_MASK, WEEKDAY_BITS } from "./route-timetable.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const route: Route = {
  id: 1,
  depotGroupId: 10,
  number: "52",
  points: [
    { kind: "stop", osmId: 100, lon: -6.2, lat: 57.4 },
    { kind: "stop", osmId: 200, lon: -6.1, lat: 57.3 },
  ],
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
};

const timetable: RouteTimetable = {
  id: 1,
  routeId: 1,
  weekdayMask: MONDAY_FRIDAY_MASK,
  direction: "both",
  timeBands: [{ startMinutes: 480, endMinutes: 540, intervalMinutes: 30 }], // 08:00-09:00 every 30 min
  timingPoints: [],
  arrivalOffsetsSeconds: [0, 1800], // 30-minute run
  departureOffsetsSeconds: [0, 1800],
  arrivalOffsetsSecondsPeak: [0, 1800],
  departureOffsetsSecondsPeak: [0, 1800],
  excludedDepartureMinutes: [],
  customDepartureMinutes: [],
  mirrorSourceTimetableId: null,
  mirrorOffsetMinutes: null,
};

// --- journeysForRoute ---
const journeys = journeysForRoute(route, timetable);
assert(journeys.length === 3, `3 generated departures (08:00, 08:30, 09:00) — got ${journeys.length}`);
assert(journeys[0].departureMinutes === 480, "first journey departs at 480 (08:00)");
assert(journeys[0].startClockMinutes === 480, "start clock time matches departure (point 0 offset is 0)");
assert(journeys[0].endClockMinutes === 510, "end clock time is departure + 30 minutes (the last point's own offset)");
assert(journeys[0].startPoint.lon === -6.2 && journeys[0].startPoint.lat === 57.4, "start point matches route point 0");
assert(journeys[0].endPoint.lon === -6.1 && journeys[0].endPoint.lat === 57.3, "end point matches the route's last point");
assert(journeys[0].routeNumber === "52", "route number carried through");
assert(journeys[0].startStopOsmId === 100, "start stop osmId carried through for a real stop point");
assert(journeys[0].endStopOsmId === 200, "end stop osmId carried through for a real stop point");
assert(journeys[1].departureMinutes === 510, "second journey departs at 510 (08:30)");
assert(journeys[2].departureMinutes === 540, "third journey departs at 540 (09:00)");

// --- a waypoint endpoint (not a real stop) yields a null osmId, not a crash ---
const waypointRoute: Route = {
  ...route,
  points: [
    { kind: "waypoint", lon: -6.2, lat: 57.4 },
    { kind: "stop", osmId: 200, lon: -6.1, lat: 57.3 },
  ],
};
const waypointJourneys = journeysForRoute(waypointRoute, timetable);
assert(waypointJourneys[0].startStopOsmId === null, "a waypoint start point has no stop osmId");
assert(waypointJourneys[0].endStopOsmId === 200, "the other end's real stop osmId is unaffected");

// --- excluded/custom departures are respected, matching the merged grid's own pipeline ---
const withExclusionAndCustom = journeysForRoute(route, {
  ...timetable,
  excludedDepartureMinutes: [510], // exclude the 08:30 one
  customDepartureMinutes: [500], // add a one-off at 08:20
});
const minutes = withExclusionAndCustom.map((j) => j.departureMinutes);
assert(JSON.stringify(minutes) === JSON.stringify([480, 500, 540]), `excluded dropped, custom merged in sorted order — got ${JSON.stringify(minutes)}`);

// --- a timetable with stale/mismatched offsets (not yet computed for this many points) yields nothing, not a crash ---
const staleTimetable = { ...timetable, arrivalOffsetsSeconds: [0] };
assert(journeysForRoute(route, staleTimetable).length === 0, "mismatched offset length returns no journeys rather than throwing");

// --- an empty/invalid band set returns nothing rather than throwing ---
const invalidBands = { ...timetable, timeBands: [] };
assert(journeysForRoute(route, invalidBands).length === 0, "an empty band set returns no journeys rather than throwing");

// --- journeysForDepotGroup filters by depot group and day type, and sorts across routes ---
const otherRoute: Route = { ...route, id: 2, depotGroupId: 10, number: "53" };
const otherTimetable: RouteTimetable = {
  ...timetable,
  id: 2,
  routeId: 2,
  timeBands: [{ startMinutes: 490, endMinutes: 490, intervalMinutes: 30 }], // single 08:10 departure
};
const wrongDepotRoute: Route = { ...route, id: 3, depotGroupId: 99, number: "99" };
const wrongDepotTimetable: RouteTimetable = { ...timetable, id: 3, routeId: 3 };

const combined = journeysForDepotGroup(
  [route, otherRoute, wrongDepotRoute],
  [timetable, otherTimetable, wrongDepotTimetable],
  10,
  MONDAY_FRIDAY_MASK,
);
assert(combined.length === 4, `3 from route 52 + 1 from route 53, depot group 99's route excluded — got ${combined.length}`);
assert(
  combined.every((j, i) => i === 0 || j.startClockMinutes >= combined[i - 1].startClockMinutes),
  "journeys from different routes are merged into one time-sorted list",
);
assert(combined[1].routeId === 2, "the 08:10 departure from route 53 sorts correctly between route 52's 08:00 and 08:30");

// --- journeysForDepotGroup finds a Mon-Fri-only timetable while viewing a combined Mon-Sat day type (2026-11-14 live bug) ---
const monSatMask = MONDAY_FRIDAY_MASK | SATURDAY_MASK;
const monFriOnlyRouteViewedAsMonSat = journeysForDepotGroup([route], [timetable], 10, monSatMask);
assert(
  monFriOnlyRouteViewedAsMonSat.length === 3,
  `a Mon-Fri-only timetable's journeys must still appear while viewing the combined Mon-Sat day type (they share Mon-Fri), got ${monFriOnlyRouteViewedAsMonSat.length}`,
);
// The mirror case: a Saturday-only timetable has no day in common with
// Mon-Fri at all, so it correctly finds nothing.
const saturdayOnlyTimetable: RouteTimetable = { ...timetable, weekdayMask: SATURDAY_MASK };
const saturdayOnlyViewedAsMonFri = journeysForDepotGroup([route], [saturdayOnlyTimetable], 10, MONDAY_FRIDAY_MASK);
assert(saturdayOnlyViewedAsMonFri.length === 0, "a Saturday-only timetable shares no day with Mon-Fri, so it correctly contributes nothing");
// A single specific weekday bit (e.g. viewing just Wednesday) still finds
// the Mon-Fri timetable too — confirms the fix isn't special-cased to
// combined masks only.
const wednesdayOnly = journeysForDepotGroup([route], [timetable], 10, WEEKDAY_BITS.wednesday);
assert(wednesdayOnly.length === 3, `viewing a single day (Wednesday) still matches a Mon-Fri timetable covering it, got ${wednesdayOnly.length}`);

// --- a split (outbound/inbound) timetable component reads its own leg's
// offsets, not the route's point 0 / very last point (2026-11-14 live
// bug: "duties keep getting the first stop twice" — a round-trip route
// split into outbound/inbound components has its own last point back at
// the SAME physical stop as point 0, and computeOffsetsForDirection only
// ever fills in a component's own leg, leaving the other leg's offsets at
// their default 0 — reading point 0/the very last point unconditionally
// produced a bogus "same stop to itself, 0 minutes" journey) ---
const splitRoute: Route = {
  ...route,
  points: [
    { kind: "stop", osmId: 100, lon: -6.2, lat: 57.4 }, // 0: outbound start
    { kind: "waypoint", lon: -6.18, lat: 57.38 }, // 1
    { kind: "stop", osmId: 200, lon: -6.15, lat: 57.35 }, // 2: terminus
    { kind: "waypoint", lon: -6.18, lat: 57.38 }, // 3
    { kind: "stop", osmId: 100, lon: -6.2, lat: 57.4 }, // 4: back at the same physical stop as point 0
  ],
  terminusIndex: 2,
  startIndex: 2,
};
const outboundOnlyTimetable: RouteTimetable = {
  ...timetable,
  direction: "outbound",
  // Only indices 0..2 (the outbound leg) have real offsets —
  // computeOffsetsForDirection's own convention leaves 3/4 at 0. Peak
  // arrays set to the same values (this fixture's own generated
  // departures — 08:00/08:30/09:00 — all fall inside the AM peak window,
  // so journeysForRoute's own peak pick is genuinely exercised here, not
  // just the standard arrays by coincidence).
  departureOffsetsSeconds: [0, 600, 1200, 0, 0],
  arrivalOffsetsSeconds: [0, 600, 1200, 0, 0],
  departureOffsetsSecondsPeak: [0, 600, 1200, 0, 0],
  arrivalOffsetsSecondsPeak: [0, 600, 1200, 0, 0],
};
const splitJourneys = journeysForRoute(splitRoute, outboundOnlyTimetable);
assert(splitJourneys.length === 3, `3 generated departures for the split-route fixture — got ${splitJourneys.length}`);
assert(splitJourneys[0].endClockMinutes - splitJourneys[0].startClockMinutes === 20, `outbound leg duration must be 20 minutes (its own real terminus offset), got ${splitJourneys[0].endClockMinutes - splitJourneys[0].startClockMinutes}`);
assert(splitJourneys[0].endStopOsmId === 200, `outbound leg must end at its own real terminus (osmId 200), not loop back to point 0's stop — got ${splitJourneys[0].endStopOsmId}`);
assert(splitJourneys[0].endPoint.lon === -6.15, "outbound leg's end point is the terminus, not the route's very last point");

// --- journeyKey ---
assert(journeyKey(1, 480) === "1:480", "journeyKey is a stable, readable composite of route id and departure minute");
assert(journeyKey(1, 480) !== journeyKey(2, 480), "different routes produce different keys for the same departure minute");

console.log("\nAll duty-journeys checks passed.");
