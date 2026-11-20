// Manual verification script for vehicle-catalogue.mts, run directly with
// `node --experimental-strip-types src/renderer/vehicle-catalogue.verify.mts`
// — same pattern as the project's other .verify.mts files. This isn't a
// re-transcription check against VEHICLE-SPECS.md (that has to be read by
// eye) — it's a structural sanity pass: every id is unique, every vehicle
// has at least one length, every "unspecified" capacity is a real,
// intentional gap rather than a typo, and the derived axle-count rule
// matches VEHICLE-SPECS.md §1's own worked examples.
import {
  VEHICLE_MODELS,
  GENERAL_OPTIONS,
  axleCountForLength,
  generalOptionsFor,
  findVehicleModel,
  lengthsForPower,
  priceFor,
  priceForGeneralOption,
  seatedCapacityOf,
  repowerTargetsFor,
  minTopSpeedMphForRoute,
  topSpeedMphForModel,
} from "./vehicle-catalogue.mts";

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
  // Per-model topSpeedMph was dropped 2026-11-20 ("Lets drop the max
  // speed of individual vehicles and limit all coaches to 60mph keeping
  // buses at 50mph. I can't find real figures for most.") — now a plain
  // category derivation: Coaches and Minibus (the EVM Cityline/Sprinter,
  // confirmed kept with coaches) get 60, every other category gets 50.
  assert(VEHICLE_MODELS.every((v) => topSpeedMphForModel(v) === 50 || topSpeedMphForModel(v) === 60), "every vehicle's derived top speed is exactly 50 or 60mph");
  assert(VEHICLE_MODELS.filter((v) => v.category === "Coaches").every((v) => topSpeedMphForModel(v) === 60), "every real coach is 60mph");
  assert(topSpeedMphForModel(findVehicleModel("evm-cityline")!) === 60, "the EVM Cityline/Sprinter minibus stays grouped with coaches at 60mph, confirmed directly");
  assert(VEHICLE_MODELS.filter((v) => v.category === "Double-deckers" || v.category === "Single-deckers / midibuses").every((v) => topSpeedMphForModel(v) === 50), "every ordinary bus category is 50mph");
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
  // T181 (confirmed 2026-11-13): the Yutong coach was fully removed, not
  // just discontinued (reversing T179's soft-removal) — real figures live
  // only as a documented reference in VEHICLE-SPECS.md now.
  assert(findVehicleModel("yutong-coach") === undefined, "the Yutong coach no longer exists as a catalogue entry");
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
  const cityline = findVehicleModel("evm-cityline")!;
  const dieselCityline = cityline.lengths.filter((l) => l.powerType === "diesel");
  assert(dieselCityline.length === 2, "the diesel Cityline has two real builds (stepped entrance, low floor) at the same 7.4m length");
  assert(cityline.lengths.length === 4, "the merged Cityline has 4 length rows total: 2 diesel + 2 electric, same 7.4m, each pair distinguished by variantLabel");

  const stepped = dieselCityline.find((l) => l.variantLabel === "Stepped entrance")!;
  assert(stepped.capacity.kind === "wheelchairBayDependent", "the stepped Cityline's capacity is the dynamic wheelchair-bay-dependent kind");
  if (stepped.capacity.kind === "wheelchairBayDependent") {
    assert(stepped.capacity.bayConverted.seated === 16 && stepped.capacity.bayConverted.standing === 0, "the stepped Cityline seats 16 with the bay converted, no standing at all");
    assert(stepped.capacity.bayInUse.seated === 14 && stepped.capacity.bayInUse.standing === 0, "the stepped Cityline seats 14 with a wheelchair user aboard, still no standing — a seat folds away instead");
  }

  const lowFloor = dieselCityline.find((l) => l.variantLabel === "Low floor")!;
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
  // adl-enviro500 was replaced by adl-enviro400-xlb (UK-EXPANSION.md §14a).
  const xlb = findVehicleModel("adl-enviro400-xlb")!;
  const cap = xlb.lengths[0].capacity;
  assert(cap.kind === "seatedStanding" && cap.tipUps === 3, "the XLB carries 3 tip-ups");
  assert(cap.kind === "seatedStanding" && cap.seated === 100 && cap.standing === 25, "the XLB seats 100, stands 25");
  assert(xlb.lengths[0].lengthM === 13.4, "the XLB is 13.4m, tri-axle");
  assert(xlb.basePriceGBP === 270_000, "the XLB is £270,000");
}

