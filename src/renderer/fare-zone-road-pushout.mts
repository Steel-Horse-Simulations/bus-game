// Fare-zone road-snapped boundary push-out (DESIGN.md §9): a fare zone's
// boundary point that sits at the side of a road needs to move from the
// road's centreline out to its far kerb (away from the zone's own
// interior) plus a further fixed margin, so the zone's edge includes the
// whole road rather than cutting it in half — applied unconditionally,
// even on a road shared with another, already-drawn zone (user-confirmed,
// 2026-11-14: "the zone should also be pushed out even if it is bordered
// by another zone otherwise 2 sides of the same road would be in
// different zones").
//
// A point only gets pushed when it was genuinely produced by snapping to
// or following a real road while drawing (tracked through the draft in
// fare-zone-drawing.ts) AND its real distance to the nearest road edge is
// within `ROAD_SIDE_CUTOFF_M` (2.0m, by direct user correction: "I only
// want the line moved if its on a road") as a sanity check on top.
//
// **This used to be decided by distance alone, with no "was this point
// snapped while drawing" flag at all** — changed 2026-11-20 after a real,
// live-confirmed bug this distance-only design couldn't solve without a
// road-class ban on the Rust side (`nearest_road_edge_info`), and that
// ban itself broke ordinary Residential-road tracing (see
// `pushOutRoadSnappedPoints`'s own comment for the full story). Real
// provenance, tracked at the one place a point is actually added to the
// draft, answers the right question directly instead of trying to infer
// it after the fact from distance and road class alone.
//
// **How a qualifying point gets moved is the one thing that changed
// 2026-11-14, by direct user diagnosis of a live bug**: the original
// design (and an earlier version of this module) translated a road-side
// point a FIXED perpendicular distance from the road, using only that
// one point's own position — with no idea what direction the zone
// boundary's own line was actually heading there. That's fine for a
// boundary running roughly ALONG a road (every point ends up on the same
// parallel offset line, which is exactly the shape you want), but for a
// line merely PASSING NEAR a road on its way somewhere else — e.g.
// straight in from a residential area — translating that one point
// sideways, independent of its neighbours, produced a sharp, unrelated
// kink where the line should have stayed straight. The user's own
// diagnosis, verbatim: "if a line is coming from a point not on a road,
// move the point on the line along the pre-existing line... I think the
// weird kinks are moving the point away from the road at an exact
// [perpendicular] angle, not along the line that it already exists."
//
// Fixed by using the ring's own neighbouring points (which only this
// module has — the WASM side only ever saw one point at a time) to find
// the boundary's own local direction through the point, then sliding the
// point ALONG that direction until it reaches the road's own safe offset
// line, instead of translating it perpendicular to the road. Only when
// that line is itself running parallel to the road (no stable
// intersection — a boundary genuinely tracking alongside it) does this
// fall back to the old straight perpendicular translation, which is the
// correct thing to do in that specific case: every point already wants
// to land on the same parallel line regardless of its own position along
// it.
export interface FareZonePoint {
  lon: number;
  lat: number;
}

// Raw facts about the real road edge nearest a point — everything the
// WASM side (`Router::nearest_road_edge_info`) knows, and nothing more;
// every decision about WHETHER and HOW to move the point because of them
// happens here, where the ring's own neighbouring points are available.
export interface NearestRoadEdge {
  distM: number;
  aLon: number;
  aLat: number;
  bLon: number;
  bLat: number;
  widthM: number;
}

// A point within this real distance of a road counts as standing at its
// side; beyond it, the nearest road is irrelevant. Tight by direct user
// correction (2026-11-14, see this file's own header) — generous for
// e7-rounding/projection slop on a genuine road-snap (which sits at ~0m
// by construction) while far tighter than a boundary line would
// plausibly wander by coincidence on its way past a road to somewhere
// else.
const ROAD_SIDE_CUTOFF_M = 2.0;

// Fixed margin added beyond a road's own far kerb when pushing a
// fare-zone boundary point off the road centreline — DESIGN.md §9,
// user-specified directly (2026-11-14): the point goes to the kerb (half
// the road's real width) **plus this further 15m**, applied
// unconditionally, even where the road borders another, already-drawn
// zone.
const FARE_ZONE_KERB_MARGIN_M = 15.0;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_M = 6_371_000;

