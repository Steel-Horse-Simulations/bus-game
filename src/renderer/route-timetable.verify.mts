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
  validateTimeBands,
  generateDepartureMinutesForBands,
  DEFAULT_TIME_BANDS,
  applyExcludedDepartures,
  mergeCustomDepartures,
  validateNightWindow,
  validateNightFinishTime,
  validateWeekdayMask,
  weekdayMasksOverlap,
  describeWeekdayMask,
  isPeakMinute,
  AM_PEAK_START_MINUTES,
  PM_PEAK_END_MINUTES,
  MONDAY_FRIDAY_MASK,
  SATURDAY_MASK,
  SUNDAY_MASK,
  WEEKEND_MASK,
  EVERY_DAY_MASK,
  WEEKDAY_BITS,
  type TimeBand,
} from "./route-timetable.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- validateFrequency / generateDepartureMinutes ---
assert(validateFrequency(360, 1140, 30) === null, "a normal 06:00-19:00 every-30-minutes service is valid");
assert(validateFrequency(360, 1140, 0) !== null, "a zero interval is rejected");
assert(validateFrequency(360, 1140, -5) !== null, "a negative interval is rejected");
assert(validateFrequency(-1, 100, 30) !== null, "a negative start time is rejected");
assert(validateFrequency(0, 24 * 60, 30) !== null, "a start/end at or past 24:00 is rejected (single-day only)");

assert(
  JSON.stringify(generateDepartureMinutes(360, 420, 30)) === JSON.stringify([360, 390, 420]),
  "frequency generates a departure at start, every interval, up to and including end",
);
assert(generateDepartureMinutes(360, 360, 30).length === 1, "a start equal to end still generates one departure");
let threw = false;
try {
  generateDepartureMinutes(360, 1140, 0);
} catch {
  threw = true;
}
assert(threw, "generateDepartureMinutes throws on an invalid frequency rather than silently returning nothing");

// --- midnight-wrapping bands (2026-11-01, live user report: a night
// service needs one band like 23:45->03:45, not two same-day bands) ---
assert(validateFrequency(1425, 225, 30) === null, "end < start is now valid: it means the band wraps past midnight");
assert(
  JSON.stringify(generateDepartureMinutes(1425, 225, 30)) === JSON.stringify([1425, 15, 45, 75, 105, 135, 165, 195, 225]),
  `a wrapping 23:45->03:45 every-30 band generates past midnight and wraps each minute back into 0-1439, got ${JSON.stringify(generateDepartureMinutes(1425, 225, 30))}`,
);

// --- validateTimingPoints ---
const stopStopWaypoint = [{ kind: "stop" as const }, { kind: "stop" as const }, { kind: "waypoint" as const }];
assert(validateTimingPoints(stopStopWaypoint, []) === null, "no timing points is always valid");
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: 8, dwellMinutes: 0 }]) === null,
  "a timing point on a real stop is valid",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 2, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 }]) !== null,
  "a timing point on a waypoint is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 5, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 }]) !== null,
  "an out-of-range timing point index is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 0, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 }]) !== null,
  "point 0 can't be flagged as a timing point — it's always the journey's own departure",
);
assert(
  validateTimingPoints(stopStopWaypoint, [
    { pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 },
    { pointIndex: 1, standardPaddingMinutes: 8, peakPaddingMinutes: null, dwellMinutes: 0 },
  ]) !== null,
  "the same stop flagged twice as a timing point is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: -1, peakPaddingMinutes: null, dwellMinutes: 0 }]) !== null,
  "a negative standard padding is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 1.5, peakPaddingMinutes: null, dwellMinutes: 0 }]) !== null,
  "a fractional standard padding is rejected — published times are whole minutes",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: -1, dwellMinutes: 0 }]) !== null,
  "a negative peak padding is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: 1.5, dwellMinutes: 0 }]) !== null,
  "a fractional peak padding is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: -1 }]) !== null,
  "a negative dwell is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 1.5 }]) !== null,
  "a fractional dwell is rejected — timetables run on minutes, not seconds",
);

