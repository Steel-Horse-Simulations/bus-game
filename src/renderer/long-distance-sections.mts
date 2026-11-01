// Shared long-distance sections (live design discussion, 2026-10-31) — a
// reusable piece of drawn path, authored once in its own menu, that several
// otherwise-unrelated long-distance routes can build from, so a shared
// corridor (the worked example: several services all running Glasgow-
// Carlisle before diverging) only ever needs its own real `find_route` done
// once, not once per route that happens to reuse it.
//
// Deliberately a different shape from route-combine-variations.mts's own
// composeVariation/resolveRoutePoints: that mechanism matches a sibling's
// own diversion against a shared TRUNK at common stop points — a section
// has no trunk relationship to the routes using it at all, it's just raw
// geometry spliced in wherever the player puts it. Kept as its own small
// module rather than folded into that one, same reasoning.
//
// Pure point-list algorithm, verified independently before any UI drives
// it — same precedent as route-combine-variations.mts and
// variation-padding.mts.
export interface SectionPoint {
  kind: "stop" | "waypoint";
  osmId?: number;
  lon: number;
  lat: number;
}

// A route's own build sequence (electron/db.mts's own `RouteSegment`,
// duplicated here structurally rather than imported — this module is a
// plain renderer-side .mts with its own unit tests, same reason
// route-combine-variations.mts keeps its own `CombinePoint` rather than
// importing the Electron-side `RoutePoint`).
export type RouteSegment = { kind: "custom"; points: readonly SectionPoint[] } | { kind: "section"; sectionId: number };

export interface SectionSource {
  id: number;
  points: readonly SectionPoint[];
}

function samePoint(a: SectionPoint, b: SectionPoint): boolean {
  // A shared boundary point between two consecutive segments is the same
  // real point if it's the same stop (by osmId) or, for a waypoint with no
  // stable identity, the same coordinate — mirrors the stop-vs-waypoint
  // identity distinction route-combine-variations.mts's own
  // `findDiversion` already draws.
  if (a.kind === "stop" && b.kind === "stop") return a.osmId === b.osmId;
  return a.lon === b.lon && a.lat === b.lat;
}

// Concatenates every segment's own points in order, deduping a shared
// boundary point where one segment's last point is the same real point as
// the next segment's first (the ordinary case when the player continues
// drawing from exactly where a section left off) — without this, that
// point would appear twice in a row, which would double-count it in any
// mileage/timing calculation downstream. A section reference whose
// `sectionId` no longer resolves (a deleted section) contributes nothing
// rather than throwing — a save file can genuinely end up in this state,
// and silently dropping it is safer than the whole route vanishing, the
// same "last known-good shape" philosophy `resolveRoutePoints` already
// uses for a missing parent/sibling.
export function resolveSegments(segments: readonly RouteSegment[], sections: readonly SectionSource[]): SectionPoint[] {
  const out: SectionPoint[] = [];
  for (const segment of segments) {
    const segmentPoints = segment.kind === "custom" ? segment.points : sections.find((s) => s.id === segment.sectionId)?.points ?? [];
    if (out.length > 0 && segmentPoints.length > 0 && samePoint(out[out.length - 1], segmentPoints[0])) {
      out.push(...segmentPoints.slice(1));
    } else {
      out.push(...segmentPoints);
    }
  }
  return out;
}

// Minimal shape this needs from a real `Route` — kept separate from the
// global `Route` type so this module stays usable from a plain unit test
// without pulling in the whole app's ambient type set, same reasoning as
// route-combine-variations.mts's own `ComposableRoute`.
export interface SectionUsingRoute {
  id: number;
  segments: readonly RouteSegment[];
}

// Every route that references a given section, directly — used after
// editing a section's own points to find which routes' cached `points`
// need refreshing (the caller resolves each one via `resolveSegments` and
// re-saves, mirroring exactly how `findDependentRouteIds` +
// `resolveRoutePoints` already work together in route-draw.ts for composed
// variations).
export function findRoutesUsingSectionId<T extends SectionUsingRoute>(sectionId: number, routes: readonly T[]): number[] {
  return routes.filter((r) => r.segments.some((s) => s.kind === "section" && s.sectionId === sectionId)).map((r) => r.id);
}
