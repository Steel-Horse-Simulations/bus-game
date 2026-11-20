// The full vehicle catalogue (VEHICLE-SPECS.md), transcribed faithfully as
// static game data — not derived from OSM/pipeline data like everything
// else in this project, so it lives as a plain typed module rather than a
// Rust/wasm artefact. Pure data plus a couple of small pure helpers; no
// DOM/maplibre-gl dependency, so this is safely importable from a verify
// script or the purchase/configurator UI alike.
//
// Delta pricing (2026-10-18, live user decision): rather than every power
// variant of the same real vehicle being its own fully separate catalogue
// entry with its own flat price, a vehicle that comes in more than one
// power type is ONE entry with several power options, each a price delta
// off the model's own basePriceGBP — using the real figures each variant
// already had before merging (the difference between their own two old
// basePriceGBP values), never invented. The merge list itself was decided
// live with the user: Volvo 7900 (hybrid/electric), EVM Cityline
// (diesel/electric), Wrightbus GB Kite (electric/hydrogen — already noted
// as "one buying entry" before this pass), ADL Enviro400 (diesel/electric,
// merged "even though different lengths" — the user's own words, which is
// why the mechanism below has to support a shared model with length
// options that simply don't exist under every power), ADL Enviro200 (same
// reasoning), and Wrightbus StreetDeck (all three of diesel/electric/
// hydrogen, confirmed explicitly after asking — a deliberate reversal of
// an earlier in-file note arguing the three StreetDeck variants were too
// different to merge; that note is gone, not left stale).
//
// Mechanically: `powerType` moved from the model down onto each
// LengthVariant, instead of a single field on VehicleModel — because two
// variants merged onto the same model can share an identical lengthM
// (Volvo 7900's hybrid and electric both come at 12m) while still needing
// completely different capacity and energy figures, so "one spec per
// length" doesn't hold once a model can genuinely multi-power the same
// physical length. VehicleModel.powerOptions lists the price delta for
// each power the model offers at all (first entry's delta is always 0,
// the "base" power its basePriceGBP already prices); LengthVariant gets
// its own optional priceDeltaGBP too, for whenever a length genuinely
// costs more/less than the model's base, currently 0 everywhere since
// nothing in VEHICLE-SPECS.md ever varied price by length within one
// model.
//
// Where VEHICLE-SPECS.md itself doesn't state a figure, this file says so
// explicitly (`{ kind: "unspecified" }` or a `notes` entry) rather than
// inventing one — CLAUDE.md's "ask rather than guess."
//
// One real import, added 2026-11-19 for `minTopSpeedMphForRoute` below —
// reuses route-statistics.mts's own real route-vehicle-lock resolution
// rather than re-deriving it; confirmed no circular import (that file
// doesn't import from here).
import { vehicleRequirementBucketForRoute } from "./route-statistics.mts";

export type PowerType = "diesel" | "electric" | "hybrid" | "hydrogen";

// The 5 real broad vehicle classes (VehicleModel.category's own doc comment)
// as a closed literal union — added 2026-11-13 for the route-level manual
// vehicle restriction (Q19, OPEN-ITEMS.md): `VehicleModel.category` itself
// stays a plain `string` (unchanged, to avoid touching every category
// literal already written across the catalogue below), but a restriction
// needs a real closed set to validate/compare against rather than "any
// string the player typed." No 3-value simplification — these are the
// exact 5 strings already used verbatim throughout this file.
export type VehicleCategory =
  | "Double-deckers"
  | "Specialised (sightseeing, open-top only)"
  | "Single-deckers / midibuses"
  | "Minibus"
  | "Coaches";

export interface EnergyOption {
  label: string;
  // null where VEHICLE-SPECS.md states a range but not the tank/battery
  // capacity itself (the Volvo 7900 Hybrid) — flagged, not guessed.
  capacity: number | null;
  unit: "L" | "kWh" | "kg";
  rangeMiles: number;
  // Price relative to the length's own base energy option (the one with
  // no priceDeltaGBP of its own, or 0) — confirmed 2026-10-18: diesel
  // tanks are £15/extra litre, electric batteries £300/extra kWh (except
  // the Volvo 7900 Electric's own named tiers, priced directly rather
  // than computed — see that vehicle's own notes), hydrogen tanks
  // £1,000/extra kg. Where the catalogue's own pair is named "Standard
  // tank"/"Smaller tank", the *bigger* (Standard) one is the £0 base and
  // Smaller is a real negative delta — confirmed with two worked
  // examples (the Enviro400 and StreetDeck Ultroliner). Undefined (not
  // 0) wherever a length has only one real energy option, since there's
  // nothing to price a difference against.
  priceDeltaGBP?: number;
}

// §1 "Max-seating / max-standing configurator mode": some vehicles publish
// a max capacity that isn't max seated + max standing, because those are
// two different configuration modes, not simultaneous maximums.
export type Capacity =
  | { kind: "seatedStanding"; seated: number; standing: number; tipUps?: number }
  | { kind: "seatedOnly"; seated: number } // coaches — no standing at all
  | { kind: "maxCapacity"; maxCapacity: number; maxSeated: number; maxStanding: number }
  | {
      // Every vehicle in the catalogue has a wheelchair bay (confirmed by
      // the user, correcting an earlier wrong assumption that some Cityline
      // builds had none) — its standing capacity flexes live at runtime
      // depending on whether that bay is currently occupied, not a
      // purchase-time configurator choice. Seated capacity can *also* vary
      // between the two states on some vehicles (the Cityline's stepped
      // entrance: a fixed seat folds away to make room for the wheelchair,
      // since it has no standing capacity to trade against at all), so
      // both figures are captured per state rather than assuming seated is
      // always fixed.
      kind: "wheelchairBayDependent";
      bayConverted: { seated: number; standing: number }; // no wheelchair user aboard
      bayInUse: { seated: number; standing: number }; // a wheelchair user occupies the bay
    }
  | { kind: "unspecified" }; // a real gap in VEHICLE-SPECS.md — flagged, not guessed

export interface LengthVariant {
  lengthM: number;
  // Which of the model's own powerOptions this exact length/spec row is
  // for — a merged multi-power model can have several LengthVariant rows
  // at the very same lengthM (one per power), or a length that only
  // exists under one of its powers at all (the ADL Enviro400's own
  // 11.1m electric length has no diesel equivalent, and none of its
  // diesel lengths exist electric).
  powerType: PowerType;
  // Distinguishes two real builds that share the same length and power
  // (the Cityline's low-floor vs stepped-entrance conversion, DESIGN.md's
  // own "Low floor is a retrofittable option; defaults to steps") —
  // undefined everywhere else, where length+power uniquely identifies one
  // real build.
  variantLabel?: string;
  capacity: Capacity;
  energyOptions: EnergyOption[];
  // A hydrogen vehicle's fixed buffer battery, alongside its tank options
  // (Kite Hydroliner, StreetDeck Hydroliner) — doesn't vary with tank size.
  bufferBatteryKWh?: number;
  // Real-world dimensions/weight, in the same units OSM's own maxheight/
  // maxweight/maxwidth road tags use (metres/tonnes) — added 2026-11-13
  // for route-vehicle eligibility against real road restrictions
  // (OPEN-ITEMS.md Q18/Q19). Supplied directly by the user model by
  // model, a deliberate exception to "vehicle specs last" (CLAUDE.md).
  // All optional: undefined means no real figure is on record yet for
  // that axis, not "no restriction" — a vehicle with no figure set never
  // fails an OSM-limit check on that axis until a real one is supplied.
  heightM?: number;
  widthM?: number;
  weightTonnes?: number;
  // Price relative to the model's own basePriceGBP, on top of whichever
  // power delta already applies — 0 (the default when omitted) everywhere
  // VEHICLE-SPECS.md never varied price by length within one model, a
  // real figure only where it's actually documented.
  priceDeltaGBP?: number;
  notes?: string[];
}

