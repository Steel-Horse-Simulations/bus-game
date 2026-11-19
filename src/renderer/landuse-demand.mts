// Demand from land use (DESIGN.md §2 "Demand": "Generated from OSM land
// use... Responds to fares through a single global price sensitivity, and
// to awareness (§10)"), Phase 4, plan #5 of the approved 2026-11-15 batch.
//
// This module is the INPUT side only: decoding the real, already-classified
// `landuse.bin` pipeline artefact (`rust/pipeline/src/landuse.rs` — zone
// centroids and POI points, each tagged with a `DemandCategory`) and
// turning that into real-weighted demand points. It does NOT run any
// simulation, does not connect to the journey planner or to stops, and is
// not yet consumed by anything — that's the two-tier passenger simulation
// (plan #6), the actual CONSUMER of whatever this produces. Time-of-day
// variation and price-sensitivity (both explicitly named in DESIGN.md §2)
// are runtime simulation concerns, not something a static weight can
// express, so neither is attempted here — deliberately deferred to #6.
//
// Genuinely separate from `fare-zone-drawing.ts`'s own landuse queries:
// that feature reads LIVE basemap vector-tile geometry (the `openmaptiles`
// `landuse` source-layer — shapes and a coarse class, for Ctrl-snap
// tracing) from whatever's currently rendered on screen. This module reads
// the PIPELINE's own separate `landuse.bin` artefact — real classified
// zone centroids and POI points built once at data-build time specifically
// to feed demand, including POIs the basemap's own landuse layer doesn't
// carry at all (a school, a supermarket). Different data, different
// purpose; don't conflate the two.
//
// DESIGN.md §2 gives no precise weighting formula ("Generated from OSM
// land use" is as specific as it gets) — the relative weights below are a
// first-pass placeholder, not a sourced real-world figure, same convention
// as this project's own `KERB_OFFSET_M` ("Placeholder magnitude, not a
// sourced real-world kerb offset"). Revisit once DESIGN.md §2 is itself
// expanded with real numbers, rather than treating this as settled.
import { decode_landuse } from "./wasm/game_wasm.js";

export type DemandCategory = "Housing" | "Retail" | "Schools" | "Workplaces";

export interface DemandPoint {
  category: DemandCategory;
  lon: number;
  lat: number;
  name: string | null;
  // A zone is a landuse polygon's own centroid (coarse, one point for a
  // whole residential/retail/industrial area); a poi is a single real
  // point (a specific school, shop, office). Kept distinct rather than
  // merged into one undifferentiated "demand point" list, since a
  // consumer may reasonably want to weight a poi's own precise location
  // differently from a zone's coarse area-wide centroid.
  kind: "zone" | "poi";
  // The real osmId straight from the pipeline artefact — kept so a future
  // consumer can deduplicate against the same real-world feature if it's
  // ALSO seen elsewhere (e.g. matched against a stop's own catchment),
  // without this module needing to know anything about that consumer.
  osmId: number;
}

// Relative weight per category — a placeholder, not a sourced figure (see
// this file's own header). Workplaces and Housing are each other's real
// commute counterpart (people travel FROM housing TO workplaces and back,
// the dominant real-world bus demand pattern), so both start at the same
// baseline; Retail is weighted lower since a retail trip is typically
// optional/discretionary rather than a daily commute; Schools highest,
// reflecting how concentrated school-run demand genuinely is in a short
// real-world time window compared to the other three.
export const DEMAND_CATEGORY_WEIGHT: Readonly<Record<DemandCategory, number>> = {
  Housing: 1.0,
  Workplaces: 1.0,
  Retail: 0.6,
  Schools: 1.4,
};

// Plain multiply-by-category-weight — kept as its own named function
// rather than inlined at every call site, so a future consumer (the
// passenger simulation) has one real place to find "how much demand does
// this point represent," and so this can grow a second factor (e.g. a
// zone's own real area, once that's available) without every caller
// needing to change.
export function demandWeightFor(point: Pick<DemandPoint, "category">): number {
  return DEMAND_CATEGORY_WEIGHT[point.category];
}

// Parses whatever `decode_landuse` (WASM) hands back — plain JS objects at
// this point, no longer the raw bincode bytes — into typed DemandPoints.
// Pure and WASM-call-free itself (the actual WASM call lives in
// `loadLanduseDemandPoints` below) specifically so this parsing step stays
// unit-testable with a synthetic array, the same "pure logic split from
// the WASM/fetch call" convention `coastline-clip.mts`/`area-cluster.mts`
// already use.
export interface RawDecodedLandusePoint {
  kind: string;
  category: string;
  lon: number;
  lat: number;
  osmId: number;
  name?: string;
}

export function parseDecodedLandusePoints(raw: readonly RawDecodedLandusePoint[]): DemandPoint[] {
  const points: DemandPoint[] = [];
  for (const r of raw) {
    if (r.kind !== "zone" && r.kind !== "poi") continue; // unknown/future kind — skip rather than guess
    if (r.category !== "Housing" && r.category !== "Retail" && r.category !== "Schools" && r.category !== "Workplaces") continue;
    points.push({ kind: r.kind, category: r.category, lon: r.lon, lat: r.lat, name: r.name ?? null, osmId: r.osmId });
  }
  return points;
}

// The one impure piece: fetches the real pipeline artefact from the local
// map-data server (same `http://127.0.0.1:38271/<file>` convention
// `fare-zone-drawing.ts`'s own `coastline.bin` fetch already uses — this
// file is served automatically, already a plain static file under the
// map-data root, no electron/main.ts change needed) and decodes it via
// the real WASM module. Returns an empty array on any failure (file not
// yet downloaded, server not reachable) rather than throwing — same
// "can't check it, don't block/break on it" convention this project uses
// throughout its other optional-data paths (e.g. `fare-zone-drawing.ts`'s
// own coastline-fetch try/catch).
export async function loadLanduseDemandPoints(): Promise<DemandPoint[]> {
  try {
    const res = await fetch("http://127.0.0.1:38271/landuse.bin");
    if (!res.ok) return [];
    const bytes = new Uint8Array(await res.arrayBuffer());
    const raw = decode_landuse(bytes) as RawDecodedLandusePoint[];
    return parseDecodedLandusePoints(raw);
  } catch {
    return [];
  }
}
