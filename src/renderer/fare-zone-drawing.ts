// Fare zones (DESIGN.md §9, Phase 4 increment 1): "fare zones are drawn on
// the map by the player, in the style of Lothian's. Each zone is typed city
// or country." Geometry and typing only — no pricing/bands/capping here,
// that's increment 2/3, deliberately kept separate (see fare_zones' own
// SCHEMA comment in db.mts). Confirmed with the user (2026-10-18): each
// depot group draws and prices its own zone map independently.
//
// Freeform polygon drawing has no existing precedent in this codebase —
// route-draw.ts and dead-mileage-preview.ts both snap to the BUS-LEGAL road
// graph via find_route, which a fare zone boundary has no reason to use (a
// zone edge is an administrative/commercial boundary, not a bus route).
// This is a new click-to-add-vertex tool, following the same toggle+panel
// shell and cross-tool isPlacing/isDrawing guard convention as every other
// map tool (routeDrawState/placeStopState/placeDepotState/placeDealerState).
//
// Road-following snapping (added 2026-10-30, live user request — "when
// snapping to a road it should follow the road until the next point if it
// is also on a road") needed genuinely new Rust/WASM work: the only
// existing pathfinding (`find_route`) is bus-legal-only, and a zone
// boundary should be able to follow ANY road. `Router::find_any_road_route`
// (rust/game-wasm/src/lib.rs) is a new, simpler Dijkstra variant over a
// second "every edge, both directions regardless of oneway" adjacency
// buffer — plain shortest distance, no turn penalties or junction delays
// (those model real driving behaviour, irrelevant to tracing a shape). The
// requested 10m outside-edge offset is deliberately NOT built yet — agreed
// with the user to ship road-following first, offset as a separate
// follow-up, since properly buffering a polyline (mitred corners, no
// existing geometry library in this project) carries real self-
// intersection risk worth not rushing.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { decode_coastline, type Router } from "./wasm/game_wasm.js";
import { createDropdown } from "./dropdown";
import { clipRingToCoastline, nearestPointOnCoastline } from "./coastline-clip.mts";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";
import { placeDepotState } from "./depot-placement";
import { placeDealerState } from "./dealer-placement";
import { BOTTOM_BAR_CLEARANCE_PX } from "./bottom-bar";

export const fareZoneDrawState = { isDrawing: false };

const ZONES_SOURCE_ID = "fare-zones";
const ZONES_FILL_LAYER_ID = "fare-zones-fill";
const ZONES_OUTLINE_LAYER_ID = "fare-zones-outline";
const ZONES_LABEL_LAYER_ID = "fare-zones-label";
const DRAFT_LINE_SOURCE_ID = "fare-zone-draft-line";
const DRAFT_LINE_LAYER_ID = "fare-zone-draft-line";
const DRAFT_POINTS_SOURCE_ID = "fare-zone-draft-points";
const DRAFT_POINTS_LAYER_ID = "fare-zone-draft-points";

// Plain UI default, not real data from any reference — only used to seed
// the colour picker for a brand new zone; the stored colour (fare_zones'
// own "colour" column) is what actually renders from here on.
const DEFAULT_ZONE_COLOUR: Record<FareZoneType, string> = { city: "#3b82f6", country: "#22c55e", island: "#f59e0b", town: "#a855f7" };

// Display-only capitalisation for the type dropdowns below (2026-10-31,
// live user request) — the stored value stays lowercase ("city"/
// "country", fare_zones' own CHECK constraint), only the dropdown's own
// label text is capitalised.
const ZONE_TYPE_LABELS: Record<FareZoneType, string> = { city: "City", country: "Country", island: "Island", town: "Town" };
const ZONE_TYPE_BY_LABEL: Record<string, FareZoneType> = { City: "city", Country: "country", Island: "island", Town: "town" };

// How close (in screen pixels, not degrees of lon/lat) a click needs to be
// to an existing zone's vertex or edge to snap to it, so adjacent zones can
// share an exact boundary — DESIGN.md's "in the style of Lothian's" implies
// a tiled zone map, not zones with gaps or slivers between them. Measured
// in screen space via map.project/unproject rather than a fixed lon/lat
// epsilon, since the same epsilon would mean wildly different real
// precision at different zoom levels.
const SNAP_RADIUS_PX = 14;

