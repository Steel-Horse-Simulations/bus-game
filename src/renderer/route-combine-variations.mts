// Combining variations (DESIGN.md §6 "Combining variations") — composing a
// new variation from one or more existing siblings' own already-drawn
// diversions, splicing each in at its own real split/rejoin point along the
// shared trunk, rather than redrawing every diversion by hand. Worked
// example the user gave: route 1 has 1A (splits at X, rejoins at Y) and 1B
// (splits at a later point P, rejoins at Q) — a new variation 1C takes 1A's
// own diversion at X–Y *and* 1B's own diversion at P–Q, spliced onto the
// shared trunk.
//
// Pure point-list algorithm, verified independently before any UI drives
// it — same precedent as variation-padding.mts. Deliberately does not
// touch the variation-padding model itself: composed variations pad at
// their outer terminus only for now (Q13's own answer), not at each
// internal split point.
export interface CombinePoint {
  kind: "stop" | "waypoint";
  osmId?: number;
  lon: number;
  lat: number;
}

export interface Diversion {
  // Indexes into the trunk's own point list — trunkSplitIndex is the last
  // point shared with the sibling before it diverges, trunkRejoinIndex is
  // the first point shared with it again afterward. Both inclusive.
  trunkSplitIndex: number;
  trunkRejoinIndex: number;
  // The same two points' own indexes in the sibling's own point list.
  siblingSplitIndex: number;
  siblingRejoinIndex: number;
}

// Only "stop" points anchor a match — a waypoint has no stable identity
// across separate drawings of the same road, so two point lists agreeing on
// every waypoint in between would be coincidence, never a real signal.
// Finds the longest common PREFIX and longest common SUFFIX of each list's
// own stop-only subsequence, matched by osmId occurrence-by-occurrence (not
// "does this osmId appear anywhere," which would misfire the moment a route
// revisits the same physical stop — the same class of bug already fixed
// once in route-timetable-grid.mts's mergeStopSequences). A rejoined
// sibling's own tail, from route-draw.ts's "Rejoin at," is literally the
// trunk's own points sliced on — so the suffix match is exact, never
// approximate.
//
// Returns null when there's no real shared split *and* rejoin stop to
// anchor on (the sibling doesn't actually diverge from this trunk at all,
// in the stop-only view).
export function findDiversion(
  trunk: readonly CombinePoint[],
  sibling: readonly CombinePoint[],
): Diversion | null {
  const trunkStops = trunk.map((p, i) => ({ p, i })).filter((x) => x.p.kind === "stop");
  const siblingStops = sibling.map((p, i) => ({ p, i })).filter((x) => x.p.kind === "stop");

  let prefixLen = 0;
  while (
    prefixLen < trunkStops.length &&
    prefixLen < siblingStops.length &&
    trunkStops[prefixLen].p.osmId === siblingStops[prefixLen].p.osmId
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < trunkStops.length - prefixLen &&
    suffixLen < siblingStops.length - prefixLen &&
    trunkStops[trunkStops.length - 1 - suffixLen].p.osmId ===
      siblingStops[siblingStops.length - 1 - suffixLen].p.osmId
  ) {
    suffixLen++;
  }

  if (prefixLen === 0 || suffixLen === 0) return null;

  return {
    trunkSplitIndex: trunkStops[prefixLen - 1].i,
    trunkRejoinIndex: trunkStops[trunkStops.length - suffixLen].i,
    siblingSplitIndex: siblingStops[prefixLen - 1].i,
    siblingRejoinIndex: siblingStops[siblingStops.length - suffixLen].i,
  };
}

export interface DiversionSource {
  // Caller's own identifier for this sibling (e.g. "1A") — opaque to this
  // module, carried through only so a caller/error can name which sibling
  // was used or rejected.
  siblingId: string | number;
  points: readonly CombinePoint[];
}

export interface ComposeResult {
  points: CombinePoint[];
  // Which siblings actually contributed a diversion, in trunk order —
  // a sibling that doesn't diverge from the trunk at all is silently
  // excluded (findDiversion returned null), not an error.
  appliedSiblingIds: (string | number)[];
}

