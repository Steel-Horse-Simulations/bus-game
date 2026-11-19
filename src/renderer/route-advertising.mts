// Route advertising (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
// dropped...", confirmed 2026-11-16) — player-bought only, never
// council-triggered, unlike the sibling shelter/seating/lighting upgrade
// system (council-triggered-stop-upgrades.mts or wherever that sibling
// feature lands — built concurrently this session, not referenced
// here). Advertising only benefits the one company paying for it, so
// there is no "the council would do this anyway" default path: no
// busy-hour threshold, no pay-to-accelerate. It's always player-
// initiated and player-paid, full stop.
//
// Real settled figures (OPEN-ITEMS.md, two live corrections this
// session — these are the FINAL values, not an intermediate guess):
// £20/month, PLUS a £500 one-off setup fee (printing/installation —
// both apply together, not instead of each other), PLUS a 14-day delay
// before it actually goes live (OPERATIONS.md §16's own real "work
// starts 14 days after ordering" stop-upgrade fitting convention,
// reused rather than inventing a separate figure — a flat CALENDAR-day
// add, not a working-day-aware schedule, since nothing here has a
// capacity constraint the way the repaint/re-power shop-bay bookings do
// — any number of stops can have advertising ordered the same day).
import { monthKeyFromGameDay, elapsedMonthKeysSince, maxMonthKey } from "./private-hire-income.mts";
import { liveryOperator, isLongDistanceLiveryName, liveryEligibleForRoute } from "./livery-seed-data.mts";

export const ROUTE_ADVERTISING_SETUP_FEE_GBP_PENCE = 50_000;
export const ROUTE_ADVERTISING_MONTHLY_FEE_GBP_PENCE = 2_000;
export const ROUTE_ADVERTISING_DELAY_DAYS = 14;

export function routeAdvertisingLiveFromGameDay(bookedGameDay: number): number {
  return bookedGameDay + ROUTE_ADVERTISING_DELAY_DAYS;
}

export function isRouteAdvertisingLive(liveFromGameDay: number, nowGameDay: number): boolean {
  return nowGameDay >= liveFromGameDay;
}

// Every calendar month that's genuinely live (on or after liveFromDay,
// matching the real 14-day delay — a booking never gets billed for a
// month it wasn't actually up yet) and hasn't already been charged, in
// ascending order — same "lastKnownMonthKey exclusive, falls back when
// nothing's been billed yet" shape as vehicle-lease-billing.mts's own
// chargeableMonthKeys, just with no fixed term cap (route advertising
// keeps billing indefinitely until the player cancels it, unlike a
// 60-month lease).
export function chargeableRouteAdvertisingMonthKeys(liveFromGameDay: number, nowGameDay: number, alreadyBilled: readonly string[]): string[] {
  if (nowGameDay < liveFromGameDay) return [];
  const liveFromMonthKey = monthKeyFromGameDay(liveFromGameDay);
  const lastKnownMonthKey = maxMonthKey(alreadyBilled) ?? liveFromMonthKey;
  return elapsedMonthKeysSince(lastKnownMonthKey, nowGameDay);
}

// Minimal real route/livery/depot-group shapes needed to derive which
// real long-distance operator(s) actually call at a stop — structural
// rather than importing the full ambient Route/Livery/DepotGroup types
// wholesale, matching this project's own "keep a pure module's
// dependencies minimal" convention (workshop-booking.mts's own
// AwayBooking is the precedent). `RouteType` itself is the real ambient
// global type (depot-groups.d.ts) every other renderer module already
// references unqualified, not loosened to a bare string, so this stays
// structurally exact for liveryEligibleForRoute's own real signature.
export interface AdvertisableRoute {
  id: number;
  number: string;
  routeType: RouteType;
  points: readonly { kind: string; osmId?: number | null; lon: number; lat: number }[];
  depotGroupId: number;
}
export interface AdvertisableLivery {
  name: string;
}
export interface AdvertisableDepotGroup {
  name: string;
  region: string;
}

// Real routes (long_distance category only) that call at this stop —
// "calls at" means any of the route's own real stop points matches the
// given osmId, same convention computeStopCallingServices (stop-
// calling-services.mts) already uses elsewhere for "which services call
// here."
export function longDistanceRoutesAtStop(stopOsmId: number, routes: readonly AdvertisableRoute[]): AdvertisableRoute[] {
  return routes.filter((r) => r.routeType === "long_distance" && r.points.some((p) => p.kind === "stop" && p.osmId === stopOsmId));
}

// The real distinct operator/company names (liveryOperator()) of
// whichever long-distance liveries are actually eligible for at least
// one real long-distance route calling at this stop — the long-
// distance-generic advertising mode's own real content. Empty when no
// real long-distance route calls here at all (the generic mode simply
// isn't offered in that case — same "can't tell, don't fake it"
// convention this codebase uses everywhere; the caller should only show
// the generic option when this returns at least one name).
export function longDistanceOperatorsAtStop(
  stopOsmId: number,
  routes: readonly AdvertisableRoute[],
  liveries: readonly AdvertisableLivery[],
  depotGroupsById: ReadonlyMap<number, AdvertisableDepotGroup>,
): string[] {
  const operators = new Set<string>();
  for (const route of longDistanceRoutesAtStop(stopOsmId, routes)) {
    const depotGroup = depotGroupsById.get(route.depotGroupId);
    for (const livery of liveries) {
      if (!isLongDistanceLiveryName(livery.name)) continue;
      if (!liveryEligibleForRoute(livery.name, { routeType: route.routeType, number: route.number, points: route.points.map((p) => ({ lon: p.lon, lat: p.lat })) }, depotGroup)) continue;
      const operator = liveryOperator(livery.name);
      if (operator) operators.add(operator);
    }
  }
  return [...operators].sort();
}
