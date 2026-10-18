// Fleet numbers and registration plates (OPERATIONS.md §3 "Fleet numbers
// and plates", UK-EXPANSION.md §14 "Fleet numbering scheme — FINALIZED").
// Pure, DOM-free — no catalogue/db import needed beyond the type shapes
// below, so this is safely unit-testable and reusable from both the
// purchase flow and anything that displays an owned vehicle later.
//
// UK-EXPANSION.md §14 explicitly supersedes OPERATIONS.md's own original
// 10,000s/20,000s/... fleet-number-range convention — that range
// language still appears in VEHICLE-SPECS.md's own section headings and
// each LengthVariant's own `fleetNumberRange` field (vehicle-catalogue.mts),
// kept only as a historical/organisational label, never used here.

export type VehicleBroadClass = "minibus" | "single-deck" | "double-decker" | "coach";

// Every real vehicle id in the catalogue (vehicle-catalogue.mts), mapped
// explicitly rather than inferred from the `category` string — the
// "60,000s — specialised (sightseeing, open-top only)" category doesn't
// say "double-decker" anywhere in its own text, and string-matching
// against category labels would silently mis-file it (or anything worded
// differently in future) rather than erroring loudly. This list is
// exhaustive on purpose: an id missing from it is a real bug, not a
// vehicle that defaults to some guessed category.
const BROAD_CLASS_BY_MODEL_ID: Record<string, VehicleBroadClass> = {
  "adl-enviro400-mmc": "double-decker",
  "adl-enviro400-xlb": "double-decker",
  "streetdeck-ultroliner-diesel": "double-decker",
  "adl-enviro200-mmc": "single-deck",
  "volvo-7900-hybrid": "single-deck",
  "mcv-evora": "single-deck",
  "evm-cityline-diesel": "minibus",
  "evm-cityline-electric": "minibus",
  "volvo-9700": "coach",
  "volvo-9700dd": "coach",
  "yutong-coach": "coach",
  "adl-enviro400-opentop-diesel": "double-decker",
  "adl-enviro400-opentop-electric": "double-decker",
  "wrightbus-gb-kite-hydroliner": "single-deck",
  "volvo-7900-electric": "single-deck",
  "wrightbus-gb-kite-electroliner": "single-deck",
  "adl-enviro200ev": "single-deck",
  "yutong-e10": "single-deck",
  "yutong-e12": "single-deck",
  "adl-enviro400ev": "double-decker",
  "streetdeck-electroliner": "double-decker",
  "streetdeck-hydroliner": "double-decker",
};

export function broadClassForModel(modelId: string): VehicleBroadClass {
  const broadClass = BROAD_CLASS_BY_MODEL_ID[modelId];
  if (!broadClass) throw new Error(`fleet-numbering.mts: unmapped vehicle model id "${modelId}" — add it to BROAD_CLASS_BY_MODEL_ID`);
  return broadClass;
}

// §14's own category-digit table, in size order. Single-deck and
// double-decker/coach both split in two by length — the midibus/full-size
// cutoff at 10.8m (the largest real midibus in the catalogue, the Evora
// and Enviro200EV/MMC's own 10.8m/10.9m builds sit either side of it) and
// the twin-/tri-axle cutoff at 12.9m (already established, vehicle-
// catalogue.mts's own `axleCountForLength`) for the other two.
export function fleetCategoryDigit(modelId: string, lengthM: number): number {
  const broadClass = broadClassForModel(modelId);
  switch (broadClass) {
    case "minibus":
      return 1;
    case "single-deck":
      return lengthM <= 10.8 ? 2 : 3;
    case "double-decker":
      return lengthM <= 12.9 ? 4 : 5;
    case "coach":
      return lengthM <= 12.9 ? 6 : 7;
  }
}

// e = electric, h = hydrogen, no suffix for diesel or hybrid (matches
// real-world Lothian Buses practice, per §14's own wording).
export function powerTypeSuffix(powerType: "diesel" | "electric" | "hybrid" | "hydrogen"): "" | "e" | "h" {
  if (powerType === "electric") return "e";
  if (powerType === "hydrogen") return "h";
  return "";
}

