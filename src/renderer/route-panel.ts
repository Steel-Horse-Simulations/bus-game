// The route panel (DESIGN.md §11): "Routes are always visible in a side
// panel on the main map, grouped by area, with the area currently being
// viewed at the top... The left-hand column has three states depending on
// context — route list, route under construction, or locked route
// reference next to its timetable — rather than three separate panels."
// This module is that shared left-hand slot, swapping its single child
// between those three states; route-draw.ts and route-timetable-panel.ts
// supply the "drawing" and "timetable" content, this module owns "list"
// and the coordination between all three.
//
// Several pieces of the full spec need systems that don't exist yet, and
// are deliberately deferred rather than faked — flagged inline at each
// point: a colour swatch derived from livery/route colour data, activation
// state (normal/countdown/deactivated), a problem indicator (staffing,
// punctuality, livery shortfall), a real monthly profit figure, and
// long-distance routes grouped at the bottom of their area's section.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { Router } from "./wasm/game_wasm.js";
import { mountRouteDrawTool, type RouteDrawController } from "./route-draw";
import { createRouteTimetableEditor } from "./route-timetable-panel";
import { stopsPanelState, busStationsState } from "./stops-layer";
import { pickContrastColorForHex } from "./icon-contrast";
import { onewayArrowImageId } from "./map-icons";

const emptyFeatureCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// One traversed edge's own stretch of a previewed route, kept separate from
// the merged line so the chevron layer can tell, per edge, whether it's used
// in both directions (a there-and-back stretch shouldn't get chevrons —
// route-draw.ts's own EdgeChunk does the same for the route being drawn).
interface EdgeChunk {
  edgeId: number;
  coords: [number, number][];
}

// Any number of routes can be shown on the map at once (each toggled
// independently via its own row's Show/Hide button) — keyed by route id so
// toggling one off doesn't require re-routing the others still shown.
// Colour is captured at Show time; editing a route's colour while it's
// shown only takes effect on the next toggle.
interface ShownRoutePreview {
  coords: [number, number][];
  edgeChunks: EdgeChunk[];
  edgeUseCount: Map<number, number>;
  colour: string;
  // A cheap fingerprint of the points used to compute this cache — compared
  // against the freshly-fetched route on every list refresh so an edit made
  // while a route is shown (Edit -> change points/colour -> Save -> Finish)
  // updates the map preview on its own, without needing a manual Hide+Show.
  pointsKey: string;
}
const shownRoutes = new Map<number, ShownRoutePreview>();

function computeShownRoutePreview(router: Router, route: Route): ShownRoutePreview {
  const { coords, edgeChunks, edgeUseCount } = routeLineAndEdges(router, route.points);
  return { coords, edgeChunks, edgeUseCount, colour: route.colour, pointsKey: JSON.stringify(route.points) };
}

// Re-syncs every currently-shown route's cached preview against the
// freshly-fetched route list — called from refreshList(), which already
// runs after any save/edit/delete. Recomputes only entries whose points or
// colour actually changed (cheap to detect, since routing is the expensive
// part), and drops any shown route no longer in the list at all.
function syncShownRoutes(router: Router, map: maplibregl.Map, routes: Route[]): void {
  const byId = new Map(routes.map((r) => [r.id, r]));
  let changed = false;
  for (const [id, cached] of [...shownRoutes]) {
    const route = byId.get(id);
    if (!route) {
      shownRoutes.delete(id);
      changed = true;
      continue;
    }
    const pointsKey = JSON.stringify(route.points);
    if (cached.pointsKey === pointsKey && cached.colour === route.colour) continue;
    shownRoutes.set(id, computeShownRoutePreview(router, route));
    changed = true;
  }
  if (changed) rebuildShownRoutesSources(map);
}

