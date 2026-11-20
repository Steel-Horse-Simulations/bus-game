// Manual verification script for greenroad-billing.mts, run directly with
// `node --experimental-strip-types src/renderer/greenroad-billing.verify.mts`
// — same pattern as the project's other .verify.mts files.
import { chargeableMonthKeys, greenroadMonthChargeGBPPence, GREENROAD_DAILY_CHARGE_GBP_PENCE } from "./greenroad-billing.mts";
import { gameDayFromCivil } from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

assert(GREENROAD_DAILY_CHARGE_GBP_PENCE === 10, "the real confirmed rate is 10p/day, the user's own words");

// --- chargeableMonthKeys — same shape as vehicle-lease-billing.mts's own,
// minus the 60-month term cap (GreenRoad keeps billing indefinitely) ---
const fitted = gameDayFromCivil(2026, 1, 15);
const freshChargeable = chargeableMonthKeys(fitted, gameDayFromCivil(2026, 4, 1), []);
assert(JSON.stringify(freshChargeable) === JSON.stringify(["2026-02", "2026-03"]), `a never-billed vehicle charges every fully-elapsed month since fitting (got ${JSON.stringify(freshChargeable)})`);

const partlyBilled = chargeableMonthKeys(fitted, gameDayFromCivil(2026, 4, 1), ["2026-02"]);
assert(JSON.stringify(partlyBilled) === JSON.stringify(["2026-03"]), "only months strictly after the last one already billed are returned");

const fullyBilled = chargeableMonthKeys(fitted, gameDayFromCivil(2026, 4, 1), ["2026-02", "2026-03"]);
assert(fullyBilled.length === 0, "a fully up-to-date vehicle has nothing left to charge");

// No term cap — unlike leases, a vehicle fitted for many years keeps
// generating real chargeable months indefinitely.
const manyYearsLater = chargeableMonthKeys(fitted, gameDayFromCivil(2036, 1, 1), []);
assert(manyYearsLater.length === 119, `10 years minus the fitted month itself = 119 fully-elapsed months, no cap applied (got ${manyYearsLater.length})`);

// --- greenroadMonthChargeGBPPence — real days in that month x 10p, not a
// flat figure (the user's own literal "10p per day", confirmed over
// rounding to a flat £3/month) ---
assert(greenroadMonthChargeGBPPence("2026-02") === 28 * 10, `Feb 2026 (not a leap year) should charge 28 x 10p = 280p, got ${greenroadMonthChargeGBPPence("2026-02")}`);
assert(greenroadMonthChargeGBPPence("2024-02") === 29 * 10, `Feb 2024 (a real leap year) should charge 29 x 10p = 290p, got ${greenroadMonthChargeGBPPence("2024-02")}`);
assert(greenroadMonthChargeGBPPence("2026-04") === 30 * 10, `April (30 days) should charge 300p, got ${greenroadMonthChargeGBPPence("2026-04")}`);
assert(greenroadMonthChargeGBPPence("2026-03") === 31 * 10, `March (31 days) should charge 310p, got ${greenroadMonthChargeGBPPence("2026-03")}`);
assert(
  greenroadMonthChargeGBPPence("2026-02") !== greenroadMonthChargeGBPPence("2026-03"),
  "two different months genuinely charge different amounts — this is not a flat per-month fee like every other recurring charge in this game",
);

console.log("All greenroad-billing checks passed.");