// One power type a model can be bought in, and its price relative to the
// model's own basePriceGBP. The first entry in a model's own powerOptions
// is always the "base" power that basePriceGBP itself prices (delta 0);
// every other entry's delta is the real, previously-separate basePriceGBP
// difference between that variant and the base, from before they were
// merged into one buying entry — never invented.
export interface PowerOption {
  powerType: PowerType;
  priceDeltaGBP: number;
}

export interface VehicleModel {
  id: string;
  name: string;
  chassis?: string;
  category: string; // a broad vehicle class now (Double-deckers, Single-deckers/midibuses, Minibus, Coaches, Specialised) — the old fleet-number-range categories are superseded (UK-EXPANSION.md §14) and no longer make sense once a model can span what used to be several different ranges by power alone
  powerOptions: PowerOption[];
  basePriceGBP: number | null; // null when priced as a donor vehicle (open-top) — prices the model's own base power type
  priceNote?: string;
  lengths: LengthVariant[];
  notes?: string[];
  // Hidden from new purchase (OPEN-ITEMS.md T179, confirmed 2026-11-13) —
  // "keep the data in case it's needed later, only remove it from the
  // game." Every field stays exactly as real/confirmed as before; this
  // is the ONLY thing that changes — `findVehicleModel` still resolves
  // it normally, so an already-owned vehicle of a discontinued model is
  // completely unaffected. Only the buy-catalogue screen's own listing
  // filters on this.
  discontinued?: boolean;
}

export interface DroppedVehicle {
  name: string;
  reason: string;
}

// Prices confirmed 2026-10-18 (VEHICLE-SPECS.md §2). "flat" is one price
// regardless of vehicle; "perSeat" multiplies by the vehicle's own seated
// capacity (never standing — §2's own rule); "standard" is always
// included, never priced (CCTV cameras); "perEnergyOption" has no price
// of its own here at all — the real figure lives on each EnergyOption's
// own priceDeltaGBP instead, since it's a per-length, per-vehicle
// difference, not one flat catalogue-wide number. `priceOverridesByModelId`
// replaces the default figure for specific vehicles only (air conditioning
// is £3,000, not £8,000, on the EVM Cityline; seatbelts are £0/standard on
// every coach, not £90/seat) — explicit by id rather than inferred from
// category, the same anti-drift reasoning fleet-numbering.mts's own model
// map already uses.
export type OptionPriceKind = "flat" | "perSeat" | "standard" | "perEnergyOption";

export interface DropdownChoice {
  label: string;
  amountGBP: number;
}

export interface GeneralOption {
  id: string;
  label: string;
  selectionType: "checkbox" | "dropdown" | "standard";
  appliesTo: "all" | PowerType | "training-only" | "evm-cityline-only";
  effect: string;
  priceKind: OptionPriceKind;
  priceGBP?: number; // the default figure for "flat"/"perSeat" — ignored for "standard"/"perEnergyOption"
  priceOverridesByModelId?: Record<string, number>;
  dropdownChoices?: DropdownChoice[]; // for a priced dropdown (CCTV audio) — priceGBP is unused when this is set
}

// §1 general rules worth surfacing directly in a browsable catalogue view
// (the deeper economic rules — seats as shippable inventory, the
// toilet/4-hour rule — are vehicle-level notes instead, since they're
// facts about specific vehicles rather than catalogue-wide reading aids).
export const GENERAL_RULES = {
  wheelchairSpace:
    "Every vehicle has exactly 1 wheelchair space, always additional to the seated/standing figures below — never included within them.",
  axleRule:
    "Twin-axle up to and including 12.9m; tri-axle is required by law over 12.9m. Not a selectable option — derived from the coach's length.",
  topSpeed: "50mph for buses (single-deck, double-deck, open-top); 60mph for coaches and the EVM Cityline/Sprinter minibus.",
  maxSeatingMaxStanding:
    "Where a vehicle publishes a max capacity that isn't max seated + max standing, those are two different configuration modes: max-seating mode fills the remainder with standing to reach max capacity, max-standing mode fills the remainder with seats.",
  batteryUnits: "Battery figures are always kWh (energy capacity), never kW (power).",
} as const;

// The 3 coach ids — used below for seatbelts' own "free and standard on
// coaches" rule. Listed explicitly rather than checked against
// `category === "Coaches"` at price-lookup time, so the override table
// itself stays a plain data lookup with no vehicle-shape logic inside it.
const COACH_MODEL_IDS = ["volvo-9700", "volvo-9700dd"];

