// Manual verification for passenger-simulation.mts, run directly with
// `node --experimental-strip-types src/renderer/passenger-simulation.verify.mts`
// — same pattern as this project's other .verify.mts files.
import {
  timeOfDayDemandMultiplier,
  pickWeighted,
  pickTripOriginDestination,
  evaluateTripOutcome,
  tallyByTier,
  filterPointsNearStops,
  assignPointsToStopComponents,
  pickDemandPointSet,
  LOCAL_DEMAND_RADIUS_M,
  LONG_DISTANCE_ATTEMPT_PROBABILITY,
  ACCESS_EGRESS_TOLERANCE_M,
  type TaggedTrip,
  type JourneyPlanResult,
  type StopLocation,
} from "./passenger-simulation.mts";
import { computeStopComponents, type ConnectivityRoute } from "./stop-connectivity.mts";
import type { DemandPoint } from "./landuse-demand.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- timeOfDayDemandMultiplier ---

{
  const morningPeak = timeOfDayDemandMultiplier(8 * 3600);
  const eveningPeak = timeOfDayDemandMultiplier(17 * 3600);
  const overnight = timeOfDayDemandMultiplier(3 * 3600);
  assert(morningPeak > overnight, `morning peak (${morningPeak}) should exceed the overnight trough (${overnight})`);
  assert(eveningPeak > overnight, `evening peak (${eveningPeak}) should exceed the overnight trough (${overnight})`);
  assert(overnight > 0, `demand should never hit exactly zero overnight, got ${overnight}`);
  assert(morningPeak <= 1.0 && eveningPeak <= 1.0, "the multiplier should stay clamped to a sane [0,1] range");
  // Wraps correctly across midnight (23:30 is close to 00:30, not far apart).
  const lateNight = timeOfDayDemandMultiplier(23.5 * 3600);
  const justAfterMidnight = timeOfDayDemandMultiplier(0.5 * 3600);
  assert(Math.abs(lateNight - justAfterMidnight) < 0.01, `times either side of midnight should be nearly identical, got ${lateNight} vs ${justAfterMidnight}`);
}

// --- pickWeighted ---

{
  const items = ["a", "b", "c"];
  const weights: Record<string, number> = { a: 1, b: 0, c: 1 };
  assert(pickWeighted(items, (i) => weights[i], 0.0) === "a", "rand=0 should land on the very first weighted item");
  assert(pickWeighted(items, (i) => weights[i], 0.99) === "c", "rand near 1 should land on the last weighted item, skipping the zero-weight one");
  assert(pickWeighted([], (i: string) => 1, 0.5) === null, "an empty item list returns null");
  assert(pickWeighted(["x"], () => 0, 0.5) === null, "every item weighing 0 returns null rather than picking one anyway");
}

// --- pickTripOriginDestination ---

function demandPoint(category: DemandPoint["category"], lon: number, lat: number): DemandPoint {
  return { category, lon, lat, name: null, kind: "zone", osmId: lon * 1000 + lat };
}

{
  const housing = demandPoint("Housing", 0, 0);
  const workplaces = demandPoint("Workplaces", 1, 1);
  const points = [housing, workplaces];
  const pair = pickTripOriginDestination(points, 0.0, 0.0);
  assert(pair !== null, "a valid origin/destination pair should be found from 2 real points");
  assert(pair!.origin !== pair!.destination, "origin and destination must never be the same point");

  assert(pickTripOriginDestination([housing], 0.5, 0.5) === null, "fewer than 2 points returns null");
  assert(pickTripOriginDestination([], 0.5, 0.5) === null, "no points at all returns null");
}

{
  // Two Housing points and nothing else: a Housing origin's own affinity
  // table has no Housing->Housing entry at all, so no destination can
  // ever be picked — confirms the affinity table is actually consulted,
  // not just "any other point with nonzero demand weight."
  const points = [demandPoint("Housing", 0, 0), demandPoint("Housing", 1, 1)];
  const pair = pickTripOriginDestination(points, 0.0, 0.5);
  assert(pair === null, "two Housing-only points can't form a pair — Housing has no Housing->Housing affinity");
}

// --- evaluateTripOutcome ---

{
  const notFound: JourneyPlanResult = { found: false };
  const outcome = evaluateTripOutcome(notFound, 0);
  assert(!outcome.travelled && outcome.reason === "no-route-found", "a plan that found nothing is correctly not travelled");
}

