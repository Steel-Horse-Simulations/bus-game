// Renders real OSM stops (DESIGN.md §4: "Real OSM stops, plus stops the
// player places") loaded from the pipeline's stops.bin. This is read-only
// display of imported data — placing new stops with kerb snapping is a
// separate, later increment.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import {
  decode_stops,
  decode_stop_areas,
  decode_railway_stations,
  decode_tram_stops,
  type Router,
} from "./wasm/game_wasm.js";
import { routeDrawState } from "./route-draw";
import { createDropdown } from "./dropdown";
import { PICKUP_DROPOFF_LABELS, type PickupDropoffOrBoth } from "./pickup-dropoff";
import {
  computeStopCallingServices,
  formatClockMinutes,
  DAY_TYPE_SHORT_LABELS,
  type StopCallingService,
} from "./stop-calling-services.mts";
import { buildRouteTimetableGrid } from "./route-timetable-grid.mts";
import { pickContrastColorForHex } from "./icon-contrast";

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

// Mirrors routeDrawState's own shape: true while the "Place stop" tool is
// armed, so a click kerb-snaps a new player-placed stop (DESIGN.md §4)
// instead of doing whatever a plain click would otherwise do.
export const placeStopState = { isPlacing: false };

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
// Grouped stops (DESIGN.md §4, "several shelters serving one location") —
// a plain slate rather than the bus station's purple, since a group isn't
// a real bus station, just a decluttering convenience over an OSM
// stop_area relation with no bus_station member.
const STOP_GROUP_COLOR = "#64748b";
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
// grouping, a plain grouped-stop cluster, or manually linked to a
// railway/subway station or tram stop, white otherwise — the same marker
// distinguishes membership wherever it's drawn, whether that's the main
// map (an "always show" station/group) or the temporary reveal-on-click
// layer. Priority where a stop somehow qualifies for more than one:
// bus station > grouped stop > transit link.
const stopStrokeExpression = [
  "case",
  ["get", "partOfStation"],
  BUS_STATION_COLOR,
  ["get", "partOfGroup"],
  STOP_GROUP_COLOR,
  ["!=", ["get", "linkedTransitColor"], null],
  ["get", "linkedTransitColor"],
  "#ffffff",
];
const stopStrokeWidthExpression = [
  "case",
  ["any", ["get", "partOfStation"], ["get", "partOfGroup"], ["!=", ["get", "linkedTransitColor"], null]],
  1.5,
  1,
];
// A bus station's own base ring is already 1.5 (unlinked, white) — thicker
// than a plain stop's 1 — so a linked station needs its own slightly
// thicker step to stay visually distinct from that base ring.
// 2.5 read as visibly uneven at typical zoom — a thin stroke on a small
// circle antialiases unevenly at ordinary screen resolution regardless of
// the underlying render being mathematically symmetric (confirmed by
// direct pixel measurement, not just eyeballing a screenshot); a thicker
// ring reads more cleanly rather than trying to fix antialiasing itself.
const stationStrokeWidthExpression = ["case", ["!=", ["get", "linkedTransitColor"], null], 3.5, 1.5];

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

