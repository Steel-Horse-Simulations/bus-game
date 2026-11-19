// The game calendar (DESIGN.md §3), pure logic only — no DOM/WASM
// dependency, matching the project's established pattern (route-timetable.mts,
// fare-pricing.mts) of keeping fiddly date/time arithmetic testable on its
// own. Confirmed 2026-11-01: no game clock existed at all before this —
// vehicle-simulation.ts just read Date.now() directly, with no pause and
// no speed control.
//
// "At normal speed one real second is ten game seconds" is the 1x base
// rate; the 5 speeds (1x/4x/10x/20x/60x) are multiples of it, not
// standalone rates — confirmed by DESIGN.md's own worked example ("At 60x
// a day passes in about 2.4 real minutes"): 86400 game-seconds / (10*60
// game-seconds-per-real-second) = 144 real seconds = 2.4 real minutes,
// exactly.
export const GAME_SECONDS_PER_REAL_SECOND_AT_1X = 10;
export const SPEED_MULTIPLIERS = [1, 4, 10, 20, 60] as const;
export type SpeedMultiplier = (typeof SPEED_MULTIPLIERS)[number];

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const DAYS_PER_WEEK = 7;

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// --- The game's own calendar: a normal, real one (DESIGN.md §3, confirmed
// 2026-11-06) --------------------------------------------------------------
//
// Replaces an earlier 28-day-month/13-month/364-day calendar, which is NOT
// gone — it's now the company's own separate financial/period calendar
// below, since calendar-pinned real dates (festive days, term dates,
// seasons) need the game's own date to actually be a real date (Christmas
// Day = 25 December every year, not a made-up "month 13, day 7").
//
// Real month lengths and real leap years, computed with the standard
// "days since epoch <-> civil calendar" conversion (Howard Hinnant's
// public-domain algorithm, http://howardhinnant.github.io/date_algorithms.html)
// rather than a hand-rolled loop — it's O(1), well-tested elsewhere, and
// correct for leap years without special-casing them here.
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

