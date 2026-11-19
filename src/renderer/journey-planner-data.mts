// Assembles the RAPTOR journey planner's input (DESIGN.md §2 "Journey
// planning") from the game's own route/timetable tables. Pure functions, no
// WASM/DOM dependency — same convention as route-timetable.mts itself, so
// this stays independently testable and reusable from wherever a journey
// needs planning later (a passenger-sim tick, a debug tool, eventually a
// player-facing "plan my journey" UI).
import { weekdayMasksOverlap, isPeakMinute } from "./route-timetable.mts";
import { buildRouteTimetableGrid, makeTimetableReferenceResolver, routeDirectionRanges } from "./route-timetable-grid.mts";

export interface TransitStop {
  osmId: number;
  lon: number;
  lat: number;
}

export interface JourneyStopTime {
  stopIndex: number;
  arrivalSeconds: number;
  departureSeconds: number;
}

export interface JourneyTrip {
  routeId: number;
  stopTimes: JourneyStopTime[];
}

export interface TransitData {
  stops: TransitStop[];
  trips: JourneyTrip[];
}

// `serviceDayBit` must be exactly one of route-timetable.mts's own
// WEEKDAY_BITS values (one day, not a combined mask) — the day being
// planned for, not the set of days a component happens to cover. Matched
// against each stored component via `weekdayMasksOverlap` the same way the
// rest of the game already decides "does this timetable run today."
//
// A pickup/dropoff override of "skip" removes a point from the trip
// entirely (the bus doesn't call there); "pickup_only"/"setdown_only"
// aren't distinguished yet — both still board and alight passengers, a
// narrower simplification worth tightening once a real passenger sim
// depends on it more precisely than "can a trip be found at all" (T9,
// plan #9: this is exactly that caller, which is why the former
// `direction !== "both"` exclusion below was removed — a terminus-loop
// route's split "outbound"/"inbound" components now contribute trips
// too, sliced to that component's own leg via routeDirectionRanges, the
// same convention vehicle-simulation.ts's render path uses).
export function buildTransitData(
  routes: readonly Route[],
  timetables: readonly RouteTimetable[],
  serviceDayBit: number,
): TransitData {
  const stopIndexByOsmId = new Map<number, number>();
  const stops: TransitStop[] = [];
  function stopIndexFor(osmId: number, lon: number, lat: number): number {
    const existing = stopIndexByOsmId.get(osmId);
    if (existing !== undefined) return existing;
    const index = stops.length;
    stopIndexByOsmId.set(osmId, index);
    stops.push({ osmId, lon, lat });
    return index;
  }

  // A mirroring component (2026-11-15) can reference any route's
  // timetable, not just one already in `routes` for this call — built
  // once from the full lists this function was already given.
  const resolveReference = makeTimetableReferenceResolver(routes, timetables);
  const trips: JourneyTrip[] = [];
  for (const route of routes) {
    const skippedIndexes = new Set(
      route.pickupDropoffOverrides.filter((o) => o.value === "skip").map((o) => o.pointIndex),
    );
    const allStopPoints = route.points
      .map((p, pointIndex) => ({ p, pointIndex }))
      .filter(({ p, pointIndex }) => p.kind === "stop" && p.osmId !== undefined && !skippedIndexes.has(pointIndex));
    if (allStopPoints.length === 0) continue;

    for (const timetable of timetables) {
      if (timetable.routeId !== route.id) continue;
      if (!weekdayMasksOverlap(timetable.weekdayMask, serviceDayBit)) continue;

      // A split component's arrival/departureOffsetsSeconds are full-
      // route-length arrays, real only across its own leg's point range —
      // the rest is 0-padding (route-timetable-grid.mts's
      // computeOffsetsForDirection). Restrict stopPoints to that range so
      // a trip's stop times are never built from the padding.
      const segment =
        timetable.direction === "both"
          ? undefined
          : routeDirectionRanges(route).find((r) => r.label === timetable.direction);
      const fromPointIndex = segment?.fromPointIndex ?? 0;
      const toPointIndex = segment?.toPointIndex ?? route.points.length - 1;
      const stopPoints = allStopPoints.filter(
        ({ pointIndex }) => pointIndex >= fromPointIndex && pointIndex <= toPointIndex,
      );
      if (stopPoints.length === 0) continue;

      const grid = buildRouteTimetableGrid(route, timetable, {}, resolveReference);
      for (const departureMinute of grid.departureMinutes) {
        // Peak/standard picked per TRIP by its own real departure clock
        // time (2026-11-15, same reasoning as buildRouteTimetableGrid
        // itself) — otherwise a timing point's peak padding would never
        // reach the journey planner at all.
        const peak = isPeakMinute(departureMinute);
        const arrivalOffsets = peak ? timetable.arrivalOffsetsSecondsPeak : timetable.arrivalOffsetsSeconds;
        const departureOffsets = peak ? timetable.departureOffsetsSecondsPeak : timetable.departureOffsetsSeconds;
        const departureSecondsBase = departureMinute * 60;
        const stopTimes: JourneyStopTime[] = stopPoints.map(({ p, pointIndex }) => ({
          stopIndex: stopIndexFor(p.osmId!, p.lon, p.lat),
          arrivalSeconds: Math.round(departureSecondsBase + arrivalOffsets[pointIndex]),
          departureSeconds: Math.round(departureSecondsBase + departureOffsets[pointIndex]),
        }));
        trips.push({ routeId: route.id, stopTimes });
      }
    }
  }

  return { stops, trips };
}
