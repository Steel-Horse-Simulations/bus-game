// Manual verification for coastline-clip.mts (31 October hand-off item 2,
// OPEN-ITEMS.md), run directly with `npx tsx
// src/renderer/coastline-clip.verify.mts`.
import * as fs from "node:fs";
import { initSync, decode_coastline } from "./wasm/game_wasm.js";
import { segmentIntersection, findCoastlineCrossings, coastlineWalkBetween, clipRingToCoastline, nearestPointOnCoastline, coastlineFollowBetween, sameRealPoint, dedupeRing, type FareZonePoint } from "./coastline-clip.mts";
import { pushOutRoadSnappedPoints } from "./fare-zone-road-pushout.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok: ${message}`);
}

function distanceForTest(a: FareZonePoint, b: FareZonePoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dLon = (b.lon - a.lon) * (Math.PI / 180) * cosLat * 6_371_000;
  const dLat = (b.lat - a.lat) * (Math.PI / 180) * 6_371_000;
  return Math.hypot(dLon, dLat);
}

// --- segmentIntersection ---

assert(
  segmentIntersection({ lon: 0, lat: -1 }, { lon: 0, lat: 1 }, { lon: -1, lat: 0 }, { lon: 1, lat: 0 }) !== null,
  "two segments crossing through the origin intersect",
);
assert(
  segmentIntersection({ lon: 0, lat: -1 }, { lon: 0, lat: 1 }, { lon: 5, lat: -1 }, { lon: 5, lat: 1 }) === null,
  "two parallel segments that never meet don't intersect",
);
assert(
  segmentIntersection({ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 5, lat: -1 }, { lon: 5, lat: 1 }) === null,
  "segments that would cross if extended, but don't within their own bounds, don't intersect",
);
{
  const hit = segmentIntersection({ lon: -2, lat: 0 }, { lon: 2, lat: 0 }, { lon: 0, lat: -2 }, { lon: 0, lat: 2 });
  assert(hit !== null && Math.abs(hit.point.lon) < 1e-9 && Math.abs(hit.point.lat) < 1e-9, "a real crossing lands at the true intersection point (the origin)");
  assert(hit !== null && Math.abs(hit.t - 0.5) < 1e-9, "a crossing exactly halfway along the segment has t = 0.5");
}

// --- findCoastlineCrossings ---

const straightCoastChain: FareZonePoint[] = [
  { lon: 5, lat: -10 },
  { lon: 5, lat: 10 },
];
assert(
  findCoastlineCrossings({ lon: 0, lat: 0 }, { lon: 10, lat: 0 }, [straightCoastChain]).length === 1,
  "a segment crossing a single straight coastline chain once finds exactly one crossing",
);
assert(
  findCoastlineCrossings({ lon: 0, lat: 0 }, { lon: 3, lat: 0 }, [straightCoastChain]).length === 0,
  "a segment that never reaches the coastline finds no crossings",
);
{
  const bayChain: FareZonePoint[] = [
    { lon: 0, lat: -10 },
    { lon: 0, lat: -1 },
    { lon: -5, lat: 0 }, // the bay dips inland here
    { lon: 0, lat: 1 },
    { lon: 0, lat: 10 },
  ];
  const crossings = findCoastlineCrossings({ lon: -2, lat: -1 }, { lon: -2, lat: 1 }, [bayChain]);
  assert(crossings.length === 2, "a straight line clipping across a bay crosses the same chain twice");
  assert(crossings[0].chainIndex === crossings[1].chainIndex, "both crossings land on the same chain");
}

