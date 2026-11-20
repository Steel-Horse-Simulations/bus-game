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
import { computeRingCentroid, pushOutRoadSnappedPoints, pushPointOffRoad, pushPointPerpendicular, type FareZonePoint, type NearestRoadEdge } from "./fare-zone-road-pushout.mts";

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
  const result = pushOutRoadSnappedPoints(points, [true, true], () => null);
  assert(result[0].lon === points[0].lon && result[0].lat === points[0].lat, "untouched point 0 should keep its own coordinates");
  assert(result[1].lon === points[1].lon && result[1].lat === points[1].lat, "untouched point 1 should keep its own coordinates");
}

// A point whose nearest road is further away than the real cutoff is
// left unchanged too — only genuinely road-side points move.
{
  const points: FareZonePoint[] = [{ lon: 1, lat: 1 }];
  const result = pushOutRoadSnappedPoints(points, [true], () => ({ distM: 50, aLon: 0, aLat: 0, bLon: 0, bLat: 0.1, widthM: 5.5 }));
  assert(result[0].lon === 1 && result[0].lat === 1, "a point 50m from the nearest road is not at its side — expected it unchanged");
}

// An ISOLATED road-snapped point (non-road-snapped neighbours on both
// sides) gets pushed via the tangent-slide algorithm, using its own real
// ring neighbours (confirming the wiring, not re-proving the geometry
// already covered by pushPointOffRoad's own tests above). Only the
// middle point is flagged road-snapped — its neighbours genuinely are
// "non-road" here, matching the comments below, which is what makes this
// the isolated case rather than a run (see pushOutRoadSnappedPoints' own
// comment on the distinction, 2026-11-20).
{
  const points: FareZonePoint[] = [
    { lon: -0.005, lat: 0.045 }, // a clean 45° approach, well clear of the parallel-fallback threshold
    { lon: 0, lat: 0.05 }, // the one genuinely on the road
    { lon: 0.005, lat: 0.055 },
  ];
  const result = pushOutRoadSnappedPoints(points, [false, true, false], (lon: number, lat: number) =>
    lon === 0 && lat === 0.05 ? { distM: 0, aLon: 0, aLat: 0, bLon: 0, bLat: 0.1, widthM: 5.5 } : null,
  );
  assert(result[0].lon === points[0].lon && result[0].lat === points[0].lat, "the non-road neighbour before it is untouched");
  assert(result[2].lon === points[2].lon && result[2].lat === points[2].lat, "the non-road neighbour after it is untouched");
  assert(result[1].lon !== points[1].lon || result[1].lat !== points[1].lat, "the genuinely road-side point moved");
  const kinkM = perpDistanceFromLineM(result[1], points[0], points[2]);
  assert(kinkM < 0.01, `the moved point should still lie on the original line through its own real neighbours, was ${kinkM}m off it`);
}

// A point with AT LEAST ONE road-snapped neighbour is a run, not an
// isolated point — dispatched to `pushPointPerpendicularAlongPath`
// (direction from the ring's own real path, not the tangent-slide
// algorithm, and not the raw edge-direction `pushPointPerpendicular`
// either — see that function's own 2026-11-20 "second round" comment).
//
// A real, dense-junction-shaped run: 9 consecutive road-snapped points
// in a dead-straight east-west line (~5.5m apart, matching the real
// Glasgow junction's own short inter-node spacing), with the MIDDLE
// point's own `nearestRoadEdge` deliberately given a north-south
// direction — the exact shape a genuinely different, independently-
// resolved short OSM segment can have at a junction, even though the
// drawn path itself runs smoothly east-west straight through it.
// `pushPointPerpendicularAlongPath` never reads an edge's own a/b
// direction at all (only its width, for push magnitude) — confirmed
// directly: the result must move in LATITUDE only (perpendicular to the
// real east-west path), not longitude (which is what the edge's own
// north-south direction would have produced had it been used).
{
  const points: FareZonePoint[] = [];
  for (let i = 0; i < 10; i++) points.push({ lon: i * 0.00005, lat: 0.05 }); // ~5.5m spacing, dead straight
  const roadSnapped = points.map((_, i) => i < 9); // index 9 bounds the run
  const centroid = { lon: 0.0002, lat: 0.04 }; // interior is south — push should go north (lat increases)
  const wrongDirectionEdge: NearestRoadEdge = { distM: 0, aLon: 0.0002, aLat: 0.049, bLon: 0.0002, bLat: 0.051, widthM: 5.5 }; // north-south, 90° off the real path
  const straightEdge: NearestRoadEdge = { distM: 0, aLon: 0, aLat: 0.05, bLon: 0.00045, bLat: 0.05, widthM: 5.5 }; // matches the real path direction

  const result = pushOutRoadSnappedPoints(points, roadSnapped, (lon, lat) => (lon === points[4].lon && lat === points[4].lat ? wrongDirectionEdge : straightEdge));

  const EXPECTED_PUSH_M = 5.5 / 2 + 15;
  const movedLatM = distanceM(points[4], { lon: points[4].lon, lat: result[4].lat });
  assert(
    Math.abs(movedLatM - EXPECTED_PUSH_M) < 0.5,
    `the middle point's push must track the real path's own north-south perpendicular (width/2+15=${EXPECTED_PUSH_M}m of latitude movement), regardless of its own resolved edge's direction — moved ${movedLatM.toFixed(2)}m of latitude`,
  );
  assert(
    Math.abs(result[4].lon - points[4].lon) < 1e-9,
    `the middle point must NOT move in longitude at all — a push driven by its own (deliberately wrong, north-south) edge direction would have, got lon ${result[4].lon} vs original ${points[4].lon}`,
  );
  assert(result[4].lat > points[4].lat, "the interior is south, so the push must increase latitude (move north)");
}