{
  const found: JourneyPlanResult = { found: true, legs: [{ kind: "walk", seconds: 120 }] };
  const tooLongWait = evaluateTripOutcome(found, 45 * 60);
  assert(!tooLongWait.travelled && tooLongWait.reason === "wait-too-long", "a real route found, but with too long a wait, is correctly abandoned");

  const okWait = evaluateTripOutcome(found, 5 * 60);
  assert(okWait.travelled && okWait.reason === null, "a real route found within the wait tolerance is correctly travelled");
}

// --- tallyByTier ---

{
  const housing = demandPoint("Housing", 0, 0);
  const workplaces = demandPoint("Workplaces", 1, 1);
  const travelledOutcome = evaluateTripOutcome({ found: true, legs: [] }, 0);
  const abandonedOutcome = evaluateTripOutcome({ found: false }, 0);

  const trips: TaggedTrip[] = [
    { origin: housing, destination: workplaces, departureSeconds: 0, outcome: travelledOutcome, isAgentTier: true },
    { origin: housing, destination: workplaces, departureSeconds: 0, outcome: abandonedOutcome, isAgentTier: false },
    { origin: housing, destination: workplaces, departureSeconds: 0, outcome: travelledOutcome, isAgentTier: false },
  ];
  const tally = tallyByTier(trips);
  assert(tally.agent.tripsGenerated === 1 && tally.agent.tripsTravelled === 1 && tally.agent.tripsAbandoned === 0, "the agent-tier trip is tallied correctly on its own");
  assert(tally.statistical.tripsGenerated === 2 && tally.statistical.tripsTravelled === 1 && tally.statistical.tripsAbandoned === 1, "the two statistical-tier trips are tallied correctly on their own");
  assert(
    tally.combined.tripsGenerated === 3 && tally.combined.tripsTravelled === 2 && tally.combined.tripsAbandoned === 1,
    "the combined total is exactly the sum of both tiers — DESIGN.md's 'both must agree' requirement, satisfied structurally",
  );
  assert(
    tally.combined.tripsGenerated === tally.agent.tripsGenerated + tally.statistical.tripsGenerated,
    "combined generated count is exactly agent + statistical, not an independently-reconciled figure",
  );
}

// --- Localised demand (2026-11-15 live fix) ---

{
  assert(
    LOCAL_DEMAND_RADIUS_M === ACCESS_EGRESS_TOLERANCE_M,
    `LOCAL_DEMAND_RADIUS_M must stay in sync with the real planner walk tolerance (ACCESS_EGRESS_TOLERANCE_M) — written as a separate literal to avoid a forward-reference, so this test is what actually keeps them honest, got ${LOCAL_DEMAND_RADIUS_M} vs ${ACCESS_EGRESS_TOLERANCE_M}`,
  );
}

{
  // A real stop at the origin; one demand point ~200m away (well within
  // the 600m radius) and one ~2km away (well outside it).
  const stop: StopLocation = { lon: 0, lat: 0 };
  const nearPoint = demandPoint("Housing", 0, 0.0018); // ~200m north
  const farPoint = demandPoint("Housing", 0, 0.018); // ~2km north
  const result = filterPointsNearStops([nearPoint, farPoint], [stop], LOCAL_DEMAND_RADIUS_M);
  assert(result.length === 1 && result[0] === nearPoint, `expected only the ~200m point to pass a 600m radius filter, got ${result.length} points`);
}

{
  // No real stops at all — every point is filtered out, not everything
  // passed through unfiltered (the same "can't do it sensibly, don't fake
  // it" convention as pickTripOriginDestination's own null return).
  const result = filterPointsNearStops([demandPoint("Housing", 0, 0)], [], LOCAL_DEMAND_RADIUS_M);
  assert(result.length === 0, "with no real stops at all, every point is filtered out rather than passed through");
}

{
  // A grid-boundary case: a stop and a demand point sitting in different
  // grid cells (one just either side of a cell edge) but still genuinely
  // within radius of each other — proving the 3x3 neighbour check, not
  // just same-cell matches, actually works.
  const stop: StopLocation = { lon: 0.0119, lat: 0 }; // just inside one grid cell
  const point = demandPoint("Housing", 0.0121, 0); // just inside the next cell over, ~22m away in reality
  const result = filterPointsNearStops([point], [stop], LOCAL_DEMAND_RADIUS_M);
  assert(result.length === 1, "a stop and point in adjacent grid cells, but genuinely within radius, must still match (3x3 neighbour check)");
}