export const GENERAL_OPTIONS: GeneralOption[] = [
  { id: "cctv-cameras", label: "CCTV cameras", selectionType: "standard", appliesTo: "all", effect: "Standard on every vehicle, not optional.", priceKind: "standard" },
  {
    id: "cctv-audio",
    label: "CCTV audio",
    selectionType: "dropdown",
    appliesTo: "all",
    effect:
      "None / cab-only / full. Cab-only protects the driver in a complaint and slightly deters abuse. Full audio is disliked on ordinary routes (feels intrusive) but liked on routes flagged for a known abuse/bad-behaviour problem, where full-audio vehicles are preferentially assigned once the route carries that flag.",
    priceKind: "flat",
    dropdownChoices: [
      { label: "None", amountGBP: 0 },
      { label: "Cab-only", amountGBP: 150 },
      { label: "Full", amountGBP: 450 },
    ],
  },
  { id: "usb-power", label: "USB and power sockets", selectionType: "checkbox", appliesTo: "all", effect: "Small satisfaction boost plus a slight marketing/awareness boost.", priceKind: "perSeat", priceGBP: 30 },
  { id: "wifi", label: "Wi-Fi", selectionType: "checkbox", appliesTo: "all", effect: "Same shape as USB sockets, bigger effect — matters more to passengers.", priceKind: "flat", priceGBP: 2_200 },
  {
    id: "comfier-seats",
    label: "Comfier seats",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Bigger effect than Wi-Fi, no marketing boost. Scales on a binary long-distance/short-journey split, not continuously.",
    priceKind: "perSeat",
    priceGBP: 120,
  },
  {
    id: "air-conditioning",
    label: "Air conditioning",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Bigger effect than Wi-Fi, no marketing boost. Seasonal — a bigger boost in summer months.",
    priceKind: "flat",
    priceGBP: 8_000,
    priceOverridesByModelId: { "evm-cityline": 3_000 },
  },
  {
    id: "next-stop-audio",
    label: "Next-stop audio",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Satisfaction plus marketing boost. Matters more than screens — essential accessibility for visually impaired passengers.",
    priceKind: "flat",
    priceGBP: 2_500,
  },
  { id: "info-screens", label: "Passenger info screens", selectionType: "checkbox", appliesTo: "all", effect: "Satisfaction plus marketing boost, smaller than next-stop audio.", priceKind: "flat", priceGBP: 3_500 },
  {
    id: "premium-driver-seat",
    label: "Premium driver seat",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Driver happiness boost and reduces sickness/turnover, feeding into the existing warning/dismissal system.",
    priceKind: "flat",
    priceGBP: 1_800,
  },
  {
    // GreenRoad (real UK bus-fleet driver-behaviour telematics: an
    // in-cab traffic-light-style indicator plus accelerometer/GPS
    // hardware, giving real-time feedback on harsh braking/acceleration/
    // cornering, backed by a fleet-manager scoring dashboard) — added
    // 2026-11-20 at the user's own request, by name. No official
    // per-vehicle fitting price is published anywhere (checked directly
    // — GreenRoad doesn't disclose pricing, and the only figure in
    // circulation is an unverified, undated "~80p/day" ROI claim that
    // doesn't say what it covers). £350 one-off install is the user's
    // own figure ("I think £350 install + your 10p per day"), replacing
    // this entry's original £600 placeholder. The recurring 10p/day
    // (greenroad-billing.mts, billed via the real monthly calendar-month
    // mechanism this game already uses for every other recurring charge,
    // since there is no daily tick) is NOT part of this catalogue price
    // — it only starts once the vehicle is actually bought/collected
    // with this option selected (greenroadFitted, db.mts), same as the
    // lease/buy-outright split already works. The effect figures ARE
    // real and sourced: East Yorkshire Motor Services' own GreenRoad
    // case study reports a 5% fuel saving and 40% fewer driver-fault
    // accidents — the cleanest single-source numbers among several
    // vendor case studies (Yellow Buses 27% accidents/5% fuel, Compass
    // Travel ~50% accidents, First Bus 20% injuries/8% fuel — picked
    // EYMS rather than averaging across inconsistent baselines). Same as
    // every other option's "effect" field in this table: descriptive
    // only, not live-wired into the simulation yet — the systems it
    // would actually feed (accidents, driver score/coaching) are Phase 8
    // and Phase 6 respectively, neither built.
    id: "greenroad",
    label: "GreenRoad driver-behaviour system",
    selectionType: "checkbox",
    appliesTo: "all",
    effect:
      "Driver-behaviour telematics with real-time in-cab feedback, plus a 10p/day recurring charge once fitted. Real sourced effect (East Yorkshire Motor Services' own GreenRoad case study): around 5% lower fuel/energy consumption and 40% fewer driver-fault accidents. Not yet live in the simulation — accidents (Phase 8) and driver score (Phase 6) don't exist yet to feed.",
    priceKind: "flat",
    priceGBP: 350,
  },
  {
    id: "larger-fuel-tank",
    label: "Larger fuel tank",
    selectionType: "checkbox",
    appliesTo: "diesel",
    effect: "Per-vehicle range boost — £15 per extra litre above the vehicle's own base tank (see the vehicle's own energy options for the real figure).",
    priceKind: "perEnergyOption",
  },
  {
    id: "larger-battery",
    label: "Larger battery pack",
    selectionType: "dropdown",
    appliesTo: "electric",
    effect: "Per-vehicle range boost — £300 per extra kWh above the base pack, except the Volvo 7900 Electric's own named tiers (see the vehicle's own energy options for the real figure).",
    priceKind: "perEnergyOption",
  },
  {
    id: "larger-hydrogen-tank",
    label: "Larger hydrogen tank",
    selectionType: "dropdown",
    appliesTo: "hydrogen",
    effect: "Per-vehicle range boost — £1,000 per extra kg above the base tank (see the vehicle's own energy options for the real figure).",
    priceKind: "perEnergyOption",
  },
  {
    id: "pantograph-charging",
    label: "Pantograph charging",
    selectionType: "checkbox",
    appliesTo: "electric",
    effect: "Enables opportunity charging during layovers, reducing overnight depot charging need. Needs infrastructure, separate from this vehicle-side cost: £3,500 per stop; one per stance at a bus station/interchange.",
    priceKind: "flat",
    priceGBP: 20_000,
  },
  {
    id: "low-floor",
    label: "Low floor conversion",
    selectionType: "checkbox",
    appliesTo: "evm-cityline-only",
    effect: "Purely functional — satisfies accessibility requirements, avoids the stepped-vehicle accessibility penalty.",
    priceKind: "flat",
    priceGBP: 18_000,
  },
  {
    id: "seatbelts",
    label: "Seatbelts",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Standard on coaches. On other vehicle types, a purely cosmetic option with no in-game effect.",
    priceKind: "perSeat",
    priceGBP: 90,
    priceOverridesByModelId: Object.fromEntries(COACH_MODEL_IDS.map((id) => [id, 0])),
  },
  {
    id: "instructor-mirrors",
    label: "Instructor mirrors",
    selectionType: "checkbox",
    appliesTo: "training-only",
    effect: "Training vehicles only. Purely functional — lets the instructor see properly.",
    priceKind: "flat",
    priceGBP: 400,
  },
  {
    id: "luggage-racks",
    label: "New luggage racks",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "For vehicles that don't already have them.",
    priceKind: "flat",
    priceGBP: 1_500,
  },
];

export const DROPPED_VEHICLES: DroppedVehicle[] = [
  { name: "Volvo B8L (tri-axle)", reason: "Was a chassis, not a complete vehicle — replaced by the ADL Enviro500, itself later replaced by the ADL Enviro400 XLB." },
  { name: "Volvo BZL DD", reason: "No real data available; the StreetDeck Electroliner already covers this space." },
  { name: 'Yutong U11DD ("E12DD" was the wrong name for it)', reason: "Considered, then dropped by choice." },
  { name: "Plain diesel Volvo 7900, and the 7900 at 10.6m or articulated", reason: "Don't exist in the Scottish fleet." },
];

