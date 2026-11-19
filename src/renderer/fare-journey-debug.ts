// Thin WASM/IPC wiring for fare-journey.mts (T175) — same shape as
// journey-planner.ts's own `window.journeyPlanner` debug entry point: no
// UI yet, since no real caller (the passenger sim) exists to wire this
// into. Resolves a depot group's fare zones and the matched route, finds
// the real routed distance for the Country/Island per-mile formula, and
// hands the result to the pure quote function.
import type { Router } from "./wasm/game_wasm.js";
import { quoteSingleFareGBPPence, type RideLeg } from "./fare-journey.mts";

// The raw shape journey-planner.ts's `plan()` returns (journey_planner.rs's
// own `build_found_result`/`build_not_found_result`) — not exported from
// there as a type, so restated minimally here rather than widening that
// module's own `unknown` return type for one caller.
interface JourneyPlanLeg {
  kind: "walk" | "ride";
  routeId?: number;
  boardStopOsmId?: number;
  alightStopOsmId?: number;
}

interface JourneyPlanResult {
  found: boolean;
  legs?: JourneyPlanLeg[];
}

async function quoteJourney(router: Router, journeyResult: unknown, depotGroupId: number): Promise<number> {
  const result = journeyResult as JourneyPlanResult;
  if (!result.found || !result.legs) throw new Error("journey not found — nothing to quote a fare for");

  const rideLeg = result.legs.find((l) => l.kind === "ride");
  if (!rideLeg || rideLeg.routeId === undefined || rideLeg.boardStopOsmId === undefined || rideLeg.alightStopOsmId === undefined) {
    throw new Error("journey has no ride leg — a walk-only journey has no fare to quote");
  }

  const [routes, zones] = await Promise.all([window.routes.list(), window.fareZones.listForDepotGroup(depotGroupId)]);
  const route = routes.find((r) => r.id === rideLeg.routeId);
  if (!route) throw new Error(`route ${rideLeg.routeId} not found`);

  const boardPoint = route.points.find((p) => p.osmId === rideLeg.boardStopOsmId);
  const alightPoint = route.points.find((p) => p.osmId === rideLeg.alightStopOsmId);
  if (!boardPoint || !alightPoint) throw new Error("leg's board/alight stop osmId not found among the matched route's own points");

  router.find_route(boardPoint.lon, boardPoint.lat, alightPoint.lon, alightPoint.lat);
  const distanceMetres = router.last_route_distance_m();

  const leg: RideLeg = { kind: "ride", routeId: rideLeg.routeId, boardStopOsmId: rideLeg.boardStopOsmId, alightStopOsmId: rideLeg.alightStopOsmId };
  return quoteSingleFareGBPPence(leg, route, zones, distanceMetres);
}

// Named `fareJourney`, not `farePricing` — `window.farePricing` already
// exists, contextBridge-exposed by preload.ts for fare-pricing-panel.ts's
// OWN config IPC (getConfig/listCountryZoneBands/...). Found live: that
// property is non-writable, so `window.farePricing = {...}` throws
// silently inside main.ts's init chain (OPEN-ITEMS.md's own "unhandled
// rejection silently kills boot chain" trap) and halts every mount call
// after it — confirmed directly, not guessed, by reassigning it in a live
// session and watching the real keys survive untouched.
export function mountFareJourneyDebugEntryPoint(router: Router): void {
  (window as unknown as { fareJourney: { quoteJourney: (journeyResult: unknown, depotGroupId: number) => Promise<number> } }).fareJourney = {
    quoteJourney: (journeyResult, depotGroupId) => quoteJourney(router, journeyResult, depotGroupId),
  };
}