// --- island restriction (2026-11-15, corrected 2026-11-19) ---
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 }], true, [1]) === null,
  "an island route with exactly one OPTIONAL timing point and no peak figure is valid",
);
assert(
  validateTimingPoints(
    [{ kind: "stop" as const }, { kind: "stop" as const }, { kind: "stop" as const }],
    [
      { pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 },
      { pointIndex: 2, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 },
    ],
    true,
    [1, 2],
  ) !== null,
  "an island route with more than one OPTIONAL timing point is rejected",
);
assert(
  validateTimingPoints(stopStopWaypoint, [{ pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: 8, dwellMinutes: 0 }], true, [1]) !== null,
  "an island route's timing point can't carry a separate peak figure",
);
assert(
  validateTimingPoints(
    [{ kind: "stop" as const }, { kind: "stop" as const }, { kind: "stop" as const }],
    [
      { pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 },
      { pointIndex: 2, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 },
    ],
    false,
  ) === null,
  "the same two timing points are fine for a non-island route — isIslandRoute defaults to false, unchanged behaviour",
);

// Real bug, fixed 2026-11-19: "Island routes can only have 1 timing point
// time for whole route not 1 per timing point like it should be" — the
// old code counted a route's own MANDATORY terminus/forced-by-stop
// entries against the island cap. These two prove the actual bug
// scenario and its fix: a mandatory entry (index 2, NOT in
// routeTimingPointIndexes — exactly how route-panel.ts's own terminus/
// forced-by-stop blocks behave, they never write to timingPointIndexes)
// coexists with one real optional entry (index 1, IS in
// routeTimingPointIndexes) without tripping the cap; a second optional
// entry still correctly fails.
const threeStops = [{ kind: "stop" as const }, { kind: "stop" as const }, { kind: "stop" as const }];
assert(
  validateTimingPoints(
    threeStops,
    [
      { pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 }, // optional, flagged
      { pointIndex: 2, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 }, // mandatory terminus, NOT flagged
    ],
    true,
    [1],
  ) === null,
  "a mandatory terminus entry plus one real optional entry is valid on an island route — the bug this fix addresses",
);
assert(
  validateTimingPoints(
    threeStops,
    [
      { pointIndex: 1, standardPaddingMinutes: 5, peakPaddingMinutes: null, dwellMinutes: 0 }, // optional, flagged
      { pointIndex: 2, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 }, // ALSO optional, flagged this time
    ],
    true,
    [1, 2],
  ) !== null,
  "two genuinely optional flagged entries still correctly fails on an island route",
);

// --- isPeakMinute (2026-11-15) ---
assert(isPeakMinute(AM_PEAK_START_MINUTES) === true, "the AM peak window's own start minute counts as peak");
assert(isPeakMinute(AM_PEAK_START_MINUTES - 1) === false, "one minute before the AM peak window is not peak");
assert(isPeakMinute(PM_PEAK_END_MINUTES - 1) === true, "the last minute of the PM peak window counts as peak");
assert(isPeakMinute(PM_PEAK_END_MINUTES) === false, "the PM peak window's own end minute is exclusive, not peak");
assert(isPeakMinute(12 * 60) === false, "midday (inter-peak) is not peak");
assert(isPeakMinute(23 * 60) === false, "late evening is not peak");

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
  assert(
    JSON.stringify(estimated) === JSON.stringify([false, true, false]),
    "point 0 and the terminus are always non-estimated even with no timing points set — only points strictly in between ever are",
  );
}

// Same shape, but point 1 is a timing point with 80s (just over a
// minute, rounds to whole minutes on the input side but the maths here
// works in raw seconds) of standard padding on top of the natural 100s —
// point 1 stops being an estimate.
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated } = computeOffsets(
    3,
    [100, 200],
    [{ pointIndex: 1, standardPaddingMinutes: 80 / 60, peakPaddingMinutes: null, dwellMinutes: 0 }],
  );
  assert(Math.abs(arrivalOffsetsSeconds[1] - 180) < 1e-9, "arrival at the timing point is the natural time PLUS its own padding (100 + 80), not a replacement for it");
  assert(departureOffsetsSeconds[1] === arrivalOffsetsSeconds[1], "departure equals arrival when there's no dwell");
  assert(Math.abs(arrivalOffsetsSeconds[2] - 380) < 1e-9, "the padding carries forward into the next leg's arrival (180 + 200)");
  assert(
    JSON.stringify(estimated) === JSON.stringify([false, false, false]),
    "the timing point itself is no longer an estimate, and the terminus (also point 2 here) is always non-estimated regardless",
  );
}

