// Buses driving the real road network (DESIGN.md §2 "Vehicles", Phase 3's
// first item): every generated departure on a saved, timetabled route gets
// a moving badge that follows the route's actual road-snapped path at the
// pace its own precomputed stop-to-stop times set, including holding at a
// timing point's dwell — reusing the timetable engine's own output rather
// than re-deriving timing here.
//
// Deliberate simplifications, flagged rather than silently assumed away:
//  - No pause/speed control UI yet (DESIGN.md §3's 1x/4x/10x/20x/60x) — the
//    game clock here just runs continuously at the spec's base rate (1
//    real second = 10 game seconds). Add the control surface once there's
//    a reason to pause (there's nothing to manage mid-simulation yet).
//  - No real in-game calendar/date screen exists, so there's no way to
//    derive "today is a Tuesday" from game time. A manual Mon-Fri/Sat/Sun
//    selector stands in for it — also more useful for testing, since it
//    lets a Saturday timetable be previewed without waiting for one.
//  - Rendered as a plain coloured circle + route number + a rotated arrow
//    (reusing the existing "oneway-arrow" icon), not DESIGN.md §11's own
//    "small angled rectangle in a simplified livery" badge — that badge is
//    explicitly defined in terms of a livery's primary/secondary colours,
//    which don't exist yet (OPERATIONS.md §4/§5, Phase 3 later item). This
//    is a placeholder visual, not the final one.
//  - Runs on the main thread via `setInterval`, not the Web Worker
//    CLAUDE.md's Stack table names for "Simulation" — the position maths
//    for a realistic number of routes at this stage is cheap; move it to a
//    worker once real passenger simulation (Phase 4) makes it worth the
//    message-passing overhead.
//  - No live "routes changed" event exists, so the route/timetable cache
//    just re-fetches on a timer rather than invalidating precisely.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import type { Router } from "./wasm/game_wasm.js";
import { generateDepartureMinutesForBands } from "./route-timetable.mts";
import { computeVehiclePosition, type RouteLeg, type JourneyPointTiming } from "./vehicle-position.mts";

const DAY_TYPES: DayType[] = ["monday_friday", "saturday", "sunday"];
const DAY_TYPE_LABELS: Record<DayType, string> = { monday_friday: "Mon-Fri", saturday: "Sat", sunday: "Sun" };

// DESIGN.md §3: "one real second is ten game seconds."
const GAME_SECONDS_PER_REAL_SECOND = 10;
const SECONDS_PER_DAY = 86400;
const REFRESH_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 250;

interface CachedRoute {
  route: Route;
  legs: RouteLeg[];
}

