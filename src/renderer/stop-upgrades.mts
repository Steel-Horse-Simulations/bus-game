// Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9 redesign: stop
// ownership dropped, replaced with council-triggered upgrades...",
// 2026-11-16). The user's own words, questioning the pre-existing
// buy-a-stop-for-upgrades model: "if I never own the stops I think we
// need to re think this, maybe it's a council upgrade when a stop gets a
// certain usage but I can pay a percentage to have it done earlier?"
//
// Pure logic only, no DOM/IPC — same split this codebase already uses for
// stop-crowding.mts/passenger-simulation.mts. The caller
// (vehicle-simulation.ts's own refresh/tick loop) feeds real observations
// in and calls into `window.stopUpgrades` (electron/db.mts) to persist a
// trigger or an accelerated purchase.
//
// Shelter/seating/lighting are council-funded in the public interest
// regardless of operator, so they trigger automatically once a stop's own
// busy-hour bus/boarding counts cross a threshold — reusing the SAME real
// metric OPERATIONS.md §16 already defines for the E-ink/LED stop-display
// mechanic (busiest-hour bus count AND boarding count, not daily
// totals). That display mechanic itself was never actually built in code
// (confirmed by searching the renderer directly — OPERATIONS.md documents
// it, nothing implements it) — this module is the first real
// implementation of a busy-hour-threshold check in this codebase, not a
// reuse of existing counting code, flagged honestly rather than silently
// assumed to exist.
//
// Real-world research was too thin for sourced figures (unlike leasing/
// stop-fees/stand-rental, which had real numbers this session) — every
// threshold and cost below is an EXPLICITLY FLAGGED ESTIMATE, scaled off
// the real E-ink (£1,200 install/£15 per month) and LED (£4,500/£45 per
// month) display figures, confirmed directly with the user and revised
// once already ("passenger numbers for upgrades are a bit low").
//
// Route advertising is deliberately NOT part of this mechanic at all — the
// user's own correction: "The route advertising should be only bought by
// the player, never by the stop owner." It has no busy-hour threshold and
// no pay-to-accelerate; see livery/route-advertising's own module (a
// separate, parallel piece of work) for that.

export type StopUpgradeType = "seating" | "lighting" | "shelter";

export interface BusyHourUsage {
  boardings: number;
  buses: number;
}

export interface UpgradeThreshold {
  boardings: number;
  buses: number;
}

// Revised 2026-11-16 from an earlier, too-low first pass — shelter now
// lands in the same real tier as the LED display's own threshold (over 6
// busy-hour buses or over 40 boardings, OPERATIONS.md §16), rather than
// sitting below even the display mechanic's "no display at all" band.
export const UPGRADE_THRESHOLDS: Record<StopUpgradeType, UpgradeThreshold> = {
  seating: { boardings: 20, buses: 3 },
  lighting: { boardings: 30, buses: 4 },
  shelter: { boardings: 40, buses: 6 },
};

export const UPGRADE_INSTALL_COST_GBP_PENCE: Record<StopUpgradeType, number> = {
  seating: 30_000, // £300
  lighting: 90_000, // £900
  shelter: 350_000, // £3,500
};

// Seating has no ongoing cost at all (a bench needs no billed upkeep) —
// confirmed directly in the settled design, not an oversight.
export const UPGRADE_MONTHLY_COST_GBP_PENCE: Record<StopUpgradeType, number> = {
  seating: 0,
  lighting: 1_000, // £10
  shelter: 2_500, // £25
};

// Whether a stop's own real current usage has crossed an upgrade's
// threshold — either axis (boardings OR buses) is enough, matching the
// real E-ink/LED table's own "over 6 buses OR over 40 boardings" shape
// rather than requiring both.
export function upgradeTriggered(usage: BusyHourUsage, upgradeType: StopUpgradeType): boolean {
  const threshold = UPGRADE_THRESHOLDS[upgradeType];
  return usage.boardings >= threshold.boardings || usage.buses >= threshold.buses;
}

// How much the player pays to have an upgrade installed RIGHT NOW instead
// of waiting for it to trigger naturally. Settled formula (OPEN-ITEMS.md):
// `cost = install_price × (1 − current_usage ÷ threshold)` — free right at
// the threshold (it was about to happen anyway), the full install price at
// zero usage, linear between. Usage is measured as whichever axis
// (boardings or buses) is CLOSER to its own threshold, since that's the
// axis actually governing how soon the council would act on its own —
// clamped to [0, 1] so an already-triggered stop (upgradeTriggered ===
// true) always costs exactly 0, never a negative number.
export function accelerateCostGBPPence(usage: BusyHourUsage, upgradeType: StopUpgradeType): number {
  const threshold = UPGRADE_THRESHOLDS[upgradeType];
  const boardingsRatio = threshold.boardings > 0 ? usage.boardings / threshold.boardings : 0;
  const busesRatio = threshold.buses > 0 ? usage.buses / threshold.buses : 0;
  const ratio = Math.min(1, Math.max(boardingsRatio, busesRatio));
  return Math.round(UPGRADE_INSTALL_COST_GBP_PENCE[upgradeType] * (1 - ratio));
}

