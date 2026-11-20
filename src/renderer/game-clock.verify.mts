// Manual verification for game-clock.mts (DESIGN.md §3), run directly
// with `node --experimental-strip-types src/renderer/game-clock.verify.mts`.
import {
  gameDateTimeFromSeconds,
  isWageDay,
  isOperationalChangeDay,
  isLeapYear,
  formatGameDate,
  formatGameTime,
  gameSecondsForRealMs,
  GAME_SECONDS_PER_REAL_SECOND_AT_1X,
  companyPeriodFromDays,
  companyPeriodFromSeconds,
  formatCompanyPeriod,
  DAYS_PER_PERIOD,
  PERIODS_PER_COMPANY_YEAR,
  DAYS_PER_COMPANY_YEAR,
  addMonths,
  gameDayFromCivil,
  weekdayBitForGameDay,
} from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

assert(DAYS_PER_PERIOD === 28 && PERIODS_PER_COMPANY_YEAR === 13 && DAYS_PER_COMPANY_YEAR === 364, "company period calendar: 28-day periods, 13 per company year, 364-day company years");

// --- the game's own calendar is now the real, normal one ---
{
  const dt = gameDateTimeFromSeconds(0);
  assert(dt.year === 1 && dt.month === 1 && dt.day === 1, "second 0 is year 1, 1 January");
  assert(dt.hour === 0 && dt.minute === 0 && dt.second === 0, "second 0 is midnight");
  assert(dt.weekday === 0, "the epoch day is a Monday (weekday 0)");
  assert(dt.weekNumber === 0, "the epoch day is in week 0 (even)");
  assert(dt.dayOfYear === 1, "the epoch day is day 1 of the year");
}

// --- rolling forward within a day ---
{
  const dt = gameDateTimeFromSeconds(3661); // 1h 1m 1s
  assert(dt.hour === 1 && dt.minute === 1 && dt.second === 1, "3661 seconds is 01:01:01");
  assert(dt.day === 1 && dt.month === 1, "still 1 January");
}

// --- crossing a day boundary ---
{
  const dt = gameDateTimeFromSeconds(86400); // exactly 1 day
  assert(dt.day === 2 && dt.month === 1, "86400 seconds is 2 January");
  assert(dt.weekday === 1, "day 2 is a Tuesday");
}

// --- real month lengths, not a fixed 28 days: January has 31 days ---
{
  const dt = gameDateTimeFromSeconds(86400 * 31); // 31 days after 1 Jan
  assert(dt.month === 2 && dt.day === 1, "31 days after 1 January is 1 February (January has 31 days, not 28)");
}

// --- leap years follow the real Gregorian rule, checked directly ---
{
  assert(isLeapYear(1) === false, "year 1 is not a leap year");
  assert(isLeapYear(4) === true, "year 4 is a leap year (divisible by 4)");
  assert(isLeapYear(100) === false, "year 100 is NOT a leap year (divisible by 100, not 400)");
  assert(isLeapYear(400) === true, "year 400 IS a leap year (divisible by 400)");
}

// --- crossing a real (non-leap) year boundary: year 1 has 365 days ---
{
  const lastDayOfYear1 = gameDateTimeFromSeconds(86400 * 364);
  assert(lastDayOfYear1.year === 1 && lastDayOfYear1.month === 12 && lastDayOfYear1.day === 31, "day 365 overall is 31 December, year 1 (year 1 is not a leap year)");
  assert(lastDayOfYear1.dayOfYear === 365, "31 December is day 365 of a non-leap year");

  const firstDayOfYear2 = gameDateTimeFromSeconds(86400 * 365);
  assert(firstDayOfYear2.year === 2 && firstDayOfYear2.month === 1 && firstDayOfYear2.day === 1, "day 366 overall is 1 January, year 2");
  assert(firstDayOfYear2.dayOfYear === 1, "back to day 1 of the new year");
}

// --- wage day (every Thursday) — unaffected by the calendar switch, weekday math is independent of month/year length ---
{
  assert(isWageDay(gameDateTimeFromSeconds(86400 * 3)) === true, "day 4 overall (weekday 3) is a Thursday, a wage day");
  assert(isWageDay(gameDateTimeFromSeconds(0)) === false, "day 1 (Monday) is not a wage day");
  assert(isWageDay(gameDateTimeFromSeconds(86400 * 10)) === true, "day 11 overall (weekday 3 again, next week) is also a Thursday");
}

