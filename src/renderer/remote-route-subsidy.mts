// Subsidies for remote/rural routes the player builds (OPEN-ITEMS.md
// "Contracts redesign", settled 2026-11-19; DESIGN.md §10 "Subsidies for
// remote and rural routes", formerly folded into "Council contracts").
//
// This REPLACES the old council-contracts bidding mechanic (councils
// advertise a brand-new route, the player bids by drawing it, judged on
// cost-per-passenger) — dropped outright, confirmed directly by the user:
// "I don't think council contracts make sense as I can't remember why
// they were first implemented, I think subsidies for remote routes I
// make us the better option." This module builds the real thing that
// replaces it: a genuinely simple per-journey top-up on a route the
// player already designed and runs themselves, not a contract — no
// bidding, no cost-per-passenger target, no failure penalty.
//
// Pure logic only, no DOM/IPC — same split this codebase already uses for
// stop-upgrades.mts/passenger-simulation.mts. The caller
// (vehicle-simulation.ts's own tick loop) feeds real observations in and
// calls into `window.remoteRouteSubsidy` (electron/db.mts) to persist a
// decision.
//
// --- Eligibility: low passenger density along the route -----------------
//
// Confirmed directly with the user, piece by piece: scope is "remote/
// rural routes only, not every route" (chosen over "any of my routes, any
// losing journey"), and the eligibility rule is "low passenger density
// along the route" (chosen over reusing the existing island-only
// classification, `isIslandDepotGroup` in fare-journey.mts, or leaving the
// rule to this module's own judgement).
//
// There is no "remote/rural" classification anywhere in this codebase
// today beyond islands — checked directly. So this is a genuinely new
// rule, built from real data already in the game rather than invented:
// `StopBoardingTracker.busyHourBoardingCount` (stop-upgrades.mts) is
// already computed live from the two-tier passenger simulation, per real
// stop. Applying it per-stop along a route and averaging is the obvious
// real source, exactly as flagged in OPEN-ITEMS.md's own entry for this
// redesign.
//
// JUDGEMENT CALL (flagged, not confirmed by the user): the threshold used
// is the Seating tier's own real threshold from the stop-upgrade table
// (OPERATIONS.md §16) — 20 busy-hour boardings — applied to the ROUTE's
// own AVERAGE per-stop busy-hour boardings, not the maximum. This is a
// deliberate difference from the stop-upgrade mechanic itself (which
// checks each stop independently, MAX of either axis) — the question
// here is whether the ROUTE as a whole is quiet, not whether any single
// stop on it happens to be busy, so a route with one busy interchange and
// a string of near-empty rural stops should still read as low-density
// overall. Average-of-boardings-only (not buses) is used because buses-
// per-hour is set by the player's own timetable choice, not a measure of
// real demand — using it here would let a route "earn" ineligibility
// simply by running more frequently, the wrong direction for an
// eligibility gate. Revisit this choice if it proves too generous or too
// strict once real play-tested.
export const LOW_DENSITY_AVERAGE_BOARDINGS_THRESHOLD = 20;

// A route with no real stop-boarding data at all (brand new, or the
// busy-hour tracker hasn't accumulated anything yet) reads as low-density
// by default — same "can't tell, don't block" convention `fare-journey.mts`
// already uses for island detection (a depot that can't be classified is
// NOT treated as an island, i.e. the safe default is the one that doesn't
// block a real mechanic). Here the safe default runs the other way: an
// unmeasured route defaulting to ELIGIBLE only means a quiet-looking
// early/late journey might get offered a subsidy sooner than strictly
// justified — a false positive the player can simply decline, not a
// false negative that silently withholds help from a genuinely remote
// route still building up its own real boarding history.
export function isLowDensityRoute(perStopBusyHourBoardings: readonly number[]): boolean {
  if (perStopBusyHourBoardings.length === 0) return true;
  const average = perStopBusyHourBoardings.reduce((sum, n) => sum + n, 0) / perStopBusyHourBoardings.length;
  return average < LOW_DENSITY_AVERAGE_BOARDINGS_THRESHOLD;
}

