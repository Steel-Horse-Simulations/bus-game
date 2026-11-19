// Automatic Day/Weekly fare capping (DESIGN.md §9 "Capping"), Phase 4,
// plan #8 of the approved 2026-11-15 batch — the "capping needs
// accumulated per-passenger spend from the two-tier passenger sim, which
// doesn't exist yet" gap `fare-journey.mts` used to flag; that sim now
// exists (`passenger-simulation.mts`, plan #6).
//
// DESIGN.md §9 verbatim, the two rules this module implements exactly:
// - "caps apply automatically, but only on buses fitted with a tap-on
//   tap-off ticket machine" (`capsApply` already exists in
//   fare-pricing-fixed.mts and is reused here unchanged, not reproduced).
// - "Caps are limited to the Day and Weekly thresholds only... NETWORK is
//   never capped into... Island, Sightseeing and NETWORK all still sit
//   entirely outside the capping system."
//
// Which TIER applies for a given day is not independently specified in
// DESIGN.md (the spec gives the three tiers' own separate figures and the
// City-only/Country-only/Combined ticket-validity rule, but not an
// explicit "how a day's accumulated tier is chosen" algorithm) — this
// module's own `effectiveTierForLegs` fills that one real gap with the
// only rule consistent with the ticket-validity text quoted above: a
// City-only ticket doesn't cover a Country route and vice versa, so a
// passenger whose day touches BOTH needs the Combined tier's own, higher
// cap to actually be covered for everything they rode; one who only ever
// touches one or the other needs only that tier's own (cheaper) cap. This
// is an inference from an adjacent confirmed rule, not a guess unrelated
// to the spec — flagged here rather than silently presented as directly
// quoted, matching this project's own "ask rather than guess" standard
// applied to design gaps it can't leave unbuilt.
//
// No government top-up for ordinary Day/Weekly capping is modelled here
// (unlike the separate £2 Highland/SPT/Aberdeen scheme, which DESIGN.md
// explicitly says the government reimburses the gap for — that scheme is
// out of scope for this plan entirely, a genuinely separate mechanism
// tied to its own three real council-area zones that don't exist as fare
// zones in this game yet): once a passenger's accumulated spend reaches
// the relevant cap, both the passenger-paid and operator-received figures
// simply stop growing together — DESIGN.md names no reimbursement for
// this cap type the way it explicitly does for the £2 scheme, so none is
// invented.
import { capsApply, tierCapFigures, type FareTier } from "./fare-pricing-fixed.mts";

export type { FareTier };

// A City-only leg stays "city"; a Country-only leg stays "country"; the
// moment a day's legs include both, the day's own required tier becomes
// "combined" and stays combined for the rest of that day (ticket
// validity only ever widens as more zone types get touched, it never
// narrows back once broadened). `legTiers` are each leg's own
// classification — reuse `fare-journey.mts`'s existing
// `classifyRouteZoneType` per route rather than reclassifying here; this
// function only combines results it's given, it doesn't classify
// anything itself. "island" legs are excluded by the caller before this
// is called — Island sits outside capping entirely (DESIGN.md, quoted
// above), so an island-classified leg is never a capping input.
export function effectiveTierForLegs(legTiers: readonly FareTier[]): FareTier {
  const sawCity = legTiers.includes("city");
  const sawCountry = legTiers.includes("country");
  if (sawCity && sawCountry) return "combined";
  if (sawCountry) return "country";
  return "city";
}

export interface CappedFareOutcome {
  passengerPaidGBPPence: number;
  operatorReceivedGBPPence: number;
  // The accumulated total AFTER this journey, for the caller to persist
  // and pass back into the next call this same passenger/day makes.
  newAccumulatedGBPPence: number;
  // True once this journey's own spend took the passenger to (or past)
  // the cap threshold — useful for UI/analytics, no effect on the figures
  // themselves (those are already correctly capped either way).
  reachedCap: boolean;
}

