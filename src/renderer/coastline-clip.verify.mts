// Manual verification for coastline-clip.mts (31 October hand-off item 2,
// OPEN-ITEMS.md), run directly with `npx tsx
// src/renderer/coastline-clip.verify.mts`.
import { segmentIntersection, findCoastlineCrossings, coastlineWalkBetween, clipRingToCoastline, nearestPointOnCoastline, coastlineFollowBetween, type FareZonePoint } from "./coastline-clip.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok: ${message}`);
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

console.log("All coastline-clip checks passed.");
