// Automatic "is this real land an island" detection (2026-11-15 live
// request: "Could we automate whether an area is an Island?"), using the
// pipeline's own real coastline geometry (coastline.bin) rather than a
// manual player choice or a curated name list. A closed coastline chain is
// a real landmass outline — this measures each one's own real area (not
// point count, not raw degree^2) and classifies anything below a measured
// threshold as an island.
//
// Real measured areas, from the actual pipeline-data/coastline.bin (a
// throwaway `cargo run --example measure_coastline_areas` against
// game-data's own decode_coastline, deleted after use — the project's own
// "replay real pipeline data" convention):
//   Great Britain mainland  ~220,581 km^2
//   Ireland (whole island)  ~83,236 km^2  — ONE closed chain for the whole
//     island (Republic + Northern Ireland), confirmed directly rather than
//     assumed; politically irrelevant to this measurement, it's one real
//     landmass in the data.
//   Lewis & Harris (biggest real UK island found) ~2,140 km^2
//   Skye                    ~1,629 km^2
//   Shetland Mainland       ~947 km^2
//   Mull                    ~880 km^2
//   Anglesey                ~676 km^2
//   Islay                   ~615 km^2
//   Orkney Mainland         ~579 km^2
//   Isle of Man             ~569 km^2
//   Arran                   ~428 km^2
//   Isle of Wight           ~380 km^2
// User's own correction, critical: Ireland is ALSO a mainland in this
// game's scope, not an island ("Ireland is also mainland not just an
// island") — so "mainland" means the top TWO real landmasses (GB and
// Ireland), not simply "the single largest."
//
// There is a huge, clean gap between the two mainlands (83,236 km^2 for
// the smaller of the two) and the next-largest real island (2,140 km^2) —
// over 38x. MAINLAND_AREA_THRESHOLD_KM2 sits in the middle of that gap
// with a wide margin on both sides, so it isn't sensitive to measurement
// noise in either direction. The Isle of Man correctly lands on the
// island side at ~569 km^2 — it does NOT need excluding, only GB/Ireland
// do.
export const MAINLAND_AREA_THRESHOLD_KM2 = 10_000;

import { isEffectivelyClosed } from "./coastline-clip.mts";

export interface FareZonePoint {
  lon: number;
  lat: number;
}

const EARTH_RADIUS_M = 6_371_000;

// Local equirectangular projection centred on the chain's own mean
// latitude — the same convention this codebase's other real-distance/area
// calculations already use (fare-zone-road-pushout.mts's toLocalXY,
// passenger-simulation.mts's approxDistanceM) — good enough at a single
// landmass's own scale, not meant for anything spanning the whole globe.
function chainAreaKm2(chain: readonly FareZonePoint[]): number {
  const meanLat = chain.reduce((sum, p) => sum + p.lat, 0) / chain.length;
  const cosLat0 = Math.cos((meanLat * Math.PI) / 180);
  const toXY = (p: FareZonePoint): [number, number] => [
    (p.lon * Math.PI) / 180 * EARTH_RADIUS_M * cosLat0,
    (p.lat * Math.PI) / 180 * EARTH_RADIUS_M,
  ];
  let area = 0;
  for (let i = 0; i < chain.length; i++) {
    const [xa, ya] = toXY(chain[i]);
    const [xb, yb] = toXY(chain[(i + 1) % chain.length]);
    area += xa * yb - xb * ya;
  }
  return Math.abs(area) / 2 / 1_000_000;
}

// Plain ray-casting point-in-polygon (odd-even rule) — the same test this
// codebase already has three independent copies of (fare-journey.mts's
// pointInZoneRing, electron/db.mts's pointInFareZoneRing, fare-zone-
// drawing.ts's own pointInRing), each kept separate because each lives in
// a module that must stay independent of the others (this one must stay
// WASM/DOM-free so it's unit-testable, matching fare-journey.mts's own
// stated reasoning for its copy) — a fourth copy for the same reason, not
// an oversight.
function pointInRing(point: FareZonePoint, ring: readonly FareZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersects = a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

interface BoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function boundingBoxOf(chain: readonly FareZonePoint[]): BoundingBox {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of chain) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function inBoundingBox(point: FareZonePoint, box: BoundingBox): boolean {
  return point.lon >= box.minLon && point.lon <= box.maxLon && point.lat >= box.minLat && point.lat <= box.maxLat;
}

// Whether `point` sits on real land that's an island — i.e. inside a real
// closed coastline chain whose own measured area is below the mainland
// threshold. Returns null (not false) when the point isn't found inside
// ANY closed chain at all — same "can't tell, don't claim it" convention
// this codebase uses everywhere (e.g. scotland-boundary.mts's fail-open
// default) — a caller that needs a plain boolean default should treat
// null as "not an island" explicitly, not silently coerce it.
//
// Performance: `coastlineChains` can include one chain with ~900,000
// points (the real GB mainland ring) — a full ray-cast against every
// closed chain for every query point would be the same "fine once, freezes
// at whole-country scale" shape that already caused two real live
// freezes this session (OPEN-ITEMS.md T187, T197). This is called once per
// "Save zone" click (a rare, user-initiated action, not a per-frame/tick
// loop), and every chain's own bounding box is checked FIRST (cheap, O(1)
// per chain) before the expensive full ray-cast runs — in practice only
// the one or two chains whose bbox genuinely contains the point ever reach
// the ray-cast, not all ~17,000.
export function islandAreaForPoint(point: FareZonePoint, coastlineChains: readonly FareZonePoint[][]): { isIsland: boolean; areaKm2: number } | null {
  let best: { areaKm2: number } | null = null;
  for (const chain of coastlineChains) {
    if (chain.length < 4) continue;
    if (!isEffectivelyClosed(chain)) continue;
    const box = boundingBoxOf(chain);
    if (!inBoundingBox(point, box)) continue;
    if (!pointInRing(point, chain)) continue;
    const areaKm2 = chainAreaKm2(chain);
    if (best === null || areaKm2 > best.areaKm2) best = { areaKm2 };
  }
  if (best === null) return null;
  return { isIsland: best.areaKm2 < MAINLAND_AREA_THRESHOLD_KM2, areaKm2: best.areaKm2 };
}