// A ring point that already sits exactly on the coastline (2026-11-14
// live bug, "jumps away from the boundary and randomly back" — confirmed
// against a real saved zone whose boundary legitimately runs along Kyle
// of Lochalsh's own waterfront): the edge starting there must NOT report
// a crossing at t=0 against either of the two coastline edges meeting at
// that shared vertex, since a genuine crossing happens strictly between
// a ring edge's two endpoints, not at one of them.
{
  const coastThroughOrigin: FareZonePoint[] = [
    { lon: -5, lat: 5 },
    { lon: 0, lat: 0 }, // the ring's own point sits exactly here
    { lon: 5, lat: -5 },
  ];
  // Both of the coastline's own two edges meet exactly at (0,0), so a
  // ring edge starting there would naively register TWO crossings — but
  // they're the SAME real-world point counted twice, not two genuinely
  // different crossings, so this must dedupe down to exactly one (not
  // zero: a ring edge that only ever touches the coastline once, right
  // at its own start, is still a real single touch worth knowing about —
  // just never a "dips into the sea and back" pair on its own).
  const crossingsFromStart = findCoastlineCrossings({ lon: 0, lat: 0 }, { lon: 10, lat: 10 }, [coastThroughOrigin]);
  assert(crossingsFromStart.length === 1, `a ring edge starting exactly on the coastline's own shared vertex dedupes to one real crossing, not two, got ${crossingsFromStart.length}`);
  // The mirror case: the ring edge's own END point is the one sitting on
  // the coastline (t=1), not its start.
  const crossingsFromEnd = findCoastlineCrossings({ lon: 10, lat: 10 }, { lon: 0, lat: 0 }, [coastThroughOrigin]);
  assert(crossingsFromEnd.length === 1, `a ring edge ending exactly on the coastline's own shared vertex dedupes to one real crossing, not two, got ${crossingsFromEnd.length}`);
  // A genuine crossing strictly between the two endpoints must still be
  // found — a vertical ring edge at lon=1 crosses the coastline's second
  // segment ((0,0)->(5,-5), the line y=-x) at (1,-1), well inside both
  // the ring edge's own bounds (t=0.4) and that coastline segment's own.
  const genuineCrossing = findCoastlineCrossings({ lon: 1, lat: -5 }, { lon: 1, lat: 5 }, [coastThroughOrigin]);
  assert(genuineCrossing.length === 1, `a genuine crossing strictly between a ring edge's own endpoints is still found, got ${genuineCrossing.length}`);
}

// The same bug, end to end through clipRingToCoastline: a ring whose own
// point already sits exactly on the coastline, with the two coastline
// edges meeting there, must come back completely unchanged rather than
// getting a spurious detour inserted.
{
  const ring: FareZonePoint[] = [
    { lon: -1, lat: 1 },
    { lon: 0, lat: 0 }, // sits exactly on the coastline vertex below
    { lon: 1, lat: 1 },
    { lon: 0, lat: 2 },
  ];
  const coast: FareZonePoint[] = [
    { lon: -5, lat: 5 },
    { lon: 0, lat: 0 },
    { lon: 5, lat: -5 },
  ];
  const clipped = clipRingToCoastline(ring, [coast]);
  assert(
    JSON.stringify(clipped) === JSON.stringify(ring),
    `a ring already sitting on the coastline, with no genuine crossing, comes back unchanged, got ${JSON.stringify(clipped)}`,
  );
}

// --- coastlineWalkBetween ---

{
  const chain: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 2, lat: 0 },
    { lon: 3, lat: 0 },
  ];
  const forward = coastlineWalkBetween(chain, 0, { lon: 0.5, lat: 0 }, 2, { lon: 2.5, lat: 0 });
  assert(forward.length === 4, "walking forward from edge 0 to edge 2 passes through the chain's own points 1 and 2 in between");
  assert(forward[1].lon === 1 && forward[2].lon === 2, "the forward walk visits the chain's intermediate points in order");

  const backward = coastlineWalkBetween(chain, 2, { lon: 2.5, lat: 0 }, 0, { lon: 0.5, lat: 0 });
  assert(backward.length === 4, "walking backward from edge 2 to edge 0 is the same length as the reverse forward walk");
  assert(backward[1].lon === 2 && backward[2].lon === 1, "the backward walk visits the chain's intermediate points in reverse order");
}

{
  // A genuinely open chain (its two ends are ~333km apart, nowhere near
  // RING_CLOSURE_TOLERANCE_M) must behave exactly as before — no
  // wraparound path ever considered.
  const openChain: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 2, lat: 0 },
    { lon: 3, lat: 0 },
  ];
  const stillDirect = coastlineWalkBetween(openChain, 2, { lon: 2.5, lat: 0 }, 0, { lon: 0.5, lat: 0 });
  assert(stillDirect.length === 4 && stillDirect[1].lon === 2, "an open chain's walk is completely unaffected by the ring fix");
}

