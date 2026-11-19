// Repaint booking scheduling and pricing (OPERATIONS.md §5 "Repainting"),
// pure logic only — no DOM/IPC, matching the project's established
// pattern (fare-pricing.mts, vehicle-buy-pricing.mts, game-clock.mts) of
// keeping fiddly date/discount arithmetic testable on its own.
//
// Scope (2026-11-05, user's own explicit choice when asked): "capacity/
// scheduling only." There is no money/finance system anywhere in this
// game yet (no balance/ledger table at all), and transferVehicle's own
// comment in db.mts already notes there's no driver/duty system to hang
// a simulated there-and-back trip on either. So this only tracks WHEN a
// vehicle is busy/away and WHAT it would cost, for display — nothing
// here deducts real money, and no travel time is simulated (the vehicle
// is treated as departing immediately, the same "immediate, not
// simulated in transit" simplification transferVehicle already makes).
// Real cost deduction and the driven trip there and back are deferred to
// Phase 5 (finance) and Phase 6 (drivers) respectively.
import { findVehicleModel } from "./vehicle-catalogue.mts";
// The day-scheduling core below was extracted to workshop-booking.mts
// (T179, confirmed 2026-11-13) once the re-power mechanic needed the
// exact same "N working days, shop bays, depot-group away cap" logic —
// none of it was ever actually repaint-specific, only the names here
// were. Re-exported under the original names so no call site in this
// file (or repaint-shop-panel.ts) needs to change.
export { nextWorkingDay, lastWorkingDay, type BookingWindow, scheduleBooking as scheduleRepaintBooking } from "./workshop-booking.mts";

// OPERATIONS.md §5's own repaint price table, by vehicle size/type.
// "Small bus (40,000 range)" and "Double deck, single deck coach" are
// the OLD fleet-number-range names (UK-EXPANSION.md §14's own "this
// replaces the entire original fleet-number-range convention... 40,000s
// small bus" confirms "40,000 range" = today's "Minibus" category);
// translated here to the current catalogue's `category` field plus one
// specific-model check for the one double-deck coach (Volvo 9700DD —
// VEHICLE-SPECS.md: "a separate buying menu entry from the 9700...
// single vs double deck is a fundamental distinction" — the only
// Coaches-category model that's double-deck).
export const FULL_REPAINT_PRICE_GBP = {
  minibus: 1500,
  singleDeck: 2000,
  doubleDeckOrSingleDeckCoach: 2500,
  doubleDeckCoach: 3000,
} as const;

const DOUBLE_DECK_COACH_MODEL_IDS = new Set(["volvo-9700dd"]);

export function fullRepaintBasePriceGBP(modelId: string): number {
  if (DOUBLE_DECK_COACH_MODEL_IDS.has(modelId)) return FULL_REPAINT_PRICE_GBP.doubleDeckCoach;
  const category = findVehicleModel(modelId)?.category ?? "";
  if (category === "Minibus") return FULL_REPAINT_PRICE_GBP.minibus;
  if (category === "Single-deckers / midibuses") return FULL_REPAINT_PRICE_GBP.singleDeck;
  // Double-deckers, Coaches (other than the 9700DD above), and
  // Specialised (open-top double-deckers) all share the double-deck /
  // single-deck-coach chassis-size price row.
  return FULL_REPAINT_PRICE_GBP.doubleDeckOrSingleDeckCoach;
}

// "A simple repaint... costs a third of a full repaint" — rounded to the
// nearest pound, there's no finer real-money unit anywhere in this
// game's figures.
export function simpleRepaintBasePriceGBP(modelId: string): number {
  return Math.round(fullRepaintBasePriceGBP(modelId) / 3);
}

// A simple repaint "takes 1-2 days" with no further rule for which —
// the longer, safer figure is used here rather than guessed finer; flag
// if the real distinction ever matters. It's also NOT given its own
// turnaround-days figure per shop, since it isn't done at a shop at all
// — "done at the main depot in the area."
export const SIMPLE_REPAINT_TURNAROUND_DAYS = 2;

// "2% discount per additional vehicle in an order, capped at 10%" — the
// first vehicle in an order gets none, each one after it 2% more, capped
// at 10% (reached at 6 vehicles: 5 additional x 2%). A different, much
// simpler table from the vehicle-PURCHASE bulk discount
// (vehicle-buy-pricing.mts's own bulkDiscountPercent) — not the same
// mechanism, just a similarly-shaped one in a different part of
// OPERATIONS.md.
export function repaintBulkDiscountPercent(orderSize: number): number {
  if (orderSize <= 1) return 0;
  return Math.min(10, 2 * (orderSize - 1));
}

export function applyDiscount(basePriceGBP: number, discountPercent: number): number {
  return Math.round(basePriceGBP * (1 - discountPercent / 100));
}
