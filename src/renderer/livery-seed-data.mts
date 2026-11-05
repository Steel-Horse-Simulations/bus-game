// Real liveries to seed into a fresh/existing save (OPERATIONS.md §4), so
// the buy menu's livery picker has real, recognisable choices from the
// start rather than needing the player to hand-type 38 liveries themselves
// first. Mirrors the existing `seedRealDealers()` pattern in db.mts:
// idempotent, matched by name, safe to call on every launch.
//
// Colour provenance: only two liveries have a confirmed real hex pair
// (OPERATIONS.md §4's own reference table) — Lothian and Stagecoach Local
// (the plain "Stagecoach.png" badge is that one). The other 36 colours
// below were sampled directly from each real badge PNG (a from-scratch
// decoder picking the two most common, sufficiently-distinct opaque
// pixel colours), not invented — but they're still an automatic
// approximation, not confirmed by the user the way the two reference
// values were. Flagged here and in OPEN-ITEMS.md; fine to correct by
// hand later via the existing Liveries panel if any look wrong.
export const REAL_LIVERY_COLOURS: Record<string, { primary: string; secondary: string }> = {
  // Confirmed (OPERATIONS.md §4's own reference table).
  Lothian: { primary: "#8c1d2f", secondary: "#f2f0ec" },
  Stagecoach: { primary: "#00539b", secondary: "#f2f0ec" },

  // Auto-sampled from the real badge PNGs (see header note above).
  Air: { primary: "#003060", secondary: "#00a0f0" },
  "Airlink 100": { primary: "#1050b0", secondary: "#f01050" },
  "Borders Buses": { primary: "#c01030", secondary: "#fff0c0" },
  Citylink: { primary: "#003080", secondary: "#ffd000" },
  "D&E": { primary: "#f0f0f0", secondary: "#d01030" },
  "East Coast Buses": { primary: "#fff0f0", secondary: "#005030" },
  Ember: { primary: "#303030", secondary: "#509080" },
  "Explore Dundee": { primary: "#006040", secondary: "#50d020" },
  "Express 100": { primary: "#008080", secondary: "#b0f0f0" },
  "Express 500": { primary: "#701070", secondary: "#a050b0" },
  "First Bus": { primary: "#301080", secondary: "#d0e0e0" },
  "First Training": { primary: "#ffd000", secondary: "#005030" },
  "Hebridean Transport": { primary: "#800020", secondary: "#f0f0d0" },
  "Islay Coaches": { primary: "#ffffff", secondary: "#007030" },
  "Lochs Motor Transport": { primary: "#f0f0f0", secondary: "#30b0e0" },
  "Lothian Coaches": { primary: "#203030", secondary: "#ffb000" },
  "Lothian Country": { primary: "#fff0f0", secondary: "#005030" },
  "Lothian Girraffe": { primary: "#a06030", secondary: "#f0e0c0" },
  MegaBus: { primary: "#104090", secondary: "#ffd020" },
  "Midland Bluebird": { primary: "#0070c0", secondary: "#fff0e0" },
  "North Uist Transport": { primary: "#f0f0f0", secondary: "#203030" },
  "Orkney Council": { primary: "#ffffff", secondary: "#003080" },
  Rapsons: { primary: "#107080", secondary: "#ff5010" },
  ScotRail: { primary: "#003080", secondary: "#20c0ff" },
  "Shetland Transport": { primary: "#f0f0f0", secondary: "#006080" },
  "Shiel Buses": { primary: "#e0e0e0", secondary: "#202020" },
  Sightseeing: { primary: "#e01020", secondary: "#ffe010" },
  SkyLink: { primary: "#a0b0b0", secondary: "#00a0f0" },
  SPT: { primary: "#ff8020", secondary: "#506070" },
  "Stagecoach Dark": { primary: "#002060", secondary: "#00b0a0" },
  "Stagecoach Electric": { primary: "#ffffff", secondary: "#70c050" },
  "Stagecoach Jet": { primary: "#ffffff", secondary: "#c04090" },
  "Stagecoach Training - Blue": { primary: "#202020", secondary: "#0090f0" },
  "Stagecoach Training - Teal": { primary: "#202020", secondary: "#00b0a0" },
  "Stagecoach Training - Yellow": { primary: "#202020", secondary: "#ffc030" },
  "West Coast Motors": { primary: "#fff0f0", secondary: "#e01010" },

  // No real badge exists yet for this one at all (OPEN-ITEMS.md T98 —
  // "only Highland Council's badge genuinely remains missing"), so there's
  // nothing to sample colours from. Seeded anyway with a plain placeholder
  // pair so Caithness's own lock list has a real, selectable row for
  // every one of its accepted liveries — `livery-badges.mts` simply has
  // no image for this name yet, so the buy menu falls back to the colour
  // swatch it already shows for any livery lacking a badge file.
  "Highland Council": { primary: "#4b5563", secondary: "#e5e7eb" },

  // Added 2026-11-05 (user request) — no real badge photo supplied yet
  // either, same treatment as Highland Council above: a plain neutral
  // placeholder pair, not a guess at the real Oxford Tube livery, so
  // nothing here implies a colour that hasn't actually been confirmed.
  // Replace with real sampled colours once a reference photo is supplied.
  "Oxford Tube": { primary: "#4b5563", secondary: "#e5e7eb" },
};

