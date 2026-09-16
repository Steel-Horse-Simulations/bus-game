// Variation padding (DESIGN.md §7 "Variation timetabling", Case B:
// "variations split near the end and terminate in different places") —
// CLAUDE.md flags this as a hard part to get subtly wrong, so it's built
// and unit-verified here as a pure function before any data model or UI
// exists to drive it (route-timetable.mts's own precedent: pure generation
// functions first, verified independently of WASM/DOM).
//
// The rule, from the worked example: every variation must return to the
// shared section after the *same elapsed time* from leaving it. The
// longest variation's own natural cycle (out + its own minimum wait + back)
// sets that figure; every other variation's wait is raised — never
// lowered below its own minimum — to make its own cycle match. Because
// this recomputes from scratch on every call rather than persisting a
// padded value anywhere, deleting the longest variation and calling again
// with the remainder naturally "shrinks padding back to the new longest" —
// that rule falls out of statelessness, it isn't separate logic.
export interface VariationLeg {
  // Caller's own identifier for this variation — opaque to this module,
  // just carried through so the caller can match results back up.
  id: string | number;
  // Running time from the shared section's divergence point to this
  // variation's own outer terminus.
  outSeconds: number;
  // Running time from the outer terminus back to rejoining the shared
  // section.
  backSeconds: number;
  // This variation's own minimum wait at its outer terminus — padding can
  // raise this, but must never cut into it (DESIGN.md §7).
  minWaitSeconds: number;
}

export interface PaddedVariation extends VariationLeg {
  // >= minWaitSeconds always; equals it exactly for whichever variation(s)
  // are currently the longest.
  paddedWaitSeconds: number;
  // outSeconds + paddedWaitSeconds + backSeconds — identical across every
  // variation returned from the same call, by construction.
  cycleSeconds: number;
}

export function padVariationsToLongestCycle(variations: readonly VariationLeg[]): PaddedVariation[] {
  for (const v of variations) {
    if (v.outSeconds < 0 || v.backSeconds < 0 || v.minWaitSeconds < 0) {
      throw new Error(`padVariationsToLongestCycle: variation ${v.id} has a negative time`);
    }
  }
  if (variations.length === 0) return [];

  const targetCycleSeconds = Math.max(...variations.map((v) => v.outSeconds + v.minWaitSeconds + v.backSeconds));

  return variations.map((v) => {
    // Guaranteed >= v.minWaitSeconds: targetCycleSeconds is the max over
    // every variation's own (out + minWait + back), so for this specific
    // variation targetCycleSeconds >= v.outSeconds + v.minWaitSeconds +
    // v.backSeconds, which rearranges to exactly that. The Math.max guard
    // is defensive only — floating-point-safe, not load-bearing.
    const paddedWaitSeconds = Math.max(v.minWaitSeconds, targetCycleSeconds - v.outSeconds - v.backSeconds);
    return { ...v, paddedWaitSeconds, cycleSeconds: v.outSeconds + paddedWaitSeconds + v.backSeconds };
  });
}
