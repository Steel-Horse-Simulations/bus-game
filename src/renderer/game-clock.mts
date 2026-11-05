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

// "The calendar uses 28-day months of exactly four weeks... A year is
// thirteen months. Anything annual... is defined as 364 days rather than
// twelve months" — 28*13 = 364 exactly, so DAYS_PER_YEAR falls out of the
// other two rather than being its own independent figure.
export const DAYS_PER_MONTH = 28;
export const MONTHS_PER_YEAR = 13;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface GameDateTime {
  year: number; // 1-based
  month: number; // 1-13
  day: number; // 1-28
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: number; // 0 = Monday .. 6 = Sunday
  weekNumber: number; // 0-based count of weeks since the epoch
  dayOfYear: number; // 1-364
}

// Epoch: year 1, month 1, day 1, 00:00:00 is game-second 0 — defined as a
// Monday in week 0 (even), so "every Thursday" (wages) and "the Monday of
// every even-numbered week" (operational changes) both read directly off
// weekday/weekNumber below with no separate anchor needed.
export function gameDateTimeFromSeconds(totalGameSeconds: number): GameDateTime {
  const totalWholeSeconds = Math.floor(totalGameSeconds);
  const totalDays = Math.floor(totalWholeSeconds / SECONDS_PER_DAY);
  const secondsIntoDay = totalWholeSeconds - totalDays * SECONDS_PER_DAY;

  const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1;
  const dayOfYear = (totalDays % DAYS_PER_YEAR) + 1;
  const month = Math.floor((dayOfYear - 1) / DAYS_PER_MONTH) + 1;
  const day = ((dayOfYear - 1) % DAYS_PER_MONTH) + 1;

  const weekday = totalDays % DAYS_PER_WEEK;
  const weekNumber = Math.floor(totalDays / DAYS_PER_WEEK);

  const hour = Math.floor(secondsIntoDay / SECONDS_PER_HOUR);
  const minute = Math.floor((secondsIntoDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const second = secondsIntoDay % SECONDS_PER_MINUTE;

  return { year, month, day, hour, minute, second, weekday, weekNumber, dayOfYear };
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
  return `${WEEKDAY_NAMES[dt.weekday]} ${dt.day} Month ${dt.month}, Year ${dt.year}`;
}

export function formatGameTime(dt: GameDateTime): string {
  const hh = String(dt.hour).padStart(2, "0");
  const mm = String(dt.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

// How much game time a real elapsed duration adds at a given speed —
// the one formula both the live clock engine and its own tests build on.
export function gameSecondsForRealMs(realMs: number, speedMultiplier: SpeedMultiplier): number {
  return (realMs / 1000) * GAME_SECONDS_PER_REAL_SECOND_AT_1X * speedMultiplier;
}
