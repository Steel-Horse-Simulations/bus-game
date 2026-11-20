import { isPointInScotland } from "./scotland-boundary.mts";
import { isPointInWales } from "./wales-boundary.mts";
import { DOUNREAY_800_803_805_ROUTE_NUMBERS } from "./fixed-contract-eligibility.mts";

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
  "Explore Dundee": { primary: "#006040", secondary: "#50d020" },
  "Express 500": { primary: "#701070", secondary: "#a050b0" },
  "First Bus": { primary: "#301080", secondary: "#d0e0e0" },
  "First Training": { primary: "#ffd000", secondary: "#005030" },
  "Hebridean Transport": { primary: "#800020", secondary: "#f0f0d0" },
  "Islay Coaches": { primary: "#ffffff", secondary: "#007030" },
  "Lochs Motor Transport": { primary: "#f0f0f0", secondary: "#30b0e0" },
  // Re-added (T183, 2026-11-13) after T158's uncommitted removal — private
  // hire revival, see lothianCoachesCapReason below. Same colour pair it
  // had before (never actually committed removed, just staged).
  "Lothian Coaches": { primary: "#203030", secondary: "#ffb000" },
  "Lothian Country": { primary: "#fff0f0", secondary: "#005030" },
  "Lothian Girraffe": { primary: "#a06030", secondary: "#f0e0c0" },
  MegaBus: { primary: "#104090", secondary: "#ffd020" },
  "Midland Bluebird": { primary: "#0070c0", secondary: "#fff0e0" },
  // TaithCymru added 2026-11-19 — the real Welsh long-distance coach
  // operator (swapped in for MegaBus's old Wales role, see
  // LONG_DISTANCE_LIVERY_NAMES's own comment below). Colour pair is this
  // model's own read of the real vehicle photo the user supplied (black
  // body, bright green ring-and-bars "T" logo, white "TaithCymru"
  // wordmark) — not sampled by the usual from-scratch PNG decoder this
  // file's header note describes (no standalone badge PNG was supplied),
  // so flagged as a rougher estimate than this file's other auto-sampled
  // entries, same as every other un-confirmed colour here: fine to
  // correct by hand later via the Liveries panel if it looks wrong.
  TaithCymru: { primary: "#111111", secondary: "#00a551" },
  // TrawsCymru added 2026-11-19 — the real LOCAL Welsh bus operator
  // (Transport for Wales's own regional network, distinct from
  // TaithCymru's long-distance coach role above). No standalone badge PNG
  // found to sample from — real-world sources describe the branding as
  // built on a "green, white and red" palette (traditional TrawsCymru
  // colours, one forum report of a recent smart-new-look update), not one
  // single confirmed hex pair, so this is this model's own reasonable
  // green/white read of that description rather than a precise sample —
  // flagged the same as every other uncertain colour in this file.
  TrawsCymru: { primary: "#00693e", secondary: "#ffffff" },
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

  // Added 2026-11-05 (user request) — no real badge photo supplied yet
  // either, same treatment as the other flagged placeholders in this file:
  // placeholder pair, not a guess at the real Oxford Tube livery, so
  // nothing here implies a colour that hasn't actually been confirmed.
  // Replace with real sampled colours once a reference photo is supplied.
  // Not a Fixed real contract (2026-11-19 — "Oxford Tube isn't being
  // dropped from the game only as a contract"): the livery itself stays,
  // it's just excluded from the contract-failure mechanic (fines/60%
  // suspension/Thistle Coaches/1-year return) other named routes get.
  // Real-world requirement, not yet enforceable in code (2026-11-19):
  // "can only be used on long distance routes that stop at Oxford
  // Gloucester Green Bus Station and Victoria Green Line Coach Station" —
  // vehicle (Volvo 9700DD only, liveryVehicleLockReason) and route-type
  // (long_distance, LIVERY_ROUTE_TYPES) locks are built; the two-named-
  // stops requirement is NOT, since the real Oxford Tube route doesn't
  // exist in any save yet (same placeholder status as Air/SkyLink — see
  // LIVERY_SPECIFIC_ROUTE's own comment) and this project's own route-
  // point model already carries real stop osmIds once a route is drawn
  // (route-advertising.mts's `longDistanceRoutesAtStop`, matching
  // `p.kind === "stop" && p.osmId === stopOsmId`) — same build approach
  // as 398 (DESIGN.md: built once in the real editor against real stop
  // codes, then bundled as fixed content), not guessable ahead of it.
  "Oxford Tube": { primary: "#4b5563", secondary: "#e5e7eb" },

  // Re-added 2026-11-07 (user request, "we now have England and Wales
  // implemented") after being removed outright on 2026-10-18 — see the
  // long-distance block below for the lock reasoning. Same placeholder
  // pair it had the first time round, not re-sampled, since no real photo
  // exists any more now than it did then.
  "National Express": { primary: "#52525b", secondary: "#e4e4e7" },
  // Added alongside it, same request — a distinct livery, not a re-use of
  // National Express's own colours, so the two read as genuinely separate
  // on screen. Recoloured T190 (2026-11-14, user-supplied real figures,
  // replacing the earlier flagged neutral placeholder pair).
  "National Express Local": { primary: "#495D70", secondary: "#64E0F7" },
  // National Express Local Electric added 2026-11-20 — user's own words:
  // "a second livery that applies to electric buses only using the same
  // base livery so the current mask still works." Same real colour pair
  // as plain National Express Local, deliberately not a new invented
  // one — it's the same base artwork/mask, just electric-only and
  // auto-applied on repower (see ELECTRIC_LIVERY_VARIANT below).
  "National Express Local Electric": { primary: "#495D70", secondary: "#64E0F7" },

  // Added T190 (2026-11-14) — same primary as plain National Express
  // (confirmed: it's the same operator's vehicles, just restricted to
  // Scotland-bound work), real user-supplied secondary. See the
  // long-distance block below and `liveryEligibleForRoute`/
  // `liveryUnavailableReason`'s route-points check for the Scotland-
  // terminus restriction itself.
  "National Express Scottish": { primary: "#52525b", secondary: "#005EB5" },

  // Added 2026-11-15, user's own instruction: "National Express Welsh...
  // should follow all the same rules as the Scottish livery except
  // Wales instead of Scotland." Unlike every other National Express
  // entry above, these are NOT a placeholder pair — the user supplied
  // real badge artwork (`assets/liveries/National Express Welsh.png`)
  // and both figures were sampled directly from its real pixel data (a
  // proper PNG-filter-reversing decode, not a guess): the body is a
  // consistent off-white `#f1f0f0` (23,486 of 28,488 opaque pixels, zero
  // exact pure-white matches, so a deliberate off-white, not
  // compression noise) and the dragon/accent colour is an exact,
  // crisp `#c8102e` (2,669 pixels) — which also happens to be the real
  // official Welsh flag/dragon red, lending further confidence this was
  // drawn deliberately rather than resampled from a lossy source.
  "National Express Welsh": { primary: "#f1f0f0", secondary: "#c8102e" },

  // Added 2026-11-07 (user request) — a real dual-branded livery: West
  // Coast Motors runs a few vehicles double-branded for Citylink on their
  // Citylink services. No reference photo supplied, same flagged neutral
  // placeholder treatment as the others above.
  "Citylink/West Coast Motors": { primary: "#3f3f46", secondary: "#d4d4d8" },

  // Added 2026-11-07 (user request, T155 — the operator-group work).
  // Railair is still a flagged neutral placeholder, no reference photo
  // supplied. McGills and First Electric (also added this batch) were
  // removed outright T190 (2026-11-14) — zero owned vehicles referenced
  // either in the real save before deletion; their operator
  // groups/siblings stay (see OPERATOR_LIVERIES below).
  Railair: { primary: "#1e1b4b", secondary: "#c7d2fe" }, // UK-EXPANSION.md §9a's own station-to-airport product

  // Added 2026-11-15 (user request) — real badge PNGs supplied
  // (`assets/liveries/Irish Citylink.png`/`Translink.png`), colours
  // auto-sampled directly from them (the two most common, sufficiently-
  // distinct opaque pixel colours — same methodology as the header note
  // above, confirmed real, not invented). See the Ireland-nation-lock
  // block below for both liveries' real constraints.
  "Irish Citylink": { primary: "#fce908", secondary: "#1eadfb" },
  Translink: { primary: "#eb167e", secondary: "#ffffff" },

  // Thistle Coaches added 2026-11-19 — the game's single competitor
  // entity (OPEN-ITEMS.md "The competitor," fully settled 2026-11-19),
  // built for real for the first time here as part of the Fixed real
  // contracts failure mechanic (fixed-contract-failures.mts): never
  // player-selectable (see LIVERY_SPECIFIC_ROUTE below — locked to a
  // route number no player route can ever actually have), only ever
  // system-assigned to a suspended fixed-contract service while Thistle
  // Coaches is covering it. The user's own settled wording: "plain white
  // livery with a thistle at the rear as a livery, simple but better than
  // just white." No real per-livery badge artwork exists anywhere in this
  // game yet (OPERATIONS.md §4's badge PNGs are specified but never wired
  // up for ANY livery) and none is invented here — white primary is the
  // real, confirmed colour; the secondary is this model's own flagged
  // estimate of a heraldic "thistle purple" (there is no single
  // universally-cited hex for this), not a sourced figure, same
  // "flagged estimate" treatment this file already gives TaithCymru/
  // TrawsCymru above. Correct by hand later via the Liveries panel if it
  // looks wrong, or once real reference artwork is supplied.
  "Thistle Coaches": { primary: "#ffffff", secondary: "#6b3fa0" },
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
  // Highland Council (the livery) dropped T190 (2026-11-14) — the
  // "Highland Council" operator GROUP (covering D&E) stays, see
  // OPERATOR_LIVERIES below, but it no longer offers its own plain
  // livery choice, so Caithness's own accepted list narrows to D&E only.
  Caithness: { accepted: ["D&E"], preferred: "D&E" },
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
  // McGills (the livery) dropped T190 (2026-11-14) — operator group key
  // stays (McGills is a real operator), just no longer offers its own
  // plain livery choice.
  McGills: ["Explore Dundee", "Midland Bluebird"],
  // First Electric dropped T190 (2026-11-14) — zero owned vehicles
  // referenced it in the real save before deletion.
  "First Bus": ["First Bus", "Express 500"],
  "Lochs Motor Transport": ["Lochs Motor Transport"],
  "Shiel Buses": ["Shiel Buses"],
  "West Coast Motors": ["West Coast Motors", "Borders Buses", "Citylink/West Coast Motors"],
  Citylink: ["Citylink", "Air"],
  MegaBus: ["MegaBus"],
  // Added 2026-11-19 — standalone operator, same shape as Citylink/MegaBus
  // above (not a National Express sub-brand — TaithCymru is a genuinely
  // separate real Welsh coach operator).
  TaithCymru: ["TaithCymru"],
  // Added 2026-11-19 — the real LOCAL Welsh operator, standalone, same
  // shape as every other entry here.
  TrawsCymru: ["TrawsCymru"],
  // National Express Scottish added T190 (2026-11-14) — sits alongside
  // its two siblings under the same operator group.
  // National Express Welsh added 2026-11-15 — sits alongside its three
  // siblings under the same operator group, exact mirror of National
  // Express Scottish per the user's own instruction.
  "National Express": ["National Express", "National Express Local", "National Express Local Electric", "National Express Scottish", "National Express Welsh"],
  // Highland Council (the livery) dropped T190 (2026-11-14) — group key
  // stays (covers D&E), no longer offers its own plain livery choice.
  "Highland Council": ["D&E"],
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
  // Added 2026-11-15 — each a standalone operator in its own right, same
  // shape as Citylink/MegaBus above (not grouped under an existing
  // operator; neither is a variant of anything already in this file).
  "Irish Citylink": ["Irish Citylink"],
  Translink: ["Translink"],
  // Thistle Coaches added 2026-11-19 — a standalone operator, same shape
  // as Citylink/MegaBus above, for consistency with this file's own
  // established "every real livery belongs to exactly one operator, even
  // a singleton of just itself" rule. Membership here doesn't actually
  // make it selectable anywhere, though — see LIVERY_SPECIFIC_ROUTE
  // below, which blocks it regardless of operator-enabled status.
  "Thistle Coaches": ["Thistle Coaches"],
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
  // First Electric dropped T190 (2026-11-14) — removed from this map too,
  // since a link-target that no longer exists would silently never
  // trigger anyway, but there's no reason to leave a dangling entry.
  "Stagecoach Electric": ["Stagecoach", "Stagecoach Dark"],
  "Stagecoach Training - Blue": ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric"],
  "Stagecoach Training - Teal": ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric"],
  "Stagecoach Training - Yellow": ["Stagecoach", "Stagecoach Dark", "Stagecoach Electric"],
  // National Express Local Electric added 2026-11-20 — same dual shape as
  // Stagecoach Electric above (a real standalone operator-group member,
  // see OPERATOR_LIVERIES, AND tied here so it's available wherever its
  // base livery is, without needing separate depot-level enabling).
  "National Express Local Electric": ["National Express Local"],
};

