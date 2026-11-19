// Two-tier passenger simulation (DESIGN.md §2 "Passengers — two tier"),
// Phase 4, plan #6 of the approved 2026-11-15 batch. The model only — NOT
// wired into the live vehicle tick loop (that's plan #9, "a bus carries a
// passenger and earns money"), and does not touch vehicle-simulation.ts at
// all (a separate fix is concurrently in progress there).
//
// DESIGN.md §2 verbatim: "Individual passengers with an origin and
// destination, making multi-leg journeys and changing buses where
// necessary. That cannot be simulated at national scale, so it runs at two
// tiers: Agent tier — individual passengers, near the camera. Statistical
// tier — aggregate flows everywhere else. Both must produce identical
// revenue and loading figures."
//
// The reconciliation design: there is only ONE generation model
// (`generateTripOutcome` below) — "agent" vs "statistical" is never two
// separate computations that then need rectifying, it's a tag applied
// AFTER the fact to a trip this same model already generated, based on
// whether the caller (which knows about the camera — this module
// deliberately doesn't) considers it "near the camera" right now. Picking
// that tag can even change tick to tick as the camera moves, with zero
// effect on the trip's own already-decided outcome/revenue/loading —
// satisfying "both must produce identical figures" BY CONSTRUCTION rather
// than by a reconciliation step, which is the only way to make that
// requirement provably true rather than merely usually true. See
// `tallyByTier` for the accounting side of this.
//
// Passenger TYPES (adult/child/concession/student, DESIGN.md §8) are
// deliberately not modelled here — that's plan #7, the next item in this
// batch. Every generated trip is a single generic passenger; the shapes
// below are built so a `type` field can be added to `GeneratedTrip`/
// `TierAccounting` later without reshaping anything (passenger count
// becomes passenger count split by type, same structure, not a redesign).
import { demandWeightFor, type DemandCategory, type DemandPoint } from "./landuse-demand.mts";

// --- Demand generation -------------------------------------------------

// DESIGN.md §2 "Demand": "Varies through the day — commuter peaks, quiet
// evenings and nights." No precise curve is given anywhere in the spec —
// this is an explicitly flagged placeholder shape (two commute peaks
// around 08:00 and 17:00, a quiet trough overnight), not a sourced
// figure, same convention as this project's own `KERB_OFFSET_M`/
// `landuse-demand.mts`'s own category weights. Revisit once DESIGN.md §2
// is itself expanded with real numbers.
export function timeOfDayDemandMultiplier(secondsSinceMidnight: number): number {
  const hour = (secondsSinceMidnight / 3600) % 24;
  const peak = (centreHour: number, widthHours: number, height: number): number => {
    const d = Math.min(Math.abs(hour - centreHour), 24 - Math.abs(hour - centreHour));
    return height * Math.exp(-(d * d) / (2 * widthHours * widthHours));
  };
  const morningPeak = peak(8, 1.5, 1.0);
  const eveningPeak = peak(17, 1.5, 1.0);
  const baseline = 0.15; // demand never truly hits zero — night buses, shift workers
  return Math.min(1.0, baseline + morningPeak + eveningPeak);
}

// Real-world dominant trip purposes per origin category — Housing pairs
// mostly with Workplaces (the commute) and, to a lesser extent, Schools
// (school run) and Retail (shopping); the other three categories pair
// mostly back with Housing (the return leg of the same trip purposes).
// Matches `landuse-demand.mts`'s own existing comment ("Workplaces and
// Housing are each other's real commute counterpart") — extended here to
// a full affinity table since picking a DESTINATION category needs one.
// Explicitly a placeholder, not a sourced figure — same flag as every
// other weight in this feature so far.
export const CATEGORY_DESTINATION_AFFINITY: Readonly<Record<DemandCategory, Readonly<Partial<Record<DemandCategory, number>>>>> = {
  Housing: { Workplaces: 1.0, Schools: 0.5, Retail: 0.6 },
  Workplaces: { Housing: 1.0 },
  Schools: { Housing: 1.0 },
  Retail: { Housing: 1.0 },
};

