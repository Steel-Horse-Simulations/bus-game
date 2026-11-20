// Real fixed-content route+timetable seed data for the Contracts menu
// (DESIGN.md "Fixed real contracts"; OPEN-ITEMS.md "Contracts redesign").
//
// Confirmed directly this session: 398, Airlink 100, Express 500 and AIR
// (3 real variations) already exist as fully-built, real routes in the
// player's own live save (%APPDATA%\bus-game\save.sqlite) — real route ids
// 76, 51, 46, and 52/53/55 respectively. They had never been extracted
// into reusable seed data before this (confirmed by searching the
// codebase) — a FRESH save, or any other player, had no way to get the
// same fixed content. This module is that extraction, hand-embedded as
// static content after a one-off, read-only `node --experimental-strip-
// types` script dumped the real rows directly from a copy of the live
// save (same throwaway-script convention this session already used
// elsewhere) — never a runtime read of someone else's save file, per the
// task brief's own instruction.
//
// SkyLink has NO real route in this save (confirmed directly, matching
// livery-seed-data.mts's own "doesn't exist in the game yet" note for the
// same name) — deliberately absent from FIXED_CONTRACT_ROUTE_SEEDS below,
// same "nothing to seed yet" treatment as Dounreay/800/803/805 (their own
// content is still the user's pending real-world research, out of scope
// to invent here).
//
// --- Two honest discrepancies, flagged rather than silently resolved -----
//
// The real save's own values differ slightly from DESIGN.md's prose in a
// few places. This module extracts exactly what's actually built and
// saved (the "Build approach" note for each contract: "Once built and
// saved, Claude Code extracts the route and timetable to bundle as fixed
// content" — the live save IS the fixed content, not the earlier prose
// describing it), not what DESIGN.md's text says it SHOULD be — but both
// are recorded here so the user can correct whichever one is wrong:
//  - 398's real saved colour is #002462; DESIGN.md's §"Route 398" text
//    says #002664. Express 500's real saved colour is #97338c; DESIGN.md
//    says #1e6e6f. Airlink 100's real saved colour is #0b2b4c; DESIGN.md
//    says #002b4e. Each pair is close but not identical — possibly a
//    small in-editor colour-picker drift from the originally specified
//    hex, never reconciled.
//  - 398's real saved weekday timetable is a single flat 12-minute band,
//    0800-2000 (480-1200 minutes) — DESIGN.md's prose describes two
//    separate bands (every 12 min 0800-1800, then every 20 min
//    1800-2000). The simpler single-band version is what's actually
//    built and saved, so that's what's extracted here.
//
// --- Player-placed stops (negative osmId) ----------------------------
//
// Airlink 100 and AIR's own "via Garrowhill"/"via Garrowhill & Eurocentral"
// variations each route through real player-PLACED stops (negative osmId
// — player_stops.id, not an OSM id), not plain OSM stops. A negative id
// only means anything within the save it was created in — id -52 in the
// live save this was extracted from is NOT portable to a fresh save. Each
// such point below is instead tagged `placedStop: {lon, lat, busLegal}`
// (the real values of that player_stops row, extracted directly) in place
// of a real osmId; `seedFixedContractRoute` below creates a brand-new
// player_stops row for each one via `window.playerStops.create` and
// substitutes its own newly-minted id before saving the route — a fresh
// save gets its own real, working player-stop rows with the same real
// position, not a dangling reference to someone else's save. Two
// positions (the "via Garrowhill" detour's own two points) are shared
// between AIR's two "via Garrowhill..." variations in the real save — the
// seeding function below deliberately creates each DISTINCT position only
// ONCE per seeding pass and reuses it, matching the real save's own
// sharing rather than creating duplicate stops for the same real spot.
export type SeedRoutePointKind = "stop" | "waypoint";

export interface SeedRoutePoint {
  kind: SeedRoutePointKind;
  osmId?: number;
  placedStop?: { lon: number; lat: number; busLegal: boolean };
  lon: number;
  lat: number;
}

export interface SeedPickupDropoffOverride {
  pointIndex: number;
  value: "pickup_only" | "setdown_only" | "skip";
}

export interface SeedTimeBand {
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
}

export interface SeedTimingPoint {
  pointIndex: number;
  standardPaddingMinutes: number;
  peakPaddingMinutes: number | null;
  dwellMinutes: number;
}

export type SeedRouteType = "ordinary" | "night" | "sightseeing" | "airport_express" | "long_distance" | "staff";
export type SeedTimetableDirection = "both" | "outbound" | "inbound";

export interface SeedTimetableComponent {
  weekdayMask: number;
  direction: SeedTimetableDirection;
  timeBands: SeedTimeBand[];
  timingPoints: SeedTimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
  arrivalOffsetsSecondsPeak: number[];
  departureOffsetsSecondsPeak: number[];
  excludedDepartureMinutes: number[];
  customDepartureMinutes: number[];
}

export interface SeedRoute {
  number: string;
  name: string | null;
  colour: string;
  points: SeedRoutePoint[];
  orientation: "inbound" | "outbound";
  terminusIndex: number | null;
  startIndex: number | null;
  pickupDropoffOverrides: SeedPickupDropoffOverride[];
  timingPointIndexes: number[];
  routeType: SeedRouteType;
  variationLetter: string | null;
  isMinorVariation: boolean;
  timetables: SeedTimetableComponent[];
}

