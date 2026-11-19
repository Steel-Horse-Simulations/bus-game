// One-time startup repair for the 2026-11-12 orientation bug: route-orientation.ts's
// computeRouteOrientation used to check isCircular() before considering a
// terminus loop's own outboundEndIndex, so any route whose stored points
// return to their own start (every "Portree" terminus-loop variation,
// route 56 being the live report) got its direction from raw geometric
// winding instead of the real main bus station — different variations with
// slightly different detours could disagree despite representing the same
// real-world direction.
//
// The fixed logic lives in route-orientation.ts now, but `routes.orientation`
// is computed once at save time and persisted (electron/db.mts), not
// recomputed on load — so existing saves need their already-wrong rows
// corrected once, here, rather than only going forward. This can't be a
// plain db.mts migration: the main bus station's real coordinates for a
// real OSM-sourced station aren't in the SQLite save at all (only its
// osmId), they're only available once the renderer has loaded the real
// stop/station data — exactly what busStationsState (stops-layer.ts) holds
// after drawStops() resolves. Runs every launch (cheap — a handful of
// routes per depot group, most already correct) rather than once behind a
// schema-version flag, so it also keeps catching this same class of problem
// if it ever recurs from an unrelated bug, not just this one fix.
import { computeRouteOrientation, type LonLat } from "./route-orientation";
import { busStationsState } from "./stops-layer";

export async function repairRouteOrientations(): Promise<void> {
  const [routes, depotGroups] = await Promise.all([window.routes.list(), window.depotGroups.list()]);
  const stationByGroupId = new Map<number, LonLat>();
  for (const group of depotGroups) {
    if (group.mainBusStationOsmId === null) continue;
    const station = busStationsState.find((s) => s.osmId === group.mainBusStationOsmId);
    if (station) stationByGroupId.set(group.id, [station.lon, station.lat]);
  }

  for (const route of routes) {
    const station = stationByGroupId.get(route.depotGroupId);
    if (!station) continue;
    const coords: LonLat[] = route.points.map((p) => [p.lon, p.lat]);
    const corrected = computeRouteOrientation(coords, station, route.terminusIndex ?? undefined);
    if (corrected !== route.orientation) {
      await window.routes.setOrientation(route.id, corrected);
    }
  }
}
