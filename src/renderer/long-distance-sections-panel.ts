// Shared long-distance sections (live design discussion, 2026-10-31) — a
// reusable piece of drawn path, authored once here, that long-distance
// routes can build from (route-draw.ts's own "Insert section" control) so
// a shared corridor (several services all running Glasgow-Carlisle, say)
// only ever needs its own real road routing done once. Click to add a
// point, each consecutive pair routed for display via the same real
// road-following `find_route` every route uses — no depot group, no
// orientation or terminus, no hail-and-ride, no variations. A click
// landing on a real stop/station feature is recorded as that stop (kind
// "stop", carrying its osmId, shown by name in the point list below), same
// as route-draw.ts's own click handling — but unlike a route, a section
// has no requirement that any particular point be a stop (live user
// correction, 2026-11-01: an in-progress section is mid-corridor geometry,
// not a serviceable route in its own right, so forcing stop endpoints
// didn't make sense). A section's own stored `points` are the plain
// clicked sequence (the same sparse "the rest gets re-routed on demand"
// shape routes already use, never a dense polyline), so splicing one into
// a route (long-distance-sections.mts's resolveSegments) produces exactly
// the same shape a route's own points already are.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { Router } from "./wasm/game_wasm.js";
import { routeDrawState } from "./route-draw";
import { stopsPanelState } from "./stops-layer";
import { resolveSegments, findRoutesUsingSectionId, type SectionSource, type SectionPoint, type RouteSegment as ResolvedRouteSegment } from "./long-distance-sections.mts";
import { BOTTOM_BAR_CLEARANCE_PX } from "./bottom-bar";

export const sectionDrawState = { isDrawing: false };

const DRAFT_SOURCE_ID = "section-draft-line";
const DRAFT_POINTS_SOURCE_ID = "section-draft-points";

function sectionStopLabel(osmId: number): string {
  return stopsPanelState.displayNameFor?.(osmId) ?? `Stop ${osmId}`;
}

