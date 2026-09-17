// Manual verification script for settlement-fallback.mts, run directly
// with `node --experimental-strip-types src/renderer/settlement-
// fallback.verify.mts` — same pattern as the project's other .verify.mts
// files.
import { findFallbackSettlement, type DecodedSettlement } from "./settlement-fallback.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function settlement(
  name: string,
  lon: number,
  lat: number,
  rank: DecodedSettlement["rank"],
  population: number | null = null,
): DecodedSettlement {
  return { lon, lat, name, rank, population, osmId: Math.floor(Math.random() * 1_000_000) };
}

// No settlements at all -> null, not a crash.
{
  assert(findFallbackSettlement([0, 0], []) === null, "an empty settlement list returns null");
}

// A small town close by beats a big city far away, within the first (50km) radius.
{
  const nearTown = settlement("Nearby Town", 0.1, 0.1, "town");
  const farCity = settlement("Far City", 5, 5, "city"); // ~600km+ away, well outside every radius tier
  const result = findFallbackSettlement([0, 0], [nearTown, farCity]);
  assert(result?.name === "Nearby Town", `expected the near town within the first radius, got ${result?.name}`);
}

// Within the same radius tier, a more significant rank wins even if it's
// slightly farther than a less significant one.
{
  const nearHamlet = settlement("Near Hamlet", 0.05, 0.05, "hamlet");
  const nearerTown = settlement("Also Near Town", 0.1, 0.1, "town");
  const result = findFallbackSettlement([0, 0], [nearHamlet, nearerTown]);
  assert(result?.name === "Also Near Town", `rank should beat raw distance within the same tier, got ${result?.name}`);
}

// Same rank: population breaks the tie.
{
  const smallTown = settlement("Small Town", 0.1, 0.1, "town", 5_000);
  const bigTown = settlement("Big Town", 0.15, 0.15, "town", 50_000);
  const result = findFallbackSettlement([0, 0], [smallTown, bigTown]);
  assert(result?.name === "Big Town", `population should break a same-rank tie, got ${result?.name}`);
}

// Same rank, no population data at all on either: falls back to distance.
{
  const closer = settlement("Closer Village", 0.05, 0.05, "village");
  const farther = settlement("Farther Village", 0.2, 0.2, "village");
  const result = findFallbackSettlement([0, 0], [farther, closer]);
  assert(result?.name === "Closer Village", `distance should be the final tiebreaker, got ${result?.name}`);
}

// Nothing within the tight or medium radius: the unlimited tier still
// finds the one settlement that exists, however far away.
{
  const onlyOption = settlement("Distant Village", 5, 5, "village");
  const result = findFallbackSettlement([0, 0], [onlyOption]);
  assert(result?.name === "Distant Village", "the unlimited final radius tier still finds something, however far");
}

console.log("\nAll route-draw settlement-fallback checks passed.");
