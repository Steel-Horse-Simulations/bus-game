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
import { computeVehiclePosition, badgeDisplayRotation, approxDistanceM, type RouteLeg, type JourneyPointTiming } from "./vehicle-position.mts";
import { gameClockState } from "./game-clock-engine";
import { registerLiveryBadgeIcons, pickLiveryForJourney, liveryBadgeImageId, liveryBadgeMirroredImageId } from "./livery-map-badges";
import { supportIconImageId } from "./support-vehicle-icons";
import { describeWeekdayMask, MONDAY_FRIDAY_MASK, SATURDAY_MASK, SUNDAY_MASK, weekdayMasksOverlap, isPeakMinute } from "./route-timetable.mts";
import { routeDirectionRanges } from "./route-timetable-grid.mts";
import { loadLanduseDemandPoints, type DemandPoint } from "./landuse-demand.mts";
import {
  pickTripOriginDestination,
  evaluateTripOutcome,
  timeOfDayDemandMultiplier,
  filterPointsNearStops,
  assignPointsToStopComponents,
  pickDemandPointSet,
  LOCAL_DEMAND_RADIUS_M,
  type JourneyPlanResult,
  type PlannedRideLeg,
  type StopLocation,
} from "./passenger-simulation.mts";
import { computeStopComponents } from "./stop-connectivity.mts";
import { pickPassengerType, fareForPassengerType } from "./passenger-types.mts";
import { quoteJourneyFareGBPPence, type RideLeg as FareRideLeg } from "./fare-journey.mts";
import { processStopVisit, totalOperatorRevenueGBPPence, vehicleCapacityColour, type OnBoardPassenger } from "./vehicle-occupancy.mts";
import { airlinkLothianFallbackEligible } from "./livery-seed-data.mts";
import { planJourney } from "./journey-planner";
import { StopCrowdingTracker, dayCategoryForWeekdayMask, type CrowdingTier } from "./stop-crowding.mts";
import { recordTripOutcome, recordStopVisit, emptyRouteStatsAccumulator, type RouteStatsAccumulator } from "./route-statistics.mts";
import { stationDepartureFeeGBPPence } from "./bus-station-fees.mts";
import {
  StopBoardingTracker,
  busyHourBusCount,
  upgradeTriggered,
  accelerateCostGBPPence,
  UPGRADE_MONTHLY_COST_GBP_PENCE,
  type StopUpgradeType as LocalStopUpgradeType,
} from "./stop-upgrades.mts";
import { busStationsState } from "./stops-layer.ts";

const SECONDS_PER_DAY = 86400;
const REFRESH_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 250;
// How often a new candidate passenger is generated and journey-planned
// (DESIGN.md §2 "a bus carries a passenger and earns money", plan #9).
// Deliberately much slower than TICK_INTERVAL_MS — each attempt calls the
// real RAPTOR planner once, which is real CPU work, not something to do
// 4x/second for no reason.
const PASSENGER_GENERATE_INTERVAL_MS = 4_000;
// Plan #11 (stop crowding) — deliberately much slower than
// PASSENGER_GENERATE_INTERVAL_MS: this feeds a per-stop/per-hour
// EWMA BASELINE (stop-crowding.mts), not a live reading, so sampling
// every few seconds would just chase short-lived noise (one bus's worth
// of passengers boarding/alighting) rather than build up a real "typical
// crowd for this hour" figure over actual play time.
const STOP_CROWDING_SAMPLE_INTERVAL_MS = 30_000;
// No real owned-vehicle-to-journey assignment exists yet (this file's own
// header comment: livery is "a random, stable-per-journey placeholder
// pick... there's no real owned-vehicle-to-journey assignment yet"), so
// there's no real per-vehicle seats+standing figure to read from
// VEHICLE-SPECS.md for THIS specific journey either. A flagged placeholder
// (a typical single-decker's combined seats+standing total), not a sourced
// figure — same convention as this feature's other unsourced placeholders
// (`KERB_OFFSET_M`, `DEMAND_CATEGORY_WEIGHT`). Revisit once a real vehicle
// is actually assigned to a journey.
const DEFAULT_VEHICLE_CAPACITY = 70;
// Plan #10 (bus capacity colour) needs a seated figure distinct from the
// flat total above, which this placeholder doesn't otherwise have — no
// real journey-to-owned-vehicle assignment exists yet (confirmed directly:
// this loop iterates scheduled departures, not owned Vehicle rows), so
// there is no real per-model seated/standing split (vehicle-catalogue.mts's
// own `Capacity` union) to read for "the" vehicle serving any given
// journey. 80% is a representative ratio read off that same real
// catalogue's own `seatedStanding`/`maxCapacity` double-deck entries (e.g.
// 74/90, 82/100, 85/105, 80/98 all land close to 80-82%), not invented —
// but still a flagged placeholder, same honesty convention as
// DEFAULT_VEHICLE_CAPACITY itself just above. Replace both with a real
// vehicle's own real figures once assignment exists.
const DEFAULT_SEATED_CAPACITY = Math.round(DEFAULT_VEHICLE_CAPACITY * 0.8);
// How close a waiting passenger's own planned boarding time has to be to
// this specific vehicle's own scheduled departure from this stop to count
// as "this is the vehicle they're waiting for" — both figures are
// independently rounded (the journey planner's own trip table rounds to
// the nearest second; this file's own timetable offsets are already
// whole seconds), so a little slack avoids a real match being missed by a
// rounding artefact without being so loose it matches the WRONG departure
// of the same route.
const BOARDING_TIME_TOLERANCE_SECONDS = 120;

// One passenger waiting at a real stop for a specific real route/departure
// — generated once by `tryGenerateOnePassenger` below, consumed (removed)
// the moment a matching vehicle actually visits that stop, or dropped if
// too much game time passes with no match (see `waitingPassengers`' own
// pruning in `refresh`). `boardSeconds` is the real, absolute
// seconds-since-midnight the RAPTOR planner itself computed for this
// specific trip's boarding time.
interface WaitingPassenger extends OnBoardPassenger {
  routeId: number;
  boardStopOsmId: number;
  boardSeconds: number;
}

interface CachedRoute {
  route: Route;
  legs: RouteLeg[];
  pointsKey: string;
}

