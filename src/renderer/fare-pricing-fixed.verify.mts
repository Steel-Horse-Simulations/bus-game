// Manual verification for fare-pricing-fixed.mts (DESIGN.md §9's
// 2026-11-01/11-05 rework), run directly with
// `node --experimental-strip-types src/renderer/fare-pricing-fixed.verify.mts`.
// Every assertion below checks against a real figure DESIGN.md itself
// records, not an invented example — the point of this file is proving
// the formulas reproduce the real grounding data exactly (or, where the
// doc itself flags something as an approximation, reproduce the doc's
// own worked approximation exactly).
import {
  CITY_SINGLE_GBP_PENCE,
  TOWN_SINGLE_GBP_PENCE,
  countryOrIslandSingleFareGBPPence,
  returnFareGBPPence,
  cityNightSingleFareGBPPence,
  countryOrIslandNightSingleFareGBPPence,
  countryZoneCountSingleFareGBPPence,
  countryZoneCountNightSingleFareGBPPence,
  childFareGBPPence,
  networkFareGBPPence,
  tierCapFigures,
  AIRPORT_EXPRESS_SINGLE_GBP_PENCE,
  AIRPORT_EXPRESS_RETURN_GBP_PENCE,
  AIRPORT_EXPRESS_FAMILY_RETURN_GBP_PENCE,
} from "./fare-pricing-fixed.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Single fares ---
assert(CITY_SINGLE_GBP_PENCE === 240, "City single is the real Lothian £2.40");
assert(TOWN_SINGLE_GBP_PENCE === 200, "Town single is the confirmed flat £2.00");

// The real Portree-Armadale check DESIGN.md itself measured: 41.70 real
// miles, £2.00 base + 20p/mile should land within 2% of the real £10.50.
{
  const miles = 41.7;
  const pence = countryOrIslandSingleFareGBPPence(miles);
  assert(pence === 1034, `Country/Island single at 41.70 miles should be £10.34 (200 + round(20*41.70)), got ${pence}p`);
  const realPence = 1050;
  const diffPercent = (Math.abs(pence - realPence) / realPence) * 100;
  assert(diffPercent < 2, `the formula's £10.34 should land within 2% of the real £10.50, got ${diffPercent.toFixed(2)}%`);
}

assert(AIRPORT_EXPRESS_SINGLE_GBP_PENCE === 600 && AIRPORT_EXPRESS_RETURN_GBP_PENCE === 850, "Airport Express Single/Return are the real Lothian Airlink figures (£6.00/£8.50)");
assert(AIRPORT_EXPRESS_FAMILY_RETURN_GBP_PENCE === 2200, "Airport Express Family Return is the real Airlink figure (£22.00)");

// --- Country Single/Night by real zone count (confirmed 2026-11-12
// against reference/Fares & Tickets - Lothian Countrry.pdf) ---
const REAL_ZONE_COUNT_SINGLE_GBP_PENCE: [number, number][] = [
  [1, 240],
  [2, 340],
  [3, 340],
  [4, 440],
  [5, 540],
  [6, 640],
];
for (const [zoneCount, expectedPence] of REAL_ZONE_COUNT_SINGLE_GBP_PENCE) {
  assert(
    countryZoneCountSingleFareGBPPence(zoneCount) === expectedPence,
    `Country Single at ${zoneCount} zone(s) should be the real £${(expectedPence / 100).toFixed(2)}, got ${countryZoneCountSingleFareGBPPence(zoneCount)}p`,
  );
}
// Beyond the real table: continues the same +£1.00-per-zone step already
// visible from zone 3 onward.
assert(countryZoneCountSingleFareGBPPence(7) === 740, "7 zones should continue the real +£1.00-per-zone step to £7.40");
assert(countryZoneCountSingleFareGBPPence(8) === 840, "8 zones should continue the real +£1.00-per-zone step to £8.40");

const REAL_ZONE_COUNT_NIGHT_GBP_PENCE: [number, number][] = [
  [1, 350],
  [2, 550],
  [3, 550],
  [4, 850],
  [5, 850],
  [6, 850],
];
for (const [zoneCount, expectedPence] of REAL_ZONE_COUNT_NIGHT_GBP_PENCE) {
  assert(
    countryZoneCountNightSingleFareGBPPence(zoneCount) === expectedPence,
    `Country Night Single at ${zoneCount} zone(s) should be the real £${(expectedPence / 100).toFixed(2)}, got ${countryZoneCountNightSingleFareGBPPence(zoneCount)}p`,
  );
}
// Night's own top band is already flat (4-6 all £8.50), with no per-zone
// step to extrapolate — 7+ simply continues at the same flat figure.
assert(countryZoneCountNightSingleFareGBPPence(7) === 850, "7 zones at night should stay at the flat £8.50 top band, not scale up");