// Splices each source's own diversion onto the trunk at its own real split
// point, in trunk order. Throws if two accepted diversions overlap on the
// trunk (ambiguous — there's no sensible way to splice both).
export function composeVariation(
  trunk: readonly CombinePoint[],
  siblings: readonly DiversionSource[],
): ComposeResult {
  const diversions = siblings
    .map((s) => ({ siblingId: s.siblingId, points: s.points, diversion: findDiversion(trunk, s.points) }))
    .filter(
      (d): d is { siblingId: string | number; points: readonly CombinePoint[]; diversion: Diversion } =>
        d.diversion !== null,
    )
    .sort((a, b) => a.diversion.trunkSplitIndex - b.diversion.trunkSplitIndex);

  for (let i = 1; i < diversions.length; i++) {
    // Strictly less-than, not <=: one diversion's rejoin point being the
    // exact same stop as the next one's split point is the ordinary case
    // (the worked example: 1A rejoins at 5, 1B splits away again right at
    // 5) — sharing that single boundary stop isn't an overlap. A genuine
    // overlap is when the two ranges share more than just that boundary.
    if (diversions[i].diversion.trunkSplitIndex < diversions[i - 1].diversion.trunkRejoinIndex) {
      throw new Error(
        `sibling ${diversions[i].siblingId}'s own diversion overlaps sibling ${diversions[i - 1].siblingId}'s on the trunk — can't combine both`,
      );
    }
  }

  const points: CombinePoint[] = [];
  let trunkCursor = 0;
  for (const { points: siblingPoints, diversion } of diversions) {
    points.push(...trunk.slice(trunkCursor, diversion.trunkSplitIndex + 1));
    points.push(...siblingPoints.slice(diversion.siblingSplitIndex + 1, diversion.siblingRejoinIndex + 1));
    trunkCursor = diversion.trunkRejoinIndex + 1;
  }
  points.push(...trunk.slice(trunkCursor));

  return { points, appliedSiblingIds: diversions.map((d) => d.siblingId) };
}

// Minimal shape resolveRoutePoints needs from a real `Route` — kept
// separate from the global `Route` type so this module stays usable from a
// plain unit test without pulling in the whole app's ambient type set.
export interface ComposableRoute {
  id: number;
  points: readonly CombinePoint[];
  parentRouteId: number | null;
  composedFromRouteIds: readonly number[];
}

// The live, current point list for a route — DESIGN.md §6 "Combining
// variations," decided (2026-10-10): reusing a sibling's diversion is a
// LIVE reference, not a one-off copy, so editing 1A's diversion later must
// update 1C automatically. An ordinary route (composedFromRouteIds empty)
// just returns its own stored points unchanged — this function only does
// real work for a composed one. Recomputes via composeVariation from the
// CURRENT parent + sibling points every time, rather than trusting
// whatever composeVariation produced when the composition was last built
// — the same "merge is a projection, not a copy" principle CLAUDE.md
// already establishes for timetables. Recurses through parentRouteId,
// since a composed variation's own parent can itself be composed (DESIGN.md:
// "each one can branch off either the main route or another variation").
// Falls back to the route's own stored (possibly stale) points rather than
// throwing whenever live resolution isn't possible — a deleted parent/
// sibling, a cycle, or an overlap introduced since the composition was last
// valid are all real situations a save file can end up in, and showing the
// last known-good shape is safer than the route vanishing from the map
// entirely.
export function resolveRoutePoints<T extends ComposableRoute>(route: T, allRoutes: readonly T[], seen: ReadonlySet<number> = new Set()): CombinePoint[] {
  if (route.composedFromRouteIds.length === 0) return route.points as CombinePoint[];
  if (seen.has(route.id)) return route.points as CombinePoint[];
  const nextSeen = new Set(seen).add(route.id);

  const parent = route.parentRouteId === null ? undefined : allRoutes.find((r) => r.id === route.parentRouteId);
  if (!parent) return route.points as CombinePoint[];

  const siblings = route.composedFromRouteIds.map((id) => allRoutes.find((r) => r.id === id));
  if (siblings.some((s) => s === undefined)) return route.points as CombinePoint[];

  const trunkPoints = resolveRoutePoints(parent, allRoutes, nextSeen);
  const sources: DiversionSource[] = (siblings as T[]).map((s) => ({
    siblingId: s.id,
    points: resolveRoutePoints(s, allRoutes, nextSeen),
  }));

  try {
    return composeVariation(trunkPoints, sources).points;
  } catch {
    return route.points as CombinePoint[];
  }
}

// Every OTHER route that needs refreshing after `savedRouteId`'s own points
// changed — either because it directly reuses one of its diversions, or
// because it's a composed variation of it (its trunk). Transitive: if B
// depends on A and C depends on B, saving A must also refresh C. Returns
// ids only, in no particular order — the caller resolves and re-saves each
// one (route-draw.ts, the only place a route is ever saved).
export function findDependentRouteIds<T extends ComposableRoute>(savedRouteId: number, allRoutes: readonly T[]): number[] {
  const dependents = new Set<number>();
  let frontier = [savedRouteId];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const r of allRoutes) {
        if (dependents.has(r.id) || r.id === savedRouteId) continue;
        const dependsDirectly = r.composedFromRouteIds.includes(id) || (r.parentRouteId === id && r.composedFromRouteIds.length > 0);
        if (dependsDirectly) {
          dependents.add(r.id);
          next.push(r.id);
        }
      }
    }
    frontier = next;
  }
  return [...dependents];
}
