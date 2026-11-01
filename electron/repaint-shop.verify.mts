// Manual verification for repaint shops, run with `node electron/repaint-shop.verify.mts`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openSave,
  createRepaintShop,
  listRepaintShops,
  setRepaintShopConcurrentCapacity,
  setRepaintShopTurnaroundDays,
  deleteRepaintShop,
  addRepaintShopEntrance,
  listRepaintShopEntrances,
  listAllRepaintShopEntrances,
  setRepaintShopEntranceMode,
  deleteRepaintShopEntrance,
} from "./db.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repaint-verify-"));
const db = openSave(path.join(dir, "save.sqlite"));

const shop = createRepaintShop(db, "Test shop", -4.2, 55.8, 7, 5);
assert(listRepaintShops(db).length === 1, "a shop is created and listed");
assert(listRepaintShops(db)[0].concurrentCapacity === 7, "concurrent capacity round-trips");
assert(listRepaintShops(db)[0].turnaroundDays === 5, "turnaround days round-trips");

let rejectedCapacity = false;
try {
  createRepaintShop(db, "Zero capacity", -4.2, 55.8, 0, 5);
} catch {
  rejectedCapacity = true;
}
assert(rejectedCapacity, "a zero concurrent capacity is rejected");

let rejectedTurnaround = false;
try {
  createRepaintShop(db, "Zero turnaround", -4.2, 55.8, 7, 0);
} catch {
  rejectedTurnaround = true;
}
assert(rejectedTurnaround, "a zero turnaround is rejected");

setRepaintShopConcurrentCapacity(db, shop.id, 2);
assert(listRepaintShops(db)[0].concurrentCapacity === 2, "concurrent capacity can be changed");

setRepaintShopTurnaroundDays(db, shop.id, 10);
assert(listRepaintShops(db)[0].turnaroundDays === 10, "turnaround days can be changed");

// --- Entrances (repaint_shop_entrances, T107-style mirror of dealer_entrances) ---
const entrance = addRepaintShopEntrance(db, shop.id, -4.21, 55.81, "entry");
assert(listRepaintShopEntrances(db, shop.id).length === 1, "an entrance is added and listed for its shop");
assert(listAllRepaintShopEntrances(db).length === 1, "listAllRepaintShopEntrances sees it too");

setRepaintShopEntranceMode(db, entrance.id, "both");
assert(listRepaintShopEntrances(db, shop.id)[0].mode === "both", "setRepaintShopEntranceMode updates the mode");

deleteRepaintShopEntrance(db, entrance.id);
assert(listRepaintShopEntrances(db, shop.id).length === 0, "deleteRepaintShopEntrance removes it");

const secondEntrance = addRepaintShopEntrance(db, shop.id, -4.22, 55.82, "exit");
deleteRepaintShop(db, shop.id);
assert(listRepaintShops(db).length === 0, "a shop can be deleted");
assert(listAllRepaintShopEntrances(db).length === 0, "deleting a shop also deletes its own entrances");
void secondEntrance;

db.close();

const realSave = path.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
if (fs.existsSync(realSave)) {
  const copy = path.join(dir, "real-save-copy.sqlite");
  fs.copyFileSync(realSave, copy);
  const upgraded = openSave(copy);
  // Not asserting zero shops: seedRealRepaintShops() runs from main.ts's own
  // boot sequence, not from openSave() itself, so a real save that's
  // actually been launched since that shipped legitimately already has the
  // 3 real shops in it (confirmed directly, 2026-11-01) — this just proves
  // the migration itself doesn't throw and every row still looks sane.
  assert(
    listRepaintShops(upgraded).every((s) => s.concurrentCapacity > 0 && s.turnaroundDays > 0),
    "a copy of the real save upgrades cleanly, every shop (seeded or not) with sane capacity/turnaround",
  );
  upgraded.close();
} else {
  console.log("skip real save upgrade check: no save at", realSave);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("all repaint shop checks passed");
