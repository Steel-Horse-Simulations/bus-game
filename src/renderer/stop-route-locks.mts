// Stop route locks (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
// dropped...", confirmed 2026-11-16) — the one shared "a stop is
// exclusively tied to one route" primitive behind two distinct features:
//
//  1. Contract-stop bundling: accepting a Fixed real contract (398,
//     Airlink 100, Express 500, AIR) automatically locks its own real
//     TERMINUS stop — and only the terminus, "The contracted stops are
//     only 1 stop, all the terminus stop," the user's own words
//     (OPEN-ITEMS.md) — to that one contracted route, for free, as a
//     term of the contract.
//  2. Airport-stop purchase: the player can buy an airport stop outright
//     (flat £15,000, confirmed placeholder, explicitly unsourced — no
//     real published airport-bay purchase price exists) and lock it to
//     whichever of their OWN routes they choose.
//
// Both cases need the exact same real exclusivity rule afterwards — once
// locked, no other route (existing or future) can use that stop — so
// this module is the one place that rule lives, per CLAUDE.md's own
// "build it once, reuse it" convention (place-the-ends-and-spread-the-
// rest is the named precedent elsewhere in this codebase for exactly
// this kind of "build the shared thing once" situation).
//
// Pure logic only, no DOM/IPC — same split as route-advertising.mts/
// stop-upgrades.mts. electron/db.mts has the real storage, stops-layer.ts
// the real UI, contracts-panel.ts the contract-side wiring.

export type StopRouteLockSource = "contract" | "purchased";

export interface StopRouteLock {
  stopOsmId: number;
  lockedRouteId: number;
  source: StopRouteLockSource;
  contractKey: string | null;
  purchasePriceGbpPence: number | null;
  lockedGameDay: number;
}

export function lockForStop(locks: readonly StopRouteLock[], stopOsmId: number): StopRouteLock | null {
  return locks.find((l) => l.stopOsmId === stopOsmId) ?? null;
}

export function isStopLocked(locks: readonly StopRouteLock[], stopOsmId: number): boolean {
  return lockForStop(locks, stopOsmId) !== null;
}

// The real exclusivity check: can THIS route legitimately serve this
// stop? True when the stop isn't locked at all, or is already locked to
// this exact route (a locked route re-saving its own points/timetable
// must never be blocked by its own lock).
export function canRouteUseStop(locks: readonly StopRouteLock[], stopOsmId: number, routeId: number): boolean {
  const lock = lockForStop(locks, stopOsmId);
  return lock === null || lock.lockedRouteId === routeId;
}

// --- Shared terminus-stop lookup --------------------------------------
//
// CLAUDE.md's own "place-the-ends-and-spread-the-rest" convention: find
// the one real mechanism that already answers "which point is the
// terminus" (route-timetable.mts/the Route type's own terminusIndex/
// startIndex fields, set at draw time) and reuse it here rather than
// re-deriving "which point is the terminus" a second way.
//
// Fallback chain, in order: terminusIndex, then startIndex (the same
// order route-timetable.mts's own timing-point logic already treats
// them in), then point 0 when NEITHER is set — a JUDGEMENT CALL, not
// independently confirmed by the user, but not an arbitrary guess
// either: it's exactly 398's own real saved shape, checked directly
// against fixed-contract-route-seed-data.mts's ROUTE_398_SEED
// (terminusIndex: null, startIndex: null) — 398 is a LOOP route (its
// point 0 and its last point are the same real stop, osmId 441274332),
// so there genuinely is no separate "start" and "end" index to record;
// DESIGN.md calls this shared point "Central Station Forecourt (the
// combined start/terminus)". Falling back to point 0 for a route with
// no terminusIndex/startIndex at all is the correct reading of that
// text for 398 specifically; a different route with the same null/null
// shape for some other reason (not confirmed to ever happen) would get
// the same fallback, which may or may not be right for it — flagged
// here rather than assumed.
export interface TerminusLookupPoint {
  readonly kind: string;
  readonly osmId?: number | null;
}

export interface TerminusLookupRoute {
  readonly points: readonly TerminusLookupPoint[];
  readonly terminusIndex: number | null;
  readonly startIndex: number | null;
}

export function findRouteTerminusStopOsmId(route: TerminusLookupRoute): number | null {
  const idx = route.terminusIndex ?? route.startIndex ?? 0;
  const point = route.points[idx];
  if (!point || point.kind !== "stop" || point.osmId == null) return null;
  return point.osmId;
}

// --- Airport-stop purchase price ---------------------------------------
//
// Flat placeholder price (OPEN-ITEMS.md, confirmed 2026-11-16 — "your
// call," the user's own words). Explicitly unsourced: no real published
// airport-bay purchase price exists to ground it in (checked directly).
// Revisit once a general location/size-scaled property pricing system
// exists for depots/stops generally (none does yet, per the same
// OPEN-ITEMS.md entry) rather than inventing a bespoke scaling rule for
// this one feature now.
export const AIRPORT_STOP_PURCHASE_PRICE_GBP_PENCE = 1_500_000; // £15,000

// --- "Is this stop at an airport?" --------------------------------------
//
// Checked directly before inventing anything here (the task's own
// instruction): there's a real, ALREADY-BUILT, player-settable
// per-stop flag for exactly this — the "Airport (always a timing
// point, no option to disable)" checkbox in stops-layer.ts's own stop
// popup, stored as the generic override `("stop", osmId, "is_airport")`
// (also read by route-draw.ts/route-panel.ts for the timing-point
// rule). That is a genuine stop-level classification, not a route-type
// proxy — DESIGN.md's separate "Airport route type" (routeType ===
// "airport_express") flags a ROUTE, not a stop, and would give false
// positives for an airport_express route's ordinary city-centre stops.
// So the airport-stop-purchase feature keys off the existing
// `is_airport` stop override directly (an async
// `window.overrides.get<boolean>("stop", osmId, "is_airport")` read in
// stops-layer.ts, alongside the checkbox itself) rather than a function
// in this pure module — there's nothing left to derive once the real
// flag is just read as-is. Flagged here once, rather than silently
// assumed, since the user didn't confirm this specific reuse at this
// level of detail.
