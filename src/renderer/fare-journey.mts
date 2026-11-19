// Quotes a real fare for one real `ride` leg of a RAPTOR journey-planner
// result (DESIGN.md §9, Phase 4 increment 2 — OPEN-ITEMS.md T175). Pure,
// no DOM/IPC/WASM dependency — same convention as fare-pricing.mts/
// fare-pricing-fixed.mts/route-orientation.ts, so this stays independently
// testable. `fare-pricing-fixed.mts` already has every fixed-figure
// formula DESIGN.md §9 specifies; this module decides WHICH of those
// formulas applies to one real leg, something nothing in the codebase did
// before this.
//
// Originally scoped narrow, matching T173's own "prove the simple case,
// expand later" approach to RAPTOR: one leg, Single, Adult only. Plan #8
// (2026-11-15, Phase 4 batch) removed the Return and multi-leg-NETWORK
// gaps (`quoteReturnFareGBPPence`/`quoteJourneyFareGBPPence` below) and
// Child is handled by `passenger-types.mts`'s `fareForPassengerType`,
// layered on top of this module's own Adult figures rather than
// duplicated in here. Capping itself (day/week accumulated spend) is its
// own stateful module, `fare-capping.mts` — genuinely a different kind of
// concern (persisted state across many journeys) from this file's own
// pure per-journey quoting, kept separate rather than merged in.
import {
  AIRPORT_EXPRESS_RETURN_GBP_PENCE,
  AIRPORT_EXPRESS_SINGLE_GBP_PENCE,
  CITY_SINGLE_GBP_PENCE,
  cityNightSingleFareGBPPence,
  countryOrIslandNightSingleFareGBPPence,
  countryOrIslandSingleFareGBPPence,
  countryZoneCountNightSingleFareGBPPence,
  countryZoneCountSingleFareGBPPence,
  returnFareGBPPence,
} from "./fare-pricing-fixed.mts";

export type RouteZoneType = "city" | "country" | "island";

// The one shape this module actually needs out of a RAPTOR `ride` leg
// (journey_planner.rs's `build_found_result`) — kept minimal rather than
// importing the planner's own JS-boundary leg shape, since this module
// must stay WASM-free.
export interface RideLeg {
  kind: "ride";
  routeId: number;
  boardStopOsmId: number;
  alightStopOsmId: number;
}

const METRES_PER_MILE = 1609.344;