// --- Island/lifeline exclusion ---------------------------------------------
//
// FIXED 2026-11-19 — flagged as a real gap when this module was first
// built, then confirmed as a live bug by the user directly: "Skye having
// a lifeline services still needs an amount paid to it per mile to keep
// it running." A genuine island depot group's route already has its own
// correct, distinct payment model (DESIGN.md "Payment model" under
// "Remote depots and lifeline contracts": the council takes ALL fare
// revenue, the operator is instead paid a fixed rate per mile that scales
// with isolation — zero farebox risk either way) — a fundamentally
// different shape from this module's break-even-top-up-on-a-losing-
// journey mechanic. A lifeline route will almost always also read as
// low-density by `isLowDensityRoute` above, so without this exclusion it
// would incorrectly also get offered a subsidy on top of (or instead of)
// its real lifeline payment. No lifeline-contract payment code exists
// anywhere in this codebase today (confirmed directly) — building that
// real per-mile model is a separate, larger Phase 9 piece of work, not
// attempted here; this only ever SUBTRACTS a route from subsidy
// eligibility, it never substitutes the real lifeline payment in its
// place.
//
// The caller (vehicle-simulation.ts) determines `isIslandRoute` via
// `isIslandDepotGroup` (fare-journey.mts) — the only real island/remote
// classification that exists in code today. This ONLY catches genuine
// islands: DESIGN.md's own lifeline-area table ("Island and remote-area
// review") also lists mainland remote areas (Ullapool, Campbeltown,
// Caithness, Fort William, Galashiels) with no equivalent classification
// anywhere in code yet — those remain a known, not-yet-closable gap
// (a mainland lifeline route would still incorrectly qualify here)
// rather than something to guess a classification for.
//
// Both signals are forced to the "not eligible / not currently needed"
// reading for an island route, not just blocking a fresh offer — this
// makes every branch of evaluateSubsidyDay below behave correctly without
// needing its own island-aware special case: a pending "offered" record
// is retracted immediately (nothing granted yet); an already-"accepted"
// record decays via the ordinary warn-then-withdraw grace path (the SAME
// path a genuinely recovered journey takes), rather than either vanishing
// abruptly or — the real bug — continuing to pay out indefinitely.
export function remoteRouteSubsidyEligibility(isIslandRoute: boolean, isLowDensity: boolean, losesMoney: boolean): { isLowDensity: boolean; losesMoney: boolean } {
  if (isIslandRoute) return { isLowDensity: false, losesMoney: false };
  return { isLowDensity, losesMoney };
}

// --- Loss detection -------------------------------------------------------
//
// Real per-journey REVENUE already exists in this codebase (every real
// boarding posts to the "Fare revenue" finance category,
// vehicle-simulation.ts, summed per route by route-statistics.mts's own
// `revenueForRouteGBPPence`). Real per-journey RUNNING COST does not —
// confirmed directly by reading route-statistics.mts's own header comment
// ("no fuel/energy/maintenance running-cost figure exists anywhere...
// Phase 8 'Maintenance' and Phase 9's fuel/energy work are both still
// unbuilt"), VEHICLE-SPECS.md (no such figure anywhere in it), and
// vehicle-simulation.ts itself (only "Fare revenue", "Stand rental" and
// "Stop upkeep" are ever posted — no running-cost category exists at
// all). This is a genuine gap, not something this module can honestly
// invent a precise figure for.
//
// FLAGGED ESTIMATE, same convention stop-upgrades.mts already established
// for exactly this kind of gap (explicitly-flagged placeholder figures,
// not silently-assumed-real ones): a flat running cost per mile, covering
// fuel/energy and an allowance for maintenance wear ONLY — it deliberately
// excludes driver wages (not modelled per-journey anywhere in this
// codebase yet; Phase 6) and every other overhead. Real GB local-bus
// operating cost runs roughly £3-3.50/mile all-in, of which driver/staff
// costs are typically well over half; the remainder (fuel, maintenance,
// vehicle costs) is in the rough region of £1.40-£1.60/mile. £1.50/mile is
// used here as a single round placeholder figure for that remainder —
// NOT independently sourced the way leasing/stop-fees/stand-rental figures
// elsewhere in this session were, and should be replaced the moment a real
// per-mile running-cost figure exists anywhere in the game (Phase 8
// maintenance, Phase 9 fuel/energy).
export const RUNNING_COST_PER_MILE_GBP_PENCE = 150;

export interface JourneyEconomics {
  // Real fare revenue actually taken on this one journey instance —
  // summed from real "Fare revenue" boarding events, not estimated.
  revenueGBPPence: number;
  // The journey's own one-way distance in miles — real route geometry
  // (route-statistics.mts's routeOneWayDistanceMiles), not estimated.
  distanceMiles: number;
}

// Negative = a genuine loss on this one journey (revenue falls short of
// the flagged running-cost estimate for the miles driven).
export function journeyProfitGBPPence(economics: JourneyEconomics): number {
  const cost = Math.round(economics.distanceMiles * RUNNING_COST_PER_MILE_GBP_PENCE);
  return economics.revenueGBPPence - cost;
}

export function journeyLosesMoney(economics: JourneyEconomics): boolean {
  return journeyProfitGBPPence(economics) < 0;
}

// --- Payment shape ---------------------------------------------------------
//
// JUDGEMENT CALL (flagged): a straight BREAK-EVEN top-up — exactly the
// amount needed to bring this journey's own real profit to zero, nothing
// more. DESIGN.md's existing text (kept from before this redesign) says
// the subsidy "only applies to journeys that would otherwise lose money,
// so it cannot be gamed" — a top-up that paid any margin ABOVE break-even
// would create exactly that gameable incentive (deliberately running a
// thin, subsidy-chasing loss to extract profit from the council), so
// break-even-only is the shape that actually matches the design text's
// own stated intent, not an arbitrary simplification.
export function subsidyTopUpGBPPence(economics: JourneyEconomics): number {
  return Math.max(0, -journeyProfitGBPPence(economics));
}

