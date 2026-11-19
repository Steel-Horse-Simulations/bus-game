// Area-cluster boundary snap for zone drawing (T118/T139, OPEN-ITEMS.md —
// the UI/interaction shape was fully confirmed 2026-11-01 across two
// screenshot rounds): holding Ctrl while drawing a fare zone replaces
// road-snapping with snapping onto a real map area's own outer edge
// instead. The player clicks a first and a last point on (or near) the
// area, and the game fills in the detailed boundary trace between them.
//
// Renamed from building-cluster.mts (2026-11-13, live correction): T118/
// T139 originally snapped onto individual building footprints (the
// `building` source-layer), but a live report asked for the broader
// landuse area instead — "it currently snaps to the buildings not the
// coloured area around it," confirmed directly: the basemap's own
// `landuse` source-layer (residential/commercial/retail/industrial,
// basemap-style.json) is a real, separate polygon from individual
// buildings, already rendered as that visible shaded area. None of the
// geometry below is actually building-specific — it's plain polygon
// union/snap/trace math that doesn't care what kind of area it's tracing
// — so only the file's own name and the caller's query (fare-zone-
// drawing.ts, now querying `landuse` instead of `building`) needed to
// change; the real building footprints aren't read anywhere any more.
//
// Pure logic only — no maplibre-gl import, same split as
// coastline-clip.mts/fare-zone-drawing.ts, since maplibre-gl has no
// Node-compatible exports to unit-test against directly. The maplibre
// side (fare-zone-drawing.ts) is responsible for querying the real area
// polygons out of the basemap's own vector tiles and handing their outer
// rings in here as plain lon/lat points.
//
// Scope of this file, and what's deliberately simplified:
// - An area's own holes (e.g. a landuse polygon with an excluded patch
//   inside it) are ignored — out-of-scope for "snap to this area's outer
//   edge," which only ever cares about the outside boundary. The caller
//   passes outer rings only.
// - Unioning uses the `polygon-clipping` library (installed 2026-11-05
//   specifically for this) rather than hand-written polygon-boolean
//   code: this project already avoids a geometry library for the
//   SIMPLE cases it has today (fare-zone-drawing.ts's own plain
//   ray-casting point-in-polygon, no buffering/offset library for the
//   10m-offset feature that was deliberately deferred) but a robust,
//   correct polygon UNION (merging several real, possibly
//   barely-touching OSM-derived polygons into one outer boundary) is
//   a genuinely different scale of problem — floating-point edge/vertex
//   coincidence is exactly where hand-rolled polygon-boolean code goes
//   wrong, and a small, widely-used, dependency-light library
//   (`robust-predicates` + `splaytree`, no native bindings) is the
//   safer choice here, not a shortcut.
// - An area spanning a vector-tile boundary can arrive as more than
//   one partial polygon fragment (tile clipping) — union handles this
//   correctly as long as the fragments still share an edge/overlap at
//   the tile seam, which real OpenMapTiles tiles do (adjacent tiles
//   share the exact same clipped boundary). Not independently proven
//   against a real multi-tile case in this file's own tests (needs real
//   tile data, not a synthetic one) — flagged, not assumed.
import polygonClipping from "polygon-clipping";
import type { Ring as ClippingRing, Polygon as ClippingPolygon } from "polygon-clipping";
import { nearestPointOnPolylines, type GeoPoint } from "./polyline-geometry.mts";
import { sameRealPoint } from "./coastline-clip.mts";

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

