// The full vehicle catalogue (VEHICLE-SPECS.md), transcribed faithfully as
// static game data — not derived from OSM/pipeline data like everything
// else in this project, so it lives as a plain typed module rather than a
// Rust/wasm artefact. Pure data plus a couple of small pure helpers; no
// DOM/maplibre-gl dependency, so this is safely importable from a verify
// script or the eventual purchase/configurator UI alike.
//
// Scope of this increment (the user's own choice): the data model and a
// read-only browsable view only — no purchasing, no fleet/ownership table,
// no depot assignment yet. Where VEHICLE-SPECS.md itself doesn't state a
// figure, this file says so explicitly (`{ kind: "unspecified" }` or a
// `notes` entry) rather than inventing one — CLAUDE.md's "ask rather than
// guess."

export type PowerType = "diesel" | "electric" | "hybrid" | "hydrogen";

export interface EnergyOption {
  label: string;
  // null where VEHICLE-SPECS.md states a range but not the tank/battery
  // capacity itself (the Volvo 7900 Hybrid) — flagged, not guessed.
  capacity: number | null;
  unit: "L" | "kWh" | "kg";
  rangeMiles: number;
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
  fleetNumberRange: string;
  // Distinguishes two real builds that share the same length (the
  // Cityline's low-floor vs stepped-entrance conversion, DESIGN.md's own
  // "Low floor is a retrofittable option; defaults to steps") — undefined
  // everywhere else, where a length uniquely identifies one real build.
  variantLabel?: string;
  capacity: Capacity;
  energyOptions: EnergyOption[];
  // A hydrogen vehicle's fixed buffer battery, alongside its tank options
  // (Kite Hydroliner, StreetDeck Hydroliner) — doesn't vary with tank size.
  bufferBatteryKWh?: number;
  notes?: string[];
}

export interface VehicleModel {
  id: string;
  name: string;
  chassis?: string;
  category: string; // matches a VEHICLE-SPECS.md §3 heading
  powerType: PowerType;
  topSpeedMph: 50 | 62;
  basePriceGBP: number | null; // null when priced as a donor vehicle (open-top)
  priceNote?: string;
  lengths: LengthVariant[];
  notes?: string[];
}

export interface DroppedVehicle {
  name: string;
  reason: string;
}

export interface GeneralOption {
  id: string;
  label: string;
  selectionType: "checkbox" | "dropdown" | "standard";
  appliesTo: "all" | PowerType | "training-only" | "evm-cityline-only";
  effect: string;
}

// §1 general rules worth surfacing directly in a browsable catalogue view
// (the deeper economic rules — seats as shippable inventory, private hire's
// +2 seats, the toilet/4-hour rule — are vehicle-level notes instead, since
// they're facts about specific vehicles rather than catalogue-wide reading
// aids).
export const GENERAL_RULES = {
  wheelchairSpace:
    "Every vehicle has exactly 1 wheelchair space, always additional to the seated/standing figures below — never included within them.",
  axleRule:
    "Twin-axle up to and including 12.9m; tri-axle is required by law over 12.9m. Not a selectable option — derived from the coach's length.",
  topSpeed: "50mph for buses (single-deck, double-deck, open-top); 62mph for coaches and the EVM Cityline.",
  maxSeatingMaxStanding:
    "Where a vehicle publishes a max capacity that isn't max seated + max standing, those are two different configuration modes: max-seating mode fills the remainder with standing to reach max capacity, max-standing mode fills the remainder with seats.",
  batteryUnits: "Battery figures are always kWh (energy capacity), never kW (power).",
  schoolRunCapacity: "On a school contract, capacity is seated capacity only — no standing passengers are permitted at all.",
} as const;

