// Manual verification script for duty-journeys.mts, run directly with
// `node --experimental-strip-types src/renderer/duty-journeys.verify.mts`
// — same pattern as route-timetable.verify.mts.
import { journeysForRoute, journeysForDepotGroup, journeyKey } from "./duty-journeys.mts";

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
  parentRouteId: null,
  variationLetter: null,
  composedFromRouteIds: [],
  hailAndRideSections: [],
};

const timetable: RouteTimetable = {
  id: 1,
  routeId: 1,
  dayType: "monday_friday",
  direction: "both",
  timeBands: [{ startMinutes: 480, endMinutes: 540, intervalMinutes: 30 }], // 08:00-09:00 every 30 min
  timingPoints: [],
  arrivalOffsetsSeconds: [0, 1800], // 30-minute run
  departureOffsetsSeconds: [0, 1800],
  excludedDepartureMinutes: [],
  customDepartureMinutes: [],
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
  "monday_friday",
);
assert(combined.length === 4, `3 from route 52 + 1 from route 53, depot group 99's route excluded — got ${combined.length}`);
assert(
  combined.every((j, i) => i === 0 || j.startClockMinutes >= combined[i - 1].startClockMinutes),
  "journeys from different routes are merged into one time-sorted list",
);
assert(combined[1].routeId === 2, "the 08:10 departure from route 53 sorts correctly between route 52's 08:00 and 08:30");

// --- journeyKey ---
assert(journeyKey(1, 480) === "1:480", "journeyKey is a stable, readable composite of route id and departure minute");
assert(journeyKey(1, 480) !== journeyKey(2, 480), "different routes produce different keys for the same departure minute");

console.log("\nAll duty-journeys checks passed.");
