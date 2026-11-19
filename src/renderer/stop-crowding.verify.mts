// Manual verification script for stop-crowding.mts, run directly with
// `node --experimental-strip-types src/renderer/stop-crowding.verify.mts`
// — same pattern as passenger-simulation.verify.mts.
import {
  StopCrowdingTracker,
  dayCategoryForWeekdayMask,
  MIN_SAMPLES_BEFORE_COMPARING,
  BUSIER_THRESHOLD_MULTIPLE,
  MUCH_BUSIER_THRESHOLD_MULTIPLE,
} from "./stop-crowding.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const STOP = 1001;
const HOUR = 8;
const WEEKDAY = "weekday" as const;

// Plain bit values mirroring route-timetable.mts's own real constants —
// kept as local literals rather than importing that module, same
// "stay free of any particular calendar representation" reasoning
// stop-crowding.mts's own header already gives for taking these as
// caller-supplied parameters rather than importing them itself.
const MONDAY_FRIDAY_MASK = 31; // mon|tue|wed|thu|fri
const SATURDAY_MASK = 32;
const SUNDAY_MASK = 64;

// --- dayCategoryForWeekdayMask: the real classification rule ---
{
  assert(dayCategoryForWeekdayMask(SATURDAY_MASK, SATURDAY_MASK, SUNDAY_MASK) === "saturday", "the exact Saturday-only mask classifies as 'saturday'");
  assert(dayCategoryForWeekdayMask(SUNDAY_MASK, SATURDAY_MASK, SUNDAY_MASK) === "sunday", "the exact Sunday-only mask classifies as 'sunday'");
  assert(dayCategoryForWeekdayMask(MONDAY_FRIDAY_MASK, SATURDAY_MASK, SUNDAY_MASK) === "weekday", "the Mon-Fri mask classifies as 'weekday'");
  assert(dayCategoryForWeekdayMask(1 /* Monday only */, SATURDAY_MASK, SUNDAY_MASK) === "weekday", "a single weekday bit classifies as 'weekday'");
  assert(
    dayCategoryForWeekdayMask(SATURDAY_MASK | SUNDAY_MASK, SATURDAY_MASK, SUNDAY_MASK) === "weekday",
    "a combined weekend mask (not an exact single-day match) falls to the 'weekday' default, not a guess at which weekend day",
  );
}

// --- a stop with no history at all is never flagged, regardless of count ---
{
  const tracker = new StopCrowdingTracker();
  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, 500) === "normal", "a brand-new stop with zero history stays 'normal' even for an absurdly high current count — can't compare against a baseline that doesn't exist yet");
  assert(tracker.baselineFor(STOP, WEEKDAY, HOUR) === null, "baselineFor returns null with no observations at all");
}

// --- fewer than MIN_SAMPLES_BEFORE_COMPARING observations still doesn't trust the baseline ---
{
  const tracker = new StopCrowdingTracker();
  for (let i = 0; i < MIN_SAMPLES_BEFORE_COMPARING - 1; i++) tracker.recordObservation(STOP, WEEKDAY, HOUR, 5);
  assert(tracker.baselineFor(STOP, WEEKDAY, HOUR) === null, `${MIN_SAMPLES_BEFORE_COMPARING - 1} observations (one short of the minimum) still isn't enough to trust a baseline`);
  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, 50) === "normal", "not enough history yet — even a huge current count can't be flagged as 'busier than usual' without a trustworthy baseline");
}

// --- once there's enough history, the tracked baseline is a real EWMA, not just the latest value ---
{
  const tracker = new StopCrowdingTracker();
  for (let i = 0; i < 20; i++) tracker.recordObservation(STOP, WEEKDAY, HOUR, 5);
  const baseline = tracker.baselineFor(STOP, WEEKDAY, HOUR);
  assert(baseline !== null && Math.abs(baseline - 5) < 0.1, `20 identical observations of 5 converge the baseline to ~5, got ${baseline}`);
}

