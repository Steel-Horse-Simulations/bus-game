// Passenger types and concessionary reimbursement (DESIGN.md §8
// "Passengers" — "Types"), Phase 4, plan #7 of the approved 2026-11-15
// batch. Extends plan #6's `passenger-simulation.mts` (trip generation)
// with WHO is making each trip and what that means for fares — still the
// model only, not wired into the live vehicle tick loop or any real
// ledger (that's plan #9). Does not touch vehicle-simulation.ts.
//
// DESIGN.md §8 verbatim: "Types: adult, child, concession/older person,
// and student." Kept as a separate sibling module rather than folding
// into `passenger-simulation.mts` itself — that module's own header
// deliberately scoped passenger types out ("Every generated trip is a
// single generic passenger... built so a `type` field can be added
// later without reshaping anything"), and fare-pricing concepts
// (`Route`, `RouteType`, GBP pence) belong with `fare-journey.mts`'s own
// domain, not the trip-generation model.
import { pickWeighted } from "./passenger-simulation.mts";

export type PassengerType = "adult" | "child" | "student" | "concession";

// Real relative population-mix weights are not given anywhere in
// DESIGN.md §8 (it names the four types but not their frequencies) —
// explicitly flagged placeholder, same convention as this feature's
// other unsourced figures so far (`timeOfDayDemandMultiplier`,
// `CATEGORY_DESTINATION_AFFINITY`). Revisit once DESIGN.md §8 itself
// gives real figures, or once enough of the simulation is visible to
// tune by eye (the user's own stated preference, 2026-11-15).
export const PASSENGER_TYPE_MIX: Readonly<Record<PassengerType, number>> = {
  adult: 65,
  child: 15,
  student: 10,
  concession: 10,
};

const PASSENGER_TYPES: readonly PassengerType[] = ["adult", "child", "student", "concession"];

// Reuses plan #6's own `pickWeighted` rather than a second copy of the
// same weighted-choice loop.
export function pickPassengerType(rand: number): PassengerType {
  return pickWeighted(PASSENGER_TYPES, (t) => PASSENGER_TYPE_MIX[t], rand) ?? "adult";
}

// DESIGN.md §9, confirmed 2026-11-05, "applies to every ticket family in
// this game": Child is exactly 50% of the Adult price, rounded UP to the
// nearest 5p — not an approximation, a genuinely consistent real-world
// rule confirmed against every real Lothian/Airlink figure gathered.
export function childFareGBPPence(adultFareGBPPence: number): number {
  return Math.ceil(adultFareGBPPence / 2 / 5) * 5;
}

// DESIGN.md §8: "Concessionary travel is free to the passenger and
// reimbursed at a percentage of the adult fare, as under the real
// Scottish scheme." No exact percentage is given anywhere in the spec
// (unlike Child's exact, sourced 50%) — explicitly flagged placeholder,
// not invented as if real. The real Scottish National Concessionary
// Travel Scheme reimburses operators at a rate set to leave them neither
// better nor worse off than if the passenger had paid in cash, which in
// practice runs well under 100% — 60% is a reasonable placeholder
// ballpark, not a sourced figure, same convention as every other unsourced
// weight in this feature.
export const CONCESSIONARY_REIMBURSEMENT_RATE = 0.6;

// DESIGN.md §8: "Student... isn't designed beyond being confirmed to
// exist yet" for ordinary single/return fares (the only Student discount
// anywhere in the spec is Ridacard's own season-ticket figures, §9 —
// "Not yet wired into any actual purchase flow or passenger simulation").
// So a Student passenger's ordinary single fare is the plain Adult fare,
// unchanged, until a real per-journey Student figure is specified.
//
// Two figures, deliberately kept distinct: what the passenger actually
// pays, and what the operator actually receives for carrying them — the
// same journey can produce two different real numbers (concession is the
// one case where they genuinely differ), and collapsing them into one
// would silently lose DESIGN.md's own stated point: "Route choice
// therefore has a second economic dimension: a route full of
// concessionary passengers earns differently from the same route full of
// adults."
export interface PassengerFareOutcome {
  passengerPaidGBPPence: number;
  operatorReceivedGBPPence: number;
}

// `isAirportExpress`: DESIGN.md §9's own Airlink 100 spec, "Concessionary
// passengers pay the full adult fare — no discount, matching how real UK
// airport express services sit outside the national concessionary
// scheme. A deliberate exception to how concessionary reimbursement works
// everywhere else in the game." On that one route type, concession is
// priced exactly like adult — no free travel, no separate reimbursement
// line, because the passenger already paid the operator in full.
export function fareForPassengerType(type: PassengerType, adultFareGBPPence: number, isAirportExpress: boolean): PassengerFareOutcome {
  if (type === "concession" && !isAirportExpress) {
    return { passengerPaidGBPPence: 0, operatorReceivedGBPPence: Math.round(adultFareGBPPence * CONCESSIONARY_REIMBURSEMENT_RATE) };
  }
  const fare = type === "child" ? childFareGBPPence(adultFareGBPPence) : adultFareGBPPence;
  return { passengerPaidGBPPence: fare, operatorReceivedGBPPence: fare };
}
