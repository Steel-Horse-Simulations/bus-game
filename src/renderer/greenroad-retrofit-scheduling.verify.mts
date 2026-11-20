// Manual verification script for greenroad-retrofit-scheduling.mts, run
// directly with `node --experimental-strip-types
// src/renderer/greenroad-retrofit-scheduling.verify.mts` — same pattern
// as the project's other .verify.mts files.
import { capacityForNight, scheduleGreenroadRetrofit, GREENROAD_RETROFIT_LEAD_DAYS, GREENROAD_RETROFIT_BASE_CAPACITY_PER_NIGHT } from "./greenroad-retrofit-scheduling.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

assert(GREENROAD_RETROFIT_LEAD_DAYS === 14, "the real confirmed lead time is 14 days, the user's own words");
assert(GREENROAD_RETROFIT_BASE_CAPACITY_PER_NIGHT === 6, "the real confirmed base capacity is 6 buses per night, the user's own words");

// --- capacityForNight — "drops by 1 for each extra depot," floored at 1 ---
assert(capacityForNight(1) === 6, "a single depot visited gets the full 6");
assert(capacityForNight(2) === 5, "2 depots drops capacity by 1, to 5");
assert(capacityForNight(3) === 4, "3 depots drops capacity by 2, to 4");
assert(capacityForNight(6) === 1, "6 depots drops capacity all the way to the floor of 1");
assert(capacityForNight(10) === 1, "capacity never goes below 1, however many depots are stacked onto one night");

// --- scheduleGreenroadRetrofit ---
const bookedDay = 1000;

// No contention at all: lands exactly on day 1014 (the 14-day lead time), at the one depot involved.
assert(scheduleGreenroadRetrofit(bookedDay, 5, []) === bookedDay + 14, "with nothing else scheduled, a booking lands exactly on its own 14-day lead time");

// Fill up depot 5's own first available night (6 slots) with 5 OTHER vehicles already at the same depot — there's still room for a 6th.
const fiveAtSameDepot = Array.from({ length: 5 }, () => ({ depotId: 5, night: bookedDay + 14 }));
assert(scheduleGreenroadRetrofit(bookedDay, 5, fiveAtSameDepot) === bookedDay + 14, "a 6th vehicle at the same single depot still fits the first night (capacity 6, only 5 taken)");

// Now the night is genuinely full (6 already at depot 5) — the 7th has to wait for the next night.
const sixAtSameDepot = Array.from({ length: 6 }, () => ({ depotId: 5, night: bookedDay + 14 }));
assert(scheduleGreenroadRetrofit(bookedDay, 5, sixAtSameDepot) === bookedDay + 15, "a 7th vehicle at an already-full single-depot night queues to the very next night");

// Adding a SECOND depot to the same night drops capacity to 5 for that
// night — so even though only 5 are booked (all at depot 5), the new
// vehicle is at a DIFFERENT depot (6), which makes 2 depots that night,
// capacity 5, and 5 already-scheduled + this one = 6, over capacity —
// queues to the next night instead.
const fiveAtDepot5 = Array.from({ length: 5 }, () => ({ depotId: 5, night: bookedDay + 14 }));
assert(scheduleGreenroadRetrofit(bookedDay, 6, fiveAtDepot5) === bookedDay + 15, "a vehicle at a SECOND depot pushes that night to 2-depot capacity (5), which the existing 5-at-depot-5 already fills, so it queues to the next night");

// But a second depot with room under the reduced 2-depot capacity (5) still fits the same night.
const threeAtDepot5 = Array.from({ length: 3 }, () => ({ depotId: 5, night: bookedDay + 14 }));
assert(scheduleGreenroadRetrofit(bookedDay, 6, threeAtDepot5) === bookedDay + 14, "a second depot still fits the same night when the reduced 2-depot capacity (5) comfortably covers the existing 3 plus this one");

// A booking made later (bookedGameDay further forward) than existing
// scheduled visits still only ever looks at/after ITS OWN 14-day lead
// time, never earlier than that, even if capacity exists on an earlier
// night.
assert(scheduleGreenroadRetrofit(bookedDay + 5, 5, fiveAtSameDepot) === bookedDay + 5 + 14, "a later booking's own lead time is respected even though the earlier night (bookedDay+14) still has room");

console.log("All greenroad-retrofit-scheduling checks passed.");
