// Manual verification for landuse-demand.mts, run directly with
// `node --experimental-strip-types src/renderer/landuse-demand.verify.mts`
// — same pattern as this project's other .verify.mts files. Only the pure
// parsing/weighting logic is covered here; `loadLanduseDemandPoints`
// itself (the fetch+WASM-decode call) isn't independently testable
// without a live map-data server, the same limitation this project's own
// `coastline-clip.mts` split already works around by keeping the real
// fetch/decode call as the one deliberately untested impure piece.
import { parseDecodedLandusePoints, demandWeightFor, DEMAND_CATEGORY_WEIGHT, type RawDecodedLandusePoint } from "./landuse-demand.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- parseDecodedLandusePoints ---

{
  const raw: RawDecodedLandusePoint[] = [
    { kind: "zone", category: "Housing", lon: -4.25, lat: 55.86, osmId: 123, name: "Example Estate" },
    { kind: "poi", category: "Schools", lon: -4.26, lat: 55.87, osmId: 456 },
  ];
  const points = parseDecodedLandusePoints(raw);
  assert(points.length === 2, `expected both real points to survive parsing, got ${points.length}`);
  assert(points[0].kind === "zone" && points[0].category === "Housing" && points[0].name === "Example Estate" && points[0].osmId === 123, "a zone's own real fields (including its name) carry through exactly");
  assert(points[1].kind === "poi" && points[1].name === null && points[1].osmId === 456, "a poi with no real name gets null, not a fabricated placeholder");
}

{
  const raw: RawDecodedLandusePoint[] = [
    { kind: "zone", category: "NotARealCategory", lon: 0, lat: 0, osmId: 1 } as unknown as RawDecodedLandusePoint,
    { kind: "something-future", category: "Housing", lon: 0, lat: 0, osmId: 2 } as unknown as RawDecodedLandusePoint,
  ];
  const points = parseDecodedLandusePoints(raw);
  assert(points.length === 0, `an unrecognized category or kind must be skipped, not guessed at or included anyway, got ${points.length}`);
}

assert(parseDecodedLandusePoints([]).length === 0, "an empty decode result parses to an empty array, not an error");

// --- demandWeightFor / DEMAND_CATEGORY_WEIGHT ---

assert(demandWeightFor({ category: "Housing" }) === DEMAND_CATEGORY_WEIGHT.Housing, "demandWeightFor reads the real, named weight table — not a separate hardcoded number");
assert(demandWeightFor({ category: "Schools" }) > demandWeightFor({ category: "Retail" }), "Schools must weigh more than Retail per this file's own documented first-pass reasoning");
assert(demandWeightFor({ category: "Housing" }) === demandWeightFor({ category: "Workplaces" }), "Housing and Workplaces start at the same baseline — each other's real commute counterpart");
for (const category of Object.keys(DEMAND_CATEGORY_WEIGHT) as (keyof typeof DEMAND_CATEGORY_WEIGHT)[]) {
  assert(DEMAND_CATEGORY_WEIGHT[category] > 0, `every category's own weight must be a real positive number, ${category} was ${DEMAND_CATEGORY_WEIGHT[category]}`);
}

console.log("\nAll landuse-demand checks passed.");