export const VEHICLE_MODELS: VehicleModel[] = [
  // --- Double-deckers ---
  {
    // Merges the old separate "ADL Enviro400 MMC" (diesel) and "ADL
    // Enviro400EV" (electric) entries into one buying entry with a power
    // delta — the user's own explicit instruction (2026-10-18), "even
    // though they are different lengths": the diesel and electric builds
    // share no common length at all (diesel: 10.5/10.9/11.5m, electric:
    // 11.1m only), so the length list itself is implicitly filtered by
    // whichever power is currently selected.
    id: "adl-enviro400",
    name: "ADL Enviro400",
    chassis: "Volvo B5TL",
    category: "Double-deckers",
    powerOptions: [
      { powerType: "diesel", priceDeltaGBP: 0 },
      { powerType: "electric", priceDeltaGBP: 145_000 }, // 380,000 (old ADL Enviro400EV base) - 235,000 (old MMC base)
    ],
    basePriceGBP: 235_000,
    lengths: [
      {
        lengthM: 10.5,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 74, standing: 16 },
        energyOptions: [
          { label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 200, unit: "L", rangeMiles: 350, priceDeltaGBP: -1_125 }, // confirmed worked example, VEHICLE-SPECS.md §2: 75L less x £15/L
        ],
        heightM: 4.2,
        widthM: 2.55,
        weightTonnes: 18,
      },
      {
        lengthM: 10.9,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 82, standing: 18 },
        energyOptions: [
          { label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 200, unit: "L", rangeMiles: 350, priceDeltaGBP: -1_125 },
        ],
        priceDeltaGBP: 4_700, // length pricing confirmed 2026-10-18: 0.4m over the 10.5m base, £235,000 x 0.5%/10cm
        heightM: 4.2,
        widthM: 2.55,
        weightTonnes: 18,
      },
      {
        lengthM: 11.5,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 85, standing: 20 },
        energyOptions: [
          { label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 200, unit: "L", rangeMiles: 350, priceDeltaGBP: -1_125 },
        ],
        priceDeltaGBP: 11_800, // length pricing confirmed 2026-10-18: 1.0m over the 10.5m base
        heightM: 4.2,
        widthM: 2.55,
        weightTonnes: 18,
      },
      {
        lengthM: 11.1,
        powerType: "electric",
        capacity: { kind: "seatedStanding", seated: 80, standing: 18 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 354, unit: "kWh", rangeMiles: 215, priceDeltaGBP: 0 },
          { label: "Battery (larger)", capacity: 472, unit: "kWh", rangeMiles: 285, priceDeltaGBP: 35_400 }, // 118kWh extra x £300/kWh
        ],
        notes: ["80 seated: 51 upper deck, 29 lower deck.", "Standing figure (18) is estimated/interpolated from the diesel build, not a real confirmed figure."],
        heightM: 4.2,
        widthM: 2.55,
        weightTonnes: 19.5,
      },
    ],
  },
  {
    // Replaces the ADL Enviro500 (UK-EXPANSION.md §14a, "Vehicle catalogue
    // change — Enviro500 replaced by Enviro400 XLB", confirmed final spec)
    // — the Enviro500 entry this used to be is gone from the catalogue
    // entirely, not kept alongside it. Not merged into the main ADL
    // Enviro400 entry above — the XLB is a genuinely different real body
    // (tri-axle, its own fleet-numbering category digit, UK-EXPANSION.md
    // §14's digit 5 vs the twin-axle Enviro400's digit 4), diesel only.
    id: "adl-enviro400-xlb",
    name: "ADL Enviro400 XLB",
    category: "Double-deckers",
    powerOptions: [{ powerType: "diesel", priceDeltaGBP: 0 }],
    basePriceGBP: 270_000,
    notes: ["Airlink 100's own vehicle requirement (13m Volvo 9700DD previously) now points at this XLB instead."],
    lengths: [
      {
        lengthM: 13.4,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 100, standing: 25, tipUps: 3 },
        energyOptions: [{ label: "Standard tank", capacity: 250, unit: "L", rangeMiles: 380 }],
        notes: [
          "100 fixed seats: 61 upper deck, 36 lower deck.",
          "The 3 tip-ups trade off against standing space, not adding to the 125-passenger total capacity ceiling.",
          "Tri-axle (>12.9m).",
        ],
        heightM: 4.2,
        widthM: 2.55,
        weightTonnes: 23.2,
      },
    ],
  },
  {
    // Merges the old separate "StreetDeck Ultroliner" (diesel),
    // "StreetDeck Electroliner" (electric) and "StreetDeck Hydroliner"
    // (hydrogen) entries into one 3-way power choice — confirmed live
    // with the user (2026-10-18) after asking directly, reversing an
    // earlier in-file note that had argued the three were too different
    // to share one buying entry; that note is gone, not left stale
    // alongside a decision that now contradicts it.
    id: "wrightbus-streetdeck",
    name: "Wrightbus StreetDeck",
    category: "Double-deckers",
    powerOptions: [
      { powerType: "diesel", priceDeltaGBP: 0 },
      { powerType: "electric", priceDeltaGBP: 250_000 }, // 560,000 (old Electroliner base) - 310,000 (old Ultroliner base)
      { powerType: "hydrogen", priceDeltaGBP: 240_000 }, // 550,000 (old Hydroliner base) - 310,000 (old Ultroliner base)
    ],
    basePriceGBP: 310_000,
    lengths: [
      {
        lengthM: 10.6,
        powerType: "diesel",
        capacity: { kind: "maxCapacity", maxCapacity: 96, maxSeated: 74, maxStanding: 26 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330, priceDeltaGBP: -825 }, // confirmed worked example, VEHICLE-SPECS.md §2: 55L less x £15/L
        ],
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 18.6,
      },
      {
        lengthM: 11,
        powerType: "diesel",
        capacity: { kind: "maxCapacity", maxCapacity: 98, maxSeated: 83, maxStanding: 18 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330, priceDeltaGBP: -825 },
        ],
        priceDeltaGBP: 6_200, // length pricing confirmed 2026-10-18: 0.4m over the 10.6m base, £310,000 x 0.5%/10cm
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 18.6,
      },
      {
        lengthM: 11.5,
        powerType: "diesel",
        capacity: { kind: "maxCapacity", maxCapacity: 100, maxSeated: 75, maxStanding: 28 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330, priceDeltaGBP: -825 },
        ],
        priceDeltaGBP: 14_000, // length pricing confirmed 2026-10-18: 0.9m over the 10.6m base
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 18.6,
      },
      {
        lengthM: 10.7,
        powerType: "electric",
        capacity: { kind: "maxCapacity", maxCapacity: 84, maxSeated: 73, maxStanding: 14 },
        energyOptions: [{ label: "Battery", capacity: 442, unit: "kWh", rangeMiles: 275 }],
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
      {
        lengthM: 10.9,
        powerType: "hydrogen",
        capacity: { kind: "maxCapacity", maxCapacity: 90, maxSeated: 69, maxStanding: 24 },
        energyOptions: [{ label: "Hydrogen tank (one size only)", capacity: 27, unit: "kg", rangeMiles: 295 }],
        bufferBatteryKWh: 111,
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
    ],
  },
  {
    // Replaces the ADL Enviro400 open-top (diesel/electric) entries —
    // dropped 2026-11-13 at the user's own request ("can we drop the ADL
    // ones please as they were only because I didn't have any others").
    // Wrightbus's own real open-top StreetDeck is "the exact same specs
    // and price just without any standing capacity" as the regular
    // Ultroliner/Electroliner/Hydroliner, so each power reuses its
    // donor's own length/capacity/energy stats entirely, with standing
    // dropped to 0 (max capacity becomes max seated). The diesel side
    // picks the donor length whose seated count sits closest to the
    // electric/hydrogen seated counts (73/69) rather than its own
    // shortest length, per the user's own instruction ("as close to the
    // Electroliner and Hydroliner in capacity as possible even if it
    // needs a different length picking") — 10.6m (74 seated) beats 11m
    // (83) and 11.5m (75).
    id: "wrightbus-streetdeck-opentop",
    name: "Wrightbus StreetDeck open-top",
    category: "Specialised (sightseeing, open-top only)",
    powerOptions: [
      { powerType: "diesel", priceDeltaGBP: 0 },
      { powerType: "electric", priceDeltaGBP: 0 },
      { powerType: "hydrogen", priceDeltaGBP: 0 },
    ],
    basePriceGBP: null,
    priceNote: "Priced as its donor vehicle (Wrightbus StreetDeck Ultroliner/Electroliner/Hydroliner, by power type).",
    notes: [
      "Reuses its donor StreetDeck's own stats entirely at the length below (fuel/battery/hydrogen tank, chassis), except for tour-specific options (tour audio + PA, languages) and standing capacity, which open-top removes.",
      "An open-top conversion costs £10,000 and cannot be undone; only available on vehicles with a defined open-top variant in the catalogue.",
    ],
    lengths: [
      {
        lengthM: 10.6,
        powerType: "diesel",
        capacity: { kind: "maxCapacity", maxCapacity: 74, maxSeated: 74, maxStanding: 0 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425, priceDeltaGBP: 0 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330, priceDeltaGBP: -825 },
        ],
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 18.6,
      },
      {
        lengthM: 10.7,
        powerType: "electric",
        capacity: { kind: "maxCapacity", maxCapacity: 73, maxSeated: 73, maxStanding: 0 },
        energyOptions: [{ label: "Battery", capacity: 442, unit: "kWh", rangeMiles: 275 }],
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
      {
        lengthM: 10.9,
        powerType: "hydrogen",
        capacity: { kind: "maxCapacity", maxCapacity: 69, maxSeated: 69, maxStanding: 0 },
        energyOptions: [{ label: "Hydrogen tank (one size only)", capacity: 27, unit: "kg", rangeMiles: 295 }],
        bufferBatteryKWh: 111,
        heightM: 4.395,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
    ],
  },

  // --- Single-deckers / midibuses ---
  {
    // Merges the old separate "ADL Enviro200 MMC" (diesel) and "ADL
    // Enviro200EV" (electric) entries — same reasoning and same live
    // user instruction as the Enviro400 above ("things like the Enviro
    // 400s should also combine even though they are different lengths").
    // Diesel and electric share no common length (diesel: 8.9/9.7/10.8/
    // 11.5/11.8m, electric: 9.9/10.9/11.7m).
    id: "adl-enviro200",
    name: "ADL Enviro200 MMC",
    category: "Single-deckers / midibuses",
    powerOptions: [
      { powerType: "diesel", priceDeltaGBP: 0 },
      { powerType: "electric", priceDeltaGBP: 125_000 }, // 290,000 (old ADL Enviro200EV base) - 165,000 (old MMC base)
    ],
    basePriceGBP: 165_000,
    lengths: [
      { lengthM: 8.9, powerType: "diesel", capacity: { kind: "seatedStanding", seated: 30, standing: 14 }, energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 500 }], heightM: 2.86, widthM: 2.47, weightTonnes: 14.44 },
      {
        lengthM: 9.7,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 34, standing: 15 },
        energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 490 }],
        priceDeltaGBP: 6_600, // length pricing confirmed 2026-10-18: 0.8m over the 8.9m diesel base, £165,000 x 0.5%/10cm
        heightM: 2.86,
        widthM: 2.47,
        weightTonnes: 14.44,
      },
      {
        lengthM: 10.8,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 40, standing: 16 },
        energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 475 }],
        priceDeltaGBP: 15_700, // 1.9m over the 8.9m diesel base
        heightM: 2.86,
        widthM: 2.47,
        weightTonnes: 14.44,
      },
      {
        lengthM: 11.5,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 43, standing: 17 },
        energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 460 }],
        priceDeltaGBP: 21_400, // 2.6m over the 8.9m diesel base — a genuine round-half-to-even tie (21,450), not round-half-up
        heightM: 2.86,
        widthM: 2.47,
        weightTonnes: 14.44,
      },
      {
        lengthM: 11.8,
        powerType: "diesel",
        capacity: { kind: "seatedStanding", seated: 43, standing: 17 },
        energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 440 }],
        priceDeltaGBP: 23_900, // 2.9m over the 8.9m diesel base
        heightM: 2.86,
        widthM: 2.47,
        weightTonnes: 14.44,
      },
      { lengthM: 9.9, powerType: "electric", capacity: { kind: "seatedStanding", seated: 33, standing: 40 }, energyOptions: [{ label: "Battery", capacity: 400, unit: "kWh", rangeMiles: 300 }], heightM: 2.86, widthM: 2.47, weightTonnes: 17.2 },
      {
        lengthM: 10.9,
        powerType: "electric",
        capacity: { kind: "seatedStanding", seated: 39, standing: 45 },
        energyOptions: [{ label: "Battery", capacity: 400, unit: "kWh", rangeMiles: 285 }],
        priceDeltaGBP: 14_500, // length pricing confirmed 2026-10-18: 1.0m over the 9.9m electric base, £290,000 (165,000 base + 125,000 electric delta) x 0.5%/10cm
        heightM: 2.86,
        widthM: 2.47,
        weightTonnes: 17.2,
      },
      {
        lengthM: 11.7,
        powerType: "electric",
        capacity: { kind: "seatedStanding", seated: 43, standing: 49 },
        energyOptions: [{ label: "Battery", capacity: 400, unit: "kWh", rangeMiles: 270 }],
        priceDeltaGBP: 26_100, // 1.8m over the 9.9m electric base
        heightM: 2.86,
        widthM: 2.47,
        weightTonnes: 17.2,
      },
    ],
  },
  {
    // Merges the old separate "Volvo 7900 Hybrid" and "Volvo 7900
    // Electric" entries. Unlike the Enviro400/200 above, both powers
    // genuinely share the same single length (12m) — but still need two
    // separate LengthVariant rows at that same 12m, since capacity
    // (38/62 hybrid vs 38/57 electric) and energy options (a fuel tank
    // vs five different battery chemistries/sizes) both differ by power
    // even at the identical length.
    id: "volvo-7900",
    name: "Volvo 7900",
    category: "Single-deckers / midibuses",
    powerOptions: [
      { powerType: "hybrid", priceDeltaGBP: 0 },
      { powerType: "electric", priceDeltaGBP: 80_000 }, // 320,000 (old Electric base) - 240,000 (old Hybrid base)
    ],
    basePriceGBP: 240_000,
    priceNote: "Electric base price is NCA.",
    notes: ["Only Hybrid and Electric variants exist in Scotland. Plain diesel and the 10.6m length don't exist here and are dropped from the catalogue."],
    lengths: [
      {
        lengthM: 12,
        powerType: "hybrid",
        capacity: { kind: "seatedStanding", seated: 38, standing: 62 },
        energyOptions: [{ label: "Standard tank (no options)", capacity: null, unit: "L", rangeMiles: 425 }],
        notes: ["Fuel tank capacity itself not stated in VEHICLE-SPECS.md — only the 425 mile range."],
        heightM: 3.3,
        widthM: 2.5,
        weightTonnes: 19,
      },
      {
        lengthM: 12,
        powerType: "electric",
        capacity: { kind: "seatedStanding", seated: 38, standing: 57 },
        energyOptions: [
          { label: "NCA 280kWh", capacity: 280, unit: "kWh", rangeMiles: 140, priceDeltaGBP: 0 },
          { label: "NCA 375kWh", capacity: 375, unit: "kWh", rangeMiles: 190, priceDeltaGBP: 28_500 },
          { label: "NCA 470kWh", capacity: 470, unit: "kWh", rangeMiles: 235, priceDeltaGBP: 57_000 },
          { label: "LFP 350kWh", capacity: 350, unit: "kWh", rangeMiles: 175, priceDeltaGBP: 3_500 },
          { label: "LFP 500kWh", capacity: 500, unit: "kWh", rangeMiles: 250, priceDeltaGBP: 41_000 },
        ],
        notes: [
          "Genuinely the most complex vehicle in the catalogue — two battery chemistries, each with multiple sizes.",
          "The 4 priced tiers are given directly (confirmed 2026-10-18), not computed from a flat per-kWh rate — NCA is £300/kWh and LFP £250/kWh, both measured against this 280kWh NCA base, but the LFP figures don't reduce to a plain \"extra kWh × £250\" calculation.",
        ],
        heightM: 3.3,
        widthM: 2.5,
        weightTonnes: 19.5,
      },
    ],
  },
  {
    id: "mcv-evora",
    name: "MCV Evora",
    category: "Single-deckers / midibuses",
    powerOptions: [{ powerType: "diesel", priceDeltaGBP: 0 }],
    basePriceGBP: 155_000,
    notes: [
      "The wheelchair bay converts to extra standing space when unoccupied — a live, per-journey state depending on whether a wheelchair passenger is aboard, not a purchase-time configurator choice (confirmed by the user).",
    ],
    lengths: [
      {
        lengthM: 10.8,
        powerType: "diesel",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 35, standing: 43 }, bayInUse: { seated: 35, standing: 34 } },
        energyOptions: [{ label: "Standard tank", capacity: 350, unit: "L", rangeMiles: 990 }],
        notes: ["69 + wheelchair space, or 78 total with the bay converted to standing."],
        heightM: 3,
        widthM: 2.55,
        weightTonnes: 19,
      },
      {
        lengthM: 12.9,
        powerType: "diesel",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 47, standing: 46 }, bayInUse: { seated: 47, standing: 38 } },
        energyOptions: [{ label: "Standard tank", capacity: 350, unit: "L", rangeMiles: 900 }],
        priceDeltaGBP: 16_300, // length pricing confirmed 2026-10-18: 2.1m over the 10.8m base, £155,000 x 0.5%/10cm
        notes: ["86 total with a wheelchair aboard, or 93 total with the bay converted to standing."],
        heightM: 3,
        widthM: 2.55,
        weightTonnes: 19,
      },
    ],
  },
  {
    // Merges the old separate "Wrightbus GB Kite Electroliner" (electric)
    // and "Wrightbus GB Kite Hydroliner" (hydrogen) entries — already
    // noted before this pass as "sharing one buying entry." The
    // Hydroliner only ever existed at one length (12.2m), not the
    // Electroliner's three (10.9/11.6/12.5m), so hydrogen is only
    // selectable at that one length.
    id: "wrightbus-gb-kite",
    name: "Wrightbus GB Kite",
    category: "Single-deckers / midibuses",
    powerOptions: [
      { powerType: "electric", priceDeltaGBP: 0 },
      { powerType: "hydrogen", priceDeltaGBP: 70_000 }, // 420,000 (old Hydroliner base) - 350,000 (old Electroliner base)
    ],
    basePriceGBP: 350_000,
    notes: ["Route 398 can use any length of Electroliner, or the Hydroliner."],
    lengths: [
      {
        lengthM: 10.9,
        powerType: "electric",
        capacity: { kind: "maxCapacity", maxCapacity: 78, maxSeated: 37, maxStanding: 39 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 442, unit: "kWh", rangeMiles: 300, priceDeltaGBP: 0 },
          { label: "Battery (larger)", capacity: 528, unit: "kWh", rangeMiles: 365, priceDeltaGBP: 25_800 }, // 86kWh extra x £300/kWh
        ],
        heightM: 3.38,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
      {
        lengthM: 11.6,
        powerType: "electric",
        capacity: { kind: "maxCapacity", maxCapacity: 79, maxSeated: 41, maxStanding: 44 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 442, unit: "kWh", rangeMiles: 300, priceDeltaGBP: 0 },
          { label: "Battery (larger)", capacity: 528, unit: "kWh", rangeMiles: 365, priceDeltaGBP: 25_800 },
        ],
        priceDeltaGBP: 12_200, // length pricing confirmed 2026-10-18: 0.7m over the 10.9m electric base, £350,000 x 0.5%/10cm — a genuine round-half-to-even tie (12,250)
        heightM: 3.38,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
      {
        lengthM: 12.5,
        powerType: "electric",
        capacity: { kind: "maxCapacity", maxCapacity: 82, maxSeated: 45, maxStanding: 51 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 442, unit: "kWh", rangeMiles: 300, priceDeltaGBP: 0 },
          { label: "Battery (larger)", capacity: 528, unit: "kWh", rangeMiles: 365, priceDeltaGBP: 25_800 },
        ],
        priceDeltaGBP: 28_000, // 1.6m over the 10.9m electric base
        heightM: 3.38,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
      {
        lengthM: 12.2,
        powerType: "hydrogen",
        capacity: { kind: "maxCapacity", maxCapacity: 79, maxSeated: 41, maxStanding: 41 },
        energyOptions: [
          { label: "Hydrogen tank (small)", capacity: 32, unit: "kg", rangeMiles: 340, priceDeltaGBP: 0 },
          { label: "Hydrogen tank (medium)", capacity: 40, unit: "kg", rangeMiles: 425, priceDeltaGBP: 8_000 }, // confirmed worked example, VEHICLE-SPECS.md §2: 8kg extra x £1,000/kg
          { label: "Hydrogen tank (large)", capacity: 50, unit: "kg", rangeMiles: 530, priceDeltaGBP: 18_000 }, // confirmed worked example: 18kg extra x £1,000/kg
        ],
        bufferBatteryKWh: 54,
        notes: ["Fixed length only, unlike the Electroliner's three."],
        heightM: 3.38,
        widthM: 2.52,
        weightTonnes: 19.5,
      },
    ],
  },
  // --- Minibus ---
  {
    // Merges the old separate "Mercedes-Benz Sprinter/EVM Cityline
    // (diesel)" and "(electric)" entries — both share the identical
    // fixed 7.4m length and the same Stepped-entrance/Low-floor variant
    // pair, so this is the cleanest merge of the lot (no length filtering
    // needed by power at all).
    id: "evm-cityline",
    name: "Mercedes-Benz Sprinter/EVM Cityline",
    category: "Minibus",
    powerOptions: [
      { powerType: "diesel", priceDeltaGBP: 0 },
      { powerType: "electric", priceDeltaGBP: 50_000 }, // 125,000 (old electric base) - 75,000 (old diesel base)
    ],
    basePriceGBP: 75_000,
    notes: [
      "Fixed length 7.4m (7367mm).",
      "No toilet ever available — if the total journey is over 4 hours, must stop after 3 hours for a toilet break; under 4 hours can run straight through.",
      "Low floor is a retrofittable option; defaults to steps (confirmed by the user) — the two builds carry genuinely different capacity, not just an accessibility flag.",
      "Every vehicle in the catalogue always has its wheelchair bay (confirmed by the user) — capacity varies only with whether it's currently occupied.",
    ],
    lengths: [
      {
        lengthM: 7.4,
        powerType: "diesel",
        variantLabel: "Stepped entrance",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 16, standing: 0 }, bayInUse: { seated: 14, standing: 0 } },
        energyOptions: [{ label: "Standard tank", capacity: 93, unit: "L", rangeMiles: 350 }],
        notes: [
          "No standing capacity at all (confirmed by the user) — a fixed seat folds away to make room when the wheelchair bay is occupied, rather than trading against standing space.",
        ],
        heightM: 2.703,
        widthM: 2.02,
        weightTonnes: 5.5,
      },
      {
        lengthM: 7.4,
        powerType: "diesel",
        variantLabel: "Low floor",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 16, standing: 8 }, bayInUse: { seated: 16, standing: 4 } },
        energyOptions: [{ label: "Standard tank", capacity: 93, unit: "L", rangeMiles: 350 }],
        heightM: 2.703,
        widthM: 2.02,
        weightTonnes: 5.5,
      },
      {
        lengthM: 7.4,
        powerType: "electric",
        variantLabel: "Stepped entrance",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 16, standing: 0 }, bayInUse: { seated: 14, standing: 0 } },
        energyOptions: [{ label: "Battery", capacity: 115, unit: "kWh", rangeMiles: 190 }],
        notes: [
          "No standing capacity at all (confirmed by the user) — a fixed seat folds away to make room when the wheelchair bay is occupied, rather than trading against standing space.",
        ],
        heightM: 2.703,
        widthM: 2.02,
        weightTonnes: 5.9,
      },
      {
        lengthM: 7.4,
        powerType: "electric",
        variantLabel: "Low floor",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 16, standing: 8 }, bayInUse: { seated: 16, standing: 4 } },
        energyOptions: [{ label: "Battery", capacity: 115, unit: "kWh", rangeMiles: 190 }],
        heightM: 2.703,
        widthM: 2.02,
        weightTonnes: 5.9,
      },
    ],
  },

  // --- Coaches ---
  {
    id: "volvo-9700",
    name: "Volvo 9700",
    category: "Coaches",
    powerOptions: [{ powerType: "diesel", priceDeltaGBP: 0 }],
    basePriceGBP: 290_000,
    notes: ["Toilet standard, already included in the capacity figures — no separate seat deduction."],
    lengths: [
      {
        lengthM: 12.4,
        powerType: "diesel",
        capacity: { kind: "seatedOnly", seated: 53 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900, priceDeltaGBP: 0 },
          // Named "InterCity", not "Smaller"/"Standard" — reads as the paid
          // upgrade under the general rule, not the "bigger tank is free
          // base" exception VEHICLE-SPECS.md §2 confirmed only for pairs
          // literally named Standard/Smaller (flagged there as my own
          // inference, since the user's own confirmation covered only the
          // Enviro400/StreetDeck pairs by name).
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125, priceDeltaGBP: 1_800 }, // 120L extra x £15/L
        ],
        notes: ["Twin-axle (≤12.9m)."],
        heightM: 3.65,
        widthM: 2.55,
        weightTonnes: 23.7,
      },
      {
        lengthM: 13.1,
        powerType: "diesel",
        capacity: { kind: "seatedOnly", seated: 65 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900, priceDeltaGBP: 0 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125, priceDeltaGBP: 1_800 },
        ],
        // Length pricing confirmed 2026-10-18: 0.7m over the 12.4m base,
        // £290,000 x 0.5%/10cm = £10,150 → £10,200 (a genuine round-half-
        // to-even tie) — this figure alone, NOT including the +£15,000
        // axle charge priceFor() adds dynamically for crossing from
        // twin-axle (12.4m base) to tri-axle (13.1m, >12.9m) here.
        priceDeltaGBP: 10_200,
        notes: ["Tri-axle (>12.9m) — seated capacity doesn't vary further by the specific tri-axle length."],
        heightM: 3.65,
        widthM: 2.55,
        weightTonnes: 23.7,
      },
      {
        lengthM: 13.9,
        powerType: "diesel",
        capacity: { kind: "seatedOnly", seated: 65 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900, priceDeltaGBP: 0 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125, priceDeltaGBP: 1_800 },
        ],
        priceDeltaGBP: 21_800, // 1.5m over the 12.4m base (axle charge applied dynamically, see 13.1m's own note)
        notes: ["Tri-axle (>12.9m)."],
        heightM: 3.65,
        widthM: 2.55,
        weightTonnes: 30.7,
      },
      {
        lengthM: 15,
        powerType: "diesel",
        capacity: { kind: "seatedOnly", seated: 65 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900, priceDeltaGBP: 0 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125, priceDeltaGBP: 1_800 },
        ],
        priceDeltaGBP: 37_700, // 2.6m over the 12.4m base (axle charge applied dynamically, see 13.1m's own note)
        notes: ["Tri-axle (>12.9m)."],
        heightM: 3.65,
        widthM: 2.55,
        weightTonnes: 30.7,
      },
    ],
  },
  {
    id: "volvo-9700dd",
    name: "Volvo 9700DD",
    category: "Coaches",
    powerOptions: [{ powerType: "diesel", priceDeltaGBP: 0 }],
    basePriceGBP: 420_000,
    notes: [
      "A separate buying menu entry from the single-deck 9700, not merged — single vs double deck is a fundamental distinction.",
      "Both lengths are tri-axle.",
    ],
    lengths: [
      { lengthM: 13, powerType: "diesel", capacity: { kind: "seatedOnly", seated: 75 }, energyOptions: [{ label: "Standard tank", capacity: 690, unit: "L", rangeMiles: 1080 }], heightM: 4, widthM: 2.5, weightTonnes: 26.5 },
      {
        lengthM: 14.8,
        powerType: "diesel",
        capacity: { kind: "seatedOnly", seated: 81 },
        energyOptions: [{ label: "Standard tank", capacity: 690, unit: "L", rangeMiles: 980 }],
        priceDeltaGBP: 37_800, // length pricing confirmed 2026-10-18: 1.8m over the 13m base, £420,000 x 0.5%/10cm — no axle charge, both lengths already tri-axle
        heightM: 4,
        widthM: 2.5,
        weightTonnes: 26.5,
      },
    ],
  },
];

