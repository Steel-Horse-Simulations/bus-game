// Buses driving the real road network (DESIGN.md §2 "Vehicles", Phase 3's
// first item): every generated departure on a saved, timetabled route gets
// a moving badge that follows the route's actual road-snapped path at the
// pace its own precomputed stop-to-stop times set, including holding at a
// timing point's dwell — reusing the timetable engine's own output rather
// than re-deriving timing here.
//
// Deliberate simplifications, flagged rather than silently assumed away:
//  - Pause/speed now come from the real game clock (game-clock-engine.ts,
//    DESIGN.md §3's 1x/4x/10x/20x/60x, confirmed 2026-11-01) rather than
//    running continuously off Date.now() — this module reads the shared
//    gameClockState instead of computing its own "now".
//  - No real in-game calendar/date screen exists, so there's no way to
//    derive "today is a Tuesday" from game time. A manual Mon-Fri/Sat/Sun
//    selector stands in for it — also more useful for testing, since it
//    lets a Saturday timetable be previewed without waiting for one.
//  - Rendered as DESIGN.md §11's own "small angled rectangle in a
//    simplified livery" badge (livery-map-badges.ts), carrying the route
//    number per the real placement ratio (OPERATIONS.md §4), plus a
//    rotated arrow (the existing "oneway-arrow" icon). The livery itself
//    is a random, stable-per-journey placeholder pick (2026-11-05, user
//    request) — there's no real owned-vehicle-to-journey assignment yet,
//    so it can't be the genuinely correct livery for whichever real bus
//    is running. A journey with no eligible livery (rare — only when a
//    save somehow has none seeded) falls back to a plain route-coloured
//    circle instead.
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
import { gameClockState } from "./game-clock-engine";
import { registerLiveryBadgeIcons, pickLiveryForJourney, liveryBadgeImageId } from "./livery-map-badges";

const DAY_TYPES: DayType[] = ["monday_friday", "saturday", "sunday"];
const DAY_TYPE_LABELS: Record<DayType, string> = { monday_friday: "Mon-Fri", saturday: "Sat", sunday: "Sun" };

const SECONDS_PER_DAY = 86400;
const REFRESH_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 250;

interface CachedRoute {
  route: Route;
  legs: RouteLeg[];
  pointsKey: string;
}

