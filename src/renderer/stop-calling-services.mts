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
  dayType: DayType;
  // Clock minutes past midnight, sorted ascending. Can exceed 1439 for a
  // service whose last departure runs past midnight — formatClockMinutes
  // wraps these back into 00:00-23:59 for display, the same as a plain
  // clock would; a "24:xx"-style late-night display is a possible future
  // refinement, not needed for this first read-only slice.
  departureClockMinutes: number[];
}

const DAY_TYPE_ORDER: Record<DayType, number> = { monday_friday: 0, saturday: 1, sunday: 2 };

export function computeStopCallingServices(
  osmId: number,
  routes: readonly Route[],
  timetables: readonly RouteTimetable[],
): StopCallingService[] {
  const services: StopCallingService[] = [];
  for (const route of routes) {
    const pointIndexes: number[] = [];
    route.points.forEach((p, i) => {
      if (p.kind === "stop" && p.osmId === osmId) pointIndexes.push(i);
    });
    if (pointIndexes.length === 0) continue;

    for (const tt of timetables) {
      if (tt.routeId !== route.id || tt.intervalMinutes <= 0) continue;
      const times = new Set<number>();
      for (const pointIndex of pointIndexes) {
        const offsetMinutes = tt.departureOffsetsSeconds[pointIndex] / 60;
        for (let d = tt.startMinutes; d <= tt.endMinutes; d += tt.intervalMinutes) {
          times.add(Math.round(d + offsetMinutes));
        }
      }
      if (times.size === 0) continue;
      services.push({
        routeId: route.id,
        routeNumber: route.number,
        routeColour: route.colour,
        dayType: tt.dayType,
        departureClockMinutes: [...times].sort((a, b) => a - b),
      });
    }
  }
  return services.sort(
    (a, b) =>
      a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true }) ||
      DAY_TYPE_ORDER[a.dayType] - DAY_TYPE_ORDER[b.dayType],
  );
}

export function formatClockMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60).toString().padStart(2, "0");
  const m = (wrapped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export const DAY_TYPE_SHORT_LABELS: Record<DayType, string> = {
  monday_friday: "Mon-Fri",
  saturday: "Sat",
  sunday: "Sun",
};
