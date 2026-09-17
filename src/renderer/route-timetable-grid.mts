import { generateDepartureMinutesForBands } from "./route-timetable.mts";

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
}

export function buildRouteTimetableGrid(route: Route, timetable: RouteTimetable): RouteTimetableGrid {
  const skippedIndexes = new Set(
    route.pickupDropoffOverrides.filter((o) => o.value === "skip").map((o) => o.pointIndex),
  );
  const rows: RouteTimetableGridRow[] = [];
  route.points.forEach((p, pointIndex) => {
    if (p.kind === "stop" && p.osmId !== undefined) rows.push({ pointIndex, osmId: p.osmId });
  });

  let departureMinutes: number[] = [];
  try {
    departureMinutes = generateDepartureMinutesForBands(timetable.timeBands);
  } catch {
    // An invalid/empty band set produces no journeys, not an error here —
    // same as a degenerate zero-interval day type always has.
  }
  const journeys: (number | null)[][] = departureMinutes.map((d) =>
    rows.map((row) =>
      skippedIndexes.has(row.pointIndex) ? null : Math.round(d + timetable.departureOffsetsSeconds[row.pointIndex] / 60),
    ),
  );

  return { rows, journeys };
}
