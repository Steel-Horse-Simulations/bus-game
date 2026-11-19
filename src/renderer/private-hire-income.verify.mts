// Manual verification script for private-hire-income.mts, run directly
// with `node --experimental-strip-types src/renderer/private-hire-income.verify.mts`
// — same pattern as the project's other .verify.mts files.
import {
  SEASONAL_MULTIPLIER,
  MONTHLY_INCOME_RANGE_GBP,
  monthKeyFromGameDay,
  compareMonthKeys,
  maxMonthKey,
  elapsedMonthKeysSince,
  generateMonthlyBookings,
} from "./private-hire-income.mts";
import { gameDayFromCivil } from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Seasonal multiplier lookup ---
assert(Object.keys(SEASONAL_MULTIPLIER).length === 12, "exactly 12 months have a seasonal multiplier");
assert(SEASONAL_MULTIPLIER[7] === 1.25 && SEASONAL_MULTIPLIER[1] === 0.7, "July peaks, January troughs, as specified");
const avg = Object.values(SEASONAL_MULTIPLIER).reduce((a, b) => a + b, 0) / 12;
assert(Math.abs(avg - 1.0) < 0.02, `the 12 multipliers average to ~1.0 across the year (got ${avg.toFixed(4)})`);

// --- monthKeyFromGameDay / parsing ---
const knownGameDay = gameDayFromCivil(2026, 11, 13);
assert(monthKeyFromGameDay(knownGameDay) === "2026-11", "monthKeyFromGameDay round-trips a known civil date (2026-11-13)");

// --- compareMonthKeys / maxMonthKey — numeric, not lexicographic ---
assert(compareMonthKeys("9-01", "10-01") < 0, "month-key comparison is numeric: year 9 sorts before year 10, not lexicographically after it");
assert(compareMonthKeys("2026-02", "2026-11") < 0, "same-year months compare by month number");
assert(maxMonthKey([]) === null, "maxMonthKey of an empty list is null");
assert(maxMonthKey(["2026-11", "2026-12", "2026-01"]) === "2026-12", "maxMonthKey picks the numerically latest month");
assert(maxMonthKey(["9-06", "10-01"]) === "10-01", "maxMonthKey picks year 10 over year 9, not the lexicographically larger '9-06'");

// --- elapsedMonthKeysSince — including across a year boundary ---
const nowInFeb2027 = gameDayFromCivil(2027, 2, 15);
const elapsed = elapsedMonthKeysSince("2026-11", nowInFeb2027);
assert(JSON.stringify(elapsed) === JSON.stringify(["2026-12", "2027-01"]), `elapsed months across a year boundary are exactly Dec + Jan (got ${JSON.stringify(elapsed)})`);
assert(!elapsed.includes("2027-02"), "the current, not-yet-fully-elapsed month is never included");

const noneYet = elapsedMonthKeysSince("2026-11", gameDayFromCivil(2026, 11, 20));
assert(noneYet.length === 0, "nothing has elapsed yet if nowGameDay is still within lastKnownMonthKey's own month");

const sameMonthOnly = elapsedMonthKeysSince("2026-11", gameDayFromCivil(2027, 1, 5));
assert(JSON.stringify(sameMonthOnly) === JSON.stringify(["2026-12"]), "exactly one elapsed month (December) once now is into the month after it");

// Leap year: Feb 2028 is a leap year (divisible by 4, not by 100) — months
// elapsing across it should still just be a plain month-key walk (the leap
// day itself is only exercised through generateMonthlyBookings' own day
// picker below, not through this walk).
const leapElapsed = elapsedMonthKeysSince("2028-01", gameDayFromCivil(2028, 4, 1));
assert(JSON.stringify(leapElapsed) === JSON.stringify(["2028-02", "2028-03"]), `elapsed months walk correctly through a leap February (got ${JSON.stringify(leapElapsed)})`);

// --- generateMonthlyBookings — exact-sum, chunk count, determinism ---
function totalOf(bookings: { amountGBPPence: number }[]): number {
  return bookings.reduce((sum, b) => sum + b.amountGBPPence, 0);
}

for (const vehicleClass of ["coach", "sprinter"] as const) {
  for (const month of [1, 7, 12]) {
    const monthKey = `2026-${String(month).padStart(2, "0")}`;
    const bookings = generateMonthlyBookings(vehicleClass, monthKey, () => 0.5);
    assert(bookings.length >= 3 && bookings.length <= 6, `${vehicleClass} ${monthKey}: 3-6 bookings generated (got ${bookings.length})`);
    const range = MONTHLY_INCOME_RANGE_GBP[vehicleClass];
    const expectedBaseGBP = range.min + 0.5 * (range.max - range.min);
    const expectedTotalPence = Math.round(expectedBaseGBP * SEASONAL_MULTIPLIER[month] * 100);
    assert(totalOf(bookings) === expectedTotalPence, `${vehicleClass} ${monthKey}: the bookings' own total sums exactly to the seasonally-adjusted monthly total`);
    for (const b of bookings) {
      assert(b.amountGBPPence > 0, "every individual booking amount is positive, not zero or negative");
      assert(["morning", "afternoon", "evening"].includes(b.timeOfDayLabel), "every booking has a valid time-of-day label");
      assert(Number.isInteger(b.gameDay), "every booking lands on a real whole gameDay");
    }
  }
}

// Determinism with an injected RNG — the exact same sequence of draws
// produces the exact same bookings every time.
const rngSeqA = [0.1, 0.4, 0.6, 0.2, 0.8, 0.3, 0.5, 0.9, 0.05, 0.7, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.12];
function makeSeqRng(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length];
}
const detA = generateMonthlyBookings("coach", "2026-07", makeSeqRng(rngSeqA));
const detB = generateMonthlyBookings("coach", "2026-07", makeSeqRng(rngSeqA));
assert(JSON.stringify(detA) === JSON.stringify(detB), "an injected, repeated RNG sequence produces byte-identical bookings");

// Non-determinism with the default real RNG — never the same total twice.
const totalsFromRealRng = new Set<number>();
for (let i = 0; i < 25; i++) {
  totalsFromRealRng.add(totalOf(generateMonthlyBookings("sprinter", "2026-06")));
}
assert(totalsFromRealRng.size > 1, "25 draws with the default Math.random rng produce more than one distinct monthly total");

console.log("All private-hire-income checks passed.");
