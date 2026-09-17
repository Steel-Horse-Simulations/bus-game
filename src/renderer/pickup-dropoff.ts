// A stop's pick-up/set-down restriction — global (the stop's own default,
// stored as an override, electron/db.mts) with an optional per-route
// override (stored on the route itself, since it's tied to that route's
// specific point list). "both" is the unrestricted default and is never
// itself persisted as a value — its absence *is* "both". "skip" is an
// express's skipped stop (DESIGN.md §6 "Express services": "a variation
// with a list of skipped stops") — the bus still passes the point (it's
// on the physical road path) but never calls there at all, a step further
// than pickup/set-down-only which still stop. Route-scoped only: a stop's
// own global default is never "skip", since that would mean no route
// could ever call there — an express's skip list only makes sense
// relative to one specific route's own stopping pattern.
export type PickupDropoff = "pickup_only" | "setdown_only" | "skip";
export type PickupDropoffOrBoth = PickupDropoff | "both";

export const PICKUP_DROPOFF_LABELS: Record<PickupDropoffOrBoth, string> = {
  both: "Both (pick-up and set-down)",
  pickup_only: "Pick-up only",
  setdown_only: "Set-down only",
  skip: "Skip (express — doesn't call here)",
};

// The little box shown in a stop list next to a restricted stop — S for
// set-down only, P for pick-up only, X for an express's skipped stop,
// nothing for the unrestricted default.
export function pickupDropoffBadge(value: PickupDropoffOrBoth): string {
  if (value === "pickup_only") return "P";
  if (value === "setdown_only") return "S";
  if (value === "skip") return "X";
  return "";
}

// Per-route beats the stop's own global default when both are set.
export function effectivePickupDropoff(
  routeOverride: PickupDropoff | null,
  globalOverride: PickupDropoffOrBoth | null,
): PickupDropoffOrBoth {
  return routeOverride ?? globalOverride ?? "both";
}
