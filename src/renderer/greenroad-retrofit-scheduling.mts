// Real GreenRoad engineer scheduling for retrofit bookings (user request
// 2026-11-20: first "It will be installed overnight by a Greenroad
// Engineer," then refined twice the same day — "Greenroad should take
// 14 days after retro-fitting it for the engineer to come out, they can
// do 6 buses per night," then "That 6 per night should drop by 1 for
// each extra depot in a group the engineer has to visit," confirmed
// scoped per depot GROUP rather than company-wide, since a real engineer
// visiting one area can't also be at a different depot group's town the
// same night). Pure day/capacity math only, no DOM/IPC dependency, same
// "keep fiddly scheduling arithmetic testable on its own" pattern as
// workshop-booking.mts/vehicle-lease-billing.mts/private-hire-income.mts.
//
// Deliberately NOT built on top of workshop-booking.mts's own
// scheduleBooking, even though both are "find the earliest slot that
// doesn't push a capacity over its limit" problems — that module's shape
// is "a vehicle is AWAY for N working days, respecting a shop's bay
// count," skipping weekends throughout. This job is different: the
// vehicle stays at its own depot and is serviced in a single night, and
// nothing was said about the external GreenRoad contractor skipping
// weekends, so every real calendar day counts here, not just working
// days.
export const GREENROAD_RETROFIT_LEAD_DAYS = 14;
export const GREENROAD_RETROFIT_BASE_CAPACITY_PER_NIGHT = 6;

export interface ScheduledGreenroadVisit {
  depotId: number;
  night: number; // the real gameDay the engineer is there, i.e. an existing booking's own readyGameDay
}

// The real capacity for one night, given how many distinct depots
// (within the same depot group) the engineer already has to visit that
// night — "drops by 1 for each extra depot," the user's own words.
// Floored at 1: wherever the engineer already has to be, they manage at
// least one vehicle there, however many depots are stacked onto the same
// night.
export function capacityForNight(distinctDepotCount: number): number {
  return Math.max(1, GREENROAD_RETROFIT_BASE_CAPACITY_PER_NIGHT - Math.max(0, distinctDepotCount - 1));
}

// Finds the earliest real night (a gameDay) this vehicle's own retrofit
// can be scheduled: never before its own 14-day lead time has elapsed,
// and never on a night that's already full for its own depot group —
// walks forward one candidate night at a time rather than solving
// directly, since adding THIS vehicle's own depot to a candidate night
// can itself change that night's capacity (if it's a depot not already
// being visited that night, the engineer now has one more stop, so the
// capacity for everyone on that night drops).
export function scheduleGreenroadRetrofit(bookedGameDay: number, depotId: number, alreadyScheduledInGroup: readonly ScheduledGreenroadVisit[]): number {
  let night = bookedGameDay + GREENROAD_RETROFIT_LEAD_DAYS;
  for (;;) {
    const onThisNight = alreadyScheduledInGroup.filter((v) => v.night === night);
    const depotsOnThisNight = new Set(onThisNight.map((v) => v.depotId));
    depotsOnThisNight.add(depotId);
    const capacity = capacityForNight(depotsOnThisNight.size);
    if (onThisNight.length < capacity) return night;
    night += 1;
  }
}