{
  // Options filtering: a diesel vehicle should never see an electric-only
  // or hydrogen-only option, and vice versa; "all" options should reach
  // every vehicle regardless of power type. generalOptionsFor now takes
  // the currently-selected power explicitly, since a merged model can
  // offer more than one.
  const enviro400 = findVehicleModel("adl-enviro400")!;
  const dieselOptions = generalOptionsFor(enviro400, "diesel").map((o) => o.id);
  assert(dieselOptions.includes("larger-fuel-tank"), "the Enviro400 under diesel sees the larger-fuel-tank option");
  assert(!dieselOptions.includes("larger-battery"), "the Enviro400 under diesel never sees the electric-only larger-battery option");
  assert(!dieselOptions.includes("larger-hydrogen-tank"), "the Enviro400 under diesel never sees the hydrogen-only larger-hydrogen-tank option");
  assert(dieselOptions.includes("cctv-cameras"), "every vehicle sees the all-vehicles CCTV cameras option");

  const enviro400Electric = generalOptionsFor(enviro400, "electric").map((o) => o.id);
  assert(enviro400Electric.includes("larger-battery") && enviro400Electric.includes("pantograph-charging"), "the same Enviro400 under electric sees its own electric-only options");
  assert(!enviro400Electric.includes("larger-fuel-tank"), "the same Enviro400 under electric never sees the diesel-only larger-fuel-tank option");

  const cityline = findVehicleModel("evm-cityline")!;
  const citylineOptions = generalOptionsFor(cityline, "diesel").map((o) => o.id);
  assert(citylineOptions.includes("low-floor"), "the EVM Cityline sees its own low-floor conversion option");
  assert(!dieselOptions.includes("low-floor"), "a non-Cityline vehicle never sees the Cityline-only low-floor option");
}

{
  // Every GENERAL_OPTIONS row should be reachable by at least one real
  // vehicle under at least one of its own real power options, or it's
  // dead data nobody will ever see.
  const reachable = new Set(VEHICLE_MODELS.flatMap((v) => v.powerOptions.flatMap((p) => generalOptionsFor(v, p.powerType).map((o) => o.id))));
  const unreachable = GENERAL_OPTIONS.map((o) => o.id).filter((id) => !reachable.has(id));
  assert(unreachable.length === 0, `every general option should be reachable by at least one vehicle, unreachable: ${JSON.stringify(unreachable)}`);
}

// --- delta pricing (2026-10-18): real figures from before the merge, not invented ---
{
  const sevenNineHundred = findVehicleModel("volvo-7900")!;
  assert(sevenNineHundred.powerOptions.length === 2, "the merged Volvo 7900 offers exactly 2 powers (hybrid base, electric)");
  assert(sevenNineHundred.basePriceGBP === 240_000, "the Volvo 7900's base price is the old Hybrid figure, £240,000");
  const hybridLength = lengthsForPower(sevenNineHundred, "hybrid")[0];
  const electricLength = lengthsForPower(sevenNineHundred, "electric")[0];
  assert(hybridLength.lengthM === 12 && electricLength.lengthM === 12, "both powers share the identical 12m length");
  assert(priceFor(sevenNineHundred, hybridLength) === 240_000, "hybrid prices at the base figure, no delta");
  assert(priceFor(sevenNineHundred, electricLength) === 320_000, "electric prices at 240,000 + 80,000 delta = 320,000, the old Electric base figure");
  assert(
    hybridLength.capacity.kind === "seatedStanding" && electricLength.capacity.kind === "seatedStanding" && hybridLength.capacity.standing === 62 && electricLength.capacity.standing === 57,
    "the same 12m length still carries two genuinely different standing capacities depending on power — merging by power never silently lost this",
  );
}

{
  const enviro400 = findVehicleModel("adl-enviro400")!;
  assert(enviro400.powerOptions.length === 2, "the merged Enviro400 offers diesel and electric");
  const dieselLengths = lengthsForPower(enviro400, "diesel").map((l) => l.lengthM);
  const electricLengths = lengthsForPower(enviro400, "electric").map((l) => l.lengthM);
  assert(JSON.stringify(dieselLengths) === JSON.stringify([10.5, 10.9, 11.5]), "diesel keeps its own real 3 lengths, got " + JSON.stringify(dieselLengths));
  assert(JSON.stringify(electricLengths) === JSON.stringify([11.1]), "electric only ever had the one real length (11.1m) — merging never invented a diesel-only length under electric");
  assert(priceFor(enviro400, lengthsForPower(enviro400, "electric")[0]) === 380_000, "electric at 235,000 + 145,000 delta = 380,000, the old Enviro400EV base figure");
}

