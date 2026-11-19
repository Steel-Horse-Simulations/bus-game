// Manual verification script for vehicle-lease-billing.mts, run directly
// with `node --experimental-strip-types src/renderer/vehicle-lease-billing.verify.mts`
// — same pattern as the project's other .verify.mts files.
import { leaseMonthsElapsed, leaseMonthsRemaining, leaseMoneyRemainingGBP, chargeableMonthKeys, shouldFlipLeaseToOwnToOutright } from "./vehicle-lease-billing.mts";
import { LEASE_TERM_MONTHS, leaseMonthlyGBP, leaseToOwnMonthlyGBP } from "./vehicle-buy-pricing.mts";
import { gameDayFromCivil } from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- leaseMonthsElapsed ---
const bought = gameDayFromCivil(2026, 1, 15);
assert(leaseMonthsElapsed(bought, gameDayFromCivil(2026, 1, 20)) === 0, "nothing has elapsed yet within the purchase month itself");
assert(leaseMonthsElapsed(bought, gameDayFromCivil(2026, 2, 1)) === 0, "the purchase month is never counted, even once the calendar moves into the next month");
assert(leaseMonthsElapsed(bought, gameDayFromCivil(2026, 3, 1)) === 1, "exactly one full month (February) has elapsed once March arrives");
assert(leaseMonthsElapsed(bought, gameDayFromCivil(2031, 1, 15)) === 59, "59 full months elapsed exactly 5 years after purchase (the 60th month, Jan 2031, hasn't fully elapsed yet)");
assert(leaseMonthsElapsed(bought, gameDayFromCivil(2031, 2, 1)) === 60, "exactly 60 months elapsed once the 60th full month (January 2031) has passed");
assert(leaseMonthsElapsed(bought, gameDayFromCivil(2040, 1, 1)) === 60, `a lease many years past its own term still reports exactly ${LEASE_TERM_MONTHS}, never more`);

// --- leaseMonthsRemaining ---
assert(leaseMonthsRemaining(0) === 60, "0 months elapsed leaves the full 60-month term remaining");
assert(leaseMonthsRemaining(59) === 1, "59 elapsed leaves exactly 1 remaining");
assert(leaseMonthsRemaining(60) === 0, "60 elapsed (the full term) leaves exactly 0 remaining");
assert(leaseMonthsRemaining(61) === 0, "remaining never goes negative past the term");

// --- leaseMoneyRemainingGBP — real rates from vehicle-buy-pricing.mts ---
const price = 235_000;
assert(leaseMoneyRemainingGBP("buy_outright", price, 60) === 0, "buy_outright always owes nothing, regardless of monthsRemaining");
assert(leaseMoneyRemainingGBP("lease", price, 0) === 0, "0 months remaining owes nothing, even for a real lease");
assert(leaseMoneyRemainingGBP("lease", price, 60) === 60 * leaseMonthlyGBP(price), "a fresh lease owes exactly 60 months at the real 1.4% monthly rate");
assert(leaseMoneyRemainingGBP("lease", price, 10) === 10 * leaseMonthlyGBP(price), "a part-elapsed lease owes exactly its own remaining months at the same rate");
assert(leaseMoneyRemainingGBP("lease_to_own", price, 60) === 60 * leaseToOwnMonthlyGBP(price), "a fresh lease-to-own owes exactly 60 months at the real 1.83% monthly rate");
assert(leaseMoneyRemainingGBP("lease_to_own", price, 60) > leaseMoneyRemainingGBP("lease", price, 60), "lease-to-own's own higher rate owes strictly more than a plain lease over the same remaining term");

// --- chargeableMonthKeys ---
const freshLeaseChargeable = chargeableMonthKeys(bought, gameDayFromCivil(2026, 4, 1), []);
assert(JSON.stringify(freshLeaseChargeable) === JSON.stringify(["2026-02", "2026-03"]), `a never-billed lease charges every fully-elapsed month since purchase (got ${JSON.stringify(freshLeaseChargeable)})`);

const partlyBilled = chargeableMonthKeys(bought, gameDayFromCivil(2026, 4, 1), ["2026-02"]);
assert(JSON.stringify(partlyBilled) === JSON.stringify(["2026-03"]), "a partly-billed lease only charges the months strictly after the last one already billed");
assert(!partlyBilled.includes("2026-02"), "an already-billed month is never re-returned");

const fullyBilled = chargeableMonthKeys(bought, gameDayFromCivil(2026, 4, 1), ["2026-02", "2026-03"]);
assert(fullyBilled.length === 0, "a fully up-to-date lease has nothing left to charge");

// Cap at the 60-month term even when reopened long after it should have
// ended, regardless of how many fully-elapsed calendar months exist.
// Purchase was Jan 2026 (month 1) — walk forward monthsAfter whole
// months from there to build a synthetic "already billed" list.
function monthKeyAt(monthsAfter: number): string {
  let year = 2026;
  let month = 1 + monthsAfter;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}
const nearEndBilled = Array.from({ length: 59 }, (_, i) => monthKeyAt(i + 1));
const cappedChargeable = chargeableMonthKeys(bought, gameDayFromCivil(2040, 1, 1), nearEndBilled);
assert(cappedChargeable.length === 1, `with 59 months already billed, only 1 more is ever chargeable no matter how far in the future 'now' is (got ${cappedChargeable.length})`);

const overTermBilled = Array.from({ length: 60 }, (_, i) => monthKeyAt(i + 1));
const noneLeftChargeable = chargeableMonthKeys(bought, gameDayFromCivil(2050, 1, 1), overTermBilled);
assert(noneLeftChargeable.length === 0, "once all 60 months are billed, nothing further is ever chargeable, regardless of how far 'now' advances");

// --- shouldFlipLeaseToOwnToOutright ---
assert(shouldFlipLeaseToOwnToOutright("lease_to_own", 60) === true, "a lease-to-own vehicle flips exactly once its term is fully elapsed");
assert(shouldFlipLeaseToOwnToOutright("lease_to_own", 59) === false, "a lease-to-own vehicle does not flip one month before term completion");
// leaseMonthsElapsed itself never returns more than LEASE_TERM_MONTHS, but
// shouldFlipLeaseToOwnToOutright's own check is >= rather than ===, so a
// value past the term (defensively) still correctly counts as complete.
assert(shouldFlipLeaseToOwnToOutright("lease_to_own", 61) === true, "a monthsElapsed value past the term still correctly flips (>=, not ===)");
assert(shouldFlipLeaseToOwnToOutright("lease", 60) === false, "a plain lease never auto-flips — it has no buy-out flow built yet, billing just stops");
assert(shouldFlipLeaseToOwnToOutright("buy_outright", 60) === false, "an already-outright vehicle never flips (nothing to flip)");

console.log("All vehicle-lease-billing checks passed.");
