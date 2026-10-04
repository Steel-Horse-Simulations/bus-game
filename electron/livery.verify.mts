// Manual verification for the minimal livery tables, run directly with
// `node electron/livery.verify.mts` (Node's native TypeScript support).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openSave,
  createLivery,
  listLiveries,
  setLiverySupportIconOverride,
  listLiverySupportIconOverrides,
} from "./db.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "livery-verify-"));
const savePath = path.join(dir, "save.sqlite");
const db = openSave(savePath);

const lothian = createLivery(db, "Lothian", "#8c1d2f", "#f2f0ec");
const stagecoach = createLivery(db, "Stagecoach Local", "#00539b", "#f2f0ec");
assert(listLiveries(db).length === 2, "two reference liveries created from the spec");
assert(listLiveries(db)[0].primaryColour === "#8c1d2f", "primary colour round-trips");

let rejected = false;
try {
  createLivery(db, "Bad", "red", "#ffffff");
} catch {
  rejected = true;
}
assert(rejected, "a non-hex colour is rejected");

setLiverySupportIconOverride(db, lothian.id, "spanner", "white");
setLiverySupportIconOverride(db, lothian.id, "person", "black");
setLiverySupportIconOverride(db, lothian.id, "spanner", "black");
const overrides = listLiverySupportIconOverrides(db, lothian.id);
assert(overrides.length === 2, "two overrides stored for Lothian");
assert(overrides.find((o) => o.icon === "spanner")?.colour === "black", "setting an existing override replaces it");
assert(listLiverySupportIconOverrides(db, stagecoach.id).length === 0, "overrides are per livery, not shared");

setLiverySupportIconOverride(db, lothian.id, "person", null);
assert(listLiverySupportIconOverrides(db, lothian.id).length === 1, "null clears an override back to automatic");
db.close();

const copyOfRealSave = path.join(dir, "real-save-copy.sqlite");
const realSave = path.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
if (fs.existsSync(realSave)) {
  fs.copyFileSync(realSave, copyOfRealSave);
  const upgraded = openSave(copyOfRealSave);
  assert(listLiveries(upgraded).length === 0, "a real save upgrades with no liveries yet");
  upgraded.close();
  console.log("ok   copy of the real save opened and upgraded (original untouched)");
} else {
  console.log("skip real save upgrade check: no save at", realSave);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("all livery checks passed");