function rebuildShownRoutesSources(map: maplibregl.Map): void {
  const lineFeatures: GeoJSON.Feature[] = [];
  const chevronFeatures: GeoJSON.Feature[] = [];
  for (const preview of shownRoutes.values()) {
    if (preview.coords.length >= 2) {
      lineFeatures.push({
        type: "Feature",
        properties: { colour: preview.colour },
        geometry: { type: "LineString", coordinates: preview.coords },
      });
    }
    const icon = onewayArrowImageId(pickContrastColorForHex(preview.colour));
    for (const chunk of preview.edgeChunks) {
      if (chunk.coords.length < 2) continue;
      chevronFeatures.push({
        type: "Feature",
        properties: { bothDirections: (preview.edgeUseCount.get(chunk.edgeId) ?? 0) >= 2, icon },
        geometry: { type: "LineString", coordinates: chunk.coords },
      });
    }
  }
  (map.getSource("saved-route-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: lineFeatures,
  });
  (map.getSource("saved-route-preview-edges") as maplibregl.GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: chevronFeatures,
  });
}

// Only the point list is persisted (see the routes table's own comment in
// electron/db.mts), not the road-following polyline drawn at the time — so
// showing a saved route again means re-routing every leg, the same way it
// looked while being drawn. Also returns each leg's own edge chunks (and how
// many times each edge is used across the whole route), the same data
// route-draw.ts tracks while drawing, so the "Show" preview can carry
// one-way chevrons too.
function routeLineAndEdges(
  router: Router,
  points: readonly { lon: number; lat: number }[],
): { coords: [number, number][]; edgeChunks: EdgeChunk[]; edgeUseCount: Map<number, number> } {
  const coords: [number, number][] = [];
  const edgeChunks: EdgeChunk[] = [];
  const edgeUseCount = new Map<number, number>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const leg = router.find_route(a.lon, a.lat, b.lon, b.lat);
    const legCoords: [number, number][] = [];
    for (let j = 0; j < leg.length; j += 2) legCoords.push([leg[j], leg[j + 1]]);

    const edgeIds = Array.from(router.last_route_edges());
    const pointCounts = Array.from(router.last_route_edge_point_counts());
    let idx = 0;
    for (let e = 0; e < edgeIds.length; e++) {
      const count = pointCounts[e];
      edgeChunks.push({ edgeId: edgeIds[e], coords: legCoords.slice(idx, idx + count + 1) });
      edgeUseCount.set(edgeIds[e], (edgeUseCount.get(edgeIds[e]) ?? 0) + 1);
      idx += count;
    }
    coords.push(...legCoords);
  }
  return { coords, edgeChunks, edgeUseCount };
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// A route's own "destination/short name" isn't a field that exists yet —
// this is a placeholder derived from its last stop's name, not a real
// destination display DESIGN.md's §11 has in mind (that would come from
// the timetable's own destination display, §6 "Defining a service").
function stopLabel(point: RoutePoint): string {
  if (point.kind !== "stop" || point.osmId === undefined) return "";
  return stopsPanelState.displayNameFor?.(point.osmId) ?? `Stop ${point.osmId}`;
}

type Mode = { kind: "list" } | { kind: "drawing"; editRoute?: Route } | { kind: "timetable"; route: Route };