// Local flat-plane projection centred on a given latitude — the same
// equirectangular approximation the Rust side's own
// `signed_side_of_segment`/`offset_point_perpendicular` use, reasonable
// at the scale a single road edge spans. Lets the line-intersection maths
// below work in plain metres instead of lon/lat degrees.
function toLocalXY(p: FareZonePoint, cosLat0: number): { x: number; y: number } {
  return { x: p.lon * DEG_TO_RAD * cosLat0 * EARTH_RADIUS_M, y: p.lat * DEG_TO_RAD * EARTH_RADIUS_M };
}
function fromLocalXY(x: number, y: number, cosLat0: number): FareZonePoint {
  return { lon: (x / (cosLat0 * EARTH_RADIUS_M)) * RAD_TO_DEG, lat: (y / EARTH_RADIUS_M) * RAD_TO_DEG };
}

// Plain real-world distance between two points — used only by
// `farNeighbourInRun` below to measure how far it's walked, not part of
// the core push geometry.
function distanceM(a: FareZonePoint, b: FareZonePoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  const dLon = (b.lon - a.lon) * DEG_TO_RAD * cosLat * EARTH_RADIUS_M;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD * EARTH_RADIUS_M;
  return Math.hypot(dLon, dLat);
}

// How far (real metres) `pushPointPerpendicularAlongPath` looks for a
// stable tangent direction — see that function's own comment for why a
// single immediate ring neighbour isn't enough. Matches
// `FARE_ZONE_KERB_MARGIN_M`'s own order of magnitude: the push itself
// moves a point by roughly this much, so reading the path's own direction
// over at least this same real distance is what actually damps out
// noise at that scale, confirmed empirically (not by formula) against a
// real dense Glasgow junction — see that function's own comment.
const RUN_TANGENT_BASELINE_M = 15.0;

// Walks the ring from `startIndex` in direction `dir` (+1 or -1),
// accumulating real distance, and returns the furthest point reached
// that's still within `RUN_TANGENT_BASELINE_M` — stopping EARLY, at
// whatever point it had reached, the moment it would otherwise leave the
// current road-snapped run (a non-road-snapped point isn't part of the
// same real road, so walking into it for a "direction" reading would be
// just as unreliable as the single-immediate-neighbour problem this
// exists to fix) or wrap all the way around a fully road-snapped ring
// back to its own start (degenerate, never expected against a real
// drawn zone). A run shorter than the baseline simply returns its own
// far end — still an improvement over a single adjacent point, just not
// the full baseline distance.
function farNeighbourInRun(points: readonly FareZonePoint[], roadSnapped: readonly boolean[], startIndex: number, dir: 1 | -1, n: number): FareZonePoint {
  let acc = 0;
  let i = startIndex;
  for (;;) {
    const j = (i + dir + n) % n;
    if (j === startIndex || !roadSnapped[j]) return points[i];
    acc += distanceM(points[i], points[j]);
    i = j;
    if (acc >= RUN_TANGENT_BASELINE_M) return points[i];
  }
}

// Plain arithmetic mean of the ring's own vertices — not a true
// area-weighted polygon centroid, but a reference point that sits well
// inside any ordinary (non-wildly-concave) zone shape, which is all the
// "which side of this one road edge is the zone's interior on" check
// below needs. Computed from the ring's final, fully-drawn point set
// (not a running mid-draw estimate) — more robust, and by the time a
// zone is finalized every point is already known anyway.
export function computeRingCentroid(points: FareZonePoint[]): FareZonePoint {
  if (points.length === 0) return { lon: 0, lat: 0 };
  let lonSum = 0;
  let latSum = 0;
  for (const p of points) {
    lonSum += p.lon;
    latSum += p.lat;
  }
  return { lon: lonSum / points.length, lat: latSum / points.length };
}