// A dwell (layover) makes departure later than arrival at that one point,
// same as a bus station stand. dwellMinutes is whole minutes, converted to
// seconds internally — a 1-minute dwell here, not 30 seconds.
{
  const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsets(
    3,
    [100, 200],
    [{ pointIndex: 1, standardPaddingMinutes: 80 / 60, peakPaddingMinutes: null, dwellMinutes: 1 }],
  );
  assert(Math.abs(departureOffsetsSeconds[1] - (arrivalOffsetsSeconds[1] + 60)) < 1e-9, "a dwell adds to departure without moving arrival");
}

// An intermediate stop between two timing points is estimated
// proportionally to its own share of the natural running time within
// that stretch, not split evenly by stop count.
{
  // 4 points, 3 legs: 100s, 300s, 100s (total 500s natural). Timing point
  // at index 3 given 100s (100/60 minutes) of padding on top of the 500s
  // natural time = 600s target — 100s of real padding spread across the
  // 500s of natural running time before it. Point 1 is 100/500 of the way
  // through (natural time), so should get 100/500 of the 600s budget =
  // 120s; point 2 is 400/500 through, so 480s.
  const { arrivalOffsetsSeconds, estimated } = computeOffsets(
    4,
    [100, 300, 100],
    [{ pointIndex: 3, standardPaddingMinutes: 100 / 60, peakPaddingMinutes: null, dwellMinutes: 0 }],
  );
  assert(Math.abs(arrivalOffsetsSeconds[1] - 120) < 1e-9, "an intermediate stop's estimate reflects its own share of natural running time (120/600)");
  assert(Math.abs(arrivalOffsetsSeconds[2] - 480) < 1e-9, "same for the next intermediate stop (480/600)");
  assert(Math.abs(arrivalOffsetsSeconds[3] - 600) < 1e-9, "the timing point itself lands exactly on natural time plus its own padding");
  assert(JSON.stringify(estimated) === JSON.stringify([false, true, true, false]), "only the actual timing points are non-estimates");
}

// Zero padding (2026-11-15) means the published time is EXACTLY the real
// fastest achievable time — the old "infeasible, clamp up" case is now
// structurally impossible (padding can never be negative), proven here
// rather than just asserted: there is no separate infeasibleTimingPoints
// field on the result any more at all.
{
  const { arrivalOffsetsSeconds } = computeOffsets(2, [200], [{ pointIndex: 1, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 }]);
  assert(arrivalOffsetsSeconds[1] === 200, "zero padding means the published time equals the real natural/fastest time exactly");
}

// The "peak" variant uses peakPaddingMinutes instead of
// standardPaddingMinutes for the same timing point — and falls back to
// the standard figure when peakPaddingMinutes is null (every island-route
// timing point, by construction, and any ordinary one the player hasn't
// given a distinct peak figure).
{
  const tp = { pointIndex: 1, standardPaddingMinutes: 1, peakPaddingMinutes: 5, dwellMinutes: 0 };
  const standard = computeOffsets(2, [100], [tp], "standard");
  const peak = computeOffsets(2, [100], [tp], "peak");
  assert(standard.arrivalOffsetsSeconds[1] === 160, "the standard variant uses standardPaddingMinutes (100 + 60)");
  assert(peak.arrivalOffsetsSeconds[1] === 400, "the peak variant uses peakPaddingMinutes instead (100 + 300)");

  const tpNoPeak = { pointIndex: 1, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 };
  const peakFallback = computeOffsets(2, [100], [tpNoPeak], "peak");
  assert(peakFallback.arrivalOffsetsSeconds[1] === 160, "with peakPaddingMinutes unset, the peak variant falls back to the standard figure, same result both ways");

  const defaultVariant = computeOffsets(2, [100], [tp]);
  assert(defaultVariant.arrivalOffsetsSeconds[1] === 160, "omitting the variant argument defaults to 'standard'");
}

