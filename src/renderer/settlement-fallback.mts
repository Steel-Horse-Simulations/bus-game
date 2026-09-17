// The settlement fallback for DESIGN.md §6's direction rule ("On a route
// touching no bus station, the largest settlement in the depot group is
// the reference, even if the route never reaches it") — used only when
// the owning depot group has no main bus station set. Depot groups have
// no stored location of their own yet (that's Phase 3 depot placement),
// so there is no real "settlement in the depot group" to look up; the
// route's own points are the only location signal that exists right now,
// so this finds the largest settlement near *them* instead. Revisit once
// depot groups have a real location — this is a deliberate stand-in, not
// the eventual design. Pure logic, no map/DOM/router dependency, so it's
// testable in isolation the same way the project's other .mts modules are.
export interface DecodedSettlement {
  lon: number;
  lat: number;
  name: string | null;
  rank: "city" | "town" | "village" | "hamlet";
  population: number | null;
  osmId: number;
}

// Matches route-orientation.ts's own LonLat exactly (readonly) so a
// caller can pass the same tuple to both without a type mismatch.
type LonLat = readonly [number, number];

const PLACE_RANK_ORDER: Record<DecodedSettlement["rank"], number> = {
  city: 0,
  town: 1,
  village: 2,
  hamlet: 3,
};

function approxDistanceM(a: LonLat, b: LonLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[0] - a[0]);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

// Tries successively wider search radii (a tight one first, so a depot
// group in a small town gets that town rather than the nearest big city
// two counties over) and, within whichever radius first finds anything,
// picks the most significant rank, then the most populous, then the
// nearest — never returning nothing as long as at least one settlement
// exists anywhere in the loaded data.
export function findFallbackSettlement(
  near: LonLat,
  settlements: readonly DecodedSettlement[],
): DecodedSettlement | null {
  if (settlements.length === 0) return null;
  const RADII_M = [50_000, 150_000, Infinity];
  for (const radius of RADII_M) {
    const candidates = settlements.filter((s) => approxDistanceM(near, [s.lon, s.lat]) <= radius);
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => {
      const rankDiff = PLACE_RANK_ORDER[a.rank] - PLACE_RANK_ORDER[b.rank];
      if (rankDiff !== 0) return rankDiff;
      const popDiff = (b.population ?? 0) - (a.population ?? 0);
      if (popDiff !== 0) return popDiff;
      return approxDistanceM(near, [a.lon, a.lat]) - approxDistanceM(near, [b.lon, b.lat]);
    });
    return candidates[0];
  }
  return null;
}