// Unions every given area OUTER ring (closeRing handles an unclosed
// input) into one or more merged outer boundaries. An area that doesn't
// touch/overlap any other simply comes back as its own unchanged boundary
// — union of one shape is a no-op, so a lone polygon near the click works
// the same way as a genuine cluster, with no special-casing needed by the
// caller.
export function unionAreaPolygons(footprints: readonly FareZonePoint[][]): FareZonePoint[][] {
  const closed = footprints.map(closeRing).filter((ring) => ring.length >= 4);
  if (closed.length === 0) return [];
  const polygons: ClippingPolygon[] = closed.map((ring) => [ringToPairs(ring)]);
  const [first, ...rest] = polygons;
  const result = rest.length > 0 ? polygonClipping.union(first, ...rest) : polygonClipping.union(first);
  // result is a MultiPolygon (Polygon[]); each Polygon's own ring 0 is
  // its outer boundary — any hole a union could create (e.g. polygons
  // arranged in a ring around an internal gap) is dropped, same
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

export function nearestPointOnAreaBoundary(point: FareZonePoint, boundaries: readonly FareZonePoint[][], maxDistanceM: number): ClusterSnap | null {
  const hit = nearestPointOnPolylines(point, boundaries, maxDistanceM);
  return hit && { point: hit.point, boundaryIndex: hit.polylineIndex, edgeIndex: hit.edgeIndex };
}

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

// Flat equirectangular distance, centred on the midpoint of the two
// points — the same approximation used throughout this project
// (polyline-geometry.mts, point_to_segment_closest in
// rust/game-wasm/src/lib.rs); fine at the scale a single area or
// cluster spans.
function distanceM(a: GeoPoint, b: GeoPoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  const dLon = (b.lon - a.lon) * DEG_TO_RAD * cosLat * EARTH_RADIUS_M;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD * EARTH_RADIUS_M;
  return Math.hypot(dLon, dLat);
}

function pathLengthM(points: readonly FareZonePoint[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += distanceM(points[i], points[i + 1]);
  return total;
}

// Walks a CLOSED ring (ring[0] === ring[ring.length-1]) from one edge to
// another in a single fixed direction — forward (increasing index, with
// wraparound) if `forward` is true, backward otherwise. Used by
// ringWalkShorterArc below to build both candidate paths before picking
// the shorter one; not exported on its own since a caller choosing the
// wrong direction by hand would defeat the point of "shortest arc."
// Pushes `point` only if it isn't already an exact real-world duplicate
// of whatever's currently last in `into` — mirrors coastlineWalkBetween's
// own fix (coastline-clip.mts) for the exact same real bug: `toPoint` is
// a snap ONTO an edge, which very often lands exactly on one of that
// edge's own two real vertices (a click close to a corner clamps
// straight to it) — pushing the walked vertex and then the snap point
// right after it, unconditionally, produced a bit-identical duplicate at
// the seam every time that happened (confirmed live, 2026-11-15: a real
// saved zone came back 66% exact-duplicate points, directly explaining
// the long-running "spike" reports — a duplicate/zero-length neighbour
// breaks pushPointOffRoad's own local-direction calculation).
function pushDedup(into: FareZonePoint[], point: FareZonePoint): void {
  const last = into[into.length - 1];
  if (!last || !sameRealPoint(last, point)) into.push(point);
}

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
      pushDedup(walked, ring[i]);
    }
  } else {
    while (i !== toEdge) {
      pushDedup(walked, ring[i]);
      i = (i - 1 + n) % n;
    }
  }
  pushDedup(walked, toPoint);
  return walked;
}

// Walks a closed area-boundary ring between two of its own edge
// locations, choosing whichever of the two possible directions around
// the ring is the shorter real distance — DESIGN.md's own "finding the
// shortest/correct arc between two clicked points along it," genuinely
// different from coastlineWalkBetween (coastline-clip.mts), which only
// resolves the same ambiguity for a chain that's EFFECTIVELY closed
// (two ends that happen to sit close together), not one that's always a
// true ring the way an area boundary always is.
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
// boundaries, or one/both too far from any area) — the caller then
// falls back to a plain straight line, same "big gap" treatment as
// coastline-following and the original feature spec's own point (3).
export function areaClusterFollowBetween(from: ClusterSnap, to: ClusterSnap, boundaries: readonly FareZonePoint[][]): FareZonePoint[] | null {
  if (from.boundaryIndex !== to.boundaryIndex) return null;
  return ringWalkShorterArc(boundaries[from.boundaryIndex], from.edgeIndex, from.point, to.edgeIndex, to.point);
}