// Picks one item from `items` by relative weight, given a single random
// number in [0, 1) — a plain weighted-choice primitive kept generic and
// side-effect-free (the caller supplies the random number) specifically
// so this stays deterministic and testable without mocking a real RNG.
export function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rand: number): T | null {
  let total = 0;
  for (const item of items) total += weight(item);
  if (total <= 0) return null;
  let target = rand * total;
  for (const item of items) {
    target -= weight(item);
    // Strict `<`, not `<=`: at the exact boundary (target lands on 0 after
    // subtracting a zero-weight item), a zero-weight item must never be
    // the one returned — it has to keep falling through to the next real
    // candidate, the same as it would for any other target value.
    if (target < 0) return item;
  }
  return items[items.length - 1] ?? null;
}

export interface OriginDestinationPair {
  origin: DemandPoint;
  destination: DemandPoint;
}

// --- Localised demand (2026-11-15 live fix) -------------------------------
//
// Real measured problem, found during plan #9's own live verification:
// origin/destination points were picked uniformly from the WHOLE of Great
// Britain's land-use dataset (1,033,134 points), while a typical save has
// only a few hundred real stops concentrated in one or two small areas. A
// direct sample found only 0.42% of demand points within walking distance
// of any real stop — so a random pair landing near a stop on BOTH ends
// happened roughly once per 57,000 attempts, effectively starving a small,
// realistic early-game network of any visible passenger activity at all.
//
// User's own fix request, verbatim: "journeys should be localised unless
// using long distance so that a tiny network still has demand." Trip
// generation has no idea which route (if any) will end up serving a trip —
// an origin/destination pair is picked FIRST, then handed to the journey
// planner afterwards — so "unless using long distance" can't mean "check
// the route before generating." It means the GENERATION process itself
// should produce mostly local trips by default, with a smaller, separate
// proportion of genuinely far-apart trips mixed in (the only kind a real
// `long_distance`-category route — National Express, Citylink, AIR, etc. —
// could ever actually serve). `pickTripOriginDestination` itself is left
// completely unchanged below; localisation works by restricting WHICH
// points it's given to choose from, decided by the caller.
export interface StopLocation {
  lon: number;
  lat: number;
}

// Reuses the exact distance the real RAPTOR planner itself already
// enforces for a walk leg (`journey_planner.rs`'s own `MAX_WALK_M = 600.0`,
// the same figure this module's own `ACCESS_EGRESS_TOLERANCE_M` further
// down already mirrors for the same reason) rather than inventing a
// separate "local" radius: a demand point further than this from EVERY
// real stop can never actually produce a `found: true` plan anyway, so
// filtering to it isn't an arbitrary tightening, it's skipping candidates
// that were always going to fail. Written as its own literal, not a
// reference to `ACCESS_EGRESS_TOLERANCE_M` (declared later in this file),
// to avoid a forward-reference — kept in sync by the comment, not the
// compiler.
export const LOCAL_DEMAND_RADIUS_M = 600;

// Small local flat-plane approximation, same convention as every other
// pure .mts module in this codebase keeping its own copy rather than
// importing a DOM/vehicle-rendering-adjacent module's own helper (e.g.
// `vehicle-position.mts`'s `approxDistanceM`) — reasonable at the walking-
// distance scale this is used at.
function approxDistanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon - a.lon);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

// Grid cell size in plain degrees, not metres — deliberately NOT derived
// per-point from latitude (that would need a trig call per bucket lookup,
// defeating the point of bucketing at all). 0.012° is a flat, generous
// over-approximation of `LOCAL_DEMAND_RADIUS_M` everywhere in Great
// Britain's real latitude range (49.89°N-60.84°N, confirmed this session
// from the pipeline's own real production bounding box): at the
// northernmost real latitude, where a degree of longitude is shortest,
// 0.012° of longitude is still ~740m, comfortably over the 600m radius; a
// degree of latitude is ~111,320m everywhere regardless of latitude, so
// 0.012° of latitude (~1,336m) is never the tight dimension. A bucket
// being somewhat larger than strictly necessary only ever means checking a
// few extra real-distance candidates, never an incorrect result.
const GRID_CELL_DEG = 0.012;

function gridKey(lon: number, lat: number): string {
  return `${Math.floor(lon / GRID_CELL_DEG)}:${Math.floor(lat / GRID_CELL_DEG)}`;
}

