// The real "Contracts" menu (DESIGN.md "Fixed real contracts": "Offered
// alongside council, event, lifeline and cruise contracts through a
// single contracts menu — one screen covering all four contract types";
// OPEN-ITEMS.md "Contracts redesign"/"Dounreay contracts"/"Three further
// contracts — 800, 803 & 805", settled 2026-11-19/20). UI/DOM layer only —
// real eligibility logic lives in fixed-contract-eligibility.mts, real
// failure/suspension logic in fixed-contract-failures.mts, real seed data
// in fixed-contract-route-seed-data.mts. Follows this codebase's own
// established standalone-toggle-plus-panel convention (route-statistics-
// panel.ts, dealer-reference-pins.ts), anchored off bottom-bar.ts's own
// BOTTOM_BAR_CLEARANCE_PX.
//
// Layout (a judgement call — DESIGN.md says only "one screen covering all
// four contract types," not a specific layout): three sections —
//   1. "Eligible — ready to accept" (398/Airlink 100/Express 500/AIR, once
//      their real gate is met and they have real content to seed).
//   2. "Eligible — route not yet built" (Dounreay's 8 real routes and
//      800/803/805, once their own gate is met — still offers Accept,
//      since 800/803/805's own gate counts Dounreay contracts as
//      "accepted," but shown as an honest placeholder rather than
//      pretending real route content exists).
//   3. "Accepted" — every contract already accepted, with its real
//      current status (normal / suspended + return date, pulled from
//      fixed-contract-failures.mts's own suspension records where a real
//      route exists to suspend).
// Not-yet-eligible contracts are summarised in one compact block rather
// than a full table per contract — SkyLink (permanently dormant, no real
// route exists) and whichever Dounreay/800/803/805 gates aren't met yet.
import { createDropdown } from "./dropdown";
import { BOTTOM_BAR_CLEARANCE_PX } from "./bottom-bar";
import { SECONDS_PER_DAY, addMonths, weekdayBitForGameDay } from "./game-clock.mts";
import {
  type FixedContractKey,
  type AcceptedFixedContractRouteRef,
  type FixedContractTimetableComponent,
  evaluateFixedContractDay,
  isAcceptedFixedContractRoute,
  awayCountForRoute,
  availableVehiclesForRoute,
} from "./fixed-contract-failures.mts";
import type { PvrRoute, PvrTimetable } from "./route-statistics.mts";
import {
  type EligibilityRoute,
  type EligibilityDepot,
  type DounreayContractState,
  isRoute398Eligible,
  isAirlink100Eligible,
  isExpress500Eligible,
  isAirEligible,
  isSkyLinkEligible,
  isDounreayRouteEligible,
  is800803805Eligible,
  DOUNREAY_ALL_ROUTE_NUMBERS,
  DOUNREAY_THURSO_ROUTE_NUMBERS,
  DOUNREAY_WICK_ROUTE_NUMBERS,
  DOUNREAY_END_OF_ROAD_DEPOT,
  hasDepotInThurso,
  hasDepotInWick,
  computeActivationGameDay,
} from "./fixed-contract-eligibility.mts";
import { ROUTE_398_SEED, AIRLINK_100_SEED, EXPRESS_500_SEED, AIR_PARENT_SEED, seedSingleFixedContractRoute, seedAirFixedContractRoutes, windowFixedContractSeedPorts } from "./fixed-contract-route-seed-data.mts";
import { findRouteTerminusStopOsmId } from "./stop-route-locks.mts";

const seedPorts = windowFixedContractSeedPorts();

const REAL_CONTRACT_KEYS = ["398", "airlink100", "express500", "air"] as const;
type RealContractKey = (typeof REAL_CONTRACT_KEYS)[number];

const REAL_CONTRACT_LABELS: Record<RealContractKey, string> = {
  "398": "398 — ScotRail Glasgow interchange bus",
  airlink100: "Airlink 100 — Edinburgh airport service",
  express500: "Express 500 — Glasgow Airport service",
  air: "AIR — Edinburgh Airport reward contract",
};

function fullySuspended(suspensions: readonly FixedContractSuspensionRecord[], routeIds: readonly number[], todayGameDay: number): boolean {
  if (routeIds.length === 0) return false;
  return routeIds.every((routeId) =>
    suspensions.some((s) => s.routeId === routeId && s.active && todayGameDay < s.returnGameDay && s.suspendedUnits >= s.totalUnits),
  );
}

function anySuspended(suspensions: readonly FixedContractSuspensionRecord[], routeIds: readonly number[], todayGameDay: number): boolean {
  return routeIds.some((routeId) => suspensions.some((s) => s.routeId === routeId && s.active && todayGameDay < s.returnGameDay));
}

