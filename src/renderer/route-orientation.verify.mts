// Manual verification script for route-orientation.ts, run directly with
// `npx tsx src/renderer/route-orientation.verify.mts`. Covers the 2026-11-12
// live bug report: route 56's variations disagreeing on inbound/outbound
// despite sharing one main bus station.
import { computeRouteOrientation, type LonLat } from "./route-orientation";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const portree: LonLat = [-6.1942, 57.4129];

// Plain route, no terminus loop: travelling towards the station is inbound.
{
  const points: LonLat[] = [
    [-6.55, 57.42], // far from Portree
    [-6.1942, 57.4129], // Portree itself
  ];
  assert(computeRouteOrientation(points, portree) === "inbound", "simple route ending at the station is inbound");
  assert(
    computeRouteOrientation([...points].reverse(), portree) === "outbound",
    "the reverse traversal (starting at the station) is outbound",
  );
}

// The actual bug: a terminus-loop route whose stored points return to the
// same stop they started at (points[0] === points[last]) must still use the
// station-distance rule on points[0]/points[terminusIndex], not the
// winding-direction rule — two variations with different detour shapes (and
// therefore different signed areas) must agree once they share the same
// start point and a terminus that's both genuinely far from the station.
{
  const start: LonLat = portree;
  const farA: LonLat = [-6.6, 57.43];
  const farB: LonLat = [-6.6, 57.2]; // same distance-from-station story, opposite-signed loop
  const loopA: LonLat[] = [start, [-6.3, 57.5], farA, [-6.4, 57.3], start];
  const loopB: LonLat[] = [start, [-6.3, 57.3], farB, [-6.4, 57.5], start];

  const terminusA = 2; // farA's index
  const terminusB = 2; // farB's index

  const orientA = computeRouteOrientation(loopA, portree, terminusA);
  const orientB = computeRouteOrientation(loopB, portree, terminusB);
  assert(orientA === "outbound", "loop A's outbound leg (station -> far end) reads outbound");
  assert(orientB === "outbound", "loop B's outbound leg (station -> far end) reads outbound too, despite opposite winding");
  assert(orientA === orientB, "both differently-shaped terminus loops agree once they share start+terminus distances");
}

// A genuine circular route with no terminus loop at all (no outboundEndIndex)
// still falls back to the winding-direction rule — this must keep working.
{
  const clockwise: LonLat[] = [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, -1],
    [0, 0],
  ];
  const anticlockwise: LonLat[] = [...clockwise].reverse();
  const anywhereStation: LonLat = [10, 10]; // irrelevant to a plain circular route
  assert(computeRouteOrientation(clockwise, anywhereStation) === "outbound", "clockwise plain loop is outbound");
  assert(computeRouteOrientation(anticlockwise, anywhereStation) === "inbound", "anticlockwise plain loop is inbound");
}

console.log("All route-orientation checks passed.");