export async function mountRoutePanel(map: maplibregl.Map, router: Router): Promise<void> {
  // "Show" preview line — not gated on map.isStyleLoaded() (see
  // OPEN-ITEMS.md for the real bug this caused elsewhere): this module
  // mounts after other layers already exist, proof the style has already
  // loaded once, and isStyleLoaded() can read false here anyway due to
  // unrelated tile activity, silently losing a "load" event that already
  // fired and won't fire again.
  // Any number of routes can be shown at once (see shownRoutes above) — both
  // layers carry every currently-shown route's own features together, each
  // reading its colour/icon back off its own feature properties rather than
  // one flat layer-wide paint value, so each route keeps its own colour.
  map.addSource("saved-route-preview", { type: "geojson", data: emptyFeatureCollection });
  map.addLayer({
    id: "saved-route-preview",
    type: "line",
    source: "saved-route-preview",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "colour"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 9, 18, 15],
    },
  });
  // One-way chevrons for shown routes — white or black is picked per-route
  // against that route's own colour (icon-contrast.ts) at Show time and
  // baked into each feature's own "icon" property (map-icons.ts
  // pre-registers both variants).
  map.addSource("saved-route-preview-edges", { type: "geojson", data: emptyFeatureCollection });
  map.addLayer({
    id: "saved-route-preview-chevrons",
    type: "symbol",
    source: "saved-route-preview-edges",
    filter: ["!=", ["get", "bothDirections"], true],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 40,
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 18, 1.1],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  // The persistent left-hand slot (DESIGN.md §11). Always the same size and
  // position; only its single child changes with `mode`. Starts below the
  // status readout box, same offset the old "Draw route" toggle used.
  const slot = document.createElement("div");
  slot.style.position = "absolute";
  slot.style.top = "44px";
  slot.style.left = "8px";
  slot.style.bottom = "8px";
  slot.style.width = "320px";
  slot.style.zIndex = "2";
  document.body.appendChild(slot);

  // The right-hand slot, occupied only in timetable mode — "the timetable
  // grid fills the rest of the screen to the right."
  const timetableSlot = document.createElement("div");
  timetableSlot.style.position = "absolute";
  timetableSlot.style.top = "44px";
  timetableSlot.style.left = "336px";
  timetableSlot.style.right = "8px";
  timetableSlot.style.bottom = "8px";
  timetableSlot.style.zIndex = "2";
  timetableSlot.style.display = "none";
  document.body.appendChild(timetableSlot);

  let mode: Mode = { kind: "list" };
  let listBody: HTMLElement | null = null;
  // Which route's row currently has its actions expanded — at most one at
  // a time, collapsed by default (user feedback: too many buttons showing
  // per row at once). Clicking a row toggles it; clicking a button inside
  // an expanded row stops the click reaching the row itself.
  let expandedRouteId: number | null = null;

  const drawController: RouteDrawController = await mountRouteDrawTool(map, router, () =>
    setMode({ kind: "list" }),
  );

  function setMode(next: Mode): void {
    mode = next;
    slot.innerHTML = "";
    timetableSlot.innerHTML = "";
    timetableSlot.style.display = next.kind === "timetable" ? "block" : "none";

    if (next.kind === "list") {
      slot.appendChild(buildListPanel());
      void refreshList();
    } else if (next.kind === "drawing") {
      slot.appendChild(drawController.el);
      if (next.editRoute) drawController.startEditing(next.editRoute);
      else drawController.startDrawing();
    } else {
      slot.appendChild(buildLockedRoutePanel(next.route));
      const editor = createRouteTimetableEditor(next.route, router, () => setMode({ kind: "list" }));
      timetableSlot.appendChild(editor.el);
    }
  }

  // --- list mode ---

  function buildListPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.height = "100%";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";

    const header = document.createElement("div");
    header.className = "panel-header";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const title = document.createElement("span");
    title.textContent = "Routes";
    const newButton = document.createElement("button");
    newButton.className = "btn";
    newButton.textContent = "+ New route";
    newButton.addEventListener("click", () => setMode({ kind: "drawing" }));
    header.appendChild(title);
    header.appendChild(newButton);
    panel.appendChild(header);

    listBody = document.createElement("div");
    listBody.className = "panel-section";
    listBody.style.flex = "1 1 auto";
    listBody.style.minHeight = "0";
    listBody.style.overflowY = "auto";
    listBody.style.padding = "0";
    panel.appendChild(listBody);

    return panel;
  }

  async function refreshList(): Promise<void> {
    if (mode.kind !== "list" || !listBody) return;
    const body = listBody;
    const [routes, depotGroups] = await Promise.all([window.routes.list(), window.depotGroups.list()]);
    syncShownRoutes(router, map, routes);
    body.innerHTML = "";

    if (routes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "label-muted";
      empty.style.padding = "8px 12px";
      empty.textContent = "No routes yet — click + New route to draw one.";
      body.appendChild(empty);
      return;
    }

    // Grouped by depot group ("area" — OPERATIONS.md §1a's terminology
    // note), the group nearest the current map centre reordered to the
    // top, so panning reshuffles the list into view. A depot group has no
    // shape of its own to test the viewport against, so distance from the
    // map centre to the group's own main bus station stands in for it —
    // the same anchor point already used for the group's route-direction
    // rule (DESIGN.md §6).
    const centre = map.getCenter();
    const centreLonLat: [number, number] = [centre.lng, centre.lat];
    const groupDistance = (g: DepotGroup): number => {
      if (g.mainBusStationOsmId === null) return Infinity;
      const station = busStationsState.find((s) => s.osmId === g.mainBusStationOsmId);
      return station ? distance(centreLonLat, [station.lon, station.lat]) : Infinity;
    };
    const orderedGroups = [...depotGroups].sort((a, b) => groupDistance(a) - groupDistance(b));

    // Long-distance routes are meant to sit at the bottom of their area's
    // section (DESIGN.md §11) — there's no route-type distinction in the
    // data yet (Phase 3+), so every route is grouped as if local for now.
    for (const group of orderedGroups) {
      const groupRoutes = routes.filter((r) => r.depotGroupId === group.id);
      if (groupRoutes.length === 0) continue;

      const groupLabel = document.createElement("div");
      groupLabel.className = "label-muted";
      groupLabel.style.padding = "8px 12px 4px";
      groupLabel.style.borderTop = "1px solid var(--border)";
      groupLabel.textContent = group.name;
      body.appendChild(groupLabel);

      for (const route of groupRoutes) body.appendChild(buildRouteRow(route));
    }
  }

  function buildRouteRow(route: Route): HTMLElement {
    const expanded = expandedRouteId === route.id;

    const wrapper = document.createElement("div");
    wrapper.style.cursor = "pointer";
    wrapper.style.borderBottom = "1px solid var(--border)";
    if (expanded) wrapper.style.background = "var(--bg-accent)";
    wrapper.addEventListener("click", () => {
      expandedRouteId = expanded ? null : route.id;
      void refreshList();
    });

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "6px 12px";

    // Colour swatch: the route's own player-set colour (DESIGN.md §11),
    // ahead of the full livery system (OPERATIONS.md §4/§5, Phase 3+).
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = route.colour;
    row.appendChild(swatch);

    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.minWidth = "0";
    // A player-set name (DESIGN.md §11) takes over from the derived-from-
    // last-stop destination once set — a manual stand-in for the real
    // destination display (built from variations/extensions, §6/§7), which
    // needs those systems and doesn't exist yet.
    const lastStop = [...route.points].reverse().find((p) => p.kind === "stop");
    const destination = route.name ?? (lastStop ? stopLabel(lastStop) : "");
    const title = document.createElement("div");
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.whiteSpace = "nowrap";
    title.textContent = destination ? `${route.number} — ${destination}` : route.number;
    title.title = title.textContent;
    // Activation state (normal/countdown/deactivated) and a problem
    // indicator both need systems that don't exist yet (an activation
    // model, staffing/punctuality) — every route reads as a plain running
    // one for now, no icon or greying applied.
    const sub = document.createElement("div");
    sub.className = "label-muted";
    const stopCount = route.points.filter((p) => p.kind === "stop").length;
    sub.textContent = `${route.orientation}, ${stopCount} stop${stopCount === 1 ? "" : "s"}`;
    info.appendChild(title);
    info.appendChild(sub);
    row.appendChild(info);

    // A real monthly profit figure needs a finance model (Phase 5) that
    // doesn't exist yet — omitted rather than shown as a fake £0.

    wrapper.appendChild(row);

    // Actions only render when this row is the expanded one (user
    // feedback: too many buttons showing per row at once) — clicking the
    // row again, or any other row, collapses them.
    if (expanded) {
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "4px";
      actions.style.padding = "0 12px 8px";

      // A per-route toggle (multiple routes can be shown on the map at
      // once — shownRoutes above) rather than a single shared preview slot,
      // so showing route B no longer hides route A, and deleting a route
      // only ever removes its own line/chevrons.
      const isShown = shownRoutes.has(route.id);
      const showButton = document.createElement("button");
      showButton.className = "btn btn-icon";
      showButton.textContent = isShown ? "Hide" : "Show";
      showButton.title = isShown ? "Hide this route from the map" : "Show this route on the map";
      showButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (shownRoutes.has(route.id)) {
          shownRoutes.delete(route.id);
          rebuildShownRoutesSources(map);
        } else {
          const preview = computeShownRoutePreview(router, route);
          shownRoutes.set(route.id, preview);
          rebuildShownRoutesSources(map);
          if (preview.coords.length > 0) {
            const bounds = preview.coords.reduce(
              (b, c) => b.extend(c),
              new maplibregl.LngLatBounds(preview.coords[0], preview.coords[0]),
            );
            map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
          }
        }
        // Updates the button's own label (Show <-> Hide) immediately —
        // hiding doesn't move the camera, so the moveend-triggered refresh
        // elsewhere in this module wouldn't otherwise run at all.
        void refreshList();
      });

      const editButton = document.createElement("button");
      editButton.className = "btn btn-icon";
      editButton.textContent = "Edit";
      editButton.title = "Reopen this route for editing";
      editButton.addEventListener("click", (e) => {
        e.stopPropagation();
        setMode({ kind: "drawing", editRoute: route });
      });

      const timetableButton = document.createElement("button");
      timetableButton.className = "btn btn-icon";
      timetableButton.textContent = "Timetable";
      timetableButton.addEventListener("click", (e) => {
        e.stopPropagation();
        setMode({ kind: "timetable", route });
      });

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon btn-danger";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete route";
      deleteButton.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.routes.delete(route.id);
        shownRoutes.delete(route.id);
        rebuildShownRoutesSources(map);
        expandedRouteId = null;
        await refreshList();
      });

      actions.appendChild(showButton);
      actions.appendChild(editButton);
      actions.appendChild(timetableButton);
      actions.appendChild(deleteButton);
      wrapper.appendChild(actions);
    }

    return wrapper;
  }

  // --- timetable mode's locked route reference ---

  function buildLockedRoutePanel(route: Route): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.height = "100%";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";

    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = `${route.number} (locked)`;
    panel.appendChild(header);

    const hint = document.createElement("div");
    hint.className = "label-muted";
    hint.style.padding = "8px 12px";
    hint.textContent = "Stops can't be added or removed while building a timetable.";
    panel.appendChild(hint);

    const list = document.createElement("div");
    list.className = "panel-section";
    list.style.flex = "1 1 auto";
    list.style.minHeight = "0";
    list.style.overflowY = "auto";
    list.style.padding = "0";
    panel.appendChild(list);

    let stopNumber = 0;
    for (const point of route.points) {
      const row = document.createElement("div");
      row.style.padding = "6px 12px";
      row.style.borderBottom = "1px solid var(--border)";
      if (point.kind === "stop") {
        stopNumber += 1;
        row.textContent = `${stopNumber}. ${stopLabel(point)}`;
      } else {
        row.textContent = "Waypoint";
        row.style.color = "var(--text-muted)";
        row.style.fontStyle = "italic";
      }
      list.appendChild(row);
    }

    return panel;
  }

  setMode({ kind: "list" });
  // Panning reshuffles the group order into view (DESIGN.md §11) — a no-op
  // outside list mode, guarded inside refreshList itself.
  map.on("moveend", () => void refreshList());
}
