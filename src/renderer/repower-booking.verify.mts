// Manual verification for repower-booking.mts (T179, OPEN-ITEMS.md), run
// directly with `node --experimental-strip-types src/renderer/repower-booking.verify.mts`.
import {
  REPOWER_MIN_AGE_YEARS,
  REPOWER_MAX_CONDITION,
  vehicleAgeYears,
  repowerEligibleByAgeOrCondition,
  repowerEligibleByOwnership,
  repowerUnlocked,
  repowerManufacturerFor,
  REPOWER_CONCURRENT_CAPACITY,
  REPOWER_TURNAROUND_WORKING_DAYS,
  scheduleRepowerBooking,
  repowerBasePriceGBP,
  repowerOptionsFor,
} from "./repower-booking.mts";
import { findVehicleModel } from "./vehicle-catalogue.mts";
import { SECONDS_PER_DAY } from "./game-clock.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Eligibility gate: confirmed as an OR, not an AND ---
// Day counts below are picked by checking the real Gregorian year
// vehicleAgeYears/repowerUnlocked actually land on (gameDateTimeFromSeconds,
// epoch day 0 = Year 1), not assumed from a flat 365-day year — both
// functions count a whole calendar YEAR NUMBER crossed, not an exact
// 365-day anniversary, so a flat "N x 365" guess lands a year short or
// long depending on where leap days fall.
assert(REPOWER_MIN_AGE_YEARS === 5, "the age gate is 5 years");
assert(REPOWER_MAX_CONDITION === 70, "the condition gate is under 70%");
assert(vehicleAgeYears(0, 1826) === 5, "a vehicle bought on day 0 (Year 1), now on day 1826 (Year 6), is 5 real years old");
assert(repowerEligibleByAgeOrCondition(0, 1826, 100), "5+ years old and still at 100% condition is still eligible (age alone qualifies it)");
assert(repowerEligibleByAgeOrCondition(0, 1, 50), "under a year old but below 70% condition is still eligible (condition alone qualifies it)");
assert(!repowerEligibleByAgeOrCondition(0, 1, 100), "neither old enough nor below condition — not eligible");
assert(!repowerEligibleByAgeOrCondition(0, 1095, 70), "exactly 70% condition does not itself qualify — the gate is 'under 70%', and Year 4 isn't old enough either (age 3)");

// --- 3-year, game-wide unlock ---
assert(!repowerUnlocked(730 * SECONDS_PER_DAY), "day 730 (Year 3) is still locked — the gate is Year 1 + 3 = Year 4");
assert(repowerUnlocked(1095 * SECONDS_PER_DAY), "day 1095 (Year 4) is unlocked");

// --- Manufacturer routing ---
assert(repowerManufacturerFor("volvo-9700") === "volvo", "a Volvo model re-powers at a Volvo dealer");
assert(repowerManufacturerFor("adl-enviro400") === "adl", "an ADL model re-powers at an ADL dealer");
assert(repowerManufacturerFor("wrightbus-streetdeck") === "wrightbus", "a Wrightbus model re-powers at a Wrightbus dealer");
assert(repowerManufacturerFor("evm-cityline") === "wrightbus", "the confirmed exception: evm-cityline (the Sprinter) re-powers at Wrightbus's NewPower, not at EVM");
let threw = false;
try {
  repowerManufacturerFor("mcv-evora");
} catch {
  threw = true;
}
assert(threw, "an unrecognised manufacturer prefix throws loudly rather than silently returning something wrong");

// --- Capacity: NewPower (Wrightbus) does nothing but conversions, so 4; everyone else 2 ---
assert(REPOWER_CONCURRENT_CAPACITY.wrightbus === 4, "Wrightbus's NewPower has 4 concurrent bays");
assert(REPOWER_CONCURRENT_CAPACITY.volvo === 2 && REPOWER_CONCURRENT_CAPACITY.adl === 2 && REPOWER_CONCURRENT_CAPACITY.evm === 2, "every other manufacturer's own single repower site has 2 concurrent bays");

// --- Scheduling: 3 working weeks ---
assert(REPOWER_TURNAROUND_WORKING_DAYS === 15, "re-power turnaround is 3 working weeks (15 working days)");
{
  const first = scheduleRepowerBooking(0, [], 1, [], Infinity);
  assert(first.startDay === 0, "first booking into an empty 1-bay site starts immediately");
  assert(first.completionDay - first.startDay > 15, "15 WORKING days (Mon-Fri only) spans more than 15 calendar days once a weekend falls inside it");
}

// --- Pricing: half the equivalent new price ---
{
  // evm-cityline @ 7.4m electric: base £75,000 + £50,000 power delta + £0
  // length delta = £125,000 new -> half = £62,500 re-powered.
  const evmCityline = findVehicleModel("evm-cityline")!;
  const price = repowerBasePriceGBP(evmCityline, 7.4, "electric");
  assert(price === 62_500, `evm-cityline's re-power price should be half of its £125,000 new electric price = £62,500, got ${price}`);
  assert(repowerBasePriceGBP(evmCityline, 7.4, "hydrogen") === null, "evm-cityline has no hydrogen variant at 7.4m, so its re-power price is null, not a wrong number");
  assert(repowerBasePriceGBP(evmCityline, 99, "electric") === null, "a length the model doesn't have at all also returns null");
}

{
  // repowerOptionsFor is a thin pass-through to generalOptionsFor — just
  // confirm it doesn't throw and returns an array for a real model/power.
  const evmCityline = findVehicleModel("evm-cityline")!;
  const options = repowerOptionsFor(evmCityline, "electric");
  assert(Array.isArray(options), "repowerOptionsFor returns an array of general options for a real model/power combination");
}

// --- Ownership restriction (2026-11-19, live request: "Re-powering
// can't be done on leased buses, only fully owned buses") ---
assert(repowerEligibleByOwnership("buy_outright") === true, "a fully-owned vehicle is eligible for re-power");
assert(repowerEligibleByOwnership("lease") === false, "a plain-leased vehicle is never eligible — it's never actually owned");
assert(
  repowerEligibleByOwnership("lease_to_own") === false,
  "a lease-to-own vehicle still mid-term is not yet eligible — db.mts's own recordLeaseBillingMonths flips payment_method to buy_outright the moment the real term completes, so by then this same check already reads true without any extra date math here",
);

console.log("\nAll repower-booking checks passed.");
