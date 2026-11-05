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

export function findCoastlineCrossings(p1: FareZonePoint, p2: FareZonePoint, chains: FareZonePoint[][]): CoastlineCrossing[] {
  const crossings: CoastlineCrossing[] = [];
  for (let c = 0; c < chains.length; c++) {
    const chain = chains[c];
    for (let i = 0; i < chain.length - 1; i++) {
      const hit = segmentIntersection(p1, p2, chain[i], chain[i + 1]);
      if (hit) crossings.push({ t: hit.t, chainIndex: c, edgeIndex: i, point: hit.point });
    }
  }
  crossings.sort((a, b) => a.t - b.t);
  return crossings;
}

// Walks a coastline chain between two of its own edge indices (each
// chain is an open polyline, not a closed ring — see coastline.rs — so
// there's only ever one path between two points on it, no "shorter
// direction" ambiguity to resolve).
export function coastlineWalkBetween(
  chain: FareZonePoint[],
  fromEdge: number,
  fromPoint: FareZonePoint,
  toEdge: number,
  toPoint: FareZonePoint,
): FareZonePoint[] {
  const walked: FareZonePoint[] = [fromPoint];
  if (fromEdge <= toEdge) {
    for (let i = fromEdge + 1; i <= toEdge; i++) walked.push(chain[i]);
  } else {
    for (let i = fromEdge; i > toEdge; i--) walked.push(chain[i]);
  }
  walked.push(toPoint);
  return walked;
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
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    result.push(p1);
    const crossings = findCoastlineCrossings(p1, p2, relevantChains);
    if (crossings.length === 2 && crossings[0].chainIndex === crossings[1].chainIndex) {
      const chain = relevantChains[crossings[0].chainIndex];
      result.push(...coastlineWalkBetween(chain, crossings[0].edgeIndex, crossings[0].point, crossings[1].edgeIndex, crossings[1].point));
    }
  }
  return result;
}
