// Enumerates a depot group's real journeys for a day type (OPERATIONS.md §7
// "Duties", Phase 3) — every generated departure across every one of that
// depot group's own routes, each carrying its real clock start/end time and
// its start/end location. A journey has no identity or storage of its own
// anywhere in the save (see db.mts's own "duties"/"duty_pieces" comments);
// this is derived fresh from each route's own saved timetable every time,
// the same "merged view is a projection, not a copy" principle the
// timetable grid itself already follows — and uses the exact same
// generate -> exclude -> merge-custom pipeline route-timetable-grid.mts
// does, so a duty's own journey list always matches the published
// timetable exactly, not an approximation of it. Pure, no DOM/WASM
// dependency, so it's safely unit-testable in Node.
import { generateDepartureMinutesForBands, applyExcludedDepartures, mergeCustomDepartures } from "./route-timetable.mts";

export interface Journey {
  routeId: number;
  routeNumber: string;
  routeColour: string;
  departureMinutes: number;
  startClockMinutes: number;
  endClockMinutes: number;
  startPoint: { lon: number; lat: number };
  endPoint: { lon: number; lat: number };
  // Real stop identity, when the route's own first/last point is a stop
  // (not a bare waypoint) — null otherwise. Deliberately just the osmId,
  // not the name itself: this module stays pure/DOM-free (see the file's
  // own header), so the UI resolves the real name at render time via
  // stopsPanelState.displayNameFor, the same lookup route-panel.ts's own
  // stopLabel already uses.
  startStopOsmId: number | null;
  endStopOsmId: number | null;
}

// A single route's own journeys for one timetable (already matched to the
// right day type by the caller). Returns [] for a timetable that doesn't
// (yet) have offsets computed for every point, or whose bands don't
// currently validate — the same "nothing to show" the timetable grid and
// vehicle-simulation.ts both already fall back to rather than throwing.
export function journeysForRoute(route: Route, timetable: RouteTimetable): Journey[] {
  if (timetable.arrivalOffsetsSeconds.length !== route.points.length) return [];
  if (route.points.length === 0) return [];
  let generated: number[];
  try {
    generated = generateDepartureMinutesForBands(timetable.timeBands);
  } catch {
    return [];
  }
  const excluded = applyExcludedDepartures(generated, timetable.excludedDepartureMinutes);
  const departures = mergeCustomDepartures(excluded, timetable.customDepartureMinutes);

  const startOffsetMinutes = timetable.departureOffsetsSeconds[0] / 60;
  const endOffsetMinutes = timetable.arrivalOffsetsSeconds[timetable.arrivalOffsetsSeconds.length - 1] / 60;
  const startPoint = route.points[0];
  const endPoint = route.points[route.points.length - 1];

  return departures.map((departureMinutes) => ({
    routeId: route.id,
    routeNumber: route.number,
    routeColour: route.colour,
    departureMinutes,
    startClockMinutes: departureMinutes + startOffsetMinutes,
    endClockMinutes: departureMinutes + endOffsetMinutes,
    startPoint: { lon: startPoint.lon, lat: startPoint.lat },
    endPoint: { lon: endPoint.lon, lat: endPoint.lat },
    startStopOsmId: startPoint.kind === "stop" ? (startPoint.osmId ?? null) : null,
    endStopOsmId: endPoint.kind === "stop" ? (endPoint.osmId ?? null) : null,
  }));
}

// Every journey across every route in one depot group, for one day type,
// sorted into running order — the full list a duty-building screen works
// from. `timetables` is every timetable fetched for the game (matching
// `window.routeTimetables.listAll()`'s own shape elsewhere), filtered down
// here rather than requiring the caller to pre-filter.
export function journeysForDepotGroup(
  routes: readonly Route[],
  timetables: readonly RouteTimetable[],
  depotGroupId: number,
  dayType: DayType,
): Journey[] {
  const out: Journey[] = [];
  for (const route of routes) {
    if (route.depotGroupId !== depotGroupId) continue;
    const tt = timetables.find((t) => t.routeId === route.id && t.dayType === dayType);
    if (!tt) continue;
    out.push(...journeysForRoute(route, tt));
  }
  out.sort((a, b) => a.startClockMinutes - b.startClockMinutes);
  return out;
}

// A stable string key for a journey — used to match a duty_pieces row
// (routeId + departureMinutes) back to the real Journey it refers to, and
// to track which journeys are already assigned to some duty.
export function journeyKey(routeId: number, departureMinutes: number): string {
  return `${routeId}:${departureMinutes}`;
}
