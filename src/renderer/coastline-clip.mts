// Coastline clipping (31 October hand-off item 2, OPEN-ITEMS.md): "Zones
// can be drawn out over sea using straight-line segments; when closed, any
// part of the outline over water gets clipped back to the shoreline so the
// finished zone is land-only with the coastline as its edge." Pure logic,
// no maplibre-gl import — kept separate from fare-zone-drawing.ts (which
// can't be unit-tested directly, since maplibre-gl has no Node-compatible
// exports) the same way fare-pricing.mts's pure calc layer is kept
// separate from fare-pricing-panel.ts's own UI.
//
// Real coastline geometry comes from the pipeline's coastline.bin
// (rust/pipeline/src/coastline.rs) — assembled chains of natural=coastline
// ways, not closed rings; see that file's own doc comment for the real
// limits of the chain assembly itself.

import { nearestPointOnPolylines } from "./polyline-geometry.mts";

export interface FareZonePoint {
  lon: number;
  lat: number;
}

// Standard 2D segment-vs-segment intersection, treating lon/lat as flat —
// the same approximation this project's existing point-in-polygon/
// containment checks already make (fare-zone-drawing.ts's own
// pointInRing/fullyContains), reasonable at this scale. Returns the
// intersection's own t (0..1 along p1->p2) and point, or null if the
// segments don't cross within both their own bounds.
export function segmentIntersection(
  p1: FareZonePoint,
  p2: FareZonePoint,
  p3: FareZonePoint,
  p4: FareZonePoint,
): { t: number; point: FareZonePoint } | null {
  const d1x = p2.lon - p1.lon;
  const d1y = p2.lat - p1.lat;
  const d2x = p4.lon - p3.lon;
  const d2y = p4.lat - p3.lat;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null; // parallel or degenerate
  const dx = p3.lon - p1.lon;
  const dy = p3.lat - p1.lat;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, point: { lon: p1.lon + t * d1x, lat: p1.lat + t * d1y } };
}

export interface CoastlineCrossing {
  t: number;
  chainIndex: number;
  // Index of the coastline edge the crossing landed on: chain[edgeIndex]
  // -> chain[edgeIndex + 1].
  edgeIndex: number;
  point: FareZonePoint;
}

// Cheap, local proximity check for the dedup below — doesn't need
// distanceM's own real-metres accuracy (that's defined further down,
// after this point), just "close enough to be the same real-world point
// rather than two independent crossings," which a plain degree
// difference already answers fine at this tiny a scale. Exported
// (2026-11-15) — area-cluster.mts's own ring-walk needs the exact same
// "is this really the same point" check to fix a real duplicate-point
// bug (see walkRingDirection's own comment there), and fare-zone-
// drawing.ts's draftPoints push sites reuse it as a defensive backstop
// against any duplicate a snap/follow function hands back — built once
// rather than redefined three times (CLAUDE.md).
export function sameRealPoint(a: FareZonePoint, b: FareZonePoint): boolean {
  return Math.abs(a.lon - b.lon) < 1e-7 && Math.abs(a.lat - b.lat) < 1e-7;
}

export function findCoastlineCrossings(p1: FareZonePoint, p2: FareZonePoint, chains: FareZonePoint[][]): CoastlineCrossing[] {
  const crossings: CoastlineCrossing[] = [];
  for (let c = 0; c < chains.length; c++) {
    const chain = chains[c];
    for (let i = 0; i < chain.length - 1; i++) {
      const hit = segmentIntersection(p1, p2, chain[i], chain[i + 1]);
      // A live real bug, 2026-11-14 ("jumps away from the boundary and
      // randomly back"), confirmed against a real saved zone and the
      // real coastline data, not guessed: a ring point that already
      // sits exactly on the real coastline (entirely normal for a
      // waterfront commercial area — Kyle of Lochalsh's own Main
      // Street, in the confirmed case) makes `segmentIntersection`
      // report a crossing exactly AT that point for BOTH of the two
      // coastline edges that share it as their common vertex — the
      // SAME real-world point, double-counted via two adjacent
      // coastline edges rather than two genuinely different crossings.
      // `clipRingToCoastline` sees that as "2 crossings on the same
      // chain" (its own real signal for "this ring edge dips into the
      // sea and comes back") and inserts a spurious
      // `coastlineWalkBetween` detour, even though nothing here
      // actually needs clipping. Deduping by the crossing's own real
      // point (not by `t`, which legitimately lands at/near 0 or 1 for
      // a perfectly ordinary edge that starts or ends right at the
      // shore — Shift-drawn straight lines across a bay do this on
      // purpose, and excluding t near 0/1 outright broke that real
      // case) keeps that genuine scenario working while still
      // collapsing the one-point-counted-twice artifact.
      if (hit && !crossings.some((existing) => existing.chainIndex === c && sameRealPoint(existing.point, hit.point))) {
        crossings.push({ t: hit.t, chainIndex: c, edgeIndex: i, point: hit.point });
      }
    }
  }
  crossings.sort((a, b) => a.t - b.t);
  return crossings;
}