// Every real stop a passenger could actually walk to, keyed into a coarse
// grid once, so checking "is any stop within radius of this demand point"
// is an O(nearby bucket contents) lookup instead of an O(stop count) scan
// repeated for every one of a potentially million demand points — this
// exact "a point-in-radius check that's fine for one call but freezes the
// game once it runs against real whole-country-scale data" shape has
// already caused two real live freezes elsewhere in this codebase this
// session (OPEN-ITEMS.md T187, T197); building the grid up front here
// avoids ever hitting a third one, rather than discovering it live.
// Generic over `T extends StopLocation` (2026-11-15, connectivity follow-up)
// so `stop-connectivity.mts`'s own component-tagged stops
// (`StopLocation & { componentId: number }`) can reuse this exact grid
// rather than a duplicate copy — existing callers passing plain
// `StopLocation[]` are unaffected, `T` just infers to `StopLocation` for
// them, same behaviour as before.
function buildStopGrid<T extends StopLocation>(stops: readonly T[]): Map<string, T[]> {
  const grid = new Map<string, T[]>();
  for (const stop of stops) {
    const key = gridKey(stop.lon, stop.lat);
    const bucket = grid.get(key);
    if (bucket) bucket.push(stop);
    else grid.set(key, [stop]);
  }
  return grid;
}

// Like `isNearAnyStop` below, but reports WHICH stop is genuinely nearest
// (tracking the minimum distance across the whole 3x3 neighbourhood,
// rather than returning on the first match) instead of a plain boolean —
// needed for `assignPointsToStopComponents`, where a boundary point
// between two different areas' stops must resolve to its real nearest
// one, not an arbitrary first-found one that happens to sit in the same
// grid bucket scan order.
function findNearestStopWithin<T extends StopLocation>(point: StopLocation, grid: Map<string, T[]>, radiusMetres: number): T | null {
  const cx = Math.floor(point.lon / GRID_CELL_DEG);
  const cy = Math.floor(point.lat / GRID_CELL_DEG);
  let best: T | null = null;
  let bestDist = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.get(`${cx + dx}:${cy + dy}`);
      if (!bucket) continue;
      for (const stop of bucket) {
        const d = approxDistanceM(point, stop);
        if (d <= radiusMetres && d < bestDist) {
          best = stop;
          bestDist = d;
        }
      }
    }
  }
  return best;
}

function isNearAnyStop(point: StopLocation, grid: Map<string, StopLocation[]>, radiusMetres: number): boolean {
  const cx = Math.floor(point.lon / GRID_CELL_DEG);
  const cy = Math.floor(point.lat / GRID_CELL_DEG);
  // The point's own cell plus all 8 neighbours — since the cell size is
  // already generously larger than the radius, a stop within radius of
  // the point can never be further away than one cell over in either
  // direction, so a 3x3 neighbourhood is always enough; no ring-expansion
  // needed (unlike a true "find the single nearest" search, this only
  // ever needs "is there at least one within range," so it can return
  // the moment it finds any match).
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.get(`${cx + dx}:${cy + dy}`);
      if (!bucket) continue;
      for (const stop of bucket) {
        if (approxDistanceM(point, stop) <= radiusMetres) return true;
      }
    }
  }
  return false;
}

// Restricts `points` to only those within `radiusMetres` of at least one
// real stop. Returns an empty array (not all of `points`) when `stops` is
// empty — same "can't do it sensibly, don't fake it" convention as
// `pickTripOriginDestination`'s own null returns: with no real stops at
// all, there is no sensible local demand to pick from.
export function filterPointsNearStops(points: readonly DemandPoint[], stops: readonly StopLocation[], radiusMetres: number): DemandPoint[] {
  if (stops.length === 0) return [];
  const grid = buildStopGrid(stops);
  return points.filter((p) => isNearAnyStop(p, grid, radiusMetres));
}

// --- Genuine connectivity (2026-11-15 follow-up) --------------------------
//
// User's own words, verbatim: "I want each area to only connect to others
// where there are genuine connections" — `filterPointsNearStops` above only
// ever answers "is this point near ANY real stop in the whole save," with
// no notion of whether that stop can actually be reached from any other
// stop. Two genuinely disconnected networks (a Skye depot group and an
// Edinburgh one, say, with no route/interchange linking them) both count
// as equally "local" today, so `pickTripOriginDestination` can and does
// pair a Skye point with an Edinburgh one — a trip that was always going
// to fail at the RAPTOR stage (`found: false`), just wastefully rather
// than usefully. `stop-connectivity.mts`'s `computeStopComponents` is the
// actual graph-connectivity computation (a plain Union-Find over real
// stop osmIds, grouped by which routes visit them); this function is just
// the same "which real stop is this demand point nearest" lookup
// `filterPointsNearStops` already does, reporting that stop's own
// component id instead of a plain yes/no. A point with no real stop
// within radius gets no entry at all — same "can't do it sensibly, don't
// fake it" convention as everywhere else in this file.
export function assignPointsToStopComponents(
  points: readonly DemandPoint[],
  stopsWithComponent: readonly (StopLocation & { componentId: number })[],
  radiusMetres: number,
): Map<DemandPoint, number> {
  const result = new Map<DemandPoint, number>();
  if (stopsWithComponent.length === 0) return result;
  const grid = buildStopGrid(stopsWithComponent);
  for (const point of points) {
    const nearest = findNearestStopWithin(point, grid, radiusMetres);
    if (nearest) result.set(point, nearest.componentId);
  }
  return result;
}

