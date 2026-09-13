// Manual verification script for db.ts, run directly with `node electron/db.verify.ts`
// (Node's native TypeScript support — no build step). Not a permanent test
// suite, just a smoke check for the save-file/override-layer plumbing until
// a real test runner is set up.
import {
  openSave,
  createDepotGroup,
  listDepotGroups,
  renameDepotGroup,
  setOverride,
  getOverride,
  hasOverride,
  resetOverride,
  createRoute,
  listRoutes,
  updateRoute,
  deleteRoute,
  upsertRouteTimetable,
  listRouteTimetablesForRoute,
  listAllRouteTimetables,
  deleteRouteTimetable,
} from "./db.mts";
import { unlinkSync, existsSync } from "node:fs";

const path = "./electron/.verify-save.sqlite";
if (existsSync(path)) unlinkSync(path);

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- fresh save, depot groups ---
let db = openSave(path);
const g1 = createDepotGroup(db, "Edinburgh", "East Scotland");
const g2 = createDepotGroup(db, "Glasgow", "West Scotland");
assert(g1.id === 1 && g2.id === 2, "depot group ids assigned sequentially");

let groups = listDepotGroups(db);
assert(groups.length === 2, "two depot groups listed");
assert(groups[0].name === "Edinburgh" && groups[1].name === "Glasgow", "listed alphabetically");

renameDepotGroup(db, g1.id, "Edinburgh & Lothian");
groups = listDepotGroups(db);
assert(groups.some((g) => g.name === "Edinburgh & Lothian"), "rename took effect");

let threw = false;
try {
  createDepotGroup(db, "Glasgow", "West Scotland");
} catch {
  threw = true;
}
assert(threw, "duplicate depot group name rejected (UNIQUE constraint)");

// --- override layer ---
assert(!hasOverride(db, "stop", 12345, "position"), "no override initially");
assert(getOverride(db, "stop", 12345, "position") === undefined, "get returns undefined when absent");

setOverride(db, "stop", 12345, "position", { lon_e7: -32000000, lat_e7: 559000000 });
assert(hasOverride(db, "stop", 12345, "position"), "override exists after set");
const pos = getOverride<{ lon_e7: number; lat_e7: number }>(db, "stop", 12345, "position");
assert(pos?.lon_e7 === -32000000 && pos?.lat_e7 === 559000000, "override value round-trips through JSON");

// overwrite same key
setOverride(db, "stop", 12345, "position", { lon_e7: -32000001, lat_e7: 559000001 });
const pos2 = getOverride<{ lon_e7: number }>(db, "stop", 12345, "position");
assert(pos2?.lon_e7 === -32000001, "setting the same override again updates rather than duplicates");

// a second field on the same entity doesn't collide
setOverride(db, "stop", 12345, "name", "Renamed Stop");
assert(getOverride(db, "stop", 12345, "name") === "Renamed Stop", "second field on same entity independent");
assert(hasOverride(db, "stop", 12345, "position"), "first field untouched by second field's write");

resetOverride(db, "stop", 12345, "position");
assert(!hasOverride(db, "stop", 12345, "position"), "reset removes the override");
assert(hasOverride(db, "stop", 12345, "name"), "reset of one field doesn't touch another");

// --- routes ---
const route = createRoute(
  db,
  g1.id,
  "1",
  [
    { kind: "stop", osmId: 111, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 222, lon: -3.19, lat: 55.96 },
  ],
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
);
assert(route.id > 0, "route created with a real id");
assert(listRoutes(db).some((r) => r.id === route.id && r.number === "1"), "created route is listed");
assert(route.colour === "#3b82f6", "route created with the requested colour");
assert(route.name === null, "route created with no name defaults to null");

// --- route timetables ---
assert(listRouteTimetablesForRoute(db, route.id).length === 0, "a new route starts with no timetables");

const tt = upsertRouteTimetable(
  db,
  route.id,
  "monday_friday",
  360,
  1140,
  30,
  [{ pointIndex: 1, waitSeconds: 60 }],
  [0, 500],
  [0, 560],
);
assert(tt.dayType === "monday_friday" && tt.startMinutes === 360, "route timetable created with the right fields");
assert(
  JSON.stringify(tt.timingPoints) === JSON.stringify([{ pointIndex: 1, waitSeconds: 60 }]),
  "timing points round-trip through JSON",
);
assert(
  JSON.stringify(tt.arrivalOffsetsSeconds) === JSON.stringify([0, 500]) &&
    JSON.stringify(tt.departureOffsetsSeconds) === JSON.stringify([0, 560]),
  "offset arrays round-trip through JSON",
);

