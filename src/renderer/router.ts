import { Router } from "./wasm/game_wasm.js";

// The road-edge override layer (DESIGN.md §1, extended from stops/bus
// stations to road edges): an OSM way the player has manually flagged as
// bus-legal despite its own tags saying otherwise — CLAUDE.md's "missing
// turn restrictions and mis-tagged one-ways... the override layer must be
// built once and reused." Reuses the exact same generic osm_overrides
// mechanism (entity_type/osm_id/field/value) as stop overrides, just with
// the way's own OSM id as the "osm_id" and a plain boolean value.
const ROAD_EDGE_ENTITY_TYPE = "road_edge";
const PSV_OVERRIDE_FIELD = "psv_override";

async function loadPsvOverrideWayIds(): Promise<number[]> {
  const overrides = await window.overrides.list<boolean>(ROAD_EDGE_ENTITY_TYPE, PSV_OVERRIDE_FIELD);
  return overrides.filter((o) => o.value === true).map((o) => o.osmId);
}

// Shared by every feature that needs to route between points — drawing,
// redrawing a saved route, computing a timetable's automatic running times.
// Loaded once so the ~95MB road graph is only fetched and parsed a single
// time per session rather than once per feature.
async function fetchBytes(url: string, onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body!.getReader();
  const out = total ? new Uint8Array(total) : null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (out) out.set(value, received);
    else chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  if (out) return out.subarray(0, received);
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

export async function loadRouter(onProgress: (fraction: number) => void = () => {}): Promise<Router> {
  const [bytes, psvOverrideWayIds] = await Promise.all([
    fetchBytes("http://127.0.0.1:38271/road_graph.bin", onProgress),
    loadPsvOverrideWayIds(),
  ]);
  // Real bug report, 2026-11-14: the caller's onProgress switches the
  // loading label to "Processing road network…" right as the download
  // finishes, but `new Router(...)` below is a long, synchronous, CPU-bound
  // WASM decode (tens of seconds for the real 969MB UK+Ireland+IoM graph)
  // with no `await` of its own — nothing yields back to the browser's
  // render loop between setting that label and blocking on the decode, so
  // the page never actually repaints it; the player keeps seeing the last
  // frame painted before the block, the stale "100%" text. A double
  // rAF (one frame to schedule the repaint, one to confirm it actually
  // happened before blocking) is the standard way to force a real paint
  // before synchronous work, not a single one which can still race it.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return new Router(bytes, Float64Array.from(psvOverrideWayIds));
}
