// Manual verification for fare zones (DESIGN.md §9, Phase 4 increment 1),
// run directly with `node electron/fare-zones.verify.mts` (Node's native
// TypeScript support).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openSave,
  createDepotGroup,
  createFareZone,
  listFareZonesForDepotGroup,
  listAllFareZones,
  renameFareZone,
  setFareZoneType,
  setFareZoneColour,
  deleteFareZone,
} from "./db.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fare-zones-verify-"));
const savePath = path.join(dir, "save.sqlite");
const db = openSave(savePath);

const edinburgh = createDepotGroup(db, "Edinburgh", "East Scotland");
const glasgow = createDepotGroup(db, "Glasgow", "West Scotland");

const centreTriangle = [
  { lon: -3.2, lat: 55.95 },
  { lon: -3.19, lat: 55.95 },
  { lon: -3.195, lat: 55.96 },
];
const cityZone = createFareZone(db, edinburgh.id, "Zone 1", "city", centreTriangle);
assert(cityZone.name === "Zone 1" && cityZone.zoneType === "city", "a city zone is created with the right fields");
assert(cityZone.points.length === 3, "the zone's points round-trip through JSON");
assert(cityZone.colour === "#3b82f6", "a city zone defaults to the plain city colour when none is given");

const colouredZone = createFareZone(db, edinburgh.id, "Zone 2", "country", centreTriangle, "#ff0000");
assert(colouredZone.colour === "#ff0000", "an explicit colour is stored instead of the type default");

let colourRejected = false;
try {
  createFareZone(db, edinburgh.id, "Bad colour", "city", centreTriangle, "red");
} catch {
  colourRejected = true;
}
assert(colourRejected, "a non-hex colour is rejected on create");

setFareZoneColour(db, cityZone.id, "#00ff00");
assert(listFareZonesForDepotGroup(db, edinburgh.id).find((z) => z.id === cityZone.id)?.colour === "#00ff00", "setFareZoneColour updates the colour");

let setColourRejected = false;
try {
  setFareZoneColour(db, cityZone.id, "not-a-colour");
} catch {
  setColourRejected = true;
}
assert(setColourRejected, "setFareZoneColour rejects a non-hex colour");

deleteFareZone(db, colouredZone.id);

let rejected = false;
try {
  createFareZone(db, edinburgh.id, "Too small", "city", [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }]);
} catch {
  rejected = true;
}
assert(rejected, "a zone with fewer than 3 points is rejected");

const countryZone = createFareZone(db, edinburgh.id, "Zone A", "country", [
  { lon: -3.3, lat: 55.9 },
  { lon: -3.1, lat: 55.9 },
  { lon: -3.1, lat: 56.0 },
  { lon: -3.3, lat: 56.0 },
]);
createFareZone(db, glasgow.id, "Zone 1", "city", centreTriangle);

assert(listFareZonesForDepotGroup(db, edinburgh.id).length === 2, "Edinburgh has its own 2 zones");
assert(listFareZonesForDepotGroup(db, glasgow.id).length === 1, "Glasgow's zone is separate from Edinburgh's — zones don't leak between depot groups despite sharing a name");
assert(listAllFareZones(db).length === 3, "listAllFareZones sees every zone across every depot group");

renameFareZone(db, countryZone.id, "Zone A/B");
assert(listFareZonesForDepotGroup(db, edinburgh.id).find((z) => z.id === countryZone.id)?.name === "Zone A/B", "renameFareZone updates the name");

setFareZoneType(db, countryZone.id, "city");
assert(listFareZonesForDepotGroup(db, edinburgh.id).find((z) => z.id === countryZone.id)?.zoneType === "city", "setFareZoneType updates the type");

deleteFareZone(db, countryZone.id);
assert(listFareZonesForDepotGroup(db, edinburgh.id).length === 1, "deleteFareZone removes it");

db.close();

const copyOfRealSave = path.join(dir, "real-save-copy.sqlite");
const realSave = path.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
if (fs.existsSync(realSave)) {
  fs.copyFileSync(realSave, copyOfRealSave);
  const upgraded = openSave(copyOfRealSave);
  const { user_version: version } = upgraded.prepare("PRAGMA user_version").get() as { user_version: number };
  assert(version === 36, `real save migrates to schema v36, got v${version}`);
  upgraded.close();
} else {
  console.log("skip real save upgrade check: no save at", realSave);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("all fare zone checks passed");
