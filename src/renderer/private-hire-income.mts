// Private hire revival (T183, Q20/OPEN-ITEMS.md, confirmed 2026-11-13) —
// pure month math and booking generation, no DOM/IPC dependency, same
// "keep fiddly date/time arithmetic testable on its own" pattern as
// game-clock.mts/fare-pricing.mts/route-timetable.mts. The actual lazy
// generate-and-record trigger lives in depot-groups-panel.ts, which calls
// this module every time the panel opens (the same "re-checked fresh
// every time the screen opens, since the game clock keeps advancing while
// it's closed" pattern T179's re-power bookings already use — there is no
// real periodic/monthly game-tick anywhere in this codebase to hang this
// off instead).
import { gameDateTimeFromSeconds, gameDayFromCivil, isLeapYear, SECONDS_PER_DAY } from "./game-clock.mts";

export type PrivateHireVehicleClass = "coach" | "sprinter";

export type TimeOfDayLabel = "morning" | "afternoon" | "evening";

export interface PrivateHireBooking {
  gameDay: number;
  timeOfDayLabel: TimeOfDayLabel;
  amountGBPPence: number;
}

// "<year>-<2-digit month>" — not zero-padded on the year (this game's own
// calendar epoch starts at Year 1, DESIGN.md §3/game-clock.mts, so early
// saves have single- or double-digit years), so every comparison between
// two month keys below goes through compareMonthKeys' own numeric parse
// rather than a lexicographic string compare, which a short year would
// break ("9-01" sorting after "10-01").
export function monthKeyFromGameDay(gameDay: number): string {
  const dt = gameDateTimeFromSeconds(gameDay * SECONDS_PER_DAY);
  return formatMonthKey(dt.year, dt.month);
}

function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [yearStr, monthStr] = monthKey.split("-");
  return { year: Number(yearStr), month: Number(monthStr) };
}

function nextMonthKey(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return month === 12 ? formatMonthKey(year + 1, 1) : formatMonthKey(year, month + 1);
}

// Numeric, not lexicographic — see monthKeyFromGameDay's own comment above
// for why a plain string compare would be wrong here.
export function compareMonthKeys(a: string, b: string): number {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  return pa.year !== pb.year ? pa.year - pb.year : pa.month - pb.month;
}

// The latest (numerically greatest) of a list of month keys already
// recorded as generated for a vehicle, or null if the list is empty (a
// vehicle with no months generated yet at all) — the caller falls back to
// the vehicle's own purchase month in that case, so bookings never
// generate for a month before (or the same partial month as) purchase.
export function maxMonthKey(monthKeys: readonly string[]): string | null {
  if (monthKeys.length === 0) return null;
  return monthKeys.reduce((latest, k) => (compareMonthKeys(k, latest) > 0 ? k : latest));
}

// Every calendar month strictly between lastKnownMonthKey (exclusive —
// already accounted for) and the month containing nowGameDay (also
// exclusive — the current month hasn't FULLY elapsed yet, so it's never
// backfilled early), in ascending order. Correct across a year boundary
// and through February in a leap year, since it's built entirely on
// gameDateTimeFromSeconds' own real-calendar civil-date conversion, not a
// hand-rolled 30-day approximation.
export function elapsedMonthKeysSince(lastKnownMonthKey: string, nowGameDay: number): string[] {
  const currentMonthKey = monthKeyFromGameDay(nowGameDay);
  const result: string[] = [];
  let candidate = nextMonthKey(lastKnownMonthKey);
  while (compareMonthKeys(candidate, currentMonthKey) < 0) {
    result.push(candidate);
    candidate = nextMonthKey(candidate);
  }
  return result;
}

// Confirmed by the user: coach income is £4,500-£7,500/month, seasonally
// adjusted. Sprinter's own range is a DERIVED figure, not separately
// confirmed — proportional to real seated capacity (Sprinter ~16 seated
// vs. a typical coach ~65-81 seated, roughly 20-25%) — flagged again in
// OPEN-ITEMS.md T183 and in the handover report for the user to adjust if
// it doesn't feel right once played.
export const MONTHLY_INCOME_RANGE_GBP: Record<PrivateHireVehicleClass, { min: number; max: number }> = {
  coach: { min: 4_500, max: 7_500 },
  sprinter: { min: 1_000, max: 1_800 },
};

// UK coach-hire seasonality — proposed, not separately confirmed: summer
// (school trips, tours) and Christmas peaks, a new-year trough, averaging
// to ~1.0 across the year so MONTHLY_INCOME_RANGE_GBP's own ranges stay
// meaningful as yearly averages rather than needing their own re-scaling.
export const SEASONAL_MULTIPLIER: Record<number, number> = {
  1: 0.7,
  2: 0.75,
  3: 0.85,
  4: 0.9,
  5: 1.0,
  6: 1.15,
  7: 1.25,
  8: 1.2,
  9: 1.0,
  10: 0.9,
  11: 1.0,
  12: 1.2,
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonthFor(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

const TIME_OF_DAY_LABELS: readonly TimeOfDayLabel[] = ["morning", "afternoon", "evening"];

// A real monthly total (randomised within the class's own range, then
// seasonally adjusted for monthKey's own month), split into 3-6 randomly-
// sized bookings — different days, different times of day/evening, as
// confirmed by the user — so the finance ledger reads like real spread-
// out activity rather than one lump sum. The split sums EXACTLY to the
// seasonally-adjusted total (the last chunk absorbs the rounding
// remainder) and never returns the same total twice across repeated calls
// with the default real RNG, but is fully deterministic given an injected
// one (same "injectable, defaults to Math.random" convention as
// randomDriverName).
export function generateMonthlyBookings(vehicleClass: PrivateHireVehicleClass, monthKey: string, rng: () => number = Math.random): PrivateHireBooking[] {
  const { year, month } = parseMonthKey(monthKey);
  const range = MONTHLY_INCOME_RANGE_GBP[vehicleClass];
  const baseGBP = range.min + rng() * (range.max - range.min);
  const seasonalMultiplier = SEASONAL_MULTIPLIER[month];
  const totalGBPPence = Math.round(baseGBP * seasonalMultiplier * 100);

  const chunkCount = 3 + Math.floor(rng() * 4); // 3-6 inclusive
  const weights: number[] = [];
  for (let i = 0; i < chunkCount; i++) weights.push(0.2 + rng()); // keep every chunk meaningfully non-zero
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const amounts = weights.map((w) => Math.floor((w / weightSum) * totalGBPPence));
  const assignedSum = amounts.reduce((a, b) => a + b, 0);
  amounts[amounts.length - 1] += totalGBPPence - assignedSum; // exact-sum correction

  const daysInMonth = daysInMonthFor(year, month);
  return amounts.map((amountGBPPence) => {
    const day = 1 + Math.floor(rng() * daysInMonth);
    const gameDay = gameDayFromCivil(year, month, day);
    const timeOfDayLabel = TIME_OF_DAY_LABELS[Math.floor(rng() * TIME_OF_DAY_LABELS.length)];
    return { gameDay, timeOfDayLabel, amountGBPPence };
  });
}
