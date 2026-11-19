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
import { createDropdown } from "./dropdown";
import { createColourPicker } from "./colour-picker";
import { PICKUP_DROPOFF_LABELS, pickupDropoffBadge, effectivePickupDropoff, type PickupDropoff, type PickupDropoffOrBoth } from "./pickup-dropoff";
import { timetableEditorState } from "./timetable-editor-state";
import { startTerminusColour } from "./start-terminus-colours";
import { effectiveRouteColour } from "./route-combine-variations.mts";
import { setMenuOpen } from "./menu-visibility";
import { computeZoneLetters, zonesServedByRoute, isIslandDepotGroup } from "./fare-journey.mts";

const emptyFeatureCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Any number of routes can be shown on the map at once (each toggled
// independently via its own row's Show/Hide button) — keyed by route id so
// toggling one off doesn't require re-routing the others still shown.
// Colour is captured at Show time; editing a route's colour while it's
// shown only takes effect on the next toggle.
interface ShownRoutePreview {
  coords: [number, number][];
  colour: string;
  // A cheap fingerprint of the points used to compute this cache — compared
  // against the freshly-fetched route on every list refresh so an edit made
  // while a route is shown (Edit -> change points/colour -> Save -> Finish)
  // updates the map preview on its own, without needing a manual Hide+Show.
  pointsKey: string;
}
const shownRoutes = new Map<number, ShownRoutePreview>();

function computeShownRoutePreview(router: Router, route: Route, allRoutes: readonly Route[]): ShownRoutePreview {
  const coords = routeLine(router, route.points);
  return { coords, colour: effectiveRouteColour(route, allRoutes), pointsKey: JSON.stringify(route.points) };
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
    const colour = effectiveRouteColour(route, routes);
    if (cached.pointsKey === pointsKey && cached.colour === colour) continue;
    shownRoutes.set(id, computeShownRoutePreview(router, route, routes));
    changed = true;
  }
  if (changed) rebuildShownRoutesSources(map);
}

function rebuildShownRoutesSources(map: maplibregl.Map): void {
  const lineFeatures: GeoJSON.Feature[] = [];
  for (const preview of shownRoutes.values()) {
    if (preview.coords.length >= 2) {
      lineFeatures.push({
        type: "Feature",
        properties: { colour: preview.colour },
        geometry: { type: "LineString", coordinates: preview.coords },
      });
    }
  }
  (map.getSource("saved-route-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: lineFeatures,
  });
}

// Only the point list is persisted (see the routes table's own comment in
// electron/db.mts), not the road-following polyline drawn at the time — so
// showing a saved route again means re-routing every leg, the same way it
// looked while being drawn.
function routeLine(router: Router, points: readonly { lon: number; lat: number }[]): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const leg = router.find_route(a.lon, a.lat, b.lon, b.lat);
    for (let j = 0; j < leg.length; j += 2) coords.push([leg[j], leg[j + 1]]);
  }
  return coords;
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

type Mode =
  | { kind: "list" }
  // "choosing-type" (route types, 2026-10-31): the "+ New route" button's
  // own first step, asking what kind of route this is before drawing
  // starts — editRoute/variationOf both inherit their source's own type
  // unprompted (see route-draw.ts's startEditing/startVariation), so this
  // step only ever applies to a genuinely new route.
  | { kind: "choosing-type" }
  | { kind: "drawing"; editRoute?: Route; variationOf?: Route; newRouteType?: RouteType }
  | { kind: "timetable"; route: Route };

// Lets the Routes/Timetables sections of the bottom bar (routes-screen.ts,
// timetables-screen.ts) trigger this module's own internal mode changes
// without a direct import cycle — same shared-mutable-state pattern
// dutyPanelState/stopsPanelState already use.
export const routePanelState: {
  startNewRoute: (() => void) | null;
  setTimetablePickMode: ((on: boolean) => void) | null;
} = { startNewRoute: null, setTimetablePickMode: null };

