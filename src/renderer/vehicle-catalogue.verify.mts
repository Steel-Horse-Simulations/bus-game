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
  // Every gap Q13 (OPEN-ITEMS.md) originally flagged — the Cityline, the
  // Volvo 9700DD, and the Yutong coach (once confirmed to be GTe12/GTe14,
  // not T12E/T15E) — is now filled in with real user-supplied figures.
  // This count should only change deliberately, not silently.
  const unspecified = VEHICLE_MODELS.flatMap((v) => v.lengths.filter((l) => l.capacity.kind === "unspecified").map(() => v.id));
  assert(unspecified.length === 0, `expected no length variants with unspecified capacity left, got ${unspecified.length}: ${JSON.stringify(unspecified)}`);
}

{
  // §1's own worked rule: up to and including 12.9m is twin-axle, over is tri-axle.
  assert(axleCountForLength(12.9) === "twin-axle", "12.9m itself is still twin-axle (inclusive boundary)");
  assert(axleCountForLength(13) === "tri-axle", "13m is tri-axle");
  assert(axleCountForLength(12.4) === "twin-axle", "the Volvo 9700's 12.4m length is twin-axle");
  assert(axleCountForLength(15) === "tri-axle", "the Volvo 9700's 15m length is tri-axle");
}

{
  const coach = findVehicleModel("yutong-coach")!;
  const gte12 = coach.lengths.find((l) => l.lengthM === 12)!;
  const gte14 = coach.lengths.find((l) => l.lengthM === 14)!;
  assert(gte14 !== undefined, "the Yutong coach's longer length is 14m (GTe14), not the old 15m (T15E)");
  assert(gte12.capacity.kind === "seatedOnly" && gte12.capacity.seated === 50, "the Yutong GTe12 seats 50");
  assert(gte14.capacity.kind === "seatedOnly" && gte14.capacity.seated === 57, "the Yutong GTe14 seats 57");
  assert(axleCountForLength(gte14.lengthM) === "tri-axle", "14m is over the 12.9m threshold, so the GTe14 is correctly tri-axle");
}

{
  const dd = findVehicleModel("volvo-9700dd")!;
  assert(dd.lengths.every((l) => l.capacity.kind === "seatedOnly"), "the Volvo 9700DD's capacity is now a real seatedOnly figure, not unspecified");
  assert(dd.lengths.every((l) => l.capacity.kind === "seatedOnly" && l.capacity.seated === 81), "the Volvo 9700DD seats 81, the same at both lengths");
}

{
  const cityline = findVehicleModel("evm-cityline-diesel")!;
  const capacity = cityline.lengths[0].capacity;
  assert(capacity.kind === "configDependent", "the EVM Cityline's capacity depends on its fit-out configuration, not a single fixed figure");
  if (capacity.kind === "configDependent") {
    assert(capacity.configs.length === 4, "the Cityline has exactly 4 real fit-out configurations (stepped/low-floor x with/without a wheelchair bay)");
    const lowFloorWithBay = capacity.configs.find((c) => c.label === "Low floor, wheelchair bay fitted")!;
    assert(lowFloorWithBay.seated === 26 && lowFloorWithBay.standing === 4 && lowFloorWithBay.wheelchairSpaces === 1, "the low-floor, wheelchair-equipped Cityline config matches the user's figures");
    const steppedNoBay = capacity.configs.find((c) => c.label === "Stepped entrance, no wheelchair bay")!;
    assert(steppedNoBay.seated === 16 && steppedNoBay.wheelchairSpaces === 0, "the stepped, no-wheelchair-bay Cityline config matches the user's figures");
  }
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
