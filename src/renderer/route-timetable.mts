// Timetable generation (DESIGN.md §7), scoped to a route having any number
// of day-type components, no variations, padding, connections, extensions
// or event calendar yet (OPEN-ITEMS.md T29). Pure functions only — the
// actual per-leg running time comes from the WASM router, which the caller
// supplies as `legTimesSeconds`, keeping this module (and its verify
// script) free of any WASM/DOM dependency.
//
// A day type is a freeform weekday bitmask (bit 0 = Monday ... bit 6 =
// Sunday), not a fixed 3-value enum — the original "monday_friday" /
// "saturday" / "sunday" presets were lifted 2026-11-07 (live user request:
// "can I also have the days timetables run be selectable per day, Airlink
// 100 runs the same service 7 days a week but I had to make the same
// timetable 3 times") once it turned out the save format already stored
// exactly this (electron/db.mts's own weekday_mask column, schema v19->v20)
// and only the UI was still stuck on the 3 presets. A route can have any
// number of these components; the only rule is that two components for the
// same route+direction can't claim the same day twice (weekdayMasksOverlap
// below) — enforced by the UI, not here, since blocking it is a greying
// decision at add-time, not a hard invariant every pure function needs to
// defend.
export const WEEKDAY_BITS = {
  monday: 1,
  tuesday: 2,
  wednesday: 4,
  thursday: 8,
  friday: 16,
  saturday: 32,
  sunday: 64,
} as const;
const WEEKDAY_BIT_ORDER: readonly number[] = [
  WEEKDAY_BITS.monday,
  WEEKDAY_BITS.tuesday,
  WEEKDAY_BITS.wednesday,
  WEEKDAY_BITS.thursday,
  WEEKDAY_BITS.friday,
  WEEKDAY_BITS.saturday,
  WEEKDAY_BITS.sunday,
];
const WEEKDAY_ABBREVIATIONS: readonly string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const MONDAY_FRIDAY_MASK =
  WEEKDAY_BITS.monday | WEEKDAY_BITS.tuesday | WEEKDAY_BITS.wednesday | WEEKDAY_BITS.thursday | WEEKDAY_BITS.friday;
export const SATURDAY_MASK: number = WEEKDAY_BITS.saturday;
export const SUNDAY_MASK: number = WEEKDAY_BITS.sunday;
export const WEEKEND_MASK: number = SATURDAY_MASK | SUNDAY_MASK;
export const EVERY_DAY_MASK: number = MONDAY_FRIDAY_MASK | WEEKEND_MASK;

export function validateWeekdayMask(mask: number): string | null {
  if (!Number.isInteger(mask) || mask < 1 || mask > EVERY_DAY_MASK) {
    return "A day type needs at least one day selected.";
  }
  return null;
}

// Two components clash if they'd both claim at least one of the same day —
// the rule the "Add day type" picker's own greying enforces (a day already
// claimed by another component for this route+direction can't be ticked).
export function weekdayMasksOverlap(a: number, b: number): boolean {
  return (a & b) !== 0;
}

// Auto-generated label from a weekday mask (confirmed 2026-11-07: "Auto-
// generated from the days" rather than a player-typed name) — groups
// consecutive selected days (Monday through Sunday, no midnight-style
// wraparound: Sun+Mon is two separate single-day runs, not one) into
// ranges, e.g. 31 -> "Mon-Fri", 20 -> "Thu, Fri", 127 -> "Every day". The
// two weekend-adjacent presets get their own friendlier names rather than
// falling out of the general range logic ("Sat-Sun" would be technically
// correct but not how a real timetable describes it).
export function describeWeekdayMask(mask: number): string {
  if (mask === EVERY_DAY_MASK) return "Every day";
  if (mask === WEEKEND_MASK) return "Weekend";
  const runs: string[] = [];
  let i = 0;
  while (i < 7) {
    if ((mask & WEEKDAY_BIT_ORDER[i]) === 0) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && (mask & WEEKDAY_BIT_ORDER[j + 1]) !== 0) j++;
    runs.push(j > i ? `${WEEKDAY_ABBREVIATIONS[i]}-${WEEKDAY_ABBREVIATIONS[j]}` : WEEKDAY_ABBREVIATIONS[i]);
    i = j + 1;
  }
  return runs.length > 0 ? runs.join(", ") : "No days";
}

