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
  mergeFareZone,
  setIslandZoneBand,
  deleteIslandZoneBand,
  listIslandZoneBands,
  SCHEMA_VERSION,
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

// --- Island zones (T107) — geometric exclusivity with city/country,
// confirmed 2026-10-31: "Islands can't have City or Country Zones" means
// an Island zone can never share land with a City/Country zone, not that
// a depot group can't have both (Arran, an Island zone, still coexists
// fine with Glasgow's own City zones elsewhere on the map). ---
const farAwayIsland = [
  { lon: -6.5, lat: 57.3 },
  { lon: -6.3, lat: 57.3 },
  { lon: -6.4, lat: 57.4 },
];
const islandZone = createFareZone(db, edinburgh.id, "Skye", "island", farAwayIsland);
assert(islandZone.zoneType === "island", "an island zone is created with the right type");
assert(islandZone.colour === "#f59e0b", "an island zone defaults to its own colour when none is given");

let cityOverIslandRejected = false;
try {
  createFareZone(db, edinburgh.id, "Overlapping city", "city", farAwayIsland);
} catch {
  cityOverIslandRejected = true;
}
assert(cityOverIslandRejected, "a city zone can't be created overlapping an island zone");

let islandOverCityRejected = false;
try {
  createFareZone(db, edinburgh.id, "Overlapping island", "island", centreTriangle);
} catch {
  islandOverCityRejected = true;
}
assert(islandOverCityRejected, "an island zone can't be created overlapping a city zone");

const retypeTarget = createFareZone(db, edinburgh.id, "Retype me", "country", [
  { lon: -7.5, lat: 57.9 },
  { lon: -7.3, lat: 57.9 },
  { lon: -7.4, lat: 58.0 },
]);
setFareZoneType(db, retypeTarget.id, "island");
assert(
  listFareZonesForDepotGroup(db, edinburgh.id).find((z) => z.id === retypeTarget.id)?.zoneType === "island",
  "setFareZoneType allows retyping to island when nothing overlaps",
);

const overlapsCity = createFareZone(db, edinburgh.id, "Overlaps cityZone", "country", centreTriangle);
let retypeOverlapRejected = false;
try {
  setFareZoneType(db, overlapsCity.id, "island");
} catch {
  retypeOverlapRejected = true;
}
assert(retypeOverlapRejected, "setFareZoneType rejects retyping a zone to island if it would then overlap an existing city/country zone");
assert(
  listFareZonesForDepotGroup(db, edinburgh.id).find((z) => z.id === overlapsCity.id)?.zoneType === "country",
  "the rejected retype left the zone's own type unchanged",
);
deleteFareZone(db, overlapsCity.id);
deleteFareZone(db, retypeTarget.id);

// --- Island-zone single-fare bands (same table shape as country's own) ---
setIslandZoneBand(db, edinburgh.id, 1, 300);
setIslandZoneBand(db, edinburgh.id, 2, 500);
assert(listIslandZoneBands(db, edinburgh.id).length === 2, "two island zone bands round-trip");
assert(listIslandZoneBands(db, edinburgh.id).find((b) => b.zoneCount === 1)?.priceGBPPence === 300, "the 1-zone island band has the right price");
setIslandZoneBand(db, edinburgh.id, 1, 350);
assert(listIslandZoneBands(db, edinburgh.id).find((b) => b.zoneCount === 1)?.priceGBPPence === 350, "setting the same zone count again updates rather than duplicates");
deleteIslandZoneBand(db, edinburgh.id, 2);
assert(listIslandZoneBands(db, edinburgh.id).length === 1, "deleteIslandZoneBand removes it");

// --- Town zones (T107, relaxed 2026-11-01) — always declares exactly one
// Country/Island parent, must at least PARTIALLY overlap it (not fully
// contained any more — a live user report, with a real example, showed a
// town can genuinely straddle the boundary into a second zone), cascade-
// deleted with its parent. ---
const townParent = createFareZone(db, edinburgh.id, "Highland", "country", [
  { lon: -5.0, lat: 56.0 },
  { lon: -4.0, lat: 56.0 },
  { lon: -4.0, lat: 57.0 },
  { lon: -5.0, lat: 57.0 },
]);
const townInside = [
  { lon: -4.6, lat: 56.4 },
  { lon: -4.4, lat: 56.4 },
  { lon: -4.4, lat: 56.6 },
  { lon: -4.6, lat: 56.6 },
];
const town = createFareZone(db, edinburgh.id, "Fort William", "town", townInside, undefined, townParent.id);
assert(town.zoneType === "town" && town.parentZoneId === townParent.id, "a town zone is created inside its real parent");

let townInCityRejected = false;
try {
  createFareZone(db, edinburgh.id, "Town in a city", "town", centreTriangle, undefined, cityZone.id);
} catch {
  townInCityRejected = true;
}
assert(townInCityRejected, "a town zone can't have a city zone as its parent");

// Straddles the parent's own eastern edge (-4.0) — half inside Highland,
// half outside it entirely — accepted now under the relaxed rule, where
// it would have been rejected under the old "fully contained" one.
const straddlingTown = createFareZone(
  db,
  edinburgh.id,
  "Straddles the boundary",
  "town",
  [
    { lon: -4.6, lat: 56.4 },
    { lon: -3.5, lat: 56.4 },
    { lon: -3.5, lat: 56.6 },
    { lon: -4.6, lat: 56.6 },
  ],
  undefined,
  townParent.id,
);
assert(straddlingTown.parentZoneId === townParent.id, "a town zone that only partially overlaps its parent is accepted, not rejected");