{
  // Live bug report reproduction (2026-11-13): "when making a zone around
  // Skye it will jump the entire way around the outside of Skye... instead
  // of just a few hundred meters along." A near-closed loop (its own first
  // and last point ~55m apart, well within RING_CLOSURE_TOLERANCE_M, the
  // exact shape confirmed against the real coastline.bin for several real
  // chains around Skye) with two edges that straddle the seam must walk
  // the short way THROUGH the seam, not the long way around the rest of
  // the loop.
  const nearClosedIslandChain: FareZonePoint[] = [
    { lon: 0, lat: 0 }, // 0 — the seam's other side
    { lon: 1, lat: 0 }, // 1
    { lon: 2, lat: 0 }, // 2
    { lon: 2, lat: 1 }, // 3
    { lon: 2, lat: 2 }, // 4
    { lon: 1, lat: 2 }, // 5
    { lon: 0, lat: 2 }, // 6
    { lon: 0, lat: 1 }, // 7
    { lon: 0.0005, lat: 0.0005 }, // 8 — the seam: ~55m from point 0
  ];
  // Edge 7 (between points 7 and 8, right next to the seam) to edge 0
  // (between points 0 and 1, also right next to the seam on the other
  // side) — the short way is straight across the ~55m seam; the long way
  // is the other ~5 sides of the loop.
  const shortWay = coastlineWalkBetween(nearClosedIslandChain, 7, { lon: 0.0002, lat: 0.6 }, 0, { lon: 0.5, lat: 0 });
  assert(
    shortWay.some((p) => p.lon === 0.0005 && p.lat === 0.0005) && shortWay.some((p) => p.lon === 0 && p.lat === 0),
    `expected the short wraparound path crossing the seam (points 8 and 0), got ${JSON.stringify(shortWay)}`,
  );
  assert(
    !shortWay.some((p) => p.lon === 2 && p.lat === 2),
    "the short path must not include the far corner of the loop — that's the long way round",
  );
}

// --- real duplicate-point bug (2026-11-15, confirmed via a live human-
// driven click trace against a real saved zone, which came back 66%
// exact-duplicate points) ---
//
// toPoint is a snap ONTO an edge, which very often lands exactly on
// that edge's own real vertex (a click close to it clamps straight to
// it). The old code unconditionally pushed the walked chain vertex and
// then toPoint right after it, producing a bit-identical duplicate at
// the seam whenever that happened — this is the actual cause of the
// long-running "spike" reports (a duplicate/zero-length neighbour
// breaks pushPointOffRoad's own local-direction calculation downstream,
// fare-zone-road-pushout.mts), not T207's own tile-load-race theory.
{
  const chain: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 2, lat: 0 },
    { lon: 3, lat: 0 },
  ];
  // toPoint snaps exactly onto chain[2] itself — the real shape of the bug.
  const walk = coastlineWalkBetween(chain, 0, { lon: 0.5, lat: 0 }, 2, { lon: 2, lat: 0 });
  let duplicateFound = false;
  for (let i = 0; i + 1 < walk.length; i++) {
    if (walk[i].lon === walk[i + 1].lon && walk[i].lat === walk[i + 1].lat) duplicateFound = true;
  }
  assert(!duplicateFound, `a walk whose toPoint coincides with a real chain vertex must not produce a duplicate point, got ${JSON.stringify(walk)}`);
  assert(walk[walk.length - 1].lon === 2 && walk[walk.length - 1].lat === 0, "the walk still correctly ends at toPoint");

  // Same check against the near-closed/wraparound path (the "wrapped"
  // candidate, same risk at its own seam-crossing join).
  const nearClosedIslandChain: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 2, lat: 0 },
    { lon: 2, lat: 1 },
    { lon: 2, lat: 2 },
    { lon: 1, lat: 2 },
    { lon: 0, lat: 2 },
    { lon: 0, lat: 1 },
    { lon: 0.0005, lat: 0.0005 },
  ];
  const wrapWalk = coastlineWalkBetween(nearClosedIslandChain, 7, { lon: 0.0002, lat: 0.6 }, 0, { lon: 0, lat: 0 });
  let wrapDuplicateFound = false;
  for (let i = 0; i + 1 < wrapWalk.length; i++) {
    if (wrapWalk[i].lon === wrapWalk[i + 1].lon && wrapWalk[i].lat === wrapWalk[i + 1].lat) wrapDuplicateFound = true;
  }
  assert(!wrapDuplicateFound, `the wraparound seam-crossing path must not produce a duplicate point either, got ${JSON.stringify(wrapWalk)}`);
}

