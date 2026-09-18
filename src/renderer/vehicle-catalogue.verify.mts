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
  // Genuinely different seat counts at the two lengths — the earlier
  // blanket "81 at both lengths" guess was corrected: 75 at 13m, 81 at
  // 14.8m.
  const dd = findVehicleModel("volvo-9700dd")!;
  const short = dd.lengths.find((l) => l.lengthM === 13)!;
  const long = dd.lengths.find((l) => l.lengthM === 14.8)!;
  assert(short.capacity.kind === "seatedOnly" && short.capacity.seated === 75, "the 13m Volvo 9700DD seats 75");
  assert(long.capacity.kind === "seatedOnly" && long.capacity.seated === 81, "the 14.8m Volvo 9700DD seats 81 — genuinely different from the 13m, not the same figure at both lengths");
}

{
  // The EVM Cityline: every vehicle in the catalogue always has its
  // wheelchair bay (corrected mid-session — there's no "no bay fitted"
  // configuration at all), so capacity is the same live wheelchairBay-
  // Dependent kind the Evora uses, not a purchase-time fit-out choice.
  // Low floor vs stepped entrance is real (a retrofittable option), so
  // they're two separate length variants sharing the same 7.4m length,
  // distinguished by variantLabel.
  const cityline = findVehicleModel("evm-cityline-diesel")!;
  assert(cityline.lengths.length === 2, "the Cityline has two real builds (stepped entrance, low floor) at the same 7.4m length");

  const stepped = cityline.lengths.find((l) => l.variantLabel === "Stepped entrance")!;
  assert(stepped.capacity.kind === "wheelchairBayDependent", "the stepped Cityline's capacity is the dynamic wheelchair-bay-dependent kind");
  if (stepped.capacity.kind === "wheelchairBayDependent") {
    assert(stepped.capacity.bayConverted.seated === 16 && stepped.capacity.bayConverted.standing === 0, "the stepped Cityline seats 16 with the bay converted, no standing at all");
    assert(stepped.capacity.bayInUse.seated === 14 && stepped.capacity.bayInUse.standing === 0, "the stepped Cityline seats 14 with a wheelchair user aboard, still no standing — a seat folds away instead");
  }

  const lowFloor = cityline.lengths.find((l) => l.variantLabel === "Low floor")!;
  assert(lowFloor.capacity.kind === "wheelchairBayDependent", "the low-floor Cityline's capacity is the dynamic wheelchair-bay-dependent kind");
  if (lowFloor.capacity.kind === "wheelchairBayDependent") {
    assert(lowFloor.capacity.bayConverted.seated === 16 && lowFloor.capacity.bayConverted.standing === 8, "the low-floor Cityline seats 16 and stands 8 with the bay converted");
    assert(lowFloor.capacity.bayInUse.seated === 16 && lowFloor.capacity.bayInUse.standing === 4, "the low-floor Cityline keeps the same 16 seats but only stands 4 with a wheelchair user aboard — unlike the stepped build, seated capacity doesn't change here");
  }
}

{
  const evora = findVehicleModel("mcv-evora")!;
  const short = evora.lengths.find((l) => l.lengthM === 10.8)!;
  assert(short.capacity.kind === "wheelchairBayDependent", "the Evora's capacity is the dynamic wheelchair-bay-dependent kind, not a fixed configurator choice");
  if (short.capacity.kind === "wheelchairBayDependent") {
    assert(short.capacity.bayConverted.seated === 35 && short.capacity.bayInUse.seated === 35, "the 10.8m Evora seats 35 regardless of bay state");
    assert(short.capacity.bayInUse.standing === 34, "the 10.8m Evora stands 34 with a wheelchair aboard");
    assert(short.capacity.bayConverted.standing === 43, "the 10.8m Evora stands 43 with the bay converted");
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
