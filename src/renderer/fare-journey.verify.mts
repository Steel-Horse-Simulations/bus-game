// Manual verification script for fare-journey.mts, run directly with
// `node --experimental-strip-types src/renderer/fare-journey.verify.mts`
// — same pattern as journey-planner-data.verify.mts.
import {
  classifyRouteZoneType,
  computeZoneLetters,
  quoteJourneyFareGBPPence,
  quoteReturnFareGBPPence,
  quoteSingleFareGBPPence,
  zoneForPoint,
  zonesServedByRoute,
  type RideLeg,
} from "./fare-journey.mts";
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

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function route(overrides: Partial<Route> = {}): Route {
  return {
    id: 1,
    depotGroupId: 1,
    number: "1",
    points: [],
    orientation: "outbound",
    terminusIndex: null,
    startIndex: null,
    colour: "#3b82f6",
    name: null,
    pickupDropoffOverrides: [],
    timingPointIndexes: [],
    parentRouteId: null,
    variationLetter: null,
    composedFromRouteIds: [],
    hailAndRideSections: [],
    segments: [],
    routeType: "ordinary",
    isMinorVariation: false,
    assignedLiveryId: null,
    useBrandedColour: false,
    vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: null },
    ...overrides,
  };
}

function zone(overrides: Partial<FareZone> = {}): FareZone {
  return {
    id: 1,
    depotGroupId: 1,
    name: "Zone",
    zoneType: "city",
    points: [],
    colour: "#3b82f6",
    parentZoneId: null,
    ...overrides,
  };
}

const square = (x0: number, y0: number, x1: number, y1: number): FareZonePoint[] => [
  { lon: x0, lat: y0 },
  { lon: x1, lat: y0 },
  { lon: x1, lat: y1 },
  { lon: x0, lat: y1 },
];

// Adjacent (not nested) zones, laid out west to east: CITY, then three
// disjoint Country bands, then an ISLAND far away, with a TOWN nested
// inside COUNTRY_A. Every zone needs its own distinct `name` — name (not
// just id) is part of a zone's real identity now (logicalZoneKey), since
// two rows sharing a name/type/depotGroup are one merged logical zone.
const CITY = zone({ id: 1, name: "City", zoneType: "city", points: square(0, 0, 1, 1) });
const COUNTRY_A = zone({ id: 2, name: "Country A", zoneType: "country", points: square(1, 0, 2, 1) });
const COUNTRY_B = zone({ id: 3, name: "Country B", zoneType: "country", points: square(2, 0, 3, 1) });
const COUNTRY_C = zone({ id: 4, name: "Country C", zoneType: "country", points: square(3, 0, 4, 1) });
const ISLAND = zone({ id: 5, name: "Island", zoneType: "island", points: square(10, 0, 11, 1) });
const TOWN = zone({ id: 6, name: "Town", zoneType: "town", parentZoneId: 2, points: square(1.4, 0.4, 1.6, 0.6) });
const ZONES = [CITY, COUNTRY_A, COUNTRY_B, COUNTRY_C, ISLAND, TOWN];

// Genuinely nested zones (each fully inside the next), for computeZoneLetters.
const INNER_CITY = zone({ id: 101, name: "Inner City", zoneType: "city", points: square(19, 19, 21, 21) });
const OUTER_CITY = zone({ id: 102, name: "Outer City", zoneType: "city", points: square(18, 18, 22, 22) });
const OUTER_COUNTRY = zone({ id: 103, name: "Outer Country", zoneType: "country", points: square(17, 17, 23, 23) });
const NESTED_ZONES = [INNER_CITY, OUTER_CITY, OUTER_COUNTRY];

// A zone drawn as two separate pieces flanking a City zone, not a ring
// fully encircling it — the real Lothian shape confirmed 2026-11-13. Both
// pieces share the same name/type/depotGroup, so they're one logical
// "Ring" zone split in two.
const SPLIT_CITY = zone({ id: 201, name: "Split City", zoneType: "city", points: square(40, 40, 41, 41) });
const SPLIT_RING_WEST = zone({ id: 202, name: "Ring", zoneType: "country", points: square(38, 40, 40, 41) });
const SPLIT_RING_EAST = zone({ id: 203, name: "Ring", zoneType: "country", points: square(41, 40, 43, 41) });
const SPLIT_FAR_COUNTRY = zone({ id: 204, name: "Far Country", zoneType: "country", points: square(50, 40, 51, 41) });
const SPLIT_ZONES = [SPLIT_CITY, SPLIT_RING_WEST, SPLIT_RING_EAST, SPLIT_FAR_COUNTRY];