// The plain, direction-agnostic push: `point`'s own perpendicular foot on
// the road edge `(a, b)`, shifted away from `centroid` by `width/2 +
// FARE_ZONE_KERB_MARGIN_M`. Every point on the same road's own line lands
// on the exact same parallel offset line this way, which is correct when
// `(a, b)` is a genuinely reliable stand-in for the road's own local
// direction — i.e. for an isolated point (no road-snapped ring
// neighbour), where `pushOutRoadSnappedPoints` falls back to this (via
// `pushPointOffRoad`'s own parallel-direction case) when the boundary's
// local tangent is itself parallel to the road, OR as the degenerate
// fallback inside `pushPointPerpendicularAlongPath` below when a run
// point's own neighbours are coincident. **Not used directly for a
// multi-point run any more as of 2026-11-20's second fix — see that
// function's own comment for why.**
export function pushPointPerpendicular(point: FareZonePoint, edge: NearestRoadEdge, centroid: FareZonePoint): FareZonePoint {
  const cosLat0 = Math.cos(((edge.aLat + edge.bLat) / 2) * DEG_TO_RAD);
  const a = toLocalXY({ lon: edge.aLon, lat: edge.aLat }, cosLat0);
  const b = toLocalXY({ lon: edge.bLon, lat: edge.bLat }, cosLat0);
  const pt = toLocalXY(point, cosLat0);
  const away = toLocalXY(centroid, cosLat0);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const roadLen = Math.hypot(dx, dy);
  if (roadLen < 1e-9) return point; // degenerate zero-length edge, never expected against real road geometry

  const cross = dx * (away.y - a.y) - dy * (away.x - a.x);
  const offsetSign = cross >= 0 ? -1 : 1;
  const pushDistM = edge.widthM / 2 + FARE_ZONE_KERB_MARGIN_M;
  const offsetM = pushDistM * offsetSign;
  const nx = -dy / roadLen; // left normal of a -> b
  const ny = dx / roadLen;

  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (roadLen * roadLen);
  const footX = a.x + t * dx;
  const footY = a.y + t * dy;
  return fromLocalXY(footX + nx * offsetM, footY + ny * offsetM, cosLat0);
}