// Max real distance (metres) a click can be from the nearest real
// coastline point and still snap to it (2026-11-01, live bug report: "the
// fare zone is meant to snap to the edge of the land, not be in the water
// after completing it"). Same order of magnitude as `snap_to_any_road`'s
// own 500m cutoff, kept a little tighter since this is meant to catch "I
// clicked slightly off the shoreline," not reach across a strait to an
// unrelated stretch of coast.
const COASTLINE_SNAP_DISTANCE_M = 200;

function otherToolActive(): boolean {
  return routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing || placeDealerState.isPlacing;
}

// Snaps a raw click to the nearest existing zone vertex within
// SNAP_RADIUS_PX, then (if no vertex was close enough) the nearest point on
// any existing zone's edge, checked in screen space. Returns null (rather
// than falling back to the raw click) when nothing is close enough, so the
// caller can fall through to road-snapping instead — zone-to-zone snapping
// takes priority over road-snapping when both are plausible, since
// matching an existing zone's own exact boundary matters more than
// generically following a road.
function snapToExistingZones(map: maplibregl.Map, lngLat: maplibregl.LngLat, zones: FareZone[]): FareZonePoint | null {
  const clickPx = map.project(lngLat);
  let bestVertex: { px: maplibregl.Point; point: FareZonePoint } | null = null;
  let bestEdge: { px: maplibregl.Point; point: FareZonePoint } | null = null;

  for (const zone of zones) {
    const vertexPx = zone.points.map((p) => map.project([p.lon, p.lat]));
    for (let i = 0; i < zone.points.length; i++) {
      const px = vertexPx[i];
      if (!bestVertex || clickPx.dist(px) < clickPx.dist(bestVertex.px)) {
        bestVertex = { px, point: zone.points[i] };
      }
    }
    // Edges, including the closing edge back to the first point — all in
    // screen space, so the nearest-point-on-segment maths is plain 2D.
    for (let i = 0; i < zone.points.length; i++) {
      const a = vertexPx[i];
      const b = vertexPx[(i + 1) % vertexPx.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      const t = Math.max(0, Math.min(1, ((clickPx.x - a.x) * dx + (clickPx.y - a.y) * dy) / lenSq));
      const nearestPx = new maplibregl.Point(a.x + t * dx, a.y + t * dy);
      if (!bestEdge || clickPx.dist(nearestPx) < clickPx.dist(bestEdge.px)) {
        const nearestLngLat = map.unproject(nearestPx);
        bestEdge = { px: nearestPx, point: { lon: nearestLngLat.lng, lat: nearestLngLat.lat } };
      }
    }
  }

  if (bestVertex && clickPx.dist(bestVertex.px) <= SNAP_RADIUS_PX) return bestVertex.point;
  if (bestEdge && clickPx.dist(bestEdge.px) <= SNAP_RADIUS_PX) return bestEdge.point;
  return null;
}

// Snaps a raw click to the nearest road, any road (not just bus-legal),
// via the WASM router's own `snap_to_any_road` — the same mechanism
// depot/dealer placement already use for exactly this reason ("the
// nearest point on any road, for a site that doesn't need to be bus-
// legal"). Returns null if genuinely nothing is nearby (no road data at
// all near this point), in which case the caller falls back to the raw
// click, mirroring every other map tool's own `snap_to_any_road` fallback
// pattern (depot-placement.ts, dealer-placement.ts).
function snapToRoad(router: Router, lngLat: maplibregl.LngLat): FareZonePoint | null {
  const snapped = router.snap_to_any_road(lngLat.lng, lngLat.lat);
  return snapped.length === 2 ? { lon: snapped[0], lat: snapped[1] } : null;
}

// Plain ray-casting point-in-polygon test (odd-even rule) — no geometry
// library exists in this project (checked, see the 10m-offset note above),
// and this is simple enough not to need one.
function pointInRing(point: FareZonePoint, ring: FareZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersects = a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Whether `outer` fully contains `inner` — every one of `inner`'s own
// vertices sits inside `outer`'s ring. An approximate/practical test (it
// doesn't also check that none of `inner`'s edges cross `outer`'s edges
// between vertices), good enough for "one zone was drawn entirely inside
// another," the real case this exists for (2026-10-30: "when a zone
// completely surrounds another zone, the bit in the middle should be left
// blank so the 2 zones don't overlap").
function fullyContains(outer: FareZone, inner: FareZone): boolean {
  return inner.points.every((p) => pointInRing(p, outer.points));
}

// Coastline clipping itself lives in coastline-clip.mts (see its own
// header comment) — pure logic, imported above, kept separate here
// because fare-zone-drawing.ts can't be unit-tested directly
// (maplibre-gl has no Node-compatible exports to import against).

// A town zone's only valid parents (T107) — any Country or Island zone in
// the same depot group, excluding the town itself (relevant when retyping
// an existing zone, never when creating a brand new one).
function eligibleTownParents(zones: FareZone[], excludeId?: number): FareZone[] {
  return zones.filter((z) => (z.zoneType === "country" || z.zoneType === "island") && z.id !== excludeId);
}

// Renders each zone as a Polygon whose own interior rings (holes) are
// every OTHER zone it fully contains — a zone drawn around another one
// shows the inner zone's own fill through the gap, rather than the two
// overlapping. Layering multiple zones this way (each only punching holes
// for zones it DIRECTLY contains) also renders a deeper nesting (A around
// B around C) correctly without any extra work: B's own hole for C already
// shows C's fill through it, and that whole B-with-a-C-hole shape is what
// shows through A's own hole for B.
function zonesToGeojson(zones: FareZone[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => {
      const ring = [...z.points.map((p) => [p.lon, p.lat]), [z.points[0].lon, z.points[0].lat]];
      const holes = zones
        .filter((other) => other.id !== z.id && fullyContains(z, other))
        .map((other) => [...other.points.map((p) => [p.lon, p.lat]), [other.points[0].lon, other.points[0].lat]]);
      return {
        type: "Feature",
        properties: { id: z.id, name: z.name, zoneType: z.zoneType, colour: z.colour },
        geometry: { type: "Polygon", coordinates: [ring, ...holes] },
      };
    }),
  };
}

function draftLineGeojson(points: FareZonePoint[]): GeoJSON.FeatureCollection {
  if (points.length < 2) return { type: "FeatureCollection", features: [] };
  // Closes the ring visually once there are enough points to actually be a
  // shape, so the draft preview looks like the polygon it will become.
  const coords = points.map((p) => [p.lon, p.lat]);
  if (points.length >= 3) coords.push(coords[0]);
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }],
  };
}