// --- classifyRouteZoneType ---
{
  const cityRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 0.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 0.8, lat: 0.8 }] });
  assert(classifyRouteZoneType(cityRoute, ZONES) === "city", "a route staying entirely within the city zone classifies as city");

  const countryRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 1.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 1.8, lat: 0.8 }] });
  assert(classifyRouteZoneType(countryRoute, ZONES) === "country", "a route never touching the city zone classifies as country");

  const islandRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 10.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 10.8, lat: 0.8 }] });
  assert(classifyRouteZoneType(islandRoute, ZONES) === "island", "a route staying within an island zone classifies as island, not country");

  const leavesCityRoute = route({
    points: [{ kind: "stop", osmId: 1, lon: 0.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 1.2, lat: 0.2 }],
  });
  assert(classifyRouteZoneType(leavesCityRoute, ZONES) === "country", "a route that leaves the city zone even once counts as country, not city");

  const outsideEveryZoneRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 0.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 50, lat: 50 }] });
  assert(
    classifyRouteZoneType(outsideEveryZoneRoute, ZONES) === "country",
    "a point matching no drawn zone at all still counts as leaving the city, not as staying city-only",
  );
}

// --- zoneForPoint: a town point returns both the town and its overlapping parent ---
{
  const matches = zoneForPoint({ lon: 1.5, lat: 0.5 }, ZONES).map((z) => z.zoneType);
  assert(matches.includes("town") && matches.includes("country"), `expected both town and country to match, got ${JSON.stringify(matches)}`);
}

// --- computeZoneLetters ---
{
  const oneCityOnly = computeZoneLetters([CITY]);
  assert(oneCityOnly.get(CITY.id) === "A", "a single City zone with nothing around it is plain A, not forced into a pair with B");

  const cityPlusCountry = computeZoneLetters([CITY, COUNTRY_A]);
  assert(
    cityPlusCountry.get(CITY.id) === "A" && cityPlusCountry.get(COUNTRY_A.id) === "B",
    `expected City=A, Country=B when depth-tied, got City=${cityPlusCountry.get(CITY.id)}, Country=${cityPlusCountry.get(COUNTRY_A.id)}`,
  );

  const nested = computeZoneLetters(NESTED_ZONES);
  assert(
    nested.get(INNER_CITY.id) === "A" && nested.get(OUTER_CITY.id) === "B" && nested.get(OUTER_COUNTRY.id) === "C",
    `expected inner=A, middle=B, outer=C, got ${JSON.stringify([...nested.entries()])}`,
  );

  const withIslandAndTown = computeZoneLetters(ZONES);
  assert(!withIslandAndTown.has(ISLAND.id), "an Island zone never gets a letter");
  assert(!withIslandAndTown.has(TOWN.id), "a Town zone never gets a letter");

  // CITY and the adjacent COUNTRY_A tie exactly on distance (they touch
  // at a shared edge) — ties break by ascending zone id, and the City
  // zone is always preferred as the anchor regardless of tie order.
  const tieBreak = computeZoneLetters([COUNTRY_B, COUNTRY_A, CITY]);
  assert(
    tieBreak.get(CITY.id) === "A" && tieBreak.get(COUNTRY_A.id) === "B" && tieBreak.get(COUNTRY_B.id) === "C",
    `expected ascending-id tie-break (1=A,2=B,3=C), got ${JSON.stringify([...tieBreak.entries()])}`,
  );

  // A zone drawn as two separate pieces flanking the City (not a ring
  // encircling it) — both pieces must get the SAME letter, one band out
  // from the City.
  const split = computeZoneLetters(SPLIT_ZONES);
  assert(
    split.get(SPLIT_CITY.id) === "A" && split.get(SPLIT_RING_WEST.id) === "B" && split.get(SPLIT_RING_EAST.id) === "B",
    `expected City=A and BOTH ring pieces=B, got ${JSON.stringify([...split.entries()])}`,
  );
}

