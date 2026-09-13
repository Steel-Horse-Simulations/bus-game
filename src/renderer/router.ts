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
export async function loadRouter(): Promise<Router> {
  const [res, psvOverrideWayIds] = await Promise.all([
    fetch("http://127.0.0.1:38271/road_graph.bin"),
    loadPsvOverrideWayIds(),
  ]);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return new Router(bytes, Float64Array.from(psvOverrideWayIds));
}
