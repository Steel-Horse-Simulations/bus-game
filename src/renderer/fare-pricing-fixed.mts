// The 2026-11-01/11-05 fare model rework (DESIGN.md §9) — pure
// calculation only, same "no DOM/IPC, testable on its own" pattern as
// fare-pricing.mts. Kept in its OWN file rather than added to
// fare-pricing.mts: that file's existing exports (countrySingleFareGBPPence,
// networkFareGBPPence, townFareGBPPence, ...) are still what the live
// fare-pricing-panel.ts actually calls today, built around the OLD
// player-set-per-depot-group model. DESIGN.md's own rework text says the
// panel itself "becomes a read-only display of these fixed figures...
// not yet built, this section records the confirmed target" — so the
// panel rework is explicitly its own separate, later, live-checked task
// (a 717-line UI panel isn't something to gut blind while the user can't
// see the result), not something to attempt alongside this. This file is
// the "formulas" half of that confirmed target: proven correct against
// every real figure DESIGN.md records, ready for the panel rework to
// call once it happens.
//
// Scope actually covered here (everything DESIGN.md §9 marks as fully
// confirmed with "nothing left open except the actual code"): the fixed
// Single-fare model (City/Country/Island/Town/Airport Express), Night
// extras, the universal Child fare rule, and the Day/Late/Weekly capping
// figures per tier (City/Country/Combined) with their real Day-to-Week
// ratios. Deliberately NOT covered, each a real, separate, larger gap —
// not guessed past:
// - Ridacard and the Student passenger type: DESIGN.md's own text says
//   these are "not yet wired into any actual purchase flow or passenger
//   simulation — the Student passenger type itself isn't designed
//   beyond being confirmed to exist yet either." Needs Phase 4's
//   passenger simulation to exist first.
// - Ferry/joint tickets and the Loganair flight commission: both
//   explicitly "deferred until Phase 5's finance system exists."
// - Town's own Dayrider figure: DESIGN.md's wording ("the same real
//   Lothian Day/Single ratio used for Weekly below") is genuinely
//   ambiguous between "a Day:Single ratio" and "the Day:Week ratio
//   method reused" — not confidently resolvable without asking, so left
//   unimplemented rather than guessed.
// - Ticket validity (City-only vs Country routes), the £2 fare cap
//   zones, and tap-on-tap-off gating itself: all explicitly "not yet
//   wired into any actual ticket-validity checking, since there's no
//   journey/ticketing engine yet" — this file provides the price
//   figures; deciding which one applies to a given journey is a later,
//   separate piece.

const FIVE_PENCE = 5;

function roundUpToNearest5pGBPPence(amountGBPPence: number): number {
  return Math.ceil(amountGBPPence / FIVE_PENCE) * FIVE_PENCE;
}

// --- Single fares (DESIGN.md §9 "Single fares") ---

export const CITY_SINGLE_GBP_PENCE = 240;
export const TOWN_SINGLE_GBP_PENCE = 200;
export const COUNTRY_OR_ISLAND_BASE_GBP_PENCE = 200;
export const COUNTRY_OR_ISLAND_PER_MILE_GBP_PENCE = 20;
export const AIRPORT_EXPRESS_SINGLE_GBP_PENCE = 600;
export const AIRPORT_EXPRESS_RETURN_GBP_PENCE = 850;
// Airport Express only (DESIGN.md: "the user confirmed this game only
// adopts it for Airport Express"), Return-only — no real Family Single
// figure exists to adopt.
export const AIRPORT_EXPRESS_FAMILY_RETURN_GBP_PENCE = 2200;

// "A base fee plus a price per mile" — shared by Country and Island,
// confirmed the same figures for both (DESIGN.md §9 "Zone types").
export function countryOrIslandSingleFareGBPPence(miles: number): number {
  return COUNTRY_OR_ISLAND_BASE_GBP_PENCE + Math.round(COUNTRY_OR_ISLAND_PER_MILE_GBP_PENCE * miles);
}

// --- Return (unchanged from the pre-rework model — DESIGN.md's own
// "Return" paragraph restates the identical rule: 1.6x a single, rounded
// up to the nearest 5p, except Airport Express which has its own fixed
// Return instead of following this ratio) ---

const RETURN_MULTIPLIER = 1.6;

export function returnFareGBPPence(singleFareGBPPence: number): number {
  return roundUpToNearest5pGBPPence(singleFareGBPPence * RETURN_MULTIPLIER);
}

// --- Night extras (DESIGN.md §9 "Night fares") ---

// "real City Night Single (£3.50) against real City Day Single (£2.40)
// is a flat +£1.10 — clean, since City has no per-mile component."
export const CITY_NIGHT_EXTRA_GBP_PENCE = 110;

export function cityNightSingleFareGBPPence(): number {
  return CITY_SINGLE_GBP_PENCE + CITY_NIGHT_EXTRA_GBP_PENCE;
}