export const GENERAL_OPTIONS: GeneralOption[] = [
  { id: "cctv-cameras", label: "CCTV cameras", selectionType: "standard", appliesTo: "all", effect: "Standard on every vehicle, not optional." },
  {
    id: "cctv-audio",
    label: "CCTV audio",
    selectionType: "dropdown",
    appliesTo: "all",
    effect:
      "None / cab-only / full. Cab-only protects the driver in a complaint and slightly deters abuse. Full audio is disliked on ordinary routes (feels intrusive) but liked on routes flagged for a known abuse/bad-behaviour problem, where full-audio vehicles are preferentially assigned once the route carries that flag.",
  },
  { id: "usb-power", label: "USB and power sockets", selectionType: "checkbox", appliesTo: "all", effect: "Small satisfaction boost plus a slight marketing/awareness boost." },
  { id: "wifi", label: "Wi-Fi", selectionType: "checkbox", appliesTo: "all", effect: "Same shape as USB sockets, bigger effect — matters more to passengers." },
  {
    id: "comfier-seats",
    label: "Comfier seats",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Bigger effect than Wi-Fi, no marketing boost. Scales on a binary long-distance/short-journey split, not continuously.",
  },
  {
    id: "air-conditioning",
    label: "Air conditioning",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Bigger effect than Wi-Fi, no marketing boost. Seasonal — a bigger boost in summer months.",
  },
  {
    id: "next-stop-audio",
    label: "Next-stop audio",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Satisfaction plus marketing boost. Matters more than screens — essential accessibility for visually impaired passengers.",
  },
  { id: "info-screens", label: "Passenger info screens", selectionType: "checkbox", appliesTo: "all", effect: "Satisfaction plus marketing boost, smaller than next-stop audio." },
  {
    id: "premium-driver-seat",
    label: "Premium driver seat",
    selectionType: "checkbox",
    appliesTo: "all",
    effect: "Driver happiness boost and reduces sickness/turnover, feeding into the existing warning/dismissal system.",
  },
  { id: "larger-fuel-tank", label: "Larger fuel tank", selectionType: "checkbox", appliesTo: "diesel", effect: "Per-vehicle range boost (see the vehicle's own energy options)." },
  { id: "larger-battery", label: "Larger battery pack", selectionType: "dropdown", appliesTo: "electric", effect: "Per-vehicle range boost (see the vehicle's own energy options)." },
  { id: "larger-hydrogen-tank", label: "Larger hydrogen tank", selectionType: "dropdown", appliesTo: "hydrogen", effect: "Per-vehicle range boost (see the vehicle's own energy options)." },
  {
    id: "pantograph-charging",
    label: "Pantograph charging",
    selectionType: "checkbox",
    appliesTo: "electric",
    effect: "Enables opportunity charging during layovers, reducing overnight depot charging need. Needs infrastructure: £3,500 per stop; one per stance at a bus station/interchange.",
  },
  { id: "low-floor", label: "Low floor conversion", selectionType: "checkbox", appliesTo: "evm-cityline-only", effect: "Purely functional — satisfies accessibility requirements, avoids the stepped-vehicle accessibility penalty." },
  { id: "seatbelts", label: "Seatbelts", selectionType: "checkbox", appliesTo: "all", effect: "Standard on coaches. On other vehicle types, a functional option satisfying school contract eligibility — no satisfaction effect." },
  { id: "school-signs", label: "Foldable school signs", selectionType: "checkbox", appliesTo: "all", effect: "Purely functional, satisfies school contract requirements, shown/hidden per journey." },
  { id: "instructor-mirrors", label: "Instructor mirrors", selectionType: "checkbox", appliesTo: "training-only", effect: "Training vehicles only. Purely functional — lets the instructor see properly." },
];

export const DROPPED_VEHICLES: DroppedVehicle[] = [
  { name: "Volvo B8L (tri-axle)", reason: "Was a chassis, not a complete vehicle — replaced by the ADL Enviro500." },
  { name: "Volvo BZL DD", reason: "No real data available; the StreetDeck Electroliner already covers this space." },
  { name: 'Yutong U11DD ("E12DD" was the wrong name for it)', reason: "Considered, then dropped by choice." },
  { name: "Plain diesel Volvo 7900, and the 7900 at 10.6m or articulated", reason: "Don't exist in the Scottish fleet." },
];