export function findVehicleModel(id: string): VehicleModel | undefined {
  return VEHICLE_MODELS.find((v) => v.id === id);
}

// Real max-speed cap for a route's own feasibility check, added
// 2026-11-19 (live request: "Each vehicle should have a max speed" —
// refined the same day to "Each vehicle should have its own limit as
// some are different, we will go through later," which gave every model
// its own topSpeedMph field). Dropped again 2026-11-20 (live request:
// "Lets drop the max speed of individual vehicles and limit all coaches
// to 60mph keeping buses at 50mph. I can't find real figures for most.")
// — real per-model figures were never sourced for most of the catalogue,
// so the per-model field is gone entirely in favour of this plain
// category-based derivation: Coaches and the Minibus category (the EVM
// Cityline/Sprinter, confirmed grouped with coaches rather than buses)
// get 60mph, every other category gets 50mph.
export function topSpeedMphForModel(model: VehicleModel): 50 | 60 {
  return model.category === "Coaches" || model.category === "Minibus" ? 60 : 50;
}

// Journey timing is derived from a route's own real running time
// (route-timetable.mts's `computeOffsets`, fed by `legTimesSeconds` from
// the WASM router), shared by whichever vehicle happens to run that
// journey — there's still no real vehicle-to-journey assignment system
// (this codebase's own long-standing, repeatedly-flagged gap). So "a
// vehicle can't exceed its own max speed" can't mean capping live
// animation per vehicle; it means the route's own published running time
// must never imply an average speed faster than every vehicle actually
// eligible to run it could physically achieve — checked once, at the
// route level, using whichever real vehicle-type/livery lock already
// restricts that route (the same real lock `vehicleRequirementBucketForRoute`,
// route-statistics.mts, already resolves for the vehicle-requirement
// panel — reused here rather than re-deriving the lock rules a second
// time). An unrestricted route (no real lock) conservatively uses the
// slowest model in the WHOLE catalogue, since any model could end up
// running it.
export function minTopSpeedMphForRoute(routeNumber: string, liverySpecificRoute: Readonly<Record<string, string>>): number {
  const bucket = vehicleRequirementBucketForRoute(routeNumber, liverySpecificRoute);
  let eligible: readonly VehicleModel[];
  if (bucket === "Coaches") {
    eligible = VEHICLE_MODELS.filter((v) => v.category === "Coaches");
  } else if (bucket.includes("ScotRail")) {
    eligible = VEHICLE_MODELS.filter((v) => v.category === "Single-deckers / midibuses");
  } else {
    eligible = VEHICLE_MODELS;
  }
  // Can't be empty in practice (every real bucket has at least one real
  // model in its category) — falls back to the whole catalogue's own
  // minimum rather than throwing, same "can't do it sensibly, don't
  // fake it, but don't crash either" convention used throughout this
  // codebase.
  const pool = eligible.length > 0 ? eligible : VEHICLE_MODELS;
  return Math.min(...pool.map(topSpeedMphForModel));
}