// --- Subsidy offer/accept/decline/withdrawal state machine ---------------
//
// DESIGN.md's existing text (kept, narrowed to remote/rural routes by
// this redesign): offered automatically, the player accepts or declines,
// and the council warns before withdrawing if the journey stops losing
// money — it doesn't vanish the instant performance improves.
export type SubsidyState = "offered" | "accepted" | "declined" | "withdrawal_warned" | "withdrawn";

export interface SubsidyRecord {
  state: SubsidyState;
  offeredGameDay: number;
  decidedGameDay: number | null;
  // Set when an ACCEPTED subsidy stops being needed (the journey is no
  // longer losing money) and the grace-period clock starts; cleared if
  // the journey dips back into a loss before the grace period elapses.
  warningStartedGameDay: number | null;
}

// JUDGEMENT CALL (flagged): the grace period between "stopped losing
// money" and actual withdrawal. DESIGN.md names no figure. 14 days reuses
// OPERATIONS.md §16's own real "work starts 14 days after ordering"
// fitting-delay convention, already reused once this session for route
// advertising's own install delay (route-advertising, OPEN-ITEMS.md
// 2026-11-16) — the same precedent for "no sourced figure exists, reuse
// this codebase's own established real-world delay" rather than inventing
// a fresh one.
export const WITHDRAWAL_WARNING_GRACE_DAYS = 14;

function freshOffer(gameDay: number): SubsidyRecord {
  return { state: "offered", offeredGameDay: gameDay, decidedGameDay: null, warningStartedGameDay: null };
}

// The player accepts a pending offer. Throws if there is no pending offer
// to accept — a programming error in the caller, not a real game state,
// since the UI should only ever show an accept action for an "offered"
// record.
export function acceptOffer(record: SubsidyRecord, gameDay: number): SubsidyRecord {
  if (record.state !== "offered") throw new Error(`acceptOffer: record is not in the "offered" state (got "${record.state}")`);
  return { state: "accepted", offeredGameDay: record.offeredGameDay, decidedGameDay: gameDay, warningStartedGameDay: null };
}

export function declineOffer(record: SubsidyRecord, gameDay: number): SubsidyRecord {
  if (record.state !== "offered") throw new Error(`declineOffer: record is not in the "offered" state (got "${record.state}")`);
  return { state: "declined", offeredGameDay: record.offeredGameDay, decidedGameDay: gameDay, warningStartedGameDay: null };
}

// The daily (per real completed journey instance) re-evaluation. Called
// once per real completed run of a scheduled journey, not per tick — the
// caller (vehicle-simulation.ts) already finalises one real revenue/
// distance sample per completed instance, so this function is fed one
// real day's worth of evidence at a time, never a fraction of one.
//
// JUDGEMENT CALL (flagged): a journey that stops being low-density-and-
// losing BEFORE the player ever responds to an "offered" record is
// retracted immediately, with no grace period — nothing has been granted
// yet, so there's nothing to warn about withdrawing. The warn-before-
// withdraw grace period only ever applies to an ALREADY-ACCEPTED subsidy
// (DESIGN.md's own text: "warns before withdrawing IT" — "it" being the
// subsidy, which only exists once accepted).
//
// JUDGEMENT CALL (flagged, not explicitly confirmed): a "declined" or
// "withdrawn" journey is eligible for a fresh automatic offer later if it
// starts (or resumes) genuinely losing money on a low-density route —
// matching DESIGN.md's "offered automatically" as a standing, ongoing
// check rather than a one-off. An alternative reading — a player decline
// should be sticky and never re-offered — is equally defensible and not
// ruled out by the source text; flagged here as a real open question
// rather than silently picked without noting the alternative.
export function evaluateSubsidyDay(current: SubsidyRecord | null, isLowDensity: boolean, losesMoney: boolean, gameDay: number): SubsidyRecord | null {
  const eligibleForFreshOffer = isLowDensity && losesMoney;

  if (!current) {
    return eligibleForFreshOffer ? freshOffer(gameDay) : null;
  }

  switch (current.state) {
    case "offered":
      // Retract a still-pending offer the moment it's no longer justified
      // — nothing was ever paid, so there's nothing to warn about.
      return eligibleForFreshOffer ? current : null;

    case "accepted":
      if (losesMoney) return current; // keep paying, unchanged
      // No longer losing money — start (or continue) the withdrawal
      // warning grace period rather than pulling the subsidy outright.
      return { ...current, state: "withdrawal_warned", warningStartedGameDay: gameDay };

    case "withdrawal_warned": {
      if (losesMoney) {
        // Dipped back into a genuine loss before the grace period
        // elapsed — cancel the warning and resume paying, rather than
        // withdrawing a subsidy the route still genuinely needs.
        return { ...current, state: "accepted", warningStartedGameDay: null };
      }
      const warningStarted = current.warningStartedGameDay ?? gameDay;
      const graceElapsed = gameDay - warningStarted >= WITHDRAWAL_WARNING_GRACE_DAYS;
      return graceElapsed ? { ...current, state: "withdrawn", warningStartedGameDay: warningStarted } : current;
    }

    case "declined":
    case "withdrawn":
      // See the judgement call above — eligible for a fresh offer if the
      // route resumes genuinely needing one.
      return eligibleForFreshOffer ? freshOffer(gameDay) : current;
  }
}