// --- clipRingToCoastline ---

assert(
  clipRingToCoastline(
    [
      { lon: 0, lat: 0 },
      { lon: 1, lat: 0 },
      { lon: 1, lat: 1 },
    ],
    [],
  ).length === 3,
  "with no coastline data at all, a zone's own points pass through completely unchanged",
);

{
  // A zone drawn entirely inland, nowhere near the coastline chain below —
  // should come out byte-for-byte identical to what was drawn.
  const inlandRing: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 1, lat: 1 },
  ];
  const distantCoast: FareZonePoint[] = [
    { lon: 50, lat: -10 },
    { lon: 50, lat: 10 },
  ];
  const clipped = clipRingToCoastline(inlandRing, [distantCoast]);
  assert(clipped.length === 3, "a zone nowhere near the coastline is untouched by clipping");
  assert(JSON.stringify(clipped) === JSON.stringify(inlandRing), "every point is exactly as drawn, not approximated");
}

{
  // A straight (Shift-drawn) edge from a point just inland, out across a
  // bay, to another point just inland on the far side — the real case
  // this whole feature exists for. The coastline dips into a bay between
  // the two land points; clipping should replace the straight line's
  // water-crossing middle with a walk around the bay's own real shape,
  // not leave it as a straight cut across open water.
  const bayCoast: FareZonePoint[] = [
    { lon: -10, lat: -1 },
    { lon: 0, lat: -1 },
    { lon: 2, lat: 0 }, // the bay's own real inland dip
    { lon: 0, lat: 1 },
    { lon: -10, lat: 1 },
  ];
  // A triangle with one edge (the first, (-5,-1)->(-5,1)) running straight
  // across the bay's mouth — that's the edge clipping should act on; the
  // other two edges stay well inland, closing a valid triangle.
  const crossingEdgeRing: FareZonePoint[] = [
    { lon: -5, lat: -1 },
    { lon: -5, lat: 1 },
    { lon: -8, lat: 0 },
  ];
  const clipped = clipRingToCoastline(crossingEdgeRing, [bayCoast]);
  assert(clipped.length > crossingEdgeRing.length, "a water-crossing edge gains extra points from the coastline walk, rather than staying a plain straight line");
  // Every inserted point should be real coastline geometry, not fabricated
  // — confirm the inland bay-dip point (2, 0) made it into the result,
  // proving the walk actually followed the real shoreline around it.
  assert(clipped.some((p) => p.lon === 2 && p.lat === 0), "the real coastline's own inland bay point appears in the clipped result");
}

{
  // An edge that crosses two DIFFERENT, unconnected coastline chains
  // (e.g. a genuine open-water crossing to an island with no local
  // connecting shore) is deliberately left as the original straight
  // line, not guessed at.
  const chainA: FareZonePoint[] = [{ lon: 2, lat: -5 }, { lon: 2, lat: 5 }];
  const chainB: FareZonePoint[] = [{ lon: 8, lat: -5 }, { lon: 8, lat: 5 }];
  const ring: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 10, lat: 0 },
    { lon: 10, lat: 10 },
  ];
  const clipped = clipRingToCoastline(ring, [chainA, chainB]);
  assert(clipped.length === ring.length, "crossings on two different chains are left unhandled — the original straight edge is kept, not guessed at");
}

