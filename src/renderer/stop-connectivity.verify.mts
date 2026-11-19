// Manual verification for stop-connectivity.mts, run directly with
// `node --experimental-strip-types src/renderer/stop-connectivity.verify.mts`
// — same pattern as this project's other .verify.mts files.
import { computeStopComponents, type ConnectivityRoute } from "./stop-connectivity.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function stopPoint(osmId: number) {
  return { kind: "stop" as const, osmId };
}
function waypointPoint() {
  return { kind: "waypoint" as const, osmId: undefined };
}

// --- empty input ---
{
  const result = computeStopComponents([]);
  assert(result.size === 0, "no routes at all produces an empty component map");
}

{
  const route: ConnectivityRoute = { points: [waypointPoint(), waypointPoint()] };
  const result = computeStopComponents([route]);
  assert(result.size === 0, "a route with only waypoints (no real stops) contributes nothing");
}

// --- a single route unions all its own stops ---
{
  const route: ConnectivityRoute = { points: [stopPoint(1), waypointPoint(), stopPoint(2), stopPoint(3)] };
  const result = computeStopComponents([route]);
  assert(result.size === 3, `3 distinct stops should all have an entry, got ${result.size}`);
  assert(result.get(1) === result.get(2) && result.get(2) === result.get(3), "every stop on the same route lands in the same component");
}

// --- 2 genuinely disjoint route clusters get 2 different components ---
{
  // "Edinburgh" cluster: stops 10, 11, 12 on one route.
  const edinburghRoute: ConnectivityRoute = { points: [stopPoint(10), stopPoint(11), stopPoint(12)] };
  // "Skye" cluster: stops 20, 21 on a separate route, no shared stop at all.
  const skyeRoute: ConnectivityRoute = { points: [stopPoint(20), stopPoint(21)] };
  const result = computeStopComponents([edinburghRoute, skyeRoute]);
  const edinburghComponent = result.get(10);
  const skyeComponent = result.get(20);
  assert(edinburghComponent !== undefined && skyeComponent !== undefined, "both clusters' stops get a real component id");
  assert(result.get(11) === edinburghComponent && result.get(12) === edinburghComponent, "the whole Edinburgh cluster shares one component");
  assert(result.get(21) === skyeComponent, "the whole Skye cluster shares one component");
  assert(edinburghComponent !== skyeComponent, "two genuinely disjoint clusters must land in different components");

  // --- a bridging route sharing one stop with each cluster merges them into 1 ---
  const bridgingRoute: ConnectivityRoute = { points: [stopPoint(12), stopPoint(99), stopPoint(20)] };
  const bridgedResult = computeStopComponents([edinburghRoute, skyeRoute, bridgingRoute]);
  const mergedEdinburgh = bridgedResult.get(10);
  const mergedSkye = bridgedResult.get(20);
  assert(mergedEdinburgh === mergedSkye, "a bridging route sharing a stop with each cluster merges them into one component");
  assert(bridgedResult.get(99) === mergedEdinburgh, "the bridging route's own new stop (99) joins the merged component too");
}

// --- real duplicate stop osmId across two independent routes merges them,
// with no bridging route needed — the same physical stop served by 2
// different routes is itself the connection. ---
{
  const routeA: ConnectivityRoute = { points: [stopPoint(1), stopPoint(2)] };
  const routeB: ConnectivityRoute = { points: [stopPoint(2), stopPoint(3)] };
  const result = computeStopComponents([routeA, routeB]);
  assert(result.get(1) === result.get(3), "two routes sharing a real stop (2) are merged into one component via that shared stop alone");
}

console.log("\nAll stop-connectivity checks passed.");