// --- Real busy-hour computation ------------------------------------------

// Real generated departure-minutes lists for whichever timetable
// components the CALLER has already determined call at a given stop
// (vehicle-simulation.ts already resolves, per route, which of its real
// points are stops and which timetables apply — this module doesn't
// re-derive route/stop membership, just counts hours from departures it's
// handed). Kept as a plain number array, not a Route/RouteTimetable
// import, so this stays unit-testable without the full save/IPC surface —
// same dependency-free convention `stop-connectivity.mts` established for
// route shapes.
export type DepartureMinutesList = readonly number[];

// Busy-hour BUS count at a real stop: the maximum, across the 24 hours of
// a day, of how many real timetabled departures (from any route calling
// there) fall in that hour. This is schedule-derived and deterministic —
// not a live-simulated quantity — since a route's own published
// timetable already tells you exactly how many buses are due each hour,
// the same real fact a council would look at when deciding whether a stop
// has earned a shelter.
export function busyHourBusCount(departureMinutesLists: readonly DepartureMinutesList[]): number {
  const hourCounts = new Array<number>(24).fill(0);
  for (const list of departureMinutesLists) {
    for (const minutes of list) {
      const hour = Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
      hourCounts[hour] += 1;
    }
  }
  return Math.max(0, ...hourCounts);
}

// --- Real busy-hour BOARDING tracking (live, per hour-of-day) ------------

interface HourBoardingBucket {
  // Running total of real boardings observed at this stop during the
  // CURRENT in-progress hour (reset to 0 the moment play moves into a new
  // hour) — not an EWMA itself; see `average` below for the tracked
  // figure across real history.
  currentHourTotal: number;
  currentHourIndex: number | null;
  // EWMA of each REAL completed hour's own final total (seeded by the
  // first completed hour, not blended into a fabricated zero baseline) —
  // same "placeholder smoothing rate, no design doc gives a real one"
  // convention `stop-crowding.mts`'s own EWMA_ALPHA already established.
  average: number | undefined;
  samples: number;
}

export const BOARDING_EWMA_ALPHA = 0.2;

export class StopBoardingTracker {
  private readonly buckets = new Map<number, HourBoardingBucket[]>();

  private bucketsFor(stopOsmId: number): HourBoardingBucket[] {
    let perStop = this.buckets.get(stopOsmId);
    if (!perStop) {
      perStop = Array.from({ length: 24 }, () => ({ currentHourTotal: 0, currentHourIndex: null, average: undefined, samples: 0 }));
      this.buckets.set(stopOsmId, perStop);
    }
    return perStop;
  }

  // Feeds one real boarding event in, at the given hour-of-day (0-23).
  // Closes out and EWMAs the PREVIOUS hour's real total the first time a
  // different hour is seen for that bucket, rather than needing a
  // separate periodic "tick" call — callers only ever call this when a
  // real boarding genuinely happens, which is already infrequent enough
  // (once per real stop visit) that there's no performance reason to
  // batch it.
  recordBoarding(stopOsmId: number, hourOfDay: number, boardedCount: number): void {
    if (boardedCount <= 0) return;
    const hours = this.bucketsFor(stopOsmId);
    const bucket = hours[hourOfDay];
    if (bucket.currentHourIndex !== null && bucket.currentHourIndex !== hourOfDay) {
      // A different hour has started since this bucket last accumulated
      // — shouldn't normally happen (hourOfDay selects the bucket
      // already), kept only as a defensive reset if a caller ever reuses
      // a bucket across a day boundary in a way that doesn't re-key by
      // hour. Not expected to fire in real use.
      bucket.currentHourTotal = 0;
    }
    bucket.currentHourTotal += boardedCount;
    bucket.currentHourIndex = hourOfDay;
  }

  // Closes out the current hour's running total into the real EWMA
  // average for that hour-of-day, and starts a fresh running total.
  // Callers should call this once per real stop, once per real hour
  // boundary crossed (vehicle-simulation.ts's own 30s refresh already has
  // a natural place to check "has the hour changed since last refresh"
  // for every stop with any accumulated total).
  closeOutHour(stopOsmId: number, hourOfDay: number): void {
    const hours = this.bucketsFor(stopOsmId);
    const bucket = hours[hourOfDay];
    if (bucket.currentHourIndex !== hourOfDay) return; // nothing accumulated this hour
    bucket.average = bucket.average === undefined ? bucket.currentHourTotal : bucket.average + BOARDING_EWMA_ALPHA * (bucket.currentHourTotal - bucket.average);
    bucket.samples += 1;
    bucket.currentHourTotal = 0;
    bucket.currentHourIndex = null;
  }

  // The real busy-HOUR boarding count for this stop: the maximum tracked
  // EWMA across all 24 real hours, or 0 if nothing has ever been
  // recorded (a brand-new stop correctly starts at 0 usage, not a guess).
  busyHourBoardingCount(stopOsmId: number): number {
    const hours = this.buckets.get(stopOsmId);
    if (!hours) return 0;
    let max = 0;
    for (const bucket of hours) {
      if (bucket.average !== undefined && bucket.average > max) max = bucket.average;
    }
    return max;
  }
}
