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
  airportExpressSingleGBPPence: number | null;
  airportExpressReturnGBPPence: number | null;
  nightExtraBaseGBPPence: number | null;
  nightExtraPerZoneGBPPence: number | null;
  sightseeingDayGBPPence: number | null;
  sightseeingSingleGBPPence: number | null;
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

// Airport Express (DESIGN.md §9's "special services (e.g. airport)",
// narrowed to specifically the player-flaggable airport route type —
// DESIGN.md §10 — confirmed 2026-10-31; distinct from a real fixed
// contract like AIR/Airlink 100, which already has its own hardcoded real
// fares elsewhere and doesn't go through this at all). Single and Return
// are both independently player-set — NOT the standard 1.6x Return
// multiplier below, since AIR's own real fares (§10) don't follow that
// ratio either (Single £6, Return £8.50 — 1.4167x, not 1.6x), confirming
// Airport Express's own Return genuinely needs its own figure.
export function airportExpressSingleFareGBPPence(config: FareConfig): number {
  return requirePence(config.airportExpressSingleGBPPence, "the Airport Express single fare");
}

export function airportExpressReturnFareGBPPence(config: FareConfig): number {
  return requirePence(config.airportExpressReturnGBPPence, "the Airport Express return fare");
}

// DESIGN.md §9 "Sightseeing tickets... a separate ticket type from the
// ordinary families, sold in two forms at different prices: a hop-on
// hop-off day ticket and a single trip round the loop. Sightseeing fares
// sit outside the zone system and outside capping" — both independently
// player-set, no formula.
export function sightseeingDayFareGBPPence(config: FareConfig): number {
  return requirePence(config.sightseeingDayGBPPence, "the sightseeing hop-on hop-off day ticket");
}

export function sightseeingSingleFareGBPPence(config: FareConfig): number {
  return requirePence(config.sightseeingSingleGBPPence, "the sightseeing single-trip fare");
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

const FIVE_PENCE = 5;

// Shared by the Return formula and the NETWORK markup below — both round
// UP (never to nearest, never down) to the nearest 5p, per the user's own
// confirmed wording for each.
function roundUpToNearest5pGBPPence(amountGBPPence: number): number {
  return Math.ceil(amountGBPPence / FIVE_PENCE) * FIVE_PENCE;
}

// Fixed game constant (confirmed by the user, 2026-10-30), not a
// per-depot-group setting: "Return is 1.6x a single rounded up to the
// nearest 5p." Rounding up (not to nearest) is deliberate — confirmed
// wording, not assumed.
const RETURN_MULTIPLIER = 1.6;

export function returnFareGBPPence(singleFareGBPPence: number): number {
  return roundUpToNearest5pGBPPence(singleFareGBPPence * RETURN_MULTIPLIER);
}

// NETWORK (confirmed 2026-10-31): not an independently player-set price —
// "city+country and Airport Express rolled into one as a separate more
// expensive ticket... a percentage more than city+country... rounded up
// to the nearest 5p... the same percentage on all types of ticket, day
// 7-day etc." So NETWORK's own Day/Weekly prices (28-day tickets dropped
// entirely, 2026-10-31) are each COMPUTED from the matching Combined
// (city+country) price, times one
// player-set markup percentage, not typed in directly — the "Airport
// Express rolled in" part is a coverage statement (a NETWORK ticket also
// covers Airport Express services), not a pricing input: the formula only
// ever reads the Combined price and the percentage, never Airport
// Express's own fares.
export function networkFareGBPPence(combinedFareGBPPence: number, markupPercent: number): number {
  return roundUpToNearest5pGBPPence(combinedFareGBPPence * (1 + markupPercent / 100));
}

// Town zones (T107, confirmed 2026-10-31): never independently priced —
// always exactly 70% of the parent Country/Island zone's own matching
// 1-zone figure (its banded single, or its Day/Weekly), rounded up
// to the nearest 5p, the same convention as Return and NETWORK above. Once
// a journey leaves the town and crosses into/through other zones, the town
// has no effect on zone-counting at all — it always just counts as 1 zone
// of its parent; that's a future RAPTOR-journey-planner concern (Phase 4's
// planner doesn't exist yet), not something this function needs to model.
export function townFareGBPPence(parentOneZoneFareGBPPence: number): number {
  return roundUpToNearest5pGBPPence(parentOneZoneFareGBPPence * 0.7);
}
