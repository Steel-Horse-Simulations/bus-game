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

// Real figures confirmed 2026-10-30 (OPERATIONS.md §3 "Buying"), replacing
// the earlier placeholder rate/term — both leases run 60 months, at a
// fixed monthly percentage of the vehicle's outright price. Lease: 1.4%/mo
// (84% of price over the full term, vehicle returned at the end).
// Lease to own: 1.83%/mo (110% of price, then ownership) — this also
// confirms the earlier "about 10% more than buying outright" figure as a
// real rate (1.83% × 60 = 109.8%, rounding to the stated 110%) rather than
// a rough estimate.
export const LEASE_TERM_MONTHS = 60;
const LEASE_MONTHLY_RATE = 0.014;
const LEASE_TO_OWN_MONTHLY_RATE = 0.0183;

export function leaseToOwnMonthlyGBP(outrightPriceGBP: number): number {
  return Math.round(outrightPriceGBP * LEASE_TO_OWN_MONTHLY_RATE);
}

export function leaseMonthlyGBP(outrightPriceGBP: number): number {
  return Math.round(outrightPriceGBP * LEASE_MONTHLY_RATE);
}