// categoryDigit + at least 3 digits of sequential number + suffix, e.g.
// "4001", "3014e", "7002h" (§14's own worked examples). `sequential` is
// the Nth vehicle ever issued in this exact category digit — the caller
// (db.mts) tracks that count, this function just formats it.
export function formatFleetNumber(categoryDigit: number, sequential: number, suffix: "" | "e" | "h"): string {
  return `${categoryDigit}${String(sequential).padStart(3, "0")}${suffix}`;
}

// --- Registration plates (OPERATIONS.md §3 "Fleet numbers and plates") ---
//
// Real current-style GB format (introduced 2001): a 2-letter local memory
// tag (which DVLA office issued it — offices closed in 2013, but the tag
// itself is still issued the same way), 2-digit age identifier (the
// year's own last 2 digits for a March-August issue, +50 for a
// September-February one), a space, then 3 random letters. Verified
// against the real DVLA table (gov.uk's own INF104, cross-checked against
// a reproduction of it) rather than guessed, since the Scottish rows
// here are the project's own pre-existing convention (OPERATIONS.md §3)
// and the rest of the UK needed covering once the map expanded beyond
// Scotland (UK-EXPANSION.md).
//
// One simplified representative code per real DVLA office, not the whole
// issued range each office actually covered — OPERATIONS.md's own
// Scottish examples already do the same simplification (one example tag
// per city, not every code in SA-SJ for Glasgow).
interface PlateArea {
  code: string;
  city: string;
  lon: number;
  lat: number;
}

const PLATE_AREAS: PlateArea[] = [
  { code: "AA", city: "Peterborough", lon: -0.2405, lat: 52.5695 },
  { code: "AO", city: "Norwich", lon: 1.2974, lat: 52.6309 },
  { code: "AV", city: "Ipswich", lon: 1.1482, lat: 52.0567 },
  { code: "BA", city: "Birmingham", lon: -1.8904, lat: 52.4862 },
  { code: "CA", city: "Cardiff", lon: -3.1791, lat: 51.4816 },
  { code: "CP", city: "Swansea", lon: -3.9436, lat: 51.6214 },
  { code: "CW", city: "Bangor", lon: -4.1293, lat: 53.228 },
  { code: "DA", city: "Chester", lon: -2.8931, lat: 53.1934 },
  { code: "DL", city: "Shrewsbury", lon: -2.7527, lat: 52.7069 },
  { code: "EA", city: "Chelmsford", lon: 0.4685, lat: 51.7356 },
  { code: "FA", city: "Nottingham", lon: -1.1581, lat: 52.9548 },
  { code: "FR", city: "Lincoln", lon: -0.5406, lat: 53.2307 },
  { code: "GA", city: "Maidstone", lon: 0.5227, lat: 51.2704 },
  { code: "GP", city: "Brighton", lon: -0.1372, lat: 50.8225 },
  { code: "HA", city: "Bournemouth", lon: -1.8808, lat: 50.7192 },
  { code: "HK", city: "Portsmouth", lon: -1.088, lat: 50.8198 },
  { code: "KA", city: "Luton", lon: -0.42, lat: 51.8787 },
  { code: "KM", city: "Northampton", lon: -0.9027, lat: 52.2405 },
  { code: "LA", city: "London", lon: -0.1276, lat: 51.5072 },
  { code: "MA", city: "Manchester", lon: -2.2426, lat: 53.4808 },
  { code: "NA", city: "Newcastle", lon: -1.6178, lat: 54.9783 },
  { code: "NP", city: "Stockton-on-Tees", lon: -1.3189, lat: 54.5667 },
  { code: "OA", city: "Oxford", lon: -1.2577, lat: 51.752 },
  { code: "PA", city: "Preston", lon: -2.7031, lat: 53.7632 },
  { code: "PU", city: "Carlisle", lon: -2.9382, lat: 54.8951 },
  { code: "RA", city: "Reading", lon: -0.9781, lat: 51.4543 },
  { code: "SA", city: "Glasgow", lon: -4.2518, lat: 55.8642 },
  { code: "SK", city: "Edinburgh", lon: -3.1883, lat: 55.9533 },
  { code: "SP", city: "Dundee", lon: -2.9707, lat: 56.462 },
  { code: "SU", city: "Aberdeen", lon: -2.0943, lat: 57.1497 },
  { code: "SX", city: "Inverness", lon: -4.2247, lat: 57.4778 },
  { code: "VA", city: "Worcester", lon: -2.22, lat: 52.192 },
  { code: "WA", city: "Exeter", lon: -3.5275, lat: 50.726 },
  { code: "WK", city: "Truro", lon: -5.051, lat: 50.2632 },
  { code: "WM", city: "Bristol", lon: -2.5879, lat: 51.4545 },
  { code: "YA", city: "Leeds", lon: -1.5491, lat: 53.8008 },
  { code: "YL", city: "Sheffield", lon: -1.4701, lat: 53.3811 },
  { code: "YV", city: "Beverley", lon: -0.4267, lat: 53.8458 },
];

