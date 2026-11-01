// Manual verification for long-distance-sections.mts (shared long-distance
// sections, 2026-10-31), run via `npx tsx src/renderer/long-distance-sections.verify.mts`.
import { resolveSegments, findRoutesUsingSectionId, type RouteSegment, type SectionSource, type SectionPoint } from "./long-distance-sections.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok: ${message}`);
}

const glasgow: SectionPoint = { kind: "stop", osmId: 1, lon: -4.25, lat: 55.86 };
const carlisle: SectionPoint = { kind: "stop", osmId: 2, lon: -2.94, lat: 54.89 };
const waypointMid: SectionPoint = { kind: "waypoint", lon: -3.5, lat: 55.3 };
const manchester: SectionPoint = { kind: "stop", osmId: 3, lon: -2.24, lat: 53.48 };

const glasgowCarlisleSection: SectionSource = { id: 100, points: [glasgow, waypointMid, carlisle] };

// A route built from nothing but a single section.
const onlySection: RouteSegment[] = [{ kind: "section", sectionId: 100 }];
assert(resolveSegments(onlySection, [glasgowCarlisleSection]).length === 3, "a route built from one section resolves to that section's own points");

// A route that continues drawing (custom points) from exactly where the
// section left off — the shared boundary stop (Carlisle) must not be
// duplicated.
const continuesFromSection: RouteSegment[] = [
  { kind: "section", sectionId: 100 },
  { kind: "custom", points: [carlisle, manchester] },
];
const resolved = resolveSegments(continuesFromSection, [glasgowCarlisleSection]);
assert(resolved.length === 4, "a shared boundary stop between a section and the next custom segment isn't duplicated");
assert(resolved[2].osmId === 2 && resolved[3].osmId === 3, "the custom continuation's own points follow the section in order");

// A route that draws a custom lead-in, then uses a section, with no shared
// boundary (a real gap) — nothing should be incorrectly deduped.
const customThenSection: RouteSegment[] = [
  { kind: "custom", points: [{ kind: "stop", osmId: 9, lon: -4.3, lat: 55.95 }] },
  { kind: "section", sectionId: 100 },
];
assert(resolveSegments(customThenSection, [glasgowCarlisleSection]).length === 4, "a custom lead-in with no shared boundary point is fully kept, not deduped");

// A reference to a section that no longer exists (deleted) contributes
// nothing rather than throwing.
const danglingReference: RouteSegment[] = [{ kind: "section", sectionId: 999 }, { kind: "custom", points: [manchester] }];
assert(resolveSegments(danglingReference, [glasgowCarlisleSection]).length === 1, "a reference to a deleted section contributes nothing rather than throwing");

// Live update: editing a section's own points changes what every route
// using it resolves to, next time it's resolved — proving the "live
// reference, not a frozen copy" design.
const reroutedSection: SectionSource = { id: 100, points: [glasgow, carlisle] }; // waypoint removed
assert(resolveSegments(onlySection, [reroutedSection]).length === 2, "resolving again after the section itself changes reflects the new points — a live reference, not a one-off copy");

// findRoutesUsingSectionId
const routeA = { id: 1, segments: onlySection };
const routeB = { id: 2, segments: continuesFromSection };
const routeC = { id: 3, segments: [{ kind: "custom", points: [manchester] }] as RouteSegment[] };
const dependents = findRoutesUsingSectionId(100, [routeA, routeB, routeC]);
assert(dependents.length === 2 && dependents.includes(1) && dependents.includes(2), "findRoutesUsingSectionId finds every route referencing a section, and only those");
assert(findRoutesUsingSectionId(999, [routeA, routeB, routeC]).length === 0, "a section id nothing references returns no dependents");

console.log("All long-distance-sections checks passed.");
