// Renders real OSM stops (DESIGN.md §4: "Real OSM stops, plus stops the
// player places") loaded from the pipeline's stops.bin. This is read-only
// display of imported data — placing new stops with kerb snapping is a
// separate, later increment.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { decode_stops, decode_stop_areas, decode_railway_stations, decode_tram_stops } from "./wasm/game_wasm.js";
import { routeDrawState } from "./route-draw";
import { createDropdown } from "./dropdown";
import { PICKUP_DROPOFF_LABELS, type PickupDropoffOrBoth } from "./pickup-dropoff";
import {
  computeStopCallingServices,
  formatClockMinutes,
  DAY_TYPE_SHORT_LABELS,
  type StopCallingService,
} from "./stop-calling-services.mts";

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

// Lets other modules (the route-draw panel's per-stop "Edit" button) open
// a stop or station's own popup without duplicating the popup-building
// logic — set once `drawStops` has built it, left null until then.
export const stopsPanelState: {
  openPopupFor: ((osmId: number) => void) | null;
  displayNameFor: ((osmId: number) => string) | null;
} = {
  openPopupFor: null,
  displayNameFor: null,
};

// Every bus station, for anything that needs to offer a station picker
// (currently: the depot groups panel's main-bus-station field, DESIGN.md
// §6). Populated once `drawStops` has decoded stops.bin; empty until then.
export interface BusStationSummary {
  osmId: number;
  name: string;
  lon: number;
  lat: number;
}
export const busStationsState: BusStationSummary[] = [];

// Blue for a stop at least one service uses, grey otherwise.
const stopColorExpression = ["case", ["get", "usedByService"], "#1677ff", "#8c8c8c"];
// Bus stations get their own colour, distinct from the navies fixed real
// contracts reserve their stops in (398 #002664, Airlink 100 #002b4e —
// DESIGN.md §10) — DESIGN.md §4's other three categories (railway
// #ff4200, airport #059669, park and ride #db2777) get the same ring
// treatment once each has its own linking; Glasgow Subway (#F57C14) and
// trams (#8A0D04) aren't in that DESIGN.md list but follow the identical
// pattern, all colours confirmed directly with the user.
const BUS_STATION_COLOR = "#7c3aed";
const RAILWAY_LINK_COLOR = "#ff4200";
const SUBWAY_LINK_COLOR = "#F57C14";
const TRAM_LINK_COLOR = "#8A0D04";
// A stop's link to a nearby railway/subway station or tram stop is a
// manual player choice via the override layer, the same mechanism as bus
// station membership below — not computed from proximity. Unlike bus
// station membership, there's no OSM stop_area relation to seed it from
// first: those relations don't reliably pair a bus stop with a rail/
// subway/tram interchange the way they do bus station stands, so this
// starts with nothing linked until the player links it. The picker radius
// below only narrows the dropdown's candidate list — it isn't a cutoff on
// what counts as "linked".
const TRANSIT_LINK_PICKER_RADIUS_M = 500;
// Coloured outline for a stop that's part of a bus station's stand
// grouping, or manually linked to a railway/subway station or tram stop,
// white otherwise — the same marker distinguishes membership wherever
// it's drawn, whether that's the main map (an "always show" station) or
// the temporary reveal-on-click layer. Bus station membership wins over a
// transit link if a stop somehow has both.
const stopStrokeExpression = [
  "case",
  ["get", "partOfStation"],
  BUS_STATION_COLOR,
  ["!=", ["get", "linkedTransitColor"], null],
  ["get", "linkedTransitColor"],
  "#ffffff",
];
const stopStrokeWidthExpression = [
  "case",
  ["any", ["get", "partOfStation"], ["!=", ["get", "linkedTransitColor"], null]],
  1.5,
  1,
];

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

interface DecodedRailwayStation {
  lon: number;
  lat: number;
  kind: "station" | "halt" | "subway";
  name: string | null;
  osmId: number;
}

interface DecodedTramStop {
  lon: number;
  lat: number;
  name: string | null;
  osmId: number;
}