// --- road-snap provenance gate (2026-11-20 rewrite) ---
//
// The real fix for the original "a Service-class driveway next to a
// point that was correctly on its own real landuse edge" bug: that point
// was never actually road-snapped while drawing, so it must not be
// pushed even though a real, close road edge exists right next to it —
// proving the provenance flag, not road class, is what actually excludes
// that case now.
{
  const points: FareZonePoint[] = [{ lon: 1, lat: 1 }];
  const result = pushOutRoadSnappedPoints(points, [false], () => ({ distM: 0, aLon: 0, aLat: 0, bLon: 0, bLat: 0.1, widthM: 5.5 }));
  assert(
    result[0].lon === points[0].lon && result[0].lat === points[0].lat,
    "a point that was never road-snapped while drawing must not be pushed, even when a real road edge sits right at its side",
  );
}

// The live-confirmed root cause of "it doesn't even push out from the
// road" (Glasgow, 2026-11-20): a point genuinely road-snapped while
// drawing must be pushed regardless of what road class it's near — this
// mts file has no concept of road class at all any more (that filtering
// used to live in Rust's `nearest_road_edge_info`, removed the same day),
// so this just confirms the provenance flag alone is sufficient to
// trigger a push once a real nearby edge is reported.
{
  const points: FareZonePoint[] = [{ lon: 1, lat: 1 }];
  const result = pushOutRoadSnappedPoints(points, [true], () => ({ distM: 0, aLon: 0, aLat: 0, bLon: 0.9, bLat: 1, widthM: 6.0 }));
  assert(
    result[0].lon !== points[0].lon || result[0].lat !== points[0].lat,
    "a genuinely road-snapped point must be pushed once a real nearby road edge is found, regardless of road class",
  );
}

