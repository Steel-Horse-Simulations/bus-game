// Shared geometry helper, factored out of coastline-clip.mts (2026-11-05)
// when building-cluster.mts needed the exact same "nearest point across
// several polylines, with a max-distance cutoff" logic for building
// boundary rings instead of coastline chains — CLAUDE.md's own "build it
// once as a shared component, not three times" principle. A closed ring
// (first point repeats as the last) and an open chain both work with the
// same consecutive-pair loop, so one function covers both callers.
//
// Flat equirectangular projection centred on the query point's own
// latitude — the same approximation this project's existing geometry
// (point_to_segment_closest in rust/game-wasm/src/lib.rs, and the
// original version of this in coastline-clip.mts) already makes;
// reasonable at the scale zones/buildings are drawn at.

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface NearestPointOnPolylines {
  point: GeoPoint;
  // Index into the `polylines` array this point fell on.
  polylineIndex: number;
  // Index of the edge the point fell on: polyline[edgeIndex] ->
  // polyline[edgeIndex + 1].
  edgeIndex: number;
}

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

export function nearestPointOnPolylines(point: GeoPoint, polylines: readonly GeoPoint[][], maxDistanceM: number): NearestPointOnPolylines | null {
  const cosLat = Math.cos(point.lat * DEG_TO_RAD);
  const toXY = (p: GeoPoint): [number, number] => [p.lon * DEG_TO_RAD * cosLat * EARTH_RADIUS_M, p.lat * DEG_TO_RAD * EARTH_RADIUS_M];
  const fromXY = (x: number, y: number): GeoPoint => ({ lon: x / (cosLat * EARTH_RADIUS_M) / DEG_TO_RAD, lat: y / EARTH_RADIUS_M / DEG_TO_RAD });
  const [px, py] = toXY(point);

  let bestDist = Infinity;
  let best: NearestPointOnPolylines | null = null;
  for (let c = 0; c < polylines.length; c++) {
    const polyline = polylines[c];
    for (let i = 0; i < polyline.length - 1; i++) {
      const [ax, ay] = toXY(polyline[i]);
      const [bx, by] = toXY(polyline[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { point: fromXY(cx, cy), polylineIndex: c, edgeIndex: i };
      }
    }
  }
  return bestDist <= maxDistanceM ? best : null;
}
