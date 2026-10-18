// Manual verification script for fleet-numbering.mts, run directly with
// `node --experimental-strip-types src/renderer/fleet-numbering.verify.mts`.
import { fleetCategoryDigit, powerTypeSuffix, formatFleetNumber, generatePlate, broadClassForModel } from "./fleet-numbering.mts";
import { VEHICLE_MODELS } from "./vehicle-catalogue.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- every real catalogue model is mapped, no silent fallback ---
for (const v of VEHICLE_MODELS) {
  for (const length of v.lengths) {
    const digit = fleetCategoryDigit(v.id, length.lengthM);
    assert(digit >= 1 && digit <= 7, `${v.id} at ${length.lengthM}m gets a real category digit (1-7), got ${digit}`);
  }
}

// --- category digit boundaries, against UK-EXPANSION.md §14's own worked examples ---
assert(broadClassForModel("evm-cityline-diesel") === "minibus", "the Cityline is a minibus");
assert(fleetCategoryDigit("evm-cityline-diesel", 7.4) === 1, "minibus is always digit 1");
assert(fleetCategoryDigit("mcv-evora", 10.8) === 2, "Evora at 10.8m is digit 2 (midibus, at the cutoff)");
assert(fleetCategoryDigit("mcv-evora", 12.9) === 3, "Evora at 12.9m is digit 3 (full-size single-deck)");
assert(fleetCategoryDigit("adl-enviro200ev", 9.9) === 2, "Enviro200EV at 9.9m is digit 2");
assert(fleetCategoryDigit("adl-enviro200ev", 10.9) === 3, "Enviro200EV at 10.9m is digit 3 (just over the 10.8m cutoff)");
assert(fleetCategoryDigit("adl-enviro400-mmc", 11.5) === 4, "Enviro400 MMC at 11.5m is digit 4 (double-decker twin-axle)");
assert(fleetCategoryDigit("adl-enviro400-xlb", 13.4) === 5, "the XLB at 13.4m is digit 5 (double-decker tri-axle)");
assert(fleetCategoryDigit("volvo-9700", 12.4) === 6, "9700 at 12.4m is digit 6 (coach twin-axle)");
assert(fleetCategoryDigit("volvo-9700", 13.1) === 7, "9700 at 13.1m is digit 7 (coach tri-axle)");
assert(fleetCategoryDigit("volvo-9700dd", 13) === 7, "9700DD at 13m is digit 7 too — double-deck coaches share the single-deck coach's tri-axle digit");
assert(fleetCategoryDigit("adl-enviro400-opentop-diesel", 10.9) === 4, "the open-top Enviro400 is still digit 4, despite its own category label never saying 'double-decker'");

// --- power suffix ---
assert(powerTypeSuffix("diesel") === "", "diesel gets no suffix");
assert(powerTypeSuffix("hybrid") === "", "hybrid gets no suffix");
assert(powerTypeSuffix("electric") === "e", "electric gets e");
assert(powerTypeSuffix("hydrogen") === "h", "hydrogen gets h");

// --- fleet number formatting, against §14's own worked examples ---
assert(formatFleetNumber(4, 1, "") === "4001", 'first digit-4 vehicle formats as "4001"');
assert(formatFleetNumber(3, 14, "e") === "3014e", 'matches §14\'s own worked example "3014e"');
assert(formatFleetNumber(7, 2, "h") === "7002h", 'matches §14\'s own worked example "7002h"');
assert(formatFleetNumber(1, 1234, "") === "11234", "a 4-digit sequential still just concatenates, no padding needed beyond the minimum 3");

// --- registration plates ---
const fixedRng = () => 0; // always picks the first letter/digit, for a deterministic assertion
assert(generatePlate(-4.2518, 55.8642, new Date("2026-05-01"), fixedRng).startsWith("SA"), "a Glasgow-area depot gets an SA plate");
assert(generatePlate(-3.1883, 55.9533, new Date("2026-05-01"), fixedRng).startsWith("SK"), "an Edinburgh-area depot gets an SK plate");
assert(generatePlate(-2.0943, 57.1497, new Date("2026-05-01"), fixedRng).startsWith("SU"), "an Aberdeen-area depot gets an SU plate");
assert(generatePlate(-4.2247, 57.4778, new Date("2026-05-01"), fixedRng).startsWith("SX"), "an Inverness-area depot gets an SX plate");
assert(generatePlate(-1.8904, 52.4862, new Date("2026-05-01"), fixedRng).startsWith("BA"), "a Birmingham-area depot gets a BA plate");
assert(generatePlate(-0.1276, 51.5072, new Date("2026-05-01"), fixedRng).startsWith("LA"), "a London-area depot gets an LA plate");

const niPlate = generatePlate(-5.93, 54.6, new Date("2026-05-01"), fixedRng);
assert(/^[A-Z]{3} \d{4}$/.test(niPlate), `a Belfast-area depot gets a distinct NI-style plate (letters-space-digits), got "${niPlate}"`);

assert(/^SA26 [A-Z]{3}$/.test(generatePlate(-4.2518, 55.8642, new Date("2026-05-01"), fixedRng)), "a March-August 2026 buy gets age identifier 26");
assert(/^SA76 [A-Z]{3}$/.test(generatePlate(-4.2518, 55.8642, new Date("2026-10-18"), fixedRng)), "a September-February buy gets age identifier +50 (76 for Oct 2026)");
assert(/^SA76 [A-Z]{3}$/.test(generatePlate(-4.2518, 55.8642, new Date("2027-01-01"), fixedRng)), "a January 2027 buy is still in the Sept 2026-Feb 2027 period, same age identifier (76) as the September date above");

console.log("\nAll fleet-numbering checks passed.");
