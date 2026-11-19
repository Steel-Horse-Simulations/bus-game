// Real monthly lease billing (T185 — follow-up to T184's new "My fleet"
// screen, approved plan `can-you-do-the-flickering-hopper.md`, confirmed
// 2026-11-14). Pure month math and billing-amount calculation only, no
// DOM/IPC dependency, same "keep fiddly date/time arithmetic testable on
// its own" pattern as private-hire-income.mts/game-clock.mts/fare-
// pricing.mts/route-timetable.mts. The actual lazy charge-and-record
// trigger lives in fleet-list-panel.ts's own reload(), which calls this
// module every time the Fleet screen opens (the same "re-checked fresh
// every time this exact screen opens, since the game clock keeps
// advancing while it's closed" pattern T183's private hire income and
// T179's re-power bookings already use — there is still no real
// periodic/monthly game-tick anywhere in this codebase to hang this off
// instead).
//
// The real gap this exists to fix: a vehicle bought on "lease" or
// "lease_to_own" (OPERATIONS.md §3 "Buying") costs nothing, ever, after
// the initial purchase — paymentMethod was tracked on the order but
// silently dropped the moment it became a real owned vehicle (see
// db.mts's own vehicles table SCHEMA comment), and there was no
// recurring billing mechanism anywhere to hang real monthly payments off
// even if it had been. This module is that mechanism's pure half.
import { elapsedMonthKeysSince, maxMonthKey, monthKeyFromGameDay } from "./private-hire-income.mts";
import { LEASE_TERM_MONTHS, leaseMonthlyGBP, leaseToOwnMonthlyGBP, type PaymentMethod } from "./vehicle-buy-pricing.mts";

// How many whole calendar months have fully elapsed since this vehicle's
// own purchase month — purchase month itself is never counted (a vehicle
// bought partway through a month hasn't completed a lease month yet, the
// same reasoning private-hire-income.mts's own elapsedMonthKeysSince
// already encodes for its own "re-checked fresh" generation), capped at
// the 60-month lease term so a long-forgotten lease never reports more
// months elapsed than the term actually has.
export function leaseMonthsElapsed(boughtGameDay: number, nowGameDay: number): number {
  const purchaseMonthKey = monthKeyFromGameDay(boughtGameDay);
  const elapsed = elapsedMonthKeysSince(purchaseMonthKey, nowGameDay).length;
  return Math.min(elapsed, LEASE_TERM_MONTHS);
}

// The real 60-month term's own remaining balance, floored at 0 — never
// negative once the term is fully elapsed.
export function leaseMonthsRemaining(monthsElapsed: number): number {
  return Math.max(0, LEASE_TERM_MONTHS - monthsElapsed);
}

// The real money still owed over the remaining term, at OPERATIONS.md
// §3's own confirmed rate for the payment method actually in force
// (vehicle-buy-pricing.mts's leaseMonthlyGBP/leaseToOwnMonthlyGBP — the
// same rates the buy-time display already uses, never recomputed here).
// Always 0 for buy_outright (nothing is ever owed) or once the term has
// fully elapsed.
export function leaseMoneyRemainingGBP(paymentMethod: PaymentMethod, outrightPriceGBP: number, monthsRemaining: number): number {
  if (paymentMethod === "buy_outright" || monthsRemaining <= 0) return 0;
  const monthlyGBP = paymentMethod === "lease_to_own" ? leaseToOwnMonthlyGBP(outrightPriceGBP) : leaseMonthlyGBP(outrightPriceGBP);
  return monthsRemaining * monthlyGBP;
}

// Every calendar month that's fully elapsed since purchase and hasn't
// already been charged, in ascending order — the same "lastKnownMonthKey
// exclusive, falls back to the purchase month when nothing has been
// billed yet" shape as depot-groups-panel.ts's own private-hire-income
// trigger, so a re-open of the Fleet screen never double-charges a month
// it already billed. Additionally capped so the total ever billed never
// exceeds the 60-month term, even if the screen is reopened long after
// the lease would otherwise have ended.
export function chargeableMonthKeys(boughtGameDay: number, nowGameDay: number, alreadyBilled: readonly string[]): string[] {
  const purchaseMonthKey = monthKeyFromGameDay(boughtGameDay);
  const lastKnownMonthKey = maxMonthKey(alreadyBilled) ?? purchaseMonthKey;
  const candidates = elapsedMonthKeysSince(lastKnownMonthKey, nowGameDay);
  const remainingAllowed = Math.max(0, LEASE_TERM_MONTHS - alreadyBilled.length);
  return candidates.slice(0, remainingAllowed);
}

// Whether a lease-to-own vehicle has reached the end of its real 60-month
// term and should flip to buy_outright (OPERATIONS.md §3 "then
// ownership"). A plain lease never flips — it has no buy-out-the-
// remaining-credit flow built yet (flagged, deferred, same treatment as
// the grey spare-livery mechanic), so billing simply stops at 60 months
// for that payment method, informationally surfaced as "Lease term
// ended" rather than auto-converting anything.
export function shouldFlipLeaseToOwnToOutright(paymentMethod: PaymentMethod, monthsElapsed: number): boolean {
  return paymentMethod === "lease_to_own" && monthsElapsed >= LEASE_TERM_MONTHS;
}