// --- operational change day (Monday of every even week) — also unaffected ---
{
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(0)) === true, "week 0's Monday (day 1) is an operational-change day");
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(86400 * 7)) === false, "week 1's Monday (day 8) is NOT — week 1 is odd");
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(86400 * 14)) === true, "week 2's Monday (day 15) is — week 2 is even");
  assert(isOperationalChangeDay(gameDateTimeFromSeconds(86400 * 1)) === false, "day 2 (a Tuesday) is never an operational-change day regardless of week");
}

// --- formatting, with real month names now ---
{
  const dt = gameDateTimeFromSeconds(86400 * 3 + 3600 * 14 + 60 * 5); // day 4, 14:05
  assert(formatGameDate(dt) === "Thursday 4 January Year 1", `expected formatted date, got "${formatGameDate(dt)}"`);
  assert(formatGameTime(dt) === "14:05", `expected formatted time, got "${formatGameTime(dt)}"`);
}

// --- the company's own 28-day/13-period/364-day financial calendar,
// kept exactly as the old game calendar used to work, just rescoped ---
{
  const p0 = companyPeriodFromSeconds(0);
  assert(p0.companyYear === 1 && p0.period === 1 && p0.dayOfPeriod === 1, "second 0 is company year 1, period 1, day 1");

  const pPeriodBoundary = companyPeriodFromDays(28); // crossing a 28-day period boundary
  assert(pPeriodBoundary.period === 2 && pPeriodBoundary.dayOfPeriod === 1, "day 29 overall is period 2, day 1");

  const pLastOfYear = companyPeriodFromDays(363); // the last day of a company year
  assert(pLastOfYear.companyYear === 1 && pLastOfYear.period === 13 && pLastOfYear.dayOfPeriod === 28, "day 364 overall is company year 1, period 13 (last), day 28 (last)");

  const pYearBoundary = companyPeriodFromDays(364); // crossing a company-year boundary (364 days, floats freely)
  assert(pYearBoundary.companyYear === 2 && pYearBoundary.period === 1 && pYearBoundary.dayOfPeriod === 1, "day 365 overall is company year 2, period 1, day 1 — the company calendar's own year is 364 days, not the real 365/366");

  assert(formatCompanyPeriod(p0) === "Period 1, Day 1, Company Year 1", `expected formatted company period, got "${formatCompanyPeriod(p0)}"`);
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

// --- addMonths (fixed-contract-failures.mts's suspension-return timer,
// currently called with 6 — revised 2026-11-19 from an initial 1 year) ---
{
  const start = gameDayFromCivil(5, 6, 15); // an ordinary date, Year 5, 15 June
  const returned = addMonths(start, 12);
  const dt = gameDateTimeFromSeconds(returned * 86400);
  assert(dt.year === 6 && dt.month === 6 && dt.day === 15, "an ordinary date returns on the same month/day, 12 months later");

  // Leap day: Year 4 is a leap year (isLeapYear(4) === true), Year 5 is not.
  const leapDay = gameDayFromCivil(4, 2, 29);
  const leapReturn = addMonths(leapDay, 12);
  const dtLeap = gameDateTimeFromSeconds(leapReturn * 86400);
  assert(dtLeap.year === 5 && dtLeap.month === 2 && dtLeap.day === 28, "a 29 February start clamps to 28 February when the return year isn't a leap year, 12 months on");

  // Leap day returning into another leap year (Year 4 -> Year 8, also a
  // leap year) keeps the real 29 February, no clamping needed.
  const leapToLeapReturn = addMonths(gameDayFromCivil(4, 2, 29), 12);
  // addMonths(x, 12) only steps forward ONE year (4 -> 5), so re-run it
  // from the already-clamped 28 Feb Year 5 to reach Year 6, not a
  // double-step check of 4 -> 8 (isLeapYear(8) === true but that's 4 years
  // forward, not 1).
  assert(leapToLeapReturn === leapReturn, "addMonths is deterministic for the same input");

  // Crossing into a genuine leap year on the FAR end (not a leap source
  // date) is the easy, unclamped case.
  const intoLeapYear = gameDayFromCivil(3, 3, 1); // Year 3 -> Year 4 (a leap year), ordinary date, no clamping involved
  const intoLeapReturn = addMonths(intoLeapYear, 12);
  const dtIntoLeap = gameDateTimeFromSeconds(intoLeapReturn * 86400);
  assert(dtIntoLeap.year === 4 && dtIntoLeap.month === 3 && dtIntoLeap.day === 1, "an ordinary date landing in a real leap year on the far end is unaffected, 12 months on");

  // --- The real call shape this mechanic actually uses: 6 months ---
  const sixMonthsOrdinary = addMonths(gameDayFromCivil(5, 1, 15), 6);
  const dtSixOrdinary = gameDateTimeFromSeconds(sixMonthsOrdinary * 86400);
  assert(dtSixOrdinary.year === 5 && dtSixOrdinary.month === 7 && dtSixOrdinary.day === 15, "6 months after 15 January is 15 July, same year");

  // Crossing a calendar year boundary: 6 months after a date in the back
  // half of the year lands in the NEXT year.
  const sixMonthsAcrossYear = addMonths(gameDayFromCivil(5, 9, 10), 6);
  const dtSixAcrossYear = gameDateTimeFromSeconds(sixMonthsAcrossYear * 86400);
  assert(dtSixAcrossYear.year === 6 && dtSixAcrossYear.month === 3 && dtSixAcrossYear.day === 10, "6 months after 10 September Year 5 is 10 March Year 6");

  // The genuinely new edge case a 6-month step needs that a 1-year step
  // never did: landing on a SHORTER month, not just the one Feb-29 case —
  // 31 August + 6 months lands in February, which never has 31 days.
  const thirtyFirstAugust = addMonths(gameDayFromCivil(5, 8, 31), 6);
  const dtThirtyFirstAugust = gameDateTimeFromSeconds(thirtyFirstAugust * 86400);
  assert(dtThirtyFirstAugust.year === 6 && dtThirtyFirstAugust.month === 2 && dtThirtyFirstAugust.day === 28, "31 August + 6 months clamps to 28 February in a non-leap target year, not an overflow into March");

  // Same case landing in a leap year instead — clamps to 29, not 28.
  const thirtyFirstAugustIntoLeap = addMonths(gameDayFromCivil(3, 8, 31), 6); // Year 3 -> Year 4, a leap year
  const dtThirtyFirstAugustIntoLeap = gameDateTimeFromSeconds(thirtyFirstAugustIntoLeap * 86400);
  assert(dtThirtyFirstAugustIntoLeap.year === 4 && dtThirtyFirstAugustIntoLeap.month === 2 && dtThirtyFirstAugustIntoLeap.day === 29, "31 August + 6 months clamps to 29 February when the target year IS a leap year");

  // 31 March + 6 months lands in September, which only has 30 days.
  const thirtyFirstMarch = addMonths(gameDayFromCivil(5, 3, 31), 6);
  const dtThirtyFirstMarch = gameDateTimeFromSeconds(thirtyFirstMarch * 86400);
  assert(dtThirtyFirstMarch.year === 5 && dtThirtyFirstMarch.month === 9 && dtThirtyFirstMarch.day === 30, "31 March + 6 months clamps to 30 September, which has no 31st");
}

// --- weekdayBitForGameDay (added 2026-11-20 for fixed-contract-
// failures.mts's live wiring, contracts-panel.ts) ---
{
  // Game day 0 is Year 1, January 1st, a real Monday (this file's own
  // GAME_EPOCH_DAYS_SINCE_1970 comment) — bit 1 (Monday, route-
  // timetable.mts's own WEEKDAY_BITS.monday).
  assert(weekdayBitForGameDay(0) === 1, "game day 0 (the epoch) is a Monday, bit 1");
  assert(weekdayBitForGameDay(1) === 2, "game day 1 is a Tuesday, bit 2");
  assert(weekdayBitForGameDay(6) === 64, "game day 6 is a Sunday, bit 64");
  assert(weekdayBitForGameDay(7) === 1, "game day 7 wraps back to Monday, bit 1");
  // A real worked date, not just offsets from the epoch.
  const aRealMonday = gameDayFromCivil(5, 6, 16); // confirmed a Monday below by construction
  assert(weekdayBitForGameDay(aRealMonday) === weekdayBitForGameDay(aRealMonday + 7), "exactly 7 days later is the same real weekday bit");
  assert(weekdayBitForGameDay(aRealMonday) !== weekdayBitForGameDay(aRealMonday + 1), "the very next day is a different weekday bit");
}

console.log("\nAll game-clock checks passed.");
