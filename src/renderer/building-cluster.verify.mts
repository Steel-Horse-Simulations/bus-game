// Manual verification for building-cluster.mts (T118), run directly with
// `node --experimental-strip-types src/renderer/building-cluster.verify.mts`.
import { unionBuildingFootprints, nearestPointOnBuildingBoundary, ringWalkShorterArc, buildingClusterFollowBetween } from "./building-cluster.mts";

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

// --- unionBuildingFootprints ---

const buildingA = [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0, lat: 1 }];
// Adjacent to A, sharing A's own right-hand edge (lon=1) exactly.
const buildingB = [{ lon: 1, lat: 0 }, { lon: 2, lat: 0 }, { lon: 2, lat: 1 }, { lon: 1, lat: 1 }];
// Far away from both — should never merge with A/B.
const buildingC = [{ lon: 10, lat: 0 }, { lon: 11, lat: 0 }, { lon: 11, lat: 1 }, { lon: 10, lat: 1 }];

assert(unionBuildingFootprints([]).length === 0, "unioning nothing returns no boundaries");

{
  const [boundary] = unionBuildingFootprints([buildingA]);
  const box = boundingBoxOf(boundary);
  assert(box.minLon === 0 && box.maxLon === 1 && box.minLat === 0 && box.maxLat === 1, "a single building unions to its own unchanged boundary");
}

{
  const merged = unionBuildingFootprints([buildingA, buildingB]);
  assert(merged.length === 1, `two touching buildings should merge into exactly one boundary, got ${merged.length}`);
  const box = boundingBoxOf(merged[0]);
  assert(box.minLon === 0 && box.maxLon === 2 && box.minLat === 0 && box.maxLat === 1, `the merged boundary should span the full 2x1 rectangle, got ${JSON.stringify(box)}`);
  // Union removes the shared internal edge — the real outer boundary of
  // a 2x1 rectangle has exactly 4 corners (5 with the closing point
  // repeated), not 8 (which a failed/no-op union would leave as two
  // separate 4-corner rings concatenated).
  assert(merged[0].length === 5, `the merged rectangle's own ring should have 4 real corners (5 with closure), got ${merged[0].length}`);
}

{
  const all = unionBuildingFootprints([buildingA, buildingB, buildingC]);
  assert(all.length === 2, `A+B merge but C stays separate: expected 2 boundaries, got ${all.length}`);
  const boxes = all.map(boundingBoxOf).sort((a, b) => a.minLon - b.minLon);
  assert(boxes[0].maxLon === 2, "the first boundary is the merged A+B rectangle");
  assert(boxes[1].minLon === 10 && boxes[1].maxLon === 11, "the second boundary is C, untouched and unmerged");
}

// --- nearestPointOnBuildingBoundary ---

{
  const merged = unionBuildingFootprints([buildingA, buildingB]);
  const snap = nearestPointOnBuildingBoundary({ lon: 1, lat: 0 }, merged, 1_000_000);
  assert(snap !== null, "a click right on the merged boundary's own edge snaps");
  assert(Math.abs(snap!.point.lon - 1) < 1e-9 && Math.abs(snap!.point.lat - 0) < 1e-9, `should snap exactly to (1,0), got (${snap!.point.lon}, ${snap!.point.lat})`);

  const farClick = nearestPointOnBuildingBoundary({ lon: 100, lat: 100 }, merged, 1); // 1 metre cutoff, genuinely nothing nearby
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

// --- buildingClusterFollowBetween ---

{
  const merged = unionBuildingFootprints([buildingA, buildingB, buildingC]);
  const snapOnA = nearestPointOnBuildingBoundary({ lon: 0, lat: 0.5 }, merged, 1_000_000)!;
  const snapOnB = nearestPointOnBuildingBoundary({ lon: 2, lat: 0.5 }, merged, 1_000_000)!;
  const follow = buildingClusterFollowBetween(snapOnA, snapOnB, merged);
  assert(follow !== null, "two points on the same merged A+B boundary trace a real path between them");
  assert(follow!.length >= 2, "the traced path has at least a start and end point");

  const snapOnC = nearestPointOnBuildingBoundary({ lon: 10, lat: 0.5 }, merged, 1_000_000)!;
  const gapFollow = buildingClusterFollowBetween(snapOnA, snapOnC, merged);
  assert(gapFollow === null, "A and C are on different, unconnected boundaries — a genuine gap, not traced");
}

console.log("\nAll building-cluster checks passed.");
