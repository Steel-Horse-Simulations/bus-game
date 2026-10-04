import {
  generateDepartureMinutesForBands,
  applyExcludedDepartures,
  mergeCustomDepartures,
  computeOffsets,
  type TimingPoint,
  type ComputedOffsets,
} from "./route-timetable.mts";

// Builds a route+day-type's full printed-timetable-shaped grid (DESIGN.md
// §7 "The grid": "stops down and journeys across, the traditional printed
// shape") from one route and one of its RouteTimetable rows. Pure logic,
// no DOM — the "expand to full screen" view in stops-layer.ts's calling-
// services popup renders this, but any other consumer (a future proper
// timetable editor) can reuse it too.
export interface RouteTimetableGridRow {
  pointIndex: number;
  // Present only for a "stop" point — a waypoint is a real routing point
  // but never appears on a passenger-facing timetable, so it's never a row
  // (DESIGN.md §7's grid is stop-shaped, not point-shaped).
  osmId: number;
}

export interface RouteTimetableGrid {
  rows: RouteTimetableGridRow[];
  // One array per generated journey (departure), in departure order — each
  // array has one clock-minutes entry per row, same order as `rows`. `null`
  // marks a point this route skips entirely (DESIGN.md §6 "Express
  // services") — still a real row (the stop is still on the physical
  // path), but every journey shows a gap there rather than a time, the
  // same as a real printed timetable's "doesn't call here" convention
  // (DESIGN.md §7: "a journey that skips stops shows as gaps down its
  // column"). Skip is a route-level flag today (every journey on this
  // route skips the same points), not yet a per-journey one — that would
  // need the merged multi-route timetable this project hasn't built yet.
  journeys: (number | null)[][];
  // Parallel to `journeys` (same length, same order) — true for a journey
  // whose own departure minute is in the timetable's own
  // excludedDepartureMinutes. Included regardless of `includeExcluded`
  // below, so a caller that DOES ask for excluded journeys can still tell
  // them apart from real ones (a user request: "an option to show
  // excluded services" — struck-through in the grid, not just silently
  // present).
  excluded: boolean[];
  // Parallel to `journeys` — this journey's own real departure minute
  // (clock minutes from midnight), i.e. exactly the value that would go
  // into/come out of `excludedDepartureMinutes`. A live user request: a
  // per-journey hide button directly in the grid (route-timetable-panel.ts)
  // needs to know which minute to toggle without re-deriving it from the
  // journey's own row times, which isn't reliable (row 0 may be null for a
  // journey that skips its own first stop).
  departureMinutes: number[];
}

export interface BuildRouteTimetableGridOptions {
  // false (default): today's only behaviour — an excluded departure never
  // becomes a journey at all. true: excluded departures still become real
  // journeys (flagged via `excluded` above) rather than being dropped, for
  // a "show excluded services" toggle to render struck-through instead of
  // just vanishing.
  includeExcluded?: boolean;
}

export function buildRouteTimetableGrid(
  route: Route,
  timetable: RouteTimetable,
  options: BuildRouteTimetableGridOptions = {},
): RouteTimetableGrid {
  const skippedIndexes = new Set(
    route.pickupDropoffOverrides.filter((o) => o.value === "skip").map((o) => o.pointIndex),
  );
  const rows: RouteTimetableGridRow[] = [];
  route.points.forEach((p, pointIndex) => {
    if (p.kind === "stop" && p.osmId !== undefined) rows.push({ pointIndex, osmId: p.osmId });
  });

  let allGeneratedMinutes: number[] = [];
  try {
    allGeneratedMinutes = generateDepartureMinutesForBands(timetable.timeBands);
  } catch {
    // An invalid/empty band set produces no *generated* journeys, not an
    // error here — same as a degenerate zero-interval day type always
    // has. Outside the try, not inside: a custom departure should still
    // show even when the bands themselves are broken or empty, since it
    // was never the bands' own journey to begin with.
  }
  const excludedMinutes = new Set(timetable.excludedDepartureMinutes);
  const baseMinutes = options.includeExcluded ? allGeneratedMinutes : applyExcludedDepartures(allGeneratedMinutes, timetable.excludedDepartureMinutes);
  const departureMinutes = mergeCustomDepartures(baseMinutes, timetable.customDepartureMinutes);
  const journeys: (number | null)[][] = departureMinutes.map((d) =>
    rows.map((row) =>
      skippedIndexes.has(row.pointIndex) ? null : Math.round(d + timetable.departureOffsetsSeconds[row.pointIndex] / 60),
    ),
  );
  const excluded = departureMinutes.map((d) => excludedMinutes.has(d));

  return { rows, journeys, excluded, departureMinutes };
}

