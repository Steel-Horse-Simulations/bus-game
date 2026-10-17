// Route drawing (DESIGN.md §6, §11): the player clicks stops in order and
// the roads auto-route between them, drawn over the road at 75% opacity
// with chevrons while building. Supersedes route-check.ts's hardcoded
// proof-of-concept — this is the real tool it was standing in for.
//
// Scope of this increment: click-to-draw, waypoints, live rendering, and
// saving the result as a numbered Route owned by a depot group, with its
// direction (DESIGN.md §6) computed from that depot group's manually-
// assigned main bus station, and an optional terminus loop (one interior
// stop flagged to end the outbound leg early — DESIGN.md §6 "Start and
// terminus stops"). Variations, express flags, activation state and
// timetables are all later increments.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { Router, decode_settlements } from "./wasm/game_wasm.js";
import { findFallbackSettlement, type DecodedSettlement } from "./settlement-fallback.mts";
import { stopsPanelState, busStationsState } from "./stops-layer";
import { computeRouteOrientation, validateStartTerminus, type LonLat } from "./route-orientation";
import { createDropdown, type Dropdown } from "./dropdown";
import { startTerminusColour } from "./start-terminus-colours";
import {
  composeVariation,
  resolveRoutePoints,
  findDependentRouteIds,
  type DiversionSource,
  type CombinePoint,
} from "./route-combine-variations.mts";

// Shared with stops-layer.ts: while drawing, a click on a stop or station
// builds the route instead of opening its usual assignment popup. A plain
// mutable object rather than an event emitter — there's only ever one
// reader and it only needs the current value at click time.
export const routeDrawState = { isDrawing: false };

// A route is a sequence of points: real stops (named, poppable, listed) and
// waypoints (DESIGN.md §6: "force a specific path where the router picks
// something silly") — a plain forced pass-through point with no identity of
// its own. Routing treats every consecutive pair the same regardless of
// kind; only the stop list and the map markers tell them apart.
interface DraftStopPoint {
  kind: "stop";
  osmId: number;
  lon: number;
  lat: number;
}
interface DraftWaypoint {
  kind: "waypoint";
  lon: number;
  lat: number;
}
type DraftPoint = DraftStopPoint | DraftWaypoint;

const emptyFeatureCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function lineSource(coordinates: [number, number][]): GeoJSON.FeatureCollection {
  if (coordinates.length < 2) return emptyFeatureCollection;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
  };
}

