// Manual verification script for route-timetable-grid.mts, run directly
// with `node --experimental-strip-types src/renderer/route-timetable-
// grid.verify.mts` — same pattern as the project's other .verify.mts files.
import { buildRouteTimetableGrid } from "./route-timetable-grid.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function route(
  points: { kind: "stop" | "waypoint"; osmId?: number }[],
  pickupDropoffOverrides: RoutePickupDropoffOverride[] = [],
): Route {
  return {
    id: 1,
    depotGroupId: 1,
    number: "10",
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
  startMinutes: number,
  endMinutes: number,
  intervalMinutes: number,
  departureOffsetsSeconds: number[],
): RouteTimetable {
  return {
    id: 1,
    routeId: 1,
    dayType: "monday_friday",
    timeBands: [{ startMinutes, endMinutes, intervalMinutes }],
    timingPoints: [],
    arrivalOffsetsSeconds: departureOffsetsSeconds,
    departureOffsetsSeconds,
  };
}

// Waypoints never become rows — only real stops appear on a passenger
// timetable, matching DESIGN.md §7's own "stops down" description.
{
  const r = route([{ kind: "stop", osmId: 111 }, { kind: "waypoint" }, { kind: "stop", osmId: 222 }]);
  const tt = timetable(480, 480, 30, [0, 999, 300]);
  const grid = buildRouteTimetableGrid(r, tt);
  assert(grid.rows.length === 2, "waypoints are excluded, only the two real stops become rows");
  assert(grid.rows[0].osmId === 111 && grid.rows[1].osmId === 222, "rows keep the stops' own order and osmId");
  assert(grid.rows[0].pointIndex === 0 && grid.rows[1].pointIndex === 2, "rows keep their real point index for offset lookup, skipping the waypoint's index");
}

// One column per generated journey, each with one time per row.
{
  const r = route([{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }]);
  const tt = timetable(480, 540, 30, [0, 300]); // three departures: 480, 510, 540
  const grid = buildRouteTimetableGrid(r, tt);
  assert(grid.journeys.length === 3, "three departures (480, 510, 540) produce three journey columns");
  assert(
    JSON.stringify(grid.journeys[0]) === JSON.stringify([480, 485]) &&
      JSON.stringify(grid.journeys[1]) === JSON.stringify([510, 515]) &&
      JSON.stringify(grid.journeys[2]) === JSON.stringify([540, 545]),
    `expected [480,485]/[510,515]/[540,545], got ${JSON.stringify(grid.journeys)}`,
  );
}

// A zero/negative interval produces no journeys rather than hanging, same
// guard as computeStopCallingServices.
{
  const r = route([{ kind: "stop", osmId: 111 }]);
  const tt = timetable(480, 600, 0, [0]);
  const grid = buildRouteTimetableGrid(r, tt);
  assert(grid.journeys.length === 0, "a zero interval produces no journey columns rather than hanging");
}

// An express's skipped stop (DESIGN.md §6) stays a real row — the stop is
// still on the physical path — but every journey shows null (a gap) there
// instead of a time, since skip is a route-level flag applying uniformly
// to every journey today, not a per-journey one.
{
  const r = route(
    [{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }, { kind: "stop", osmId: 333 }],
    [{ pointIndex: 1, value: "skip" }],
  );
  const tt = timetable(480, 510, 30, [0, 300, 600]);
  const grid = buildRouteTimetableGrid(r, tt);
  assert(grid.rows.length === 3, "the skipped stop is still a row, not removed from the grid");
  assert(
    grid.journeys.every((j) => j[1] === null),
    `every journey should show null at the skipped row, got ${JSON.stringify(grid.journeys)}`,
  );
  assert(
    grid.journeys.every((j) => j[0] !== null && j[2] !== null),
    "the non-skipped rows still have real times",
  );
}

console.log("\nAll route-timetable-grid checks passed.");
