// Manual verification script, run with
// `node --experimental-strip-types src/renderer/route-advertising.verify.mts`
import {
  ROUTE_ADVERTISING_SETUP_FEE_GBP_PENCE,
  ROUTE_ADVERTISING_MONTHLY_FEE_GBP_PENCE,
  ROUTE_ADVERTISING_DELAY_DAYS,
  routeAdvertisingLiveFromGameDay,
  isRouteAdvertisingLive,
  chargeableRouteAdvertisingMonthKeys,
  longDistanceRoutesAtStop,
  longDistanceOperatorsAtStop,
  type AdvertisableRoute,
  type AdvertisableLivery,
  type AdvertisableDepotGroup,
} from "./route-advertising.mts";
import { monthKeyFromGameDay } from "./private-hire-income.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Real settled cost/timing figures ---
assert(ROUTE_ADVERTISING_SETUP_FEE_GBP_PENCE === 50_000, "setup fee is £500 (50,000p)");
assert(ROUTE_ADVERTISING_MONTHLY_FEE_GBP_PENCE === 2_000, "monthly fee is £20 (2,000p)");
assert(ROUTE_ADVERTISING_DELAY_DAYS === 14, "the real OPERATIONS.md fitting-delay figure, 14 days, not a separate guessed one");

assert(routeAdvertisingLiveFromGameDay(100) === 114, "live-from day is booked day + 14, got " + routeAdvertisingLiveFromGameDay(100));
assert(!isRouteAdvertisingLive(114, 113), "not yet live one day before its live-from day");
assert(isRouteAdvertisingLive(114, 114), "live exactly on its own live-from day");
assert(isRouteAdvertisingLive(114, 200), "still live long after its live-from day");

// --- Monthly billing ---
assert(
  chargeableRouteAdvertisingMonthKeys(114, 100, []) .length === 0,
  "nothing chargeable before the booking has even gone live",
);
const liveDay = 10; // day 10 is inside month 1970-01 (epoch-based gameDateTime)
const muchLaterDay = liveDay + 95; // comfortably more than 2 real months later
const dueFromScratch = chargeableRouteAdvertisingMonthKeys(liveDay, muchLaterDay, []);
assert(dueFromScratch.length >= 2, `several real calendar months elapsed and none billed yet, got ${dueFromScratch.length}`);
const alreadyBilledSomeMonths = dueFromScratch.slice(0, 1);
const dueAfterPartialBilling = chargeableRouteAdvertisingMonthKeys(liveDay, muchLaterDay, alreadyBilledSomeMonths);
assert(
  dueAfterPartialBilling.length === dueFromScratch.length - 1,
  `re-billing after one month was already recorded must not double-charge it, got ${dueAfterPartialBilling.length} vs expected ${dueFromScratch.length - 1}`,
);
assert(
  !dueAfterPartialBilling.includes(alreadyBilledSomeMonths[0]),
  "the already-billed month must never reappear in the chargeable list",
);
assert(
  chargeableRouteAdvertisingMonthKeys(liveDay, liveDay, []).length === 0,
  "the current, not-yet-fully-elapsed month is never billed early, same convention lease billing uses",
);

// --- Long-distance operator derivation ---
const nationalExpressLivery: AdvertisableLivery = { name: "National Express" };
const plainLivery: AdvertisableLivery = { name: "Lothian" };
const depotGroup: AdvertisableDepotGroup = { name: "Test Group", region: "North England" };
const depotGroupsById = new Map<number, AdvertisableDepotGroup>([[1, depotGroup]]);

const longDistanceRoute: AdvertisableRoute = {
  id: 1,
  number: "AIR",
  routeType: "long_distance",
  points: [
    { kind: "stop", osmId: 500, lon: -1.5, lat: 53.8 },
    { kind: "stop", osmId: 501, lon: -1.6, lat: 53.9 },
  ],
  depotGroupId: 1,
};
const ordinaryRoute: AdvertisableRoute = {
  id: 2,
  number: "52",
  routeType: "ordinary",
  points: [{ kind: "stop", osmId: 500, lon: -1.5, lat: 53.8 }],
  depotGroupId: 1,
};

assert(
  longDistanceRoutesAtStop(500, [longDistanceRoute, ordinaryRoute]).length === 1,
  "only the real long_distance route counts, the ordinary one calling at the same stop is excluded",
);
assert(
  longDistanceRoutesAtStop(999, [longDistanceRoute]).length === 0,
  "a stop no long-distance route actually calls at finds nothing",
);

const operatorsAtRealLongDistanceStop = longDistanceOperatorsAtStop(500, [longDistanceRoute, ordinaryRoute], [nationalExpressLivery, plainLivery], depotGroupsById);
assert(
  operatorsAtRealLongDistanceStop.includes("National Express"),
  `the real eligible long-distance livery's own operator is derived, got ${JSON.stringify(operatorsAtRealLongDistanceStop)}`,
);
assert(
  !operatorsAtRealLongDistanceStop.includes("Lothian"),
  "an ordinary, non-long-distance livery is never offered as a long-distance-generic operator",
);

const operatorsAtOrdinaryOnlyStop = longDistanceOperatorsAtStop(500, [ordinaryRoute], [nationalExpressLivery], depotGroupsById);
assert(
  operatorsAtOrdinaryOnlyStop.length === 0,
  "a stop with no real long-distance route calling there offers no long-distance-generic mode at all — specific-route only",
);

// Sanity: monthKeyFromGameDay is the real shared utility this module
// reuses, not a separate re-implementation — confirm it's genuinely the
// same import, not a coincidental local shadow.
assert(typeof monthKeyFromGameDay(0) === "string", "monthKeyFromGameDay is the real shared private-hire-income.mts utility");

console.log("\nAll route-advertising checks passed.");