export interface RouteDirectionRange {
  // null only for a loop route (see below) — no direction heading needed,
  // since there's nothing to distinguish it from.
  label: "outbound" | "inbound" | null;
  fromPointIndex: number;
  toPointIndex: number;
}

// The outbound and return legs within one route's own point list — a real
// printed timetable (the user's own Stagecoach Service 28/28A reference,
// reference/Stagecoach Timetable.pdf) shows these as two separate pages,
// each with its own real times, not one direction's times read backwards.
// DESIGN.md §6 "Start and terminus stops" already encodes exactly this:
// points[0..terminusIndex] is the outbound leg (ending at the terminus),
// points[startIndex..last] is the return leg (from where the return leg
// begins back to the route's own origin) — genuinely different stretches
// of the same point list, each carrying its own real router-computed
// running times, not a reversal or a duplicate of the other. Any points
// strictly between terminusIndex and startIndex are the physical link
// between the two (a real loop road, not retracing the same street) and
// belong to neither leg's own passenger-facing page.
//
// A route with neither terminusIndex nor startIndex set never had this
// split flagged at all — DESIGN.md's own null convention for "no loop,"
// which by construction only applies to a route that runs its own full
// circuit in one direction and never reverses (a loop route in the
// ordinary sense, not a there-and-back street): showing every stop as one
// table is the correct read for that shape, not an approximation of it.
// Route-level only (no timetable/day-type involved) since the split is
// the same shape for every day type a route has — callers building a
// direction-outer, day-type-inner layout (the reference's own page
// structure) call this once per route, not once per day type.
export function routeDirectionRanges(route: Route): RouteDirectionRange[] {
  if (route.terminusIndex === null || route.startIndex === null) {
    return [{ label: null, fromPointIndex: 0, toPointIndex: route.points.length - 1 }];
  }
  // "orientation" already records which way points[0] -> points[last] runs
  // (db.mts) — the outbound leg (points[0..terminusIndex], the earlier
  // portion of that same traversal) carries that same label; the return
  // leg is definitionally the opposite direction.
  const outboundLabel: "outbound" | "inbound" = route.orientation === "outbound" ? "outbound" : "inbound";
  const returnLabel: "outbound" | "inbound" = outboundLabel === "outbound" ? "inbound" : "outbound";
  return [
    { label: outboundLabel, fromPointIndex: 0, toPointIndex: route.terminusIndex },
    { label: returnLabel, fromPointIndex: route.startIndex, toPointIndex: route.points.length - 1 },
  ];
}

// Computes arrival/departure offsets for a route timetable *component*
// scoped to one leg of a terminus loop (DESIGN.md §6) — a live user
// request: "I should also be able to set inbound and outbound times
// separately... useful if I am running from multiple depots," since two
// depots each crewing one leg genuinely run two independent operations,
// not one bus continuing round a shared schedule. `direction: "both"` is
// today's only behaviour, completely unchanged (computeOffsets across the
// whole route in one call, point 0 the journey's own departure). For
// "outbound"/"inbound", finds that leg's own [fromPointIndex,
// toPointIndex] range (routeDirectionRanges), computes offsets **locally**
// as if that leg's own first point were point 0 (a fresh journey, not an
// extension of whatever happened on the other leg), then maps the result
// back into full-route-length arrays at the leg's own real point
// positions — everywhere else stays 0/unused, since a caller only ever
// reads a component's own leg (sliceGridToPointRange). Falls back to
// "both" if the route isn't actually a terminus loop (no matching
// labelled segment) — the UI is expected to only offer split timetables
// for a loop route in the first place, but this keeps the function itself
// honest rather than trusting the caller.
export function computeOffsetsForDirection(
  route: Route,
  direction: "both" | "outbound" | "inbound",
  legTimesSecondsFullRoute: readonly number[],
  timingPoints: readonly TimingPoint[],
): ComputedOffsets {
  const segment = direction === "both" ? undefined : routeDirectionRanges(route).find((r) => r.label === direction);
  if (!segment) {
    return computeOffsets(route.points.length, legTimesSecondsFullRoute, timingPoints);
  }
  const { fromPointIndex, toPointIndex } = segment;
  const localPointCount = toPointIndex - fromPointIndex + 1;
  const localLegTimesSeconds = legTimesSecondsFullRoute.slice(fromPointIndex, toPointIndex);
  const localTimingPoints = timingPoints
    .filter((tp) => tp.pointIndex > fromPointIndex && tp.pointIndex <= toPointIndex)
    .map((tp) => ({ ...tp, pointIndex: tp.pointIndex - fromPointIndex }));
  const local = computeOffsets(localPointCount, localLegTimesSeconds, localTimingPoints);

  const arrivalOffsetsSeconds = new Array(route.points.length).fill(0);
  const departureOffsetsSeconds = new Array(route.points.length).fill(0);
  const estimated = new Array(route.points.length).fill(false);
  for (let j = 0; j < localPointCount; j++) {
    arrivalOffsetsSeconds[fromPointIndex + j] = local.arrivalOffsetsSeconds[j];
    departureOffsetsSeconds[fromPointIndex + j] = local.departureOffsetsSeconds[j];
    estimated[fromPointIndex + j] = local.estimated[j];
  }
  const infeasibleTimingPoints = local.infeasibleTimingPoints.map((tp) => ({
    ...tp,
    pointIndex: tp.pointIndex + fromPointIndex,
  }));
  return { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated, infeasibleTimingPoints };
}

