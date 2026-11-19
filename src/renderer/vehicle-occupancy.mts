// Vehicle occupancy and boarding/alighting (DESIGN.md §2 "a bus carries a
// passenger and earns money"), Phase 4, plan #9 of the approved
// 2026-11-15 batch — the final piece wiring plans #5-8's models into the
// live vehicle tick loop. Pure logic only (no DOM/WASM/game-clock
// dependency), same "pure logic in its own module" convention this
// session's own prior plans (passenger-simulation.mts, passenger-types.mts,
// fare-capping.mts) already followed — the actual wiring (persistent
// per-journey state, generating candidates from the real demand/journey
// planner) lives in vehicle-simulation.ts, which does own the router/map/
// game clock this module deliberately doesn't need.
import type { PassengerType } from "./passenger-types.mts";

export interface OnBoardPassenger {
  alightStopOsmId: number;
  passengerType: PassengerType;
  passengerPaidGBPPence: number;
  operatorReceivedGBPPence: number;
}

export interface StopVisitResult {
  onBoard: OnBoardPassenger[];
  alighted: OnBoardPassenger[];
  boarded: OnBoardPassenger[];
  // Candidates that wanted to board but couldn't because the vehicle was
  // already at capacity — DESIGN.md's own vehicle-capacity concept means a
  // full bus must genuinely leave people behind, not silently clip through
  // it. The caller decides what happens to them (e.g. staying in a waiting
  // pool for the next vehicle) — this module has no notion of "waiting,"
  // only of one single stop visit.
  leftBehind: OnBoardPassenger[];
}

// One vehicle's real stop visit: alight anyone whose destination is this
// stop, then board waiting candidates (in the order given — the caller
// decides any real-world ordering, e.g. "whoever arrived first") up to
// whatever capacity remains. Pure and side-effect-free, so a caller can
// call this once per genuine stop ARRIVAL (not once per tick) and trust
// the result completely — the "have we already processed this exact stop
// visit" bookkeeping is the caller's own job (vehicle-simulation.ts), not
// this function's, since that needs per-tick elapsed-time state this
// module doesn't have.
export function processStopVisit(onBoardBefore: readonly OnBoardPassenger[], capacity: number, arrivingStopOsmId: number, candidates: readonly OnBoardPassenger[]): StopVisitResult {
  const alighted: OnBoardPassenger[] = [];
  const stillOnBoard: OnBoardPassenger[] = [];
  for (const p of onBoardBefore) {
    if (p.alightStopOsmId === arrivingStopOsmId) alighted.push(p);
    else stillOnBoard.push(p);
  }

  const boarded: OnBoardPassenger[] = [];
  const leftBehind: OnBoardPassenger[] = [];
  for (const c of candidates) {
    if (stillOnBoard.length + boarded.length < capacity) boarded.push(c);
    else leftBehind.push(c);
  }

  return { onBoard: [...stillOnBoard, ...boarded], alighted, boarded, leftBehind };
}

// Plan #10 (bus capacity colour), confirmed spec (OPEN-ITEMS.md, 2026-11-15):
// "route-number badge is yellow at 80% seated capacity, orange at 100%
// seated (0 standing), red at 100% of total capacity (seated + standing
// both full)." Read as the only sensible continuous reading of three named
// transition points for a monotonically increasing occupancy: yellow
// begins at 80% of seated, the yellow->orange boundary sits exactly at
// 100% seated (every seat full, zero standing yet), and the orange->red
// boundary sits exactly at 100% of total capacity (seated AND standing
// both full) — orange is therefore "seats full, some standing, not yet at
// the total ceiling," not a single instantaneous point. `null` (no
// override — the caller keeps whatever colour it already uses) below 80%
// of seated capacity. Pure, so it's testable without a live map.
//
// `seatedCapacity`/`totalCapacity` are passed in rather than hardcoded
// here deliberately — this module has no model of WHICH real vehicle
// (and therefore which real seated/standing split from VEHICLE-SPECS.md's
// own `Capacity` union, vehicle-catalogue.mts) is serving a given journey;
// there is no real journey-to-owned-vehicle assignment system in this
// game yet (confirmed by reading vehicle-simulation.ts directly — its own
// feature-building loop iterates scheduled departures, not owned vehicle
// instances), so vehicle-simulation.ts currently supplies a flagged
// placeholder pair (its own `DEFAULT_VEHICLE_CAPACITY`, plus a new
// placeholder seated figure) rather than a real per-model one. When a real
// vehicle assignment exists, that caller should pass the real vehicle's
// own seated/total figures from its configured `Capacity` instead, with
// zero change needed here.
//
// A vehicle whose own real seated capacity equals its total (a coach —
// `Capacity`'s `seatedOnly` kind, genuinely zero standing room) correctly
// collapses the orange band to zero width: occupancy jumps straight from
// yellow to red the instant the last seat fills, since there is no
// standing capacity to ever occupy orange's own range. That is a correct
// consequence of a real zero-standing vehicle, not a bug in this function.
export function vehicleCapacityColour(occupancy: number, seatedCapacity: number, totalCapacity: number): string | null {
  if (occupancy >= totalCapacity) return "#ef4444"; // red
  if (occupancy >= seatedCapacity) return "#f97316"; // orange
  if (occupancy >= seatedCapacity * 0.8) return "#eab308"; // yellow
  return null;
}

// Plain sum of a boarding batch's own real revenue — the figure the
// caller actually records into the finance ledger per stop visit, kept as
// its own named function so the "what counts as revenue" definition lives
// in one place rather than being re-added inline at every call site.
export function totalOperatorRevenueGBPPence(boarded: readonly OnBoardPassenger[]): number {
  let total = 0;
  for (const p of boarded) total += p.operatorReceivedGBPPence;
  return total;
}
