// Manual verification script for livery-seed-data.mts's own private hire
// revival additions (T183, Q20/OPEN-ITEMS.md) — the Lothian Coaches
// vehicle lock and its per-depot-group, per-class cap — plus (T188,
// 2026-11-14) assertions that the Ember livery is now genuinely, fully
// removed (not merely filtered, the way T179 originally soft-removed it)
// — plus (T190, 2026-11-14) the three further livery removals (First
// Electric, McGills, Highland Council), the National Express Local
// recolour, National Express Scottish's own data, and its real
// Scotland-terminus restriction. Run directly with
// `node --experimental-strip-types src/renderer/livery-seed-data.verify.mts`
// — same pattern as the project's other .verify.mts files. No prior
// .verify.mts existed for this module at all before this one.
//
// The Scotland-terminus checks below need the real WASM module
// initialised AND the real `scotland_boundary.bin` loaded through the
// same local-server fetch `scotland-boundary.mts` uses in the real app —
// this script stands up a tiny throwaway HTTP server on the same port
// (38271) serving the real artefact from dev `pipeline-data/`, rather
// than mocking/stubbing the check: same "no shortcuts, use the real
// thing" standard as every other verify script here.
import * as fs from "node:fs";
import * as http from "node:http";
import { initSync } from "./wasm/game_wasm.js";
import {
  liveryVehicleLockReason,
  lothianCoachesCapReason,
  LOTHIAN_COACHES_CAP,
  REAL_LIVERY_COLOURS,
  OPERATOR_LIVERIES,
  LONG_DISTANCE_LIVERY_NAMES,
  LIVERY_ROUTE_TYPES,
  LIVERY_LINKED_TO,
  RESTRICTED_AREA_LIVERIES,
  liveryOperator,
  isLongDistanceLiveryName,
  longDistanceNationLockReason,
  liveryUnavailableReason,
  liveryEligibleForRoute,
  nationalExpressScottishTerminusReason,
  nationalExpressWelshTerminusReason,
  taithCymruWalesFractionReason,
  routeWalesFraction,
  trawsCymruTerminusReason,
  nationForRegion,
  translinkNationReason,
  airlinkLothianFallbackEligible,
  ELECTRIC_LIVERY_VARIANT,
  liverySpecificRouteReason,
  LIVERY_SPECIFIC_ROUTE,
} from "./livery-seed-data.mts";
import { loadScotlandBoundary, isPointInScotland } from "./scotland-boundary.mts";
import { loadWalesBoundary, isPointInWales } from "./wales-boundary.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Vehicle lock: coaches and the EVM Cityline ("Sprinter") only ---
assert(
  liveryVehicleLockReason("Lothian Coaches", { id: "volvo-9700", category: "Coaches" }) === null,
  "Lothian Coaches is allowed on the Volvo 9700 (a coach)",
);
assert(
  liveryVehicleLockReason("Lothian Coaches", { id: "volvo-9700dd", category: "Coaches" }) === null,
  "Lothian Coaches is allowed on the Volvo 9700DD (a coach)",
);
assert(
  liveryVehicleLockReason("Lothian Coaches", { id: "evm-cityline", category: "Minibus" }) === null,
  "Lothian Coaches is allowed on the EVM Cityline by id, even though its category is Minibus, not Coaches",
);
assert(
  liveryVehicleLockReason("Lothian Coaches", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "Lothian Coaches is blocked on an ordinary double-decker",
);
assert(
  liveryVehicleLockReason("Lothian Coaches", { id: "adl-enviro200", category: "Single-deckers / midibuses" }) !== null,
  "Lothian Coaches is blocked on an ordinary single-decker/midibus",
);
assert(
  liveryVehicleLockReason("Lothian Coaches", { id: "some-other-minibus", category: "Minibus" }) !== null,
  "a Minibus-category vehicle that ISN'T the EVM Cityline specifically is still blocked — the id check is exact, not category-wide",
);

// --- Per-depot-group, per-class cap ---
assert(LOTHIAN_COACHES_CAP.coach >= 1 && LOTHIAN_COACHES_CAP.sprinter >= 1, "both flat placeholder caps are at least 1");

// Coach side: category-driven.
assert(
  lothianCoachesCapReason("Coaches", "volvo-9700", LOTHIAN_COACHES_CAP.coach - 1, 0) === null,
  "a coach is allowed when this depot group is one under its own coach cap",
);
assert(
  lothianCoachesCapReason("Coaches", "volvo-9700", LOTHIAN_COACHES_CAP.coach, 0) !== null,
  "a coach is blocked once this depot group is AT its own coach cap",
);
assert(
  lothianCoachesCapReason("Coaches", "volvo-9700", LOTHIAN_COACHES_CAP.coach + 5, 0) !== null,
  "a coach is blocked well past its own cap too",
);
// A high sprinter count at the same depot group never blocks a coach —
// the two caps are independent, confirmed directly.
assert(
  lothianCoachesCapReason("Coaches", "volvo-9700", 0, LOTHIAN_COACHES_CAP.sprinter + 10) === null,
  "the coach cap is independent of however many Sprinters this depot group already has",
);

// Sprinter side: id-driven (evm-cityline specifically, regardless of the
// category string passed in — mirrors the vehicle lock's own "id check is
// exact" behaviour above).
assert(
  lothianCoachesCapReason("Minibus", "evm-cityline", 0, LOTHIAN_COACHES_CAP.sprinter - 1) === null,
  "a Sprinter is allowed when this depot group is one under its own Sprinter cap",
);
assert(
  lothianCoachesCapReason("Minibus", "evm-cityline", 0, LOTHIAN_COACHES_CAP.sprinter) !== null,
  "a Sprinter is blocked once this depot group is AT its own Sprinter cap",
);
assert(
  lothianCoachesCapReason("Minibus", "evm-cityline", LOTHIAN_COACHES_CAP.coach + 10, 0) === null,
  "the Sprinter cap is independent of however many coaches this depot group already has",
);

// Neither eligible class: no cap reason of its own to give (the vehicle
// lock above is what actually blocks it, this function just has nothing
// to say about a vehicle it was never meant to cap).
assert(
  lothianCoachesCapReason("Double-deckers", "adl-enviro400", LOTHIAN_COACHES_CAP.coach + 10, LOTHIAN_COACHES_CAP.sprinter + 10) === null,
  "a vehicle that's neither a coach nor the EVM Cityline gets no cap reason from this function at all",
);

// --- Ember fully removed (T187, 2026-11-14) — genuinely absent from every
// data structure, not just filtered out by a discontinued-liveries flag
// the way T179 originally did it. ---
assert(REAL_LIVERY_COLOURS["Ember"] === undefined, "Ember has no colour entry left");
assert(liveryOperator("Ember") === null, "Ember belongs to no operator group any more");
assert(!Object.values(OPERATOR_LIVERIES).some((names) => names.includes("Ember")), "Ember appears in no operator's livery list");
assert(!LONG_DISTANCE_LIVERY_NAMES.includes("Ember"), "Ember is no longer a long-distance livery name");
assert(!isLongDistanceLiveryName("Ember"), "isLongDistanceLiveryName('Ember') is false");
assert(LIVERY_ROUTE_TYPES["Ember"] === undefined, "Ember has no route-type category entry left");
assert(longDistanceNationLockReason("Ember", "West Scotland") === null, "Ember is no longer nation-locked at all (it's simply not a long-distance livery)");
// liveryUnavailableReason should return null for Ember on any ordinary
// vehicle/depot combination now — not a "has been discontinued" message
// (that mechanism, DISCONTINUED_LIVERIES, no longer exists), and not any
// other lock either, since none of the locks above know the name "Ember"
// any more.
assert(
  liveryUnavailableReason("Ember", { id: "adl-enviro400", category: "Double-deckers" }, { name: "Glasgow", region: "West Scotland" }) === null,
  "Ember is no longer blocked by any mechanism in liveryUnavailableReason (it was removed from every list this function consults, so there's nothing left to reject it)",
);

// --- First Electric, McGills, Highland Council fully removed (T190,
// 2026-11-14) — same style of assertions as the Ember block above, for
// all three removed liveries at once. Their operator GROUPS stay (First
// Bus, McGills, Highland Council), confirmed separately below. ---
for (const name of ["First Electric", "McGills", "Highland Council"]) {
  assert(REAL_LIVERY_COLOURS[name] === undefined, `${name} has no colour entry left`);
  assert(LIVERY_ROUTE_TYPES[name] === undefined, `${name} has no route-type category entry left`);
  assert(LIVERY_LINKED_TO[name] === undefined, `${name} has no LIVERY_LINKED_TO entry of its own left`);
  assert(
    !Object.values(OPERATOR_LIVERIES).some((names) => names.includes(name)),
    `${name} appears in no operator's own livery list any more`,
  );
  assert(
    liveryUnavailableReason(name, { id: "adl-enviro400", category: "Double-deckers" }, { name: "Glasgow", region: "West Scotland" }) === null,
    `${name} is no longer blocked by any mechanism in liveryUnavailableReason (nothing left to reject it)`,
  );
}
// The operator GROUP keys themselves stay, just without their own
// self-named livery in the list (McGills/Highland Council) or First
// Electric in First Bus's list.
assert(OPERATOR_LIVERIES["McGills"]?.includes("Explore Dundee"), "the McGills operator group key stays, covering Explore Dundee");
assert(!OPERATOR_LIVERIES["McGills"]?.includes("McGills"), "but McGills no longer offers its own plain livery choice");
assert(OPERATOR_LIVERIES["Highland Council"]?.includes("D&E"), "the Highland Council operator group key stays, covering D&E");
assert(!OPERATOR_LIVERIES["Highland Council"]?.includes("Highland Council"), "but Highland Council no longer offers its own plain livery choice");
assert(OPERATOR_LIVERIES["First Bus"]?.includes("First Bus"), "First Bus operator group still covers plain First Bus");
assert(!OPERATOR_LIVERIES["First Bus"]?.includes("First Electric"), "but First Electric is gone from First Bus's list");
// Caithness's own accepted list narrowed to drop Highland Council too.
assert(!RESTRICTED_AREA_LIVERIES["Caithness"]?.accepted.includes("Highland Council"), "Caithness no longer accepts Highland Council (the livery)");
assert(RESTRICTED_AREA_LIVERIES["Caithness"]?.accepted.includes("D&E"), "Caithness still accepts D&E");

// --- National Express Local recolour (T190, 2026-11-14, user-supplied
// real figures). ---
assert(REAL_LIVERY_COLOURS["National Express Local"]?.primary === "#495D70", "National Express Local's new primary colour");
assert(REAL_LIVERY_COLOURS["National Express Local"]?.secondary === "#64E0F7", "National Express Local's new secondary colour");

// --- National Express Scottish — new livery (T190, 2026-11-14). ---
assert(REAL_LIVERY_COLOURS["National Express Scottish"]?.primary === "#52525b", "National Express Scottish's primary colour matches plain National Express");
assert(REAL_LIVERY_COLOURS["National Express Scottish"]?.secondary === "#005EB5", "National Express Scottish's own secondary colour");
assert(OPERATOR_LIVERIES["National Express"]?.includes("National Express Scottish"), "National Express Scottish sits in the National Express operator group");
assert(LONG_DISTANCE_LIVERY_NAMES.includes("National Express Scottish"), "National Express Scottish is a long-distance livery");
assert(isLongDistanceLiveryName("National Express Scottish"), "isLongDistanceLiveryName('National Express Scottish') is true");
assert(LIVERY_ROUTE_TYPES["National Express Scottish"]?.includes("long_distance"), "National Express Scottish's route-type category is long_distance");
assert(
  liveryVehicleLockReason("National Express Scottish", { id: "volvo-9700", category: "Coaches" }) === null,
  "National Express Scottish is allowed on a coach",
);
assert(
  liveryVehicleLockReason("National Express Scottish", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "National Express Scottish is blocked on an ordinary double-decker (same coach-only lock as its siblings)",
);
// Deliberately NOT special-cased in longDistanceNationLockReason (plan's
// own instruction) — its literal-name checks only match "Citylink"/
// "MegaBus"/"National Express" exactly, so National Express Scottish
// falls through to that function's final `return null`: NO depot-region
// nation lock at all, in EITHER region, unlike plain National Express's
// own England/Wales-only lock. Confirmed intentional: locking it to
// England/Wales depots would contradict "runs to/from Scotland" — its
// only real restriction is the terminus check below, not a depot-region
// one.
assert(
  longDistanceNationLockReason("National Express Scottish", "West Scotland") === null,
  "National Express Scottish has no depot-region nation lock from a Scottish depot region",
);
assert(
  longDistanceNationLockReason("National Express Scottish", "North England") === null,
  "National Express Scottish has no depot-region nation lock from an England/Wales depot region either",
);
assert(
  longDistanceNationLockReason("National Express", "West Scotland") !== null,
  "plain National Express, by contrast, IS still nation-locked out of Scottish depot regions — unchanged sibling behaviour",
);
// Plain National Express / National Express Local unaffected by the new
// terminus check (it only ever returns non-null for the Scottish name).
assert(nationalExpressScottishTerminusReason("National Express", [{ lon: -0.1276, lat: 51.5072 }]) === null, "plain National Express is never blocked by the terminus check");
assert(nationalExpressScottishTerminusReason("National Express Local", [{ lon: -0.1276, lat: 51.5072 }]) === null, "National Express Local is never blocked by the terminus check");
// Points absent/empty: never blocks, regardless of livery name.
assert(nationalExpressScottishTerminusReason("National Express Scottish", undefined) === null, "no points at all (draft route not yet known) does not block");
assert(nationalExpressScottishTerminusReason("National Express Scottish", []) === null, "an empty points array does not block");

// --- National Express Welsh — new livery (2026-11-15), exact mirror of
// National Express Scottish for Wales instead of Scotland. ---
assert(REAL_LIVERY_COLOURS["National Express Welsh"]?.primary === "#f1f0f0", "National Express Welsh's primary colour (real, sampled from the supplied badge PNG)");
assert(REAL_LIVERY_COLOURS["National Express Welsh"]?.secondary === "#c8102e", "National Express Welsh's secondary colour (real, sampled from the supplied badge PNG)");
assert(OPERATOR_LIVERIES["National Express"]?.includes("National Express Welsh"), "National Express Welsh sits in the National Express operator group");
assert(LONG_DISTANCE_LIVERY_NAMES.includes("National Express Welsh"), "National Express Welsh is a long-distance livery");
assert(isLongDistanceLiveryName("National Express Welsh"), "isLongDistanceLiveryName('National Express Welsh') is true");
assert(LIVERY_ROUTE_TYPES["National Express Welsh"]?.includes("long_distance"), "National Express Welsh's route-type category is long_distance");
assert(
  liveryVehicleLockReason("National Express Welsh", { id: "volvo-9700", category: "Coaches" }) === null,
  "National Express Welsh is allowed on a coach",
);
assert(
  liveryVehicleLockReason("National Express Welsh", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "National Express Welsh is blocked on an ordinary double-decker (same coach-only lock as its siblings)",
);
// Deliberately NOT special-cased in longDistanceNationLockReason, same
// reasoning as National Express Scottish — its only real restriction is
// the terminus check below, not a depot-region one.
assert(
  longDistanceNationLockReason("National Express Welsh", "North Scotland") === null,
  "National Express Welsh has no depot-region nation lock from a Scottish depot region",
);
assert(
  longDistanceNationLockReason("National Express Welsh", "North England") === null,
  "National Express Welsh has no depot-region nation lock from an England/Wales depot region either",
);
// Plain National Express / National Express Local / National Express
// Scottish unaffected by the new Welsh terminus check (it only ever
// returns non-null for the Welsh name).
assert(nationalExpressWelshTerminusReason("National Express", [{ lon: -0.1276, lat: 51.5072 }]) === null, "plain National Express is never blocked by the Welsh terminus check");
assert(nationalExpressWelshTerminusReason("National Express Local", [{ lon: -0.1276, lat: 51.5072 }]) === null, "National Express Local is never blocked by the Welsh terminus check");
assert(nationalExpressWelshTerminusReason("National Express Scottish", [{ lon: -0.1276, lat: 51.5072 }]) === null, "National Express Scottish is never blocked by the Welsh terminus check (it's a no-op for every other livery)");
// Points absent/empty: never blocks, regardless of livery name.
assert(nationalExpressWelshTerminusReason("National Express Welsh", undefined) === null, "no points at all (draft route not yet known) does not block");
assert(nationalExpressWelshTerminusReason("National Express Welsh", []) === null, "an empty points array does not block");

// --- TaithCymru — new standalone livery (2026-11-19), swapped in for
// MegaBus's old Wales role; MegaBus itself loses its nation lock. ---
assert(REAL_LIVERY_COLOURS["TaithCymru"]?.primary === "#111111", "TaithCymru's primary colour");
assert(REAL_LIVERY_COLOURS["TaithCymru"]?.secondary === "#00a551", "TaithCymru's secondary colour");
assert(OPERATOR_LIVERIES["TaithCymru"]?.includes("TaithCymru"), "TaithCymru is a standalone operator, not a National Express sub-brand");
assert(!OPERATOR_LIVERIES["National Express"]?.includes("TaithCymru"), "TaithCymru does not sit in the National Express operator group");
assert(LONG_DISTANCE_LIVERY_NAMES.includes("TaithCymru"), "TaithCymru is a long-distance livery");
assert(isLongDistanceLiveryName("TaithCymru"), "isLongDistanceLiveryName('TaithCymru') is true");
assert(LIVERY_ROUTE_TYPES["TaithCymru"]?.includes("long_distance"), "TaithCymru's route-type category is long_distance");
assert(
  liveryVehicleLockReason("TaithCymru", { id: "volvo-9700", category: "Coaches" }) === null,
  "TaithCymru is allowed on a coach",
);
assert(
  liveryVehicleLockReason("TaithCymru", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "TaithCymru is blocked on an ordinary double-decker (same coach-only lock as its siblings)",
);
// Same shape as National Express Welsh: no depot-region nation lock, a
// real route-geometry check instead (taithCymruWalesFractionReason, below).
assert(
  longDistanceNationLockReason("TaithCymru", "North Scotland") === null,
  "TaithCymru has no depot-region nation lock from a Scottish depot region",
);
assert(
  longDistanceNationLockReason("TaithCymru", "North England") === null,
  "TaithCymru has no depot-region nation lock from an England/Wales depot region either",
);
// MegaBus's own former England/Wales nation lock is gone entirely — the
// user's own instruction, "no restrictions on use apart from coaches and
// long distance routes."
assert(
  longDistanceNationLockReason("MegaBus", "West Scotland") === null,
  "MegaBus is no longer nation-locked out of a Scottish depot region",
);
assert(
  longDistanceNationLockReason("MegaBus", "North England") === null,
  "MegaBus still has no lock from an England/Wales depot region either (unchanged, just no longer the only region it allows)",
);
assert(
  longDistanceNationLockReason("National Express", "West Scotland") !== null,
  "plain National Express, by contrast, IS still nation-locked out of Scottish depot regions — unaffected by this change",
);
assert(
  liveryVehicleLockReason("MegaBus", { id: "volvo-9700", category: "Coaches" }) === null,
  "MegaBus is still allowed on a coach (vehicle lock unchanged)",
);
assert(
  liveryVehicleLockReason("MegaBus", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "MegaBus is still blocked on an ordinary double-decker (vehicle lock unchanged)",
);

// --- TrawsCymru — new standalone LOCAL Welsh operator (2026-11-19),
// distinct from TaithCymru's long-distance coach role above. ---
assert(REAL_LIVERY_COLOURS["TrawsCymru"]?.primary === "#00693e", "TrawsCymru's primary colour");
assert(REAL_LIVERY_COLOURS["TrawsCymru"]?.secondary === "#ffffff", "TrawsCymru's secondary colour");
assert(OPERATOR_LIVERIES["TrawsCymru"]?.includes("TrawsCymru"), "TrawsCymru is a standalone operator");
assert(!LONG_DISTANCE_LIVERY_NAMES.includes("TrawsCymru"), "TrawsCymru is NOT a long-distance livery — it's the local operator");
assert(!isLongDistanceLiveryName("TrawsCymru"), "isLongDistanceLiveryName('TrawsCymru') is false");
assert(LIVERY_ROUTE_TYPES["TrawsCymru"]?.includes("local_night"), "TrawsCymru's route-type category is local_night, not long_distance");
assert(
  liveryVehicleLockReason("TrawsCymru", { id: "adl-enviro400", category: "Double-deckers" }) === null,
  "TrawsCymru is allowed on an ordinary double-decker — no coach-only lock, unlike the long-distance operators",
);
assert(
  liveryVehicleLockReason("TrawsCymru", { id: "volvo-9700", category: "Coaches" }) !== null,
  "TrawsCymru is blocked on a coach (coaches aren't in VEHICLE_ROUTE_TYPES's local_night list)",
);

// --- Oxford Tube's own locks (2026-11-19) — stays in the game (not
// removed), excluded only from the contract-failure mechanic, locked to
// the Volvo 9700DD specifically (not any coach) and long_distance routes.
assert(LIVERY_ROUTE_TYPES["Oxford Tube"]?.includes("long_distance"), "Oxford Tube's route-type category is long_distance");
assert(
  liveryVehicleLockReason("Oxford Tube", { id: "volvo-9700dd", category: "Coaches" }) === null,
  "Oxford Tube is allowed on the Volvo 9700DD",
);
assert(
  liveryVehicleLockReason("Oxford Tube", { id: "volvo-9700", category: "Coaches" }) !== null,
  "Oxford Tube is blocked on the plain Volvo 9700 (a coach, but not the DD) — a stricter lock than the general coach-only rule",
);
assert(
  liveryVehicleLockReason("Oxford Tube", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "Oxford Tube is blocked on an ordinary double-decker",
);

// --- National Express Local Electric — new livery (2026-11-20), auto-
// applied on repower (electron/db.verify.mts has the real repower
// round-trip test; this covers just the static livery data here). ---
assert(REAL_LIVERY_COLOURS["National Express Local Electric"]?.primary === "#495D70", "National Express Local Electric shares its base livery's real colour pair");
assert(REAL_LIVERY_COLOURS["National Express Local Electric"]?.secondary === "#64E0F7", "National Express Local Electric's secondary colour matches the base too");
assert(OPERATOR_LIVERIES["National Express"]?.includes("National Express Local Electric"), "National Express Local Electric sits in the National Express operator group");
assert(LIVERY_ROUTE_TYPES["National Express Local Electric"]?.includes("local_night"), "National Express Local Electric's route-type category matches its base livery");
assert(LIVERY_LINKED_TO["National Express Local Electric"]?.includes("National Express Local"), "National Express Local Electric rides along wherever National Express Local is available, same shape as Stagecoach Electric");
assert(
  liveryVehicleLockReason("National Express Local Electric", { id: "adl-enviro400", category: "Double-deckers" }, "electric") === null,
  "National Express Local Electric is allowed on a real electric vehicle",
);
assert(
  liveryVehicleLockReason("National Express Local Electric", { id: "adl-enviro400", category: "Double-deckers" }, "diesel") !== null,
  "National Express Local Electric is blocked on a diesel vehicle",
);
assert(
  liveryVehicleLockReason("National Express Local Electric", { id: "adl-enviro400", category: "Double-deckers" }) === null,
  "National Express Local Electric is unblocked when powerType isn't known yet (can't check it, don't block it)",
);
assert(ELECTRIC_LIVERY_VARIANT["National Express Local"] === "National Express Local Electric", "the real auto-switch pairing exists");
assert(
  !Object.values(ELECTRIC_LIVERY_VARIANT).includes("Stagecoach Electric") && !("Stagecoach" in ELECTRIC_LIVERY_VARIANT) && !("Stagecoach Dark" in ELECTRIC_LIVERY_VARIANT),
  "Stagecoach Electric is deliberately absent from the auto-switch map — stays a manual pick, the user's own words: \"that's a special livery only for a few selected buses\"",
);

// --- Irish Citylink and Translink — new liveries (2026-11-15). ---
assert(REAL_LIVERY_COLOURS["Irish Citylink"]?.primary === "#fce908", "Irish Citylink's primary colour (real, sampled from the supplied badge PNG)");
assert(REAL_LIVERY_COLOURS["Irish Citylink"]?.secondary === "#1eadfb", "Irish Citylink's secondary colour");
assert(REAL_LIVERY_COLOURS.Translink?.primary === "#eb167e", "Translink's primary colour (real, sampled from the supplied badge PNG)");
assert(REAL_LIVERY_COLOURS.Translink?.secondary === "#ffffff", "Translink's secondary colour");
assert(OPERATOR_LIVERIES["Irish Citylink"]?.includes("Irish Citylink"), "Irish Citylink is its own standalone operator");
assert(OPERATOR_LIVERIES.Translink?.includes("Translink"), "Translink is its own standalone operator");

// nationForRegion's new "ireland" branch — inferred, not confirmed
// against any real depot-group region (see the function's own comment).
assert(nationForRegion("Northern Ireland") === "ireland", "a 'Northern Ireland' region resolves to the new ireland nation");
assert(nationForRegion("Ireland") === "ireland", "a plain 'Ireland' region resolves to the ireland nation too");
assert(nationForRegion("West Scotland") === "scotland", "an existing Scottish region is unaffected by the new ireland branch");
assert(nationForRegion("North England") === "england-wales", "an existing England/Wales region is unaffected");

// Irish Citylink: coach-only, Ireland-only, long-distance-only.
assert(LONG_DISTANCE_LIVERY_NAMES.includes("Irish Citylink"), "Irish Citylink is a long-distance livery");
assert(isLongDistanceLiveryName("Irish Citylink"), "isLongDistanceLiveryName('Irish Citylink') is true");
assert(LIVERY_ROUTE_TYPES["Irish Citylink"]?.includes("long_distance"), "Irish Citylink's route-type category is long_distance");
assert(liveryVehicleLockReason("Irish Citylink", { id: "volvo-9700", category: "Coaches" }) === null, "Irish Citylink is allowed on a coach");
assert(
  liveryVehicleLockReason("Irish Citylink", { id: "adl-enviro400", category: "Double-deckers" }) !== null,
  "Irish Citylink is blocked on an ordinary double-decker",
);
assert(longDistanceNationLockReason("Irish Citylink", "Northern Ireland") === null, "Irish Citylink is allowed from an Ireland depot region");
assert(longDistanceNationLockReason("Irish Citylink", "West Scotland") !== null, "Irish Citylink is blocked from a Scottish depot region");
assert(longDistanceNationLockReason("Irish Citylink", "North England") !== null, "Irish Citylink is blocked from an England/Wales depot region");
assert(
  liveryEligibleForRoute("Irish Citylink", { routeType: "long_distance", number: "1" }, { name: "Dublin", region: "Ireland" }),
  "Irish Citylink is eligible for a long-distance route from an Ireland depot group",
);
assert(
  !liveryEligibleForRoute("Irish Citylink", { routeType: "ordinary", number: "1" }, { name: "Dublin", region: "Ireland" }),
  "Irish Citylink is NOT eligible for an ordinary route, even from an Ireland depot group",
);
assert(
  !liveryEligibleForRoute("Irish Citylink", { routeType: "long_distance", number: "1" }, { name: "Glasgow", region: "West Scotland" }),
  "Irish Citylink is NOT eligible for a long-distance route from a Scottish depot group",
);

// Translink: any vehicle except coaches, Ireland-only, no route-type
// restriction of its own.
assert(liveryVehicleLockReason("Translink", { id: "adl-enviro400", category: "Double-deckers" }) === null, "Translink is allowed on an ordinary double-decker");
assert(liveryVehicleLockReason("Translink", { id: "adl-enviro200", category: "Single-deckers / midibuses" }) === null, "Translink is allowed on a single-decker");
assert(liveryVehicleLockReason("Translink", { id: "volvo-9700", category: "Coaches" }) !== null, "Translink is blocked on a coach");
assert(!LONG_DISTANCE_LIVERY_NAMES.includes("Translink"), "Translink is not a long-distance livery");
assert(LIVERY_ROUTE_TYPES.Translink === undefined, "Translink has no route-type restriction of its own");
assert(translinkNationReason("Translink", "Northern Ireland") === null, "Translink is allowed from an Ireland depot region");
assert(translinkNationReason("Translink", "West Scotland") !== null, "Translink is blocked from a Scottish depot region");
assert(translinkNationReason("National Express", "West Scotland") === null, "translinkNationReason is a no-op for every other livery");
assert(translinkNationReason("Translink", undefined) === null, "no depot-group region known yet does not block Translink");
assert(
  liveryEligibleForRoute("Translink", { routeType: "ordinary", number: "1" }, { name: "Belfast", region: "Northern Ireland" }),
  "Translink is eligible for an ordinary route from an Ireland depot group",
);
assert(
  !liveryEligibleForRoute("Translink", { routeType: "ordinary", number: "1" }, { name: "Glasgow", region: "West Scotland" }),
  "Translink is NOT eligible for a route from a Scottish depot group",
);
assert(
  liveryUnavailableReason("Translink", { id: "volvo-9700", category: "Coaches" }, { name: "Belfast", region: "Northern Ireland" }) !== null,
  "liveryUnavailableReason blocks Translink on a coach even in an Ireland depot group",
);
assert(
  liveryUnavailableReason("Translink", { id: "adl-enviro400", category: "Double-deckers" }, { name: "Glasgow", region: "West Scotland" }) !== null,
  "liveryUnavailableReason blocks Translink outside Ireland even on an allowed vehicle",
);

// --- Thistle Coaches (added 2026-11-19) — the competitor's own livery,
// built for the Fixed real contracts failure mechanic
// (fixed-contract-failures.mts). White primary is the confirmed real
// colour; the thistle-purple secondary is this model's own flagged
// estimate. ---
assert(REAL_LIVERY_COLOURS["Thistle Coaches"]?.primary === "#ffffff", "Thistle Coaches is plain white primary, the confirmed real colour");
assert(liveryOperator("Thistle Coaches") === "Thistle Coaches", "Thistle Coaches is its own standalone operator, same shape as Citylink/MegaBus");

// No vehicle-type lock at all — it needs to be able to cover any of the
// four in-scope contracts, including coach-only Airlink 100 and
// electric-single-deck-only 398.
assert(liveryVehicleLockReason("Thistle Coaches", { id: "volvo-9700", category: "Coaches" }) === null, "Thistle Coaches is allowed on a coach (needed to cover Airlink 100)");
assert(liveryVehicleLockReason("Thistle Coaches", { id: "adl-enviro400", category: "Double-deckers" }) === null, "Thistle Coaches is allowed on a double-decker (needed to cover Express 500)");
assert(liveryVehicleLockReason("Thistle Coaches", { id: "adl-enviro200", category: "Single-deckers / midibuses" }, "electric") === null, "Thistle Coaches is allowed on an electric single-decker (needed to cover 398)");
assert(LIVERY_ROUTE_TYPES["Thistle Coaches"] === undefined, "Thistle Coaches has no route-type restriction of its own — genuinely unrestricted, not merely permissive for every category");

// Never player-selectable: locked to a sentinel route number ("Thistle
// Coaches") that no real player route can ever have, so it's blocked in
// every real scenario via the SAME mechanism every other specific-route
// livery already uses (LIVERY_SPECIFIC_ROUTE) — no bespoke "hide this
// livery" flag needed.
assert(LIVERY_SPECIFIC_ROUTE["Thistle Coaches"] === "Thistle Coaches", "Thistle Coaches is locked to its own sentinel route number");
assert(liverySpecificRouteReason("Thistle Coaches", { number: "398" }) !== null, "Thistle Coaches is blocked for an ordinary route number like 398");
assert(liverySpecificRouteReason("Thistle Coaches", { number: "Airlink 100" }) !== null, "Thistle Coaches is blocked even for another contract's own real route number");
assert(liverySpecificRouteReason("Thistle Coaches", { number: "Thistle Coaches" }) === null, "the sentinel number itself would pass (by construction, since no player route can ever actually be numbered this)");
assert(
  liveryUnavailableReason("Thistle Coaches", { id: "adl-enviro400", category: "Double-deckers" }, { name: "Glasgow", region: "West Scotland" }, undefined, undefined, { number: "500" }) !== null,
  "liveryUnavailableReason blocks Thistle Coaches for a real route (Express 500's own route number), confirming it never appears in the buy/configure picker",
);
assert(
  !liveryEligibleForRoute("Thistle Coaches", { routeType: "ordinary", number: "52" }, { name: "Glasgow", region: "West Scotland" }),
  "liveryEligibleForRoute blocks Thistle Coaches for an ordinary player route, confirming it never appears in route branding or the random per-journey livery picker",
);

// --- Airlink 100's own Lothian/Enviro400 XLB fallback (2026-11-15) ---
const airlinkLivery = { id: 1, name: "Airlink 100" };
const girraffeLivery = { id: 2, name: "Lothian Girraffe" };
const otherLivery = { id: 3, name: "Stagecoach" };
const fallbackLiveries = [airlinkLivery, girraffeLivery, otherLivery];
const properVehicle = { id: 10, depotGroupId: 1, modelId: "adl-enviro400", liveryId: airlinkLivery.id };
const girraffeVehicle = { id: 11, depotGroupId: 1, modelId: "adl-enviro400", liveryId: girraffeLivery.id };
const xlbVehicle = { id: 12, depotGroupId: 1, modelId: "adl-enviro400-xlb", liveryId: otherLivery.id };
const otherDepotVehicle = { id: 13, depotGroupId: 2, modelId: "adl-enviro400-xlb", liveryId: otherLivery.id };

assert(
  airlinkLothianFallbackEligible(1, [properVehicle, xlbVehicle], fallbackLiveries, new Set([properVehicle.id])) === true,
  "fallback is eligible: the only proper-liveried vehicle is away, and an XLB is owned",
);
assert(
  airlinkLothianFallbackEligible(1, [properVehicle, xlbVehicle], fallbackLiveries, new Set()) === false,
  "fallback is NOT eligible: the proper-liveried vehicle is available (not away)",
);
assert(
  airlinkLothianFallbackEligible(1, [properVehicle, girraffeVehicle, xlbVehicle], fallbackLiveries, new Set([properVehicle.id])) === false,
  "fallback is NOT eligible: one proper-liveried vehicle (Girraffe) is still available even though the other is away",
);
assert(
  airlinkLothianFallbackEligible(1, [xlbVehicle], fallbackLiveries, new Set()) === false,
  "fallback is NOT eligible with zero Airlink 100/Girraffe vehicles owned at all — nothing to fall back from, can't fake it",
);
assert(
  airlinkLothianFallbackEligible(1, [properVehicle], fallbackLiveries, new Set([properVehicle.id])) === false,
  "fallback is NOT eligible when the depot group owns no real Enviro400 XLB to actually use as the stand-in",
);
assert(
  airlinkLothianFallbackEligible(2, [properVehicle, xlbVehicle], fallbackLiveries, new Set([properVehicle.id])) === false,
  "fallback only ever considers vehicles the SAME depot group owns — a different group's away vehicle doesn't count",
);
assert(
  airlinkLothianFallbackEligible(2, [otherDepotVehicle], fallbackLiveries, new Set()) === false,
  "a depot group that owns only an XLB under a different livery, with no Airlink 100/Girraffe vehicle at all, still has nothing to fall back from",
);

const airlinkRoute = { routeType: "airport_express" as const, number: "Airlink 100" };
assert(
  liveryEligibleForRoute("Lothian", airlinkRoute, undefined, true) === true,
  "liveryEligibleForRoute allows plain Lothian on Airlink 100 when the fallback flag is set, bypassing its normal local_night-only lock",
);
assert(
  liveryEligibleForRoute("Lothian", airlinkRoute, undefined, false) === false,
  "liveryEligibleForRoute still blocks plain Lothian on Airlink 100 when the fallback flag is explicitly false",
);
assert(
  liveryEligibleForRoute("Lothian", airlinkRoute, undefined) === false,
  "liveryEligibleForRoute still blocks plain Lothian on Airlink 100 when the fallback flag is omitted entirely (same as false)",
);
assert(
  liveryEligibleForRoute("Lothian", { routeType: "airport_express", number: "SkyLink" }, undefined, true) === false,
  "the fallback flag only ever affects route Airlink 100 specifically, never any other route (even another airport_express one)",
);
assert(
  liveryEligibleForRoute("Stagecoach", airlinkRoute, undefined, true) === false,
  "the fallback flag only ever affects the plain Lothian livery specifically, never any other livery",
);

console.log("All synchronous livery-seed-data checks passed.");

// --- National Express Scottish's real Scotland-terminus restriction
// (T190, 2026-11-14) — needs the real WASM module and the real
// scotland_boundary.bin artefact actually loaded, see the header comment
// above for why this spins up its own throwaway local server. ---
async function runScotlandTerminusChecks(): Promise<void> {
  const wasmBytes = fs.readFileSync(new URL("./wasm/game_wasm_bg.wasm", import.meta.url));
  initSync({ module: wasmBytes });

  const boundaryBytes = fs.readFileSync("pipeline-data/scotland_boundary.bin");
  const server = http.createServer((req, res) => {
    if (req.url === "/scotland_boundary.bin") {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(boundaryBytes);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(38271, resolve);
  });

  try {
    await loadScotlandBoundary();

    // Real coordinates, same reference towns the Rust-side test uses —
    // this is the check that actually proves the real artefact loaded
    // and is being read correctly end to end (TS fetch -> WASM decode ->
    // ray-cast), not trusting the Rust test alone.
    assert(isPointInScotland(-3.1883, 55.9533) === true, "Edinburgh is inside the real Scotland boundary");
    assert(isPointInScotland(-4.2518, 55.8642) === true, "Glasgow is inside the real Scotland boundary");
    assert(isPointInScotland(-2.9382, 54.8951) === false, "Carlisle is NOT inside the real Scotland boundary (unlike the extended extract boundary)");
    assert(isPointInScotland(-0.1276, 51.5072) === false, "London is NOT inside the real Scotland boundary");

    const edinburgh = { lon: -3.1883, lat: 55.9533 };
    const glasgow = { lon: -4.2518, lat: 55.8642 };
    const london = { lon: -0.1276, lat: 51.5072 };
    const manchester = { lon: -2.2426, lat: 53.4808 };

    // Both termini outside Scotland: blocked.
    assert(
      nationalExpressScottishTerminusReason("National Express Scottish", [london, manchester]) !== null,
      "National Express Scottish is blocked when neither terminus is in Scotland",
    );
    // Outer (first) terminus in Scotland, other end in England: allowed —
    // "at least one terminus," confirmed interpretation.
    assert(
      nationalExpressScottishTerminusReason("National Express Scottish", [edinburgh, london]) === null,
      "National Express Scottish is allowed when the FIRST terminus is in Scotland",
    );
    // Other way round — the LAST point, not the first, is the one in
    // Scotland.
    assert(
      nationalExpressScottishTerminusReason("National Express Scottish", [london, glasgow]) === null,
      "National Express Scottish is allowed when the LAST terminus is in Scotland",
    );
    // An intermediate point being in Scotland doesn't count — only the
    // two endpoints, confirmed interpretation ("just the two endpoints,
    // not every intermediate stop").
    assert(
      nationalExpressScottishTerminusReason("National Express Scottish", [london, edinburgh, manchester]) !== null,
      "an in-Scotland INTERMEDIATE point does not count — only the first/last points are checked",
    );

    // Same checks through liveryEligibleForRoute (route branding/journey
    // livery picker) and liveryUnavailableReason (the buy-menu Configure
    // check) — both must actually apply the terminus check, not just the
    // standalone helper function.
    const longDistanceRoute = { routeType: "long_distance" as const, number: "NX1" };
    assert(
      liveryEligibleForRoute("National Express Scottish", { ...longDistanceRoute, points: [london, manchester] }, undefined) === false,
      "liveryEligibleForRoute blocks National Express Scottish when neither terminus is in Scotland",
    );
    assert(
      liveryEligibleForRoute("National Express Scottish", { ...longDistanceRoute, points: [edinburgh, london] }, undefined) === true,
      "liveryEligibleForRoute allows National Express Scottish when a terminus is in Scotland",
    );
    assert(
      liveryEligibleForRoute("National Express Scottish", { ...longDistanceRoute, points: undefined }, undefined) === true,
      "liveryEligibleForRoute does not block National Express Scottish when points aren't known at all (route.routeType is long_distance, no depot-group lock, nothing else to object)",
    );
    assert(
      liveryUnavailableReason("National Express Scottish", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1", points: [london, manchester] }) !== null,
      "liveryUnavailableReason blocks National Express Scottish when neither terminus is in Scotland",
    );
    assert(
      liveryUnavailableReason("National Express Scottish", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1", points: [edinburgh, london] }) === null,
      "liveryUnavailableReason allows National Express Scottish when a terminus is in Scotland",
    );
    assert(
      liveryUnavailableReason("National Express Scottish", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1" }) === null,
      "liveryUnavailableReason does not block National Express Scottish when route.points is absent entirely",
    );

    console.log("All real-Scotland-boundary checks passed.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// --- National Express Welsh's real Wales-terminus restriction
// (2026-11-15) — exact mirror of runScotlandTerminusChecks above, Wales
// instead of Scotland. Run sequentially after it (not concurrently —
// both throwaway servers bind the same port 38271, one at a time, same
// as the real app only ever needs one at once). ---
async function runWalesTerminusChecks(): Promise<void> {
  const boundaryBytes = fs.readFileSync("pipeline-data/wales_boundary.bin");
  const server = http.createServer((req, res) => {
    if (req.url === "/wales_boundary.bin") {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(boundaryBytes);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(38271, resolve);
  });

  try {
    await loadWalesBoundary();

    // Real coordinates, same reference towns the Rust-side test uses.
    assert(isPointInWales(-3.1791, 51.4816) === true, "Cardiff is inside the real Wales boundary");
    assert(isPointInWales(-3.9436, 51.6214) === true, "Swansea is inside the real Wales boundary");
    assert(isPointInWales(-2.5879, 51.4545) === false, "Bristol is NOT inside the real Wales boundary");
    assert(isPointInWales(-0.1276, 51.5072) === false, "London is NOT inside the real Wales boundary");

    const cardiff = { lon: -3.1791, lat: 51.4816 };
    const swansea = { lon: -3.9436, lat: 51.6214 };
    const london = { lon: -0.1276, lat: 51.5072 };
    const manchester = { lon: -2.2426, lat: 53.4808 };
    const bristol = { lon: -2.5879, lat: 51.4545 };

    // Both termini outside Wales: blocked.
    assert(
      nationalExpressWelshTerminusReason("National Express Welsh", [london, manchester]) !== null,
      "National Express Welsh is blocked when neither terminus is in Wales",
    );
    // Outer (first) terminus in Wales, other end in England: allowed —
    // "at least one terminus," same confirmed interpretation as Scottish.
    assert(
      nationalExpressWelshTerminusReason("National Express Welsh", [cardiff, london]) === null,
      "National Express Welsh is allowed when the FIRST terminus is in Wales",
    );
    // Other way round — the LAST point, not the first, is the one in
    // Wales.
    assert(
      nationalExpressWelshTerminusReason("National Express Welsh", [london, swansea]) === null,
      "National Express Welsh is allowed when the LAST terminus is in Wales",
    );
    // An intermediate point being in Wales doesn't count — only the two
    // endpoints, same confirmed interpretation as Scottish.
    assert(
      nationalExpressWelshTerminusReason("National Express Welsh", [london, cardiff, manchester]) !== null,
      "an in-Wales INTERMEDIATE point does not count — only the first/last points are checked",
    );

    // Same checks through liveryEligibleForRoute (route branding/journey
    // livery picker) and liveryUnavailableReason (the buy-menu Configure
    // check) — both must actually apply the terminus check, not just the
    // standalone helper function.
    const longDistanceRoute = { routeType: "long_distance" as const, number: "NX1" };
    assert(
      liveryEligibleForRoute("National Express Welsh", { ...longDistanceRoute, points: [london, manchester] }, undefined) === false,
      "liveryEligibleForRoute blocks National Express Welsh when neither terminus is in Wales",
    );
    assert(
      liveryEligibleForRoute("National Express Welsh", { ...longDistanceRoute, points: [cardiff, london] }, undefined) === true,
      "liveryEligibleForRoute allows National Express Welsh when a terminus is in Wales",
    );
    assert(
      liveryEligibleForRoute("National Express Welsh", { ...longDistanceRoute, points: undefined }, undefined) === true,
      "liveryEligibleForRoute does not block National Express Welsh when points aren't known at all",
    );
    assert(
      liveryUnavailableReason("National Express Welsh", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1", points: [london, manchester] }) !== null,
      "liveryUnavailableReason blocks National Express Welsh when neither terminus is in Wales",
    );
    assert(
      liveryUnavailableReason("National Express Welsh", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1", points: [cardiff, london] }) === null,
      "liveryUnavailableReason allows National Express Welsh when a terminus is in Wales",
    );
    assert(
      liveryUnavailableReason("National Express Welsh", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1" }) === null,
      "liveryUnavailableReason does not block National Express Welsh when route.points is absent entirely",
    );

    // TaithCymru's own 85%-of-route-length rule (2026-11-19, replacing its
    // original terminus-only check) — real distance-weighted fraction
    // against the same Wales boundary data already loaded above.
    // TaithCymru's own 85%-of-route-length rule (2026-11-19, replacing its
    // original terminus-only check) — real distance-weighted fraction
    // against the same Wales boundary data already loaded above. Each
    // route below is real-world geography with its own fraction computed
    // directly by the function under test (routeWalesFraction) and
    // verified once by hand against isPointInWales on the borderline
    // points (see the midpoint checks that used to sit here), not
    // hand-calculated — this project's own "measure, don't guess"
    // convention for anything involving real-world geometry.
    const holyhead = { lon: -4.6306, lat: 53.31 }; // deep in north-west Wales
    const hereford = { lon: -2.7194, lat: 52.0567 }; // England, but the Cardiff-Hereford midpoint still falls in Wales (Monmouthshire's own real eastward bulge)
    const worcester = { lon: -2.22, lat: 52.192 }; // England, far enough east that the Hereford-Worcester midpoint is genuinely in England

    assert(routeWalesFraction([cardiff, swansea]) === 1, "a route entirely within Wales is 100% Wales");
    assert(routeWalesFraction([london, bristol]) === 0, "a route entirely within England is 0% Wales");
    assert(routeWalesFraction(undefined) === null, "no points at all (draft route not yet known) returns null, not 0");
    assert(routeWalesFraction([cardiff]) === null, "a single point (no real segment yet) returns null");
    // A real mixed route, well under 85%: London->Bristol->Cardiff->Swansea.
    const londonToSwansea = routeWalesFraction([london, bristol, cardiff, swansea]);
    assert(londonToSwansea !== null && londonToSwansea < 0.85, "a route that's mostly England with a Wales tail stays well under 85%");
    // A real mixed route, ABOVE 85%: a long Wales-only leg (Holyhead to
    // Cardiff) plus a short England dip (Hereford to Worcester) — proves
    // the threshold genuinely checks a real proportion, not just 0%/100%.
    const holyheadToWorcester = routeWalesFraction([holyhead, cardiff, hereford, worcester]);
    assert(holyheadToWorcester !== null && holyheadToWorcester >= 0.85, "a mostly-Wales route with a short England dip clears the 85% threshold");
    // The same route with the long Wales leg shortened to Swansea instead
    // of Holyhead falls back under 85%.
    const swanseaToWorcester = routeWalesFraction([swansea, cardiff, hereford, worcester]);
    assert(swanseaToWorcester !== null && swanseaToWorcester < 0.85, "shortening the Wales leg drops the same route back under 85%");

    assert(
      taithCymruWalesFractionReason("TaithCymru", [holyhead, cardiff, hereford, worcester]) === null,
      "TaithCymru is allowed on a route that's at least 85% in Wales",
    );
    assert(
      taithCymruWalesFractionReason("TaithCymru", [swansea, cardiff, hereford, worcester]) !== null,
      "TaithCymru is blocked on a route that's under 85% in Wales",
    );
    assert(
      taithCymruWalesFractionReason("National Express", [swansea, cardiff, hereford, worcester]) === null,
      "TaithCymru's 85% rule is a no-op for other liveries (plain National Express is unaffected, it's the natural fallback)",
    );
    assert(taithCymruWalesFractionReason("TaithCymru", undefined) === null, "no points at all (draft route not yet known) does not block");
    assert(taithCymruWalesFractionReason("TaithCymru", []) === null, "an empty points array does not block");
    assert(
      liveryEligibleForRoute("TaithCymru", { ...longDistanceRoute, points: [holyhead, cardiff, hereford, worcester] }, undefined) === true,
      "liveryEligibleForRoute allows TaithCymru on an 85%+ Wales route",
    );
    assert(
      liveryEligibleForRoute("TaithCymru", { ...longDistanceRoute, points: [swansea, cardiff, hereford, worcester] }, undefined) === false,
      "liveryEligibleForRoute blocks TaithCymru on a sub-85% Wales route",
    );
    assert(
      liveryUnavailableReason("TaithCymru", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1", points: [holyhead, cardiff, hereford, worcester] }) === null,
      "liveryUnavailableReason allows TaithCymru on an 85%+ Wales route",
    );
    assert(
      liveryUnavailableReason("TaithCymru", { id: "volvo-9700", category: "Coaches" }, undefined, undefined, undefined, { number: "NX1", points: [swansea, cardiff, hereford, worcester] }) !== null,
      "liveryUnavailableReason blocks TaithCymru on a sub-85% Wales route",
    );

    // TrawsCymru's own terminus check (2026-11-19) — same shape as
    // National Express Welsh's, same real boundary data.
    assert(
      trawsCymruTerminusReason("TrawsCymru", [london, manchester]) !== null,
      "TrawsCymru is blocked when neither terminus is in Wales",
    );
    assert(
      trawsCymruTerminusReason("TrawsCymru", [cardiff, london]) === null,
      "TrawsCymru is allowed when the FIRST terminus is in Wales",
    );
    assert(
      trawsCymruTerminusReason("TrawsCymru", [london, swansea]) === null,
      "TrawsCymru is allowed when the LAST terminus is in Wales",
    );
    assert(trawsCymruTerminusReason("TrawsCymru", undefined) === null, "no points at all (draft route not yet known) does not block");
    assert(trawsCymruTerminusReason("TrawsCymru", []) === null, "an empty points array does not block");
    const localRoute = { routeType: "ordinary" as const, number: "T1" };
    assert(
      liveryEligibleForRoute("TrawsCymru", { ...localRoute, points: [london, manchester] }, undefined) === false,
      "liveryEligibleForRoute blocks TrawsCymru when neither terminus is in Wales",
    );
    assert(
      liveryEligibleForRoute("TrawsCymru", { ...localRoute, points: [cardiff, london] }, undefined) === true,
      "liveryEligibleForRoute allows TrawsCymru when a terminus is in Wales",
    );
    assert(
      liveryUnavailableReason("TrawsCymru", { id: "adl-enviro400", category: "Double-deckers" }, undefined, undefined, undefined, { number: "T1", points: [london, manchester] }) !== null,
      "liveryUnavailableReason blocks TrawsCymru when neither terminus is in Wales",
    );
    assert(
      liveryUnavailableReason("TrawsCymru", { id: "adl-enviro400", category: "Double-deckers" }, undefined, undefined, undefined, { number: "T1", points: [cardiff, london] }) === null,
      "liveryUnavailableReason allows TrawsCymru when a terminus is in Wales",
    );

    console.log("All real-Wales-boundary checks passed.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// --- D&E + Sprinter lock for Dounreay's own 800/803/805 (OPEN-ITEMS.md
// "Three further contracts — 800, 803 & 805", settled 2026-11-19/20) -----
{
  const sprinter = { id: "evm-cityline", category: "Minibus" };
  const ordinaryMinibus = { id: "some-other-minibus", category: "Minibus" };
  const caithness = { name: "Caithness", region: "North Scotland" };

  assert(
    liveryUnavailableReason("D&E", sprinter, caithness, undefined, undefined, { number: "800" }) === null,
    "D&E on the Sprinter on route 800 is allowed",
  );
  assert(
    liveryUnavailableReason("D&E", ordinaryMinibus, caithness, undefined, undefined, { number: "803" }) !== null,
    "D&E on a non-Sprinter minibus on route 803 is blocked",
  );
  assert(
    liveryUnavailableReason("D&E", ordinaryMinibus, caithness, undefined, undefined, { number: "805" }) !== null,
    "D&E on a non-Sprinter minibus on route 805 is blocked",
  );
  // The whole point of this lock being route-NUMBER-keyed, not a blanket
  // D&E rule: D&E on an ORDINARY Caithness route (any other number, or no
  // route at all) is NOT Sprinter-locked — it keeps its existing, more
  // general area-based behaviour untouched.
  assert(
    liveryUnavailableReason("D&E", ordinaryMinibus, caithness, undefined, undefined, { number: "74" }) === null,
    "D&E on an ordinary Caithness minibus route (not 800/803/805) is NOT Sprinter-locked",
  );
  assert(
    liveryUnavailableReason("D&E", ordinaryMinibus, caithness) === null,
    "D&E with no route specified at all is NOT Sprinter-locked (only 800/803/805 specifically trigger it)",
  );
}

await runScotlandTerminusChecks();
await runWalesTerminusChecks();
console.log("All livery-seed-data (private hire + Ember removal + T190 livery cleanup/National Express Scottish + National Express Welsh) checks passed.");