export function vehicleModelsByCategory(): Map<string, VehicleModel[]> {
  const map = new Map<string, VehicleModel[]>();
  for (const v of VEHICLE_MODELS) {
    const list = map.get(v.category) ?? [];
    list.push(v);
    map.set(v.category, list);
  }
  return map;
}

// The manufacturer bulk discount (OPERATIONS.md §3 "Buying") groups a
// basket by manufacturer regardless of model/configuration, so the buy
// menu needs one real manufacturer name per model id. Every id in this
// catalogue already starts with its own manufacturer's prefix before the
// first hyphen (adl-, volvo-, wrightbus-, yutong-, evm-, mcv-) — a real,
// consistent naming convention already followed throughout this file, not
// a guess — so this maps that prefix to its real display name rather than
// hand-listing all 14 ids separately (which would silently drift the
// moment a 15th model is added without updating a second list).
const MANUFACTURER_DISPLAY_NAME_BY_PREFIX: Record<string, string> = {
  adl: "Alexander Dennis",
  volvo: "Volvo",
  wrightbus: "Wrightbus",
  yutong: "Yutong",
  evm: "EVM",
  mcv: "MCV",
};

export function manufacturerOf(modelId: string): string {
  const prefix = modelId.split("-")[0];
  const name = MANUFACTURER_DISPLAY_NAME_BY_PREFIX[prefix];
  if (!name) throw new Error(`vehicle-catalogue.mts: unrecognised manufacturer prefix "${prefix}" in model id "${modelId}" — add it to MANUFACTURER_DISPLAY_NAME_BY_PREFIX`);
  return name;
}

