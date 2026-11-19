// Manual verification script for remote-route-subsidy.mts, run directly
// with `node --experimental-strip-types src/renderer/remote-route-subsidy.verify.mts`.
import {
  isLowDensityRoute,
  journeyProfitGBPPence,
  journeyLosesMoney,
  subsidyTopUpGBPPence,
  evaluateSubsidyDay,
  acceptOffer,
  declineOffer,
  remoteRouteSubsidyEligibility,
  RUNNING_COST_PER_MILE_GBP_PENCE,
  LOW_DENSITY_AVERAGE_BOARDINGS_THRESHOLD,
  WITHDRAWAL_WARNING_GRACE_DAYS,
  type SubsidyRecord,
} from "./remote-route-subsidy.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- isLowDensityRoute ---
assert(isLowDensityRoute([]) === true, "a route with no real boarding data at all defaults to low-density (can't tell, don't block)");
assert(isLowDensityRoute([5, 10, 15]) === true, "average (10) below the threshold (20) is low-density");
assert(isLowDensityRoute([20, 20, 20]) === false, "average exactly at the threshold is NOT low-density (strictly below only)");
assert(isLowDensityRoute([19, 19, 19]) === true, "one below the threshold on average is low-density");
{
  // One busy interchange and a string of near-empty rural stops should
  // still read as low-density overall — the route-wide AVERAGE, not the
  // busiest single stop, is what governs this.
  const result = isLowDensityRoute([50, 2, 1, 0, 3]);
  assert(result === true, `one busy stop among many quiet ones still averages low-density, got ${result}`);
}
assert(LOW_DENSITY_AVERAGE_BOARDINGS_THRESHOLD === 20, "threshold matches the Seating stop-upgrade tier (OPERATIONS.md §16)");

// --- remoteRouteSubsidyEligibility (island/lifeline exclusion, fixed
// 2026-11-19 — a genuine island depot group's route must never qualify
// for this mechanic, since it already has its own distinct lifeline
// per-mile payment model) ---
{
  // A genuinely remote, low-density, loss-making journey on an ISLAND
  // route — exactly the real bug report ("Skye having a lifeline
  // services still needs an amount paid to it per mile to keep it
  // running"): it would otherwise qualify on every real signal
  // (low-density AND losing money), but the island flag must override
  // both and block it outright.
  const result = remoteRouteSubsidyEligibility(/* isIslandRoute */ true, /* isLowDensity */ true, /* losesMoney */ true);
  assert(result.isLowDensity === false, "an island route is never treated as eligible on density, even when it genuinely is low-density");
  assert(result.losesMoney === false, "an island route is never treated as losing money for subsidy purposes, even when it genuinely is — it has its own lifeline payment model instead");
}
{
  // A non-island route's real signals pass through completely unchanged.
  const passThrough = remoteRouteSubsidyEligibility(false, true, true);
  assert(passThrough.isLowDensity === true && passThrough.losesMoney === true, "a non-island route's real density/loss signals are never altered");
  const passThroughNegative = remoteRouteSubsidyEligibility(false, false, false);
  assert(passThroughNegative.isLowDensity === false && passThroughNegative.losesMoney === false, "a non-island route's real signals pass through in the negative case too");
}
{
  // End-to-end through evaluateSubsidyDay: an island route never gets a
  // fresh offer, however loss-making and low-density it reads.
  const { isLowDensity, losesMoney } = remoteRouteSubsidyEligibility(true, true, true);
  const result = evaluateSubsidyDay(null, isLowDensity, losesMoney, 100);
  assert(result === null, "an island route is never offered a subsidy through the full evaluateSubsidyDay pipeline, even when it would otherwise qualify on density and loss");
}
{
  // End-to-end: an ALREADY-accepted subsidy on a route later reclassified
  // as an island (or simply caught by this fix after already running)
  // decays via the normal warn-then-withdraw grace path, the same path a
  // genuinely recovered journey takes — not an abrupt cliff, and crucially
  // not a subsidy that keeps paying out indefinitely (the real bug).
  const accepted: SubsidyRecord = { state: "accepted", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: null };
  const { isLowDensity, losesMoney } = remoteRouteSubsidyEligibility(true, true, true); // genuinely low-density AND genuinely losing money on its own numbers
  const warned = evaluateSubsidyDay(accepted, isLowDensity, losesMoney, 200);
  assert(warned !== null && warned.state === "withdrawal_warned", "an island route's already-accepted subsidy starts decaying (warned) rather than continuing to pay out forever, even while its own raw numbers still look genuinely loss-making");
  const withdrawn = evaluateSubsidyDay(warned, isLowDensity, losesMoney, 200 + WITHDRAWAL_WARNING_GRACE_DAYS);
  assert(withdrawn !== null && withdrawn.state === "withdrawn", "and is fully withdrawn once the grace period elapses, never resuming (losesMoney is forced false by the island exclusion on every subsequent day too)");
}

