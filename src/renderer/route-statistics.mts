// Route statistics (DESIGN.md §2/§11, Phase 4, plan #12 of the approved
// 2026-11-15 batch). Confirmed spec, OPEN-ITEMS.md verbatim: "a menu to
// see route statistics so i can adjust routes to be more efficient,"
// covering all four of — load factor (passengers vs capacity), revenue
// and cost per mile/journey, punctuality/on-time performance, and
// passengers carried vs passengers who gave up waiting (the last one
// comes directly from the two-tier passenger simulation's own give-up
// tracking, passenger-simulation.mts's evaluateTripOutcome).
//
// Of the four, two have NO real tracked data anywhere in this codebase
// today — confirmed by reading it directly, not assumed:
//
//  - Cost per mile: no fuel/energy/maintenance running-cost figure exists
//    anywhere (VEHICLE-SPECS.md has no such figure; Phase 8 "Maintenance"
//    and Phase 9's fuel/energy work are both still unbuilt per CLAUDE.md's
//    own build order). NOT computed here — genuinely nothing real to
//    divide by miles. Revenue per mile IS real (below) and stands in for
//    this half of the metric; the panel must show cost as an explicit
//    "not tracked yet" gap, never a fabricated figure.
//
//  - Punctuality/on-time performance: every simulated vehicle moves
//    exactly according to its own published timetable offsets
//    (vehicle-position.mts's computeVehiclePosition) with zero real-time
//    delay/variance model layered on top — confirmed by reading
//    vehicle-simulation.ts directly, which has no lateness/delay tracking
//    of any kind, and OPEN-ITEMS.md's own "398 running-time decision"
//    entry, which records that a time-of-day traffic multiplier was
//    deliberately DROPPED rather than kept. Comparing "scheduled" to
//    "actual" today would trivially always read 100% on time by
//    construction — not a real statistic, just a disguised constant. Not
//    computed here at all; genuinely a Phase 5 gap (DESIGN.md already
//    lists Punctuality as Phase 5, not yet built), flagged rather than
//    faked.
//
// Load factor and carried-vs-gave-up ARE real, but needed new counters
// added to vehicle-simulation.ts's own tick loop — it previously computed
// both figures and then immediately discarded them. See
// RouteStatsAccumulator below; its two real update call sites are
// tryGenerateOnePassenger's own outcome branch and the processStopVisit
// call site, both in vehicle-simulation.ts.
//
// Revenue per mile IS real, built from the existing finance ledger
// (window.finance.list, DESIGN.md §10) — but that ledger only ever tags
// an entry with a free-text description ("Route 52 fares",
// vehicle-simulation.ts's own literal template string), not a structured
// routeId field (FinanceTransaction, depot-groups.d.ts, has no such
// field). This module parses that known, fixed format rather than
// guessing at a structured link that doesn't exist — flagged as a
// documented parsing workaround: the format is produced entirely by this
// codebase's own code, not player-entered text, so it is a stable shape
// to match against, not a guess.

// --- Load factor and carried-vs-gave-up (needs live instrumentation) -----

export interface RouteStatsAccumulator {
  tripsCarried: number;
  tripsGaveUp: number;
  boardedCount: number;
  leftBehindCount: number;
  // Sum, across every real stop visit, of "how many were actually on
  // board right after boarding" and "how much capacity was on offer at
  // that exact visit" — load factor is the ratio of these two running
  // totals, not an average of per-visit percentages (which would weight a
  // near-empty midnight journey the same as a packed rush-hour one).
  onBoardAfterBoardingSum: number;
  capacityOfferedSum: number;
}

export function emptyRouteStatsAccumulator(): RouteStatsAccumulator {
  return { tripsCarried: 0, tripsGaveUp: 0, boardedCount: 0, leftBehindCount: 0, onBoardAfterBoardingSum: 0, capacityOfferedSum: 0 };
}

// Called once per generated trip attempt whose first ride leg resolves to
// THIS route (vehicle-simulation.ts's own tryGenerateOnePassenger) — a
// trip with no route at all (RAPTOR found no path anywhere) is a genuine
// network gap, not attributable to any one route, so it never reaches
// this function; only a trip that COULD have used this route (travelled
// on it, or gave up waiting specifically for it) counts here.
export function recordTripOutcome(acc: RouteStatsAccumulator, travelled: boolean): void {
  if (travelled) acc.tripsCarried++;
  else acc.tripsGaveUp++;
}

// Called once per real stop visit (vehicle-simulation.ts's own
// processStopVisit call site) — onBoardAfterBoarding is the vehicle's own
// real onBoard.length straight after that visit's boarding finished.
export function recordStopVisit(acc: RouteStatsAccumulator, onBoardAfterBoarding: number, capacity: number, boardedCount: number, leftBehindCount: number): void {
  acc.onBoardAfterBoardingSum += onBoardAfterBoarding;
  acc.capacityOfferedSum += capacity;
  acc.boardedCount += boardedCount;
  acc.leftBehindCount += leftBehindCount;
}

