// Fare zones (DESIGN.md §9, Phase 4 increment 1): "fare zones are drawn on
// the map by the player, in the style of Lothian's. Each zone is typed city
// or country." Geometry and typing only — no pricing/bands/capping here,
// that's increment 2/3, deliberately kept separate (see fare_zones' own
// SCHEMA comment in db.mts). Confirmed with the user (2026-10-18): each
// depot group draws and prices its own zone map independently.
//
// Freeform polygon drawing has no existing precedent in this codebase —
// route-draw.ts and dead-mileage-preview.ts both snap to the BUS-LEGAL road
// graph via find_route, which a fare zone boundary has no reason to use (a
// zone edge is an administrative/commercial boundary, not a bus route).
// This is a new click-to-add-vertex tool, following the same toggle+panel
// shell and cross-tool isPlacing/isDrawing guard convention as every other
// map tool (routeDrawState/placeStopState/placeDepotState/placeDealerState).
//
// Road-following snapping (added 2026-10-30, live user request — "when
// snapping to a road it should follow the road until the next point if it
// is also on a road") needed genuinely new Rust/WASM work: the only
// existing pathfinding (`find_route`) is bus-legal-only, and a zone
// boundary should be able to follow ANY road. `Router::find_any_road_route`
// (rust/game-wasm/src/lib.rs) is a new, simpler Dijkstra variant over a
// second "every edge, both directions regardless of oneway" adjacency
// buffer — plain shortest distance, no turn penalties or junction delays
// (those model real driving behaviour, irrelevant to tracing a shape). The
// requested 10m outside-edge offset is deliberately NOT built yet — agreed
// with the user to ship road-following first, offset as a separate
// follow-up, since properly buffering a polyline (mitred corners, no
// existing geometry library in this project) carries real self-
// intersection risk worth not rushing.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { decode_coastline, type Router } from "./wasm/game_wasm.js";
import { createDropdown } from "./dropdown";
import { createColourPicker } from "./colour-picker";
import { clipRingToCoastline, nearestPointOnCoastline, coastlineFollowBetween, sameRealPoint, type CoastlineSnap } from "./coastline-clip.mts";
import { computeZoneLetters } from "./fare-journey.mts";
import { unionAreaPolygons, nearestPointOnAreaBoundary, areaClusterFollowBetween, nearestVertexOfRing } from "./area-cluster.mts";
import { pushOutRoadSnappedPoints } from "./fare-zone-road-pushout.mts";
import { islandAreaForPoint } from "./island-detection.mts";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";
import { placeDepotState } from "./depot-placement";
import { placeDealerState } from "./dealer-placement";
import { setMenuOpen } from "./menu-visibility";

export const fareZoneDrawState = { isDrawing: false };

// Shown/hidden by the Fares section of the bottom bar (fares-screen.ts),
// not its own floating toggle button any more (T165 — same "get all menus
// working" conversion T162 already did for Fleet's three sub-screens).
export const fareZonePanelState: { open: (() => void) | null; close: (() => void) | null } = {
  open: null,
  close: null,
};

const ZONES_SOURCE_ID = "fare-zones";
const ZONES_FILL_LAYER_ID = "fare-zones-fill";
const ZONES_OUTLINE_LAYER_ID = "fare-zones-outline";
const ZONES_LABEL_LAYER_ID = "fare-zones-label";
const TOWN_BORDER_SOURCE_ID = "fare-zones-town-border";
const TOWN_BORDER_LAYER_ID = "fare-zones-town-border";
const DRAFT_LINE_SOURCE_ID = "fare-zone-draft-line";
const DRAFT_LINE_LAYER_ID = "fare-zone-draft-line";
const DRAFT_POINTS_SOURCE_ID = "fare-zone-draft-points";
const DRAFT_POINTS_LAYER_ID = "fare-zone-draft-points";

// Plain UI default, not real data from any reference — only used to seed
// the colour picker for a brand new zone; the stored colour (fare_zones'
// own "colour" column) is what actually renders from here on.
const DEFAULT_ZONE_COLOUR: Record<FareZoneType, string> = { city: "#3b82f6", country: "#22c55e", island: "#f59e0b", town: "#a855f7" };

// Display-only capitalisation for the type dropdowns below (2026-10-31,
// live user request) — the stored value stays lowercase ("city"/
// "country", fare_zones' own CHECK constraint), only the dropdown's own
// label text is capitalised.
const ZONE_TYPE_LABELS: Record<FareZoneType, string> = { city: "City", country: "Country", island: "Island", town: "Town" };
const ZONE_TYPE_BY_LABEL: Record<string, FareZoneType> = { City: "city", Country: "country", Island: "island", Town: "town" };

// How close (in screen pixels, not degrees of lon/lat) a click needs to be
// to an existing zone's vertex or edge to snap to it, so adjacent zones can
// share an exact boundary — DESIGN.md's "in the style of Lothian's" implies
// a tiled zone map, not zones with gaps or slivers between them. Measured
// in screen space via map.project/unproject rather than a fixed lon/lat
// epsilon, since the same epsilon would mean wildly different real
// precision at different zoom levels.
const SNAP_RADIUS_PX = 14;

// Max real distance (metres) a click can be from the nearest real
// coastline point and still snap to it (2026-11-01, live bug report: "the
// fare zone is meant to snap to the edge of the land, not be in the water
// after completing it"). Same order of magnitude as `snap_to_any_road`'s
// own 500m cutoff, kept a little tighter since this is meant to catch "I
// clicked slightly off the shoreline," not reach across a strait to an
// unrelated stretch of coast.
const COASTLINE_SNAP_DISTANCE_M = 200;

// Area-cluster boundary snap (T118/T139, OPEN-ITEMS.md, DESIGN.md's own
// "holding Ctrl replaces road-snapping entirely while held") — same
// order of magnitude as COASTLINE_SNAP_DISTANCE_M above: wide enough to
// catch "I clicked slightly off the area's own edge," not so wide it
// reaches a genuinely separate, unrelated area. LANDUSE_QUERY_RADIUS_M
// is deliberately wider than the snap distance itself — it decides which
// loaded landuse features are even considered before unioning, so it
// needs enough margin to pull in the REST of a cluster the click landed
// on the edge of, not just the one polygon nearest the pointer. Kept at
// the same figures building footprints used — genuinely untested against
// landuse's own much larger scale (a residential block vs a single
// building), flagged as a live-tuning candidate, not re-derived from
// nothing.
const LANDUSE_SNAP_DISTANCE_M = 60;
const LANDUSE_QUERY_RADIUS_M = 150;

// Flat equirectangular distance, consistent with the same approximation
// polyline-geometry.mts/coastline-clip.mts already use — this one stays
// local (glue code only, not pure logic worth unit-testing on its own)
// since it's only ever used as a cheap "is this polygon even worth
// including in the union" prefilter, not the actual snap-distance maths.
function roughDistanceM(a: FareZonePoint, b: FareZonePoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dLon = (b.lon - a.lon) * (Math.PI / 180) * cosLat * 6_371_000;
  const dLat = (b.lat - a.lat) * (Math.PI / 180) * 6_371_000;
  return Math.hypot(dLon, dLat);
}

// Classes this project treats as "a real developed area with buildings
// in it" — residential/commercial/retail/industrial, the OpenMapTiles
// `landuse` classes basemap-style.json actually renders as a distinct
// shaded area (confirmed directly against its own filters, not guessed).
// Originally just residential/commercial/retail/industrial — widened
// 2026-11-14 to every other coloured landuse class the basemap itself
// renders (basemap-style.json's own fill layers), after a live report
// where Ctrl-snapping along a road that bordered an uncovered class
// (school) silently fell back to raw clicks instead of snapping to that
// area's boundary. Class strings match basemap-style.json exactly
// (`railway`/`industrial` share one fill layer there, `cemetery`/
// `grave_yard` share another — both landuse classes, not two different
// features).
const AREA_SNAP_LANDUSE_CLASSES: ReadonlySet<string> = new Set([
  "residential",
  "commercial",
  "retail",
  "industrial",
  "railway",
  "cemetery",
  "grave_yard",
  "school",
  "university",
  "college",
  "construction",
  "military",
  "quarry",
]);