// Plain ray-casting point-in-polygon test (odd-even rule) — a third,
// deliberate copy of the same loop that already exists twice
// (`electron/db.mts`'s `pointInFareZoneRing`, main-process-only since
// main/renderer are separate bundles there; `fare-zone-drawing.ts`'s own
// `pointInRing`, a large UI-mounting module this one must stay independent
// of). Matches this codebase's own established precedent for this exact
// situation rather than inventing a new one.
function pointInZoneRing(point: FareZonePoint, ring: FareZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersects = a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Every zone whose ring contains `point` — plural, since DESIGN.md's
// Town-overlapping-Country/Island rule ("whichever of the two zones is
// more expensive wins") needs both candidates visible to the caller, not
// just one.
export function zoneForPoint(point: FareZonePoint, zones: readonly FareZone[]): FareZone[] {
  return zones.filter((z) => pointInZoneRing(point, z.points));
}

// Whether a depot group is "on an island" (2026-11-15, user's own words:
// "It should be based on the fare zone type a depot is in") — gates the
// remaining island-specific rule in route-timetable.mts's
// validateTimingPoints (no separate peak-padding figure on a timing
// point; the earlier count cap at "a single timing point" was removed
// 2026-11-19, a real bug — see that function's own comment). Checked
// against the depot's own real site location (not any
// route's drawn points), reusing the exact same zoneForPoint this file
// already uses for touchesIsland fare pricing — a depot group with no
// depot yet, or whose depot's point falls inside no drawn zone at all, is
// NOT treated as an island (same "can't tell, don't block" convention
// used throughout this codebase) — only a depot genuinely sitting inside
// a real zone typed "island" triggers the restriction. A depot group with
// more than one depot is island only if its FIRST depot is (matching
// "the fare zone type A depot is in," singular, rather than requiring
// every depot to agree — a depot group with depots split across a
// mainland/island boundary is a real edge case nothing else in this
// codebase handles specially either).
export function isIslandDepotGroup(depotGroupId: number, depots: readonly { depotGroupId: number; lon: number; lat: number }[], zones: readonly FareZone[]): boolean {
  const depot = depots.find((d) => d.depotGroupId === depotGroupId);
  if (!depot) return false;
  return zoneForPoint(depot, zones).some((z) => z.zoneType === "island");
}

// DESIGN.md §9 "City-only vs Country buses": "a route counts as City-only
// if it never leaves the city zones (A/B) anywhere along its length, and
// counts as Country the moment it leaves the city zones at all, even
// once" — a ROUTE-level classification, not read off any one passenger's
// journey, checked directly against the route's own drawn points.
// Island is geometrically exclusive with City/Country (DESIGN.md: "an
// Island zone can never share land with a City or Country zone"), so any
// point found inside an Island zone settles the non-city case as Island
// rather than Country. A route point with no matching zone at all (a gap
// in the player's own zone drawing) counts as leaving the city, same as a
// point explicitly in a non-city zone — DESIGN.md's rule is "never leaves
// the city zones," not "never enters a different one."
export function classifyRouteZoneType(route: Route, zones: readonly FareZone[]): RouteZoneType {
  let cityOnly = true;
  let sawIsland = false;
  for (const point of route.points) {
    const matches = zoneForPoint(point, zones);
    if (!matches.some((z) => z.zoneType === "city")) cityOnly = false;
    if (matches.some((z) => z.zoneType === "island")) sawIsland = true;
  }
  if (cityOnly) return "city";
  return sawIsland ? "island" : "country";
}

// A "logical" fare zone can be more than one DB row — DESIGN.md's real
// Lothian reference shows zones that aren't a clean concentric ring at all
// (e.g. Zone B drawn as two separate pieces flanking Zone A on either
// side, Zone C next to those, rather than one ring fully encircling A).
// This codebase already has exactly this shape: `mergeFareZone`
// (electron/db.mts) makes a second row adopt a target's name/zoneType/
// colour with no other linking id, so two (or more) rows sharing
// `(depotGroupId, zoneType, name)` ARE one logical zone split into
// pieces — the same identity `zonesToGeojson`'s own duplicate-label
// dedup already keys on. Every function below that cares about zone
// IDENTITY (not just "is this point in some zone or other") groups by
// this key first, so a journey touching two pieces of a split zone counts
// as reaching it once, and both pieces get the same letter.
function logicalZoneKey(z: FareZone): string {
  return `${z.depotGroupId}:${z.zoneType}:${z.name}`;
}

function groupByLogicalZone(zones: readonly FareZone[]): Map<string, FareZone[]> {
  const groups = new Map<string, FareZone[]>();
  for (const z of zones) {
    const key = logicalZoneKey(z);
    const pieces = groups.get(key);
    if (pieces) pieces.push(z);
    else groups.set(key, [z]);
  }
  return groups;
}

function centroidOfPoints(points: readonly FareZonePoint[]): FareZonePoint {
  return {
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
  };
}

function distanceBetween(a: FareZonePoint, b: FareZonePoint): number {
  const dLon = a.lon - b.lon;
  const dLat = a.lat - b.lat;
  return Math.sqrt(dLon * dLon + dLat * dLat);
}

// Shoelace formula — plain polygon area, same "no geometry library, this
// is simple enough not to need one" convention as this file's own
// pointInZoneRing.
function ringArea(points: readonly FareZonePoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.lon * b.lat - b.lon * a.lat;
  }
  return Math.abs(area) / 2;
}

function logicalZoneArea(pieces: readonly FareZone[]): number {
  return pieces.reduce((sum, p) => sum + ringArea(p.points), 0);
}