// Same small-helper-per-module convention as roughDistanceM (fare-zone-
// drawing.ts)/approxDistanceM (several other renderer modules) — this
// file's own equivalent, needed below to tell a genuinely short path from
// a genuinely long one, not just to compare point counts.
function distanceM(a: FareZonePoint, b: FareZonePoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dLon = (b.lon - a.lon) * (Math.PI / 180) * cosLat * 6_371_000;
  const dLat = (b.lat - a.lat) * (Math.PI / 180) * 6_371_000;
  return Math.hypot(dLon, dLat);
}

function pathLengthM(points: readonly FareZonePoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += distanceM(points[i], points[i + 1]);
  return total;
}

// `assemble_chains` (coastline.rs) deliberately never closes a ring — its
// own doc comment says so — but an island's real coastline IS a closed
// loop in reality, so a fully (or almost fully) joined island chain often
// ends up with its own first and last point sitting at, or very close to,
// the exact same real place; coastline.rs's own `bridge_nearby_chain_ends`
// only ever merges a gap between two DIFFERENT chains, never a chain's own
// two ends against each other, so this is never closed into a true ring at
// the data level. Confirmed directly against the real pipeline-data
// coastline.bin (2026-11-13, a throwaway `cargo run --example
// skye_coastline_seam`, the project's own "replay real pipeline data"
// convention): several real chains around Skye have an EXACT 0.0m gap
// between their own first and last point, several more sit within a few
// tens of metres — real OSM digitisation slop on the single remaining
// join `bridge_nearby_chain_ends` doesn't reach. 100m comfortably covers
// every real gap actually measured (largest seen: ~50m) while staying far
// below the length of any genuinely separate, unrelated stretch of coast.
const RING_CLOSURE_TOLERANCE_M = 100;

// Exported (2026-11-15) for island-detection.mts's own real-landmass check
// — the same "is this chain a real closed loop" question, reused rather
// than reimplemented with a different tolerance.
export function isEffectivelyClosed(chain: readonly FareZonePoint[]): boolean {
  return chain.length > 2 && distanceM(chain[0], chain[chain.length - 1]) <= RING_CLOSURE_TOLERANCE_M;
}

// Walks a coastline chain between two of its own edge indices. Originally
// assumed every chain is a genuinely open polyline with only one possible
// path between two points on it (see isEffectivelyClosed's own comment for
// why that assumption doesn't hold for an island's real coastline) — live
// bug report, 2026-11-13: "when making a zone around Skye it will jump the
// entire way around the outside of Skye... instead of just a few hundred
// meters along." Root cause confirmed directly against the real data, not
// guessed: Skye's own coastline chain(s) are effectively closed loops, and
// two clicks that straddle the chain's own seam (its first/last point)
// used to always walk the long way through the middle of the array, since
// nothing here knew the two ends were really adjacent. Now: for an
// effectively-closed chain, also builds the alternative path that crosses
// the seam instead, and returns whichever of the two is actually shorter
// in real distance (not just point count, which isn't a reliable proxy
// when segment lengths vary). An open chain is completely unaffected —
// still exactly the one path it always had.
// Pushes `point` only if it isn't already an exact real-world duplicate
// of whatever's currently last in `into` — real bug found 2026-11-15 via
// a live, human-driven click trace (a saved zone came back 66% exact-
// duplicate points): `toPoint` is a snap ONTO an edge, which very often
// lands exactly on one of that edge's own two real vertices (a click
// close to a corner clamps straight to it) — pushing the walked vertex
// and then the snap point right after it, unconditionally, produced a
// bit-identical duplicate at the seam every time that happened. Used at
// every join point in the walk below, not just the final one, since the
// very same risk exists wherever a walked chain vertex could coincide
// with an already-pushed snap point.
function pushDedup(into: FareZonePoint[], point: FareZonePoint): void {
  const last = into[into.length - 1];
  if (!last || !sameRealPoint(last, point)) into.push(point);
}

