// Manual verification script for route-combine-variations.mts, run directly
// with `npx tsx src/renderer/route-combine-variations.verify.mts` — same
// pattern as variation-padding.verify.mts.
import {
  findDiversion,
  composeVariation,
  resolveRoutePoints,
  findDependentRouteIds,
  type CombinePoint,
  type ComposableRoute,
} from "./route-combine-variations.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function stop(osmId: number): CombinePoint {
  return { kind: "stop", osmId, lon: osmId, lat: osmId };
}
function waypoint(id: number): CombinePoint {
  return { kind: "waypoint", lon: 1000 + id, lat: 1000 + id };
}
function osmIds(points: readonly CombinePoint[]): (number | "wp")[] {
  return points.map((p) => (p.kind === "stop" ? (p.osmId as number) : "wp"));
}

// The user's own worked example: route 1's trunk is stops 1-2-3-4-5-6-7.
// 1A splits at stop 3, diverges via a different road, rejoins at stop 5.
// 1B splits at stop 5 (later), diverges differently, rejoins at stop 7.
{
  const trunk = [stop(1), stop(2), stop(3), stop(4), stop(5), stop(6), stop(7)];
  const oneA = [stop(1), stop(2), stop(3), waypoint(1), stop(30), stop(5), stop(6), stop(7)];
  const oneB = [stop(1), stop(2), stop(3), stop(4), stop(5), stop(50), waypoint(2), stop(7)];

  const diversionA = findDiversion(trunk, oneA);
  assert(diversionA !== null, "1A's own diversion is found against the trunk");
  assert(
    diversionA!.trunkSplitIndex === 2 && diversionA!.trunkRejoinIndex === 4,
    `1A should split at trunk index 2 (stop 3) and rejoin at trunk index 4 (stop 5), got split=${diversionA!.trunkSplitIndex} rejoin=${diversionA!.trunkRejoinIndex}`,
  );

  const diversionB = findDiversion(trunk, oneB);
  assert(diversionB !== null, "1B's own diversion is found against the trunk");
  assert(
    diversionB!.trunkSplitIndex === 4 && diversionB!.trunkRejoinIndex === 6,
    `1B should split at trunk index 4 (stop 5) and rejoin at trunk index 6 (stop 7), got split=${diversionB!.trunkSplitIndex} rejoin=${diversionB!.trunkRejoinIndex}`,
  );

  // 1C = trunk, with 1A's diversion spliced in at its own split point AND
  // 1B's diversion spliced in at its own (later) split point.
  const result = composeVariation(trunk, [
    { siblingId: "1A", points: oneA },
    { siblingId: "1B", points: oneB },
  ]);
  assert(
    JSON.stringify(result.appliedSiblingIds) === JSON.stringify(["1A", "1B"]),
    `both siblings should be applied, in trunk order, got ${JSON.stringify(result.appliedSiblingIds)}`,
  );
  const expected = [1, 2, 3, "wp", 30, 5, 50, "wp", 7];
  assert(
    JSON.stringify(osmIds(result.points)) === JSON.stringify(expected),
    `1C should be [1,2,3,wp,30,5,50,wp,7], got ${JSON.stringify(osmIds(result.points))}`,
  );
}

// A sibling that doesn't diverge from the trunk at all (identical stop
// sequence) has no real diversion to reuse — excluded, not an error.
{
  const trunk = [stop(1), stop(2), stop(3)];
  const identical = [stop(1), stop(2), stop(3)];
  assert(findDiversion(trunk, identical) === null, "an identical stop sequence has no diversion to find");
  const result = composeVariation(trunk, [{ siblingId: "X", points: identical }]);
  assert(result.appliedSiblingIds.length === 0, "a sibling with no real diversion contributes nothing");
  assert(JSON.stringify(osmIds(result.points)) === JSON.stringify([1, 2, 3]), "the trunk is returned unchanged");
}