// --- journeyProfitGBPPence / journeyLosesMoney ---
{
  // 10 miles at the flagged 150p/mile placeholder = 1500p running cost.
  const breakEven = journeyProfitGBPPence({ revenueGBPPence: 1500, distanceMiles: 10 });
  assert(breakEven === 0, `revenue exactly matching the flagged running cost breaks even, got ${breakEven}`);
}
{
  const loss = journeyProfitGBPPence({ revenueGBPPence: 1000, distanceMiles: 10 });
  assert(loss === -500, `revenue short of running cost is a genuine loss, got ${loss}`);
  assert(journeyLosesMoney({ revenueGBPPence: 1000, distanceMiles: 10 }) === true, "a negative profit counts as losing money");
}
{
  const profit = journeyProfitGBPPence({ revenueGBPPence: 2000, distanceMiles: 10 });
  assert(profit === 500, `revenue above running cost is a genuine profit, got ${profit}`);
  assert(journeyLosesMoney({ revenueGBPPence: 2000, distanceMiles: 10 }) === false, "a positive profit does not count as losing money");
}
assert(RUNNING_COST_PER_MILE_GBP_PENCE === 150, "flagged running-cost placeholder is £1.50/mile");

// --- subsidyTopUpGBPPence (break-even shape, cannot be gamed) ---
{
  const topUp = subsidyTopUpGBPPence({ revenueGBPPence: 1000, distanceMiles: 10 });
  assert(topUp === 500, `top-up exactly covers the loss (break-even, no margin), got ${topUp}`);
  const afterTopUp = 1000 + topUp;
  const cost = 10 * RUNNING_COST_PER_MILE_GBP_PENCE;
  assert(afterTopUp === cost, "revenue plus top-up lands exactly at the real running cost — zero profit, zero further loss");
}
assert(subsidyTopUpGBPPence({ revenueGBPPence: 2000, distanceMiles: 10 }) === 0, "a genuinely profitable journey gets no top-up at all");

// --- evaluateSubsidyDay: the full offer/accept/decline/withdrawal state machine ---

// No existing record, route not low-density: no offer.
assert(evaluateSubsidyDay(null, false, true, 100) === null, "a busy route never gets offered a subsidy, even if a journey is genuinely losing money");

// No existing record, low-density but profitable: no offer.
assert(evaluateSubsidyDay(null, true, false, 100) === null, "a low-density route with a profitable journey gets no offer — it only ever applies to a genuine loss");

// No existing record, low-density AND losing: fresh offer.
{
  const result = evaluateSubsidyDay(null, true, true, 100);
  assert(result !== null && result.state === "offered" && result.offeredGameDay === 100, "a low-density, genuinely loss-making journey gets offered automatically");
}

// A pending offer that's no longer justified (route improved, or no
// longer losing) is retracted outright, no grace period (nothing was ever
// granted).
{
  const offered: SubsidyRecord = { state: "offered", offeredGameDay: 100, decidedGameDay: null, warningStartedGameDay: null };
  const retracted = evaluateSubsidyDay(offered, true, false, 105);
  assert(retracted === null, "an unanswered offer is retracted immediately once the journey stops losing money — no warning needed");
  const retractedByDensity = evaluateSubsidyDay(offered, false, true, 105);
  assert(retractedByDensity === null, "an unanswered offer is also retracted if the route stops being low-density");
}

// A pending offer that's still justified stays pending (waiting on the
// player, not auto-accepted).
{
  const offered: SubsidyRecord = { state: "offered", offeredGameDay: 100, decidedGameDay: null, warningStartedGameDay: null };
  const stillOffered = evaluateSubsidyDay(offered, true, true, 110);
  assert(stillOffered !== null && stillOffered.state === "offered", "a still-justified pending offer stays pending, it is never auto-accepted");
}