export function coastlineWalkBetween(
  chain: FareZonePoint[],
  fromEdge: number,
  fromPoint: FareZonePoint,
  toEdge: number,
  toPoint: FareZonePoint,
): FareZonePoint[] {
  const direct: FareZonePoint[] = [fromPoint];
  if (fromEdge <= toEdge) {
    for (let i = fromEdge + 1; i <= toEdge; i++) pushDedup(direct, chain[i]);
  } else {
    for (let i = fromEdge; i > toEdge; i--) pushDedup(direct, chain[i]);
  }
  pushDedup(direct, toPoint);

  if (!isEffectivelyClosed(chain)) return direct;

  const wrapped: FareZonePoint[] = [fromPoint];
  const n = chain.length;
  if (fromEdge <= toEdge) {
    for (let i = fromEdge; i >= 0; i--) pushDedup(wrapped, chain[i]);
    for (let i = n - 1; i >= toEdge + 1; i--) pushDedup(wrapped, chain[i]);
  } else {
    for (let i = fromEdge + 1; i < n; i++) pushDedup(wrapped, chain[i]);
    for (let i = 0; i <= toEdge; i++) pushDedup(wrapped, chain[i]);
  }
  pushDedup(wrapped, toPoint);

  return pathLengthM(wrapped) < pathLengthM(direct) ? wrapped : direct;
}

export interface CoastlineSnap {
  point: FareZonePoint;
  chainIndex: number;
  // Index of the coastline edge the point fell on: chain[edgeIndex] ->
  // chain[edgeIndex + 1] — same convention as CoastlineCrossing above,
  // needed so a following click on the same chain can walk the real
  // shoreline between the two via coastlineFollowBetween.
  edgeIndex: number;
}

// Nearest point on any real coastline chain to a click, with a max-distance
// cutoff — the click-time counterpart to clipRingToCoastline's own
// after-the-fact clip. Added 2026-11-01, live bug report: "the fare zone
// is meant to snap to the edge of the land, not be in the water after
// completing it" — clipRingToCoastline only corrects an edge that crosses
// the SAME coastline chain exactly twice (a bay being cut across), which
// never applies to a genuine open-water crossing to a separate landmass
// (Skye's own case: its coastline is its own chain, unconnected to the
// mainland's), so a zone boundary meant to hug an island's own coast had
// nothing pulling it onto the shoreline at all. The actual nearest-point
// maths now lives in polyline-geometry.mts (factored out 2026-11-05, so
// building-cluster.mts's own boundary snap could reuse it) — this just
// adapts that shared result's field names to this module's own
// established vocabulary (chainIndex, not polylineIndex).
export function nearestPointOnCoastline(point: FareZonePoint, coastlineChains: FareZonePoint[][], maxDistanceM: number): CoastlineSnap | null {
  const hit = nearestPointOnPolylines(point, coastlineChains, maxDistanceM);
  return hit && { point: hit.point, chainIndex: hit.polylineIndex, edgeIndex: hit.edgeIndex };
}

// Walks the real coastline between two consecutive snapped clicks, or
// null for a genuine "big gap" the caller should connect with a straight
// line instead. Corrected 2026-11-01 from a live screenshot ("This should
// all be snapping" — a clearly-continuous stretch of coast several
// kilometres long was falling back to straight lines): a distance cutoff
// was wrong here. Re-reading the ORIGINAL building-cluster-snap design
// this was meant to mirror — "I click in the first and last place I want
// the boundary and it fills in the middle" — "big gap" was never about
// how far apart two clicks are, it's about whether they're still on the
// SAME boundary at all. Two points on the same coastline chain are
// always the same boundary, however far apart; the genuine "big gap"
// case (a different, unconnected chain — crossing a strait to a separate
// landmass) is already fully covered by the chainIndex check alone. A
// player who wants a deliberate shortcut straight across, say, a loch
// mouth rather than tracing all the way around it already has Shift for
// exactly that (bypasses coastline-snapping entirely).
export function coastlineFollowBetween(from: CoastlineSnap, to: CoastlineSnap, coastlineChains: FareZonePoint[][]): FareZonePoint[] | null {
  if (from.chainIndex !== to.chainIndex) return null;
  return coastlineWalkBetween(coastlineChains[from.chainIndex], from.edgeIndex, from.point, to.edgeIndex, to.point);
}

