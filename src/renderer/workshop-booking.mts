// Shared day-scheduling core for any "book a vehicle in, it's away for N
// working days, respecting a shop's own concurrent-capacity bays and the
// vehicle's depot group's own away-at-once cap" workshop job — extracted
// from repaint-booking.mts (T179, OPEN-ITEMS.md, confirmed 2026-11-13)
// when the re-power mechanic needed the exact same day-math with
// different capacity numbers and turnaround. None of this was ever
// actually repaint-specific — only the file/function names said so —
// so `repaint-booking.mts` re-exports from here under its own original
// names (no call-site changes needed there) and `repower-booking.mts`
// imports it directly under these names instead. `Vehicle` below is the
// ambient global type (depot-groups.d.ts) every renderer UI file already
// references unqualified — not imported, since that file has no exports
// to import (it's declarations only).
const DAYS_PER_WEEK = 7;

// Matches game-clock.mts's own weekday convention (0 = Monday epoch day,
// so day index 5/6 = Saturday/Sunday) — day indices here are the same
// whole-day units, just not carried as full GameDateTime objects since
// turnaround is day-granularity only.
function isWeekend(dayIndex: number): boolean {
  const weekday = ((dayIndex % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return weekday === 5 || weekday === 6;
}

export function nextWorkingDay(dayIndex: number): number {
  let day = dayIndex;
  while (isWeekend(day)) day++;
  return day;
}

// The last of `workingDays` consecutive working days starting at
// `startDayIndex`, which must already be a working day — inclusive of
// the start day itself (a 1-day job starts and finishes the same day).
export function lastWorkingDay(startDayIndex: number, workingDays: number): number {
  let day = startDayIndex;
  let remaining = workingDays;
  while (remaining > 1) {
    day = nextWorkingDay(day + 1);
    remaining--;
  }
  return day;
}

export interface BookingWindow {
  startDay: number;
  completionDay: number;
}

export function overlapsWindow(window: BookingWindow, startDay: number, completionDay: number): boolean {
  return !(window.completionDay < startDay || window.startDay > completionDay);
}

// Finds the earliest working day a new booking can start without its own
// full run ever pushing either live cap over its limit on any day it
// occupies — the shop's own concurrent capacity (bays), and the
// vehicle's depot group's own "N away at once" cap. Walks forward one
// candidate start day at a time rather than solving directly, since both
// caps depend on the whole window a candidate start implies, not just
// the start day itself. `groupCapBookings`/`groupAwayCap` should be
// passed as empty/Infinity when the away cap genuinely doesn't apply
// (e.g. a simple repaint, which never leaves the home depot).
export function scheduleBooking(
  todayDayIndex: number,
  turnaroundWorkingDays: number,
  shopBookings: readonly BookingWindow[],
  shopConcurrentCapacity: number,
  groupCapBookings: readonly BookingWindow[],
  groupAwayCap: number,
): BookingWindow {
  let startDay = nextWorkingDay(todayDayIndex);
  for (;;) {
    const completionDay = lastWorkingDay(startDay, turnaroundWorkingDays);
    const shopOverlap = shopBookings.filter((b) => overlapsWindow(b, startDay, completionDay)).length;
    const groupOverlap = groupCapBookings.filter((b) => overlapsWindow(b, startDay, completionDay)).length;
    if (shopOverlap < shopConcurrentCapacity && groupOverlap < groupAwayCap) {
      return { startDay, completionDay };
    }
    startDay = nextWorkingDay(startDay + 1);
  }
}

// Minimal shape of a repaint/re-power booking the combined-away-windows
// helper needs — kept structural rather than importing either real
// `RepaintBooking`/`RepowerBooking` type, so this file never has to know
// about either concrete table.
export interface AwayBooking {
  vehicleId: number;
  startGameDay: number;
  completionGameDay: number;
}

// T179 (confirmed 2026-11-13): re-power counts toward the SAME "N away at
// once" depot-group cap repaint already uses, and vice versa — a bus away
// for either reason occupies the same real slot. Merges both tables'
// currently-active bookings for vehicles in the given depot group into
// one BookingWindow[] for scheduleBooking's own groupCapBookings
// parameter.
export function combinedAwayWindows(
  vehicles: readonly Pick<Vehicle, "id" | "depotGroupId">[],
  repaintBookings: readonly AwayBooking[],
  repowerBookings: readonly AwayBooking[],
  depotGroupId: number,
): BookingWindow[] {
  const vehicleIdsInGroup = new Set(vehicles.filter((v) => v.depotGroupId === depotGroupId).map((v) => v.id));
  const toWindow = (b: AwayBooking): BookingWindow => ({ startDay: b.startGameDay, completionDay: b.completionGameDay });
  return [...repaintBookings, ...repowerBookings].filter((b) => vehicleIdsInGroup.has(b.vehicleId)).map(toWindow);
}
