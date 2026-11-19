// Plan #11 of the approved 2026-11-15 batch — OPEN-ITEMS.md's confirmed
// spec, verbatim: "stop marker colour is relative to that specific stop's
// own typical/historical crowd size, not a single fixed game-wide
// waiting-passenger threshold — i.e. 'busier than usual for THIS stop,'
// not 'more than N people.'"
//
// Pure tracking/categorisation logic only, no DOM/map code — same split
// this codebase already uses for `passenger-simulation.mts`,
// `stop-connectivity.mts` etc. The caller (vehicle-simulation.ts's own
// refresh loop, which already exposes `waitingPassengerCountByStop()` on
// `window.__vehicleSim` for exactly this plan) feeds real observations
// in; `stops-layer.ts` reads the resulting tier back out to colour each
// stop marker.
//
// "Typical" needs a real per-stop BASELINE, built up over actual play
// time — a single snapshot has nothing to compare itself against. Time-
// of-day matters here: `passenger-simulation.mts`'s own
// `timeOfDayDemandMultiplier` already establishes that this game's real
// demand varies hour to hour (a morning/evening peak, a 0.15 overnight
// floor) — a stop's typical crowd at 08:00 is genuinely not its typical
// crowd at 14:00, so the baseline is tracked per-hour-of-day (24 buckets),
// not as one flat figure, to avoid "busier than usual" firing constantly
// every single morning rush.
//
// Day of week matters too (live question, 2026-11-16: "Does stop
// crowding take into account the day of the week?" — it didn't, this is
// the fix). Real UK bus demand doesn't vary continuously across all 7
// days independently; it splits into the same three broad patterns this
// game's own timetabling already treats as the meaningful day types —
// weekday, Saturday, Sunday (`MONDAY_FRIDAY_MASK`/`SATURDAY_MASK`/
// `SUNDAY_MASK`, route-timetable.mts). Bucketing per exact weekday mask
// instead would be wrong in a different way: a single physical stop is
// served by many routes, each free to define its own arbitrary day-type
// combination for ITS OWN timetable components, so "the stop's day type"
// isn't a real concept at that granularity — only the coarser
// weekday/Saturday/Sunday split is a property of the stop's real-world
// demand pattern itself, not of any one route's own timetable structure.
export type DayCategory = "weekday" | "saturday" | "sunday";

// Classifies the game's own current day-type selector (vehicle-
// simulation.ts's `weekdayMask` — there is no real in-game calendar, see
// that file's own header comment; a manual Mon-Fri/Sat/Sun selector
// stands in for "today") into one of the three broad categories above.
// Exact-match on the two single-day masks first; anything else
// (Mon-Fri, a single weekday, or any broader/custom combination) falls
// to "weekday" — the realistic common case for "what day is being
// simulated right now," not a guess, since the live selector is a
// day-type PICKER, not a calendar that could land on some combined
// multi-category mask during actual play.
export function dayCategoryForWeekdayMask(mask: number, saturdayMask: number, sundayMask: number): DayCategory {
  if (mask === sundayMask) return "sunday";
  if (mask === saturdayMask) return "saturday";
  return "weekday";
}

export type CrowdingTier = "normal" | "busier" | "much_busier";

interface HourBucket {
  // Exponential moving average of the observed waiting count for this
  // stop at this hour-of-day/day-category. Starts undefined (no
  // observation yet) — the first observation seeds it outright rather
  // than blending it into a fabricated zero baseline.
  average: number | undefined;
  samples: number;
}

function bucketKey(dayCategory: DayCategory, hourOfDay: number): string {
  return `${dayCategory}:${hourOfDay}`;
}

// Placeholder, not sourced — no design doc gives a real smoothing rate
// for this. 0.1 means roughly the last ~10 observations at this stop and
// hour dominate the average, recent enough to track real timetable/
// demand changes without being so reactive that a single busy departure
// swings "typical" itself.
export const EWMA_ALPHA = 0.1;

// Also placeholders, flagged the same way this session's other new
// modules flag their own unsourced constants (e.g.
// `passenger-simulation.mts`'s `LONG_DISTANCE_ATTEMPT_PROBABILITY`).
// Multiples of the tracked baseline, not absolute counts — the whole
// point of this feature.
export const BUSIER_THRESHOLD_MULTIPLE = 1.5;
export const MUCH_BUSIER_THRESHOLD_MULTIPLE = 2.5;

// Don't call it "busier than usual" off a baseline built from only one or
// two real observations — too easy for simple noise to look like a trend.
// Same "can't tell, don't fake it" convention this codebase uses
// throughout (e.g. `isPointInScotland`'s fail-open default,
// `pickTripOriginDestination`'s null returns).
export const MIN_SAMPLES_BEFORE_COMPARING = 3;

export class StopCrowdingTracker {
  // Keyed by stopOsmId, then by "dayCategory:hourOfDay" — a weekday 08:00
  // and a Saturday 08:00 at the same stop are genuinely separate buckets,
  // never blended into one average.
  private readonly buckets = new Map<number, Map<string, HourBucket>>();

  private bucketFor(stopOsmId: number, dayCategory: DayCategory, hourOfDay: number): HourBucket {
    let perStop = this.buckets.get(stopOsmId);
    if (!perStop) {
      perStop = new Map();
      this.buckets.set(stopOsmId, perStop);
    }
    const key = bucketKey(dayCategory, hourOfDay);
    let bucket = perStop.get(key);
    if (!bucket) {
      bucket = { average: undefined, samples: 0 };
      perStop.set(key, bucket);
    }
    return bucket;
  }

  // Feeds one real "N people waiting at this stop right now" observation
  // in, at the given day category and hour-of-day (0-23, caller's own
  // responsibility to derive both from the real game clock/day-type
  // selector — kept as plain values here rather than a Date/seconds
  // value or a weekday mask, so this class stays free of any particular
  // clock/calendar representation).
  recordObservation(stopOsmId: number, dayCategory: DayCategory, hourOfDay: number, waitingCount: number): void {
    const bucket = this.bucketFor(stopOsmId, dayCategory, hourOfDay);
    bucket.average = bucket.average === undefined ? waitingCount : bucket.average + EWMA_ALPHA * (waitingCount - bucket.average);
    bucket.samples += 1;
  }

  // The tracked baseline for this stop/day-category/hour, or null if
  // there isn't enough real history yet to trust one.
  baselineFor(stopOsmId: number, dayCategory: DayCategory, hourOfDay: number): number | null {
    const bucket = this.buckets.get(stopOsmId)?.get(bucketKey(dayCategory, hourOfDay));
    if (!bucket || bucket.average === undefined || bucket.samples < MIN_SAMPLES_BEFORE_COMPARING) return null;
    return bucket.average;
  }

  // The real tier for a CURRENT observation against this stop's own
  // tracked baseline at this day category/hour — "normal" whenever there
  // isn't yet a trustworthy baseline to compare against (a brand new
  // stop, or one just past the min-sample threshold), never a guessed
  // tier.
  tierFor(stopOsmId: number, dayCategory: DayCategory, hourOfDay: number, currentWaitingCount: number): CrowdingTier {
    const baseline = this.baselineFor(stopOsmId, dayCategory, hourOfDay);
    if (baseline === null || baseline <= 0) return "normal";
    const ratio = currentWaitingCount / baseline;
    if (ratio >= MUCH_BUSIER_THRESHOLD_MULTIPLE) return "much_busier";
    if (ratio >= BUSIER_THRESHOLD_MULTIPLE) return "busier";
    return "normal";
  }
}
