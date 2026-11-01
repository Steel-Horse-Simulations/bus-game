// Manual verification for game-clock.mts (DESIGN.md §3), run directly
// with `node --experimental-strip-types src/renderer/game-clock.verify.mts`.
import {
  gameDateTimeFromSeconds,
  isWageDay,
  isOperationalChangeDay,
  formatGameDate,
  formatGameTime,
  gameSecondsForRealMs,
  GAME_SECONDS_PER_REAL_SECOND_AT_1X,
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
  DAYS_PER_YEAR,
} from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

assert(DAYS_PER_MONTH === 28 && MONTHS_PER_YEAR === 13 && DAYS_PER_YEAR === 364, "28-day months, 13-month years, 364-day years");

// --- epoch ---
{
  const dt = gameDateTimeFromSeconds(0);
  assert(dt.year === 1 && dt.month === 1 && dt.day === 1, "second 0 is year 1, month 1, day 1");
  assert(dt.hour === 0 && dt.minute === 0 && dt.second === 0, "second 0 is midnight");
  assert(dt.weekday === 0, "the epoch day is a Monday (weekday 0)");
  assert(dt.weekNumber === 0, "the epoch day is in week 0 (even)");
  assert(dt.dayOfYear === 1, "the epoch day is day 1 of the year");
}

// --- rolling forward within a day ---
{
  const dt = gameDateTimeFromSeconds(3661); // 1h 1m 1s
  assert(dt.hour === 1 && dt.minute === 1 && dt.second === 1, "3661 seconds is 01:01:01");
  assert(dt.day === 1 && dt.month === 1, "still day 1 of month 1");
}

// --- crossing a day boundary ---
{
  const dt = gameDateTimeFromSeconds(86400); // exactly 1 day
  assert(dt.day === 2 && dt.month === 1, "86400 seconds is day 2 of month 1");
  assert(dt.weekday === 1, "day 2 is a Tuesday");
}

// --- crossing a month boundary (28 days in) ---
{
  const dt = gameDateTimeFromSeconds(86400 * 28);
  assert(dt.month === 2 && dt.day === 1, "day 29 overall is month 2, day 1");
}

// --- crossing a year boundary (364 days in) ---
{
  const dt = gameDateTimeFromSeconds(86400 * 364);
  assert(dt.year === 2 && dt.month === 1 && dt.day === 1, "day 365 overall is year 2, month 1, day 1");
  assert(dt.dayOfYear === 1, "back to day 1 of the new year");
}

// --- the last day of a year ---
{
  const dt = gameDateTimeFromSeconds(86400 * 363);
  assert(dt.year === 1 && dt.month === 13 && dt.day === 28, "day 364 overall is year 1, month 13 (last), day 28 (last)");
  assert(dt.dayOfYear === 364, "day 364 of year 1 is the last day of the year");
}

// --- wage day (every Thursday) ---
{
  assert(isWageDay(gameDateTimeFromSeconds(86400 * 3)) === true, "day 4 overall (weekday 3) is a Thursday, a wage day");
  assert(isWageDay(gameDateTimeFromSeconds(0)) === false, "day 1 (Monday) is not a wage day");
  assert(isWageDay(gameDateTimeFromSeconds(86400 * 10)) === true, "day 11 overall (weekday 3 again, next week) is also a Thursday");
}

// --- operational change day (Monday of every even week) ---
{
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(0)) === true, "week 0's Monday (day 1) is an operational-change day");
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(86400 * 7)) === false, "week 1's Monday (day 8) is NOT — week 1 is odd");
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(86400 * 14)) === true, "week 2's Monday (day 15) is — week 2 is even");
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(86400 * 1)) === false, "day 2 (a Tuesday) is never an operational-change day regardless of week");
}

// --- formatting ---
{
  const dt = gameDateTimeFromSeconds(86400 * 3 + 3600 * 14 + 60 * 5); // day 4, 14:05
  assert(formatGameDate(dt) === "Thursday 4 Month 1, Year 1", `expected formatted date, got "${formatGameDate(dt)}"`);
  assert(formatGameTime(dt) === "14:05", `expected formatted time, got "${formatGameTime(dt)}"`);
}

// --- speed/real-time conversion ---
{
  assert(GAME_SECONDS_PER_REAL_SECOND_AT_1X === 10, "1x is 10 game-seconds per real second");
  assert(gameSecondsForRealMs(1000, 1) === 10, "1 real second at 1x adds 10 game seconds");
  assert(gameSecondsForRealMs(1000, 60) === 600, "1 real second at 60x adds 600 game seconds");
  // DESIGN.md §3's own worked example: "at 60x a day passes in about 2.4 real minutes"
  const realMsForOneGameDayAt60x = (86400 / (GAME_SECONDS_PER_REAL_SECOND_AT_1X * 60)) * 1000;
  assert(Math.abs(realMsForOneGameDayAt60x - 144000) < 1, "a full game day at 60x takes 144 real seconds (2.4 real minutes)");
}

console.log("\nAll game-clock checks passed.");
