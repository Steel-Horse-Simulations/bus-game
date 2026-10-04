// Manual verification script for route-timetable-grid.mts, run directly
// with `node --experimental-strip-types src/renderer/route-timetable-
// grid.verify.mts` — same pattern as the project's other .verify.mts files.
import {
  buildRouteTimetableGrid,
  splitGridByDirection,
  mergeStopSequences,
  buildMergedFamilyGrid,
  computeOffsetsForDirection,
  type MergedGridMember,
} from "./route-timetable-grid.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function route(
  points: { kind: "stop" | "waypoint"; osmId?: number }[],
  pickupDropoffOverrides: RoutePickupDropoffOverride[] = [],
  opts: { orientation?: "inbound" | "outbound"; terminusIndex?: number | null; startIndex?: number | null } = {},
): Route {
  return {
    id: 1,
    depotGroupId: 1,
    number: "10",
    points: points.map((p) => ({ ...p, lon: 0, lat: 0 })),
    orientation: opts.orientation ?? "outbound",
    terminusIndex: opts.terminusIndex ?? null,
    startIndex: opts.startIndex ?? null,
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
  excludedDepartureMinutes: number[] = [],
  customDepartureMinutes: number[] = [],
): RouteTimetable {
  return {
    id: 1,
    routeId: 1,
    dayType: "monday_friday",
    direction: "both",
    timeBands: [{ startMinutes, endMinutes, intervalMinutes }],
    timingPoints: [],
    arrivalOffsetsSeconds: departureOffsetsSeconds,
    departureOffsetsSeconds,
    excludedDepartureMinutes,
    customDepartureMinutes,
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

// excludedDepartureMinutes (T46/OPEN-ITEMS.md, user request: 398A running
// at 398's own 0100 without splitting 398's own bands) drops exactly the
// excluded journey and no other.
{
  const r = route([{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }]);
  const tt = timetable(480, 540, 30, [0, 300], [510]); // three departures: 480, 510, 540; 510 excluded
  const grid = buildRouteTimetableGrid(r, tt);
  assert(grid.journeys.length === 2, `excluding one departure should leave two journeys, got ${grid.journeys.length}`);
  assert(
    JSON.stringify(grid.journeys.map((j) => j[0])) === JSON.stringify([480, 540]),
    `expected 480 and 540 to survive with 510 excluded, got ${JSON.stringify(grid.journeys.map((j) => j[0]))}`,
  );
  assert(
    JSON.stringify(grid.excluded) === JSON.stringify([false, false]),
    `neither surviving journey should itself be flagged excluded, got ${JSON.stringify(grid.excluded)}`,
  );
}

// includeExcluded: true (user request: "an option to show excluded
// services") keeps the excluded journey as a real column instead of
// dropping it, flagged via the parallel `excluded` array so a caller can
// render it struck-through rather than as an ordinary departure.
{
  const r = route([{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }]);
  const tt = timetable(480, 540, 30, [0, 300], [510]); // three departures: 480, 510, 540; 510 excluded
  const grid = buildRouteTimetableGrid(r, tt, { includeExcluded: true });
  assert(grid.journeys.length === 3, `includeExcluded should keep all three journeys, got ${grid.journeys.length}`);
  assert(
    JSON.stringify(grid.journeys.map((j) => j[0])) === JSON.stringify([480, 510, 540]),
    `expected all three departures to survive, got ${JSON.stringify(grid.journeys.map((j) => j[0]))}`,
  );
  assert(
    JSON.stringify(grid.excluded) === JSON.stringify([false, true, false]),
    `only the 510 journey (index 1) should be flagged excluded, got ${JSON.stringify(grid.excluded)}`,
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

// splitGridByDirection — a route with neither terminusIndex nor
// startIndex set is a loop: one segment, no direction label, the grid
// unchanged.
{
  const r = route([{ kind: "stop", osmId: 111 }, { kind: "stop", osmId: 222 }, { kind: "stop", osmId: 333 }]);
  const tt = timetable(480, 480, 30, [0, 300, 600]);
  const grid = buildRouteTimetableGrid(r, tt);
  const segments = splitGridByDirection(r, grid);
  assert(segments.length === 1, "a loop route (no terminus/start) produces exactly one segment");
  assert(segments[0].label === null, "a loop route's one segment carries no direction label");
  assert(segments[0].grid.rows.length === 3, "a loop route's one segment keeps every stop");
}

// A real terminus loop (DESIGN.md §6): outbound leg points[0..terminusIndex],
// return leg points[startIndex..last], with a real connecting-road point in
// between that belongs to neither leg's own page.
{
  const r = route(
    [
      { kind: "stop", osmId: 1 }, // 0: origin
      { kind: "stop", osmId: 2 }, // 1: outbound-only
      { kind: "stop", osmId: 3 }, // 2: terminus
      { kind: "waypoint" }, // 3: the connecting loop road
      { kind: "stop", osmId: 4 }, // 4: start of the return leg
      { kind: "stop", osmId: 5 }, // 5: back near the origin
    ],
    [],
    { orientation: "outbound", terminusIndex: 2, startIndex: 4 },
  );
  const tt = timetable(480, 480, 30, [0, 100, 200, 250, 300, 400]);
  const grid = buildRouteTimetableGrid(r, tt);
  const segments = splitGridByDirection(r, grid);
  assert(segments.length === 2, "a terminus-loop route splits into exactly two direction segments");

  const [outboundSeg, returnSeg] = segments;
  assert(outboundSeg.label === "outbound", "the first leg is labelled with the route's own orientation");
  assert(
    JSON.stringify(outboundSeg.grid.rows.map((r) => r.osmId)) === JSON.stringify([1, 2, 3]),
    `outbound leg should be stops 1,2,3 (up to the terminus), got ${JSON.stringify(outboundSeg.grid.rows.map((r) => r.osmId))}`,
  );

  assert(returnSeg.label === "inbound", "the return leg is labelled the opposite of the route's own orientation");
  assert(
    JSON.stringify(returnSeg.grid.rows.map((r) => r.osmId)) === JSON.stringify([4, 5]),
    `return leg should be stops 4,5 (from the start of the return leg), got ${JSON.stringify(returnSeg.grid.rows.map((r) => r.osmId))}`,
  );

  // Real router-computed times for each leg, sliced straight out of the
  // one full grid — not reversed or duplicated from the other leg.
  const expectedOutboundFirstJourney = [0, 100, 200].map((s) => Math.round(480 + s / 60));
  assert(
    JSON.stringify(outboundSeg.grid.journeys[0]) === JSON.stringify(expectedOutboundFirstJourney),
    `outbound leg's own journey times should come straight from its own offsets, got ${JSON.stringify(outboundSeg.grid.journeys[0])} expected ${JSON.stringify(expectedOutboundFirstJourney)}`,
  );
  const expectedReturnFirstJourney = [300, 400].map((s) => Math.round(480 + s / 60));
  assert(
    JSON.stringify(returnSeg.grid.journeys[0]) === JSON.stringify(expectedReturnFirstJourney),
    `return leg's own journey times should come straight from its own offsets, not a reversal of the outbound leg, got ${JSON.stringify(returnSeg.grid.journeys[0])} expected ${JSON.stringify(expectedReturnFirstJourney)}`,
  );
}

// computeOffsetsForDirection — a terminus-loop route's outbound/inbound
// legs get their own independent offsets, each computed as if that leg's
// own first point were point 0 (a fresh journey), not an extension of
// whatever happened on the other leg (user request: "set inbound and
// outbound times separately... useful if I am running from multiple
// depots"). Same 6-point loop as the test above: outbound points[0..2],
// inbound points[4..5], point 3 the connecting waypoint.
{
  const r = route(
    [
      { kind: "stop", osmId: 1 },
      { kind: "stop", osmId: 2 },
      { kind: "stop", osmId: 3 },
      { kind: "waypoint" },
      { kind: "stop", osmId: 4 },
      { kind: "stop", osmId: 5 },
    ],
    [],
    { orientation: "outbound", terminusIndex: 2, startIndex: 4 },
  );
  const legTimesSeconds = [100, 100, 200, 300, 150]; // 0-1, 1-2, 2-3, 3-4, 4-5

  const outbound = computeOffsetsForDirection(r, "outbound", legTimesSeconds, []);
  assert(
    JSON.stringify(outbound.arrivalOffsetsSeconds) === JSON.stringify([0, 100, 200, 0, 0, 0]),
    `outbound leg's own offsets should start fresh at its own point 0, zero elsewhere, got ${JSON.stringify(outbound.arrivalOffsetsSeconds)}`,
  );

  const inbound = computeOffsetsForDirection(r, "inbound", legTimesSeconds, []);
  assert(
    JSON.stringify(inbound.arrivalOffsetsSeconds) === JSON.stringify([0, 0, 0, 0, 0, 150]),
    `inbound leg's own offsets should start fresh at ITS OWN point 0 (global index 4), not continue from the outbound leg's own total, got ${JSON.stringify(inbound.arrivalOffsetsSeconds)}`,
  );

  // A timing point on the OTHER leg is simply irrelevant to this leg's
  // own computation — not an error, not silently misapplied to the wrong
  // point.
  const outboundIgnoringInboundTimingPoint = computeOffsetsForDirection(r, "outbound", legTimesSeconds, [
    { pointIndex: 5, legMinutes: 99, dwellSeconds: 0 },
  ]);
  assert(
    JSON.stringify(outboundIgnoringInboundTimingPoint.arrivalOffsetsSeconds) === JSON.stringify(outbound.arrivalOffsetsSeconds),
    "a timing point on the inbound leg has no effect on the outbound leg's own offsets",
  );

  // "both" is a plain passthrough to the whole-route computation — today's
  // only behaviour, unchanged.
  const both = computeOffsetsForDirection(r, "both", legTimesSeconds, []);
  assert(
    JSON.stringify(both.arrivalOffsetsSeconds) === JSON.stringify([0, 100, 200, 400, 700, 850]),
    `'both' should compute across the whole route in one go, got ${JSON.stringify(both.arrivalOffsetsSeconds)}`,
  );

  // A non-loop route (no terminusIndex/startIndex) has no "outbound"/
  // "inbound" segment to find — falls back to the whole-route computation
  // rather than silently producing an all-zero result.
  const nonLoop = route([{ kind: "stop", osmId: 1 }, { kind: "stop", osmId: 2 }]);
  const nonLoopResult = computeOffsetsForDirection(nonLoop, "outbound", [100], []);
  assert(
    JSON.stringify(nonLoopResult.arrivalOffsetsSeconds) === JSON.stringify([0, 100]),
    `a non-loop route should fall back to the whole-route computation, got ${JSON.stringify(nonLoopResult.arrivalOffsetsSeconds)}`,
  );
}

// Orientation flip: an inbound-oriented route's outbound-leg label flips
// to "inbound" and its return leg becomes "outbound".
{
  const r = route(
    [{ kind: "stop", osmId: 1 }, { kind: "stop", osmId: 2 }, { kind: "stop", osmId: 3 }],
    [],
    { orientation: "inbound", terminusIndex: 1, startIndex: 1 },
  );
  const tt = timetable(480, 480, 30, [0, 100, 200]);
  const grid = buildRouteTimetableGrid(r, tt);
  const [firstSeg, secondSeg] = splitGridByDirection(r, grid);
  assert(firstSeg.label === "inbound", "an inbound-oriented route's first leg keeps the 'inbound' label");
  assert(secondSeg.label === "outbound", "an inbound-oriented route's return leg is labelled 'outbound'");
}

// mergeStopSequences — the base case: one sequence is just itself.
{
  const { merged, rowIndexInMerged } = mergeStopSequences([[1, 2, 3]]);
  assert(JSON.stringify(merged) === JSON.stringify([1, 2, 3]), `a single sequence merges to itself, got ${JSON.stringify(merged)}`);
  assert(JSON.stringify(rowIndexInMerged) === JSON.stringify([[0, 1, 2]]), `identity mapping expected, got ${JSON.stringify(rowIndexInMerged)}`);
}

// Two identical sequences merge to the same thing, no duplicates.
{
  const { merged } = mergeStopSequences([[1, 2, 3], [1, 2, 3]]);
  assert(JSON.stringify(merged) === JSON.stringify([1, 2, 3]), `two identical sequences produce no duplicates, got ${JSON.stringify(merged)}`);
}

// A shorter sequence's extra stop, not present in the longer base
// sequence, gets inserted right after its last shared anchor.
{
  const { merged, rowIndexInMerged } = mergeStopSequences([
    [1, 2, 3, 4], // the longer "base" sequence
    [1, 99, 3], // 99 is a real extra stop the second route calls at, between 1 and 3
  ]);
  assert(
    JSON.stringify(merged) === JSON.stringify([1, 99, 2, 3, 4]),
    `expected 99 inserted right after its anchor (1), got ${JSON.stringify(merged)}`,
  );
  assert(
    JSON.stringify(rowIndexInMerged[1]) === JSON.stringify([0, 1, 3]),
    `second sequence's own rows should map to [1->0, 99->1, 3->3], got ${JSON.stringify(rowIndexInMerged[1])}`,
  );
}

// A stop unique to the shorter sequence, with no shared anchor before it
// at all, goes right at the start.
{
  const { merged } = mergeStopSequences([
    [1, 2, 3],
    [99, 1],
  ]);
  assert(
    JSON.stringify(merged) === JSON.stringify([99, 1, 2, 3]),
    `expected 99 (no anchor yet) placed at the very start, got ${JSON.stringify(merged)}`,
  );
}

// Empty sequences are ignored entirely, not treated as "the shortest
// possible sequence" that somehow still contributes.
{
  const { merged } = mergeStopSequences([[], [1, 2], []]);
  assert(JSON.stringify(merged) === JSON.stringify([1, 2]), `empty sequences are skipped, got ${JSON.stringify(merged)}`);
  assert(JSON.stringify(mergeStopSequences([[], []]).merged) === "[]", "every sequence empty produces an empty merge");
}

// A route revisiting the same physical stop (a loop's own start and end)
// keeps both visits as separate rows, and a shorter sequence's own two
// visits to that same stop land on its own first and LAST occurrence —
// not both collapsing onto the first — exactly the real bug a user
// report caught live (T45, OPEN-ITEMS.md): 398 starts and ends at stop 1,
// 398A visits it three times (start, a mid-route revisit, and its own
// end).
{
  const { merged, rowIndexInMerged } = mergeStopSequences([
    [1, 2, 1, 3, 4, 5, 1], // longer "base" sequence (398A): stop 1 visited three times
    [1, 2, 5, 1], // shorter sequence (398): stop 1 visited twice, start and end
  ]);
  assert(
    JSON.stringify(merged) === JSON.stringify([1, 2, 1, 3, 4, 5, 1]),
    `no insertions needed — every stop already appears in order, got ${JSON.stringify(merged)}`,
  );
  assert(
    JSON.stringify(rowIndexInMerged[1]) === JSON.stringify([0, 1, 5, 6]),
    `shorter sequence's own first "1" should map to merged row 0 and its own last "1" to merged row 6 (not both to row 0), got ${JSON.stringify(rowIndexInMerged[1])}`,
  );
}

// buildMergedFamilyGrid — columns interleave by real departure time across
// every member together (the reference's own "28A 28A 27A 28..." column
// order), not grouped by route number first.
{
  const memberA: MergedGridMember = {
    routeId: 1,
    routeNumber: "28",
    routeColour: "#111111",
    grid: { rows: [{ pointIndex: 0, osmId: 1 }, { pointIndex: 1, osmId: 2 }], journeys: [[600, 610], [700, 710]], excluded: [false, false], departureMinutes: [600, 700] },
  };
  const memberB: MergedGridMember = {
    routeId: 2,
    routeNumber: "28A",
    routeColour: "#222222",
    grid: { rows: [{ pointIndex: 0, osmId: 1 }, { pointIndex: 1, osmId: 99 }, { pointIndex: 2, osmId: 2 }], journeys: [[650, 655, 660]], excluded: [false], departureMinutes: [650] },
  };
  const merged = buildMergedFamilyGrid([memberA, memberB]);
  assert(
    JSON.stringify(merged.rows.map((r) => r.osmId)) === JSON.stringify([1, 99, 2]),
    `expected merged rows [1,99,2] (99 inserted after its anchor), got ${JSON.stringify(merged.rows.map((r) => r.osmId))}`,
  );
  assert(merged.columns.length === 3, "three total journeys across both members become three columns");
  assert(
    merged.columns.map((c) => c.routeNumber).join(",") === "28,28A,28",
    `expected columns interleaved by real time (28@600, 28A@650, 28@700), got ${merged.columns.map((c) => c.routeNumber).join(",")}`,
  );
  // Member A's own columns have no time at all for the merged row it
  // doesn't call at (osmId 99, inserted from member B).
  assert(merged.columns[0].times[1] === null, "member A's column shows a gap at the stop only member B calls at");
  assert(merged.columns[1].times[1] === 655, "member B's own column keeps its real time at that same stop");
}

// buildMergedFamilyGrid — a member whose own route starts and ends at the
// same physical stop (osmId 1) keeps a real time at BOTH its first and
// last row, not a gap at the first row — the exact live bug report this
// fix addresses (T45, OPEN-ITEMS.md): "the first stop on the 398 and
// 398A is just showing '-'".
{
  const shortLoop: MergedGridMember = {
    routeId: 1,
    routeNumber: "398",
    routeColour: "#111111",
    grid: {
      rows: [{ pointIndex: 0, osmId: 1 }, { pointIndex: 1, osmId: 2 }, { pointIndex: 2, osmId: 1 }],
      journeys: [[600, 605, 620]],
      excluded: [false],
      departureMinutes: [600],
    },
  };
  const longLoop: MergedGridMember = {
    routeId: 2,
    routeNumber: "398A",
    routeColour: "#222222",
    grid: {
      rows: [
        { pointIndex: 0, osmId: 1 },
        { pointIndex: 1, osmId: 2 },
        { pointIndex: 2, osmId: 1 },
        { pointIndex: 3, osmId: 3 },
        { pointIndex: 4, osmId: 1 },
      ],
      journeys: [[610, 615, 630, 640, 655]],
      excluded: [false],
      departureMinutes: [610],
    },
  };
  const merged = buildMergedFamilyGrid([shortLoop, longLoop]);
  const shortCol = merged.columns.find((c) => c.routeNumber === "398")!;
  const longCol = merged.columns.find((c) => c.routeNumber === "398A")!;
  assert(shortCol.times[0] === 600, `398's own real first-row time should survive, got ${shortCol.times[0]}`);
  assert(longCol.times[0] === 610, `398A's own real first-row time should survive, got ${longCol.times[0]}`);
  assert(
    shortCol.times.filter((t) => t !== null).length === 3,
    `398 has 3 real stops (two of them the same physical stop) — all 3 should survive as real times, got ${JSON.stringify(shortCol.times)}`,
  );
}

console.log("\nAll route-timetable-grid checks passed.");