export async function mountVehicleSimulation(map: maplibregl.Map, router: Router): Promise<void> {
  await registerLiveryBadgeIcons(map);

  // Tracks whatever distinct weekday masks currently exist across every
  // route's timetable (confirmed 2026-11-07: this manual selector stays a
  // global stand-in for a real calendar, not per-route) — availableWeekdayMasks
  // is rebuilt by refresh() below every time it re-fetches, same as
  // timetablesByRoute itself.
  let weekdayMask: number = MONDAY_FRIDAY_MASK;
  let availableWeekdayMasks: number[] = [];
  let routeCache = new Map<number, CachedRoute>();
  let timetablesByRoute = new Map<number, RouteTimetable[]>();
  let liveries: Livery[] = [];
  let depotGroupsById = new Map<number, DepotGroup>();
  // Real wiring for the Airlink 100 / Lothian XLB last-resort fallback
  // (2026-11-16, user request — see livery-seed-data.mts's own
  // `airlinkLothianFallbackEligible` doc comment for the full rule).
  // Recomputed once per refresh(), same cadence as every other
  // per-depot-group derived state here — a depot group's own owned
  // fleet and away-bookings don't change meaningfully between refreshes.
  let airlinkLothianFallbackByDepotGroup = new Map<number, boolean>();
  // Real demand points and real fare zones — refreshed alongside routes
  // (below), consumed by tryGenerateOnePassenger. Empty arrays (rather
  // than not-yet-loaded undefined) are a completely safe starting state:
  // generation simply finds nothing to generate from until the first
  // refresh() completes, the same "can't do it yet, don't fake it"
  // fallback this feature's own prior plans already established.
  let demandPoints: DemandPoint[] = [];
  // Demand points within real walking distance of at least one real stop
  // (2026-11-15 live fix, see passenger-simulation.mts's own "Localised
  // demand" section header for the full story) — recomputed once per
  // refresh() below, alongside demandPoints/routeCache themselves, not
  // once per tryGenerateOnePassenger tick (that runs 7.5x more often, and
  // the underlying stop network/demand set has nothing new to say between
  // refreshes anyway).
  let localDemandPoints: DemandPoint[] = [];
  // Which genuine route-network component each local demand point's
  // nearest stop belongs to (2026-11-15 follow-up, see stop-
  // connectivity.mts's own header) — recomputed alongside
  // localDemandPoints itself, every refresh(). A point with no entry here
  // only ever happens if it somehow isn't in localDemandPoints to begin
  // with, since both are now built from the exact same timetabled-stop
  // set at the exact same radius.
  let localPointComponents = new Map<DemandPoint, number>();
  let allFareZones: FareZone[] = [];
  // Persistent per-journey occupancy — who's actually on board right now,
  // and which point index this journey last processed a stop visit for
  // (so a dwell lasting many ticks only boards/alights people ONCE, not
  // every 250ms). Keyed by journeyOccupancyKey below. Pruned the moment a
  // journey finishes (computeVehiclePosition returns null for it) in
  // activeVehicleFeatures, so this stays bounded to currently-or-recently
  // -active journeys, not every journey ever generated this session.
  const journeyOccupancy = new Map<number | string, { onBoard: OnBoardPassenger[]; lastStopPointIndex: number }>();
  function journeyOccupancyKey(routeId: number, departureMinutes: number, dayOffsetSeconds: number): string {
    return `${routeId}:${departureMinutes}:${dayOffsetSeconds}`;
  }
  // Passengers currently waiting for a specific real vehicle to arrive —
  // generated by tryGenerateOnePassenger, consumed in activeVehicleFeatures
  // the moment a matching vehicle actually visits their boarding stop.
  let waitingPassengers: WaitingPassenger[] = [];
  // Plan #11 (stop crowding) — tracks each real stop's own typical
  // waiting-crowd size per hour-of-day, fed a real sample every
  // STOP_CROWDING_SAMPLE_INTERVAL_MS below. Lives here (not persisted to
  // the save) rather than in stops-layer.ts, since this is the module
  // that already owns waitingPassengers — stops-layer.ts reads the
  // result back out via window.__vehicleSim.crowdingTierForStop, the
  // same bridge waitingPassengerCountByStop already established.
  const stopCrowdingTracker = new StopCrowdingTracker();
  // Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9 redesign...",
  // 2026-11-16) — real busy-hour boarding counts, fed by the same real
  // stop-visit loop that already feeds stopCrowdingTracker/finance above.
  // Not persisted (same reasoning as stopCrowdingTracker): a baseline
  // rebuilt once per session is fine, this isn't player-facing data that
  // needs to survive a restart.
  const stopBoardingTracker = new StopBoardingTracker();
  // Real stop-upgrade state already persisted (window.stopUpgrades),
  // cached per refresh so the 30s threshold-check loop below doesn't
  // re-fetch per stop; keyed by real OSM stop id.
  let stopUpgradeStateByOsmId = new Map<number, StopUpgradeState>();
  // Which hour-of-day each stop last had a boarding recorded in — lets
  // the 30s refresh below close out a real hour's own EWMA the first
  // time it notices play has moved into a new hour, without needing a
  // separate once-an-hour timer.
  const lastBoardingHourByOsmId = new Map<number, number>();
  // The real schedule-derived busy-hour bus count as of the last 30s
  // refresh, per real stop — cached so window.__vehicleSim's own
  // busyHourUsageForStop getter doesn't need to recompute it from scratch
  // on every call (it's genuinely static between refreshes).
  const lastKnownBusyHourBusCountByOsmId = new Map<number, number>();
  // Last real game-day the monthly lighting/shelter upkeep was billed —
  // a day only ever gets billed once, the first refresh that notices
  // it's genuinely moved on from the last billed day.
  let lastUpgradeBillingGameDay: number | null = null;
  // Plan #12 (route statistics) — per-route load-factor and carried-vs-
  // gave-up counters (route-statistics.mts's own header explains why
  // these need live instrumentation here rather than being derivable
  // from any data this module already persisted: both outcomes used to
  // be computed then immediately discarded). Keyed by real routeId, built
  // lazily so a route with no activity yet simply has no entry (same
  // "can't do it sensibly, don't fake it" convention `loadFactorPercent`/
  // `giveUpRatePercent` themselves use for a missing accumulator).
  const routeStatsAccumulators = new Map<number, RouteStatsAccumulator>();
  function routeStatsAccumulatorFor(routeId: number): RouteStatsAccumulator {
    let acc = routeStatsAccumulators.get(routeId);
    if (!acc) {
      acc = emptyRouteStatsAccumulator();
      routeStatsAccumulators.set(routeId, acc);
    }
    return acc;
  }
  function sampleStopCrowding(): void {
    const hourOfDay = Math.floor((gameClockState.accumulatedGameSeconds % SECONDS_PER_DAY) / 3600) % 24;
    const dayCategory = dayCategoryForWeekdayMask(weekdayMask, SATURDAY_MASK, SUNDAY_MASK);
    const counts = new Map<number, number>();
    for (const w of waitingPassengers) counts.set(w.boardStopOsmId, (counts.get(w.boardStopOsmId) ?? 0) + 1);
    for (const [stopOsmId, count] of counts) stopCrowdingTracker.recordObservation(stopOsmId, dayCategory, hourOfDay, count);
  }

  // Real demand-driven passenger generation (DESIGN.md §2/§8, plan #9):
  // picks a real origin/destination from the pipeline's own real land-use
  // demand points, plans it with the real RAPTOR journey planner, and — if
  // the passenger would actually travel (evaluateTripOutcome) — turns the
  // FIRST ride leg of that plan into a real WaitingPassenger with a real
  // quoted fare. Deliberately single-leg only for this first pass: a
  // genuine interchange (alighting from one vehicle to wait for a second)
  // needs its own re-entry into the waiting pool once the passenger's
  // already alighted, which is a real, separate piece of state this pass
  // doesn't build — every trip whose own plan needs more than one ride leg
  // is silently not generated at all (not partially/incorrectly modelled),
  // matching this feature's own established "can't do it sensibly, don't
  // fake it" convention. Multi-leg support is a clearly flagged gap, not
  // an oversight.
  function tryGenerateOnePassenger(): void {
    if (demandPoints.length < 2 || routeCache.size === 0) return;
    const nowSeconds = gameClockState.accumulatedGameSeconds;
    const gameSecondsOfDay = nowSeconds % SECONDS_PER_DAY;
    // Thins out generation at quiet times rather than generating at a
    // flat rate and discarding the outcome afterward — DESIGN.md §2's own
    // "varies through the day" demand curve should be visible in HOW OFTEN
    // people appear, not just in whether they happen to find a bus.
    if (Math.random() > timeOfDayDemandMultiplier(gameSecondsOfDay)) return;

    // Localised demand (2026-11-15 live fix): the large majority of
    // attempts draw only from demand points within real walking distance
    // of a stop this save actually has, so a small network produces real,
    // findable trips instead of an effectively-random, almost-always-
    // unplannable pair from anywhere in Great Britain; a small minority
    // still draw from everywhere, the only way a genuine long-distance
    // trip (the kind only a real long_distance route could ever serve)
    // gets generated at all. See passenger-simulation.mts's own "Localised
    // demand" section for the full reasoning.
    const candidatePoints = pickDemandPointSet(demandPoints, localDemandPoints, Math.random());
    // Genuine connectivity (2026-11-15 follow-up, stop-connectivity.mts):
    // in local mode only, a destination must share the origin's own real
    // network component — a Skye-area point and an Edinburgh-area one
    // never pair up unless some real route/interchange genuinely
    // connects them, instead of just both happening to sit near A stop
    // somewhere. The long-distance (unrestricted, `candidatePoints ===
    // demandPoints`) bucket deliberately skips this — it exists
    // specifically to let a genuine cross-region attempt through
    // regardless of local connectivity.
    const usingLocalSet = candidatePoints === localDemandPoints;
    const isSameArea = (origin: DemandPoint, candidate: DemandPoint): boolean => {
      if (!usingLocalSet) return true;
      const originComponent = localPointComponents.get(origin);
      return originComponent !== undefined && originComponent === localPointComponents.get(candidate);
    };
    const pair = pickTripOriginDestination(candidatePoints, Math.random(), Math.random(), isSameArea);
    if (!pair) return;

    let rawPlan: unknown;
    try {
      rawPlan = planJourney(pair.origin.lon, pair.origin.lat, pair.destination.lon, pair.destination.lat, gameSecondsOfDay);
    } catch {
      return; // planner not built yet (boots async, independently of this module)
    }
    const plan = rawPlan as JourneyPlanResult;
    if (!plan.found || !plan.legs || plan.legs.length === 0) return;
    // Only a journey whose FIRST leg is the ride (a walk-to-a-different-
    // route's-own-stop interchange partway through is exactly the
    // multi-leg case this pass doesn't model — see this function's own
    // header) counts; a pure "no bus needed" or "walk, then ride, then
    // walk+ride again" plan is left ungenerated.
    const firstLeg = plan.legs[0];
    const walkSecondsBefore = firstLeg.kind === "walk" ? firstLeg.seconds : 0;
    const firstRide: PlannedRideLeg | undefined = plan.legs.find((l): l is PlannedRideLeg => l.kind === "ride");
    if (!firstRide || plan.legs.indexOf(firstRide) > 1) return;

    const waitSeconds = Math.max(0, firstRide.boardSeconds - gameSecondsOfDay - walkSecondsBefore);
    const outcome = evaluateTripOutcome(plan, waitSeconds);
    // Plan #12 (route statistics) — recorded against the real route this
    // trip would have used, BEFORE the early return below, since a
    // gave-up outcome is exactly the data route-statistics.mts's own
    // giveUpRatePercent needs and this was previously discarded here
    // unrecorded. A trip with no route at all never reaches this point
    // (returned earlier, at `if (!firstRide...) return`) — only a trip
    // that found a real route to (not) use is ever attributed to one.
    recordTripOutcome(routeStatsAccumulatorFor(firstRide.routeId), outcome.travelled);
    if (!outcome.travelled) return;

    const cached = routeCache.get(firstRide.routeId);
    if (!cached) return; // this route isn't currently active/cached
    const boardPoint = cached.route.points.find((p) => p.kind === "stop" && p.osmId === firstRide.boardStopOsmId);
    const alightPoint = cached.route.points.find((p) => p.kind === "stop" && p.osmId === firstRide.alightStopOsmId);
    if (!boardPoint || !alightPoint) return;

    // Straight-line distance between the two real stops, not the full
    // real road distance travelled along the route — a deliberate, flagged
    // simplification for this first pass (the exact road distance would
    // need re-deriving from this route's own already-built `legs` polyline
    // between these two specific points, extra plumbing this pass doesn't
    // attempt). Under-measures a winding road's own real distance, so a
    // mileage-banded fare (DESIGN.md §9's Country zone-count/mileage
    // bands) could come out slightly low — flagged, not silently assumed
    // exact.
    const distanceMetres = approxDistanceM([boardPoint.lon, boardPoint.lat], [alightPoint.lon, alightPoint.lat]);
    const rideLeg: FareRideLeg = { kind: "ride", routeId: firstRide.routeId, boardStopOsmId: firstRide.boardStopOsmId, alightStopOsmId: firstRide.alightStopOsmId };
    let adultFareGBPPence: number;
    try {
      adultFareGBPPence = quoteJourneyFareGBPPence([rideLeg], new Map([[cached.route.id, cached.route]]), allFareZones, () => distanceMetres);
    } catch {
      return; // route/zone data not in a quotable state (e.g. no zones drawn at all yet)
    }
    const passengerType = pickPassengerType(Math.random());
    const fareOutcome = fareForPassengerType(passengerType, adultFareGBPPence, cached.route.routeType === "airport_express");

    waitingPassengers.push({
      routeId: firstRide.routeId,
      boardStopOsmId: firstRide.boardStopOsmId,
      boardSeconds: firstRide.boardSeconds,
      alightStopOsmId: firstRide.alightStopOsmId,
      passengerType,
      passengerPaidGBPPence: fareOutcome.passengerPaidGBPPence,
      operatorReceivedGBPPence: fareOutcome.operatorReceivedGBPPence,
    });
  }

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

  // Only counts a route toward the "local" demand network if a real
  // timetable actually runs on the live simulated day (`weekdayMask`) —
  // tightened 2026-11-15, second pass (the first pass only required *some*
  // timetable to exist at all, any day). User's own words: "only if a bus
  // stops on that day." Called once per refresh() AND immediately on every
  // day-type button click below — not just on the 30s refresh cadence,
  // since otherwise toggling the day picker wouldn't immediately reflect
  // "no buses today" for passenger generation.
  function recomputeLocalDemandNetwork(): void {
    const timetabledRoutes = [...routeCache.values()]
      .filter((cached) => (timetablesByRoute.get(cached.route.id) ?? []).some((tt) => weekdayMasksOverlap(tt.weekdayMask, weekdayMask)))
      .map((cached) => cached.route);
    const stopLocations: StopLocation[] = [];
    const stopsWithComponent: (StopLocation & { componentId: number })[] = [];
    const stopComponents = computeStopComponents(timetabledRoutes);
    for (const route of timetabledRoutes) {
      for (const point of route.points) {
        if (point.kind !== "stop") continue;
        stopLocations.push({ lon: point.lon, lat: point.lat });
        if (point.osmId !== undefined) {
          const componentId = stopComponents.get(point.osmId);
          if (componentId !== undefined) stopsWithComponent.push({ lon: point.lon, lat: point.lat, componentId });
        }
      }
    }
    localDemandPoints = filterPointsNearStops(demandPoints, stopLocations, LOCAL_DEMAND_RADIUS_M);
    // Genuine connectivity (2026-11-15 follow-up) — which real network
    // component each local demand point's own nearest stop belongs to;
    // see stop-connectivity.mts's own header for the full reasoning.
    localPointComponents = assignPointsToStopComponents(localDemandPoints, stopsWithComponent, LOCAL_DEMAND_RADIUS_M);
  }

  // Rebuilt every refresh (below), since which day types exist can change
  // as routes gain or lose timetable components — one button per distinct
  // weekday mask currently in use anywhere in the save.
  function renderDayTypeBar(): void {
    dayTypeBar.innerHTML = "";
    for (const mask of availableWeekdayMasks) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = describeWeekdayMask(mask);
      btn.classList.toggle("is-active", mask === weekdayMask);
      btn.addEventListener("click", () => {
        weekdayMask = mask;
        recomputeLocalDemandNetwork();
        renderDayTypeBar();
      });
      dayTypeBar.appendChild(btn);
    }
  }

  // The old per-leg method (one independent `find_route` call per
  // consecutive point pair) — kept as the fallback `buildLegs` below
  // drops to when `find_route_through` can't resolve the whole route in
  // one go (see that function's own doc comment: any single unreachable
  // leg makes it return empty for the ENTIRE route, unlike this method's
  // own per-leg straight-line fallback). Still exercised on every real
  // route whose road graph has genuinely changed under it since it was
  // saved, so this isn't dead code.
  const buildLegsPerLeg = (points: RoutePoint[]): RouteLeg[] => {
    const legs: RouteLeg[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const leg = router.find_route(a.lon, a.lat, b.lon, b.lat);
      const coords: [number, number][] = [];
      for (let j = 0; j < leg.length; j += 2) coords.push([leg[j], leg[j + 1]]);
      legs.push({ coords: coords.length >= 2 ? coords : [[a.lon, a.lat], [b.lon, b.lat]] });
    }
    return legs;
  };

  // Real live bug (2026-11-15, route 398/"ScotRail Shuttle" at Buchanan
  // Bus Station — "overshoots the stop then reverses"): the per-leg
  // method above independently re-snaps every INTERIOR point (a stop
  // that's both one leg's own goal and the next leg's own start) to the
  // nearest road twice, and the two snaps can land in genuinely
  // different places — rendering as arrive at the stop, jump to the
  // other snap to start the next leg, then backtrack through the stop
  // again to resume. `find_route_through` resolves every interior point
  // exactly once, as a single node both legs share, eliminating that
  // mismatch at the source rather than patching its symptom.
  //
  // NOTE (2026-10-11): briefly migrated to this same fix, reverted the
  // same day after a live install hung indefinitely on boot ("Drawing
  // stops…" never progressing) — never root-caused at the time; the
  // native Rust timing for the worst real route in the save came back
  // under half a second, so the cause wasn't simply "this is slow."
  // Retried 2026-11-15 after reading `find_route_through`'s own
  // implementation in full and finding no genuine graph-scale cost
  // difference from `find_route` (both call `dijkstra` exactly once per
  // leg; the only extra work is O(route length), never O(graph size)) —
  // this time verified against the real packaged Electron/WASM app
  // booting with the real save before shipping, the exact step skipped
  // last time (OPEN-ITEMS.md T84/T209).
  const buildLegs = (points: RoutePoint[]): RouteLeg[] => {
    if (points.length < 2) return [];
    const stopsLonLat = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      stopsLonLat[i * 2] = points[i].lon;
      stopsLonLat[i * 2 + 1] = points[i].lat;
    }
    const combined = router.find_route_through(stopsLonLat);
    if (combined.length === 0) return buildLegsPerLeg(points);
    const legEndIndices = router.last_route_leg_end_point_indices();
    const allCoords: [number, number][] = [];
    for (let j = 0; j < combined.length; j += 2) allCoords.push([combined[j], combined[j + 1]]);

    const legs: RouteLeg[] = [];
    let startIndex = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const endIndex = legEndIndices[i];
      const coords = allCoords.slice(startIndex, endIndex + 1);
      const a = points[i];
      const b = points[i + 1];
      // A leg the router couldn't resolve into real points (shouldn't
      // happen once `combined` itself is non-empty, but the two endpoints
      // being identical — a zero-length leg — is a real possibility for a
      // duplicate point) falls back to a straight line rather than an
      // empty/degenerate leg.
      legs.push({ coords: coords.length >= 2 ? coords : [[a.lon, a.lat], [b.lon, b.lat]] });
      startIndex = endIndex;
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
    const [routes, timetables, liveriesList, depotGroups, demandPointsList, fareZonesList, vehicles, repaintBookings, repowerBookings, stopUpgrades] = await Promise.all([
      window.routes.list(),
      window.routeTimetables.listAll(),
      window.liveries.list(),
      window.depotGroups.list(),
      loadLanduseDemandPoints(),
      window.fareZones.listAll(),
      window.vehicles.listAll(),
      window.repaintBookings.listAll(),
      window.repowerBookings.listAll(),
      window.stopUpgrades.listAll(),
    ]);
    stopUpgradeStateByOsmId = new Map(stopUpgrades.map((u) => [u.stopOsmId, u]));
    liveries = liveriesList;
    depotGroupsById = new Map(depotGroups.map((g) => [g.id, g]));
    demandPoints = demandPointsList;
    allFareZones = fareZonesList;
    // Airlink 100 / Lothian XLB fallback (2026-11-16) — real "is this
    // vehicle away right now" comes from the same real booking windows
    // workshop-booking.mts already tracks for repaint/re-power; "in for
    // a service" has no real data anywhere yet (Maintenance is Phase 8,
    // unbuilt), so only these two booking kinds are checked, same honest
    // gap the building fork itself flagged.
    const currentGameDay = Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
    const awayVehicleIds = new Set<number>();
    for (const b of repaintBookings) {
      if (currentGameDay >= b.startGameDay && currentGameDay <= b.completionGameDay) awayVehicleIds.add(b.vehicleId);
    }
    for (const b of repowerBookings) {
      if (currentGameDay >= b.startGameDay && currentGameDay <= b.completionGameDay) awayVehicleIds.add(b.vehicleId);
    }
    airlinkLothianFallbackByDepotGroup = new Map(
      depotGroups.map((g) => [g.id, airlinkLothianFallbackEligible(g.id, vehicles, liveriesList, awayVehicleIds)]),
    );
    // A waiting passenger that's gone uncollected for an unreasonably long
    // time (its own planned boarding time is long past "now") is either a
    // route that's stopped running or a vehicle it genuinely missed — drop
    // it rather than let the pool grow forever across a long play session.
    const gameSecondsOfDayNow = gameClockState.accumulatedGameSeconds % SECONDS_PER_DAY;
    waitingPassengers = waitingPassengers.filter((p) => Math.abs(p.boardSeconds - gameSecondsOfDayNow) < 3600);
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
    // weekdayMask must be settled to a real, currently-available day BEFORE
    // recomputeLocalDemandNetwork() runs below, since that function filters
    // by whatever weekdayMask currently holds — otherwise this refresh would
    // filter against a stale or since-removed day type for one cycle.
    availableWeekdayMasks = [...new Set(timetables.map((t) => t.weekdayMask))].sort((a, b) => a - b);
    if (!availableWeekdayMasks.includes(weekdayMask)) weekdayMask = availableWeekdayMasks[0] ?? MONDAY_FRIDAY_MASK;
    recomputeLocalDemandNetwork();
    renderDayTypeBar();
    void checkStopUpgradeTriggersAndBilling(routes, timetables, depotGroups, currentGameDay);
  };
  // Council-triggered stop upgrades (2026-11-16) — real busy-hour bus
  // counts are schedule-derived (deterministic from the real timetable
  // data this same refresh() already has in scope), so computed here
  // rather than added to stop-upgrades.mts's own pure module, which
  // deliberately stays free of Route/RouteTimetable's real ambient
  // shapes. Boarding counts come from the live stopBoardingTracker fed
  // by the real stop-visit loop above.
  async function checkStopUpgradeTriggersAndBilling(
    currentRoutes: readonly Route[],
    currentTimetables: readonly RouteTimetable[],
    currentDepotGroups: readonly DepotGroup[],
    gameDay: number,
  ): Promise<void> {
    const timetablesByRouteId = new Map<number, RouteTimetable[]>();
    for (const tt of currentTimetables) {
      const list = timetablesByRouteId.get(tt.routeId) ?? [];
      list.push(tt);
      timetablesByRouteId.set(tt.routeId, list);
    }
    // stopOsmId -> every real route serving it, and -> the first real
    // depot group found owning one of those routes (billing is charged
    // there — a stop served by several depot groups' routes is a real
    // simplification, flagged here rather than silently split evenly
    // with no real basis for how to divide it).
    const routesByStopOsmId = new Map<number, Route[]>();
    for (const route of currentRoutes) {
      for (const point of route.points) {
        if (point.kind !== "stop" || point.osmId === undefined) continue;
        const list = routesByStopOsmId.get(point.osmId) ?? [];
        list.push(route);
        routesByStopOsmId.set(point.osmId, list);
      }
    }
    const billMonthlyUpkeepToday = lastUpgradeBillingGameDay === null ? false : gameDay > lastUpgradeBillingGameDay && gameDay % 30 === 0;
    // Only a genuine day-boundary advance to a real "month" (every 30
    // game days — no real in-game calendar month exists yet, same
    // "manual day-type selector stands in for a calendar" simplification
    // this file's own header already flags elsewhere) ever bills; never
    // on the very first refresh (lastUpgradeBillingGameDay === null),
    // which would otherwise immediately bill day 0 for every upgrade
    // that happened to already exist in a loaded save.
    if (lastUpgradeBillingGameDay === null || gameDay % 30 === 0) lastUpgradeBillingGameDay = gameDay;

    for (const [stopOsmId, servingRoutes] of routesByStopOsmId) {
      const departureLists = servingRoutes.flatMap((route) =>
        (timetablesByRouteId.get(route.id) ?? []).map((tt) => {
          try {
            return generateDepartureMinutesForBands(tt.timeBands);
          } catch {
            return [];
          }
        }),
      );
      const busCount = busyHourBusCount(departureLists);
      lastKnownBusyHourBusCountByOsmId.set(stopOsmId, busCount);
      const usage = { boardings: stopBoardingTracker.busyHourBoardingCount(stopOsmId), buses: busCount };
      let state = stopUpgradeStateByOsmId.get(stopOsmId) ?? null;
      const depotGroupId = servingRoutes[0]?.depotGroupId;
      for (const upgradeType of ["seating", "lighting", "shelter"] as const satisfies readonly LocalStopUpgradeType[]) {
        const already = state ? (upgradeType === "seating" ? state.hasSeating : upgradeType === "lighting" ? state.hasLighting : state.hasShelter) : false;
        if (!already && upgradeTriggered(usage, upgradeType)) {
          // Council pays — genuinely free to the player, no finance entry
          // at all, matching "the council pays for upkeep, not the
          // operator" for the install itself (the pay-to-accelerate path
          // is a SEPARATE, player-initiated UI action, not this
          // automatic check — see stops-layer.ts).
          state = await window.stopUpgrades.install(stopOsmId, upgradeType, gameDay);
          stopUpgradeStateByOsmId.set(stopOsmId, state);
        }
        if (billMonthlyUpkeepToday && state && depotGroupId !== undefined) {
          const hasIt = upgradeType === "seating" ? state.hasSeating : upgradeType === "lighting" ? state.hasLighting : state.hasShelter;
          const monthly = UPGRADE_MONTHLY_COST_GBP_PENCE[upgradeType];
          if (hasIt && monthly > 0) {
            // Category string "Stop upkeep" follows bus-station-fees.mts's
            // own precedent (it posts "Stand rental" directly, not the
            // broader "Property" parent DESIGN.md's P&L table groups both
            // under) — a specific real sub-category name, not the parent.
            void window.finance.record(-monthly, "Stop upkeep", depotGroupId, `Stop ${upgradeType} upkeep (stop ${stopOsmId})`, gameDay);
          }
        }
      }
    }
  }

  await refresh();
  setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
  setInterval(tryGenerateOnePassenger, PASSENGER_GENERATE_INTERVAL_MS);
  setInterval(sampleStopCrowding, STOP_CROWDING_SAMPLE_INTERVAL_MS);

  map.addSource("vehicles", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // A journey with no eligible livery (badgeImage === "", rare — see
  // livery-map-badges.ts) falls back to the original plain circle, same
  // as every vehicle showed before liveries were wired in.
  const noBadgeFilter: maplibregl.FilterSpecification = ["==", ["get", "badgeImage"], ""];
  const hasBadgeFilter: maplibregl.FilterSpecification = ["!=", ["get", "badgeImage"], ""];
  // Staff bus (schema v57->v58, live request 2026-11-08: "the bus should
  // have the little person icon instead of a route number") — shows the
  // existing support-vehicle person icon (support-vehicle-icons.ts,
  // registered once at boot but never wired to a real badge until now)
  // in place of the route-number text, on top of whichever badge/circle
  // it would otherwise have gotten; the badge/circle itself is untouched.
  const staffFilter: maplibregl.FilterSpecification = ["==", ["get", "routeType"], "staff"];
  const notStaffFilter: maplibregl.FilterSpecification = ["!=", ["get", "routeType"], "staff"];

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
    // minzoom added 2026-11-15, raised to match depots-labels' minzoom 11,
    // reverted to try clarity-only first, then reinstated 2026-11-16 at
    // that same depots-labels figure once the user confirmed they still
    // wanted it to disappear ("could the route numbers disappear... please").
    minzoom: 11,
    filter: ["all", noBadgeFilter, notStaffFilter],
    layout: {
      "text-field": ["get", "number"],
      // Explicit font (2026-11-16, clarity pass) — only "Noto Sans
      // Regular" is actually served by this game's own glyphs server
      // (pipeline-data/fonts has no bold variant), so this doesn't change
      // weight, just makes sure the real available font is picked
      // deliberately rather than left to MapLibre's own fallback.
      "text-font": ["Noto Sans Regular"],
      // Sized for the zoom-11+ range now that minzoom hides it below that
      // again, then reduced ~10% per the user's own follow-up ("10%
      // smaller please") — 12/16 -> 11/14.
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 17, 14],
      "text-offset": [0, 1.1],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      // Plan #10 (bus capacity colour), 2026-11-15 — `capacityColour` is a
      // real hex string (yellow/orange/red) on a crowded vehicle's own
      // feature, `null` otherwise; `coalesce` falls back to the plain
      // white every vehicle showed before this feature, unchanged.
      "text-color": ["coalesce", ["get", "capacityColour"], "#ffffff"],
      // Real fix, 2026-11-16: repeatedly bumping halo-width (1 -> 1.5 ->
      // 2) was the wrong lever — the user's own comparison to the OSM
      // basemap's own labels ("smaller but much easier to read") pointed
      // at an overly thick solid halo blobbing small glyphs together.
      // Can't copy OSM's dark-on-light scheme directly here (route
      // numbers sit on arbitrary, sometimes-dark livery colours, unlike a
      // depot label on the plain map), so this keeps white text but
      // matches OSM's own real halo WIDTH (1.2, basemap-style.json) and
      // its semi-transparency, rather than a thick solid colour.
      "text-halo-color": "rgba(0,0,0,0.8)",
      "text-halo-width": 1.2,
    },
  });
  map.addLayer({
    id: "vehicles-circle-staff-icon",
    type: "symbol",
    source: "vehicles",
    filter: ["all", noBadgeFilter, staffFilter],
    layout: {
      "icon-image": supportIconImageId("person", "white"),
      "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.12, 10, 0.22, 17, 0.32],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
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
      // `badgeRotation` is precomputed per feature (vehicle-simulation.ts's
      // own activeVehicleFeatures) rather than a maplibre expression here:
      // it's the same readable-half-clamped value vehicles-badge-number
      // uses for its own text-rotate, and `badgeImage` is already switched
      // to the horizontally-mirrored variant (livery-map-badges.ts) when
      // the true heading falls in that clamped-away half — a real bus
      // mirrors, it doesn't flip upside down, when it turns around (real
      // bug report, 2026-11-14). The -90 artwork-orientation correction
      // (map-icons.ts's drawArrow draws its native triangle along +x, not
      // north) is already folded into badgeRotation, not reapplied here.
      "icon-rotate": ["get", "badgeRotation"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  // The route number, drawn on the badge itself per the real placement
  // ratio resolved from a live reference (OPERATIONS.md §4, Q14,
  // 2026-11-05): centred in the badge's own clear middle band, rotating
  // with the badge rather than staying map-upright. Uses the exact same
  // `badgeRotation` property as vehicles-badge above, so the number always
  // stays flush with the (now mirror-corrected) badge beneath it.
  map.addLayer({
    id: "vehicles-badge-number",
    type: "symbol",
    source: "vehicles",
    // minzoom reinstated 2026-11-16 at depots-labels' own figure (11) —
    // see vehicles-circle-number's own identical comment above for the
    // full back-and-forth.
    minzoom: 11,
    filter: ["all", hasBadgeFilter, notStaffFilter],
    layout: {
      "text-field": ["get", "number"],
      "text-font": ["Noto Sans Regular"],
      // Bumped (live request, 2026-11-07) — 6-14 read too small even at
      // max zoom. Raised again 2026-11-16, then reduced ~10% the same day
      // once zoom-hiding came back ("10% smaller please") — 10/18.
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 17, 18],
      "text-rotate": ["get", "badgeRotation"],
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      // Plan #10 (bus capacity colour), 2026-11-15 — see
      // vehicles-circle-number's own identical comment above.
      "text-color": ["coalesce", ["get", "capacityColour"], "#ffffff"],
      // Real fix, 2026-11-16 — see vehicles-circle-number's own identical
      // comment above: OSM's real halo is 1.2 and semi-transparent, not a
      // thick solid colour.
      "text-halo-color": "rgba(0,0,0,0.8)",
      "text-halo-width": 1.2,
    },
  });
  map.addLayer({
    id: "vehicles-badge-staff-icon",
    type: "symbol",
    source: "vehicles",
    filter: ["all", hasBadgeFilter, staffFilter],
    layout: {
      "icon-image": supportIconImageId("person", "white"),
      // Sized to sit within the badge's own clear middle band, the same
      // spot vehicles-badge-number's text occupies — deliberately not
      // rotating with the badge/bearing (unlike the number, which does):
      // a person silhouette carries no directional meaning, so it stays
      // upright on screen regardless of which way the bus is facing.
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.08, 17, 0.16],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "vehicles-arrow",
    type: "symbol",
    source: "vehicles",
    layout: {
      "icon-image": "oneway-arrow",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.15, 10, 0.35, 17, 0.6],
      // Same -90 correction as vehicles-badge above — drawArrow's own
      // triangle is drawn pointing along +x (east) in its native,
      // unrotated state, not north. Deliberately uses the true, full
      // rotation here (not badgeRotation/the mirror trick) — an arrow
      // pointing any direction reads fine upside down, unlike text or a
      // livery pattern, so it has no readability reason to clamp away
      // from half the compass; this is the one layer that still shows
      // the vehicle's real heading continuously through 360°.
      "icon-rotate": ["-", ["get", "bearing"], 90],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  const activeVehicleFeatures = (): GeoJSON.Feature[] => {
    const nowSeconds = gameClockState.accumulatedGameSeconds;
    const gameSecondsOfDay = nowSeconds % SECONDS_PER_DAY;
    const features: GeoJSON.Feature[] = [];

    for (const { route, legs } of routeCache.values()) {
      if (legs.length === 0) continue;
      const timetables = timetablesByRoute.get(route.id) ?? [];
      // weekdayMasksOverlap, not exact equality — the same real live bug
      // (T198, 2026-11-14) already fixed in duty-journeys.mts/route-
      // timetable-panel.ts, found here too while verifying plan #9: a
      // Mon-Fri-only component must still render on a combined Mon-Sat
      // day-type view, not just a view spelled exactly "Mon-Fri."
      const tt = timetables.find((t) => weekdayMasksOverlap(t.weekdayMask, weekdayMask));
      if (!tt || tt.arrivalOffsetsSeconds.length !== route.points.length) continue;
      let departures: number[];
      try {
        departures = generateDepartureMinutesForBands(tt.timeBands);
      } catch {
        continue;
      }
      // A second, more severe real live bug found while verifying plan #9
      // against the real save: for a split-direction component
      // (`tt.direction !== "both"`), `tt.arrivalOffsetsSeconds`/
      // `departureOffsetsSeconds` are full ROUTE-length arrays, but only
      // this component's own leg has real computed values — everywhere
      // else is left at 0 (`computeOffsetsForDirection`'s own documented
      // convention, route-timetable-grid.mts). Reading every point's
      // offset unconditionally (as this did before) feeds
      // computeVehiclePosition a points array whose OWN final entry can
      // be stuck at arrivalOffsetSeconds=0 whenever the route's last
      // point happens to fall in the OTHER leg — and that function's own
      // very first guard (`elapsedSeconds > points[points.length -
      // 1].arrivalOffsetSeconds`) then returns null for virtually any
      // real elapsed time, meaning the vehicle silently never rendered at
      // all. The exact same root bug T200 already fixed in
      // duty-journeys.mts's journeysForRoute, just never caught here —
      // confirmed live against the real save: route 51 ("100"), whose
      // matching Mon-Fri timetable is an "outbound"-only component, had
      // ZERO active vehicles at any time of day until this fix.
      const segment = tt.direction === "both" ? undefined : routeDirectionRanges(route).find((r) => r.label === tt.direction);
      const fromPointIndex = segment?.fromPointIndex ?? 0;
      const toPointIndex = segment?.toPointIndex ?? route.points.length - 1;
      const routePoints = route.points.slice(fromPointIndex, toPointIndex + 1);
      const legSlice = legs.slice(fromPointIndex, toPointIndex);
      if (legSlice.length === 0) continue;
      // A journey that departed yesterday can still be running well past
      // midnight into "today" (a near-24/7 service) — checked alongside a
      // same-day departure, not instead of it.
      for (const departureMinutes of departures) {
        // Peak/standard picked per JOURNEY by its own real departure clock
        // time (2026-11-15, same reasoning as buildRouteTimetableGrid/
        // journeysForRoute) — otherwise a timing point's peak padding
        // would have no visible effect on vehicle movement at all.
        const peak = isPeakMinute(departureMinutes);
        const arrivalOffsets = peak ? tt.arrivalOffsetsSecondsPeak : tt.arrivalOffsetsSeconds;
        const departureOffsets = peak ? tt.departureOffsetsSecondsPeak : tt.departureOffsetsSeconds;
        const points: JourneyPointTiming[] = routePoints.map((_, localIndex) => ({
          arrivalOffsetSeconds: arrivalOffsets[fromPointIndex + localIndex],
          departureOffsetSeconds: departureOffsets[fromPointIndex + localIndex],
        }));
        const livery = pickLiveryForJourney(
          route,
          departureMinutes,
          liveries,
          depotGroupsById.get(route.depotGroupId),
          airlinkLothianFallbackByDepotGroup.get(route.depotGroupId) ?? false,
        );
        const badgeImage = livery ? liveryBadgeImageId(livery.name) : "";
        for (const dayOffsetSeconds of [0, -SECONDS_PER_DAY]) {
          const key = journeyOccupancyKey(route.id, departureMinutes, dayOffsetSeconds);
          const elapsed = gameSecondsOfDay - departureMinutes * 60 - dayOffsetSeconds;
          const result = computeVehiclePosition(legSlice, points, elapsed);
          if (!result) {
            // This specific journey instance hasn't started yet, or has
            // already finished — either way, nothing real to keep
            // tracking. Pruned here rather than left to accumulate, so
            // this map stays bounded to currently-or-recently-active
            // journeys across a long play session.
            journeyOccupancy.delete(key);
            continue;
          }

          // Real boarding/alighting (DESIGN.md §2 "a bus carries a
          // passenger and earns money", plan #9): processes every real
          // stop point this journey has reached since the LAST tick that
          // checked it, in arrival order — not just an exact-instant
          // match, since most real points have zero dwell time
          // (computeVehiclePosition's own doc comment: "only non-
          // instantaneous at a timing point's own dwell"), so a plain
          // "elapsed is currently within this point's own [arrival,
          // departure] window" check would almost never land on a
          // zero-width window at this tick's own 250ms granularity.
          let state = journeyOccupancy.get(key);
          if (!state) state = { onBoard: [], lastStopPointIndex: -1 };
          for (let i = state.lastStopPointIndex + 1; i < points.length; i++) {
            if (elapsed < points[i].arrivalOffsetSeconds) break;
            const point = routePoints[i];
            if (point.kind === "stop" && point.osmId !== undefined) {
              const scheduledBoardSeconds = departureMinutes * 60 + points[i].departureOffsetSeconds;
              const candidates: OnBoardPassenger[] = [];
              const stillWaiting: WaitingPassenger[] = [];
              for (const w of waitingPassengers) {
                if (w.routeId === route.id && w.boardStopOsmId === point.osmId && Math.abs(w.boardSeconds - scheduledBoardSeconds) <= BOARDING_TIME_TOLERANCE_SECONDS) {
                  candidates.push(w);
                } else {
                  stillWaiting.push(w);
                }
              }
              const visit = processStopVisit(state.onBoard, DEFAULT_VEHICLE_CAPACITY, point.osmId, candidates);
              state.onBoard = visit.onBoard;
              // Plan #12 (route statistics) — one real stop-visit sample
              // toward this route's own load factor (and leftBehind
              // count), using the vehicle's own real onBoard count right
              // after this visit's boarding, not before it.
              recordStopVisit(routeStatsAccumulatorFor(route.id), state.onBoard.length, DEFAULT_VEHICLE_CAPACITY, visit.boarded.length, visit.leftBehind.length);
              // Council-triggered stop upgrades (2026-11-16) — feeds this
              // real boarding event into the busy-hour boarding tracker,
              // same additive-hook convention bus-station-fees.mts's own
              // wiring just below already established at this same real
              // stop-visit point.
              if (visit.boarded.length > 0) {
                const boardHour = Math.floor((((scheduledBoardSeconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY) / 3600);
                const lastHour = lastBoardingHourByOsmId.get(point.osmId);
                if (lastHour !== undefined && lastHour !== boardHour) stopBoardingTracker.closeOutHour(point.osmId, lastHour);
                stopBoardingTracker.recordBoarding(point.osmId, boardHour, visit.boarded.length);
                lastBoardingHourByOsmId.set(point.osmId, boardHour);
              }
              // leftBehind candidates (the vehicle was full) go back into
              // the pool for a later vehicle on the same route, not lost.
              // leftBehind contains the exact same object references passed
              // in as `candidates` (WaitingPassenger[] satisfies the
              // OnBoardPassenger[] parameter structurally) — processStopVisit
              // never constructs new objects, just filters/passes through —
              // so this cast is safe, not a lie to the type checker.
              waitingPassengers = [...stillWaiting, ...(visit.leftBehind as WaitingPassenger[])];
              const revenue = totalOperatorRevenueGBPPence(visit.boarded);
              if (revenue > 0) {
                const gameDay = Math.floor(nowSeconds / SECONDS_PER_DAY);
                void window.finance.record(revenue, "Fare revenue", route.depotGroupId, `Route ${route.number} fares`, gameDay);
              }
              // Real per-departure bus station fee (2026-11-16,
              // bus-station-fees.mts) — charged only at the journey's own
              // real origin (i === 0, the very first point this journey
              // instance has ever reached, per state.lastStopPointIndex
              // starting at -1), matching the real-world "departure"
              // billing SPT's own rate sheet is based on — a route merely
              // calling at a station mid-route, not starting there, is
              // not a departure in that sense.
              if (i === 0) {
                const station = busStationsState.find((b) => b.osmId === point.osmId);
                if (station) {
                  const fee = stationDepartureFeeGBPPence(station.name, true);
                  if (fee !== null && fee > 0) {
                    const gameDay = Math.floor(nowSeconds / SECONDS_PER_DAY);
                    void window.finance.record(-fee, "Stand rental", route.depotGroupId, `${station.name} departure fee (Route ${route.number})`, gameDay);
                  }
                }
              }
            }
            state.lastStopPointIndex = i;
          }
          journeyOccupancy.set(key, state);

          const { badgeRotation, needsMirror } = badgeDisplayRotation(result.bearingDegrees);
          const displayBadgeImage = livery && needsMirror ? liveryBadgeMirroredImageId(livery.name) : badgeImage;
          features.push({
            type: "Feature",
            properties: {
              colour: route.colour,
              number: route.number,
              bearing: result.bearingDegrees,
              badgeRotation,
              badgeImage: displayBadgeImage,
              routeType: route.routeType,
              // Real, queryable occupancy — the exact figure plans #10/#11
              // (bus capacity colour, stop crowding) were deferred pending
              // this plan; both are now real numbers, not buried in a
              // closure only this module can see.
              occupancy: state.onBoard.length,
              capacity: DEFAULT_VEHICLE_CAPACITY,
              // Plan #10 (bus capacity colour), 2026-11-15 — null when not
              // crowded enough to need an override (vehicles-circle-number/
              // vehicles-badge-number's own `coalesce` falls back to plain
              // white in that case).
              capacityColour: vehicleCapacityColour(state.onBoard.length, DEFAULT_SEATED_CAPACITY, DEFAULT_VEHICLE_CAPACITY),
            },
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
    get weekdayMask() {
      return weekdayMask;
    },
    setWeekdayMask(mask: number) {
      weekdayMask = mask;
      renderDayTypeBar();
    },
    activeVehicleFeatures,
    // Real, queryable waiting-passenger counts per real stop (plan #11,
    // stop crowding) — grouped live rather than requiring the caller to
    // know this module's own internal WaitingPassenger shape.
    waitingPassengerCountByStop(): Map<number, number> {
      const counts = new Map<number, number>();
      for (const w of waitingPassengers) counts.set(w.boardStopOsmId, (counts.get(w.boardStopOsmId) ?? 0) + 1);
      return counts;
    },
    // The real crowding tier for a stop RIGHT NOW, against its own
    // tracked typical-for-this-hour baseline (stop-crowding.mts) — reads
    // the current waiting count fresh rather than the last sampled one,
    // so a stop can show "busier than usual" between samples too, not
    // just at the moment a sample was taken.
    crowdingTierForStop(stopOsmId: number): CrowdingTier {
      const hourOfDay = Math.floor((gameClockState.accumulatedGameSeconds % SECONDS_PER_DAY) / 3600) % 24;
      const dayCategory = dayCategoryForWeekdayMask(weekdayMask, SATURDAY_MASK, SUNDAY_MASK);
      const currentCount = waitingPassengers.filter((w) => w.boardStopOsmId === stopOsmId).length;
      return stopCrowdingTracker.tierFor(stopOsmId, dayCategory, hourOfDay, currentCount);
    },
    // Council-triggered stop upgrades (2026-11-16) — the real tracked
    // busy-hour boarding count for this stop right now (buses is schedule-
    // derived and only recomputed per 30s refresh, so this reports the
    // boarding half live and the bus half as of the last refresh — the
    // UI caller (stops-layer.ts) only needs this to compute the real
    // accelerate-cost formula, which doesn't need tick-level freshness).
    busyHourUsageForStop(stopOsmId: number): { boardings: number; buses: number } {
      return { boardings: stopBoardingTracker.busyHourBoardingCount(stopOsmId), buses: lastKnownBusyHourBusCountByOsmId.get(stopOsmId) ?? 0 };
    },
    stopUpgradeState(stopOsmId: number): StopUpgradeState | null {
      return stopUpgradeStateByOsmId.get(stopOsmId) ?? null;
    },
    // Pays to have an upgrade installed now rather than waiting for its
    // real threshold — the one path that DOES charge the player (the
    // automatic council-triggered path above never does). Posts the real
    // accelerate cost to the given depot group's own ledger, then
    // persists the install; returns the resulting real state so the
    // caller can refresh its own display immediately rather than waiting
    // for the next 30s refresh.
    async accelerateStopUpgrade(stopOsmId: number, upgradeType: LocalStopUpgradeType, depotGroupId: number): Promise<StopUpgradeState> {
      // Not `this.busyHourUsageForStop(...)` — this object literal's own
      // method `this` type doesn't carry its sibling properties under
      // strict inference here, so this reads the same closure state that
      // getter uses directly instead.
      const usage = { boardings: stopBoardingTracker.busyHourBoardingCount(stopOsmId), buses: lastKnownBusyHourBusCountByOsmId.get(stopOsmId) ?? 0 };
      const cost = accelerateCostGBPPence(usage, upgradeType);
      const gameDay = Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
      if (cost > 0) void window.finance.record(-cost, "Stop upkeep", depotGroupId, `Accelerated stop ${upgradeType} (stop ${stopOsmId})`, gameDay);
      const result = await window.stopUpgrades.install(stopOsmId, upgradeType, gameDay);
      stopUpgradeStateByOsmId.set(stopOsmId, result);
      return result;
    },
    // Plan #12 (route statistics) — the real load-factor/carried-vs-
    // gave-up counters for one route, or undefined if nothing has ever
    // been recorded for it yet (route-statistics-panel.ts's own caller
    // treats that as "can't tell," same as every other missing-data case
    // this bridge already exposes).
    routeStatsAccumulatorFor(routeId: number): RouteStatsAccumulator | undefined {
      return routeStatsAccumulators.get(routeId);
    },
  };
}