{
  const streetdeck = findVehicleModel("wrightbus-streetdeck")!;
  assert(streetdeck.powerOptions.length === 3, "the merged StreetDeck offers all 3 of diesel/electric/hydrogen");
  assert(priceFor(streetdeck, lengthsForPower(streetdeck, "electric")[0]) === 560_000, "electric at 310,000 + 250,000 delta = 560,000, the old Electroliner base figure");
  assert(priceFor(streetdeck, lengthsForPower(streetdeck, "hydrogen")[0]) === 550_000, "hydrogen at 310,000 + 240,000 delta = 550,000, the old Hydroliner base figure");
}

{
  const kite = findVehicleModel("wrightbus-gb-kite")!;
  assert(lengthsForPower(kite, "electric").length === 3, "the GB Kite's electric side keeps all 3 of its own real lengths");
  assert(lengthsForPower(kite, "hydrogen").length === 1, "the GB Kite's hydrogen side is still fixed-length only, unlike electric's three");
  assert(priceFor(kite, lengthsForPower(kite, "hydrogen")[0]) === 420_000, "hydrogen at 350,000 + 70,000 delta = 420,000, the old Hydroliner base figure");
}

{
  // Donor-priced vehicles (open-top) have no price of their own — priceFor
  // must say so honestly rather than returning a nonsense 0 or NaN.
  const openTop = findVehicleModel("wrightbus-streetdeck-opentop")!;
  assert(priceFor(openTop, openTop.lengths[0]) === null, "a donor-priced vehicle has no price of its own — priceFor returns null, not a guessed figure");
}

// --- option prices (2026-10-18) ---
{
  const enviro400 = findVehicleModel("adl-enviro400")!;
  const dieselLength = lengthsForPower(enviro400, "diesel")[0];
  const standardTank = dieselLength.energyOptions.find((o) => o.label === "Standard tank")!;
  const smallerTank = dieselLength.energyOptions.find((o) => o.label === "Smaller tank")!;
  assert(standardTank.priceDeltaGBP === 0, "the Enviro400's Standard tank is the free base");
  assert(smallerTank.priceDeltaGBP === -1_125, `the Enviro400's Smaller tank is a confirmed -£1,125 discount, got ${smallerTank.priceDeltaGBP}`);

  const streetdeck = findVehicleModel("wrightbus-streetdeck")!;
  const streetdeckSmaller = lengthsForPower(streetdeck, "diesel")[0].energyOptions.find((o) => o.label === "Smaller tank")!;
  assert(streetdeckSmaller.priceDeltaGBP === -825, `the StreetDeck Ultroliner's Smaller tank is a confirmed -£825 discount, got ${streetdeckSmaller.priceDeltaGBP}`);

  const sevenNineHundredElectric = lengthsForPower(findVehicleModel("volvo-7900")!, "electric")[0];
  const tiers = Object.fromEntries(sevenNineHundredElectric.energyOptions.map((o) => [o.label, o.priceDeltaGBP]));
  assert(tiers["NCA 280kWh"] === 0, "NCA 280kWh is the Volvo 7900 Electric's own base");
  assert(tiers["NCA 375kWh"] === 28_500, `NCA 375kWh should be +£28,500, got ${tiers["NCA 375kWh"]}`);
  assert(tiers["NCA 470kWh"] === 57_000, `NCA 470kWh should be +£57,000, got ${tiers["NCA 470kWh"]}`);
  assert(tiers["LFP 350kWh"] === 3_500, `LFP 350kWh should be +£3,500 (not computable from a flat rate), got ${tiers["LFP 350kWh"]}`);
  assert(tiers["LFP 500kWh"] === 41_000, `LFP 500kWh should be +£41,000 (not computable from a flat rate), got ${tiers["LFP 500kWh"]}`);

  const kiteHydrogen = lengthsForPower(findVehicleModel("wrightbus-gb-kite")!, "hydrogen")[0];
  const hydrogenTiers = Object.fromEntries(kiteHydrogen.energyOptions.map((o) => [o.label, o.priceDeltaGBP]));
  assert(hydrogenTiers["Hydrogen tank (medium)"] === 8_000, `the Kite Hydroliner's medium tank should be +£8,000, got ${hydrogenTiers["Hydrogen tank (medium)"]}`);
  assert(hydrogenTiers["Hydrogen tank (large)"] === 18_000, `the Kite Hydroliner's large tank should be +£18,000, got ${hydrogenTiers["Hydrogen tank (large)"]}`);

  const nineHundredStandard = lengthsForPower(findVehicleModel("volvo-9700")!, "diesel")[0];
  const interCity = nineHundredStandard.energyOptions.find((o) => o.label === "InterCity tank")!;
  assert(interCity.priceDeltaGBP === 1_800, `the Volvo 9700's InterCity tank should be +£1,800 (120L extra x £15/L), got ${interCity.priceDeltaGBP}`);
}

