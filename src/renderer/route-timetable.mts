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
// `endMinutes < startMinutes` means the service **wraps past midnight**
// (confirmed 2026-11-01, live user report — night services genuinely need
// a single band like 23:45→03:45, not two artificial same-day bands
// stitched together) rather than being rejected outright, which is what
// this function used to do unconditionally.
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
  return null;
}

// Every departure a service generates, in minutes from midnight —
// DESIGN.md §7's "frequency is a generator that writes repeated departures
// into the timetable, not an alternative model." A wrapping service
// (endMinutes < startMinutes) generates into the next day's minutes
// first, then wraps each one back into 0–1439 for output — e.g.
// 23:45→03:45 every 30 produces [1425, 1455→15, 1485→45, ...], matching
// how the rest of this file already treats "minutes" as a flat 0–1439 set
// regardless of generation order (validateNightWindow and
// validateNightFinishTime already reason about wraparound this same way).
export function generateDepartureMinutes(
  startMinutes: number,
  endMinutes: number,
  intervalMinutes: number,
): number[] {
  const error = validateFrequency(startMinutes, endMinutes, intervalMinutes);
  if (error) throw new Error(error);
  const effectiveEnd = endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const out: number[] = [];
  for (let t = startMinutes; t <= effectiveEnd; t += intervalMinutes) out.push(t % MINUTES_PER_DAY);
  return out;
}

// Time-of-day bands (DESIGN.md §7 "Structure": "frequency varies across
// the day") — a day type's frequency is one or more of these rather than
// a single flat start/end/interval; the old flat model is exactly the
// one-band case. Deliberately doesn't also vary running time per band —
// an earlier plan to do that (a flat time-of-day traffic multiplier) was
// dropped in favour of the router's own real junction delays doing that
// honestly instead (OPEN-ITEMS.md, project_398_running_time_decision);
// building it back in here for bands specifically would quietly re-
// introduce the same rejected mechanism. Every band shares the route's
// one set of timing points/computed offsets — only which departure
// minutes get generated varies.
export interface TimeBand {
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
}

// Bands may touch (one's end equals the next's start — the natural shape
// of contiguous bands covering a whole day) but not overlap. An empty band
// list is valid on its own (2026-10-31, live user request: "when making
// timetables I should be able to add custom departures without having to
// have a time band") — a timetable built entirely from custom departures,
// with no generator band at all, is a real, legitimate shape; the combined
// "needs at least a band or a custom departure" rule is enforced where
// both are in scope together (the save flow), not here.
//
// A wrapping band (endMinutes < startMinutes, confirmed 2026-11-01) is
// split into its two real same-day pieces — [start, 1440) and [0, end] —
// before the overlap check, so a band like 23:45→03:45 correctly overlaps
// a 03:00→06:00 band (via its [0,225] piece) without the sort-by-start
// trick that works for ordinary bands putting its two halves on opposite
// ends of the sorted list and never comparing them to what's actually
// adjacent in real time.
function daySubIntervals(b: TimeBand): { startMinutes: number; endMinutes: number }[] {
  if (b.endMinutes < b.startMinutes) {
    return [
      { startMinutes: b.startMinutes, endMinutes: MINUTES_PER_DAY },
      { startMinutes: 0, endMinutes: b.endMinutes },
    ];
  }
  return [{ startMinutes: b.startMinutes, endMinutes: b.endMinutes }];
}

export function validateTimeBands(bands: readonly TimeBand[]): string | null {
  for (const b of bands) {
    const error = validateFrequency(b.startMinutes, b.endMinutes, b.intervalMinutes);
    if (error) return error;
  }
  const sorted = bands.flatMap(daySubIntervals).sort((a, b) => a.startMinutes - b.startMinutes);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMinutes < sorted[i - 1].endMinutes) {
      return "Time-of-day bands can't overlap.";
    }
  }
  return null;
}

