// Manual verification script, run with
// `node --experimental-strip-types src/renderer/stop-route-locks.verify.mts`
import {
  AIRPORT_STOP_PURCHASE_PRICE_GBP_PENCE,
  lockForStop,
  isStopLocked,
  canRouteUseStop,
  findRouteTerminusStopOsmId,
  type StopRouteLock,
} from "./stop-route-locks.mts";
import { ROUTE_398_SEED, AIRLINK_100_SEED, EXPRESS_500_SEED, AIR_PARENT_SEED } from "./fixed-contract-route-seed-data.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Real settled figure ---
assert(AIRPORT_STOP_PURCHASE_PRICE_GBP_PENCE === 1_500_000, "flat placeholder airport-stop price is £15,000 (1,500,000p)");

// --- Terminus lookup against the real extracted fixed-contract seed data
// (not synthetic fixtures) — this is the exact real content the contract-
// stop-bundling feature locks/advertises against, so testing against it
// directly is the real "no shortcuts" check, not a stand-in for it.

// 398: terminusIndex/startIndex both null in the real seed (a loop route —
// point 0 and the last point are the same real stop, osmId 441274332,
// "Central Station Forecourt (the combined start/terminus)" per
// DESIGN.md). Falls back to point 0.
assert(ROUTE_398_SEED.terminusIndex === null && ROUTE_398_SEED.startIndex === null, "398's real seed genuinely has no terminusIndex/startIndex — confirms the loop-route fallback case actually occurs, not just in theory");
assert(
  findRouteTerminusStopOsmId(ROUTE_398_SEED) === 441274332,
  `398's terminus must fall back to point 0 (Central Station Forecourt), got ${findRouteTerminusStopOsmId(ROUTE_398_SEED)}`,
);

// Airlink 100: terminusIndex 12, a real distinct OSM stop.
assert(
  findRouteTerminusStopOsmId(AIRLINK_100_SEED) === 502534133,
  `Airlink 100's real terminusIndex (12) must resolve to osmId 502534133, got ${findRouteTerminusStopOsmId(AIRLINK_100_SEED)}`,
);

// Express 500: terminusIndex 7 (Glasgow Airport's own real stop, lon
// -4.4305 — far west of the rest of the route's Glasgow-centre points).
assert(
  findRouteTerminusStopOsmId(EXPRESS_500_SEED) === 6318116240,
  `Express 500's real terminusIndex (7) must resolve to osmId 6318116240, got ${findRouteTerminusStopOsmId(EXPRESS_500_SEED)}`,
);

// AIR: terminusIndex 9 (Buchanan Bus Station's own real stop).
assert(
  findRouteTerminusStopOsmId(AIR_PARENT_SEED) === 5869396707,
  `AIR's real terminusIndex (9) must resolve to osmId 5869396707, got ${findRouteTerminusStopOsmId(AIR_PARENT_SEED)}`,
);

// A route whose terminusIndex points at a waypoint, not a stop, has no
// real terminus STOP to lock — must return null, never a wrong osmId.
assert(
  findRouteTerminusStopOsmId({ points: [{ kind: "waypoint" }], terminusIndex: 0, startIndex: null }) === null,
  "a terminus index landing on a waypoint (no real osmId) returns null, not a wrong answer",
);
assert(
  findRouteTerminusStopOsmId({ points: [], terminusIndex: null, startIndex: null }) === null,
  "an empty points array (degenerate, shouldn't happen) returns null rather than throwing",
);

// --- Lock/exclusivity primitive ---
const locks: StopRouteLock[] = [
  { stopOsmId: 100, lockedRouteId: 5, source: "contract", contractKey: "398", purchasePriceGbpPence: null, lockedGameDay: 10 },
  { stopOsmId: 200, lockedRouteId: 9, source: "purchased", contractKey: null, purchasePriceGbpPence: AIRPORT_STOP_PURCHASE_PRICE_GBP_PENCE, lockedGameDay: 20 },
];

assert(isStopLocked(locks, 100), "a locked stop reads as locked");
assert(!isStopLocked(locks, 999), "an unlocked stop reads as unlocked");
assert(lockForStop(locks, 200)?.lockedRouteId === 9, "lockForStop returns the real matching row");
assert(lockForStop(locks, 999) === null, "lockForStop returns null for an unlocked stop");

assert(canRouteUseStop(locks, 999, 1), "any route can use a stop with no lock at all");
assert(canRouteUseStop(locks, 100, 5), "the route the stop is actually locked TO can still use it (e.g. re-saving its own timetable)");
assert(!canRouteUseStop(locks, 100, 7), "a DIFFERENT route can never use a stop locked to another route — the real exclusivity rule");
assert(!canRouteUseStop(locks, 200, 1), "exclusivity applies to a purchased lock exactly the same as a contract lock");

console.log("\nAll stop-route-locks checks passed.");