// A timing point is a published scheduling location, not every physical
// stop — most routes have far more stops than timing points (a real
// timetable might publish 5 times for a 30-stop route). The published
// running time from the *previous* timing point (or the journey's own
// departure at point 0, for the first one) to this point's arrival is now
// PADDING (2026-11-15 live request: "can it be set so its an amount of
// time more than the minimum with a separate time for peak times of
// day") — whole minutes ADDED ON TOP of whatever the router's own real
// fastest achievable time for that stretch currently computes to, rather
// than a fixed absolute figure the player has to keep updating by hand if
// the route or road network changes. "standardPaddingMinutes" applies
// outside the fixed peak windows (AM_PEAK_START_MINUTES.. below);
// "peakPaddingMinutes" applies inside either of them, confirmed as FIXED
// clock-time windows rather than following whatever time bands a given
// timetable happens to use. `null` means "no separate peak figure" — the
// only route this is ever null for is an island route (confirmed by the
// user: an island depot group's routes are limited to exactly one timing
// point with no peak distinction at all; see isIslandDepotGroup in
// fare-journey.mts), in which case the standard padding is used
// regardless of time of day. Because padding can never be negative, the
// published time can never fall below the real fastest achievable time —
// the old "infeasible timing point, clamp up" case this model replaced
// (ComputedOffsets used to flag it) is now structurally impossible, not
// just rare.
// "dwellMinutes" is an optional layover (departure - arrival at this same
// point, e.g. a bus station stand), in whole minutes — 0 for the common
// case where a timing point is just passed through. Whole minutes, not
// seconds, confirmed 2026-11-07: "timetables run on minutes not seconds."
// WHICH points are timing points at all is a route-level fact
// (electron/db.mts's own Route.timingPointIndexes, schema v56->v57) —
// this is just the per-component TIMES at each of them, which genuinely
// do vary by day type/direction.
export interface TimingPoint {
  pointIndex: number;
  standardPaddingMinutes: number;
  peakPaddingMinutes: number | null;
  dwellMinutes: number;
}

// Fixed AM/PM peak clock-time windows (2026-11-15, user-confirmed) — the
// exact figures DEFAULT_TIME_BANDS below already uses for its own "AM
// peak"/"PM peak" comments, reused as the real peak-window definition
// rather than inventing separate ones. Deliberately independent of
// whatever time bands a given timetable actually has configured — a
// timing point's peak padding always means these two windows, full stop.
export const AM_PEAK_START_MINUTES = 420; // 07:00
export const AM_PEAK_END_MINUTES = 540; // 09:00
export const PM_PEAK_START_MINUTES = 960; // 16:00
export const PM_PEAK_END_MINUTES = 1080; // 18:00

// Whether a departure's own clock minute (0-1439, from midnight) falls in
// either fixed peak window — the one place this decision is made, so
// computeOffsetsForDirection/buildRouteTimetableGrid and anything else
// that needs it stay in sync with each other automatically.
export function isPeakMinute(minute: number): boolean {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return (m >= AM_PEAK_START_MINUTES && m < AM_PEAK_END_MINUTES) || (m >= PM_PEAK_START_MINUTES && m < PM_PEAK_END_MINUTES);
}

const MINUTES_PER_DAY = 24 * 60;

