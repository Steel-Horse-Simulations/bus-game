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
import { applyExcludedDepartures, mergeCustomDepartures, weekdayMasksOverlap, isPeakMinute } from "./route-timetable.mts";
import { routeDirectionRanges, generateBaseDepartureMinutes, makeTimetableReferenceResolver, type ResolvedTimetableReference } from "./route-timetable-grid.mts";

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
export function journeysForRoute(
  route: Route,
  timetable: RouteTimetable,
  // Resolves a mirroring component's own reference (2026-11-15) — see
  // route-timetable-grid.mts's generateBaseDepartureMinutes. Optional,
  // defaulting to "nothing resolves" (an ordinary, non-mirroring
  // timetable is completely unaffected either way); journeysForDepotGroup
  // below builds a real one from its own full routes/timetables lists.
  resolveReference: (timetableId: number) => ResolvedTimetableReference | null = () => null,
): Journey[] {
  if (timetable.arrivalOffsetsSeconds.length !== route.points.length) return [];
  if (route.points.length === 0) return [];
  const generated = generateBaseDepartureMinutes(timetable, resolveReference);
  const excluded = applyExcludedDepartures(generated, timetable.excludedDepartureMinutes);
  const departures = mergeCustomDepartures(excluded, timetable.customDepartureMinutes);

  // A split (outbound/inbound) timetable component only ever has real
  // offsets computed for its own leg's point range — everywhere else is
  // left at 0 (computeOffsetsForDirection's own doc comment, route-
  // timetable-grid.mts). Reading point 0 / the route's very last point
  // unconditionally (as this used to) reaches straight into the OTHER
  // leg's always-0 offsets whenever direction !== "both" — a real live
  // bug, 2026-11-14: for a route split into outbound/inbound, this
  // produced a "journey" whose start and end were both the route's own
  // first point (same stop for a round trip) with a 0-minute duration,
  // appearing as a bogus same-stop-to-itself entry ahead of the real one.
  // routeDirectionRanges (same convention sliceGridToPointRange/
  // buildMembersForLabel already use) gives this component's own real
  // [fromPointIndex, toPointIndex] — falls back to the full route for
  // "both" or an unmatched label, unchanged from before.
  const segment = timetable.direction === "both" ? undefined : routeDirectionRanges(route).find((r) => r.label === timetable.direction);
  const fromPointIndex = segment?.fromPointIndex ?? 0;
  const toPointIndex = segment?.toPointIndex ?? route.points.length - 1;
  const startPoint = route.points[fromPointIndex];
  const endPoint = route.points[toPointIndex];

  // Peak/standard picked per JOURNEY by its own real departure clock time
  // (2026-11-15, same reasoning as buildRouteTimetableGrid in route-
  // timetable-grid.mts) — a duty's own end time must reflect whichever
  // padding actually applies to that specific working, not always the
  // off-peak figure.
  return departures.map((departureMinutes) => {
    const peak = isPeakMinute(departureMinutes);
    const startOffsetMinutes = (peak ? timetable.departureOffsetsSecondsPeak : timetable.departureOffsetsSeconds)[fromPointIndex] / 60;
    const endOffsetMinutes = (peak ? timetable.arrivalOffsetsSecondsPeak : timetable.arrivalOffsetsSeconds)[toPointIndex] / 60;
    return {
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
    };
  });
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
  weekdayMask: number,
): Journey[] {
  // Built once per call (not per route) — a mirror can reference ANY
  // route's timetable, not just one in this depot group, so this is
  // resolved against the FULL lists the caller already passed in.
  const resolveReference = makeTimetableReferenceResolver(routes, timetables);
  const out: Journey[] = [];
  for (const route of routes) {
    if (route.depotGroupId !== depotGroupId) continue;
    // Real live bug, 2026-11-14: "if I have a M-F timetable I can't see
    // that when editing a M-S timetable it's the same in duties" — this
    // used exact mask equality, so a Mon-Fri-only component never showed
    // up while viewing any day-type button that wasn't spelled exactly
    // "Mon-Fri" (Mon-Sat, Every day, a custom mask...), even on the days
    // they genuinely share. `weekdayMasksOverlap` is the same "does this
    // day type apply" check the journey planner already uses
    // (journey-planner-data.mts) — matched here against the viewed
    // weekdayMask's whole combined set of days, not a single day bit, so
    // this still only takes the FIRST overlapping component per route; a
    // route with two different components that between them only
    // partially cover the viewed mask (e.g. separate Mon-Fri and
    // Saturday-only components while viewing a combined Mon-Sat day
    // type) still shows just one of them, not a true per-day merge — a
    // known, narrower limitation of this depot-group-wide duty view,
    // confirmed acceptable by the user rather than redesigning the whole
    // day-type selector to individual days.
    const tt = timetables.find((t) => t.routeId === route.id && weekdayMasksOverlap(t.weekdayMask, weekdayMask));
    if (!tt) continue;
    out.push(...journeysForRoute(route, tt, resolveReference));
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