// A sibling sharing no stop at all with the trunk (a completely different
// route) is likewise excluded, not an error.
{
  const trunk = [stop(1), stop(2), stop(3)];
  const unrelated = [stop(90), stop(91)];
  assert(findDiversion(trunk, unrelated) === null, "a route sharing no stop at all has no diversion to find");
}

// Two siblings whose diversions overlap on the trunk can't both be
// applied — ambiguous, so this must throw rather than silently garble the
// result.
{
  const trunk = [stop(1), stop(2), stop(3), stop(4), stop(5)];
  const overlapA = [stop(1), stop(2), waypoint(1), stop(4), stop(5)]; // splits at 2 (idx1), rejoins at 4 (idx3)
  const overlapB = [stop(1), stop(2), stop(3), waypoint(2), stop(5)]; // splits at 3 (idx2), rejoins at 5 (idx4) — overlaps A's own 2..4 range
  let threw = false;
  try {
    composeVariation(trunk, [
      { siblingId: "A", points: overlapA },
      { siblingId: "B", points: overlapB },
    ]);
  } catch {
    threw = true;
  }
  assert(threw, "overlapping diversions must throw rather than produce a garbled result");
}

// Repeated stops: the trunk revisits stop 2 twice (a there-and-back
// pattern) — the split/rejoin match must anchor on the correct occurrence
// by position, not just "this osmId appears somewhere" (the same class of
// bug already fixed once in mergeStopSequences). The sibling adds a real
// extra stop (99) right after the SECOND visit to stop 2, before rejoining
// at stop 4 — a naive "first occurrence of stop 2" match would wrongly
// split after trunk index 1 instead of index 3.
{
  const trunk = [stop(1), stop(2), stop(3), stop(2), stop(4)];
  const sibling = [stop(1), stop(2), stop(3), stop(2), stop(99), stop(4)];
  const diversion = findDiversion(trunk, sibling);
  assert(diversion !== null, "a diversion after a repeated stop is still found");
  assert(
    diversion!.trunkSplitIndex === 3,
    `should split at the SECOND occurrence of stop 2 (trunk index 3), got ${diversion!.trunkSplitIndex}`,
  );
  assert(
    diversion!.trunkRejoinIndex === 4,
    `should rejoin at stop 4 (trunk index 4), got ${diversion!.trunkRejoinIndex}`,
  );
}

function route(id: number, points: CombinePoint[], parentRouteId: number | null, composedFromRouteIds: number[]): ComposableRoute {
  return { id, points, parentRouteId, composedFromRouteIds };
}

// resolveRoutePoints: an ordinary route (nothing reused) just returns its
// own stored points — no composition to resolve.
{
  const trunk = route(1, [stop(1), stop(2), stop(3)], null, []);
  const resolved = resolveRoutePoints(trunk, [trunk]);
  assert(JSON.stringify(osmIds(resolved)) === JSON.stringify([1, 2, 3]), "an ordinary route resolves to its own stored points");
}

// resolveRoutePoints: the live-reference behaviour itself — a composed
// route must reflect the CURRENT state of the sibling it reused, not
// whatever was true when it was composed. Simulates 1A's diversion
// changing after 1C was built from it: 1C's own stale cached points still
// say "30", but resolving fresh against 1A's updated points must say "99".
{
  const trunk = route(1, [stop(1), stop(2), stop(3), stop(4), stop(5)], null, []);
  const oneAOld = [stop(1), stop(2), waypoint(1), stop(4), stop(5)];
  const oneANew = [stop(1), stop(2), waypoint(1), stop(99), stop(4), stop(5)];
  const oneA = route(2, oneANew, 1, []); // 1A's diversion has since been edited
  const staleCache = composeVariation(trunk.points, [{ siblingId: oneA.id, points: oneAOld }]).points;
  const oneC = route(3, staleCache, 1, [2]); // 1C's own cache still reflects the OLD 1A

  const resolved = resolveRoutePoints(oneC, [trunk, oneA, oneC]);
  assert(
    JSON.stringify(osmIds(resolved)) === JSON.stringify([1, 2, "wp", 99, 4, 5]),
    `1C should resolve to 1A's CURRENT diversion (with 99), not its stale cache, got ${JSON.stringify(osmIds(resolved))}`,
  );
}

