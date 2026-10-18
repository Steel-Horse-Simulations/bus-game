// Bulk discount and payment-method math for the buy menu's Basket screen
// (OPERATIONS.md §3 "Buying"). Kept separate from vehicle-catalogue.mts,
// since this is about an ORDER (several vehicles, grouped by manufacturer),
// not about any one model's own catalogue data.

// Confirmed real table (OPERATIONS.md §3): 2% per vehicle for the first
// three, 3% per additional vehicle to six, then +1% per vehicle beyond
// six, capped at 25%. The table's own explicit rows (1→2%, 2→4%, 3→6%,
// 4→9%, 5→12%, 6→15%, 7→16%, 8→17%) match that formula exactly; extending
// the same "+1% per vehicle beyond six" rule the table itself states
// reaches the 25% cap at 16 vehicles. The table's prose separately says
// the cap is "reached at 21 vehicles" — a real, minor inconsistency
// between that prose and the table's own explicit numbers, not silently
// resolved either way here. This uses the table's literal figures and its
// own stated formula, which is the only mechanical way to compute the
// rows (9-20) the table doesn't spell out individually; worth asking the
// user to confirm if it ever matters precisely.
export function bulkDiscountPercent(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 2;
  if (count === 2) return 4;
  if (count === 3) return 6;
  if (count === 4) return 9;
  if (count === 5) return 12;
  if (count === 6) return 15;
  return Math.min(25, 15 + (count - 6));
}

export type PaymentMethod = "buy_outright" | "lease" | "lease_to_own";

// Lease rates and terms are explicitly "not decided yet" (the user's own
// buy-menu spec) — these are placeholders for the UI to show something
// plausible, not a real financial product; nothing persists or deducts
// against them anywhere yet, since there's no finance/balance system
// (Phase 5) built at all. Only the "about 10% more than buying outright"
// figure for lease-to-own (OPERATIONS.md §3) is a real confirmed number.
export const LEASE_TERM_MONTHS_PLACEHOLDER = 48;
const LEASE_TO_OWN_TOTAL_MULTIPLIER = 1.1; // confirmed: "about 10% more than buying outright"
const LEASE_MONTHLY_RATE_PLACEHOLDER = 0.025; // not a real rate — placeholder only

export function leaseToOwnMonthlyGBP(outrightPriceGBP: number): number {
  return Math.round((outrightPriceGBP * LEASE_TO_OWN_TOTAL_MULTIPLIER) / LEASE_TERM_MONTHS_PLACEHOLDER);
}

export function leaseMonthlyGBP(outrightPriceGBP: number): number {
  return Math.round(outrightPriceGBP * LEASE_MONTHLY_RATE_PLACEHOLDER);
}