function minIdOf(pieces: readonly FareZone[]): number {
  return Math.min(...pieces.map((p) => p.id));
}

// How close this zone's own boundary gets to `reference`, at its closest
// point — not a centroid-to-centroid distance. A plain centroid distance
// would tie every ring of a perfectly concentric set at ~0 (each ring's
// own centroid sits at roughly the same point as every other ring's), so
// it can't actually order inner-vs-outer at all. The nearest-point
// distance instead measures each zone's own INNER edge, which grows
// correctly outward ring by ring, and also generalises to a zone drawn as
// several pieces flanking the centre rather than fully encircling it
// (confirmed 2026-11-13: real Lothian zones aren't always a clean ring —
// Zone B can be two pieces either side of Zone A) — whichever piece comes
// closest represents that band's own inner edge.
function minDistanceToReference(pieces: readonly FareZone[], reference: FareZonePoint): number {
  let min = Infinity;
  for (const piece of pieces) {
    for (const p of piece.points) {
      const d = distanceBetween(p, reference);
      if (d < min) min = d;
    }
  }
  return min;
}

// Automatic nesting letter (A, B, C...) for City/Country fare zones,
// confirmed 2026-11-12/13 (DESIGN.md's own "Zone A"/"Zone B" language had
// no backing in the data model until this): ordered by distance from the
// City zone's own centre — nearest band is A, next is B, and so on, one
// continuous sequence across City and Country together, not two separate
// alphabets. Island and Town never get a letter. The reference point is
// the smallest-area City zone's own centroid (preferred over any
// same-or-smaller Country zone, so the City hub always anchors the system
// when one exists); if a depot group somehow has Country zones but no
// City zone at all, falls back to the smallest eligible zone overall as
// the most likely "centre" candidate, rather than this pure module
// needing live stop/station data to resolve a real main bus station.
// Scoping to one depot group's own zones is the caller's job, same
// convention as zoneForPoint/classifyRouteZoneType. The returned map is
// keyed by every individual row id (not the logical key), so a caller
// holding one `FareZone` row — of a split zone or not — can always look
// its own letter up directly.
export function computeZoneLetters(zonesInOneDepotGroup: readonly FareZone[]): Map<number, string> {
  const eligible = zonesInOneDepotGroup.filter((z) => z.zoneType === "city" || z.zoneType === "country");
  const logicalZones = [...groupByLogicalZone(eligible).values()];
  if (logicalZones.length === 0) return new Map();

  const cityZones = logicalZones.filter((pieces) => pieces[0].zoneType === "city");
  const anchorCandidates = cityZones.length > 0 ? cityZones : logicalZones;
  const anchor = [...anchorCandidates].sort((a, b) => logicalZoneArea(a) - logicalZoneArea(b) || minIdOf(a) - minIdOf(b))[0];
  const referencePoint = centroidOfPoints(anchor.flatMap((p) => p.points));

  const ordered = [...logicalZones].sort(
    (a, b) => minDistanceToReference(a, referencePoint) - minDistanceToReference(b, referencePoint) || minIdOf(a) - minIdOf(b),
  );
  const letters = new Map<number, string>();
  ordered.forEach((pieces, i) => {
    const letter = String.fromCharCode(65 + i);
    for (const piece of pieces) letters.set(piece.id, letter);
  });
  return letters;
}

// classifyRouteZoneType's sibling — a route can cross between City A and
// City B (DESIGN.md: "no combined A+B fare," but still one route, two
// zones), so the UI needs to know which it actually touches, not just the
// type. Island/Town zones are never included (they never get a letter).
// Deduplicates by logical zone, so a route touching both pieces of a
// split zone shows that zone once, not twice.
export function zonesServedByRoute(route: Route, zones: readonly FareZone[]): FareZone[] {
  const seen = new Map<string, FareZone>();
  for (const point of route.points) {
    for (const z of zoneForPoint(point, zones)) {
      if (z.zoneType === "city" || z.zoneType === "country") {
        const key = logicalZoneKey(z);
        if (!seen.has(key)) seen.set(key, z);
      }
    }
  }
  return [...seen.values()];
}