// --- the real tier boundaries, against a settled baseline ---
{
  const tracker = new StopCrowdingTracker();
  for (let i = 0; i < 50; i++) tracker.recordObservation(STOP, WEEKDAY, HOUR, 10); // settles the baseline at ~10
  const baseline = tracker.baselineFor(STOP, WEEKDAY, HOUR)!;
  assert(Math.abs(baseline - 10) < 0.5, `baseline should have settled near 10, got ${baseline}`);

  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, 10) === "normal", "exactly at baseline is 'normal'");
  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, Math.ceil(baseline * BUSIER_THRESHOLD_MULTIPLE) - 1) === "normal", "just under the busier multiple is still 'normal'");
  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, Math.ceil(baseline * BUSIER_THRESHOLD_MULTIPLE)) === "busier", "at/above the busier multiple is 'busier'");
  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, Math.ceil(baseline * MUCH_BUSIER_THRESHOLD_MULTIPLE)) === "much_busier", "at/above the much-busier multiple is 'much_busier'");
}

// --- "typical" is tracked PER HOUR, not as one flat figure for the whole stop ---
{
  const tracker = new StopCrowdingTracker();
  const MORNING = 8;
  const AFTERNOON = 14;
  for (let i = 0; i < 50; i++) tracker.recordObservation(STOP, WEEKDAY, MORNING, 40); // busy commute baseline
  for (let i = 0; i < 50; i++) tracker.recordObservation(STOP, WEEKDAY, AFTERNOON, 5); // quiet afternoon baseline

  // The exact same CURRENT count (20) reads differently depending on
  // which hour it's being compared against — proving the baseline is
  // genuinely per-hour, not a single game-wide/stop-wide figure.
  assert(tracker.tierFor(STOP, WEEKDAY, MORNING, 20) === "normal", "20 waiting is below the morning's own busy baseline (40) — normal for that hour");
  assert(tracker.tierFor(STOP, WEEKDAY, AFTERNOON, 20) === "much_busier", "the SAME count of 20, compared against the afternoon's own quiet baseline (5), is much busier than usual for that hour");
}

// --- "typical" is ALSO tracked PER DAY CATEGORY, not shared across weekday/Saturday/Sunday (2026-11-16 fix) ---
{
  const tracker = new StopCrowdingTracker();
  for (let i = 0; i < 50; i++) tracker.recordObservation(STOP, "weekday", HOUR, 40); // busy weekday commute baseline
  for (let i = 0; i < 50; i++) tracker.recordObservation(STOP, "saturday", HOUR, 5); // quiet Saturday baseline

  // The exact same CURRENT count (20) at the SAME hour reads differently
  // depending on which day category it's compared against — proving a
  // weekday reading never gets compared against Saturday's own history
  // (the exact bug the user asked about) and vice versa.
  assert(tracker.tierFor(STOP, "weekday", HOUR, 20) === "normal", "20 waiting is below the weekday's own busy baseline (40) at this hour — normal");
  assert(tracker.tierFor(STOP, "saturday", HOUR, 20) === "much_busier", "the SAME count of 20, at the SAME hour, compared against Saturday's own quiet baseline (5), is much busier than usual for Saturday");
  // Sunday has no history at all yet at this stop/hour — must not
  // silently borrow the weekday or Saturday baseline either.
  assert(tracker.baselineFor(STOP, "sunday", HOUR) === null, "a day category with zero real observations has no baseline of its own, even though the same stop/hour has history under other day categories");
  assert(tracker.tierFor(STOP, "sunday", HOUR, 500) === "normal", "with no Sunday history at all, even an absurd current count can't be flagged — can't fake a baseline by borrowing another day category's");
}

// --- different stops never share a baseline ---
{
  const tracker = new StopCrowdingTracker();
  const STOP_A = 2001;
  const STOP_B = 2002;
  for (let i = 0; i < 50; i++) tracker.recordObservation(STOP_A, WEEKDAY, HOUR, 100);
  assert(tracker.baselineFor(STOP_B, WEEKDAY, HOUR) === null, "a different stop's own history must not leak into this stop's baseline");
}

// --- a baseline of exactly 0 never falsely flags any positive count as busier (division-by-zero guard) ---
{
  const tracker = new StopCrowdingTracker();
  for (let i = 0; i < 10; i++) tracker.recordObservation(STOP, WEEKDAY, HOUR, 0);
  assert(tracker.baselineFor(STOP, WEEKDAY, HOUR) === 0, "a stop that's genuinely always empty at this hour settles at baseline 0");
  assert(tracker.tierFor(STOP, WEEKDAY, HOUR, 3) === "normal", "a zero baseline can't produce a meaningful ratio — stays 'normal' rather than reporting an infinite/nonsensical multiple");
}

console.log("\nAll stop-crowding checks passed.");
