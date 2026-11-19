// Vehicle re-power booking (T179, OPEN-ITEMS.md, confirmed 2026-11-13
// across several rounds of live discussion) — converting an existing
// diesel bus to electric or hydrogen at its manufacturer's one
// designated site. Pure logic only, no DOM/IPC — same split as
// repaint-booking.mts, which this reuses the day-scheduling core of
// (workshop-booking.mts).
//
// Real-world grounding (Wrightbus's own "NewPower" programme literature,
// supplied directly by the user, not invented): priced at half the cost
// of an equivalent new electric bus, and the bus comes back "fully
// checked and repaired" — full condition. "Re-power," not "re-fit," is
// the user's own corrected term.
import { generalOptionsFor, priceFor, type GeneralOption, type PowerType, type VehicleModel } from "./vehicle-catalogue.mts";
import { gameDateTimeFromSeconds, SECONDS_PER_DAY } from "./game-clock.mts";
import { scheduleBooking, type BookingWindow } from "./workshop-booking.mts";

export type { BookingWindow } from "./workshop-booking.mts";

// --- Eligibility gate (confirmed: either one qualifies it) ---

export const REPOWER_MIN_AGE_YEARS = 5;
export const REPOWER_MAX_CONDITION = 70;

// Calendar-correct (reuses the real Gregorian conversion already proven
// for the 3-year unlock gate below) rather than a flat day-count, which
// would drift against leap years over a long game.
export function vehicleAgeYears(boughtGameDay: number, nowGameDay: number): number {
  const boughtYear = gameDateTimeFromSeconds(boughtGameDay * SECONDS_PER_DAY).year;
  const nowYear = gameDateTimeFromSeconds(nowGameDay * SECONDS_PER_DAY).year;
  return nowYear - boughtYear;
}

export function repowerEligibleByAgeOrCondition(boughtGameDay: number, nowGameDay: number, condition: number): boolean {
  return condition < REPOWER_MAX_CONDITION || vehicleAgeYears(boughtGameDay, nowGameDay) >= REPOWER_MIN_AGE_YEARS;
}

// Real restriction, added 2026-11-19 (live request: "Re-powering can't be
// done on leased buses, only fully owned buses"). A plain `lease` vehicle
// is never actually owned — billed monthly for real (T185/lease billing
// history) until returned or bought out, so re-powering it would mean
// permanently modifying a vehicle the operator doesn't keep. A
// `lease_to_own` vehicle DOES become genuinely owned automatically once
// its real 60-month term completes — db.mts's `recordLeaseBillingMonths`
// flips `vehicles.payment_method` to `'buy_outright'` in that same real
// write, so by the time that's happened this already reads
// `"buy_outright"` here; nothing extra needs computing for the "has the
// term actually completed" case; it's already reflected in the real
// stored value.
export function repowerEligibleByOwnership(paymentMethod: PaymentMethod): boolean {
  return paymentMethod === "buy_outright";
}

// --- 3-year, game-wide unlock (confirmed: 3 years after the game itself
// started, not per-vehicle) ---

export function repowerUnlocked(accumulatedGameSeconds: number): boolean {
  return gameDateTimeFromSeconds(accumulatedGameSeconds).year >= gameDateTimeFromSeconds(0).year + 3;
}

// --- Manufacturer routing (confirmed exception: Sprinters re-power at
// Wrightbus's NewPower, not EVM — new purchase is unaffected) ---

// Explicit by model id prefix, same "explicit rather than inferred from
// a string" reasoning fleet-numbering.mts's own BROAD_CLASS_BY_MODEL_ID
// and vehicle-catalogue.mts's own MANUFACTURER_DISPLAY_NAME_BY_PREFIX
// already use — a manufacturer's real DEALER identity (DealerManufacturer)
// isn't always the same closed set as its catalogue display name (MCV
// has a display name but no dealer entry at all, a pre-existing gap;
// irrelevant here since mcv-evora has no electric/hydrogen variant yet).
const REPOWER_MANUFACTURER_BY_MODEL_PREFIX: Record<string, DealerManufacturer> = {
  volvo: "volvo",
  adl: "adl",
  wrightbus: "wrightbus",
  yutong: "yutong", // unreachable now that yutong-e10-e12/yutong-coach are fully removed (T181) — kept because the yutong dealer/manufacturer entity itself still exists
  evm: "evm",
};