{
  // pickDemandPointSet's own deterministic boundary: exactly at and either
  // side of LONG_DISTANCE_ATTEMPT_PROBABILITY.
  const allPoints = [demandPoint("Housing", 0, 0)];
  const localPoints = [demandPoint("Workplaces", 1, 1)];
  assert(
    pickDemandPointSet(allPoints, localPoints, 0) === allPoints,
    "a mode roll of exactly 0 (less than the probability, unless it's 0) should pick the long-distance (all-points) set",
  );
  assert(
    pickDemandPointSet(allPoints, localPoints, LONG_DISTANCE_ATTEMPT_PROBABILITY) === localPoints,
    "a mode roll exactly AT the probability boundary must fall to local, not long-distance — strict less-than, matching pickWeighted's own established boundary convention",
  );
  assert(pickDemandPointSet(allPoints, localPoints, 0.999) === localPoints, "a mode roll well above the probability picks the local set");
}

{
  // Monte Carlo proof the real proportion matches the named constant,
  // same style of proof plan #8's own capping-equivalence test already
  // used for a similar "does the real rate match the real constant"
  // requirement.
  const allPoints = [demandPoint("Housing", 0, 0)];
  const localPoints = [demandPoint("Workplaces", 1, 1)];
  const sampleSize = 20_000;
  let longDistanceCount = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (pickDemandPointSet(allPoints, localPoints, Math.random()) === allPoints) longDistanceCount++;
  }
  const observedRate = longDistanceCount / sampleSize;
  assert(
    Math.abs(observedRate - LONG_DISTANCE_ATTEMPT_PROBABILITY) < 0.01,
    `observed long-distance rate (${observedRate.toFixed(4)}) should land within 1% of the real constant (${LONG_DISTANCE_ATTEMPT_PROBABILITY}) over ${sampleSize} samples`,
  );
}

// --- Genuine connectivity (2026-11-15 follow-up) ---

{
  // assignPointsToStopComponents: a point must resolve to its genuinely
  // NEAREST stop's component, not an arbitrary first-found one — two
  // stops 445.28m apart (0.004° at the equator), each in a different
  // component, with a test point moved from clearly-nearer-A to clearly-
  // nearer-B, both measured distances kept well inside the 600m radius.
  const stopA = { lon: 0, lat: 0, componentId: 1 };
  const stopB = { lon: 0.004, lat: 0, componentId: 2 };
  const nearA = demandPoint("Housing", 0.0015, 0); // ~167m from A, ~278m from B
  const nearB = demandPoint("Housing", 0.0025, 0); // ~278m from A, ~167m from B
  const result = assignPointsToStopComponents([nearA, nearB], [stopA, stopB], LOCAL_DEMAND_RADIUS_M);
  assert(result.get(nearA) === 1, `a point genuinely closer to stop A should resolve to A's component (1), got ${result.get(nearA)}`);
  assert(result.get(nearB) === 2, `a point genuinely closer to stop B should resolve to B's component (2), got ${result.get(nearB)}`);
}

{
  // A point with no stop within radius gets no entry at all — the same
  // "can't do it sensibly, don't fake it" convention as filterPointsNearStops.
  const stop = { lon: 0, lat: 0, componentId: 1 };
  const farPoint = demandPoint("Housing", 1, 1);
  const result = assignPointsToStopComponents([farPoint], [stop], LOCAL_DEMAND_RADIUS_M);
  assert(!result.has(farPoint), "a point with no real stop within radius gets no component entry at all");
}

{
  // With no stops at all, every point is left unassigned (empty map),
  // mirroring filterPointsNearStops's own empty-stops behaviour.
  const result = assignPointsToStopComponents([demandPoint("Housing", 0, 0)], [], LOCAL_DEMAND_RADIUS_M);
  assert(result.size === 0, "with no real stops at all, no point gets a component assigned");
}

{
  // pickTripOriginDestination's new predicate: without it (the existing
  // 3-arg call), behaviour is byte-for-byte unchanged — re-running one of
  // this file's own earlier assertions explicitly with the 3-arg form.
  const housing = demandPoint("Housing", 0, 0);
  const workplaces = demandPoint("Workplaces", 1, 1);
  const pair = pickTripOriginDestination([housing, workplaces], 0.0, 0.0);
  assert(pair !== null && pair.origin === housing && pair.destination === workplaces, "omitting the predicate reproduces the exact pre-existing 3-arg result");
}

