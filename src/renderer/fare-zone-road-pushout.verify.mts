// Manual verification for fare-zone-road-pushout.mts (DESIGN.md §9), run
// directly with
// `node --experimental-strip-types src/renderer/fare-zone-road-pushout.verify.mts`
// — same pattern as this project's other .verify.mts files. Synthetic
// edges/points throughout: the real nearest-edge search is Rust/WASM
// (`Router::nearest_road_edge_info`), so this only needs to prove the
// TypeScript-side geometry — which points get pushed, in which direction,
// and (the whole point of the 2026-11-14 redesign) sliding ALONG the
// ring's own pre-existing line rather than jumping perpendicular to the
// road whenever that line isn't already running alongside it.
import { computeRingCentroid, pushOutRoadSnappedPoints, pushPointOffRoad, type FareZonePoint, type NearestRoadEdge } from "./fare-zone-road-pushout.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function distanceM(a: FareZonePoint, b: FareZonePoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dLon = (b.lon - a.lon) * (Math.PI / 180) * cosLat * 6_371_000;
  const dLat = (b.lat - a.lat) * (Math.PI / 180) * 6_371_000;
  return Math.hypot(dLon, dLat);
}

// How far off the straight line through (a, b) a point sits, in real
// metres — used to confirm a pushed point stayed ON the ring's own
// pre-existing line rather than jumping off it.
function perpDistanceFromLineM(p: FareZonePoint, a: FareZonePoint, b: FareZonePoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const toXY = (q: FareZonePoint) => ({ x: q.lon * (Math.PI / 180) * cosLat * 6_371_000, y: q.lat * (Math.PI / 180) * 6_371_000 });
  const A = toXY(a);
  const B = toXY(b);
  const P = toXY(p);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  const cross = dx * (P.y - A.y) - dy * (P.x - A.x);
  return Math.abs(cross) / len;
}

// --- computeRingCentroid ---

assert(computeRingCentroid([]).lon === 0 && computeRingCentroid([]).lat === 0, "an empty ring's centroid is the plain (0, 0) fallback");

{
  const square: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 2, lat: 0 },
    { lon: 2, lat: 2 },
    { lon: 0, lat: 2 },
  ];
  const c = computeRingCentroid(square);
  assert(c.lon === 1 && c.lat === 1, `expected the mean of a 2x2 square's own 4 corners to be (1, 1), got (${c.lon}, ${c.lat})`);
}

// --- pushPointOffRoad ---
//
// A north-south road at lon=0 (the same shape the old Rust tests used),
// width 5.5m, so the expected push distance is always 5.5/2 + 15 = 17.75m.
const nsRoad: NearestRoadEdge = { distM: 0, aLon: 0, aLat: 0, bLon: 0, bLat: 0.1, widthM: 5.5 };
const EXPECTED_PUSH_M = 5.5 / 2 + 15;

// The boundary's own local line through the point ALSO runs north-south
// (parallel to the road) — every point on it wants to land on the same
// offset line regardless of position, so this must fall back to the
// straightforward perpendicular push, exactly like the old behaviour.
{
  const point: FareZonePoint = { lon: 0, lat: 0.05 };
  const prev: FareZonePoint = { lon: 0, lat: 0.04 };
  const next: FareZonePoint = { lon: 0, lat: 0.06 };
  const centroid: FareZonePoint = { lon: -0.001, lat: 0.05 }; // interior to the west
  const result = pushPointOffRoad(point, nsRoad, centroid, prev, next);
  assert(result.lon > point.lon, `interior is west, so the point should be pushed east, got lon ${result.lon}`);
  const movedM = distanceM(point, result);
  assert(Math.abs(movedM - EXPECTED_PUSH_M) < 0.1, `a boundary running alongside the road should push by exactly width/2+15 = ${EXPECTED_PUSH_M}m, moved ${movedM}m`);
}

