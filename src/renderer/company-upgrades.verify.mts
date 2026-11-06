// Manual verification for company-upgrades.mts (TICKETING.md §4), run
// directly with `node --experimental-strip-types src/renderer/company-upgrades.verify.mts`.
import { UPGRADABLE_TICKET_APP_PRICE_GBP, MOBILE_APP_LIVE_DATA_PRICE_GBP, UPGRADED_AVL_DATA_PRICE_GBP } from "./company-upgrades.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

assert(UPGRADABLE_TICKET_APP_PRICE_GBP === 20_000, "the upgradable ticket app is the real £20,000 figure");
assert(MOBILE_APP_LIVE_DATA_PRICE_GBP === 12_000, "mobile app live bus data is the real £12,000 figure");
assert(UPGRADED_AVL_DATA_PRICE_GBP === 60_000, "upgraded AVL data is the real £60,000 figure");

console.log("\nAll company-upgrades checks passed.");
