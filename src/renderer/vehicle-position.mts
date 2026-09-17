// Pure geometry for placing a moving bus along a route's real road-snapped
// path (DESIGN.md §2 "Vehicles": "every bus drives the real road network —
// not abstract movement along a route line"). No DOM/maplibre-gl/wasm
// imports, so this is safely unit-testable in Node — the actual road
// geometry and offsets are supplied by the caller (vehicle-simulation.ts),
// which does own the router and the map.
export type LonLat = readonly [number, number];

// Matches route-orientation.ts's own LonLat exactly (readonly tuple), the
// same convention settlement-fallback.mts already follows.
function approxDistanceM(a: LonLat, b: LonLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[0] - a[0]);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

// Forward azimuth in degrees (0 = north, 90 = east), equirectangular
// approximation adequate at road-segment scale — same tolerance the rest
// of this codebase's small geometry helpers already accept.
function bearingDegrees(a: LonLat, b: LonLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const dLon = toRad(b[0] - a[0]);
  const x = dLon * Math.cos(lat1);
  const y = b[1] - a[1];
  const deg = (Math.atan2(x, y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// A point `fraction` (0..1) of the way along `coords` by cumulative
// distance — not just linear interpolation between the two endpoints — so
// a bus follows the polyline's own curves rather than cutting corners.
// `coords` must have at least one point; a single-point (or zero-length)
// polyline returns that point with bearing 0, since there's no direction
// to derive.
export function interpolateAlongPolyline(
  coords: readonly LonLat[],
  fraction: number,
): { position: LonLat; bearingDegrees: number } {
  if (coords.length === 0) throw new Error("interpolateAlongPolyline needs at least one point");
  if (coords.length === 1) return { position: coords[0], bearingDegrees: 0 };

  const clamped = Math.min(1, Math.max(0, fraction));
  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = approxDistanceM(coords[i - 1], coords[i]);
    segmentLengths.push(d);
    total += d;
  }
  if (total === 0) return { position: coords[0], bearingDegrees: bearingDegrees(coords[0], coords[coords.length - 1]) };

  const targetDistance = clamped * total;
  let covered = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (covered + segLen >= targetDistance || i === segmentLengths.length - 1) {
      const segFraction = segLen > 0 ? (targetDistance - covered) / segLen : 0;
      const a = coords[i];
      const b = coords[i + 1];
      const position: LonLat = [a[0] + (b[0] - a[0]) * segFraction, a[1] + (b[1] - a[1]) * segFraction];
      return { position, bearingDegrees: bearingDegrees(a, b) };
    }
    covered += segLen;
  }
  // Unreachable given the loop's own last-segment fallback above, but keeps
  // the function total.
  return { position: coords[coords.length - 1], bearingDegrees: bearingDegrees(coords[coords.length - 2], coords[coords.length - 1]) };
}

// One route point's precomputed timing (route-timetable.mts's
// computeOffsets output, one entry per route point) — arrival and
// departure differ only at a timing point's own dwell (DESIGN.md §7
// "Timing points"), so this same data already encodes "wait here" with no
// further logic needed.
export interface JourneyPointTiming {
  arrivalOffsetSeconds: number;
  departureOffsetSeconds: number;
}

// The road-snapped polyline between one point and the next (inclusive of
// both endpoints) — one entry per leg, so `legs.length === points.length - 1`.
export interface RouteLeg {
  coords: readonly LonLat[];
}

// Where a bus on this journey is `elapsedSeconds` after its departure from
// point 0 — `null` if the journey hasn't started yet or has already
// finished (the caller decides whether that means "don't render" or "check
// yesterday's still-running late-night journey instead"). Never skips a
// stop and always passes through every point in order, matching DESIGN.md
// §2's "it never skips stops, but it recovers time at later timing points
// where the timetable has slack" — recovery is already baked into
// `points`' own precomputed offsets, so this function doesn't need its own
// lateness/recovery logic at all.
export function computeVehiclePosition(
  legs: readonly RouteLeg[],
  points: readonly JourneyPointTiming[],
  elapsedSeconds: number,
): { position: LonLat; bearingDegrees: number } | null {
  if (points.length < 2) throw new Error("a journey needs at least two points");
  if (legs.length !== points.length - 1) {
    throw new Error(`expected ${points.length - 1} legs for ${points.length} points, got ${legs.length}`);
  }
  if (elapsedSeconds < 0 || elapsedSeconds > points[points.length - 1].arrivalOffsetSeconds) return null;

  let lastBearing = 0;
  for (let i = 0; i < legs.length; i++) {
    const here = points[i];
    const next = points[i + 1];
    if (elapsedSeconds <= here.departureOffsetSeconds) {
      // Still dwelling at this point (only non-instantaneous at a timing
      // point) — held at its own position, facing however the bus arrived.
      return { position: legs[i].coords[0], bearingDegrees: lastBearing };
    }
    if (elapsedSeconds < next.arrivalOffsetSeconds) {
      const legDuration = next.arrivalOffsetSeconds - here.departureOffsetSeconds;
      const fraction = legDuration > 0 ? (elapsedSeconds - here.departureOffsetSeconds) / legDuration : 1;
      const result = interpolateAlongPolyline(legs[i].coords, fraction);
      lastBearing = result.bearingDegrees;
      return result;
    }
    lastBearing = interpolateAlongPolyline(legs[i].coords, 1).bearingDegrees;
  }
  // elapsedSeconds is within the terminus's own dwell window (arrival <=
  // elapsedSeconds <= departure, already excluded from the loop above once
  // every leg is spent) — held at the final point.
  return { position: legs[legs.length - 1].coords[legs[legs.length - 1].coords.length - 1], bearingDegrees: lastBearing };
}