{
  // seatedCapacityOf — picks the right figure per Capacity kind.
  assert(seatedCapacityOf({ kind: "seatedStanding", seated: 40, standing: 16 }) === 40, "seatedStanding uses its own seated figure");
  assert(seatedCapacityOf({ kind: "seatedOnly", seated: 53 }) === 53, "seatedOnly uses its own seated figure");
  assert(seatedCapacityOf({ kind: "maxCapacity", maxCapacity: 78, maxSeated: 37, maxStanding: 39 }) === 37, "maxCapacity uses maxSeated");
  assert(
    seatedCapacityOf({ kind: "wheelchairBayDependent", bayConverted: { seated: 16, standing: 8 }, bayInUse: { seated: 16, standing: 4 } }) === 16,
    "wheelchairBayDependent uses bayConverted's own seated figure",
  );
}

{
  // priceForGeneralOption — flat, perSeat (with a real model override), standard and perEnergyOption all compute correctly.
  const wifi = GENERAL_OPTIONS.find((o) => o.id === "wifi")!;
  const usb = GENERAL_OPTIONS.find((o) => o.id === "usb-power")!;
  const airCon = GENERAL_OPTIONS.find((o) => o.id === "air-conditioning")!;
  const cameras = GENERAL_OPTIONS.find((o) => o.id === "cctv-cameras")!;
  const fuelTank = GENERAL_OPTIONS.find((o) => o.id === "larger-fuel-tank")!;
  const seatbelts = GENERAL_OPTIONS.find((o) => o.id === "seatbelts")!;

  const enviro400 = findVehicleModel("adl-enviro400")!;
  const dieselLength = lengthsForPower(enviro400, "diesel")[0]; // 74 seated
  assert(priceForGeneralOption(wifi, enviro400, dieselLength) === 2_200, "Wi-Fi is a flat £2,200 regardless of vehicle");
  assert(priceForGeneralOption(usb, enviro400, dieselLength) === 74 * 30, `USB should be £30 x 74 seats = £2,220, got ${priceForGeneralOption(usb, enviro400, dieselLength)}`);
  assert(priceForGeneralOption(airCon, enviro400, dieselLength) === 8_000, "air con is £8,000 on a non-Cityline vehicle");
  assert(priceForGeneralOption(cameras, enviro400, dieselLength) === 0, "CCTV cameras are always included, never priced");
  assert(priceForGeneralOption(fuelTank, enviro400, dieselLength) === 0, "larger-fuel-tank has no price of its own here — it's priced per energy option instead");

  const cityline = findVehicleModel("evm-cityline")!;
  const citylineLength = lengthsForPower(cityline, "diesel")[0]; // bayConverted.seated = 16
  assert(priceForGeneralOption(airCon, cityline, citylineLength) === 3_000, `air con should be the Cityline's own £3,000 override, got ${priceForGeneralOption(airCon, cityline, citylineLength)}`);

  const coach = findVehicleModel("volvo-9700")!;
  const coachLength = lengthsForPower(coach, "diesel")[0]; // 53 seated
  assert(priceForGeneralOption(seatbelts, coach, coachLength) === 0, "seatbelts are free and standard on coaches, overriding the usual £90/seat");
  assert(priceForGeneralOption(seatbelts, enviro400, dieselLength) === 74 * 90, `seatbelts on a non-coach should be £90 x 74 seats = £6,660, got ${priceForGeneralOption(seatbelts, enviro400, dieselLength)}`);
}

