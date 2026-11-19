// The real Scotland political border (T190, 2026-11-14) — genuinely
// separate from the game's EXTRACT boundary (the Rust pipeline's
// `extract-boundary.poly`, used only to clip the GB+Ireland+IoM .pbf
// down to a sane file size), which is deliberately extended south into
// England (the hand-drawn Carlisle/Berwick corridor) and so would wrongly
// say Carlisle/Berwick/Newcastle are "in Scotland." This loads the
// genuinely separate `scotland_boundary.bin` artefact (built from
// Geofabrik's own real `scotland.poly` region file) and exposes a plain
// point-in-boundary check, backing National Express Scottish's own
// route-terminus restriction (livery-seed-data.mts).
//
// Fetched once at boot (mirrors fare-zone-drawing.ts's own `coastline.bin`
// fetch-once pattern, same local pipeline-data server every artefact
// uses) and kept in module state — callers never re-fetch.
import { point_in_scotland } from "./wasm/game_wasm.js";

let boundaryBytes: Uint8Array | null = null;

export async function loadScotlandBoundary(): Promise<void> {
  try {
    const res = await fetch("http://127.0.0.1:38271/scotland_boundary.bin");
    if (res.ok) {
      boundaryBytes = new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    // Fetch failed (dev pipeline-data not yet rebuilt with the new
    // artefact, or the local server isn't up) — boundaryBytes stays
    // null, handled by isPointInScotland below. Never crashes the boot
    // sequence over this.
  }
}

// Whether (lon, lat) falls inside the real Scotland boundary. Fails OPEN,
// not closed, when the boundary couldn't be loaded at all (`null` —
// fetch never ran, failed, or the server returned non-OK): returns
// `true` rather than `false` in that case. This looks backwards for a
// general point-in-polygon predicate, but matches this project's
// "missing data = no known restriction" convention (same reasoning as
// `maxweight_tonnes`/`maxheight_metres` etc. in the road graph, OPEN-
// ITEMS.md T182) applied to this check's one real consumer: National
// Express Scottish's terminus restriction only exists to BLOCK a route
// with neither terminus in Scotland, so "can't tell" must resolve to
// "don't block," i.e. every point counts as a pass. If a second consumer
// ever needs a true "is this point definitely in Scotland" answer
// regardless of load failure, it should check `scotlandBoundaryLoaded()`
// first rather than relying on this fail-open default.
export function isPointInScotland(lon: number, lat: number): boolean {
  if (boundaryBytes === null) return true;
  return point_in_scotland(boundaryBytes, lon, lat);
}

// Exposed for any future caller that needs to distinguish "couldn't
// check" from "checked and it's not in Scotland" — not used by
// livery-seed-data.mts's own check, which deliberately treats both the
// same way via isPointInScotland's fail-open default above.
export function scotlandBoundaryLoaded(): boolean {
  return boundaryBytes !== null;
}
