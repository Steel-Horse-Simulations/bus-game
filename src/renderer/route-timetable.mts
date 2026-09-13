// Timetable generation (DESIGN.md §7), scoped to the minimal slice: a
// single component per route per day type, no variations, padding,
// connections, extensions or event calendar yet (OPEN-ITEMS.md T29). Pure
// functions only — the actual per-leg running time comes from the WASM
// router, which the caller supplies as `legTimesSeconds`, keeping this
// module (and its verify script) free of any WASM/DOM dependency.
export type DayType = "monday_friday" | "saturday" | "sunday";
export const DAY_TYPES: readonly DayType[] = ["monday_friday", "saturday", "sunday"];

// A timing point is a published scheduling location, not every physical
// stop — most routes have far more stops than timing points (a real
// timetable might publish 5 times for a 30-stop route). "legMinutes" is the
// published running time, in whole minutes, from the *previous* timing
// point (or the journey's own departure at point 0, for the first one) to
// this point's arrival — matching how a printed timetable states leg
// times, not a "wait here" duration. The bus is held at a timing point
// only as a side effect of the published time being longer than the
// fastest possible running time; that padding is computed, never entered
// directly. "dwellSeconds" is an optional layover (departure - arrival at
// this same point, e.g. a bus station stand) — 0 for the common case where
// a timing point is just passed through.
export interface TimingPoint {
  pointIndex: number;
  legMinutes: number;
  dwellSeconds: number;
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
// whole-minute leg and dwell (DESIGN.md §4: "A timing point holds a bus
// early"). Point 0 needs no entry of its own — it's always the journey's
// own generated departure, the implicit first anchor every leg is measured
// from.
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
    if (tp.pointIndex === 0) {
      return "Point 0 is always the journey's own departure — it doesn't need flagging as a timing point.";
    }
    if (seen.has(tp.pointIndex)) {
      return "The same stop can't be flagged as a timing point twice.";
    }
    seen.add(tp.pointIndex);
    if (!Number.isInteger(tp.legMinutes) || tp.legMinutes < 0) {
      return "A timing point's leg time must be a whole number of minutes, at least 0.";
    }
    if (!Number.isFinite(tp.dwellSeconds) || tp.dwellSeconds < 0) {
      return "A timing point's dwell (layover) can't be negative.";
    }
  }
  return null;
}

export interface ComputedOffsets {
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
  // True for every point without a published time of its own — everything
  // except point 0 (always the journey's own departure) and an explicit
  // timing point. An estimate, interpolated from natural running time,
  // never a fabricated exact schedule — the distinction the game's own
  // timing points exist to preserve (a route can have far more physical
  // stops than published times).
  estimated: boolean[];
  // Timing points whose published leg time is faster than the route can
  // actually be driven — scheduled at the fastest achievable time instead
  // of a negative wait, flagged so the caller can warn (DESIGN.md §7: "a
  // running time below what is physically achievable gets a stronger
  // warning").
  infeasiblePointIndexes: number[];
}

// Turns per-leg running times into per-point arrival/departure offsets
// (seconds from the journey's own departure at point 0). A timing point
// carries the *published* running time from the previous timing point (or
// point 0) to its own arrival — DESIGN.md §4/§7's padding is exactly the
// gap between that published time and the fastest the route can actually
// be driven, computed here rather than entered directly anywhere. Every
// point between two timing points shares that same fixed budget, its own
// offset estimated by giving it the same share of the budget as its share
// of the natural (fastest-route) running time within that stretch — not
// equal time slices, since distance and time don't scale together. A
// stretch with no further timing point ahead of it (including the whole
// route, if none are set at all) just keeps the natural running time, no
// padding applied.
export function computeOffsets(
  pointCount: number,
  legTimesSeconds: readonly number[],
  timingPoints: readonly TimingPoint[],
): ComputedOffsets {
  if (pointCount < 2) {
    throw new Error("a route needs at least two points to have a timetable");
  }
  if (legTimesSeconds.length !== pointCount - 1) {
    throw new Error(
      `expected ${pointCount - 1} leg times for ${pointCount} points, got ${legTimesSeconds.length}`,
    );
  }
  const sorted = [...timingPoints].sort((a, b) => a.pointIndex - b.pointIndex);

  const arrivalOffsetsSeconds: number[] = new Array(pointCount).fill(0);
  const departureOffsetsSeconds: number[] = new Array(pointCount).fill(0);
  const estimated: boolean[] = new Array(pointCount).fill(true);
  const infeasiblePointIndexes: number[] = [];
  estimated[0] = false;

  let anchorIndex = 0; // last point with a known (non-estimated) departure
  let anchorDeparture = 0;

  for (const tp of sorted) {
    const naturalSeconds = legTimesSeconds.slice(anchorIndex, tp.pointIndex).reduce((sum, s) => sum + s, 0);
    let targetSeconds = tp.legMinutes * 60;
    if (targetSeconds < naturalSeconds) {
      infeasiblePointIndexes.push(tp.pointIndex);
      targetSeconds = naturalSeconds;
    }

    let cumulativeNatural = 0;
    for (let i = anchorIndex + 1; i < tp.pointIndex; i++) {
      cumulativeNatural += legTimesSeconds[i - 1];
      const fraction =
        naturalSeconds > 0 ? cumulativeNatural / naturalSeconds : (i - anchorIndex) / (tp.pointIndex - anchorIndex);
      const offset = anchorDeparture + fraction * targetSeconds;
      arrivalOffsetsSeconds[i] = offset;
      departureOffsetsSeconds[i] = offset;
    }

    const arrival = anchorDeparture + targetSeconds;
    arrivalOffsetsSeconds[tp.pointIndex] = arrival;
    departureOffsetsSeconds[tp.pointIndex] = arrival + tp.dwellSeconds;
    estimated[tp.pointIndex] = false;

    anchorIndex = tp.pointIndex;
    anchorDeparture = departureOffsetsSeconds[tp.pointIndex];
  }

  for (let i = anchorIndex + 1; i < pointCount; i++) {
    const arrival = departureOffsetsSeconds[i - 1] + legTimesSeconds[i - 1];
    arrivalOffsetsSeconds[i] = arrival;
    departureOffsetsSeconds[i] = arrival;
  }

  return { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated, infeasiblePointIndexes };
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
