// Manual verification script for stop-calling-services.ts, run directly
// with `node --experimental-strip-types src/renderer/stop-calling-
// services.verify.mts` — same pattern as route-timetable.verify.mts. Pure
// functions, no DOM/IPC dependency.
import { computeStopCallingServices, formatClockMinutes } from "./stop-calling-services.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function route(
  id: number,
  number: string,
  points: { kind: "stop" | "waypoint"; osmId?: number }[],
  pickupDropoffOverrides: RoutePickupDropoffOverride[] = [],
): Route {
  return {
    id,
    depotGroupId: 1,
    number,
    points: points.map((p) => ({ ...p, lon: 0, lat: 0 })),
    orientation: "outbound",
    terminusIndex: null,
    startIndex: null,
    colour: "#000000",
    name: null,
    pickupDropoffOverrides,
    parentRouteId: null,
    variationLetter: null,
  };
}

function timetable(
  id: number,
  routeId: number,
  dayType: DayType,
  startMinutes: number,
  endMinutes: number,
  intervalMinutes: number,
  departureOffsetsSeconds: number[],
): RouteTimetable {
  return {
    id,
    routeId,
    dayType,
    timeBands: [{ startMinutes, endMinutes, intervalMinutes }],
    timingPoints: [],
    arrivalOffsetsSeconds: departureOffsetsSeconds,
    departureOffsetsSeconds,
  };
}

// A route that doesn't call at this stop at all is excluded entirely.
{
  const routes = [route(1, "10", [{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }])];
  const timetables = [timetable(1, 1, "monday_friday", 480, 600, 30, [0, 300])];
  const result = computeStopCallingServices(999, routes, timetables);
  assert(result.length === 0, "a route with no matching point is excluded");
}

// An express's skipped stop (DESIGN.md §6) is excluded from that stop's
// calling services entirely, even though the point is still physically on
// the route and has a real computed offset.
{
  const routes = [
    route(
      1,
      "X10",
      [{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }, { kind: "stop", osmId: 333 }],
      [{ pointIndex: 1, value: "skip" }],
    ),
  ];
  const timetables = [timetable(1, 1, "monday_friday", 480, 480, 30, [0, 300, 600])];
  const resultSkipped = computeStopCallingServices(222, routes, timetables);
  assert(resultSkipped.length === 0, "the skipped stop shows no calling service for this route at all");
  const resultOther = computeStopCallingServices(111, routes, timetables);
  assert(resultOther.length === 1, "an unrelated stop on the same route is unaffected by another point's skip flag");
}

// A plain single-point stop on a single day type: three departures.
{
  const routes = [route(1, "10", [{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }])];
  const timetables = [timetable(1, 1, "monday_friday", 480, 540, 30, [0, 300])];
  const result = computeStopCallingServices(111, routes, timetables);
  assert(result.length === 1, "one route/day-type combination found");
  assert(result[0].routeNumber === "10" && result[0].dayType === "monday_friday", "route/day-type identified correctly");
  assert(
    JSON.stringify(result[0].departureClockMinutes) === JSON.stringify([480, 510, 540]),
    `expected [480,510,540], got ${JSON.stringify(result[0].departureClockMinutes)}`,
  );
}

// A stop reached via the offset point (not point 0) uses that point's own
// departure offset, not point 0's.
{
  const routes = [route(1, "10", [{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }])];
  const timetables = [timetable(1, 1, "monday_friday", 480, 480, 30, [0, 300])]; // +5 min at point 1
  const result = computeStopCallingServices(222, routes, timetables);
  assert(
    JSON.stringify(result[0].departureClockMinutes) === JSON.stringify([485]),
    `expected [485] (480 + 5min offset), got ${JSON.stringify(result[0].departureClockMinutes)}`,
  );
}

// A loop route where the same physical stop is both point 0 and the last
// point contributes both passes, merged into one sorted list.
{
  const routes = [
    route(1, "398", [
      { kind: "stop", osmId: 111 },
      { kind: "stop", osmId: 222 },
      { kind: "stop", osmId: 111 },
    ]),
  ];
  const timetables = [timetable(1, 1, "monday_friday", 480, 480, 60, [0, 300, 600])];
  const result = computeStopCallingServices(111, routes, timetables);
  assert(result.length === 1, "both passes merge into a single route/day-type entry, not two");
  assert(
    JSON.stringify(result[0].departureClockMinutes) === JSON.stringify([480, 490]),
    `expected [480,490] (point 0 at +0, point 2 at +10), got ${JSON.stringify(result[0].departureClockMinutes)}`,
  );
}

// Sorted by route number (numeric, not lexical) then day-type order.
{
  const routes = [
    route(2, "9", [{ kind: "stop", osmId: 111 }]),
    route(1, "10", [{ kind: "stop", osmId: 111 }]),
  ];
  const timetables = [
    timetable(1, 1, "sunday", 480, 480, 30, [0]),
    timetable(2, 1, "monday_friday", 480, 480, 30, [0]),
    timetable(3, 2, "monday_friday", 480, 480, 30, [0]),
  ];
  const result = computeStopCallingServices(111, routes, timetables);
  const order = result.map((r) => `${r.routeNumber}/${r.dayType}`);
  assert(
    JSON.stringify(order) === JSON.stringify(["9/monday_friday", "10/monday_friday", "10/sunday"]),
    `expected numeric route order with day-types grouped per route, got ${JSON.stringify(order)}`,
  );
}

// A degenerate zero/negative interval is skipped rather than looping forever.
{
  const routes = [route(1, "10", [{ kind: "stop", osmId: 111 }])];
  const timetables = [timetable(1, 1, "monday_friday", 480, 600, 0, [0])];
  const result = computeStopCallingServices(111, routes, timetables);
  assert(result.length === 0, "a zero interval produces no departures rather than hanging");
}

// formatClockMinutes wraps a post-midnight offset back into 00:00-23:59.
{
  assert(formatClockMinutes(0) === "00:00", "midnight formats as 00:00");
  assert(formatClockMinutes(90) === "01:30", "90 minutes formats as 01:30");
  assert(formatClockMinutes(1440) === "00:00", "exactly 24h wraps back to 00:00");
  assert(formatClockMinutes(1465) === "00:25", "24h25m wraps to 00:25");
}

console.log("\nAll stop-calling-services checks passed.");
