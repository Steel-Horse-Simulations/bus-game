// The real Wales political border (2026-11-15) — exact structural mirror
// of `scotland-boundary.mts`, Wales instead of Scotland, per the user's
// own direct instruction: "National Express Welsh... should follow all
// the same rules as the Scottish livery except Wales instead of
// Scotland." Loads the genuinely separate `wales_boundary.bin` artefact
// (built from Geofabrik's own real `wales.poly` region file) and exposes
// a plain point-in-boundary check, backing National Express Welsh's own
// route-terminus restriction (livery-seed-data.mts).
//
// Fetched once at boot (mirrors scotland-boundary.mts's own fetch-once
// pattern, same local pipeline-data server every artefact uses) and kept
// in module state — callers never re-fetch.
import { point_in_wales } from "./wasm/game_wasm.js";

let boundaryBytes: Uint8Array | null = null;

export async function loadWalesBoundary(): Promise<void> {
  try {
    const res = await fetch("http://127.0.0.1:38271/wales_boundary.bin");
    if (res.ok) {
      boundaryBytes = new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    // Fetch failed (dev pipeline-data not yet rebuilt with the new
    // artefact, or the local server isn't up) — boundaryBytes stays
    // null, handled by isPointInWales below. Never crashes the boot
    // sequence over this.
  }
}

// Whether (lon, lat) falls inside the real Wales boundary. Fails OPEN,
// not closed, when the boundary couldn't be loaded at all — same
// "missing data = no known restriction" convention as
// isPointInScotland (scotland-boundary.mts), for the same reason: this
// check's one real consumer, National Express Welsh's terminus
// restriction, only exists to BLOCK a route with neither terminus in
// Wales, so "can't tell" must resolve to "don't block."
export function isPointInWales(lon: number, lat: number): boolean {
  if (boundaryBytes === null) return true;
  return point_in_wales(boundaryBytes, lon, lat);
}

// Exposed for any future caller that needs to distinguish "couldn't
// check" from "checked and it's not in Wales" — not used by
// livery-seed-data.mts's own check, which deliberately treats both the
// same way via isPointInWales's fail-open default above.
export function walesBoundaryLoaded(): boolean {
  return boundaryBytes !== null;
}
