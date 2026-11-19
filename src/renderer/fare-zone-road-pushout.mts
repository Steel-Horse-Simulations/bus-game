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
// Which points actually get pushed is decided purely by real distance to
// the nearest road (`ROAD_SIDE_CUTOFF_M` below — tight, 2.0m, by direct
// user correction: "I only want the line moved if its on a road"), not by
// any remembered "was this point snapped while drawing" flag.
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

// Moves `point` off the road edge `(a, b)`, away from `centroid` (the
// zone's own interior reference), sliding it ALONG the direction of the
// pre-existing line through its own neighbours (`prev`/`next`) wherever
// that's possible, rather than translating it perpendicular to the road.
// Exported on its own (not just via pushOutRoadSnappedPoints) since it's
// the one piece genuinely worth testing in isolation with hand-picked
// neighbour geometry.
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

  // The old, straightforward fallback: the point's own perpendicular
  // foot on the road's line, shifted by the offset — every point on the
  // road's own line lands on the exact same parallel line this way,
  // which is the right behaviour whenever the boundary genuinely tracks
  // alongside the road rather than merely touching it in passing.
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

  return fromLocalXY(ix, iy, cosLat0);
}

// Offers every point to `nearestRoadEdge`, and pushes it off the road
// (sliding along the ring's own local line direction wherever possible —
// see `pushPointOffRoad`) only when the real distance to the nearest
// edge is within `ROAD_SIDE_CUTOFF_M`. Takes a plain function rather
// than the `Router` class itself so this stays testable without the
// real WASM module.
export function pushOutRoadSnappedPoints(points: FareZonePoint[], nearestRoadEdge: (lon: number, lat: number) => NearestRoadEdge | null): FareZonePoint[] {
  const centroid = computeRingCentroid(points);
  const n = points.length;
  return points.map((p, i) => {
    const edge = nearestRoadEdge(p.lon, p.lat);
    if (!edge || edge.distM > ROAD_SIDE_CUTOFF_M) return p;
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    return pushPointOffRoad(p, edge, centroid, prev, next);
  });
}