// Pulls every real landuse area polygon out of the basemap's own already-
// loaded vector tiles (the `landuse` source-layer, same tiles the
// `building` source-layer used before this) that's within
// LANDUSE_QUERY_RADIUS_M of any of the given reference points (the click
// itself, plus the previous draft point when there is one, so a union
// spanning both is possible). Renamed/corrected 2026-11-13 from a live
// report: Ctrl-snap originally traced individual building footprints
// (T118/T139) — "it currently snaps to the buildings not the coloured
// area around it" — the real `landuse` layer is what renders that
// broader shaded area, a genuinely separate polygon from any one
// building. Returns plain outer rings — holes and any MultiPolygon part
// beyond the first are dropped, per area-cluster.mts's own documented
// scope. `querySourceFeatures` only sees tiles already loaded for the
// current view, so this silently finds nothing if the player is zoomed
// out below the landuse layer's own minzoom, or panned somewhere not yet
// fetched — same honest "falls back to the raw click" behaviour as every
// other snap in this file when nothing is close enough, not a crash.
function queryNearbyLandusePolygons(map: maplibregl.Map, referencePoints: readonly FareZonePoint[]): FareZonePoint[][] {
  const features = map.querySourceFeatures("openmaptiles", { sourceLayer: "landuse" });
  const footprints: FareZonePoint[][] = [];
  for (const feature of features) {
    if (!AREA_SNAP_LANDUSE_CLASSES.has(feature.properties?.class)) continue;
    const geometry = feature.geometry;
    const outerRings: [number, number][][] =
      geometry.type === "Polygon" ? [geometry.coordinates[0] as [number, number][]] : geometry.type === "MultiPolygon" ? geometry.coordinates.map((part) => part[0] as [number, number][]) : [];
    for (const ring of outerRings) {
      const points = ring.map(([lon, lat]) => ({ lon, lat }));
      const isNear = points.some((p) => referencePoints.some((ref) => roughDistanceM(p, ref) <= LANDUSE_QUERY_RADIUS_M));
      if (isNear) footprints.push(points);
    }
  }
  return footprints;
}

// How close (screen pixels, same convention as SNAP_RADIUS_PX) the eraser
// brush reaches from the cursor — wider than the snap radius since this
// is meant to be forgiving to drag over a cluster of points, not a
// precise single-point pick.
const ERASE_BRUSH_RADIUS_PX = 18;

function otherToolActive(): boolean {
  return routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing || placeDealerState.isPlacing;
}

// Snaps a raw click to the nearest existing zone vertex within
// SNAP_RADIUS_PX, then (if no vertex was close enough) the nearest point on
// any existing zone's edge, checked in screen space. Returns null (rather
// than falling back to the raw click) when nothing is close enough, so the
// caller can fall through to road-snapping instead — zone-to-zone snapping
// takes priority over road-snapping when both are plausible, since
// matching an existing zone's own exact boundary matters more than
// generically following a road.
function snapToExistingZones(map: maplibregl.Map, lngLat: maplibregl.LngLat, zones: FareZone[]): FareZonePoint | null {
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
  return null;
}

// Snaps a raw click to the nearest road, any road (not just bus-legal),
// via the WASM router's own `snap_to_any_road` — the same mechanism
// depot/dealer placement already use for exactly this reason ("the
// nearest point on any road, for a site that doesn't need to be bus-
// legal"). Returns null if genuinely nothing is nearby (no road data at
// all near this point), in which case the caller falls back to the raw
// click, mirroring every other map tool's own `snap_to_any_road` fallback
// pattern (depot-placement.ts, dealer-placement.ts).
function snapToRoad(router: Router, lngLat: { lng: number; lat: number }): FareZonePoint | null {
  const snapped = router.snap_to_any_road(lngLat.lng, lngLat.lat);
  return snapped.length === 2 ? { lon: snapped[0], lat: snapped[1] } : null;
}

