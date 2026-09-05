// Renders real OSM stops (DESIGN.md §4: "Real OSM stops, plus stops the
// player places") loaded from the pipeline's stops.bin. This is read-only
// display of imported data — placing new stops with kerb snapping is a
// separate, later increment.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { decode_stops, decode_stop_areas } from "./wasm/game_wasm.js";
import { routeDrawState } from "./route-draw";
import { createDropdown } from "./dropdown";

interface DecodedStop {
  lon: number;
  lat: number;
  kind: "bus_stop" | "platform" | "bus_station";
  name: string | null;
  osmId: number;
}

interface DecodedStopArea {
  osmId: number;
  name: string | null;
  memberOsmIds: number[];
}

// No routes exist yet (Phase 2 route drawing hasn't been built), so every
// stop is "not used" for now — colouring is wired up ahead of that so this
// layer doesn't need revisiting once routes land and can report real usage.
function isUsedByService(_osmId: number): boolean {
  return false;
}

// Blue for a stop at least one service uses, grey otherwise.
const stopColorExpression = ["case", ["get", "usedByService"], "#1677ff", "#8c8c8c"];
// Navy outline for a stop that's part of a bus station's stand grouping,
// white otherwise — the same marker distinguishes membership wherever it's
// drawn, whether that's the main map (an "always show" station) or the
// temporary reveal-on-click layer.
const stopStrokeExpression = ["case", ["get", "partOfStation"], "#003a8c", "#ffffff"];
const stopStrokeWidthExpression = ["case", ["get", "partOfStation"], 1.5, 1];

function approxDistanceM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[0] - a[0]);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