// --- coastline-snapped points are independently road-eligible too
// (2026-11-21, live user priority fix) ---
//
// The real live report: Kyle of Lochalsh's Main Street runs right along
// the shore, so its own points win via coastline-snapping during drawing
// (a real, deliberate click-handling priority — coastline wins over
// road-snapping, needed for correctly tracing the shore) — which, under
// the 2026-11-20 provenance-only gate, meant these points could NEVER be
// pushed, even though they're genuinely sitting on a real road too. The
// user reported this as "the zone stays in the middle" (of the road).
// Confirmed directly against the real saved zone and the real road
// graph: two real points (indices 104 and 169 of the live save) sit at
// EXACTLY 0.0m from the real coastline AND within `ROAD_SIDE_CUTOFF_M`
// of a real road (1.65m / 3.5m-wide road, and 0.13m / 7.0m-wide road
// respectively) — real evidence this isn't a hypothetical case.
//
// `pushOutRoadSnappedPoints` itself needs no change for this — it was
// always just "push whichever indices this boolean array says to, if
// they're also genuinely close enough" — the fix lives entirely in the
// CALLER (fare-zone-drawing.ts), which now ORs its road-snapped and
// coastline-snapped provenance arrays together before calling this
// function. This test proves that pattern directly: a point flagged
// ONLY as coastline-eligible (not road-snapped at all) still gets
// pushed, using these exact real coordinates/edge facts.
{
  const points: FareZonePoint[] = [
    { lon: -5.7165123, lat: 57.2802039 }, // real neighbour (ring index 103)
    { lon: -5.7166454, lat: 57.2802242 }, // the real coastline-snapped point under test (ring index 104)
    { lon: -5.7168107, lat: 57.2802097 }, // real neighbour (ring index 105)
  ];
  const roadSnapped = [false, false, false]; // none of these were tagged road-snapped — coastline won during drawing
  const coastlineSnapped = [false, true, false]; // only the point under test is coastline-snapped
  const pushEligible = roadSnapped.map((r, i) => r || coastlineSnapped[i]); // the real fix: OR them together
  const realEdge: NearestRoadEdge = { distM: 1.6503712432949595, aLon: -5.7165837, aLat: 57.2799705, bLon: -5.716649599999999, bLat: 57.280459799999996, widthM: 3.5 };
  const result = pushOutRoadSnappedPoints(points, pushEligible, (lon, lat) => (lon === points[1].lon && lat === points[1].lat ? realEdge : null));
  assert(
    result[1].lon !== points[1].lon || result[1].lat !== points[1].lat,
    "a point that is coastline-snapped (not road-snapped) but genuinely sits within ROAD_SIDE_CUTOFF_M of a real road must still be pushed — this is the exact Kyle of Lochalsh 'stays in the middle' bug",
  );
  const movedM = distanceM(points[1], result[1]);
  const expectedM = realEdge.widthM / 2 + 15;
  assert(movedM > expectedM * 0.5 && movedM < expectedM * 1.5, `expected a push of roughly width/2+15=${expectedM}m, got ${movedM.toFixed(1)}m`);

  // Sanity: a coastline-snapped point with NO real nearby road still
  // correctly stays untouched — the OR doesn't bypass the real distance
  // check, it only widens which provenance can REACH that check.
  const farPoints: FareZonePoint[] = [{ lon: 1, lat: 1 }];
  const farResult = pushOutRoadSnappedPoints(farPoints, [true], () => null);
  assert(
    farResult[0].lon === farPoints[0].lon && farResult[0].lat === farPoints[0].lat,
    "a coastline-snapped point with no real road nearby must stay untouched — eligibility alone doesn't force a push",
  );
}

// --- bounded slide across a sweep of tangent angles (2026-11-20) ---
//
// The live-confirmed root cause of "stupid sticking out points" (Glasgow,
// 2026-11-20): for a direction just above the MIN_SIN_ANGLE "running
// alongside" cutoff (20°), the old tangent-intersection slide had no
// upper bound at all, and could require an arbitrarily large real
// distance to reach the target offset line. Sweeps angles from just
// above the cutoff through to perpendicular (90°) and confirms every one
// produces a finite, bounded move — never more than the real geometric
// worst case this file's own pushPointOffRoad comment derives:
// (pushDistM + ROAD_SIDE_CUTOFF_M) / sin(20°).
{
  const ROAD_SIDE_CUTOFF_M = 2.0; // mirrors the module's own private constant
  const pushDistM = 5.5 / 2 + 15; // this road's own width/2 + margin
  const maxSaneSlideM = (pushDistM + ROAD_SIDE_CUTOFF_M) / Math.sin(20 * (Math.PI / 180));

  for (const angleDeg of [20.5, 25, 30, 45, 60, 75, 89]) {
    const point: FareZonePoint = { lon: 0, lat: 0.05 };
    // prev/next span the point at `angleDeg` off the road's own north-
    // south direction, roughly centred on it — same construction style
    // as the file's own existing angled-approach tests above.
    const angleRad = angleDeg * (Math.PI / 180);
    const spanDeg = 0.01; // ~1.1km span in latitude, large enough to be a stable direction at this scale
    const dx = Math.sin(angleRad) * spanDeg;
    const dy = Math.cos(angleRad) * spanDeg;
    const prev: FareZonePoint = { lon: -dx, lat: 0.05 - dy };
    const next: FareZonePoint = { lon: dx, lat: 0.05 + dy };
    const centroid: FareZonePoint = { lon: -dx, lat: 0.05 - dy }; // interior is roughly where prev is
    const result = pushPointOffRoad(point, nsRoad, centroid, prev, next);
    const movedM = distanceM(point, result);
    assert(
      Number.isFinite(result.lon) && Number.isFinite(result.lat),
      `angle ${angleDeg}°: must produce a finite point, got ${JSON.stringify(result)}`,
    );
    assert(
      movedM <= maxSaneSlideM + 0.5,
      `angle ${angleDeg}°: moved ${movedM.toFixed(1)}m, which exceeds the provable worst-case bound of ${maxSaneSlideM.toFixed(1)}m — this is the exact "sticking out point" failure mode`,
    );
  }
}