// null when no stop visit has ever been recorded for this route yet — the
// same "can't do it sensibly, don't fake it" convention this session's
// other new modules already use (e.g. passenger-simulation.mts's own null
// returns), rather than a misleading 0%.
export function loadFactorPercent(acc: RouteStatsAccumulator): number | null {
  if (acc.capacityOfferedSum === 0) return null;
  return (acc.onBoardAfterBoardingSum / acc.capacityOfferedSum) * 100;
}

// null when no trip attempt has ever been recorded for this route yet.
export function giveUpRatePercent(acc: RouteStatsAccumulator): number | null {
  const total = acc.tripsCarried + acc.tripsGaveUp;
  if (total === 0) return null;
  return (acc.tripsGaveUp / total) * 100;
}

// --- Route distance (straight-line, same flagged simplification already
// used elsewhere in this codebase) and revenue per mile ------------------

export interface RoutePoint {
  lon: number;
  lat: number;
}

// Same small flat-plane approximation this session's other pure modules
// each keep their own copy of (passenger-simulation.mts, vehicle-
// position.mts) rather than importing a DOM-adjacent module's version —
// reasonable at route-length scale.
function approxDistanceM(a: RoutePoint, b: RoutePoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon - a.lon);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

const METRES_PER_MILE = 1609.344;

// Straight-line sum between consecutive route points, not the real
// road-snapped distance — the exact same flagged simplification
// vehicle-simulation.ts's own tryGenerateOnePassenger already uses for
// fare-quoting distance ("Straight-line distance between the two real
// stops, not the full real road distance travelled along the route — a
// deliberate, flagged simplification"), reused here for consistency
// rather than introducing a second, different approximation.
export function routeOneWayDistanceMiles(points: readonly RoutePoint[]): number {
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += approxDistanceM(points[i - 1], points[i]);
  return metres / METRES_PER_MILE;
}

export interface FareRevenueTransaction {
  category: string;
  description: string;
  amountGBPPence: number;
}

// Matches vehicle-simulation.ts's own exact, literal description template
// for a fare-revenue ledger entry: `Route ${route.number} fares`.
const FARE_REVENUE_DESCRIPTION_PATTERN = /^Route (.+) fares$/;

// Sums every real "Fare revenue" ledger entry whose description names
// this exact route number. Not a structured lookup (none exists — see
// this file's own header) but not a guess either: the format is produced
// entirely by this codebase's own code, so matching it exactly is a
// documented workaround for a real missing structured field, not
// approximated data.
export function revenueForRouteGBPPence(routeNumber: string, transactions: readonly FareRevenueTransaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.category !== "Fare revenue") continue;
    const match = FARE_REVENUE_DESCRIPTION_PATTERN.exec(t.description);
    if (match && match[1] === routeNumber) total += t.amountGBPPence;
  }
  return total;
}

// null when the route has no real measurable length yet (fewer than 2
// points) — dividing by a zero/negative distance would be meaningless,
// not just technically undefined.
export function revenuePerMileGBPPence(totalRevenueGBPPence: number, oneWayDistanceMiles: number): number | null {
  if (oneWayDistanceMiles <= 0) return null;
  return totalRevenueGBPPence / oneWayDistanceMiles;
}

// --- Combined per-route statistics, the one shape the panel actually
// renders ------------------------------------------------------------

export interface RouteStatistics {
  routeId: number;
  routeNumber: string;
  loadFactorPercent: number | null;
  totalRevenueGBPPence: number;
  oneWayDistanceMiles: number;
  revenuePerMileGBPPence: number | null;
  giveUpRatePercent: number | null;
  tripsCarried: number;
  tripsGaveUp: number;
  boardedCount: number;
  leftBehindCount: number;
  // null when the route has no real timetable at all yet — see
  // computePeakVehicleRequirement's own null-return convention below.
  peakVehicleRequirement: PeakVehicleRequirement | null;
}