// DESIGN.md "Island and remote-area review" — transcribed directly from the
// table, not guessed. Keyed by depot GROUP name (the real save's own depot
// groups are already named after the real area — "Skye", "Glasgow" — which
// is the only field that actually matches this table's own area names;
// `region` is a broader label like "North Scotland" and doesn't).
// Only areas with a real livery restriction appear here; a depot group
// whose name isn't a key below is unrestricted. Campbeltown is
// deliberately excluded — its restriction is per-route ("town-only
// services"), not per-depot, and there's no route-level data to check that
// against yet.
export const RESTRICTED_AREA_LIVERIES: Record<string, { accepted: string[]; preferred: string }> = {
  Shetland: { accepted: ["Shetland Transport"], preferred: "Shetland Transport" },
  Orkney: { accepted: ["Orkney Council"], preferred: "Orkney Council" },
  Arran: { accepted: ["SPT"], preferred: "SPT" },
  "Lewis and Harris": { accepted: ["Hebridean Transport"], preferred: "Hebridean Transport" },
  "North Uist": { accepted: ["North Uist Transport"], preferred: "North Uist Transport" },
  Islay: { accepted: ["Islay Coaches"], preferred: "Islay Coaches" },
  // Narrowed 2026-11-05 (user request) — previously also accepted D&E and
  // Highland Council; Skye is now Rapsons-only.
  Skye: { accepted: ["Rapsons"], preferred: "Rapsons" },
  Caithness: { accepted: ["D&E", "Highland Council"], preferred: "D&E" },
  Ullapool: { accepted: ["Rapsons"], preferred: "Rapsons" },
};

export function liveryRestrictionForArea(depotGroupName: string): { accepted: string[]; preferred: string } | null {
  return RESTRICTED_AREA_LIVERIES[depotGroupName] ?? null;
}

// Long-distance operator liveries (the user's own instruction, 2026-10-18,
// corrected 2026-10-18 after a live report — "Megabus is available in
// Portree, that's the wrong way around"): Citylink and Ember are
// Scotland-only, exempt from every area lock within Scotland (including the
// island/remote depots above with their own lock list) but unavailable
// outside it; MegaBus is the England/Wales equivalent — exempt from any
// area lock there (none exist yet) but unavailable in Scotland. The first
// version wrongly exempted all of them from every lock everywhere, which is
// what let MegaBus show up at a Scottish depot (Portree/Skye) — the nation
// check below is what was missing. National Express was removed outright
// (the user's own instruction — "didn't realise National Express wasn't in,
// that can be removed") rather than built out further. All three are also
// locked to specific vehicles (see liveryVehicleLockReason below).
// "Can only run on long-distance services" is NOT enforced anywhere — no
// system assigns a vehicle to a specific route/service at purchase time yet
// (that's Phase 2 route-level work) — so this is a UI note only.
export const LONG_DISTANCE_LIVERY_NAMES = ["Citylink", "Ember", "MegaBus"];