export async function mountRoutePanel(map: maplibregl.Map, router: Router): Promise<void> {
  // "Show" preview line — not gated on map.isStyleLoaded() (see
  // OPEN-ITEMS.md for the real bug this caused elsewhere): this module
  // mounts after other layers already exist, proof the style has already
  // loaded once, and isStyleLoaded() can read false here anyway due to
  // unrelated tile activity, silently losing a "load" event that already
  // fired and won't fire again.
  // Any number of routes can be shown at once (see shownRoutes above) — this
  // layer carries every currently-shown route's own line together, each
  // reading its colour back off its own feature's own properties rather than
  // one flat layer-wide paint value, so each route keeps its own colour.
  // Drawn at 75% opacity, the same as the draft/editor view (DESIGN.md §11)
  // — one-way chevrons were tried and dropped (2026-10-17): a stretch a
  // route genuinely travels both ways over rendered arrows pointing both
  // directions at once, which read as cluttered/confusing in practice on
  // the real Portree roundabout loop, worse than just not marking direction
  // at all.
  map.addSource("saved-route-preview", { type: "geojson", data: emptyFeatureCollection });
  map.addLayer({
    id: "saved-route-preview",
    type: "line",
    source: "saved-route-preview",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "colour"],
      "line-opacity": 0.75,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 9, 18, 15],
    },
  });

  // The persistent left-hand slot (DESIGN.md §11). Always the same size and
  // position; only its single child changes with `mode`. Flush against the
  // left, top and bottom edges of the screen — the old top offset existed
  // only to clear the now-removed WASM status readout.
  const slot = document.createElement("div");
  slot.style.position = "absolute";
  slot.style.top = "0";
  slot.style.left = "0";
  slot.style.bottom = "0";
  slot.style.width = "320px";
  // Above the bottom bar's own z-index (bottom-bar.ts, 3) — confirmed
  // 2026-11-01, live user request: "can the route list be on top of the
  // bottom bar please" — so the list's own bottom edge isn't covered by
  // it. Only the list itself was asked for; the timetable slot below is
  // still behind the bar for now.
  slot.style.zIndex = "4";
  document.body.appendChild(slot);

  // The right-hand slot, occupied only in timetable mode — "the timetable
  // grid fills the rest of the screen to the right." Flush against the
  // list slot and the bottom/right screen edges, same as the slot above —
  // except the top, which is inset below vehicle-simulation.ts's own
  // Mon-Fri/Sat/Sun day-type bar (fixed top-right, the "one free corner"
  // at the time it was built). This panel's own header reaches the same
  // corner and, at equal z-index, lost the DOM-order tiebreak to that bar
  // — a real bug the user found live: its own close button sat directly
  // under "Sun" and was unclickable, with no other way to exit timetable
  // mode. 56px comfortably clears the day-type bar's own measured height
  // (42px, from top:8px) rather than matching it exactly.
  // z-index 4, same as the list slot above — matches the bottom-bar fix
  // already applied there (2026-11-01, "can the route list be on top of
  // the bottom bar please"); this slot was left behind the bar (z-index 2)
  // at the time, and the user has now reported the same cut-off here.
  const timetableSlot = document.createElement("div");
  timetableSlot.style.position = "absolute";
  timetableSlot.style.top = "56px";
  timetableSlot.style.left = "320px";
  timetableSlot.style.right = "0";
  timetableSlot.style.bottom = "0";
  timetableSlot.style.zIndex = "4";
  timetableSlot.style.display = "none";
  document.body.appendChild(timetableSlot);

  let mode: Mode = { kind: "list" };
  let listBody: HTMLElement | null = null;
  // Which route's row currently has its actions expanded — at most one at
  // a time, collapsed by default (user feedback: too many buttons showing
  // per row at once). Clicking a row toggles it; clicking a button inside
  // an expanded row stops the click reaching the row itself.
  let expandedRouteId: number | null = null;
  // The full route list from the last refreshList() — kept around so a
  // minor variation's own effective colour (route-combine-variations.mts's
  // effectiveRouteColour) can be resolved through its parent anywhere a row
  // or map preview needs it, without threading the whole list through every
  // call site.
  let allRoutesCache: Route[] = [];
  // T175 follow-up (confirmed 2026-11-12) — every depot group's fare
  // zones, for showing which lettered zone(s) a route passes through in
  // its own list row. route-panel.ts had no fare-zone dependency before
  // this.
  let allZonesCache: FareZone[] = [];
  // Island-route timing-point gating (2026-11-15 follow-up, "fix the UI
  // please" after the peak-padding/island-detection feature shipped with
  // no live validation) — isIslandDepotGroup (fare-journey.mts) needs a
  // real depot location per depot group, which this file had no reason to
  // load before now.
  let allDepotsCache: Depot[] = [];
  // Timetables mode (bottom bar, routes-screen.ts/timetables-screen.ts):
  // while on, clicking a row jumps straight to that route's timetable
  // instead of the normal expand/Edit/Variation/Show actions — a route
  // never has both an expanded row AND pick-mode active, so entering it
  // also clears expandedRouteId (set below in routePanelState's own
  // assignment).
  let timetablePickMode = false;

  const drawController: RouteDrawController = await mountRouteDrawTool(map, router, () =>
    setMode({ kind: "list" }),
  );

  routePanelState.startNewRoute = () => setMode({ kind: "choosing-type" });
  routePanelState.setTimetablePickMode = (on) => {
    timetablePickMode = on;
    expandedRouteId = null;
    void refreshList();
  };

  function setMode(next: Mode): void {
    mode = next;
    slot.innerHTML = "";
    timetableSlot.innerHTML = "";
    timetableSlot.style.display = next.kind === "timetable" ? "block" : "none";
    // The plain route list is always-visible chrome (DESIGN.md §11), not a
    // "menu" in the sense of the clock-cluster hide request (menu-
    // visibility.ts) — only drawing/choosing-type/timetable mode, which
    // take over real screen space for a deliberate action, count.
    setMenuOpen("route-panel", next.kind !== "list");

    if (next.kind === "list") {
      slot.appendChild(buildListPanel());
      void refreshList();
    } else if (next.kind === "choosing-type") {
      slot.appendChild(buildChooseTypePanel());
    } else if (next.kind === "drawing") {
      slot.appendChild(drawController.el);
      if (next.variationOf) drawController.startVariation(next.variationOf);
      else if (next.editRoute) drawController.startEditing(next.editRoute);
      else drawController.startDrawing(next.newRouteType ?? "ordinary");
    } else {
      // Cleared up front — buildLockedRoutePanel's first render runs before
      // createRouteTimetableEditor's own async day-type load resolves, so
      // without this it would briefly show whichever route's timing points
      // were left over from the last time timetable mode was open.
      timetableEditorState.weekdayMask = null;
      timetableEditorState.timingPoints = [];
      timetableEditorState.onDayTypeChanged = null;
      timetableEditorState.onTimingPointsEdited = null;
      slot.appendChild(buildLockedRoutePanel(next.route));
      const editor = createRouteTimetableEditor(
        next.route,
        router,
        () => setMode({ kind: "list" }),
        (sibling) => setMode({ kind: "timetable", route: sibling }),
      );
      timetableSlot.appendChild(editor.el);
    }
  }

  // --- choosing-type mode (route types, 2026-10-31) ---

  const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
    ordinary: "Ordinary",
    night: "Night service",
    sightseeing: "Sightseeing",
    airport_express: "Airport Express",
    long_distance: "Long-distance",
    staff: "Staff bus",
  };
  // T175 follow-up (confirmed 2026-11-12) — only ordinary/night routes
  // ever price via zones (quoteSingleFareGBPPence in fare-journey.mts):
  // Staff is free, Airport Express/Long-distance/Sightseeing are flat or
  // player-set and never zone-classified, so their rows show no zone
  // suffix at all.
  const SKIP_ZONE_LABEL: ReadonlySet<RouteType> = new Set(["staff", "long_distance", "sightseeing", "airport_express"]);
  const ROUTE_TYPE_BY_LABEL: Record<string, RouteType> = {
    Ordinary: "ordinary",
    "Night service": "night",
    Sightseeing: "sightseeing",
    "Airport Express": "airport_express",
    "Long-distance": "long_distance",
    "Staff bus": "staff",
  };

  function buildChooseTypePanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "panel panel-flush";
    panel.style.height = "100%";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";

    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "New route — what type?";
    panel.appendChild(header);

    const body = document.createElement("div");
    body.style.padding = "12px";

    let chosenType: RouteType = "ordinary";
    const dropdown = createDropdown(Object.values(ROUTE_TYPE_LABELS), ROUTE_TYPE_LABELS[chosenType], (label) => {
      chosenType = ROUTE_TYPE_BY_LABEL[label];
    });
    dropdown.el.style.marginBottom = "12px";
    body.appendChild(dropdown.el);

    const note = document.createElement("div");
    note.className = "label-muted";
    note.style.fontSize = "11px";
    note.style.marginBottom = "12px";
    note.textContent =
      "Night services are limited to a 23:45–03:45 last departure, finishing by 04:15 at the latest; the fare-pricing panel shows the relevant fields automatically once a route of that type exists.";
    body.appendChild(note);

    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "6px";
    const startButton = document.createElement("button");
    startButton.className = "btn";
    startButton.textContent = "Start drawing";
    startButton.addEventListener("click", () => setMode({ kind: "drawing", newRouteType: chosenType }));
    const cancelButton = document.createElement("button");
    cancelButton.className = "btn";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => setMode({ kind: "list" }));
    buttonRow.append(startButton, cancelButton);
    body.appendChild(buttonRow);

    panel.appendChild(body);
    return panel;
  }

  // --- list mode ---

  function buildListPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "panel panel-flush";
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
    newButton.addEventListener("click", () => setMode({ kind: "choosing-type" }));
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
    const [routes, depotGroups, zones, depots] = await Promise.all([
      window.routes.list(),
      window.depotGroups.list(),
      window.fareZones.listAll(),
      window.depots.list(),
    ]);
    allRoutesCache = routes;
    allZonesCache = zones;
    allDepotsCache = depots;
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

      // Minor variations only show inline once their parent is clicked
      // (live user request, 2026-11-15) — reuses `expandedRouteId`, the
      // same state that already drives "click a row to reveal its own
      // action buttons" below, rather than adding a second expand/
      // collapse mechanism. Covers `expandedRouteId === route.id` too,
      // not just its parent's: a minor variation's own row is never
      // clickable while hidden, but this keeps the state consistent if
      // something else ever expands one directly.
      for (const route of groupRoutes) {
        if (route.isMinorVariation && expandedRouteId !== route.parentRouteId && expandedRouteId !== route.id) continue;
        body.appendChild(buildRouteRow(route));
      }
    }
  }

  function buildRouteRow(route: Route): HTMLElement {
    const expanded = expandedRouteId === route.id;

    const wrapper = document.createElement("div");
    wrapper.style.cursor = "pointer";
    wrapper.style.borderBottom = "1px solid var(--border)";
    if (expanded) wrapper.style.background = "var(--bg-accent)";
    if (timetablePickMode) {
      // Timetables mode (bottom bar) — a row click jumps straight to this
      // route's timetable, bypassing the normal expand/Edit/Variation/Show
      // actions entirely (DESIGN.md's own list is still "always visible,"
      // this just changes what clicking a row does while the mode is on).
      wrapper.title = "Click to open this route's timetable";
      wrapper.addEventListener("click", () => setMode({ kind: "timetable", route }));
    } else {
      wrapper.addEventListener("click", () => {
        expandedRouteId = expanded ? null : route.id;
        void refreshList();
      });
    }

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "6px 12px";
    // Minor variations (DESIGN.md §6) are shown as an indented sub-row
    // under their parent — they already sort immediately next to it in
    // the list above, since a minor variation shares its parent's exact
    // "number" and the list is ordered by number. No separate
    // parent/child tree structure needed, just a visual nudge.
    if (route.isMinorVariation) row.style.paddingLeft = "28px";

    // Colour swatch: the route's own player-set colour (DESIGN.md §11),
    // ahead of the full livery system (OPERATIONS.md §4/§5, Phase 3+).
    // A minor variation always follows its parent's colour (live, via
    // effectiveRouteColour) and isn't independently editable, so it's shown
    // as a plain, non-interactive swatch — only an ordinary route or major
    // variation gets the clickable colour picker below (colour-picker.ts,
    // T169 — a custom popup, not a native <input type="color">, whose own
    // popup can land on the wrong monitor on a multi-monitor/mixed-DPI
    // setup). Picking a colour calls routes:setColour directly (2026-11-08
    // bug fix) rather than going through the normal Edit -> Save flow,
    // which always clears the route's timetable (updateRoute's own
    // documented behaviour) — a pure colour change must never do that.
    const effColour = effectiveRouteColour(route, allRoutesCache);
    if (route.isMinorVariation) {
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = effColour;
      swatch.title = "Follows the parent route's colour";
      row.appendChild(swatch);
    } else {
      const picker = createColourPicker(effColour, (hex) => {
        // Live-preview on the map immediately, same immediacy the old
        // native input's own "input" event had — only if this route is
        // currently shown; nothing to update otherwise.
        const shown = shownRoutes.get(route.id);
        if (shown) {
          shown.colour = hex;
          rebuildShownRoutesSources(map);
        }
        void window.routes.setColour(route.id, hex).then(() => refreshList());
      });
      picker.el.title = "Click to change this route's colour";
      row.appendChild(picker.el);
    }

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
    const minorPrefix = route.isMinorVariation ? "└ " : "";
    title.textContent = minorPrefix + (destination ? `${route.number} — ${destination}` : route.number);
    title.title = title.textContent;
    // Activation state (normal/countdown/deactivated) and a problem
    // indicator both need systems that don't exist yet (an activation
    // model, staffing/punctuality) — every route reads as a plain running
    // one for now, no icon or greying applied.
    const sub = document.createElement("div");
    sub.className = "label-muted";
    const stopCount = route.points.filter((p) => p.kind === "stop").length;
    // Route type shown here (2026-11-01, live user question: "does it say
    // what type of route a route is?" — it didn't) — "Ordinary" included
    // too, not just the special types, so every row reads consistently
    // rather than special-casing the common case into silence.
    let zoneLabelSuffix = "";
    if (!SKIP_ZONE_LABEL.has(route.routeType)) {
      const groupZones = allZonesCache.filter((z) => z.depotGroupId === route.depotGroupId);
      const letters = computeZoneLetters(groupZones);
      const servedLetters = zonesServedByRoute(route, groupZones)
        .map((z) => letters.get(z.id))
        .filter((l): l is string => l !== undefined)
        .sort();
      if (servedLetters.length > 0) zoneLabelSuffix = `, Zone ${servedLetters.join(", ")}`;
    }
    sub.textContent = `${route.orientation}, ${stopCount} stop${stopCount === 1 ? "" : "s"}, ${ROUTE_TYPE_LABELS[route.routeType]}${route.isMinorVariation ? ", minor variation" : ""}${zoneLabelSuffix}`;
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
          const preview = computeShownRoutePreview(router, route, allRoutesCache);
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

      const variationButton = document.createElement("button");
      variationButton.className = "btn btn-icon";
      variationButton.textContent = "Variation";
      variationButton.title = "Draw a new lettered variation of this route (DESIGN.md §6)";
      variationButton.addEventListener("click", (e) => {
        e.stopPropagation();
        setMode({ kind: "drawing", variationOf: route });
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
        stopsPanelState.refreshUsedByService?.();
      });

      actions.appendChild(showButton);
      actions.appendChild(editButton);
      actions.appendChild(timetableButton);
      actions.appendChild(variationButton);
      actions.appendChild(deleteButton);
      wrapper.appendChild(actions);
    }

    return wrapper;
  }

  // --- timetable mode's locked route reference ---

  // Shared by all 4 timing-point UI blocks below (2026-11-15 follow-up,
  // "fix the UI please") — an island route's single timing point has no
  // separate peak padding at all (route-timetable.mts's own real
  // validateTimingPoints rule), so the field is hidden outright, not just
  // disabled, with a short note explaining why rather than silently
  // vanishing. Always returns a real input element (never appended to the
  // DOM when island) so every call site's existing peakMinutesInput.value
  // read keeps working unchanged — an unappended, untouched input's value
  // stays "", which every commit function already treats as "no peak
  // figure set."
  function appendPeakMinutesControl(controls: HTMLElement, timingPoint: TimingPoint | null | undefined, isIslandRoute: boolean): HTMLInputElement {
    if (isIslandRoute) {
      const note = document.createElement("div");
      note.className = "label-muted";
      note.textContent = "Island routes don't use peak padding.";
      controls.appendChild(note);
      return document.createElement("input");
    }
    const peakMinutesLabel = document.createElement("label");
    peakMinutesLabel.className = "label-muted";
    peakMinutesLabel.textContent = "Extra minutes at peak (07:00-09:00/16:00-18:00), if different:";
    controls.appendChild(peakMinutesLabel);
    const peakMinutesInput = document.createElement("input");
    peakMinutesInput.className = "field";
    peakMinutesInput.type = "number";
    peakMinutesInput.min = "0";
    peakMinutesInput.step = "1";
    peakMinutesInput.placeholder = "Same as above if left blank";
    peakMinutesInput.value = String(timingPoint?.peakPaddingMinutes ?? "");
    controls.appendChild(peakMinutesInput);
    return peakMinutesInput;
  }

  function buildLockedRoutePanel(route: Route): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "panel panel-flush";
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

    // Island-route gating (2026-11-15 follow-up) — real server-side rule
    // in route-timetable.mts's validateTimingPoints: an island route gets
    // exactly one timing point, with no separate peak padding at all.
    // Computed once when this panel opens, not re-checked per render —
    // there's no UI path that changes a route's own depotGroupId while its
    // timetable editor is open, so this can't go stale mid-session.
    const isIslandRoute = isIslandDepotGroup(route.depotGroupId, allDepotsCache, allZonesCache);

    // Hides every stop that's neither a timing point nor the route's own
    // start/terminus — the ones that actually matter for working out a
    // timetable, once a route has many more physical stops than published
    // times (route-timetable.mts's own reasoning).
    let hideNonTimingPoints = false;
    const hideToggle = document.createElement("button");
    hideToggle.className = "btn";
    hideToggle.style.margin = "0 12px 8px";
    panel.appendChild(hideToggle);

    const list = document.createElement("div");
    list.className = "panel-section";
    list.style.flex = "1 1 auto";
    list.style.minHeight = "0";
    list.style.overflowY = "auto";
    list.style.padding = "0";
    panel.appendChild(list);

    // Read-only — derived from the route's own fields, never a per-stop
    // toggle (DESIGN.md §6 "Start and terminus stops"). Defaults to
    // points[0]/points[last] when neither index is set, same as everywhere
    // else this pair is used.
    const startIdx = route.startIndex ?? 0;
    const terminusIdx = route.terminusIndex ?? route.points.length - 1;

    // Which stop's row (by index into route.points) currently has its
    // controls expanded — at most one at a time, same collapsed-by-default
    // pattern as the route list's own row actions.
    let expandedPointIndex: number | null = null;

    // renderList awaits an overrides lookup per stop, so two calls can
    // overlap (e.g. a click firing a re-render before a previous one's
    // awaits have all settled) — without this guard, an older call's
    // still-pending appends land after a newer call has already cleared
    // and started rebuilding the list, producing duplicated rows. Each
    // call captures its own generation and bails as soon as a newer one
    // has started.
    let renderGeneration = 0;

    hideToggle.addEventListener("click", () => {
      hideNonTimingPoints = !hideNonTimingPoints;
      void renderList();
    });

    // route-timetable-panel.ts calls this whenever the day type switches
    // (or a timetable first loads), so this list re-renders against
    // whichever day type's timing points are now current.
    timetableEditorState.onDayTypeChanged = () => void renderList();

    async function renderList(): Promise<void> {
      const myGeneration = ++renderGeneration;
      hideToggle.textContent = hideNonTimingPoints ? "Show all stops" : "Hide non-timing-point stops";
      list.innerHTML = "";
      const routeOverrideByIndex = new Map(route.pickupDropoffOverrides.map((o) => [o.pointIndex, o.value]));
      const timingPointByIndex = new Map(timetableEditorState.timingPoints.map((tp) => [tp.pointIndex, tp]));

      let stopNumber = 0;
      for (let i = 0; i < route.points.length; i++) {
        if (myGeneration !== renderGeneration) return;
        const point = route.points[i];
        // The physical first/last point is always the start/terminus too,
        // whatever a terminus loop's startIndex/terminusIndex point at
        // elsewhere — point 0 is always the journey's own departure
        // (route-timetable.mts) and the last point is always where the
        // route physically ends, on top of whichever interior stop the
        // loop encoding flags.
        const isStart = i === startIdx || i === 0;
        const isTerminus = i === terminusIdx || i === route.points.length - 1;
        // The route's own start and terminus are always timing points on a
        // real timetable, with no way to disable it (live user request,
        // 2026-11-08) — point 0/the last point (route-timetable.mts's
        // computeOffsets treats them this way regardless: always a
        // published time, never estimated) and, for a terminus-loop route,
        // its own interior startIndex/terminusIndex too (isStart/
        // isTerminus above already fold in both cases). Which OTHER points
        // are timing points is a route-level fact (routes.
        // timing_point_indexes, schema v56->v57) the player does control —
        // see db.mts's own SCHEMA comment.
        const isTimingPoint = route.timingPointIndexes.includes(i) || isStart || isTerminus;

        if (point.kind !== "stop" || point.osmId === undefined) {
          if (hideNonTimingPoints) continue;
          const row = document.createElement("div");
          row.style.borderBottom = "1px solid var(--border)";
          const line = document.createElement("div");
          line.style.display = "flex";
          line.style.alignItems = "center";
          line.style.gap = "6px";
          line.style.padding = "6px 12px";
          line.textContent = "Waypoint";
          line.style.color = "var(--text-muted)";
          line.style.fontStyle = "italic";
          row.appendChild(line);
          list.appendChild(row);
          continue;
        }

        stopNumber += 1;
        const osmId = point.osmId;

        // Stop-level "always a timing point" (DESIGN.md §4; live request,
        // 2026-11-08): a bus station (by kind), or a stop manually flagged
        // as an airport or as always-shared (stops-layer.ts's own two new
        // checkboxes), is a timing point on EVERY route calling here, with
        // no per-route way to turn it back off — same treatment as isStart/
        // isTerminus above, just keyed off the stop rather than the route.
        const stopKind = stopsPanelState.kindFor?.(osmId) ?? null;
        const [alwaysShared, isAirport] = await Promise.all([
          window.overrides.get<boolean>("stop", osmId, "always_timing_point"),
          window.overrides.get<boolean>("stop", osmId, "is_airport"),
        ]);
        if (myGeneration !== renderGeneration) return;
        const forcedByStop = stopKind === "bus_station" || alwaysShared === true || isAirport === true;
        const isTimingPointResolved = isTimingPoint || forcedByStop;
        if (hideNonTimingPoints && !isStart && !isTerminus && !isTimingPointResolved) continue;

        const row = document.createElement("div");
        row.style.borderBottom = "1px solid var(--border)";

        const line = document.createElement("div");
        line.style.display = "flex";
        line.style.alignItems = "center";
        line.style.gap = "6px";
        line.style.padding = "6px 12px";

        const label = document.createElement("span");
        label.style.flex = "1";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = `${stopNumber}. ${stopLabel(point)}`;
        const colour = startTerminusColour(isStart, isTerminus);
        if (colour) label.style.color = colour;
        line.appendChild(label);

        const routeOverride = routeOverrideByIndex.get(i) ?? null;
        const globalOverride = await window.overrides.get<PickupDropoffOrBoth>("stop", osmId, "pickupDropoff");
        if (myGeneration !== renderGeneration) return;
        const effective = effectivePickupDropoff(routeOverride, globalOverride);
        const badgeLetter = pickupDropoffBadge(effective);
        if (badgeLetter) {
          const badge = document.createElement("span");
          badge.className = "badge badge-info";
          badge.textContent = badgeLetter;
          badge.title = PICKUP_DROPOFF_LABELS[effective];
          line.appendChild(badge);
        }

        const timingPoint = timingPointByIndex.get(i) ?? null;
        if (isTimingPointResolved) {
          const tpBadge = document.createElement("span");
          tpBadge.className = "badge badge-warning";
          tpBadge.textContent = "T";
          tpBadge.title = timingPoint
            ? `Timing point — +${timingPoint.standardPaddingMinutes} min padding${timingPoint.peakPaddingMinutes !== null ? ` (+${timingPoint.peakPaddingMinutes} min at peak)` : ""}`
            : i === 0
              ? "Always a timing point — the journey's own departure"
              : i === route.points.length - 1
                ? "Always a timing point — the route's terminus, even with no leg time explicitly set"
                : isStart || isTerminus
                  ? "Always a timing point — the route's own start/terminus (terminus-loop routes), with no way to disable it"
                  : forcedByStop
                    ? isAirport === true
                      ? "Always a timing point — flagged as an airport, with no way to disable it"
                      : stopKind === "bus_station"
                        ? "Always a timing point — bus stations always are, with no way to disable it"
                        : "Always a timing point — flagged on the stop itself, shared by every route calling here, with no way to disable it"
                    : "Timing point (this route)";
          line.appendChild(tpBadge);
        }

        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          expandedPointIndex = expandedPointIndex === i ? null : i;
          void renderList();
        });
        row.appendChild(line);

        if (expandedPointIndex === i) {
          const controls = document.createElement("div");
          controls.style.padding = "0 12px 10px";
          controls.style.display = "flex";
          controls.style.flexDirection = "column";
          controls.style.gap = "6px";
          controls.addEventListener("click", (e) => e.stopPropagation());

          if (i === 0) {
            const tpNote = document.createElement("div");
            tpNote.className = "label-muted";
            tpNote.textContent = "Point 0 is always the journey's own published departure — no timing point needed.";
            controls.appendChild(tpNote);
          } else if (i === route.points.length - 1) {
            // The terminus is always a timing point (route-timetable.mts)
            // and always needs a published arrival time, so there's no
            // on/off checkbox here — just the time itself, defaulting to
            // the fastest achievable running time until set. No dwell:
            // once the vehicle is empty here it's simply free, not
            // scheduled to wait before some later departure this route's
            // own timetable would need to account for.
            const terminusNote = document.createElement("div");
            terminusNote.className = "label-muted";
            terminusNote.textContent = "The terminus always needs a published arrival time.";
            controls.appendChild(terminusNote);

            const legMinutesLabel = document.createElement("label");
            legMinutesLabel.className = "label-muted";
            legMinutesLabel.textContent = "Extra minutes above the fastest achievable time:";
            controls.appendChild(legMinutesLabel);
            const legMinutesInput = document.createElement("input");
            legMinutesInput.className = "field";
            legMinutesInput.type = "number";
            legMinutesInput.min = "0";
            legMinutesInput.step = "1";
            legMinutesInput.placeholder = "0 if left blank";
            legMinutesInput.value = String(timingPoint?.standardPaddingMinutes ?? "");
            controls.appendChild(legMinutesInput);
            const peakMinutesInput = appendPeakMinutesControl(controls, timingPoint, isIslandRoute);

            const commitTerminusTimes = (): void => {
              timetableEditorState.timingPoints = timetableEditorState.timingPoints.filter(
                (tp) => tp.pointIndex !== i,
              );
              if (legMinutesInput.value !== "" || peakMinutesInput.value !== "") {
                const standardPaddingMinutes = Math.max(0, Math.round(Number(legMinutesInput.value) || 0));
                const peakPaddingMinutes = peakMinutesInput.value === "" ? null : Math.max(0, Math.round(Number(peakMinutesInput.value) || 0));
                timetableEditorState.timingPoints.push({ pointIndex: i, standardPaddingMinutes, peakPaddingMinutes, dwellMinutes: 0 });
              }
              timetableEditorState.onTimingPointsEdited?.();
              void renderList();
            };
            legMinutesInput.addEventListener("change", commitTerminusTimes);
            peakMinutesInput.addEventListener("change", commitTerminusTimes);
          } else if (isTerminus) {
            // An interior terminus-loop terminus (DESIGN.md §6, terminusIndex
            // set to something other than the route's own last point) —
            // always a timing point too, no checkbox (live user request,
            // 2026-11-08: "the start and terminus of a route always be a
            // timing point with no way of disabling it"). Same treatment as
            // the physical last point below: it always needs a published
            // arrival leg-time, no dwell — once the outbound leg ends here
            // the vehicle is simply free, not scheduled to wait.
            const terminusNote = document.createElement("div");
            terminusNote.className = "label-muted";
            terminusNote.textContent = "This route's own terminus — always needs a published arrival time.";
            controls.appendChild(terminusNote);

            const legMinutesLabel = document.createElement("label");
            legMinutesLabel.className = "label-muted";
            legMinutesLabel.textContent = "Extra minutes above the fastest achievable time:";
            controls.appendChild(legMinutesLabel);
            const legMinutesInput = document.createElement("input");
            legMinutesInput.className = "field";
            legMinutesInput.type = "number";
            legMinutesInput.min = "0";
            legMinutesInput.step = "1";
            legMinutesInput.placeholder = "0 if left blank";
            legMinutesInput.value = String(timingPoint?.standardPaddingMinutes ?? "");
            controls.appendChild(legMinutesInput);
            const peakMinutesInput = appendPeakMinutesControl(controls, timingPoint, isIslandRoute);

            const commitInteriorTerminusTimes = (): void => {
              timetableEditorState.timingPoints = timetableEditorState.timingPoints.filter(
                (tp) => tp.pointIndex !== i,
              );
              if (legMinutesInput.value !== "" || peakMinutesInput.value !== "") {
                const standardPaddingMinutes = Math.max(0, Math.round(Number(legMinutesInput.value) || 0));
                const peakPaddingMinutes = peakMinutesInput.value === "" ? null : Math.max(0, Math.round(Number(peakMinutesInput.value) || 0));
                timetableEditorState.timingPoints.push({ pointIndex: i, standardPaddingMinutes, peakPaddingMinutes, dwellMinutes: 0 });
              }
              timetableEditorState.onTimingPointsEdited?.();
              void renderList();
            };
            legMinutesInput.addEventListener("change", commitInteriorTerminusTimes);
            peakMinutesInput.addEventListener("change", commitInteriorTerminusTimes);
          } else if (isStart) {
            // An interior terminus-loop start (DESIGN.md §6, startIndex) —
            // always a timing point too, no checkbox, same reasoning as
            // above. Unlike the terminus, this is the RETURN leg's own
            // zero/reference point (computeOffsetsForDirection computes an
            // "inbound" component's own offsets locally, treating startIndex
            // as that leg's own point 0) — confirmed directly with the user,
            // 2026-11-08, after an initial build gave it a "minutes from the
            // previous timing point" input that made no sense for a point
            // whose own published time always comes from the timetable's
            // own bands/frequency, the same as point 0 gets no input either.
            const startNote = document.createElement("div");
            startNote.className = "label-muted";
            startNote.textContent = "This route's own start — always the return leg's own published departure, no timing point needed.";
            controls.appendChild(startNote);
          } else if (forcedByStop) {
            // Forced on by the STOP itself (bus station / airport / manual
            // "always a timing point" flag — stops-layer.ts's own popup),
            // not this route's own timing_point_indexes — no on/off
            // checkbox, same "no way to disable" treatment as isStart/
            // isTerminus above, just with real leg-time/dwell inputs since
            // a timing point (unlike the terminus) still needs them.
            const forcedNote = document.createElement("div");
            forcedNote.className = "label-muted";
            forcedNote.textContent =
              stopKind === "bus_station"
                ? "Always a timing point — this is a bus station."
                : isAirport === true
                  ? "Always a timing point — flagged as an airport."
                  : "Always a timing point — flagged on the stop itself, shared by every route calling here.";
            controls.appendChild(forcedNote);

            const legMinutesLabel = document.createElement("label");
            legMinutesLabel.className = "label-muted";
            legMinutesLabel.textContent = "Extra minutes above the fastest achievable time:";
            controls.appendChild(legMinutesLabel);
            const legMinutesInput = document.createElement("input");
            legMinutesInput.className = "field";
            legMinutesInput.type = "number";
            legMinutesInput.min = "0";
            legMinutesInput.step = "1";
            legMinutesInput.placeholder = "0 if left blank";
            legMinutesInput.value = String(timingPoint?.standardPaddingMinutes ?? "");
            controls.appendChild(legMinutesInput);
            const peakMinutesInput = appendPeakMinutesControl(controls, timingPoint, isIslandRoute);

            const dwellLabel = document.createElement("label");
            dwellLabel.className = "label-muted";
            dwellLabel.textContent = "Dwell/layover before departing again (minutes, 0 if none):";
            controls.appendChild(dwellLabel);
            const dwellInput = document.createElement("input");
            dwellInput.className = "field";
            dwellInput.type = "number";
            dwellInput.min = "0";
            dwellInput.step = "1";
            dwellInput.value = String(timingPoint?.dwellMinutes ?? 0);
            controls.appendChild(dwellInput);

            const commitForcedTimes = (): void => {
              timetableEditorState.timingPoints = timetableEditorState.timingPoints.filter(
                (tp) => tp.pointIndex !== i,
              );
              const standardPaddingMinutes = legMinutesInput.value === "" ? null : Math.max(0, Math.round(Number(legMinutesInput.value) || 0));
              const peakPaddingMinutes = peakMinutesInput.value === "" ? null : Math.max(0, Math.round(Number(peakMinutesInput.value) || 0));
              const dwellMinutes = Math.max(0, Math.round(Number(dwellInput.value) || 0));
              if (standardPaddingMinutes !== null || peakPaddingMinutes !== null || dwellMinutes !== 0) {
                timetableEditorState.timingPoints.push({ pointIndex: i, standardPaddingMinutes: standardPaddingMinutes ?? 0, peakPaddingMinutes, dwellMinutes });
              }
              timetableEditorState.onTimingPointsEdited?.();
              void renderList();
            };
            legMinutesInput.addEventListener("change", commitForcedTimes);
            peakMinutesInput.addEventListener("change", commitForcedTimes);
            dwellInput.addEventListener("change", commitForcedTimes);
          } else {
            // Whether this point IS a timing point is a route-level fact
            // (routes.timing_point_indexes) — the checkbox below writes
            // straight to the route via setTimingPoint, same as the
            // pickup/dropoff override dropdowns further down this same
            // list. The two inputs after it are the TIMES at this point
            // for the component currently being edited, which still
            // genuinely vary by day type/direction, so those stay on
            // timetableEditorState as before.
            const routeIsTimingPoint = route.timingPointIndexes.includes(i);
            const tpToggleRow = document.createElement("label");
            tpToggleRow.style.display = "flex";
            tpToggleRow.style.alignItems = "center";
            tpToggleRow.style.gap = "6px";
            const tpCheckbox = document.createElement("input");
            tpCheckbox.type = "checkbox";
            tpCheckbox.checked = routeIsTimingPoint;
            // Island-route cap (2026-11-15 follow-up, corrected 2026-11-19
            // — see validateTimingPoints' own matching real rule in
            // route-timetable.mts for the full story) — real server-side
            // rule: an island route gets exactly one OPTIONAL timing point.
            // Checked against `route.timingPointIndexes` (the real,
            // persisted list of player-flagged optional points) directly,
            // not the raw `timingPoints` array — a mandatory terminus/
            // forced-by-stop entry never lands in `timingPointIndexes`, so
            // it never counts against this cap. `routeIsTimingPoint` is
            // already "is THIS index in route.timingPointIndexes," so once
            // that's false, any nonzero length there means some OTHER
            // optional point is already flagged.
            const islandCapReached = isIslandRoute && !routeIsTimingPoint && route.timingPointIndexes.length > 0;
            tpCheckbox.disabled = islandCapReached;
            tpToggleRow.appendChild(tpCheckbox);
            tpToggleRow.appendChild(document.createTextNode("Timing point (this route)"));
            controls.appendChild(tpToggleRow);
            if (islandCapReached) {
              const capNote = document.createElement("div");
              capNote.className = "label-muted";
              capNote.textContent = "Island routes are limited to a single timing point, already set elsewhere on this route.";
              controls.appendChild(capNote);
            }

            const legMinutesLabel = document.createElement("label");
            legMinutesLabel.className = "label-muted";
            legMinutesLabel.textContent = "Extra minutes above the fastest achievable time:";
            controls.appendChild(legMinutesLabel);
            const legMinutesInput = document.createElement("input");
            legMinutesInput.className = "field";
            legMinutesInput.type = "number";
            legMinutesInput.min = "0";
            legMinutesInput.step = "1";
            legMinutesInput.value = String(timingPoint?.standardPaddingMinutes ?? "");
            legMinutesInput.disabled = !routeIsTimingPoint;
            controls.appendChild(legMinutesInput);
            const peakMinutesInput = appendPeakMinutesControl(controls, timingPoint, isIslandRoute);
            peakMinutesInput.disabled = !routeIsTimingPoint;

            // A layover (e.g. a bus station stand where the same working
            // picks up again after a break) — always visible with its own
            // label so a "0" reads as "no layover", not an unlabelled
            // number nobody can place (the field's own placeholder
            // disappears the moment it holds a real value, "0" included).
            const dwellLabel = document.createElement("label");
            dwellLabel.className = "label-muted";
            dwellLabel.textContent = "Dwell/layover before departing again (minutes, 0 if none):";
            controls.appendChild(dwellLabel);
            const dwellInput = document.createElement("input");
            dwellInput.className = "field";
            dwellInput.type = "number";
            dwellInput.min = "0";
            dwellInput.step = "1";
            dwellInput.value = String(timingPoint?.dwellMinutes ?? 0);
            dwellInput.disabled = !routeIsTimingPoint;
            controls.appendChild(dwellInput);

            // Writes this component's own times for point i — called
            // whenever either time input changes, and once more right
            // after the route-level flag itself changes (to drop/add this
            // point's time entry in step with it).
            const commitTimes = (): void => {
              timetableEditorState.timingPoints = timetableEditorState.timingPoints.filter(
                (tp) => tp.pointIndex !== i,
              );
              if (tpCheckbox.checked) {
                const standardPaddingMinutes = Math.max(0, Math.round(Number(legMinutesInput.value) || 0));
                const peakPaddingMinutes = peakMinutesInput.value === "" ? null : Math.max(0, Math.round(Number(peakMinutesInput.value) || 0));
                const dwellMinutes = Math.max(0, Math.round(Number(dwellInput.value) || 0));
                timetableEditorState.timingPoints.push({ pointIndex: i, standardPaddingMinutes, peakPaddingMinutes, dwellMinutes });
              }
              timetableEditorState.onTimingPointsEdited?.();
              void renderList();
            };

            tpCheckbox.addEventListener("change", () => {
              const checked = tpCheckbox.checked;
              legMinutesInput.disabled = !checked;
              peakMinutesInput.disabled = !checked;
              dwellInput.disabled = !checked;
              if (checked && legMinutesInput.value === "") legMinutesInput.value = "1";
              void window.routes.setTimingPoint(route.id, i, checked).then(() => {
                route.timingPointIndexes = checked
                  ? [...route.timingPointIndexes, i].sort((a, b) => a - b)
                  : route.timingPointIndexes.filter((idx) => idx !== i);
                commitTimes();
              });
            });
            legMinutesInput.addEventListener("change", commitTimes);
            peakMinutesInput.addEventListener("change", commitTimes);
            dwellInput.addEventListener("change", commitTimes);
          }

          const THIS_ROUTE_DEFAULT = "Use stop default";
          const thisRouteLabel = document.createElement("div");
          thisRouteLabel.className = "label-muted";
          thisRouteLabel.textContent = "This route:";
          controls.appendChild(thisRouteLabel);
          const thisRouteDropdown = createDropdown(
            [
              THIS_ROUTE_DEFAULT,
              PICKUP_DROPOFF_LABELS.pickup_only,
              PICKUP_DROPOFF_LABELS.setdown_only,
              PICKUP_DROPOFF_LABELS.skip,
            ],
            routeOverride === null ? THIS_ROUTE_DEFAULT : PICKUP_DROPOFF_LABELS[routeOverride],
            (chosenLabel) => {
              const value: PickupDropoff | null =
                chosenLabel === PICKUP_DROPOFF_LABELS.pickup_only
                  ? "pickup_only"
                  : chosenLabel === PICKUP_DROPOFF_LABELS.setdown_only
                    ? "setdown_only"
                    : chosenLabel === PICKUP_DROPOFF_LABELS.skip
                      ? "skip"
                      : null;
              void window.routes.setPickupDropoffOverride(route.id, i, value).then(() => {
                route.pickupDropoffOverrides = route.pickupDropoffOverrides.filter((o) => o.pointIndex !== i);
                if (value !== null) route.pickupDropoffOverrides.push({ pointIndex: i, value });
                void renderList();
              });
            },
          );
          thisRouteDropdown.el.style.width = "100%";
          controls.appendChild(thisRouteDropdown.el);

          const globalLabel = document.createElement("div");
          globalLabel.className = "label-muted";
          globalLabel.textContent = "All routes (this stop's default):";
          controls.appendChild(globalLabel);
          const globalDropdown = createDropdown(
            Object.values(PICKUP_DROPOFF_LABELS),
            PICKUP_DROPOFF_LABELS[globalOverride ?? "both"],
            (chosenLabel) => {
              const value = (Object.entries(PICKUP_DROPOFF_LABELS).find(([, l]) => l === chosenLabel)?.[0] ??
                "both") as PickupDropoffOrBoth;
              const write =
                value === "both"
                  ? window.overrides.reset("stop", osmId, "pickupDropoff")
                  : window.overrides.set("stop", osmId, "pickupDropoff", value);
              void write.then(() => void renderList());
            },
          );
          globalDropdown.el.style.width = "100%";
          controls.appendChild(globalDropdown.el);

          row.appendChild(controls);
        }

        list.appendChild(row);
      }
    }

    void renderList();
    return panel;
  }

  setMode({ kind: "list" });
  // Panning reshuffles the group order into view (DESIGN.md §11) — a no-op
  // outside list mode, guarded inside refreshList itself.
  map.on("moveend", () => void refreshList());
}
