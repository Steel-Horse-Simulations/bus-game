// Genuine route-network connectivity (2026-11-15, follow-up to the
// localised-demand fix in passenger-simulation.mts). User's own words,
// verbatim: "What happens if I have a network on Skye and one in
// Edinburgh that aren't connected, I want each area to only connect to
// others where there are genuine connections."
//
// `passenger-simulation.mts`'s "Localised demand" fix only ever asks "is
// this point within walking distance of ANY real stop in the whole save"
// — it has no notion of whether that stop can actually be REACHED from
// any other stop. Two genuinely disconnected real networks are both just
// "local" under that check, so a trip generator could (and did) pair a
// Skye-area point with an Edinburgh-area one — a trip that was always
// going to fail at the RAPTOR planning stage, just wastefully rather than
// usefully.
//
// This module is the actual graph-connectivity computation: a plain
// Union-Find (disjoint-set) over real stop osmIds, grouping every stop a
// single route visits into one component — two different routes that
// happen to share a stop automatically end up in the same component once
// each route's own stops are unioned, with no extra cross-route logic
// needed, that falls out of Union-Find for free. Deliberately undirected
// and time-unaware: a route visiting A, B and C makes all three mutually
// "reachable" for this coarse feasibility check regardless of direction
// or which specific departure runs when — real direction/timing
// correctness is RAPTOR's job downstream (`journey_planner.rs`), not this
// graph's. Kept dependency-free and structurally typed, same convention
// as this project's other pure geometry/graph modules (`coastline-
// clip.mts`, `fare-zone-road-pushout.mts`) — it takes the minimal shape it
// actually needs rather than importing `vehicle-simulation.ts`'s own
// `Route`/`RoutePoint` types.
//
// Which routes to pass in is entirely the caller's choice — this module
// has no notion of timetables at all. `vehicle-simulation.ts`'s own
// caller is expected to pass only routes with at least one real
// timetable (the same "where a bus genuinely stops" tightening this
// follow-up also makes to `stopLocations`), so a drawn-but-never-
// operated route contributes nothing — but that filtering happens before
// this function is ever called, not inside it.
export interface ConnectivityRoutePoint {
  kind: string;
  osmId?: number | null;
}

export interface ConnectivityRoute {
  points: readonly ConnectivityRoutePoint[];
}

// A plain Union-Find keyed by real stop osmId. `componentId` values are
// just whichever osmId each group's root happens to be — never exposed as
// a sequential/meaningful index, so callers must only ever compare two
// component ids for equality, never rely on their magnitude or order.
export function computeStopComponents(routes: readonly ConnectivityRoute[]): Map<number, number> {
  const parent = new Map<number, number>();

  function ensure(id: number): void {
    if (!parent.has(id)) parent.set(id, id);
  }

  function find(id: number): number {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const route of routes) {
    const stopIds: number[] = [];
    for (const point of route.points) {
      if (point.kind === "stop" && point.osmId !== undefined && point.osmId !== null) stopIds.push(point.osmId);
    }
    for (const id of stopIds) ensure(id);
    for (let i = 1; i < stopIds.length; i++) union(stopIds[0], stopIds[i]);
  }

  const result = new Map<number, number>();
  for (const id of parent.keys()) result.set(id, find(id));
  return result;
}