export const VEHICLE_MODELS: VehicleModel[] = [
  // --- 10,000s — diesel double-deckers ---
  {
    id: "adl-enviro400-mmc",
    name: "ADL Enviro400 MMC",
    chassis: "Volvo B5TL",
    category: "10,000s — diesel double-deckers",
    powerType: "diesel",
    topSpeedMph: 50,
    basePriceGBP: 235_000,
    lengths: [
      {
        lengthM: 10.5,
        fleetNumberRange: "10,000s",
        capacity: { kind: "seatedStanding", seated: 74, standing: 16 },
        energyOptions: [
          { label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475 },
          { label: "Smaller tank", capacity: 200, unit: "L", rangeMiles: 350 },
        ],
      },
      {
        lengthM: 10.9,
        fleetNumberRange: "10,000s",
        capacity: { kind: "seatedStanding", seated: 82, standing: 18 },
        energyOptions: [
          { label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475 },
          { label: "Smaller tank", capacity: 200, unit: "L", rangeMiles: 350 },
        ],
      },
      {
        lengthM: 11.5,
        fleetNumberRange: "10,000s",
        capacity: { kind: "seatedStanding", seated: 85, standing: 20 },
        energyOptions: [
          { label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475 },
          { label: "Smaller tank", capacity: 200, unit: "L", rangeMiles: 350 },
        ],
      },
    ],
  },
  {
    id: "adl-enviro500",
    name: "ADL Enviro500",
    category: "10,000s — diesel double-deckers",
    powerType: "diesel",
    topSpeedMph: 50,
    basePriceGBP: 265_000,
    lengths: [
      {
        lengthM: 13.8,
        fleetNumberRange: "10,000s",
        capacity: { kind: "seatedStanding", seated: 80, standing: 32, tipUps: 3 },
        energyOptions: [{ label: "Standard tank (Scotland-spec)", capacity: 430, unit: "L", rangeMiles: 660 }],
        notes: [
          "80 fixed seats: 25 lower deck, 55 upper deck.",
          "The 3 tip-ups trade off against standing space, not adding to the 112-passenger total capacity ceiling.",
        ],
      },
    ],
  },
  {
    id: "streetdeck-ultroliner-diesel",
    name: "StreetDeck Ultroliner (diesel)",
    category: "10,000s — diesel double-deckers",
    powerType: "diesel",
    topSpeedMph: 50,
    basePriceGBP: 310_000,
    lengths: [
      {
        lengthM: 10.6,
        fleetNumberRange: "10,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 96, maxSeated: 74, maxStanding: 26 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330 },
        ],
      },
      {
        lengthM: 11,
        fleetNumberRange: "10,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 98, maxSeated: 83, maxStanding: 18 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330 },
        ],
      },
      {
        lengthM: 11.5,
        fleetNumberRange: "10,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 100, maxSeated: 75, maxStanding: 28 },
        energyOptions: [
          { label: "Standard tank", capacity: 245, unit: "L", rangeMiles: 425 },
          { label: "Smaller tank", capacity: 190, unit: "L", rangeMiles: 330 },
        ],
      },
    ],
  },

  // --- 20,000s / 30,000s — single-deckers and midibuses ---
  {
    id: "adl-enviro200-mmc",
    name: "ADL Enviro200 MMC",
    category: "20,000s / 30,000s — single-deckers and midibuses",
    powerType: "diesel",
    topSpeedMph: 50,
    basePriceGBP: 165_000,
    notes: ["One model spanning both the 20,000s and 30,000s fleet-number ranges, by length."],
    lengths: [
      { lengthM: 8.9, fleetNumberRange: "30,000s", capacity: { kind: "seatedStanding", seated: 30, standing: 14 }, energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 500 }] },
      { lengthM: 9.7, fleetNumberRange: "30,000s", capacity: { kind: "seatedStanding", seated: 34, standing: 15 }, energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 490 }] },
      { lengthM: 10.8, fleetNumberRange: "30,000s", capacity: { kind: "seatedStanding", seated: 40, standing: 16 }, energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 475 }] },
      { lengthM: 11.5, fleetNumberRange: "20,000s", capacity: { kind: "seatedStanding", seated: 43, standing: 17 }, energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 460 }] },
      { lengthM: 11.8, fleetNumberRange: "20,000s", capacity: { kind: "seatedStanding", seated: 43, standing: 17 }, energyOptions: [{ label: "Standard tank", capacity: 220, unit: "L", rangeMiles: 440 }] },
    ],
  },
  {
    id: "volvo-7900-hybrid",
    name: "Volvo 7900 Hybrid",
    category: "20,000s / 30,000s — single-deckers and midibuses",
    powerType: "hybrid",
    topSpeedMph: 50,
    basePriceGBP: 240_000,
    notes: [
      "Only Hybrid and Electric variants exist in Scotland (see the 70,000s for the Electric sibling). Plain diesel and the 10.6m length don't exist here and are dropped from the catalogue.",
    ],
    lengths: [
      {
        lengthM: 12,
        fleetNumberRange: "20,000s",
        capacity: { kind: "seatedStanding", seated: 38, standing: 62 },
        energyOptions: [{ label: "Standard tank (no options)", capacity: null, unit: "L", rangeMiles: 425 }],
        notes: ["Fuel tank capacity itself not stated in VEHICLE-SPECS.md — only the 425 mile range."],
      },
    ],
  },
  {
    id: "mcv-evora",
    name: "MCV Evora",
    category: "20,000s / 30,000s — single-deckers and midibuses",
    powerType: "diesel",
    topSpeedMph: 50,
    basePriceGBP: 155_000,
    notes: [
      "The wheelchair bay converts to extra standing space when unoccupied — a live, per-journey state depending on whether a wheelchair passenger is aboard, not a purchase-time configurator choice (confirmed by the user).",
    ],
    lengths: [
      {
        lengthM: 10.8,
        fleetNumberRange: "30,000s",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 35, standing: 43 }, bayInUse: { seated: 35, standing: 34 } },
        energyOptions: [{ label: "Standard tank", capacity: 350, unit: "L", rangeMiles: 990 }],
        notes: ["69 + wheelchair space, or 78 total with the bay converted to standing."],
      },
      {
        lengthM: 12.9,
        fleetNumberRange: "20,000s",
        capacity: { kind: "wheelchairBayDependent", bayConverted: { seated: 47, standing: 46 }, bayInUse: { seated: 47, standing: 38 } },
        energyOptions: [{ label: "Standard tank", capacity: 350, unit: "L", rangeMiles: 900 }],
        notes: ["86 total with a wheelchair aboard, or 93 total with the bay converted to standing."],
      },
    ],
  },

  // --- 40,000s — minibus ---
  {
    id: "evm-cityline-diesel",
    name: "Mercedes-Benz Sprinter/EVM Cityline (diesel)",
    category: "40,000s — minibus",
    powerType: "diesel",
    topSpeedMph: 62,
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
        variantLabel: "Stepped entrance",
        fleetNumberRange: "40,000s",
        capacity: {
          kind: "wheelchairBayDependent",
          bayConverted: { seated: 16, standing: 0 },
          bayInUse: { seated: 14, standing: 0 },
        },
        energyOptions: [{ label: "Standard tank", capacity: 93, unit: "L", rangeMiles: 350 }],
        notes: [
          "No standing capacity at all (confirmed by the user) — a fixed seat folds away to make room when the wheelchair bay is occupied, rather than trading against standing space.",
          "Used only for private hire work (confirmed by the user) — private hire's own +2-seat rule (§1) applies via the same seats-as-shippable-inventory system, not yet built.",
        ],
      },
      {
        lengthM: 7.4,
        variantLabel: "Low floor",
        fleetNumberRange: "40,000s",
        capacity: {
          kind: "wheelchairBayDependent",
          bayConverted: { seated: 16, standing: 8 },
          bayInUse: { seated: 16, standing: 4 },
        },
        energyOptions: [{ label: "Standard tank", capacity: 93, unit: "L", rangeMiles: 350 }],
      },
    ],
  },
  {
    id: "evm-cityline-electric",
    name: "Mercedes-Benz Sprinter/EVM Cityline (electric)",
    category: "40,000s — minibus",
    powerType: "electric",
    topSpeedMph: 62,
    basePriceGBP: 125_000,
    notes: [
      "Fixed length 7.4m (7367mm).",
      "No toilet ever available — same 3-hour/4-hour rule as the diesel Cityline.",
      "Low floor is a retrofittable option; defaults to steps (confirmed by the user) — the two builds carry genuinely different capacity, not just an accessibility flag.",
      "Every vehicle in the catalogue always has its wheelchair bay (confirmed by the user) — capacity varies only with whether it's currently occupied.",
    ],
    lengths: [
      {
        lengthM: 7.4,
        variantLabel: "Stepped entrance",
        fleetNumberRange: "40,000s",
        capacity: {
          kind: "wheelchairBayDependent",
          bayConverted: { seated: 16, standing: 0 },
          bayInUse: { seated: 14, standing: 0 },
        },
        energyOptions: [{ label: "Battery", capacity: 115, unit: "kWh", rangeMiles: 190 }],
        notes: [
          "No standing capacity at all (confirmed by the user) — a fixed seat folds away to make room when the wheelchair bay is occupied, rather than trading against standing space.",
          "Used only for private hire work (confirmed by the user) — private hire's own +2-seat rule (§1) applies via the same seats-as-shippable-inventory system, not yet built.",
        ],
      },
      {
        lengthM: 7.4,
        variantLabel: "Low floor",
        fleetNumberRange: "40,000s",
        capacity: {
          kind: "wheelchairBayDependent",
          bayConverted: { seated: 16, standing: 8 },
          bayInUse: { seated: 16, standing: 4 },
        },
        energyOptions: [{ label: "Battery", capacity: 115, unit: "kWh", rangeMiles: 190 }],
      },
    ],
  },

  // --- 50,000s — coaches ---
  {
    id: "volvo-9700",
    name: "Volvo 9700",
    category: "50,000s — coaches",
    powerType: "diesel",
    topSpeedMph: 62,
    basePriceGBP: 290_000,
    notes: ["Toilet standard, already included in the capacity figures — no separate seat deduction."],
    lengths: [
      {
        lengthM: 12.4,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 53 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125 },
        ],
        notes: ["Twin-axle (≤12.9m)."],
      },
      {
        lengthM: 13.1,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 65 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125 },
        ],
        notes: ["Tri-axle (>12.9m) — seated capacity doesn't vary further by the specific tri-axle length."],
      },
      {
        lengthM: 13.9,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 65 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125 },
        ],
        notes: ["Tri-axle (>12.9m)."],
      },
      {
        lengthM: 15,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 65 },
        energyOptions: [
          { label: "Standard tank", capacity: 480, unit: "L", rangeMiles: 900 },
          { label: "InterCity tank", capacity: 600, unit: "L", rangeMiles: 1125 },
        ],
        notes: ["Tri-axle (>12.9m)."],
      },
    ],
  },
  {
    id: "volvo-9700dd",
    name: "Volvo 9700DD",
    category: "50,000s — coaches",
    powerType: "diesel",
    topSpeedMph: 62,
    basePriceGBP: 420_000,
    notes: [
      "A separate buying menu entry from the single-deck 9700, not merged — single vs double deck is a fundamental distinction.",
      "Both lengths are tri-axle.",
      "Airlink 100 requires the 13m version specifically.",
    ],
    lengths: [
      { lengthM: 13, fleetNumberRange: "50,000s", capacity: { kind: "seatedOnly", seated: 75 }, energyOptions: [{ label: "Standard tank", capacity: 690, unit: "L", rangeMiles: 1080 }] },
      {
        lengthM: 14.8,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 81 },
        energyOptions: [{ label: "Standard tank", capacity: 690, unit: "L", rangeMiles: 980 }],
      },
    ],
  },
  {
    id: "yutong-coach",
    name: "Yutong coach",
    category: "50,000s — coaches",
    powerType: "electric",
    topSpeedMph: 62,
    basePriceGBP: 310_000,
    notes: [
      "One buying menu entry with a length dropdown selecting between two real models (GTe12 / GTe14).",
    ],
    lengths: [
      {
        lengthM: 12,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 50 },
        energyOptions: [
          { label: "GTe12 battery (smaller)", capacity: 399, unit: "kWh", rangeMiles: 320 },
          { label: "GTe12 battery (larger)", capacity: 465, unit: "kWh", rangeMiles: 370 },
        ],
        notes: ["GTe12, twin-axle."],
      },
      {
        lengthM: 14,
        fleetNumberRange: "50,000s",
        capacity: { kind: "seatedOnly", seated: 57 },
        energyOptions: [
          { label: "GTe14 battery (smaller)", capacity: 621, unit: "kWh", rangeMiles: 335 },
          { label: "GTe14 battery (larger)", capacity: 704, unit: "kWh", rangeMiles: 380 },
        ],
        notes: ["GTe14, tri-axle."],
      },
    ],
  },

  // --- 60,000s — specialised (sightseeing, open-top only) ---
  {
    id: "adl-enviro400-opentop-diesel",
    name: "ADL Enviro400 open-top (diesel)",
    chassis: "Volvo B5TL",
    category: "60,000s — specialised (sightseeing, open-top only)",
    powerType: "diesel",
    topSpeedMph: 50,
    basePriceGBP: null,
    priceNote: "Priced as its donor vehicle (ADL Enviro400 MMC).",
    notes: [
      "Reuses the Enviro400 MMC's 10.9m stats entirely (base capacity, fuel, chassis), except for tour-specific options (tour audio + PA, languages).",
      "An open-top conversion costs £10,000 and cannot be undone; only available on vehicles with a defined open-top variant in the catalogue.",
    ],
    lengths: [
      {
        lengthM: 10.9,
        fleetNumberRange: "60,000s",
        capacity: { kind: "seatedStanding", seated: 82, standing: 18 },
        energyOptions: [{ label: "Standard tank", capacity: 275, unit: "L", rangeMiles: 475 }],
      },
    ],
  },
  {
    id: "adl-enviro400-opentop-electric",
    name: "ADL Enviro400 open-top (electric)",
    category: "60,000s — specialised (sightseeing, open-top only)",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: null,
    priceNote: "Priced as its donor vehicle (ADL Enviro400EV).",
    notes: [
      "Reuses the Enviro400EV's stats entirely (base capacity, battery), except for tour-specific options (tour audio + PA, languages).",
      "An open-top conversion costs £10,000 and cannot be undone; only available on vehicles with a defined open-top variant in the catalogue.",
    ],
    lengths: [
      {
        lengthM: 11.1,
        fleetNumberRange: "60,000s",
        capacity: { kind: "seatedStanding", seated: 80, standing: 18 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 354, unit: "kWh", rangeMiles: 215 },
          { label: "Battery (larger)", capacity: 472, unit: "kWh", rangeMiles: 285 },
        ],
      },
    ],
  },

  // --- 67,000 — hydrogen single-deckers (sub-range within 70,000s) ---
  {
    id: "wrightbus-gb-kite-hydroliner",
    name: "Wrightbus GB Kite Hydroliner",
    category: "67,000 — hydrogen single-deckers",
    powerType: "hydrogen",
    topSpeedMph: 50,
    basePriceGBP: 420_000,
    notes: ["Shares one buying entry with the GB Kite Electroliner (Electric/Hydrogen selector) — fixed length only, unlike the Electroliner's three."],
    lengths: [
      {
        lengthM: 12.2,
        fleetNumberRange: "67,000",
        capacity: { kind: "maxCapacity", maxCapacity: 79, maxSeated: 41, maxStanding: 41 },
        energyOptions: [
          { label: "Hydrogen tank (small)", capacity: 32, unit: "kg", rangeMiles: 340 },
          { label: "Hydrogen tank (medium)", capacity: 40, unit: "kg", rangeMiles: 425 },
          { label: "Hydrogen tank (large)", capacity: 50, unit: "kg", rangeMiles: 530 },
        ],
        bufferBatteryKWh: 54,
      },
    ],
  },

  // --- 70,000s — electric single-deckers ---
  {
    id: "volvo-7900-electric",
    name: 'Volvo 7900 Electric ("7900e")',
    category: "70,000s — electric single-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 320_000,
    priceNote: "NCA base price.",
    notes: ["Electric sibling of the 7900 Hybrid. Genuinely the most complex vehicle in the catalogue — two battery chemistries, each with multiple sizes."],
    lengths: [
      {
        lengthM: 12,
        fleetNumberRange: "70,000s",
        capacity: { kind: "seatedStanding", seated: 38, standing: 57 },
        energyOptions: [
          { label: "NCA 280kWh", capacity: 280, unit: "kWh", rangeMiles: 140 },
          { label: "NCA 375kWh", capacity: 375, unit: "kWh", rangeMiles: 190 },
          { label: "NCA 470kWh", capacity: 470, unit: "kWh", rangeMiles: 235 },
          { label: "LFP 350kWh", capacity: 350, unit: "kWh", rangeMiles: 175 },
          { label: "LFP 500kWh", capacity: 500, unit: "kWh", rangeMiles: 250 },
        ],
      },
    ],
  },
  {
    id: "wrightbus-gb-kite-electroliner",
    name: "Wrightbus GB Kite Electroliner",
    category: "70,000s — electric single-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 350_000,
    notes: [
      "Shares one buying entry with the GB Kite Hydroliner (Electric/Hydrogen selector).",
      "Route 398 can use any length of Electroliner, or the Hydroliner.",
    ],
    lengths: [
      {
        lengthM: 10.9,
        fleetNumberRange: "70,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 78, maxSeated: 37, maxStanding: 39 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 442, unit: "kWh", rangeMiles: 300 },
          { label: "Battery (larger)", capacity: 528, unit: "kWh", rangeMiles: 365 },
        ],
      },
      {
        lengthM: 11.6,
        fleetNumberRange: "70,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 79, maxSeated: 41, maxStanding: 44 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 442, unit: "kWh", rangeMiles: 300 },
          { label: "Battery (larger)", capacity: 528, unit: "kWh", rangeMiles: 365 },
        ],
      },
      {
        lengthM: 12.5,
        fleetNumberRange: "70,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 82, maxSeated: 45, maxStanding: 51 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 442, unit: "kWh", rangeMiles: 300 },
          { label: "Battery (larger)", capacity: 528, unit: "kWh", rangeMiles: 365 },
        ],
      },
    ],
  },
  {
    id: "adl-enviro200ev",
    name: "ADL Enviro200EV",
    category: "70,000s — electric single-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 290_000,
    notes: ["A different length set from the diesel Enviro200 MMC."],
    lengths: [
      { lengthM: 9.9, fleetNumberRange: "70,000s", capacity: { kind: "seatedStanding", seated: 33, standing: 40 }, energyOptions: [{ label: "Battery", capacity: 400, unit: "kWh", rangeMiles: 300 }] },
      { lengthM: 10.9, fleetNumberRange: "70,000s", capacity: { kind: "seatedStanding", seated: 39, standing: 45 }, energyOptions: [{ label: "Battery", capacity: 400, unit: "kWh", rangeMiles: 285 }] },
      { lengthM: 11.7, fleetNumberRange: "70,000s", capacity: { kind: "seatedStanding", seated: 43, standing: 49 }, energyOptions: [{ label: "Battery", capacity: 400, unit: "kWh", rangeMiles: 270 }] },
    ],
  },
  {
    id: "yutong-e10",
    name: "Yutong E10",
    category: "70,000s — electric single-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 300_000,
    lengths: [
      {
        lengthM: 10.9,
        fleetNumberRange: "70,000s",
        capacity: { kind: "seatedStanding", seated: 29, standing: 37, tipUps: 4 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 350, unit: "kWh", rangeMiles: 230 },
          { label: "Battery (larger)", capacity: 422, unit: "kWh", rangeMiles: 275 },
        ],
        notes: ["Standing figure worked out from a max capacity of 70 minus seats and tip-ups."],
      },
    ],
  },
  {
    id: "yutong-e12",
    name: "Yutong E12",
    category: "70,000s — electric single-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 300_000,
    lengths: [
      {
        lengthM: 12.2,
        fleetNumberRange: "70,000s",
        capacity: { kind: "seatedStanding", seated: 34, standing: 31, tipUps: 5 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 350, unit: "kWh", rangeMiles: 225 },
          { label: "Battery (larger)", capacity: 422, unit: "kWh", rangeMiles: 275 },
        ],
        notes: ["Standing figure worked out from a max capacity of 70 minus seats and tip-ups."],
      },
    ],
  },

  // --- 80,000s — electric double-deckers ---
  {
    id: "adl-enviro400ev",
    name: "ADL Enviro400EV",
    category: "80,000s — electric double-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 380_000,
    lengths: [
      {
        lengthM: 11.1,
        fleetNumberRange: "80,000s",
        capacity: { kind: "seatedStanding", seated: 80, standing: 18 },
        energyOptions: [
          { label: "Battery (smaller)", capacity: 354, unit: "kWh", rangeMiles: 215 },
          { label: "Battery (larger)", capacity: 472, unit: "kWh", rangeMiles: 285 },
        ],
        notes: ["80 seated: 51 upper deck, 29 lower deck.", "Standing figure (18) is estimated/interpolated from the diesel Enviro400 MMC, not a real confirmed figure."],
      },
    ],
  },
  {
    id: "streetdeck-electroliner",
    name: "StreetDeck Electroliner",
    category: "80,000s — electric double-deckers",
    powerType: "electric",
    topSpeedMph: 50,
    basePriceGBP: 560_000,
    notes: ["A different fixed length from the Ultroliner's range, confirming the three StreetDeck variants genuinely differ rather than sharing identical stats with a power selector."],
    lengths: [
      {
        lengthM: 10.7,
        fleetNumberRange: "80,000s",
        capacity: { kind: "maxCapacity", maxCapacity: 84, maxSeated: 73, maxStanding: 14 },
        energyOptions: [{ label: "Battery", capacity: 442, unit: "kWh", rangeMiles: 275 }],
      },
    ],
  },

  // --- 87,000 — hydrogen double-deckers (sub-range within 80,000s) ---
  {
    id: "streetdeck-hydroliner",
    name: "StreetDeck Hydroliner",
    category: "87,000 — hydrogen double-deckers",
    powerType: "hydrogen",
    topSpeedMph: 50,
    basePriceGBP: 550_000,
    lengths: [
      {
        lengthM: 10.9,
        fleetNumberRange: "87,000",
        capacity: { kind: "maxCapacity", maxCapacity: 90, maxSeated: 69, maxStanding: 24 },
        energyOptions: [{ label: "Hydrogen tank (one size only)", capacity: 27, unit: "kg", rangeMiles: 295 }],
        bufferBatteryKWh: 111,
      },
    ],
  },
];

export function findVehicleModel(id: string): VehicleModel | undefined {
  return VEHICLE_MODELS.find((v) => v.id === id);
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

// §1: twin-axle up to and including 12.9m, tri-axle required over 12.9m —
// derived, not stored, so it can never drift from a length figure.
export function axleCountForLength(lengthM: number): "twin-axle" | "tri-axle" {
  return lengthM <= 12.9 ? "twin-axle" : "tri-axle";
}

export function generalOptionsFor(vehicle: VehicleModel): GeneralOption[] {
  return GENERAL_OPTIONS.filter((o) => {
    if (o.appliesTo === "evm-cityline-only") return vehicle.id.startsWith("evm-cityline");
    return o.appliesTo === "all" || o.appliesTo === vehicle.powerType || o.appliesTo === "training-only";
  });
}