// Every departure across every band, merged and de-duplicated (two
// touching bands sharing an exact boundary minute would otherwise both
// generate it) and sorted into one ascending list. A wrapping band
// (endMinutes < startMinutes) generates past midnight the same way
// generateDepartureMinutes does, above.
export function generateDepartureMinutesForBands(bands: readonly TimeBand[]): number[] {
  const error = validateTimeBands(bands);
  if (error) throw new Error(error);
  const out = new Set<number>();
  for (const b of bands) {
    const effectiveEnd = b.endMinutes < b.startMinutes ? b.endMinutes + MINUTES_PER_DAY : b.endMinutes;
    for (let t = b.startMinutes; t <= effectiveEnd; t += b.intervalMinutes) out.add(t % MINUTES_PER_DAY);
  }
  return [...out].sort((a, b) => a - b);
}

// A variation can take over one of the base route's own generated
// departures without touching its time bands at all (a live user request:
// 398A running at 398's own 0100 slot, without splitting 398's bands just
// to carve out that one minute) — a specific generated minute can be
// flagged "don't run this" on the component that generated it, checked
// against the live generated list each time rather than needing its own
// cleanup when bands change later (a minute no longer generated by the
// current bands simply has no effect, quietly inert rather than an error).
export function applyExcludedDepartures(
  minutes: readonly number[],
  excludedMinutes: readonly number[],
): number[] {
  const excluded = new Set(excludedMinutes);
  return minutes.filter((m) => !excluded.has(m));
}

// The opposite of exclusion: one-off departures entered directly rather
// than produced by any band's own interval (a live user request: "an
// option to put in custom times for departures instead of everything
// being on an interval") — a real timetable's first departure of the day
// often doesn't land on a clean interval at all. Merged and de-duplicated
// against the generated list (a custom time that happens to already be
// generated is a no-op, not a second identical journey) and re-sorted,
// same shape as generateDepartureMinutesForBands' own band-merging.
export function mergeCustomDepartures(
  minutes: readonly number[],
  customMinutes: readonly number[],
): number[] {
  return [...new Set([...minutes, ...customMinutes])].sort((a, b) => a - b);
}

// Route types (2026-10-31, tightened 2026-11-01): a Night-type route's
// whole timetable — every band-generated minute AND every custom
// departure — has to fall within the real window UK-EXPANSION.md §10
// gives ("Operating window: typically 2345–0400"), wrapping past
// midnight, but the *last* departure must be no later than 03:45, not
// 04:00 — 1425 = 23:45, 225 = 03:45 (minutes from midnight, same
// convention as everything else in this file). See
// NIGHT_FINISH_LATEST_MINUTES below for the separate "must actually
// arrive by 04:15" rule, which needs the route's running time and so
// can't live in this departure-only check.
const NIGHT_WINDOW_START_MINUTES = 23 * 60 + 45;
const NIGHT_WINDOW_END_MINUTES = 3 * 60 + 45;

export function validateNightWindow(minutes: readonly number[]): string | null {
  const outside = minutes.find((m) => m < NIGHT_WINDOW_START_MINUTES && m > NIGHT_WINDOW_END_MINUTES);
  if (outside === undefined) return null;
  const hh = String(Math.floor(outside / 60)).padStart(2, "0");
  const mm = String(outside % 60).padStart(2, "0");
  return `A Night-type route's timetable must stay within 23:45–03:45 — ${hh}:${mm} is outside that window.`;
}

// The latest a Night-type route's last service may actually arrive at its
// final destination — confirmed 2026-11-01 as a separate, later cutoff
// from the last-departure one above (03:45 to start, 04:15 to finish).
// Takes the route's own running time (seconds, point 0 to the final
// point) since that's the only way to know when the *latest* departure
// actually finishes. Only the latest departure needs checking: every
// earlier departure in the same overnight window finishes earlier too.
const NIGHT_FINISH_LATEST_MINUTES = 4 * 60 + 15;

