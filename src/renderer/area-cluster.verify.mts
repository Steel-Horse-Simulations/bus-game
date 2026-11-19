// Manual verification for area-cluster.mts (T118/T139, renamed from
// building-cluster.mts 2026-11-13 — see that file's own header comment),
// run directly with
// `node --experimental-strip-types src/renderer/area-cluster.verify.mts`.
import { unionAreaPolygons, nearestPointOnAreaBoundary, ringWalkShorterArc, areaClusterFollowBetween, nearestVertexOfRing } from "./area-cluster.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function boundingBoxOf(ring: { lon: number; lat: number }[]): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  return {
    minLon: Math.min(...ring.map((p) => p.lon)),
    maxLon: Math.max(...ring.map((p) => p.lon)),
    minLat: Math.min(...ring.map((p) => p.lat)),
    maxLat: Math.max(...ring.map((p) => p.lat)),
  };
}

// --- unionAreaPolygons ---

const areaA = [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0, lat: 1 }];
// Adjacent to A, sharing A's own right-hand edge (lon=1) exactly.
const areaB = [{ lon: 1, lat: 0 }, { lon: 2, lat: 0 }, { lon: 2, lat: 1 }, { lon: 1, lat: 1 }];
// Far away from both — should never merge with A/B.
const areaC = [{ lon: 10, lat: 0 }, { lon: 11, lat: 0 }, { lon: 11, lat: 1 }, { lon: 10, lat: 1 }];

assert(unionAreaPolygons([]).length === 0, "unioning nothing returns no boundaries");

{
  const [boundary] = unionAreaPolygons([areaA]);
  const box = boundingBoxOf(boundary);
  assert(box.minLon === 0 && box.maxLon === 1 && box.minLat === 0 && box.maxLat === 1, "a single area unions to its own unchanged boundary");
}

{
  const merged = unionAreaPolygons([areaA, areaB]);
  assert(merged.length === 1, `two touching areas should merge into exactly one boundary, got ${merged.length}`);
  const box = boundingBoxOf(merged[0]);
  assert(box.minLon === 0 && box.maxLon === 2 && box.minLat === 0 && box.maxLat === 1, `the merged boundary should span the full 2x1 rectangle, got ${JSON.stringify(box)}`);
  // Union removes the shared internal edge — the real outer boundary of
  // a 2x1 rectangle has exactly 4 corners (5 with the closing point
  // repeated), not 8 (which a failed/no-op union would leave as two
  // separate 4-corner rings concatenated).
  assert(merged[0].length === 5, `the merged rectangle's own ring should have 4 real corners (5 with closure), got ${merged[0].length}`);
}

{
  const all = unionAreaPolygons([areaA, areaB, areaC]);
  assert(all.length === 2, `A+B merge but C stays separate: expected 2 boundaries, got ${all.length}`);
  const boxes = all.map(boundingBoxOf).sort((a, b) => a.minLon - b.minLon);
  assert(boxes[0].maxLon === 2, "the first boundary is the merged A+B rectangle");
  assert(boxes[1].minLon === 10 && boxes[1].maxLon === 11, "the second boundary is C, untouched and unmerged");
}

// --- nearestPointOnAreaBoundary ---

{
  const merged = unionAreaPolygons([areaA, areaB]);
  const snap = nearestPointOnAreaBoundary({ lon: 1, lat: 0 }, merged, 1_000_000);
  assert(snap !== null, "a click right on the merged boundary's own edge snaps");
  assert(Math.abs(snap!.point.lon - 1) < 1e-9 && Math.abs(snap!.point.lat - 0) < 1e-9, `should snap exactly to (1,0), got (${snap!.point.lon}, ${snap!.point.lat})`);

  const farClick = nearestPointOnAreaBoundary({ lon: 100, lat: 100 }, merged, 1); // 1 metre cutoff, genuinely nothing nearby
  assert(farClick === null, "a click far beyond the cutoff finds nothing");
}

// --- ringWalkShorterArc ---

{
  // A 4x4 square ring, edges of length 4 each (perimeter 16).
  const square = [{ lon: 0, lat: 0 }, { lon: 4, lat: 0 }, { lon: 4, lat: 4 }, { lon: 0, lat: 4 }, { lon: 0, lat: 0 }];
  // From a point 1 unit along edge 0, to a point 1 unit along edge 1 —
  // the forward way (through just ring[1]) is 3+1=4 units; the backward
  // way (through ring[0]/ring[3]/ring[2]) is 1+4+4+3=12 units.
  const fromPoint = { lon: 1, lat: 0 };
  const toPoint = { lon: 4, lat: 1 };
  const path = ringWalkShorterArc(square, 0, fromPoint, 1, toPoint);
  const visitsRing1Directly = path.some((p) => p.lon === 4 && p.lat === 0);
  const visitsRing3 = path.some((p) => p.lon === 0 && p.lat === 4);
  assert(visitsRing1Directly, "the shorter (forward) arc passes through the square's own (4,0) corner");
  assert(!visitsRing3, "the shorter arc must NOT take the long way round through (0,4)");
  assert(path[0].lon === 1 && path[0].lat === 0, "the path starts exactly at fromPoint");
  assert(path[path.length - 1].lon === 4 && path[path.length - 1].lat === 1, "the path ends exactly at toPoint");
}

// --- areaClusterFollowBetween ---

