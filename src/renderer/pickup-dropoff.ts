// A stop's pick-up/set-down restriction — global (the stop's own default,
// stored as an override, electron/db.mts) with an optional per-route
// override (stored on the route itself, since it's tied to that route's
// specific point list). "both" is the unrestricted default and is never
// itself persisted as a value — its absence *is* "both".
export type PickupDropoff = "pickup_only" | "setdown_only";
export type PickupDropoffOrBoth = PickupDropoff | "both";

export const PICKUP_DROPOFF_LABELS: Record<PickupDropoffOrBoth, string> = {
  both: "Both (pick-up and set-down)",
  pickup_only: "Pick-up only",
  setdown_only: "Set-down only",
};

// The little box shown in a stop list next to a restricted stop — S for
// set-down only, P for pick-up only, nothing for the unrestricted default.
export function pickupDropoffBadge(value: PickupDropoffOrBoth): string {
  if (value === "pickup_only") return "P";
  if (value === "setdown_only") return "S";
  return "";
}

// Per-route beats the stop's own global default when both are set.
export function effectivePickupDropoff(
  routeOverride: PickupDropoff | null,
  globalOverride: PickupDropoffOrBoth | null,
): PickupDropoffOrBoth {
  return routeOverride ?? globalOverride ?? "both";
}
