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

  // Re-added 2026-11-07 (user request, "we now have England and Wales
  // implemented") after being removed outright on 2026-10-18 — see the
  // long-distance block below for the lock reasoning. Same placeholder
  // pair it had the first time round, not re-sampled, since no real photo
  // exists any more now than it did then.
  "National Express": { primary: "#52525b", secondary: "#e4e4e7" },
  // Added alongside it, same request — a distinct livery, not a re-use of
  // National Express's own colours, so the two read as genuinely separate
  // on screen; still a flagged neutral placeholder, no reference photo
  // supplied.
  "National Express Local": { primary: "#57534e", secondary: "#f5f5f4" },

  // Added 2026-11-07 (user request) — a real dual-branded livery: West
  // Coast Motors runs a few vehicles double-branded for Citylink on their
  // Citylink services. No reference photo supplied, same flagged neutral
  // placeholder treatment as the others above.
  "Citylink/West Coast Motors": { primary: "#3f3f46", secondary: "#d4d4d8" },

  // Added 2026-11-07 (user request, T155 — the operator-group work) —
  // three more real/confirmed liveries, all flagged neutral placeholders,
  // no reference photos supplied for any of them.
  McGills: { primary: "#44403c", secondary: "#fafaf9" }, // real West-of-Scotland operator
  Railair: { primary: "#1e1b4b", secondary: "#c7d2fe" }, // UK-EXPANSION.md §9a's own station-to-airport product
  "First Electric": { primary: "#3730a3", secondary: "#e0e7ff" }, // electric-only variant, First Bus group
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

// --- Operator groups (T155, confirmed 2026-11-07 over an extended live
// discussion) — a general, player-editable replacement for the fixed
// RESTRICTED_AREA_LIVERIES table above (kept, separate, "AND"ed
// together, not replaced — confirmed directly). Hardcoded here, not
// player-created: the player only picks WHICH whole operators a depot
// group enables, and then narrows individual liveries per depot; the
// operators themselves (which liveries belong to which real company)
// are fixed, the same as every other hardcoded livery fact in this
// file. Every real livery belongs to exactly one operator, even a
// singleton of just itself — confirmed directly, not assumed, including
// for liveries that already have their own separate mechanism
// (sightseeing, the long-distance ones) — they're ALSO an operator, on
// top of whatever else already locks them, not exempt from this layer.
// The 4 training liveries are deliberately absent — see
// LIVERY_LINKED_TO below, they're never a direct operator member, their
// own availability is entirely derived from their trigger livery's.
export const OPERATOR_LIVERIES: Record<string, string[]> = {
  Lothian: ["Lothian", "Lothian Country", "East Coast Buses", "Airlink 100", "SkyLink", "Lothian Girraffe", "Lothian Coaches"],
  Stagecoach: ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric", "Stagecoach Jet", "Oxford Tube"],
  McGills: ["McGills", "Explore Dundee", "Midland Bluebird"],
  "First Bus": ["First Bus", "Express 500", "Express 100", "First Electric"],
  "Lochs Motor Transport": ["Lochs Motor Transport"],
  "Shiel Buses": ["Shiel Buses"],
  "West Coast Motors": ["West Coast Motors", "Borders Buses", "Citylink/West Coast Motors"],
  Citylink: ["Citylink", "Air"],
  Ember: ["Ember"],
  MegaBus: ["MegaBus"],
  "National Express": ["National Express", "National Express Local"],
  "Highland Council": ["D&E", "Highland Council"],
  "Shetland Transport": ["Shetland Transport"],
  "Orkney Council": ["Orkney Council"],
  SPT: ["SPT"],
  "Hebridean Transport": ["Hebridean Transport"],
  "North Uist Transport": ["North Uist Transport"],
  "Islay Coaches": ["Islay Coaches"],
  Rapsons: ["Rapsons"],
  ScotRail: ["ScotRail"],
  Railair: ["Railair"],
  // Always enabled everywhere, confirmed directly — not something a
  // depot group needs to turn on, same as its own existing hard vehicle
  // lock already makes it universally available in spirit.
  Sightseeing: ["Sightseeing"],
};

