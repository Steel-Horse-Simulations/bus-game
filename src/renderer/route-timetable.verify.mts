// Manual verification script for route-timetable.mts, run directly with
// `node --experimental-strip-types src/renderer/route-timetable.verify.mts`
// — same pattern as electron/db.verify.mts. Pure functions, no WASM/DOM
// dependency, so this covers the fiddly generation/offset arithmetic
// directly (CLAUDE.md's "write tests before the UI" caution on anything
// timetable-shaped) without needing the router or a running app at all.
import {
  validateFrequency,
  generateDepartureMinutes,
  validateTimingPoints,
  computeOffsets,
  journeyTimeAtPoint,
} from "./route-timetable.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- validateFrequency / generateDepartureMinutes ---
assert(validateFrequency(360, 1140, 30) === null, "a normal 06:00-19:00 every-30-minutes service is valid");
assert(validateFrequency(360, 1140, 0) !== null, "a zero interval is rejected");
assert(validateFrequency(360, 1140, -5) !== null, "a negative interval is rejected");
assert(validateFrequency(1140, 360, 30) !== null, "end before start is rejected");
assert(validateFrequency(-1, 100, 30) !== null, "a negative start time is rejected");
assert(validateFrequency(0, 24 * 60, 30) !== null, "a start/end at or past 24:00 is rejected (single-day only)");

assert(
  JSON.stringify(generateDepartureMinutes(360, 420, 30)) === JSON.stringify([360, 390, 420]),
  "frequency generates a departure at start, every interval, up to and including end",
);
assert(generateDepartureMinutes(360, 360, 30).length === 1, "a start equal to end still generates one departure");
let threw = false;
try {
  generateDepartureMinutes(420, 360, 30);
} catch {
  threw = true;
}
assert(threw, "generateDepartureMinutes throws on an invalid frequency rather than silently returning nothing");

// --- validateTimingPoints ---
const stopStopWaypoint = [{ kind: "stop" as const }, { kind: "stop" as const }, { kind: "waypoint" as const }];
assert(validateTimingPoints(stopStopWaypoint, []) === null, "no timing points is always valid");
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 0, waitSeconds: 30 }]) === null,
  "a timing point on a real stop is valid",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 2, waitSeconds: 30 }]) !== null,
  "a timing point on a waypoint is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 5, waitSeconds: 30 }]) !== null,
  "an out-of-range timing point index is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [
    { pointIndex: 0, waitSeconds: 30 },
    { pointIndex: 0, waitSeconds: 60 },
  ]) !== null,
  "the same stop flagged twice as a timing point is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 0, waitSeconds: -1 }]) !== null,
  "a negative wait is rejected",
);

// --- computeOffsets ---
// Three points, two legs of 100s and 200s, no timing points: arrival and
// departure should be identical everywhere (nothing ever waits).
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsets(3, [100, 200], []);
  assert(
    JSON.stringify(arrivalOffsetsSeconds) === JSON.stringify([0, 100, 300]),
    "arrival offsets accumulate leg times with no timing points",
  );
  assert(
    JSON.stringify(departureOffsetsSeconds) === JSON.stringify([0, 100, 300]),
    "departure offsets equal arrival offsets when nothing waits",
  );
}

// Same shape, but point 1 is a timing point with a 60s wait: everything
// after it should shift by 60s, point 1 itself should show a real
// arrival/departure split.
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsets(3, [100, 200], [
    { pointIndex: 1, waitSeconds: 60 },
  ]);
  assert(arrivalOffsetsSeconds[1] === 100, "arrival at the timing point is unaffected by its own wait");
  assert(departureOffsetsSeconds[1] === 160, "departure from a timing point adds its wait to the arrival");
  assert(arrivalOffsetsSeconds[2] === 360, "the wait carries forward into the next leg's arrival (160 + 200)");
}

// A timing point at index 0 delays the very first departure — legitimate
// (DESIGN.md doesn't forbid it) even though it can't be observed as
// lateness recovered, since nothing precedes it.
{
  const { departureOffsetsSeconds } = computeOffsets(2, [50], [{ pointIndex: 0, waitSeconds: 20 }]);
  assert(departureOffsetsSeconds[0] === 20, "a timing point at the very first stop delays that stop's own departure");
}

threw = false;
try {
  computeOffsets(3, [100], []);
} catch {
  threw = true;
}
assert(threw, "computeOffsets rejects a leg-time count that doesn't match pointCount - 1");

threw = false;
try {
  computeOffsets(1, [], []);
} catch {
  threw = true;
}
assert(threw, "computeOffsets rejects a route with fewer than two points");

// --- journeyTimeAtPoint ---
assert(journeyTimeAtPoint(360, 90) === 361.5, "a departure plus a 90-second offset is 1.5 minutes later");
assert(journeyTimeAtPoint(1430, 3600) === 1490, "an offset can legitimately push a journey past midnight (1490 > 1440)");

console.log("\nAll checks passed.");
