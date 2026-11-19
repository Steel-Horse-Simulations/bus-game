// Manual verification script for island-detection.mts, against the REAL
// pipeline-data/coastline.bin (not synthetic geometry) — same "no
// shortcuts, use the real thing" standard as livery-seed-data.verify.mts's
// own Scotland-boundary checks, and the same reason this needs the real
// WASM module initialised directly (decode_coastline). Run directly with
// `node --experimental-strip-types src/renderer/island-detection.verify.mts`.
import * as fs from "node:fs";
import { initSync, decode_coastline } from "./wasm/game_wasm.js";
import { islandAreaForPoint, MAINLAND_AREA_THRESHOLD_KM2, type FareZonePoint } from "./island-detection.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const wasmBytes = fs.readFileSync(new URL("./wasm/game_wasm_bg.wasm", import.meta.url));
initSync({ module: wasmBytes });

const coastlineBytes = fs.readFileSync("pipeline-data/coastline.bin");
const decodedChains = decode_coastline(coastlineBytes) as { coordinates: number[] }[];
const coastlineChains: FareZonePoint[][] = decodedChains.map((chain) => {
  const points: FareZonePoint[] = [];
  for (let i = 0; i + 1 < chain.coordinates.length; i += 2) {
    points.push({ lon: chain.coordinates[i], lat: chain.coordinates[i + 1] });
  }
  return points;
});
assert(coastlineChains.length > 1000, `real coastline.bin decoded with a plausible chain count, got ${coastlineChains.length}`);

// Real reference points, same convention as the Rust-side Scotland-
// boundary test (real towns, not synthetic coordinates).
const edinburgh: FareZonePoint = { lon: -3.1883, lat: 55.9533 };
const dublin: FareZonePoint = { lon: -6.2603, lat: 53.3498 };
// Portree, Skye's own main town (real reference coordinates, genuinely on
// Skye itself — unlike Kyle of Lochalsh, which is the MAINLAND town on the
// other side of the Skye Bridge, confirmed by hand rather than assumed
// after the first version of this test wrongly used that point).
const skye: FareZonePoint = { lon: -6.1958, lat: 57.4126 };
const openOcean: FareZonePoint = { lon: -10, lat: 58 };

const edinburghResult = islandAreaForPoint(edinburgh, coastlineChains);
assert(edinburghResult !== null, "Edinburgh resolves to a real closed chain");
assert(edinburghResult!.isIsland === false, "Edinburgh (Great Britain mainland) is not classified as an island");
assert(
  edinburghResult!.areaKm2 > MAINLAND_AREA_THRESHOLD_KM2 * 5,
  `Great Britain's own measured area should sit far above the threshold, got ${edinburghResult!.areaKm2.toFixed(0)} km^2`,
);

const dublinResult = islandAreaForPoint(dublin, coastlineChains);
assert(dublinResult !== null, "Dublin resolves to a real closed chain");
assert(dublinResult!.isIsland === false, "Dublin (Ireland, user-confirmed mainland) is not classified as an island");
assert(
  dublinResult!.areaKm2 > MAINLAND_AREA_THRESHOLD_KM2 * 3,
  `Ireland's own measured area should sit well above the threshold, got ${dublinResult!.areaKm2.toFixed(0)} km^2`,
);

const skyeResult = islandAreaForPoint(skye, coastlineChains);
assert(skyeResult !== null, "Skye resolves to a real closed chain");
assert(skyeResult!.isIsland === true, `Skye is classified as an island, got area ${skyeResult?.areaKm2.toFixed(0)} km^2`);
assert(
  skyeResult!.areaKm2 < MAINLAND_AREA_THRESHOLD_KM2,
  `Skye's own measured area should sit below the threshold, got ${skyeResult!.areaKm2.toFixed(0)} km^2`,
);

assert(islandAreaForPoint(openOcean, coastlineChains) === null, "a point over open ocean, inside no real chain, returns null rather than a guess");

console.log("\nAll island-detection checks passed.");
