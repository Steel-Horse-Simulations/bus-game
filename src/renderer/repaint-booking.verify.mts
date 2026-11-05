// Manual verification for repaint-booking.mts (OPERATIONS.md §5), run
// directly with `node --experimental-strip-types src/renderer/repaint-booking.verify.mts`.
import {
  nextWorkingDay,
  lastWorkingDay,
  scheduleRepaintBooking,
  fullRepaintBasePriceGBP,
  simpleRepaintBasePriceGBP,
  SIMPLE_REPAINT_TURNAROUND_DAYS,
  repaintBulkDiscountPercent,
  applyDiscount,
  FULL_REPAINT_PRICE_GBP,
  type BookingWindow,
} from "./repaint-booking.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// Day indices follow game-clock.mts's own epoch: day 0 is a Monday, so
// 0-4 is Mon-Fri, 5-6 is Sat-Sun, 7 is the next Monday.

// --- nextWorkingDay ---
assert(nextWorkingDay(0) === 0, "a Monday is already a working day");
assert(nextWorkingDay(4) === 4, "a Friday is already a working day");
assert(nextWorkingDay(5) === 7, "a Saturday rolls forward to the next Monday");
assert(nextWorkingDay(6) === 7, "a Sunday rolls forward to the next Monday");

// --- lastWorkingDay ---
assert(lastWorkingDay(0, 5) === 4, "5 working days from Monday ends on Friday the same week");
assert(lastWorkingDay(0, 1) === 0, "a 1-day job starts and finishes the same day");
assert(lastWorkingDay(3, 5) === 9, "5 working days from Thursday spans the weekend to the following Wednesday");

// --- scheduleRepaintBooking: shop concurrent capacity queues a booking ---
{
  const first = scheduleRepaintBooking(0, 5, [], 1, [], Infinity);
  assert(first.startDay === 0 && first.completionDay === 4, "first booking into an empty 1-bay shop starts immediately, Mon-Fri");

  const second = scheduleRepaintBooking(0, 5, [first], 1, [], Infinity);
  assert(second.startDay === 7 && second.completionDay === 11, "a second booking at the same single-bay shop queues to start right after the first finishes");

  const thirdWithTwoBays = scheduleRepaintBooking(0, 5, [first], 2, [], Infinity);
  assert(thirdWithTwoBays.startDay === 0, "a 2-bay shop can start a second booking the same day as the first");
}

// --- scheduleRepaintBooking: depot-group "two away at once" cap queues even with shop capacity free ---
{
  const a: BookingWindow = { startDay: 0, completionDay: 4 };
  const b: BookingWindow = { startDay: 0, completionDay: 4 };
  // Plenty of shop capacity (10 bays), but the group already has 2 vehicles away.
  const third = scheduleRepaintBooking(0, 5, [a, b], 10, [a, b], 2);
  assert(third.startDay === 7, "a third vehicle from a depot group already at its 2-away cap queues even though the shop has free bays");
}

// --- pricing: the real table, by category/model ---
assert(fullRepaintBasePriceGBP("evm-cityline") === FULL_REPAINT_PRICE_GBP.minibus, "Minibus category prices as a small bus (£1,500)");
assert(fullRepaintBasePriceGBP("adl-enviro200") === FULL_REPAINT_PRICE_GBP.singleDeck, "Single-deckers/midibuses category prices as single deck (£2,000)");
assert(fullRepaintBasePriceGBP("adl-enviro400") === FULL_REPAINT_PRICE_GBP.doubleDeckOrSingleDeckCoach, "Double-deckers category prices as double deck (£2,500)");
assert(fullRepaintBasePriceGBP("volvo-9700") === FULL_REPAINT_PRICE_GBP.doubleDeckOrSingleDeckCoach, "a single-deck coach (Volvo 9700) prices the same as a double-decker (£2,500)");
assert(fullRepaintBasePriceGBP("volvo-9700dd") === FULL_REPAINT_PRICE_GBP.doubleDeckCoach, "the Volvo 9700DD double-deck coach is the one model priced at £3,000");

assert(simpleRepaintBasePriceGBP("adl-enviro400") === Math.round(2500 / 3), "a simple repaint costs a third of the full price, rounded");
assert(SIMPLE_REPAINT_TURNAROUND_DAYS === 2, "a simple repaint uses the longer end of the real '1-2 days' figure");

// --- bulk discount ---
assert(repaintBulkDiscountPercent(1) === 0, "a single-vehicle order gets no discount");
assert(repaintBulkDiscountPercent(2) === 2, "2 vehicles: 2% (1 additional x 2%)");
assert(repaintBulkDiscountPercent(3) === 4, "3 vehicles: 4%");
assert(repaintBulkDiscountPercent(6) === 10, "6 vehicles reaches the 10% cap (5 additional x 2%)");
assert(repaintBulkDiscountPercent(20) === 10, "the discount never exceeds the 10% cap");

assert(applyDiscount(2500, 10) === 2250, "a 10% discount off £2,500 is £2,250");
assert(applyDiscount(2000, 0) === 2000, "no discount leaves the price unchanged");

console.log("\nAll repaint-booking checks passed.");