interface BoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function boundingBoxOf(points: readonly FareZonePoint[]): BoundingBox {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

export function clipRingToCoastline(points: FareZonePoint[], coastlineChains: FareZonePoint[][]): FareZonePoint[] {
  if (coastlineChains.length === 0 || points.length < 3) return points;
  // Performance (live report, 2026-11-01: "saving a zone creates
  // incredibly long freezes if its a complicated zone") — this used to
  // check every ring edge against every point of the ENTIRE coastline
  // dataset (now hundreds of thousands of points across the extract,
  // after T125/T127's own gap-bridging work made it far more detailed),
  // with the cost multiplying by however many edges the zone has —
  // exactly matching "freezes... if it's a complicated zone." Filtered
  // once, up front, to only the chains whose own bounding box could
  // possibly matter to THIS ring at all, rather than per edge.
  const ringBox = boundingBoxOf(points);
  const relevantChains = coastlineChains.filter((chain) => boxesOverlap(ringBox, boundingBoxOf(chain)));
  const result: FareZonePoint[] = [];
  // Real bug found live 2026-11-16 (a human-redrawn zone at Main Street,
  // Kyle of Lochalsh, running roughly ALONGSIDE a real coastline for many
  // consecutive short edges — confirmed against the real coastline.bin
  // and the real redrawn ring, not guessed): each ring edge is checked
  // for a same-chain double-crossing entirely independently, but when the
  // boundary tracks near the shore for a long stretch, dozens of
  // CONSECUTIVE edges each register their own tiny "cuts a corner"
  // double-crossing against the SAME few real coastline vertices — e.g.
  // one edge's own walk covers chain positions 1591->1589, the very next
  // edge's walk covers 1590->1588, re-inserting 1590 and 1589 a second
  // time, then the edge after that re-inserts 1589 and 1588 a THIRD time,
  // and so on — nearly doubling the ring's own point count as it works
  // along the coast. This tracks, per chain, the real edge index AND
  // point the ring has already been walked to (plus direction), and
  // CLIPS each new trigger's own walk to start from there instead of its
  // own raw crossing point whenever that crossing point would re-tread
  // already-covered ground — a plain skip-or-insert-whole isn't enough,
  // since a trigger can be PARTLY old ground and partly genuine new
  // progress (confirmed directly against the real data: an all-or-
  // nothing version left 45 duplicate pairs behind, this clipped version
  // leaves none). If a trigger's own real toEdge doesn't reach past what's
  // already covered at all, it's skipped outright — no new ground, no
  // insertion needed.
  const lastWalkedEdge = new Map<number, { edge: number; forward: boolean; point: FareZonePoint }>();
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    // pushDedup, not a plain push — a second, distinct real duplicate
    // source found alongside the overlapping-walk one above: a ring
    // point that happens to sit EXACTLY on the real coastline (routine
    // for a waterfront street like this one) makes the PREVIOUS edge's
    // own walk naturally end its `toPoint` at that exact same real-world
    // place, which this unconditional push would otherwise re-state a
    // moment later as this iteration's own `p1`.
    pushDedup(result, p1);
    const crossings = findCoastlineCrossings(p1, p2, relevantChains);
    if (crossings.length === 2 && crossings[0].chainIndex === crossings[1].chainIndex) {
      const chainIndex = crossings[0].chainIndex;
      const toEdge = crossings[1].edgeIndex;
      const toPoint = crossings[1].point;
      let fromEdge = crossings[0].edgeIndex;
      let fromPoint = crossings[0].point;
      const forward = toEdge >= fromEdge;
      const prior = lastWalkedEdge.get(chainIndex);
      let resuming = false;
      if (prior && prior.forward === forward) {
        const startsBehindPrior = forward ? fromEdge <= prior.edge : fromEdge >= prior.edge;
        if (startsBehindPrior) {
          fromEdge = prior.edge;
          fromPoint = prior.point;
          resuming = true;
        }
      }
      const noNewGround = forward ? fromEdge >= toEdge : fromEdge <= toEdge;
      if (!noNewGround) {
        const chain = relevantChains[chainIndex];
        const walk = coastlineWalkBetween(chain, fromEdge, fromPoint, toEdge, toPoint);
        // When resuming a clipped walk, `walk[0]` is always `fromPoint`
        // itself (coastlineWalkBetween's own convention) — i.e. exactly
        // `prior.point`, already the real last thing this same chain's
        // walk ended on. It's no longer ADJACENT in `result` by the time
        // we get here (this iteration's own `p1`, pushed above, now sits
        // between them), so the plain adjacency-based `pushDedup` below
        // can't catch it on its own — drop it explicitly instead of
        // relying on adjacency for this one specific case.
        for (const point of resuming ? walk.slice(1) : walk) {
          pushDedup(result, point);
        }
        lastWalkedEdge.set(chainIndex, { edge: toEdge, forward, point: toPoint });
      }
    }
  }
  return result;
}