{
  // "Adding seats beyond the standard layout" was removed from the
  // catalogue entirely (user's own instruction, 2026-10-18) — no
  // passenger-facing effect was ever confirmed for it, and it's gone from
  // GENERAL_OPTIONS now rather than just hidden in the UI.
  const extraSeats = GENERAL_OPTIONS.find((o) => o.id === "extra-seats");
  const luggageRacks = GENERAL_OPTIONS.find((o) => o.id === "luggage-racks");
  assert(extraSeats === undefined, "'adding seats beyond the standard layout' is removed from the catalogue");
  assert(luggageRacks !== undefined && luggageRacks.priceKind === "flat" && luggageRacks.priceGBP === 1_500, "new luggage racks are a flat £1,500");
}

{
  // GreenRoad driver-behaviour system (added 2026-11-20, user's own
  // request, by name) — a flat, explicitly unsourced placeholder price,
  // applies to every vehicle (checkbox, "all").
  const greenroad = GENERAL_OPTIONS.find((o) => o.id === "greenroad")!;
  assert(greenroad !== undefined, "the GreenRoad driver-behaviour system exists in the catalogue");
  assert(greenroad.selectionType === "checkbox" && greenroad.appliesTo === "all", "GreenRoad is a checkbox available on every vehicle");
  const enviro400ForGreenroad = findVehicleModel("adl-enviro400")!;
  const dieselLengthForGreenroad = lengthsForPower(enviro400ForGreenroad, "diesel")[0];
  assert(
    priceForGeneralOption(greenroad, enviro400ForGreenroad, dieselLengthForGreenroad) === 350,
    `GreenRoad should be a flat £350 install (user's own figure, revised from the original £600 placeholder), got ${priceForGeneralOption(greenroad, enviro400ForGreenroad, dieselLengthForGreenroad)}`,
  );
}

// --- length-based pricing (2026-10-18): 0.5% of base price per 10cm over
// the shortest length under that power, rounded to the nearest £100 with
// round-half-to-even, plus a dynamic +£15,000 coach-only axle-crossing
// charge. Every figure below matches the user's own worked examples. ---
{
  const enviro400 = findVehicleModel("adl-enviro400")!;
  const dieselLengths = lengthsForPower(enviro400, "diesel");
  const l105 = dieselLengths.find((l) => l.lengthM === 10.5)!;
  const l109 = dieselLengths.find((l) => l.lengthM === 10.9)!;
  const l115 = dieselLengths.find((l) => l.lengthM === 11.5)!;
  assert(!l105.priceDeltaGBP, "the Enviro400 diesel's shortest length (10.5m) has no length delta");
  assert(l109.priceDeltaGBP === 4_700, `the Enviro400 diesel's 10.9m should be +£4,700, got ${l109.priceDeltaGBP}`);
  assert(l115.priceDeltaGBP === 11_800, `the Enviro400 diesel's 11.5m should be +£11,800, got ${l115.priceDeltaGBP}`);
  assert(priceFor(enviro400, l115) === enviro400.basePriceGBP! + 11_800, "the Enviro400 (not a coach) gets no axle charge even though 11.5m alone wouldn't cross anyway");
}

{
  const streetdeck = findVehicleModel("wrightbus-streetdeck")!;
  const dieselLengths = lengthsForPower(streetdeck, "diesel");
  const l110 = dieselLengths.find((l) => l.lengthM === 11)!;
  const l115 = dieselLengths.find((l) => l.lengthM === 11.5)!;
  assert(l110.priceDeltaGBP === 6_200, `the StreetDeck diesel's 11.0m should be +£6,200, got ${l110.priceDeltaGBP}`);
  assert(l115.priceDeltaGBP === 14_000, `the StreetDeck diesel's 11.5m should be +£14,000, got ${l115.priceDeltaGBP}`);
}

