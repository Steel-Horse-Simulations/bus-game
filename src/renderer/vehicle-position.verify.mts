// Manual verification script for vehicle-position.mts, run directly with
// `node --experimental-strip-types src/renderer/vehicle-position.verify.mts`
// — same pattern as the project's other .verify.mts files. Pure geometry,
// no DOM/maplibre-gl/wasm dependency.
import { interpolateAlongPolyline, computeVehiclePosition, type RouteLeg, type JourneyPointTiming } from "./vehicle-position.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function closeTo(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

// --- interpolateAlongPolyline ---

{
  const result = interpolateAlongPolyline([[0, 0]], 0.5);
  assert(result.position[0] === 0 && result.position[1] === 0, "a single-point polyline always returns that point");
}

{
  const coords: [number, number][] = [[0, 0], [0, 0.01]];
  const start = interpolateAlongPolyline(coords, 0);
  assert(closeTo(start.position[0], 0, 1e-9) && closeTo(start.position[1], 0, 1e-9), "fraction 0 is the first point");
  const end = interpolateAlongPolyline(coords, 1);
  assert(closeTo(end.position[1], 0.01, 1e-9), "fraction 1 is the last point");
  const mid = interpolateAlongPolyline(coords, 0.5);
  assert(closeTo(mid.position[1], 0.005, 1e-6), "fraction 0.5 on a straight two-point line is the midpoint");
  assert(closeTo(mid.bearingDegrees, 0, 0.5), "heading due north (increasing latitude, same longitude) is bearing 0");
}

{
  // A right-angle polyline: due east then due north, equal-length legs —
  // cumulative-distance interpolation should treat the halfway point as
  // the corner, not naive linear interpolation across all three points
  // (which would cut the corner diagonally).
  const coords: [number, number][] = [[0, 0], [0.01, 0], [0.01, 0.01]];
  const corner = interpolateAlongPolyline(coords, 0.5);
  assert(
    closeTo(corner.position[0], 0.01, 1e-6) && closeTo(corner.position[1], 0, 1e-6),
    `the halfway point of two equal-length legs should be the corner itself, got ${JSON.stringify(corner.position)}`,
  );
  const quarter = interpolateAlongPolyline(coords, 0.25);
  assert(
    closeTo(quarter.position[0], 0.005, 1e-6) && closeTo(quarter.position[1], 0, 1e-6),
    "a quarter of the way through should be a quarter along the first (eastward) leg only",
  );
  assert(closeTo(quarter.bearingDegrees, 90, 0.5), "travelling due east is bearing 90");
}

// --- computeVehiclePosition ---

function points(...offsets: [number, number][]): JourneyPointTiming[] {
  return offsets.map(([a, d]) => ({ arrivalOffsetSeconds: a, departureOffsetSeconds: d }));
}

{
  const legs: RouteLeg[] = [{ coords: [[0, 0], [0, 0.01]] }];
  const pts = points([0, 0], [600, 600]); // a 600s (10 min) leg, no timing-point dwell
  assert(computeVehiclePosition(legs, pts, -1) === null, "before departure (negative elapsed) is null");
  assert(computeVehiclePosition(legs, pts, 601) === null, "after the journey's final arrival is null");
  const start = computeVehiclePosition(legs, pts, 0)!;
  assert(start.position[1] === 0, "at elapsed 0 the bus is at point 0");
  const mid = computeVehiclePosition(legs, pts, 300)!;
  assert(closeTo(mid.position[1], 0.005, 1e-6), "halfway through a 600s leg at 300s elapsed is halfway along it");
  const end = computeVehiclePosition(legs, pts, 600)!;
  assert(closeTo(end.position[1], 0.01, 1e-6), "at the final arrival the bus is at the last point");
}

{
  // A timing point at index 1 with a real dwell: point 1's arrival and
  // departure differ, so the bus should be held there (not still moving)
  // for the whole gap, exactly the DESIGN.md §7 "wait at timing points"
  // behaviour, with no extra logic needed here.
  const legs: RouteLeg[] = [
    { coords: [[0, 0], [0, 0.01]] }, // point 0 -> point 1, 300s
    { coords: [[0, 0.01], [0, 0.02]] }, // point 1 -> point 2, 300s
  ];
  const pts = points([0, 0], [300, 360], [660, 660]); // 60s dwell at point 1
  const justArrived = computeVehiclePosition(legs, pts, 300)!;
  assert(closeTo(justArrived.position[1], 0.01, 1e-6), "arriving at the timing point lands exactly on it");
  const stillDwelling = computeVehiclePosition(legs, pts, 330)!;
  assert(
    closeTo(stillDwelling.position[1], 0.01, 1e-6),
    "30s into a 60s dwell the bus is still held at the timing point, not part-way onto the next leg",
  );
  const departed = computeVehiclePosition(legs, pts, 420)!;
  assert(
    stillDwelling.position[1] !== departed.position[1] || closeTo(departed.position[1], 0.01, 1e-6) === false,
    "60s after arriving (i.e. after the dwell ends) the bus should have moved on",
  );
}

console.log("\nAll vehicle-position checks passed.");
