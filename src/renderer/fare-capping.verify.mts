// Manual verification for fare-capping.mts, run directly with
// `node --experimental-strip-types src/renderer/fare-capping.verify.mts`
// — same pattern as this project's other .verify.mts files.
import { applyCap, dayCapFor, effectiveTierForLegs, statisticalCappedRevenuePerTripGBPPence, weekCapFor } from "./fare-capping.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- effectiveTierForLegs ---
assert(effectiveTierForLegs(["city", "city"]) === "city", "a day of city-only legs stays city tier");
assert(effectiveTierForLegs(["country", "country"]) === "country", "a day of country-only legs stays country tier");
assert(effectiveTierForLegs(["city", "country"]) === "combined", "a day touching both city and country upgrades to combined");
assert(effectiveTierForLegs(["country", "city", "city"]) === "combined", "once combined is reached it stays combined regardless of order");
assert(effectiveTierForLegs([]) === "city", "no legs at all defaults to the cheapest (city) tier rather than throwing");

// --- dayCapFor / weekCapFor reuse the real fixed figures ---
assert(dayCapFor("city") === 570, `expected the real City TapTapCap day figure (£5.70), got ${dayCapFor("city")}`);
assert(dayCapFor("country") === 620, `expected the real Country TapTapCap day figure (£6.20), got ${dayCapFor("country")}`);
assert(dayCapFor("combined") === 930, `expected the real Combined TapTapCap day figure (£9.30), got ${dayCapFor("combined")}`);
assert(weekCapFor("city") === 2650, `expected the real City week figure (£26.50), got ${weekCapFor("city")}`);

// --- applyCap: basic mechanics ---
{
  const r = applyCap(240, 0, 570, true);
  assert(r.passengerPaidGBPPence === 240 && r.operatorReceivedGBPPence === 240, "well under the cap: full fare charged both ways");
  assert(r.newAccumulatedGBPPence === 240, "accumulated total grows by the real fare");
  assert(!r.reachedCap, "not yet at the cap");
}
{
  // Four £2.40 City singles = £9.60, past the £5.70 day cap partway through the 3rd.
  let acc = 0;
  const outcomes = [];
  for (let i = 0; i < 4; i++) {
    const r = applyCap(240, acc, 570, true);
    outcomes.push(r);
    acc = r.newAccumulatedGBPPence;
  }
  assert(outcomes[0].passengerPaidGBPPence === 240, "trip 1: full fare, nowhere near the cap");
  assert(outcomes[1].passengerPaidGBPPence === 240, "trip 2: full fare, still under (480 <= 570)");
  assert(outcomes[2].passengerPaidGBPPence === 90, `trip 3: only the remaining 570-480=90p chargeable to reach the cap exactly, got ${outcomes[2].passengerPaidGBPPence}`);
  assert(outcomes[2].reachedCap, "trip 3 reaches the cap");
  assert(outcomes[3].passengerPaidGBPPence === 0, `trip 4: already at the cap, this whole journey is free, got ${outcomes[3].passengerPaidGBPPence}`);
  assert(outcomes[3].operatorReceivedGBPPence === 0, "the operator receives nothing extra once capped either — no government top-up for this cap type");
  assert(acc === 570, `accumulated total never exceeds the cap itself, got ${acc}`);
}

// --- applyCap: the gate (no tap-on-tap-off machine, no capping at all) ---
{
  const r = applyCap(240, 500, 570, false);
  assert(r.passengerPaidGBPPence === 240, "without a tap-on-tap-off machine, the full fare is always charged even when already near/past the cap");
  assert(r.newAccumulatedGBPPence === 740, "the running total still tracks the real UNCAPPED spend, so a later equipped-bus ride the same day inherits the right figure");
}

// --- statistical-tier equivalence: the actual "both tiers agree" proof ---
{
  const tier = "city";
  const tripsPerDay = 2;
  const perTripFareGBPPence = 240; // a City single
  const N = 20_000; // large sample, agent tier
  let totalRevenue = 0;
  let totalTrips = 0;
  for (let p = 0; p < N; p++) {
    let acc = 0;
    for (let t = 0; t < tripsPerDay; t++) {
      const r = applyCap(perTripFareGBPPence, acc, dayCapFor(tier), true);
      acc = r.newAccumulatedGBPPence;
      totalRevenue += r.operatorReceivedGBPPence;
      totalTrips++;
    }
  }
  const agentAveragePerTrip = totalRevenue / totalTrips;
  const statisticalPerTrip = statisticalCappedRevenuePerTripGBPPence(tier, tripsPerDay);
  // 2 trips/day at 240p each = 480p, which never actually reaches the
  // 570p City day cap — so this specific sample isn't a "genuinely
  // capped" population yet, confirming applyCap behaves as plain
  // per-trip pricing when nobody's near the cap, BEFORE the real capped
  // case below.
  assert(Math.abs(agentAveragePerTrip - perTripFareGBPPence) < 1, `below the cap, the agent-tier average should just be the plain per-trip fare (${perTripFareGBPPence}p), got ${agentAveragePerTrip}`);

  // Now the real capped case: enough trips/day that the sample genuinely
  // reaches the cap, so dayCap/tripsPerDay IS each trip's own real
  // average contribution — this is the actual equivalence DESIGN.md's
  // reconciliation text asks for.
  const cappedTripsPerDay = 4; // 4 x 240p = 960p, comfortably past the 570p City day cap
  let cappedRevenue = 0;
  let cappedTrips = 0;
  for (let p = 0; p < N; p++) {
    let acc = 0;
    for (let t = 0; t < cappedTripsPerDay; t++) {
      const r = applyCap(perTripFareGBPPence, acc, dayCapFor(tier), true);
      acc = r.newAccumulatedGBPPence;
      cappedRevenue += r.operatorReceivedGBPPence;
      cappedTrips++;
    }
  }
  const cappedAgentAveragePerTrip = cappedRevenue / cappedTrips;
  const cappedStatisticalPerTrip = statisticalCappedRevenuePerTripGBPPence(tier, cappedTripsPerDay);
  assert(
    Math.abs(cappedAgentAveragePerTrip - cappedStatisticalPerTrip) < 0.5,
    `agent-tier average per-trip revenue for a genuinely capped population (${cappedAgentAveragePerTrip.toFixed(2)}p) must match the statistical-tier formula's own figure (${cappedStatisticalPerTrip.toFixed(2)}p) — the two-tier "must agree" guarantee`,
  );
}

console.log("\nAll fare-capping checks passed.");