export function liveryOperator(liveryName: string): string | null {
  for (const [operator, liveries] of Object.entries(OPERATOR_LIVERIES)) {
    if (liveries.includes(liveryName)) return operator;
  }
  return null;
}

// Liveries that are never selected directly — they ride along silently
// whenever ANY of their own trigger liveries is actually available at a
// given DEPOT (not just the depot group), confirmed 2026-11-07: "they
// will be tied to specific liveries, so if the base livery is enabled
// in a depot the corresponding training livery is silently enabled
// too." Stagecoach Electric itself is also linked (to plain Stagecoach
// and Stagecoach Dark, not Jet) even though it's a real selectable
// operator-group member in its own right — both things are true at
// once, confirmed directly ("tied to... so if either are enabled...
// Electric is too").
export const LIVERY_LINKED_TO: Record<string, string[]> = {
  "First Training": ["First Bus"],
  "First Electric": ["First Bus"],
  "Stagecoach Electric": ["Stagecoach", "Stagecoach Dark"],
  "Stagecoach Training - Blue": ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric"],
  "Stagecoach Training - Teal": ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric"],
  "Stagecoach Training - Yellow": ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric"],
};

// Whether a DEPOT GROUP's own enabled-operators list (db.mts's
// getEnabledOperatorsForDepotGroup) permits this livery at all — the
// general, player-editable layer, checked independently of (and in
// addition to) every other lock in this file. `enabledOperators`
// undefined means the caller hasn't fetched it — not checked then, same
// "only restrict what can actually be checked" convention as
// `depotGroup` elsewhere. Sightseeing is always enabled everywhere,
// confirmed directly, so it's exempt from needing to appear in the list
// at all.
export function operatorNotEnabledReason(liveryName: string, enabledOperators: readonly string[] | undefined): string | null {
  if (enabledOperators === undefined) return null;
  if (isSightseeingLiveryName(liveryName)) return null;
  const operator = liveryOperator(liveryName);
  if (operator === null) return null;
  return enabledOperators.includes(operator) ? null : `${operator} isn't enabled for this depot group.`;
}