// Northern Ireland never adopted the 2001 GB scheme at all — real NI
// plates are a different, older format (letters then digits, no area/age
// split). Roughly bounded rather than using a real admin boundary, same
// spirit as the project's own other rough geographic splits.
function isNorthernIreland(lon: number, lat: number): boolean {
  return lon >= -8.2 && lon <= -5.4 && lat >= 54.0 && lat <= 55.3;
}

function nearestPlateArea(lon: number, lat: number): PlateArea {
  let best = PLATE_AREAS[0];
  let bestDist = Infinity;
  for (const area of PLATE_AREAS) {
    const dLon = area.lon - lon;
    const dLat = area.lat - lat;
    const dist = dLon * dLon + dLat * dLat;
    if (dist < bestDist) {
      bestDist = dist;
      best = area;
    }
  }
  return best;
}

// The real DVLA age-identifier rule: March-August issue uses the year's
// own last 2 digits; September-February uses that +50. There's no in-
// game calendar yet (just a continuous day-type clock, vehicle-
// simulation.ts), so this uses the real wall-clock date a vehicle is
// actually bought on — the closest real figure available, not a guess.
function ageIdentifier(date: Date): string {
  const month = date.getMonth() + 1; // 1-12
  let year = date.getFullYear();
  if (month >= 3 && month <= 8) return String(year % 100).padStart(2, "0");
  // September-February: Jan/Feb belong to the period that started the
  // PREVIOUS September, not their own calendar year — a real bug this
  // file's own verify script caught (Jan 2027 was computing 77, but
  // Sept 2026-Feb 2027 is one single period and must give 76 throughout).
  if (month === 1 || month === 2) year -= 1;
  return String((year % 100) + 50).padStart(2, "0");
}

function randomLetters(count: number, rng: () => number): string {
  // DVLA plates never use I, Q or Z in the random suffix — real rule,
  // confirmed via gov.uk's own INF104.
  const letters = "ABCDEFGHJKLMNOPRSTUVWXY";
  let out = "";
  for (let i = 0; i < count; i++) out += letters[Math.floor(rng() * letters.length)];
  return out;
}

// `rng` is injectable (defaults to Math.random) so this is deterministically
// testable — the 3 trailing letters are genuinely random on a real plate,
// nothing meaningful to assert about their exact value otherwise.
export function generatePlate(lon: number, lat: number, boughtAt: Date = new Date(), rng: () => number = Math.random): string {
  if (isNorthernIreland(lon, lat)) {
    return `${randomLetters(3, rng)} ${Math.floor(rng() * 9000) + 1000}`;
  }
  const area = nearestPlateArea(lon, lat);
  return `${area.code}${ageIdentifier(boughtAt)} ${randomLetters(3, rng)}`;
}