// --- zonesServedByRoute ---
{
  const singleZoneRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 1.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 1.8, lat: 0.8 }] });
  assert(
    zonesServedByRoute(singleZoneRoute, ZONES).map((z) => z.id).join() === String(COUNTRY_A.id),
    "a route staying in one zone returns just that zone",
  );

  // Only the two nested City zones in scope here (no enclosing Country
  // zone) — a point inside the inner ring also matches the outer ring by
  // definition, so both are expected to show up together.
  const crossingCitiesRoute = route({
    points: [{ kind: "stop", osmId: 1, lon: 20, lat: 20 }, { kind: "stop", osmId: 2, lon: 18.5, lat: 18.5 }],
  });
  const served = zonesServedByRoute(crossingCitiesRoute, [INNER_CITY, OUTER_CITY]).map((z) => z.id).sort();
  assert(JSON.stringify(served) === JSON.stringify([INNER_CITY.id, OUTER_CITY.id]), `expected both nested city zones, got ${JSON.stringify(served)}`);

  const islandRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 10.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 10.8, lat: 0.8 }] });
  assert(zonesServedByRoute(islandRoute, ZONES).length === 0, "an Island route never appears in zonesServedByRoute — it only returns city/country");

  const noZoneRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 50, lat: 50 }, { kind: "stop", osmId: 2, lon: 51, lat: 51 }] });
  assert(zonesServedByRoute(noZoneRoute, ZONES).length === 0, "a route touching no zone at all returns an empty list");

  // A route touching BOTH pieces of a split zone ("Ring") shows it once,
  // not twice.
  const splitZoneRoute = route({
    points: [
      { kind: "stop", osmId: 1, lon: 39, lat: 40.5 }, // SPLIT_RING_WEST
      { kind: "stop", osmId: 2, lon: 42, lat: 40.5 }, // SPLIT_RING_EAST
    ],
  });
  const servedSplit = zonesServedByRoute(splitZoneRoute, SPLIT_ZONES);
  assert(
    servedSplit.length === 1 && servedSplit[0].name === "Ring",
    `expected the split "Ring" zone to appear once, got ${JSON.stringify(servedSplit.map((z) => z.id))}`,
  );
}

// --- quoteSingleFareGBPPence: city ---
{
  const cityRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 0.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 0.8, lat: 0.8 }] });
  const leg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  assert(
    quoteSingleFareGBPPence(leg, cityRoute, ZONES, 0) === CITY_SINGLE_GBP_PENCE,
    "a city route quotes the flat city single, ignoring distance",
  );
  assert(
    quoteSingleFareGBPPence(leg, route({ routeType: "night", points: cityRoute.points }), ZONES, 0) === cityNightSingleFareGBPPence(),
    "a night city route quotes the city night single",
  );
}