// --- Return (sanity check, unchanged formula) ---
assert(returnFareGBPPence(240) === 385, "1.6x £2.40 (£3.84) rounds UP to the nearest 5p (£3.85), not down to £3.80");

// --- Night extras ---
assert(cityNightSingleFareGBPPence() === 350, "City Night Single should be the real £3.50 (£2.40 + the real £1.10 extra)");

// DESIGN.md's own worked check: "assuming that band sits around 7 miles
// out, this formula gives £5.90 — about 7% over" the real £5.50.
{
  const pence = countryOrIslandNightSingleFareGBPPence(7);
  assert(pence === 590, `Country/Island Night at 7 miles should match DESIGN.md's own worked £5.90, got ${(pence / 100).toFixed(2)}`);
  const realPence = 550;
  const diffPercent = ((pence - realPence) / realPence) * 100;
  assert(Math.abs(diffPercent - 7) < 1, `should be "about 7% over" the real £5.50 as DESIGN.md itself says, got ${diffPercent.toFixed(1)}%`);
}

// --- Child fare: every real figure DESIGN.md lists, all exactly 50% ---
const CHILD_CASES: [number, number][] = [
  [240, 120], // City Single £2.40 -> £1.20
  [600, 300], // City DAY £6.00 -> £3.00
  [630, 315], // Country DAY £6.30 -> £3.15
  [960, 480], // Combined DAY £9.60 -> £4.80
  [1400, 700], // NETWORK £14.00 -> £7.00
  [600, 300], // Airport Single £6.00 -> £3.00
  [850, 425], // Airport Return £8.50 -> £4.25
];
for (const [adult, expectedChild] of CHILD_CASES) {
  assert(childFareGBPPence(adult) === expectedChild, `Child fare for an adult price of £${(adult / 100).toFixed(2)} should be £${(expectedChild / 100).toFixed(2)}`);
}

// --- NETWORK: the real grounding check (£14.00 from City DAY £6.00 at
// the fixed 133% markup) — the function is meant to be called with the
// COMBINED price in real gameplay, but this is the one real number
// DESIGN.md actually checked the 133% constant against, so it's what
// this test reproduces.
assert(networkFareGBPPence(600) === 1400, "the fixed 133% markup on £6.00 should reproduce the real NETWORK grounding figure of £14.00 exactly");

// --- Capping: the three tiers' real figures, and their real Day-to-Week ratios ---
const city = tierCapFigures("city");
assert(city.dayWalkupGBPPence === 600 && city.dayCapGBPPence === 570 && city.lateGBPPence === 550 && city.weekCapGBPPence === 2650, "City tier matches the real Lothian figures exactly");
const country = tierCapFigures("country");
assert(country.dayWalkupGBPPence === 630 && country.dayCapGBPPence === 620 && country.lateGBPPence === 620 && country.weekCapGBPPence === 2500, "Country tier matches the real Lothian figures exactly");
const combined = tierCapFigures("combined");
assert(combined.dayWalkupGBPPence === 960 && combined.dayCapGBPPence === 930 && combined.lateGBPPence === 930 && combined.weekCapGBPPence === 3850, "Combined tier matches the real Lothian figures exactly");

function dayToWeekRatio(tier: ReturnType<typeof tierCapFigures>): number {
  return tier.weekCapGBPPence / tier.dayWalkupGBPPence;
}
assert(Math.abs(dayToWeekRatio(city) - 4.41667) < 0.001, `City's own Day-to-Week ratio should be ~4.42x, got ${dayToWeekRatio(city).toFixed(5)}`);
assert(Math.abs(dayToWeekRatio(country) - 3.96825) < 0.001, `Country's own Day-to-Week ratio should be ~3.97x, got ${dayToWeekRatio(country).toFixed(5)}`);
assert(Math.abs(dayToWeekRatio(combined) - 4.01042) < 0.001, `Combined's own Day-to-Week ratio should be ~4.01x, got ${dayToWeekRatio(combined).toFixed(5)}`);

console.log("\nAll fare-pricing-fixed checks passed.");