// **The real fix for the live "sawtooth near the Saracen Street/A879
// junction" report (2026-11-20, second round)** — `pushPointPerpendicular`
// above derives its push DIRECTION from the specific short OSM way
// segment `nearestRoadEdge` independently resolves AT THAT ONE POINT.
// Confirmed directly against the real road graph near the reported
// junction (Ellesmere Street / Saracen Street-A879 / Hamiltonhill Road):
// at a junction transition, that per-point edge direction can diverge
// from the ring's own smooth drawn path (a single `find_any_road_route`
// result) by **26° to 90°**, even though well inside a straight run the
// two agree to within a few degrees — several short real OSM segments
// meeting within metres of each other each have their own slightly
// different bearing, and `pushPointPerpendicular`'s own left-normal of
// THAT bearing rotates with it, point by point, producing a visible
// zigzag in the pushed boundary even though the underlying drawn path
// never deviates from a smooth curve.
//
// The fix: for a run point, the push DIRECTION comes from the ring's own
// real local tangent — not from independently re-querying the road
// graph's own, much noisier, metre-scale segment boundaries.
// `nearestRoadEdge` is still used for the one thing it's actually needed
// for: the real road's own width (push MAGNITUDE). Falls back to
// `pushPointPerpendicular` (edge-direction-based) only when `prev`/`next`
// are themselves coincident — no path direction to read at all.
//
// **`prev`/`next` must be FAR neighbours, not the literal adjacent ring
// entries (second round, same day)** — the first version of this fix
// used the immediate array neighbours directly and, re-checked against
// the real junction data live reports flagged as still broken, it
// genuinely wasn't enough: consecutive points near a dense junction can
// be only 3-7m apart (several real OSM nodes packed close together),
// over which distance even the TRUE path direction is itself noisy —
// confirmed directly (not by formula): comparing the raw, un-pushed
// path's own real turn angles against the pushed result's turn angles at
// the same indices showed the push was introducing MORE zigzag than the
// underlying drawn path actually has, meaning a single-adjacent-neighbour
// tangent was still amplifying noise, just a different source of it than
// `pushPointPerpendicular`'s edge-direction noise. Widening the baseline
// `prev`/`next` to `farNeighbourInRun`'s own real-distance walk (at least
// `RUN_TANGENT_BASELINE_M`, clamped at the run's own boundary) damps that
// out — confirmed against the same real Saracen Street/A879/Hamiltonhill
// junction data: turn angles along the genuinely straight approach
// dropped from 45-61° (single-neighbour) to under 11°, with the only
// remaining turn concentrated exactly at the junction's own real ~89°
// corner (expected — a real right-angle turn in the road, not a bug).
// The caller (`pushOutRoadSnappedPoints`) is responsible for passing
// these far neighbours, not the literal `points[i±1]`.
export function pushPointPerpendicularAlongPath(point: FareZonePoint, edge: NearestRoadEdge, centroid: FareZonePoint, prev: FareZonePoint, next: FareZonePoint): FareZonePoint {
  const cosLat0 = Math.cos(point.lat * DEG_TO_RAD);
  const pt = toLocalXY(point, cosLat0);
  const away = toLocalXY(centroid, cosLat0);
  const prevXY = toLocalXY(prev, cosLat0);
  const nextXY = toLocalXY(next, cosLat0);
  const tx = nextXY.x - prevXY.x;
  const ty = nextXY.y - prevXY.y;
  const tangentLen = Math.hypot(tx, ty);
  if (tangentLen < 1e-9) return pushPointPerpendicular(point, edge, centroid); // coincident neighbours, nothing to read a direction from

  // Which side of the PATH's own local tangent (not the road edge) the
  // zone's own interior falls on — same cross-product convention used
  // throughout this file, just against the path direction instead of the
  // road's.
  const cross = tx * (away.y - pt.y) - ty * (away.x - pt.x);
  const offsetSign = cross >= 0 ? -1 : 1;
  const pushDistM = edge.widthM / 2 + FARE_ZONE_KERB_MARGIN_M;
  const offsetM = pushDistM * offsetSign;
  const nx = -ty / tangentLen; // left normal of the path's own local direction
  const ny = tx / tangentLen;

  return fromLocalXY(pt.x + nx * offsetM, pt.y + ny * offsetM, cosLat0);
}