export async function mountVehicleSimulation(map: maplibregl.Map, router: Router): Promise<void> {
  await registerLiveryBadgeIcons(map);

  let dayType: DayType = "monday_friday";
  let routeCache = new Map<number, CachedRoute>();
  let timetablesByRoute = new Map<number, RouteTimetable[]>();
  let liveries: Livery[] = [];
  let depotGroupsById = new Map<number, DepotGroup>();

  // NOTE (2026-10-11): briefly migrated to `find_route_through` for the
  // whole route in one call (same fix shape as route-draw.ts's own
  // `rebuildRoute`, to avoid an interior point being independently
  // re-snapped as one leg's own goal and the next leg's own start). Reverted
  // the same day after a live install hung indefinitely on boot ("Drawing
  // stops…" never progressing) — not yet root-caused; the native Rust
  // timing for the worst real route in the save came back under half a
  // second, so the cause isn't simply "this is slow," but something in the
  // WASM build specifically. Reverted untested rather than risk another
  // live hang; see OPEN-ITEMS.md for the real fix to retry, properly
  // verified against the live packaged app this time before shipping.
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

  // Rebuilds only what actually changed, rather than discarding and
  // recomputing every route's full path on every tick of this timer (found
  // live, 2026-10-31: this was the real cause of persistent in-game lag
  // scaling with route count/length — "routes only compute once at draw
  // time" was wrong, this 30-second interval recomputed everything,
  // unconditionally, for as long as the game stayed open). Mirrors the
  // existing `pointsKey` diffing already used for the same reason in
  // route-panel.ts's `syncShownRoutes` — a route's own points changing is
  // the only thing that can change its legs, so a cheap string-equality
  // check on them is enough to skip re-routing anything untouched.
  const refresh = async (): Promise<void> => {
    const [routes, timetables, liveriesList, depotGroups] = await Promise.all([
      window.routes.list(),
      window.routeTimetables.listAll(),
      window.liveries.list(),
      window.depotGroups.list(),
    ]);
    liveries = liveriesList;
    depotGroupsById = new Map(depotGroups.map((g) => [g.id, g]));
    const next = new Map<number, CachedRoute>();
    for (const route of routes) {
      if (route.points.length < 2) continue;
      const pointsKey = JSON.stringify(route.points);
      const cached = routeCache.get(route.id);
      if (cached && cached.pointsKey === pointsKey) {
        next.set(route.id, { ...cached, route });
      } else {
        next.set(route.id, { route, legs: buildLegs(route.points), pointsKey });
      }
    }
    routeCache = next;
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

  // A journey with no eligible livery (badgeImage === "", rare — see
  // livery-map-badges.ts) falls back to the original plain circle, same
  // as every vehicle showed before liveries were wired in.
  const noBadgeFilter: maplibregl.FilterSpecification = ["==", ["get", "badgeImage"], ""];
  const hasBadgeFilter: maplibregl.FilterSpecification = ["!=", ["get", "badgeImage"], ""];

  map.addLayer({
    id: "vehicles-circle",
    type: "circle",
    source: "vehicles",
    filter: noBadgeFilter,
    paint: {
      // Extra low-zoom stop (2026-11-07 live report: "can the icons
      // scale in size please as I zoom out") — the interpolate only
      // used to start at zoom 10, clamping to that same size for
      // anything zoomed out further, which on a whole-UK map reads as
      // "not scaling at all" once zoomed out past it.
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 10, 5, 17, 10],
      "circle-color": ["get", "colour"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "vehicles-circle-number",
    type: "symbol",
    source: "vehicles",
    filter: noBadgeFilter,
    layout: {
      "text-field": ["get", "number"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 4, 6, 10, 10, 17, 14],
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

  // DESIGN.md §11 "Buses": "a small angled rectangle in a simplified...
  // livery" — the real badge PNG (256x112, livery-map-badges.ts),
  // rotated to the bus's own heading. icon-size is tuned by eye for a
  // 256x112 source image (unlike the 16x16 oneway-arrow below, which
  // needs its own much larger multiplier) — a cosmetic value to refine
  // once seen live, not a measured one. Extra low-zoom stop added
  // 2026-11-07, same reason as vehicles-circle above.
  map.addLayer({
    id: "vehicles-badge",
    type: "symbol",
    source: "vehicles",
    filter: hasBadgeFilter,
    layout: {
      "icon-image": ["get", "badgeImage"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.04, 10, 0.09, 17, 0.22],
      "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  // The route number, drawn on the badge itself per the real placement
  // ratio resolved from a live reference (OPERATIONS.md §4, Q14,
  // 2026-11-05): centred in the badge's own clear middle band, rotating
  // with the badge rather than staying map-upright.
  //
  // Live bug report (2026-11-07, screenshot): rotating the number with
  // the raw bearing reads upside-down for any vehicle heading roughly
  // south (90°-270°) — correct per the Q14 "rotates with it" decision in
  // the literal sense, but unreadable in practice, which is the actual
  // defect. Fixed by normalizing the rotation into the readable half:
  // past 90°/270° it flips 180° rather than continuing to rotate past
  // upside-down, so the digits always read left-to-right no matter which
  // way the bus is actually facing. The badge image itself (icon-rotate
  // below) is untouched and still shows the true heading exactly —
  // only the number's own rotation is clamped, not the vehicle's
  // direction indicator.
  map.addLayer({
    id: "vehicles-badge-number",
    type: "symbol",
    source: "vehicles",
    filter: hasBadgeFilter,
    layout: {
      "text-field": ["get", "number"],
      // Bumped (live request, same report) — 6-14 read too small even
      // at max zoom.
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 8, 17, 18],
      "text-rotate": [
        "let",
        "b",
        ["%", ["+", ["%", ["get", "bearing"], 360], 360], 360],
        ["case", ["all", [">", ["var", "b"], 90], ["<", ["var", "b"], 270]], ["-", ["var", "b"], 180], ["var", "b"]],
      ],
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  });
  map.addLayer({
    id: "vehicles-arrow",
    type: "symbol",
    source: "vehicles",
    layout: {
      "icon-image": "oneway-arrow",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.15, 10, 0.35, 17, 0.6],
      "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
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
    const nowSeconds = gameClockState.accumulatedGameSeconds;
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
        const livery = pickLiveryForJourney(route, departureMinutes, liveries, depotGroupsById.get(route.depotGroupId));
        const badgeImage = livery ? liveryBadgeImageId(livery.name) : "";
        for (const dayOffsetSeconds of [0, -SECONDS_PER_DAY]) {
          const elapsed = gameSecondsOfDay - departureMinutes * 60 - dayOffsetSeconds;
          const result = computeVehiclePosition(legs, points, elapsed);
          if (!result) continue;
          features.push({
            type: "Feature",
            properties: { colour: route.colour, number: route.number, bearing: result.bearingDegrees, badgeImage },
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