// No real figure exists anywhere in DESIGN.md for how often a generated
// trip should be a genuine long-distance attempt rather than a local one —
// same "flagged placeholder, not sourced precision" convention as this
// module's own `timeOfDayDemandMultiplier`/`CATEGORY_DESTINATION_AFFINITY`
// and `landuse-demand.mts`'s own category weights. Kept as one named,
// easily-tunable constant rather than inlined.
export const LONG_DISTANCE_ATTEMPT_PROBABILITY = 0.1;

// Picks which candidate point set a trip generation attempt should draw
// from — the small minority (`LONG_DISTANCE_ATTEMPT_PROBABILITY`) of
// attempts get the full, unrestricted point set (so a genuine long-
// distance pair is still possible, however rarely it actually finds a
// matching route), the rest get only the pre-filtered local subset. Pure
// selection logic only — the caller still passes whichever set this
// returns into the unchanged `pickTripOriginDestination` itself.
export function pickDemandPointSet(allPoints: readonly DemandPoint[], localPoints: readonly DemandPoint[], modeRand: number): readonly DemandPoint[] {
  return modeRand < LONG_DISTANCE_ATTEMPT_PROBABILITY ? allPoints : localPoints;
}

// Picks a real origin (weighted by its own demand weight) and a real
// destination (weighted by the origin's own category affinity combined
// with the destination's own demand weight) from the same real demand
// point set. Returns null only when `points` can't produce a pair at all
// (fewer than 2 points, or every candidate destination weighs 0) — the
// same "can't do it sensibly, don't fake it" convention this project uses
// throughout (`coastline-clip.mts`/`area-cluster.mts`'s own null returns).
//
// `isSameArea` (2026-11-15 follow-up, genuine-connectivity fix) — an
// optional extra filter on the DESTINATION only, defaulting to "always
// true" so every pre-existing call site/test keeps its exact original
// behaviour unchanged. `vehicle-simulation.ts`'s local-mode caller passes
// a closure comparing each point's `stop-connectivity.mts` component id,
// so a destination in a genuinely unconnected area is zero-weighted
// exactly like the "is this the origin itself" case already is, rather
// than ever being reachable by chance.
export function pickTripOriginDestination(
  points: readonly DemandPoint[],
  originRand: number,
  destinationRand: number,
  isSameArea: (origin: DemandPoint, candidate: DemandPoint) => boolean = () => true,
): OriginDestinationPair | null {
  if (points.length < 2) return null;
  const origin = pickWeighted(points, demandWeightFor, originRand);
  if (!origin) return null;
  const affinity = CATEGORY_DESTINATION_AFFINITY[origin.category];
  const destination = pickWeighted(
    points,
    (p) => (p === origin || !isSameArea(origin, p) ? 0 : demandWeightFor(p) * (affinity[p.category] ?? 0)),
    destinationRand,
  );
  if (!destination || destination === origin) return null;
  return { origin, destination };
}

// --- Journey outcome -----------------------------------------------------

// The one shape this module actually needs out of a RAPTOR plan result
// (`journey_planner.rs`'s `build_found_result`/`build_not_found_result`)
// — kept minimal and WASM-free, same convention `fare-journey.mts`'s own
// `RideLeg` already established for this exact situation, rather than
// importing the planner's own JS-boundary type.
export interface PlannedWalkLeg {
  kind: "walk";
  seconds: number;
}
export interface PlannedRideLeg {
  kind: "ride";
  routeId: number;
  boardStopOsmId: number;
  boardSeconds: number;
  alightStopOsmId: number;
  alightSeconds: number;
}
export type PlannedLeg = PlannedWalkLeg | PlannedRideLeg;
export interface JourneyPlanResult {
  found: boolean;
  legs?: PlannedLeg[];
}

