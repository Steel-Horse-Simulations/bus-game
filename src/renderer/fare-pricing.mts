// Fare pricing (DESIGN.md §9, Phase 4 increment 2 of the fares build) —
// pure calculation only, no persistence or UI yet (that's increment 2b).
// Every rate here is PLAYER-SET per depot group (DESIGN.md: "bands set by
// the player"), except the Return multiplier, which the user confirmed as
// a fixed game constant, not a setting (2026-10-30): "Return is 1.6x a
// single rounded up to the nearest 5p."
//
// Amounts are always whole PENCE (integers) — DESIGN.md's own worked
// examples need penny precision (£2.40, £6.30), and this project already
// hit a real floating-point rounding bug once from doing currency maths
// in pounds as floats (T99, the 0.5%-per-10cm length pricing) — storing
// pence as integers avoids that class of bug entirely here.
//
// The "journey crosses between city and country zones" rule (DESIGN.md:
// "the higher base price applies, then the additional price for the type
// of zone being travelled through") is NOT implemented yet — the spec's
// own wording doesn't pin down a precise formula, and guessing one here
// risks baking in a wrong interpretation. Flagged as a known gap, not
// silently assumed.

export interface CountryZoneBand {
  zoneCount: number; // exact zone count this price applies to, e.g. 1, 2, 3
  priceGBPPence: number;
}

export interface FareConfig {
  citySingleGBPPence: number | null;
  countryZoneBands: CountryZoneBand[]; // player-entered, one row per exact zone count
  beyondDepotGroupPerMileGBPPence: number | null;
  longDistanceBaseGBPPence: number | null;
  longDistancePerMileGBPPence: number | null;
  specialServiceSingleGBPPence: number | null;
  nightExtraBaseGBPPence: number | null;
  nightExtraPerZoneGBPPence: number | null;
}

function requirePence(value: number | null, what: string): number {
  if (value === null) throw new Error(`fare-pricing: ${what} is not set for this depot group yet`);
  return value;
}

// Flat fare, no zone counting (DESIGN.md §9 "Within a city zone group").
export function citySingleFareGBPPence(config: FareConfig): number {
  return requirePence(config.citySingleGBPPence, "the city single fare");
}

// Banded by exact zone count (DESIGN.md §9 "Within a country zone group").
// Real Lothian pricing has at least one exception that doesn't reduce to a
// plain zone-count lookup (a specific zone pair priced as if 1 zone rather
// than 2) — not representable here, since this models bands by zone COUNT
// only, not by which specific zones are involved. Flagged as a known
// simplification, not a bug: DESIGN.md itself presents Lothian's figures
// as "for reference", not as a quirk the game must reproduce exactly.
export function countrySingleFareGBPPence(config: FareConfig, zoneCount: number): number {
  const band = config.countryZoneBands.find((b) => b.zoneCount === zoneCount);
  if (!band) throw new Error(`fare-pricing: no country zone band set for ${zoneCount} zone(s)`);
  return band.priceGBPPence;
}

// DESIGN.md §9 "Beyond the originating depot group": fixed price per mile,
// no base fare — genuinely separate from the long-distance rule below
// (confirmed 2026-10-30, not the same rule read two ways).
export function beyondDepotGroupSingleFareGBPPence(config: FareConfig, miles: number): number {
  const rate = requirePence(config.beyondDepotGroupPerMileGBPPence, "the beyond-depot-group per-mile rate");
  return Math.round(rate * miles);
}

// DESIGN.md §9 "Long-distance services: no zones — base fare plus price
// per mile."
export function longDistanceSingleFareGBPPence(config: FareConfig, miles: number): number {
  const base = requirePence(config.longDistanceBaseGBPPence, "the long-distance base fare");
  const perMile = requirePence(config.longDistancePerMileGBPPence, "the long-distance per-mile rate");
  return base + Math.round(perMile * miles);
}

// DESIGN.md §9 "Special services (e.g. airport): flat fare regardless of
// zones" — a player-flagged special service (distinct from a real fixed
// contract like AIR/Airlink 100, which already has its own hardcoded real
// fares elsewhere and doesn't go through this at all).
export function specialServiceSingleFareGBPPence(config: FareConfig): number {
  return requirePence(config.specialServiceSingleGBPPence, "the special-service flat fare");
}

// DESIGN.md §9 "Night services add an extra base fee and an extra
// per-zone fee, both set by the player" — added on top of whatever the
// base single fare for that journey already is (city, country, etc.),
// not a replacement for it.
export function nightSurchargeGBPPence(config: FareConfig, zoneCount: number): number {
  const extraBase = requirePence(config.nightExtraBaseGBPPence, "the night extra base fee");
  const extraPerZone = requirePence(config.nightExtraPerZoneGBPPence, "the night extra per-zone fee");
  return extraBase + extraPerZone * zoneCount;
}

// Fixed game constant (confirmed by the user, 2026-10-30), not a
// per-depot-group setting: "Return is 1.6x a single rounded up to the
// nearest 5p." Rounding up (not to nearest) is deliberate — confirmed
// wording, not assumed.
const RETURN_MULTIPLIER = 1.6;
const FIVE_PENCE = 5;

export function returnFareGBPPence(singleFareGBPPence: number): number {
  return Math.ceil((singleFareGBPPence * RETURN_MULTIPLIER) / FIVE_PENCE) * FIVE_PENCE;
}
