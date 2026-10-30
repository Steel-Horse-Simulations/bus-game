// Fare zones (DESIGN.md §9, Phase 4 increment 1): "fare zones are drawn on
// the map by the player, in the style of Lothian's. Each zone is typed city
// or country." Geometry and typing only — no pricing/bands/capping here,
// that's increment 2/3, deliberately kept separate (see fare_zones' own
// SCHEMA comment in db.mts). Confirmed with the user (2026-10-18): each
// depot group draws and prices its own zone map independently.
//
// Freeform polygon drawing has no existing precedent in this codebase —
// route-draw.ts and dead-mileage-preview.ts both snap to the road graph,
// which a fare zone boundary has no reason to do (a zone edge is an
// administrative/commercial boundary, not a road). This is a new, simple
// click-to-add-vertex tool instead, following the same toggle+panel shell
// and cross-tool isPlacing/isDrawing guard convention as every other map
// tool (routeDrawState/placeStopState/placeDepotState/placeDealerState).
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { createDropdown } from "./dropdown";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";
import { placeDepotState } from "./depot-placement";
import { placeDealerState } from "./dealer-placement";

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
const DEFAULT_ZONE_COLOUR: Record<FareZoneType, string> = { city: "#3b82f6", country: "#22c55e" };

// How close (in screen pixels, not degrees of lon/lat) a click needs to be
// to an existing zone's vertex or edge to snap to it, so adjacent zones can
// share an exact boundary — DESIGN.md's "in the style of Lothian's" implies
// a tiled zone map, not zones with gaps or slivers between them. Measured
// in screen space via map.project/unproject rather than a fixed lon/lat
// epsilon, since the same epsilon would mean wildly different real
// precision at different zoom levels.
const SNAP_RADIUS_PX = 14;

function otherToolActive(): boolean {
  return routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing || placeDealerState.isPlacing;
}

// Snaps a raw click to the nearest existing zone vertex within
// SNAP_RADIUS_PX, then (if no vertex was close enough) the nearest point on
// any existing zone's edge, checked in screen space. Falls back to the
// unmodified click if nothing is close enough.
function snapToExistingZones(map: maplibregl.Map, lngLat: maplibregl.LngLat, zones: FareZone[]): FareZonePoint {
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
  return { lon: lngLat.lng, lat: lngLat.lat };
}

function zonesToGeojson(zones: FareZone[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      properties: { id: z.id, name: z.name, zoneType: z.zoneType, colour: z.colour },
      geometry: { type: "Polygon", coordinates: [[...z.points.map((p) => [p.lon, p.lat]), [z.points[0].lon, z.points[0].lat]]] },
    })),
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

export async function mountFareZones(map: maplibregl.Map): Promise<void> {
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
      "line-width": 2,
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
  toggle.style.bottom = "8px";
  toggle.style.left = "1300px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  panel.style.width = "360px";
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
      nameInput.value = zone.name;
      nameInput.style.flex = "1";
      row.appendChild(nameInput);

      const typeDropdown = createDropdown(["city", "country"], zone.zoneType, async (value) => {
        await window.fareZones.setType(zone.id, value as FareZoneType);
        await reloadZones();
        render();
      });
      typeDropdown.el.style.width = "110px";
      row.appendChild(typeDropdown.el);

      const colourInput = document.createElement("input");
      colourInput.type = "color";
      colourInput.value = zone.colour;
      colourInput.title = "Zone colour";
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
      nameInput.placeholder = "Zone name";
      nameInput.style.display = "block";
      nameInput.style.marginBottom = "4px";
      let zoneType: FareZoneType = "city";
      const typeDropdown = createDropdown(["city", "country"], zoneType, (value) => {
        zoneType = value as FareZoneType;
        // Only follows the type while the player hasn't picked a colour of
        // their own — once they touch the colour input directly, their
        // choice sticks regardless of type.
        if (!colourTouched) {
          pendingZoneColour = DEFAULT_ZONE_COLOUR[zoneType];
          colourInput.value = pendingZoneColour;
        }
      });
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
          await window.fareZones.create(selectedDepotGroupId, name, zoneType, draftPoints, pendingZoneColour);
          draftPoints = [];
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
        pendingZone = false;
        pendingZoneColour = DEFAULT_ZONE_COLOUR.city;
        errorMessage = "";
        updateDraftLayers();
        render();
      });
      form.append(nameInput, typeDropdown.el, colourRow, save, cancel);
      drawSection.appendChild(form);
    } else if (fareZoneDrawState.isDrawing) {
      const hint = document.createElement("div");
      hint.style.color = "var(--text-muted)";
      hint.style.marginBottom = "4px";
      hint.textContent = `Click the map to add a point (${draftPoints.length} so far, 3+ needed).`;
      drawSection.appendChild(hint);

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "6px";

      const undo = document.createElement("button");
      undo.className = "btn";
      undo.textContent = "Undo point";
      undo.disabled = draftPoints.length === 0;
      undo.addEventListener("click", () => {
        draftPoints.pop();
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
    draftPoints.push(snapToExistingZones(map, e.lngLat, allZones));
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
    }
  });
}