export const contractsPanelState: {
  open: (() => void) | null;
  close: (() => void) | null;
} = { open: null, close: null };

export async function mountContractsPanel(): Promise<void> {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Contracts";
  toggle.style.position = "absolute";
  toggle.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX}px`;
  toggle.style.right = "408px"; // clears Route statistics (268px) and Place stop, same collision-avoidance convention
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX + 36}px`;
  panel.style.right = "408px";
  panel.style.zIndex = "2";
  panel.style.width = "720px";
  panel.style.maxHeight = "75vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Contracts";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let depotGroups: DepotGroup[] = [];
  let routes: Route[] = [];
  let depots: Depot[] = [];
  let acceptances: FixedContractAcceptance[] = [];
  let activeSuspensions: FixedContractSuspensionRecord[] = [];
  let todayGameDay = 0;
  let route77FirstSeenGameDay: number | null = null;

  async function reload(): Promise<void> {
    const [clock, dg, r, d, acc, susp] = await Promise.all([
      window.gameClock.get(),
      window.depotGroups.list(),
      window.routes.list(),
      window.depots.list(),
      window.fixedContracts.listAcceptances(),
      window.fixedContracts.listAllActiveSuspensions(),
    ]);
    depotGroups = dg;
    routes = r;
    depots = d;
    acceptances = acc;
    activeSuspensions = susp;
    todayGameDay = Math.floor(clock.accumulatedGameSeconds / SECONDS_PER_DAY);

    const route77 = routes.find((rt) => rt.number === "77");
    if (route77) {
      await window.fixedContracts.ensureRouteMilestone(route77.id, todayGameDay);
      route77FirstSeenGameDay = await window.fixedContracts.getRouteMilestone(route77.id);
    } else {
      route77FirstSeenGameDay = null;
    }

    // The real fixed-contract failure/fine/suspension mechanic
    // (fixed-contract-failures.mts) — built in full 2026-11-19 together
    // with its own storage, but never actually invoked by anything until
    // now (OPEN-ITEMS.md's own flagged gap, "isAcceptedFixedContract
    // Route"). Re-reads suspensions afterwards since this call can
    // create new ones (or expire old ones) that the Promise.all fetch
    // above already missed.
    await evaluateFixedContractFailures();
    activeSuspensions = await window.fixedContracts.listAllActiveSuspensions();
  }

  // --- Fixed-contract failure/fine/suspension mechanic — the real lazy
  // daily catch-up caller --------------------------------------------------
  //
  // Scoped to the 4 real keys fixed-contract-failures.mts covers — 398,
  // Airlink 100, Express 500, SkyLink — NEVER "air" (DESIGN.md §10: AIR
  // is a one-off reward with "genuinely zero fines for anything... a true
  // exception to the warning-and-review pattern every other contract
  // follows" — see that module's own header for why AIR and Railair are
  // both deliberately out of scope). SkyLink has no real route built yet,
  // so its own acceptance (if one ever exists) naturally has no routeIds
  // to evaluate — nothing is faked for it.
  //
  // Runs once per reload() (this screen's own lazy "re-checked fresh
  // every time it opens" convention, same as fleet-list-panel.ts's
  // billLeaseCharges/billGreenroadCharges, vehicle-lease-billing.mts,
  // greenroad-billing.mts — there is still no real central game-tick
  // anywhere in this codebase to hang this off instead).
  const FAILURE_MECHANIC_KEYS: readonly FixedContractKey[] = ["398", "airlink100", "express500", "skylink"];

  async function evaluateFixedContractFailures(): Promise<void> {
    const failureAcceptances = acceptances.filter((a): a is FixedContractAcceptance & { contractKey: FixedContractKey } =>
      (FAILURE_MECHANIC_KEYS as readonly string[]).includes(a.contractKey),
    );
    if (failureAcceptances.length === 0) return;

    // The real documented gate (fixed-contract-failures.mts's own header:
    // "evaluateFixedContractDay... must only ever be called for a route
    // the caller has ALREADY confirmed is the real accepted route for
    // that contract... identified by ROUTE ID, never by number") — built
    // from the SAME acceptances this function is already iterating, so
    // every routeId reached below trivially passes it, but the explicit
    // check stays in as the real enforcement point this module's own
    // header says must exist, not an inlined assumption.
    const acceptedRefs: AcceptedFixedContractRouteRef[] = failureAcceptances.map((a) => ({ contractKey: a.contractKey, routeIds: a.routeIds }));

    const [allVehicles, repaintBookings, repowerBookings] = await Promise.all([window.vehicles.listAll(), window.repaintBookings.listAll(), window.repowerBookings.listAll()]);
    const awayBookings = [...repaintBookings, ...repowerBookings].map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));

    for (const acceptance of failureAcceptances) {
      for (const routeId of acceptance.routeIds) {
        if (!isAcceptedFixedContractRoute(routeId, acceptedRefs)) continue;
        const route = routes.find((r) => r.id === routeId);
        if (!route) continue; // a route id recorded on acceptance but since deleted — nothing real left to evaluate
        await evaluateOneRouteFailures(route, acceptance, allVehicles, awayBookings);
      }
    }
  }

  async function evaluateOneRouteFailures(
    route: Route,
    acceptance: FixedContractAcceptance,
    allVehicles: readonly Vehicle[],
    awayBookings: readonly { vehicleId: number; startGameDay: number; completionGameDay: number }[],
  ): Promise<void> {
    const timetables = await window.routeTimetables.listForRoute(route.id);
    if (timetables.length === 0) return; // no real timetable at all yet — nothing scheduled, nothing to evaluate

    const pvrRoute: PvrRoute & { id: number } = { id: route.id, points: route.points, terminusIndex: route.terminusIndex, startIndex: route.startIndex };
    const pvrTimetables: PvrTimetable[] = timetables.map((t) => ({ weekdayMask: t.weekdayMask, direction: t.direction, timeBands: t.timeBands, departureOffsetsSeconds: t.departureOffsetsSeconds }));
    const timetableComponents: FixedContractTimetableComponent[] = timetables.map((t) => ({
      weekdayMask: t.weekdayMask,
      direction: t.direction,
      timeBands: t.timeBands,
      excludedDepartureMinutes: t.excludedDepartureMinutes,
      customDepartureMinutes: t.customDepartureMinutes,
    }));

    // "Vehicles locked to a contract" (this file's own header, reusing
    // boughtForRouteId as the one real per-route vehicle-assignment
    // signal that exists — see fixed-contract-failures.mts's own comment
    // on awayCountForRoute for the full reasoning).
    const dedicatedVehicleIds = allVehicles.filter((v) => v.boughtForRouteId === route.id).map((v) => v.id);

    const [cursor, fineEvents, suspensionRecords] = await Promise.all([
      window.fixedContracts.getEvaluationCursor(route.id),
      window.fixedContracts.listFineEvents(route.id),
      window.fixedContracts.listSuspensions(route.id),
    ]);

    // Never evaluate before the contract was actually live — a day
    // before activationGameDay isn't a real obligation yet
    // (computeActivationGameDay, fixed-contract-eligibility.mts: "starts
    // on the first Monday after a minimum of 10 days have passed").
    const startGameDay = cursor !== null ? cursor + 1 : acceptance.activationGameDay;
    if (startGameDay > todayGameDay) return; // already fully caught up, or the contract hasn't gone live yet

    // In-memory running state, seeded from real DB history and updated as
    // this loop walks forward — a day evaluated later in THIS SAME loop
    // must see fine-days/suspensions created earlier in this same
    // catch-up run, not just what was already on disk before it started.
    const fineDayGameDays = fineEvents.map((e) => e.gameDay);
    const suspensions: FixedContractSuspensionRecord[] = [...suspensionRecords];

    for (let day = startGameDay; day <= todayGameDay; day++) {
      const dayBit = weekdayBitForGameDay(day);
      const coveringComponent = timetables.find((t) => (t.weekdayMask & dayBit) !== 0);
      if (!coveringComponent) continue; // no real component covers this weekday at all (e.g. no Sunday service) — nothing scheduled, nothing to miss
      const weekdayMask = coveringComponent.weekdayMask;

      const awayCount = awayCountForRoute(dedicatedVehicleIds, awayBookings, day);
      const availableVehicles = availableVehiclesForRoute(dedicatedVehicleIds.length, awayCount);
      const recentFineDayGameDays = fineDayGameDays.filter((d) => d < day);

      const result = evaluateFixedContractDay({
        route: pvrRoute,
        pvrTimetables,
        timetableComponents,
        weekdayMask,
        todayGameDay: day,
        availableVehicles,
        recentFineDayGameDays,
        existingSuspensions: suspensions,
      });

      if (result.missedUnits > 0) {
        await window.fixedContracts.recordFineEvent(route.id, route.number, acceptance.depotGroupId, day, result.scheduledUnits, result.missedUnits, result.fineGBPPence);
        fineDayGameDays.push(day);
      }
      if (result.newSuspension) {
        const created = await window.fixedContracts.createSuspension(
          result.newSuspension.routeId,
          result.newSuspension.weekdayMask,
          result.newSuspension.suspendedUnits,
          result.newSuspension.totalUnits,
          result.newSuspension.startGameDay,
          result.newSuspension.returnGameDay,
        );
        suspensions.push(created);
      }
      for (const expired of result.justExpired) {
        const real = suspensions.find((s) => s.routeId === expired.routeId && s.weekdayMask === expired.weekdayMask && s.startGameDay === expired.startGameDay && s.active);
        if (real) {
          await window.fixedContracts.deactivateSuspension(real.id);
          real.active = false;
        }
      }
    }

    await window.fixedContracts.setEvaluationCursor(route.id, todayGameDay);
  }

  function eligRoutes(): EligibilityRoute[] {
    return routes.map((r) => ({ id: r.id, number: r.number, points: r.points.map((p) => ({ lon: p.lon, lat: p.lat })) }));
  }
  function eligDepots(): EligibilityDepot[] {
    return depots.map((d) => ({ id: d.id, depotGroupId: d.depotGroupId, lon: d.lon, lat: d.lat }));
  }

  function acceptanceFor(key: string): FixedContractAcceptance | undefined {
    return acceptances.find((a) => a.contractKey === key);
  }

  function isRealContractEligible(key: RealContractKey): boolean {
    if (key === "398") return isRoute398Eligible(eligRoutes());
    if (key === "airlink100") return isAirlink100Eligible(eligDepots());
    if (key === "express500") return isExpress500Eligible(eligRoutes(), route77FirstSeenGameDay, todayGameDay, addMonths);
    // air
    const express500Acc = acceptanceFor("express500");
    const airlink100Acc = acceptanceFor("airlink100");
    return isAirEligible(
      express500Acc?.activationGameDay ?? null,
      express500Acc ? anySuspended(activeSuspensions, express500Acc.routeIds, todayGameDay) : false,
      airlink100Acc?.activationGameDay ?? null,
      airlink100Acc ? anySuspended(activeSuspensions, airlink100Acc.routeIds, todayGameDay) : false,
      todayGameDay,
    );
  }

  function dounreayStates(): DounreayContractState[] {
    return DOUNREAY_ALL_ROUTE_NUMBERS.map((num) => {
      const acc = acceptanceFor(`dounreay_${num}`);
      return {
        routeNumber: num,
        isAccepted: acc !== undefined,
        isFullySuspended: acc ? fullySuspended(activeSuspensions, acc.routeIds, todayGameDay) : false,
      };
    });
  }

  function defaultDepotGroupId(): number | null {
    return depotGroups[0]?.id ?? null;
  }

  // Real routes numbered exactly like each contract's own seed data — the
  // signal used to adopt pre-existing hand-built content instead of
  // seeding a duplicate. Confirmed necessary by a real live check against
  // this project's own save (2026-11-20): 398/Airlink 100 were both
  // already hand-built there (DESIGN.md's own "Build approach" for each —
  // drawn once by the player, then normally extracted and locked in) long
  // before this menu existed to Accept them through, so seeding a SECOND
  // "398"/"100" route into that same save the first time Accept is
  // pressed would create a genuine duplicate, not adopt the real one
  // already there.
  function existingRouteIdsForNumber(number: string): number[] {
    return routes.filter((r) => r.number === number).map((r) => r.id);
  }

  async function acceptRealContract(key: RealContractKey, chosenDepotGroupId: number): Promise<void> {
    let routeIds: number[];
    const existing398 = existingRouteIdsForNumber(ROUTE_398_SEED.number);
    const existingAirlink100 = existingRouteIdsForNumber(AIRLINK_100_SEED.number);
    const existingExpress500 = existingRouteIdsForNumber(EXPRESS_500_SEED.number);
    const existingAir = existingRouteIdsForNumber(AIR_PARENT_SEED.number);
    if (key === "398" && existing398.length > 0) routeIds = existing398;
    else if (key === "airlink100" && existingAirlink100.length > 0) routeIds = existingAirlink100;
    else if (key === "express500" && existingExpress500.length > 0) routeIds = existingExpress500;
    else if (key === "air" && existingAir.length > 0) routeIds = existingAir;
    else if (key === "398") routeIds = await seedSingleFixedContractRoute(seedPorts, chosenDepotGroupId, ROUTE_398_SEED);
    else if (key === "airlink100") routeIds = await seedSingleFixedContractRoute(seedPorts, chosenDepotGroupId, AIRLINK_100_SEED);
    else if (key === "express500") routeIds = await seedSingleFixedContractRoute(seedPorts, chosenDepotGroupId, EXPRESS_500_SEED);
    else routeIds = await seedAirFixedContractRoutes(seedPorts, chosenDepotGroupId);
    // When adopting a pre-existing hand-built route (above), the
    // acceptance must record THAT route's own real depot group, not
    // whatever group happened to be selected in the picker — the picker
    // only makes sense for the "create a brand-new route" path. Freshly
    // seeded content always belongs to chosenDepotGroupId, since that's
    // exactly where seedSingleFixedContractRoute/seedAirFixedContractRoutes
    // just created it.
    const adoptedExisting = routeIds === existing398 || routeIds === existingAirlink100 || routeIds === existingExpress500 || routeIds === existingAir;
    const depotGroupId = adoptedExisting ? (routes.find((r) => r.id === routeIds[0])?.depotGroupId ?? chosenDepotGroupId) : chosenDepotGroupId;
    const activationGameDay = computeActivationGameDay(todayGameDay);
    await window.fixedContracts.createAcceptance(key, routeIds, depotGroupId, todayGameDay, activationGameDay, null);
    await bundleContractTerminusStop(key, routeIds);
    await reload();
    render();
  }

  // Contract-stop bundling (OPEN-ITEMS.md "Phase 5/9 redesign: stop
  // ownership dropped..." — "exactly ONE stop per contract — the
  // terminus stop at the airport/station... The user's own words: 'The
  // contracted stops are only 1 stop, all the terminus stop.'"). Runs
  // once, right after a real fixed contract (398/Airlink 100/Express
  // 500/AIR) is accepted — locks that one real terminus stop to the
  // contract's own route, for free. Free permanent route advertising
  // (no £500 setup fee, no 14-day delay, reusing route-advertising.mts's
  // own real booking shape via its new isContractBundle flag rather than
  // a parallel "free forever" record) is a separate term and goes at
  // BOTH of the route's real ends (user correction 2026-11-20: "Route
  // advertising should still be on both terminus stops... for the
  // current contracts") — only the exclusivity lock stays single-stop.
  //
  // Fetches routes FRESH here rather than reusing the module-level
  // `routes` array above — for a freshly seeded contract (no pre-
  // existing hand-built route to adopt), `routes` is still the
  // pre-seed snapshot at this point in the call and wouldn't contain
  // the just-created route's own real points/terminusIndex at all.
  async function bundleContractTerminusStop(key: RealContractKey, routeIds: number[]): Promise<void> {
    if (routeIds.length === 0) return; // nothing seeded/adopted yet to lock (shouldn't happen for a real contract, but matches the honest "can't tell, don't fake it" convention)
    const freshRoutes = await window.routes.list();
    // The real PARENT route specifically (parentRouteId === null), not
    // just routeIds[0] — AIR accepts as 3 route ids (the parent "AIR"
    // route plus its two real minor variations), and existing-route
    // adoption filters by number, which doesn't guarantee parent-first
    // ordering the way fresh seeding does. All of AIR's variations
    // share the same real terminus point in the live save this was
    // extracted from, so the parent's own terminusIndex is the right,
    // single source to read regardless.
    const primaryRoute = freshRoutes.find((r) => routeIds.includes(r.id) && r.parentRouteId === null) ?? freshRoutes.find((r) => r.id === routeIds[0]);
    if (!primaryRoute) {
      console.warn(`bundleContractTerminusStop: couldn't find route(s) ${routeIds.join(",")} for contract "${key}" — nothing to lock/advertise (flagged gap).`);
      return;
    }
    const terminusOsmId = findRouteTerminusStopOsmId(primaryRoute);
    if (terminusOsmId === null) {
      console.warn(`bundleContractTerminusStop: contract "${key}"'s route ${primaryRoute.id} has no resolvable terminus STOP (terminusIndex/startIndex/point 0 isn't a real stop) — nothing to lock/advertise (flagged gap, see stop-route-locks.mts's findRouteTerminusStopOsmId).`);
      return;
    }

    // findRouteTerminusStopOsmId only ever resolves ONE end
    // (terminusIndex ?? startIndex ?? 0). Checked directly against the
    // real seed data/live save for all three non-loop contracts: the
    // OTHER real end is always point 0 (Express 500's Buchanan-area stop
    // osmId 11373284542, Airlink's Edinburgh Airport stop osmId
    // 502531539, AIR's Edinburgh Airport stop osmId 502534132) — never
    // itself returned by terminusIndex/startIndex for these three. For
    // 398 (a true loop, terminusIndex/startIndex both null) point 0 IS
    // already the same stop as terminusOsmId.
    const otherEndPoint = primaryRoute.points[0];
    const otherEndOsmId = otherEndPoint && otherEndPoint.kind === "stop" && otherEndPoint.osmId != null ? otherEndPoint.osmId : null;

    // Which of the two real ends get the exclusivity LOCK. 398 and
    // Express 500 keep the original single-stop rule (the user's
    // earlier confirmed "The contracted stops are only 1 stop, all the
    // terminus stop") with terminusOsmId as that one stop — Express
    // 500's airport end already is what terminusOsmId/
    // findRouteTerminusStopOsmId resolves to. Airlink 100 and AIR are
    // now both confirmed exceptions, each moving/extending which real
    // end(s) get locked (user, 2026-11-20):
    //   - Airlink 100: "Airlink 100 lock needs to be locked at the
    //     airport," then "And the city centre" when asked to
    //     disambiguate against the AIR question below — locks BOTH real
    //     ends, Edinburgh Airport (point 0, since terminusIndex doesn't
    //     resolve to it) and the city-centre terminus (terminusIndex
    //     itself, osmId 502534133).
    //   - AIR: "AIR should be at the Airport end" — moves its single
    //     lock from terminusOsmId (Buchanan Bus Station, osmId
    //     5869396707, what terminusIndex/startIndex both resolve to) to
    //     otherEndOsmId instead (Edinburgh Airport, point 0, osmId
    //     502534132). Still exactly one stop, just the other one.
    const lockStopOsmIds =
      key === "airlink100" && otherEndOsmId !== null && otherEndOsmId !== terminusOsmId
        ? [terminusOsmId, otherEndOsmId]
        : key === "air" && otherEndOsmId !== null
          ? [otherEndOsmId]
          : [terminusOsmId];

    for (const lockStopOsmId of lockStopOsmIds) {
      const existingLock = await window.stopRouteLocks.get(lockStopOsmId);
      if (!existingLock) {
        await window.stopRouteLocks.create(lockStopOsmId, primaryRoute.id, "contract", key, null, todayGameDay);
      } else if (existingLock.lockedRouteId !== primaryRoute.id) {
        // Flagged edge case, not expected in ordinary play: the real
        // stop this contract wants is already locked to a DIFFERENT
        // route (e.g. the player bought it as an airport stop first).
        // The lock step is skipped rather than throwing on the real
        // stop_route_locks PRIMARY KEY — the contract's free advertising
        // below is still granted regardless, since that's a separate
        // term of the deal.
        console.warn(`bundleContractTerminusStop: contract "${key}"'s real stop ${lockStopOsmId} is already locked to a different route (${existingLock.lockedRouteId}) — contract lock skipped, free advertising still granted.`);
      }
    }

    // Free, permanent route advertising goes at BOTH of the route's real
    // ends regardless of which one(s) got the lock (user correction
    // 2026-11-20: "Route advertising should still be on both terminus
    // stops... for the current contracts") — advertising is a separate
    // term of the deal from the exclusivity lock above.
    const advertisingStopOsmIds = otherEndOsmId !== null && otherEndOsmId !== terminusOsmId ? [terminusOsmId, otherEndOsmId] : [terminusOsmId];

    for (const stopOsmId of advertisingStopOsmIds) {
      // Live immediately (bookedGameDay === liveFromGameDay, no 14-day
      // delay) and never billed (see isContractBundle in route-
      // advertising.mts/db.mts). Guarded against double-granting if this
      // ever somehow re-ran for the same contract.
      const existingAdvertising = await window.routeAdvertising.listForStop(stopOsmId);
      const alreadyBundled = existingAdvertising.some((b) => b.isContractBundle && b.routeId === primaryRoute.id);
      if (!alreadyBundled) {
        await window.routeAdvertising.create(stopOsmId, primaryRoute.depotGroupId, "specific_route", primaryRoute.id, null, todayGameDay, todayGameDay, true);
      }
    }
  }

  async function acceptPlaceholderContract(key: string, depotGroupId: number, grantedDepotId: number | null): Promise<void> {
    const activationGameDay = computeActivationGameDay(todayGameDay);
    await window.fixedContracts.createAcceptance(key, [], depotGroupId, todayGameDay, activationGameDay, grantedDepotId);
    await reload();
    render();
  }

  async function accept800803805(key: "800" | "803" | "805", depotGroupId: number): Promise<void> {
    // "This contract will provide it's own depot at the end of the
    // road" — confirmed automatic and free, same shape as 398's own
    // pre-owned terminus stop. No entrance is placed automatically (same
    // "a person looking at the map, not a guess" convention every other
    // depot/dealer entrance in this codebase already follows) — the
    // player adds one via the normal depot UI before the depot is
    // actually usable.
    const { depot } = await window.depots.create(depotGroupId, `${key} depot (end of the road)`, DOUNREAY_END_OF_ROAD_DEPOT.lon, DOUNREAY_END_OF_ROAD_DEPOT.lat, []);
    await acceptPlaceholderContract(key, depotGroupId, depot.id);
  }

  function section(title: string): HTMLDivElement {
    const h = document.createElement("div");
    h.textContent = title;
    h.style.fontWeight = "600";
    h.style.marginTop = "14px";
    h.style.marginBottom = "6px";
    body.appendChild(h);
    const wrap = document.createElement("div");
    body.appendChild(wrap);
    return wrap;
  }

  function depotGroupPickerRow(onAccept: (depotGroupId: number) => Promise<void>): HTMLDivElement {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginTop = "4px";
    if (depotGroups.length === 0) {
      const none = document.createElement("span");
      none.className = "label-muted";
      none.textContent = "No depot groups exist yet.";
      row.appendChild(none);
      return row;
    }
    let selected = defaultDepotGroupId() ?? depotGroups[0].id;
    const dropdown = createDropdown(
      depotGroups.map((g) => g.name),
      depotGroups.find((g) => g.id === selected)?.name ?? depotGroups[0].name,
      (name) => {
        selected = depotGroups.find((g) => g.name === name)?.id ?? selected;
      },
    );
    row.appendChild(dropdown.el);
    const acceptButton = document.createElement("button");
    acceptButton.className = "btn";
    acceptButton.textContent = "Accept";
    acceptButton.addEventListener("click", () => void onAccept(selected));
    row.appendChild(acceptButton);
    return row;
  }

  function statusLineForRealContract(key: RealContractKey, acc: FixedContractAcceptance): HTMLDivElement {
    const line = document.createElement("div");
    line.style.marginTop = "4px";
    if (key === "air") {
      line.className = "label-muted";
      line.textContent = "Accepted — AIR is exempt from fines/suspension entirely (DESIGN.md §10).";
      return line;
    }
    const suspended = acc.routeIds.filter((id) => activeSuspensions.some((s) => s.routeId === id && s.active && todayGameDay < s.returnGameDay));
    if (suspended.length === 0) {
      line.className = "label-muted";
      line.textContent = todayGameDay < acc.activationGameDay ? `Accepted — starts game day ${acc.activationGameDay} (today: ${todayGameDay}).` : "Accepted — running normally.";
    } else {
      const batches = activeSuspensions.filter((s) => suspended.includes(s.routeId) && s.active && todayGameDay < s.returnGameDay);
      const returnDay = Math.max(...batches.map((b) => b.returnGameDay));
      line.textContent = `Suspended on ${suspended.length} route${suspended.length === 1 ? "" : "s"} — Thistle Coaches covers meanwhile, returns by game day ${returnDay}.`;
    }
    return line;
  }

  function render(): void {
    body.innerHTML = "";

    // --- Section 1: real contracts, ready to accept ---------------------
    const readySection = section("Eligible — ready to accept");
    let anyReady = false;
    for (const key of REAL_CONTRACT_KEYS) {
      if (acceptanceFor(key)) continue;
      if (!isRealContractEligible(key)) continue;
      anyReady = true;
      const row = document.createElement("div");
      row.style.marginBottom = "10px";
      const label = document.createElement("div");
      label.textContent = REAL_CONTRACT_LABELS[key];
      label.style.fontWeight = "500";
      row.appendChild(label);
      row.appendChild(depotGroupPickerRow((depotGroupId) => acceptRealContract(key, depotGroupId)));
      readySection.appendChild(row);
    }
    if (!anyReady) {
      const none = document.createElement("div");
      none.className = "label-muted";
      none.textContent = "Nothing newly eligible right now.";
      readySection.appendChild(none);
    }

    // --- Section 2: Dounreay + 800/803/805, gate met but no real content
    const placeholderSection = section("Eligible — route not yet built");
    let anyPlaceholder = false;
    for (const num of DOUNREAY_ALL_ROUTE_NUMBERS) {
      const key = `dounreay_${num}`;
      if (acceptanceFor(key)) continue;
      if (!isDounreayRouteEligible(num, eligDepots())) continue;
      anyPlaceholder = true;
      const town = DOUNREAY_THURSO_ROUTE_NUMBERS.includes(num) ? "Thurso" : "Wick";
      const row = document.createElement("div");
      row.style.marginBottom = "10px";
      const label = document.createElement("div");
      label.textContent = `Dounreay ${num} (${town}) — eligible, route not yet built.`;
      label.style.fontWeight = "500";
      row.appendChild(label);
      row.appendChild(depotGroupPickerRow((depotGroupId) => acceptPlaceholderContract(key, depotGroupId, null)));
      placeholderSection.appendChild(row);
    }
    const statesForProgression = dounreayStates();
    for (const key of ["800", "803", "805"] as const) {
      if (acceptanceFor(key)) continue;
      if (!is800803805Eligible(statesForProgression)) continue;
      anyPlaceholder = true;
      const row = document.createElement("div");
      row.style.marginBottom = "10px";
      const label = document.createElement("div");
      label.textContent = `Route ${key} — eligible (half of Dounreay fulfilled), route not yet built. Accepting grants a free depot at the end of the road; will be locked to Sprinter/D&E once a real route exists.`;
      label.style.fontWeight = "500";
      row.appendChild(label);
      row.appendChild(depotGroupPickerRow((depotGroupId) => accept800803805(key, depotGroupId)));
      placeholderSection.appendChild(row);
    }
    if (!anyPlaceholder) {
      const none = document.createElement("div");
      none.className = "label-muted";
      none.textContent = "Nothing newly eligible right now.";
      placeholderSection.appendChild(none);
    }

    // --- Section 3: accepted contracts, real status ----------------------
    const acceptedSection = section("Accepted");
    let anyAccepted = false;
    for (const key of REAL_CONTRACT_KEYS) {
      const acc = acceptanceFor(key);
      if (!acc) continue;
      anyAccepted = true;
      const row = document.createElement("div");
      row.style.marginBottom = "6px";
      const label = document.createElement("div");
      label.textContent = REAL_CONTRACT_LABELS[key];
      row.appendChild(label);
      row.appendChild(statusLineForRealContract(key, acc));
      acceptedSection.appendChild(row);
    }
    for (const num of DOUNREAY_ALL_ROUTE_NUMBERS) {
      const key = `dounreay_${num}`;
      const acc = acceptanceFor(key);
      if (!acc) continue;
      anyAccepted = true;
      const row = document.createElement("div");
      row.style.marginBottom = "6px";
      const label = document.createElement("div");
      label.textContent = `Dounreay ${num}`;
      row.appendChild(label);
      const status = document.createElement("div");
      status.className = "label-muted";
      status.textContent = acc.routeIds.length === 0 ? "Accepted — awaiting real route content." : "Accepted and running.";
      row.appendChild(status);
      acceptedSection.appendChild(row);
    }
    for (const key of ["800", "803", "805"] as const) {
      const acc = acceptanceFor(key);
      if (!acc) continue;
      anyAccepted = true;
      const row = document.createElement("div");
      row.style.marginBottom = "6px";
      const label = document.createElement("div");
      label.textContent = `Route ${key}`;
      row.appendChild(label);
      const status = document.createElement("div");
      status.className = "label-muted";
      status.textContent =
        acc.routeIds.length === 0
          ? `Accepted — awaiting real route content. Free depot granted${acc.grantedDepotId ? ` (depot #${acc.grantedDepotId})` : ""}.`
          : "Accepted and running.";
      row.appendChild(status);
      acceptedSection.appendChild(row);
    }
    if (!anyAccepted) {
      const none = document.createElement("div");
      none.className = "label-muted";
      none.textContent = "No contracts accepted yet.";
      acceptedSection.appendChild(none);
    }

    // --- Not-yet-eligible summary ------------------------------------------
    const notEligibleSection = section("Not yet eligible");
    const lines: string[] = [];
    if (isSkyLinkEligible() === false && !acceptanceFor("skylink")) {
      lines.push("SkyLink — dormant, no real route exists yet.");
    }
    if (!hasDepotInThurso(eligDepots())) {
      const remaining = DOUNREAY_THURSO_ROUTE_NUMBERS.filter((n) => !acceptanceFor(`dounreay_${n}`));
      if (remaining.length > 0) lines.push(`Dounreay (Thurso) ${remaining.join(", ")} — need a depot in Thurso.`);
    }
    if (!hasDepotInWick(eligDepots())) {
      const remaining = DOUNREAY_WICK_ROUTE_NUMBERS.filter((n) => !acceptanceFor(`dounreay_${n}`));
      if (remaining.length > 0) lines.push(`Dounreay (Wick) ${remaining.join(", ")} — need a depot in Wick.`);
    }
    if (!is800803805Eligible(statesForProgression)) {
      const fulfilled = statesForProgression.filter((s) => s.isAccepted && !s.isFullySuspended).length;
      if (!acceptanceFor("800") || !acceptanceFor("803") || !acceptanceFor("805")) {
        lines.push(`800/803/805 — need 4 of 8 Dounreay contracts accepted and active (currently ${fulfilled}/8).`);
      }
    }
    if (lines.length === 0) {
      const none = document.createElement("div");
      none.className = "label-muted";
      none.textContent = "Everything else is either eligible or already accepted.";
      notEligibleSection.appendChild(none);
    } else {
      for (const l of lines) {
        const line = document.createElement("div");
        line.className = "label-muted";
        line.textContent = l;
        notEligibleSection.appendChild(line);
      }
    }
  }

  toggle.addEventListener("click", () => {
    if (panel.style.display === "none") contractsPanelState.open?.();
    else contractsPanelState.close?.();
  });

  contractsPanelState.open = () => {
    panel.style.display = "flex";
    void reload().then(render);
  };
  contractsPanelState.close = () => {
    panel.style.display = "none";
  };
}
