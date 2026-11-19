// Pure geometry for placing a moving bus along a route's real road-snapped
// path (DESIGN.md §2 "Vehicles": "every bus drives the real road network —
// not abstract movement along a route line"). No DOM/maplibre-gl/wasm
// imports, so this is safely unit-testable in Node — the actual road
// geometry and offsets are supplied by the caller (vehicle-simulation.ts),
// which does own the router and the map.
export type LonLat = readonly [number, number];

// Matches route-orientation.ts's own LonLat exactly (readonly tuple), the
// same convention settlement-fallback.mts already follows.
export function approxDistanceM(a: LonLat, b: LonLat): number {
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
  // Real bug found live (2026-11-14, user report: "buses always face
  // North-South ... do not follow the angle of the road at all anywhere" —
  // confirmed against route 398's own real waypoints, which genuinely zig-
  // zag N/E/N/W/S, not a straight line). `x` above is in radians (dLon was
  // run through toRad), but `y` here was left in raw degrees — a unit
  // mismatch, not a sign error. Radians are ~57x (180/π) smaller than the
  // same angle in degrees, so the un-converted `y` was always ~57x too big
  // relative to `x`, pulling atan2(x, y) toward the y-axis (north/south)
  // for virtually any real road segment regardless of its true east-west
  // component. `y` must be in the same unit as `x`.
  const y = toRad(b[1] - a[1]);
  const deg = (Math.atan2(x, y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// How vehicle-simulation.ts's own map badge/number should actually be
// drawn for a given true compass bearing — real bug report, 2026-11-14:
// rotating the badge/number through the "upside-down" half of the compass
// (same artwork-orientation correction as elsewhere: the badge's own
// native unrotated artwork is landscape/east-pointing, map-icons.ts's
// drawArrow, hence the -90) made liveries and route numbers read upside
// down for any vehicle heading roughly west. A real bus mirrors, it
// doesn't flip vertically, when it turns around, so the badge's own image
// is swapped for a horizontally-flipped variant (vehicle-simulation.ts
// picks liveryBadgeMirroredImageId when `needsMirror` is true) instead of
// letting the rotation continue into the unreadable half. The arrow
// layer deliberately does NOT use this — an arrow reads fine upside down,
// unlike text or a livery pattern, so it keeps showing the true heading
// through the full 360° via its own unclamped `bearing - 90`.
export function badgeDisplayRotation(trueBearingDegrees: number): { badgeRotation: number; needsMirror: boolean } {
  const artworkBearing = (((trueBearingDegrees - 90) % 360) + 360) % 360;
  const needsMirror = artworkBearing > 90 && artworkBearing < 270;
  return { badgeRotation: needsMirror ? artworkBearing - 180 : artworkBearing, needsMirror };
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
