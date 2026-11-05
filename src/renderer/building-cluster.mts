// Building-cluster boundary snap for zone drawing (T118, OPEN-ITEMS.md,
// DESIGN.md — the UI/interaction shape was fully confirmed 2026-11-01
// across two screenshot rounds): holding Ctrl while drawing a fare zone
// replaces road-snapping with snapping onto a building cluster's own
// outer edge instead. The player clicks a first and a last point on (or
// near) the cluster, and the game fills in the detailed boundary trace
// between them.
//
// Pure logic only — no maplibre-gl import, same split as
// coastline-clip.mts/fare-zone-drawing.ts, since maplibre-gl has no
// Node-compatible exports to unit-test against directly. The maplibre
// side (fare-zone-drawing.ts) is responsible for querying the real
// building polygons out of the basemap's own vector tiles (the
// `building` source-layer, confirmed to already exist there —
// OPEN-ITEMS.md T118's corrected entry — with no new pipeline work of
// any kind) and handing their outer rings in here as plain
// lon/lat points.
//
// Scope of this file, and what's deliberately simplified:
// - A building's own holes (rare OSM courtyards) are ignored —
//   out-of-scope for "snap to this cluster's outer edge," which only
//   ever cares about the outside boundary. The caller passes outer
//   rings only.
// - Unioning uses the `polygon-clipping` library (installed 2026-11-05
//   specifically for this) rather than hand-written polygon-boolean
//   code: this project already avoids a geometry library for the
//   SIMPLE cases it has today (fare-zone-drawing.ts's own plain
//   ray-casting point-in-polygon, no buffering/offset library for the
//   10m-offset feature that was deliberately deferred) but a robust,
//   correct polygon UNION (merging several real, possibly
//   barely-touching OSM building footprints into one outer boundary) is
//   a genuinely different scale of problem — floating-point edge/vertex
//   coincidence is exactly where hand-rolled polygon-boolean code goes
//   wrong, and a small, widely-used, dependency-light library
//   (`robust-predicates` + `splaytree`, no native bindings) is the
//   safer choice here, not a shortcut.
// - A building spanning a vector-tile boundary can arrive as more than
//   one partial polygon fragment (tile clipping) — union handles this
//   correctly as long as the fragments still share an edge/overlap at
//   the tile seam, which real OpenMapTiles building tiles do (adjacent
//   tiles share the exact same clipped boundary). Not independently
//   proven against a real multi-tile case in this file's own tests
//   (needs real tile data, not a synthetic one) — flagged, not assumed.
import polygonClipping from "polygon-clipping";
import type { Ring as ClippingRing, Polygon as ClippingPolygon } from "polygon-clipping";
import { nearestPointOnPolylines, type GeoPoint } from "./polyline-geometry.mts";

export interface FareZonePoint {
  lon: number;
  lat: number;
}

function closeRing(ring: readonly FareZonePoint[]): FareZonePoint[] {
  if (ring.length === 0) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.lon === last.lon && first.lat === last.lat) return [...ring];
  return [...ring, first];
}

function ringToPairs(ring: readonly FareZonePoint[]): ClippingRing {
  return ring.map((p) => [p.lon, p.lat]);
}

function pairsToRing(pairs: ClippingRing): FareZonePoint[] {
  return pairs.map(([lon, lat]) => ({ lon, lat }));
}

// Unions every given building OUTER ring (closeRing handles an
// unclosed input) into one or more merged outer boundaries. Buildings
// that don't touch/overlap any other simply come back as their own
// unchanged boundary — union of one shape is a no-op, so a lone
// building near the click works the same way as a genuine cluster, with
// no special-casing needed by the caller.
export function unionBuildingFootprints(footprints: readonly FareZonePoint[][]): FareZonePoint[][] {
  const closed = footprints.map(closeRing).filter((ring) => ring.length >= 4);
  if (closed.length === 0) return [];
  const polygons: ClippingPolygon[] = closed.map((ring) => [ringToPairs(ring)]);
  const [first, ...rest] = polygons;
  const result = rest.length > 0 ? polygonClipping.union(first, ...rest) : polygonClipping.union(first);
  // result is a MultiPolygon (Polygon[]); each Polygon's own ring 0 is
  // its outer boundary — any hole a union could create (e.g. buildings
  // arranged in a ring around an internal courtyard) is dropped, same
  // out-of-scope simplification as input holes above.
  return result.map((polygon) => pairsToRing(polygon[0]));
}