// §1: twin-axle up to and including 12.9m, tri-axle required over 12.9m —
// derived, not stored, so it can never drift from a length figure.
export function axleCountForLength(lengthM: number): "twin-axle" | "tri-axle" {
  return lengthM <= 12.9 ? "twin-axle" : "tri-axle";
}

// Every length this model offers under one specific power type — the
// length list a configurator shows once a power is chosen.
export function lengthsForPower(vehicle: VehicleModel, powerType: PowerType): LengthVariant[] {
  return vehicle.lengths.filter((l) => l.powerType === powerType);
}

// T179 (OPEN-ITEMS.md, confirmed 2026-11-13) — which power(s) an owned
// vehicle could be RE-POWERED to: electric/hydrogen LengthVariant rows
// already defined on this exact model at its exact current length. A
// re-power never changes model or length, only power (and the selected
// general options) — confirmed directly, so this is the full eligibility
// check on the catalogue side (the vehicle's own age/condition gate is
// separate, see repower-booking.mts). Most models have no such variant
// yet, pending the later full spec-population pass across the whole
// Q15-Q22 backlog — that's the expected, correct state, not a gap to
// work around here.
export function repowerTargetsFor(vehicle: VehicleModel, currentLengthM: number): PowerType[] {
  // Deduped — a model can carry more than one LengthVariant row at the
  // same length/power (different variantLabels, e.g. evm-cityline's
  // Stepped-entrance/Low-floor split), which would otherwise produce the
  // same target power twice.
  const powers = vehicle.lengths.filter((l) => l.lengthM === currentLengthM && (l.powerType === "electric" || l.powerType === "hydrogen")).map((l) => l.powerType);
  return [...new Set(powers)];
}