let forRoute = listRouteTimetablesForRoute(db, route.id);
assert(forRoute.length === 1, "the route now has exactly one timetable");

// Upserting the same (route, day type) again replaces it rather than adding
// a second row — there's only one component per route per day type yet.
const tt2 = upsertRouteTimetable(db, route.id, "monday_friday", 400, 1200, 20, [], [0, 300], [0, 300]);
assert(tt2.id === tt.id, "upserting the same route+day type updates the existing row rather than inserting a new one");
forRoute = listRouteTimetablesForRoute(db, route.id);
assert(forRoute.length === 1 && forRoute[0].startMinutes === 400, "the update replaced the row's fields");

// A different day type on the same route is a separate row.
upsertRouteTimetable(db, route.id, "saturday", 500, 1100, 60, [], [0, 400], [0, 400]);
forRoute = listRouteTimetablesForRoute(db, route.id);
assert(forRoute.length === 2, "a different day type adds a second row rather than replacing the first");

assert(listAllRouteTimetables(db).length === 2, "listAllRouteTimetables sees every route's timetables");

deleteRouteTimetable(db, tt2.id);
assert(listRouteTimetablesForRoute(db, route.id).length === 1, "deleting one timetable leaves the other alone");

// --- updating a route ---
const updated = updateRoute(
  db,
  route.id,
  g1.id,
  "1A",
  [
    { kind: "stop", osmId: 111, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 555, lon: -3.18, lat: 55.97 },
    { kind: "stop", osmId: 222, lon: -3.19, lat: 55.96 },
  ],
  "outbound",
  null,
  null,
  "#ef4444",
  "Gordon Street Express",
);
assert(updated.number === "1A" && updated.points.length === 3, "updateRoute changes the route's own fields");
assert(updated.colour === "#ef4444", "updateRoute changes the route's colour too");
assert(updated.name === "Gordon Street Express", "updateRoute changes the route's name too");
assert(listRoutes(db).find((r) => r.id === route.id)?.number === "1A", "the update is reflected in listRoutes");
assert(
  listRouteTimetablesForRoute(db, route.id).length === 0,
  "updating a route clears its existing timetables, since they're indexed against the old point list",
);

// A fresh timetable built against the now-updated point list, so deleting
// the route below still has something real to clean up.
upsertRouteTimetable(db, route.id, "sunday", 600, 900, 60, [], [0, 200, 400], [0, 200, 400]);
assert(listRouteTimetablesForRoute(db, route.id).length === 1, "a new timetable can be built after the update");

// Deleting the route itself cleans up its remaining timetable too, since no
// foreign-key cascade is enabled on this database.
deleteRoute(db, route.id);
assert(listRouteTimetablesForRoute(db, route.id).length === 0, "deleting a route also deletes its own timetables");
assert(!listRoutes(db).some((r) => r.id === route.id), "deleted route no longer listed");

db.close();

// --- reopen: confirm real persistence, not just in-memory ---
db = openSave(path);
groups = listDepotGroups(db);
assert(groups.length === 2, "depot groups survive close+reopen");
assert(getOverride(db, "stop", 12345, "name") === "Renamed Stop", "override survives close+reopen");
assert(!hasOverride(db, "stop", 12345, "position"), "reset override stays reset after reopen");

const route2 = createRoute(
  db,
  g1.id,
  "2",
  [
    { kind: "stop", osmId: 333, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 444, lon: -3.19, lat: 55.96 },
  ],
  "inbound",
  null,
  null,
  "#3b82f6",
  null,
);
upsertRouteTimetable(db, route2.id, "sunday", 700, 1000, 45, [], [0, 250], [0, 250]);
db.close();
db = openSave(path);
assert(
  listRouteTimetablesForRoute(db, route2.id).length === 1,
  "a route timetable created just before close survives close+reopen",
);
db.close();

unlinkSync(path);
console.log("\nAll checks passed.");