function draftPointsGeojson(points: FareZonePoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
  };
}

export async function mountFareZones(map: maplibregl.Map, router: Router): Promise<void> {
  map.addSource(ZONES_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: ZONES_FILL_LAYER_ID,
    type: "fill",
    source: ZONES_SOURCE_ID,
    paint: {
      "fill-color": ["get", "colour"],
      "fill-opacity": 0.2,
    },
  });
  map.addLayer({
    id: ZONES_OUTLINE_LAYER_ID,
    type: "line",
    source: ZONES_SOURCE_ID,
    paint: {
      "line-color": ["get", "colour"],
      // Town zones had a dotted border (first thin, then widened after
      // live feedback it was barely visible) — live feedback again,
      // 2026-11-01: "can you just completely remove the border please."
      // No border at all for a town now (opacity 0, top-level `case` same
      // as before — not a zoom-interpolate nested inside another
      // expression, a known project gotcha); every other zone type is
      // unaffected.
      "line-width": 2,
      "line-opacity": ["case", ["==", ["get", "zoneType"], "town"], 0, 1],
    },
  });
  map.addLayer({
    id: ZONES_LABEL_LAYER_ID,
    type: "symbol",
    source: ZONES_SOURCE_ID,
    layout: { "text-field": ["get", "name"], "text-size": 13 },
    paint: { "text-color": "#18181b", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });

  map.addSource(DRAFT_LINE_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: DRAFT_LINE_LAYER_ID,
    type: "line",
    source: DRAFT_LINE_SOURCE_ID,
    paint: { "line-color": "#f59e0b", "line-width": 2, "line-dasharray": [2, 1] },
  });
  map.addSource(DRAFT_POINTS_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: DRAFT_POINTS_LAYER_ID,
    type: "circle",
    source: DRAFT_POINTS_SOURCE_ID,
    paint: { "circle-radius": 5, "circle-color": "#f59e0b", "circle-stroke-color": "#18181b", "circle-stroke-width": 1.5 },
  });

  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Fare zones";
  toggle.style.position = "absolute";
  toggle.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX}px`;
  toggle.style.left = "1300px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  // Widened from 360px (2026-10-30) — fixing the type dropdown and colour
  // swatch to their real protected widths (above) left too little room for
  // the Rename/Delete buttons in the same row, clipping them off the
  // panel's own right edge (confirmed visually, not assumed). 440px still
  // clipped Delete by ~21px (measured live, same live user report) —
  // widened again to 480px, which also matches fare-pricing-panel.ts's
  // own width.
  panel.style.width = "480px";
  panel.style.maxHeight = "75vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Fare zones";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  // Real coastline chains for clipping (see clipRingToCoastline's own
  // header comment) — loaded once, here, the same "fetch once at mount"
  // pattern stops-layer.ts already uses for stops/railway data. An
  // empty array (fetch failure, or dev pipeline-data not yet rebuilt
  // with the new artefact) just makes clipping a harmless no-op rather
  // than a crash — every existing zone-drawing behaviour keeps working
  // without it.
  let coastlineChains: FareZonePoint[][] = [];
  try {
    const coastlineRes = await fetch("http://127.0.0.1:38271/coastline.bin");
    if (coastlineRes.ok) {
      const coastlineBytes = new Uint8Array(await coastlineRes.arrayBuffer());
      const decodedChains = decode_coastline(coastlineBytes) as { coordinates: number[] }[];
      coastlineChains = decodedChains.map((chain) => {
        const points: FareZonePoint[] = [];
        for (let i = 0; i + 1 < chain.coordinates.length; i += 2) {
          points.push({ lon: chain.coordinates[i], lat: chain.coordinates[i + 1] });
        }
        return points;
      });
    }
  } catch {
    // Harmless no-op, see the comment above.
  }

  let depotGroups: DepotGroup[] = [];
  let selectedDepotGroupId: number | null = null;
  let zones: FareZone[] = [];
  // Every zone in the save, across every depot group — kept alongside
  // `zones` (which is just the selected group's own) purely for snapping
  // while drawing, since two different depot groups' zones can still sit
  // next to each other on the same map.
  let allZones: FareZone[] = [];
  let errorMessage = "";
  let draftPoints: FareZonePoint[] = [];
  // How many entries in `draftPoints` each click added — usually 1, but a
  // road-following click can insert several intermediate points at once.
  // "Undo point" pops a whole click's worth via this, not just the last
  // array entry, so undoing a road-followed stretch removes the whole
  // stretch in one go, matching what the player actually did.
  const draftClickPointCounts: number[] = [];
  // Whether the most recently added point was snapped to a road — checked
  // on the NEXT click to decide whether to road-follow between the two
  // ("follow the road until the next point if it is also on a road",
  // 2026-10-30). Reset whenever drawing starts/stops/undoes.
  let lastPointWasRoadSnapped = false;
  let pendingZone = false; // true once "Finish" is clicked and the name/type form is up
  let pendingZoneColour = DEFAULT_ZONE_COLOUR.city;

  function currentDepotGroup(): DepotGroup | undefined {
    return depotGroups.find((g) => g.id === selectedDepotGroupId);
  }

  async function reloadZones(): Promise<void> {
    zones = selectedDepotGroupId === null ? [] : await window.fareZones.listForDepotGroup(selectedDepotGroupId);
    allZones = await window.fareZones.listAll();
    // Renders every depot group's zones, not just the selected group's own
    // — the map is one shared geography, and seeing every zone (not just
    // the one being edited) is what makes snapping to a neighbouring
    // depot group's boundary possible in the first place.
    (map.getSource(ZONES_SOURCE_ID) as maplibregl.GeoJSONSource).setData(zonesToGeojson(allZones));
  }

  function updateDraftLayers(): void {
    (map.getSource(DRAFT_LINE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(draftLineGeojson(draftPoints));
    (map.getSource(DRAFT_POINTS_SOURCE_ID) as maplibregl.GeoJSONSource).setData(draftPointsGeojson(draftPoints));
  }

  function showError(err: unknown): void {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  function render(): void {
    body.replaceChildren();

    if (depotGroups.length === 0) {
      const note = document.createElement("div");
      note.style.color = "var(--text-muted)";
      note.textContent = "Create a depot group first — fare zones belong to one.";
      body.appendChild(note);
      return;
    }

    const groupLabel = document.createElement("div");
    groupLabel.className = "label-muted";
    groupLabel.textContent = "Depot group";
    body.appendChild(groupLabel);

    const groupDropdown = createDropdown(
      depotGroups.map((g) => g.name),
      currentDepotGroup()?.name ?? depotGroups[0].name,
      async (name) => {
        selectedDepotGroupId = depotGroups.find((g) => g.name === name)?.id ?? null;
        await reloadZones();
        render();
      },
    );
    groupDropdown.el.style.marginBottom = "8px";
    body.appendChild(groupDropdown.el);

    if (zones.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No fare zones drawn for this depot group yet.";
      body.appendChild(empty);
    }

    for (const zone of zones) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "4px 0";

      const nameInput = document.createElement("input");
      nameInput.className = "field";
      nameInput.value = zone.name;
      nameInput.style.flex = "1";
      row.appendChild(nameInput);

      const typeDropdown = createDropdown(Object.values(ZONE_TYPE_LABELS), ZONE_TYPE_LABELS[zone.zoneType], async (label) => {
        const newType = ZONE_TYPE_BY_LABEL[label];
        // Retyping straight to town needs a parent — default to the first
        // eligible Country/Island zone (same "follow a sensible default,
        // adjustable after" pattern the colour picker above already uses),
        // via the dedicated parent dropdown that appears once the zone
        // actually is a town (below). If none exists, setFareZoneType
        // throws its own clear error, surfaced the normal way.
        const parentZoneId = newType === "town" ? (eligibleTownParents(zones, zone.id)[0]?.id ?? null) : null;
        try {
          await window.fareZones.setType(zone.id, newType, parentZoneId);
          errorMessage = "";
          await reloadZones();
        } catch (err) {
          showError(err);
        }
        render();
      });
      // `.dropdown`'s own CSS sets `min-width: 0` (theme.css), which is
      // exactly what's needed to let it shrink gracefully when space is
      // tight elsewhere — but inside this row, with `nameInput` on
      // `flex: 1` competing for space, the DEFAULT `flex-shrink: 1` with
      // no floor let the dropdown get squeezed down to ~2px, effectively
      // invisible and unclickable (confirmed by measuring its real
      // rendered width live, not assumed) — a real layout bug, not just a
      // style mismatch. `flex: "0 0 110px"` gives it a protected width
      // that the row's flex layout can't steal.
      typeDropdown.el.style.flex = "0 0 110px";
      row.appendChild(typeDropdown.el);

      // A town's own parent used to show here — first as an editable
      // dropdown, then (after "that is not needed") as a plain read-only
      // label. Live feedback again, 2026-11-01: "I also don't need to know
      // what zone the town is in, that can be removed." Gone entirely now;
      // the zone still has a real `parentZoneId` underneath (needed for
      // the containment/pricing rules), it's just not shown in this row.

      // Native `<input type=color>` renders as a small square by default
      // (~12px in this row) — easy to miss entirely, which is almost
      // certainly why "the colour can only be set when the zone is made"
      // was reported even though this editor already existed. Sized up
      // and given its own flex-shrink guard for the same reason as the
      // dropdown above.
      const colourInput = document.createElement("input");
      colourInput.type = "color";
      colourInput.value = zone.colour;
      colourInput.title = "Zone colour";
      colourInput.style.flex = "0 0 32px";
      colourInput.style.height = "24px";
      colourInput.style.padding = "0";
      colourInput.style.border = "1px solid var(--border-strong)";
      colourInput.style.borderRadius = "4px";
      colourInput.style.cursor = "pointer";
      colourInput.addEventListener("change", async () => {
        await window.fareZones.setColour(zone.id, colourInput.value);
        await reloadZones();
        render();
      });
      row.appendChild(colourInput);

      const renameButton = document.createElement("button");
      renameButton.className = "btn";
      renameButton.textContent = "Rename";
      renameButton.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) {
          errorMessage = "Give the zone a name.";
          render();
          return;
        }
        try {
          await window.fareZones.rename(zone.id, name);
          errorMessage = "";
          await reloadZones();
        } catch (err) {
          showError(err);
        }
        render();
      });
      row.appendChild(renameButton);

      // Merge this zone's own shape into another (live user request,
      // 2026-11-01: "how do i merge zones into another, there is no way of
      // doing this"). Confirmed via AskUserQuestion: no new combined
      // boundary is computed (real polygon union is genuine geometry work
      // this project has no library for, and risks a broken shape) — this
      // just relabels the zone to match the target's own name/type/colour,
      // so the two polygons read as one merged zone without either shape
      // changing at all. Town zones excluded on both sides (db.mts's own
      // mergeFareZone throws if either is a town; this dropdown just
      // doesn't offer the option at all, same gating other controls here
      // already use).
      const mergeTargets = zones.filter((z) => z.id !== zone.id && z.zoneType !== "town");
      if (zone.zoneType !== "town" && mergeTargets.length > 0) {
        const mergeDropdown = createDropdown(mergeTargets.map((z) => z.name), "Merge into...", async (label) => {
          const target = mergeTargets.find((z) => z.name === label);
          if (!target) return;
          try {
            await window.fareZones.merge(zone.id, target.id);
            errorMessage = "";
            await reloadZones();
          } catch (err) {
            showError(err);
          }
          render();
        });
        mergeDropdown.el.style.flex = "0 0 130px";
        row.appendChild(mergeDropdown.el);
      }

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        await window.fareZones.delete(zone.id);
        errorMessage = "";
        await reloadZones();
        render();
      });
      row.appendChild(deleteButton);

      body.appendChild(row);
    }

    const drawSection = document.createElement("div");
    drawSection.style.borderTop = "1px solid var(--border)";
    drawSection.style.marginTop = "8px";
    drawSection.style.paddingTop = "8px";

    if (pendingZone) {
      const form = document.createElement("div");
      const nameInput = document.createElement("input");
      nameInput.className = "field";
      nameInput.placeholder = "Zone name";
      nameInput.style.display = "block";
      nameInput.style.width = "100%";
      nameInput.style.boxSizing = "border-box";
      nameInput.style.marginBottom = "4px";
      let zoneType: FareZoneType = "city";
      let townParentZoneId: number | null = null;
      const parentRow = document.createElement("div");
      parentRow.style.marginBottom = "4px";
      function renderParentPicker(): void {
        parentRow.replaceChildren();
        if (zoneType !== "town") return;
        const parents = eligibleTownParents(zones);
        townParentZoneId = parents[0]?.id ?? null;
        if (parents.length === 0) {
          const note = document.createElement("div");
          note.style.fontSize = "11px";
          note.style.color = "var(--text-muted)";
          note.textContent = "No Country or Island zone in this depot group yet for the town to belong to.";
          parentRow.appendChild(note);
          return;
        }
        const parentDropdown = createDropdown(
          parents.map((p) => p.name),
          parents[0].name,
          (label) => {
            townParentZoneId = parents.find((p) => p.name === label)?.id ?? null;
          },
        );
        parentDropdown.el.style.width = "100%";
        parentRow.appendChild(parentDropdown.el);
      }
      const typeDropdown = createDropdown(Object.values(ZONE_TYPE_LABELS), ZONE_TYPE_LABELS[zoneType], (label) => {
        zoneType = ZONE_TYPE_BY_LABEL[label];
        // Only follows the type while the player hasn't picked a colour of
        // their own — once they touch the colour input directly, their
        // choice sticks regardless of type.
        if (!colourTouched) {
          pendingZoneColour = DEFAULT_ZONE_COLOUR[zoneType];
          colourInput.value = pendingZoneColour;
        }
        renderParentPicker();
      });
      // Full-width to match the name input above it — with no width set
      // at all a plain `.dropdown` shrinks to fit just its own "city"/
      // "country" text, which is what looked visually inconsistent next
      // to the full-width name field (not the same invisible-collapse bug
      // as the zone-list row above, since there's no competing flex
      // sibling here, but still wrong).
      typeDropdown.el.style.width = "100%";
      typeDropdown.el.style.marginBottom = "4px";

      let colourTouched = false;
      const colourRow = document.createElement("div");
      colourRow.style.display = "flex";
      colourRow.style.alignItems = "center";
      colourRow.style.gap = "6px";
      colourRow.style.marginBottom = "4px";
      const colourLabel = document.createElement("span");
      colourLabel.className = "label-muted";
      colourLabel.textContent = "Colour";
      const colourInput = document.createElement("input");
      colourInput.type = "color";
      colourInput.value = pendingZoneColour;
      colourInput.style.width = "48px";
      colourInput.style.height = "26px";
      colourInput.style.padding = "0";
      colourInput.style.border = "1px solid var(--border-strong)";
      colourInput.style.borderRadius = "4px";
      colourInput.style.cursor = "pointer";
      colourInput.addEventListener("input", () => {
        colourTouched = true;
        pendingZoneColour = colourInput.value;
      });
      colourRow.append(colourLabel, colourInput);

      const save = document.createElement("button");
      save.className = "btn";
      save.textContent = "Save zone";
      save.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) {
          errorMessage = "Give the zone a name.";
          render();
          return;
        }
        if (selectedDepotGroupId === null) return;
        try {
          const clippedPoints = clipRingToCoastline(draftPoints, coastlineChains);
          await window.fareZones.create(selectedDepotGroupId, name, zoneType, clippedPoints, pendingZoneColour, townParentZoneId);
          draftPoints = [];
          draftClickPointCounts.length = 0;
          pendingZone = false;
          pendingZoneColour = DEFAULT_ZONE_COLOUR.city;
          errorMessage = "";
          updateDraftLayers();
          await reloadZones();
        } catch (err) {
          showError(err);
        }
        render();
      });
      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Discard";
      cancel.addEventListener("click", () => {
        draftPoints = [];
        draftClickPointCounts.length = 0;
        pendingZone = false;
        pendingZoneColour = DEFAULT_ZONE_COLOUR.city;
        errorMessage = "";
        updateDraftLayers();
        render();
      });
      form.append(nameInput, typeDropdown.el, parentRow, colourRow, save, cancel);
      drawSection.appendChild(form);
    } else if (fareZoneDrawState.isDrawing) {
      const hint = document.createElement("div");
      hint.style.color = "var(--text-muted)";
      hint.style.marginBottom = "4px";
      hint.textContent = `Click the map to add a point (${draftPoints.length} so far, 3+ needed). Clicking near a coastline snaps to it. Hold Shift to place the point exactly where clicked, ignoring roads and the coastline — useful for a deliberate straight line out over open water.`;
      drawSection.appendChild(hint);

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "6px";

      const undo = document.createElement("button");
      undo.className = "btn";
      undo.textContent = "Undo point";
      undo.disabled = draftPoints.length === 0;
      undo.addEventListener("click", () => {
        // Pops a whole CLICK's worth, not just one array entry — a
        // road-following click can have inserted several intermediate
        // points at once, and undoing should remove that whole stretch in
        // one go, matching what the player actually did.
        const countToRemove = draftClickPointCounts.pop() ?? 1;
        draftPoints.splice(draftPoints.length - countToRemove, countToRemove);
        lastPointWasRoadSnapped = false;
        updateDraftLayers();
        render();
      });
      controls.appendChild(undo);

      const finish = document.createElement("button");
      finish.className = "btn";
      finish.textContent = "Finish";
      finish.disabled = draftPoints.length < 3;
      finish.addEventListener("click", () => {
        fareZoneDrawState.isDrawing = false;
        pendingZone = true;
        toggle.classList.remove("is-active");
        render();
      });
      controls.appendChild(finish);

      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        fareZoneDrawState.isDrawing = false;
        draftPoints = [];
        draftClickPointCounts.length = 0;
        lastPointWasRoadSnapped = false;
        toggle.classList.remove("is-active");
        updateDraftLayers();
        render();
      });
      controls.appendChild(cancel);

      drawSection.appendChild(controls);
    } else {
      const draw = document.createElement("button");
      draw.className = "btn";
      draw.textContent = "Draw new zone";
      draw.disabled = selectedDepotGroupId === null;
      draw.addEventListener("click", () => {
        fareZoneDrawState.isDrawing = true;
        draftPoints = [];
        draftClickPointCounts.length = 0;
        lastPointWasRoadSnapped = false;
        errorMessage = "";
        toggle.classList.add("is-active");
        updateDraftLayers();
        render();
      });
      drawSection.appendChild(draw);
    }
    body.appendChild(drawSection);

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "6px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  map.on("click", (e) => {
    if (!fareZoneDrawState.isDrawing || otherToolActive()) return;

    // Zone-to-zone snapping wins outright when it applies (see
    // snapToExistingZones's own comment) — no road-following in that case,
    // since the point is deliberately matching an existing zone's own
    // boundary, not a road.
    const zoneSnap = snapToExistingZones(map, e.lngLat, allZones);
    if (zoneSnap) {
      draftPoints.push(zoneSnap);
      draftClickPointCounts.push(1);
      lastPointWasRoadSnapped = false;
      updateDraftLayers();
      render();
      return;
    }

    // Shift-click (31 October hand-off item 2, OPEN-ITEMS.md; corrected
    // twice on 2026-11-01 from live bug reports). First correction: shift
    // used to only suppress the road-FOLLOWING interpolation while still
    // letting the point itself snap to a road as normal, but
    // `snap_to_any_road`'s own 500m cutoff is wide enough to reach across
    // most of Skye's own real sea lochs (confirmed directly against the
    // real road graph — Loch Harport's mid-loch point snaps 331m to a
    // shore road), so shift was changed to bypass road-snapping outright.
    // **Second correction, the real design gap**: "the fare zone is meant
    // to snap to the edge of the land, not be in the water after
    // completing it" — bypassing every snap on shift just traded "ends up
    // on a road" for "ends up adrift in open water with nothing pulling it
    // onto the coast," since `clipRingToCoastline` (the existing Finish-
    // time clip) only corrects an edge crossing the SAME coastline chain
    // twice, which never applies to a genuine crossing onto a separate
    // landmass like Skye. A real coastline snap (`nearestPointOnCoastline`,
    // coastline-clip.mts) is now checked BEFORE road-snapping and takes
    // priority over it whenever both are in range, so a click near a shore
    // lands on the actual coastline instead of jumping inland to a nearby
    // road. Shift now bypasses coastline-snapping too (not just roads) —
    // reserved for the rarer case of deliberately drawing a straight line
    // out over genuinely open water (e.g. crossing a strait to a separate
    // island's own coastline chain).
    const shiftHeld = (e.originalEvent as MouseEvent).shiftKey;

    const coastlineSnap = shiftHeld ? null : nearestPointOnCoastline({ lon: e.lngLat.lng, lat: e.lngLat.lat }, coastlineChains, COASTLINE_SNAP_DISTANCE_M);
    const roadSnap = shiftHeld || coastlineSnap ? null : snapToRoad(router, e.lngLat);
    const previousPoint = draftPoints[draftPoints.length - 1];
    // Road-following (2026-10-30, "when snapping to a road it should
    // follow the road until the next point if it is also on a road"):
    // only when BOTH this click and the previous point landed on a road —
    // a single road-snapped point with no road-snapped predecessor has
    // nothing to follow from yet. `roadSnap` is already null whenever
    // shift is held or a coastline point took priority (above), so this
    // naturally falls through to the plain raw-point branch below without
    // a separate check.
    if (roadSnap && lastPointWasRoadSnapped && previousPoint) {
      const pathCoords = router.find_any_road_route(previousPoint.lon, previousPoint.lat, roadSnap.lon, roadSnap.lat);
      // pathCoords includes the previous point's own position again as its
      // first pair (find_any_road_route always starts from the snapped
      // start node) — skip that one pair, since previousPoint is already
      // in draftPoints, then push every following point including the
      // final destination.
      const newPoints: FareZonePoint[] = [];
      for (let i = 2; i + 1 < pathCoords.length; i += 2) {
        newPoints.push({ lon: pathCoords[i], lat: pathCoords[i + 1] });
      }
      // An empty/too-short path (genuinely disconnected roads, or the two
      // points snapped to the very same node) falls back to just the
      // single road-snapped point, same as a normal click — never silently
      // drops the click entirely.
      if (newPoints.length === 0) newPoints.push(roadSnap);
      draftPoints.push(...newPoints);
      draftClickPointCounts.push(newPoints.length);
    } else {
      const point = coastlineSnap ?? roadSnap ?? { lon: e.lngLat.lng, lat: e.lngLat.lat };
      draftPoints.push(point);
      draftClickPointCounts.push(1);
    }
    lastPointWasRoadSnapped = roadSnap !== null;
    updateDraftLayers();
    render();
  });

  let panelOpen = false;
  toggle.addEventListener("click", async () => {
    // While actively drawing, the toggle button cancels the draw instead of
    // closing the panel — otherwise there'd be no way to re-open the panel
    // and see the Finish/Cancel controls again without losing the draft.
    if (fareZoneDrawState.isDrawing) {
      fareZoneDrawState.isDrawing = false;
      draftPoints = [];
      updateDraftLayers();
      toggle.classList.remove("is-active");
      render();
      return;
    }
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) {
      depotGroups = await window.depotGroups.list();
      if (selectedDepotGroupId === null) selectedDepotGroupId = depotGroups[0]?.id ?? null;
      await reloadZones();
      render();
    } else {
      // Live user report, 2026-11-01: "when I close the fare zone menu the
      // zones don't go away" — closing the panel previously only hid the
      // panel's own DOM, leaving the map's own fill/outline/label layers
      // showing every zone regardless. Cleared on close, repopulated by
      // reloadZones()+render() above the next time the panel opens.
      (map.getSource(ZONES_SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
    }
  });
}
