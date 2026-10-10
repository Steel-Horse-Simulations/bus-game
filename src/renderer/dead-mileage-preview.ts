// Dead mileage routes for one depot (DESIGN.md "Dead mileage routes"), opened
// from the depot menu. "Into depot" and "out of depot" are separate routes,
// not one route reversed — one-way streets mean dealer-to-depot and
// depot-to-dealer are genuinely different paths (a real bug found live: the
// outbound path was computed dealer-to-entrance and reused as-is, sending it
// the wrong way down one-way roads). Each route runs from a dealer entrance
// and forks near the depot into one branch per depot entrance, auto-
// connected the moment the route is created — the same shape as a route
// variation splitting off a trunk, but only over the last short stretch.
// Every router call is made in the real direction of travel for that route.
// The player reshapes a route by clicking anywhere on its drawn line, the
// same as drawing an ordinary route — no separate mode to add a waypoint.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import type { Router } from "./wasm/game_wasm.js";

export const OPEN_DEAD_MILEAGE_EVENT = "open-dead-mileage";

const SOURCE_ID = "dead-mileage-route";
const LAYER_ID = "dead-mileage-route-line";
const WAYPOINT_SOURCE_ID = "dead-mileage-waypoints";
const WAYPOINT_LAYER_ID = "dead-mileage-waypoint-dots";

const DIRECTION_COLOUR: Record<DeadMileageDirection, string> = {
  inbound: "#3b82f6",
  outbound: "#f59e0b",
};
const DIRECTION_LABEL: Record<DeadMileageDirection, string> = {
  inbound: "Into depot",
  outbound: "Out of depot",
};

type Point = { lon: number; lat: number };
type Segment = { kind: "trunk" } | { kind: "branch"; branchId: number };
// startOffset: 1 if the first stop is a fixed point not itself a waypoint
// (true everywhere except an outbound trunk, where the dealer sits at the
// END instead) — used to map a click's nearest segment back to the right
// index in the route's own waypoints array. See nearestInsertionIndex.
type ActiveSegment = { segment: Segment; roadCoords: [number, number][]; stops: Point[]; startOffset: number };

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distSqPointToPoint(a: Point, b: Point): number {
  const dx = a.lon - b.lon;
  const dy = a.lat - b.lat;
  return dx * dx + dy * dy;
}

function distSqPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distSqPointToPoint(p, a);
  const t = Math.max(0, Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / lenSq));
  return distSqPointToPoint(p, { lon: a.lon + t * dx, lat: a.lat + t * dy });
}

function nearestSegmentIndex(stops: readonly Point[], click: Point): number {
  let best = 0;
  let bestDist = Infinity;
  for (let j = 0; j < stops.length - 1; j++) {
    const d = distSqPointToSegment(click, stops[j], stops[j + 1]);
    if (d < bestDist) {
      bestDist = d;
      best = j;
    }
  }
  return best;
}

// Runs the router through a chain of stops IN THE ORDER GIVEN, as one
// continuous journey. The caller must pass stops in the real direction of
// travel — this is what keeps one-way streets correct for both directions.
// Uses find_route_through rather than one find_route call per leg spliced
// together in JS: splicing independently snapped every interior waypoint
// twice — once as the arriving leg's goal, once as the departing leg's
// start — and at a one-way-heavy junction those two snaps could land on
// different edges a street apart, arriving one way and leaving another. A
// real bug found on a live route (a loop through a one-way gyratory near
// Shandwick Place, Edinburgh). find_route_through snaps each interior stop
// exactly once on the Rust side instead.
function routeThrough(router: Router, stops: readonly Point[]): { coords: [number, number][]; km: number } | null {
  if (stops.length < 2) return { coords: stops.length === 1 ? [[stops[0].lon, stops[0].lat]] : [], km: 0 };
  const flat = new Float64Array(stops.length * 2);
  stops.forEach((s, i) => {
    flat[i * 2] = s.lon;
    flat[i * 2 + 1] = s.lat;
  });
  const path = router.find_route_through(flat);
  if (path.length < 4) return null;
  const coords: [number, number][] = [];
  for (let j = 0; j < path.length; j += 2) coords.push([path[j], path[j + 1]]);
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += distanceKm(coords[i - 1], coords[i]);
  return { coords, km };
}

// The trunk's own stops, in the real direction of travel for this route's
// direction: inbound runs dealer -> fork, outbound runs fork -> dealer.
function trunkStops(route: DeadMileageRoute, dealer: Point): { stops: Point[]; startOffset: number } {
  return route.direction === "inbound"
    ? { stops: [dealer, ...route.trunkWaypoints], startOffset: 1 }
    : { stops: [...route.trunkWaypoints, dealer], startOffset: 0 };
}

