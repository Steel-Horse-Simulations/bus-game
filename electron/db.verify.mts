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

db.close();

// --- reopen: confirm real persistence, not just in-memory ---
db = openSave(path);
groups = listDepotGroups(db);
assert(groups.length === 2, "depot groups survive close+reopen");
assert(getOverride(db, "stop", 12345, "name") === "Renamed Stop", "override survives close+reopen");
assert(!hasOverride(db, "stop", 12345, "position"), "reset override stays reset after reopen");
db.close();

unlinkSync(path);
console.log("\nAll checks passed.");