{
  // Real bug found live 2026-11-16 against the real coastline.bin and a
  // real redrawn zone at Main Street, Kyle of Lochalsh — NOT synthetic
  // geometry, same "no shortcuts, use the real thing" standard as
  // island-detection.verify.mts. A boundary running roughly ALONGSIDE a
  // real coastline for many consecutive short edges used to have dozens
  // of edges each independently re-insert overlapping stretches of the
  // same real coastline vertices, nearly doubling the ring's own point
  // count (a real measured 307 -> 608 points, 299 exact-duplicate
  // consecutive pairs, before this fix).
  const wasmBytes = fs.readFileSync(new URL("./wasm/game_wasm_bg.wasm", import.meta.url));
  initSync({ module: wasmBytes });
  const coastlineBytes = fs.readFileSync("pipeline-data/coastline.bin");
  const decodedChains = decode_coastline(coastlineBytes) as { coordinates: number[] }[];
  const coastlineChains: FareZonePoint[][] = decodedChains.map((chain) => {
    const points: FareZonePoint[] = [];
    for (let i = 0; i + 1 < chain.coordinates.length; i += 2) {
      points.push({ lon: chain.coordinates[i], lat: chain.coordinates[i + 1] });
    }
    return points;
  });
  const realRing: FareZonePoint[] = JSON.parse(fs.readFileSync(new URL("./coastline-clip-kyle-fixture.json", import.meta.url), "utf8"));
  assert(realRing.length === 307, `the real fixture ring has its own real point count, got ${realRing.length}`);
  const clipped = clipRingToCoastline(realRing, coastlineChains);
  let exactDupPairs = 0;
  for (let i = 0; i < clipped.length - 1; i++) {
    if (clipped[i].lon === clipped[i + 1].lon && clipped[i].lat === clipped[i + 1].lat) exactDupPairs++;
  }
  assert(exactDupPairs === 0, `a real boundary running alongside the real coastline must produce zero exact-duplicate consecutive points, got ${exactDupPairs}`);
  assert(clipped.length < realRing.length * 1.2, `point count must not balloon from redundant overlapping walks, got ${clipped.length} from an input of ${realRing.length}`);
}

// --- nearestPointOnCoastline ---

{
  // A straight north-south coastline chain near Skye-scale coordinates
  // (not real data, just realistic magnitudes) — a click a short real
  // distance out to its west should snap east onto the chain.
  const chain: FareZonePoint[] = [
    { lon: -6.3, lat: 57.3 },
    { lon: -6.3, lat: 57.6 },
  ];
  const click = { lon: -6.305, lat: 57.45 }; // ~300m west of the chain at this latitude
  const snapped = nearestPointOnCoastline(click, [chain], 500);
  assert(snapped !== null, "a click within the cutoff snaps to the coastline");
  assert(snapped !== null && Math.abs(snapped.point.lon - -6.3) < 1e-6, "the snapped point lands exactly on the chain, not partway to it");
  assert(snapped !== null && snapped.chainIndex === 0 && snapped.edgeIndex === 0, "the snap also reports which chain/edge it landed on, for coastlineFollowBetween");
}

{
  const chain: FareZonePoint[] = [
    { lon: -6.3, lat: 57.3 },
    { lon: -6.3, lat: 57.6 },
  ];
  const farClick = { lon: -6.5, lat: 57.45 }; // genuinely far out at sea
  assert(nearestPointOnCoastline(farClick, [chain], 500) === null, "a click beyond the cutoff finds nothing, same as snap_to_any_road's own cutoff");
}

assert(nearestPointOnCoastline({ lon: 0, lat: 0 }, [], 500) === null, "no coastline data at all returns null rather than throwing");

{
  // Picks the real nearest point across several chains, not just the first.
  const nearChain: FareZonePoint[] = [{ lon: 1.001, lat: 0 }, { lon: 1.001, lat: 1 }];
  const farChain: FareZonePoint[] = [{ lon: 5, lat: 0 }, { lon: 5, lat: 1 }];
  const snapped = nearestPointOnCoastline({ lon: 1, lat: 0.5 }, [farChain, nearChain], 1_000_000);
  assert(snapped !== null && Math.abs(snapped.point.lon - 1.001) < 1e-9, "the globally nearest chain wins, regardless of array order");
  assert(snapped !== null && snapped.chainIndex === 1, "the reported chainIndex points at the actual winning chain (nearChain, index 1), not array position 0");
}