// DESIGN.md §8 "Access and egress"/"Wait tolerance" — the looser rural
// figure is what the real RAPTOR planner itself already applies uniformly
// to every walk leg (`journey_planner.rs`'s own `MAX_WALK_M = 600.0`
// comment: "The looser of DESIGN.md §8's two access/wait figures... rather
// than threading an urban/rural classification through, which nothing in
// this increment's scope needs yet"). This module follows that same
// precedent for the SAME reason — urban/rural classification doesn't
// exist as a real per-stop concept anywhere in this codebase yet, so
// inventing one here, one layer up, would just be guessing at a
// distinction the planner itself already deferred.
export const ACCESS_EGRESS_TOLERANCE_M = 600;
export const WAIT_TOLERANCE_SECONDS = 30 * 60;

export type TripOutcomeReason = "no-route-found" | "wait-too-long";

export interface TripOutcome {
  travelled: boolean;
  reason: TripOutcomeReason | null;
  plan: JourneyPlanResult;
}

// DESIGN.md §8: "A passenger who would have travelled gives up and
// doesn't make the trip if the wait is too long." The real planner
// (`journey_planner.rs`) already enforces the walk-distance tolerance
// itself when building a route at all (`MAX_WALK_M` bounds every walk
// leg it will ever propose) — a `found: true` result can only exist if
// every walk leg already cleared that bound, so this module doesn't
// re-check walk distance; re-deriving it from `seconds` via
// `WALK_SPEED_MPS` would just be reconstructing a check the planner
// already made more precisely. What this module adds is the WAIT check —
// the planner has no concept of "gave up," it always returns the
// earliest-arrival route whether a real passenger would actually wait
// that long or not — so `waitSeconds` (the gap between when the
// passenger wants to leave and the plan's own first boarding/walk start)
// is the caller's to measure and pass in.
export function evaluateTripOutcome(plan: JourneyPlanResult, waitSeconds: number): TripOutcome {
  if (!plan.found) return { travelled: false, reason: "no-route-found", plan };
  if (waitSeconds > WAIT_TOLERANCE_SECONDS) return { travelled: false, reason: "wait-too-long", plan };
  return { travelled: true, reason: null, plan };
}

// --- Generated trips and two-tier accounting ------------------------------

export interface GeneratedTrip {
  origin: OriginDestinationPair["origin"];
  destination: OriginDestinationPair["destination"];
  departureSeconds: number;
  outcome: TripOutcome;
}

// Whether a generated trip counts as "agent tier" is decided entirely by
// the caller (vehicle-simulation.ts/camera code, neither of which this
// module touches or knows about) and passed in — this module has no
// notion of camera position, by design (see this file's own header: the
// outcome itself never depends on the tag).
export interface TaggedTrip extends GeneratedTrip {
  isAgentTier: boolean;
}

export interface TierAccounting {
  tripsGenerated: number;
  tripsTravelled: number;
  tripsAbandoned: number;
}

function emptyTierAccounting(): TierAccounting {
  return { tripsGenerated: 0, tripsTravelled: 0, tripsAbandoned: 0 };
}

function recordInto(acc: TierAccounting, outcome: TripOutcome): void {
  acc.tripsGenerated++;
  if (outcome.travelled) acc.tripsTravelled++;
  else acc.tripsAbandoned++;
}

export interface TierTally {
  agent: TierAccounting;
  statistical: TierAccounting;
  // The figure plan #9 (revenue/loading into depot group finances) will
  // actually consume — DESIGN.md's own "both must produce identical
  // revenue and loading figures" is satisfied here simply by summing the
  // two tiers' already-identically-generated trips, never by comparing
  // two independently-computed numbers against each other.
  combined: TierAccounting;
}

// Tallies a batch of already-generated, already-tagged trips into the
// two tiers plus their combined total. Pure aggregation — no RNG, no
// WASM, no game-clock dependency, so this is trivially testable with a
// synthetic trip list.
export function tallyByTier(trips: readonly TaggedTrip[]): TierTally {
  const agent = emptyTierAccounting();
  const statistical = emptyTierAccounting();
  const combined = emptyTierAccounting();
  for (const trip of trips) {
    recordInto(trip.isAgentTier ? agent : statistical, trip.outcome);
    recordInto(combined, trip.outcome);
  }
  return { agent, statistical, combined };
}