// Whether a specific DEPOT's own narrower selection (db.mts's
// getNarrowedLiveriesForDepot, already resolved from ids to names by
// the caller) permits this livery — the second, finer tier, only
// meaningful once the livery's whole operator is already enabled at
// the group level above. `narrowedLiveryNames` null or undefined both
// mean "not narrowed, inherits everything the group allows" (confirmed
// directly — a real depot starts unrestricted, not blocked). A livery
// linked to others (training liveries, Stagecoach Electric/First
// Electric) is NEVER checked by its own name here — it rides along
// with whichever of its own trigger liveries is itself available at
// this depot, recursively (confirmed directly, "silently enabled too").
export function depotNarrowingReason(liveryName: string, narrowedLiveryNames: readonly string[] | null | undefined): string | null {
  if (narrowedLiveryNames === undefined || narrowedLiveryNames === null) return null;
  const triggers = LIVERY_LINKED_TO[liveryName];
  if (triggers) {
    const anyTriggerAvailable = triggers.some((t) => depotNarrowingReason(t, narrowedLiveryNames) === null);
    return anyTriggerAvailable ? null : `${liveryName} needs one of its own trigger liveries enabled at this depot.`;
  }
  return narrowedLiveryNames.includes(liveryName) ? null : `${liveryName} isn't selected for this specific depot.`;
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
//
// National Express re-added 2026-11-07 (user request, "we now have England
// and Wales implemented... this can only be used on long distance
// routes") — the exact same nation/vehicle-lock shape as MegaBus below
// (England/Wales-only, coaches only), not a new mechanism.
//
// "Citylink/West Coast Motors" added 2026-11-07, same batch — West Coast
// Motors' real double-branded vehicles on Citylink services. Narrower
// than a nation lock: locked to Glasgow and Oban depots specifically (see
// LIVERY_DEPOT_GROUP_LOCKS below), not all of Scotland.
export const LONG_DISTANCE_LIVERY_NAMES = ["Citylink", "Ember", "MegaBus", "National Express", "Citylink/West Coast Motors"];

export function isLongDistanceLiveryName(name: string): boolean {
  return LONG_DISTANCE_LIVERY_NAMES.includes(name);
}

// The opposite restriction, added 2026-11-07 for the same request's second
// half ("National Express Local as another livery that can only be used
// on local routes"). Confirmed directly rather than assumed: nothing
// stops a LOCAL livery being used on a long-distance route today either,
// for the exact same reason the long-distance note above isn't enforced
// — no system assigns a vehicle to a specific route at purchase time. So
// this is a UI note only at Configure time, same honesty pattern as
// above. It IS checked in `pickLiveryForJourney` (livery-map-badges.ts)
// though, unlike the Configure-time note — that function already knows
// the real route's own `routeType` when picking a plausible random
// livery for a journey, so the exclusion is genuinely enforceable there,
// not just a note. No nation or vehicle-type lock — unlike National
// Express itself, this wasn't asked for, and no other local livery is
// nation/vehicle-locked either.
export const LOCAL_ONLY_LIVERY_NAMES = ["National Express Local"];

export function isLocalOnlyLiveryName(name: string): boolean {
  return LOCAL_ONLY_LIVERY_NAMES.includes(name);
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
// this region, or null if it's allowed there. Only Citylink/Ember/MegaBus/
// National Express are nation-locked — every other livery goes through the
// area-lock table instead (liveryRestrictionForArea).
export function longDistanceNationLockReason(liveryName: string, depotGroupRegion: string): string | null {
  const nation = nationForRegion(depotGroupRegion);
  if ((liveryName === "Citylink" || liveryName === "Ember") && nation !== "scotland") {
    return `${liveryName} is a Scotland-only livery.`;
  }
  if ((liveryName === "MegaBus" || liveryName === "National Express") && nation !== "england-wales") {
    return `${liveryName} is an England/Wales-only livery.`;
  }
  return null;
}

// A long-distance livery locked to specific NAMED depot groups rather
// than a whole nation — narrower than longDistanceNationLockReason above,
// added 2026-11-07 for "Citylink/West Coast Motors," which West Coast
// Motors only double-brands on vehicles based at Glasgow and Oban. Keyed
// by depot group NAME, same matching convention as RESTRICTED_AREA_
// LIVERIES above (the real save's own depot group names, not the broader
// `region` field).
export const LIVERY_DEPOT_GROUP_LOCKS: Record<string, string[]> = {
  "Citylink/West Coast Motors": ["Glasgow", "Oban"],
};

// Combines the nation lock and the (rarer, narrower) specific-depot-group
// lock into the one reason a long-distance livery can't be used from this
// depot group, or null if it's allowed. A livery with its own entry in
// LIVERY_DEPOT_GROUP_LOCKS is checked against that allowlist only — it's
// strictly narrower than a nation, so the broader nation check would never
// add anything once the depot-group check already passed/failed. Every
// other long-distance livery falls through to the plain nation check,
// unchanged.
export function longDistanceLocationLockReason(liveryName: string, depotGroup: { name: string; region: string }): string | null {
  const depotLock = LIVERY_DEPOT_GROUP_LOCKS[liveryName];
  if (depotLock) {
    return depotLock.includes(depotGroup.name) ? null : `${liveryName} is only used from: ${depotLock.join(", ")}.`;
  }
  return longDistanceNationLockReason(liveryName, depotGroup.region);
}

// Sightseeing vehicles and the Sightseeing livery are mutually exclusive,
// confirmed 2026-11-07: "Sightseeing buses can only have the Sightseeing
// livery and any of it's variants if any get added. Sightseeing livery
// can only be used on sightseeing buses." Matched by name prefix, not an
// exact-name list, so a future variant ("Sightseeing Gold" or similar)
// doesn't need this function touched again.
const SIGHTSEEING_VEHICLE_CATEGORY = "Specialised (sightseeing, open-top only)";

export function isSightseeingLiveryName(name: string): boolean {
  return name === "Sightseeing" || name.startsWith("Sightseeing ");
}

// General route-type lock (DESIGN.md/OPEN-ITEMS T152), confirmed per
// vehicle and per livery 2026-11-07 through direct multiple-choice
// questions — "adding a lock to stop the wrong livery being used on the
// wrong routes, also to stop long distance liverys being added to the
// wrong vehicles." Three categories (a 4th, "Sightseeing," is deliberately
// NOT part of this — it's its own separate, closed, hard lock above,
// since the vehicle/livery pairing there is 1:1 and exhaustive already).
export type RouteTypeCategory = "long_distance" | "airport" | "local_night";

// Which route types each vehicle MODEL is suited for. The 2 sightseeing
// open-top models are deliberately absent — SIGHTSEEING_VEHICLE_CATEGORY
// above already fully governs them.
export const VEHICLE_ROUTE_TYPES: Record<string, RouteTypeCategory[]> = {
  "adl-enviro400": ["local_night", "airport"],
  "adl-enviro400-xlb": ["local_night", "airport"],
  "wrightbus-streetdeck": ["local_night", "airport"],
  "adl-enviro200": ["local_night"],
  "volvo-7900": ["local_night", "airport"],
  "mcv-evora": ["local_night"],
  "wrightbus-gb-kite": ["local_night"],
  "yutong-e10-e12": ["local_night", "airport"],
  "evm-cityline": ["local_night"],
  "volvo-9700": ["airport", "long_distance"],
  "volvo-9700dd": ["airport", "long_distance"],
  "yutong-coach": ["long_distance", "airport"], // covers both real T12E/T15E lengths, one catalogue entry
};

// Which route types each GENERAL livery is valid for — excludes every
// livery with its own separate, more specific mechanism instead: the 2
// sightseeing liveries (isSightseeingLiveryName), the 4 training-only
// liveries and Lothian Coaches' private-hire-only case (none listed here
// at all — "not part of this general system" is the correct reading of a
// missing entry, not "allowed everywhere"), and the 8 liveries locked to
// one specific named route (LIVERY_SPECIFIC_ROUTE below, checked instead
// of a general category).
export const LIVERY_ROUTE_TYPES: Record<string, RouteTypeCategory[]> = {
  Lothian: ["local_night"],
  Stagecoach: ["local_night"],
  "Borders Buses": ["local_night"],
  "D&E": ["local_night"],
  "East Coast Buses": ["local_night"],
  "Explore Dundee": ["local_night"],
  "First Bus": ["local_night"],
  "Hebridean Transport": ["local_night"],
  "Islay Coaches": ["local_night"],
  "Lochs Motor Transport": ["local_night"],
  "Lothian Country": ["local_night"],
  "Midland Bluebird": ["local_night"],
  "North Uist Transport": ["local_night"],
  "Orkney Council": ["local_night"],
  Rapsons: ["local_night"],
  "Shetland Transport": ["local_night"],
  "Shiel Buses": ["local_night"],
  SPT: ["local_night"],
  "Stagecoach Dark": ["local_night"],
  "Stagecoach Electric": ["local_night"],
  "Stagecoach Jet": ["airport"],
  "West Coast Motors": ["local_night"],
  "Highland Council": ["local_night"],
  Citylink: ["long_distance"],
  Ember: ["long_distance"],
  MegaBus: ["long_distance"],
  "National Express": ["long_distance"],
  "National Express Local": ["local_night"],
  "Citylink/West Coast Motors": ["long_distance"],
};

// Liveries locked to one specific named route rather than a general
// category, confirmed 2026-11-07 — matched against a real route's own
// `number`. Four of these (Air, Express 100, SkyLink, Oxford Tube) are
// the player's own words — "it will be [the contract] once added" /
// "doesn't exist in the game yet" — so there's genuinely nothing to match
// yet; left in so the lock activates the moment such a route exists,
// rather than needing this file touched again.
export const LIVERY_SPECIFIC_ROUTE: Record<string, string> = {
  "Airlink 100": "Airlink 100",
  "Lothian Girraffe": "Airlink 100",
  "Express 500": "500",
  ScotRail: "398",
  Air: "Air",
  "Express 100": "Express 100",
  SkyLink: "SkyLink",
  "Oxford Tube": "Oxford Tube",
};

export function liveryRouteTypeReason(liveryName: string, routeType: RouteTypeCategory): string | null {
  const allowed = LIVERY_ROUTE_TYPES[liveryName];
  if (!allowed) return null; // not part of this general system — handled elsewhere, or genuinely unrestricted
  return allowed.includes(routeType) ? null : `${liveryName} isn't used on ${routeType.replace("_", "/")} routes.`;
}

export function liverySpecificRouteReason(liveryName: string, route: { number: string }): string | null {
  const requiredRoute = LIVERY_SPECIFIC_ROUTE[liveryName];
  if (!requiredRoute) return null;
  return route.number === requiredRoute ? null : `${liveryName} is locked to route ${requiredRoute}.`;
}

function vehicleRouteTypeReason(liveryName: string, vehicleId: string): string | null {
  const liveryTypes = LIVERY_ROUTE_TYPES[liveryName];
  if (!liveryTypes) return null;
  const vehicleTypes = VEHICLE_ROUTE_TYPES[vehicleId];
  if (!vehicleTypes) return null; // a vehicle model not in this map (the 2 sightseeing ones) has its own hard lock already
  return liveryTypes.some((t) => vehicleTypes.includes(t))
    ? null
    : `${liveryName} (${liveryTypes.join("/")}) doesn't match this vehicle's own route types (${vehicleTypes.join("/")}).`;
}

// Route 398's own real vehicle requirement, DESIGN.md: "Must be ScotRail
// liveried, electric, single deck." Confirmed 2026-11-07: ScotRail's own
// livery should be locked to the exact same vehicles — category plus the
// actually CONFIGURED power type, not just a model capable of electric
// (the player's own choice over the category-only alternative), so this
// needs the real selected power threaded in, unlike every other vehicle
// lock above which only ever needed id/category.
const SINGLE_DECK_CATEGORY = "Single-deckers / midibuses";

function scotRailVehicleReason(vehicle: { category: string }, powerType: string | undefined): string | null {
  if (vehicle.category !== SINGLE_DECK_CATEGORY) return "ScotRail (Route 398) is locked to single-deckers/midibuses only.";
  if (powerType !== undefined && powerType !== "electric") return "ScotRail (Route 398) is locked to electric vehicles only.";
  return null;
}

// Returns why a livery can't be used on this vehicle model, or null if it's
// allowed. Checked separately from the area/nation locks above — a
// long-distance livery is exempt from the area lock but still
// vehicle-locked, so both checks have to pass. `powerType` is optional —
// omitted, only the category half of the ScotRail check applies (the
// caller hasn't settled on a power choice yet); every other livery here
// ignores it entirely.
export function liveryVehicleLockReason(liveryName: string, vehicle: { id: string; category: string }, powerType?: string): string | null {
  if (isSightseeingLiveryName(liveryName)) {
    return vehicle.category === SIGHTSEEING_VEHICLE_CATEGORY ? null : "Sightseeing liveries are locked to sightseeing/open-top vehicles only.";
  }
  if (vehicle.category === SIGHTSEEING_VEHICLE_CATEGORY) {
    return "A sightseeing vehicle can only carry a Sightseeing livery.";
  }
  if (liveryName === "Ember") {
    return vehicle.id === "yutong-coach" ? null : "Ember is locked to the Yutong coach only.";
  }
  if (liveryName === "Citylink" || liveryName === "MegaBus" || liveryName === "National Express" || liveryName === "Citylink/West Coast Motors") {
    return vehicle.category === "Coaches" ? null : `${liveryName} is locked to coaches only.`;
  }
  if (liveryName === "ScotRail") {
    return scotRailVehicleReason(vehicle, powerType);
  }
  // Stagecoach Electric / First Electric (T155, confirmed 2026-11-07) —
  // electric vehicles only, same "real configured power, not just a
  // model capable of it" pattern as ScotRail above, and the same
  // optional-powerType convention (omitted means only unconfigured-power
  // callers are left unblocked, not that electric is assumed).
  if ((liveryName === "Stagecoach Electric" || liveryName === "First Electric") && powerType !== undefined && powerType !== "electric") {
    return `${liveryName} is locked to electric vehicles only.`;
  }
  const routeTypeReason = vehicleRouteTypeReason(liveryName, vehicle.id);
  if (routeTypeReason) return routeTypeReason;
  return null;
}

// Combines every lock a livery can be subject to — vehicle type, nation
// (long-distance liveries only), area (everything else), and a fixed
// vehicle-count cap (Lothian Girraffe only, see liveryCapReason) — into
// the one reason it can't be used right now, or null if it's allowed.
// `depotGroup` is undefined when no depot group exists/is selected yet, in
// which case only the vehicle lock applies. `currentVehicleCount` is
// undefined when the caller hasn't fetched the real save's own vehicle
// list — the cap simply isn't checked then, same "only restrict what can
// actually be checked" principle as the depotGroup-undefined case.
// `route` is the real route the vehicle is being bought for (T153,
// confirmed 2026-11-07, Configure's own "buying for a specific route"
// tickbox) — a specific-route-locked livery (ScotRail etc.) is only ever
// available at all when `route` is given AND matches: "its mostly for
// purchasing for the 398 for example and the only way for that livery
// to appear," the player's own words. Every other livery is unaffected
// by `route` being present or absent. `enabledOperators`/
// `narrowedLiveryNames` are T155's two-tier operator-group system —
// both undefined when the caller hasn't fetched them, same "only
// restrict what can actually be checked" convention as everything else
// here.
export function liveryUnavailableReason(
  liveryName: string,
  vehicle: { id: string; category: string },
  depotGroup: { name: string; region: string } | undefined,
  currentVehicleCount?: number,
  powerType?: string,
  route?: { number: string },
  enabledOperators?: readonly string[],
  narrowedLiveryNames?: readonly string[] | null,
): string | null {
  const vehicleReason = liveryVehicleLockReason(liveryName, vehicle, powerType);
  if (vehicleReason) return vehicleReason;
  if (currentVehicleCount !== undefined) {
    const capReason = liveryCapReason(liveryName, currentVehicleCount);
    if (capReason) return capReason;
  }
  const requiredRoute = LIVERY_SPECIFIC_ROUTE[liveryName];
  if (requiredRoute !== undefined && (!route || route.number !== requiredRoute)) {
    return `${liveryName} is only available when buying for route ${requiredRoute}.`;
  }
  const operatorReason = operatorNotEnabledReason(liveryName, enabledOperators);
  if (operatorReason) return operatorReason;
  const narrowReason = depotNarrowingReason(liveryName, narrowedLiveryNames);
  if (narrowReason) return narrowReason;
  if (!depotGroup) return null;

  if (isLongDistanceLiveryName(liveryName)) {
    return longDistanceLocationLockReason(liveryName, depotGroup);
  }
  // Sightseeing is also exempt from area locks, same reasoning as long-
  // distance liveries above — it's the ONLY livery a sightseeing vehicle
  // can carry (liveryVehicleLockReason), so a remote depot's own small
  // accepted-list (Skye's Rapsons-only, say) must never block it; the
  // vehicle lock already does all the real restricting here.
  if (isSightseeingLiveryName(liveryName)) return null;

  const restriction = liveryRestrictionForArea(depotGroup.name);
  if (restriction && !restriction.accepted.includes(liveryName)) {
    return `${depotGroup.name} only accepts: ${restriction.accepted.join(", ")} (preferred: ${restriction.preferred})`;
  }
  return null;
}

// Maps a real route's own routeType onto the 3-category system
// VEHICLE_ROUTE_TYPES/LIVERY_ROUTE_TYPES use — null for "sightseeing"
// since that's handled entirely separately (isSightseeingLiveryName).
export function routeTypeCategoryFor(routeType: RouteType): RouteTypeCategory | null {
  if (routeType === "ordinary" || routeType === "night") return "local_night";
  if (routeType === "airport_express") return "airport";
  if (routeType === "long_distance") return "long_distance";
  return null;
}

// Whether a livery is eligible for a ROUTE in general — no specific
// vehicle in mind, unlike liveryVehicleLockReason/liveryUnavailableReason
// above. Shared by `pickLiveryForJourney` (livery-map-badges.ts, the
// map's own random per-journey picker) and route branding (T153,
// confirmed 2026-11-07: "in player made routes... an option in the
// route to set a certain livery" — the player's own choice there is
// still subject to "locks still apply," the same rules as everywhere
// else, not a free, unrestricted pick). Extracted here once rather than
// duplicated in both places (CLAUDE.md: "build it once").
export function liveryEligibleForRoute(
  liveryName: string,
  route: { routeType: RouteType; number: string },
  depotGroup: { name: string; region: string } | undefined,
): boolean {
  // A link-only livery (the 4 training ones — no operator entry of its
  // own, see OPERATOR_LIVERIES/LIVERY_LINKED_TO) is never directly
  // selectable here — it only ever rides along with its own trigger
  // livery (depotNarrowingReason). Live bug report (2026-11-07):
  // without this guard, First Training had no route-type/area
  // restriction of its own to fail, so it silently leaked through as
  // "eligible" for an ordinary route's branding picker.
  if (liveryOperator(liveryName) === null) return false;
  if (isLongDistanceLiveryName(liveryName)) {
    if (route.routeType !== "long_distance") return false;
    if (depotGroup && longDistanceLocationLockReason(liveryName, depotGroup)) return false;
    return true;
  }
  if (isLocalOnlyLiveryName(liveryName) && route.routeType === "long_distance") return false;
  if (isSightseeingLiveryName(liveryName)) return route.routeType === "sightseeing";
  if (route.routeType === "sightseeing") return false;
  if (liverySpecificRouteReason(liveryName, route)) return false;
  const category = routeTypeCategoryFor(route.routeType);
  if (category && liveryRouteTypeReason(liveryName, category)) return false;
  if (depotGroup) {
    const restriction = liveryRestrictionForArea(depotGroup.name);
    if (restriction && !restriction.accepted.includes(liveryName)) return false;
  }
  return true;
}

// A livery capped at a fixed number of vehicles ever, company-wide —
// confirmed 2026-11-07: "Lothian Girraffe, only 1 vehicle can have this
// livery after that it is hidden from the menu" (it's also locked to the
// Airlink 100 route specifically, same as the regular Airlink 100 livery
// — not enforced anywhere yet, same honesty pattern as every other
// route-specific lock, since no vehicle is assigned to a specific route
// at purchase time). Genuinely different in kind from every lock above —
// it depends on how many vehicles already exist with this livery in the
// real save, not just static vehicle/depot metadata, so it's checked
// separately via the optional parameter on liveryUnavailableReason below
// rather than folded into liveryVehicleLockReason.
export const LIVERY_MAX_VEHICLE_COUNT: Record<string, number> = {
  "Lothian Girraffe": 1,
};

export function liveryCapReason(liveryName: string, currentVehicleCount: number): string | null {
  const max = LIVERY_MAX_VEHICLE_COUNT[liveryName];
  if (max === undefined) return null;
  return currentVehicleCount >= max ? `Only ${max} vehicle${max === 1 ? "" : "s"} can ever carry ${liveryName}.` : null;
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