// Anything after the last explicit timing point keeps pure natural running
// time — no padding to apply without a further published time to hit —
// except the terminus itself, which is always non-estimated regardless
// (DESIGN.md §4/§7: the route's own last stop is always a published time
// on a real timetable, the same as point 0 already is).
{
  const { arrivalOffsetsSeconds, estimated } = computeOffsets(
    4,
    [100, 200, 50],
    [{ pointIndex: 1, standardPaddingMinutes: 80 / 60, peakPaddingMinutes: null, dwellMinutes: 0 }],
  );
  assert(Math.abs(arrivalOffsetsSeconds[2] - (arrivalOffsetsSeconds[1] + 200)) < 1e-9, "the trailing leg after the last explicit timing point is unpadded natural running time");
  assert(estimated[2] === true, "a genuinely intermediate trailing stop (not the terminus) is still an estimate");
  assert(estimated[3] === false, "but the terminus itself is never an estimate, even with no explicit timing point flagged there");
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

// --- validateTimeBands / generateDepartureMinutesForBands ---
// Confirmed 2026-10-31: an empty band list is now a valid shape on its own
// (a timetable built entirely from custom departures, no generator band at
// all) — the combined "needs a band or a custom departure" rule is the
// save flow's own job, not this pure function's.
assert(validateTimeBands([]) === null, "an empty band list is valid on its own — custom departures can cover a timetable alone");
assert(generateDepartureMinutesForBands([]).length === 0, "an empty band list generates no departures, rather than throwing");
assert(
  validateTimeBands([{ startMinutes: 480, endMinutes: 540, intervalMinutes: 0 }]) !== null,
  "a band with an invalid frequency (zero interval) is rejected the same way validateFrequency would",
);

// Touching bands (one's end equals the next's start) are fine — this is
// the natural shape of contiguous bands covering a whole day.
{
  const touching: TimeBand[] = [
    { startMinutes: 0, endMinutes: 480, intervalMinutes: 60 },
    { startMinutes: 480, endMinutes: 1439, intervalMinutes: 30 },
  ];
  assert(validateTimeBands(touching) === null, "touching bands (shared boundary) are not treated as overlapping");
}

// Genuinely overlapping bands are rejected.
{
  const overlapping: TimeBand[] = [
    { startMinutes: 0, endMinutes: 500, intervalMinutes: 60 },
    { startMinutes: 480, endMinutes: 1439, intervalMinutes: 30 },
  ];
  assert(validateTimeBands(overlapping) !== null, "genuinely overlapping bands are rejected");
}

// A wrapping band (2026-11-01) correctly overlaps a same-day band that
// falls in its post-midnight half, even though a plain sort-by-start
// would otherwise put the wrapping band's two real halves at opposite
// ends of the list and never compare them.
{
  const wrappingOverlapsEarlyMorning: TimeBand[] = [
    { startMinutes: 1425, endMinutes: 225, intervalMinutes: 30 }, // 23:45->03:45
    { startMinutes: 180, endMinutes: 360, intervalMinutes: 30 }, // 03:00->06:00
  ];
  assert(
    validateTimeBands(wrappingOverlapsEarlyMorning) !== null,
    "a wrapping night band overlapping a 03:00-06:00 band (both cover 03:00-03:45) is rejected",
  );
}
{
  const wrappingThenMorning: TimeBand[] = [
    { startMinutes: 1425, endMinutes: 225, intervalMinutes: 30 }, // 23:45->03:45
    { startMinutes: 225, endMinutes: 360, intervalMinutes: 30 }, // 03:45->06:00, touching not overlapping
  ];
  assert(
    validateTimeBands(wrappingThenMorning) === null,
    "a wrapping night band touching (not overlapping) the next morning's band is accepted",
  );
  assert(
    JSON.stringify(generateDepartureMinutesForBands(wrappingThenMorning)).includes("225"),
    "the shared boundary minute (03:45) is generated once, not dropped",
  );
}
{
  const twoWrapping: TimeBand[] = [
    { startMinutes: 1425, endMinutes: 100, intervalMinutes: 30 }, // 23:45->01:40
    { startMinutes: 1430, endMinutes: 200, intervalMinutes: 30 }, // 23:50->03:20, overlaps the first
  ];
  assert(validateTimeBands(twoWrapping) !== null, "two wrapping bands that genuinely overlap each other are rejected");
}

// Departures merge across bands, in order, regardless of input order.
{
  const bands: TimeBand[] = [
    { startMinutes: 540, endMinutes: 600, intervalMinutes: 30 }, // 540, 570, 600
    { startMinutes: 480, endMinutes: 540, intervalMinutes: 20 }, // 480, 500, 520, 540
  ];
  const result = generateDepartureMinutesForBands(bands);
  assert(
    JSON.stringify(result) === JSON.stringify([480, 500, 520, 540, 570, 600]),
    `expected merged/sorted/de-duplicated departures (540 appears in both bands), got ${JSON.stringify(result)}`,
  );
}

// The UK-default template itself is internally valid and covers the
// whole day with no gaps or overlaps.
{
  const error = validateTimeBands(DEFAULT_TIME_BANDS);
  assert(error === null, `DEFAULT_TIME_BANDS should itself be valid, got: ${error}`);
  const sorted = [...DEFAULT_TIME_BANDS].sort((a, b) => a.startMinutes - b.startMinutes);
  assert(sorted[0].startMinutes === 0, "the default bands should start at midnight");
  assert(sorted[sorted.length - 1].endMinutes === 1439, "the default bands should cover through to the last minute of the day");
  for (let i = 1; i < sorted.length; i++) {
    assert(
      sorted[i].startMinutes === sorted[i - 1].endMinutes,
      `the default bands should be contiguous with no gap between band ${i - 1} and ${i}`,
    );
  }
}

// applyExcludedDepartures — a variation taking over one of the base
// route's own generated slots (user request: 398A running at 398's own
// 0100, without splitting 398's own bands).
{
  const minutes = generateDepartureMinutesForBands([{ startMinutes: 0, endMinutes: 120, intervalMinutes: 60 }]);
  assert(JSON.stringify(minutes) === JSON.stringify([0, 60, 120]), "sanity: three departures generated");
  const filtered = applyExcludedDepartures(minutes, [60]);
  assert(JSON.stringify(filtered) === JSON.stringify([0, 120]), `excluding one minute should drop only that one, got ${JSON.stringify(filtered)}`);
}
{
  // An exclusion for a minute the bands don't currently generate has no
  // effect — quietly inert, not an error, so reshaping bands later can't
  // accidentally "resurrect" a stale exclusion onto the wrong minute.
  const minutes = [0, 30, 60];
  const filtered = applyExcludedDepartures(minutes, [999]);
  assert(JSON.stringify(filtered) === JSON.stringify(minutes), "an exclusion for a minute not in the list has no effect");
}
{
  const filtered = applyExcludedDepartures([0, 30, 60], []);
  assert(JSON.stringify(filtered) === JSON.stringify([0, 30, 60]), "no exclusions leaves every minute untouched");
}

// mergeCustomDepartures — one-off departures entered directly rather than
// produced by any band's own interval (user request: "an option to put
// in custom times for departures instead of everything being on an
// interval").
{
  const merged = mergeCustomDepartures([0, 30, 60], [47]);
  assert(JSON.stringify(merged) === JSON.stringify([0, 30, 47, 60]), `a custom time should be inserted in sorted order, got ${JSON.stringify(merged)}`);
}
{
  // A custom time that coincides with an already-generated one is a
  // no-op, not a second identical journey.
  const merged = mergeCustomDepartures([0, 30, 60], [30]);
  assert(JSON.stringify(merged) === JSON.stringify([0, 30, 60]), `a duplicate custom time should not double up, got ${JSON.stringify(merged)}`);
}
{
  const merged = mergeCustomDepartures([], [15, 5]);
  assert(JSON.stringify(merged) === JSON.stringify([5, 15]), `custom times alone should still sort, got ${JSON.stringify(merged)}`);
}

// --- validateNightWindow (route types, 2026-10-31, tightened 2026-11-01
// to a 03:45 latest departure instead of 04:00) ---
assert(validateNightWindow([1425, 1439, 0, 120, 225]) === null, "every minute inside 23:45-03:45 (wrapping midnight) is accepted");
assert(validateNightWindow([]) === null, "an empty list has nothing outside the window, so it's accepted");
assert(validateNightWindow([1200]) !== null, "20:00, well before the window opens, is rejected");
assert(validateNightWindow([300]) !== null, "05:00, after the window closes, is rejected");
assert(validateNightWindow([1424]) !== null, "23:44, one minute before the window opens, is rejected");
assert(validateNightWindow([226]) !== null, "03:46, one minute after the window closes, is rejected");
assert(validateNightWindow([1425, 1200]) !== null, "one valid and one invalid minute together is still rejected");

// --- validateNightFinishTime (2026-11-01): the last service may depart
// as late as 03:45 but must actually arrive by 04:15 — a separate, later
// cutoff that depends on the route's own running time. ---
assert(validateNightFinishTime([], 9999) === null, "no departures at all has nothing to check");
assert(validateNightFinishTime([225], 30 * 60) === null, "a 03:45 departure with a 30-minute run finishes exactly at 04:15, which is accepted");
assert(validateNightFinishTime([225], 31 * 60) !== null, "a 03:45 departure with a 31-minute run finishes at 04:16, which is rejected");
assert(validateNightFinishTime([0], 4 * 60 * 60 + 15 * 60) === null, "a 00:00 departure with a 4h15m run finishes exactly at 04:15, which is accepted");
assert(validateNightFinishTime([0], 4 * 60 * 60 + 16 * 60) !== null, "a 00:00 departure with a 4h16m run finishes at 04:16, which is rejected");
assert(
  validateNightFinishTime([1425, 0, 225], 10 * 60) === null,
  "only the latest departure (03:45) matters — a short 10-minute run from it is fine even though earlier departures are also present",
);
assert(
  validateNightFinishTime([1425], 20 * 60) === null,
  "a lone 23:45 departure with a 20-minute run finishes at 00:05, well inside the window",
);

// --- validateWeekdayMask / weekdayMasksOverlap / describeWeekdayMask
// (2026-11-07, the custom day-type picker) ---
assert(validateWeekdayMask(MONDAY_FRIDAY_MASK) === null, "Mon-Fri's own mask is valid");
assert(validateWeekdayMask(EVERY_DAY_MASK) === null, "every day selected is valid");
assert(validateWeekdayMask(WEEKDAY_BITS.wednesday) === null, "a single day is valid");
assert(validateWeekdayMask(0) !== null, "zero days selected is rejected");
assert(validateWeekdayMask(128) !== null, "a mask with a bit beyond Sunday is rejected");
assert(validateWeekdayMask(1.5) !== null, "a non-integer mask is rejected");

assert(weekdayMasksOverlap(MONDAY_FRIDAY_MASK, SATURDAY_MASK) === false, "Mon-Fri and Saturday share no day");
assert(weekdayMasksOverlap(MONDAY_FRIDAY_MASK, WEEKDAY_BITS.wednesday) === true, "Wednesday alone overlaps Mon-Fri");
assert(weekdayMasksOverlap(SATURDAY_MASK, SUNDAY_MASK) === false, "Saturday and Sunday don't overlap each other");
assert(weekdayMasksOverlap(WEEKEND_MASK, SUNDAY_MASK) === true, "the weekend mask overlaps Sunday alone");

assert(describeWeekdayMask(MONDAY_FRIDAY_MASK) === "Mon-Fri", "Mon-Fri describes as a single range");
assert(describeWeekdayMask(WEEKEND_MASK) === "Weekend", "Saturday+Sunday gets the friendlier 'Weekend' label, not 'Sat-Sun'");
assert(describeWeekdayMask(EVERY_DAY_MASK) === "Every day", "all 7 days gets 'Every day', not 'Mon-Sun'");
assert(describeWeekdayMask(SATURDAY_MASK) === "Sat", "a lone Saturday describes as just 'Sat'");
assert(
  describeWeekdayMask(WEEKDAY_BITS.tuesday | WEEKDAY_BITS.thursday) === "Tue, Thu",
  "non-adjacent days list separately, comma-joined",
);
assert(
  describeWeekdayMask(WEEKDAY_BITS.monday | WEEKDAY_BITS.wednesday | WEEKDAY_BITS.friday) === "Mon, Wed, Fri",
  "three non-adjacent days each stay their own single-day run",
);
assert(
  describeWeekdayMask(WEEKDAY_BITS.thursday | WEEKDAY_BITS.friday) === "Thu-Fri",
  "two adjacent days (not the Mon-Fri/weekend specials) still collapse into a range",
);
assert(
  describeWeekdayMask(WEEKDAY_BITS.sunday | WEEKDAY_BITS.monday) === "Mon, Sun",
  "Sunday and Monday are adjacent on the calendar but NOT treated as a wrapping run — this is two separate single-day entries, in Mon-first order",
);

console.log("\nAll checks passed.");
