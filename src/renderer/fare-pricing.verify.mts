// Manual verification for fare-pricing.mts (DESIGN.md §9, Phase 4
// increment 2), run directly with `node --experimental-strip-types
// src/renderer/fare-pricing.verify.mts` or via the project's own tsx
// script runner.
import {
  citySingleFareGBPPence,
  countrySingleFareGBPPence,
  beyondDepotGroupSingleFareGBPPence,
  longDistanceSingleFareGBPPence,
  specialServiceSingleFareGBPPence,
  nightSurchargeGBPPence,
  returnFareGBPPence,
  type FareConfig,
} from "./fare-pricing.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok: ${message}`);
}

// Lothian's real day-single figures (DESIGN.md §9, "for reference"):
// country 1 zone £2.40, 2-3 zones £3.40, then £1/zone to £6.40 at 6
// zones — i.e. zones 4/5/6 are £4.40/£5.40/£6.40. The real "or 2 if A/B"
// exception (a specific zone pair, not a zone-count band) isn't
// representable by this exact-zone-count lookup, so it's left out of
// the config below, not silently misreproduced.
const lothianLikeConfig: FareConfig = {
  citySingleGBPPence: 240,
  countryZoneBands: [
    { zoneCount: 1, priceGBPPence: 240 },
    { zoneCount: 2, priceGBPPence: 340 },
    { zoneCount: 3, priceGBPPence: 340 },
    { zoneCount: 4, priceGBPPence: 440 },
    { zoneCount: 5, priceGBPPence: 540 },
    { zoneCount: 6, priceGBPPence: 640 },
  ],
  beyondDepotGroupPerMileGBPPence: 25,
  longDistanceBaseGBPPence: 150,
  longDistancePerMileGBPPence: 20,
  specialServiceSingleGBPPence: 500,
  nightExtraBaseGBPPence: 60,
  nightExtraPerZoneGBPPence: 30,
};

assert(citySingleFareGBPPence(lothianLikeConfig) === 240, "city single fare is the flat configured figure, £2.40");

assert(countrySingleFareGBPPence(lothianLikeConfig, 1) === 240, "country 1 zone matches Lothian's £2.40");
assert(countrySingleFareGBPPence(lothianLikeConfig, 2) === 340, "country 2 zones matches Lothian's £3.40 band");
assert(countrySingleFareGBPPence(lothianLikeConfig, 3) === 340, "country 3 zones matches Lothian's same £3.40 band");
assert(countrySingleFareGBPPence(lothianLikeConfig, 6) === 640, "country 6 zones matches Lothian's £6.40 (the £1/zone step from 3 to 6)");

let bandMissing = false;
try {
  countrySingleFareGBPPence(lothianLikeConfig, 9);
} catch {
  bandMissing = true;
}
assert(bandMissing, "an unconfigured zone-count band throws rather than silently returning 0");

assert(beyondDepotGroupSingleFareGBPPence(lothianLikeConfig, 10) === 250, "beyond-depot-group: 25p/mile x 10 miles = £2.50");
assert(longDistanceSingleFareGBPPence(lothianLikeConfig, 10) === 350, "long distance: £1.50 base + 20p/mile x 10 miles = £3.50");
assert(specialServiceSingleFareGBPPence(lothianLikeConfig) === 500, "special service is the flat configured figure, £5.00");

// Night surcharge is a plain player-set linear add-on (extra base + extra
// per zone), NOT forced to reproduce Lothian's own real night tiers
// exactly — those are independently-published 3-tier bands (1 / 2-3 / 4-6
// zones) that don't algebraically reduce to "day fare + 2 constants" in
// the first place, so this tests the mechanism with its own numbers
// rather than a false Lothian match.
assert(nightSurchargeGBPPence(lothianLikeConfig, 1) === 90, "night surcharge at 1 zone: 60p base + 30p x 1 = 90p");
assert(nightSurchargeGBPPence(lothianLikeConfig, 4) === 180, "night surcharge at 4 zones: 60p base + 30p x 4 = 180p");

let notConfigured = false;
try {
  citySingleFareGBPPence({ ...lothianLikeConfig, citySingleGBPPence: null });
} catch {
  notConfigured = true;
}
assert(notConfigured, "an unset fare throws rather than silently returning a nonsense number");

// Return: confirmed 2026-10-30, "1.6x a single rounded UP to the nearest
// 5p" — not rounded to nearest, and not left unrounded.
assert(returnFareGBPPence(240) === 385, "return on a £2.40 single: 240 x 1.6 = 384, rounds UP to £3.85, not down to £3.80");
assert(returnFareGBPPence(250) === 400, "return on a £2.50 single: 250 x 1.6 = 400 exactly, stays £4.00 (no unnecessary round-up)");
assert(returnFareGBPPence(340) === 545, "return on a £3.40 single: 340 x 1.6 = 544, rounds up to £5.45");

console.log("All fare-pricing checks passed.");