// Which liveries auto-switch to (or back from) an electric-only variant
// the moment a vehicle is repowered — added 2026-11-20, user's own words:
// "I would like this livery to automatically apply if a vehicle gets
// repowered." Confirmed directly to apply to EVERY electric-only variant
// EXCEPT Stagecoach Electric, which the user deliberately wants to stay a
// manual pick: "that's a special livery only for a few selected buses."
// So this is a genuinely new, separate mechanism from LIVERY_LINKED_TO
// above (which only ever affects what's *available to pick*, never
// reassigns an existing vehicle's own livery) — keyed by base livery name,
// read by `electron/db.mts`'s `collectRepowerBooking` to find a currently-
// assigned livery's real electric counterpart (and, in reverse, to switch
// back to the base livery if a vehicle is repowered AWAY from electric).
// Only one real entry exists so far; built as a lookup table rather than
// a single hardcoded pair so a future electric-only variant just needs
// adding here, no other code touched.
export const ELECTRIC_LIVERY_VARIANT: Record<string, string> = {
  "National Express Local": "National Express Local Electric",
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
// Portree, that's the wrong way around"): Citylink is Scotland-only,
// exempt from every area lock within Scotland (including the
// island/remote depots above with their own lock list) but unavailable
// outside it; MegaBus is the England/Wales equivalent — exempt from any
// area lock there (none exist yet) but unavailable in Scotland. The first
// version wrongly exempted all of them from every lock everywhere, which is
// what let MegaBus show up at a Scottish depot (Portree/Skye) — the nation
// check below is what was missing. National Express was removed outright
// (the user's own instruction — "didn't realise National Express wasn't in,
// that can be removed") rather than built out further. Both are also
// locked to specific vehicles (see liveryVehicleLockReason below).
//
// Ember (the Scotland-only member of this group originally) was fully
// removed from the game (T188, 2026-11-14) — its only ever-eligible
// vehicle, the Yutong coach, was itself removed outright in T181, and the
// livery had already been soft-removed (filtered, not deleted) since T179.
// Confirmed zero owned vehicles referenced it in the real save before
// deletion.
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
//
// "National Express Scottish" added T190 (2026-11-14) — a third National
// Express livery. Deliberately given NO special-cased branch in
// `longDistanceNationLockReason` below (its literal-name checks only
// match "Citylink"/"MegaBus"/"National Express" exactly, so a livery
// named anything else — this one included — simply falls through to
// that function's final `return null`, i.e. NO depot-region nation lock
// at all, unlike plain National Express's own England/Wales-only lock).
// Confirmed correct, not an oversight: the user's own rule is "any
// National Express livery can run to Scotland but the Scottish one can
// only run to/from Scotland" — a restriction on route DESTINATION, not
// on where the vehicle is based. Locking it to England/Wales depots too
// would directly contradict "runs to/from Scotland." Its real
// restriction — at least one route terminus inside Scotland — is a
// separate, additive check in `liveryUnavailableReason`/
// `liveryEligibleForRoute` (`nationalExpressScottishTerminusReason`
// below) against the real Geofabrik Scotland boundary
// (scotland-boundary.mts), not a nation/depot-region rule at all.
// "Irish Citylink" added 2026-11-15 — user's own words: "usable only on
// coaches, only in Ireland, and only on long-distance services," the
// Republic of Ireland's own real long-distance coach brand (a separate
// operator from GB Citylink, not a variant of it). Its own nation lock
// is below in `longDistanceNationLockReason`; its coach-only vehicle
// lock is in `liveryVehicleLockReason`.
// "National Express Welsh" added 2026-11-15 — user's own instruction:
// "should follow all the same rules as the Scottish livery except Wales
// instead of Scotland." Exact mirror of National Express Scottish's own
// shape, deliberately given NO special-cased branch in
// `longDistanceNationLockReason` below for the same reason Scottish
// isn't: its restriction is on route TERMINUS (can run to/from Wales),
// not depot location — a depot-nation lock would contradict that, same
// reasoning as Scottish's own comment above.
// "TaithCymru" added 2026-11-19 — the user's own instruction: "swap
// Megabus for TaithCymru in Wales as that's the actual operator in
// Wales, Megabus will still be kept with no restrictions on use apart
// from coaches and long distance routes." TaithCymru is a genuinely
// separate real operator (not a National Express sub-brand), so it's a
// standalone entry in OPERATOR_LIVERIES above rather than sitting
// alongside National Express Welsh — but its own NATION restriction is
// a real route-geometry check (`taithCymruWalesFractionReason` below,
// updated 2026-11-19 to a stricter 85%-of-route-length rule), not a
// depot-region lock,
// since `longDistanceNationLockReason`'s region type only has a single
// combined "england-wales" bucket and can't tell Wales apart from
// England on its own — a depot-region lock here would wrongly also
// allow it from English depots. Deliberately given NO special-cased
// branch in `longDistanceNationLockReason` below for that reason.
// MegaBus's own former England/Wales nation lock is REMOVED as part of
// this same change (see `longDistanceNationLockReason` below) — the
// user's own words, "no restrictions on use apart from coaches and long
// distance routes," i.e. MegaBus keeps its existing coach-only vehicle
// lock and its long-distance-only route-type note, but no nation/area
// lock at all any more.
export const LONG_DISTANCE_LIVERY_NAMES = ["Citylink", "MegaBus", "National Express", "National Express Scottish", "National Express Welsh", "TaithCymru", "Citylink/West Coast Motors", "Irish Citylink"];

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

// "ireland" added 2026-11-15 for Irish Citylink/Translink — UK-
// EXPANSION.md §1 confirms the real road map data already covers the
// whole island (Republic and Northern Ireland both, deliberately left
// unclipped), but no depot group has ever been created there yet in any
// real save, and UK-EXPANSION.md's own documented 5-region scheme (North
// Scotland, West Scotland, East Scotland, North England, Shetland) never
// names an Ireland/Northern Ireland region at all. So unlike the other
// two nations below, this match is INFERRED, not confirmed against any
// real depot-group region string or documented naming convention — flag
// clearly rather than guess silently (this file's own established
// convention). `/ireland/i` catches both "Ireland" and "Northern
// Ireland" as substrings, consistent with this function's existing
// substring-match style.
export type Nation = "scotland" | "england-wales" | "ireland";

// The region field is free text per depot group (window.depotGroups.create
// (name, region)), but in practice follows the 5-region scheme (UK-
// EXPANSION.md): "North Scotland", "West Scotland", "East Scotland",
// "North England", "Shetland", and presumably more England/Wales regions
// as the game expands there. Matched by substring rather than an exact
// list, since this can't enumerate every future region name.
export function nationForRegion(region: string): Nation {
  if (/ireland/i.test(region)) return "ireland";
  return /england|wales/i.test(region) ? "england-wales" : "scotland";
}

// Returns why a long-distance livery can't be used from a depot group in
// this region, or null if it's allowed there. Only Citylink/National
// Express are nation-locked — every other livery goes through the
// area-lock table instead (liveryRestrictionForArea). MegaBus's own former
// branch here was removed 2026-11-19 (user's own instruction — "no
// restrictions on use apart from coaches and long distance routes"), so it
// now falls through to the final `return null` below, same as National
// Express Scottish/Welsh/TaithCymru: no depot-region nation lock at all.
export function longDistanceNationLockReason(liveryName: string, depotGroupRegion: string): string | null {
  const nation = nationForRegion(depotGroupRegion);
  if (liveryName === "Citylink" && nation !== "scotland") {
    return `${liveryName} is a Scotland-only livery.`;
  }
  if (liveryName === "National Express" && nation !== "england-wales") {
    return `${liveryName} is an England/Wales-only livery.`;
  }
  // Added 2026-11-15 — see LONG_DISTANCE_LIVERY_NAMES's own comment above.
  if (liveryName === "Irish Citylink" && nation !== "ireland") {
    return `${liveryName} is an Ireland-only livery.`;
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

// Which route types each vehicle MODEL is suited for. The sightseeing
// open-top model is deliberately absent — SIGHTSEEING_VEHICLE_CATEGORY
// above already fully governs it.
export const VEHICLE_ROUTE_TYPES: Record<string, RouteTypeCategory[]> = {
  "adl-enviro400": ["local_night", "airport"],
  "adl-enviro400-xlb": ["local_night", "airport"],
  "wrightbus-streetdeck": ["local_night", "airport"],
  "adl-enviro200": ["local_night"],
  "volvo-7900": ["local_night", "airport"],
  "mcv-evora": ["local_night"],
  "wrightbus-gb-kite": ["local_night"],
  "evm-cityline": ["local_night"],
  "volvo-9700": ["airport", "long_distance"],
  "volvo-9700dd": ["airport", "long_distance"],
};

// Which route types each GENERAL livery is valid for — excludes every
// livery with its own separate, more specific mechanism instead: the 2
// sightseeing liveries (isSightseeingLiveryName) and the 4 training-only
// liveries (none listed here at all — "not part of this general system"
// is the correct reading of a missing entry, not "allowed everywhere"),
// and the 7 liveries locked to one specific named route
// (LIVERY_SPECIFIC_ROUTE below, checked instead of a general category).
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
  // Added 2026-11-19 — the real LOCAL Welsh operator, same category as
  // every other plain local livery above.
  TrawsCymru: ["local_night"],
  // Highland Council (the livery) dropped T190 (2026-11-14) — removed
  // from this map.
  Citylink: ["long_distance"],
  MegaBus: ["long_distance"],
  "National Express": ["long_distance"],
  // Same category as plain National Express (confirmed: it's a genuine
  // long-distance operator variant, not a local one — only its extra
  // Scotland-terminus restriction differs, checked separately).
  "National Express Scottish": ["long_distance"],
  // Same shape as National Express Scottish above — a genuine
  // long-distance operator variant, only its Wales-terminus restriction
  // differs (checked separately, see nationalExpressWelshTerminusReason).
  "National Express Welsh": ["long_distance"],
  // Added 2026-11-19 — same category as every other long-distance
  // operator, see LONG_DISTANCE_LIVERY_NAMES's own comment above.
  TaithCymru: ["long_distance"],
  "National Express Local": ["local_night"],
  // Added 2026-11-20 — same category as its base livery.
  "National Express Local Electric": ["local_night"],
  "Citylink/West Coast Motors": ["long_distance"],
  // Added 2026-11-15 — see LONG_DISTANCE_LIVERY_NAMES's own comment.
  // Translink is deliberately NOT listed here: the user's own stated
  // restriction is vehicle-type (no coaches) and nation (Ireland) only,
  // with no route-type restriction — a missing entry here already means
  // "not part of this general system, genuinely unrestricted" per
  // `liveryRouteTypeReason`'s own comment below, exactly what's wanted.
  "Irish Citylink": ["long_distance"],
  // Added 2026-11-19 — user's own instruction: "used on long distance
  // routes." Vehicle lock (Volvo 9700DD only, not any coach) is a
  // separate, more specific check in liveryVehicleLockReason below.
  "Oxford Tube": ["long_distance"],
};

// Liveries locked to one specific named route rather than a general
// category, confirmed 2026-11-07 — matched against a real route's own
// `number`. Three of these (Air, SkyLink, Oxford Tube) are the player's
// own words — "it will be [the contract] once added" / "doesn't exist in
// the game yet" — so there's genuinely nothing to match yet; left in so
// the lock activates the moment such a route exists, rather than needing
// this file touched again.
export const LIVERY_SPECIFIC_ROUTE: Record<string, string> = {
  "Airlink 100": "Airlink 100",
  "Lothian Girraffe": "Airlink 100",
  "Express 500": "500",
  ScotRail: "398",
  Air: "Air",
  SkyLink: "SkyLink",
  "Oxford Tube": "Oxford Tube",
  // Thistle Coaches added 2026-11-19 — unlike every other entry above
  // (each waiting for ITS OWN real route of that exact number/name to
  // exist), this one is a deliberate, permanent sentinel: no real route
  // will ever be numbered "Thistle Coaches," so this livery can never
  // pass liveryUnavailableReason's requiredRoute check and never appears
  // in the buy/configure livery picker, in or out of any depot group's
  // enabled operators. It's "selectable nowhere, system-assigned only" —
  // fixed-contract-failures.mts assigns it directly to a suspended
  // service's own display/finance handling without ever going through
  // this picker at all.
  "Thistle Coaches": "Thistle Coaches",
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

// Airlink 100's own last-resort fallback (2026-11-15), the user's exact
// words: "The Airlink 100 can use Lothian liveried Enviro XLB's if there
// is absolutely no alternatives left," clarified via a follow-up
// question to: "Only if a bus is in for a service or repaint etc it can
// use a Lothian liveried one from the existing fleet."
//
// "In for a service" has no real tracking anywhere in this codebase —
// Maintenance is Phase 8 (CLAUDE.md's own build order), not built yet.
// Only repaint/re-power bookings are real (`workshop-booking.mts`'s
// `AwayBooking`, shared by `repaint-booking.mts`/`repower-booking.mts`),
// so this checks "away for repaint/re-power" only — a genuine, flagged
// gap for "service," not silently ignored or faked.
//
// "No alternatives left" means every real Airlink 100/Lothian Girraffe
// liveried vehicle this depot group actually OWNS is currently away
// (`awayVehicleIds`, the caller's own already-resolved set from real
// `AwayBooking` rows via `workshop-booking.mts`'s own day-overlap
// convention) — a depot group that owns NEITHER livery's vehicles at
// all has nothing to fall back FROM, so this correctly stays false
// rather than firing the moment a fresh depot group hasn't bought one
// yet. The fallback also requires the depot group to actually own at
// least one real ADL Enviro400 XLB (`adl-enviro400-xlb` —
// `vehicle-catalogue.mts`'s own note confirms this is already Airlink
// 100's real required vehicle model) — "from the existing fleet" never
// implies buying a new one for this.
export function airlinkLothianFallbackEligible(
  depotGroupId: number,
  vehicles: readonly Pick<Vehicle, "id" | "depotGroupId" | "modelId" | "liveryId">[],
  liveries: readonly Pick<Livery, "id" | "name">[],
  awayVehicleIds: ReadonlySet<number>,
): boolean {
  const liveryIdByName = new Map(liveries.map((l) => [l.name, l.id]));
  const airlinkLiveryIds = new Set(
    [liveryIdByName.get("Airlink 100"), liveryIdByName.get("Lothian Girraffe")].filter((id): id is number => id !== undefined),
  );
  const depotVehicles = vehicles.filter((v) => v.depotGroupId === depotGroupId);
  const properLiveryVehicles = depotVehicles.filter((v) => v.liveryId !== null && airlinkLiveryIds.has(v.liveryId));
  if (properLiveryVehicles.length === 0) return false;
  if (!properLiveryVehicles.every((v) => awayVehicleIds.has(v.id))) return false;
  return depotVehicles.some((v) => v.modelId === "adl-enviro400-xlb");
}

// National Express Scottish's own extra restriction (T190, 2026-11-14),
// confirmed directly from the user: "any National Express livery can run
// to Scotland but the Scottish one can only run to/from Scotland" — i.e.
// plain National Express/National Express Local are unaffected (this
// function only ever returns non-null for the one livery name), and
// National Express Scottish requires at least one real route TERMINUS
// (just the two endpoints, not every intermediate stop — confirmed
// interpretation) to fall inside the real Geofabrik Scotland boundary,
// checked via `isPointInScotland` (scotland-boundary.mts, backed by the
// new WASM `point_in_scotland` getter against the genuinely separate
// `scotland-boundary.poly`/`scotland_boundary.bin` artifact — NOT the
// existing extract-boundary.poly, which is deliberately extended into
// England and would wrongly pass Carlisle/Berwick/Newcastle). `points`
// absent or empty means the route isn't yet known (an in-progress draft,
// or a caller that hasn't fetched it) — same "can't check it, don't
// block on it" convention as every other optional axis in this file, so
// this does NOT block in that case.
export function nationalExpressScottishTerminusReason(liveryName: string, points: { lon: number; lat: number }[] | undefined): string | null {
  if (liveryName !== "National Express Scottish") return null;
  if (!points || points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (isPointInScotland(first.lon, first.lat) || isPointInScotland(last.lon, last.lat)) return null;
  return "National Express Scottish only runs to/from Scotland.";
}

// National Express Welsh's own extra restriction (2026-11-15) — exact
// mirror of nationalExpressScottishTerminusReason above, Wales instead
// of Scotland, per the user's own direct instruction.
export function nationalExpressWelshTerminusReason(liveryName: string, points: { lon: number; lat: number }[] | undefined): string | null {
  if (liveryName !== "National Express Welsh") return null;
  if (!points || points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (isPointInWales(first.lon, first.lat) || isPointInWales(last.lon, last.lat)) return null;
  return "National Express Welsh only runs to/from Wales.";
}

// Plain haversine distance in metres — same small self-contained helper
// every other file that needs real-world distance already carries its own
// copy of (area-cluster.mts, island-detection.mts, fare-zone-road-
// pushout.mts, polyline-geometry.mts, dead-mileage-preview.ts), rather
// than a shared module none of them actually use.
function haversineM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon - a.lon);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

// Real fraction of a route's own length that falls inside Wales (2026-11-19,
// for TaithCymru's own rule below) — distance-weighted along the whole
// polyline, not just the two endpoints (unlike the Scottish/Welsh National
// Express terminus checks above, which only ever look at the first/last
// point). Each segment's MIDPOINT decides whether that segment counts as
// "in Wales" — a deliberate, flagged approximation (no real line/polygon
// clip exists here) rather than a true polygon intersection, acceptable
// for a short-ish road segment between two consecutive route points.
// Returns null when the route isn't known yet (fewer than 2 points), same
// "can't check it, don't block on it" convention as every other optional
// axis in this file.
export function routeWalesFraction(points: { lon: number; lat: number }[] | undefined): number | null {
  if (!points || points.length < 2) return null;
  let totalM = 0;
  let walesM = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segM = haversineM(a, b);
    totalM += segM;
    const midpoint = { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 };
    if (isPointInWales(midpoint.lon, midpoint.lat)) walesM += segM;
  }
  return totalM > 0 ? walesM / totalM : null;
}

// TaithCymru's own nation lock (2026-11-19, replacing its original
// terminus-only check — user's own direct instruction): "TaithCymru
// should only operate routes that are 85% or more in Wales, otherwise it
// should be National Express." A real, stricter proportional threshold
// rather than National Express Welsh's "at least one terminus" rule —
// deliberately different from its sibling, since a long-distance coach
// route can touch Wales at one end while running mostly through England,
// which should default to plain National Express instead (already always
// eligible wherever TaithCymru isn't — no separate fallback logic needed,
// it's simply the next already-available long-distance choice once
// TaithCymru itself is blocked here).
const TAITH_CYMRU_WALES_FRACTION = 0.85;

export function taithCymruWalesFractionReason(liveryName: string, points: { lon: number; lat: number }[] | undefined): string | null {
  if (liveryName !== "TaithCymru") return null;
  const fraction = routeWalesFraction(points);
  if (fraction === null) return null;
  return fraction >= TAITH_CYMRU_WALES_FRACTION ? null : `TaithCymru is locked to routes at least ${TAITH_CYMRU_WALES_FRACTION * 100}% in Wales.`;
}

// TrawsCymru's own nation lock (2026-11-19) — the real LOCAL Welsh bus
// operator (Transport for Wales's own network of local/regional services,
// as distinct from TaithCymru's long-distance coach role above — user's
// own direct instruction: "let's use TrawsCymru as the local operator
// that is used in Wales"). Same terminus-check shape as National Express
// Welsh (not the stricter 85%-of-route rule above, which was only ever
// specified for TaithCymru) — a local route is far less likely to clip
// through Wales at one end only the way a long-distance coach route can,
// so the simpler "at least one terminus" rule is the closer match to its
// long-distance-route sibling's own established pattern. Flagged as an
// inferred choice, not explicitly confirmed — correct by hand if wrong.
// Checked unconditionally, same shape as `translinkNationReason` below
// (TrawsCymru is a LOCAL livery, so it never goes through
// `isLongDistanceLiveryName`'s own pathway at all).
export function trawsCymruTerminusReason(liveryName: string, points: { lon: number; lat: number }[] | undefined): string | null {
  if (liveryName !== "TrawsCymru") return null;
  if (!points || points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (isPointInWales(first.lon, first.lat) || isPointInWales(last.lon, last.lat)) return null;
  return "TrawsCymru only runs to/from Wales.";
}

// Translink's own nation lock (2026-11-15) — unlike Irish Citylink,
// Translink isn't a long-distance livery (see LIVERY_ROUTE_TYPES's own
// comment), so it never goes through `isLongDistanceLiveryName`'s
// pathway (`longDistanceLocationLockReason`/`longDistanceNationLockReason`)
// at all. Checked unconditionally instead, same shape as
// `nationalExpressScottishTerminusReason` above — a no-op for every
// other livery. `depotGroupRegion` undefined means no depot group is
// known yet, same "can't check it, don't block on it" convention as
// everywhere else in this file.
export function translinkNationReason(liveryName: string, depotGroupRegion: string | undefined): string | null {
  if (liveryName !== "Translink") return null;
  if (depotGroupRegion === undefined) return null;
  return nationForRegion(depotGroupRegion) === "ireland" ? null : "Translink is an Ireland-only livery.";
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
// D&E + Sprinter lock for Dounreay's own 800/803/805 contracts
// (OPEN-ITEMS.md "Three further contracts — 800, 803 & 805", settled
// 2026-11-19/20 — the user's own words: "these routes will only run with
// Sprinter buses"). A genuinely new SHAPE of lock, confirmed directly by
// the task brief: route-NUMBER-keyed, not livery-keyed outright — D&E is
// NOT Sprinter-only everywhere (it's Caithness's own ordinary area
// livery, RESTRICTED_AREA_LIVERIES above, worn on whatever vehicle the
// area's own rule allows), only on these three specific route numbers.
// This can't live in liveryVehicleLockReason below (ScotRail's own
// blanket lock there has no route parameter at all, because ScotRail is
// ALREADY exclusively route 398 via LIVERY_SPECIFIC_ROUTE — D&E has no
// such exclusive tie) — it needs BOTH the livery AND the route number
// together, so it's checked directly in liveryUnavailableReason below,
// where `route` actually exists.
function dAndESprinterLockReason(liveryName: string, vehicleId: string, routeNumber: string | undefined): string | null {
  if (liveryName !== "D&E") return null;
  if (!routeNumber || !DOUNREAY_800_803_805_ROUTE_NUMBERS.includes(routeNumber)) return null;
  return vehicleId === "evm-cityline" ? null : `D&E on route ${routeNumber} is locked to the Sprinter (EVM Cityline) only.`;
}

export function liveryVehicleLockReason(liveryName: string, vehicle: { id: string; category: string }, powerType?: string): string | null {
  if (isSightseeingLiveryName(liveryName)) {
    return vehicle.category === SIGHTSEEING_VEHICLE_CATEGORY ? null : "Sightseeing liveries are locked to sightseeing/open-top vehicles only.";
  }
  if (vehicle.category === SIGHTSEEING_VEHICLE_CATEGORY) {
    return "A sightseeing vehicle can only carry a Sightseeing livery.";
  }
  // National Express Scottish included here (T190, 2026-11-14) — same
  // coach-only vehicle lock as its three siblings in this branch; not
  // spelled out explicitly in the plan's own design section but implied
  // by "sits under the existing National Express operator group... same
  // category as its siblings" — without it, this livery would be the
  // only LONG_DISTANCE_LIVERY_NAMES member left unlocked to any
  // non-coach model not covered by VEHICLE_ROUTE_TYPES below.
  if (
    liveryName === "Citylink" ||
    liveryName === "MegaBus" ||
    liveryName === "National Express" ||
    liveryName === "National Express Scottish" ||
    // National Express Welsh added 2026-11-15 — same coach-only lock as
    // its siblings, exact mirror of National Express Scottish.
    liveryName === "National Express Welsh" ||
    liveryName === "Citylink/West Coast Motors" ||
    // Irish Citylink added 2026-11-15 — same coach-only lock as every
    // other long-distance operator in this branch.
    liveryName === "Irish Citylink" ||
    // TaithCymru added 2026-11-19 — same coach-only lock as every other
    // long-distance operator in this branch; MegaBus's own entry above
    // keeps its coach-only lock unchanged by this same change.
    liveryName === "TaithCymru"
  ) {
    return vehicle.category === "Coaches" ? null : `${liveryName} is locked to coaches only.`;
  }
  // Translink added 2026-11-15 — the user's own words: "any vehicle
  // except coaches." The exact inverse of the branch above, so it needs
  // its own check rather than reusing it.
  if (liveryName === "Translink") {
    return vehicle.category === "Coaches" ? "Translink can't be used on coaches." : null;
  }
  // Oxford Tube added 2026-11-19 — user's own words: "can only be used on
  // 9700DD coaches." A specific MODEL lock, not the general "any coach"
  // rule every other long-distance livery above gets, so it needs its own
  // branch rather than joining theirs.
  if (liveryName === "Oxford Tube") {
    return vehicle.id === "volvo-9700dd" ? null : "Oxford Tube is locked to the Volvo 9700DD only.";
  }
  if (liveryName === "ScotRail") {
    return scotRailVehicleReason(vehicle, powerType);
  }
  // Private hire revival (T183, confirmed 2026-11-13): buying/livering a
  // vehicle Lothian Coaches IS the "this is now a private-hire vehicle"
  // designation (no separate boolean on Vehicle) — restricted to the two
  // eligible classes, coaches by category and the EVM Cityline ("Sprinter")
  // by id specifically (its own category is "Minibus", not "Coaches").
  if (liveryName === "Lothian Coaches") {
    return vehicle.category === "Coaches" || vehicle.id === "evm-cityline" ? null : "Lothian Coaches is locked to coaches and the EVM Cityline (private hire) only.";
  }
  // Stagecoach Electric (T155, confirmed 2026-11-07; First Electric was
  // the First Bus equivalent here but was dropped outright T190,
  // 2026-11-14) — electric vehicles only, same "real configured power,
  // not just a model capable of it" pattern as ScotRail above, and the
  // same optional-powerType convention (omitted means only unconfigured-
  // power callers are left unblocked, not that electric is assumed).
  if (liveryName === "Stagecoach Electric" && powerType !== undefined && powerType !== "electric") {
    return `${liveryName} is locked to electric vehicles only.`;
  }
  // National Express Local Electric added 2026-11-20 — same shape as
  // Stagecoach Electric above.
  if (liveryName === "National Express Local Electric" && powerType !== undefined && powerType !== "electric") {
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
  route?: { number: string; points?: { lon: number; lat: number }[] },
  enabledOperators?: readonly string[],
  narrowedLiveryNames?: readonly string[] | null,
): string | null {
  const vehicleReason = liveryVehicleLockReason(liveryName, vehicle, powerType);
  if (vehicleReason) return vehicleReason;
  const sprinterReason = dAndESprinterLockReason(liveryName, vehicle.id, route?.number);
  if (sprinterReason) return sprinterReason;
  if (currentVehicleCount !== undefined) {
    const capReason = liveryCapReason(liveryName, currentVehicleCount);
    if (capReason) return capReason;
  }
  const requiredRoute = LIVERY_SPECIFIC_ROUTE[liveryName];
  if (requiredRoute !== undefined && (!route || route.number !== requiredRoute)) {
    return `${liveryName} is only available when buying for route ${requiredRoute}.`;
  }
  const scottishTerminusReason = nationalExpressScottishTerminusReason(liveryName, route?.points);
  if (scottishTerminusReason) return scottishTerminusReason;
  const welshTerminusReason = nationalExpressWelshTerminusReason(liveryName, route?.points);
  if (welshTerminusReason) return welshTerminusReason;
  const taithCymruReason = taithCymruWalesFractionReason(liveryName, route?.points);
  if (taithCymruReason) return taithCymruReason;
  const trawsCymruReason = trawsCymruTerminusReason(liveryName, route?.points);
  if (trawsCymruReason) return trawsCymruReason;
  const translinkReason = translinkNationReason(liveryName, depotGroup?.region);
  if (translinkReason) return translinkReason;
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
// since that's handled entirely separately (isSightseeingLiveryName), and
// for "staff" (schema v57->v58) since a staff bus carries no livery
// restriction of its own at all — any general livery is fine, the same
// "not part of this general system" reading `liveryRouteTypeReason`
// already gives a missing entry.
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
  route: { routeType: RouteType; number: string; points?: { lon: number; lat: number }[] },
  depotGroup: { name: string; region: string } | undefined,
  // Airlink 100's own last-resort fallback (2026-11-15) — see
  // `airlinkLothianFallbackEligible`'s own doc comment for the full
  // reasoning. The caller (whoever actually has the real owned-vehicle
  // and away-booking data) computes this via that function and passes
  // the result straight through; undefined (the caller hasn't checked,
  // or this isn't even the Airlink 100/"Lothian" combination) means
  // "don't apply the fallback," same can't-check-don't-block convention
  // as every other optional axis in this file.
  airlinkLothianFallbackAvailable?: boolean,
): boolean {
  // Checked before every other rule below, including the plain
  // `Lothian` livery's own normal `local_night`-only lock — this is an
  // explicit, narrow override, not threaded through the general rule
  // stack, so it stays correct regardless of what route-type category
  // Airlink 100 itself is tagged as.
  if (airlinkLothianFallbackAvailable && liveryName === "Lothian" && route.number === "Airlink 100") return true;
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
    // National Express Scottish's own extra restriction (T190) — see
    // nationalExpressScottishTerminusReason above; a no-op for every
    // other long-distance livery.
    if (nationalExpressScottishTerminusReason(liveryName, route.points)) return false;
    // National Express Welsh's own mirror restriction (2026-11-15) — see
    // nationalExpressWelshTerminusReason above; a no-op for every other
    // long-distance livery.
    if (nationalExpressWelshTerminusReason(liveryName, route.points)) return false;
    // TaithCymru's own mirror restriction (2026-11-19) — see
    // taithCymruWalesFractionReason above; a no-op for every other
    // long-distance livery.
    if (taithCymruWalesFractionReason(liveryName, route.points)) return false;
    return true;
  }
  if (isLocalOnlyLiveryName(liveryName) && route.routeType === "long_distance") return false;
  if (isSightseeingLiveryName(liveryName)) return route.routeType === "sightseeing";
  if (route.routeType === "sightseeing") return false;
  if (liverySpecificRouteReason(liveryName, route)) return false;
  if (translinkNationReason(liveryName, depotGroup?.region)) return false;
  // TrawsCymru's own unconditional nation check (2026-11-19) — same shape
  // as the Translink check directly above, see trawsCymruTerminusReason.
  if (trawsCymruTerminusReason(liveryName, route.points)) return false;
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

// Private hire revival (T183, confirmed 2026-11-13, Q20/OPEN-ITEMS.md).
// Per-DEPOT-GROUP, per-vehicle-class caps on the Lothian Coaches livery —
// genuinely different in shape from LIVERY_MAX_VEHICLE_COUNT above (that
// one is a single company-wide count; this is two independent counts,
// scoped per depot group, one per eligible vehicle class), so it's its
// own dedicated function rather than folded into liveryCapReason. Both
// numbers are flat placeholders for now, not derived from anything real:
// the coach cap is standing in for real demand/land-use scoring (Phase 4,
// not built yet); the Sprinter cap is standing in for "scales with depot
// size" (no depot-size/tier concept exists in this codebase at all yet).
// Swap both for real formulas once those mechanics land.
export const LOTHIAN_COACHES_CAP = { coach: 6, sprinter: 2 };

export function lothianCoachesCapReason(
  vehicleCategory: string,
  vehicleId: string,
  currentCoachCount: number,
  currentSprinterCount: number,
): string | null {
  if (vehicleId === "evm-cityline") {
    return currentSprinterCount >= LOTHIAN_COACHES_CAP.sprinter
      ? `This depot group already has ${LOTHIAN_COACHES_CAP.sprinter} private-hire Sprinter${LOTHIAN_COACHES_CAP.sprinter === 1 ? "" : "s"} (the flat placeholder cap).`
      : null;
  }
  if (vehicleCategory === "Coaches") {
    return currentCoachCount >= LOTHIAN_COACHES_CAP.coach
      ? `This depot group already has ${LOTHIAN_COACHES_CAP.coach} private-hire coaches (the flat placeholder cap).`
      : null;
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
