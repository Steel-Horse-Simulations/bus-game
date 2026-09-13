// Direction (DESIGN.md §6): "Normally oriented on the main bus station in
// the operating area — inbound towards it, outbound away." "On a circular
// route, clockwise is outbound, anticlockwise inbound."
//
// A route's saved point order runs one way; this decides whether travelling
// that stored order counts as the inbound or outbound direction. The reverse
// traversal is always the other one.
//
// A route with a terminus loop (DESIGN.md §6 "Start and terminus stops")
// stores BOTH legs in one continuous point list — the outbound leg, then the
// dead-running hop, then the return leg's own (possibly different) stops —
// rather than one direction with the return implied by reversal. Direction
// only meaningfully applies to the *outbound* leg's own two ends in that
// case (points[0] and the terminus point): the return leg is the opposite
// direction by construction, since a route only has two. Where there's no
// loop, the "outbound end" is simply the last point, same as before.
//
// The settlement-fallback rule ("a route touching no bus station" — see
// OPEN-ITEMS.md) isn't implemented: it needs OSM place nodes, which nothing
// in the pipeline extracts yet. Every route saved so far needs its depot
// group to have a manually-assigned main bus station.
export type Orientation = "inbound" | "outbound";
export type LonLat = readonly [number, number];

function isCircular(points: readonly LonLat[]): boolean {
  if (points.length < 3) return false;
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  return x0 === xn && y0 === yn;
}

// Shoelace formula. lon is x (east+), lat is y (north+) — standard
// cartesian orientation, so a positive result means the points run
// counterclockwise, negative means clockwise.
function signedArea(points: readonly LonLat[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function distance(a: LonLat, b: LonLat): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeRouteOrientation(
  points: readonly LonLat[],
  mainBusStation: LonLat,
  outboundEndIndex?: number,
): Orientation {
  if (points.length < 2) {
    throw new Error("a route needs at least two points to have an orientation");
  }

  if (isCircular(points)) {
    return signedArea(points) >= 0 ? "inbound" : "outbound";
  }

  const start = points[0];
  const end = points[outboundEndIndex ?? points.length - 1];
  // Travelling start -> end: if end is the nearer end, that traversal is
  // "towards" the station, i.e. inbound.
  return distance(end, mainBusStation) <= distance(start, mainBusStation) ? "inbound" : "outbound";
}

// Start and terminus stops (DESIGN.md §6): a route's first stop is always a
// start and its last always a terminus, nothing to set. `terminusIndex` and
// `startIndex` are the one additional interior stop each the player can flag
// — terminus to end the outbound leg early, start to begin the return leg —
// which is what keeps the cap at exactly 2 of each (one per direction)
// rather than needing separate counting logic. The two may be the same
// stop (an early terminus with no real loop); where they differ, the stop
// list runs the dead-running hop between them exactly like any other leg,
// waypoints included.
export function validateStartTerminus(
  points: readonly { kind: "stop" | "waypoint" }[],
  terminusIndex: number | null,
  startIndex: number | null,
): string | null {
  if (terminusIndex === null && startIndex === null) return null;
  if (terminusIndex === null || startIndex === null) {
    return "A terminus loop needs both a terminus and a start stop set.";
  }
  if (terminusIndex <= 0 || terminusIndex >= points.length) {
    return "The terminus stop can't be the first point of the route.";
  }
  if (startIndex < terminusIndex || startIndex >= points.length) {
    return "The start of the return leg must be at or after the terminus stop.";
  }
  if (points[terminusIndex].kind !== "stop") {
    return "The terminus stop must be a stop, not a waypoint.";
  }
  if (points[startIndex].kind !== "stop") {
    return "The start of the return leg must be a stop, not a waypoint.";
  }
  return null;
}