// resolveRoutePoints: falls back to the stored cache, not an error, when
// the parent route no longer exists (deleted) — a real situation a save
// file can be in, not something that should make the route vanish.
{
  const cachedPoints = [stop(1), stop(2), stop(3)];
  const orphan = route(5, cachedPoints, 999, [888]); // parent 999, sibling 888 — neither exists
  const resolved = resolveRoutePoints(orphan, [orphan]);
  assert(JSON.stringify(osmIds(resolved)) === JSON.stringify([1, 2, 3]), "a composed route with a deleted parent falls back to its own cache");
}

// resolveRoutePoints: falls back to the cache when a reused sibling no
// longer exists, same reasoning.
{
  const trunk = route(1, [stop(1), stop(2), stop(3)], null, []);
  const cachedPoints = [stop(1), stop(2), stop(3)];
  const orphan = route(2, cachedPoints, 1, [777]); // sibling 777 doesn't exist
  const resolved = resolveRoutePoints(orphan, [trunk, orphan]);
  assert(JSON.stringify(osmIds(resolved)) === JSON.stringify([1, 2, 3]), "a composed route with a deleted sibling falls back to its own cache");
}

// resolveRoutePoints: a cycle (shouldn't happen via the real UI, but a
// save file could end up corrupted) must not infinite-loop — falls back to
// the cache for whichever route closes the cycle.
{
  const a = route(1, [stop(1)], 2, [2]);
  const b = route(2, [stop(2)], 1, [1]);
  const resolved = resolveRoutePoints(a, [a, b]);
  assert(Array.isArray(resolved), "a cyclic composed-from chain terminates instead of looping forever");
}

// findDependentRouteIds: a route that directly reuses a diversion from the
// saved route is a dependent.
{
  const trunk = route(1, [], null, []);
  const oneA = route(2, [], 1, []);
  const oneC = route(3, [], 1, [2]); // reuses 1A (id 2)
  const unrelated = route(4, [], null, []);
  const deps = findDependentRouteIds(2, [trunk, oneA, oneC, unrelated]);
  assert(JSON.stringify(deps.sort()) === JSON.stringify([3]), `only 1C should depend on 1A, got ${JSON.stringify(deps)}`);
}

// findDependentRouteIds: a composed variation also depends on its own
// trunk — editing route 1 itself must refresh 1C too, not just siblings
// 1C explicitly reuses.
{
  const trunk = route(1, [], null, []);
  const oneC = route(3, [], 1, [2]); // trunk is 1
  const plainVariation = route(4, [], 1, []); // also a child of 1, but NOT composed — shouldn't be a dependent
  const deps = findDependentRouteIds(1, [trunk, oneC, plainVariation]);
  assert(JSON.stringify(deps) === JSON.stringify([3]), `only the composed variation should depend on its trunk, got ${JSON.stringify(deps)}`);
}

// findDependentRouteIds: transitive — if 1D reuses 1C's own diversion, and
// 1C reuses 1A's, saving 1A must also refresh 1D.
{
  const trunk = route(1, [], null, []);
  const oneA = route(2, [], 1, []);
  const oneC = route(3, [], 1, [2]);
  const oneD = route(4, [], 1, [3]);
  const deps = findDependentRouteIds(2, [trunk, oneA, oneC, oneD]);
  assert(JSON.stringify(deps.sort()) === JSON.stringify([3, 4]), `both 1C and transitively 1D should depend on 1A, got ${JSON.stringify(deps)}`);
}

console.log("\nAll route-combine-variations checks passed.");