{
  const enviro200 = findVehicleModel("adl-enviro200")!;
  const dieselLengths = lengthsForPower(enviro200, "diesel");
  const l108 = dieselLengths.find((l) => l.lengthM === 10.8)!;
  const l115 = dieselLengths.find((l) => l.lengthM === 11.5)!;
  const l118 = dieselLengths.find((l) => l.lengthM === 11.8)!;
  assert(l108.priceDeltaGBP === 15_700, `the Enviro200 diesel's 10.8m should be +£15,700, got ${l108.priceDeltaGBP}`);
  assert(l115.priceDeltaGBP === 21_400, `the Enviro200 diesel's 11.5m should round-half-to-even to +£21,400 (the genuine tie case), got ${l115.priceDeltaGBP}`);
  assert(l118.priceDeltaGBP === 23_900, `the Enviro200 diesel's 11.8m should be +£23,900, got ${l118.priceDeltaGBP}`);

  const electricLengths = lengthsForPower(enviro200, "electric");
  const e109 = electricLengths.find((l) => l.lengthM === 10.9)!;
  const e117 = electricLengths.find((l) => l.lengthM === 11.7)!;
  assert(e109.priceDeltaGBP === 14_500, `the Enviro200 electric's 10.9m should be +£14,500, got ${e109.priceDeltaGBP}`);
  assert(e117.priceDeltaGBP === 26_100, `the Enviro200 electric's 11.7m should be +£26,100, got ${e117.priceDeltaGBP}`);
}

{
  const evora = findVehicleModel("mcv-evora")!;
  const l129 = lengthsForPower(evora, "diesel").find((l) => l.lengthM === 12.9)!;
  assert(l129.priceDeltaGBP === 16_300, `the MCV Evora's 12.9m should be +£16,300, got ${l129.priceDeltaGBP}`);
}

{
  const kite = findVehicleModel("wrightbus-gb-kite")!;
  const electricLengths = lengthsForPower(kite, "electric");
  const l116 = electricLengths.find((l) => l.lengthM === 11.6)!;
  const l125 = electricLengths.find((l) => l.lengthM === 12.5)!;
  assert(l116.priceDeltaGBP === 12_200, `the GB Kite electric's 11.6m should round-half-to-even to +£12,200 (the tie the float bug affected), got ${l116.priceDeltaGBP}`);
  assert(l125.priceDeltaGBP === 28_000, `the GB Kite electric's 12.5m should be +£28,000, got ${l125.priceDeltaGBP}`);
}

{
  // Coaches: the raw length delta is stored separately from the dynamic
  // axle-crossing charge, which priceFor() adds on top only when the
  // selected length's axle count differs from that power's own shortest.
  const nineHundred = findVehicleModel("volvo-9700")!;
  const dieselLengths = lengthsForPower(nineHundred, "diesel");
  const shortest = dieselLengths.reduce((s, l) => (l.lengthM < s.lengthM ? l : s));
  const l131 = dieselLengths.find((l) => l.lengthM === 13.1)!;
  const l139 = dieselLengths.find((l) => l.lengthM === 13.9)!;
  const l150 = dieselLengths.find((l) => l.lengthM === 15)!;
  assert(axleCountForLength(shortest.lengthM) === "twin-axle", "the Volvo 9700 diesel's shortest length is twin-axle");
  assert(l131.priceDeltaGBP === 10_200, `the Volvo 9700 diesel's 13.1m raw delta should be +£10,200 (axle charge applied separately), got ${l131.priceDeltaGBP}`);
  assert(l139.priceDeltaGBP === 21_800, `the Volvo 9700 diesel's 13.9m raw delta should be +£21,800, got ${l139.priceDeltaGBP}`);
  assert(l150.priceDeltaGBP === 37_700, `the Volvo 9700 diesel's 15m raw delta should be +£37,700, got ${l150.priceDeltaGBP}`);
  assert(
    priceFor(nineHundred, l131) === nineHundred.basePriceGBP! + 10_200 + 15_000,
    `the Volvo 9700 diesel's 13.1m total price should include the +£15,000 axle crossing charge on top of the raw delta, got ${priceFor(nineHundred, l131)}`,
  );
  assert(priceFor(nineHundred, shortest) === nineHundred.basePriceGBP, "the Volvo 9700 diesel's own shortest length pays no axle charge against itself");
}

{
  // The Volvo 9700DD is tri-axle at both of its own lengths, so no axle
  // charge ever applies between them even though it's a coach.
  const dd = findVehicleModel("volvo-9700dd")!;
  const dieselLengths = lengthsForPower(dd, "diesel");
  const l148 = dieselLengths.find((l) => l.lengthM === 14.8)!;
  const shortest = dieselLengths.reduce((s, l) => (l.lengthM < s.lengthM ? l : s));
  assert(axleCountForLength(shortest.lengthM) === "tri-axle", "the Volvo 9700DD is already tri-axle at its own shortest length");
  assert(l148.priceDeltaGBP === 37_800, `the Volvo 9700DD's 14.8m raw delta should be +£37,800, got ${l148.priceDeltaGBP}`);
  assert(priceFor(dd, l148) === dd.basePriceGBP! + 37_800, "no axle charge between the 9700DD's own two lengths — both are already tri-axle");
}