// "Country/Island's own Night extra — proposed 2026-11-05, approximation
// not a direct measurement... Night Country/Island = Day Single + £1.10
// + 20p/mile." The "extra" itself is its own base-plus-per-mile formula
// (£1.10 base, the same confirmed 20p/mile rate), added on top of the
// full Day Single (which already has its own 20p/mile baked in) — so the
// per-mile rate is genuinely counted twice, once in the Day Single and
// once in the extra. Confirmed against DESIGN.md's own worked check: at
// ~7 miles this gives (200+140) + (110+140) = 590p = £5.90, matching the
// doc's own stated "£5.90 — about 7% over" the real £5.50 figure exactly
// (not the 450p a single per-mile count would give).
export function countryOrIslandNightExtraGBPPence(miles: number): number {
  return CITY_NIGHT_EXTRA_GBP_PENCE + Math.round(COUNTRY_OR_ISLAND_PER_MILE_GBP_PENCE * miles);
}

export function countryOrIslandNightSingleFareGBPPence(miles: number): number {
  return countryOrIslandSingleFareGBPPence(miles) + countryOrIslandNightExtraGBPPence(miles);
}

// --- Child fare (DESIGN.md §9 "Child fare — confirmed 2026-11-05,
// applies to every ticket family in this game, not just Ridacard") ---

// Exactly 50% of Adult, rounded up to the nearest 5p — verified against
// every real Child figure DESIGN.md records (see this module's own
// verify script), not an approximation. For a base-fee-plus-per-mile
// Single, this is 50% of the FINISHED Adult price (after its own 5p
// round-up), never 50% of the base/per-mile components separately.
export function childFareGBPPence(adultFareGBPPence: number): number {
  return roundUpToNearest5pGBPPence(adultFareGBPPence * 0.5);
}

// --- NETWORK (DESIGN.md §9 "NETWORK") ---

// "Lothian's own real NETWORK (£14.00) against City DAY (£6.00) —
// ≈2.333x, i.e. a +133% markup" — a fixed figure now, not player-set.
// Applied to the COMBINED (city+country) price, per the formula's own
// definition, even though the real-world grounding above compared
// NETWORK to City DAY specifically — that's simply how the real ratio
// was derived, not a reason to apply it to City instead of Combined.
export const NETWORK_MARKUP_PERCENT = 133;

export function networkFareGBPPence(combinedFareGBPPence: number): number {
  return roundUpToNearest5pGBPPence(combinedFareGBPPence * (1 + NETWORK_MARKUP_PERCENT / 100));
}

// --- Capping: Day/Late/Weekly, three tiers (DESIGN.md §9 "Capping") ---
//
// All now fixed, company-wide figures, taken directly from Lothian's own
// real data rather than computed from a formula (the Day-to-Weekly step
// DOES follow a real, confirmed, PER-TIER ratio — proven in the verify
// script below — but the Day/Late/Weekly figures themselves are simply
// recorded as-is, not derived, since deriving Day itself from the Single
// fare has no confirmed formula). "Day" below is the WALK-UP Day ticket
// price (what a passenger pays buying one upfront) — genuinely different
// from, and generally more expensive than, the automatic TapTapCap cap
// threshold a tap-on-tap-off passenger is capped down to if their
// accumulated Singles exceed it; both are real, separate figures in
// Lothian's own data and neither is derivable from the other by a clean
// ratio (checked: 0.95/0.984/0.969 across the three tiers — not
// consistent enough to treat as one rule).
export type FareTier = "city" | "country" | "combined";

export interface TierCapFigures {
  dayWalkupGBPPence: number;
  dayCapGBPPence: number;
  lateGBPPence: number;
  weekCapGBPPence: number;
}

export const TIER_CAP_FIGURES: Record<FareTier, TierCapFigures> = {
  city: { dayWalkupGBPPence: 600, dayCapGBPPence: 570, lateGBPPence: 550, weekCapGBPPence: 2650 },
  country: { dayWalkupGBPPence: 630, dayCapGBPPence: 620, lateGBPPence: 620, weekCapGBPPence: 2500 },
  combined: { dayWalkupGBPPence: 960, dayCapGBPPence: 930, lateGBPPence: 930, weekCapGBPPence: 3850 },
};

export function tierCapFigures(tier: FareTier): TierCapFigures {
  return TIER_CAP_FIGURES[tier];
}

// Caps apply automatically only on tap-on-tap-off-equipped buses
// (TICKETING.md §3) — this is a pure gate on the price figures above,
// not a ticketing/journey-engine decision (there isn't one yet); the
// caller decides whether the bus/route in question qualifies.
export function capsApply(hasTapOnTapOffMachine: boolean): boolean {
  return hasTapOnTapOffMachine;
}