// Each new route gets a colour distinct from the last, rather than every one
// defaulting to the same blue (a live user request, 2026-10-17 — the routes
// list had accumulated many routes all sharing the one default swatch).
// Picked by index (how many routes already exist) around the hue wheel at
// the golden angle (137.508°) — the standard technique for a sequence of
// colours that stays well-separated for a very long run before two picks
// ever land close together, with no need to check existing routes' own
// colours for a collision at all.
const GOLDEN_ANGLE_DEG = 137.508;
function hueToHex(hueDeg: number, saturation: number, lightness: number): string {
  const h = ((hueDeg % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function nextRouteColour(existingRouteCount: number): string {
  return hueToHex(existingRouteCount * GOLDEN_ANGLE_DEG, 0.65, 0.5);
}

function pointsSource(points: DraftPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature",
      properties: { kind: p.kind, index: i },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
}

function stopLabel(osmId: number): string {
  return stopsPanelState.displayNameFor?.(osmId) ?? `Stop ${osmId}`;
}

function pointLabel(p: DraftPoint): string {
  return p.kind === "stop" ? stopLabel(p.osmId) : "a waypoint";
}

export interface RouteDrawController {
  // The panel's own DOM, sized to fill whatever slot the caller mounts it
  // in (DESIGN.md §11: "same width and position the route list normally
  // occupies") — this module no longer positions or shows/hides itself.
  el: HTMLElement;
  // Begins a fresh drawing session (does not clear a previous unfinished
  // *new* one — re-entering drawing mode picks up where it left off, same
  // as the old toggle button re-opening did — but does clear a previous
  // *edit*, since resuming "new route" mode with another route's points
  // still loaded would be confusing).
  startDrawing(): void;
  // Loads an existing saved route's points, terminus/start flags, number
  // and depot group back into the draft state for editing. Saving while in
  // this mode updates the route in place (and clears its own timetables,
  // db.mts's updateRoute) rather than creating a duplicate.
  startEditing(route: Route): Promise<void>;
  // Loads `parent`'s points as a starting draft for a new lettered
  // variation (DESIGN.md §6 "Variations" — "the player chooses the last
  // shared stop, draws the divergent section... then chooses the first
  // shared stop where it rejoins"). Unlike startEditing, saving always
  // creates a new route (parentRouteId set to parent.id) rather than
  // updating the parent.
  startVariation(parent: Route): void;
}

export async function mountRouteDrawTool(
  map: maplibregl.Map,
  router: Router,
  onFinish: () => void,
): Promise<RouteDrawController> {
  // Fetched once — settlements don't change while the map's open, and
  // there's no per-stop editing UI for them the way stops have.
  const settlementsRes = await fetch("http://127.0.0.1:38271/settlements.bin");
  const settlementsBytes = new Uint8Array(await settlementsRes.arrayBuffer());
  const settlements = decode_settlements(settlementsBytes) as DecodedSettlement[];

  let draftPoints: DraftPoint[] = [];
  // Which other routes' own diversions the current draft was built from via
  // "Build from existing variations" (DESIGN.md §6 "Combining variations") —
  // empty for a route drawn entirely by hand. Cleared by any manual edit to
  // draftPoints after composing (addPoint, removing a point, cutting at a
  // rejoin), since a hand-edited draft is no longer a pure composition of
  // its sources and shouldn't silently claim to live-update from them —
  // decided (2026-10-10): combining variations should update automatically
  // when a reused diversion changes, which only makes sense while nothing
  // else has touched the result since.
  let draftComposedFromRouteIds: number[] = [];
  let routeCoords: [number, number][] = [];
  let warning: string | null = null;
  // `legEndIndices[i]` is the index into `routeCoords` where the leg from
  // `draftPoints[i]` to `draftPoints[i + 1]` ends (i.e. where `draftPoints[i
  // + 1]` itself lands) — kept so the hail-and-ride overlay (`refresh()`
  // below) can slice the route's own already-computed path between two
  // section endpoints, rather than routing a fresh, independent shortest
  // path between their raw coordinates. The latter was a real reported bug
  // (route 56, 2026-10-11 — "it takes the shortest route, it doesn't follow
  // the route"): a hail-and-ride section's two endpoints can be connected by
  // a shorter path than the one the main route actually takes between them
  // (forced via a waypoint or simply not the cheapest), so re-routing
  // between them independently drew a different line than the route the
  // overlay is meant to be highlighting a stretch of.
  let legEndIndices: number[] = [];
  // Set by clicking a stop in the list (not the map): the next map click(s)
  // insert after this position instead of appending at the end, and the
  // insertion point advances to each newly-inserted point in turn so a run
  // of clicks builds a contiguous inserted sequence. Indexes into
  // `draftPoints` directly (stops and waypoints share one sequence). Doubles
  // as "the currently selected stop" for the terminate/start-service button
  // below — the same click-to-arm action serves both purposes.
  let insertAfterIndex: number | null = null;
  // Start and terminus stops (DESIGN.md §6): the one additional interior
  // stop each the player can flag to end the outbound leg early / begin the
  // return leg, encoding a terminus loop. Both null means neither is set —
  // points[0]/last stay the only start/terminus. The two may be the same
  // stop (an early terminus with no real loop) — see validateStartTerminus.
  let terminusIndex: number | null = null;
  let startIndex: number | null = null;
  // Hail and ride (DESIGN.md §6): stretches between two nominated stops,
  // each stored as {fromIndex, toIndex} into draftPoints (always "stop"
  // points, never waypoints) — unlike terminus/start (one pair, nullable),
  // a route can have any number of these, so it's an array built up over
  // the editing session and persisted as-is on save. `hailRideArmedStart`
  // is the first-clicked stop of a section in progress (mirrors
  // `insertAfterIndex` doubling as "the armed point" for terminus/start,
  // but needs its own slot since a hail-and-ride section spans *two*
  // clicks, not one).
  let hailRideSections: RouteHailAndRideSection[] = [];
  let hailRideArmedStart: number | null = null;
  // Set by startEditing(), null for a genuinely new route — the save
  // handler branches on this to update the existing route rather than
  // creating a duplicate.
  let editingRouteId: number | null = null;
  // Set by startVariation(), null otherwise — the route this draft is a
  // lettered variation of (DESIGN.md §6). Never combined with
  // editingRouteId: a variation always creates a new route on save, even
  // though its starting draft is a copy of the parent's own points.
  let variationParentRoute: Route | null = null;
  // This parent's OTHER existing variations (DESIGN.md §6 "Combining
  // variations") — loaded alongside variationParentRoute by startVariation,
  // used only to offer "Build from existing variations" below. Never
  // includes the draft currently being built (it has no id yet).
  let parentSiblingRoutes: Route[] = [];

  const addLayers = () => {
    map.addSource("route-draft-line", { type: "geojson", data: emptyFeatureCollection });
    map.addSource("route-draft-points", { type: "geojson", data: emptyFeatureCollection });
    map.addSource("route-draft-hailride", { type: "geojson", data: emptyFeatureCollection });

    // Drawn over the road at ~75% opacity (DESIGN.md §11) — width is a
    // fixed zoom curve rather than matching each road's real width, since
    // the router hands back a bare coordinate trail, not per-segment road
    // class; close enough to read clearly while building.
    map.addLayer({
      id: "route-draft-line",
      type: "line",
      source: "route-draft-line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#3b82f6",
        "line-opacity": 0.75,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 8, 18, 14],
      },
    });
    // Stops are blue-filled; waypoints are amber and, if anything, slightly
    // bigger with a thick white ring — a waypoint has no name or popup to
    // fall back on to identify it, so it needs to win the eye against both
    // the blue route line and blue stop markers, not read as secondary.
    map.addLayer({
      id: "route-draft-points",
      type: "circle",
      source: "route-draft-points",
      paint: {
        "circle-radius": ["case", ["==", ["get", "kind"], "waypoint"], 7, 6],
        "circle-color": ["case", ["==", ["get", "kind"], "waypoint"], "#eab308", "#3b82f6"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["==", ["get", "kind"], "waypoint"], 3, 2],
      },
    });
    // Hail and ride stretches (DESIGN.md §6) drawn dashed, directly over the
    // solid route line, so the player can see at a glance which parts of
    // the route have no fixed stops. A separate overlay rather than
    // restyling route-draft-line itself, since only part of the line needs
    // the dashed treatment — sliced out of the route's own already-computed
    // path via `legEndIndices` (see refresh()), not re-routed independently.
    map.addLayer({
      id: "route-draft-hailride",
      type: "line",
      source: "route-draft-hailride",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#eab308",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 9, 18, 15],
        "line-dasharray": [1, 1.4],
      },
    });
  };

  // Called unconditionally, not gated on map.isStyleLoaded() — this is now
  // mounted from route-panel.ts, itself called after other layers (the
  // saved-route-preview one included) have already been added successfully,
  // proof the style has loaded at least once. isStyleLoaded() can still read
  // false at that point (it also reflects tiles still in flight elsewhere,
  // not just "never loaded"), and falling back to map.once("load", ...) in
  // that case waits for an event that already fired and will never fire
  // again — the exact bug found and fixed for route-panel.ts's own preview
  // layer (OPEN-ITEMS.md), which this module had the same latent copy of:
  // the drawn route/points/chevrons never appeared, with no error anywhere.
  addLayers();

  const refresh = () => {
    (map.getSource("route-draft-line") as maplibregl.GeoJSONSource | undefined)?.setData(
      lineSource(routeCoords),
    );
    (map.getSource("route-draft-points") as maplibregl.GeoJSONSource | undefined)?.setData(
      pointsSource(draftPoints),
    );
    // Slices the hail-and-ride stretch out of the route's own already-
    // computed `routeCoords`, via `legEndIndices`, rather than routing a
    // fresh independent path between the section's two endpoints — the
    // section must show the stretch the route *actually* takes, which can
    // differ from the cheapest path between those two raw coordinates (a
    // waypoint elsewhere in the route, or simply not the shortest way,
    // forces a different path — a real reported bug, route 56,
    // 2026-10-11: "it takes the shortest route, it doesn't follow the
    // route").
    const hailRideFeatures: GeoJSON.Feature[] = [];
    for (const section of hailRideSections) {
      const { fromIndex, toIndex } = section;
      if (fromIndex < 0 || toIndex > legEndIndices.length || fromIndex >= toIndex) continue;
      const startIdx = fromIndex === 0 ? 0 : legEndIndices[fromIndex - 1];
      const endIdx = legEndIndices[toIndex - 1];
      const coords = routeCoords.slice(startIdx, endIdx + 1);
      if (coords.length < 2) continue;
      hailRideFeatures.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
    }
    (map.getSource("route-draft-hailride") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: hailRideFeatures,
    });
  };

  // Routes one leg (previous point -> next point) and appends it to
  // routeCoords, or sets `warning` if no road route exists between them.
  // Shared by both the fast-path single append and a full rebuild after a
  // mid-list insertion. Stops and waypoints are routed identically — a
  // waypoint is just another point the path must pass through, so no
  // special-casing is needed here at all.
  const appendLeg = (prev: DraftPoint, next: DraftPoint) => {
    const leg = router.find_route(prev.lon, prev.lat, next.lon, next.lat);
    if (leg.length === 0) {
      warning = `No road route found between ${pointLabel(prev)} and ${pointLabel(next)} — that leg wasn't added.`;
      return;
    }
    const points: [number, number][] = [];
    for (let i = 0; i < leg.length; i += 2) points.push([leg[i], leg[i + 1]]);
    // Drop the leg's own first point — it duplicates the previous leg's
    // last point (both are the same point's snapped node).
    routeCoords.push(...points.slice(1));
    legEndIndices.push(routeCoords.length - 1);
  };

  // Recomputes the whole route from the current draftPoints order — used
  // after an insertion changes point order, since a fast single-leg append
  // no longer applies once earlier legs may also have shifted. Uses
  // `find_route_through` for the whole sequence in one call rather than
  // `appendLeg` once per leg: an interior point snapped independently as
  // one leg's own goal and the next leg's own start can resolve to
  // different positions a few metres apart at a one-way-constrained
  // junction (find_route_through's own doc comment — a real case found
  // live, route 57C's waypoint near Cearn Ròmasdail, 2026-10-11: the two
  // legs' endpoints didn't match, rendering as a visible kink/zigzag).
  // find_route_through snaps every interior point exactly once, shared by
  // both the leg arriving and the leg departing, which this bug class
  // can't occur under by construction.
  const rebuildRoute = () => {
    routeCoords = [];
    legEndIndices = [];
    warning = null;
    if (draftPoints.length === 0) return;
    if (draftPoints.length === 1) {
      const snapped = router.snap_to_road(draftPoints[0].lon, draftPoints[0].lat);
      routeCoords.push(snapped.length === 2 ? [snapped[0], snapped[1]] : [draftPoints[0].lon, draftPoints[0].lat]);
      return;
    }
    const flat: number[] = [];
    for (const p of draftPoints) flat.push(p.lon, p.lat);
    const path = router.find_route_through(new Float64Array(flat));
    if (path.length === 0) {
      warning = "No road route found through this sequence of stops.";
      const snapped = router.snap_to_road(draftPoints[0].lon, draftPoints[0].lat);
      routeCoords.push(snapped.length === 2 ? [snapped[0], snapped[1]] : [draftPoints[0].lon, draftPoints[0].lat]);
      return;
    }
    const points: [number, number][] = [];
    for (let i = 0; i < path.length; i += 2) points.push([path[i], path[i + 1]]);
    routeCoords = points;
    legEndIndices = Array.from(router.last_route_leg_end_point_indices());
  };

  const addPoint = (point: DraftPoint) => {
    const last = draftPoints[draftPoints.length - 1];
    // Ignore a repeat click on the same stop; waypoints have no identity to
    // dedupe against, so two close clicks just add two close waypoints.
    if (last && last.kind === "stop" && point.kind === "stop" && last.osmId === point.osmId) return;

    warning = null;
    draftComposedFromRouteIds = [];

    if (insertAfterIndex !== null) {
      const insertedAt = insertAfterIndex + 1;
      draftPoints.splice(insertedAt, 0, point);
      insertAfterIndex += 1;
      if (terminusIndex !== null && terminusIndex >= insertedAt) terminusIndex += 1;
      if (startIndex !== null && startIndex >= insertedAt) startIndex += 1;
      if (hailRideArmedStart !== null && hailRideArmedStart >= insertedAt) hailRideArmedStart += 1;
      hailRideSections = hailRideSections.map((s) => ({
        fromIndex: s.fromIndex >= insertedAt ? s.fromIndex + 1 : s.fromIndex,
        toIndex: s.toIndex >= insertedAt ? s.toIndex + 1 : s.toIndex,
      }));
      rebuildRoute();
    } else if (!last) {
      // Snap the very first point onto the road too, the same as every
      // later point already is via find_route — otherwise the first leg
      // visibly starts from the raw position instead of the road.
      const snapped = router.snap_to_road(point.lon, point.lat);
      routeCoords.push(snapped.length === 2 ? [snapped[0], snapped[1]] : [point.lon, point.lat]);
      draftPoints.push(point);
    } else {
      appendLeg(last, point);
      draftPoints.push(point);
    }
    refresh();
    renderStopList();
  };

  const clear = () => {
    draftPoints = [];
    draftComposedFromRouteIds = [];
    routeCoords = [];
    legEndIndices = [];
    warning = null;
    insertAfterIndex = null;
    terminusIndex = null;
    startIndex = null;
    hailRideSections = [];
    hailRideArmedStart = null;
    editingRouteId = null;
    variationParentRoute = null;
    parentSiblingRoutes = [];
    numberInput.value = "";
    nameInput.value = "";
    colourInput.value = DEFAULT_ROUTE_COLOUR;
    map.setPaintProperty("route-draft-line", "line-color", DEFAULT_ROUTE_COLOUR);
    saveStatusEl.hidden = true;
    updateHeader();
    refresh();
    renderStopList();
    renderVariationSection();
    // Upgrades the plain default above to a colour distinct from it, once
    // the real route count is known — kept as a separate async step after
    // the synchronous reset so clearing never has a visible colourless/
    // flashing moment while this resolves.
    void (async () => {
      const routes = await window.routes.list();
      const colour = nextRouteColour(routes.length);
      colourInput.value = colour;
      map.setPaintProperty("route-draft-line", "line-color", colour);
    })();
  };

  // No longer positions or shows/hides itself — the caller (route-panel.ts)
  // mounts `el` into its own persistent left-hand slot (DESIGN.md §11) and
  // controls when it's visible.
  const panel = document.createElement("div");
  panel.className = "panel panel-flush";
  panel.style.height = "100%";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Drawing route";
  panel.appendChild(header);

  const updateHeader = () => {
    header.textContent =
      variationParentRoute !== null
        ? `New variation of ${variationParentRoute.number}`
        : editingRouteId !== null
          ? "Editing route"
          : "Drawing route";
  };

  const body = document.createElement("div");
  body.className = "panel-section";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "8px";
  body.style.flex = "1 1 auto";
  body.style.minHeight = "0";
  body.style.overflowY = "auto";
  panel.appendChild(body);

  const status = document.createElement("div");
  status.style.color = "var(--text-secondary)";
  body.appendChild(status);

  const hint = document.createElement("div");
  hint.className = "label-muted";
  hint.textContent = "Click a stop to add it; click empty road to force the path through there.";
  body.appendChild(hint);

  const warningEl = document.createElement("div");
  warningEl.style.color = "var(--text-warning)";
  warningEl.style.fontSize = "11px";
  warningEl.hidden = true;
  body.appendChild(warningEl);

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "6px";
  const clearButton = document.createElement("button");
  clearButton.className = "btn";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", clear);
  const finishButton = document.createElement("button");
  finishButton.className = "btn";
  finishButton.textContent = "Finish";
  finishButton.addEventListener("click", () => {
    // Without this, the draft's own map layers (route-draft-line/-edges/
    // -points) keep showing whatever was last drawn — they're separate from
    // the saved-route-preview system entirely, so leaving them populated
    // left a permanent, un-hideable copy of the just-drawn/edited route on
    // the map (spotted when a just-created route wouldn't disappear on
    // "Hide" — that button only ever touched the saved-route-preview
    // sources, never these).
    clear();
    setDrawing(false);
    onFinish();
  });
  controls.appendChild(clearButton);
  controls.appendChild(finishButton);
  body.appendChild(controls);

  // Saving (DESIGN.md §6): a number, a depot group owner, and the direction
  // computed from that depot group's manually-assigned main bus station
  // (depot-groups-panel.ts). No settlement fallback exists yet, so a depot
  // group with no station set can't save a route.
  const saveSection = document.createElement("div");
  saveSection.style.display = "flex";
  saveSection.style.flexDirection = "column";
  saveSection.style.gap = "6px";
  saveSection.style.borderTop = "1px solid var(--border)";
  saveSection.style.paddingTop = "8px";

  const numberRow = document.createElement("div");
  numberRow.style.display = "flex";
  numberRow.style.gap = "6px";

  const numberInput = document.createElement("input");
  numberInput.type = "text";
  numberInput.className = "field";
  numberInput.placeholder = "Route number (e.g. 7, 7A, X7)";
  numberInput.style.flex = "1";

  // The route's own colour (DESIGN.md §11), ahead of the livery system —
  // drives both the draft line while drawing and the saved route's line/
  // swatch everywhere else (route-panel.ts). Defaults to the same blue the
  // draft line always used before this existed.
  const DEFAULT_ROUTE_COLOUR = "#3b82f6";
  const colourInput = document.createElement("input");
  colourInput.type = "color";
  colourInput.value = DEFAULT_ROUTE_COLOUR;
  colourInput.title = "Route colour";
  colourInput.style.width = "40px";
  colourInput.style.padding = "0";
  colourInput.addEventListener("input", () => {
    map.setPaintProperty("route-draft-line", "line-color", colourInput.value);
  });

  numberRow.appendChild(numberInput);
  numberRow.appendChild(colourInput);

  // The EyeDropper API (not yet in TypeScript's bundled DOM lib) samples a
  // pixel from anywhere on screen, not just this window — including a
  // second monitor — unlike the plain colour input's own swatch grid, which
  // is confined to the app window.
  if ("EyeDropper" in window) {
    const eyedropperButton = document.createElement("button");
    eyedropperButton.type = "button";
    eyedropperButton.className = "btn btn-icon";
    eyedropperButton.textContent = "🎨";
    eyedropperButton.title = "Pick a colour from anywhere on screen";
    eyedropperButton.addEventListener("click", async () => {
      const eyeDropper: { open(): Promise<{ sRGBHex: string }> } = new (
        window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }
      ).EyeDropper();
      try {
        const result = await eyeDropper.open();
        colourInput.value = result.sRGBHex;
        map.setPaintProperty("route-draft-line", "line-color", colourInput.value);
      } catch {
        // Cancelled (Escape or click-away) — nothing to do.
      }
    });
    numberRow.appendChild(eyedropperButton);
  }

  // An optional player-set name (DESIGN.md §11), shown instead of the list's
  // derived-from-last-stop destination fallback (route-panel.ts) until the
  // real destination display (built from variations/extensions, §6/§7)
  // exists. Left blank, a route is still identified by number and derived
  // destination exactly as before this existed.
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "field";
  nameInput.placeholder = "Route name (optional, e.g. Airport Express)";

  const depotGroupContainer = document.createElement("div");

  let depotGroups: DepotGroup[] = [];
  let selectedDepotGroupId: number | null = null;

  const refreshDepotGroupOptions = async () => {
    depotGroups = await window.depotGroups.list();
    if (selectedDepotGroupId === null || !depotGroups.some((g) => g.id === selectedDepotGroupId)) {
      selectedDepotGroupId = depotGroups[0]?.id ?? null;
    }
    depotGroupContainer.innerHTML = "";
    if (depotGroups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "label-muted";
      empty.textContent = "No depot groups yet — create one first (top right).";
      depotGroupContainer.appendChild(empty);
      return;
    }
    const selected = depotGroups.find((g) => g.id === selectedDepotGroupId) ?? depotGroups[0];
    const dropdown = createDropdown(
      depotGroups.map((g) => g.name),
      selected.name,
      (value) => {
        selectedDepotGroupId = depotGroups.find((g) => g.name === value)?.id ?? null;
      },
    );
    depotGroupContainer.appendChild(dropdown.el);
  };

  const saveButton = document.createElement("button");
  saveButton.className = "btn";
  saveButton.textContent = "Save route";

  const saveStatusEl = document.createElement("div");
  saveStatusEl.style.fontSize = "11px";
  saveStatusEl.hidden = true;

  saveButton.addEventListener("click", async () => {
    saveStatusEl.hidden = false;
    saveStatusEl.style.color = "var(--text-warning)";

    // Depot groups were last fetched when this panel was opened — if the
    // player set a main bus station in the other panel without closing and
    // reopening this one, `depotGroups` here is stale and still shows the
    // old (no station) state. Refetch right before checking so a save
    // always sees what's actually saved, not what was true when this panel
    // last opened.
    await refreshDepotGroupOptions();

    const number = numberInput.value.trim();
    if (!number) {
      saveStatusEl.textContent = "Enter a route number first.";
      return;
    }
    const name = nameInput.value.trim() || null;
    if (draftPoints.length < 2) {
      saveStatusEl.textContent = "Draw at least two points first.";
      return;
    }
    const group = depotGroups.find((g) => g.id === selectedDepotGroupId);
    if (!group) {
      saveStatusEl.textContent = "Choose a depot group first.";
      return;
    }
    const coords: LonLat[] = draftPoints.map((p) => [p.lon, p.lat]);

    // The direction rule's own reference point (DESIGN.md §6): the depot
    // group's main bus station if it has one, otherwise the largest
    // settlement near this route — see findFallbackSettlement's own
    // comment for why "near this route" stands in for "in the depot
    // group" until depot groups have a real stored location (Phase 3).
    let referencePoint: LonLat;
    let usedFallbackSettlement: DecodedSettlement | null = null;
    if (group.mainBusStationOsmId !== null) {
      const station = busStationsState.find((s) => s.osmId === group.mainBusStationOsmId);
      if (!station) {
        saveStatusEl.textContent = `"${group.name}"'s main bus station couldn't be found in the loaded stop data.`;
        return;
      }
      referencePoint = [station.lon, station.lat];
    } else {
      const routeCentroid: LonLat = [
        coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
        coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
      ];
      const fallback = findFallbackSettlement(routeCentroid, settlements);
      if (!fallback) {
        saveStatusEl.textContent =
          `"${group.name}" has no main bus station set, and no settlement data was found nearby either — ` +
          `pick a main bus station in the Depot groups panel first.`;
        return;
      }
      usedFallbackSettlement = fallback;
      referencePoint = [fallback.lon, fallback.lat];
    }

    const startTerminusError = validateStartTerminus(draftPoints, terminusIndex, startIndex);
    if (startTerminusError) {
      saveStatusEl.textContent = startTerminusError;
      return;
    }

    const outboundEndIndex = terminusIndex ?? draftPoints.length - 1;
    const orientation = computeRouteOrientation(coords, referencePoint, outboundEndIndex);
    const savedPoints: RoutePoint[] = draftPoints.map((p) =>
      p.kind === "stop"
        ? { kind: "stop", osmId: p.osmId, lon: p.lon, lat: p.lat }
        : { kind: "waypoint", lon: p.lon, lat: p.lat },
    );
    // Carries across a re-save of the same in-progress variation too (the
    // "second Save updates instead of duplicating" path below), not just
    // its first save — the variation relationship shouldn't disappear just
    // because editingRouteId got set after the first save.
    const parentRouteId = variationParentRoute?.id ?? null;
    const variationLetter = variationParentRoute ? variationLetterInput.value.trim() || null : null;
    const directionNote = usedFallbackSettlement
      ? ` — no bus station set, direction used the nearest settlement instead (${usedFallbackSettlement.name ?? "unnamed"})`
      : "";

    let savedRouteId: number;
    if (editingRouteId !== null) {
      // Updates in place (and clears the route's own timetables — db.mts's
      // updateRoute — since they're indexed against the point list this
      // edit may have just changed).
      await window.routes.update(
        editingRouteId,
        group.id,
        number,
        savedPoints,
        orientation,
        terminusIndex,
        startIndex,
        colourInput.value,
        name,
        parentRouteId,
        variationLetter,
        draftComposedFromRouteIds,
        hailRideSections,
      );
      savedRouteId = editingRouteId;
      saveStatusEl.style.color = "var(--text-secondary)";
      saveStatusEl.textContent = `Updated route ${number} in "${group.name}" (drawn direction is ${orientation})${directionNote}.`;
    } else {
      const created = await window.routes.create(
        group.id,
        number,
        savedPoints,
        orientation,
        terminusIndex,
        startIndex,
        colourInput.value,
        name,
        parentRouteId,
        variationLetter,
        draftComposedFromRouteIds,
        hailRideSections,
      );
      savedRouteId = created.id;
      // A second Save click without leaving drawing mode now updates this
      // same route instead of creating a duplicate with the same number.
      editingRouteId = created.id;
      updateHeader();
      saveStatusEl.style.color = "var(--text-secondary)";
      saveStatusEl.textContent = `Saved route ${number} to "${group.name}" (drawn direction is ${orientation})${directionNote}.`;
    }

    // Combining variations (DESIGN.md §6): this save may have changed a
    // diversion other variations reuse, or (if this route IS a trunk) the
    // shared points a composed variation builds on — refresh every one of
    // them so they keep showing the live, current shape rather than going
    // stale until someone happens to reopen and resave them individually.
    // Transitive (see findDependentRouteIds): refreshing in dependency
    // order isn't needed since resolveRoutePoints recomputes from the
    // CURRENT allRoutes list fresh for every dependent, not from each
    // other's just-refreshed cache.
    const allRoutesAfterSave = await window.routes.list();
    const dependentIds = findDependentRouteIds(savedRouteId, allRoutesAfterSave);
    for (const depId of dependentIds) {
      const dep = allRoutesAfterSave.find((r) => r.id === depId);
      if (!dep) continue;
      const freshPoints = resolveRoutePoints(dep, allRoutesAfterSave) as readonly RoutePoint[];
      await window.routes.refreshComposedPoints(depId, [...freshPoints]);
    }
    stopsPanelState.refreshUsedByService?.();
  });

  saveSection.appendChild(numberRow);
  saveSection.appendChild(nameInput);
  saveSection.appendChild(depotGroupContainer);
  saveSection.appendChild(saveButton);
  saveSection.appendChild(saveStatusEl);
  body.appendChild(saveSection);

  // The list of every point picked so far, stops and waypoints alike. Click
  // a row to arm it as an insertion point (highlighted); the next map
  // click(s) land right after it instead of at the end. A stop's row has an
  // "Edit" button that jumps the camera there and opens its usual popup
  // (rename/hide live there — stops-layer.ts); a waypoint has no identity
  // to edit, just a small tag saying what it is. Every row gets a small "×"
  // to remove that point from the route.
  const pointList = document.createElement("div");
  pointList.className = "panel-section";
  pointList.style.overflowY = "auto";
  pointList.style.padding = "0";
  body.appendChild(pointList);

  // Variation controls (DESIGN.md §6 "Variations"), shown only while
  // variationParentRoute is set. "Diverge from here" cuts everything after
  // the currently-armed point (the same `insertAfterIndex` the point list
  // and the terminus button already share) — the player then draws the new
  // divergent section normally by clicking the map, which inserts right
  // after the armed point via the existing addPoint/insertAfterIndex
  // mechanism. "Rejoin at" lists the parent's own stops; picking one
  // appends that stop and everything after it from the parent's own list
  // onto wherever the draft currently ends, since "some variations just
  // end differently" rather than always rejoining.
  const variationSection = document.createElement("div");
  variationSection.style.display = "none";
  variationSection.style.flexDirection = "column";
  variationSection.style.gap = "6px";
  variationSection.style.borderTop = "1px solid var(--border)";
  variationSection.style.borderBottom = "1px solid var(--border)";
  variationSection.style.padding = "8px";
  body.appendChild(variationSection);

  // The variation letter itself (stored explicitly, not parsed off
  // "number" — see db.mts's own comment on why) — pre-filled with the next
  // unused letter among the parent's existing variations by startVariation,
  // editable here since the player may want a specific letter instead.
  const variationLetterRow = document.createElement("div");
  variationLetterRow.style.display = "flex";
  variationLetterRow.style.alignItems = "center";
  variationLetterRow.style.gap = "6px";
  const variationLetterLabel = document.createElement("span");
  variationLetterLabel.className = "label-muted";
  variationLetterLabel.textContent = "Variation letter:";
  const variationLetterInput = document.createElement("input");
  variationLetterInput.type = "text";
  variationLetterInput.className = "field";
  variationLetterInput.style.width = "50px";
  variationLetterInput.maxLength = 2;
  variationLetterRow.appendChild(variationLetterLabel);
  variationLetterRow.appendChild(variationLetterInput);

  const divergeButton = document.createElement("button");
  divergeButton.className = "btn";
  divergeButton.textContent = "Diverge from here";
  divergeButton.title = "Remove every point after the one currently selected in the list";
  divergeButton.addEventListener("click", () => {
    if (insertAfterIndex === null) return;
    const cutFrom = insertAfterIndex + 1;
    if (cutFrom >= draftPoints.length) return;
    draftPoints.splice(cutFrom);
    draftComposedFromRouteIds = [];
    if (terminusIndex !== null && terminusIndex >= cutFrom) terminusIndex = null;
    if (startIndex !== null && startIndex >= cutFrom) startIndex = null;
    rebuildRoute();
    refresh();
    renderStopList();
    updateStatus();
  });

  const rejoinHeading = document.createElement("div");
  rejoinHeading.className = "label-muted";
  rejoinHeading.textContent = "Rejoin the parent route at:";

  const rejoinList = document.createElement("div");
  rejoinList.style.display = "flex";
  rejoinList.style.flexDirection = "column";
  rejoinList.style.gap = "2px";
  rejoinList.style.maxHeight = "140px";
  rejoinList.style.overflowY = "auto";

  const rejoinAt = (parentPointIndex: number) => {
    if (!variationParentRoute) return;
    const toAppend = variationParentRoute.points.slice(parentPointIndex);
    if (toAppend.length === 0 || draftPoints.length === 0) return;
    insertAfterIndex = draftPoints.length - 1;
    for (const p of toAppend) {
      const point: DraftPoint =
        p.kind === "stop"
          ? { kind: "stop", osmId: p.osmId as number, lon: p.lon, lat: p.lat }
          : { kind: "waypoint", lon: p.lon, lat: p.lat };
      addPoint(point);
    }
    insertAfterIndex = null;
    updateStatus();
    renderStopList();
  };

  // "Build from existing variations" (DESIGN.md §6 "Combining variations")
  // — the user's own worked example: route 1C reuses 1A's and 1B's own
  // already-drawn diversions instead of redrawing them by hand. A one-shot
  // action (composeVariation splices every checked sibling's own diversion
  // onto the parent's trunk in one call) rather than an incremental step
  // threaded through "Diverge from here"/"Rejoin at" — much simpler and
  // safer than trying to match an already-in-progress draft's own position
  // back to the parent's own index space, and the tested algorithm's own
  // shape (multiple siblings in one call) fits this directly. The result
  // REPLACES the current draft outright; the existing manual diverge/
  // rejoin tools still work normally on top of it afterward for any
  // further tweaks (they already support being used more than once in one
  // session — nothing about them assumes a single split).
  const buildFromSiblingsHeading = document.createElement("div");
  buildFromSiblingsHeading.className = "label-muted";
  buildFromSiblingsHeading.textContent = "Build from existing variations:";
  const buildFromSiblingsList = document.createElement("div");
  buildFromSiblingsList.style.display = "flex";
  buildFromSiblingsList.style.flexDirection = "column";
  buildFromSiblingsList.style.gap = "2px";
  const buildFromSiblingsStatus = document.createElement("div");
  buildFromSiblingsStatus.style.fontSize = "11px";
  buildFromSiblingsStatus.style.color = "var(--text-muted)";
  const buildFromSiblingsButton = document.createElement("button");
  buildFromSiblingsButton.type = "button";
  buildFromSiblingsButton.className = "btn";
  buildFromSiblingsButton.textContent = "Apply";
  buildFromSiblingsButton.title = "Replaces the current draft with the parent's own trunk plus each checked sibling's own diversion";
  buildFromSiblingsButton.addEventListener("click", () => {
    if (!variationParentRoute) return;
    const checked = [...buildFromSiblingsList.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")];
    if (checked.length === 0) {
      buildFromSiblingsStatus.textContent = "Check at least one variation to reuse first.";
      return;
    }
    const checkedSiblings = checked.map((cb) => parentSiblingRoutes.find((r) => String(r.id) === cb.value)!);
    const sources: DiversionSource[] = checkedSiblings.map((sibling) => ({ siblingId: sibling.number, points: sibling.points }));
    try {
      const result = composeVariation(variationParentRoute.points, sources);
      draftPoints = result.points.map((p) =>
        p.kind === "stop" ? { kind: "stop", osmId: p.osmId as number, lon: p.lon, lat: p.lat } : { kind: "waypoint", lon: p.lon, lat: p.lat },
      );
      // Only siblings that actually contributed a real diversion count as a
      // live dependency — one that shared nothing with the trunk was a
      // no-op (see composeVariation's own doc comment), so there's nothing
      // to stay in sync with.
      draftComposedFromRouteIds = checkedSiblings
        .filter((s) => result.appliedSiblingIds.includes(s.number))
        .map((s) => s.id);
      insertAfterIndex = null;
      terminusIndex = null;
      startIndex = null;
      const missed = sources.filter((s) => !result.appliedSiblingIds.includes(s.siblingId));
      buildFromSiblingsStatus.textContent =
        missed.length === 0
          ? `Built from ${result.appliedSiblingIds.join(", ")}.`
          : `Built from ${result.appliedSiblingIds.join(", ") || "none"} — ${missed.map((m) => m.siblingId).join(", ")} shares no real diversion with the parent to reuse.`;
      rebuildRoute();
      refresh();
      renderStopList();
      updateStatus();
    } catch (e) {
      // An overlap between two checked siblings' own diversions — surfaced
      // to the player rather than silently picking one, since there's no
      // sensible way to splice both.
      buildFromSiblingsStatus.textContent = e instanceof Error ? e.message : String(e);
    }
  });

  function renderVariationSection(): void {
    if (!variationParentRoute) {
      variationSection.style.display = "none";
      return;
    }
    variationSection.style.display = "flex";
    variationSection.innerHTML = "";
    variationSection.appendChild(variationLetterRow);

    if (parentSiblingRoutes.length > 0) {
      buildFromSiblingsList.innerHTML = "";
      for (const sibling of parentSiblingRoutes) {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "6px";
        label.style.cursor = "pointer";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(sibling.id);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(sibling.number));
        buildFromSiblingsList.appendChild(label);
      }
      buildFromSiblingsStatus.textContent = "";
      variationSection.appendChild(buildFromSiblingsHeading);
      variationSection.appendChild(buildFromSiblingsList);
      variationSection.appendChild(buildFromSiblingsButton);
      variationSection.appendChild(buildFromSiblingsStatus);
    }

    variationSection.appendChild(divergeButton);
    variationSection.appendChild(rejoinHeading);
    rejoinList.innerHTML = "";
    const parentStops = variationParentRoute.points
      .map((p, i) => ({ p, i }))
      .filter((x): x is { p: DraftStopPoint; i: number } => x.p.kind === "stop");
    if (parentStops.length === 0) {
      const none = document.createElement("div");
      none.className = "label-muted";
      none.textContent = "The parent route has no stops to rejoin at.";
      rejoinList.appendChild(none);
    } else {
      for (const { p, i } of parentStops) {
        const btn = document.createElement("button");
        btn.className = "btn btn-icon";
        btn.style.textAlign = "left";
        btn.textContent = stopLabel(p.osmId);
        btn.addEventListener("click", () => rejoinAt(i));
        rejoinList.appendChild(btn);
      }
    }
    variationSection.appendChild(rejoinList);
  }

  // The single button for start/terminus stops (DESIGN.md §6), at the
  // bottom of the point list rather than a per-row action — it acts on
  // whichever stop is currently selected (the same click-to-arm selection
  // `insertAfterIndex` already provides). Labelled "Terminate service" until
  // a terminus is set, then "Start service" for the return leg's start (the
  // same stop is allowed for both — an early terminus with no real loop),
  // then a way to clear both and redo once both are set.
  const terminateButton = document.createElement("button");
  terminateButton.className = "btn";
  terminateButton.style.width = "100%";
  body.appendChild(terminateButton);

  const updateTerminateButton = () => {
    if (terminusIndex !== null && startIndex !== null) {
      terminateButton.textContent = "Loop set — clear";
      terminateButton.disabled = false;
      return;
    }
    const selected = insertAfterIndex !== null ? draftPoints[insertAfterIndex] : null;
    terminateButton.textContent = terminusIndex === null ? "Terminate service" : "Start service";
    const isLastPoint = insertAfterIndex === draftPoints.length - 1;
    terminateButton.disabled =
      selected === null || selected.kind !== "stop" || (terminusIndex === null && isLastPoint);
  };

  const handleTerminateOrStartClick = () => {
    if (terminusIndex !== null && startIndex !== null) {
      terminusIndex = null;
      startIndex = null;
      renderStopList();
      updateStatus();
      return;
    }
    if (insertAfterIndex === null) return;
    if (terminusIndex === null) {
      // The route's own last point is already the default terminus with no
      // flag needed (DESIGN.md §6) — flagging it here would be meaningless
      // (there's no dead-running/return leg after it to encode) and would
      // only force a redundant "Start service" click on the same point. A
      // real terminus loop needs a genuine interior point, with real
      // material after it representing the return leg.
      if (insertAfterIndex === draftPoints.length - 1) {
        warning = "The last stop is already the route's terminus — no need to flag it.";
        updateStatus();
        return;
      }
      const error = validateStartTerminus(draftPoints, insertAfterIndex, insertAfterIndex);
      if (error) {
        warning = error;
        updateStatus();
        return;
      }
      terminusIndex = insertAfterIndex;
    } else {
      const error = validateStartTerminus(draftPoints, terminusIndex, insertAfterIndex);
      if (error) {
        warning = error;
        updateStatus();
        return;
      }
      startIndex = insertAfterIndex;
    }
    renderStopList();
    updateStatus();
  };
  terminateButton.addEventListener("click", handleTerminateOrStartClick);

  // Hail and ride (DESIGN.md §6): "click start stop, then end stop" — the
  // user's own explicit choice of interaction, mirroring the
  // terminus/start button above exactly (acts on whichever stop is
  // currently armed via `insertAfterIndex`), except a route can have any
  // number of these sections, so each completed pair is pushed onto
  // `hailRideSections` and the button resets to "start" rather than
  // locking after one.
  const hailRideButton = document.createElement("button");
  hailRideButton.className = "btn";
  hailRideButton.style.width = "100%";
  body.appendChild(hailRideButton);

  const updateHailRideButton = () => {
    const selected = insertAfterIndex !== null ? draftPoints[insertAfterIndex] : null;
    if (hailRideArmedStart === null) {
      hailRideButton.textContent = "Mark hail and ride start";
      hailRideButton.disabled = selected === null || selected.kind !== "stop";
    } else {
      hailRideButton.textContent = "Mark hail and ride end";
      hailRideButton.disabled =
        selected === null || selected.kind !== "stop" || insertAfterIndex === hailRideArmedStart;
    }
  };

  const handleHailRideClick = () => {
    if (insertAfterIndex === null) return;
    if (hailRideArmedStart === null) {
      hailRideArmedStart = insertAfterIndex;
    } else {
      const fromIndex = Math.min(hailRideArmedStart, insertAfterIndex);
      const toIndex = Math.max(hailRideArmedStart, insertAfterIndex);
      const overlaps = hailRideSections.some((s) => fromIndex <= s.toIndex && toIndex >= s.fromIndex);
      if (overlaps) {
        warning = "That stretch overlaps a hail and ride section that's already marked.";
        hailRideArmedStart = null;
        updateStatus();
        renderStopList();
        return;
      }
      hailRideSections.push({ fromIndex, toIndex });
      hailRideArmedStart = null;
      refresh();
    }
    renderStopList();
    updateStatus();
  };
  hailRideButton.addEventListener("click", handleHailRideClick);

  const removeHailRideSection = (section: RouteHailAndRideSection) => {
    hailRideSections = hailRideSections.filter((s) => s !== section);
    refresh();
    renderStopList();
  };

  const removePoint = (index: number) => {
    draftPoints.splice(index, 1);
    draftComposedFromRouteIds = [];
    if (insertAfterIndex !== null) {
      if (insertAfterIndex === index) insertAfterIndex = null;
      else if (insertAfterIndex > index) insertAfterIndex -= 1;
    }
    if (terminusIndex !== null) {
      if (terminusIndex === index) terminusIndex = null;
      else if (terminusIndex > index) terminusIndex -= 1;
    }
    if (startIndex !== null) {
      if (startIndex === index) startIndex = null;
      else if (startIndex > index) startIndex -= 1;
    }
    if (hailRideArmedStart !== null) {
      if (hailRideArmedStart === index) hailRideArmedStart = null;
      else if (hailRideArmedStart > index) hailRideArmedStart -= 1;
    }
    hailRideSections = hailRideSections
      .filter((s) => s.fromIndex !== index && s.toIndex !== index)
      .map((s) => ({
        fromIndex: s.fromIndex > index ? s.fromIndex - 1 : s.fromIndex,
        toIndex: s.toIndex > index ? s.toIndex - 1 : s.toIndex,
      }));
    rebuildRoute();
    refresh();
    renderStopList();
    updateStatus();
  };

  // Arms/disarms a point (stop or waypoint) as the insertion point, shared
  // by clicking its list row and clicking its marker directly on the map.
  const toggleInsertAt = (index: number) => {
    insertAfterIndex = insertAfterIndex === index ? null : index;
    renderStopList();
    updateStatus();
  };

  // A sub-line under a stop's row, connected with └ to show it belongs to
  // that stop rather than being its own point in the sequence — used for
  // the terminus/start-of-return indicators. A stop flagged as both gets
  // two of these, one each, rather than a single combined line.
  function appendSubLine(label: string): void {
    const subLine = document.createElement("div");
    subLine.style.padding = "2px 8px 6px 24px";
    subLine.style.fontSize = "11px";
    subLine.style.color = "var(--text-accent)";
    subLine.style.borderBottom = "1px solid var(--border)";
    subLine.textContent = `└ ${label}`;
    pointList.appendChild(subLine);
  }

  // Same shape as appendSubLine, plus a small remove control — unlike
  // terminus/start (cleared via the single button above once both are
  // set), a hail-and-ride section needs to be removable individually,
  // since a route can have several.
  function appendHailRideSubLine(label: string, section: RouteHailAndRideSection): void {
    const subLine = document.createElement("div");
    subLine.style.padding = "2px 8px 6px 24px";
    subLine.style.fontSize = "11px";
    subLine.style.color = "var(--text-accent)";
    subLine.style.borderBottom = "1px solid var(--border)";
    subLine.style.display = "flex";
    subLine.style.alignItems = "center";
    subLine.style.justifyContent = "space-between";
    const text = document.createElement("span");
    text.textContent = `└ ${label}`;
    subLine.appendChild(text);
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-icon";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove hail and ride section";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeHailRideSection(section);
    });
    subLine.appendChild(removeBtn);
    pointList.appendChild(subLine);
  }

  function renderStopList(): void {
    pointList.innerHTML = "";
    let stopNumber = 0;

    // Read-only defaults (DESIGN.md §6) — points[0]/points[last] are the
    // start/terminus whenever startIndex/terminusIndex aren't explicitly
    // set, same fallback route-panel.ts's locked stop list uses.
    const startIdx = startIndex ?? 0;
    const terminusIdx = terminusIndex ?? draftPoints.length - 1;

    for (let i = 0; i < draftPoints.length; i++) {
      const point = draftPoints[i];
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "6px 8px";
      row.style.borderBottom = "1px solid var(--border)";
      row.style.cursor = "pointer";
      if (i === insertAfterIndex) {
        row.style.background = "var(--bg-accent)";
      }

      const nameText = document.createElement("div");
      nameText.style.flex = "1";
      nameText.style.overflow = "hidden";
      nameText.style.textOverflow = "ellipsis";
      nameText.style.whiteSpace = "nowrap";
      if (point.kind === "stop") {
        stopNumber += 1;
        nameText.textContent = `${stopNumber}. ${stopLabel(point.osmId)}`;
        const colour = startTerminusColour(
          i === startIdx || i === 0,
          i === terminusIdx || i === draftPoints.length - 1,
        );
        if (colour) nameText.style.color = colour;
      } else {
        nameText.textContent = "Waypoint";
        nameText.style.color = "var(--text-muted)";
        nameText.style.fontStyle = "italic";
      }
      // The row is narrow enough that a long stop name can get cut off by
      // the ellipsis — the full text is still reachable on hover.
      nameText.title = nameText.textContent;
      if (i === insertAfterIndex) nameText.style.color = "var(--text-accent)";
      row.appendChild(nameText);

      if (point.kind === "stop") {
        const stop = point;
        const editButton = document.createElement("button");
        editButton.className = "btn btn-icon";
        editButton.textContent = "Edit";
        editButton.title = "Jump to this stop and open it";
        editButton.addEventListener("click", (e) => {
          e.stopPropagation();
          map.flyTo({ center: [stop.lon, stop.lat], zoom: Math.max(map.getZoom(), 16) });
          stopsPanelState.openPopupFor?.(stop.osmId);
        });
        row.appendChild(editButton);
      }

      const removeButton = document.createElement("button");
      removeButton.className = "btn btn-icon btn-danger";
      removeButton.textContent = "×";
      removeButton.title = point.kind === "stop" ? "Remove this stop from the route" : "Remove this waypoint";
      removeButton.addEventListener("click", (e) => {
        e.stopPropagation();
        removePoint(i);
      });
      row.appendChild(removeButton);

      row.addEventListener("click", () => toggleInsertAt(i));

      pointList.appendChild(row);

      if (point.kind === "stop") {
        if (i === terminusIndex) appendSubLine("Terminus — service ends here");
        if (i === startIndex) appendSubLine("Start — return begins here");
        for (const section of hailRideSections) {
          if (i === section.fromIndex) appendHailRideSubLine("Hail and ride starts here", section);
          if (i === section.toIndex) appendHailRideSubLine("Hail and ride ends here", section);
        }
      }
      if (hailRideArmedStart === i) {
        appendSubLine("Click the end stop, then “Mark hail and ride end”");
      }
    }
    const last = pointList.lastElementChild as HTMLElement | null;
    if (last) last.style.borderBottom = "none";
    updateTerminateButton();
    updateHailRideButton();
  }

  const updateStatus = () => {
    const stopCount = draftPoints.filter((p) => p.kind === "stop").length;
    const waypointCount = draftPoints.length - stopCount;
    const countText =
      stopCount === 0
        ? "Click stops on the map in order."
        : `${stopCount} stop${stopCount === 1 ? "" : "s"}` +
          (waypointCount > 0 ? `, ${waypointCount} waypoint${waypointCount === 1 ? "" : "s"}` : "") +
          " so far.";
    status.textContent =
      insertAfterIndex !== null
        ? `Inserting after "${pointLabel(draftPoints[insertAfterIndex])}" — click it again to stop.`
        : countText;
    warningEl.hidden = warning === null;
    warningEl.textContent = warning ?? "";
  };

  const setDrawing = (drawing: boolean) => {
    routeDrawState.isDrawing = drawing;
    if (!drawing) insertAfterIndex = null;
    if (drawing) void refreshDepotGroupOptions();
    updateHeader();
    updateStatus();
    renderStopList();
  };

  // One general click handler rather than one per stop layer:
  //  1. a click on an *existing* point already in the route (stop or
  //     waypoint) is a repeat visit — DESIGN.md §6 there-and-back routes and
  //     terminus loops can revisit the same physical stop, so a map click
  //     always adds, never arms an insertion point. Arming only happens by
  //     clicking the stop's row in the list (see `toggleInsertAt` below);
  //  2. otherwise a click on a stop/station adds it as a named stop;
  //  3. otherwise, empty road, adds a waypoint snapped onto the road at
  //     that point (not the raw click position — a waypoint has no real
  //     position of its own to fall back on the way a stop does).
  // `stopLayers` is queried manually (not via `map.on("click", layerId,
  // ...)`, which only fires for a hit) so a miss can fall through to the
  // next case.
  const stopLayers = [
    "stops-points",
    "stops-stations",
    "station-stands-points",
    "stop-groups-points",
    "group-members-points",
  ];
  map.on("click", (e) => {
    if (!routeDrawState.isDrawing) return;

    const feature = map.queryRenderedFeatures(e.point, { layers: stopLayers })[0];
    if (feature) {
      const osmId = feature.properties?.osmId as number;
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      addPoint({ kind: "stop", osmId, lon: coords[0], lat: coords[1] });
    } else {
      const snapped = router.snap_to_road(e.lngLat.lng, e.lngLat.lat);
      const [lon, lat] = snapped.length === 2 ? snapped : [e.lngLat.lng, e.lngLat.lat];
      addPoint({ kind: "waypoint", lon, lat });
    }
    updateStatus();
  });

  (window as unknown as { __routeDraw: unknown }).__routeDraw = {
    get draftPoints() {
      return draftPoints;
    },
    get routeCoords() {
      return routeCoords;
    },
    get isDrawing() {
      return routeDrawState.isDrawing;
    },
    get warning() {
      return warning;
    },
    get insertAfterIndex() {
      return insertAfterIndex;
    },
    get terminusIndex() {
      return terminusIndex;
    },
    get startIndex() {
      return startIndex;
    },
  };

  return {
    el: panel,
    startDrawing: () => {
      // A previous session left an *edit* or *variation* in progress, or
      // there's nothing drawn yet at all (e.g. the very first "+ New
      // route" after boot) — either way there's a genuinely new route
      // about to start, which should get its own distinct colour
      // (clear()'s own async upgrade) rather than carrying over stale
      // points or just sitting on whatever colour the box last showed.
      // A draft already in progress (draftPoints non-empty) is left
      // alone, unaffected — re-entering drawing mode picks up where it
      // left off, same as before.
      if (editingRouteId !== null || variationParentRoute !== null || draftPoints.length === 0) clear();
      setDrawing(true);
    },
    startEditing: async (route: Route) => {
      // Resolved fresh rather than trusting route.points directly — if this
      // route is composed (composedFromRouteIds non-empty), its own stored
      // points are only a cache, and the cascade-refresh-on-save below is
      // the normal way that cache stays current, not a guarantee against
      // every possible staleness. Editing it should always start from the
      // true current shape.
      const allRoutes = await window.routes.list();
      const livePoints = resolveRoutePoints(route, allRoutes) as readonly RoutePoint[];
      draftPoints = livePoints.map((p): DraftPoint =>
        p.kind === "stop"
          ? { kind: "stop", osmId: p.osmId as number, lon: p.lon, lat: p.lat }
          : { kind: "waypoint", lon: p.lon, lat: p.lat },
      );
      draftComposedFromRouteIds = [...route.composedFromRouteIds];
      terminusIndex = route.terminusIndex;
      startIndex = route.startIndex;
      hailRideSections = route.hailAndRideSections.map((s) => ({ ...s }));
      hailRideArmedStart = null;
      editingRouteId = route.id;
      variationParentRoute = null;
      parentSiblingRoutes = [];
      insertAfterIndex = null;
      warning = null;
      numberInput.value = route.number;
      nameInput.value = route.name ?? "";
      colourInput.value = route.colour;
      map.setPaintProperty("route-draft-line", "line-color", route.colour);
      selectedDepotGroupId = route.depotGroupId;
      rebuildRoute();
      refresh();
      renderVariationSection();
      setDrawing(true);
    },
    startVariation: (parent: Route) => {
      draftPoints = parent.points.map((p): DraftPoint =>
        p.kind === "stop"
          ? { kind: "stop", osmId: p.osmId as number, lon: p.lon, lat: p.lat }
          : { kind: "waypoint", lon: p.lon, lat: p.lat },
      );
      terminusIndex = parent.terminusIndex;
      startIndex = parent.startIndex;
      hailRideSections = parent.hailAndRideSections.map((s) => ({ ...s }));
      hailRideArmedStart = null;
      editingRouteId = null;
      variationParentRoute = parent;
      draftComposedFromRouteIds = [];
      insertAfterIndex = null;
      warning = null;
      nameInput.value = "";
      colourInput.value = parent.colour;
      map.setPaintProperty("route-draft-line", "line-color", parent.colour);
      selectedDepotGroupId = parent.depotGroupId;
      // The next unused letter among this parent's existing variations
      // (A, B, C...) — a starting suggestion the player can override in
      // either the number field or the letter field, independently.
      numberInput.value = parent.number;
      variationLetterInput.value = "";
      void (async () => {
        const siblings = await window.routes.list();
        const existingVariations = siblings.filter((r) => r.parentRouteId === parent.id && r.variationLetter);
        const usedLetters = new Set(existingVariations.map((r) => r.variationLetter));
        let letter = "A";
        for (let code = 65; code <= 90; code++) {
          const candidate = String.fromCharCode(code);
          if (!usedLetters.has(candidate)) {
            letter = candidate;
            break;
          }
        }
        numberInput.value = `${parent.number}${letter}`;
        variationLetterInput.value = letter;
        parentSiblingRoutes = existingVariations;
        renderVariationSection();
      })();
      rebuildRoute();
      refresh();
      renderVariationSection();
      setDrawing(true);
    },
  };
}