// Where the trunk ends and branches begin: inbound's fork is the trunk's
// last point; outbound's is its first, since outbound's trunk runs the
// other way (fork -> dealer).
function forkPoint(route: DeadMileageRoute, dealer: Point): Point {
  return route.direction === "inbound"
    ? (route.trunkWaypoints[route.trunkWaypoints.length - 1] ?? dealer)
    : (route.trunkWaypoints[0] ?? dealer);
}

// One branch's own stops, in the real direction of travel: inbound runs
// fork -> entrance (bus arriving); outbound runs entrance -> fork (bus
// leaving) — this is the actual fix for the one-way bug, since these are
// not the same path reversed once one-way streets are involved.
function branchStops(route: DeadMileageRoute, branch: DeadMileageBranch, entrance: Point, fork: Point): Point[] {
  return route.direction === "inbound" ? [fork, ...branch.waypoints, entrance] : [entrance, ...branch.waypoints, fork];
}

function entranceAllowsDirection(mode: "entry" | "exit" | "both", needs: "entry" | "exit"): boolean {
  return mode === "both" || mode === needs;
}

export async function mountDeadMileagePreview(map: maplibregl.Map, router: Router): Promise<void> {
  map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": ["match", ["get", "direction"], "inbound", DIRECTION_COLOUR.inbound, "outbound", DIRECTION_COLOUR.outbound, "#a1a1aa"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 8, 18, 14],
    },
  });
  map.addSource(WAYPOINT_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: WAYPOINT_LAYER_ID,
    type: "circle",
    source: WAYPOINT_SOURCE_ID,
    paint: {
      "circle-radius": 5,
      "circle-color": "#e4e4e7",
      "circle-stroke-color": "#18181b",
      "circle-stroke-width": 2,
    },
  });

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "3";
  panel.style.width = "380px";
  panel.style.maxHeight = "75vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  const headerTitle = document.createElement("span");
  headerTitle.textContent = "Dead mileage routes";
  header.appendChild(headerTitle);
  const closeButton = document.createElement("button");
  closeButton.className = "btn";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    panel.style.display = "none";
    selectedRouteId = null;
    rebuildPreview();
  });
  header.appendChild(closeButton);
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let depotId: number | null = null;
  let depotEntrances: DepotEntrance[] = [];
  let dealerEntrances: DealerEntrance[] = [];
  let dealerName = new Map<number, string>();
  let dealerManufacturer = new Map<number, string>();
  let depotLocation: Point | null = null;
  let routes: DeadMileageRoute[] = [];
  let selectedRouteId: number | null = null;
  let activeSegments: ActiveSegment[] = [];
  let errorMessage = "";

  function selectedRoute(): DeadMileageRoute | null {
    return routes.find((r) => r.id === selectedRouteId) ?? null;
  }

  function rebuildPreview(): void {
    const route = selectedRoute();
    activeSegments = [];
    if (!route) {
      (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
      (map.getSource(WAYPOINT_SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const dealer = dealerEntrances.find((e) => e.id === route.dealerEntranceId);
    const lines: GeoJSON.Feature[] = [];
    const dots: Point[] = [...route.trunkWaypoints];
    errorMessage = "";

    if (dealer) {
      const { stops, startOffset } = trunkStops(route, dealer);
      const trunk = routeThrough(router, stops);
      if (trunk) {
        activeSegments.push({ segment: { kind: "trunk" }, roadCoords: trunk.coords, stops, startOffset });
        if (trunk.coords.length >= 2) {
          lines.push({
            type: "Feature",
            properties: { direction: route.direction },
            geometry: { type: "LineString", coordinates: trunk.coords },
          });
        }
      } else {
        errorMessage = "No road route found through the trunk waypoints.";
      }

      const fork = forkPoint(route, dealer);
      for (const branch of route.branches) {
        dots.push(...branch.waypoints);
        const entrance = depotEntrances.find((e) => e.id === branch.depotEntranceId);
        if (!entrance) continue;
        const stopsForBranch = branchStops(route, branch, entrance, fork);
        const leg = routeThrough(router, stopsForBranch);
        if (leg) {
          activeSegments.push({ segment: { kind: "branch", branchId: branch.id }, roadCoords: leg.coords, stops: stopsForBranch, startOffset: 1 });
          if (leg.coords.length >= 2) {
            lines.push({
              type: "Feature",
              properties: { direction: route.direction },
              geometry: { type: "LineString", coordinates: leg.coords },
            });
          }
        } else {
          errorMessage = "No road route found for one branch. Remove its last waypoint to continue.";
        }
      }
    }

    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: lines });
    (map.getSource(WAYPOINT_SOURCE_ID) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: dots.map((d) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [d.lon, d.lat] } })),
    });
  }

  function branchSummary(route: DeadMileageRoute, branch: DeadMileageBranch): string {
    const dealer = dealerEntrances.find((e) => e.id === route.dealerEntranceId);
    const entrance = depotEntrances.find((e) => e.id === branch.depotEntranceId);
    if (!dealer || !entrance) return "";
    const trunk = routeThrough(router, trunkStops(route, dealer).stops);
    const leg = routeThrough(router, branchStops(route, branch, entrance, forkPoint(route, dealer)));
    if (!trunk || !leg) return "no road route";
    const miles = (trunk.km + leg.km) * 0.621371;
    return `${miles.toFixed(1)} miles`;
  }

  async function reloadRoutes(): Promise<void> {
    if (depotId === null) return;
    routes = await window.deadMileage.listForDepot(depotId);
  }

  // Same reasoning as processingClick below: without this, clicking
  // "+ New route" twice before the first click's round trip finishes
  // creates two routes to the same dealer, which is exactly what produced
  // the duplicate-route bug this was found and fixed alongside.
  let creatingRoute = false;

  async function createRoute(direction: DeadMileageDirection, dealerEntranceId: number): Promise<void> {
    if (depotId === null || creatingRoute) return;
    creatingRoute = true;
    try {
      const needs = direction === "inbound" ? "entry" : "exit";
      const created = await window.deadMileage.createRoute(dealerEntranceId, depotId, direction, []);
      for (const entrance of depotEntrances) {
        if (entranceAllowsDirection(entrance.mode, needs)) {
          await window.deadMileage.addBranch(created.id, entrance.id, []);
        }
      }
      await reloadRoutes();
      selectedRouteId = created.id;
      rebuildPreview();
      render();
    } finally {
      creatingRoute = false;
    }
  }

  function renderNewRouteSection(direction: DeadMileageDirection): HTMLElement {
    // The dealer entrance a route uses must allow the opposite movement at
    // the dealer's own end: an inbound route's bus leaves the dealer (needs
    // an exit-capable dealer entrance), an outbound route's bus arrives
    // there (needs an entry-capable one).
    const dealerNeeds = direction === "inbound" ? "exit" : "entry";
    // A dealer entrance that already has a route in this direction is
    // excluded — a live bug: nothing stopped "+ New route" being clicked
    // twice, creating two routes to the same dealer that silently fought
    // over which one was showing ("not going where the first waypoint
    // is"). One route per dealer entrance per direction is enough; a
    // second route to the same place has nothing new to say.
    const alreadyRouted = new Set(routes.filter((r) => r.direction === direction).map((r) => r.dealerEntranceId));
    const options = dealerEntrances.filter((e) => entranceAllowsDirection(e.mode, dealerNeeds) && !alreadyRouted.has(e.id));

    const section = document.createElement("div");
    section.style.marginTop = "6px";
    const label = document.createElement("div");
    label.style.color = "var(--text-muted)";
    label.textContent = DIRECTION_LABEL[direction];
    section.appendChild(label);

    if (options.length === 0) {
      const none = document.createElement("div");
      none.style.color = "var(--text-muted)";
      none.textContent =
        dealerEntrances.some((e) => entranceAllowsDirection(e.mode, dealerNeeds))
          ? "Every eligible dealer already has a route this direction."
          : "No dealer entrance allows this direction yet.";
      section.appendChild(none);
      return section;
    }

    // Defaults to the closest Volvo entrance — Volvo is the universal
    // servicing dealer (OPERATIONS.md), so it's the dealer a route is
    // overwhelmingly likely to be for. Straight-line distance is plenty
    // for picking a default; falls back to the first option if no Volvo
    // entrance is available in this direction.
    let defaultEntranceId = options[0]?.id;
    if (depotLocation) {
      let best = Infinity;
      for (const e of options) {
        if (dealerManufacturer.get(e.dealerId) !== "volvo") continue;
        const d = distSqPointToPoint(depotLocation, e);
        if (d < best) {
          best = d;
          defaultEntranceId = e.id;
        }
      }
    }

    const dealerSelect = document.createElement("select");
    for (const e of options) {
      const option = document.createElement("option");
      option.value = String(e.id);
      option.textContent = `${dealerName.get(e.dealerId) ?? "Dealer"} (${e.mode})`;
      option.selected = e.id === defaultEntranceId;
      dealerSelect.appendChild(option);
    }
    const button = document.createElement("button");
    button.className = "btn";
    button.textContent = `+ New route — ${DIRECTION_LABEL[direction].toLowerCase()}`;
    button.addEventListener("click", () => void createRoute(direction, Number(dealerSelect.value)));
    section.append(dealerSelect, button);
    return section;
  }

  function render(): void {
    body.replaceChildren();

    const routeListHeader = document.createElement("div");
    routeListHeader.style.fontWeight = "600";
    routeListHeader.textContent = `Saved routes (${routes.length})`;
    body.appendChild(routeListHeader);

    for (const route of routes) {
      const row = document.createElement("button");
      row.className = "btn";
      row.style.display = "block";
      row.style.marginTop = "4px";
      row.style.fontWeight = route.id === selectedRouteId ? "600" : "normal";
      row.style.color = DIRECTION_COLOUR[route.direction];
      row.textContent = `${DIRECTION_LABEL[route.direction]}: ${dealerName.get(dealerEntrances.find((e) => e.id === route.dealerEntranceId)?.dealerId ?? -1) ?? "dealer"} (${route.branches.length} branch${route.branches.length === 1 ? "" : "es"})`;
      row.addEventListener("click", () => {
        selectedRouteId = route.id;
        rebuildPreview();
        render();
      });
      body.appendChild(row);
    }

    body.appendChild(renderNewRouteSection("inbound"));
    body.appendChild(renderNewRouteSection("outbound"));

    const route = selectedRoute();
    if (route) {
      const dealer = dealerEntrances.find((e) => e.id === route.dealerEntranceId);
      const needs = route.direction === "inbound" ? "entry" : "exit";
      const editor = document.createElement("div");
      editor.style.borderTop = "1px solid var(--border)";
      editor.style.marginTop = "8px";
      editor.style.paddingTop = "8px";

      const hint = document.createElement("div");
      hint.style.color = "var(--text-muted)";
      hint.textContent = "Click anywhere on the route to add a waypoint there.";
      editor.appendChild(hint);

      const trunkHeader = document.createElement("div");
      trunkHeader.style.fontWeight = "600";
      trunkHeader.style.marginTop = "8px";
      trunkHeader.textContent = `Trunk (${route.trunkWaypoints.length} waypoints)`;
      editor.appendChild(trunkHeader);

      route.trunkWaypoints.forEach((w, i) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.textContent = `${i + 1}. ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`;
        const remove = document.createElement("button");
        remove.className = "btn";
        remove.textContent = "Remove";
        remove.addEventListener("click", async () => {
          const next = route.trunkWaypoints.filter((_, idx) => idx !== i);
          await window.deadMileage.setTrunkWaypoints(route.id, next);
          await reloadRoutes();
          rebuildPreview();
          render();
        });
        row.appendChild(remove);
        editor.appendChild(row);
      });

      const branchesHeader = document.createElement("div");
      branchesHeader.style.fontWeight = "600";
      branchesHeader.style.marginTop = "10px";
      branchesHeader.textContent = "Branches to depot entrances";
      editor.appendChild(branchesHeader);

      for (const entrance of depotEntrances) {
        if (!entranceAllowsDirection(entrance.mode, needs)) continue;
        const branch = route.branches.find((b) => b.depotEntranceId === entrance.id);
        const section = document.createElement("div");
        section.style.marginTop = "4px";

        if (!branch) {
          const reconnect = document.createElement("button");
          reconnect.className = "btn";
          reconnect.textContent = `+ Reconnect entrance ${entrance.id} (${entrance.mode})`;
          reconnect.addEventListener("click", async () => {
            await window.deadMileage.addBranch(route.id, entrance.id, []);
            await reloadRoutes();
            rebuildPreview();
            render();
          });
          section.appendChild(reconnect);
        } else {
          const label = document.createElement("div");
          label.style.fontWeight = "600";
          label.textContent = `Entrance ${entrance.id} (${entrance.mode}) — ${branchSummary(route, branch)}`;
          section.appendChild(label);

          branch.waypoints.forEach((w, i) => {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.textContent = `${i + 1}. ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`;
            const remove = document.createElement("button");
            remove.className = "btn";
            remove.textContent = "Remove";
            remove.addEventListener("click", async () => {
              const next = branch.waypoints.filter((_, idx) => idx !== i);
              await window.deadMileage.setBranchWaypoints(branch.id, next);
              await reloadRoutes();
              rebuildPreview();
              render();
            });
            row.appendChild(remove);
            section.appendChild(row);
          });

          const deleteBranch = document.createElement("button");
          deleteBranch.className = "btn btn-danger";
          deleteBranch.textContent = "Delete branch";
          deleteBranch.addEventListener("click", async () => {
            await window.deadMileage.deleteBranch(branch.id);
            await reloadRoutes();
            rebuildPreview();
            render();
          });
          section.appendChild(deleteBranch);
        }
        editor.appendChild(section);
      }

      if (!dealer) {
        const missing = document.createElement("div");
        missing.style.color = "#f87171";
        missing.style.marginTop = "6px";
        missing.textContent = "This route's dealer entrance no longer exists.";
        editor.appendChild(missing);
      }

      const deleteRoute = document.createElement("button");
      deleteRoute.className = "btn btn-danger";
      deleteRoute.style.marginTop = "10px";
      deleteRoute.textContent = "Delete route";
      deleteRoute.addEventListener("click", async () => {
        await window.deadMileage.deleteRoute(route.id);
        selectedRouteId = null;
        await reloadRoutes();
        rebuildPreview();
        render();
      });
      editor.appendChild(deleteRoute);

      if (errorMessage) {
        const error = document.createElement("div");
        error.style.color = "#f87171";
        error.style.marginTop = "6px";
        error.textContent = errorMessage;
        editor.appendChild(error);
      }

      body.appendChild(editor);
    }
  }

  // Guards the click handler below: without this, clicking more than once
  // before the first click's write-reload-reroute round trip finishes lets
  // two clicks both read the same stale waypoint list and overwrite each
  // other — the real cause of a live bug report ("not going to the first
  // waypoint"), confirmed directly by reading the live map's own rendered
  // features (duplicate waypoint dots, the route split into overlapping
  // fragments) right after it happened, not guessed.
  let processingClick = false;

  map.on("click", async (e) => {
    if (processingClick) return;
    const route = selectedRoute();
    if (!route || activeSegments.length === 0) return;
    processingClick = true;
    try {
      // Snapped onto the real road network the same way route-draw.ts snaps
      // a clicked waypoint — a raw click a few pixels off a wide main road
      // can genuinely be nearer a parallel side street, and the unsnapped
      // point then forces a real detour to reach it (a live bug report:
      // "lots of weird turns instead of going along the main road").
      // snap_to_any_road, not the bus-legal-only snap_to_road, matching how
      // depot/dealer entrances themselves are snapped — a dead mileage
      // route can need the same private/non-bus-legal access roads an
      // entrance sits on.
      const snapped = router.snap_to_any_road(e.lngLat.lng, e.lngLat.lat);
      const click: Point = snapped.length === 2 ? { lon: snapped[0], lat: snapped[1] } : { lon: e.lngLat.lng, lat: e.lngLat.lat };

      let nearest = activeSegments[0];
      let nearestDist = Infinity;
      for (const candidate of activeSegments) {
        for (const [lon, lat] of candidate.roadCoords) {
          const d = distSqPointToPoint(click, { lon, lat });
          if (d < nearestDist) {
            nearestDist = d;
            nearest = candidate;
          }
        }
      }

      const segmentIndex = nearestSegmentIndex(nearest.stops, click);
      const insertAt = Math.max(0, segmentIndex - nearest.startOffset + 1);
      const nearestSegment = nearest.segment;
      if (nearestSegment.kind === "trunk") {
        const next = [...route.trunkWaypoints];
        next.splice(insertAt, 0, click);
        await window.deadMileage.setTrunkWaypoints(route.id, next);
      } else {
        const branch = route.branches.find((b) => b.id === nearestSegment.branchId);
        if (branch) {
          const next = [...branch.waypoints];
          next.splice(insertAt, 0, click);
          await window.deadMileage.setBranchWaypoints(branch.id, next);
        }
      }
      await reloadRoutes();
      rebuildPreview();
      render();
    } finally {
      processingClick = false;
    }
  });

  window.addEventListener(OPEN_DEAD_MILEAGE_EVENT, async (event) => {
    const requested = (event as CustomEvent<{ depotId: number }>).detail.depotId;
    depotId = requested;
    const [entrances, dealers, dealerEntranceList, depots] = await Promise.all([
      window.depots.listAllEntrances(),
      window.dealers.list(),
      window.dealers.listAllEntrances(),
      window.depots.list(),
    ]);
    depotEntrances = entrances.filter((e) => e.depotId === requested);
    dealerEntrances = dealerEntranceList;
    dealerName = new Map(dealers.map((d) => [d.id, d.name]));
    dealerManufacturer = new Map(dealers.map((d) => [d.id, d.manufacturer]));
    depotLocation = depots.find((d) => d.id === requested) ?? null;
    await reloadRoutes();
    selectedRouteId = routes[0]?.id ?? null;
    panel.style.display = "flex";
    rebuildPreview();
    render();
  });
}
