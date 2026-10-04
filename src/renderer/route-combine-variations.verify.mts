// Manual verification script for route-combine-variations.mts, run directly
// with `npx tsx src/renderer/route-combine-variations.verify.mts` — same
// pattern as variation-padding.verify.mts.
import { findDiversion, composeVariation, type CombinePoint } from "./route-combine-variations.mts";

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

console.log("\nAll route-combine-variations checks passed.");