{
  // With an explicit predicate, the destination must always satisfy it —
  // a Monte Carlo sweep across many random draws from a mixed-component
  // point set, same proof style as this file's own long-distance-rate test.
  const groupA = [demandPoint("Housing", 0, 0), demandPoint("Workplaces", 0.001, 0)];
  const groupB = [demandPoint("Housing", 10, 10), demandPoint("Workplaces", 10.001, 10)];
  const componentOf = new Map<DemandPoint, number>([
    [groupA[0], 1],
    [groupA[1], 1],
    [groupB[0], 2],
    [groupB[1], 2],
  ]);
  const isSameArea = (origin: DemandPoint, candidate: DemandPoint) => componentOf.get(origin) === componentOf.get(candidate);
  const allPoints = [...groupA, ...groupB];
  let crossGroupPairs = 0;
  const sampleSize = 2000;
  for (let i = 0; i < sampleSize; i++) {
    const pair = pickTripOriginDestination(allPoints, Math.random(), Math.random(), isSameArea);
    if (pair && componentOf.get(pair.origin) !== componentOf.get(pair.destination)) crossGroupPairs++;
  }
  assert(crossGroupPairs === 0, `every generated pair must share the same component when the predicate is supplied, got ${crossGroupPairs} cross-group pairs out of ${sampleSize}`);
}

{
  // Full synthetic end-to-end scenario, mirroring the user's own real
  // example directly: an Edinburgh cluster and a Skye cluster, no
  // connection between them at all — confirms zero generated local pairs
  // ever cross between them; then one bridging route (sharing a stop
  // with each cluster) is added and cross-cluster pairs become possible.
  const edinburghRoute: ConnectivityRoute = { points: [{ kind: "stop", osmId: 100 }, { kind: "stop", osmId: 101 }] };
  const skyeRoute: ConnectivityRoute = { points: [{ kind: "stop", osmId: 200 }, { kind: "stop", osmId: 201 }] };
  const stopLocationsById: Record<number, StopLocation> = {
    100: { lon: 0, lat: 0 },
    101: { lon: 0.001, lat: 0 },
    200: { lon: 10, lat: 50 },
    201: { lon: 10.001, lat: 50 },
  };
  function stopsWithComponentFor(routes: ConnectivityRoute[]): (StopLocation & { componentId: number })[] {
    const components = computeStopComponents(routes);
    const out: (StopLocation & { componentId: number })[] = [];
    for (const [osmId, componentId] of components) out.push({ ...stopLocationsById[osmId], componentId });
    return out;
  }
  const edinburghHousing = demandPoint("Housing", 0.0002, 0);
  const edinburghWorkplaces = demandPoint("Workplaces", 0.0008, 0);
  const skyeHousing = demandPoint("Housing", 10.0002, 50);
  const skyeWorkplaces = demandPoint("Workplaces", 10.0008, 50);
  const allLocalPoints = [edinburghHousing, edinburghWorkplaces, skyeHousing, skyeWorkplaces];
  const isEdinburgh = (p: DemandPoint) => p === edinburghHousing || p === edinburghWorkplaces;
  const isSkye = (p: DemandPoint) => p === skyeHousing || p === skyeWorkplaces;
  function countCrossClusterPairs(stopsWithComponent: (StopLocation & { componentId: number })[]): number {
    const components = assignPointsToStopComponents(allLocalPoints, stopsWithComponent, LOCAL_DEMAND_RADIUS_M);
    const isSameArea = (origin: DemandPoint, candidate: DemandPoint) => {
      const oc = components.get(origin);
      return oc !== undefined && oc === components.get(candidate);
    };
    let crossed = 0;
    for (let i = 0; i < 2000; i++) {
      const pair = pickTripOriginDestination(allLocalPoints, Math.random(), Math.random(), isSameArea);
      if (pair && ((isEdinburgh(pair.origin) && isSkye(pair.destination)) || (isSkye(pair.origin) && isEdinburgh(pair.destination)))) crossed++;
    }
    return crossed;
  }
  const disconnected = countCrossClusterPairs(stopsWithComponentFor([edinburghRoute, skyeRoute]));
  assert(disconnected === 0, `with no bridging connection, zero of 2000 generated local pairs should ever cross Edinburgh<->Skye, got ${disconnected}`);

  const bridgeRoute: ConnectivityRoute = { points: [{ kind: "stop", osmId: 101 }, { kind: "stop", osmId: 999 }, { kind: "stop", osmId: 200 }] };
  stopLocationsById[999] = { lon: 5, lat: 25 };
  const connected = countCrossClusterPairs(stopsWithComponentFor([edinburghRoute, skyeRoute, bridgeRoute]));
  assert(connected > 0, `after a bridging route shares a stop with each cluster, cross-cluster pairs should become possible, got ${connected} out of 2000`);
}

console.log("\nAll passenger-simulation checks passed.");