export async function mountVehicleSimulation(map: maplibregl.Map, router: Router): Promise<void> {
  let dayType: DayType = "monday_friday";
  let routeCache = new Map<number, CachedRoute>();
  let timetablesByRoute = new Map<number, RouteTimetable[]>();

  const buildLegs = (points: RoutePoint[]): RouteLeg[] => {
    const legs: RouteLeg[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const leg = router.find_route(a.lon, a.lat, b.lon, b.lat);
      const coords: [number, number][] = [];
      for (let j = 0; j < leg.length; j += 2) coords.push([leg[j], leg[j + 1]]);
      // A leg the router can't find (shouldn't happen for a route that
      // saved successfully, but the road graph could in principle change
      // under it) falls back to a straight line rather than dropping the
      // whole route's simulation.
      legs.push({ coords: coords.length >= 2 ? coords : [[a.lon, a.lat], [b.lon, b.lat]] });
    }
    return legs;
  };

  const refresh = async (): Promise<void> => {
    const [routes, timetables] = await Promise.all([window.routes.list(), window.routeTimetables.listAll()]);
    routeCache = new Map(
      routes.filter((r) => r.points.length >= 2).map((r) => [r.id, { route: r, legs: buildLegs(r.points) }]),
    );
    timetablesByRoute = new Map();
    for (const tt of timetables) {
      const list = timetablesByRoute.get(tt.routeId) ?? [];
      list.push(tt);
      timetablesByRoute.set(tt.routeId, list);
    }
  };
  await refresh();
  setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

  map.addSource("vehicles", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "vehicles-circle",
    type: "circle",
    source: "vehicles",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 17, 10],
      "circle-color": ["get", "colour"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "vehicles-arrow",
    type: "symbol",
    source: "vehicles",
    layout: {
      "icon-image": "oneway-arrow",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 17, 0.6],
      "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "vehicles-number",
    type: "symbol",
    source: "vehicles",
    layout: {
      "text-field": ["get", "number"],
      "text-size": 10,
      "text-offset": [0, 1.1],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });

  // Day-type selector — the one free corner: the route panel occupies the
  // full left-hand height, "Hidden stops"/"Place stop" occupy bottom-right.
  const dayTypeBar = document.createElement("div");
  dayTypeBar.className = "panel";
  dayTypeBar.style.position = "absolute";
  dayTypeBar.style.top = "8px";
  dayTypeBar.style.right = "8px";
  dayTypeBar.style.zIndex = "2";
  dayTypeBar.style.display = "flex";
  dayTypeBar.style.gap = "4px";
  dayTypeBar.style.padding = "6px";
  document.body.appendChild(dayTypeBar);

  const dayTypeButtons = new Map<DayType, HTMLButtonElement>();
  for (const dt of DAY_TYPES) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = DAY_TYPE_LABELS[dt];
    btn.classList.toggle("is-active", dt === dayType);
    btn.addEventListener("click", () => {
      dayType = dt;
      for (const [d, b] of dayTypeButtons) b.classList.toggle("is-active", d === dayType);
    });
    dayTypeButtons.set(dt, btn);
    dayTypeBar.appendChild(btn);
  }

  const activeVehicleFeatures = (): GeoJSON.Feature[] => {
    const nowSeconds = (Date.now() / 1000) * GAME_SECONDS_PER_REAL_SECOND;
    const gameSecondsOfDay = nowSeconds % SECONDS_PER_DAY;
    const features: GeoJSON.Feature[] = [];

    for (const { route, legs } of routeCache.values()) {
      if (legs.length === 0) continue;
      const timetables = timetablesByRoute.get(route.id) ?? [];
      const tt = timetables.find((t) => t.dayType === dayType);
      if (!tt || tt.arrivalOffsetsSeconds.length !== route.points.length) continue;
      let departures: number[];
      try {
        departures = generateDepartureMinutesForBands(tt.timeBands);
      } catch {
        continue;
      }
      const points: JourneyPointTiming[] = route.points.map((_, i) => ({
        arrivalOffsetSeconds: tt.arrivalOffsetsSeconds[i],
        departureOffsetSeconds: tt.departureOffsetsSeconds[i],
      }));
      // A journey that departed yesterday can still be running well past
      // midnight into "today" (a near-24/7 service) — checked alongside a
      // same-day departure, not instead of it.
      for (const departureMinutes of departures) {
        for (const dayOffsetSeconds of [0, -SECONDS_PER_DAY]) {
          const elapsed = gameSecondsOfDay - departureMinutes * 60 - dayOffsetSeconds;
          const result = computeVehiclePosition(legs, points, elapsed);
          if (!result) continue;
          features.push({
            type: "Feature",
            properties: { colour: route.colour, number: route.number, bearing: result.bearingDegrees },
            geometry: { type: "Point", coordinates: [result.position[0], result.position[1]] },
          });
        }
      }
    }
    return features;
  };

  const tick = (): void => {
    (map.getSource("vehicles") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: activeVehicleFeatures(),
    });
  };
  tick();
  setInterval(tick, TICK_INTERVAL_MS);

  (window as unknown as { __vehicleSim: unknown }).__vehicleSim = {
    get routeCount() {
      return routeCache.size;
    },
    get dayType() {
      return dayType;
    },
    setDayType(dt: DayType) {
      dayType = dt;
      for (const [d, b] of dayTypeButtons) b.classList.toggle("is-active", d === dayType);
    },
    activeVehicleFeatures,
  };
}