// The real live bug (2026-11-14): the boundary's own local line comes in
// from the interior at an angle and continues past the road to the far
// side — the pushed point must slide ALONG that pre-existing line until
// it clears the road, not jump off perpendicular to it. Confirmed two
// ways: the result stays collinear with prev/next (no kink), and it
// still sits the correct distance from the road.
{
  const point: FareZonePoint = { lon: 0, lat: 0.05 };
  const prev: FareZonePoint = { lon: -0.005, lat: 0.045 }; // from the interior, southwest, a clean 45° approach
  const next: FareZonePoint = { lon: 0.005, lat: 0.055 }; // continuing past the road, northeast
  const centroid: FareZonePoint = { lon: -0.005, lat: 0.045 }; // interior is roughly where prev is
  const result = pushPointOffRoad(point, nsRoad, centroid, prev, next);

  const kinkM = perpDistanceFromLineM(result, prev, next);
  assert(kinkM < 0.01, `the pushed point must stay on the pre-existing prev->next line (no kink), was ${kinkM}m off it`);

  // It should NOT have landed on a pure perpendicular (due-east/west)
  // translation of the original point — that's exactly the old, wrong
  // behaviour this redesign replaces.
  assert(Math.abs(result.lat - point.lat) > 1e-6, "a pure perpendicular push would keep the same latitude — this must not, since it slid along the angled line instead");
}

// The real live regression (2026-11-15): a boundary direction only a
// SHALLOW angle off parallel to the road (not exactly parallel, so the
// old raw-determinant check let it through) needs an enormous slide to
// reach the target offset line — confirmed against a real saved zone,
// several consecutive points slid 147-183m sideways this way, producing
// dramatic criss-crossing spikes. A direction this shallow must be
// treated the same as the parallel case (the straightforward
// perpendicular fallback), not given a technically-valid but
// geometrically absurd slide.
{
  const point: FareZonePoint = { lon: 0, lat: 0.05 };
  // ~11° off parallel to the north-south road — shallow enough that the
  // real bug's own naive check let it through.
  const prev: FareZonePoint = { lon: -0.001, lat: 0.045 };
  const next: FareZonePoint = { lon: 0.001, lat: 0.055 };
  const centroid: FareZonePoint = { lon: -0.001, lat: 0.045 };
  const result = pushPointOffRoad(point, nsRoad, centroid, prev, next);
  const movedM = distanceM(point, result);
  assert(
    Math.abs(movedM - EXPECTED_PUSH_M) < 0.5,
    `a shallow-angle approach must fall back to the plain perpendicular push (width/2+15 = ${EXPECTED_PUSH_M}m), not an enormous slide — moved ${movedM}m`,
  );
}

// When the boundary's own local direction is itself parallel to the
// road (a zero/near-zero determinant), sliding along it can't locate a
// sensible point — must fall back to the straightforward perpendicular
// push rather than producing anything degenerate.
{
  const point: FareZonePoint = { lon: 0, lat: 0.05 };
  const prev: FareZonePoint = { lon: 0, lat: 0.049 };
  const next: FareZonePoint = { lon: 0, lat: 0.051 }; // exactly parallel to the road, like the first test
  const centroid: FareZonePoint = { lon: 0.001, lat: 0.05 }; // interior to the east this time
  const result = pushPointOffRoad(point, nsRoad, centroid, prev, next);
  assert(result.lon < point.lon, `interior is east, so the fallback should still push west, got lon ${result.lon}`);
  const movedM = distanceM(point, result);
  assert(Math.abs(movedM - EXPECTED_PUSH_M) < 0.1, `the parallel-direction fallback should still push by exactly width/2+15 = ${EXPECTED_PUSH_M}m, moved ${movedM}m`);
}

// --- pushOutRoadSnappedPoints ---

// A point whose nearest edge comes back null (nothing found at all) is
// left completely unchanged.
{
  const points: FareZonePoint[] = [
    { lon: 1, lat: 1 },
    { lon: 2, lat: 2 },
  ];
  const result = pushOutRoadSnappedPoints(points, () => null);
  assert(result[0].lon === points[0].lon && result[0].lat === points[0].lat, "untouched point 0 should keep its own coordinates");
  assert(result[1].lon === points[1].lon && result[1].lat === points[1].lat, "untouched point 1 should keep its own coordinates");
}

// A point whose nearest road is further away than the real cutoff is
// left unchanged too — only genuinely road-side points move.
{
  const points: FareZonePoint[] = [{ lon: 1, lat: 1 }];
  const result = pushOutRoadSnappedPoints(points, () => ({ distM: 50, aLon: 0, aLat: 0, bLon: 0, bLat: 0.1, widthM: 5.5 }));
  assert(result[0].lon === 1 && result[0].lat === 1, "a point 50m from the nearest road is not at its side — expected it unchanged");
}