// The real price for this exact model/length/power combination — base
// price plus whichever power delta applies, plus the length's own delta
// (0 unless documented otherwise), plus a flat axle-crossing charge where
// it applies. Null when the model has no direct price of its own
// (open-top donor pricing) — the caller resolves the donor's own price
// separately.
//
// Length pricing (confirmed 2026-10-18): each length's own `priceDeltaGBP`
// stores only the raw 10cm-banded figure (0.5% of the base price per
// 10cm over that power's own shortest length, rounded to the nearest
// £100 using round-half-to-even — verified against every one of the
// user's own worked examples, including one genuine tie that round-half-
// up would have gotten wrong by £100). The further flat **£15,000 axle
// charge**, confirmed to apply to **coaches only**, going from twin-axle
// to tri-axle (crossing the 12.9m threshold) relative to that power's own
// shortest length, is computed here dynamically rather than baked into
// the stored figure — it's a derived fact already available from
// `axleCountForLength`, the same "derived, not stored" reasoning that
// function's own comment already gives.
export function priceFor(vehicle: VehicleModel, length: LengthVariant): number | null {
  if (vehicle.basePriceGBP === null) return null;
  const powerDelta = vehicle.powerOptions.find((p) => p.powerType === length.powerType)?.priceDeltaGBP ?? 0;
  let axleCharge = 0;
  if (vehicle.category === "Coaches") {
    const lengthsUnderThisPower = lengthsForPower(vehicle, length.powerType);
    const shortest = lengthsUnderThisPower.reduce((shortestSoFar, l) => (l.lengthM < shortestSoFar.lengthM ? l : shortestSoFar));
    if (axleCountForLength(length.lengthM) !== axleCountForLength(shortest.lengthM)) axleCharge = 15_000;
  }
  return vehicle.basePriceGBP + powerDelta + (length.priceDeltaGBP ?? 0) + axleCharge;
}

export function generalOptionsFor(vehicle: VehicleModel, powerType: PowerType): GeneralOption[] {
  return GENERAL_OPTIONS.filter((o) => {
    if (o.appliesTo === "evm-cityline-only") return vehicle.id === "evm-cityline";
    return o.appliesTo === "all" || o.appliesTo === powerType || o.appliesTo === "training-only";
  });
}

// The seated figure "per seat" options price against (§2's own rule:
// seated capacity only, never standing) — one figure per Capacity kind,
// using whichever of its own numbers represents "no wheelchair user
// aboard, nothing converted away" (bayConverted for the dynamic kind,
// maxSeated for the max-capacity kind), since that's the real standard
// layout a seat count like this means in practice.
export function seatedCapacityOf(capacity: Capacity): number {
  switch (capacity.kind) {
    case "seatedStanding":
      return capacity.seated;
    case "seatedOnly":
      return capacity.seated;
    case "maxCapacity":
      return capacity.maxSeated;
    case "wheelchairBayDependent":
      return capacity.bayConverted.seated;
    case "unspecified":
      return 0;
  }
}

// A general option's own real price for one specific vehicle/length —
// 0 for "standard" (always included) and "perEnergyOption" (priced
// separately, per EnergyOption.priceDeltaGBP, not here), the vehicle's
// own override if one exists, otherwise the option's default figure,
// multiplied by seated capacity for "perSeat". A dropdown option with
// `dropdownChoices` (CCTV audio) has no single "the price" — the caller
// picks a choice's own `amountGBP` directly instead.
export function priceForGeneralOption(option: GeneralOption, vehicle: VehicleModel, length: LengthVariant): number {
  if (option.priceKind === "standard" || option.priceKind === "perEnergyOption") return 0;
  const base = option.priceOverridesByModelId?.[vehicle.id] ?? option.priceGBP ?? 0;
  if (option.priceKind === "perSeat") return base * seatedCapacityOf(length.capacity);
  return base;
}
