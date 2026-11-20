// GreenRoad recurring billing (user request 2026-11-20, "It needs a per
// vehicle monthly cost as well... I think £350 install + your 10p per
// day"). Pure month math and charge-amount calculation only, no DOM/IPC
// dependency, same "keep fiddly date/time arithmetic testable on its own"
// pattern as vehicle-lease-billing.mts/private-hire-income.mts/game-
// clock.mts. The actual lazy charge-and-record trigger lives in fleet-
// list-panel.ts's own reload(), the same spot vehicle-lease-billing.mts's
// own trigger already lives — there is still no real periodic/monthly
// game-tick anywhere in this codebase to hang this off instead.
//
// Unlike every other recurring charge in this codebase (the lease's flat
// monthly figure, route advertising's flat £20/month), GreenRoad's amount
// for a given calendar month is NOT a flat figure: the user's own words
// were "10p per day," and this game has no daily billing tick to hang a
// literal daily charge off, so each elapsed calendar month is instead
// charged (real days in that month) x 10p — £2.80 in a 28-day February,
// £3.10 in a 31-day month. Confirmed directly with the user as the
// preferred reading over rounding to a flat £3/month.
import { elapsedMonthKeysSince, maxMonthKey, monthKeyFromGameDay, parseMonthKey } from "./private-hire-income.mts";
import { daysInMonth } from "./game-clock.mts";

export const GREENROAD_DAILY_CHARGE_GBP_PENCE = 10;

// Every calendar month that's fully elapsed since GreenRoad was fitted
// (always the vehicle's own boughtGameDay today — no retrofit-after-
// purchase path exists yet, flagged as a known gap) and hasn't already
// been billed, in ascending order — same "lastKnownMonthKey exclusive,
// falls back to the fitted month when nothing has been billed yet" shape
// as vehicle-lease-billing.mts's own chargeableMonthKeys, so a re-open of
// the Fleet screen never double-charges a month it already billed. No
// term cap here (unlike the 60-month lease term) — GreenRoad keeps
// billing for as long as the vehicle exists; deleteVehicle (db.mts) clears
// its billing-months rows the same way it already does for lease/private
// hire.
export function chargeableMonthKeys(fittedGameDay: number, nowGameDay: number, alreadyBilled: readonly string[]): string[] {
  const fittedMonthKey = monthKeyFromGameDay(fittedGameDay);
  const lastKnownMonthKey = maxMonthKey(alreadyBilled) ?? fittedMonthKey;
  return elapsedMonthKeysSince(lastKnownMonthKey, nowGameDay);
}

// (real days in that calendar month) x 10p — see this module's own header
// comment for why this isn't a flat per-month figure.
export function greenroadMonthChargeGBPPence(monthKey: string): number {
  const { year, month } = parseMonthKey(monthKey);
  return daysInMonth(year, month) * GREENROAD_DAILY_CHARGE_GBP_PENCE;
}