export async function mountLongDistanceSectionsTool(map: maplibregl.Map, router: Router): Promise<void> {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Long-distance sections";
  toggle.style.position = "absolute";
  toggle.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX}px`;
  toggle.style.left = "1760px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  panel.style.width = "360px";
  panel.style.maxHeight = "85vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Long-distance sections";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  // Only the ACTIVE draft renders on the map — there used to also be a
  // permanent overlay of every already-saved section, but the live user
  // response to it was "I don't know why it is even there in the first
  // place" (2026-11-01), so it's gone: sections are managed through this
  // panel's own list below, not read off the map.
  map.addSource(DRAFT_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: DRAFT_SOURCE_ID,
    type: "line",
    source: DRAFT_SOURCE_ID,
    paint: { "line-color": "#a855f7", "line-width": 4, "line-opacity": 0.85 },
  });
  // Each draft point shown as its own marker (live user request, 2026-11-01:
  // "more like making a normal route so I can see the waypoints... on the
  // map") — same stop-vs-waypoint colour split route-draw.ts's own
  // "route-draft-points" layer uses.
  map.addSource(DRAFT_POINTS_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: DRAFT_POINTS_SOURCE_ID,
    type: "circle",
    source: DRAFT_POINTS_SOURCE_ID,
    paint: {
      "circle-radius": ["case", ["==", ["get", "kind"], "waypoint"], 7, 6],
      "circle-color": ["case", ["==", ["get", "kind"], "waypoint"], "#eab308", "#3b82f6"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["case", ["==", ["get", "kind"], "waypoint"], 3, 2],
    },
  });

  let sections: LongDistanceSection[] = [];
  // Carries `kind`/`osmId` through from the click itself (mirroring
  // route-draw.ts's own DraftStopPoint/addPoint click handling), so a real
  // stop keeps its name in the point list below rather than every point
  // being a plain unnamed waypoint.
  let draftPoints: SectionPoint[] = [];
  let draftCoords: [number, number][] = [];
  let errorMessage = "";
  // Set by an existing section's own "Redraw" button (2026-11-01, live
  // user request — the DB-layer live-update mechanism already existed and
  // was tested, there was just no UI control to reach it). Reuses the
  // exact same draw/undo/save flow as a brand new section below, keyed
  // off this instead of a second copy of that flow — Save calls
  // setPoints + propagates to dependent routes instead of create.
  let redrawingSectionId: number | null = null;
  // Armed by clicking a point's own row in the list below (live user
  // request, 2026-11-01: "I need to be able to click on waypoints and
  // stops... to be able to add waypoints into the middle") — the next map
  // click (or stop click) is spliced in right after this point instead of
  // appended at the end, same `insertAfterIndex`/`toggleInsertAt` pattern
  // route-draw.ts's own point list already uses.
  let insertAfterIndex: number | null = null;

  async function reloadSections(): Promise<void> {
    sections = await window.longDistanceSections.list();
  }

  function showError(err: unknown): void {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  function updateDraftLayer(): void {
    (map.getSource(DRAFT_SOURCE_ID) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: draftCoords.length >= 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: draftCoords } }] : [],
    });
    (map.getSource(DRAFT_POINTS_SOURCE_ID) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: draftPoints.map((p) => ({ type: "Feature", properties: { kind: p.kind }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
    });
  }

  function addDraftPoint(point: SectionPoint): void {
    const prev = draftPoints[draftPoints.length - 1];
    draftPoints.push(point);
    if (!prev) {
      draftCoords = [[point.lon, point.lat]];
    } else {
      const leg = router.find_route(prev.lon, prev.lat, point.lon, point.lat);
      if (leg.length === 0) {
        errorMessage = "No road route found between the last point and this one — point not added.";
        draftPoints.pop();
        return;
      }
      errorMessage = "";
      const points: [number, number][] = [];
      for (let i = 0; i < leg.length; i += 2) points.push([leg[i], leg[i + 1]]);
      draftCoords.push(...points.slice(1));
    }
    updateDraftLayer();
    render();
  }

  // Resets the draft and replays a full ordered point list through
  // addDraftPoint from scratch — the common rebuild every one of
  // removeDraftPoint/insertDraftPoint/loadDraftFromPoints needs, since a
  // single leg can contribute a variable number of road-geometry points so
  // there's no cheap way to splice just one leg's worth back out of
  // draftCoords directly.
  function rebuildDraftFrom(points: readonly SectionPoint[]): void {
    draftPoints = [];
    draftCoords = [];
    for (const p of points) addDraftPoint(p);
  }

  // Removes one point at any position (not just the last).
  function removeDraftPoint(index: number): void {
    const remaining = draftPoints.filter((_, i) => i !== index);
    if (insertAfterIndex === index) insertAfterIndex = null;
    else if (insertAfterIndex !== null && insertAfterIndex > index) insertAfterIndex -= 1;
    rebuildDraftFrom(remaining);
  }

  // A new point from a click: appended at the end as before, unless an
  // existing point's row has been armed for insertion (toggleInsertAt
  // below), in which case it's spliced in right after that point and every
  // leg is rebuilt from scratch — insertAfterIndex then advances to the
  // newly inserted point, so clicking a further run of points continues
  // inserting them in order rather than resetting to append-at-the-end.
  function insertOrAppendDraftPoint(point: SectionPoint): void {
    if (insertAfterIndex === null) {
      addDraftPoint(point);
      return;
    }
    const insertedAt = insertAfterIndex + 1;
    const withInsertion = [...draftPoints.slice(0, insertedAt), point, ...draftPoints.slice(insertedAt)];
    rebuildDraftFrom(withInsertion);
    insertAfterIndex = insertedAt;
    render();
  }

  // Clicking a point's own row arms/disarms it as the insertion point —
  // clicking the same row again disarms it, same toggle route-draw.ts's
  // own point list uses.
  function toggleInsertAt(index: number): void {
    insertAfterIndex = insertAfterIndex === index ? null : index;
    render();
  }

  // Loads an existing section's own points into the draft state, re-routing
  // every leg the same way a manual click does (addDraftPoint), so a
  // redraw starts from exactly what's already saved rather than a blank
  // map — the player then edits/extends/removes points with the same
  // tools (map clicks, Undo point) a brand new section uses.
  function loadDraftFromPoints(points: readonly SectionPoint[]): void {
    insertAfterIndex = null;
    rebuildDraftFrom(points);
  }

  // Same stop-detection the route drawing tool uses (route-draw.ts) — a
  // click that lands on a real stop/station feature is recorded as that
  // stop (kind "stop", carrying its osmId, shown by name in the point
  // list), everything else is a plain road-snapped waypoint.
  const stopLayers = [
    "stops-points",
    "stops-stations",
    "station-stands-points",
    "stop-groups-points",
    "group-members-points",
  ];

  // Defers to route-draw.ts if it's also active — same one-directional
  // "each newer tool checks the earlier ones" convention this project's
  // other map-drawing tools already follow (fare-zone-drawing.ts's own
  // otherToolActive()). Not exhaustive against every other tool in this
  // codebase (stop/depot/dealer placement etc.) given the time this would
  // take to thread through correctly — flagged rather than silently
  // assumed complete.
  const mapClickHandler = (e: maplibregl.MapMouseEvent): void => {
    if (!sectionDrawState.isDrawing || routeDrawState.isDrawing) return;
    const feature = map.queryRenderedFeatures(e.point, { layers: stopLayers })[0];
    if (feature) {
      const osmId = feature.properties?.osmId as number;
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      insertOrAppendDraftPoint({ kind: "stop", osmId, lon: coords[0], lat: coords[1] });
    } else {
      const snapped = router.snap_to_road(e.lngLat.lng, e.lngLat.lat);
      const [lon, lat] = snapped.length === 2 ? snapped : [e.lngLat.lng, e.lngLat.lat];
      insertOrAppendDraftPoint({ kind: "waypoint", lon, lat });
    }
  };
  map.on("click", mapClickHandler);

  // Propagates a section change (edited points, or deletion — pass the
  // section's own id with no replacement in `sectionsAfterChange`, i.e.
  // the id simply isn't present in it) to every route that references it,
  // so each one's own cached `points` reflect the new shape immediately —
  // the "live reference, not a frozen copy" design, proven in
  // long-distance-sections.verify.mts and wired up for real here via the
  // same findDependentRouteIds-then-refresh pattern route-draw.ts already
  // uses for composed variations. Called from both the delete path and
  // the "Redraw" save path below (2026-11-01 — the edit-triggers-
  // propagation case was a flagged gap, now wired up).
  async function refreshRoutesUsingSection(sectionId: number, sectionsAfterChange: LongDistanceSection[]): Promise<void> {
    const allRoutes = await window.routes.list();
    const dependentIds = findRoutesUsingSectionId(
      sectionId,
      allRoutes.map((r) => ({ id: r.id, segments: r.segments as ResolvedRouteSegment[] })),
    );
    for (const routeId of dependentIds) {
      const route = allRoutes.find((r) => r.id === routeId);
      if (!route) continue;
      const freshPoints = resolveSegments(route.segments as ResolvedRouteSegment[], sectionsAfterChange as SectionSource[]);
      await window.routes.refreshComposedPoints(routeId, freshPoints as RoutePoint[]);
    }
  }

  function sectionHeading(container: HTMLElement, text: string): void {
    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.style.marginTop = "12px";
    heading.style.fontWeight = "600";
    heading.textContent = text;
    container.appendChild(heading);
  }

  function render(): void {
    body.replaceChildren();

    const redrawingSection = redrawingSectionId === null ? null : sections.find((s) => s.id === redrawingSectionId);
    sectionHeading(body, redrawingSection ? `Redrawing "${redrawingSection.name}"` : "Draw a new section");
    const drawNote = document.createElement("div");
    drawNote.style.fontSize = "11px";
    drawNote.style.color = "var(--text-muted)";
    drawNote.textContent = sectionDrawState.isDrawing
      ? insertAfterIndex !== null
        ? `Inserting after point ${insertAfterIndex + 1} — click the map to add it there, or click that row again to stop.`
        : `Click the map to add points (${draftPoints.length} so far) — same real road routing any route uses, and a click directly on a stop adds it as a named stop, same as drawing a route. Click an existing point's row below to insert into the middle instead of appending.`
      : "Click \"Start drawing\" then click the map.";
    body.appendChild(drawNote);

    const drawButton = document.createElement("button");
    drawButton.className = "btn";
    drawButton.textContent = sectionDrawState.isDrawing ? "Stop drawing" : "Start drawing";
    drawButton.addEventListener("click", () => {
      sectionDrawState.isDrawing = !sectionDrawState.isDrawing;
      if (!sectionDrawState.isDrawing) {
        draftPoints = [];
        draftCoords = [];
        insertAfterIndex = null;
        redrawingSectionId = null;
        updateDraftLayer();
      }
      render();
    });
    body.appendChild(drawButton);

    if (redrawingSection) {
      const cancelRedrawButton = document.createElement("button");
      cancelRedrawButton.className = "btn";
      cancelRedrawButton.textContent = "Cancel redraw";
      cancelRedrawButton.addEventListener("click", () => {
        redrawingSectionId = null;
        sectionDrawState.isDrawing = false;
        draftPoints = [];
        draftCoords = [];
        insertAfterIndex = null;
        updateDraftLayer();
        render();
      });
      body.appendChild(cancelRedrawButton);
    }

    if (draftPoints.length >= 2) {
      const nameInput = document.createElement("input");
      nameInput.className = "field";
      nameInput.type = "text";
      nameInput.placeholder = "Section name, e.g. Glasgow-Carlisle";
      nameInput.style.display = redrawingSection ? "none" : "block";
      nameInput.style.width = "100%";
      nameInput.style.margin = "6px 0";
      body.appendChild(nameInput);

      const saveButton = document.createElement("button");
      saveButton.className = "btn";
      saveButton.textContent = redrawingSection ? "Save redrawn path" : "Save section";
      saveButton.addEventListener("click", async () => {
        const points = draftPoints;
        try {
          if (redrawingSection) {
            // Live reference, not a frozen copy (long-distance-sections.mts's
            // own design) — every route using this section must see the
            // new path immediately, the same propagation the delete path
            // below already uses.
            await window.longDistanceSections.setPoints(redrawingSection.id, points);
            await reloadSections();
            await refreshRoutesUsingSection(redrawingSection.id, sections);
          } else {
            const name = nameInput.value.trim();
            if (!name) {
              errorMessage = "Give the section a name.";
              render();
              return;
            }
            await window.longDistanceSections.create(name, points);
            await reloadSections();
          }
          errorMessage = "";
          sectionDrawState.isDrawing = false;
          redrawingSectionId = null;
          draftPoints = [];
          draftCoords = [];
          insertAfterIndex = null;
          updateDraftLayer();
        } catch (err) {
          showError(err);
        }
        render();
      });
      body.appendChild(saveButton);
    }

    const undoButton = document.createElement("button");
    undoButton.className = "btn";
    undoButton.textContent = "Undo point";
    undoButton.disabled = draftPoints.length === 0;
    undoButton.addEventListener("click", () => {
      removeDraftPoint(draftPoints.length - 1);
      render();
    });
    body.appendChild(undoButton);

    // The draft's own point list (live user request, 2026-11-01: "more like
    // making a normal route so I can see the waypoints in a list") — same
    // label convention as route-draw.ts's own pointLabel/stopLabel (a real
    // stop's display name, or "Waypoint" for a plain forced pass-through
    // point), with a per-point remove button rather than only being able to
    // undo the very last one.
    if (draftPoints.length > 0) {
      const pointList = document.createElement("div");
      pointList.style.margin = "6px 0";
      pointList.style.border = "1px solid var(--border)";
      pointList.style.borderRadius = "4px";
      pointList.style.maxHeight = "220px";
      pointList.style.overflowY = "auto";
      draftPoints.forEach((point, i) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "6px";
        row.style.padding = "4px 8px";
        row.style.borderBottom = i < draftPoints.length - 1 ? "1px solid var(--border)" : "none";
        row.style.cursor = "pointer";
        row.title = "Click to insert the next point right after this one";
        if (i === insertAfterIndex) row.style.background = "var(--bg-accent)";

        const nameText = document.createElement("div");
        nameText.style.flex = "1";
        // Live report, 2026-11-01: "the delete button doesn't fit in the
        // menu though" — a flex item's default min-width is auto, which
        // for nowrap text means its own full rendered width, not 0; with
        // a long stop name that's wider than the row has room for, it
        // refused to shrink at all and pushed the × button straight out
        // of the panel instead of actually eliding the text. Same root
        // cause already fixed once for the route-type dropdown elsewhere
        // in this project.
        nameText.style.minWidth = "0";
        nameText.style.overflow = "hidden";
        nameText.style.textOverflow = "ellipsis";
        nameText.style.whiteSpace = "nowrap";
        if (point.kind === "stop") {
          nameText.textContent = `${i + 1}. ${sectionStopLabel(point.osmId as number)}`;
        } else {
          nameText.textContent = `${i + 1}. Waypoint`;
          nameText.style.color = "var(--text-muted)";
          nameText.style.fontStyle = "italic";
        }
        if (i === insertAfterIndex) nameText.style.color = "var(--text-accent)";
        nameText.title = nameText.textContent;
        row.appendChild(nameText);

        const removeButton = document.createElement("button");
        removeButton.className = "btn btn-icon btn-danger";
        removeButton.textContent = "×";
        removeButton.title = point.kind === "stop" ? "Remove this stop" : "Remove this waypoint";
        removeButton.addEventListener("click", (e) => {
          e.stopPropagation();
          removeDraftPoint(i);
          render();
        });
        row.appendChild(removeButton);

        row.addEventListener("click", () => toggleInsertAt(i));

        pointList.appendChild(row);
      });
      body.appendChild(pointList);
    }

    sectionHeading(body, "Existing sections");
    if (sections.length === 0) {
      const note = document.createElement("div");
      note.style.color = "var(--text-muted)";
      note.style.fontSize = "12px";
      note.textContent = "None yet.";
      body.appendChild(note);
    }
    for (const section of sections) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "3px 0";

      const nameInput = document.createElement("input");
      nameInput.className = "field";
      nameInput.value = section.name;
      nameInput.style.flex = "1";
      row.appendChild(nameInput);

      const renameButton = document.createElement("button");
      renameButton.className = "btn";
      renameButton.textContent = "Rename";
      renameButton.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        await window.longDistanceSections.rename(section.id, name);
        await reloadSections();
        render();
      });
      row.appendChild(renameButton);

      const redrawButton = document.createElement("button");
      redrawButton.className = "btn";
      redrawButton.textContent = "Redraw";
      redrawButton.title = "Replace this section's own path — every route using it updates to match once saved.";
      redrawButton.addEventListener("click", () => {
        redrawingSectionId = section.id;
        sectionDrawState.isDrawing = true;
        loadDraftFromPoints(section.points);
        render();
      });
      row.appendChild(redrawButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn";
      deleteButton.textContent = "Delete";
      deleteButton.title = "Any route using this section loses that stretch of its path — the route itself is not deleted.";
      deleteButton.addEventListener("click", async () => {
        await refreshRoutesUsingSection(
          section.id,
          sections.filter((s) => s.id !== section.id),
        );
        await window.longDistanceSections.delete(section.id);
        await reloadSections();
        render();
      });
      row.appendChild(deleteButton);

      body.appendChild(row);
    }

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "8px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  let panelOpen = false;
  toggle.addEventListener("click", async () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) {
      await reloadSections();
      render();
    } else {
      sectionDrawState.isDrawing = false;
      redrawingSectionId = null;
      draftPoints = [];
      draftCoords = [];
      insertAfterIndex = null;
      updateDraftLayer();
    }
  });

  await reloadSections();
}
