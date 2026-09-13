// Timetable generation (DESIGN.md §7), scoped to the minimal slice: a
// single component per route per day type, no variations, padding,
// connections, extensions or event calendar yet (OPEN-ITEMS.md T29). Pure
// functions only — the actual per-leg running time comes from the WASM
// router, which the caller supplies as `legTimesSeconds`, keeping this
// module (and its verify script) free of any WASM/DOM dependency.
export type DayType = "monday_friday" | "saturday" | "sunday";
export const DAY_TYPES: readonly DayType[] = ["monday_friday", "saturday", "sunday"];

export interface TimingPoint {
  pointIndex: number;
  waitSeconds: number;
}

const MINUTES_PER_DAY = 24 * 60;

// A service is defined by a start and end time of day, with frequency
// generating everything between (DESIGN.md §7 "Defining a service").
// Deliberately capped within one calendar day — a service running past
// midnight needs the day-crossing handling Airlink 100's real overnight
// timetable has, which is out of scope for this generator.
export function validateFrequency(
  startMinutes: number,
  endMinutes: number,
  intervalMinutes: number,
): string | null {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    return "The interval must be a whole number of minutes, at least 1.";
  }
  if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= MINUTES_PER_DAY) {
    return "The start time must be within a single day.";
  }
  if (!Number.isInteger(endMinutes) || endMinutes < 0 || endMinutes >= MINUTES_PER_DAY) {
    return "The end time must be within a single day.";
  }
  if (endMinutes < startMinutes) {
    return "The end time can't be before the start time.";
  }
  return null;
}

// Every departure a service generates, in minutes from midnight —
// DESIGN.md §7's "frequency is a generator that writes repeated departures
// into the timetable, not an alternative model."
export function generateDepartureMinutes(
  startMinutes: number,
  endMinutes: number,
  intervalMinutes: number,
): number[] {
  const error = validateFrequency(startMinutes, endMinutes, intervalMinutes);
  if (error) throw new Error(error);
  const out: number[] = [];
  for (let t = startMinutes; t <= endMinutes; t += intervalMinutes) out.push(t);
  return out;
}

// A timing point must be one of the route's own stops (not a waypoint, and
// not out of range), each stop flagged at most once, with a non-negative
// wait (DESIGN.md §4: "A timing point holds a bus early").
export function validateTimingPoints(
  points: readonly { kind: "stop" | "waypoint" }[],
  timingPoints: readonly TimingPoint[],
): string | null {
  const seen = new Set<number>();
  for (const tp of timingPoints) {
    if (!Number.isInteger(tp.pointIndex) || tp.pointIndex < 0 || tp.pointIndex >= points.length) {
      return `Timing point index ${tp.pointIndex} is out of range for this route.`;
    }
    if (points[tp.pointIndex].kind !== "stop") {
      return "A timing point must be a stop, not a waypoint.";
    }
    if (seen.has(tp.pointIndex)) {
      return "The same stop can't be flagged as a timing point twice.";
    }
    seen.add(tp.pointIndex);
    if (!Number.isFinite(tp.waitSeconds) || tp.waitSeconds < 0) {
      return "A timing point's wait can't be negative.";
    }
  }
  return null;
}

// Turns per-leg running times into per-point arrival/departure offsets
// (seconds from the journey's own departure at point 0). Point 0's
// "arrival" is the journey start itself (0) by convention — nothing arrives
// before departing. At every other point, departure = arrival + whatever
// wait a timing point there adds; arrival at the next point = that
// departure plus the leg's running time. DESIGN.md §7's "timetables need
// deliberate slack at timing points, since that slack is what a delayed
// bus recovers with" is exactly this wait, added once here rather than
// wherever the schedule is later read.
export function computeOffsets(
  pointCount: number,
  legTimesSeconds: readonly number[],
  timingPoints: readonly TimingPoint[],
): { arrivalOffsetsSeconds: number[]; departureOffsetsSeconds: number[] } {
  if (pointCount < 2) {
    throw new Error("a route needs at least two points to have a timetable");
  }
  if (legTimesSeconds.length !== pointCount - 1) {
    throw new Error(
      `expected ${pointCount - 1} leg times for ${pointCount} points, got ${legTimesSeconds.length}`,
    );
  }
  const waitByIndex = new Map(timingPoints.map((tp) => [tp.pointIndex, tp.waitSeconds]));

  const arrivalOffsetsSeconds: number[] = [0];
  const departureOffsetsSeconds: number[] = [waitByIndex.get(0) ?? 0];
  for (let i = 1; i < pointCount; i++) {
    const arrival = departureOffsetsSeconds[i - 1] + legTimesSeconds[i - 1];
    arrivalOffsetsSeconds.push(arrival);
    departureOffsetsSeconds.push(arrival + (waitByIndex.get(i) ?? 0));
  }
  return { arrivalOffsetsSeconds, departureOffsetsSeconds };
}

// Combines a generated departure with a point's own offset to get the
// actual clock time (minutes from midnight, can exceed 1440 for a journey
// that runs past midnight even though the service itself doesn't start
// past it) a bus is at that point on a given journey.
export function journeyTimeAtPoint(
  departureMinutes: number,
  offsetSeconds: number,
): number {
  return departureMinutes + offsetSeconds / 60;
}
