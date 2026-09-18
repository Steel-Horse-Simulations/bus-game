// Manual verification script for vehicle-catalogue.mts, run directly with
// `node --experimental-strip-types src/renderer/vehicle-catalogue.verify.mts`
// — same pattern as the project's other .verify.mts files. This isn't a
// re-transcription check against VEHICLE-SPECS.md (that has to be read by
// eye) — it's a structural sanity pass: every id is unique, every vehicle
// has at least one length, every "unspecified" capacity is a real,
// intentional gap rather than a typo, and the derived axle-count rule
// matches VEHICLE-SPECS.md §1's own worked examples.
import { VEHICLE_MODELS, GENERAL_OPTIONS, axleCountForLength, generalOptionsFor, findVehicleModel } from "./vehicle-catalogue.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

{
  const ids = VEHICLE_MODELS.map((v) => v.id);
  assert(new Set(ids).size === ids.length, "every vehicle model has a unique id");
}

{
  assert(VEHICLE_MODELS.every((v) => v.lengths.length > 0), "every vehicle has at least one length variant");
  assert(VEHICLE_MODELS.every((v) => v.lengths.every((l) => l.energyOptions.length > 0)), "every length variant has at least one energy option");
}

{
  assert(VEHICLE_MODELS.every((v) => v.topSpeedMph === 50 || v.topSpeedMph === 62), "every vehicle's top speed is exactly 50 or 62mph (VEHICLE-SPECS.md §1)");
}

{
  // §1: exactly two named vehicles state their capacity is "not stated" —
  // the Cityline (both power variants) and two coaches (9700DD, Yutong
  // coach) — this count should only grow if a real transcription gap is
  // found, not silently.
  const unspecified = VEHICLE_MODELS.flatMap((v) => v.lengths.filter((l) => l.capacity.kind === "unspecified").map(() => v.id));
  assert(
    unspecified.length === 6,
    `expected exactly 6 length variants with unspecified capacity (2 Cityline + 2 9700DD lengths + 2 Yutong coach lengths), got ${unspecified.length}: ${JSON.stringify(unspecified)}`,
  );
}

{
  // §1's own worked rule: up to and including 12.9m is twin-axle, over is tri-axle.
  assert(axleCountForLength(12.9) === "twin-axle", "12.9m itself is still twin-axle (inclusive boundary)");
  assert(axleCountForLength(13) === "tri-axle", "13m is tri-axle");
  assert(axleCountForLength(12.4) === "twin-axle", "the Volvo 9700's 12.4m length is twin-axle");
  assert(axleCountForLength(15) === "tri-axle", "the Volvo 9700's 15m length is tri-axle");
}

{
  const evora = findVehicleModel("mcv-evora")!;
  const short = evora.lengths.find((l) => l.lengthM === 10.8)!;
  assert(short.capacity.kind === "wheelchairConvertible", "the Evora's capacity is the dynamic wheelchair-convertible kind, not a fixed configurator choice");
  if (short.capacity.kind === "wheelchairConvertible") {
    assert(short.capacity.seated === 35, "the 10.8m Evora seats 35");
    assert(short.capacity.standingWithWheelchair === 34, "the 10.8m Evora stands 34 with a wheelchair aboard");
    assert(short.capacity.standingBayConverted === 43, "the 10.8m Evora stands 43 with the bay converted");
  }
}

{
  const enviro500 = findVehicleModel("adl-enviro500")!;
  const cap = enviro500.lengths[0].capacity;
  assert(cap.kind === "seatedStanding" && cap.tipUps === 3, "the Enviro500 carries 3 tip-ups");
}

{
  // Options filtering: a diesel vehicle should never see an electric-only
  // or hydrogen-only option, and vice versa; "all" options should reach
  // every vehicle regardless of power type.
  const diesel = findVehicleModel("adl-enviro400-mmc")!;
  const dieselOptions = generalOptionsFor(diesel).map((o) => o.id);
  assert(dieselOptions.includes("larger-fuel-tank"), "a diesel vehicle sees the larger-fuel-tank option");
  assert(!dieselOptions.includes("larger-battery"), "a diesel vehicle never sees the electric-only larger-battery option");
  assert(!dieselOptions.includes("larger-hydrogen-tank"), "a diesel vehicle never sees the hydrogen-only larger-hydrogen-tank option");
  assert(dieselOptions.includes("cctv-cameras"), "every vehicle sees the all-vehicles CCTV cameras option");

  const electric = findVehicleModel("adl-enviro200ev")!;
  const electricOptions = generalOptionsFor(electric).map((o) => o.id);
  assert(electricOptions.includes("larger-battery") && electricOptions.includes("pantograph-charging"), "an electric vehicle sees its own electric-only options");
  assert(!electricOptions.includes("larger-fuel-tank"), "an electric vehicle never sees the diesel-only larger-fuel-tank option");

  const cityline = findVehicleModel("evm-cityline-diesel")!;
  const citylineOptions = generalOptionsFor(cityline).map((o) => o.id);
  assert(citylineOptions.includes("low-floor"), "the EVM Cityline sees its own low-floor conversion option");
  assert(!electricOptions.includes("low-floor"), "a non-Cityline vehicle never sees the Cityline-only low-floor option");
}

{
  // Every GENERAL_OPTIONS row should be reachable by at least one real
  // vehicle in the catalogue, or it's dead data nobody will ever see.
  const reachable = new Set(VEHICLE_MODELS.flatMap((v) => generalOptionsFor(v).map((o) => o.id)));
  const unreachable = GENERAL_OPTIONS.map((o) => o.id).filter((id) => !reachable.has(id));
  assert(unreachable.length === 0, `every general option should be reachable by at least one vehicle, unreachable: ${JSON.stringify(unreachable)}`);
}

console.log(`\n${VEHICLE_MODELS.length} vehicle models, ${VEHICLE_MODELS.reduce((n, v) => n + v.lengths.length, 0)} length variants total.`);
console.log("\nAll vehicle-catalogue checks passed.");