// Days since the REAL (proleptic Gregorian) epoch 0000-03-01, for an
// arbitrary (possibly negative) year/month(1-12)/day.
function daysFromCivil(y: number, m: number, d: number): number {
  const yAdj = y - (m <= 2 ? 1 : 0);
  const era = floorDiv(yAdj >= 0 ? yAdj : yAdj - 399, 400);
  const yoe = yAdj - era * 400; // [0, 399]
  const mp = m + (m > 2 ? -3 : 9); // [0, 11]
  const doy = floorDiv(153 * mp + 2, 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zShifted = z + 719468;
  const era = floorDiv(zShifted >= 0 ? zShifted : zShifted - 146096, 146097);
  const doe = zShifted - era * 146097; // [0, 146096]
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100)); // [0, 365]
  const mp = floorDiv(5 * doy + 2, 153); // [0, 11]
  const d = doy - floorDiv(153 * mp + 2, 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

// Game day 0 (second 0) is Year 1, January 1st — the proleptic Gregorian
// year 1, chosen as a clean, natural starting point (not tied to any real
// historical year). A pleasant side effect, not relied on: 0001-01-01 in
// this calendar is a Monday, which already matches the weekday epoch below.
const GAME_EPOCH_DAYS_SINCE_1970 = daysFromCivil(1, 1, 1);

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export interface GameDateTime {
  year: number; // 1-based, real year number
  month: number; // 1-12
  day: number; // 1-31, real days-in-month
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: number; // 0 = Monday .. 6 = Sunday
  weekNumber: number; // 0-based count of weeks since the epoch
  dayOfYear: number; // 1-365 (366 in a leap year)
}

// Epoch: year 1, month 1, day 1, 00:00:00 is game-second 0 — defined as a
// Monday in week 0 (even), so "every Thursday" (wages) and "the Monday of
// every even-numbered week" (operational changes) both read directly off
// weekday/weekNumber below with no separate anchor needed. The weekday/week
// cycle is a flat 7-day count from day 0 and is completely independent of
// month/year length, so it's unaffected by the real-calendar switch above.
export function gameDateTimeFromSeconds(totalGameSeconds: number): GameDateTime {
  const totalWholeSeconds = Math.floor(totalGameSeconds);
  const totalDays = Math.floor(totalWholeSeconds / SECONDS_PER_DAY);
  const secondsIntoDay = totalWholeSeconds - totalDays * SECONDS_PER_DAY;

  const { y: year, m: month, d: day } = civilFromDays(totalDays + GAME_EPOCH_DAYS_SINCE_1970);
  const dayOfYear = totalDays + GAME_EPOCH_DAYS_SINCE_1970 - daysFromCivil(year, 1, 1) + 1;

  const weekday = ((totalDays % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const weekNumber = Math.floor(totalDays / DAYS_PER_WEEK);

  const hour = Math.floor(secondsIntoDay / SECONDS_PER_HOUR);
  const minute = Math.floor((secondsIntoDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const second = secondsIntoDay % SECONDS_PER_MINUTE;

  return { year, month, day, hour, minute, second, weekday, weekNumber, dayOfYear };
}

// Inverse of gameDateTimeFromSeconds' own year/month/day half — turns a
// real calendar date back into a whole gameDay index (the same day-count-
// since-epoch convention boughtGameDay/repaint_bookings.game_day/
// finance_transactions.game_day all already use). Added for T183 (private
// hire revival, Q20/OPEN-ITEMS.md): private-hire-income.mts needs to turn
// a randomly-picked day within a given calendar month back into a real
// gameDay for its finance transactions, and civilFromDays/daysFromCivil
// above were private to this file.
export function gameDayFromCivil(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) - GAME_EPOCH_DAYS_SINCE_1970;
}

const DAYS_IN_MONTH_NON_LEAP = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH_NON_LEAP[month - 1];
}

// Exactly N calendar months later, clamped to the nearest valid real date if
// the original day doesn't exist in the target month (e.g. 31 August + 6
// months -> 28/29 February, not an overflow into March) — same "nearest
// valid real date" behaviour most real calendar software uses for this edge
// case, not independently sourced. Originally built as addOneYear (a
// simpler year+1 version only ever needing the single Feb-29 edge case) for
// the Fixed-real-contract suspension mechanic's own "suspended for exactly
// 1 year" rule; generalised 2026-11-19 when the user revised that to 6
// months instead ("I think 6 months to get a route back might be better"),
// since a 6-month step needs the full day-in-month clamp (any month can
// land on a shorter one), not just the one leap-year case. Deliberately NOT
// a flat day-count approximation ("+365 days"/"+182 days") — that would
// drift against the real calendar, and the user's own wording ("1 year,"
// now "6 months") is a real calendar duration.
export function addMonths(gameDay: number, months: number): number {
  const { y, m, d } = civilFromDays(gameDay + GAME_EPOCH_DAYS_SINCE_1970);
  const totalMonths = y * 12 + (m - 1) + months;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  const clampedDay = Math.min(d, daysInMonth(nextYear, nextMonth));
  return daysFromCivil(nextYear, nextMonth, clampedDay) - GAME_EPOCH_DAYS_SINCE_1970;
}

// "Wages are paid every Thursday (weekly)" — weekday 3 (0=Monday).
export function isWageDay(dt: GameDateTime): boolean {
  return dt.weekday === 3;
}

// "Operational changes take effect on the Monday of every even-numbered
// week" — weekday 0, weekNumber even.
export function isOperationalChangeDay(dt: GameDateTime): boolean {
  return dt.weekday === 0 && dt.weekNumber % 2 === 0;
}

export function formatGameDate(dt: GameDateTime): string {
  return `${WEEKDAY_NAMES[dt.weekday]} ${dt.day} ${MONTH_NAMES[dt.month - 1]} Year ${dt.year}`;
}

export function formatGameTime(dt: GameDateTime): string {
  const hh = String(dt.hour).padStart(2, "0");
  const mm = String(dt.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

// --- The company's own financial/operational calendar (DESIGN.md §3,
// confirmed 2026-11-06) -----------------------------------------------------
//
// This is the calendar the game used to use for EVERYTHING, kept exactly
// as it was mathematically (28-day periods, 13 per company year, 364 days
// a company year) but now explicitly scoped to the company's own
// wages/maintenance/rent/contract-review timing only — real companies run
// a calendar like this alongside, not instead of, the real one. It floats
// freely against the real calendar rather than realigning each year
// (confirmed, not a bug): company year 2's period 1 starts the day right
// after company year 1's period 13 ends, so it slowly drifts relative to
// the real 365/366-day year over time.
export const DAYS_PER_PERIOD = 28;
export const PERIODS_PER_COMPANY_YEAR = 13;
export const DAYS_PER_COMPANY_YEAR = DAYS_PER_PERIOD * PERIODS_PER_COMPANY_YEAR; // 364

export interface CompanyPeriodDate {
  companyYear: number; // 1-based, floats freely against the real calendar
  period: number; // 1-13
  dayOfPeriod: number; // 1-28
  dayOfCompanyYear: number; // 1-364
}

export function companyPeriodFromDays(totalDays: number): CompanyPeriodDate {
  const companyYear = Math.floor(totalDays / DAYS_PER_COMPANY_YEAR) + 1;
  const dayOfCompanyYear = (totalDays % DAYS_PER_COMPANY_YEAR) + 1; // 1-364
  const period = Math.floor((dayOfCompanyYear - 1) / DAYS_PER_PERIOD) + 1;
  const dayOfPeriod = ((dayOfCompanyYear - 1) % DAYS_PER_PERIOD) + 1;
  return { companyYear, period, dayOfPeriod, dayOfCompanyYear };
}

export function companyPeriodFromSeconds(totalGameSeconds: number): CompanyPeriodDate {
  const totalDays = Math.floor(Math.floor(totalGameSeconds) / SECONDS_PER_DAY);
  return companyPeriodFromDays(totalDays);
}

export function formatCompanyPeriod(cp: CompanyPeriodDate): string {
  return `Period ${cp.period}, Day ${cp.dayOfPeriod}, Company Year ${cp.companyYear}`;
}

// How much game time a real elapsed duration adds at a given speed —
// the one formula both the live clock engine and its own tests build on.
export function gameSecondsForRealMs(realMs: number, speedMultiplier: SpeedMultiplier): number {
  return (realMs / 1000) * GAME_SECONDS_PER_REAL_SECOND_AT_1X * speedMultiplier;
}