interface TransitTarget {
  lon: number;
  lat: number;
  name: string | null;
  color: string;
  kindLabel: string;
}

// Every railway/subway station and tram stop, keyed by its own osmId — the
// full set of candidates a stop can be manually linked to. No distance
// filtering here; that only happens when populating one stop's dropdown.
function buildTransitTargets(
  railwayStations: readonly DecodedRailwayStation[],
  tramStops: readonly DecodedTramStop[],
): Map<number, TransitTarget> {
  const targets = new Map<number, TransitTarget>();
  for (const s of railwayStations) {
    targets.set(s.osmId, {
      lon: s.lon,
      lat: s.lat,
      name: s.name,
      color: s.kind === "subway" ? SUBWAY_LINK_COLOR : RAILWAY_LINK_COLOR,
      kindLabel: s.kind === "subway" ? "Subway station" : s.kind === "halt" ? "Railway halt" : "Railway station",
    });
  }
  for (const s of tramStops) {
    targets.set(s.osmId, { lon: s.lon, lat: s.lat, name: s.name, color: TRAM_LINK_COLOR, kindLabel: "Tram stop" });
  }
  return targets;
}

export async function drawStops(map: maplibregl.Map): Promise<void> {
  const res = await fetch("http://127.0.0.1:38271/stops.bin");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const stops = decode_stops(bytes) as DecodedStop[];
  const stopAreas = decode_stop_areas(bytes) as DecodedStopArea[];

  const railwayRes = await fetch("http://127.0.0.1:38271/railway.bin");
  const railwayBytes = new Uint8Array(await railwayRes.arrayBuffer());
  const railwayStations = decode_railway_stations(railwayBytes) as DecodedRailwayStation[];
  const tramStops = decode_tram_stops(railwayBytes) as DecodedTramStop[];
  const transitTargets = buildTransitTargets(railwayStations, tramStops);

  // stop osmId -> linked railway/subway station or tram stop's osmId,
  // purely the player's manual choice (see TRANSIT_LINK_PICKER_RADIUS_M's
  // comment) — seeded only from the override layer, nothing computed.
  const transitLinkOfStop = new Map<number, number>();
  for (const { osmId, value } of await window.overrides.list<number | null>("stop", "transit_link")) {
    if (value === null) transitLinkOfStop.delete(osmId);
    else transitLinkOfStop.set(osmId, value);
  }
  const linkedTransitColorOfStop = (osmId: number): string | null => {
    const targetId = transitLinkOfStop.get(osmId);
    return targetId === undefined ? null : (transitTargets.get(targetId)?.color ?? null);
  };

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

  // Rename and hide (this section, plus the stops panel below) — the same
  // override layer as everything else here: original OSM data untouched,
  // overrides stored separately and always resettable. A stop or bus
  // station uses "stop"/"bus_station" as its entity_type depending on
  // `kind`, matching the split already established by `always_show_stands`.
  const entityTypeFor = (s: DecodedStop): "stop" | "bus_station" =>
    s.kind === "bus_station" ? "bus_station" : "stop";

  const nameOverrides = new Map<number, string>();
  for (const entityType of ["stop", "bus_station"] as const) {
    for (const { osmId, value } of await window.overrides.list<string>(entityType, "name")) {
      nameOverrides.set(osmId, value);
    }
  }
  const hidden = new Set<number>();
  for (const entityType of ["stop", "bus_station"] as const) {
    for (const { osmId, value } of await window.overrides.list<boolean>(entityType, "hidden")) {
      if (value) hidden.add(osmId);
    }
  }

  const displayName = (s: DecodedStop): string =>
    nameOverrides.get(s.osmId) ?? s.name ?? (s.kind === "bus_station" ? "Bus station" : s.kind === "platform" ? "Platform" : "Bus stop");

  busStationsState.length = 0;
  for (const s of stations) {
    busStationsState.push({ osmId: s.osmId, name: displayName(s), lon: s.lon, lat: s.lat });
  }
  busStationsState.sort((a, b) => a.name.localeCompare(b.name));

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
      name: displayName(s),
      osmId: s.osmId,
      usedByService: isUsedByService(s.osmId),
      partOfStation: stationOfStop.has(s.osmId),
      linkedTransitColor: linkedTransitColorOfStop(s.osmId),
    },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
  });

  const emptyGeojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

  const visibleStops = () =>
    stops.filter((s) => {
      if (s.kind === "bus_station") return false;
      if (hidden.has(s.osmId)) return false;
      const stationId = stationOfStop.get(s.osmId);
      return stationId === undefined || alwaysShow.get(stationId) === true;
    });

  const visibleStations = () => stations.filter((s) => !hidden.has(s.osmId));

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
      data: { type: "FeatureCollection", features: visibleStations().map(toFeature) },
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
        "circle-color": BUS_STATION_COLOR,
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
        "circle-stroke-color": BUS_STATION_COLOR,
        "circle-stroke-width": 1.5,
      },
    });

    // Shown only while the "Hidden stops" panel is open (populated by
    // refreshHiddenPanel below) — hidden stops otherwise stay genuinely
    // invisible, this is just a "here's where they are" preview.
    map.addSource("hidden-stops-preview", { type: "geojson", data: emptyGeojson });
    map.addLayer({
      id: "hidden-stops-preview",
      type: "circle",
      source: "hidden-stops-preview",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 17, 8],
        "circle-color": "#f87171",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });

    const refreshStopsSource = () => {
      (map.getSource("stops") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: visibleStops().map(toFeature),
      });
      (map.getSource("stop-stations") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: visibleStations().map(toFeature),
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

    // Rename (pencil icon, click to edit, Enter or the pencil again to save
    // and exit) and hide/unhide — both live on the stop's own popup now,
    // not in a list, per feedback. `onHideToggled` lets whichever popup
    // built this row also refresh the hidden-stops panel below if it's open.
    const PENCIL_SVG =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>';

    const buildTitleRow = (stop: DecodedStop, onHideToggled: () => void): HTMLElement => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.marginBottom = "8px";

      const titleText = document.createElement("span");
      titleText.style.fontWeight = "600";
      titleText.style.fontSize = "13px";
      titleText.style.flex = "1";
      titleText.textContent = displayName(stop);

      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.className = "field";
      titleInput.style.flex = "1";
      titleInput.style.display = "none";

      const exitEditMode = () => {
        titleInput.style.display = "none";
        titleText.style.display = "";
      };
      const commitRename = () => {
        const value = titleInput.value.trim();
        const entityType = entityTypeFor(stop);
        if (value === "" || value === stop.name) {
          nameOverrides.delete(stop.osmId);
          void window.overrides.reset(entityType, stop.osmId, "name");
        } else {
          nameOverrides.set(stop.osmId, value);
          void window.overrides.set(entityType, stop.osmId, "name", value);
        }
        titleText.textContent = displayName(stop);
        exitEditMode();
        refreshStopsSource();
      };
      const enterEditMode = () => {
        titleInput.value = displayName(stop);
        titleText.style.display = "none";
        titleInput.style.display = "";
        titleInput.focus();
        titleInput.select();
      };

      const pencilButton = document.createElement("button");
      pencilButton.type = "button";
      pencilButton.className = "btn btn-icon";
      pencilButton.title = "Rename";
      pencilButton.innerHTML = PENCIL_SVG;
      pencilButton.addEventListener("click", () => {
        if (titleInput.style.display === "none") enterEditMode();
        else commitRename();
      });
      titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commitRename();
        else if (e.key === "Escape") exitEditMode();
      });

      const hideButton = document.createElement("button");
      hideButton.type = "button";
      hideButton.className = "btn btn-icon";
      const updateHideLabel = () => {
        const isHidden = hidden.has(stop.osmId);
        hideButton.textContent = isHidden ? "Unhide" : "Hide";
        hideButton.title = isHidden ? "Show this stop on the map again" : "Hide this stop from the map";
      };
      updateHideLabel();
      hideButton.addEventListener("click", () => {
        const entityType = entityTypeFor(stop);
        if (hidden.has(stop.osmId)) {
          hidden.delete(stop.osmId);
          void window.overrides.set(entityType, stop.osmId, "hidden", false);
        } else {
          hidden.add(stop.osmId);
          void window.overrides.set(entityType, stop.osmId, "hidden", true);
        }
        updateHideLabel();
        refreshStopsSource();
        onHideToggled();
      });

      row.appendChild(titleText);
      row.appendChild(titleInput);
      row.appendChild(pencilButton);
      row.appendChild(hideButton);
      return row;
    };

    // Read-only "which services call here" (T29, OPEN-ITEMS.md) — the list
    // itself, with no heading, so a single stop's popup and a station's
    // per-stand grouping (below) can each wrap it with their own heading
    // rather than duplicating "Calling services" once per stand.
    const buildServicesList = (services: StopCallingService[]): HTMLElement => {
      if (services.length === 0) {
        const empty = document.createElement("div");
        empty.style.fontSize = "11px";
        empty.style.color = "var(--text-muted)";
        empty.textContent = "No services call here yet.";
        return empty;
      }

      const list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "4px";

      let lastRouteId: number | null = null;
      for (const svc of services) {
        const row = document.createElement("div");
        row.style.fontSize = "11px";

        if (svc.routeId !== lastRouteId) {
          const swatch = document.createElement("span");
          swatch.style.display = "inline-block";
          swatch.style.width = "8px";
          swatch.style.height = "8px";
          swatch.style.borderRadius = "50%";
          swatch.style.backgroundColor = svc.routeColour;
          swatch.style.marginRight = "4px";
          row.appendChild(swatch);
          const numberSpan = document.createElement("strong");
          numberSpan.textContent = svc.routeNumber;
          row.appendChild(numberSpan);
          row.appendChild(document.createTextNode(" "));
          lastRouteId = svc.routeId;
        } else {
          row.style.paddingLeft = "12px";
        }
        row.appendChild(
          document.createTextNode(
            `${DAY_TYPE_SHORT_LABELS[svc.dayType]}: ${svc.departureClockMinutes.map(formatClockMinutes).join(", ")}`,
          ),
        );
        list.appendChild(row);
      }
      return list;
    };

    // A single stop/stand's own calling services, fetched fresh each time
    // (routes and their timetables can change while the map stays open, and
    // this popup is opened rarely enough that refetching costs nothing).
    const buildCallingServicesSection = async (osmId: number): Promise<HTMLElement> => {
      const section = document.createElement("div");
      section.style.marginTop = "10px";
      section.style.paddingTop = "10px";
      section.style.borderTop = "1px solid var(--border)";
      const heading = document.createElement("div");
      heading.className = "label-muted";
      heading.textContent = "Calling services";
      section.appendChild(heading);

      const [routes, timetables] = await Promise.all([window.routes.list(), window.routeTimetables.listAll()]);
      const services = computeStopCallingServices(osmId, routes, timetables);
      const listWrap = document.createElement("div");
      listWrap.style.maxHeight = "160px";
      listWrap.style.overflowY = "auto";
      listWrap.style.marginTop = "4px";
      listWrap.appendChild(buildServicesList(services));
      section.appendChild(listWrap);
      return section;
    };

    // A bus station's calling services, grouped by stand (T29: "grouped by
    // stand at a station") — every stop currently assigned to this station,
    // each with its own sub-heading, stands with no services omitted rather
    // than shown empty.
    const buildStationCallingServicesSection = async (stationOsmId: number): Promise<HTMLElement> => {
      const section = document.createElement("div");
      section.style.marginTop = "10px";
      section.style.paddingTop = "10px";
      section.style.borderTop = "1px solid var(--border)";
      const heading = document.createElement("div");
      heading.className = "label-muted";
      heading.textContent = "Calling services";
      section.appendChild(heading);

      const [routes, timetables] = await Promise.all([window.routes.list(), window.routeTimetables.listAll()]);
      const standsWithServices = stops
        .filter((s) => stationOfStop.get(s.osmId) === stationOsmId)
        .map((stand) => ({ stand, services: computeStopCallingServices(stand.osmId, routes, timetables) }))
        .filter((x) => x.services.length > 0)
        .sort((a, b) => displayName(a.stand).localeCompare(displayName(b.stand)));

      const listWrap = document.createElement("div");
      listWrap.style.maxHeight = "220px";
      listWrap.style.overflowY = "auto";
      listWrap.style.marginTop = "4px";
      listWrap.style.display = "flex";
      listWrap.style.flexDirection = "column";
      listWrap.style.gap = "8px";

      if (standsWithServices.length === 0) {
        const empty = document.createElement("div");
        empty.style.fontSize = "11px";
        empty.style.color = "var(--text-muted)";
        empty.textContent = "No services call at any stand here yet.";
        listWrap.appendChild(empty);
      } else {
        for (const { stand, services } of standsWithServices) {
          const standBlock = document.createElement("div");
          const standHeading = document.createElement("div");
          standHeading.style.fontSize = "11px";
          standHeading.style.fontWeight = "600";
          standHeading.textContent = displayName(stand);
          standBlock.appendChild(standHeading);
          standBlock.appendChild(buildServicesList(services));
          listWrap.appendChild(standBlock);
        }
      }
      section.appendChild(listWrap);
      return section;
    };

    const closeStationPopup = () => {
      stationPopup?.remove();
      stationPopup = null;
      openStationOsmId = null;
      refreshStandsSource();
    };

    const openStationPopup = async (stop: DecodedStop) => {
      stopPopup?.remove();
      const osmId = stop.osmId;
      const coords: [number, number] = [stop.lon, stop.lat];

      const container = document.createElement("div");
      container.style.minWidth = "220px";
      container.appendChild(buildTitleRow(stop, refreshHiddenPanel));

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
      container.appendChild(await buildStationCallingServicesSection(osmId));

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
      const stop = stopsById.get(osmId);
      if (!stop) return;
      openStationOsmId = osmId;
      refreshStandsSource();
      void openStationPopup(stop);
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
    const openStopPopup = async (stop: DecodedStop) => {
      stationPopup?.remove();
      const osmId = stop.osmId;
      const coords: [number, number] = [stop.lon, stop.lat];

      // Within 1000m only — a station on the other side of the city was
      // never a real candidate, just clutter (and, before this, some were
      // 20km+ away). The currently-assigned station is kept regardless of
      // distance so the picker never silently misrepresents a real
      // assignment as "(not part of a station)".
      const STATION_PICKER_RADIUS_M = 1000;
      const currentId = stationOfStop.get(osmId) ?? null;
      const nearestStations = stations
        .map((st) => ({ st, dist: approxDistanceM(coords, [st.lon, st.lat]) }))
        .filter((s) => s.dist <= STATION_PICKER_RADIUS_M || s.st.osmId === currentId)
        .sort((a, b) => a.dist - b.dist);

      const container = document.createElement("div");
      container.style.minWidth = "220px";
      container.appendChild(buildTitleRow(stop, refreshHiddenPanel));

      const NONE_LABEL = "(not part of a station)";
      const labelToStationId = new Map<string, number | null>([[NONE_LABEL, null]]);
      for (const { st, dist } of nearestStations) {
        labelToStationId.set(`${displayName(st)} (${Math.round(dist)} m)`, st.osmId);
      }
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

      // Manual link to a nearby railway/subway station or tram stop — same
      // manual-only mechanism as the bus station dropdown above (see the
      // comment on TRANSIT_LINK_PICKER_RADIUS_M): never computed from
      // proximity, only ever set here.
      const currentTransitTargetId = transitLinkOfStop.get(osmId) ?? null;
      const NO_TRANSIT_LINK_LABEL = "(not linked)";
      const labelToTransitTargetId = new Map<string, number | null>([[NO_TRANSIT_LINK_LABEL, null]]);
      const nearbyTransitTargets = [...transitTargets.entries()]
        .map(([id, t]) => ({ id, t, dist: approxDistanceM(coords, [t.lon, t.lat]) }))
        .filter((c) => c.dist <= TRANSIT_LINK_PICKER_RADIUS_M || c.id === currentTransitTargetId)
        .sort((a, b) => a.dist - b.dist);
      for (const { id, t, dist } of nearbyTransitTargets) {
        labelToTransitTargetId.set(`${t.name ?? t.kindLabel} (${t.kindLabel}, ${Math.round(dist)} m)`, id);
      }
      const currentTransitLabel =
        [...labelToTransitTargetId.entries()].find(([, id]) => id === currentTransitTargetId)?.[0] ??
        NO_TRANSIT_LINK_LABEL;

      const transitLinkLabel = document.createElement("div");
      transitLinkLabel.className = "label-muted";
      transitLinkLabel.style.marginTop = "6px";
      transitLinkLabel.textContent = "Linked railway / subway / tram stop";
      container.appendChild(transitLinkLabel);

      const transitDropdown = createDropdown(
        [...labelToTransitTargetId.keys()],
        currentTransitLabel,
        (chosenLabel) => {
          const value = labelToTransitTargetId.get(chosenLabel) ?? null;
          if (value === null) transitLinkOfStop.delete(osmId);
          else transitLinkOfStop.set(osmId, value);
          void window.overrides.set("stop", osmId, "transit_link", value);
          refreshStopsSource();
        },
      );
      transitDropdown.el.style.width = "100%";
      container.appendChild(transitDropdown.el);

      // The stop's own global pick-up/set-down default (DESIGN.md §6's
      // per-express-variation lists are a separate, route-scoped thing —
      // this is the stop's own physical default, e.g. a stance that's
      // always pick-up only). A route can still override this for itself
      // (route-panel.ts's locked stop list), which wins over this default.
      const pickupDropoffLabel = document.createElement("div");
      pickupDropoffLabel.className = "label-muted";
      pickupDropoffLabel.style.marginTop = "6px";
      pickupDropoffLabel.textContent = "Pick-up / set-down (this stop, all routes)";
      container.appendChild(pickupDropoffLabel);

      const currentPickupDropoff =
        (await window.overrides.get<PickupDropoffOrBoth>("stop", osmId, "pickupDropoff")) ?? "both";
      const pickupDropoffDropdown = createDropdown(
        Object.values(PICKUP_DROPOFF_LABELS),
        PICKUP_DROPOFF_LABELS[currentPickupDropoff],
        (chosenLabel) => {
          const value = (Object.entries(PICKUP_DROPOFF_LABELS).find(([, l]) => l === chosenLabel)?.[0] ??
            "both") as PickupDropoffOrBoth;
          if (value === "both") void window.overrides.reset("stop", osmId, "pickupDropoff");
          else void window.overrides.set("stop", osmId, "pickupDropoff", value);
        },
      );
      pickupDropoffDropdown.el.style.width = "100%";
      container.appendChild(pickupDropoffDropdown.el);
      container.appendChild(await buildCallingServicesSection(osmId));

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
        const osmId = feature?.properties?.osmId as number | undefined;
        const stop = osmId === undefined ? undefined : stopsById.get(osmId);
        if (stop) void openStopPopup(stop);
      });
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    stopsPanelState.openPopupFor = (osmId: number) => {
      const stop = stopsById.get(osmId);
      if (!stop) return;
      if (stop.kind === "bus_station") {
        openStationOsmId = osmId;
        refreshStandsSource();
        void openStationPopup(stop);
      } else {
        void openStopPopup(stop);
      }
    };
    stopsPanelState.displayNameFor = (osmId: number) => {
      const stop = stopsById.get(osmId);
      return stop ? displayName(stop) : `Stop ${osmId}`;
    };

    // Hidden-stops panel: rename and hide now live on each stop's own
    // popup (buildTitleRow above) — this bottom panel is only for finding
    // and unhiding whatever's currently hidden, per feedback that the list
    // shouldn't double as a general editor.
    const hiddenToggle = document.createElement("button");
    hiddenToggle.className = "btn";
    hiddenToggle.textContent = "Hidden stops";
    // Bottom-right, not bottom-left: the route panel (DESIGN.md §11) now
    // occupies the full left-hand height, which would otherwise sit under
    // this corner.
    hiddenToggle.style.position = "absolute";
    hiddenToggle.style.bottom = "8px";
    hiddenToggle.style.right = "8px";
    hiddenToggle.style.zIndex = "2";
    document.body.appendChild(hiddenToggle);

    const hiddenPanel = document.createElement("div");
    hiddenPanel.className = "panel";
    hiddenPanel.style.position = "absolute";
    hiddenPanel.style.bottom = "44px";
    hiddenPanel.style.right = "8px";
    hiddenPanel.style.zIndex = "2";
    hiddenPanel.style.width = "300px";
    hiddenPanel.style.maxHeight = "70vh";
    hiddenPanel.style.flexDirection = "column";
    // Visibility is driven by `style.display`, not the `hidden` attribute:
    // an inline `display` (needed here for the flex column layout) beats
    // the `[hidden]` UA rule's `display: none` on specificity, so setting
    // `.hidden = true` alone silently did nothing visually — the exact bug
    // behind "the stops menu doesn't close".
    let hiddenPanelOpen = false;
    hiddenPanel.style.display = "none";
    document.body.appendChild(hiddenPanel);

    const hiddenPanelHeader = document.createElement("div");
    hiddenPanelHeader.className = "panel-header";
    hiddenPanelHeader.textContent = "Hidden stops";
    hiddenPanel.appendChild(hiddenPanelHeader);

    const hiddenPanelList = document.createElement("div");
    hiddenPanelList.className = "panel-section";
    hiddenPanelList.style.overflowY = "auto";
    hiddenPanelList.style.padding = "0";
    hiddenPanel.appendChild(hiddenPanelList);

    const refreshHiddenPreview = (hiddenStops: DecodedStop[]) => {
      (map.getSource("hidden-stops-preview") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: hiddenStops.map((s) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        })),
      });
    };

    function refreshHiddenPanel(): void {
      if (!hiddenPanelOpen) return;
      hiddenPanelList.innerHTML = "";

      const hiddenStops = [...hidden]
        .map((osmId) => stopsById.get(osmId))
        .filter((s): s is DecodedStop => s !== undefined)
        .sort((a, b) => displayName(a).localeCompare(displayName(b)));

      refreshHiddenPreview(hiddenStops);

      if (hiddenStops.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "8px 12px";
        empty.style.color = "var(--text-muted)";
        empty.textContent = "No stops are hidden.";
        hiddenPanelList.appendChild(empty);
        return;
      }

      for (const s of hiddenStops) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "6px";
        row.style.alignItems = "center";
        row.style.padding = "6px 12px";
        row.style.borderBottom = "1px solid var(--border)";
        row.style.cursor = "pointer";
        row.title = "Jump to this stop";
        row.addEventListener("click", () => {
          map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16) });
        });

        const nameText = document.createElement("div");
        nameText.style.flex = "1";
        nameText.textContent = displayName(s);
        row.appendChild(nameText);

        const unhideButton = document.createElement("button");
        unhideButton.className = "btn btn-icon";
        unhideButton.textContent = "Unhide";
        unhideButton.addEventListener("click", (e) => {
          e.stopPropagation();
          hidden.delete(s.osmId);
          void window.overrides.set(entityTypeFor(s), s.osmId, "hidden", false);
          refreshStopsSource();
          refreshHiddenPanel();
        });
        row.appendChild(unhideButton);

        hiddenPanelList.appendChild(row);
      }
      const last = hiddenPanelList.lastElementChild as HTMLElement | null;
      if (last) last.style.borderBottom = "none";
    }

    hiddenToggle.addEventListener("click", () => {
      hiddenPanelOpen = !hiddenPanelOpen;
      hiddenPanel.style.display = hiddenPanelOpen ? "flex" : "none";
      hiddenToggle.classList.toggle("is-active", hiddenPanelOpen);
      if (hiddenPanelOpen) refreshHiddenPanel();
      else refreshHiddenPreview([]);
    });
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
