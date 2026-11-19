// Manual verification for passenger-types.mts, run directly with
// `node --experimental-strip-types src/renderer/passenger-types.verify.mts`
// — same pattern as this project's other .verify.mts files.
import { pickPassengerType, childFareGBPPence, fareForPassengerType, CONCESSIONARY_REIMBURSEMENT_RATE, PASSENGER_TYPE_MIX, type PassengerType } from "./passenger-types.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- pickPassengerType ---

// Every type must actually be reachable — a weighted distribution over a
// large sample should produce all four, roughly in proportion to
// PASSENGER_TYPE_MIX.
{
  const counts: Record<PassengerType, number> = { adult: 0, child: 0, student: 0, concession: 0 };
  const n = 20_000;
  for (let i = 0; i < n; i++) {
    // deterministic pseudo-random sequence, no external RNG dependency
    const rand = ((i * 9301 + 49297) % 233280) / 233280;
    counts[pickPassengerType(rand)]++;
  }
  for (const type of Object.keys(PASSENGER_TYPE_MIX) as PassengerType[]) {
    assert(counts[type] > 0, `${type} must be reachable at all, got ${counts[type]} of ${n}`);
  }
  const totalWeight = Object.values(PASSENGER_TYPE_MIX).reduce((a, b) => a + b, 0);
  for (const type of Object.keys(PASSENGER_TYPE_MIX) as PassengerType[]) {
    const expectedFraction = PASSENGER_TYPE_MIX[type] / totalWeight;
    const actualFraction = counts[type] / n;
    assert(
      Math.abs(actualFraction - expectedFraction) < 0.03,
      `${type}'s own sampled frequency (${actualFraction.toFixed(3)}) should track its real weight (${expectedFraction.toFixed(3)}) within 3%`,
    );
  }
}

// --- childFareGBPPence ---
// DESIGN.md §9's own real confirmed figures: City Single £2.40 -> £1.20,
// City DAY £6.00 -> £3.00, Country DAY £6.30 -> £3.15, Combined DAY
// £9.60 -> £4.80, NETWORK £14.00 -> £7.00, Airport Single £6.00 -> £3.00,
// Airport Return £8.50 -> £4.25 — every one exactly 50%, already a clean
// multiple of 5p, so the round-up never actually changes these specific
// figures, but a non-5p-aligned adult fare must still round UP correctly.

assert(childFareGBPPence(240) === 120, `City Single £2.40 -> Child £1.20, got ${childFareGBPPence(240)}p`);
assert(childFareGBPPence(600) === 300, `City DAY £6.00 -> Child £3.00, got ${childFareGBPPence(600)}p`);
assert(childFareGBPPence(630) === 315, `Country DAY £6.30 -> Child £3.15, got ${childFareGBPPence(630)}p`);
assert(childFareGBPPence(960) === 480, `Combined DAY £9.60 -> Child £4.80, got ${childFareGBPPence(960)}p`);
assert(childFareGBPPence(1400) === 700, `NETWORK £14.00 -> Child £7.00, got ${childFareGBPPence(1400)}p`);
assert(childFareGBPPence(850) === 425, `Airport Return £8.50 -> Child £4.25, got ${childFareGBPPence(850)}p`);
// A fare whose exact half isn't a multiple of 5p must round UP, not down
// or to the nearest — e.g. £2.41 -> half is 120.5p -> rounds up to 125p
// (the nearest 5p at or above), not down to 120p.
assert(childFareGBPPence(241) === 125, `£2.41's own half (120.5p) must round UP to the nearest 5p (125p), got ${childFareGBPPence(241)}p`);

// --- fareForPassengerType ---

{
  const adult = fareForPassengerType("adult", 240, false);
  assert(adult.passengerPaidGBPPence === 240 && adult.operatorReceivedGBPPence === 240, "adult pays and the operator receives the same full fare");
}
{
  const child = fareForPassengerType("child", 240, false);
  assert(child.passengerPaidGBPPence === 120 && child.operatorReceivedGBPPence === 120, "child pays and the operator receives the same discounted fare");
}
{
  // Student has no per-journey discount specified anywhere in the spec
  // (only Ridacard's own season-ticket figures exist, and those are
  // explicitly "not yet wired into any actual purchase flow") — so an
  // ordinary single fare is the plain adult figure, unchanged.
  const student = fareForPassengerType("student", 240, false);
  assert(student.passengerPaidGBPPence === 240 && student.operatorReceivedGBPPence === 240, "student's ordinary single fare is the plain adult figure (no per-journey discount specified yet)");
}
{
  // The core requirement this plan exists to prove: for a concessionary
  // passenger on an ordinary route, what the PASSENGER pays and what the
  // OPERATOR receives are two genuinely different real numbers, not one
  // collapsed figure.
  const concession = fareForPassengerType("concession", 240, false);
  assert(concession.passengerPaidGBPPence === 0, `concession travels free to the passenger, got ${concession.passengerPaidGBPPence}p`);
  assert(
    concession.operatorReceivedGBPPence === Math.round(240 * CONCESSIONARY_REIMBURSEMENT_RATE),
    `the operator still receives real reimbursement revenue (${CONCESSIONARY_REIMBURSEMENT_RATE * 100}% of the adult fare), got ${concession.operatorReceivedGBPPence}p`,
  );
  assert(concession.passengerPaidGBPPence !== concession.operatorReceivedGBPPence, "passenger-paid and operator-received must be genuinely different figures for a concessionary journey, not accidentally collapsed to one number");
}
{
  // DESIGN.md §9's own Airport Express exception: concession pays the
  // FULL adult fare there, no discount, no separate reimbursement line —
  // the one case where passenger-paid and operator-received ARE the
  // same number again, because the passenger already paid in full.
  const concessionOnAir = fareForPassengerType("concession", 600, true);
  assert(concessionOnAir.passengerPaidGBPPence === 600, `Airport Express concession pays the full adult fare, got ${concessionOnAir.passengerPaidGBPPence}p`);
  assert(concessionOnAir.operatorReceivedGBPPence === 600, `Airport Express concession's operator revenue is that same full fare, got ${concessionOnAir.operatorReceivedGBPPence}p`);
}

console.log("\nAll passenger-types checks passed.");