// --- 398 — real route id 76 in the live save, depot group 6 ("Glasgow") --
export const ROUTE_398_SEED: SeedRoute = {
  number: "398",
  name: "ScotRail Shuttle",
  colour: "#002462",
  orientation: "inbound",
  terminusIndex: null,
  startIndex: null,
  pickupDropoffOverrides: [],
  timingPointIndexes: [3],
  routeType: "ordinary",
  variationLetter: null,
  isMinorVariation: false,
  points: [
    { kind: "stop", osmId: 441274332, lon: -4.258036315441132, lat: 55.86050770800799 },
    { kind: "waypoint", lon: -4.2582058, lat: 55.8620088 },
    { kind: "stop", osmId: 332054215, lon: -4.251706302165985, lat: 55.86180147591347 },
    { kind: "stop", osmId: 2092235486, lon: -4.2512402683496475, lat: 55.86470006708038 },
    { kind: "waypoint", lon: -4.2546991, lat: 55.8651578 },
    { kind: "stop", osmId: 441274332, lon: -4.258036315441132, lat: 55.86050808432836 },
  ],
  timetables: [
    {
      weekdayMask: 31,
      direction: "both",
      timeBands: [{ startMinutes: 480, endMinutes: 1200, intervalMinutes: 12 }],
      timingPoints: [
        { pointIndex: 3, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 5, standardPaddingMinutes: 8, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      departureOffsetsSeconds: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      arrivalOffsetsSecondsPeak: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      departureOffsetsSecondsPeak: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
    {
      weekdayMask: 32,
      direction: "both",
      timeBands: [{ startMinutes: 540, endMinutes: 1200, intervalMinutes: 12 }],
      timingPoints: [
        { pointIndex: 3, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 5, standardPaddingMinutes: 8, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      departureOffsetsSeconds: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      arrivalOffsetsSecondsPeak: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      departureOffsetsSecondsPeak: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
    {
      weekdayMask: 64,
      direction: "both",
      timeBands: [{ startMinutes: 720, endMinutes: 1200, intervalMinutes: 20 }],
      timingPoints: [
        { pointIndex: 3, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 5, standardPaddingMinutes: 8, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      departureOffsetsSeconds: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      arrivalOffsetsSecondsPeak: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      departureOffsetsSecondsPeak: [0, 75.4184434581804, 233.7465828930543, 360, 468.2532344149573, 1020],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
  ],
};

// --- Airlink 100 — real route id 51, depot group 16 ("Edinburgh") --------
export const AIRLINK_100_SEED: SeedRoute = {
  number: "100",
  name: "Airlink 100",
  colour: "#0b2b4c",
  orientation: "outbound",
  terminusIndex: 12,
  startIndex: 13,
  routeType: "airport_express",
  variationLetter: null,
  isMinorVariation: false,
  timingPointIndexes: [],
  pickupDropoffOverrides: [
    { pointIndex: 1, value: "pickup_only" },
    { pointIndex: 2, value: "pickup_only" },
    { pointIndex: 3, value: "pickup_only" },
    { pointIndex: 4, value: "pickup_only" },
    { pointIndex: 5, value: "pickup_only" },
    { pointIndex: 6, value: "pickup_only" },
    { pointIndex: 7, value: "pickup_only" },
    { pointIndex: 8, value: "pickup_only" },
    { pointIndex: 9, value: "setdown_only" },
    { pointIndex: 14, value: "pickup_only" },
    { pointIndex: 15, value: "setdown_only" },
    { pointIndex: 16, value: "setdown_only" },
    { pointIndex: 17, value: "setdown_only" },
    { pointIndex: 18, value: "setdown_only" },
    { pointIndex: 19, value: "setdown_only" },
    { pointIndex: 20, value: "setdown_only" },
    { pointIndex: 21, value: "setdown_only" },
    { pointIndex: 22, value: "setdown_only" },
    { pointIndex: 23, value: "setdown_only" },
    { pointIndex: 24, value: "setdown_only" },
    { pointIndex: 25, value: "setdown_only" },
  ],
  points: [
    { kind: "stop", osmId: 502531539, lon: -3.192102313041687, lat: 55.95230400885336 },
    { kind: "stop", osmId: 502534037, lon: -3.2091031596064568, lat: 55.94964586823295 },
    { kind: "stop", osmId: 2495698720, lon: -3.2194464281201363, lat: 55.94585075590385 },
    { kind: "stop", osmId: 502534049, lon: -3.228198140859604, lat: 55.94572008402267 },
    { kind: "stop", osmId: 502534052, lon: -3.2401131838560104, lat: 55.94564423405032 },
    { kind: "stop", osmId: 502534059, lon: -3.2524047419428825, lat: 55.94459564928377 },
    { kind: "stop", placedStop: { lon: -3.2679684, lat: 55.9421012, busLegal: true }, lon: -3.26796842738986, lat: 55.94210118013925 },
    { kind: "stop", osmId: 502534071, lon: -3.2911911606788635, lat: 55.94285495466238 },
    { kind: "stop", osmId: 502534096, lon: -3.31150084733963, lat: 55.940683060396964 },
    { kind: "stop", osmId: 7978835733, lon: -3.361101597547531, lat: 55.943523941907586 },
    { kind: "waypoint", lon: -3.3632063999999997, lat: 55.9450138 },
    { kind: "waypoint", lon: -3.3642041999999996, lat: 55.9480382 },
    { kind: "stop", osmId: 502534133, lon: -3.3624007925391197, lat: 55.94824576571196 },
    { kind: "stop", placedStop: { lon: -3.3613245, lat: 55.9478727, busLegal: true }, lon: -3.361324556171894, lat: 55.94787273441577 },
    { kind: "stop", osmId: 7978835734, lon: -3.36069792509079, lat: 55.94305247890196 },
    { kind: "stop", osmId: 502529681, lon: -3.311671167612076, lat: 55.940847548049874 },
    { kind: "stop", osmId: 502529747, lon: -3.291802369058132, lat: 55.942921985339495 },
    { kind: "stop", osmId: 4865825680, lon: -3.2669579051434994, lat: 55.94236358058225 },
    { kind: "stop", osmId: 502529800, lon: -3.2499900832772255, lat: 55.94499781353011 },
    { kind: "stop", osmId: 502529826, lon: -3.2403364777565002, lat: 55.94575106231025 },
    { kind: "stop", osmId: 502529835, lon: -3.2288093492388725, lat: 55.94580363146878 },
    { kind: "stop", osmId: 502529843, lon: -3.218481671065092, lat: 55.94592829518808 },
    { kind: "stop", osmId: 502529862, lon: -3.2090166583657265, lat: 55.949872267827544 },
    { kind: "stop", osmId: 2425287070, lon: -3.200271986424923, lat: 55.951493914779604 },
    { kind: "stop", osmId: 502533491, lon: -3.1971683353185654, lat: 55.95303534095473 },
    { kind: "stop", osmId: 2435877156, lon: -3.1955308467149734, lat: 55.95393709796582 },
    { kind: "waypoint", lon: -3.1934917, lat: 55.9528173 },
    { kind: "waypoint", lon: -3.1963911, lat: 55.9510904 },
    { kind: "waypoint", lon: -3.1945422999999997, lat: 55.9502052 },
    { kind: "stop", osmId: 502531539, lon: -3.192102313041687, lat: 55.95230400885336 },
  ],
  timetables: [
    {
      weekdayMask: 31,
      direction: "inbound",
      timeBands: [
        { startMinutes: 1220, endMinutes: 60, intervalMinutes: 10 },
        { startMinutes: 75, endMinutes: 105, intervalMinutes: 15 },
        { startMinutes: 125, endMinutes: 185, intervalMinutes: 20 },
        { startMinutes: 289, endMinutes: 313, intervalMinutes: 8 },
        { startMinutes: 327, endMinutes: 359, intervalMinutes: 8 },
        { startMinutes: 369, endMinutes: 389, intervalMinutes: 10 },
        { startMinutes: 424, endMinutes: 654, intervalMinutes: 10 },
        { startMinutes: 663, endMinutes: 690, intervalMinutes: 9 },
        { startMinutes: 709, endMinutes: 952, intervalMinutes: 9 },
        { startMinutes: 972, endMinutes: 1143, intervalMinutes: 9 },
        { startMinutes: 1181, endMinutes: 1211, intervalMinutes: 10 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [1172,1163,1153,962,700,412,400,280,272,262,252,246,200,225,231,240],
    },
    {
      weekdayMask: 31,
      direction: "outbound",
      timeBands: [
        { startMinutes: 1040, endMinutes: 20, intervalMinutes: 10 },
        { startMinutes: 50, endMinutes: 190, intervalMinutes: 20 },
        { startMinutes: 220, endMinutes: 240, intervalMinutes: 10 },
        { startMinutes: 248, endMinutes: 428, intervalMinutes: 8 },
        { startMinutes: 438, endMinutes: 628, intervalMinutes: 10 },
        { startMinutes: 647, endMinutes: 691, intervalMinutes: 9 },
        { startMinutes: 701, endMinutes: 737, intervalMinutes: 9 },
        { startMinutes: 762, endMinutes: 960, intervalMinutes: 9 },
        { startMinutes: 968, endMinutes: 1040, intervalMinutes: 9 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [35,205,753,745],
    },
    {
      weekdayMask: 32,
      direction: "inbound",
      timeBands: [
        { startMinutes: 1220, endMinutes: 60, intervalMinutes: 10 },
        { startMinutes: 75, endMinutes: 105, intervalMinutes: 15 },
        { startMinutes: 125, endMinutes: 185, intervalMinutes: 20 },
        { startMinutes: 289, endMinutes: 313, intervalMinutes: 8 },
        { startMinutes: 327, endMinutes: 359, intervalMinutes: 8 },
        { startMinutes: 369, endMinutes: 389, intervalMinutes: 10 },
        { startMinutes: 424, endMinutes: 654, intervalMinutes: 10 },
        { startMinutes: 663, endMinutes: 690, intervalMinutes: 9 },
        { startMinutes: 709, endMinutes: 952, intervalMinutes: 9 },
        { startMinutes: 972, endMinutes: 1143, intervalMinutes: 9 },
        { startMinutes: 1181, endMinutes: 1211, intervalMinutes: 10 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [200,225,231,240,246,252,262,272,280,400,412,700,962,1153,1163,1172],
    },
    {
      weekdayMask: 32,
      direction: "outbound",
      timeBands: [
        { startMinutes: 1040, endMinutes: 20, intervalMinutes: 10 },
        { startMinutes: 50, endMinutes: 190, intervalMinutes: 20 },
        { startMinutes: 220, endMinutes: 240, intervalMinutes: 10 },
        { startMinutes: 248, endMinutes: 428, intervalMinutes: 8 },
        { startMinutes: 438, endMinutes: 628, intervalMinutes: 10 },
        { startMinutes: 647, endMinutes: 691, intervalMinutes: 9 },
        { startMinutes: 701, endMinutes: 737, intervalMinutes: 9 },
        { startMinutes: 762, endMinutes: 960, intervalMinutes: 9 },
        { startMinutes: 968, endMinutes: 1040, intervalMinutes: 9 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [35,205,745,753],
    },
    {
      weekdayMask: 64,
      direction: "both",
      timeBands: [
        { startMinutes: 1040, endMinutes: 20, intervalMinutes: 10 },
        { startMinutes: 50, endMinutes: 190, intervalMinutes: 20 },
        { startMinutes: 220, endMinutes: 240, intervalMinutes: 10 },
        { startMinutes: 248, endMinutes: 428, intervalMinutes: 8 },
        { startMinutes: 438, endMinutes: 628, intervalMinutes: 10 },
        { startMinutes: 647, endMinutes: 691, intervalMinutes: 9 },
        { startMinutes: 701, endMinutes: 737, intervalMinutes: 9 },
        { startMinutes: 762, endMinutes: 960, intervalMinutes: 9 },
        { startMinutes: 968, endMinutes: 1040, intervalMinutes: 9 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,1500,1610.5214893224215,1879.3679229480363,1998.5106082762131,2160,2302.5235384348643,2361.8528290112995,2462.5587405964734,2575.6163801139546,2700,2751.318536051871,2843.5900674470427,2886.1677724949873,2940.6057444779294,2999.1317589846185,3043.708495658726,3092.946885573497],
      departureOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,1500,1610.5214893224215,1879.3679229480363,1998.5106082762131,2160,2302.5235384348643,2361.8528290112995,2462.5587405964734,2575.6163801139546,2700,2751.318536051871,2843.5900674470427,2886.1677724949873,2940.6057444779294,2999.1317589846185,3043.708495658726,3092.946885573497],
      arrivalOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,1500,1610.5214893224215,1879.3679229480363,1998.5106082762131,2160,2302.5235384348643,2361.8528290112995,2462.5587405964734,2575.6163801139546,2700,2751.318536051871,2843.5900674470427,2886.1677724949873,2940.6057444779294,2999.1317589846185,3043.708495658726,3092.946885573497],
      departureOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,1500,1610.5214893224215,1879.3679229480363,1998.5106082762131,2160,2302.5235384348643,2361.8528290112995,2462.5587405964734,2575.6163801139546,2700,2751.318536051871,2843.5900674470427,2886.1677724949873,2940.6057444779294,2999.1317589846185,3043.708495658726,3092.946885573497],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [35,205,745,753],
    },
    {
      weekdayMask: 64,
      direction: "inbound",
      timeBands: [
        { startMinutes: 1220, endMinutes: 60, intervalMinutes: 10 },
        { startMinutes: 75, endMinutes: 105, intervalMinutes: 15 },
        { startMinutes: 125, endMinutes: 185, intervalMinutes: 20 },
        { startMinutes: 289, endMinutes: 313, intervalMinutes: 8 },
        { startMinutes: 327, endMinutes: 359, intervalMinutes: 8 },
        { startMinutes: 369, endMinutes: 389, intervalMinutes: 10 },
        { startMinutes: 424, endMinutes: 654, intervalMinutes: 10 },
        { startMinutes: 663, endMinutes: 690, intervalMinutes: 9 },
        { startMinutes: 709, endMinutes: 952, intervalMinutes: 9 },
        { startMinutes: 972, endMinutes: 1143, intervalMinutes: 9 },
        { startMinutes: 1181, endMinutes: 1211, intervalMinutes: 10 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,110.52148932242162,379.3679229480363,498.5106082762131,660,802.5235384348642,861.8528290112995,962.5587405964736,1075.6163801139546,1200,1251.318536051871,1343.5900674470424,1386.167772494987,1440.6057444779294,1499.1317589846183,1543.7084956587257,1592.9468855734972],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [200,225,231,240,246,252,262,272,280,400,412,700,962,1153,1163,1172],
    },
    {
      weekdayMask: 64,
      direction: "outbound",
      timeBands: [
        { startMinutes: 1040, endMinutes: 20, intervalMinutes: 10 },
        { startMinutes: 50, endMinutes: 190, intervalMinutes: 20 },
        { startMinutes: 220, endMinutes: 240, intervalMinutes: 10 },
        { startMinutes: 248, endMinutes: 428, intervalMinutes: 8 },
        { startMinutes: 438, endMinutes: 628, intervalMinutes: 10 },
        { startMinutes: 647, endMinutes: 691, intervalMinutes: 9 },
        { startMinutes: 701, endMinutes: 737, intervalMinutes: 9 },
        { startMinutes: 762, endMinutes: 960, intervalMinutes: 9 },
        { startMinutes: 968, endMinutes: 1040, intervalMinutes: 9 },
      ],
      timingPoints: [
        { pointIndex: 22, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 17, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,227.0605564870295,369.0194486509433,456.76312543614,553.3056589630639,614.8381242847051,720,882.7180928749776,1003.474056584676,1326.4770221296626,1358.800638325587,1417.529371982916,1440,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [35,205,745,753],
    },
  ],
};

// --- Express 500 — real route id 46, depot group 6 ("Glasgow") -----------
export const EXPRESS_500_SEED: SeedRoute = {
  number: "500",
  name: "Express 500",
  colour: "#97338c",
  orientation: "outbound",
  terminusIndex: 7,
  startIndex: 7,
  routeType: "airport_express",
  variationLetter: null,
  isMinorVariation: false,
  timingPointIndexes: [6],
  pickupDropoffOverrides: [],
  points: [
    { kind: "stop", osmId: 11373284542, lon: -4.251497928053141, lat: 55.86503307324432 },
    { kind: "stop", osmId: 571294621, lon: -4.249684251844883, lat: 55.86209245486296 },
    { kind: "stop", osmId: 330559459, lon: -4.253080263733864, lat: 55.86099748588845 },
    { kind: "stop", osmId: 330557111, lon: -4.257308095693588, lat: 55.861506825755356 },
    { kind: "stop", osmId: 571292554, lon: -4.261729717254639, lat: 55.860411369872594 },
    { kind: "waypoint", lon: -4.2631726, lat: 55.8606031 },
    { kind: "stop", osmId: 571292197, lon: -4.265689328312874, lat: 55.860765110291624 },
    { kind: "stop", osmId: 6318116240, lon: -4.430540576577187, lat: 55.864449840231174 },
    { kind: "waypoint", lon: -4.2661945999999995, lat: 55.861761099999995 },
    { kind: "stop", osmId: 415947740, lon: -4.2635516077280045, lat: 55.861553676408874 },
    { kind: "stop", osmId: 332050659, lon: -4.259205423295498, lat: 55.86111978827583 },
    { kind: "stop", osmId: 332054212, lon: -4.252619929611683, lat: 55.861920012703024 },
    { kind: "stop", osmId: 571293620, lon: -4.249782487750053, lat: 55.8625589762151 },
    { kind: "stop", osmId: 11373284542, lon: -4.251498095691204, lat: 55.86503307324432 },
  ],
  timetables: [
    {
      weekdayMask: 127,
      direction: "inbound",
      timeBands: [
        { startMinutes: 5, endMinutes: 245, intervalMinutes: 60 },
        { startMinutes: 305, endMinutes: 425, intervalMinutes: 30 },
        { startMinutes: 525, endMinutes: 1115, intervalMinutes: 10 },
        { startMinutes: 1127, endMinutes: 1167, intervalMinutes: 12 },
        { startMinutes: 1175, endMinutes: 1355, intervalMinutes: 15 },
        { startMinutes: 1375, endMinutes: 1415, intervalMinutes: 20 },
      ],
      timingPoints: [
        { pointIndex: 7, standardPaddingMinutes: 10, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 13, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,705.7048910820685,745.7013627548721,822.3471473231716,1013.3676075968532,1076.6873627949167,1200],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,705.7048910820685,745.7013627548721,822.3471473231716,1013.3676075968532,1076.6873627949167,1200],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,705.7048910820685,745.7013627548721,822.3471473231716,1013.3676075968532,1076.6873627949167,1200],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,705.7048910820685,745.7013627548721,822.3471473231716,1013.3676075968532,1076.6873627949167,1200],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [455,475,485,515,505],
    },
    {
      weekdayMask: 127,
      direction: "outbound",
      timeBands: [
        { startMinutes: 1410, endMinutes: 210, intervalMinutes: 60 },
        { startMinutes: 240, endMinutes: 420, intervalMinutes: 30 },
        { startMinutes: 435, endMinutes: 480, intervalMinutes: 15 },
        { startMinutes: 480, endMinutes: 1080, intervalMinutes: 10 },
        { startMinutes: 1080, endMinutes: 1140, intervalMinutes: 12 },
        { startMinutes: 1140, endMinutes: 1320, intervalMinutes: 15 },
        { startMinutes: 1320, endMinutes: 1380, intervalMinutes: 20 },
      ],
      timingPoints: [
        { pointIndex: 13, standardPaddingMinutes: 3, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 7, standardPaddingMinutes: 10, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,134.54135824258566,312.2490639629274,380.82588635513946,486.6121336019017,498.8208341632085,540,1800,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,134.54135824258566,312.2490639629274,380.82588635513946,486.6121336019017,498.8208341632085,540,1800,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,134.54135824258566,312.2490639629274,380.82588635513946,486.6121336019017,498.8208341632085,540,1800,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,134.54135824258566,312.2490639629274,380.82588635513946,486.6121336019017,498.8208341632085,540,1800,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
  ],
};

// --- AIR — real route ids 52 ("AIR"), 53 ("via Garrowhill"), 55 ("via
// Garrowhill & Eurocentral"), all depot group 6 ("Glasgow") ---------------
// 53 and 55 are both real MINOR variations of 52 (DESIGN.md §6 "Minor
// variations" — unlettered, live-linked), matching schema exactly as
// extracted (parent_route_id = 52 for both in the live save).
export const AIR_PARENT_SEED: SeedRoute = {
  number: "AIR",
  name: "AIR",
  colour: "#00b6ed",
  orientation: "inbound",
  terminusIndex: 9,
  startIndex: 9,
  routeType: "long_distance",
  variationLetter: null,
  isMinorVariation: false,
  timingPointIndexes: [6, 12],
  pickupDropoffOverrides: [],
  points: [
    { kind: "stop", osmId: 502534132, lon: -3.363533690571785, lat: 55.94831100357902 },
    { kind: "stop", osmId: 7978835734, lon: -3.36069792509079, lat: 55.94305247890196 },
    { kind: "stop", osmId: 502534144, lon: -3.367109075188637, lat: 55.937610430334814 },
    { kind: "stop", osmId: 502534158, lon: -3.3897844702005386, lat: 55.93865995535401 },
    { kind: "stop", osmId: 502534161, lon: -3.397708386182785, lat: 55.938822949352755 },
    { kind: "waypoint", lon: -3.7018663, lat: 55.870498899999994 },
    { kind: "stop", osmId: 795828128, lon: -3.7596480175852776, lat: 55.86278174547519 },
    { kind: "waypoint", lon: -3.9841542999999997, lat: 55.8335185 },
    { kind: "stop", osmId: 1202158046, lon: -3.983481377363205, lat: 55.83420624606333 },
    { kind: "stop", osmId: 5869396707, lon: -4.251807723194361, lat: 55.86518311322422 },
    { kind: "waypoint", lon: -3.9841556999999996, lat: 55.833514799999996 },
    { kind: "stop", osmId: 1202158046, lon: -3.983481377363205, lat: 55.834206434350904 },
    { kind: "stop", osmId: 288159300, lon: -3.758551999926567, lat: 55.863951263132094 },
    { kind: "stop", osmId: 3364658968, lon: -3.3979980647563934, lat: 55.93910048824705 },
    { kind: "stop", osmId: 502529523, lon: -3.390674963593483, lat: 55.93892848196771 },
    { kind: "stop", osmId: 502529529, lon: -3.3662521094083786, lat: 55.937817558386996 },
    { kind: "stop", osmId: 7978835733, lon: -3.361101597547531, lat: 55.943523941907586 },
    { kind: "waypoint", lon: -3.3628715, lat: 55.9449933 },
    { kind: "stop", osmId: 502534132, lon: -3.363533690571785, lat: 55.94831109744638 },
  ],
  timetables: [
    {
      weekdayMask: 127,
      direction: "inbound",
      timeBands: [{ startMinutes: 410, endMinutes: 1330, intervalMinutes: 20 }],
      timingPoints: [
        { pointIndex: 12, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 9, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2045.963944429919,2045.963944429919,3060,0,0,0,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2045.963944429919,2045.963944429919,3060,0,0,0,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2045.963944429919,2045.963944429919,3060,0,0,0,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2045.963944429919,2045.963944429919,3060,0,0,0,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
    {
      weekdayMask: 127,
      direction: "outbound",
      timeBands: [{ startMinutes: 350, endMinutes: 1330, intervalMinutes: 20 }],
      timingPoints: [
        { pointIndex: 6, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 18, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,1016.9012714384002,1016.9012714384002,1740,2811.6482206810197,2819.459951822728,2939.7049033756334,3062.2427090560877,3097.81512923849,3180],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,1016.9012714384002,1016.9012714384002,1740,2811.6482206810197,2819.459951822728,2939.7049033756334,3062.2427090560877,3097.81512923849,3180],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,1016.9012714384002,1016.9012714384002,1740,2811.6482206810197,2819.459951822728,2939.7049033756334,3062.2427090560877,3097.81512923849,3180],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,1016.9012714384002,1016.9012714384002,1740,2811.6482206810197,2819.459951822728,2939.7049033756334,3062.2427090560877,3097.81512923849,3180],
      excludedDepartureMinutes: [390,450,510,570,630,690,750,810,870,930,990,1050,1110,1170,1230],
      customDepartureMinutes: [],
    },
  ],
};

export const AIR_VIA_GARROWHILL_SEED: SeedRoute = {
  number: "AIR",
  name: "via Garrowhill",
  colour: "#00b6ed",
  orientation: "inbound",
  terminusIndex: 9,
  startIndex: 9,
  routeType: "long_distance",
  variationLetter: null,
  isMinorVariation: true,
  timingPointIndexes: [6, 12],
  pickupDropoffOverrides: [],
  points: [
    { kind: "stop", osmId: 502534132, lon: -3.363533690571785, lat: 55.94831100357902 },
    { kind: "stop", osmId: 7978835734, lon: -3.36069792509079, lat: 55.94305247890196 },
    { kind: "stop", osmId: 502534144, lon: -3.367109075188637, lat: 55.937610430334814 },
    { kind: "stop", osmId: 502534158, lon: -3.3897844702005386, lat: 55.93865995535401 },
    { kind: "stop", osmId: 502534161, lon: -3.397708386182785, lat: 55.938822949352755 },
    { kind: "waypoint", lon: -3.7018663, lat: 55.870498899999994 },
    { kind: "stop", osmId: 795828128, lon: -3.7596480175852776, lat: 55.86278174547519 },
    { kind: "stop", placedStop: { lon: -4.1087475, lat: 55.8533203, busLegal: true }, lon: -4.1087475791573524, lat: 55.85332026489138 },
    { kind: "stop", osmId: 2089909639, lon: -4.107564557343721, lat: 55.85916525595755 },
    { kind: "stop", osmId: 5869396707, lon: -4.251807723194361, lat: 55.86518311322422 },
    { kind: "stop", osmId: 2089909638, lon: -4.107419215142727, lat: 55.85917419387425 },
    { kind: "stop", placedStop: { lon: -4.1095716, lat: 55.8538732, busLegal: true }, lon: -4.109571687877178, lat: 55.853873177858105 },
    { kind: "stop", osmId: 288159300, lon: -3.758551999926567, lat: 55.863951263132094 },
    { kind: "stop", osmId: 3364658968, lon: -3.3979980647563934, lat: 55.93910048824705 },
    { kind: "stop", osmId: 502529523, lon: -3.390674963593483, lat: 55.93892848196771 },
    { kind: "stop", osmId: 502529529, lon: -3.3662521094083786, lat: 55.937817558386996 },
    { kind: "stop", osmId: 7978835733, lon: -3.361101597547531, lat: 55.943523941907586 },
    { kind: "waypoint", lon: -3.3628715, lat: 55.9449933 },
    { kind: "stop", osmId: 502534132, lon: -3.363533690571785, lat: 55.94831109744638 },
  ],
  timetables: [
    {
      weekdayMask: 127,
      direction: "inbound",
      timeBands: [{ startMinutes: 390, endMinutes: 1350, intervalMinutes: 60 }],
      timingPoints: [],
      arrivalOffsetsSeconds: [0,122.64599623224443,283.87546400167986,357.85406838119593,372.5337306938176,1138.5543550635753,1314.6194684510278,2199.7027630168022,2288.532048428357,2940.477622955168,0,0,0,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,122.64599623224443,283.87546400167986,357.85406838119593,372.5337306938176,1138.5543550635753,1314.6194684510278,2199.7027630168022,2288.532048428357,2940.477622955168,0,0,0,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,122.64599623224443,283.87546400167986,357.85406838119593,372.5337306938176,1138.5543550635753,1314.6194684510278,2199.7027630168022,2288.532048428357,2940.477622955168,0,0,0,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,122.64599623224443,283.87546400167986,357.85406838119593,372.5337306938176,1138.5543550635753,1314.6194684510278,2199.7027630168022,2288.532048428357,2940.477622955168,0,0,0,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
    {
      weekdayMask: 127,
      direction: "outbound",
      timeBands: [{ startMinutes: 390, endMinutes: 1350, intervalMinutes: 60 }],
      timingPoints: [
        { pointIndex: 18, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,689.7262111603551,753.9943126250388,1740,2766.9962114859773,2774.4824538301136,2889.7171990683155,3007.1492628454175,3041.239498853553,3120],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,689.7262111603551,753.9943126250388,1740,2766.9962114859773,2774.4824538301136,2889.7171990683155,3007.1492628454175,3041.239498853553,3120],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,689.7262111603551,753.9943126250388,1740,2766.9962114859773,2774.4824538301136,2889.7171990683155,3007.1492628454175,3041.239498853553,3120],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,689.7262111603551,753.9943126250388,1740,2766.9962114859773,2774.4824538301136,2889.7171990683155,3007.1492628454175,3041.239498853553,3120],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
  ],
};

export const AIR_VIA_GARROWHILL_EUROCENTRAL_SEED: SeedRoute = {
  number: "AIR",
  name: "via Garrowhill & Eurocentral",
  colour: "#00b6ed",
  orientation: "inbound",
  terminusIndex: 12,
  startIndex: 12,
  routeType: "long_distance",
  variationLetter: null,
  isMinorVariation: true,
  timingPointIndexes: [6, 17],
  pickupDropoffOverrides: [],
  points: [
    { kind: "stop", osmId: 502534132, lon: -3.363533690571785, lat: 55.94831100357902 },
    { kind: "stop", osmId: 7978835734, lon: -3.36069792509079, lat: 55.94305247890196 },
    { kind: "stop", osmId: 502534144, lon: -3.367109075188637, lat: 55.937610430334814 },
    { kind: "stop", osmId: 502534158, lon: -3.3897844702005386, lat: 55.93865995535401 },
    { kind: "stop", osmId: 502534161, lon: -3.397708386182785, lat: 55.938822949352755 },
    { kind: "waypoint", lon: -3.7018663, lat: 55.870498899999994 },
    { kind: "stop", osmId: 795828128, lon: -3.7596480175852776, lat: 55.86278174547519 },
    { kind: "waypoint", lon: -3.9841542999999997, lat: 55.8335185 },
    { kind: "stop", osmId: 1202158046, lon: -3.983481377363205, lat: 55.83420624606333 },
    { kind: "waypoint", lon: -4.0079043, lat: 55.837145299999996 },
    { kind: "stop", placedStop: { lon: -4.1087475, lat: 55.8533203, busLegal: true }, lon: -4.108747243881226, lat: 55.853320076696406 },
    { kind: "stop", osmId: 2089909639, lon: -4.107564389705658, lat: 55.85916497370749 },
    { kind: "stop", osmId: 5869396707, lon: -4.251807723194361, lat: 55.86518311322422 },
    { kind: "stop", osmId: 2089909638, lon: -4.107419215142727, lat: 55.85917419387425 },
    { kind: "stop", placedStop: { lon: -4.1095716, lat: 55.8538732, busLegal: true }, lon: -4.109571687877178, lat: 55.853873177858105 },
    { kind: "waypoint", lon: -4.0729887, lat: 55.846937999999994 },
    { kind: "stop", osmId: 1202158046, lon: -3.983481377363205, lat: 55.834206434350904 },
    { kind: "stop", osmId: 288159300, lon: -3.758551999926567, lat: 55.863951263132094 },
    { kind: "stop", osmId: 3364658968, lon: -3.3979980647563934, lat: 55.93910048824705 },
    { kind: "stop", osmId: 502529523, lon: -3.390674963593483, lat: 55.93892848196771 },
    { kind: "stop", osmId: 502529529, lon: -3.3662521094083786, lat: 55.937817558386996 },
    { kind: "stop", osmId: 7978835733, lon: -3.361101597547531, lat: 55.943523941907586 },
    { kind: "waypoint", lon: -3.3628715, lat: 55.9449933 },
    { kind: "stop", osmId: 502534132, lon: -3.363533690571785, lat: 55.94831109744638 },
  ],
  timetables: [
    {
      weekdayMask: 127,
      direction: "inbound",
      timeBands: [{ startMinutes: 1410, endMinutes: 330, intervalMinutes: 60 }],
      timingPoints: [
        { pointIndex: 17, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 23, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 6, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 12, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2032.8668895410553,2032.8668895410553,2169.8807124275813,2502.948185738039,2598.5258665232154,3300,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSeconds: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2032.8668895410553,2032.8668895410553,2169.8807124275813,2502.948185738039,2598.5258665232154,3300,0,0,0,0,0,0,0,0,0,0,0],
      arrivalOffsetsSecondsPeak: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2032.8668895410553,2032.8668895410553,2169.8807124275813,2502.948185738039,2598.5258665232154,3300,0,0,0,0,0,0,0,0,0,0,0],
      departureOffsetsSecondsPeak: [0,128.74560194968103,297.9935637069957,375.65137761722326,391.06110984588645,1195.1785651242728,1380,2032.8668895410553,2032.8668895410553,2169.8807124275813,2502.948185738039,2598.5258665232154,3300,0,0,0,0,0,0,0,0,0,0,0],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
    {
      weekdayMask: 127,
      direction: "outbound",
      timeBands: [{ startMinutes: 1410, endMinutes: 330, intervalMinutes: 60 }],
      timingPoints: [
        { pointIndex: 17, standardPaddingMinutes: 1, peakPaddingMinutes: null, dwellMinutes: 0 },
        { pointIndex: 23, standardPaddingMinutes: 0, peakPaddingMinutes: null, dwellMinutes: 0 },
      ],
      arrivalOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,673.3633112981956,736.1067316769908,959.747178671856,1260.6203386533266,1980,3006.9962114859773,3014.4824538301136,3129.7171990683155,3247.1492628454175,3281.239498853553,3360],
      departureOffsetsSeconds: [0,0,0,0,0,0,0,0,0,0,0,0,0,673.3633112981956,736.1067316769908,959.747178671856,1260.6203386533266,1980,3006.9962114859773,3014.4824538301136,3129.7171990683155,3247.1492628454175,3281.239498853553,3360],
      arrivalOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,673.3633112981956,736.1067316769908,959.747178671856,1260.6203386533266,1980,3006.9962114859773,3014.4824538301136,3129.7171990683155,3247.1492628454175,3281.239498853553,3360],
      departureOffsetsSecondsPeak: [0,0,0,0,0,0,0,0,0,0,0,0,0,673.3633112981956,736.1067316769908,959.747178671856,1260.6203386533266,1980,3006.9962114859773,3014.4824538301136,3129.7171990683155,3247.1492628454175,3281.239498853553,3360],
      excludedDepartureMinutes: [],
      customDepartureMinutes: [],
    },
  ],
};

// --- Driving the actual seeding --------------------------------------------
//
// Takes its real data-access calls as an injected `FixedContractSeedPorts`
// rather than calling `window.*` directly — the renderer (contracts-
// panel.ts) passes a real window-backed implementation, but this means the
// round-trip can also be exercised directly against electron/db.mts in a
// plain `node --experimental-strip-types` verify script (this project's own
// convention — no Electron/contextBridge available there), proving the
// embedded seed data really round-trips through the real schema rather
// than only compiling.
//
// Mirrors seedRealDealers' own idempotent-by-name convention
// (dealer-reference-pins.ts) but scoped per CONTRACT, not per route number
// alone — 398/Express 500's real numbers ("398"/"500") are plain numeric
// strings a player could otherwise choose for an ordinary route, so
// "already seeded" is checked by the CALLER against the Contracts menu's
// own acceptance record (window.fixedContracts.getAcceptance), never by
// scanning the route list for a matching number.
export interface FixedContractSeedPorts {
  createPlayerStop(lon: number, lat: number, busLegal: boolean): Promise<number>; // returns the new negative osmId
  createRoute(
    depotGroupId: number,
    number: string,
    points: RoutePoint[],
    orientation: "inbound" | "outbound",
    terminusIndex: number | null,
    startIndex: number | null,
    colour: string,
    name: string | null,
    parentRouteId: number | null,
    variationLetter: string | null,
    segments: RouteSegment[],
    routeType: SeedRouteType,
    isMinorVariation: boolean,
    timingPointIndexes: number[],
  ): Promise<number>; // returns the new route id
  setPickupDropoffOverride(routeId: number, pointIndex: number, value: "pickup_only" | "setdown_only" | "skip"): Promise<void>;
  upsertRouteTimetable(routeId: number, tt: SeedTimetableComponent): Promise<void>;
}

export interface SeededRouteResult {
  routeId: number;
  isParent: boolean;
}

// Creates one real player_stops row per DISTINCT placedStop position the
// whole seeding pass has seen so far, reusing the same new id for a
// position already created earlier in this same pass (AIR's two "via
// Garrowhill" detour points are shared between its two variations, same
// as in the real save this was extracted from).
async function resolvePlacedStopPoints(ports: FixedContractSeedPorts, points: readonly SeedRoutePoint[], cache: Map<string, number>): Promise<RoutePoint[]> {
  const resolved: RoutePoint[] = [];
  for (const point of points) {
    if (point.placedStop) {
      const key = `${point.placedStop.lon.toFixed(6)},${point.placedStop.lat.toFixed(6)}`;
      let osmId = cache.get(key);
      if (osmId === undefined) {
        osmId = await ports.createPlayerStop(point.placedStop.lon, point.placedStop.lat, point.placedStop.busLegal);
        cache.set(key, osmId);
      }
      resolved.push({ kind: "stop", osmId, lon: point.lon, lat: point.lat });
    } else {
      resolved.push({ kind: point.kind, osmId: point.osmId, lon: point.lon, lat: point.lat });
    }
  }
  return resolved;
}

async function createSeedRoute(ports: FixedContractSeedPorts, depotGroupId: number, seed: SeedRoute, parentRouteId: number | null, placedStopCache: Map<string, number>): Promise<SeededRouteResult> {
  const points = await resolvePlacedStopPoints(ports, seed.points, placedStopCache);
  const routeId = await ports.createRoute(
    depotGroupId,
    seed.number,
    points,
    seed.orientation,
    seed.terminusIndex,
    seed.startIndex,
    seed.colour,
    seed.name,
    parentRouteId,
    seed.variationLetter,
    [{ kind: "custom", points }],
    seed.routeType,
    seed.isMinorVariation,
    seed.timingPointIndexes,
  );
  for (const override of seed.pickupDropoffOverrides) {
    await ports.setPickupDropoffOverride(routeId, override.pointIndex, override.value);
  }
  for (const tt of seed.timetables) {
    await ports.upsertRouteTimetable(routeId, tt);
  }
  return { routeId, isParent: parentRouteId === null };
}

// Seeds 398, Airlink 100 or Express 500 (a single real route, no
// variations) into `depotGroupId` — called once, on Accept, by the
// Contracts menu.
export async function seedSingleFixedContractRoute(ports: FixedContractSeedPorts, depotGroupId: number, seed: SeedRoute): Promise<number[]> {
  const result = await createSeedRoute(ports, depotGroupId, seed, null, new Map());
  return [result.routeId];
}

// Seeds AIR's real parent route plus its two real minor variations, in the
// same relative order the live save itself used (parent first, so its new
// id exists for the children's own parentRouteId) — returns every created
// route id, parent first.
export async function seedAirFixedContractRoutes(ports: FixedContractSeedPorts, depotGroupId: number): Promise<number[]> {
  const placedStopCache = new Map<string, number>();
  const parent = await createSeedRoute(ports, depotGroupId, AIR_PARENT_SEED, null, placedStopCache);
  const viaGarrowhill = await createSeedRoute(ports, depotGroupId, AIR_VIA_GARROWHILL_SEED, parent.routeId, placedStopCache);
  const viaGarrowhillEurocentral = await createSeedRoute(ports, depotGroupId, AIR_VIA_GARROWHILL_EUROCENTRAL_SEED, parent.routeId, placedStopCache);
  return [parent.routeId, viaGarrowhill.routeId, viaGarrowhillEurocentral.routeId];
}

// Real window-backed implementation of FixedContractSeedPorts, for the
// Contracts menu (contracts-panel.ts) to pass in — the only place this
// module ever touches `window.*` directly.
export function windowFixedContractSeedPorts(): FixedContractSeedPorts {
  return {
    async createPlayerStop(lon, lat, busLegal) {
      const created = await window.playerStops.create(lon, lat, busLegal);
      return created.osmId;
    },
    async createRoute(depotGroupId, number, points, orientation, terminusIndex, startIndex, colour, name, parentRouteId, variationLetter, segments, routeType, isMinorVariation, timingPointIndexes) {
      const route = await window.routes.create(
        depotGroupId,
        number,
        points,
        orientation,
        terminusIndex,
        startIndex,
        colour,
        name,
        parentRouteId,
        variationLetter,
        [],
        [],
        segments,
        routeType as RouteType,
        isMinorVariation,
        timingPointIndexes,
      );
      return route.id;
    },
    async setPickupDropoffOverride(routeId, pointIndex, value) {
      await window.routes.setPickupDropoffOverride(routeId, pointIndex, value);
    },
    async upsertRouteTimetable(routeId, tt) {
      await window.routeTimetables.upsert(
        routeId,
        tt.weekdayMask,
        tt.direction,
        tt.timeBands,
        tt.timingPoints,
        tt.arrivalOffsetsSeconds,
        tt.departureOffsetsSeconds,
        tt.arrivalOffsetsSecondsPeak,
        tt.departureOffsetsSecondsPeak,
        tt.excludedDepartureMinutes,
        tt.customDepartureMinutes,
        null,
        null,
      );
    },
  };
}