let townOutsideParentRejected = false;
try {
  createFareZone(
    db,
    edinburgh.id,
    "Town nowhere near its parent",
    "town",
    [
      { lon: 10, lat: 10 },
      { lon: 11, lat: 10 },
      { lon: 11, lat: 11 },
      { lon: 10, lat: 11 },
    ],
    undefined,
    townParent.id,
  );
} catch {
  townOutsideParentRejected = true;
}
assert(townOutsideParentRejected, "a town zone with NO overlap at all with its claimed parent is still rejected");
deleteFareZone(db, straddlingTown.id);

let townWithNoParentRejected = false;
try {
  createFareZone(db, edinburgh.id, "No parent", "town", townInside);
} catch {
  townWithNoParentRejected = true;
}
assert(townWithNoParentRejected, "a town zone can't be created without a parent at all");

deleteFareZone(db, townParent.id);
assert(!listFareZonesForDepotGroup(db, edinburgh.id).some((z) => z.id === town.id), "deleting a town's parent cascades to delete the town too");
assert(!listFareZonesForDepotGroup(db, edinburgh.id).some((z) => z.id === townParent.id), "the parent itself is gone too");

// --- mergeFareZone (2026-11-01) — relabels the source zone to match the
// target's own name/type/colour, with NO geometry union computed; both
// polygons survive exactly as drawn. ---
{
  const a = createFareZone(db, glasgow.id, "A", "city", [
    { lon: -4.3, lat: 55.86 },
    { lon: -4.29, lat: 55.86 },
    { lon: -4.295, lat: 55.87 },
  ]);
  const b = createFareZone(db, glasgow.id, "B", "city", [
    { lon: -4.1, lat: 55.86 },
    { lon: -4.09, lat: 55.86 },
    { lon: -4.095, lat: 55.87 },
  ]);
  const aOriginalPoints = JSON.stringify(a.points);
  mergeFareZone(db, a.id, b.id);
  const merged = listFareZonesForDepotGroup(db, glasgow.id).find((z) => z.id === a.id);
  assert(merged?.name === "B" && merged.colour === b.colour, "merging relabels the source zone's own name and colour to match the target");
  assert(JSON.stringify(merged?.points) === aOriginalPoints, "the source zone's own shape is untouched by merging — no union is computed");
  assert(listFareZonesForDepotGroup(db, glasgow.id).some((z) => z.id === b.id), "the target zone itself still exists as its own separate row too");

  let mergeIntoSelfRejected = false;
  try {
    mergeFareZone(db, b.id, b.id);
  } catch {
    mergeIntoSelfRejected = true;
  }
  assert(mergeIntoSelfRejected, "a zone can't be merged into itself");

  let mergeMissingRejected = false;
  try {
    mergeFareZone(db, 999999, b.id);
  } catch {
    mergeMissingRejected = true;
  }
  assert(mergeMissingRejected, "merging a zone id that doesn't exist throws");

  const otherGroupZone = createFareZone(db, edinburgh.id, "Edinburgh zone", "city", centreTriangle);
  let mergeAcrossGroupsRejected = false;
  try {
    mergeFareZone(db, b.id, otherGroupZone.id);
  } catch {
    mergeAcrossGroupsRejected = true;
  }
  assert(mergeAcrossGroupsRejected, "merging across two different depot groups is rejected");
  deleteFareZone(db, otherGroupZone.id);

  const townParentForMerge = createFareZone(db, glasgow.id, "Highland 2", "country", [
    { lon: -5.0, lat: 56.0 },
    { lon: -4.0, lat: 56.0 },
    { lon: -4.0, lat: 57.0 },
    { lon: -5.0, lat: 57.0 },
  ]);
  const townForMerge = createFareZone(db, glasgow.id, "A town", "town", townInside, undefined, townParentForMerge.id);
  let mergeFromTownRejected = false;
  try {
    mergeFareZone(db, townForMerge.id, b.id);
  } catch {
    mergeFromTownRejected = true;
  }
  assert(mergeFromTownRejected, "a town zone can't be merged as the source");
  let mergeIntoTownRejected = false;
  try {
    mergeFareZone(db, b.id, townForMerge.id);
  } catch {
    mergeIntoTownRejected = true;
  }
  assert(mergeIntoTownRejected, "a town zone can't be merged into as the target");
  deleteFareZone(db, townParentForMerge.id);
}

db.close();

const copyOfRealSave = path.join(dir, "real-save-copy.sqlite");
const realSave = path.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
if (fs.existsSync(realSave)) {
  fs.copyFileSync(realSave, copyOfRealSave);
  const upgraded = openSave(copyOfRealSave);
  const { user_version: version } = upgraded.prepare("PRAGMA user_version").get() as { user_version: number };
  assert(version === SCHEMA_VERSION, `real save migrates to schema v${SCHEMA_VERSION}, got v${version}`);
  upgraded.close();
} else {
  console.log("skip real save upgrade check: no save at", realSave);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("all fare zone checks passed");