export function validateNightFinishTime(minutes: readonly number[], runningTimeSeconds: number): string | null {
  if (minutes.length === 0) return null;
  const effectiveMinutesSinceWindowStart = (m: number) => (m - NIGHT_WINDOW_START_MINUTES + 1440) % 1440;
  const latestDeparture = minutes.reduce((latest, m) =>
    effectiveMinutesSinceWindowStart(m) > effectiveMinutesSinceWindowStart(latest) ? m : latest,
  );
  const runningMinutes = Math.ceil(runningTimeSeconds / 60);
  const finishEffective = effectiveMinutesSinceWindowStart(latestDeparture) + runningMinutes;
  const maxFinishEffective = effectiveMinutesSinceWindowStart(NIGHT_FINISH_LATEST_MINUTES);
  if (finishEffective <= maxFinishEffective) return null;
  const finishMinute = (latestDeparture + runningMinutes) % 1440;
  const hh = String(Math.floor(finishMinute / 60)).padStart(2, "0");
  const mm = String(finishMinute % 60).padStart(2, "0");
  return `A Night-type route's last service departs at ${String(Math.floor(latestDeparture / 60)).padStart(2, "0")}:${String(latestDeparture % 60).padStart(2, "0")} and wouldn't finish until ${hh}:${mm} — the last service must finish by 04:15.`;
}

// DESIGN.md §7's own suggestion of the shape ("AM peak, inter-peak, PM
// peak, evening, night") — sensible UK-typical boundaries as a starting
// template for a day type with no timetable yet, not a fixed rule. Every
// route's own bands are fully independent after that first save (DESIGN.md:
// "defined globally as defaults, overridable per route").
// Contiguous — each band's end exactly equals the next one's start (see
// validateTimeBands's own comment on why touching, not gapped, is the
// shape overlap-checking allows) — so the whole day is covered with no
// silent gap where no departures would ever generate.
export const DEFAULT_TIME_BANDS: readonly TimeBand[] = [
  { startMinutes: 0, endMinutes: 420, intervalMinutes: 60 }, // night, 00:00-07:00
  { startMinutes: 420, endMinutes: 540, intervalMinutes: 15 }, // AM peak, 07:00-09:00
  { startMinutes: 540, endMinutes: 960, intervalMinutes: 30 }, // inter-peak, 09:00-16:00
  { startMinutes: 960, endMinutes: 1080, intervalMinutes: 15 }, // PM peak, 16:00-18:00
  { startMinutes: 1080, endMinutes: 1439, intervalMinutes: 30 }, // evening, 18:00-23:59
];

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
  // of a negative wait, flagged (with the actual published vs. fastest
  // figures, in whole minutes rounded up) so the caller can build a
  // specific, actionable warning rather than a bare pass/fail (DESIGN.md
  // §7: "a running time below what is physically achievable gets a
  // stronger warning").
  infeasibleTimingPoints: { pointIndex: number; publishedMinutes: number; fastestMinutes: number }[];
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
  const infeasibleTimingPoints: ComputedOffsets["infeasibleTimingPoints"] = [];
  estimated[0] = false;

  let anchorIndex = 0; // last point with a known (non-estimated) departure
  let anchorDeparture = 0;

  for (const tp of sorted) {
    const naturalSeconds = legTimesSeconds.slice(anchorIndex, tp.pointIndex).reduce((sum, s) => sum + s, 0);
    let targetSeconds = tp.legMinutes * 60;
    if (targetSeconds < naturalSeconds) {
      infeasibleTimingPoints.push({
        pointIndex: tp.pointIndex,
        publishedMinutes: tp.legMinutes,
        fastestMinutes: Math.ceil(naturalSeconds / 60),
      });
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

  // The route's own first and last points are always published times on a
  // real timetable, never just "passing through" (DESIGN.md §4/§7) — point
  // 0 already always is (it's the journey's own departure); this makes the
  // terminus one too even with no timing point explicitly flagged there,
  // using whatever natural running time gets it there.
  estimated[pointCount - 1] = false;

  return { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated, infeasibleTimingPoints };
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