// A deliberately pathological case proving the cap actually ENGAGES (not
// just that every reasonable test happens to stay under it). `maxSlideM`
// is only provably un-exceedable when `point` genuinely sits within
// `ROAD_SIDE_CUTOFF_M` of the road (pushOutRoadSnappedPoints' own
// precondition before ever calling this) — so to actually force the cap
// to engage, this deliberately calls `pushPointOffRoad` directly (it has
// no distance precondition of its own) with a point 10m off the road's
// centreline at a shallow near-threshold angle, well outside that
// contract. Without the cap, this is exactly the shape of input (small,
// dense-ring tangent length at a near-parallel angle) that produced the
// real 50-95m "sticking out" moves confirmed live against the Glasgow
// zone. With it, the result must fall back to the plain perpendicular
// push rather than an oversized slide.
{
  const offCentreLon = 30 / (6_371_000 * (Math.PI / 180)); // 30m east of the road's own lon=0 centreline — outside the normal ROAD_SIDE_CUTOFF_M contract, confirmed by direct scan to trip the cap at this angle
  const point: FareZonePoint = { lon: offCentreLon, lat: 0.05 };
  const angleRad = 20.3 * (Math.PI / 180); // just above the 20° cutoff
  const spanDeg = 0.0005; // a short, dense-ring-like span (~55m) — small tangentLen is exactly what let the old bug's slide blow up
  const dx = Math.sin(angleRad) * spanDeg;
  const dy = Math.cos(angleRad) * spanDeg;
  const prev: FareZonePoint = { lon: offCentreLon - dx, lat: 0.05 - dy };
  const next: FareZonePoint = { lon: offCentreLon + dx, lat: 0.05 + dy };
  const centroid: FareZonePoint = { lon: offCentreLon - dx, lat: 0.05 - dy };
  const result = pushPointOffRoad(point, nsRoad, centroid, prev, next);
  const movedM = distanceM(point, result);
  // The plain perpendicular push for a point already 10m off-centre is
  // the road's own offset distance PLUS however far it is back to the
  // centreline (direction-dependent) — rather than re-deriving that
  // exactly, just confirm the cap actually did its job: the result must
  // be nowhere near the >100m an uncapped slide would have produced here
  // (verified by temporarily removing the cap during development), and
  // must match the real fallback function's own output exactly, proving
  // the cap branch — not a coincidentally-similar tangent result — is
  // what actually ran.
  const fallbackExpected = pushPointPerpendicular(point, nsRoad, centroid);
  assert(
    Math.abs(result.lon - fallbackExpected.lon) < 1e-9 && Math.abs(result.lat - fallbackExpected.lat) < 1e-9,
    `a point far outside the normal distance contract at a near-threshold angle must trip the slide cap and fall back to the plain perpendicular push, got ${JSON.stringify(result)} (moved ${movedM.toFixed(1)}m), expected ${JSON.stringify(fallbackExpected)}`,
  );
}

