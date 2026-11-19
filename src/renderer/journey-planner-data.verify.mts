// Manual verification script for journey-planner-data.mts, run directly with
// `node --experimental-strip-types src/renderer/journey-planner-data.verify.mts`
// — same pattern as route-timetable.verify.mts.
import { buildTransitData } from "./journey-planner-data.mts";
import { WEEKDAY_BITS } from "./route-timetable.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function route(overrides: Partial<Route> = {}): Route {
  return {
    id: 1,
    depotGroupId: 1,
    number: "1",
    points: [
      { kind: "stop", osmId: 100, lon: 0, lat: 0 },
      { kind: "stop", osmId: 200, lon: 0.01, lat: 0 },
      { kind: "stop", osmId: 300, lon: 0.02, lat: 0 },
    ],
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

function timetable(overrides: Partial<RouteTimetable> = {}): RouteTimetable {
  return {
    id: 1,
    routeId: 1,
    weekdayMask: WEEKDAY_BITS.monday,
    direction: "both",
    timeBands: [{ startMinutes: 480, endMinutes: 540, intervalMinutes: 30 }], // 480, 510, 540
    timingPoints: [],
    arrivalOffsetsSeconds: [0, 100, 300],
    departureOffsetsSeconds: [0, 100, 300],
    // Same as the plain pair by default — this fixture's own generated
    // departures (480/510/540) all fall inside the AM peak window, so
    // buildTransitData's real peak pick is already exercised throughout
    // this file, not skipped by coincidence.
    arrivalOffsetsSecondsPeak: [0, 100, 300],
    departureOffsetsSecondsPeak: [0, 100, 300],
    excludedDepartureMinutes: [],
    customDepartureMinutes: [],
    mirrorSourceTimetableId: null,
    mirrorOffsetMinutes: null,
    ...overrides,
  };
}

// --- basic trip assembly ---
{
  const data = buildTransitData([route()], [timetable()], WEEKDAY_BITS.monday);
  assert(data.stops.length === 3, `expected 3 distinct stops, got ${data.stops.length}`);
  assert(data.trips.length === 3, `3 generated departures (480/510/540) should produce 3 trips, got ${data.trips.length}`);
  const first = data.trips[0];
  assert(first.routeId === 1, "a trip carries its own route id");
  assert(first.stopTimes.length === 3, "a trip with no skipped points has one stop time per route point");
  assert(
    first.stopTimes[0].departureSeconds === 480 * 60 && first.stopTimes[1].arrivalSeconds === 480 * 60 + 100,
    "the earliest departure's stop times are the band's own start minute plus the timetable's stored offsets",
  );
  const sortedDepartures = data.trips.map((t) => t.stopTimes[0].departureSeconds).sort((a, b) => a - b);
  assert(
    JSON.stringify(sortedDepartures) === JSON.stringify([480 * 60, 510 * 60, 540 * 60]),
    `expected departures at 480/510/540 minutes, got ${JSON.stringify(sortedDepartures)}`,
  );
}

// --- the same real stop (same osmId) used by two routes is one stop, not two ---
{
  const routeA = route({ id: 1 });
  const routeB = route({ id: 2, points: [routeA.points[2], { kind: "stop", osmId: 400, lon: 0.03, lat: 0 }] });
  const data = buildTransitData(
    [routeA, routeB],
    [
      timetable({ routeId: 1 }),
      timetable({ id: 2, routeId: 2, arrivalOffsetsSeconds: [0, 50], departureOffsetsSeconds: [0, 50], arrivalOffsetsSecondsPeak: [0, 50], departureOffsetsSecondsPeak: [0, 50] }),
    ],
    WEEKDAY_BITS.monday,
  );
  assert(data.stops.length === 4, `shared osmId 300 should be one stop, not counted twice — expected 4 distinct stops, got ${data.stops.length}`);
}

// --- a "skip" pickup/dropoff override removes that point from every trip ---
{
  const skipMiddle = route({ pickupDropoffOverrides: [{ pointIndex: 1, value: "skip" }] });
  const data = buildTransitData([skipMiddle], [timetable()], WEEKDAY_BITS.monday);
  assert(data.trips[0].stopTimes.length === 2, `a skipped point should drop out of every trip's stop times, got ${data.trips[0].stopTimes.length}`);
}

// --- a day the timetable doesn't run on contributes no trips ---
{
  const data = buildTransitData([route()], [timetable()], WEEKDAY_BITS.sunday);
  assert(data.trips.length === 0, "a weekday-only timetable produces no trips when planning for a day it doesn't cover");
}

// --- a terminus-loop route's split outbound/inbound components each become
// trips, sliced to their own leg (not the other leg's 0-padding) ---
{
  const loop = route({
    points: [
      { kind: "stop", osmId: 100, lon: 0, lat: 0 },
      { kind: "stop", osmId: 200, lon: 0.01, lat: 0 },
      { kind: "stop", osmId: 300, lon: 0.02, lat: 0 }, // terminus
      { kind: "stop", osmId: 400, lon: 0.01, lat: 0.01 },
      { kind: "stop", osmId: 500, lon: 0, lat: 0.01 },
    ],
    terminusIndex: 2,
    startIndex: 2,
    orientation: "outbound",
  });
  const outboundTt = timetable({
    direction: "outbound",
    timeBands: [{ startMinutes: 480, endMinutes: 480, intervalMinutes: 30 }], // one departure
    arrivalOffsetsSeconds: [0, 100, 300, 0, 0],
    departureOffsetsSeconds: [0, 100, 300, 0, 0],
    arrivalOffsetsSecondsPeak: [0, 100, 300, 0, 0],
    departureOffsetsSecondsPeak: [0, 100, 300, 0, 0],
  });
  const data = buildTransitData([loop], [outboundTt], WEEKDAY_BITS.monday);
  assert(data.trips.length === 1, `a single-departure outbound component should produce one trip, got ${data.trips.length}`);
  assert(
    data.trips[0].stopTimes.length === 3,
    `an outbound leg (points 0-2) should produce 3 stop times, not the inbound leg's 0-padding, got ${data.trips[0].stopTimes.length}`,
  );
  assert(
    data.trips[0].stopTimes[2].arrivalSeconds === 480 * 60 + 300,
    "the outbound leg's terminus stop time comes from its own real offset, not 0-padding",
  );

  const inboundTt = timetable({
    id: 2,
    direction: "inbound",
    timeBands: [{ startMinutes: 480, endMinutes: 480, intervalMinutes: 30 }],
    arrivalOffsetsSeconds: [0, 0, 0, 100, 300],
    departureOffsetsSeconds: [0, 0, 0, 100, 300],
    arrivalOffsetsSecondsPeak: [0, 0, 0, 100, 300],
    departureOffsetsSecondsPeak: [0, 0, 0, 100, 300],
  });
  const inboundData = buildTransitData([loop], [inboundTt], WEEKDAY_BITS.monday);
  assert(inboundData.trips.length === 1, `a single-departure inbound component should produce one trip, got ${inboundData.trips.length}`);
  assert(
    inboundData.trips[0].stopTimes.length === 3,
    `an inbound leg (points 2-4) should produce 3 stop times, not the outbound leg's 0-padding, got ${inboundData.trips[0].stopTimes.length}`,
  );
}

// --- excluded departures don't become trips ---
{
  const data = buildTransitData([route()], [timetable({ excludedDepartureMinutes: [510] })], WEEKDAY_BITS.monday);
  assert(data.trips.length === 2, `excluding one generated minute should drop one trip, got ${data.trips.length}`);
}

console.log("\nAll checks passed.");
