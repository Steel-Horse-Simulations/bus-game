// Manual verification for repaint shops, run with `node electron/repaint-shop.verify.mts`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openSave,
  createRepaintShop,
  listRepaintShops,
  setRepaintShopWeeklyCapacity,
  deleteRepaintShop,
} from "./db.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repaint-verify-"));
const db = openSave(path.join(dir, "save.sqlite"));

const shop = createRepaintShop(db, "Test shop", -4.2, 55.8, 12);
assert(listRepaintShops(db).length === 1, "a shop is created and listed");
assert(listRepaintShops(db)[0].weeklyCapacity === 12, "weekly capacity round-trips");

let rejected = false;
try {
  createRepaintShop(db, "Zero", -4.2, 55.8, 0);
} catch {
  rejected = true;
}
assert(rejected, "a zero weekly capacity is rejected");

setRepaintShopWeeklyCapacity(db, shop.id, 7);
assert(listRepaintShops(db)[0].weeklyCapacity === 7, "weekly capacity can be changed");

deleteRepaintShop(db, shop.id);
assert(listRepaintShops(db).length === 0, "a shop can be deleted");
db.close();

const realSave = path.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
if (fs.existsSync(realSave)) {
  const copy = path.join(dir, "real-save-copy.sqlite");
  fs.copyFileSync(realSave, copy);
  const upgraded = openSave(copy);
  assert(listRepaintShops(upgraded).length === 0, "a copy of the real save upgrades with no shops");
  upgraded.close();
} else {
  console.log("skip real save upgrade check: no save at", realSave);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("all repaint shop checks passed");
