// Route drawing (DESIGN.md §6, §11): the player clicks stops in order and
// the roads auto-route between them, drawn over the road at 75% opacity
// with chevrons while building. Supersedes route-check.ts's hardcoded
// proof-of-concept — this is the real tool it was standing in for.
//
// Scope of this first increment: click-to-draw and the live rendering only.
// Waypoints (forcing a specific path where the router picks something
// silly) and actually saving a route as a numbered, timetabled object are
// separate, later increments — there's no `routes` table yet to save into.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { Router } from "./wasm/game_wasm.js";

// Shared with stops-layer.ts: while drawing, a click on a stop or station
// builds the route instead of opening its usual assignment popup. A plain
// mutable object rather than an event emitter — there's only ever one
// reader and it only needs the current value at click time.
export const routeDrawState = { isDrawing: false };

interface DraftStop {
  osmId: number;
  lon: number;
  lat: number;
}

const emptyFeatureCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function lineSource(coordinates: [number, number][]): GeoJSON.FeatureCollection {
  if (coordinates.length < 2) return emptyFeatureCollection;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
  };
}

function stopsSource(stops: DraftStop[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stops.map((s) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

export async function mountRouteDrawTool(map: maplibregl.Map): Promise<void> {
  const res = await fetch("http://127.0.0.1:38271/road_graph.bin");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const router = new Router(bytes);

  let draftStops: DraftStop[] = [];
  let routeCoords: [number, number][] = [];

  const addLayers = () => {
    map.addSource("route-draft-line", { type: "geojson", data: emptyFeatureCollection });
    map.addSource("route-draft-stops", { type: "geojson", data: emptyFeatureCollection });

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
    // derives the rotation from the line geometry itself.
    map.addLayer({
      id: "route-draft-chevrons",
      type: "symbol",
      source: "route-draft-line",
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
    map.addLayer({
      id: "route-draft-stops-points",
      type: "circle",
      source: "route-draft-stops",
      paint: {
        "circle-radius": 6,
        "circle-color": "#3b82f6",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  };

  if (map.isStyleLoaded()) addLayers();
  else map.once("load", addLayers);

  const refresh = () => {
    (map.getSource("route-draft-line") as maplibregl.GeoJSONSource | undefined)?.setData(
      lineSource(routeCoords),
    );
    (map.getSource("route-draft-stops") as maplibregl.GeoJSONSource | undefined)?.setData(
      stopsSource(draftStops),
    );
  };

  const addStop = (osmId: number, lon: number, lat: number) => {
    const last = draftStops[draftStops.length - 1];
    if (last && last.osmId === osmId) return; // ignore a repeat click on the same stop

    if (last) {
      const leg = router.find_route(last.lon, last.lat, lon, lat);
      const legCoords: [number, number][] = [];
      for (let i = 0; i < leg.length; i += 2) legCoords.push([leg[i], leg[i + 1]]);
      // Drop the leg's own first point — it duplicates the previous leg's
      // last point (both are the same stop's nearest snapped node).
      routeCoords.push(...legCoords.slice(1));
    } else {
      routeCoords.push([lon, lat]);
    }
    draftStops.push({ osmId, lon, lat });
    refresh();
  };

  const clear = () => {
    draftStops = [];
    routeCoords = [];
    refresh();
  };

  // Toggle button, mirroring depot-groups-panel.ts's pattern but on the
  // opposite corner, offset below the status readout box.
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Draw route";
  toggle.style.position = "absolute";
  toggle.style.top = "44px";
  toggle.style.left = "8px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "76px";
  panel.style.left = "8px";
  panel.style.zIndex = "2";
  panel.style.width = "240px";
  panel.hidden = true;
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Drawing route";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-section";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "8px";
  panel.appendChild(body);

  const status = document.createElement("div");
  status.style.color = "var(--text-secondary)";
  body.appendChild(status);

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
  finishButton.addEventListener("click", () => setDrawing(false));
  controls.appendChild(clearButton);
  controls.appendChild(finishButton);
  body.appendChild(controls);

  const updateStatus = () => {
    status.textContent =
      draftStops.length === 0
        ? "Click stops on the map in order."
        : `${draftStops.length} stop${draftStops.length === 1 ? "" : "s"} so far.`;
  };

  const setDrawing = (drawing: boolean) => {
    routeDrawState.isDrawing = drawing;
    toggle.classList.toggle("is-active", drawing);
    panel.hidden = !drawing;
    updateStatus();
  };

  toggle.addEventListener("click", () => setDrawing(!routeDrawState.isDrawing));

  const onStopClick = (e: maplibregl.MapLayerMouseEvent) => {
    if (!routeDrawState.isDrawing) return;
    const feature = e.features?.[0];
    if (!feature) return;
    const osmId = feature.properties?.osmId as number;
    const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
    addStop(osmId, coords[0], coords[1]);
    updateStatus();
  };
  for (const layerId of ["stops-points", "stops-stations", "station-stands-points"]) {
    map.on("click", layerId, onStopClick);
  }

  (window as unknown as { __routeDraw: unknown }).__routeDraw = {
    get draftStops() {
      return draftStops;
    },
    get routeCoords() {
      return routeCoords;
    },
    get isDrawing() {
      return routeDrawState.isDrawing;
    },
  };
}