// --- Peak vehicle requirement (PVR) — how many vehicles a route genuinely
// needs to run its own timetable, and the same broken down by vehicle-type
// lock per depot group. Scoped and confirmed directly with the user
// (2026-11-16): round-trip time + headway -> vehicles, max across bands
// (not summed), no spares margin (no real maintenance-downtime data
// exists to base one on — deferred, cheap to add later), per-depot total
// broken down by real vehicle-type lock rather than one flat number.
//
// Real-data correction made while building this, flagged rather than
// silently followed: the brief that produced this module assumed a real
// stored "minimum wait/layover" figure already exists per variation
// (pointing at variation-padding.mts's own VariationLeg.minWaitSeconds).
// Checked directly — it does NOT. `padVariationsToLongestCycle` is a pure
// algorithm built ahead of a UI/data model that was never finished (its
// own header comment says so explicitly: "before any data model or UI
// exists to drive it"); grepping the real `Route`/`RouteTimetable`
// ambient types (depot-groups.d.ts) and every production call site
// confirms it is never actually invoked outside its own verify file. So
// there is no real minimum-wait number anywhere to add. Round-trip time
// here is instead read entirely from each timetable component's own REAL
// PUBLISHED departureOffsetsSeconds — which already reflects whatever
// real timing-point padding the player has actually set (including
// today's peak/standard split), rather than a parallel, never-wired
// figure. This is more honest than the brief's own assumption, not a
// shortcut around it.
export interface PvrTimeBand {
  intervalMinutes: number;
}

export interface PvrTimetable {
  weekdayMask: number;
  direction: "both" | "outbound" | "inbound";
  timeBands: readonly PvrTimeBand[];
  departureOffsetsSeconds: readonly number[];
}

export interface PvrRoute {
  points: readonly RoutePoint[];
  // null for an ordinary route (direction is reversal-symmetric by
  // convention, route-orientation.ts) — set for a terminus loop, whose
  // outbound leg is points[0..terminusIndex] and whose inbound leg is a
  // genuinely different points[startIndex..last] (DESIGN.md §6).
  terminusIndex: number | null;
  startIndex: number | null;
}

// One timetable component's own real one-way duration — the real
// published figure at that leg's own real final point, not recomputed
// from scratch (so any real timing-point padding is already included).
function componentDurationSeconds(route: PvrRoute, tt: PvrTimetable): number {
  const endIndex = tt.direction === "outbound" && route.terminusIndex !== null ? route.terminusIndex : route.points.length - 1;
  return tt.departureOffsetsSeconds[endIndex] ?? 0;
}

// Real round-trip seconds for one weekday-mask GROUP of a route's own
// timetable components. A genuine outbound+inbound pair (a terminus loop,
// which per T159 always has both, never "both" — or an ordinary route the
// player has deliberately split per DESIGN.md §6/T159's own "useful if
// running from multiple depots" case) sums their two real, independently
// published durations directly — no doubling needed, they're already two
// real halves. Otherwise (the common case: one "both" component covering
// an ordinary there-and-back route) doubles that component's own real
// one-way duration — the same "reverse traversal is the other direction"
// symmetric convention route-orientation.ts already documents, applied
// here rather than invented fresh.
function roundTripSecondsForGroup(route: PvrRoute, group: readonly PvrTimetable[]): number | null {
  if (group.length === 0) return null;
  const outbound = group.find((t) => t.direction === "outbound");
  const inbound = group.find((t) => t.direction === "inbound");
  if (outbound && inbound) return componentDurationSeconds(route, outbound) + componentDurationSeconds(route, inbound);
  const single = group.find((t) => t.direction === "both") ?? outbound ?? inbound ?? group[0];
  return componentDurationSeconds(route, single) * 2;
}

export interface PeakVehicleRequirement {
  vehicles: number;
  roundTripSeconds: number;
  busiestIntervalMinutes: number;
}

// The route's own real peak vehicle requirement: the MAXIMUM across every
// real time band on every real timetable component (grouped by
// weekdayMask, since a Saturday schedule's own round-trip time can
// genuinely differ from a weekday one if the player has set different
// timing-point padding for each) — not a sum across bands, and not a
// single flat figure. Returns null when the route has no real timetable
// at all yet (same "can't tell, don't fake it" convention as this
// module's other null returns) or when every band has a non-positive
// interval (nothing real to divide by).
export function computePeakVehicleRequirement(route: PvrRoute, timetables: readonly PvrTimetable[]): PeakVehicleRequirement | null {
  if (timetables.length === 0) return null;
  const weekdayMasks = [...new Set(timetables.map((t) => t.weekdayMask))];
  let best: PeakVehicleRequirement | null = null;
  for (const mask of weekdayMasks) {
    const group = timetables.filter((t) => t.weekdayMask === mask);
    const roundTripSeconds = roundTripSecondsForGroup(route, group);
    if (roundTripSeconds === null || roundTripSeconds <= 0) continue;
    for (const tt of group) {
      for (const band of tt.timeBands) {
        if (band.intervalMinutes <= 0) continue;
        const vehicles = Math.ceil(roundTripSeconds / (band.intervalMinutes * 60));
        if (!best || vehicles > best.vehicles) best = { vehicles, roundTripSeconds, busiestIntervalMinutes: band.intervalMinutes };
      }
    }
  }
  return best;
}