// --- coastlineFollowBetween ---

{
  // Two coastline snaps on the same chain, with a real inland dip between
  // them — should trace the real shoreline. "Close together" isn't load-
  // bearing here any more (see the far-apart test below) — kept at this
  // scale only because it's a convenient way to place a real dip between
  // two snap points for the assertion.
  const bayChain: FareZonePoint[] = [
    { lon: -6.3, lat: 57.300 },
    { lon: -6.3, lat: 57.302 },
    { lon: -6.29, lat: 57.304 }, // the real inland dip
    { lon: -6.3, lat: 57.306 },
    { lon: -6.3, lat: 57.308 },
  ];
  const from = nearestPointOnCoastline({ lon: -6.305, lat: 57.301 }, [bayChain], 1000)!;
  const to = nearestPointOnCoastline({ lon: -6.305, lat: 57.307 }, [bayChain], 1000)!;
  const followed = coastlineFollowBetween(from, to, [bayChain]);
  assert(followed !== null, "two coastline snaps on the same chain are followed, not left as null");
  assert(followed !== null && followed.some((p) => p.lon === -6.29 && p.lat === 57.304), "the real inland dip between them is actually included, not skipped");
}

{
  // Two snaps on different chains (e.g. two separate landmasses) — never
  // followed, regardless of distance.
  const chainA: FareZonePoint[] = [{ lon: 0, lat: 0 }, { lon: 0, lat: 1 }];
  const chainB: FareZonePoint[] = [{ lon: 0.001, lat: 0 }, { lon: 0.001, lat: 1 }];
  const chains = [chainA, chainB];
  const from = nearestPointOnCoastline({ lon: -0.001, lat: 0.5 }, chains, 1000)!;
  const to = nearestPointOnCoastline({ lon: 0.0015, lat: 0.5 }, chains, 1000)!;
  assert(from.chainIndex === 0 && to.chainIndex === 1, "sanity: the two snaps really did land on different chains");
  assert(coastlineFollowBetween(from, to, chains) === null, "two snaps on different chains are never followed, however close together");
}

{
  // Two snaps on the SAME chain but genuinely far apart along it — still
  // followed in full. Corrected 2026-11-01 from a live screenshot ("This
  // should all be snapping," a clearly-continuous real stretch of coast
  // several kilometres long falling back to straight lines): there is no
  // distance cutoff any more. "Jump big gaps" only ever meant a different,
  // unconnected chain (covered by the dedicated test above) — not "far
  // apart along the one you're actually tracing."
  const longChain: FareZonePoint[] = [{ lon: -6.3, lat: 50 }, { lon: -6.3, lat: 60 }];
  const from = nearestPointOnCoastline({ lon: -6.301, lat: 50.1 }, [longChain], 1000)!;
  const to = nearestPointOnCoastline({ lon: -6.301, lat: 59.9 }, [longChain], 1000)!;
  const followed = coastlineFollowBetween(from, to, [longChain]);
  assert(followed !== null, "two snaps on the same chain are followed however far apart, not left as null");
  assert(followed !== null && followed.length === longChain.length, "the whole chain between them is included, nothing truncated");
}

// --- sameRealPoint / dedupeRing (2026-11-19 rewrite) ---
//
// The real confirmed root cause behind this whole saga's repeated "spike"
// reports: a fixed lon/lat DEGREE epsilon (the old 1e-7) is not the same
// real distance at every latitude/direction, and was too tight to catch a
// genuine near-duplicate produced by two independently-computed "same"
// points (e.g. a raw stored vertex vs. a segmentIntersection-computed
// crossing landing at the same real place via different arithmetic).

{
  // The exact real gap measured in the TEST zone (id 58, a real saved
  // zone, pulled directly from the player's own save.sqlite): points 12
  // and 13 of its own saved ring are 2.0661e-7 degrees of latitude apart
  // (~2.3cm), identical longitude — just over double the old 1e-7 degree
  // threshold, so the old sameRealPoint never caught it.
  const a: FareZonePoint = { lon: -5.715723037719727, lat: 57.28751566953964 };
  const b: FareZonePoint = { lon: -5.715723037719727, lat: 57.28751587615412 };
  assert(sameRealPoint(a, b), "the real TEST-zone (id 58) near-duplicate pair, ~2.3cm apart, must now be recognised as the same real point");
}

