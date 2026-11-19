// Thin WASM wiring for the RAPTOR journey planner (DESIGN.md §2) — mirrors
// router.ts's own construction pattern. Increment 1 scope: no UI, no demand/
// passenger-sim caller yet — `window.journeyPlanner` is a debug entry point
// only, until a real caller exists.
import { JourneyPlanner } from "./wasm/game_wasm.js";
import { buildTransitData } from "./journey-planner-data.mts";
import { WEEKDAY_BITS } from "./route-timetable.mts";

let planner: JourneyPlanner | null = null;

// Rebuilding is not wired to fire automatically on every route/timetable
// edit yet (CLAUDE.md: "must be rebuilt whenever a route or timetable
// changes") — deliberately deferred to whichever later increment gives
// this planner a real caller, per the approved plan's own scope decision.
export async function rebuildJourneyPlanner(serviceDayBit: number = WEEKDAY_BITS.monday): Promise<void> {
  const [routes, timetables] = await Promise.all([window.routes.list(), window.routeTimetables.listAll()]);
  const data = buildTransitData(routes, timetables, serviceDayBit);
  planner?.free();
  planner = new JourneyPlanner(JSON.stringify(data));
}

export function planJourney(
  originLon: number,
  originLat: number,
  destLon: number,
  destLat: number,
  departureSeconds: number,
): unknown {
  if (!planner) throw new Error("journey planner not built yet — call rebuildJourneyPlanner() first");
  return planner.plan(originLon, originLat, destLon, destLat, departureSeconds);
}

export function mountJourneyPlannerDebugEntryPoint(): void {
  (window as unknown as { journeyPlanner: { rebuild: typeof rebuildJourneyPlanner; plan: typeof planJourney } }).journeyPlanner = {
    rebuild: rebuildJourneyPlanner,
    plan: planJourney,
  };
}