// --- quoteSingleFareGBPPence: Country now prices by real zone count, not
// distance (T175 follow-up) ---
{
  // 1 zone (a single Country band, no city touched at all) — the real
  // table's "travel in 1 zone" rate, a DELIBERATE change from T175's old
  // per-mile price: distance is passed but must be ignored here.
  const oneZoneLeg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const oneZoneRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 1.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 1.8, lat: 0.8 }] });
  assert(
    quoteSingleFareGBPPence(oneZoneLeg, oneZoneRoute, ZONES, 50 * 1609.344) === countryZoneCountSingleFareGBPPence(1),
    "a leg entirely within one Country zone quotes the real 1-zone flat figure (£2.40), ignoring the large distance passed in",
  );

  // 3 zones — City (1) + two distinct Country bands crossed — the real
  // "2 or 3 zones" band (£3.40). The route's own waypoint in COUNTRY_A is
  // essential: countZonesForLeg only sees explicit route points, not the
  // straight line between them.
  const threeZoneLeg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const threeZoneRoute = route({
    points: [
      { kind: "stop", osmId: 1, lon: 0.5, lat: 0.5 }, // CITY
      { kind: "waypoint", lon: 1.5, lat: 0.5 }, // COUNTRY_A
      { kind: "stop", osmId: 2, lon: 2.5, lat: 0.5 }, // COUNTRY_B
    ],
  });
  assert(
    quoteSingleFareGBPPence(threeZoneLeg, threeZoneRoute, ZONES, 0) === countryZoneCountSingleFareGBPPence(3),
    "a leg crossing City + 2 Country bands (3 zones total) quotes the real 2-or-3-zones figure (£3.40)",
  );
  assert(
    quoteSingleFareGBPPence(threeZoneLeg, { ...threeZoneRoute, routeType: "night" }, ZONES, 0) === countryZoneCountNightSingleFareGBPPence(3),
    "the same 3-zone leg at night quotes the real night 2-or-3-zones figure (£5.50)",
  );

  // 4 zones — City + 3 distinct Country bands — exercises the
  // beyond-the-flat-band extrapolation (£4.40 Day / £8.50 flat Night).
  const fourZoneLeg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const fourZoneRoute = route({
    points: [
      { kind: "stop", osmId: 1, lon: 0.5, lat: 0.5 }, // CITY
      { kind: "waypoint", lon: 1.5, lat: 0.5 }, // COUNTRY_A
      { kind: "waypoint", lon: 2.5, lat: 0.5 }, // COUNTRY_B
      { kind: "stop", osmId: 2, lon: 3.5, lat: 0.5 }, // COUNTRY_C
    ],
  });
  assert(
    quoteSingleFareGBPPence(fourZoneLeg, fourZoneRoute, ZONES, 0) === countryZoneCountSingleFareGBPPence(4),
    "a leg crossing City + 3 Country bands (4 zones total) quotes £4.40",
  );
  assert(
    quoteSingleFareGBPPence(fourZoneLeg, { ...fourZoneRoute, routeType: "night" }, ZONES, 0) === countryZoneCountNightSingleFareGBPPence(4),
    "the same 4-zone leg at night quotes the flat £8.50 (the 4-6 band), not a scaled-up figure",
  );

  // A split zone's two pieces (touched both) must count as ONE zone, not
  // two — City + Ring (both pieces) + Far Country = 3 zones, not 4.
  const splitLeg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const splitRoute = route({
    points: [
      { kind: "stop", osmId: 1, lon: 40.5, lat: 40.5 }, // SPLIT_CITY
      { kind: "waypoint", lon: 39, lat: 40.5 }, // SPLIT_RING_WEST
      { kind: "waypoint", lon: 42, lat: 40.5 }, // SPLIT_RING_EAST
      { kind: "stop", osmId: 2, lon: 50.5, lat: 40.5 }, // SPLIT_FAR_COUNTRY
    ],
  });
  assert(
    quoteSingleFareGBPPence(splitLeg, splitRoute, SPLIT_ZONES, 0) === countryZoneCountSingleFareGBPPence(3),
    "touching both pieces of a split zone plus one more real zone counts as 3 zones total, not 4 — the split zone's two pieces must not be double-counted",
  );

  // Touching no drawn zone at all still falls back to real distance.
  const noZoneLeg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const noZoneRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 50, lat: 50 }, { kind: "stop", osmId: 2, lon: 50.1, lat: 50.1 }] });
  const threeMilesInMetres = 3 * 1609.344;
  assert(
    quoteSingleFareGBPPence(noZoneLeg, noZoneRoute, ZONES, threeMilesInMetres) === countryOrIslandSingleFareGBPPence(3),
    "a leg touching no drawn fare zone at all falls back to the real-distance formula",
  );
}

// --- quoteSingleFareGBPPence: Island keeps the per-mile formula regardless of zone count ---
{
  const islandLeg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const islandRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 10.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 10.8, lat: 0.8 }] });
  const twoMilesInMetres = 2 * 1609.344;
  assert(
    quoteSingleFareGBPPence(islandLeg, islandRoute, ZONES, twoMilesInMetres) === countryOrIslandSingleFareGBPPence(2),
    "an island route prices the same base+per-mile formula as before, never the zone-count table",
  );
  assert(
    quoteSingleFareGBPPence(islandLeg, { ...islandRoute, routeType: "night" }, ZONES, twoMilesInMetres) === countryOrIslandNightSingleFareGBPPence(2),
    "a night island route also keeps the per-mile night formula",
  );
}

// --- quoteSingleFareGBPPence: airport express ignores zones/distance entirely ---
{
  const leg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const airportRoute = route({ routeType: "airport_express", points: [{ kind: "stop", osmId: 1, lon: 0, lat: 0 }, { kind: "stop", osmId: 2, lon: 0, lat: 0 }] });
  assert(quoteSingleFareGBPPence(leg, airportRoute, [], 999999) === 600, "airport express always quotes its flat fixed single");
}