// acceptOffer / declineOffer
{
  const offered: SubsidyRecord = { state: "offered", offeredGameDay: 100, decidedGameDay: null, warningStartedGameDay: null };
  const accepted = acceptOffer(offered, 102);
  assert(accepted.state === "accepted" && accepted.decidedGameDay === 102, "accepting a pending offer moves it to accepted with the real decision day recorded");
  let threw = false;
  try {
    acceptOffer(accepted, 103);
  } catch {
    threw = true;
  }
  assert(threw, "accepting an already-accepted record throws — not a real game state the UI should ever produce");

  const offered2: SubsidyRecord = { state: "offered", offeredGameDay: 100, decidedGameDay: null, warningStartedGameDay: null };
  const declined = declineOffer(offered2, 102);
  assert(declined.state === "declined" && declined.decidedGameDay === 102, "declining a pending offer records the real decision day");
}

// An accepted subsidy keeps paying while the journey keeps losing money.
{
  const accepted: SubsidyRecord = { state: "accepted", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: null };
  const stillAccepted = evaluateSubsidyDay(accepted, true, true, 200);
  assert(stillAccepted !== null && stillAccepted.state === "accepted", "an accepted subsidy keeps paying as long as the journey keeps genuinely losing money");
}

// An accepted subsidy that stops losing money gets WARNED, not withdrawn
// outright — DESIGN.md's own "it doesn't vanish the instant performance
// improves" rule, implemented as a real state transition.
{
  const accepted: SubsidyRecord = { state: "accepted", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: null };
  const warned = evaluateSubsidyDay(accepted, true, false, 200);
  assert(warned !== null && warned.state === "withdrawal_warned" && warned.warningStartedGameDay === 200, "an accepted subsidy that stops being needed moves to withdrawal_warned, not straight to withdrawn");
}

// A warning cancels if the journey dips back into a genuine loss before
// the grace period elapses — the subsidy resumes rather than lapsing.
{
  const warned: SubsidyRecord = { state: "withdrawal_warned", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: 200 };
  const resumed = evaluateSubsidyDay(warned, true, true, 205);
  assert(resumed !== null && resumed.state === "accepted" && resumed.warningStartedGameDay === null, "a journey that dips back into a loss during the warning window cancels the warning and resumes paying");
}

// A warning that's still within its grace period stays warned.
{
  const warned: SubsidyRecord = { state: "withdrawal_warned", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: 200 };
  const stillWarned = evaluateSubsidyDay(warned, true, false, 200 + WITHDRAWAL_WARNING_GRACE_DAYS - 1);
  assert(stillWarned !== null && stillWarned.state === "withdrawal_warned", "a warning still inside its grace period stays warned, not yet withdrawn");
}

// A warning that reaches the end of its grace period, still not losing
// money, is finally withdrawn.
{
  const warned: SubsidyRecord = { state: "withdrawal_warned", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: 200 };
  const withdrawn = evaluateSubsidyDay(warned, true, false, 200 + WITHDRAWAL_WARNING_GRACE_DAYS);
  assert(withdrawn !== null && withdrawn.state === "withdrawn", `a warning that survives the full ${WITHDRAWAL_WARNING_GRACE_DAYS}-day grace period is finally withdrawn, got ${withdrawn?.state}`);
}

// Declined/withdrawn journeys are eligible for a fresh automatic offer if
// the route resumes genuinely needing one (flagged judgement call, see
// the module's own header comment).
{
  const declined: SubsidyRecord = { state: "declined", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: null };
  const reOffered = evaluateSubsidyDay(declined, true, true, 300);
  assert(reOffered !== null && reOffered.state === "offered" && reOffered.offeredGameDay === 300, "a previously-declined journey gets a fresh automatic offer if it resumes genuinely losing money on a low-density route");

  const stillDeclined = evaluateSubsidyDay(declined, true, false, 300);
  assert(stillDeclined !== null && stillDeclined.state === "declined", "a declined journey that still isn't losing money stays declined, unchanged");

  const withdrawn: SubsidyRecord = { state: "withdrawn", offeredGameDay: 100, decidedGameDay: 102, warningStartedGameDay: 150 };
  const reOfferedAfterWithdrawal = evaluateSubsidyDay(withdrawn, true, true, 400);
  assert(reOfferedAfterWithdrawal !== null && reOfferedAfterWithdrawal.state === "offered", "a previously-withdrawn journey also gets a fresh automatic offer if it resumes genuinely losing money");
}

console.log("\nAll remote-route-subsidy checks passed.");