export async function drawStops(map: maplibregl.Map): Promise<void> {
  const res = await fetch("http://127.0.0.1:38271/stops.bin");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const stops = decode_stops(bytes) as DecodedStop[];
  const stopAreas = decode_stop_areas(bytes) as DecodedStopArea[];

  const stationOsmIds = new Set(
    stops.filter((s) => s.kind === "bus_station").map((s) => s.osmId),
  );
  const stations = stops.filter((s) => s.kind === "bus_station");
  const stopsById = new Map(stops.map((s) => [s.osmId, s]));

  // stop osmId -> station osmId. Seeded from public_transport=stop_area
  // relations (DESIGN.md §5: a relation whose members include a bus station
  // groups that station's stands), then the player's manual assignments are
  // layered on top via the override layer, so a station without an OSM
  // stop_area relation — or a wrongly-grouped one — can still be fixed by
  // hand rather than being a permanent gap.
  const stationOfStop = new Map<number, number>();
  for (const area of stopAreas) {
    const stationId = area.memberOsmIds.find((id) => stationOsmIds.has(id));
    if (stationId === undefined) continue;
    for (const id of area.memberOsmIds) {
      if (id !== stationId) stationOfStop.set(id, stationId);
    }
  }
  const manualAssignments = await window.overrides.list<number | null>("stop", "bus_station");
  for (const { osmId, value } of manualAssignments) {
    if (value === null) stationOfStop.delete(osmId);
    else stationOfStop.set(osmId, value);
  }

  const alwaysShowEntries = await window.overrides.list<boolean>("bus_station", "always_show_stands");
  const alwaysShow = new Map(alwaysShowEntries.map(({ osmId, value }) => [osmId, value]));

  let standsOfStation = new Map<number, Set<number>>();
  const rebuildStandsOfStation = () => {
    standsOfStation = new Map();
    for (const [stopId, stationId] of stationOfStop) {
      if (!standsOfStation.has(stationId)) standsOfStation.set(stationId, new Set());
      standsOfStation.get(stationId)!.add(stopId);
    }
  };
  rebuildStandsOfStation();

  const toFeature = (s: DecodedStop): GeoJSON.Feature => ({
    type: "Feature",
    properties: {
      kind: s.kind,
      name: s.name,
      osmId: s.osmId,
      usedByService: isUsedByService(s.osmId),
      partOfStation: stationOfStop.has(s.osmId),
    },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
  });

  const emptyGeojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

  const visibleStops = () =>
    stops.filter((s) => {
      if (s.kind === "bus_station") return false;
      const stationId = stationOfStop.get(s.osmId);
      return stationId === undefined || alwaysShow.get(stationId) === true;
    });

  let openStationOsmId: number | null = null;
  let stationPopup: maplibregl.Popup | null = null;
  let stopPopup: maplibregl.Popup | null = null;

  const addLayers = () => {
    map.addSource("stops", {
      type: "geojson",
      data: { type: "FeatureCollection", features: visibleStops().map(toFeature) },
    });
    map.addSource("stop-stations", {
      type: "geojson",
      data: { type: "FeatureCollection", features: stations.map(toFeature) },
    });
    // Populated on demand when a station without "always show" set is
    // clicked — that station's own stand stops only.
    map.addSource("station-stands", { type: "geojson", data: emptyGeojson });

    map.addLayer({
      id: "stops-points",
      type: "circle",
      source: "stops",
      minzoom: 13,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 5],
        "circle-color": stopColorExpression as maplibregl.DataDrivenPropertyValueSpecification<string>,
        "circle-stroke-color": stopStrokeExpression as maplibregl.DataDrivenPropertyValueSpecification<string>,
        "circle-stroke-width": stopStrokeWidthExpression as maplibregl.DataDrivenPropertyValueSpecification<number>,
      },
    });

    // Bus stations: bigger, visible from further out.
    map.addLayer({
      id: "stops-stations",
      type: "circle",
      source: "stop-stations",
      minzoom: 10,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 17, 9],
        "circle-color": "#003a8c",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });

    map.addLayer({
      id: "station-stands-points",
      type: "circle",
      source: "station-stands",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 6],
        "circle-color": stopColorExpression as maplibregl.DataDrivenPropertyValueSpecification<string>,
        "circle-stroke-color": "#003a8c",
        "circle-stroke-width": 1.5,
      },
    });

    const refreshStopsSource = () => {
      (map.getSource("stops") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: visibleStops().map(toFeature),
      });
    };

    const refreshStandsSource = () => {
      const source = map.getSource("station-stands") as maplibregl.GeoJSONSource;
      if (openStationOsmId === null || alwaysShow.get(openStationOsmId) === true) {
        source.setData(emptyGeojson);
        return;
      }
      const standIds = standsOfStation.get(openStationOsmId) ?? new Set<number>();
      const features = [...standIds]
        .map((id) => stopsById.get(id))
        .filter((s): s is DecodedStop => s !== undefined)
        .map(toFeature);
      source.setData({ type: "FeatureCollection", features });
    };

    const closeStationPopup = () => {
      stationPopup?.remove();
      stationPopup = null;
      openStationOsmId = null;
      refreshStandsSource();
    };

    const openStationPopup = (feature: maplibregl.MapGeoJSONFeature) => {
      stopPopup?.remove();
      const osmId = feature.properties?.osmId as number;
      const name = (feature.properties?.name as string | null) ?? "Bus station";
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

      const container = document.createElement("div");
      container.style.minWidth = "220px";
      const title = document.createElement("div");
      title.textContent = name;
      title.style.fontWeight = "600";
      title.style.fontSize = "13px";
      title.style.marginBottom = "8px";
      container.appendChild(title);

      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.cursor = "pointer";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = alwaysShow.get(osmId) === true;
      checkbox.addEventListener("change", () => {
        alwaysShow.set(osmId, checkbox.checked);
        void window.overrides.set("bus_station", osmId, "always_show_stands", checkbox.checked);
        refreshStopsSource();
        refreshStandsSource();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode("Always show stops here"));
      container.appendChild(label);

      // Bulk assignment: most real bus stations have no OSM stop_area
      // relation grouping their stands (only 2 of 59 in the current
      // extract do), so one-at-a-time assignment from a stop's own popup
      // is impractically slow for a station with a dozen-plus stands.
      // This claims everything within a radius in one action instead.
      const bulkSection = document.createElement("div");
      bulkSection.style.marginTop = "10px";
      bulkSection.style.paddingTop = "10px";
      bulkSection.style.borderTop = "1px solid var(--border)";
      bulkSection.style.display = "flex";
      bulkSection.style.flexDirection = "column";
      bulkSection.style.gap = "6px";

      const bulkLabel = document.createElement("div");
      bulkLabel.className = "label-muted";
      bulkLabel.textContent = "Assign nearby stops";
      bulkSection.appendChild(bulkLabel);

      const radiusRow = document.createElement("div");
      radiusRow.style.display = "flex";
      radiusRow.style.alignItems = "center";
      radiusRow.style.gap = "6px";
      const radiusInput = document.createElement("input");
      radiusInput.type = "number";
      radiusInput.min = "1";
      radiusInput.value = "50";
      radiusInput.className = "field";
      radiusInput.style.width = "60px";
      radiusRow.appendChild(radiusInput);
      radiusRow.appendChild(document.createTextNode("m"));
      const assignButton = document.createElement("button");
      assignButton.className = "btn";
      assignButton.textContent = "Assign";
      radiusRow.appendChild(assignButton);
      bulkSection.appendChild(radiusRow);

      const previewText = document.createElement("div");
      previewText.style.color = "var(--text-muted)";
      previewText.style.fontSize = "11px";
      bulkSection.appendChild(previewText);

      const candidatesWithinRadius = () => {
        const radius = Number(radiusInput.value);
        if (!Number.isFinite(radius) || radius <= 0) return [];
        return stops.filter((s) => {
          if (s.kind === "bus_station" || s.osmId === osmId) return false;
          if (stationOfStop.get(s.osmId) === osmId) return false;
          return approxDistanceM(coords, [s.lon, s.lat]) <= radius;
        });
      };

      const updatePreview = () => {
        const candidates = candidatesWithinRadius();
        const elsewhere = candidates.filter((s) => stationOfStop.has(s.osmId)).length;
        assignButton.disabled = candidates.length === 0;
        previewText.textContent =
          candidates.length === 0
            ? "No unassigned stops in range"
            : `${candidates.length} stop${candidates.length === 1 ? "" : "s"} in range` +
              (elsewhere > 0 ? ` (${elsewhere} reassigned from another station)` : "");
      };
      radiusInput.addEventListener("input", updatePreview);
      updatePreview();

      assignButton.addEventListener("click", () => {
        const candidates = candidatesWithinRadius();
        for (const s of candidates) stationOfStop.set(s.osmId, osmId);
        void Promise.all(
          candidates.map((s) => window.overrides.set("stop", s.osmId, "bus_station", osmId)),
        );
        rebuildStandsOfStation();
        refreshStopsSource();
        refreshStandsSource();
        updatePreview();
      });

      container.appendChild(bulkSection);

      stationPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
        .setLngLat(coords)
        .setDOMContent(container)
        .addTo(map);
      stationPopup.on("close", () => {
        stationPopup = null;
        openStationOsmId = null;
        refreshStandsSource();
      });
    };

    map.on("click", "stops-stations", (e) => {
      if (routeDrawState.isDrawing) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const osmId = feature.properties?.osmId as number;
      if (openStationOsmId === osmId) {
        closeStationPopup();
        return;
      }
      openStationOsmId = osmId;
      refreshStandsSource();
      openStationPopup(feature);
    });
    map.on("mouseenter", "stops-stations", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "stops-stations", () => {
      map.getCanvas().style.cursor = "";
    });

    // Manual assignment: pick which bus station (if any) a stop belongs to.
    // Available on any visible stop, whether it's an ordinary street stop or
    // a currently-revealed station stand — reassigning or clearing either
    // way is the same action.
    const openStopPopup = (feature: maplibregl.MapGeoJSONFeature) => {
      stationPopup?.remove();
      const osmId = feature.properties?.osmId as number;
      const stop = stopsById.get(osmId);
      if (!stop) return;
      const coords: [number, number] = [stop.lon, stop.lat];

      const nearestStations = stations
        .map((st) => ({ st, dist: approxDistanceM(coords, [st.lon, st.lat]) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 12);

      const container = document.createElement("div");
      container.style.minWidth = "220px";
      const title = document.createElement("div");
      title.textContent = stop.name ?? (stop.kind === "platform" ? "Platform" : "Bus stop");
      title.style.fontWeight = "600";
      title.style.fontSize = "13px";
      title.style.marginBottom = "8px";
      container.appendChild(title);

      const NONE_LABEL = "(not part of a station)";
      const labelToStationId = new Map<string, number | null>([[NONE_LABEL, null]]);
      for (const { st, dist } of nearestStations) {
        labelToStationId.set(`${st.name ?? "Unnamed station"} (${Math.round(dist)} m)`, st.osmId);
      }
      const currentId = stationOfStop.get(osmId) ?? null;
      const currentLabel =
        [...labelToStationId.entries()].find(([, id]) => id === currentId)?.[0] ?? NONE_LABEL;

      const dropdown = createDropdown([...labelToStationId.keys()], currentLabel, (chosenLabel) => {
        const value = labelToStationId.get(chosenLabel) ?? null;
        if (value === null) stationOfStop.delete(osmId);
        else stationOfStop.set(osmId, value);
        void window.overrides.set("stop", osmId, "bus_station", value);
        rebuildStandsOfStation();
        refreshStopsSource();
        refreshStandsSource();
      });
      dropdown.el.style.width = "100%";
      container.appendChild(dropdown.el);

      stopPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
        .setLngLat(coords)
        .setDOMContent(container)
        .addTo(map);
      stopPopup.on("close", () => {
        stopPopup = null;
      });
    };

    for (const layerId of ["stops-points", "station-stands-points"]) {
      map.on("click", layerId, (e) => {
        if (routeDrawState.isDrawing) return;
        const feature = e.features?.[0];
        if (feature) openStopPopup(feature);
      });
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    }
  };

  if (map.isStyleLoaded()) addLayers();
  else map.once("load", addLayers);

  (window as unknown as { __stops: unknown }).__stops = {
    count: stops.length,
    byKind: {
      bus_stop: stops.filter((s) => s.kind === "bus_stop").length,
      platform: stops.filter((s) => s.kind === "platform").length,
      bus_station: stops.filter((s) => s.kind === "bus_station").length,
    },
    stationsWithStands: standsOfStation.size,
    manualAssignmentCount: manualAssignments.length,
    alwaysShowStationCount: [...alwaysShow.values()].filter(Boolean).length,
    sampleStationsWithStands: [...standsOfStation.entries()].slice(0, 5).map(([osmId, standIds]) => {
      const station = stopsById.get(osmId);
      return { osmId, lon: station?.lon, lat: station?.lat, name: station?.name, standCount: standIds.size };
    }),
  };
}
