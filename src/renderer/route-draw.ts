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
import { Router } from "./wasm/game_wasm.js";
import { stopsPanelState, busStationsState } from "./stops-layer";
import { computeRouteOrientation, validateStartTerminus, type LonLat } from "./route-orientation";
import { createDropdown, type Dropdown } from "./dropdown";

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

// One traversed edge's own stretch of the route, kept separate from the
// single merged line so the chevron layer can be told, per edge, whether
// that edge is used more than once across the whole route (DESIGN.md §11:
// chevrons mark one-directional running — a there-and-back stretch serves
// both directions over the same road and shouldn't get them).
interface EdgeChunk {
  edgeId: number;
  coords: [number, number][];
}

const emptyFeatureCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function lineSource(coordinates: [number, number][]): GeoJSON.FeatureCollection {
  if (coordinates.length < 2) return emptyFeatureCollection;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
  };
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

function edgeChunksSource(chunks: EdgeChunk[], useCount: Map<number, number>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: chunks
      .filter((c) => c.coords.length >= 2)
      .map((c) => ({
        type: "Feature",
        properties: { bothDirections: (useCount.get(c.edgeId) ?? 0) >= 2 },
        geometry: { type: "LineString", coordinates: c.coords },
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
  startEditing(route: Route): void;
}

export async function mountRouteDrawTool(
  map: maplibregl.Map,
  router: Router,
  onFinish: () => void,
): Promise<RouteDrawController> {
  let draftPoints: DraftPoint[] = [];
  let routeCoords: [number, number][] = [];
  let edgeChunks: EdgeChunk[] = [];
  let edgeUseCount = new Map<number, number>();
  let warning: string | null = null;
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
  // Set by startEditing(), null for a genuinely new route — the save
  // handler branches on this to update the existing route rather than
  // creating a duplicate.
  let editingRouteId: number | null = null;

  const addLayers = () => {
    map.addSource("route-draft-line", { type: "geojson", data: emptyFeatureCollection });
    map.addSource("route-draft-edges", { type: "geojson", data: emptyFeatureCollection });
    map.addSource("route-draft-points", { type: "geojson", data: emptyFeatureCollection });

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
    // Chevrons showing direction of running — reuses the same "oneway-arrow"
    // icon and line-placement approach as the road network's own one-way
    // arrows (basemap-style.json), which needs no per-feature bearing: MapLibre
    // derives the rotation from the line geometry itself. Sourced from the
    // per-edge chunks (not the merged line) so a stretch used in both
    // directions can be filtered out.
    map.addLayer({
      id: "route-draft-chevrons",
      type: "symbol",
      source: "route-draft-edges",
      filter: ["!=", ["get", "bothDirections"], true],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 40,
        "icon-image": "oneway-arrow",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 18, 1.1],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
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
    (map.getSource("route-draft-edges") as maplibregl.GeoJSONSource | undefined)?.setData(
      edgeChunksSource(edgeChunks, edgeUseCount),
    );
    (map.getSource("route-draft-points") as maplibregl.GeoJSONSource | undefined)?.setData(
      pointsSource(draftPoints),
    );
  };

  // Routes one leg (previous point -> next point) and appends it to
  // routeCoords/edgeChunks/edgeUseCount, or sets `warning` if no road route
  // exists between them. Shared by both the fast-path single append and a
  // full rebuild after a mid-list insertion. Stops and waypoints are routed
  // identically — a waypoint is just another point the path must pass
  // through, so no special-casing is needed here at all.
  const appendLeg = (prev: DraftPoint, next: DraftPoint) => {
    const leg = router.find_route(prev.lon, prev.lat, next.lon, next.lat);
    if (leg.length === 0) {
      warning = `No road route found between ${pointLabel(prev)} and ${pointLabel(next)} — that leg wasn't added.`;
      return;
    }
    const points: [number, number][] = [];
    for (let i = 0; i < leg.length; i += 2) points.push([leg[i], leg[i + 1]]);

    const edgeIds = Array.from(router.last_route_edges());
    const pointCounts = Array.from(router.last_route_edge_point_counts());
    let idx = 0;
    for (let e = 0; e < edgeIds.length; e++) {
      const count = pointCounts[e];
      const chunkCoords = points.slice(idx, idx + count + 1);
      edgeChunks.push({ edgeId: edgeIds[e], coords: chunkCoords });
      edgeUseCount.set(edgeIds[e], (edgeUseCount.get(edgeIds[e]) ?? 0) + 1);
      idx += count;
    }
    // Drop the leg's own first point — it duplicates the previous leg's
    // last point (both are the same point's snapped node).
    routeCoords.push(...points.slice(1));
  };

  // Recomputes the whole route from the current draftPoints order — used
  // after an insertion changes point order, since a fast single-leg append
  // no longer applies once earlier legs may also have shifted.
  const rebuildRoute = () => {
    routeCoords = [];
    edgeChunks = [];
    edgeUseCount = new Map();
    warning = null;
    for (let i = 0; i < draftPoints.length; i++) {
      if (i === 0) {
        const snapped = router.snap_to_road(draftPoints[0].lon, draftPoints[0].lat);
        routeCoords.push(snapped.length === 2 ? [snapped[0], snapped[1]] : [draftPoints[0].lon, draftPoints[0].lat]);
        continue;
      }
      appendLeg(draftPoints[i - 1], draftPoints[i]);
    }
  };

  const addPoint = (point: DraftPoint) => {
    const last = draftPoints[draftPoints.length - 1];
    // Ignore a repeat click on the same stop; waypoints have no identity to
    // dedupe against, so two close clicks just add two close waypoints.
    if (last && last.kind === "stop" && point.kind === "stop" && last.osmId === point.osmId) return;

    warning = null;

    if (insertAfterIndex !== null) {
      const insertedAt = insertAfterIndex + 1;
      draftPoints.splice(insertedAt, 0, point);
      insertAfterIndex += 1;
      if (terminusIndex !== null && terminusIndex >= insertedAt) terminusIndex += 1;
      if (startIndex !== null && startIndex >= insertedAt) startIndex += 1;
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
    routeCoords = [];
    edgeChunks = [];
    edgeUseCount = new Map();
    warning = null;
    insertAfterIndex = null;
    terminusIndex = null;
    startIndex = null;
    editingRouteId = null;
    numberInput.value = "";
    saveStatusEl.hidden = true;
    updateHeader();
    refresh();
    renderStopList();
  };

  // No longer positions or shows/hides itself — the caller (route-panel.ts)
  // mounts `el` into its own persistent left-hand slot (DESIGN.md §11) and
  // controls when it's visible.
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.height = "100%";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Drawing route";
  panel.appendChild(header);

  const updateHeader = () => {
    header.textContent = editingRouteId !== null ? "Editing route" : "Drawing route";
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

  const numberInput = document.createElement("input");
  numberInput.type = "text";
  numberInput.className = "field";
  numberInput.placeholder = "Route number (e.g. 7, 7A, X7)";

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
    if (draftPoints.length < 2) {
      saveStatusEl.textContent = "Draw at least two points first.";
      return;
    }
    const group = depotGroups.find((g) => g.id === selectedDepotGroupId);
    if (!group) {
      saveStatusEl.textContent = "Choose a depot group first.";
      return;
    }
    if (group.mainBusStationOsmId === null) {
      saveStatusEl.textContent =
        `"${group.name}" has no main bus station set — pick one in the Depot groups panel first ` +
        `(there's no settlement fallback yet for a depot group with none).`;
      return;
    }
    const station = busStationsState.find((s) => s.osmId === group.mainBusStationOsmId);
    if (!station) {
      saveStatusEl.textContent = `"${group.name}"'s main bus station couldn't be found in the loaded stop data.`;
      return;
    }
    const startTerminusError = validateStartTerminus(draftPoints, terminusIndex, startIndex);
    if (startTerminusError) {
      saveStatusEl.textContent = startTerminusError;
      return;
    }

    const coords: LonLat[] = draftPoints.map((p) => [p.lon, p.lat]);
    const outboundEndIndex = terminusIndex ?? draftPoints.length - 1;
    const orientation = computeRouteOrientation(coords, [station.lon, station.lat], outboundEndIndex);
    const savedPoints: RoutePoint[] = draftPoints.map((p) =>
      p.kind === "stop"
        ? { kind: "stop", osmId: p.osmId, lon: p.lon, lat: p.lat }
        : { kind: "waypoint", lon: p.lon, lat: p.lat },
    );

    if (editingRouteId !== null) {
      // Updates in place (and clears the route's own timetables — db.mts's
      // updateRoute — since they're indexed against the point list this
      // edit may have just changed).
      await window.routes.update(editingRouteId, group.id, number, savedPoints, orientation, terminusIndex, startIndex);
      saveStatusEl.style.color = "var(--text-secondary)";
      saveStatusEl.textContent = `Updated route ${number} in "${group.name}" (drawn direction is ${orientation}).`;
    } else {
      const created = await window.routes.create(group.id, number, savedPoints, orientation, terminusIndex, startIndex);
      // A second Save click without leaving drawing mode now updates this
      // same route instead of creating a duplicate with the same number.
      editingRouteId = created.id;
      updateHeader();
      saveStatusEl.style.color = "var(--text-secondary)";
      saveStatusEl.textContent = `Saved route ${number} to "${group.name}" (drawn direction is ${orientation}).`;
    }
  });

  saveSection.appendChild(numberInput);
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
    terminateButton.disabled = selected === null || selected.kind !== "stop";
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

  const removePoint = (index: number) => {
    draftPoints.splice(index, 1);
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

  function renderStopList(): void {
    pointList.innerHTML = "";
    let stopNumber = 0;

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
      }
    }
    const last = pointList.lastElementChild as HTMLElement | null;
    if (last) last.style.borderBottom = "none";
    updateTerminateButton();
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
  const stopLayers = ["stops-points", "stops-stations", "station-stands-points"];
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
    get edgeChunks() {
      return edgeChunks;
    },
    get edgeUseCount() {
      return edgeUseCount;
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
      // A previous session left an *edit* in progress — starting a
      // genuinely new route shouldn't carry that route's points over.
      if (editingRouteId !== null) clear();
      setDrawing(true);
    },
    startEditing: (route: Route) => {
      draftPoints = route.points.map((p): DraftPoint =>
        p.kind === "stop"
          ? { kind: "stop", osmId: p.osmId as number, lon: p.lon, lat: p.lat }
          : { kind: "waypoint", lon: p.lon, lat: p.lat },
      );
      terminusIndex = route.terminusIndex;
      startIndex = route.startIndex;
      editingRouteId = route.id;
      insertAfterIndex = null;
      warning = null;
      numberInput.value = route.number;
      selectedDepotGroupId = route.depotGroupId;
      rebuildRoute();
      refresh();
      setDrawing(true);
    },
  };
}