// Moves `point` off the road edge `(a, b)`, away from `centroid` (the
// zone's own interior reference), sliding it ALONG the direction of the
// pre-existing line through its own neighbours (`prev`/`next`) wherever
// that's possible, rather than translating it perpendicular to the road.
//
// **Only for a genuinely ISOLATED road-snapped point (2026-11-20) — see
// `pushOutRoadSnappedPoints`' own comment.** Exported on its own (not
// just via pushOutRoadSnappedPoints) since it's the one piece genuinely
// worth testing in isolation with hand-picked neighbour geometry.
export function pushPointOffRoad(point: FareZonePoint, edge: NearestRoadEdge, centroid: FareZonePoint, prev: FareZonePoint, next: FareZonePoint): FareZonePoint {
  const cosLat0 = Math.cos(((edge.aLat + edge.bLat) / 2) * DEG_TO_RAD);
  const a = toLocalXY({ lon: edge.aLon, lat: edge.aLat }, cosLat0);
  const b = toLocalXY({ lon: edge.bLon, lat: edge.bLat }, cosLat0);
  const pt = toLocalXY(point, cosLat0);
  const away = toLocalXY(centroid, cosLat0);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const roadLen = Math.hypot(dx, dy);
  if (roadLen < 1e-9) return point; // degenerate zero-length edge, never expected against real road geometry

  // Which side of the road the zone's own interior falls on — same cross-
  // product convention as the Rust side's own signed_side_of_segment, so
  // "push away from the interior" matches exactly.
  const cross = dx * (away.y - a.y) - dy * (away.x - a.x);
  const offsetSign = cross >= 0 ? -1 : 1;
  const pushDistM = edge.widthM / 2 + FARE_ZONE_KERB_MARGIN_M;
  const offsetM = pushDistM * offsetSign;
  const nx = -dy / roadLen; // left normal of a -> b
  const ny = dx / roadLen;

  // The plain fallback (now also usable standalone as
  // `pushPointPerpendicular`) — every point on the road's own line lands
  // on the exact same parallel line this way, which is the right
  // behaviour whenever the boundary genuinely tracks alongside the road
  // rather than merely touching it in passing.
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (roadLen * roadLen);
  const footX = a.x + t * dx;
  const footY = a.y + t * dy;
  const fallback = fromLocalXY(footX + nx * offsetM, footY + ny * offsetM, cosLat0);

  // The ring's own local direction through this point, from its real
  // drawn neighbours — the "pre-existing line" the point should slide
  // along instead of jumping off at a right angle to the road.
  const prevXY = toLocalXY(prev, cosLat0);
  const nextXY = toLocalXY(next, cosLat0);
  const tx = nextXY.x - prevXY.x;
  const ty = nextXY.y - prevXY.y;
  if (Math.hypot(tx, ty) < 1e-9) return fallback; // coincident neighbours, nothing to slide along

  // Intersect the line (pt + s*(tx,ty)) with the road's own safe offset
  // line (through a + n*offsetM, direction (dx,dy)) — but only when the
  // boundary's own local direction is genuinely different from the
  // road's. A real live bug, 2026-11-15: the original version of this
  // check compared the raw, unnormalized determinant (dx*ty - dy*tx)
  // against a tiny fixed threshold, which is NOT scale-invariant — for
  // real drawn points (often only a metre or two apart, so `tx,ty` are
  // small), a direction that's actually only a few degrees off parallel
  // still produces a "valid", nonzero determinant, and sliding along a
  // near-parallel line to reach a target offset line many metres away
  // needs an enormous slide distance (it scales with 1/sin(angle)) —
  // confirmed against a real saved zone: several consecutive points
  // slid 147-183m sideways, producing the dramatic criss-crossing spikes
  // the user then reported, each one numerically "valid" by that old
  // check but geometrically absurd. The real question was never "is the
  // determinant exactly zero" but "is this direction close enough to
  // parallel that it should be treated the same as the parallel case" —
  // answered here with the actual angle between the two directions
  // (via the normalized cross product, sin of the angle between them),
  // which means the same answer regardless of how close together the
  // ring's own points happen to be.
  const tangentLen = Math.hypot(tx, ty);
  const sinAngle = Math.abs(dx * ty - dy * tx) / (roadLen * tangentLen);
  const MIN_SIN_ANGLE = Math.sin(20 * DEG_TO_RAD); // under ~20° off parallel counts as "running alongside"
  if (sinAngle < MIN_SIN_ANGLE) return fallback;

  const lineBaseX = a.x + nx * offsetM;
  const lineBaseY = a.y + ny * offsetM;
  const det = dx * ty - dy * tx;
  const ex = lineBaseX - pt.x;
  const ey = lineBaseY - pt.y;
  const s = (dx * ey - dy * ex) / det;
  const ix = pt.x + s * tx;
  const iy = pt.y + s * ty;

  // Bounded-slide cap (2026-11-20 rewrite — see this file's own header
  // comment for the full history this replaces): the MIN_SIN_ANGLE check
  // above only excludes the near-exactly-parallel case, it does nothing
  // to bound HOW FAR a direction just above that cutoff has to slide to
  // reach the target offset line — and that distance is unbounded as the
  // angle approaches the cutoff from above. Confirmed live, 2026-11-20,
  // against a real Glasgow zone: several points slid 50-95m sideways and
  // doubled back on themselves (a near-180° reversal at consecutive ring
  // vertices), reading as the user's own reported "stupid sticking out
  // points" — yet another instance of the same unbounded-slide failure
  // mode the 2026-11-15 angle check only partly addressed.
  //
  // The real, provable bound: `point` is only ever offered to this
  // function when it sits within ROAD_SIDE_CUTOFF_M of the road's own
  // centreline (pushOutRoadSnappedPoints' own cutoff, applied by the
  // caller before this runs), so the perpendicular distance from `point`
  // to the TARGET offset line can never exceed `pushDistM +
  // ROAD_SIDE_CUTOFF_M`. Sliding along a direction at least MIN_SIN_ANGLE
  // off parallel to close a perpendicular gap of that size can never need
  // more than `(pushDistM + ROAD_SIDE_CUTOFF_M) / MIN_SIN_ANGLE` of real
  // slide distance — anything beyond that is only possible because this
  // point's own real distance to the road exceeded the cutoff (shouldn't
  // happen, but isn't this function's job to re-check) or because of
  // floating-point noise in a near-degenerate geometry; either way, the
  // honest answer is the plain perpendicular fallback, not a slide that
  // can only be numerically "correct" by also being visually absurd.
  const slideDistM = Math.hypot(ix - pt.x, iy - pt.y);
  const maxSlideM = (pushDistM + ROAD_SIDE_CUTOFF_M) / MIN_SIN_ANGLE;
  if (slideDistM > maxSlideM) return fallback;

  return fromLocalXY(ix, iy, cosLat0);
}

