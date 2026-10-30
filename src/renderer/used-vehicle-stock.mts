// Used-vehicle listings for the buy menu's Used screen. The PRICE formula
// is now real (OPERATIONS.md §3 "Condition", confirmed 2026-10-30): new
// price falls 10% per year of age to a floor of 20% of new price, then
// that figure is scaled by the vehicle's own condition. The CONDITION
// formula itself, and the age range a listing is drawn from, are still
// placeholders — no real formula for either has been confirmed, so
// nothing here is persisted to the save (regenerating it is free, there's
// nothing real to lose). A fixed seed per model/slot keeps the same
// listings showing on every panel open, rather than reshuffling on every
// render (which would let the player "refresh for a better price").
import { VEHICLE_MODELS, priceFor, lengthsForPower, type VehicleModel, type LengthVariant, type PowerType } from "./vehicle-catalogue.mts";
import { generatePlate } from "./fleet-numbering.mts";

// Deterministic PRNG (mulberry32) seeded from a plain string hash — the
// same injectable-rng shape fleet-numbering.mts's own generatePlate
// already uses, just seeded instead of defaulting to Math.random.
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export interface UsedListing {
  key: string; // stable id for this listing, e.g. "adl-enviro400:0"
  vehicle: VehicleModel;
  length: LengthVariant;
  powerType: PowerType;
  ageYears: number;
  condition: number; // 0-100, placeholder formula
  usedPriceGBP: number;
  newPriceGBP: number;
  plate: string;
  manufacturerLon: number;
  manufacturerLat: number;
}

// Two listings per sellable model (different ages), skipping donor-priced
// vehicles (no base price of their own) the same way the new-vehicle buy
// flow already does.
export function generateUsedListings(): UsedListing[] {
  const listings: UsedListing[] = [];
  for (const vehicle of VEHICLE_MODELS) {
    if (vehicle.basePriceGBP === null) continue;
    for (let slot = 0; slot < 2; slot++) {
      const rng = seededRng(`${vehicle.id}:${slot}`);
      const powerType = vehicle.powerOptions[0].powerType;
      const lengths = lengthsForPower(vehicle, powerType);
      const length = lengths[Math.floor(rng() * lengths.length)];
      const newPriceGBP = priceFor(vehicle, length);
      if (newPriceGBP === null) continue;

      // Age range and condition formula are still placeholders (see
      // header note): 2-8 years old, condition falls roughly 8 points per
      // year with some noise, floor 20.
      const ageYears = 2 + rng() * 6;
      const condition = Math.max(20, Math.round(100 - ageYears * 8 - rng() * 10));
      // Real price formula (OPERATIONS.md §3 "Condition"): 10%/year
      // depreciation, floor 20% of new price, then scaled by condition.
      const ageDepreciationFactor = Math.max(0.2, 1 - 0.1 * ageYears);
      const usedPriceGBP = Math.round((newPriceGBP * ageDepreciationFactor * (condition / 100)) / 100) * 100;

      const boughtAt = new Date();
      boughtAt.setFullYear(boughtAt.getFullYear() - Math.floor(ageYears));
      // Reuse an existing real plate-area coordinate (Edinburgh) as a
      // stand-in "where this used example currently sits" — real dealer
      // positions exist elsewhere in the game but aren't threaded through
      // here, since this whole screen is placeholder data regardless.
      const lon = -3.1883;
      const lat = 55.9533;
      const plate = generatePlate(lon, lat, boughtAt, rng);

      listings.push({
        key: `${vehicle.id}:${slot}`,
        vehicle,
        length,
        powerType,
        ageYears: Math.round(ageYears * 10) / 10,
        condition,
        usedPriceGBP,
        newPriceGBP,
        plate,
        manufacturerLon: lon,
        manufacturerLat: lat,
      });
    }
  }
  return listings;
}