// The leg's own stretch of the route, board to alight inclusive — real
// Lothian Country pricing is per PASSENGER JOURNEY, not per whole route (a
// long Country route might span 6 lettered bands end to end, but a
// passenger riding between two stops both inside one band only crosses 1
// zone). Picks the FIRST occurrence of each stop's osmId at/after the
// other — correct for a simple linear route; a there-and-back/terminus-
// loop route where a stop is served twice (once each direction) could, in
// a rare case, pick the wrong occurrence. Flagged, not solved here — the
// same "simple case first" scope narrowing T173/T175 already used
// elsewhere; resolving it properly needs the matched timetable's own
// board/alight *times* to disambiguate, not just the route's static points.
function legPointRange(route: Route, boardStopOsmId: number, alightStopOsmId: number): RoutePoint[] | null {
  const boardIdx = route.points.findIndex((p) => p.osmId === boardStopOsmId);
  if (boardIdx === -1) return null;
  const alightIdx = route.points.findIndex((p, i) => i >= boardIdx && p.osmId === alightStopOsmId);
  if (alightIdx === -1) return null;
  return route.points.slice(boardIdx, alightIdx + 1);
}

// DESIGN.md's real zone-count rule (confirmed 2026-11-12 against
// reference/Fares & Tickets - Lothian Countrry.pdf): the City (A and/or B
// together) counts as ONE unit toward the total, never two even when both
// are touched; each distinct Country LOGICAL zone touched beyond that adds
// one more — a split zone's two pieces (e.g. Zone B flanking Zone A on
// either side) count once, not twice, same as everywhere else in this file
// that counts zones by identity rather than by row. Returns 0 when the leg
// touches no letter-eligible zone at all — the caller's signal to fall
// back to the real-distance formula instead ("distance when there are no
// zones").
function countZonesForLeg(points: readonly RoutePoint[], zones: readonly FareZone[]): number {
  let touchesCity = false;
  const countryZoneKeysTouched = new Set<string>();
  for (const p of points) {
    for (const z of zoneForPoint(p, zones)) {
      if (z.zoneType === "city") touchesCity = true;
      else if (z.zoneType === "country") countryZoneKeysTouched.add(logicalZoneKey(z));
    }
  }
  return (touchesCity ? 1 : 0) + countryZoneKeysTouched.size;
}

// What an Adult Single costs for one real `ride` leg. `distanceMetres` is
// the real routed distance between the leg's board and alight points
// (Router.last_route_distance_m(), T175) — only consulted for Island and
// for a Country leg that touches no drawn fare zone at all; a zoned
// Country leg now prices by the real zone-count table instead (T175
// follow-up, confirmed 2026-11-12 — see countryZoneCountSingleFareGBPPence's
// own header comment for why the distance formula was superseded here).
export function quoteSingleFareGBPPence(leg: RideLeg, route: Route, zones: readonly FareZone[], distanceMetres: number): number {
  if (route.id !== leg.routeId) throw new Error(`leg routeId ${leg.routeId} does not match the given route ${route.id}`);

  if (route.routeType === "airport_express") return AIRPORT_EXPRESS_SINGLE_GBP_PENCE;
  // OPERATIONS.md §7 / depot-groups.d.ts's own RouteType comment: staff
  // routes are free, with no fare-pricing panel section at all — unlike
  // every other RouteType here. The approved plan for this increment
  // lumped "ordinary/staff" into one zone-priced bucket; corrected here
  // while implementing, since charging a fare class that doesn't exist
  // for this route type would be the kind of unrealistic figure CLAUDE.md's
  // "every figure the player reads stays realistic" rules out.
  if (route.routeType === "staff") return 0;
  if (route.routeType === "long_distance" || route.routeType === "sightseeing") {
    throw new Error(`quoteSingleFareGBPPence does not support route type "${route.routeType}" yet — it is player-set, not part of the fixed-figure model`);
  }

  const points = legPointRange(route, leg.boardStopOsmId, leg.alightStopOsmId);
  if (!points) throw new Error(`leg's board/alight stop osmId not found among route ${route.id}'s own points`);

  const isNight = route.routeType === "night";
  const zoneType = classifyRouteZoneType(route, zones);

  if (zoneType === "city") {
    return isNight ? cityNightSingleFareGBPPence() : CITY_SINGLE_GBP_PENCE;
  }

  const miles = distanceMetres / METRES_PER_MILE;

  // Island always stays on the per-mile formula — no real zone-count
  // precedent for it (DESIGN.md's reference table is Country-only).
  const touchesIsland = points.some((p) => zoneForPoint(p, zones).some((z) => z.zoneType === "island"));
  if (touchesIsland) {
    return isNight ? countryOrIslandNightSingleFareGBPPence(miles) : countryOrIslandSingleFareGBPPence(miles);
  }

  const zoneCount = countZonesForLeg(points, zones);
  if (zoneCount === 0) {
    // No drawn fare zone over this stretch at all — distance is the only
    // figure available, same fallback the pre-zone-count model always used.
    return isNight ? countryOrIslandNightSingleFareGBPPence(miles) : countryOrIslandSingleFareGBPPence(miles);
  }
  return isNight ? countryZoneCountNightSingleFareGBPPence(zoneCount) : countryZoneCountSingleFareGBPPence(zoneCount);
}