export interface ClusterSnap {
  point: FareZonePoint;
  // Index into the boundaries array this point fell on — a following
  // click re-unions its own (possibly different) candidate set, so this
  // is only meaningful paired with the SAME boundaries array it came
  // from, never compared across two separate union calls.
  boundaryIndex: number;
  edgeIndex: number;
}

export function nearestPointOnBuildingBoundary(point: FareZonePoint, boundaries: readonly FareZonePoint[][], maxDistanceM: number): ClusterSnap | null {
  const hit = nearestPointOnPolylines(point, boundaries, maxDistanceM);
  return hit && { point: hit.point, boundaryIndex: hit.polylineIndex, edgeIndex: hit.edgeIndex };
}

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

function pathLengthM(points: readonly FareZonePoint[]): number {
  const cosLat = Math.cos(points[0].lat * DEG_TO_RAD);
  const toXY = (p: GeoPoint): [number, number] => [p.lon * DEG_TO_RAD * cosLat * EARTH_RADIUS_M, p.lat * DEG_TO_RAD * EARTH_RADIUS_M];
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = toXY(points[i]);
    const [bx, by] = toXY(points[i + 1]);
    total += Math.hypot(bx - ax, by - ay);
  }
  return total;
}

// Walks a CLOSED ring (ring[0] === ring[ring.length-1]) from one edge to
// another in a single fixed direction — forward (increasing index, with
// wraparound) if `forward` is true, backward otherwise. Used by
// ringWalkShorterArc below to build both candidate paths before picking
// the shorter one; not exported on its own since a caller choosing the
// wrong direction by hand would defeat the point of "shortest arc."
function walkRingDirection(
  ring: readonly FareZonePoint[],
  fromEdge: number,
  fromPoint: FareZonePoint,
  toEdge: number,
  toPoint: FareZonePoint,
  forward: boolean,
): FareZonePoint[] {
  const n = ring.length - 1; // real edge/vertex count, excluding the repeated closing point
  const walked: FareZonePoint[] = [fromPoint];
  let i = fromEdge;
  if (forward) {
    while (i !== toEdge) {
      i = (i + 1) % n;
      walked.push(ring[i]);
    }
  } else {
    while (i !== toEdge) {
      walked.push(ring[i]);
      i = (i - 1 + n) % n;
    }
  }
  walked.push(toPoint);
  return walked;
}

// Walks a closed building-boundary ring between two of its own edge
// locations, choosing whichever of the two possible directions around
// the ring is the shorter real distance — DESIGN.md's own "finding the
// shortest/correct arc between two clicked points along it," genuinely
// different from coastlineWalkBetween (coastline-clip.mts), which never
// has this ambiguity since a coastline chain is an open polyline with
// only one path between any two of its points.
export function ringWalkShorterArc(ring: readonly FareZonePoint[], fromEdge: number, fromPoint: FareZonePoint, toEdge: number, toPoint: FareZonePoint): FareZonePoint[] {
  const forward = walkRingDirection(ring, fromEdge, fromPoint, toEdge, toPoint, true);
  const backward = walkRingDirection(ring, fromEdge, fromPoint, toEdge, toPoint, false);
  return pathLengthM(forward) <= pathLengthM(backward) ? forward : backward;
}

// Connects two consecutive cluster-snapped clicks, mirroring
// coastlineFollowBetween's own shape: traces the real boundary between
// them when both landed on the SAME merged boundary (from the SAME
// union call — the caller is responsible for re-unioning a combined
// candidate set covering both points before calling this, so a cluster
// that really does connect the two is actually represented as one
// boundary here), or returns null for a genuine gap (different
// boundaries, or one/both too far from any building) — the caller then
// falls back to a plain straight line, same "big gap" treatment as
// coastline-following and the original feature spec's own point (3).
export function buildingClusterFollowBetween(from: ClusterSnap, to: ClusterSnap, boundaries: readonly FareZonePoint[][]): FareZonePoint[] | null {
  if (from.boundaryIndex !== to.boundaryIndex) return null;
  return ringWalkShorterArc(boundaries[from.boundaryIndex], from.edgeIndex, from.point, to.edgeIndex, to.point);
}