// --- quoteSingleFareGBPPence: staff routes are free ---
{
  const leg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const staffRoute = route({ routeType: "staff", points: [{ kind: "stop", osmId: 1, lon: 1.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 1.8, lat: 0.8 }] });
  assert(quoteSingleFareGBPPence(leg, staffRoute, ZONES, 99999) === 0, "a staff route quotes £0 — it carries no fare-paying passengers");
}

// --- quoteSingleFareGBPPence: long-distance/sightseeing are explicitly rejected ---
{
  const leg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  const points = [{ kind: "stop" as const, osmId: 1, lon: 0, lat: 0 }, { kind: "stop" as const, osmId: 2, lon: 0, lat: 0 }];
  let threw = false;
  try {
    quoteSingleFareGBPPence(leg, route({ routeType: "long_distance", points }), [], 0);
  } catch {
    threw = true;
  }
  assert(threw, "long_distance routes throw rather than silently returning a wrong fixed-figure price");

  threw = false;
  try {
    quoteSingleFareGBPPence(leg, route({ routeType: "sightseeing", points }), [], 0);
  } catch {
    threw = true;
  }
  assert(threw, "sightseeing routes throw rather than silently returning a wrong fixed-figure price");
}

// --- quoteReturnFareGBPPence (plan #8) ---
{
  const cityRoute = route({ points: [{ kind: "stop", osmId: 1, lon: 0.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 0.8, lat: 0.8 }] });
  const leg: RideLeg = { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 };
  assert(
    quoteReturnFareGBPPence(leg, cityRoute, ZONES, 0) === returnFareGBPPence(CITY_SINGLE_GBP_PENCE),
    "a city route's Return fare is the single's own 1.6x-rounded-up-to-5p figure, not reinvented here",
  );

  const airportRoute = route({ routeType: "airport_express", points: [{ kind: "stop", osmId: 1, lon: 0, lat: 0 }, { kind: "stop", osmId: 2, lon: 0, lat: 0 }] });
  assert(
    quoteReturnFareGBPPence(leg, airportRoute, ZONES, 0) === AIRPORT_EXPRESS_RETURN_GBP_PENCE,
    `Airport Express uses its own real fixed Return (£8.50), not the 1.6x ratio (which would give ${returnFareGBPPence(AIRPORT_EXPRESS_SINGLE_GBP_PENCE)}p instead)`,
  );
}

// --- quoteJourneyFareGBPPence (plan #8): sums each real leg, no invented
// through-ticket discount — DESIGN.md gives none for a connecting Single ---
{
  const route1 = route({ id: 1, points: [{ kind: "stop", osmId: 1, lon: 0.2, lat: 0.2 }, { kind: "stop", osmId: 2, lon: 0.8, lat: 0.8 }] }); // City
  const route2 = route({ id: 2, points: [{ kind: "stop", osmId: 2, lon: 0.8, lat: 0.8 }, { kind: "stop", osmId: 3, lon: 1.5, lat: 0.5 }] }); // Country A
  const legs: RideLeg[] = [
    { kind: "ride", routeId: 1, boardStopOsmId: 1, alightStopOsmId: 2 },
    { kind: "ride", routeId: 2, boardStopOsmId: 2, alightStopOsmId: 3 },
  ];
  const routesById = new Map([[1, route1], [2, route2]]);
  const total = quoteJourneyFareGBPPence(legs, routesById, ZONES, () => 0);
  // route2's own leg (stop2 -> stop3) touches BOTH the city boundary stop
  // AND Country A, so it's correctly a real 2-zone fare on its own — the
  // point of this test is that the JOURNEY total is the plain sum of each
  // leg's own already-correct fare, not that either leg is 1-zone.
  const expectedLeg2 = countryZoneCountSingleFareGBPPence(2);
  assert(
    total === CITY_SINGLE_GBP_PENCE + expectedLeg2,
    `a connecting 2-leg journey's total is the plain sum of each leg's own real fare (city ${CITY_SINGLE_GBP_PENCE}p + leg 2's own real ${expectedLeg2}p), got ${total}`,
  );

  let threw = false;
  try {
    quoteJourneyFareGBPPence([{ kind: "ride", routeId: 99, boardStopOsmId: 1, alightStopOsmId: 2 }], routesById, ZONES, () => 0);
  } catch {
    threw = true;
  }
  assert(threw, "a leg whose routeId has no matching entry in routesById throws rather than silently skipping it");
}

console.log("\nAll checks passed.");
