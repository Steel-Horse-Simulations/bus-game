// Manual verification for workshop-booking.mts (T179, OPEN-ITEMS.md), run
// directly with `node --experimental-strip-types src/renderer/workshop-booking.verify.mts`.
// nextWorkingDay/lastWorkingDay/scheduleBooking's own day-math is already
// covered end to end by repaint-booking.verify.mts (which exercises the
// same functions under their re-exported original names) — this file
// only covers combinedAwayWindows, the one piece that's new here rather
// than moved.
import { combinedAwayWindows, type AwayBooking } from "./workshop-booking.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const vehicles = [
  { id: 1, depotGroupId: 100 },
  { id: 2, depotGroupId: 100 },
  { id: 3, depotGroupId: 200 },
];

{
  const repaint: AwayBooking[] = [{ vehicleId: 1, startGameDay: 0, completionGameDay: 4 }];
  const repower: AwayBooking[] = [{ vehicleId: 2, startGameDay: 2, completionGameDay: 20 }];
  const windows = combinedAwayWindows(vehicles, repaint, repower, 100);
  assert(windows.length === 2, "a repaint and a re-power booking for the same depot group both count toward its away cap");
  assert(windows.some((w) => w.startDay === 0 && w.completionDay === 4), "the repaint booking's own window is included");
  assert(windows.some((w) => w.startDay === 2 && w.completionDay === 20), "the re-power booking's own window is included");
}

{
  // Vehicle 3 is in a different depot group (200) — its booking must not
  // count toward group 100's cap.
  const repaint: AwayBooking[] = [{ vehicleId: 3, startGameDay: 0, completionGameDay: 4 }];
  const windows = combinedAwayWindows(vehicles, repaint, [], 100);
  assert(windows.length === 0, "a booking for a vehicle in a different depot group is excluded");
}

{
  // A booking for a vehicle id that isn't in the `vehicles` list at all
  // (shouldn't happen in practice, but the filter is by id membership,
  // not by assuming every booking's vehicle is present) is excluded, not
  // a crash.
  const repower: AwayBooking[] = [{ vehicleId: 999, startGameDay: 0, completionGameDay: 4 }];
  const windows = combinedAwayWindows(vehicles, [], repower, 100);
  assert(windows.length === 0, "a booking for an unknown vehicle id is excluded rather than crashing");
}

console.log("\nAll workshop-booking checks passed.");
