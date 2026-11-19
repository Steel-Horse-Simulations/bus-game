import { generateDepartureMinutesForBands, isPeakMinute } from "./route-timetable.mts";

// Read-only "which services call here" computation (T29, OPEN-ITEMS.md) —
// pure logic, no DOM, so it can be unit tested independently of the popup
// that renders it. A route can call at the same physical stop more than
// once (a loop whose last point is the same stop as its first, e.g. route
// 398) — every matching point index contributes its own departures, merged
// into one list per route/day-type, since a passenger waiting here doesn't
// care which pass of the loop produced a given time.
export interface StopCallingService {
  routeId: number;
  routeNumber: string;
  routeColour: string;
  weekdayMask: number;
  // Clock minutes past midnight, sorted ascending. Can exceed 1439 for a
  // service whose last departure runs past midnight — formatClockMinutes
  // wraps these back into 00:00-23:59 for display, the same as a plain
  // clock would; a "24:xx"-style late-night display is a possible future
  // refinement, not needed for this first read-only slice.
  departureClockMinutes: number[];
}

export function computeStopCallingServices(
  osmId: number,
  routes: readonly Route[],
  timetables: readonly RouteTimetable[],
): StopCallingService[] {
  const services: StopCallingService[] = [];
  for (const route of routes) {
    // A point this route skips (DESIGN.md §6 "Express services": "a list
    // of skipped stops") is physically on the road path but never actually
    // called at — excluded here the same as if it weren't one of this
    // route's points at all, so an express doesn't show as serving a stop
    // it drives straight past.
    const skippedIndexes = new Set(
      route.pickupDropoffOverrides.filter((o) => o.value === "skip").map((o) => o.pointIndex),
    );
    const pointIndexes: number[] = [];
    route.points.forEach((p, i) => {
      if (p.kind === "stop" && p.osmId === osmId && !skippedIndexes.has(i)) pointIndexes.push(i);
    });
    if (pointIndexes.length === 0) continue;

    for (const tt of timetables) {
      if (tt.routeId !== route.id) continue;
      let departureMinutes: number[];
      try {
        departureMinutes = generateDepartureMinutesForBands(tt.timeBands);
      } catch {
        continue; // an invalid/empty band set generates nothing, not an error here
      }
      const times = new Set<number>();
      for (const pointIndex of pointIndexes) {
        // Peak/standard picked per DEPARTURE by its own real clock time
        // (2026-11-15, same reasoning as buildRouteTimetableGrid) — can't
        // be hoisted outside the departure loop, since the same point's
        // own offset can differ between an off-peak and a peak working.
        for (const d of departureMinutes) {
          const offsetMinutes = (isPeakMinute(d) ? tt.departureOffsetsSecondsPeak : tt.departureOffsetsSeconds)[pointIndex] / 60;
          times.add(Math.round(d + offsetMinutes));
        }
      }
      if (times.size === 0) continue;
      services.push({
        routeId: route.id,
        routeNumber: route.number,
        routeColour: route.colour,
        weekdayMask: tt.weekdayMask,
        departureClockMinutes: [...times].sort((a, b) => a - b),
      });
    }
  }
  // Grouped per route, then by ascending weekday mask — a stable order
  // that happens to put Mon-Fri before Saturday before Sunday for the 3
  // original presets, the same order they always showed in before the
  // day-type picker let a route have any mask at all.
  return services.sort(
    (a, b) =>
      a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true }) || a.weekdayMask - b.weekdayMask,
  );
}

export function formatClockMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60).toString().padStart(2, "0");
  const m = (wrapped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

