// Manual verification script for variation-padding.mts, run directly with
// `node --experimental-strip-types src/renderer/variation-padding.verify.mts`
// — same pattern as route-timetable.verify.mts and stop-calling-
// services.verify.mts.
import { padVariationsToLongestCycle, type VariationLeg } from "./variation-padding.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// DESIGN.md §7's own worked example, checked exactly: A (5 out, 5 wait, 5
// back = 15) and B (7 out, 5 wait, 7 back = 19) — A's wait should extend
// from 5 to 9 so both cycles are 19; B is already the longest and is
// unchanged.
{
  const variations: VariationLeg[] = [
    { id: "A", outSeconds: 5 * 60, backSeconds: 5 * 60, minWaitSeconds: 5 * 60 },
    { id: "B", outSeconds: 7 * 60, backSeconds: 7 * 60, minWaitSeconds: 5 * 60 },
  ];
  const result = padVariationsToLongestCycle(variations);
  const a = result.find((r) => r.id === "A")!;
  const b = result.find((r) => r.id === "B")!;
  assert(a.paddedWaitSeconds === 9 * 60, `A's wait should extend to 9 min, got ${a.paddedWaitSeconds / 60} min`);
  assert(b.paddedWaitSeconds === 5 * 60, `B's wait should stay at 5 min (already longest), got ${b.paddedWaitSeconds / 60} min`);
  assert(a.cycleSeconds === 19 * 60 && b.cycleSeconds === 19 * 60, "both cycles should be 19 minutes, matching the longest");
}

// Padding never cuts into a variation's own minimum wait — checked with a
// third, much shorter variation added to the worked example above.
{
  const variations: VariationLeg[] = [
    { id: "A", outSeconds: 5 * 60, backSeconds: 5 * 60, minWaitSeconds: 5 * 60 },
    { id: "B", outSeconds: 7 * 60, backSeconds: 7 * 60, minWaitSeconds: 5 * 60 },
    { id: "C", outSeconds: 1 * 60, backSeconds: 1 * 60, minWaitSeconds: 2 * 60 },
  ];
  const result = padVariationsToLongestCycle(variations);
  const c = result.find((r) => r.id === "C")!;
  assert(c.paddedWaitSeconds >= 2 * 60, "C's padded wait must never go below its own 2-minute minimum");
  assert(c.paddedWaitSeconds === 19 * 60 - 60 - 60, `C should pad up to the shared 19-minute cycle, got ${c.paddedWaitSeconds / 60} min`);
}

// A single variation with no others to pad against just gets its own
// natural cycle — its own minimum wait, unchanged.
{
  const result = padVariationsToLongestCycle([{ id: "A", outSeconds: 300, backSeconds: 300, minWaitSeconds: 300 }]);
  assert(result[0].paddedWaitSeconds === 300, "a lone variation keeps its own minimum wait");
  assert(result[0].cycleSeconds === 900, "a lone variation's cycle is just its own natural total");
}

// "Deleting the longest variation shrinks padding back to the new
// longest" (DESIGN.md §7) falls out of statelessness: re-running with B
// removed re-targets everything to A's own natural cycle.
{
  const onlyA: VariationLeg[] = [{ id: "A", outSeconds: 5 * 60, backSeconds: 5 * 60, minWaitSeconds: 5 * 60 }];
  const result = padVariationsToLongestCycle(onlyA);
  assert(result[0].paddedWaitSeconds === 5 * 60, "with B deleted, A's wait shrinks back to its own 5-minute minimum");
  assert(result[0].cycleSeconds === 15 * 60, "with B deleted, the cycle shrinks back to A's own 15 minutes");
}

// Asymmetric out/back times (not every real diversion is a mirror image)
// are handled the same way — the cycle is still out + wait + back.
{
  const variations: VariationLeg[] = [
    { id: "A", outSeconds: 4 * 60, backSeconds: 6 * 60, minWaitSeconds: 3 * 60 }, // natural 13
    { id: "B", outSeconds: 5 * 60, backSeconds: 5 * 60, minWaitSeconds: 2 * 60 }, // natural 12
  ];
  const result = padVariationsToLongestCycle(variations);
  const a = result.find((r) => r.id === "A")!;
  const b = result.find((r) => r.id === "B")!;
  assert(a.cycleSeconds === 13 * 60 && b.cycleSeconds === 13 * 60, "target cycle is the longer natural total (A's 13 min), asymmetric or not");
  assert(b.paddedWaitSeconds === 3 * 60, `B pads from 2 to 3 min to hit 13 min total, got ${b.paddedWaitSeconds / 60} min`);
}

// An empty list is a no-op, not an error — a route with no variations yet
// simply has nothing to pad.
{
  assert(padVariationsToLongestCycle([]).length === 0, "an empty variation list returns an empty result");
}

// A negative time is a caller bug, not a value this function should
// silently accept.
{
  let threw = false;
  try {
    padVariationsToLongestCycle([{ id: "A", outSeconds: -1, backSeconds: 0, minWaitSeconds: 0 }]);
  } catch {
    threw = true;
  }
  assert(threw, "a negative time throws rather than producing a nonsensical result");
}

console.log("\nAll variation-padding checks passed.");