{
  const merged = unionAreaPolygons([areaA, areaB, areaC]);
  const snapOnA = nearestPointOnAreaBoundary({ lon: 0, lat: 0.5 }, merged, 1_000_000)!;
  const snapOnB = nearestPointOnAreaBoundary({ lon: 2, lat: 0.5 }, merged, 1_000_000)!;
  const follow = areaClusterFollowBetween(snapOnA, snapOnB, merged);
  assert(follow !== null, "two points on the same merged A+B boundary trace a real path between them");
  assert(follow!.length >= 2, "the traced path has at least a start and end point");

  const snapOnC = nearestPointOnAreaBoundary({ lon: 10, lat: 0.5 }, merged, 1_000_000)!;
  const gapFollow = areaClusterFollowBetween(snapOnA, snapOnC, merged);
  assert(gapFollow === null, "A and C are on different, unconnected boundaries — a genuine gap, not traced");
}

// --- nearestVertexOfRing (DESIGN.md's confirmed points 4/5) ---

{
  const square = [{ lon: 0, lat: 0 }, { lon: 4, lat: 0 }, { lon: 4, lat: 4 }, { lon: 0, lat: 4 }, { lon: 0, lat: 0 }];
  const nearTopRight = nearestVertexOfRing(square, { lon: 3.9, lat: 3.9 }, 1_000_000)!;
  assert(nearTopRight.lon === 4 && nearTopRight.lat === 4, `a point just inside the top-right corner should pick that corner, got (${nearTopRight.lon}, ${nearTopRight.lat})`);

  const nearBottomLeft = nearestVertexOfRing(square, { lon: 0.1, lat: -0.1 }, 1_000_000)!;
  assert(nearBottomLeft.lon === 0 && nearBottomLeft.lat === 0, `a point just outside the bottom-left corner should still pick that corner, got (${nearBottomLeft.lon}, ${nearBottomLeft.lat})`);

  // A point on an EDGE's own midpoint, nearest to neither endpoint by
  // more than the other — nearestPointOnAreaBoundary would land
  // exactly here (mid-edge); nearestVertexOfRing must still pick an
  // actual corner, never a mid-edge point.
  const onEdgeMidpoint = nearestVertexOfRing(square, { lon: 2, lat: 0 }, 1_000_000)!;
  const isARealCorner = square.slice(0, -1).some((v) => v.lon === onEdgeMidpoint.lon && v.lat === onEdgeMidpoint.lat);
  assert(isARealCorner, `even equidistant from two corners, the result must be one of the ring's real vertices, got (${onEdgeMidpoint.lon}, ${onEdgeMidpoint.lat})`);

  // Real live bug, 2026-11-14: a large polygon whose own OSM geometry
  // only records vertices at its true corners can have its globally-
  // nearest vertex sitting far from a click made partway along a long
  // edge — bridging to it produced a visible spike (jump away from the
  // road and straight back). `nearestVertexOfRing` must refuse to
  // return a corner at all once every real vertex is further away than
  // maxDistanceM, rather than always returning *some* vertex regardless
  // of how far it really is.
  const farAway = nearestVertexOfRing(square, { lon: 2, lat: 0 }, 1);
  assert(farAway === null, `no real vertex of this square is within 1m of (2,0) — expected null, got ${JSON.stringify(farAway)}`);
}

// --- real duplicate-point bug (2026-11-15, confirmed via a live human-
// driven click trace against a real saved zone, which came back 66%
// exact-duplicate points) ---
//
// `toPoint` is a snap ONTO an edge, which very often lands exactly on
// that edge's own starting vertex (a click close to a corner clamps
// straight to it). walkRingDirection's old code unconditionally pushed
// the walked vertex and then toPoint right after it, producing a
// bit-identical duplicate at the seam whenever that happened — exactly
// the shape of duplicate found in the real saved zone. A duplicate/zero-
// length neighbour breaks pushPointOffRoad's own local-direction
// calculation downstream (fare-zone-road-pushout.mts), which is the real
// cause of the long-running "spike" reports this was mistaken for.
{
  const square = [{ lon: 0, lat: 0 }, { lon: 4, lat: 0 }, { lon: 4, lat: 4 }, { lon: 0, lat: 4 }, { lon: 0, lat: 0 }];
  const fromPoint = { lon: 1, lat: 0 }; // 1 unit along edge 0
  // toPoint snaps exactly onto ring[1] itself — the real shape of the bug.
  const toPoint = { lon: 4, lat: 0 };
  const path = ringWalkShorterArc(square, 0, fromPoint, 1, toPoint);
  let duplicateFound = false;
  for (let i = 0; i + 1 < path.length; i++) {
    if (path[i].lon === path[i + 1].lon && path[i].lat === path[i + 1].lat) duplicateFound = true;
  }
  assert(!duplicateFound, `a walk whose toPoint coincides with a real ring vertex must not produce a duplicate point, got ${JSON.stringify(path)}`);
  assert(path[path.length - 1].lon === 4 && path[path.length - 1].lat === 0, "the path still correctly ends at toPoint");

  // Mirror case, via the same exported ringWalkShorterArc entry point
  // (walkRingDirection itself is deliberately not exported — see its own
  // comment): fromPoint coincides exactly with its own edge's start
  // vertex, toPoint also coincides with ITS edge's start vertex.
  const fromPointAtVertex = { lon: 4, lat: 0 }; // exactly ring[1]
  const toPointAtVertex = { lon: 4, lat: 4 }; // exactly ring[2]
  const path2 = ringWalkShorterArc(square, 1, fromPointAtVertex, 2, toPointAtVertex);
  let duplicateFound2 = false;
  for (let i = 0; i + 1 < path2.length; i++) {
    if (path2[i].lon === path2[i + 1].lon && path2[i].lat === path2[i + 1].lat) duplicateFound2 = true;
  }
  assert(!duplicateFound2, `a walk whose from/toPoint coincide with real ring vertices must not produce a duplicate point, got ${JSON.stringify(path2)}`);
}

console.log("\nAll area-cluster checks passed.");