{
  // Two points a real, deliberate 2 metres apart (well beyond the 0.5m
  // tolerance) must NOT be treated as duplicates — the fix must not have
  // widened the tolerance so far it starts collapsing genuinely distinct
  // clicks.
  const a: FareZonePoint = { lon: -5.715723037719727, lat: 57.28751566953964 };
  const b: FareZonePoint = { lon: -5.715723037719727, lat: 57.2875337 }; // ~2m further north
  assert(!sameRealPoint(a, b), "two points a genuine ~2m apart must still be treated as different real points");
}

{
  // dedupeRing against the TEST zone's own real saved ring (id 58,
  // pulled directly from save.sqlite, 2026-11-19) — the actual data this
  // whole rewrite was triggered by. Points 12/13 (0-indexed) are the
  // real near-duplicate pair; every other consecutive pair in this real
  // ring is a genuine, far-larger gap.
  const testZone58Ring: FareZonePoint[] = [
    { lon: -5.717664957046509, lat: 57.28796848887046 },
    { lon: -5.717544257640839, lat: 57.28790326079988 },
    { lon: -5.717407464981079, lat: 57.28782933551349 },
    { lon: -5.717352633669384, lat: 57.28772913244461 },
    { lon: -5.717459399481017, lat: 57.28758042422715 },
    { lon: -5.7170313492596, lat: 57.28767312869712 },
    { lon: -5.716779487978056, lat: 57.287734779701516 },
    { lon: -5.716489945406013, lat: 57.287794403137504 },
    { lon: -5.716185705216587, lat: 57.287810848969826 },
    { lon: -5.716059592173677, lat: 57.28779941127273 },
    { lon: -5.715752214506132, lat: 57.28769927574171 },
    { lon: -5.715338485595438, lat: 57.287364564881344 },
    { lon: -5.715723037719727, lat: 57.28751566953964 }, // 12 — the near-duplicate pair
    { lon: -5.715723037719727, lat: 57.28751587615412 }, // 13
    { lon: -5.7154494524002075, lat: 57.287595237793454 },
    { lon: -5.715398944259139, lat: 57.28752953603475 },
    { lon: -5.715067237615585, lat: 57.28709804698377 },
    { lon: -5.714762806892395, lat: 57.287056010135046 },
    { lon: -5.715977958579629, lat: 57.286651784546024 },
    { lon: -5.717496130347257, lat: 57.28691291414867 },
    { lon: -5.718025060247044, lat: 57.287872433639734 },
  ];
  const deduped = dedupeRing(testZone58Ring);
  assert(deduped.length === testZone58Ring.length - 1, `expected exactly one pair collapsed (21 -> 20 points), got ${deduped.length} from ${testZone58Ring.length}`);
  // Confirm it's specifically the 12/13 pair that collapsed, not some
  // other pair — point 12 (whichever of the two survives) should now sit
  // directly between points 11 and 14 with no stray extra vertex.
  const idx11 = deduped.findIndex((p) => p.lon === testZone58Ring[11].lon && p.lat === testZone58Ring[11].lat);
  assert(idx11 >= 0, "point 11 survives unchanged");
  const next = deduped[idx11 + 1];
  const nextNext = deduped[idx11 + 2];
  assert(
    sameRealPoint(next, testZone58Ring[12]) && nextNext.lon === testZone58Ring[14].lon && nextNext.lat === testZone58Ring[14].lat,
    `expected the collapsed pair's one survivor directly between real points 11 and 14, got next=${JSON.stringify(next)} nextNext=${JSON.stringify(nextNext)}`,
  );
}

{
  // A ring with no near-duplicates anywhere, including across its own
  // wrap-around closing edge, comes back completely unchanged.
  const clean: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 1, lat: 1 },
    { lon: 0, lat: 1 },
  ];
  const deduped = dedupeRing(clean);
  assert(deduped.length === 4, `a ring with no real duplicates anywhere is untouched, got ${deduped.length} points`);
}

