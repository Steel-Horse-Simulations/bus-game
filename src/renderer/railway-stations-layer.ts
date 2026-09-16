// Renders platform shapes loaded from the pipeline's railway.bin. Railway
// stations, Glasgow Subway stations and tram stops themselves are no
// longer drawn as their own map markers — 534 separate dots was reported
// as far too cluttered — so DESIGN.md §4's ring-around-the-stop pattern
// now happens the same way it does for bus stations: an ordinary nearby
// stop gets a coloured border instead of the station getting its own
// marker. That linking lives in stops-layer.ts (which needs the same
// railway.bin data for its own manual-link picker — a player choice, not
// computed from proximity), not here — this module is platform shapes only.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { decode_platforms } from "./wasm/game_wasm.js";

// Real openstreetmap.org's own platform colour — @platform-fill in
// openstreetmap-carto's style/roads.mss, confirmed directly against that
// stylesheet rather than guessed.
const PLATFORM_COLOR = "#bbbbbb";
// Full physical shape is only worth showing once you're close enough to
// tell platforms apart from the road/rail lines around them — DESIGN.md's
// own "full shape... visible only at close zoom" choice.
const PLATFORM_MINZOOM = 16;

interface DecodedPlatform {
  osmId: number;
  coordinates: number[]; // flat [lon, lat, lon, lat, ...]
}

function toLngLatPairs(flat: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  return pairs;
}

// A platform mapped as a closed way (first point equals the last, at
// least 4 points) is a real area — a platform *island* or wide concourse,
// not just an edge — and reads far better filled than as an outline
// retracing its own perimeter. An open way (the common case, a platform
// edge alongside the tracks) renders as a line instead.
function isClosedRing(pairs: [number, number][]): boolean {
  if (pairs.length < 4) return false;
  const [firstLon, firstLat] = pairs[0];
  const [lastLon, lastLat] = pairs[pairs.length - 1];
  return firstLon === lastLon && firstLat === lastLat;
}

export async function drawRailwayPlatforms(map: maplibregl.Map): Promise<void> {
  const res = await fetch("http://127.0.0.1:38271/railway.bin");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const platforms = decode_platforms(bytes) as DecodedPlatform[];

  const lineFeatures: GeoJSON.Feature[] = [];
  const polygonFeatures: GeoJSON.Feature[] = [];
  for (const p of platforms) {
    const pairs = toLngLatPairs(p.coordinates);
    if (pairs.length < 2) continue;
    if (isClosedRing(pairs)) {
      polygonFeatures.push({
        type: "Feature",
        properties: { osmId: p.osmId },
        geometry: { type: "Polygon", coordinates: [pairs] },
      });
    } else {
      lineFeatures.push({
        type: "Feature",
        properties: { osmId: p.osmId },
        geometry: { type: "LineString", coordinates: pairs },
      });
    }
  }

  map.addSource("railway-platforms-lines", {
    type: "geojson",
    data: { type: "FeatureCollection", features: lineFeatures },
  });
  map.addSource("railway-platforms-polygons", {
    type: "geojson",
    data: { type: "FeatureCollection", features: polygonFeatures },
  });

  // Inserted before "boundary" — the basemap's static layer stack has
  // landcover/landuse/water/building there already, then every road and
  // rail layer after it (see basemap-style.json), so this renders above
  // the general ground fills but behind every road, matching a real
  // platform's own physical relationship to the road network (roads
  // aren't drawn "through" a platform in the real world, and the platform
  // shouldn't visually sit "on top of" a road here either).
  const BEFORE_ROADS_LAYER_ID = "boundary";

  map.addLayer(
    {
      id: "railway-platforms-fill",
      type: "fill",
      source: "railway-platforms-polygons",
      minzoom: PLATFORM_MINZOOM,
      paint: {
        "fill-color": PLATFORM_COLOR,
        "fill-opacity": 1,
      },
    },
    BEFORE_ROADS_LAYER_ID,
  );
  map.addLayer(
    {
      id: "railway-platforms-outline",
      type: "line",
      source: "railway-platforms-lines",
      minzoom: PLATFORM_MINZOOM,
      paint: {
        "line-color": PLATFORM_COLOR,
        "line-width": ["interpolate", ["linear"], ["zoom"], 16, 2, 19, 5],
      },
    },
    BEFORE_ROADS_LAYER_ID,
  );
}