// Plain ray-casting point-in-polygon test (odd-even rule) — no geometry
// library exists in this project (checked, see the 10m-offset note above),
// and this is simple enough not to need one.
function pointInRing(point: FareZonePoint, ring: FareZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersects = a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Whether `outer` fully contains `inner` — every one of `inner`'s own
// vertices sits inside `outer`'s ring. An approximate/practical test (it
// doesn't also check that none of `inner`'s edges cross `outer`'s edges
// between vertices), good enough for "one zone was drawn entirely inside
// another," the real case this exists for (2026-10-30: "when a zone
// completely surrounds another zone, the bit in the middle should be left
// blank so the 2 zones don't overlap").
function fullyContains(outer: FareZone, inner: FareZone): boolean {
  return inner.points.every((p) => pointInRing(p, outer.points));
}

// Coastline clipping itself lives in coastline-clip.mts (see its own
// header comment) — pure logic, imported above, kept separate here
// because fare-zone-drawing.ts can't be unit-tested directly
// (maplibre-gl has no Node-compatible exports to import against).

// A town zone's only valid parents (T107) — any Country or Island zone in
// the same depot group, excluding the town itself (relevant when retyping
// an existing zone, never when creating a brand new one).
function eligibleTownParents(zones: FareZone[], excludeId?: number): FareZone[] {
  return zones.filter((z) => (z.zoneType === "country" || z.zoneType === "island") && z.id !== excludeId);
}

// Renders each zone as a Polygon whose own interior rings (holes) are
// every OTHER zone it fully contains — a zone drawn around another one
// shows the inner zone's own fill through the gap, rather than the two
// overlapping. Layering multiple zones this way (each only punching holes
// for zones it DIRECTLY contains) also renders a deeper nesting (A around
// B around C) correctly without any extra work: B's own hole for C already
// shows C's fill through it, and that whole B-with-a-C-hole shape is what
// shows through A's own hole for B.
function zonesToGeojson(zones: FareZone[]): GeoJSON.FeatureCollection {
  // `zones` here spans every depot group (reloadZones' own comment — "the
  // map is one shared geography"), but a letter is a per-depot-group
  // concept (T175 follow-up) — computed once per group, lazily, and
  // cached across this one call.
  const lettersByDepotGroup = new Map<number, Map<number, string>>();
  const letterFor = (z: FareZone): string | undefined => {
    let letters = lettersByDepotGroup.get(z.depotGroupId);
    if (!letters) {
      letters = computeZoneLetters(zones.filter((o) => o.depotGroupId === z.depotGroupId));
      lettersByDepotGroup.set(z.depotGroupId, letters);
    }
    return letters.get(z.id);
  };

  return {
    type: "FeatureCollection",
    features: zones.map((z) => {
      const ring = [...z.points.map((p) => [p.lon, p.lat]), [z.points[0].lon, z.points[0].lat]];
      const holes = zones
        .filter((other) => other.id !== z.id && fullyContains(z, other))
        .map((other) => [...other.points.map((p) => [p.lon, p.lat]), [other.points[0].lon, other.points[0].lat]]);
      // A merged zone (mergeFareZone, T122) keeps both shapes as separate
      // rows sharing the same name/type/colour — fine for the fill and
      // border, which just look like one zone's two pieces, but every
      // zone got its own label, so a merged zone's name showed twice on
      // the map and visibly read as two separate zones rather than one.
      // Live correction, 2026-11-01: "merged zones shouldn't show as 2
      // separate things, they should be combined." The underlying shapes
      // genuinely are still two separate rows (no geometry union — see
      // mergeFareZone's own comment on why), so this only fixes what's
      // actually visible: the label shows once, on whichever row has the
      // lowest id among every zone sharing this exact name/type/depot
      // group, the others' labels are suppressed.
      const isDuplicateLabel = zones.some(
        (other) => other.id < z.id && other.depotGroupId === z.depotGroupId && other.name === z.name && other.zoneType === z.zoneType,
      );
      const letter = letterFor(z);
      const displayName = isDuplicateLabel ? "" : letter !== undefined ? `${z.name} (${letter})` : z.name;
      return {
        type: "Feature",
        properties: { id: z.id, name: displayName, zoneType: z.zoneType, colour: z.colour },
        geometry: { type: "Polygon", coordinates: [ring, ...holes] },
      };
    }),
  };
}

// A town zone's border is hidden everywhere it's fully surrounded by its
// own parent (the fill colour already shows it there, and a visible
// border there just looked bad — see the border's own paint comment at
// TOWN_BORDER_LAYER_ID). But live feedback, 2026-11-01, following the
// relaxed partial-overlap rule (T121): "it should still be visible if
// its on the edge of a zone" — where a town's own edge actually leaves
// its parent (now possible since full containment is no longer
// required), hiding it entirely makes it impossible to see where the
// town really extends to. Walks each town's own ring edge by edge
// (wrapping back to the first point) and keeps only the edges where
// EITHER endpoint sits outside the parent's ring — an edge with both
// endpoints inside is fully interior and stays hidden, same reasoning
// `fullyContains`'s own point-by-point check already uses elsewhere in
// this file. A town with no resolvable parent (shouldn't happen, but a
// save file could end up here) shows its WHOLE border, the safe default.
function townVisibleBorderSegments(zones: FareZone[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const zone of zones) {
    if (zone.zoneType !== "town") continue;
    const parent = zones.find((z) => z.id === zone.parentZoneId);
    for (let i = 0; i < zone.points.length; i++) {
      const a = zone.points[i];
      const b = zone.points[(i + 1) % zone.points.length];
      const bothInsideParent = parent !== undefined && pointInRing(a, parent.points) && pointInRing(b, parent.points);
      if (bothInsideParent) continue;
      features.push({
        type: "Feature",
        properties: { colour: zone.colour },
        geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      });
    }
  }
  return { type: "FeatureCollection", features };
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

// Populates the shared zone-boundary source for any other map-tool module
// that wants zone boundaries visible while it's active (route-draw.ts,
// confirmed 2026-11-12) — reuses the exact same data load as the Fare
// Zones panel's own reloadZones() below (listAll(), not
// listForDepotGroup, so cross-depot-group boundaries are visible too).
// Shows the outline only — fill and labels stay hidden (confirmed
// 2026-11-12: "only the border in route mode, not the entire shaded
// area"), so drawing a route isn't obscured by shaded zone colour or text.
export async function showFareZonesOverlay(map: maplibregl.Map): Promise<void> {
  const allZones = await window.fareZones.listAll();
  (map.getSource(ZONES_SOURCE_ID) as maplibregl.GeoJSONSource).setData(zonesToGeojson(allZones));
  (map.getSource(TOWN_BORDER_SOURCE_ID) as maplibregl.GeoJSONSource).setData(townVisibleBorderSegments(allZones));
  map.setLayoutProperty(ZONES_FILL_LAYER_ID, "visibility", "none");
  map.setLayoutProperty(ZONES_LABEL_LAYER_ID, "visibility", "none");
}

// Clears the shared source AND restores fill/label visibility, so the
// Fare Zones panel's own full (fill+outline+label) view is unaffected the
// next time it's opened normally — fareZonePanelState.open() below also
// defensively resets the same two layers' visibility itself, in case
// drawing mode was ever abandoned without this running.
export function hideFareZonesOverlay(map: maplibregl.Map): void {
  (map.getSource(ZONES_SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
  (map.getSource(TOWN_BORDER_SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
  map.setLayoutProperty(ZONES_FILL_LAYER_ID, "visibility", "visible");
  map.setLayoutProperty(ZONES_LABEL_LAYER_ID, "visibility", "visible");
}

export async function mountFareZones(map: maplibregl.Map, router: Router): Promise<void> {
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
      // Town zones had a dotted border (first thin, then widened after
      // live feedback it was barely visible) — live feedback again,
      // 2026-11-01: "can you just completely remove the border please."
      // No border at all for a town now (opacity 0, top-level `case` same
      // as before — not a zoom-interpolate nested inside another
      // expression, a known project gotcha); every other zone type is
      // unaffected.
      "line-width": 2,
      "line-opacity": ["case", ["==", ["get", "zoneType"], "town"], 0, 1],
    },
  });
  map.addLayer({
    id: ZONES_LABEL_LAYER_ID,
    type: "symbol",
    source: ZONES_SOURCE_ID,
    layout: { "text-field": ["get", "name"], "text-size": 13 },
    paint: { "text-color": "#18181b", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
  // Only the portion of a town zone's border that actually leaves its
  // parent — see townVisibleBorderSegments's own comment. A separate
  // source/layer rather than another `case` on ZONES_OUTLINE_LAYER_ID,
  // since this needs per-EDGE visibility (computed in JS against the
  // parent's own ring), not a per-FEATURE paint expression.
  map.addSource(TOWN_BORDER_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: TOWN_BORDER_LAYER_ID,
    type: "line",
    source: TOWN_BORDER_SOURCE_ID,
    paint: { "line-color": ["get", "colour"], "line-width": 3 },
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

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  // Widened from 360px (2026-10-30) — fixing the type dropdown and colour
  // swatch to their real protected widths (above) left too little room for
  // the Rename/Delete buttons in the same row, clipping them off the
  // panel's own right edge (confirmed visually, not assumed). 440px still
  // clipped Delete by ~21px (measured live, same live user report) —
  // widened again to 480px, which also matches fare-pricing-panel.ts's
  // own width.
  panel.style.width = "480px";
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

  // Real coastline chains for clipping (see clipRingToCoastline's own
  // header comment) — loaded once, here, the same "fetch once at mount"
  // pattern stops-layer.ts already uses for stops/railway data. An
  // empty array (fetch failure, or dev pipeline-data not yet rebuilt
  // with the new artefact) just makes clipping a harmless no-op rather
  // than a crash — every existing zone-drawing behaviour keeps working
  // without it.
  let coastlineChains: FareZonePoint[][] = [];
  try {
    const coastlineRes = await fetch("http://127.0.0.1:38271/coastline.bin");
    if (coastlineRes.ok) {
      const coastlineBytes = new Uint8Array(await coastlineRes.arrayBuffer());
      const decodedChains = decode_coastline(coastlineBytes) as { coordinates: number[] }[];
      coastlineChains = decodedChains.map((chain) => {
        const points: FareZonePoint[] = [];
        for (let i = 0; i + 1 < chain.coordinates.length; i += 2) {
          points.push({ lon: chain.coordinates[i], lat: chain.coordinates[i + 1] });
        }
        return points;
      });
    }
  } catch {
    // Harmless no-op, see the comment above.
  }

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
  // Defensive backstop (2026-11-15) against exact-duplicate points
  // reaching `draftPoints` at all, from ANY source — a real live bug
  // (confirmed via a human-driven click trace against a real saved zone,
  // which came back 66% exact-duplicate points) showed `coastlineFollow`/
  // `areaClusterFollowBetween`'s own end-of-walk duplicate (now fixed at
  // the source in coastline-clip.mts/area-cluster.mts) and a consecutive
  // click's own first new point landing exactly on the previous click's
  // last one. Fixing the two known source functions doesn't guarantee a
  // THIRD source (e.g. the WASM router's `find_any_road_route`, out of
  // scope to touch here) can't hand back the same shape of duplicate —
  // this catches any of them uniformly, right where points actually
  // enter the draft, same "skip it, don't push a point that's already
  // exactly there" convention as pushDedup in the two files above.
  // Returns how many of `points` were genuinely added, so callers that
  // track `draftClickPointCounts` record the real count, not the
  // pre-dedup one (an all-duplicate click would otherwise still log a
  // nonzero undo entry for a click that visibly added nothing new).
  function pushDraftPoints(...points: readonly FareZonePoint[]): number {
    let added = 0;
    for (const point of points) {
      const last = draftPoints[draftPoints.length - 1];
      if (last && sameRealPoint(last, point)) continue;
      draftPoints.push(point);
      added++;
    }
    return added;
  }
  // How many entries in `draftPoints` each click added — usually 1, but a
  // road-following click can insert several intermediate points at once.
  // "Undo point" pops a whole click's worth via this, not just the last
  // array entry, so undoing a road-followed stretch removes the whole
  // stretch in one go, matching what the player actually did.
  const draftClickPointCounts: number[] = [];
  // "Eraser brush" toggle (live user request, 2026-11-01: "I should also
  // be able to remove individual points with a rubber type brush") —
  // while active, dragging over the map removes any draft point within
  // ERASE_BRUSH_RADIUS_PX of the cursor, continuously as it moves, rather
  // than only being able to undo the single most recent click. Disables
  // the map's own drag-to-pan while held, the same class of fix as the
  // Shift+box-zoom conflict found earlier the same day — without it, a
  // drag meant to erase would instead pan the map underneath the cursor.
  let isErasing = false;
  // Whether the most recently added point was snapped to a road — checked
  // on the NEXT click to decide whether to road-follow between the two
  // ("follow the road until the next point if it is also on a road",
  // 2026-10-30). Reset whenever drawing starts/stops/undoes.
  let lastPointWasRoadSnapped = false;
  // Same idea, for the coastline (live user request, 2026-11-01: "snapping
  // to the coast line should work like the other snapping for building,
  // jump big gaps but follow if I mannualy do it") — carries the full
  // CoastlineSnap (not just a boolean) since coastlineFollowBetween needs
  // the previous point's own chain/edge location, not just whether it was
  // a coastline point at all.
  let lastCoastlineSnap: CoastlineSnap | null = null;
  // Same idea again, for area-cluster snapping (T118/T139) — just a
  // boolean, not a stored ClusterSnap, since (unlike road/coastline) an
  // area boundary's own snap is always recomputed fresh against
  // whatever fresh union the NEXT click's own query produces (see the
  // click handler below) rather than reused from an old union call's own
  // now-meaningless boundaryIndex.
  let lastPointWasAreaSnapped = false;
  let pendingZone = false; // true once "Finish" is clicked and the name/type form is up
  let pendingZoneColour = DEFAULT_ZONE_COLOUR.city;

  // Re-derives both "was the current last point snapped" flags from
  // whatever point is ACTUALLY left in draftPoints, rather than just
  // wiping them — live bug report, 2026-11-01: "if I undo a section then
  // it will only do a straight line after." Undo previously reset both
  // flags unconditionally, even when the point it left behind really was
  // still a coastline/road point, so the very next click could never
  // follow from it. Draft points carry no "how was this snapped" tag of
  // their own, so this re-queries at the leftover point's own exact
  // coordinates — if it really was a snap, the same query lands back on
  // it (at ~0 distance), correctly restoring the follow state; if it
  // wasn't (a raw Shift click, a zone-to-zone snap), it just reflects
  // whatever's genuinely nearest now, never wrong, only ever a convenience.
  function recomputeLastSnapState(): void {
    const last = draftPoints[draftPoints.length - 1];
    if (!last) {
      lastPointWasRoadSnapped = false;
      lastCoastlineSnap = null;
      lastPointWasAreaSnapped = false;
      return;
    }
    lastCoastlineSnap = nearestPointOnCoastline(last, coastlineChains, COASTLINE_SNAP_DISTANCE_M);
    lastPointWasRoadSnapped = lastCoastlineSnap === null && snapToRoad(router, { lng: last.lon, lat: last.lat }) !== null;
    const nearbyFootprints = queryNearbyLandusePolygons(map, [last]);
    const boundaries = unionAreaPolygons(nearbyFootprints);
    lastPointWasAreaSnapped = nearestPointOnAreaBoundary(last, boundaries, LANDUSE_SNAP_DISTANCE_M) !== null;
  }

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
    (map.getSource(TOWN_BORDER_SOURCE_ID) as maplibregl.GeoJSONSource).setData(townVisibleBorderSegments(allZones));
  }

  function updateDraftLayers(): void {
    (map.getSource(DRAFT_LINE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(draftLineGeojson(draftPoints));
    (map.getSource(DRAFT_POINTS_SOURCE_ID) as maplibregl.GeoJSONSource).setData(draftPointsGeojson(draftPoints));
  }

  // Removes every draft point within the brush radius of a screen
  // position — the eraser brush's own core operation, called from both a
  // plain click (erase at that one spot) and a drag (erase continuously
  // as the cursor moves). After erasing, draftClickPointCounts (which
  // only makes sense as "how many points did THIS click add," in order)
  // no longer has a coherent relationship to what's left, so it's reset
  // to one entry per remaining point — "Undo point" still works after an
  // erase, just one point at a time rather than one road-followed/
  // coastline-followed stretch at a time, which is the closest sane
  // fallback once the brush has made arbitrary interior removals.
  function eraseNear(screenPoint: maplibregl.Point): void {
    const before = draftPoints.length;
    const keep = draftPoints.map((p) => map.project([p.lon, p.lat]).dist(screenPoint) > ERASE_BRUSH_RADIUS_PX);
    draftPoints = draftPoints.filter((_, i) => keep[i]);
    if (draftPoints.length === before) return;
    draftClickPointCounts.length = 0;
    for (let i = 0; i < draftPoints.length; i++) draftClickPointCounts.push(1);
    recomputeLastSnapState();
    updateDraftLayers();
    render();
  }

  // Turns the eraser brush off and gives the map its own drag-to-pan back
  // — called from every place drawing itself ends or restarts, so a
  // leftover "erasing" state (and a permanently-disabled map drag) can
  // never survive past the draft it was armed for.
  function stopErasing(): void {
    isErasing = false;
    map.dragPan.enable();
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

    // T175 follow-up, confirmed 2026-11-12/13 — the automatic nesting
    // letter (A, B, C...) each City/Country zone gets, computed once per
    // render rather than per row.
    const letters = computeZoneLetters(zones);

    for (const zone of zones) {
      const row = document.createElement("div");
      row.style.display = "flex";
      // Live report, 2026-11-01: "Merge into and delete in fare zones
      // don't fit in the menu" — adding the Merge dropdown pushed this
      // row past its own panel's width. `flex-wrap` lets the controls
      // that don't fit move to a second line instead of being pushed
      // out of the visible panel entirely.
      row.style.flexWrap = "wrap";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "4px 0";

      const nameInput = document.createElement("input");
      nameInput.className = "field";
      nameInput.value = zone.name;
      nameInput.style.flex = "1";
      // Same root cause as the point-list delete button elsewhere in this
      // batch: a flex item's default min-width is auto (its own full
      // content width for an <input>, not 0), which without this override
      // refuses to shrink and pushes the row's other controls out
      // instead.
      nameInput.style.minWidth = "80px";
      row.appendChild(nameInput);

      const typeDropdown = createDropdown(Object.values(ZONE_TYPE_LABELS), ZONE_TYPE_LABELS[zone.zoneType], async (label) => {
        const newType = ZONE_TYPE_BY_LABEL[label];
        // Retyping straight to town needs a parent — default to the first
        // eligible Country/Island zone (same "follow a sensible default,
        // adjustable after" pattern the colour picker above already uses),
        // via the dedicated parent dropdown that appears once the zone
        // actually is a town (below). If none exists, setFareZoneType
        // throws its own clear error, surfaced the normal way.
        const parentZoneId = newType === "town" ? (eligibleTownParents(zones, zone.id)[0]?.id ?? null) : null;
        try {
          await window.fareZones.setType(zone.id, newType, parentZoneId);
          errorMessage = "";
          await reloadZones();
        } catch (err) {
          showError(err);
        }
        render();
      });
      // `.dropdown`'s own CSS sets `min-width: 0` (theme.css), which is
      // exactly what's needed to let it shrink gracefully when space is
      // tight elsewhere — but inside this row, with `nameInput` on
      // `flex: 1` competing for space, the DEFAULT `flex-shrink: 1` with
      // no floor let the dropdown get squeezed down to ~2px, effectively
      // invisible and unclickable (confirmed by measuring its real
      // rendered width live, not assumed) — a real layout bug, not just a
      // style mismatch. `flex: "0 0 110px"` gives it a protected width
      // that the row's flex layout can't steal.
      typeDropdown.el.style.flex = "0 0 110px";
      row.appendChild(typeDropdown.el);

      // The zone's own computed nesting letter — no letter at all for
      // Island/Town (computeZoneLetters never assigns one), same inline
      // fixed-width flex-item pattern as the colour swatch below.
      const letter = letters.get(zone.id);
      if (letter !== undefined) {
        const letterBadge = document.createElement("div");
        letterBadge.textContent = letter;
        letterBadge.title = "Zone letter (computed from nesting, not editable)";
        letterBadge.style.flex = "0 0 20px";
        letterBadge.style.textAlign = "center";
        letterBadge.style.fontWeight = "600";
        letterBadge.style.color = "var(--text-secondary)";
        row.appendChild(letterBadge);
      }

      // A town's own parent used to show here — first as an editable
      // dropdown, then (after "that is not needed") as a plain read-only
      // label. Live feedback again, 2026-11-01: "I also don't need to know
      // what zone the town is in, that can be removed." Gone entirely now;
      // the zone still has a real `parentZoneId` underneath (needed for
      // the containment/pricing rules), it's just not shown in this row.

      // Native `<input type=color>` renders as a small square by default
      // (~12px in this row) — easy to miss entirely, which is almost
      // certainly why "the colour can only be set when the zone is made"
      // was reported even though this editor already existed. Sized up
      // and given its own flex-shrink guard for the same reason as the
      // dropdown above. T169: now a custom colour-picker.ts picker, not a
      // native input — see that file's own header comment.
      const colourInput = createColourPicker(zone.colour, (hex) => {
        void (async () => {
          await window.fareZones.setColour(zone.id, hex);
          await reloadZones();
          render();
        })();
      });
      colourInput.el.title = "Zone colour";
      colourInput.el.style.flex = "0 0 32px";
      colourInput.el.style.height = "24px";
      row.appendChild(colourInput.el);

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

      // Merge this zone's own shape into another (live user request,
      // 2026-11-01: "how do i merge zones into another, there is no way of
      // doing this"). Confirmed via AskUserQuestion: no new combined
      // boundary is computed (real polygon union is genuine geometry work
      // this project has no library for, and risks a broken shape) — this
      // just relabels the zone to match the target's own name/type/colour,
      // so the two polygons read as one merged zone without either shape
      // changing at all. Town zones excluded on both sides (db.mts's own
      // mergeFareZone throws if either is a town; this dropdown just
      // doesn't offer the option at all, same gating other controls here
      // already use).
      const mergeTargets = zones.filter((z) => z.id !== zone.id && z.zoneType !== "town");
      if (zone.zoneType !== "town" && mergeTargets.length > 0) {
        const mergeDropdown = createDropdown(mergeTargets.map((z) => z.name), "Merge into...", async (label) => {
          const target = mergeTargets.find((z) => z.name === label);
          if (!target) return;
          try {
            await window.fareZones.merge(zone.id, target.id);
            errorMessage = "";
            await reloadZones();
          } catch (err) {
            showError(err);
          }
          render();
        });
        mergeDropdown.el.style.flex = "0 0 130px";
        row.appendChild(mergeDropdown.el);
      }

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
      nameInput.className = "field";
      nameInput.placeholder = "Zone name";
      nameInput.style.display = "block";
      nameInput.style.width = "100%";
      nameInput.style.boxSizing = "border-box";
      nameInput.style.marginBottom = "4px";
      let zoneType: FareZoneType = "city";
      // Real-geography auto-default (2026-11-15 live request: "Could we
      // automate whether an area is an Island?") — once the player
      // explicitly picks a type themselves via the dropdown below, their
      // choice sticks and the real-geography check at save time is
      // skipped entirely, same "once touched, stays touched" convention
      // colourTouched already uses just below.
      let typeTouched = false;
      let townParentZoneId: number | null = null;
      const parentRow = document.createElement("div");
      parentRow.style.marginBottom = "4px";
      function renderParentPicker(): void {
        parentRow.replaceChildren();
        if (zoneType !== "town") return;
        const parents = eligibleTownParents(zones);
        townParentZoneId = parents[0]?.id ?? null;
        if (parents.length === 0) {
          const note = document.createElement("div");
          note.style.fontSize = "11px";
          note.style.color = "var(--text-muted)";
          note.textContent = "No Country or Island zone in this depot group yet for the town to belong to.";
          parentRow.appendChild(note);
          return;
        }
        const parentDropdown = createDropdown(
          parents.map((p) => p.name),
          parents[0].name,
          (label) => {
            townParentZoneId = parents.find((p) => p.name === label)?.id ?? null;
          },
        );
        parentDropdown.el.style.width = "100%";
        parentRow.appendChild(parentDropdown.el);
      }
      const typeDropdown = createDropdown(Object.values(ZONE_TYPE_LABELS), ZONE_TYPE_LABELS[zoneType], (label) => {
        zoneType = ZONE_TYPE_BY_LABEL[label];
        typeTouched = true;
        // Only follows the type while the player hasn't picked a colour of
        // their own — once they touch the colour input directly, their
        // choice sticks regardless of type.
        if (!colourTouched) {
          pendingZoneColour = DEFAULT_ZONE_COLOUR[zoneType];
          colourInput.value = pendingZoneColour;
        }
        renderParentPicker();
      });
      // Full-width to match the name input above it — with no width set
      // at all a plain `.dropdown` shrinks to fit just its own "city"/
      // "country" text, which is what looked visually inconsistent next
      // to the full-width name field (not the same invisible-collapse bug
      // as the zone-list row above, since there's no competing flex
      // sibling here, but still wrong).
      typeDropdown.el.style.width = "100%";
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
      // T169: a custom colour-picker.ts picker, not a native input — see
      // that file's own header comment.
      const colourInput = createColourPicker(pendingZoneColour, (hex) => {
        colourTouched = true;
        pendingZoneColour = hex;
      });
      colourInput.el.style.width = "48px";
      colourInput.el.style.height = "26px";
      colourRow.append(colourLabel, colourInput.el);

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
          // DESIGN.md §9: every point that's actually at the side of a
          // road (a real-distance decision made entirely inside
          // pushOutRoadSnappedPoints, not by any remembered snap history)
          // gets pushed off the road, away from the zone's own real (now
          // fully known) centroid — unconditionally, even on a road
          // shared with another zone — sliding along the ring's own
          // local line direction wherever possible rather than jumping
          // perpendicular to the road (2026-11-14 live bug: the old
          // perpendicular-only push put a visible kink in a boundary
          // line that was merely passing near a road, not running along
          // it). Done before the existing coastline clip below, which
          // stays the last safety net against a boundary ending up in
          // the sea.
          const pushedOutPoints = pushOutRoadSnappedPoints(draftPoints, (lon, lat) => {
            const info = router.nearest_road_edge_info(lon, lat);
            if (info.length === 0) return null;
            const [distM, aLon, aLat, bLon, bLat, widthM] = info;
            return { distM, aLon, aLat, bLon, bLat, widthM };
          });
          const clippedPoints = clipRingToCoastline(pushedOutPoints, coastlineChains);
          // Diagnostic trace, same convention/purpose as handleMapClick's
          // own [fare-zone-click] logs — the finalize step's own
          // before/after at both stages, so a live report about a point
          // landing somewhere unexpected after Save can be checked
          // against exactly what each stage did, not re-derived from the
          // saved result alone.
          console.log("[fare-zone-save]", { draftPoints, pushedOutPoints, clippedPoints });
          // Real-geography auto-default (2026-11-15) — only while the
          // player hasn't picked a type of their own (typeTouched), checks
          // whether the zone's own real centroid lands on land the actual
          // coastline data shows is a separate, genuinely island-sized
          // landmass from the mainland (island-detection.mts), and
          // defaults to "island" if so. The centroid, not a single vertex,
          // since a zone can straddle a coastline edge (shore-following
          // boundaries) — the centroid is the one point guaranteed to sit
          // inside whichever landmass the zone is actually drawn on,
          // rather than possibly landing just offshore.
          let effectiveZoneType = zoneType;
          if (!typeTouched && clippedPoints.length > 0) {
            const centroidLon = clippedPoints.reduce((sum, p) => sum + p.lon, 0) / clippedPoints.length;
            const centroidLat = clippedPoints.reduce((sum, p) => sum + p.lat, 0) / clippedPoints.length;
            const island = islandAreaForPoint({ lon: centroidLon, lat: centroidLat }, coastlineChains);
            if (island && island.isIsland) effectiveZoneType = "island";
          }
          // Same "follow the type's own default colour while untouched"
          // rule the manual dropdown already applies (above) — an
          // auto-detected island shouldn't save with whatever colour the
          // form's own initial "city" default happened to pre-fill.
          const effectiveColour = !colourTouched ? DEFAULT_ZONE_COLOUR[effectiveZoneType] : pendingZoneColour;
          await window.fareZones.create(selectedDepotGroupId, name, effectiveZoneType, clippedPoints, effectiveColour, townParentZoneId);
          draftPoints = [];
          draftClickPointCounts.length = 0;
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
        draftClickPointCounts.length = 0;
        pendingZone = false;
        pendingZoneColour = DEFAULT_ZONE_COLOUR.city;
        errorMessage = "";
        updateDraftLayers();
        render();
      });
      form.append(nameInput, typeDropdown.el, parentRow, colourRow, save, cancel);
      drawSection.appendChild(form);
    } else if (fareZoneDrawState.isDrawing) {
      const hint = document.createElement("div");
      hint.style.color = "var(--text-muted)";
      hint.style.marginBottom = "4px";
      hint.textContent = isErasing
        ? "Removing — click or drag over points to remove them. Click \"Removing — click to stop\" when done."
        : `Click the map to add a point (${draftPoints.length} so far, 3+ needed). Clicking near a coastline snaps to it. Hold Ctrl to snap to a coloured land-use area's own outer edge instead of a road — click a first and last point near it to trace the boundary between them. Hold Shift to place the point exactly where clicked, ignoring roads, the coastline and these areas — useful for a deliberate straight line out over open water. Use "Remove points" to remove points with a brush instead of one at a time.`;
      drawSection.appendChild(hint);

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "6px";

      const undo = document.createElement("button");
      undo.className = "btn";
      undo.textContent = "Undo point";
      undo.disabled = draftPoints.length === 0;
      undo.addEventListener("click", () => {
        // Pops a whole CLICK's worth, not just one array entry — a
        // road-following click can have inserted several intermediate
        // points at once, and undoing should remove that whole stretch in
        // one go, matching what the player actually did.
        const countToRemove = draftClickPointCounts.pop() ?? 1;
        draftPoints.splice(draftPoints.length - countToRemove, countToRemove);
        recomputeLastSnapState();
        updateDraftLayers();
        render();
      });
      controls.appendChild(undo);

      const eraseToggle = document.createElement("button");
      eraseToggle.className = "btn";
      eraseToggle.textContent = isErasing ? "Removing — click to stop" : "Remove points";
      eraseToggle.classList.toggle("is-active", isErasing);
      eraseToggle.disabled = draftPoints.length === 0 && !isErasing;
      eraseToggle.addEventListener("click", () => {
        isErasing = !isErasing;
        // Dragging to erase would otherwise also pan the map underneath
        // the cursor — the same class of conflict as the Shift+box-zoom
        // one found earlier the same day.
        map.dragPan[isErasing ? "disable" : "enable"]();
        render();
      });
      controls.appendChild(eraseToggle);

      const finish = document.createElement("button");
      finish.className = "btn";
      finish.textContent = "Finish";
      finish.disabled = draftPoints.length < 3;
      finish.addEventListener("click", () => {
        fareZoneDrawState.isDrawing = false;
        pendingZone = true;
        stopErasing();
        render();
      });
      controls.appendChild(finish);

      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        fareZoneDrawState.isDrawing = false;
        draftPoints = [];
        draftClickPointCounts.length = 0;
        lastPointWasRoadSnapped = false;
        lastCoastlineSnap = null;
        lastPointWasAreaSnapped = false;
        stopErasing();
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
        draftClickPointCounts.length = 0;
        lastPointWasRoadSnapped = false;
        lastCoastlineSnap = null;
        lastPointWasAreaSnapped = false;
        errorMessage = "";
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

  // Eraser-brush drag: mousedown arms it and erases once at that spot
  // (covers a plain click too, not just a drag), mousemove keeps erasing
  // continuously while the button stays down, mouseup/mouseleave ends the
  // drag. Kept separate from the ordinary "click" handler below, which
  // explicitly ignores clicks while erasing — mousedown already did the
  // single-click case, so click would otherwise double up on it.
  let isErasingDrag = false;
  map.on("mousedown", (e) => {
    if (!fareZoneDrawState.isDrawing || !isErasing || otherToolActive()) return;
    isErasingDrag = true;
    eraseNear(e.point);
  });
  map.on("mousemove", (e) => {
    if (!isErasingDrag) return;
    eraseNear(e.point);
  });
  map.on("mouseup", () => {
    isErasingDrag = false;
  });
  // A real mouseup released outside the map canvas (dragged off the
  // edge) never reaches map.on("mouseup", ...) at all — a window-level
  // listener as a safety net so the drag can't get stuck "on" past
  // wherever the cursor actually left the canvas.
  window.addEventListener("mouseup", () => {
    isErasingDrag = false;
  });

  map.on("click", (e) => {
    void handleMapClick(e);
  });

  async function handleMapClick(e: maplibregl.MapMouseEvent): Promise<void> {
    if (!fareZoneDrawState.isDrawing || otherToolActive()) return;
    if (isErasing) return; // handled by mousedown/mousemove above, not here

    // Zone-to-zone snapping wins outright when it applies (see
    // snapToExistingZones's own comment) — no road-following in that case,
    // since the point is deliberately matching an existing zone's own
    // boundary, not a road.
    const zoneSnap = snapToExistingZones(map, e.lngLat, allZones);
    if (zoneSnap) {
      draftClickPointCounts.push(pushDraftPoints(zoneSnap));
      lastPointWasRoadSnapped = false;
      lastCoastlineSnap = null;
      lastPointWasAreaSnapped = false;
      updateDraftLayers();
      render();
      return;
    }

    // Area-cluster boundary snap (T118/T139, corrected 2026-11-13 to
    // landuse areas instead of individual buildings — see
    // queryNearbyLandusePolygons's own comment): holding Ctrl replaces
    // road-snapping (and coastline-snapping) entirely while held, per
    // the confirmed spec — its own branch, checked before the shift/
    // coastline/road chain below rather than folded into it, since
    // "replaces... entirely" means Ctrl is its own mode, not just
    // another candidate alongside the others. Queries landuse areas near
    // BOTH the previous draft point and this click (when there is a
    // previous point) so a union spanning both is possible, then checks
    // whether the two land on the SAME merged boundary — re-done fresh
    // on every click rather than reusing a stored boundary index from an
    // earlier, smaller union call, which would no longer mean anything
    // against a differently-scoped candidate set.
    const ctrlHeld = (e.originalEvent as MouseEvent).ctrlKey;
    if (ctrlHeld) {
      const clickPoint: FareZonePoint = { lon: e.lngLat.lng, lat: e.lngLat.lat };
      const pointCountBeforeThisClick = draftPoints.length;
      const previousPoint = draftPoints[draftPoints.length - 1];
      const queryPoints = previousPoint ? [previousPoint, clickPoint] : [clickPoint];
      let boundaries = unionAreaPolygons(queryNearbyLandusePolygons(map, queryPoints));
      let clusterSnap = nearestPointOnAreaBoundary(clickPoint, boundaries, LANDUSE_SNAP_DISTANCE_M);
      // A real, separate gap (2026-11-14, found while investigating the
      // live "jumps away from the boundary" bug below — that specific
      // bug turned out to be in clipRingToCoastline, not here, but this
      // is worth guarding anyway): `querySourceFeatures` (inside
      // queryNearbyLandusePolygons) only ever sees tiles already loaded
      // for the current view, so a click made just after panning/zooming
      // can race ahead of its own landuse tile and come back with
      // NOTHING even though the exact same spot genuinely has landuse
      // data a moment later, falling back to the raw, unsnapped click
      // point for no real reason.
      //
      // Broadened 2026-11-15, still live after that first fix: the
      // original retry was gated on `!map.isSourceLoaded("openmaptiles")`
      // — a BLANKET flag for the whole source, not specifically whether
      // the tile covering this exact click has actually finished
      // rendering. Confirmed directly against a real saved zone (the
      // exact bogus point measured ~10m from the real boundary, with NO
      // ambiguous/competing landuse geometry nearby — ruling out the
      // player simply clicking the wrong real feature — and the precise
      // value differing by ~2m between two otherwise-identical redraws,
      // consistent with a transient miss rather than a deterministic
      // bug): `isSourceLoaded` can report the source as a whole "loaded"
      // while this one tile's own feature data still isn't what
      // `querySourceFeatures` returns a frame later. Retrying
      // unconditionally whenever nothing was found — not just when the
      // source flag says it's still loading — after a couple of render
      // frames (not `map.once("idle")`, which may never fire again if
      // the map is already settled) covers that gap too: a genuine "no
      // area anywhere near here" case still correctly finds nothing on
      // the retry, the same honest fallback as before.
      let usedRetry = false;
      if (!clusterSnap) {
        usedRetry = true;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        boundaries = unionAreaPolygons(queryNearbyLandusePolygons(map, queryPoints));
        clusterSnap = nearestPointOnAreaBoundary(clickPoint, boundaries, LANDUSE_SNAP_DISTANCE_M);
      }
      if (clusterSnap) {
        const previousSnap = previousPoint && lastPointWasAreaSnapped ? nearestPointOnAreaBoundary(previousPoint, boundaries, LANDUSE_SNAP_DISTANCE_M) : null;
        const follow = previousSnap ? areaClusterFollowBetween(previousSnap, clusterSnap, boundaries) : null;
        const bridgeCorner =
          previousPoint && !lastPointWasAreaSnapped ? nearestVertexOfRing(boundaries[clusterSnap.boundaryIndex], previousPoint, LANDUSE_SNAP_DISTANCE_M) : null;
        if (follow) {
          draftClickPointCounts.push(pushDraftPoints(...follow.slice(1)));
        } else if (bridgeCorner) {
          // T118's confirmed point (5): "on a road, press Ctrl, click
          // near a cluster — connects from the road point to the
          // nearest corner of that cluster," the mirror of point (4)
          // above. Only when the previous point genuinely wasn't an
          // area snap at all — two area-snapped points on different,
          // unconnected clusters are a real "big gap" (3), not this
          // case, so they fall through to the plain snap point in the
          // branch below instead. Also falls through to that same plain
          // branch when no real corner is actually close to the road
          // point (nearestVertexOfRing's own bounded search, 2026-11-14
          // fix) — bridging to a distant, unrelated corner of a large
          // polygon produced a visible spike rather than a sensible
          // connection.
          draftClickPointCounts.push(pushDraftPoints(bridgeCorner));
        } else {
          // No previous point at all, a genuine gap between two
          // unconnected area boundaries, or no real corner close enough
          // to bridge from — just the new point on its own (3), matching
          // the confirmed spec's own straight-line fallback.
          draftClickPointCounts.push(pushDraftPoints(clusterSnap.point));
        }
      } else {
        // Ctrl held but nothing area-like close enough (no landuse
        // tiles loaded here, or genuinely no matching area nearby) —
        // falls back to the raw click rather than silently doing
        // nothing, the same honesty every other snap in this file
        // already has.
        draftClickPointCounts.push(pushDraftPoints(clickPoint));
      }
      lastPointWasAreaSnapped = clusterSnap !== null;
      lastPointWasRoadSnapped = false;
      lastCoastlineSnap = null;
      // Diagnostic trace, same convention/purpose as the plain-click one
      // further down — this is the branch T207's own retry lives in, so
      // `usedRetry`/`clusterSnap` here are exactly what a live report
      // about a bogus area-snap point needs to diagnose without
      // reproducing the click sequence from guesswork afterwards.
      console.log("[fare-zone-click]", {
        clickLngLat: clickPoint,
        ctrlHeld: true,
        usedRetry,
        clusterSnap,
        addedPoints: draftPoints.slice(pointCountBeforeThisClick),
      });
      updateDraftLayers();
      render();
      return;
    }

    // Shift-click (31 October hand-off item 2, OPEN-ITEMS.md; corrected
    // twice on 2026-11-01 from live bug reports). First correction: shift
    // used to only suppress the road-FOLLOWING interpolation while still
    // letting the point itself snap to a road as normal, but
    // `snap_to_any_road`'s own 500m cutoff is wide enough to reach across
    // most of Skye's own real sea lochs (confirmed directly against the
    // real road graph — Loch Harport's mid-loch point snaps 331m to a
    // shore road), so shift was changed to bypass road-snapping outright.
    // **Second correction, the real design gap**: "the fare zone is meant
    // to snap to the edge of the land, not be in the water after
    // completing it" — bypassing every snap on shift just traded "ends up
    // on a road" for "ends up adrift in open water with nothing pulling it
    // onto the coast," since `clipRingToCoastline` (the existing Finish-
    // time clip) only corrects an edge crossing the SAME coastline chain
    // twice, which never applies to a genuine crossing onto a separate
    // landmass like Skye. A real coastline snap (`nearestPointOnCoastline`,
    // coastline-clip.mts) is now checked BEFORE road-snapping and takes
    // priority over it whenever both are in range, so a click near a shore
    // lands on the actual coastline instead of jumping inland to a nearby
    // road. Shift now bypasses coastline-snapping too (not just roads) —
    // reserved for the rarer case of deliberately drawing a straight line
    // out over genuinely open water (e.g. crossing a strait to a separate
    // island's own coastline chain).
    //
    // **Third correction, 2026-11-01**: shift was also silently doing
    // nothing at all on a plain click — not a logic bug here, but
    // MapLibre's own default Shift+drag box-zoom claiming the mousedown
    // before this handler ever saw it (fixed once, globally, in
    // main.ts's own `map.boxZoom.disable()`, not here).
    const shiftHeld = (e.originalEvent as MouseEvent).shiftKey;

    const coastlineSnap = shiftHeld ? null : nearestPointOnCoastline({ lon: e.lngLat.lng, lat: e.lngLat.lat }, coastlineChains, COASTLINE_SNAP_DISTANCE_M);
    const roadSnap = shiftHeld || coastlineSnap ? null : snapToRoad(router, e.lngLat);
    const pointCountBeforeThisClick = draftPoints.length;
    const previousPoint = draftPoints[draftPoints.length - 1];
    const coastlineFollow =
      coastlineSnap && lastCoastlineSnap && previousPoint ? coastlineFollowBetween(lastCoastlineSnap, coastlineSnap, coastlineChains) : null;
    // Road-following (2026-10-30, "when snapping to a road it should
    // follow the road until the next point if it is also on a road"):
    // only when BOTH this click and the previous point landed on a road —
    // a single road-snapped point with no road-snapped predecessor has
    // nothing to follow from yet. `roadSnap` is already null whenever
    // shift is held or a coastline point took priority (above), so this
    // naturally falls through to the plain raw-point branch below without
    // a separate check.
    if (roadSnap && lastPointWasRoadSnapped && previousPoint) {
      const pathCoords = router.find_any_road_route(previousPoint.lon, previousPoint.lat, roadSnap.lon, roadSnap.lat);
      // pathCoords includes the previous point's own position again as its
      // first pair (find_any_road_route always starts from the snapped
      // start node) — skip that one pair, since previousPoint is already
      // in draftPoints, then push every following point including the
      // final destination.
      const newPoints: FareZonePoint[] = [];
      for (let i = 2; i + 1 < pathCoords.length; i += 2) {
        newPoints.push({ lon: pathCoords[i], lat: pathCoords[i + 1] });
      }
      // An empty/too-short path (genuinely disconnected roads, or the two
      // points snapped to the very same node) falls back to just the
      // single road-snapped point, same as a normal click — never silently
      // drops the click entirely.
      if (newPoints.length === 0) newPoints.push(roadSnap);
      draftClickPointCounts.push(pushDraftPoints(...newPoints));
    } else if (coastlineFollow) {
      // Coastline-following (2026-11-01, "snapping to the coast line
      // should work like the other snapping for building, jump big gaps
      // but follow if I mannualy do it") — mirrors road-following above,
      // except coastlineFollowBetween itself decides whether the two
      // clicks are on the SAME chain to trace in detail (null only for a
      // genuinely different, unconnected chain, in which case this falls
      // through to the plain single-point branch below instead — no
      // distance cutoff, see coastlineFollowBetween's own comment for why
      // one was tried and then removed).
      draftClickPointCounts.push(pushDraftPoints(...coastlineFollow.slice(1)));
    } else {
      const point = coastlineSnap?.point ?? roadSnap ?? { lon: e.lngLat.lng, lat: e.lngLat.lat };
      // T118's confirmed point (4): "transitioning off a building-trace
      // onto a plain road click connects from whichever corner of the
      // just-traced cluster is nearest to the new road point, not
      // necessarily the trace's own last plotted point" — inserts that
      // corner as an extra bridging point (the trace's own last point
      // stays exactly where it was placed) rather than replacing
      // anything already traced.
      if (lastPointWasAreaSnapped && previousPoint) {
        const boundaries = unionAreaPolygons(queryNearbyLandusePolygons(map, [previousPoint]));
        const previousSnap = nearestPointOnAreaBoundary(previousPoint, boundaries, LANDUSE_SNAP_DISTANCE_M);
        // Bounded to LANDUSE_SNAP_DISTANCE_M (2026-11-14 fix, see
        // nearestVertexOfRing's own doc comment) — without this, a large
        // polygon's globally-nearest vertex to `point` could be a
        // distant, unrelated corner, producing a boundary that jumped
        // away from the road and straight back (a live reported bug: a
        // visible spike near Main Street, Kyle of Lochalsh).
        const corner = previousSnap ? nearestVertexOfRing(boundaries[previousSnap.boundaryIndex], point, LANDUSE_SNAP_DISTANCE_M) : null;
        const newPoints = corner ? [corner, point] : [point];
        draftClickPointCounts.push(pushDraftPoints(...newPoints));
      } else {
        draftClickPointCounts.push(pushDraftPoints(point));
      }
    }
    lastPointWasRoadSnapped = roadSnap !== null;
    lastCoastlineSnap = coastlineSnap;
    lastPointWasAreaSnapped = false;
    // Diagnostic trace for the road/coastline-follow click path, kept
    // deliberately (not a throwaway) for diagnosing live reports like the
    // Main Street, Kyle of Lochalsh spike (T207) — a real human-driven
    // draw with DevTools' console open captures exactly which snap fired
    // and what landed in draftPoints for every click, without needing to
    // reproduce the click sequence from guesswork afterwards.
    console.log("[fare-zone-click]", {
      clickLngLat: { lon: e.lngLat.lng, lat: e.lngLat.lat },
      ctrlHeld,
      shiftHeld,
      coastlineSnap,
      roadSnap,
      addedPoints: draftPoints.slice(pointCountBeforeThisClick),
    });
    updateDraftLayers();
    render();
  }

  fareZonePanelState.open = () => {
    panel.style.display = "flex";
    setMenuOpen("fare-zone-drawing", true);
    // Defensive reset (T175 follow-up) — route-draw.ts's own
    // showFareZonesOverlay hides fill/labels and restores them again on
    // hideFareZonesOverlay, but if drawing mode is ever abandoned without
    // that running, this panel should still always open showing its own
    // normal full fill+outline+label view, not whatever route-draw left
    // behind.
    map.setLayoutProperty(ZONES_FILL_LAYER_ID, "visibility", "visible");
    map.setLayoutProperty(ZONES_LABEL_LAYER_ID, "visibility", "visible");
    void (async () => {
      depotGroups = await window.depotGroups.list();
      if (selectedDepotGroupId === null) selectedDepotGroupId = depotGroups[0]?.id ?? null;
      await reloadZones();
      render();
    })();
  };
  fareZonePanelState.close = () => {
    // Switching away while actively drawing cancels the draft — the old
    // standalone toggle button did this on its own second click (there
    // was no other way back in to see the Finish/Cancel controls again
    // without losing it); same reasoning, now triggered by the Fares
    // screen's own tab switch/close instead.
    if (fareZoneDrawState.isDrawing) {
      fareZoneDrawState.isDrawing = false;
      draftPoints = [];
      updateDraftLayers();
      render();
    }
    panel.style.display = "none";
    setMenuOpen("fare-zone-drawing", false);
    // Live user report, 2026-11-01: "when I close the fare zone menu the
    // zones don't go away" — closing the panel previously only hid the
    // panel's own DOM, leaving the map's own fill/outline/label layers
    // showing every zone regardless. Cleared on close, repopulated by
    // reloadZones()+render() above the next time the panel opens.
    (map.getSource(ZONES_SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
    (map.getSource(TOWN_BORDER_SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
  };
}