// A point genuinely close to the road gets pushed, using its own real
// ring neighbours (confirming the wiring, not re-proving the geometry
// already covered by pushPointOffRoad's own tests above).
{
  const points: FareZonePoint[] = [
    { lon: -0.005, lat: 0.045 }, // a clean 45° approach, well clear of the parallel-fallback threshold
    { lon: 0, lat: 0.05 }, // the one genuinely on the road
    { lon: 0.005, lat: 0.055 },
  ];
  const result = pushOutRoadSnappedPoints(points, (lon, lat) => (lon === 0 && lat === 0.05 ? { distM: 0, aLon: 0, aLat: 0, bLon: 0, bLat: 0.1, widthM: 5.5 } : null));
  assert(result[0].lon === points[0].lon && result[0].lat === points[0].lat, "the non-road neighbour before it is untouched");
  assert(result[2].lon === points[2].lon && result[2].lat === points[2].lat, "the non-road neighbour after it is untouched");
  assert(result[1].lon !== points[1].lon || result[1].lat !== points[1].lat, "the genuinely road-side point moved");
  const kinkM = perpDistanceFromLineM(result[1], points[0], points[2]);
  assert(kinkM < 0.01, `the moved point should still lie on the original line through its own real neighbours, was ${kinkM}m off it`);
}

// --- duplicate-neighbour input (2026-11-15) ---
//
// Real bug found via a live human-driven click trace: a saved zone came
// back 66% exact-duplicate points, because coastlineWalkBetween/
// areaClusterFollowBetween (now fixed at the source) could push the same
// real-world point twice in a row. This confirms pushPointOffRoad's own
// existing degenerate-neighbour guard (the `Math.hypot(tx, ty) < 1e-9`
// check) already handles the resulting coincident prev/next case safely
// — it was never broken, the real problem was the duplicate ENTRIES
// reaching it in the first place (now fixed upstream) — but proves it
// directly rather than leaving it assumed.
{
  const point: FareZonePoint = { lon: 0, lat: 0.05 };
  // prev and next are the exact same coordinate — the degenerate case a
  // duplicate point immediately beside `point` on both sides produces.
  const coincidentNeighbour: FareZonePoint = { lon: 0.005, lat: 0.055 };
  const result = pushPointOffRoad(point, nsRoad, { lon: 10, lat: 0.05 }, coincidentNeighbour, coincidentNeighbour);
  assert(Number.isFinite(result.lon) && Number.isFinite(result.lat), `coincident prev/next must still produce a finite, real point, got ${JSON.stringify(result)}`);
  const pushedDistM = distanceM(point, result);
  assert(
    Math.abs(pushedDistM - 17.75) < 0.01,
    `coincident prev/next must fall back to the plain perpendicular push (5.5/2+15 = 17.75m), got ${pushedDistM}m`,
  );
}

// The subtler real-world shape: `point` itself is a bit-identical
// duplicate of `prev`, but `next` is a genuinely different real point —
// the actual shape the live bug produced (one copy of a repeated vertex
// sliding to a different final position than its own duplicate would
// have, which is what turned a harmless duplicate into a visible kink).
// pushOutRoadSnappedPoints pushes EVERY point independently by its own
// index, so two draftPoints entries that started out bit-identical can
// end up calling pushPointOffRoad with different (prev, next) pairs
// (whichever real neighbours happen to sit on either side of THAT
// particular array index) and so can legitimately end up in different
// places — this is exactly the divergence that read as a "spike" in
// every screenshot this investigation worked from. Confirms the dedup
// fix upstream (fare-zone-drawing.ts's pushDraftPoints, coastline-clip.
// mts/area-cluster.mts's own pushDedup) is what actually has to prevent
// this, not anything pushPointOffRoad could fix on its own — by the
// time two entries are already both in `points`, treating them
// independently is correct, there is no longer any way to tell they
// were "meant" to be the same vertex.
{
  const dupPoint: FareZonePoint = { lon: 0, lat: 0.05 };
  const genuineNext: FareZonePoint = { lon: 0.01, lat: 0.06 };
  const result = pushPointOffRoad(dupPoint, nsRoad, { lon: 10, lat: 0.05 }, dupPoint, genuineNext);
  assert(Number.isFinite(result.lon) && Number.isFinite(result.lat), `point===prev with a genuine next must still produce a finite point, got ${JSON.stringify(result)}`);
}

console.log("\nAll fare-zone-road-pushout checks passed.");