// Confirmed exception: evm-cityline ("Sprinters") re-powers at
// Wrightbus's own NewPower site, not EVM's — new purchase is unaffected,
// this override only ever applies to the re-power flow.
const REPOWER_SITE_OVERRIDE_BY_MODEL_ID: Partial<Record<string, DealerManufacturer>> = {
  "evm-cityline": "wrightbus",
};

export function repowerManufacturerFor(modelId: string): DealerManufacturer {
  const override = REPOWER_SITE_OVERRIDE_BY_MODEL_ID[modelId];
  if (override) return override;
  const prefix = modelId.split("-")[0];
  const manufacturer = REPOWER_MANUFACTURER_BY_MODEL_PREFIX[prefix];
  if (!manufacturer) throw new Error(`repower-booking.mts: unrecognised manufacturer prefix "${prefix}" in model id "${modelId}" — add it to REPOWER_MANUFACTURER_BY_MODEL_PREFIX`);
  return manufacturer;
}

// --- Capacity (confirmed: 2 concurrent per manufacturer, except
// Wrightbus's NewPower — it does nothing but conversions, so 4) ---

export const REPOWER_CONCURRENT_CAPACITY: Record<DealerManufacturer, number> = {
  volvo: 2,
  adl: 2,
  wrightbus: 4,
  evm: 2,
  yutong: 2, // unreachable now that yutong-e10-e12/yutong-coach are fully removed (T181) — kept so a Record<DealerManufacturer, ...> lookup never silently falls through to undefined
};

// --- Turnaround: 3 working weeks (confirmed: Monday-Friday only) ---

export const REPOWER_TURNAROUND_WORKING_DAYS = 15;

export function scheduleRepowerBooking(
  todayDayIndex: number,
  siteBookings: readonly BookingWindow[],
  siteConcurrentCapacity: number,
  groupCapBookings: readonly BookingWindow[],
  groupAwayCap: number,
): BookingWindow {
  return scheduleBooking(todayDayIndex, REPOWER_TURNAROUND_WORKING_DAYS, siteBookings, siteConcurrentCapacity, groupCapBookings, groupAwayCap);
}

// --- Price: half the cost of the equivalent new electric/hydrogen bus,
// plus any selected general options at their normal (un-halved) rate —
// matching NewPower's own "refurbishment is a separate option" framing.
// `selectedGeneralOptionIds` picks among whichever options
// generalOptionsFor(model, toPowerType) actually offers (battery size,
// pantograph charging, etc.) — the same options/pricing the Configure
// screen already offers at new purchase, just applied at re-power time
// instead. Dropdown options (battery/hydrogen-tank size) aren't priced
// here at all — their real figure lives on the chosen EnergyOption's own
// priceDeltaGBP (vehicle-catalogue.mts), same as at new purchase; the
// caller resolves that choice and adds it on top of this function's own
// result. Returns null if the model has no matching length/power variant
// at all (shouldn't be reachable once the caller has already checked
// repowerTargetsFor, but a clear null beats a wrong number).
export function repowerBasePriceGBP(model: VehicleModel, currentLengthM: number, toPowerType: PowerType): number | null {
  const targetLength = model.lengths.find((l) => l.lengthM === currentLengthM && l.powerType === toPowerType);
  if (!targetLength) return null;
  const newPrice = priceFor(model, targetLength);
  if (newPrice === null) return null;
  return Math.round(newPrice / 2);
}

export function repowerOptionsFor(model: VehicleModel, toPowerType: PowerType): GeneralOption[] {
  return generalOptionsFor(model, toPowerType);
}
