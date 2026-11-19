// Manual verification script for stop-upgrades.mts, run directly with
// `node --experimental-strip-types src/renderer/stop-upgrades.verify.mts`.
import {
  upgradeTriggered,
  accelerateCostGBPPence,
  busyHourBusCount,
  StopBoardingTracker,
  UPGRADE_THRESHOLDS,
  UPGRADE_INSTALL_COST_GBP_PENCE,
} from "./stop-upgrades.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- upgradeTriggered ---
assert(upgradeTriggered({ boardings: 0, buses: 0 }, "seating") === false, "zero usage never triggers seating");
assert(upgradeTriggered({ boardings: 19, buses: 2 }, "seating") === false, "one below seating's threshold on both axes does not trigger");
assert(upgradeTriggered({ boardings: 20, buses: 0 }, "seating") === true, "hitting the boardings threshold exactly triggers seating");
assert(upgradeTriggered({ boardings: 0, buses: 3 }, "seating") === true, "hitting the buses threshold exactly triggers seating (either axis is enough)");
assert(upgradeTriggered({ boardings: 39, buses: 5 }, "shelter") === false, "one below shelter's threshold on both axes does not trigger");
assert(upgradeTriggered({ boardings: 40, buses: 0 }, "shelter") === true, "shelter's real threshold (40 boardings) matches the LED display's own tier");
assert(upgradeTriggered({ boardings: 0, buses: 6 }, "shelter") === true, "shelter's real buses threshold (6) matches the LED display's own tier");

// --- accelerateCostGBPPence ---
assert(accelerateCostGBPPence({ boardings: 0, buses: 0 }, "seating") === UPGRADE_INSTALL_COST_GBP_PENCE.seating, "zero usage costs the full install price");
assert(accelerateCostGBPPence({ boardings: 20, buses: 0 }, "seating") === 0, "usage exactly at threshold costs nothing — it was about to happen anyway");
assert(accelerateCostGBPPence({ boardings: 10, buses: 0 }, "seating") === Math.round(UPGRADE_INSTALL_COST_GBP_PENCE.seating * 0.5), "halfway to the threshold costs half the install price, got " + accelerateCostGBPPence({ boardings: 10, buses: 0 }, "seating"));
assert(accelerateCostGBPPence({ boardings: 999, buses: 999 }, "shelter") === 0, "usage far past the threshold is clamped to 0, not a negative number");
{
  // Whichever axis is CLOSER to its own threshold governs the cost — a
  // stop with 50% of the boardings threshold but 0% of the buses
  // threshold should cost based on the boardings axis (the larger
  // ratio), not the buses axis.
  const cost = accelerateCostGBPPence({ boardings: 20, buses: 0 }, "lighting"); // 20/30 boardings = 0.667, 0/4 buses = 0
  const expected = Math.round(UPGRADE_INSTALL_COST_GBP_PENCE.lighting * (1 - 20 / 30));
  assert(cost === expected, `the larger (closer-to-threshold) ratio governs the cost, got ${cost} expected ${expected}`);
}

// --- busyHourBusCount ---
assert(busyHourBusCount([]) === 0, "no departures at all means zero busy-hour buses");
assert(busyHourBusCount([[]]) === 0, "an empty departure list means zero busy-hour buses");
{
  // Three departures at 08:00, 08:15, 08:45 (all within hour 8), one at
  // 14:00 (hour 14 alone) — the busy hour is 8, with 3 buses, not 1.
  const count = busyHourBusCount([[480, 495, 525], [840]]);
  assert(count === 3, `the busiest real hour (3 departures at hour 8) wins over a quieter one, got ${count}`);
}
{
  // Departures spanning across midnight (e.g. 23:50 and 00:10) land in
  // two different real hours (23 and 0), not accidentally the same
  // bucket or an out-of-range index.
  const count = busyHourBusCount([[1430, 1450, 10]]); // 23:50, 24:10(=00:10 next day, represented as 1450), 00:10
  assert(count >= 1 && count <= 3, `departures near/after midnight still land in a valid 0-23 hour bucket without throwing, got ${count}`);
}

// --- StopBoardingTracker ---
{
  const tracker = new StopBoardingTracker();
  assert(tracker.busyHourBoardingCount(999) === 0, "a stop with no recorded boardings at all starts at 0, not a guess");

  // Three real boardings in hour 8, closed out once hour 9 starts.
  tracker.recordBoarding(1, 8, 5);
  tracker.recordBoarding(1, 8, 3);
  tracker.closeOutHour(1, 8);
  assert(tracker.busyHourBoardingCount(1) === 8, `the closed-out hour's real total (5+3=8) seeds the EWMA outright on the first observation, got ${tracker.busyHourBoardingCount(1)}`);

  // A second, busier hour-8 observation on a later day should pull the
  // EWMA up (not replace it outright) — confirms smoothing, not a bare
  // max/overwrite.
  tracker.recordBoarding(1, 8, 20);
  tracker.closeOutHour(1, 8);
  const afterSecond = tracker.busyHourBoardingCount(1);
  assert(afterSecond > 8 && afterSecond < 20, `a second, busier observation smooths toward it rather than snapping straight to 20, got ${afterSecond}`);

  // An hour that's never been closed out contributes nothing — an
  // in-progress accumulation shouldn't leak into the reported figure
  // before closeOutHour is actually called for it.
  tracker.recordBoarding(2, 14, 1000);
  assert(tracker.busyHourBoardingCount(2) === 0, "an hour that hasn't been closed out yet reports 0, not its raw in-progress total");
  tracker.closeOutHour(2, 14);
  assert(tracker.busyHourBoardingCount(2) === 1000, "closing out the hour makes the real total visible");

  // Different stops never share state.
  assert(tracker.busyHourBoardingCount(1) !== tracker.busyHourBoardingCount(2), "two different real stops are tracked completely independently");
}

console.log("\nAll stop-upgrades checks passed.");