// The rows (and each journey's matching entries) whose own pointIndex
// falls within [fromPointIndex, toPointIndex] — a day type's own full
// grid restricted to one direction range from routeDirectionRanges.
export function sliceGridToPointRange(
  grid: RouteTimetableGrid,
  fromPointIndex: number,
  toPointIndex: number,
): RouteTimetableGrid {
  const rowIndexes = grid.rows
    .map((_, i) => i)
    .filter((i) => grid.rows[i].pointIndex >= fromPointIndex && grid.rows[i].pointIndex <= toPointIndex);
  return {
    rows: rowIndexes.map((i) => grid.rows[i]),
    journeys: grid.journeys.map((journey) => rowIndexes.map((i) => journey[i])),
    // Unchanged by slicing rows — each journey's own excluded status and
    // real departure minute have nothing to do with which stops are shown.
    excluded: grid.excluded,
    departureMinutes: grid.departureMinutes,
  };
}

export interface RouteDirectionSegment {
  label: "outbound" | "inbound" | null;
  grid: RouteTimetableGrid;
}

// Convenience wrapper over routeDirectionRanges + sliceGridToPointRange
// for a caller that already has one day type's full grid in hand and just
// wants it split, not a direction-outer/day-type-inner layout.
export function splitGridByDirection(route: Route, grid: RouteTimetableGrid): RouteDirectionSegment[] {
  return routeDirectionRanges(route).map((r) => ({
    label: r.label,
    grid: sliceGridToPointRange(grid, r.fromPointIndex, r.toPointIndex),
  }));
}

// Merges several ordered stop sequences (one per family member, in that
// member's own real travel order) into one combined sequence every member
// is a subsequence of — DESIGN.md's own "components merge... a
// projection, not a copy" (CLAUDE.md's "Known hard parts") in its
// smallest useful form: a real printed timetable (the user's own
// Stagecoach reference, reference/Stagecoach Timetable.pdf — 28/28A/27A
// shown together on one page) shows several related services' stops as
// one combined list, each service's own extra stops appearing as their
// own real rows (with gaps in every other service's column), not
// restricted to stops every member happens to share (that's the
// side-panel timetable editor's own, deliberately lighter, comparison).
//
// Algorithm: start from the longest sequence (the fullest single picture
// of the corridor), then merge each other sequence in turn — walking it
// stop by stop, inserting any stop not already in the merged list
// immediately after the last stop that *was* already matched (or right at
// the start, before anything's matched yet). This keeps every member's
// own relative stop order intact, which is what actually matters for a
// passenger-facing timetable — a real deviation inserts cleanly near
// where it really happens — without needing a fully general (and much
// harder to reason about, and to keep correct as routes change)
// longest-common-subsequence merge. Genuinely ambiguous cases (a stop
// only one member has, with nothing on either side to anchor it against
// a *specific* neighbour) place it right after its last shared anchor,
// a deterministic and explainable choice, not necessarily the only
// defensible one.
// A route can revisit the same physical stop more than once in one
// direction — an ordinary loop that starts and ends at the same stand is
// the common case, and `buildRouteTimetableGrid`'s own rows are point-
// indexed, not deduplicated by osmId, so a route's own sequence here can
// genuinely contain the same osmId twice. A sequence only ever moves
// forward through its own stops, so matching searches `merged` starting
// at the current `insertAt` cursor rather than from the very start —
// otherwise a later, second visit to a stop would match back onto the
// same merged row as the first visit (collapsing a loop's real start and
// end into one row instead of two), and every route's own second visit
// would collide on that same single row.
export interface MergeStopSequencesResult {
  merged: number[];
  // One array per input sequence (same order/length as `sequences`,
  // including empty ones), giving the merged-row index for each of that
  // sequence's own elements in turn — how a caller places a route's own
  // per-stop data (a time) onto the right merged row without re-deriving
  // the same forward walk from a plain osmId, which is exactly what
  // collapses repeat visits (see above).
  rowIndexInMerged: number[][];
}

