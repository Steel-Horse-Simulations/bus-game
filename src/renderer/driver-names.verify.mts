// Manual verification script for driver-names.mts, run directly with
// `node --experimental-strip-types src/renderer/driver-names.verify.mts`
// — same pattern as the project's other .verify.mts files.
import { randomDriverName } from "./driver-names.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

const name = randomDriverName(() => 0);
assert(name.split(" ").length === 2, "a generated name is exactly a first and a last name");

const first = randomDriverName(() => 0);
const last = randomDriverName(() => 0.999999);
assert(first !== last, "the lowest and highest rng values pick different names");

// A real rng (Math.random's own [0, 1) range) never indexes past the end
// of either list — checked directly across many draws, not assumed.
let allWellFormed = true;
for (let i = 0; i < 1000; i++) {
  const n = randomDriverName();
  if (n.length === 0 || n.split(" ").length !== 2) allWellFormed = false;
}
assert(allWellFormed, "1000 draws from the real Math.random rng are all well-formed two-word names");

console.log("All driver-names checks passed.");