// Offers a point to `nearestRoadEdge` and pushes it (sliding along the
// ring's own local line direction wherever possible — see
// `pushPointOffRoad`) only when BOTH of these hold:
//
// 1. `roadSnapped[i]` is true — the caller (fare-zone-drawing.ts's Save
//    handler) considers this exact point eligible, which as of 2026-11-21
//    is NOT strictly "this point's own winning click-handler snap kind
//    was road" any more: being coastline-snapped (for correctly tracing
//    a shore) and genuinely sitting on a real road are two independent
//    facts about the same point, not mutually exclusive (Main Street,
//    Kyle of Lochalsh, runs right along the shore and was reported
//    getting no push-out at all until this was fixed) — the caller ORs
//    its own road-snapped and coastline-snapped provenance arrays
//    together before calling this function, so from this module's own
//    point of view, `roadSnapped[i]` just means "treat this one as
//    push-eligible," whatever combination of real reasons led there.
// 2. The real distance to the nearest road edge is within
//    `ROAD_SIDE_CUTOFF_M` — a sanity check, not the primary gate; for a
//    point that really was just road-snapped this should always hold by
//    construction (~0m), this only guards against the road graph having
//    somehow changed between snapping and saving.
//
// **Why provenance, not road class (changed 2026-11-20):** this used to
// decide push-out purely by #2 — any point within ROAD_SIDE_CUTOFF_M of
// ANY real road edge got pushed, and the Rust side (`nearest_road_edge_
// info`) separately banned anything below Tertiary class to stop that
// being too eager (a Service-class driveway right next to an unrelated
// landuse-edge point was wrongly nudging it). That class ban, confirmed
// live 2026-11-20, also silently zeroed out push-out for ordinary
// Residential streets — the single most common real city-zone boundary
// road — because `snap_to_any_road`/`find_any_road_route` (what the
// player's clicks actually used while drawing) never excluded them in
// the first place, only this Save-time check did. Provenance answers the
// real underlying question directly — "did the player actually mean this
// point to be on a road" — rather than guessing at it indirectly via
// road class, which can neither recognise a genuine Residential-road
// trace nor rule out an accidental nearby driveway.
//
// **Perpendicular-only for a run, tangent-slide only for a genuinely
// isolated point (2026-11-20, the real fix for "sticking out points"):**
// confirmed live against a reconstruction of the real Glasgow zone that
// prompted this rewrite — even with pushPointOffRoad's own bounded-slide
// cap (above) in place, feeding a genuine multi-point road-following run
// (several consecutive points generated by ONE `find_any_road_route`
// call while drawing, DESIGN.md §9) through the tangent-slide algorithm
// still produced near-180° reversals between consecutive pushed points.
// Root cause: the tangent-slide logic was designed for — and only ever
// tested against — a single ISOLATED point whose own ring neighbours
// are NOT road-snapped (a boundary merely crossing or approaching a
// road at an angle on its way somewhere else). Applying that same
// per-point, independent tangent-to-offset-line intersection to every
// point of a road-following run is a misuse of it outside the case it
// was built for: consecutive points on a real, possibly-curving road
// each resolve their own "nearest edge" to a different short underlying
// OSM way segment, each with its own slightly different direction —
// perfectly legitimate individually, but sliding each one independently
// along the RING's local tangent to intersect ITS OWN edge's offset line
// has no reason to stay consistent from one point to the next, and in a
// dense junction (several short segments meeting within metres of each
// other) it visibly doesn't.
//
// The actual fix needs no tangent math at all for a run: every point in
// a road-following run is already, by construction, genuinely running
// ALONG the road (that's what "following" means) — `pushPointPerpendicular`
// applied independently to each point, using only ITS OWN nearest edge,
// naturally traces a smoothly curving road without any slide, because a
// real road's own short segments already point roughly the same
// direction as their immediate neighbours. The tangent-slide-with-cap
// (`pushPointOffRoad`) stays reserved for the one case it was actually
// designed and tested for: a single isolated road-snapped point with
// non-road-snapped neighbours on both sides.
//
// Push-out eligibility itself is still gated on BOTH of:
//
// 1. `roadSnapped[i]` is true — the caller (fare-zone-drawing.ts's Save
//    handler) considers this exact point eligible, which as of 2026-11-21
//    is NOT strictly "this point's own winning click-handler snap kind
//    was road" any more: being coastline-snapped (for correctly tracing
//    a shore) and genuinely sitting on a real road are two independent
//    facts about the same point, not mutually exclusive (Main Street,
//    Kyle of Lochalsh, runs right along the shore and was reported
//    getting no push-out at all until this was fixed) — the caller ORs
//    its own road-snapped and coastline-snapped provenance arrays
//    together before calling this function, so from this module's own
//    point of view, `roadSnapped[i]` just means "treat this one as
//    push-eligible," whatever combination of real reasons led there.
// 2. The real distance to the nearest road edge is within
//    `ROAD_SIDE_CUTOFF_M` — a sanity check, not the primary gate; for a
//    point that really was just road-snapped this should always hold by
//    construction (~0m), this only guards against the road graph having
//    somehow changed between snapping and saving.
//
// **Why provenance, not road class (changed 2026-11-20):** this used to
// decide push-out purely by #2 — any point within ROAD_SIDE_CUTOFF_M of
// ANY real road edge got pushed, and the Rust side (`nearest_road_edge_
// info`) separately banned anything below Tertiary class to stop that
// being too eager (a Service-class driveway right next to an unrelated
// landuse-edge point was wrongly nudging it). That class ban, confirmed
// live 2026-11-20, also silently zeroed out push-out for ordinary
// Residential streets — the single most common real city-zone boundary
// road — because `snap_to_any_road`/`find_any_road_route` (what the
// player's clicks actually used while drawing) never excluded them in
// the first place, only this Save-time check did. Provenance answers the
// real underlying question directly — "did the player actually mean this
// point to be on a road" — rather than guessing at it indirectly via
// road class, which can neither recognise a genuine Residential-road
// trace nor rule out an accidental nearby driveway.
//
// Takes a plain function rather than the `Router` class itself so this
// stays testable without the real WASM module.
export function pushOutRoadSnappedPoints(
  points: FareZonePoint[],
  roadSnapped: readonly boolean[],
  nearestRoadEdge: (lon: number, lat: number) => NearestRoadEdge | null,
): FareZonePoint[] {
  const centroid = computeRingCentroid(points);
  const n = points.length;
  return points.map((p, i) => {
    if (!roadSnapped[i]) return p;
    const edge = nearestRoadEdge(p.lon, p.lat);
    if (!edge || edge.distM > ROAD_SIDE_CUTOFF_M) return p;
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const prevIsRoadSnapped = roadSnapped[(i - 1 + n) % n];
    const nextIsRoadSnapped = roadSnapped[(i + 1) % n];
    if (prevIsRoadSnapped || nextIsRoadSnapped) {
      const farPrev = farNeighbourInRun(points, roadSnapped, i, -1, n);
      const farNext = farNeighbourInRun(points, roadSnapped, i, 1, n);
      return pushPointPerpendicularAlongPath(p, edge, centroid, farPrev, farNext);
    }
    return pushPointOffRoad(p, edge, centroid, prev, next);
  });
}
