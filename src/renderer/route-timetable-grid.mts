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
  // array has one clock-minutes entry per row, same order as `rows`. All
  // entries are populated for every journey today (no skipped-stop express
  // yet), but the shape already allows a future `null` for "this journey
  // doesn't call here" without changing callers.
  journeys: (number | null)[][];
}

export function buildRouteTimetableGrid(route: Route, timetable: RouteTimetable): RouteTimetableGrid {
  const rows: RouteTimetableGridRow[] = [];
  route.points.forEach((p, pointIndex) => {
    if (p.kind === "stop" && p.osmId !== undefined) rows.push({ pointIndex, osmId: p.osmId });
  });

  const journeys: (number | null)[][] = [];
  if (timetable.intervalMinutes > 0) {
    for (let d = timetable.startMinutes; d <= timetable.endMinutes; d += timetable.intervalMinutes) {
      journeys.push(
        rows.map((row) => Math.round(d + timetable.departureOffsetsSeconds[row.pointIndex] / 60)),
      );
    }
  }

  return { rows, journeys };
}