// --- real road-following run: Auckland Street, Glasgow (2026-11-20) ---
//
// The actual regression that prompted this whole rewrite — a real
// `find_any_road_route` result (captured live against the real road
// graph, not synthesised) along Auckland Street, a Residential road, the
// exact road a real live-drawn zone road-followed along with zero
// push-out under the old Tertiary-only filter, and — once that filter
// was removed — a visible "sticking out points" zigzag under the old
// per-point tangent-slide algorithm (confirmed via a throwaway
// reconstruction run as part of this investigation, since discarded: not
// kept as a permanent test because snapping an already-pushed point back
// onto a nearby road for a reconstruction isn't a reliable stand-in for
// the real original draft points — this one real, cleanly-captured
// `find_any_road_route` run is the trustworthy regression case).
// Confirms the actual fix: every point in a road-following RUN (at least
// one road-snapped ring neighbour) is pushed with the plain, direction-
// agnostic `pushPointPerpendicular`, not the tangent-slide algorithm,
// since the latter was only ever designed for a genuinely isolated point
// — every point here moves a tight, consistent distance (matching
// width/2+15 for each edge's own real width) and the whole run traces
// the road's real gentle curve with zero turn-angle reversal.
{
  const realRun: { point: FareZonePoint; edge: NearestRoadEdge }[] = [
    { point: { lon: -4.2622688, lat: 55.883063799999995 }, edge: { distM: 0, aLon: -4.2622688, aLat: 55.883063799999995, bLon: -4.2625804, bLat: 55.8829376, widthM: 5.5 } },
    { point: { lon: -4.2625804, lat: 55.8829376 }, edge: { distM: 0, aLon: -4.2622688, aLat: 55.883063799999995, bLon: -4.2625804, bLat: 55.8829376, widthM: 5.5 } },
    { point: { lon: -4.262683, lat: 55.8828776 }, edge: { distM: 0, aLon: -4.2625804, aLat: 55.8829376, bLon: -4.262683, bLat: 55.8828776, widthM: 5.5 } },
    { point: { lon: -4.262847799999999, lat: 55.882781099999995 }, edge: { distM: 0, aLon: -4.262683, aLat: 55.8828776, bLon: -4.262847799999999, bLat: 55.882781099999995, widthM: 5.5 } },
    { point: { lon: -4.2631467999999995, lat: 55.882565 }, edge: { distM: 0, aLon: -4.262847799999999, aLat: 55.882781099999995, bLon: -4.2631467999999995, bLat: 55.882565, widthM: 5.5 } },
    { point: { lon: -4.263346299999999, lat: 55.8823827 }, edge: { distM: 0, aLon: -4.2631467999999995, aLat: 55.882565, bLon: -4.263346299999999, bLat: 55.8823827, widthM: 5.5 } },
    { point: { lon: -4.2635817, lat: 55.8821303 }, edge: { distM: 0, aLon: -4.263346299999999, aLat: 55.8823827, bLon: -4.2635817, bLat: 55.8821303, widthM: 5.5 } },
    { point: { lon: -4.2636793, lat: 55.881854499999996 }, edge: { distM: 0, aLon: -4.2635817, aLat: 55.8821303, bLon: -4.2636793, bLat: 55.881854499999996, widthM: 5.5 } },
    { point: { lon: -4.2637648, lat: 55.8810651 }, edge: { distM: 0, aLon: -4.262650799999999, aLat: 55.8811209, bLon: -4.2637648, bLat: 55.8810651, widthM: 5.5 } },
    { point: { lon: -4.2637977, lat: 55.880855 }, edge: { distM: 0, aLon: -4.2637977, aLat: 55.880855, bLon: -4.2638513, bLat: 55.8805476, widthM: 3.5 } },
    { point: { lon: -4.2638513, lat: 55.8805476 }, edge: { distM: 0, aLon: -4.2637977, aLat: 55.880855, bLon: -4.2638513, bLat: 55.8805476, widthM: 3.5 } },
    { point: { lon: -4.2639469, lat: 55.8796599 }, edge: { distM: 0, aLon: -4.2639469, aLat: 55.8796599, bLon: -4.262815799999999, bLat: 55.8797177, widthM: 5.5 } },
  ];
  // Boundary sentinels (NOT road-snapped), one on each end — without
  // these, treating this 12-point array as its own complete, isolated
  // ring would wrap the far end of the real street back onto its own
  // start as if they were adjacent (`farNeighbourInRun`'s own walk
  // would then illegitimately cross between the two unrelated ends of a
  // real linear street), which never happens in the live app (a real
  // ring always has non-road-snapped points — coastline, area, or just
  // more of the ring — bounding a run on both sides). Placed far away
  // geometrically so they can't be mistaken for genuine road context.
  const SENTINEL_BEFORE: FareZonePoint = { lon: -4.3, lat: 55.9 };
  const SENTINEL_AFTER: FareZonePoint = { lon: -4.2, lat: 55.86 };
  const points = [SENTINEL_BEFORE, ...realRun.map((r) => r.point), SENTINEL_AFTER];
  const roadSnapped = points.map((_, i) => i > 0 && i < points.length - 1);
  const edgeByKey = new Map<string, NearestRoadEdge>(realRun.map((r) => [`${r.point.lon},${r.point.lat}`, r.edge]));
  const result = pushOutRoadSnappedPoints(points, roadSnapped, (lon, lat) => edgeByKey.get(`${lon},${lat}`) ?? null);

  for (let i = 0; i < realRun.length; i++) {
    const movedM = distanceM(points[i + 1], result[i + 1]);
    const expectedM = realRun[i].edge.widthM / 2 + 15;
    assert(Math.abs(movedM - expectedM) < 0.5, `point ${i}: expected a plain width/2+15=${expectedM}m push, moved ${movedM.toFixed(1)}m`);
  }

  const cosLat = Math.cos((55.88 * Math.PI) / 180);
  const toXY = (p: FareZonePoint) => ({ x: p.lon * cosLat * 111_320, y: p.lat * 110_540 });
  // Turn angles only across the real run's own interior points — the
  // sentinel-adjacent seams (index 0 and the last index) are expected to
  // show a sharp "turn" into/out of an unrelated direction, same as a
  // real run meeting a genuinely different snap kind at its own
  // boundary; that's not the thing this regression test is about.
  const xy = result.slice(1, -1).map(toXY);
  for (let i = 1; i < xy.length - 1; i++) {
    const v1 = { x: xy[i].x - xy[i - 1].x, y: xy[i].y - xy[i - 1].y };
    const v2 = { x: xy[i + 1].x - xy[i].x, y: xy[i + 1].y - xy[i].y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    const turnDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    // A tight bound, not just "no outright reversal" (<90°) — the live
    // regression this guards against (2026-11-20, second round) never
    // crossed 90° either (turns of 25-61° on this exact real run were
    // still a visible live "sawtooth"), so a loose bound would not have
    // caught it. Auckland Street's own real gentle curve tops out at
    // ~20° with the far-baseline tangent fix in place.
    assert(turnDeg < 25, `point ${i}: the pushed run shows more turn than this real gentle curve should (${turnDeg.toFixed(1)}deg) — the live "sawtooth" regression never exceeded 90° either, so this bound is what actually catches it`);
  }
}

// --- real road-following run through a genuine DENSE JUNCTION: Ellesmere
// Street / Saracen Street-A879 / Hamiltonhill Road, Glasgow (2026-11-20,
// second round) ---
//
// The actual live report this second round of the rewrite exists for:
// after the first fix (perpendicular-for-runs using each point's own
// independently-resolved edge direction), the user reported a real,
// worse-than-before "sawtooth" near this exact junction. Confirmed
// directly: several short real OSM way segments meet within 3-11m of
// each other here, each with its own bearing that can diverge from the
// ring's own smooth drawn path by 26-90° — `pushPointPerpendicular`'s own
// edge-direction-based normal rotated with that noise, point by point.
// This run (a genuine `find_any_road_route` result, captured live
// against the real road graph, not synthesised) is the regression case
// that first exposed it, and also contains ONE genuine real ~89° corner
// (where Ellesmere Street actually turns onto the side street toward the
// Hamiltonhill Road junction) — the fix must track that real corner
// (expected, not a bug) while NOT fabricating additional turns along the
// otherwise-straight approach to it.
{
  const junctionRun: { point: FareZonePoint; edge: NearestRoadEdge }[] = [
    { point: { lon: -4.2560462999999995, lat: 55.8777465 }, edge: { distM: 0, aLon: -4.2561127999999995, aLat: 55.877810999999994, bLon: -4.2560462999999995, bLat: 55.8777465, widthM: 5.5 } },
    { point: { lon: -4.2557616, lat: 55.877796499999995 }, edge: { distM: 0, aLon: -4.2560462999999995, aLat: 55.8777465, bLon: -4.2557616, bLat: 55.877796499999995, widthM: 13.0 } },
    { point: { lon: -4.2549363, lat: 55.8779361 }, edge: { distM: 0, aLon: -4.2557616, aLat: 55.877796499999995, bLon: -4.2549363, bLat: 55.8779361, widthM: 13.0 } },
    { point: { lon: -4.2548224, lat: 55.877955099999994 }, edge: { distM: 0, aLon: -4.2549363, aLat: 55.8779361, bLon: -4.2548224, bLat: 55.877955099999994, widthM: 13.0 } },
    { point: { lon: -4.2547353, lat: 55.877962999999994 }, edge: { distM: 0, aLon: -4.2548224, aLat: 55.877955099999994, bLon: -4.2547353, bLat: 55.877962999999994, widthM: 13.0 } },
    { point: { lon: -4.2546582, lat: 55.877967299999995 }, edge: { distM: 0, aLon: -4.2547353, aLat: 55.877962999999994, bLon: -4.2546582, bLat: 55.877967299999995, widthM: 13.0 } },
    { point: { lon: -4.254564, lat: 55.877966199999996 }, edge: { distM: 0, aLon: -4.2545760999999995, aLat: 55.8778405, bLon: -4.254564, bLat: 55.877966199999996, widthM: 7.300000190734863 } },
    { point: { lon: -4.2545570999999995, lat: 55.878068799999994 }, edge: { distM: 0, aLon: -4.254564, aLat: 55.877966199999996, bLon: -4.2545570999999995, bLat: 55.878068799999994, widthM: 7.0 } },
    { point: { lon: -4.2545076, lat: 55.878802699999994 }, edge: { distM: 0, aLon: -4.2545570999999995, aLat: 55.878068799999994, bLon: -4.2545076, bLat: 55.878802699999994, widthM: 7.0 } },
    { point: { lon: -4.2544793, lat: 55.878985099999994 }, edge: { distM: 0, aLon: -4.2545076, aLat: 55.878802699999994, bLon: -4.2544793, bLat: 55.878985099999994, widthM: 7.0 } },
    { point: { lon: -4.254452, lat: 55.8794494 }, edge: { distM: 0, aLon: -4.254452, aLat: 55.8794494, bLon: -4.253302199999999, bLat: 55.8794243, widthM: 3.5 } },
  ];
  // Same boundary-sentinel fix as the Auckland Street test above — a
  // bare array of all-road-snapped points gets treated as its OWN closed
  // ring, wrapping the far end back onto the start as if adjacent, which
  // never happens for a real run bounded by other snap kinds on a real
  // ring.
  const SENTINEL_BEFORE: FareZonePoint = { lon: -4.3, lat: 55.9 };
  const SENTINEL_AFTER: FareZonePoint = { lon: -4.2, lat: 55.86 };
  const points = [SENTINEL_BEFORE, ...junctionRun.map((r) => r.point), SENTINEL_AFTER];
  const roadSnapped = points.map((_, i) => i > 0 && i < points.length - 1);
  const edgeByKey = new Map<string, NearestRoadEdge>(junctionRun.map((r) => [`${r.point.lon},${r.point.lat}`, r.edge]));
  const result = pushOutRoadSnappedPoints(points, roadSnapped, (lon, lat) => edgeByKey.get(`${lon},${lat}`) ?? null);

  const cosLat = Math.cos((55.878 * Math.PI) / 180);
  const toXY = (p: FareZonePoint) => ({ x: p.lon * cosLat * 111_320, y: p.lat * 110_540 });
  const xy = result.slice(1, -1).map(toXY);
  let maxTurnAwayFromJunction = 0;
  for (let i = 1; i < xy.length - 1; i++) {
    const v1 = { x: xy[i].x - xy[i - 1].x, y: xy[i].y - xy[i - 1].y };
    const v2 = { x: xy[i + 1].x - xy[i].x, y: xy[i + 1].y - xy[i].y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    const turnDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    // Indices 5/6 straddle the real ~89° corner itself — a genuine turn
    // there is correct, not a bug. Every other index is on what the real
    // road's own geometry shows as a straight-ish approach, and must stay
    // tight — this is the exact stretch the live "sawtooth" report named.
    if (i === 5 || i === 6) continue;
    maxTurnAwayFromJunction = Math.max(maxTurnAwayFromJunction, turnDeg);
  }
  assert(
    maxTurnAwayFromJunction < 15,
    `away from the real junction corner itself, the pushed boundary must stay smooth (max turn ${maxTurnAwayFromJunction.toFixed(1)}deg) — a bigger value here is the live "sawtooth near Saracen Street/A879" regression`,
  );
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