export function mergeStopSequences(sequences: readonly (readonly number[])[]): MergeStopSequencesResult {
  const nonEmptyOrder = sequences.map((_, i) => i).filter((i) => sequences[i].length > 0);
  const rowIndexInMerged: number[][] = sequences.map(() => []);
  if (nonEmptyOrder.length === 0) return { merged: [], rowIndexInMerged };

  nonEmptyOrder.sort((a, b) => sequences[b].length - sequences[a].length);
  const [longestIndex, ...restIndexes] = nonEmptyOrder;

  const merged: number[] = [...sequences[longestIndex]];
  rowIndexInMerged[longestIndex] = merged.map((_, i) => i);

  for (const seqIndex of restIndexes) {
    let insertAt = 0; // Nothing matched yet — nothing to anchor to but the very start.
    const localMapping: number[] = [];
    for (const osmId of sequences[seqIndex]) {
      const existingIndex = merged.indexOf(osmId, insertAt);
      if (existingIndex !== -1) {
        insertAt = existingIndex + 1;
        localMapping.push(existingIndex);
      } else {
        merged.splice(insertAt, 0, osmId);
        // A fresh row shifts every already-recorded mapping (the base
        // sequence, and any earlier "rest" sequence already merged in)
        // at or past the insertion point — those rows really did just
        // move one position to the right in `merged`.
        for (const otherMapping of rowIndexInMerged) {
          for (let i = 0; i < otherMapping.length; i++) {
            if (otherMapping[i] >= insertAt) otherMapping[i] += 1;
          }
        }
        localMapping.push(insertAt);
        insertAt += 1;
      }
    }
    rowIndexInMerged[seqIndex] = localMapping;
  }

  return { merged, rowIndexInMerged };
}

export interface MergedGridMember {
  routeId: number;
  routeNumber: string;
  routeColour: string;
  // Already restricted to this member's own matching direction segment
  // (routeDirectionRanges/sliceGridToPointRange) and this day type.
  grid: RouteTimetableGrid;
}

export interface MergedGridColumn {
  routeId: number;
  routeNumber: string;
  routeColour: string;
  // One entry per row of the merged grid, in that same order — null where
  // this member's own journey doesn't call at that stop (either it
  // genuinely skips it, DESIGN.md §6, or the stop simply isn't on this
  // member's own path at all).
  times: (number | null)[];
  // This whole column's own journey is one this timetable excludes
  // (route-timetable-grid.mts's buildRouteTimetableGrid, called with
  // `includeExcluded: true`) — a "show excluded services" toggle renders
  // it struck-through rather than as an ordinary column.
  excluded: boolean;
  // This column's own real departure minute — a live user request: a
  // per-journey hide button directly above each column in the grid
  // (route-timetable-panel.ts), rather than needing to find the matching
  // time in a separate flat list, needs to know exactly which minute to
  // toggle in `excludedDepartureMinutes`.
  departureMinute: number;
}

export interface MergedGrid {
  rows: { osmId: number }[];
  columns: MergedGridColumn[];
}

function firstRealTimeMinutes(times: readonly (number | null)[]): number {
  for (const t of times) {
    if (t !== null) return t;
  }
  return Infinity; // A column with no real times at all sorts last, not first.
}

// Every family member's own journeys for one direction/day type, as
// columns against one shared, merged stop list — the reference's own
// "several related services on one page" shape (28/28A/27A interleaved
// by real departure time, not grouped by route number first, matching
// how a real departure board actually reads).
export function buildMergedFamilyGrid(members: readonly MergedGridMember[]): MergedGrid {
  const { merged: mergedOsmIds, rowIndexInMerged } = mergeStopSequences(
    members.map((m) => m.grid.rows.map((r) => r.osmId)),
  );

  const columns: MergedGridColumn[] = [];
  members.forEach((member, memberIndex) => {
    // Position-based, not a Map keyed by osmId — a member that revisits
    // the same physical stop (a loop's own start and end) has that same
    // osmId at two different local rows, which a plain osmId->index map
    // would collapse onto just one of them (see mergeStopSequences).
    const mergedRowForLocalRow = rowIndexInMerged[memberIndex];
    member.grid.journeys.forEach((journey, journeyIndex) => {
      const times = new Array<number | null>(mergedOsmIds.length).fill(null);
      mergedRowForLocalRow.forEach((mergedRow, localIndex) => {
        times[mergedRow] = journey[localIndex];
      });
      columns.push({
        routeId: member.routeId,
        routeNumber: member.routeNumber,
        routeColour: member.routeColour,
        times,
        excluded: member.grid.excluded[journeyIndex] ?? false,
        departureMinute: member.grid.departureMinutes[journeyIndex],
      });
    });
  });
  columns.sort((a, b) => firstRealTimeMinutes(a.times) - firstRealTimeMinutes(b.times));

  return { rows: mergedOsmIds.map((osmId) => ({ osmId })), columns };
}
