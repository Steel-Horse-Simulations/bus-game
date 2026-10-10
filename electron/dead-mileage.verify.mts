// Manual verification for dead mileage routes, run with `node electron/dead-mileage.verify.mts`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openSave,
  createDepotGroup,
  createDepot,
  createDealer,
  createDeadMileageRoute,
  setDeadMileageTrunkWaypoints,
  addDeadMileageBranch,
  setDeadMileageBranchWaypoints,
  deleteDeadMileageBranch,
  deleteDeadMileageRoute,
  listDeadMileageRoutesForDepot,
} from "./db.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dead-mileage-verify-"));
const db = openSave(path.join(dir, "save.sqlite"));

const group = createDepotGroup(db, "Test group", "Scotland");
// A depot with separate entrance-only and exit-only points, the case the
// fork exists for.
const { depot, entrances: depotEntrances } = createDepot(db, group.id, "Test depot", -4.2, 55.8, [
  { lon: -4.21, lat: 55.81, mode: "entry" },
  { lon: -4.19, lat: 55.79, mode: "exit" },
]);
const { entrances: dealerEntrances } = createDealer(db, "Test dealer", "volvo", -3.9, 55.9, [
  { lon: -3.91, lat: 55.91, mode: "both" },
]);

const route = createDeadMileageRoute(db, dealerEntrances[0].id, depot.id, "inbound", [{ lon: -4.0, lat: 55.85 }]);
assert(route.direction === "inbound", "direction round-trips on create");
assert(listDeadMileageRoutesForDepot(db, depot.id).length === 1, "a route is saved and listed for its depot");
assert(listDeadMileageRoutesForDepot(db, depot.id)[0].trunkWaypoints[0].lon === -4.0, "trunk waypoints round-trip");
assert(listDeadMileageRoutesForDepot(db, depot.id)[0].branches.length === 0, "a new route has no branches yet");

const entryBranch = addDeadMileageBranch(db, route.id, depotEntrances[0].id, [{ lon: -4.205, lat: 55.805 }]);
const exitBranch = addDeadMileageBranch(db, route.id, depotEntrances[1].id, [{ lon: -4.195, lat: 55.795 }]);
let loaded = listDeadMileageRoutesForDepot(db, depot.id)[0];
assert(loaded.branches.length === 2, "the route forks into one branch per depot entrance");
assert(
  loaded.branches.find((b) => b.id === entryBranch.id)?.depotEntranceId === depotEntrances[0].id,
  "the entry branch points at the entry-only entrance",
);
assert(
  loaded.branches.find((b) => b.id === exitBranch.id)?.depotEntranceId === depotEntrances[1].id,
  "the exit branch points at the exit-only entrance",
);

addDeadMileageBranch(db, route.id, depotEntrances[0].id, [{ lon: -4.206, lat: 55.806 }]);
loaded = listDeadMileageRoutesForDepot(db, depot.id)[0];
assert(loaded.branches.length === 2, "re-adding a branch for the same entrance updates it instead of duplicating");
assert(loaded.branches.find((b) => b.id === entryBranch.id)?.waypoints[0].lon === -4.206, "the updated branch's waypoints round-trip");

setDeadMileageTrunkWaypoints(db, route.id, [{ lon: -4.01, lat: 55.86 }, { lon: -4.02, lat: 55.87 }]);
assert(listDeadMileageRoutesForDepot(db, depot.id)[0].trunkWaypoints.length === 2, "trunk waypoints can be changed");

setDeadMileageBranchWaypoints(db, exitBranch.id, [{ lon: -4.196, lat: 55.796 }, { lon: -4.197, lat: 55.797 }]);
assert(
  listDeadMileageRoutesForDepot(db, depot.id)[0].branches.find((b) => b.id === exitBranch.id)?.waypoints.length === 2,
  "a single branch's waypoints can be changed independently of the trunk",
);

let rejected = false;
try {
  createDeadMileageRoute(db, dealerEntrances[0].id, depot.id, "inbound", [{ lon: NaN, lat: 55.8 }]);
} catch {
  rejected = true;
}
assert(rejected, "a non-finite trunk waypoint is rejected");

deleteDeadMileageBranch(db, exitBranch.id);
assert(listDeadMileageRoutesForDepot(db, depot.id)[0].branches.length === 1, "a single branch can be deleted without affecting the route");

deleteDeadMileageRoute(db, route.id);
assert(listDeadMileageRoutesForDepot(db, depot.id).length === 0, "deleting a route also removes its remaining branches");
db.close();

const realSave = path.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
if (fs.existsSync(realSave)) {
  const copy = path.join(dir, "real-save-copy.sqlite");
  fs.copyFileSync(realSave, copy);
  const upgraded = openSave(copy);
  assert(listDeadMileageRoutesForDepot(upgraded, 1).length === 0, "a copy of the real save upgrades to the new schema");
  upgraded.close();
} else {
  console.log("skip real save upgrade check: no save at", realSave);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("all dead mileage checks passed");