// Removes the "Return" gap this module's own header used to flag. DESIGN.md
// §9's "Return" paragraph: "1.6x a single, rounded up to the nearest 5p,
// except Airport Express which has its own fixed Return instead of
// following this ratio" — confirmed already implemented as
// `returnFareGBPPence`/`AIRPORT_EXPRESS_RETURN_GBP_PENCE` in
// fare-pricing-fixed.mts; this is just the one wiring point that decides
// which applies, the same split `quoteSingleFareGBPPence` already makes
// for Airport Express above.
export function quoteReturnFareGBPPence(leg: RideLeg, route: Route, zones: readonly FareZone[], distanceMetres: number): number {
  if (route.routeType === "airport_express") return AIRPORT_EXPRESS_RETURN_GBP_PENCE;
  return returnFareGBPPence(quoteSingleFareGBPPence(leg, route, zones, distanceMetres));
}

// Removes the "multi-leg NETWORK composition" gap this module's own header
// used to flag (the phrase names one gap, not two separate ones — a
// passenger's own connecting journey across several `ride` legs needs ONE
// total Single fare). DESIGN.md §9 gives no through-ticket/interchange
// discount for a connecting Single journey anywhere (checked: "NETWORK" is
// a separately-PURCHASED all-inclusive pass product, priced off the
// Combined Day/Weekly figures, not a per-journey composition rule for a
// Single — and the "Ticket families" list treats Single/Return/Day/
// Weekly/LATE/NETWORK as distinct products a passenger chooses between,
// never blends). So a connecting Single's real total is simply the sum of
// each ride leg's own already-correct Single fare — what actually makes
// repeated multi-leg travel affordable in this game's own fare model is
// automatic CAPPING (`fare-capping.mts`), not a discount baked into this
// sum. `legs` must all belong to routes the caller has already resolved
// (one `Route` per distinct `routeId` touched) — this module stays
// WASM/DOM-free, so it can't resolve a routeId to a Route itself.
export function quoteJourneyFareGBPPence(legs: readonly RideLeg[], routesById: ReadonlyMap<number, Route>, zones: readonly FareZone[], distanceMetresForLeg: (leg: RideLeg) => number): number {
  let total = 0;
  for (const leg of legs) {
    const route = routesById.get(leg.routeId);
    if (!route) throw new Error(`no route supplied for leg's own routeId ${leg.routeId}`);
    total += quoteSingleFareGBPPence(leg, route, zones, distanceMetresForLeg(leg));
  }
  return total;
}