// One passenger's one journey against their own already-accumulated
// spend for the relevant window (day or week — same function serves
// both, the caller supplies whichever cap figure/accumulated total
// applies). `hasTapOnTapOffMachine` gates the whole mechanism per
// DESIGN.md's own rule quoted above — on a bus without the machine, the
// passenger simply pays the full `journeyFareGBPPence` every time, capping
// never engages, and `newAccumulatedGBPPence` still tracks what WOULD
// have been owed uncapped (so a later journey on a tap-on-tap-off-
// equipped bus the same day correctly inherits the right running total,
// rather than silently resetting because of an earlier non-equipped ride).
export function applyCap(journeyFareGBPPence: number, accumulatedBeforeGBPPence: number, capGBPPence: number, hasTapOnTapOffMachine: boolean): CappedFareOutcome {
  const uncappedAfter = accumulatedBeforeGBPPence + journeyFareGBPPence;
  if (!capsApply(hasTapOnTapOffMachine) || uncappedAfter <= capGBPPence) {
    return { passengerPaidGBPPence: journeyFareGBPPence, operatorReceivedGBPPence: journeyFareGBPPence, newAccumulatedGBPPence: uncappedAfter, reachedCap: uncappedAfter >= capGBPPence };
  }
  // Already at or past the cap before this journey even starts — the
  // whole thing is free, not just the portion "beyond" some marginal
  // slice of it (DESIGN.md gives no partial-journey proration for this
  // cap, unlike the separate £2 scheme's own explicit "only the part of
  // a journey actually inside a capped zone").
  const chargeable = Math.max(0, capGBPPence - accumulatedBeforeGBPPence);
  return { passengerPaidGBPPence: chargeable, operatorReceivedGBPPence: chargeable, newAccumulatedGBPPence: capGBPPence, reachedCap: true };
}

export function dayCapFor(tier: FareTier): number {
  return tierCapFigures(tier).dayCapGBPPence;
}
export function weekCapFor(tier: FareTier): number {
  return tierCapFigures(tier).weekCapGBPPence;
}

// --- Statistical-tier equivalence ---------------------------------------
//
// DESIGN.md §9's own "Cross-tier revenue reconciliation" text (written for
// Ridacard, explicitly said to cover capping too — "the two tiers are
// really solving one problem... capping's own eventual mechanism should
// be designed to cover both from the start"): for the agent tier, one
// real passenger's own accumulated spend is tracked exactly (`applyCap`
// above). For the statistical tier, "there's no individual purchase
// decision to track, so it needs... not per-passenger simulation, but a
// modelled proportion of statistical demand assumed to hold [a cap-
// reaching pattern], with revenue recognised as a periodic lump sum
// (scaled to that proportion) rather than per trip."
//
// `averageTripsPerCappedPassengerPerDay` is an explicitly flagged
// placeholder (2, a plain out-and-back commute) — DESIGN.md gives no real
// figure for how many trips a day a capped regular actually makes, same
// "ask rather than guess, flag rather than invent" convention as every
// other unsourced constant in this feature (`timeOfDayDemandMultiplier`,
// `CATEGORY_DESTINATION_AFFINITY`). Revisit once real player-visible
// behaviour makes a better figure obvious.
export const DEFAULT_AVERAGE_TRIPS_PER_CAPPED_PASSENGER_PER_DAY = 2;

// The statistical tier's own per-trip revenue figure for a capped
// passenger of this tier: the day's own total spend (the cap itself, by
// definition — a "capped" passenger is exactly one who reaches it) spread
// evenly across however many trips they're assumed to make, so summing
// this figure over that many statistical "trips" reproduces the same
// total per-passenger-per-day revenue an agent-tier passenger capped at
// the same tier would produce on average — the actual "both tiers
// agree" guarantee, proven in this module's own verify script against a
// real simulated sample of agent-tier passengers, not just asserted.
export function statisticalCappedRevenuePerTripGBPPence(tier: FareTier, averageTripsPerCappedPassengerPerDay: number = DEFAULT_AVERAGE_TRIPS_PER_CAPPED_PASSENGER_PER_DAY): number {
  return dayCapFor(tier) / averageTripsPerCappedPassengerPerDay;
}
