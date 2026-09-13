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
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, legMinutes: 5, dwellSeconds: 0 }]) === null,
  "a timing point on a real stop is valid",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 2, legMinutes: 5, dwellSeconds: 0 }]) !== null,
  "a timing point on a waypoint is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 5, legMinutes: 5, dwellSeconds: 0 }]) !== null,
  "an out-of-range timing point index is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 0, legMinutes: 5, dwellSeconds: 0 }]) !== null,
  "point 0 can't be flagged as a timing point — it's always the journey's own departure",
);
assert(
  validateTimingPoints(stopStopWaypoint, [
    { pointIndex: 1, legMinutes: 5, dwellSeconds: 0 },
    { pointIndex: 1, legMinutes: 8, dwellSeconds: 0 },
  ]) !== null,
  "the same stop flagged twice as a timing point is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, legMinutes: -1, dwellSeconds: 0 }]) !== null,
  "a negative leg time is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, legMinutes: 1.5, dwellSeconds: 0 }]) !== null,
  "a fractional leg time is rejected — published times are whole minutes",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, legMinutes: 5, dwellSeconds: -1 }]) !== null,
  "a negative dwell is rejected",
);

// --- computeOffsets ---
// Three points, two legs of 100s and 200s, no timing points at all: pure
// natural running time throughout, and every point but 0 is an estimate.
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated } = computeOffsets(3, [100, 200], []);
  assert(
    JSON.stringify(arrivalOffsetsSeconds) === JSON.stringify([0, 100, 300]),
    "arrival offsets accumulate natural leg times with no timing points",
  );
  assert(
    JSON.stringify(departureOffsetsSeconds) === JSON.stringify([0, 100, 300]),
    "departure offsets equal arrival offsets when nothing is a timing point",
  );
  assert(JSON.stringify(estimated) === JSON.stringify([false, true, true]), "only point 0 is ever non-estimated with no timing points set");
}

// Same shape, but point 1 is a timing point published 3 minutes (180s)
// from departure — slower than the natural 100s, so real padding is
// added; point 1 stops being an estimate.
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated, infeasiblePointIndexes } = computeOffsets(
    3,
    [100, 200],
    [{ pointIndex: 1, legMinutes: 3, dwellSeconds: 0 }],
  );
  assert(arrivalOffsetsSeconds[1] === 180, "arrival at the timing point matches its published leg time, not the natural running time");
  assert(departureOffsetsSeconds[1] === 180, "departure equals arrival when there's no dwell");
  assert(arrivalOffsetsSeconds[2] === 380, "the padding carries forward into the next leg's arrival (180 + 200)");
  assert(JSON.stringify(estimated) === JSON.stringify([false, false, true]), "the timing point itself is no longer an estimate");
  assert(infeasiblePointIndexes.length === 0, "a published time slower than natural running is perfectly feasible");
}

// A dwell (layover) makes departure later than arrival at that one point,
// same as a bus station stand.
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsets(
    3,
    [100, 200],
    [{ pointIndex: 1, legMinutes: 3, dwellSeconds: 30 }],
  );
  assert(arrivalOffsetsSeconds[1] === 180 && departureOffsetsSeconds[1] === 210, "a dwell adds to departure without moving arrival");
}

// An intermediate stop between two timing points is estimated
// proportionally to its own share of the natural running time within
// that stretch, not split evenly by stop count.
{
  // 4 points, 3 legs: 100s, 300s, 100s (total 500s natural). Timing point
  // at index 3 published as 10 minutes (600s) — 100s of real padding
  // spread across the 500s of natural running time before it. Point 1 is
  // 100/500 of the way through (natural time), so should get 100/500 of
  // the 600s budget = 120s; point 2 is 400/500 through, so 480s.
  const { arrivalOffsetsSeconds, estimated } = computeOffsets(
    4,
    [100, 300, 100],
    [{ pointIndex: 3, legMinutes: 10, dwellSeconds: 0 }],
  );
  assert(arrivalOffsetsSeconds[1] === 120, "an intermediate stop's estimate reflects its own share of natural running time (120/600)");
  assert(arrivalOffsetsSeconds[2] === 480, "same for the next intermediate stop (480/600)");
  assert(arrivalOffsetsSeconds[3] === 600, "the timing point itself lands exactly on its published time");
  assert(JSON.stringify(estimated) === JSON.stringify([false, true, true, false]), "only the actual timing points are non-estimates");
}

// A published leg time faster than the route can actually be driven is
// infeasible — scheduled at the fastest achievable time instead of a
// negative/zero wait, and flagged rather than silently accepted.
{
  const { arrivalOffsetsSeconds, infeasiblePointIndexes } = computeOffsets(
    2,
    [200],
    [{ pointIndex: 1, legMinutes: 1, dwellSeconds: 0 }], // 60s published, 200s natural
  );
  assert(arrivalOffsetsSeconds[1] === 200, "an infeasible timing point falls back to the fastest achievable time");
  assert(infeasiblePointIndexes.length === 1 && infeasiblePointIndexes[0] === 1, "the infeasible timing point is flagged, not silently accepted");
}

// Anything after the last timing point keeps pure natural running time —
// no padding to apply without a further published time to hit.
{
  const { arrivalOffsetsSeconds, estimated } = computeOffsets(
    3,
    [100, 200],
    [{ pointIndex: 1, legMinutes: 3, dwellSeconds: 0 }],
  );
  assert(arrivalOffsetsSeconds[2] === arrivalOffsetsSeconds[1] + 200, "the trailing leg after the last timing point is unpadded natural running time");
  assert(estimated[2] === true, "a trailing stop past the last timing point is still an estimate");
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