// --- Per-depot breakdown by real vehicle-type lock ------------------------
//
// Confirmed with the user: a depot's total must be broken down by
// required vehicle type, not summed into one flat number, since a route
// locked to (say) electric single-deckers and another locked to coaches
// aren't interchangeable. There is no generic "what vehicle type does
// this route require" classification anywhere in this codebase — the
// real locks that exist today are each hand-written per livery in
// livery-seed-data.mts (the coach-only branch inside
// liveryVehicleLockReason, and ScotRail's own category+power check,
// scotRailVehicleReason, which isn't driven by livery name alone so it's
// special-cased here the same way the rest of this codebase already
// special-cases ScotRail/398 everywhere else, rather than invented as a
// fake generic framework). LIVERY_SPECIFIC_ROUTE is reused in reverse
// (route number -> its one locked livery, where one exists) rather than
// duplicated. A route with no real lock at all buckets as "unrestricted".
const COACH_ONLY_LIVERY_NAMES = new Set([
  "Citylink",
  "MegaBus",
  "National Express",
  "National Express Scottish",
  "National Express Welsh",
  "Citylink/West Coast Motors",
  "Irish Citylink",
]);

export function vehicleRequirementBucketForRoute(routeNumber: string, liverySpecificRoute: Readonly<Record<string, string>>): string {
  // ScotRail/398's real lock is category+power (scotRailVehicleReason),
  // not purely livery-name-driven like every other entry below — same
  // special case this codebase's own livery-seed-data.mts already makes
  // for it elsewhere, not a guess.
  if (routeNumber === "398") return "Single-deckers/midibuses, electric (ScotRail)";
  for (const [liveryName, lockedRouteNumber] of Object.entries(liverySpecificRoute)) {
    if (lockedRouteNumber !== routeNumber) continue;
    if (COACH_ONLY_LIVERY_NAMES.has(liveryName)) return "Coaches";
  }
  return "unrestricted";
}

export interface DepotVehicleRequirement {
  bucket: string;
  vehicles: number;
  routeNumbers: readonly string[];
}

export interface DepotRouteForPvr extends PvrRoute {
  id: number;
  number: string;
  depotGroupId: number;
}

// One entry per real bucket actually present among this depot group's own
// routes — a depot with no routes locked to any real vehicle type returns
// a single "unrestricted" entry, not an empty list pretending there's no
// requirement at all.
export function computeDepotVehicleRequirements(
  depotGroupId: number,
  routes: readonly DepotRouteForPvr[],
  timetablesByRouteId: ReadonlyMap<number, readonly PvrTimetable[]>,
  liverySpecificRoute: Readonly<Record<string, string>>,
): DepotVehicleRequirement[] {
  const byBucket = new Map<string, DepotVehicleRequirement>();
  for (const route of routes) {
    if (route.depotGroupId !== depotGroupId) continue;
    const result = computePeakVehicleRequirement(route, timetablesByRouteId.get(route.id) ?? []);
    if (!result) continue;
    const bucket = vehicleRequirementBucketForRoute(route.number, liverySpecificRoute);
    const existing = byBucket.get(bucket);
    if (existing) {
      existing.vehicles += result.vehicles;
      (existing.routeNumbers as string[]).push(route.number);
    } else {
      byBucket.set(bucket, { bucket, vehicles: result.vehicles, routeNumbers: [route.number] });
    }
  }
  return [...byBucket.values()];
}

export function computeRouteStatistics(
  route: { id: number; number: string; points: readonly RoutePoint[]; terminusIndex: number | null; startIndex: number | null },
  accumulator: RouteStatsAccumulator | undefined,
  transactions: readonly FareRevenueTransaction[],
  timetables: readonly PvrTimetable[],
): RouteStatistics {
  const acc = accumulator ?? emptyRouteStatsAccumulator();
  const oneWayDistanceMiles = routeOneWayDistanceMiles(route.points);
  const totalRevenueGBPPence = revenueForRouteGBPPence(route.number, transactions);
  return {
    routeId: route.id,
    routeNumber: route.number,
    loadFactorPercent: loadFactorPercent(acc),
    totalRevenueGBPPence,
    oneWayDistanceMiles,
    revenuePerMileGBPPence: revenuePerMileGBPPence(totalRevenueGBPPence, oneWayDistanceMiles),
    giveUpRatePercent: giveUpRatePercent(acc),
    tripsCarried: acc.tripsCarried,
    tripsGaveUp: acc.tripsGaveUp,
    boardedCount: acc.boardedCount,
    leftBehindCount: acc.leftBehindCount,
    peakVehicleRequirement: computePeakVehicleRequirement(route, timetables),
  };
}