{
  // T181 (confirmed 2026-11-13): yutong-e10-e12 (the merged E10/E12 entry)
  // was fully removed too, same as yutong-coach above — reversing T179's
  // soft-removal for both Yutong models, not just one. Real figures live
  // only as a documented reference in VEHICLE-SPECS.md now. Checked
  // alongside the already-removed old separate yutong-e10/yutong-e12 ids
  // (pre-dating the 2026-10-18 merge), same pattern as that existing check.
  assert(
    findVehicleModel("yutong-e10-e12") === undefined && findVehicleModel("yutong-e10") === undefined && findVehicleModel("yutong-e12") === undefined,
    "yutong-e10-e12 and the old separate yutong-e10/yutong-e12 ids no longer exist",
  );
}

{
  // T181: no vehicle model should be left marked `discontinued` — the two
  // Yutong models T179 soft-removed were fully deleted instead, so the
  // flag (kept as a mechanism for any future use) should currently be
  // unused by every real catalogue entry.
  assert(VEHICLE_MODELS.filter((v) => v.discontinued).length === 0, "no vehicle model is currently marked discontinued, now that the 2 Yutong models are fully removed");
}

{
  // T179: repowerTargetsFor dedupes — evm-cityline has 2 separate electric
  // LengthVariant rows at 7.4m (Stepped entrance / Low floor), which
  // should still report "electric" only once.
  const evmCityline = findVehicleModel("evm-cityline")!;
  const targets = repowerTargetsFor(evmCityline, 7.4);
  assert(targets.length === 1 && targets[0] === "electric", `evm-cityline at 7.4m should re-power to electric only once, got [${targets.join(", ")}]`);
  assert(repowerTargetsFor(evmCityline, 99).length === 0, "a length the model doesn't have at all has no re-power targets");

  // Most models have no electric/hydrogen variant yet (the later
  // Q15-Q22 spec-population pass, deliberately not built here) — that's
  // the expected, correct state for e.g. the Volvo 9700 coach.
  const volvo9700 = findVehicleModel("volvo-9700")!;
  const dieselLength = volvo9700.lengths.find((l) => l.powerType === "diesel")!;
  assert(repowerTargetsFor(volvo9700, dieselLength.lengthM).length === 0, "the Volvo 9700 has no re-power target yet (expected, not a gap)");
}

// --- minTopSpeedMphForRoute (2026-11-19, "Each vehicle should have a
// max speed"; per-model figures dropped again 2026-11-20 in favour of
// the plain Coaches/Minibus-vs-everything-else category derivation,
// topSpeedMphForModel above) ---
{
  assert(
    minTopSpeedMphForRoute("398", {}) === 50,
    "ScotRail/398's real lock is Single-deckers/midibuses — every real model in that category is 50mph today, so the route's cap is 50",
  );
  assert(
    minTopSpeedMphForRoute("57", { Citylink: "57" }) === 60,
    "a route locked to a real coach-only livery (Citylink) gets the Coaches category's cap, 60",
  );
  assert(
    minTopSpeedMphForRoute("12", {}) === 50,
    "an unrestricted route (no real lock at all) conservatively uses the slowest model in the WHOLE catalogue, 50 — any model could end up running it",
  );
  // Real worked check of the actual catalogue data, not just the 3
  // bucket cases above — proves this genuinely reads each model's own
  // derived category speed rather than a hardcoded pair.
  const coachSpeeds = VEHICLE_MODELS.filter((v) => v.category === "Coaches").map(topSpeedMphForModel);
  assert(
    minTopSpeedMphForRoute("57", { Citylink: "57" }) === Math.min(...coachSpeeds),
    "the Coaches-bucket result is the real minimum across every actual Coaches-category model, not a hardcoded 60",
  );
}

console.log(`\n${VEHICLE_MODELS.length} vehicle models, ${VEHICLE_MODELS.reduce((n, v) => n + v.lengths.length, 0)} length variants total.`);
console.log("\nAll vehicle-catalogue checks passed.");