export function isLongDistanceLiveryName(name: string): boolean {
  return LONG_DISTANCE_LIVERY_NAMES.includes(name);
}

export type Nation = "scotland" | "england-wales";

// The region field is free text per depot group (window.depotGroups.create
// (name, region)), but in practice follows the 5-region scheme (UK-
// EXPANSION.md): "North Scotland", "West Scotland", "East Scotland",
// "North England", "Shetland", and presumably more England/Wales regions
// as the game expands there. Matched by substring rather than an exact
// list, since this can't enumerate every future region name.
export function nationForRegion(region: string): Nation {
  return /england|wales/i.test(region) ? "england-wales" : "scotland";
}

// Returns why a long-distance livery can't be used from a depot group in
// this region, or null if it's allowed there. Only Citylink/Ember/MegaBus
// are nation-locked — every other livery goes through the area-lock table
// instead (liveryRestrictionForArea).
export function longDistanceNationLockReason(liveryName: string, depotGroupRegion: string): string | null {
  const nation = nationForRegion(depotGroupRegion);
  if ((liveryName === "Citylink" || liveryName === "Ember") && nation !== "scotland") {
    return `${liveryName} is a Scotland-only livery.`;
  }
  if (liveryName === "MegaBus" && nation !== "england-wales") {
    return "MegaBus is an England/Wales-only livery.";
  }
  return null;
}

// Returns why a livery can't be used on this vehicle model, or null if it's
// allowed. Checked separately from the area/nation locks above — a
// long-distance livery is exempt from the area lock but still
// vehicle-locked, so both checks have to pass.
export function liveryVehicleLockReason(liveryName: string, vehicle: { id: string; category: string }): string | null {
  if (liveryName === "Ember") {
    return vehicle.id === "yutong-coach" ? null : "Ember is locked to the Yutong coach only.";
  }
  if (liveryName === "Citylink" || liveryName === "MegaBus") {
    return vehicle.category === "Coaches" ? null : `${liveryName} is locked to coaches only.`;
  }
  return null;
}

// Combines every lock a livery can be subject to — vehicle type, nation
// (long-distance liveries only), and area (everything else) — into the one
// reason it can't be used right now, or null if it's allowed. `depotGroup`
// is undefined when no depot group exists/is selected yet, in which case
// only the vehicle lock applies.
export function liveryUnavailableReason(
  liveryName: string,
  vehicle: { id: string; category: string },
  depotGroup: { name: string; region: string } | undefined,
): string | null {
  const vehicleReason = liveryVehicleLockReason(liveryName, vehicle);
  if (vehicleReason) return vehicleReason;
  if (!depotGroup) return null;

  if (isLongDistanceLiveryName(liveryName)) {
    return longDistanceNationLockReason(liveryName, depotGroup.region);
  }

  const restriction = liveryRestrictionForArea(depotGroup.name);
  if (restriction && !restriction.accepted.includes(liveryName)) {
    return `${depotGroup.name} only accepts: ${restriction.accepted.join(", ")} (preferred: ${restriction.preferred})`;
  }
  return null;
}

// Idempotent, matched by name — same pattern as dealer-reference-pins.ts's
// own seedRealDealers(), safe to call on every launch.
export async function seedRealLiveries(): Promise<void> {
  const existing = await window.liveries.list();
  const existingNames = new Set(existing.map((l) => l.name));
  for (const [name, colours] of Object.entries(REAL_LIVERY_COLOURS)) {
    if (existingNames.has(name)) continue;
    await window.liveries.create(name, colours.primary, colours.secondary);
  }
}