export async function drawStops(map: maplibregl.Map, router: Router): Promise<void> {
  const res = await fetch("http://127.0.0.1:38271/stops.bin");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const stops = decode_stops(bytes) as DecodedStop[];
  const stopAreas = decode_stop_areas(bytes) as DecodedStopArea[];

  // Stops the player has placed directly (DESIGN.md §4) — kerb-snapped by
  // the router at creation time (see the "Place stop" tool below), so they
  // need no further geometry work here, just merging into the same "stops"
  // array everything else in this function already treats uniformly. Their
  // osmId is always negative (electron/db.mts's player_stops table), so it
  // can never collide with a real (always-positive) OSM id.
  const playerStops = await window.playerStops.list();
  const playerStopBusLegal = new Map<number, boolean>();
  for (const p of playerStops) {
    stops.push({ lon: p.lon, lat: p.lat, kind: "bus_stop", name: null, osmId: p.osmId });
    playerStopBusLegal.set(p.osmId, p.busLegal);
  }

  const railwayRes = await fetch("http://127.0.0.1:38271/railway.bin");
  const railwayBytes = new Uint8Array(await railwayRes.arrayBuffer());
  const railwayStations = decode_railway_stations(railwayBytes) as DecodedRailwayStation[];
  const tramStops = decode_tram_stops(railwayBytes) as DecodedTramStop[];
  const transitTargets = buildTransitTargets(railwayStations, tramStops);

  // stop or bus station osmId -> linked railway/subway station or tram
  // stop's osmId, purely the player's manual choice (see
  // TRANSIT_LINK_PICKER_RADIUS_M's comment) — seeded only from the
  // override layer, nothing computed. Covers both entity types: a plain
  // stop/stand links to the platform passengers actually board from, and a
  // whole bus station can separately be linked too — the stop feeding
  // people transferring to/from the station complex itself is a different
  // real-world thing from any one stand's own link.
  const transitLinkOfStop = new Map<number, number>();
  for (const entityType of ["stop", "bus_station"] as const) {
    for (const { osmId, value } of await window.overrides.list<number | null>(entityType, "transit_link")) {
      if (value === null) transitLinkOfStop.delete(osmId);
      else transitLinkOfStop.set(osmId, value);
    }
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

  // Grouped stops (DESIGN.md §4: "several shelters serving one location...
  // Union Street in Aberdeen is the reference case") — a stop_area
  // relation with no bus_station member at all still groups its own
  // members for decluttering, the identical reveal-on-click pattern as a
  // bus station, just under its own colour and entity type since it isn't
  // one. This is the overwhelming majority of real stop_area relations
  // (19,396 of 19,398 in the current extract have no bus_station member),
  // previously silently skipped entirely — only a relation that *does*
  // name a bus_station member goes through the path above instead, so a
  // stop is never claimed by both. A relation with fewer than two real
  // (non-bus_station) members isn't worth grouping — nothing to declutter.
  // No manual membership editing yet (unlike bus stations' explicit
  // reassignment) — DESIGN.md only describes this as OSM-seeded.
  interface StopGroup {
    osmId: number;
    name: string | null;
    lon: number;
    lat: number;
  }
  const groupOfStop = new Map<number, number>();
  const stopGroupsById = new Map<number, StopGroup>();
  for (const area of stopAreas) {
    if (area.memberOsmIds.some((id) => stationOsmIds.has(id))) continue;
    const members = area.memberOsmIds
      .map((id) => stopsById.get(id))
      .filter((s): s is DecodedStop => s !== undefined && s.kind !== "bus_station");
    if (members.length < 2) continue;
    const lon = members.reduce((sum, s) => sum + s.lon, 0) / members.length;
    const lat = members.reduce((sum, s) => sum + s.lat, 0) / members.length;
    stopGroupsById.set(area.osmId, { osmId: area.osmId, name: area.name, lon, lat });
    for (const s of members) groupOfStop.set(s.osmId, area.osmId);
  }
  const stopGroups = [...stopGroupsById.values()];

  const alwaysShowGroupEntries = await window.overrides.list<boolean>("stop_group", "always_show_members");
  const alwaysShowGroup = new Map(alwaysShowGroupEntries.map(({ osmId, value }) => [osmId, value]));

  // Rename and hide (this section, plus the stops panel below) — the same
  // override layer as everything else here: original OSM data untouched,
  // overrides stored separately and always resettable. A stop or bus
  // station uses "stop"/"bus_station" as its entity_type depending on
  // `kind`, matching the split already established by `always_show_stands`.
  const entityTypeFor = (s: DecodedStop): "stop" | "bus_station" =>
    s.kind === "bus_station" ? "bus_station" : "stop";

  const nameOverrides = new Map<number, string>();
  for (const entityType of ["stop", "bus_station", "stop_group"] as const) {
    for (const { osmId, value } of await window.overrides.list<string>(entityType, "name")) {
      nameOverrides.set(osmId, value);
    }
  }
  const hidden = new Set<number>();
  for (const entityType of ["stop", "bus_station", "stop_group"] as const) {
    for (const { osmId, value } of await window.overrides.list<boolean>(entityType, "hidden")) {
      if (value) hidden.add(osmId);
    }
  }

  const displayName = (s: DecodedStop): string =>
    nameOverrides.get(s.osmId) ?? s.name ?? (s.kind === "bus_station" ? "Bus station" : s.kind === "platform" ? "Platform" : "Bus stop");
  const groupDisplayName = (g: StopGroup): string => nameOverrides.get(g.osmId) ?? g.name ?? "Grouped stop";

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
      partOfGroup: groupOfStop.has(s.osmId),
      linkedTransitColor: linkedTransitColorOfStop(s.osmId),
    },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
  });

  const groupToFeature = (g: StopGroup): GeoJSON.Feature => ({
    type: "Feature",
    properties: { osmId: g.osmId, name: groupDisplayName(g) },
    geometry: { type: "Point", coordinates: [g.lon, g.lat] },
  });

  const emptyGeojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

  const visibleStops = () =>
    stops.filter((s) => {
      if (s.kind === "bus_station") return false;
      if (hidden.has(s.osmId)) return false;
      const stationId = stationOfStop.get(s.osmId);
      if (stationId !== undefined) return alwaysShow.get(stationId) === true;
      const groupId = groupOfStop.get(s.osmId);
      if (groupId !== undefined) return alwaysShowGroup.get(groupId) === true;
      return true;
    });

  const visibleStations = () => stations.filter((s) => !hidden.has(s.osmId));
  const visibleGroups = () => stopGroups.filter((g) => !hidden.has(g.osmId));

  let openStationOsmId: number | null = null;
  let openGroupOsmId: number | null = null;
  let stationPopup: maplibregl.Popup | null = null;
  let stopPopup: maplibregl.Popup | null = null;
  let groupPopup: maplibregl.Popup | null = null;

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

    map.addSource("stop-groups", {
      type: "geojson",
      data: { type: "FeatureCollection", features: visibleGroups().map(groupToFeature) },
    });
    // Populated on demand when a group without "always show" set is
    // clicked — mirrors "station-stands" exactly, just keyed by group.
    map.addSource("group-members", { type: "geojson", data: emptyGeojson });

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
        // A station linked to a railway/subway/tram stop gets the same
        // coloured ring an individual linked stop would, white otherwise —
        // this is the station complex's own link, separate from any one
        // stand's (see buildTransitLinkSection's comment).
        "circle-stroke-color": stopStrokeExpression as maplibregl.DataDrivenPropertyValueSpecification<string>,
        "circle-stroke-width": stationStrokeWidthExpression as maplibregl.DataDrivenPropertyValueSpecification<number>,
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

    // Grouped stops: same visual weight as a bus station's own marker
    // (bigger, visible from further out) but in the group's own slate
    // colour, never purple, so the two are never confused on the map.
    map.addLayer({
      id: "stop-groups-points",
      type: "circle",
      source: "stop-groups",
      minzoom: 12,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 17, 7],
        "circle-color": STOP_GROUP_COLOR,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "group-members-points",
      type: "circle",
      source: "group-members",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 6],
        "circle-color": stopColorExpression as maplibregl.DataDrivenPropertyValueSpecification<string>,
        "circle-stroke-color": STOP_GROUP_COLOR,
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
      (map.getSource("stop-groups") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: visibleGroups().map(groupToFeature),
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

    const refreshGroupMembersSource = () => {
      const source = map.getSource("group-members") as maplibregl.GeoJSONSource;
      if (openGroupOsmId === null || alwaysShowGroup.get(openGroupOsmId) === true) {
        source.setData(emptyGeojson);
        return;
      }
      const memberIds = [...groupOfStop.entries()].filter(([, g]) => g === openGroupOsmId).map(([id]) => id);
      const features = memberIds
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

    // Manual link to a nearby railway/subway station or tram stop —
    // shared between a plain stop/stand (the stop passengers actually
    // board from) and a whole bus station (the station complex itself,
    // for a passenger transferring to/from it rather than any one stand)
    // per the user's own distinction. Never computed from proximity, only
    // ever set here — see TRANSIT_LINK_PICKER_RADIUS_M's own comment.
    const buildTransitLinkSection = (
      osmId: number,
      entityType: "stop" | "bus_station",
      coords: [number, number],
    ): HTMLElement => {
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

      const wrap = document.createElement("div");
      const transitLinkLabel = document.createElement("div");
      transitLinkLabel.className = "label-muted";
      transitLinkLabel.style.marginTop = "6px";
      transitLinkLabel.textContent =
        entityType === "bus_station"
          ? "Linked railway / subway / tram stop (this station)"
          : "Linked railway / subway / tram stop";
      wrap.appendChild(transitLinkLabel);

      const transitDropdown = createDropdown(
        [...labelToTransitTargetId.keys()],
        currentTransitLabel,
        (chosenLabel) => {
          const value = labelToTransitTargetId.get(chosenLabel) ?? null;
          if (value === null) transitLinkOfStop.delete(osmId);
          else transitLinkOfStop.set(osmId, value);
          void window.overrides.set(entityType, osmId, "transit_link", value);
          refreshStopsSource();
        },
      );
      transitDropdown.el.style.width = "100%";
      wrap.appendChild(transitDropdown.el);
      return wrap;
    };

    // Full-screen expand (user request): the traditional printed shape
    // (DESIGN.md §7 "The grid" — "stops down and journeys across"), scrolling
    // right for more journeys rather than wrapping to a new line, the same
    // way a real printed timetable spreads across a wide sheet.
    const showRouteTimetableModal = (route: Route, timetable: RouteTimetable): void => {
      const grid = buildRouteTimetableGrid(route, timetable);

      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      overlay.style.zIndex = "1000";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });

      const panel = document.createElement("div");
      panel.className = "panel";
      panel.style.width = "min(98vw, 1800px)";
      panel.style.height = "90vh";
      panel.style.display = "flex";
      panel.style.flexDirection = "column";
      panel.style.padding = "0";
      panel.style.overflow = "hidden";

      // Styled after a real printed operator timetable (reference supplied
      // by the user: Stagecoach Service 28/28A) — a dark masthead carrying
      // the route number and, underneath, a solid day-type band, rather
      // than a plain title bar. The route's own colour stands in for a
      // specific operator's livery colour, since this is a generic style,
      // not a Stagecoach reproduction.
      const masthead = document.createElement("div");
      masthead.style.backgroundColor = "#12131a";
      masthead.style.color = "#ffffff";
      masthead.style.display = "flex";
      masthead.style.alignItems = "center";
      masthead.style.gap = "12px";
      masthead.style.padding = "14px 16px";
      masthead.style.flexShrink = "0";
      const numberBadge = document.createElement("div");
      numberBadge.textContent = route.number;
      numberBadge.style.backgroundColor = route.colour;
      numberBadge.style.color = pickContrastColorForHex(route.colour);
      numberBadge.style.fontWeight = "800";
      numberBadge.style.fontSize = "22px";
      numberBadge.style.padding = "4px 14px";
      numberBadge.style.borderRadius = "4px";
      masthead.appendChild(numberBadge);
      if (route.name) {
        const nameEl = document.createElement("div");
        nameEl.style.fontSize = "14px";
        nameEl.textContent = route.name;
        masthead.appendChild(nameEl);
      }
      const closeButton = document.createElement("button");
      closeButton.className = "btn btn-icon";
      closeButton.textContent = "×";
      closeButton.style.marginLeft = "auto";
      closeButton.style.color = "#ffffff";
      closeButton.addEventListener("click", () => overlay.remove());
      masthead.appendChild(closeButton);
      panel.appendChild(masthead);

      const dayTypeBand = document.createElement("div");
      dayTypeBand.style.backgroundColor = "#1677ff";
      dayTypeBand.style.color = "#ffffff";
      dayTypeBand.style.fontWeight = "700";
      dayTypeBand.style.fontSize = "13px";
      dayTypeBand.style.letterSpacing = "0.05em";
      dayTypeBand.style.padding = "8px 16px";
      dayTypeBand.style.flexShrink = "0";
      dayTypeBand.textContent = DAY_TYPE_SHORT_LABELS[timetable.dayType].toUpperCase();
      panel.appendChild(dayTypeBand);

      const scrollWrap = document.createElement("div");
      scrollWrap.style.overflow = "auto";
      scrollWrap.style.flex = "1";
      scrollWrap.style.padding = "12px 16px";

      const table = document.createElement("table");
      table.style.borderCollapse = "collapse";
      table.style.whiteSpace = "nowrap";
      table.style.fontSize = "12px";

      const tbody = document.createElement("tbody");
      grid.rows.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        // Alternating row shading, same reason a printed timetable does
        // it — a long stop list is hard to track across a wide row of
        // columns without a visual anchor per line.
        if (rowIndex % 2 === 1) tr.style.backgroundColor = "var(--bg-accent)";
        const th = document.createElement("th");
        const rowStop = stopsById.get(row.osmId);
        th.textContent = rowStop ? displayName(rowStop) : `Stop ${row.osmId}`;
        th.style.position = "sticky";
        th.style.left = "0";
        th.style.backgroundColor = "inherit";
        th.style.textAlign = "left";
        th.style.padding = "4px 10px 4px 4px";
        tr.appendChild(th);
        for (const journey of grid.journeys) {
          const td = document.createElement("td");
          const value = journey[rowIndex];
          // HHMM with no colon and a plain hyphen for a gap — matching the
          // reference timetable's own convention exactly, not the HH:MM/
          // em-dash style used elsewhere in this game's own UI (the
          // calling-services list, the family comparison) where a colon
          // reads more easily in a short comma-separated run.
          td.textContent = value === null ? "-" : formatClockMinutes(value).replace(":", "");
          td.style.padding = "4px 10px";
          td.style.textAlign = "center";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scrollWrap.appendChild(table);
      panel.appendChild(scrollWrap);

      if (grid.journeys.length === 0) {
        const empty = document.createElement("div");
        empty.className = "label-muted";
        empty.textContent = "This day type generates no journeys.";
        panel.appendChild(empty);
      }

      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    };

    // Read-only "which services call here" (T29, OPEN-ITEMS.md) — the list
    // itself, with no heading, so a single stop's popup and a station's
    // per-stand grouping (below) can each wrap it with their own heading
    // rather than duplicating "Calling services" once per stand. Needs the
    // full routes/timetables lists (not just the already-computed
    // StopCallingService entries) so its expand button can look up the
    // exact Route/RouteTimetable pair to build the full grid from.
    const buildServicesList = (
      services: StopCallingService[],
      routes: readonly Route[],
      timetables: readonly RouteTimetable[],
    ): HTMLElement => {
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
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "4px";

        if (svc.routeId !== lastRouteId) {
          const swatch = document.createElement("span");
          swatch.style.display = "inline-block";
          swatch.style.width = "8px";
          swatch.style.height = "8px";
          swatch.style.borderRadius = "50%";
          swatch.style.backgroundColor = svc.routeColour;
          row.appendChild(swatch);
          const numberSpan = document.createElement("strong");
          numberSpan.textContent = svc.routeNumber;
          row.appendChild(numberSpan);
          lastRouteId = svc.routeId;
        } else {
          row.style.paddingLeft = "12px";
        }
        row.appendChild(
          document.createTextNode(
            `${DAY_TYPE_SHORT_LABELS[svc.dayType]}: ${svc.departureClockMinutes.map(formatClockMinutes).join(", ")}`,
          ),
        );

        const expandButton = document.createElement("button");
        expandButton.type = "button";
        expandButton.className = "btn btn-icon";
        expandButton.title = "Expand to full timetable";
        expandButton.textContent = "⤢";
        expandButton.style.marginLeft = "auto";
        expandButton.addEventListener("click", () => {
          const route = routes.find((r) => r.id === svc.routeId);
          const timetable = timetables.find((t) => t.routeId === svc.routeId && t.dayType === svc.dayType);
          if (route && timetable) showRouteTimetableModal(route, timetable);
        });
        row.appendChild(expandButton);

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
      listWrap.appendChild(buildServicesList(services, routes, timetables));
      section.appendChild(listWrap);
      return section;
    };

    // Calling services grouped by member stop — shared by a bus station
    // (T29: "grouped by stand at a station") and a plain grouped stop
    // (DESIGN.md §4), the only difference being which member list and
    // empty-state wording the caller supplies. Members with no services
    // are omitted rather than shown empty.
    const buildGroupedCallingServicesSection = async (
      members: readonly DecodedStop[],
      emptyLabel = "No services call here yet.",
    ): Promise<HTMLElement> => {
      const section = document.createElement("div");
      section.style.marginTop = "10px";
      section.style.paddingTop = "10px";
      section.style.borderTop = "1px solid var(--border)";
      const heading = document.createElement("div");
      heading.className = "label-muted";
      heading.textContent = "Calling services";
      section.appendChild(heading);

      const [routes, timetables] = await Promise.all([window.routes.list(), window.routeTimetables.listAll()]);
      const membersWithServices = members
        .map((member) => ({ member, services: computeStopCallingServices(member.osmId, routes, timetables) }))
        .filter((x) => x.services.length > 0)
        .sort((a, b) => displayName(a.member).localeCompare(displayName(b.member)));

      const listWrap = document.createElement("div");
      listWrap.style.maxHeight = "220px";
      listWrap.style.overflowY = "auto";
      listWrap.style.marginTop = "4px";
      listWrap.style.display = "flex";
      listWrap.style.flexDirection = "column";
      listWrap.style.gap = "8px";

      if (membersWithServices.length === 0) {
        const empty = document.createElement("div");
        empty.style.fontSize = "11px";
        empty.style.color = "var(--text-muted)";
        empty.textContent = emptyLabel;
        listWrap.appendChild(empty);
      } else {
        for (const { member, services } of membersWithServices) {
          const memberBlock = document.createElement("div");
          const memberHeading = document.createElement("div");
          memberHeading.style.fontSize = "11px";
          memberHeading.style.fontWeight = "600";
          memberHeading.textContent = displayName(member);
          memberBlock.appendChild(memberHeading);
          memberBlock.appendChild(buildServicesList(services, routes, timetables));
          listWrap.appendChild(memberBlock);
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
      groupPopup?.remove();
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

      container.appendChild(buildTransitLinkSection(osmId, "bus_station", coords));

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
      container.appendChild(
        await buildGroupedCallingServicesSection(
          stops.filter((s) => stationOfStop.get(s.osmId) === osmId),
          "No services call at any stand here yet.",
        ),
      );

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
      if (routeDrawState.isDrawing || placeStopState.isPlacing) return;
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

    // Grouped stops (DESIGN.md §4) — deliberately lighter than a bus
    // station's own popup: no bulk-assign (there's no manual membership
    // editing for a group at all yet, OSM-seeded only) and no transit
    // link for this first cut, just enough to declutter and to see who
    // calls at any of its members. Real per-stop editing (rename, pick-
    // up/set-down, its own bus-station/transit-link assignment) still
    // happens on each individual member's own popup once revealed.
    const closeGroupPopup = () => {
      groupPopup?.remove();
      groupPopup = null;
      openGroupOsmId = null;
      refreshGroupMembersSource();
    };

    const openGroupPopup = async (group: StopGroup) => {
      stopPopup?.remove();
      stationPopup?.remove();
      const osmId = group.osmId;
      const coords: [number, number] = [group.lon, group.lat];

      const container = document.createElement("div");
      container.style.minWidth = "220px";

      const titleRow = document.createElement("div");
      titleRow.style.fontWeight = "600";
      titleRow.style.fontSize = "13px";
      titleRow.style.marginBottom = "8px";
      titleRow.textContent = groupDisplayName(group);
      container.appendChild(titleRow);

      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.cursor = "pointer";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = alwaysShowGroup.get(osmId) === true;
      checkbox.addEventListener("change", () => {
        alwaysShowGroup.set(osmId, checkbox.checked);
        void window.overrides.set("stop_group", osmId, "always_show_members", checkbox.checked);
        refreshStopsSource();
        refreshGroupMembersSource();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode("Always show stops here"));
      container.appendChild(label);

      const memberIds = [...groupOfStop.entries()].filter(([, g]) => g === osmId).map(([id]) => id);
      const memberStops = memberIds.map((id) => stopsById.get(id)).filter((s): s is DecodedStop => s !== undefined);
      container.appendChild(await buildGroupedCallingServicesSection(memberStops));

      groupPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
        .setLngLat(coords)
        .setDOMContent(container)
        .addTo(map);
      groupPopup.on("close", () => {
        groupPopup = null;
        openGroupOsmId = null;
        refreshGroupMembersSource();
      });
    };

    map.on("click", "stop-groups-points", (e) => {
      if (routeDrawState.isDrawing || placeStopState.isPlacing) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const osmId = feature.properties?.osmId as number;
      if (openGroupOsmId === osmId) {
        closeGroupPopup();
        return;
      }
      const group = stopGroupsById.get(osmId);
      if (!group) return;
      openGroupOsmId = osmId;
      refreshGroupMembersSource();
      void openGroupPopup(group);
    });
    map.on("mouseenter", "stop-groups-points", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "stop-groups-points", () => {
      map.getCanvas().style.cursor = "";
    });

    // Manual assignment: pick which bus station (if any) a stop belongs to.
    // Available on any visible stop, whether it's an ordinary street stop or
    // a currently-revealed station stand — reassigning or clearing either
    // way is the same action.
    const openStopPopup = async (stop: DecodedStop) => {
      stationPopup?.remove();
      groupPopup?.remove();
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

      // A player-placed stop (DESIGN.md §4) on a road buses can't legally
      // use — flagged at placement time by the router's own place_stop(),
      // shown here persistently rather than only as a one-off toast so the
      // warning is still visible the next time this stop is opened.
      if (playerStopBusLegal.get(osmId) === false) {
        const warning = document.createElement("div");
        warning.className = "badge badge-warning";
        warning.style.display = "block";
        warning.style.marginBottom = "6px";
        warning.textContent = "Buses can't legally use this road";
        container.appendChild(warning);
      }

      // DESIGN.md §4 "Per-stop settings": "any two services meeting here
      // are connected (§7)" — just the flag for now. §7's actual
      // connection behaviour (one late service makes the other wait, up
      // to a per-route maximum) needs live bus movement and lateness
      // tracking, neither of which exist yet (Phase 3+) — this stores the
      // flag so the mechanism has something real to read once it does,
      // same override layer as everything else here.
      const connectionLabel = document.createElement("label");
      connectionLabel.style.display = "flex";
      connectionLabel.style.alignItems = "center";
      connectionLabel.style.gap = "6px";
      connectionLabel.style.cursor = "pointer";
      connectionLabel.style.marginBottom = "6px";
      const connectionCheckbox = document.createElement("input");
      connectionCheckbox.type = "checkbox";
      connectionCheckbox.checked = (await window.overrides.get<boolean>("stop", osmId, "connection_stop")) ?? false;
      connectionCheckbox.addEventListener("change", () => {
        if (connectionCheckbox.checked) void window.overrides.set("stop", osmId, "connection_stop", true);
        else void window.overrides.reset("stop", osmId, "connection_stop");
      });
      connectionLabel.appendChild(connectionCheckbox);
      connectionLabel.appendChild(document.createTextNode("Connection stop"));
      container.appendChild(connectionLabel);

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

      // Manual link to a nearby railway/subway station or tram stop — the
      // stop passengers actually use to transfer to/from it (see
      // buildTransitLinkSection's own comment).
      container.appendChild(buildTransitLinkSection(osmId, "stop", coords));

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
      // "skip" is deliberately excluded here — it's an express's own
      // route-scoped skipped-stop flag (route-panel.ts's per-route
      // dropdown), not a stop-wide default (see pickup-dropoff.ts's own
      // comment: no stop could ever be called at by any route if it were).
      const pickupDropoffDropdown = createDropdown(
        [PICKUP_DROPOFF_LABELS.both, PICKUP_DROPOFF_LABELS.pickup_only, PICKUP_DROPOFF_LABELS.setdown_only],
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
        if (routeDrawState.isDrawing || placeStopState.isPlacing) return;
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

    // "Place stop" (DESIGN.md §4 "Placement"): kerb-snaps a click onto the
    // nearest road for a brand-new stop, rather than only using imported
    // OSM stops. Armed the same way "Draw route" is (routeDrawState) —
    // while armed, a map click always places a stop instead of whatever a
    // plain click would otherwise do, via the placeStopState.isPlacing
    // guards already added to the other click handlers above. Left
    // toggled on across multiple placements, same as route drawing stays
    // armed across multiple stop clicks, since placing several stops in a
    // row is the common case.
    const placeStopToggle = document.createElement("button");
    placeStopToggle.className = "btn";
    placeStopToggle.textContent = "Place stop";
    placeStopToggle.style.position = "absolute";
    placeStopToggle.style.bottom = "8px";
    placeStopToggle.style.right = "128px";
    placeStopToggle.style.zIndex = "2";
    document.body.appendChild(placeStopToggle);

    const placeStopStatus = document.createElement("div");
    placeStopStatus.className = "panel";
    placeStopStatus.style.position = "absolute";
    placeStopStatus.style.bottom = "44px";
    placeStopStatus.style.right = "128px";
    placeStopStatus.style.zIndex = "2";
    placeStopStatus.style.padding = "8px 12px";
    placeStopStatus.style.maxWidth = "260px";
    placeStopStatus.style.display = "none";
    document.body.appendChild(placeStopStatus);

    placeStopToggle.addEventListener("click", () => {
      placeStopState.isPlacing = !placeStopState.isPlacing;
      placeStopToggle.classList.toggle("is-active", placeStopState.isPlacing);
      placeStopStatus.style.display = placeStopState.isPlacing ? "block" : "none";
      placeStopStatus.textContent = placeStopState.isPlacing
        ? 'Click the map to place a stop. Click "Place stop" again to stop.'
        : "";
    });

    map.on("click", (e) => {
      if (!placeStopState.isPlacing) return;
      // Scans every road, not just bus-legal ones (game-wasm's own
      // place_stop doc comment) — DESIGN.md §4 explicitly allows placing a
      // stop on a road buses can't use, with a warning, rather than
      // silently refusing.
      const result = router.place_stop(e.lngLat.lng, e.lngLat.lat);
      if (result.length !== 3) return;
      const [lon, lat, busLegalFlag] = result;
      const busLegal = busLegalFlag === 1;
      void (async () => {
        const created = await window.playerStops.create(lon, lat, busLegal);
        const newStop: DecodedStop = { lon: created.lon, lat: created.lat, kind: "bus_stop", name: null, osmId: created.osmId };
        stops.push(newStop);
        stopsById.set(created.osmId, newStop);
        playerStopBusLegal.set(created.osmId, created.busLegal);
        refreshStopsSource();
        placeStopStatus.textContent = created.busLegal
          ? 'Stop placed. Click the map to place another, or click "Place stop" to stop.'
          : "Stop placed — warning: buses can't legally use this road. Click the map to place another, or click \"Place stop\" to stop.";
      })();
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
