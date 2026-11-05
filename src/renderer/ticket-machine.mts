// Ticket machine tiers and tap-on tap-off (TICKETING.md §1/§2) — pure
// logic only, no DOM/IPC dependency, same "testable on its own" split as
// fare-pricing-fixed.mts/repaint-booking.mts.
//
// Scope (first increment, 2026-11-05): the real tier/tap-on-tap-off
// state and its informational price, modelled per depot group (not per
// vehicle — TICKETING.md's own "every ticket machine in a depot group
// must be the same tier... upgrades are a bulk action for the whole
// group" means one field per group IS the real model, not a
// simplification). Deliberately NOT built here, each a real separate
// gap: install scheduling (§3 — engineer vs supplier, same-day
// switch-on, the Saturday-2x-pay small-depot case) needs Phase 7's
// engineering staff, which doesn't exist; actually deducting any of the
// prices below needs Phase 5's finance system, which doesn't exist;
// QR/APC effects on the demand simulation need Phase 4's passenger sim;
// company-wide one-off upgrades (§4), bus station info screens (§5) and
// the long-distance purchase rules (§6) are each their own separate
// future increment.

export type TicketMachineTier = "basic" | "mid" | "advanced";

// TICKETING.md §1's own price table, per vehicle.
export const TICKET_MACHINE_PRICE_GBP: Record<TicketMachineTier, number> = {
  basic: 0,
  mid: 350,
  advanced: 2800,
};

// TICKETING.md §2, per vehicle.
export const TAP_ON_TAP_OFF_PRICE_GBP_PER_VEHICLE = 1500;

const TIER_ORDER: Record<TicketMachineTier, number> = { basic: 0, mid: 1, advanced: 2 };

// "The Advanced ratchet: once any depot group has Advanced machines,
// every new depot group must start with Advanced. Mid does not trigger
// this." Only ever constrains a BRAND NEW depot group's own starting
// tier — an existing group that already has its own tier is never
// affected by this rule when it changes tier later, so this is only
// ever called from createDepotGroup, never from a tier-change on an
// existing group.
export function minimumStartingTier(existingGroupTiers: readonly TicketMachineTier[]): TicketMachineTier {
  return existingGroupTiers.some((t) => t === "advanced") ? "advanced" : "basic";
}

// Whether `candidate` is high enough to satisfy the ratchet above —
// used to validate a chosen starting tier against the real minimum,
// rather than silently overriding whatever was requested.
export function satisfiesMinimumTier(candidate: TicketMachineTier, minimum: TicketMachineTier): boolean {
  return TIER_ORDER[candidate] >= TIER_ORDER[minimum];
}