{
  // The wrap-around case specifically: the ring's own LAST point is a
  // near-duplicate of its FIRST — a real possibility (e.g. a zone-to-zone
  // snap landing the final click back on the exact vertex the first
  // click started from) that a purely consecutive-pair scan wouldn't
  // catch without also checking the closing edge.
  const wrapsAround: FareZonePoint[] = [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 0 },
    { lon: 1, lat: 1 },
    { lon: 0.0000001, lat: 0.0000001 }, // ~0.014m from point 0 — a real near-duplicate of the first point
  ];
  const deduped = dedupeRing(wrapsAround);
  assert(deduped.length === 3, `the wrap-around near-duplicate of the first point must be dropped, got ${deduped.length} points`);
}

// --- end-to-end: the TEST zone (id 58)'s own real near-duplicate pair,
// through the real finalize pipeline (dedupeRing, then a road push-out).
//
// **Updated 2026-11-20** — the divergence mechanism this test originally
// documented (pushOutRoadSnappedPoints pushing every point independently
// BY ARRAY INDEX using its own distinct `prev`/`next` tangent, so two
// near-identical entries could diverge) only ever applied to the
// tangent-slide algorithm (`pushPointOffRoad`). That same day's rewrite
// restricted tangent-sliding to a genuinely ISOLATED road-snapped point
// (no road-snapped ring neighbour on either side) — every point in a
// multi-point run (like this one, where every point is road-snapped) now
// uses the plain, direction-agnostic `pushPointPerpendicular` instead,
// which depends only on the point's own projection onto the road edge,
// not on its neighbours at all. That incidentally makes this exact
// divergence mechanism impossible for a run even WITHOUT dedup — a
// genuine improvement, not a regression — so this test now confirms
// that directly instead of asserting the old (now extinct) failure mode.
// dedupeRing still runs as part of the real pipeline regardless (it
// guards other cases, e.g. an isolated point's tangent-slide, which is
// still neighbour-sensitive) and is still confirmed to collapse the pair.
{
  const testZone58Ring: FareZonePoint[] = [
    { lon: -5.715338485595438, lat: 57.287364564881344 }, // 11
    { lon: -5.715723037719727, lat: 57.28751566953964 }, // 12 — near-duplicate pair
    { lon: -5.715723037719727, lat: 57.28751587615412 }, // 13
    { lon: -5.7154494524002075, lat: 57.287595237793454 }, // 14
  ];
  // A real-shaped road edge running close to the near-duplicate pair, so
  // both points qualify for push-out.
  const nearestRoadEdge = (lon: number, lat: number) => ({ distM: 0.3, aLon: lon - 0.01, aLat: lat, bLon: lon + 0.01, bLat: lat, widthM: 5.5 });

  // Every point here is standing in for a genuinely road-snapped draft
  // point (DESIGN.md §9, 2026-11-20 rewrite) — all true.
  const allRoadSnapped = testZone58Ring.map(() => true);
  const pushedWithoutDedup = pushOutRoadSnappedPoints([...testZone58Ring], allRoadSnapped, nearestRoadEdge);
  const rawGapM = distanceForTest(pushedWithoutDedup[1], pushedWithoutDedup[2]);
  assert(
    rawGapM < 0.05,
    `the perpendicular-for-runs redesign should keep the near-duplicate pair's pushed copies just as close together as they started (~2.3cm), even without dedup — got ${rawGapM}m`,
  );

  // dedupeRing still runs as part of the real Save pipeline regardless,
  // and still correctly collapses the pair — confirmed directly, not
  // assumed just because it's no longer load-bearing for THIS specific
  // divergence.
  const deduped = dedupeRing(testZone58Ring);
  assert(deduped.length === 3, `the real near-duplicate pair collapses before push-out ever sees it, got ${deduped.length}`);
  const pushedWithDedup = pushOutRoadSnappedPoints(deduped, deduped.map(() => true), nearestRoadEdge);
  assert(pushedWithDedup.length === 3, "push-out doesn't change the point count, only positions");
}

console.log("All coastline-clip checks passed.");