// A service is defined by a start and end time of day, with frequency
// generating everything between (DESIGN.md §7 "Defining a service").
// `endMinutes < startMinutes` means the service **wraps past midnight**
// (confirmed 2026-11-01, live user report — night services genuinely need
// a single band like 23:45→03:45, not two artificial same-day bands
// stitched together) rather than being rejected outright, which is what
// this function used to do unconditionally.
// A mirror component's own "how long after the referenced service
// arrives" figure (DESIGN.md §7, 2026-11-15) — whole minutes, at least 0
// (always AFTER an arrival, per the user's own framing: "a service after
// a settable time after one arrives"; 0 means "immediately", not
// disallowed, for a genuine same-stand turnaround).
export function validateMirrorOffsetMinutes(offsetMinutes: number): string | null {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0) {
    return "The time after arrival must be a whole number of minutes, at least 0.";
  }
  return null;
}

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
// `isIslandRoute` (2026-11-15, user-confirmed) — an island depot group's
// own routes are restricted to EXACTLY one OPTIONAL timing point, with no
// peak-padding field at all (fare-journey.mts's isIslandDepotGroup decides
// this from the real depot's own location against the real fare zones,
// checked and enforced here too so a bypassed client-side UI can't
// produce invalid saved data). Defaults false so every pre-existing
// caller/test keeps behaving exactly as before for an ordinary route.
//
// Real bug, fixed 2026-11-19 (live report: "Island routes can only have 1
// timing point time for whole route not 1 per timing point like it should
// be"): this used to count EVERY entry in `timingPoints` against the cap,
// including the route's own MANDATORY ones — the physical/interior
// terminus (always needs a real published arrival time, no way to
// disable) and any stop-level "forced" timing point (bus station/airport/
// always-shared) — which aren't optional player choices at all, they're
// baseline timing data every route needs regardless of island status.
// Counting them meant setting a real time on the terminus alone could
// already exhaust the "one timing point" budget, collapsing the whole
// route to a single shared figure instead of letting mandatory points
// work normally and capping only the genuinely optional extra one.
// `routeTimingPointIndexes` is `Route.timingPointIndexes` — the real,
// persisted, route-level list of indices the PLAYER has explicitly
// flagged via the checkbox mechanism (route-panel.ts) — mandatory/forced
// entries are never added to it, so filtering the cap check to only
// entries whose index appears there correctly excludes them without
// needing to re-derive "is this point mandatory" here.
export function validateTimingPoints(
  points: readonly { kind: "stop" | "waypoint" }[],
  timingPoints: readonly TimingPoint[],
  isIslandRoute = false,
  routeTimingPointIndexes: readonly number[] = [],
): string | null {
  if (isIslandRoute) {
    const optionalCount = timingPoints.filter((tp) => routeTimingPointIndexes.includes(tp.pointIndex)).length;
    if (optionalCount > 1) {
      return "An island route is limited to a single optional timing point (its own start/terminus and any stop-forced timing point are unaffected).";
    }
  }
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
    if (!Number.isInteger(tp.standardPaddingMinutes) || tp.standardPaddingMinutes < 0) {
      return "A timing point's standard padding must be a whole number of minutes, at least 0.";
    }
    if (isIslandRoute) {
      if (tp.peakPaddingMinutes !== null) {
        return "An island route's timing point has no separate peak padding.";
      }
    } else if (tp.peakPaddingMinutes !== null && (!Number.isInteger(tp.peakPaddingMinutes) || tp.peakPaddingMinutes < 0)) {
      return "A timing point's peak padding must be a whole number of minutes, at least 0, or left unset.";
    }
    if (!Number.isInteger(tp.dwellMinutes) || tp.dwellMinutes < 0) {
      return "A timing point's dwell (layover) must be a whole number of minutes, at least 0.";
    }
  }
  return null;
}

export type TimingPointVariant = "standard" | "peak";

// Which padding figure a given variant actually uses for one timing point
// — peak variant falls back to the standard figure when no separate peak
// value is set (every island-route timing point, by construction, and any
// ordinary timing point the player hasn't bothered giving a distinct peak
// figure to), so computing the "peak" variant for such a point produces
// exactly the same result as "standard" rather than a different, unset
// number.
function paddingMinutesFor(tp: TimingPoint, variant: TimingPointVariant): number {
  if (variant === "standard") return tp.standardPaddingMinutes;
  return tp.peakPaddingMinutes ?? tp.standardPaddingMinutes;
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
}

// Turns per-leg running times into per-point arrival/departure offsets
// (seconds from the journey's own departure at point 0), for ONE padding
// variant (`variant` — a caller building a real timetable component calls
// this (or computeOffsetsForDirection) twice, once per variant, and
// persists both results; buildRouteTimetableGrid then picks whichever one
// a given departure's own clock time actually falls under). A timing
// point's target time is the real fastest achievable time for that
// stretch PLUS its own padding for this variant — always >= the natural
// time by construction (padding can't be negative), so there is no
// "infeasible, clamp up" case to flag any more, unlike the old absolute-
// minutes model this replaced. Every point between two timing points
// shares that same fixed budget, its own offset estimated by giving it
// the same share of the budget as its share of the natural (fastest-
// route) running time within that stretch — not equal time slices, since
// distance and time don't scale together. A stretch with no further
// timing point ahead of it (including the whole route, if none are set at
// all) just keeps the natural running time, no padding applied.
export function computeOffsets(
  pointCount: number,
  legTimesSeconds: readonly number[],
  timingPoints: readonly TimingPoint[],
  variant: TimingPointVariant = "standard",
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
  estimated[0] = false;

  let anchorIndex = 0; // last point with a known (non-estimated) departure
  let anchorDeparture = 0;

  for (const tp of sorted) {
    const naturalSeconds = legTimesSeconds.slice(anchorIndex, tp.pointIndex).reduce((sum, s) => sum + s, 0);
    const targetSeconds = naturalSeconds + paddingMinutesFor(tp, variant) * 60;

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
    departureOffsetsSeconds[tp.pointIndex] = arrival + tp.dwellMinutes * 60;
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

  return { arrivalOffsetsSeconds, departureOffsetsSeconds, estimated };
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
