// Manual verification script for db.ts, run directly with `node electron/db.verify.ts`
// (Node's native TypeScript support — no build step). Not a permanent test
// suite, just a smoke check for the save-file/override-layer plumbing until
// a real test runner is set up.
import {
  openSave,
  createDepotGroup,
  listDepotGroups,
  renameDepotGroup,
  setDepotGroupTicketMachineTier,
  setDepotGroupTapOnTapOff,
  setOverride,
  getOverride,
  hasOverride,
  resetOverride,
  listOverrides,
  createRoute,
  listRoutes,
  updateRoute,
  deleteRoute,
  createLongDistanceSection,
  listLongDistanceSections,
  renameLongDistanceSection,
  setLongDistanceSectionPoints,
  deleteLongDistanceSection,
  setRoutePickupDropoffOverride,
  setRouteTimingPoint,
  setRouteColour,
  setRouteVehicleRestrictions,
  upsertRouteTimetable,
  listRouteTimetablesForRoute,
  listAllRouteTimetables,
  deleteRouteTimetable,
  createPlayerStop,
  listPlayerStops,
  deletePlayerStop,
  createDepotStop,
  createDepot,
  listDepots,
  listDepotEntrances,
  listAllDepotEntrances,
  renameDepot,
  addDepotEntrance,
  setDepotEntranceMode,
  deleteDepotEntrance,
  deleteDepot,
  createStopGroup,
  listStopGroupIds,
  createPlayerBusStation,
  listPlayerBusStationIds,
  createDuty,
  deleteDuty,
  setDutyLocked,
  renameDuty,
  setDutyDriver,
  createDriver,
  listDriversForDepotGroup,
  renameDriver,
  setDriverScore,
  deleteDriver,
  addDutyPiece,
  removeDutyPiece,
  listDutiesForDepotGroup,
  buyVehicle,
  listVehiclesForDepotGroup,
  listAllVehicles,
  deleteVehicle,
  transferVehicle,
  createLivery,
  addBasketItem,
  listBasket,
  setBasketItemQuantity,
  setBasketItemDepot,
  setBasketItemLivery,
  removeBasketItem,
  placeOrder,
  listOrders,
  collectOrder,
  getGameClock,
  setGameClock,
  getCompanyBalanceGBPPence,
  recordFinanceTransaction,
  listFinanceTransactions,
  SCHEMA_VERSION,
  MONDAY_FRIDAY_MASK,
  SATURDAY_MASK,
  SUNDAY_MASK,
  createDealer,
  listDealers,
  setDealerRepowerSite,
  createRepowerBooking,
  listAllRepowerBookings,
  collectRepowerBooking,
  deleteRepowerBooking,
  listAllStopUpgrades,
  getStopUpgrade,
  installStopUpgrade,
  listGeneratedPrivateHireMonths,
  recordGeneratedPrivateHireMonths,
  listGeneratedLeaseBillingMonths,
  recordLeaseBillingMonths,
} from "./db.mts";
import { unlinkSync, existsSync, copyFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as path2 from "node:path";

const path = "./electron/.verify-save.sqlite";
if (existsSync(path)) unlinkSync(path);

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- fresh save, depot groups ---
let db = openSave(path);
const g1 = createDepotGroup(db, "Edinburgh", "East Scotland");
const g2 = createDepotGroup(db, "Glasgow", "West Scotland");
assert(g1.id === 1 && g2.id === 2, "depot group ids assigned sequentially");

let groups = listDepotGroups(db);
assert(groups.length === 2, "two depot groups listed");
assert(groups[0].name === "Edinburgh" && groups[1].name === "Glasgow", "listed alphabetically");

renameDepotGroup(db, g1.id, "Edinburgh & Lothian");
groups = listDepotGroups(db);
assert(groups.some((g) => g.name === "Edinburgh & Lothian"), "rename took effect");

let threw = false;
try {
  createDepotGroup(db, "Glasgow", "West Scotland");
} catch {
  threw = true;
}
assert(threw, "duplicate depot group name rejected (UNIQUE constraint)");

// --- ticket machine tiers (TICKETING.md §1/§2) ---
assert(g1.ticketMachineTier === "basic" && !g1.hasTapOnTapOff, "a new depot group starts at Basic with no tap-on tap-off");

setDepotGroupTicketMachineTier(db, g1.id, "mid");
groups = listDepotGroups(db);
assert(groups.find((g) => g.id === g1.id)?.ticketMachineTier === "mid", "ticket machine tier change round-trips");

setDepotGroupTapOnTapOff(db, g1.id, true);
groups = listDepotGroups(db);
assert(groups.find((g) => g.id === g1.id)?.hasTapOnTapOff === true, "tap-on tap-off round-trips");

let threwOnBogusTier = false;
try {
  setDepotGroupTicketMachineTier(db, g1.id, "bogus" as "basic");
} catch {
  threwOnBogusTier = true;
}
assert(threwOnBogusTier, "an invalid ticket machine tier is rejected rather than silently stored");

// Setting g1 to Mid (above) should NOT trigger the Advanced ratchet —
// only Advanced itself does. Set g2 to Advanced, then confirm a THIRD
// new group is forced to start there too.
setDepotGroupTicketMachineTier(db, g2.id, "advanced");
const g3 = createDepotGroup(db, "Aberdeen", "East Scotland");
assert(g3.ticketMachineTier === "advanced", "once any group has Advanced, a brand new group must start there too (the ratchet)");

// --- override layer ---
assert(!hasOverride(db, "stop", 12345, "position"), "no override initially");
assert(getOverride(db, "stop", 12345, "position") === undefined, "get returns undefined when absent");

setOverride(db, "stop", 12345, "position", { lon_e7: -32000000, lat_e7: 559000000 });
assert(hasOverride(db, "stop", 12345, "position"), "override exists after set");
const pos = getOverride<{ lon_e7: number; lat_e7: number }>(db, "stop", 12345, "position");
assert(pos?.lon_e7 === -32000000 && pos?.lat_e7 === 559000000, "override value round-trips through JSON");

// overwrite same key
setOverride(db, "stop", 12345, "position", { lon_e7: -32000001, lat_e7: 559000001 });
const pos2 = getOverride<{ lon_e7: number }>(db, "stop", 12345, "position");
assert(pos2?.lon_e7 === -32000001, "setting the same override again updates rather than duplicates");

// a second field on the same entity doesn't collide
setOverride(db, "stop", 12345, "name", "Renamed Stop");
assert(getOverride(db, "stop", 12345, "name") === "Renamed Stop", "second field on same entity independent");
assert(hasOverride(db, "stop", 12345, "position"), "first field untouched by second field's write");

resetOverride(db, "stop", 12345, "position");
assert(!hasOverride(db, "stop", 12345, "position"), "reset removes the override");
assert(hasOverride(db, "stop", 12345, "name"), "reset of one field doesn't touch another");

// --- routes ---
const route = createRoute(
  db,
  g1.id,
  "1",
  [
    { kind: "stop", osmId: 111, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 222, lon: -3.19, lat: 55.96 },
  ],
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
  null,
  null,
);
assert(route.id > 0, "route created with a real id");
assert(listRoutes(db).some((r) => r.id === route.id && r.number === "1"), "created route is listed");
assert(route.colour === "#3b82f6", "route created with the requested colour");
assert(route.name === null, "route created with no name defaults to null");
assert(route.pickupDropoffOverrides.length === 0, "route created with no pickup/dropoff overrides");
assert(route.parentRouteId === null && route.variationLetter === null, "a plain route has no parent/variation letter");

// A lettered variation ("1A") pointing back at "1" as its parent.
const variation = createRoute(
  db,
  g1.id,
  "1A",
  [
    { kind: "stop", osmId: 111, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 333, lon: -3.18, lat: 55.94 },
  ],
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
  route.id,
  "A",
);
assert(variation.parentRouteId === route.id && variation.variationLetter === "A", "a variation stores its parent id and letter");
assert(
  listRoutes(db).find((r) => r.id === variation.id)?.parentRouteId === route.id,
  "the variation's parent id round-trips through listRoutes",
);

// A variation with no real parent row ("route 7A and 7B can exist with no
// 7," DESIGN.md §6) — parentRouteId stays null even though the letter is set.
const orphanVariation = createRoute(
  db,
  g1.id,
  "9A",
  [{ kind: "stop", osmId: 444, lon: -3.2, lat: 55.95 }],
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
  null,
  "A",
);
assert(
  orphanVariation.parentRouteId === null && orphanVariation.variationLetter === "A",
  "a variation letter can be set with no parent route at all",
);

setRoutePickupDropoffOverride(db, route.id, 1, "setdown_only");
let afterOverride = listRoutes(db).find((r) => r.id === route.id)!;
assert(
  afterOverride.pickupDropoffOverrides.length === 1 &&
    afterOverride.pickupDropoffOverrides[0].pointIndex === 1 &&
    afterOverride.pickupDropoffOverrides[0].value === "setdown_only",
  "setRoutePickupDropoffOverride sets an override",
);

setRoutePickupDropoffOverride(db, route.id, 0, "pickup_only");
afterOverride = listRoutes(db).find((r) => r.id === route.id)!;
assert(afterOverride.pickupDropoffOverrides.length === 2, "a second override on a different stop adds rather than replaces");

setRoutePickupDropoffOverride(db, route.id, 1, "pickup_only");
afterOverride = listRoutes(db).find((r) => r.id === route.id)!;
assert(
  afterOverride.pickupDropoffOverrides.length === 2 &&
    afterOverride.pickupDropoffOverrides.find((o) => o.pointIndex === 1)?.value === "pickup_only",
  "setting an override on the same stop again replaces rather than duplicates",
);

setRoutePickupDropoffOverride(db, route.id, 1, null);
afterOverride = listRoutes(db).find((r) => r.id === route.id)!;
assert(
  afterOverride.pickupDropoffOverrides.length === 1 && afterOverride.pickupDropoffOverrides[0].pointIndex === 0,
  "passing null clears an override",
);

assert(route.timingPointIndexes.length === 0, "a new route starts with no timing points");

setRouteTimingPoint(db, route.id, 1, true);
let afterTiming = listRoutes(db).find((r) => r.id === route.id)!;
assert(JSON.stringify(afterTiming.timingPointIndexes) === JSON.stringify([1]), "setRouteTimingPoint flags a point");

setRouteTimingPoint(db, route.id, 0, true);
afterTiming = listRoutes(db).find((r) => r.id === route.id)!;
assert(
  JSON.stringify(afterTiming.timingPointIndexes) === JSON.stringify([0, 1]),
  "a second flagged point adds rather than replaces, and the list stays sorted",
);

setRouteTimingPoint(db, route.id, 1, false);
afterTiming = listRoutes(db).find((r) => r.id === route.id)!;
assert(
  JSON.stringify(afterTiming.timingPointIndexes) === JSON.stringify([0]),
  "unflagging a point removes just that one",
);

setRouteTimingPoint(db, route.id, 0, false);

// createRoute/updateRoute's own timingPointIndexes parameter (2026-11-07,
// live request: "when making a route there is no way to set a timing
// point" / "timing points should also be copied between variations") —
// route-draw.ts's draft checkboxes land here directly on Save, rather
// than only ever being reachable via the separate setRouteTimingPoint
// path above (route-panel.ts's locked stop list, timetable-editing mode).
const routeWithTiming = createRoute(
  db,
  g1.id,
  "2",
  [
    { kind: "stop", osmId: 555, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 666, lon: -3.19, lat: 55.96 },
    { kind: "stop", osmId: 777, lon: -3.18, lat: 55.97 },
  ],
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
  null,
  null,
  [],
  [],
  [],
  "ordinary",
  false,
  [1],
);
assert(
  JSON.stringify(routeWithTiming.timingPointIndexes) === JSON.stringify([1]),
  "createRoute accepts an initial timingPointIndexes list and round-trips it",
);
assert(
  JSON.stringify(listRoutes(db).find((r) => r.id === routeWithTiming.id)?.timingPointIndexes) === JSON.stringify([1]),
  "the new route's timing points round-trip through listRoutes too",
);

const updatedWithTiming = updateRoute(
  db,
  routeWithTiming.id,
  g1.id,
  "2",
  routeWithTiming.points,
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
  null,
  null,
  [],
  [],
  [],
  "ordinary",
  false,
  [2],
);
assert(
  JSON.stringify(updatedWithTiming.timingPointIndexes) === JSON.stringify([2]),
  "updateRoute's own timingPointIndexes parameter replaces the old list rather than always resetting to empty",
);

// --- route timetables ---
assert(listRouteTimetablesForRoute(db, route.id).length === 0, "a new route starts with no timetables");

const tt = upsertRouteTimetable(
  db,
  route.id,
  MONDAY_FRIDAY_MASK,
  "both",
  [{ startMinutes: 360, endMinutes: 1140, intervalMinutes: 30 }],
  [{ pointIndex: 1, standardPaddingMinutes: 10, peakPaddingMinutes: 15, dwellMinutes: 1 }],
  [0, 500],
  [0, 560],
  [0, 600],
  [0, 660],
  [420],
  [605],
);
assert(
  tt.weekdayMask === MONDAY_FRIDAY_MASK && tt.timeBands[0].startMinutes === 360,
  "route timetable created with the right fields",
);
assert(
  JSON.stringify(tt.timingPoints) === JSON.stringify([{ pointIndex: 1, standardPaddingMinutes: 10, peakPaddingMinutes: 15, dwellMinutes: 1 }]),
  "timing points round-trip through JSON",
);
assert(
  JSON.stringify(tt.arrivalOffsetsSecondsPeak) === JSON.stringify([0, 600]) &&
    JSON.stringify(tt.departureOffsetsSecondsPeak) === JSON.stringify([0, 660]),
  "peak offset arrays round-trip through JSON too",
);
assert(
  JSON.stringify(tt.arrivalOffsetsSeconds) === JSON.stringify([0, 500]) &&
    JSON.stringify(tt.departureOffsetsSeconds) === JSON.stringify([0, 560]),
  "offset arrays round-trip through JSON",
);
assert(
  JSON.stringify(tt.excludedDepartureMinutes) === JSON.stringify([420]),
  "excluded departure minutes round-trip through JSON",
);
assert(
  JSON.stringify(tt.customDepartureMinutes) === JSON.stringify([605]),
  "custom departure minutes round-trip through JSON",
);
assert(tt.direction === "both", "a plain upsert defaults to the 'both' direction");

let forRoute = listRouteTimetablesForRoute(db, route.id);
assert(forRoute.length === 1, "the route now has exactly one timetable");

// Unflagging a timing point on the route strips it from every existing
// component's own "timing_points" too, not just the route's own list.
setRouteTimingPoint(db, route.id, 1, false);
forRoute = listRouteTimetablesForRoute(db, route.id);
assert(
  forRoute[0].timingPoints.length === 0,
  "unflagging a route's timing point clears the matching entry out of an existing timetable component",
);

// Upserting the same (route, day type, direction) again replaces it rather
// than adding a second row — there's only one component per that triple.
const tt2 = upsertRouteTimetable(
  db,
  route.id,
  MONDAY_FRIDAY_MASK,
  "both",
  [{ startMinutes: 400, endMinutes: 1200, intervalMinutes: 20 }],
  [],
  [0, 300],
  [0, 300],
  [0, 300],
  [0, 300],
  [],
  [],
);
assert(tt2.id === tt.id, "upserting the same route+day type+direction updates the existing row rather than inserting a new one");
forRoute = listRouteTimetablesForRoute(db, route.id);
assert(forRoute.length === 1 && forRoute[0].timeBands[0].startMinutes === 400, "the update replaced the row's fields");

// A terminus-loop route can have independent outbound/inbound components
// alongside (or instead of) its 'both' one — a different direction is a
// separate row, same as a different day type is.
const tt3 = upsertRouteTimetable(
  db,
  route.id,
  MONDAY_FRIDAY_MASK,
  "outbound",
  [{ startMinutes: 360, endMinutes: 1140, intervalMinutes: 15 }],
  [],
  [0, 100],
  [0, 100],
  [0, 100],
  [0, 100],
  [],
  [],
);
assert(tt3.id !== tt2.id, "a different direction is a distinct row, not an update of the 'both' one");
forRoute = listRouteTimetablesForRoute(db, route.id);
assert(
  forRoute.length === 2 && forRoute.some((t) => t.direction === "both") && forRoute.some((t) => t.direction === "outbound"),
  "the route now has both a 'both' row and its own 'outbound' row",
);
// Upserting the SAME direction again still replaces, not duplicates.
const tt3b = upsertRouteTimetable(
  db,
  route.id,
  MONDAY_FRIDAY_MASK,
  "outbound",
  [{ startMinutes: 360, endMinutes: 1140, intervalMinutes: 30 }],
  [],
  [0, 200],
  [0, 200],
  [0, 200],
  [0, 200],
  [],
  [],
);
assert(tt3b.id === tt3.id, "upserting the same direction again updates that row rather than inserting a third one");
assert(listRouteTimetablesForRoute(db, route.id).length === 2, "still exactly two rows for this route+day type");

// A different day type on the same route is a separate row.
upsertRouteTimetable(
  db,
  route.id,
  SATURDAY_MASK,
  "both",
  [{ startMinutes: 500, endMinutes: 1100, intervalMinutes: 60 }],
  [],
  [0, 400],
  [0, 400],
  [0, 400],
  [0, 400],
  [],
  [],
);
forRoute = listRouteTimetablesForRoute(db, route.id);
assert(forRoute.length === 3, "a different day type adds a third row (the two monday_friday directions plus this one) rather than replacing anything");

assert(listAllRouteTimetables(db).length === 3, "listAllRouteTimetables sees every route's timetables");

deleteRouteTimetable(db, tt2.id);
assert(listRouteTimetablesForRoute(db, route.id).length === 2, "deleting the 'both' row leaves the 'outbound' and saturday rows alone");

// --- updating a route ---
const updated = updateRoute(
  db,
  route.id,
  g1.id,
  "1A",
  [
    { kind: "stop", osmId: 111, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 555, lon: -3.18, lat: 55.97 },
    { kind: "stop", osmId: 222, lon: -3.19, lat: 55.96 },
  ],
  "outbound",
  null,
  null,
  "#ef4444",
  "Gordon Street Express",
  null,
  null,
);
assert(updated.number === "1A" && updated.points.length === 3, "updateRoute changes the route's own fields");
assert(updated.colour === "#ef4444", "updateRoute changes the route's colour too");
assert(updated.name === "Gordon Street Express", "updateRoute changes the route's name too");
assert(
  updated.pickupDropoffOverrides.length === 0,
  "updateRoute clears pickup/dropoff overrides too, since the points list may have changed shape",
);
assert(listRoutes(db).find((r) => r.id === route.id)?.number === "1A", "the update is reflected in listRoutes");

// updateRoute can also set the parent/letter, not just clear them.
const relinked = updateRoute(
  db,
  orphanVariation.id,
  g1.id,
  "9A",
  orphanVariation.points,
  "outbound",
  null,
  null,
  "#3b82f6",
  null,
  route.id,
  "A",
);
assert(
  relinked.parentRouteId === route.id && relinked.variationLetter === "A",
  "updateRoute can attach a parent id and letter to a previously-orphan variation",
);
assert(
  listRouteTimetablesForRoute(db, route.id).length === 0,
  "updating a route clears its existing timetables, since they're indexed against the old point list",
);

// A fresh timetable built against the now-updated point list, so deleting
// the route below still has something real to clean up.
upsertRouteTimetable(
  db,
  route.id,
  SUNDAY_MASK,
  "both",
  [{ startMinutes: 600, endMinutes: 900, intervalMinutes: 60 }],
  [],
  [0, 200, 400],
  [0, 200, 400],
  [0, 200, 400],
  [0, 200, 400],
  [],
  [],
);
assert(listRouteTimetablesForRoute(db, route.id).length === 1, "a new timetable can be built after the update");

// setRouteColour (2026-11-08, live bug report: changing a route's colour
// via the normal Edit flow — which goes through updateRoute above — was
// wiping the route's timetable as an unwanted side effect). This dedicated
// setter must change ONLY the colour, leaving the timetable just built
// above untouched.
setRouteColour(db, route.id, "#00ffff");
const afterColour = listRoutes(db).find((r) => r.id === route.id)!;
assert(afterColour.colour === "#00ffff", "setRouteColour changes the route's colour");
assert(
  listRouteTimetablesForRoute(db, route.id).length === 1,
  "setRouteColour must NOT clear the route's existing timetable, unlike updateRoute",
);
assert(afterColour.name === "Gordon Street Express", "setRouteColour leaves every other field (e.g. name) untouched");

// setRouteVehicleRestrictions (Q18/Q19, OPEN-ITEMS.md Q18+Q19 plan) — a
// fresh route defaults to every axis null (unset), the dedicated setter
// round-trips a real restriction on all 4 axes, and — same "dedicated
// setter, never wipes the timetable" property as setRouteColour just
// above — it must leave the timetable built earlier completely alone.
assert(
  afterColour.vehicleRestrictions.baseType === null &&
    afterColour.vehicleRestrictions.powerType === null &&
    afterColour.vehicleRestrictions.axleCount === null &&
    afterColour.vehicleRestrictions.liveryId === null,
  "a route with no restrictions set defaults to every axis null",
);
// No livery exists yet this early in the script (createLivery runs much
// later), so liveryId is left null here — covered on a real livery id
// separately below, once one exists.
setRouteVehicleRestrictions(db, route.id, { baseType: "Minibus", powerType: "electric", axleCount: "twin-axle", liveryId: null });
const afterRestrictions = listRoutes(db).find((r) => r.id === route.id)!;
assert(afterRestrictions.vehicleRestrictions.baseType === "Minibus", "setRouteVehicleRestrictions round-trips baseType");
assert(afterRestrictions.vehicleRestrictions.powerType === "electric", "setRouteVehicleRestrictions round-trips powerType");
assert(afterRestrictions.vehicleRestrictions.axleCount === "twin-axle", "setRouteVehicleRestrictions round-trips axleCount");
assert(afterRestrictions.vehicleRestrictions.liveryId === null, "setRouteVehicleRestrictions round-trips a null liveryId");
assert(
  listRouteTimetablesForRoute(db, route.id).length === 1,
  "setRouteVehicleRestrictions must NOT clear the route's existing timetable",
);
assert(afterRestrictions.colour === "#00ffff", "setRouteVehicleRestrictions leaves every other field (e.g. colour) untouched");
// updateRoute's own UPDATE never touches these 4 columns either — same
// preservation as its existing branding fetch, verified directly here
// rather than just inferred from reading the code.
const afterAnotherUpdate = updateRoute(
  db,
  route.id,
  afterRestrictions.depotGroupId,
  afterRestrictions.number,
  afterRestrictions.points,
  afterRestrictions.orientation,
  afterRestrictions.terminusIndex,
  afterRestrictions.startIndex,
  afterRestrictions.colour,
  afterRestrictions.name,
  afterRestrictions.parentRouteId,
  afterRestrictions.variationLetter,
);
assert(
  afterAnotherUpdate.vehicleRestrictions.baseType === "Minibus" && afterAnotherUpdate.vehicleRestrictions.powerType === "electric",
  "updateRoute preserves existing vehicle restrictions, same as it already preserves branding",
);

// route.id is still a real parent (variation and relinked both point at
// it) — deleting it must clear those children's links, not fail outright
// (Node's sqlite enforces the FK by default) or delete the children too.
deleteRoute(db, route.id);
assert(listRouteTimetablesForRoute(db, route.id).length === 0, "deleting a route also deletes its own timetables");
assert(!listRoutes(db).some((r) => r.id === route.id), "deleted route no longer listed");
assert(
  listRoutes(db).find((r) => r.id === variation.id)?.parentRouteId === null,
  "a variation whose parent was deleted has its parent id cleared to null, not left dangling",
);
assert(
  listRoutes(db).some((r) => r.id === variation.id),
  "the variation itself survives its parent's deletion — only the link is cleared",
);

// --- Shared long-distance sections (T, live design discussion,
// 2026-10-31) — real CRUD plus the core "live reference, not a frozen
// copy" behaviour: a route's own `segments` field stores a reference, not
// a snapshot, so editing the section must be reflected the next time
// something resolves the route's live points (the actual resolution logic
// itself — resolveSegments/findRoutesUsingSectionId — is unit-tested
// independently in long-distance-sections.verify.mts; this proves the DB
// layer round-trips everything resolveSegments needs). ---
const section = createLongDistanceSection(db, "Glasgow-Carlisle", [
  { kind: "stop", osmId: 9001, lon: -4.25, lat: 55.86 },
  { kind: "stop", osmId: 9002, lon: -2.94, lat: 54.89 },
]);
assert(section.id > 0, "a section is created with a real id");
assert(listLongDistanceSections(db).some((s) => s.id === section.id && s.name === "Glasgow-Carlisle"), "the new section is listed");

let sectionRejected = false;
try {
  createLongDistanceSection(db, "Too short", [{ kind: "stop", osmId: 1, lon: 0, lat: 0 }]);
} catch {
  sectionRejected = true;
}
assert(sectionRejected, "a section with fewer than 2 points is rejected");

renameLongDistanceSection(db, section.id, "Glasgow-Carlisle (A74M)");
assert(listLongDistanceSections(db).find((s) => s.id === section.id)?.name === "Glasgow-Carlisle (A74M)", "renameLongDistanceSection updates the name");

const sectionUsingRoute = createRoute(
  db,
  g1.id,
  "923",
  [
    { kind: "waypoint", lon: -4.25, lat: 55.86 },
    { kind: "waypoint", lon: -2.94, lat: 54.89 },
  ],
  "outbound",
  null,
  null,
  "#000000",
  null,
  null,
  null,
  [],
  [],
  [{ kind: "section", sectionId: section.id }],
);
assert(
  JSON.stringify(sectionUsingRoute.segments) === JSON.stringify([{ kind: "section", sectionId: section.id }]),
  "segments (a reference to a shared section) round-trips through createRoute",
);
assert(
  listRoutes(db).find((r) => r.id === sectionUsingRoute.id)?.segments[0]?.kind === "section",
  "the route's own segments survive a plain listRoutes read",
);

// Editing the section's own points, then confirming a fresh read of the
// section reflects the change immediately — the real "live reference"
// proof at the DB layer (the renderer's own resolveSegments is what
// actually recomputes a route's resolved points from this, proven
// separately in long-distance-sections.verify.mts).
setLongDistanceSectionPoints(db, section.id, [
  { kind: "stop", osmId: 9001, lon: -4.25, lat: 55.86 },
  { kind: "waypoint", lon: -3.5, lat: 55.3 },
  { kind: "stop", osmId: 9002, lon: -2.94, lat: 54.89 },
]);
assert(listLongDistanceSections(db).find((s) => s.id === section.id)?.points.length === 3, "setLongDistanceSectionPoints updates the section's own points");
assert(
  JSON.stringify(listRoutes(db).find((r) => r.id === sectionUsingRoute.id)?.segments) === JSON.stringify([{ kind: "section", sectionId: section.id }]),
  "the route's own segments still just reference the section by id after the section is edited — nothing was frozen into the route at creation time",
);

deleteLongDistanceSection(db, section.id);
assert(!listLongDistanceSections(db).some((s) => s.id === section.id), "deleteLongDistanceSection removes it");
assert(
  listRoutes(db).find((r) => r.id === sectionUsingRoute.id)?.segments[0]?.kind === "section",
  "deleting a section leaves a route's own dangling reference in place rather than silently rewriting the route (resolveSegments is what treats it as contributing nothing — db.mts itself does no cascading here)",
);
deleteRoute(db, sectionUsingRoute.id);

db.close();

// --- reopen: confirm real persistence, not just in-memory ---
db = openSave(path);
groups = listDepotGroups(db);
assert(groups.length === 3, "depot groups survive close+reopen");
assert(getOverride(db, "stop", 12345, "name") === "Renamed Stop", "override survives close+reopen");
assert(!hasOverride(db, "stop", 12345, "position"), "reset override stays reset after reopen");

const route2 = createRoute(
  db,
  g1.id,
  "2",
  [
    { kind: "stop", osmId: 333, lon: -3.2, lat: 55.95 },
    { kind: "stop", osmId: 444, lon: -3.19, lat: 55.96 },
  ],
  "inbound",
  null,
  null,
  "#3b82f6",
  null,
  null,
  null,
);
upsertRouteTimetable(
  db,
  route2.id,
  SUNDAY_MASK,
  "both",
  [{ startMinutes: 700, endMinutes: 1000, intervalMinutes: 45 }],
  [],
  [0, 250],
  [0, 250],
  [0, 250],
  [0, 250],
  [],
  [],
);
db.close();
db = openSave(path);
assert(
  listRouteTimetablesForRoute(db, route2.id).length === 1,
  "a route timetable created just before close survives close+reopen",
);

// --- real non-zero timing-point padding survives reopen AND a later
// unrelated edit (regression for the 2026-11-19 live incident: the v65->v66
// migration reset every pre-existing timing point's standardPaddingMinutes/
// peakPaddingMinutes to 0 — see that migration's own comment above — which
// is a one-time, intentional, already-tested reset (see the v65->v66
// migration test further down this file), NOT a live bug. This test instead
// guards the ongoing save/load path itself: once a player has real non-zero
// padding saved, neither a plain reopen nor a later save that only touches
// an unrelated field (here, the time bands) should ever silently zero it
// back out. ---
upsertRouteTimetable(
  db,
  route2.id,
  SUNDAY_MASK,
  "both",
  [{ startMinutes: 700, endMinutes: 1000, intervalMinutes: 45 }],
  [{ pointIndex: 1, standardPaddingMinutes: 7, peakPaddingMinutes: 12, dwellMinutes: 3 }],
  [0, 250],
  [0, 250],
  [0, 250],
  [0, 250],
  [],
  [],
);
db.close();
db = openSave(path);
let reopenedTimingPoints = listRouteTimetablesForRoute(db, route2.id)[0].timingPoints;
assert(
  JSON.stringify(reopenedTimingPoints) ===
    JSON.stringify([{ pointIndex: 1, standardPaddingMinutes: 7, peakPaddingMinutes: 12, dwellMinutes: 3 }]),
  `real non-zero timing-point padding survives close+reopen unchanged, got ${JSON.stringify(reopenedTimingPoints)}`,
);
// Re-save the SAME component with only the time bands changed (simulating
// "editing something else and re-saving") — the timing points passed
// through unchanged must still come back unchanged, not reset to defaults.
upsertRouteTimetable(
  db,
  route2.id,
  SUNDAY_MASK,
  "both",
  [{ startMinutes: 600, endMinutes: 1100, intervalMinutes: 30 }],
  reopenedTimingPoints,
  [0, 250],
  [0, 250],
  [0, 250],
  [0, 250],
  [],
  [],
);
db.close();
db = openSave(path);
reopenedTimingPoints = listRouteTimetablesForRoute(db, route2.id)[0].timingPoints;
assert(
  JSON.stringify(reopenedTimingPoints) ===
    JSON.stringify([{ pointIndex: 1, standardPaddingMinutes: 7, peakPaddingMinutes: 12, dwellMinutes: 3 }]),
  `real non-zero timing-point padding survives an unrelated field edit + reopen, got ${JSON.stringify(reopenedTimingPoints)}`,
);

// --- player-placed stops (DESIGN.md §4) ---
const placedLegal = createPlayerStop(db, -3.21, 55.951, true);
const placedIllegal = createPlayerStop(db, -3.22, 55.952, false);
assert(placedLegal.osmId < 0 && placedIllegal.osmId < 0, "player stops get a negative synthetic osmId");
assert(placedLegal.osmId !== placedIllegal.osmId, "each player stop gets a distinct osmId");
let playerStops = listPlayerStops(db);
assert(playerStops.length === 2, "both player-placed stops are listed");
assert(
  playerStops.find((s) => s.osmId === placedLegal.osmId)?.busLegal === true,
  "a bus-legal placement keeps its flag",
);
assert(
  playerStops.find((s) => s.osmId === placedIllegal.osmId)?.busLegal === false,
  "a not-bus-legal placement keeps its warning flag",
);
deletePlayerStop(db, placedIllegal.osmId);
assert(listPlayerStops(db).length === 1, "deleting a player stop removes just that one");
db.close();
db = openSave(path);
playerStops = listPlayerStops(db);
assert(playerStops.length === 1 && playerStops[0].osmId === placedLegal.osmId, "a player stop survives close+reopen");

// "staff" route type (schema v57->v58, live request 2026-11-08) — would
// have thrown a CHECK constraint violation before the routes v57->v58
// rebuild (route_type's old CHECK list didn't include it); confirms the
// rebuild genuinely dropped that CHECK rather than just leaving it stale.
const staffRoute = createRoute(db, g1.id, "S1", [], "outbound", null, null, "#000000", null, null, null, [], [], [], "staff");
assert(staffRoute.routeType === "staff", "createRoute accepts the 'staff' route type and round-trips it");
assert(listRoutes(db).find((r) => r.id === staffRoute.id)?.routeType === "staff", "'staff' round-trips through listRoutes too");

// --- depots and entrances (OPERATIONS.md §2 "Placement and entrances") ---
const { depot, entrances } = createDepot(db, g1.id, "Test Depot", -3.2, 55.95, [
  { lon: -3.199, lat: 55.951, mode: "both" },
  { lon: -3.201, lat: 55.949, mode: "entry" },
]);
assert(entrances.length === 2, "both entrances are created alongside the depot in one call");
let depots = listDepots(db);
assert(depots.length === 1 && depots[0].name === "Test Depot", "the new depot is listed");
let depotEntrances = listDepotEntrances(db, depot.id);
assert(depotEntrances.length === 2, "the depot's own entrances are listed");
assert(listAllDepotEntrances(db).length === 2, "listAllDepotEntrances finds them too");

renameDepot(db, depot.id, "Renamed Depot");
assert(listDepots(db)[0].name === "Renamed Depot", "renaming a depot updates it");

const thirdEntrance = addDepotEntrance(db, depot.id, -3.198, 55.952, "exit");
assert(listDepotEntrances(db, depot.id).length === 3, "a third entrance can be added after creation");

setDepotEntranceMode(db, thirdEntrance.id, "both");
assert(
  listDepotEntrances(db, depot.id).find((e) => e.id === thirdEntrance.id)?.mode === "both",
  "an entrance's mode can be changed",
);

deleteDepotEntrance(db, thirdEntrance.id);
assert(listDepotEntrances(db, depot.id).length === 2, "deleting one entrance leaves the others");

// A depot's own staff-route stop (schema v57->v58).
const depotStop = createDepotStop(db, depot.id);
assert(depotStop.osmId < 0 && depotStop.depotId === depot.id, "createDepotStop makes a real player stop linked back to the depot");
assert(depotStop.lon === depot.lon && depotStop.lat === depot.lat, "a depot's own stop sits at the depot's exact location, not kerb-snapped");
assert(
  listPlayerStops(db).find((s) => s.osmId === depotStop.osmId)?.depotId === depot.id,
  "the depot link round-trips through listPlayerStops too",
);

deleteDepot(db, depot.id);
assert(listDepots(db).length === 0, "deleting a depot removes it");
assert(listDepotEntrances(db, depot.id).length === 0, "deleting a depot also deletes its own entrances (no FK cascade, so this must be explicit)");
assert(
  !listPlayerStops(db).some((s) => s.osmId === depotStop.osmId),
  "deleting a depot also deletes its own staff-route stop, same no-FK-cascade treatment as its entrances",
);

const { depot: depot2 } = createDepot(db, g1.id, "Persisted Depot", -3.19, 55.94, [{ lon: -3.189, lat: 55.941, mode: "both" }]);
db.close();
db = openSave(path);
depots = listDepots(db);
assert(depots.length === 1 && depots[0].name === "Persisted Depot", "a depot survives close+reopen");
assert(listDepotEntrances(db, depot2.id).length === 1, "a depot's entrances survive close+reopen too");

// --- stop groups (DESIGN.md §4) — player-created only, 2026-09-27 ---
// stop_groups mints only an id; name/hidden/always_show_members and
// membership ('stop'/osmId/'group_id') both go through the existing
// override layer, already covered above — this just checks the id-minting
// and listing half.
const sg1 = createStopGroup(db);
const sg2 = createStopGroup(db);
assert(sg1.id !== sg2.id, "each stop group gets a distinct id");
let stopGroupIds = listStopGroupIds(db);
assert(stopGroupIds.includes(sg1.id) && stopGroupIds.includes(sg2.id), "both stop groups are listed");

setOverride(db, "stop", 5001, "group_id", sg1.id);
setOverride(db, "stop", 5002, "group_id", sg1.id);
setOverride(db, "stop_group", sg1.id, "name", "Princes Street eastbound");
assert(
  getOverride(db, "stop_group", sg1.id, "name") === "Princes Street eastbound",
  "a stop group's manually-set name round-trips through the override layer",
);
let groupMembers = listOverrides<number | null>(db, "stop", "group_id").filter((o) => o.value === sg1.id);
assert(groupMembers.length === 2, "both stops assigned to the group show up via the same override query bus stations use");

resetOverride(db, "stop", 5002, "group_id");
groupMembers = listOverrides<number | null>(db, "stop", "group_id").filter((o) => o.value === sg1.id);
assert(groupMembers.length === 1, "removing one stop from a group leaves the other");

// --- player-created bus stations (live request, 2026-11-08: "group bus
// stops into a bus station but without having to place one") — mirrors
// stop_groups exactly: mints only an id, name/membership both go through
// the existing override layer, already covered above for stop_group — this
// checks the id-minting/listing half plus the "bus_station" entity_type
// name override (not yet exercised by any earlier assertion in this file).
const bs1 = createPlayerBusStation(db);
const bs2 = createPlayerBusStation(db);
assert(bs1.id !== bs2.id, "each player bus station gets a distinct id");
let playerBusStationIds = listPlayerBusStationIds(db);
assert(playerBusStationIds.includes(bs1.id) && playerBusStationIds.includes(bs2.id), "both player bus stations are listed");

setOverride(db, "stop", 5003, "bus_station", -1_000_000_000 - bs1.id);
setOverride(db, "bus_station", -1_000_000_000 - bs1.id, "name", "Union Street Bus Station");
assert(
  getOverride(db, "bus_station", -1_000_000_000 - bs1.id, "name") === "Union Street Bus Station",
  "a player bus station's manually-set name round-trips through the override layer, same as a real OSM one's",
);
assert(
  getOverride<number | null>(db, "stop", 5003, "bus_station") === -1_000_000_000 - bs1.id,
  "a stop assigned to a player bus station round-trips through the same override field a real OSM station's assignment already uses",
);

db.close();
db = openSave(path);
stopGroupIds = listStopGroupIds(db);
assert(stopGroupIds.includes(sg1.id) && stopGroupIds.includes(sg2.id), "stop groups survive close+reopen");
assert(getOverride(db, "stop_group", sg1.id, "name") === "Princes Street eastbound", "a stop group's name survives close+reopen");
assert(
  getOverride<number | null>(db, "stop", 5001, "group_id") === sg1.id,
  "stop group membership survives close+reopen",
);
playerBusStationIds = listPlayerBusStationIds(db);
assert(
  playerBusStationIds.includes(bs1.id) && playerBusStationIds.includes(bs2.id),
  "player bus stations survive close+reopen",
);
assert(
  getOverride(db, "bus_station", -1_000_000_000 - bs1.id, "name") === "Union Street Bus Station",
  "a player bus station's name survives close+reopen",
);
db.close();

// --- v19 -> v20 migration: day_type becomes weekday_mask + term_facet ---
// A hand-built v19-schema file (route_timetables still has the old
// day_type column), the same way v17->v18 was verified — opening it with
// the current openSave() must migrate it correctly, preserving every
// existing row's real day type and other fields, not just avoid throwing.
{
  const migrationPath = "./electron/.verify-migration-v19.sqlite";
  if (existsSync(migrationPath)) unlinkSync(migrationPath);
  const raw = new DatabaseSync(migrationPath);
  raw.exec(`
    CREATE TABLE depot_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      region TEXT NOT NULL,
      main_bus_station_osm_id INTEGER
    );
    CREATE TABLE routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      number TEXT NOT NULL,
      points TEXT NOT NULL,
      orientation TEXT NOT NULL,
      terminus_index INTEGER,
      start_index INTEGER,
      colour TEXT NOT NULL,
      name TEXT,
      pickup_dropoff_overrides TEXT NOT NULL DEFAULT '[]',
      parent_route_id INTEGER REFERENCES routes(id),
      variation_letter TEXT
    );
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      day_type TEXT NOT NULL CHECK (day_type IN ('monday_friday', 'saturday', 'sunday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, day_type, direction)
    );
  `);
  raw.prepare("INSERT INTO depot_groups (id, name, region) VALUES (1, 'Edinburgh', 'East Scotland')").run();
  raw
    .prepare(
      "INSERT INTO routes (id, depot_group_id, number, points, orientation, colour) VALUES (1, 1, '42', '[]', 'clockwise', '#ff0000')",
    )
    .run();
  for (const dayType of ["monday_friday", "saturday", "sunday"]) {
    raw
      .prepare(
        `INSERT INTO route_timetables (route_id, day_type, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds)
         VALUES (1, ?, 'both', '[{"startMinutes":360,"endMinutes":1140,"intervalMinutes":30}]', '[]', '[0]', '[0]')`,
      )
      .run(dayType);
  }
  raw.exec("PRAGMA user_version = 19");
  raw.close();

  const migrated = openSave(migrationPath);
  // Raw SQL, not listRouteTimetablesForRoute (2026-11-15): that helper
  // always selects every CURRENT column, including mirror_source_
  // timetable_id/mirror_offset_minutes (schema v64->v65) — correct for
  // real play, where a save is always migrated one release behind, never
  // 46 versions behind in one sitting. This fixture deliberately starts
  // at v19 and jumps the rest of the way via the SAME "most branches set
  // user_version straight to SCHEMA_VERSION rather than their own real
  // next step" shortcut the v37 branch's own comment already documents
  // as a known, accepted trade-off (correct for the realistic one-
  // version-behind case, not for a save this far behind) — so
  // route_timetables here never actually reaches its current v65 shape,
  // same as it never has for this test. Fixed only for the one or two
  // steps that matter for a specific live need (v63->v64->v65 here,
  // v37->v38->v39 before it) rather than retrofitting all ~45 historical
  // branches, which would need a complete historical-shape fixture for
  // every table any of them touch (depot_entrances, vehicles, fare_zones
  // and more — confirmed by hand, not guessed: tried exactly this and it
  // cascades through a large, unrelated part of this file's own history).
  // Reading only what THIS test actually cares about (day_type's own
  // migration into weekday_mask) sidesteps that unrelated, pre-existing
  // limitation rather than papering over it.
  const migratedTimetables = migrated.prepare("SELECT weekday_mask, time_bands FROM route_timetables WHERE route_id = ?").all(1) as { weekday_mask: number; time_bands: string }[];
  assert(migratedTimetables.length === 3, "all 3 pre-migration timetable rows survive the v19->v20 migration");
  const masksAfterMigration = migratedTimetables.map((t) => t.weekday_mask).sort((a, b) => a - b);
  assert(
    JSON.stringify(masksAfterMigration) === JSON.stringify([MONDAY_FRIDAY_MASK, SATURDAY_MASK, SUNDAY_MASK].sort((a, b) => a - b)),
    "each row's real day type is preserved through the weekday_mask/term_facet round-trip, not just migrated without throwing",
  );
  assert(
    migratedTimetables.every((t) => (JSON.parse(t.time_bands) as { startMinutes: number }[])[0].startMinutes === 360),
    "other fields (time bands) survive the migration untouched",
  );
  migrated.close();
  unlinkSync(migrationPath);
}

// --- v58 -> v59 migration: dealers.manufacturer western_commercial -> evm,
// plus the new is_repower_site and vehicles.bought_game_day columns (T179) ---
{
  const migrationPath58 = "./electron/.verify-migration-v58.sqlite";
  if (existsSync(migrationPath58)) unlinkSync(migrationPath58);
  const raw58 = new DatabaseSync(migrationPath58);
  // Old (v58) shapes — dealers with no is_repower_site column and the old
  // manufacturer CHECK set; vehicles with no bought_game_day column; routes
  // with none of v59's vehicle_restriction_* columns (the exact shape the
  // real v57->v58 routes_new rebuild above leaves it in). routes must be
  // pre-created explicitly here, not left for openSave()'s own
  // unconditional `db.exec(SCHEMA)` to create fresh the way every other
  // table in this fixture is — a real bug found 2026-11-14 while fixing
  // the same-session-stacking migration bug above: with that bug fixed,
  // this fixture now actually walks through the v59 branch's own
  // `ALTER TABLE routes ADD COLUMN vehicle_restriction_base_type ...`,
  // which throws "duplicate column name" if routes was instead created
  // fresh (already with those columns, via CREATE TABLE IF NOT EXISTS)
  // rather than pre-existing in its true old shape — exactly backwards
  // from dealers/vehicles below, which ARE pre-created in old shape
  // specifically so their own later ALTERs have something real to apply
  // against.
  raw58.exec(`
    CREATE TABLE routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      number TEXT NOT NULL,
      points TEXT NOT NULL,
      orientation TEXT NOT NULL CHECK (orientation IN ('inbound', 'outbound')),
      terminus_index INTEGER,
      start_index INTEGER,
      colour TEXT NOT NULL DEFAULT '#3b82f6',
      name TEXT,
      pickup_dropoff_overrides TEXT NOT NULL DEFAULT '[]',
      timing_point_indexes TEXT NOT NULL DEFAULT '[]',
      parent_route_id INTEGER REFERENCES routes(id),
      variation_letter TEXT,
      composed_from_route_ids TEXT NOT NULL DEFAULT '[]',
      hail_and_ride_sections TEXT NOT NULL DEFAULT '[]',
      segments TEXT NOT NULL DEFAULT '[]',
      route_type TEXT NOT NULL DEFAULT 'ordinary',
      is_minor_variation INTEGER NOT NULL DEFAULT 0,
      assigned_livery_id INTEGER REFERENCES liveries(id),
      use_branded_colour INTEGER NOT NULL DEFAULT 0
    )
  `);
  raw58.exec(`
    CREATE TABLE dealers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      manufacturer TEXT NOT NULL CHECK (manufacturer IN ('volvo', 'adl', 'western_commercial', 'wrightbus', 'yutong')),
      lon REAL NOT NULL,
      lat REAL NOT NULL,
      is_entrances_complete INTEGER NOT NULL DEFAULT 0
    )
  `);
  raw58.exec(`
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      model_id TEXT NOT NULL,
      length_m REAL NOT NULL,
      variant_label TEXT,
      power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
      category_digit INTEGER NOT NULL,
      sequential_number INTEGER NOT NULL,
      fleet_number TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL UNIQUE,
      condition REAL NOT NULL DEFAULT 100,
      purchase_price_gbp INTEGER NOT NULL,
      bought_at TEXT NOT NULL,
      livery_id INTEGER REFERENCES liveries(id),
      bought_for_route_id INTEGER REFERENCES routes(id)
    )
  `);
  // drivers, old (pre-v60) shape with no private_hire_vehicle_id column —
  // same real reason as pre-creating routes above: with the same-session
  // migration-stacking bug now fixed, this fixture walks through v60's
  // own `ALTER TABLE drivers ADD COLUMN private_hire_vehicle_id ...`,
  // which throws "duplicate column name" unless drivers pre-exists in
  // its true old shape rather than being created fresh (already with
  // that column) by openSave()'s own unconditional `db.exec(SCHEMA)`.
  raw58.exec(`
    CREATE TABLE drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      name TEXT NOT NULL,
      score TEXT NOT NULL DEFAULT 'trainee' CHECK (score IN ('trainee', 'novice', 'competent', 'professional', 'fleet_elite'))
    )
  `);
  // route_timetables, old (pre-v64) shape with neither mirror column —
  // same real reason as drivers above: this fixture now correctly walks
  // all the way through to the current version (the v58-62 branches'
  // own same-session-stacking fix already applies here), reaching the
  // v64->v65 migration's own `ALTER TABLE route_timetables ADD COLUMN
  // mirror_source_timetable_id/mirror_offset_minutes` — which throws
  // "duplicate column name" unless this table pre-exists in its true old
  // shape rather than being created fresh (already with those columns)
  // by openSave()'s own unconditional `db.exec(SCHEMA)`.
  raw58.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw58.exec(`
    INSERT INTO dealers (id, name, manufacturer, lon, lat, is_entrances_complete)
    VALUES (1, 'Western Commercial (Glasgow)', 'western_commercial', -4.311747, 55.856503, 1)
  `);
  raw58.exec("PRAGMA user_version = 58");
  raw58.close();

  const migrated58 = openSave(migrationPath58);
  const versionCheck58 = new DatabaseSync(migrationPath58);
  const { user_version: version58 } = versionCheck58.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck58.close();
  assert(version58 === SCHEMA_VERSION, `the v58 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version58}`);

  const migratedDealers = listDealers(migrated58);
  const migratedDealer = migratedDealers.find((d) => d.id === 1);
  assert(migratedDealer?.manufacturer === "evm", `the pre-existing western_commercial dealer becomes evm, got "${migratedDealer?.manufacturer}"`);
  assert(migratedDealer?.name === "Western Commercial (Glasgow)", "the migration preserves the dealer's own name untouched (only manufacturer is translated)");
  assert(migratedDealer?.isRepowerSite === false, "a pre-existing dealer defaults to not being the re-power site");

  // A fresh vehicle bought on the migrated save gets a real bought_game_day
  // (the ADD COLUMN itself, proven by the column existing at all — a
  // pre-existing vehicle's own default-to-0 backfill is covered directly
  // against the player's real save in the v31->v36 check below, since
  // building a second valid vehicles row here would need its own depot/
  // depot-group fixture rows purely for foreign-key validity).
  const g58 = createDepotGroup(migrated58, "V58 Migration Test", "East Scotland");
  const d58 = createDepot(migrated58, g58.id, "V58 Depot", -4.2, 55.9, []).depot;
  const migratedVehicle = buyVehicle(migrated58, g58.id, d58.id, "adl-enviro400", 11.5, null, "diesel", 235_000);
  assert(typeof migratedVehicle.boughtGameDay === "number", "a vehicle bought after the v58->v59 migration has a real boughtGameDay");

  migrated58.close();
  unlinkSync(migrationPath58);
}

// --- v60 -> v61 migration: drivers.private_hire_vehicle_id (T183 —
// private hire revival, Q20/OPEN-ITEMS.md). Old (v60) drivers shape with
// no such column, plus one pre-existing driver row, to prove the ADD
// COLUMN migrates a real existing row to NULL rather than throwing. ---
{
  const migrationPath60 = "./electron/.verify-migration-v60.sqlite";
  if (existsSync(migrationPath60)) unlinkSync(migrationPath60);
  const raw60 = new DatabaseSync(migrationPath60);
  raw60.exec(`
    CREATE TABLE depot_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL DEFAULT '')
  `);
  raw60.exec(`
    CREATE TABLE depots (id INTEGER PRIMARY KEY AUTOINCREMENT, depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id), name TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL)
  `);
  raw60.exec(`
    CREATE TABLE drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      name TEXT NOT NULL,
      score TEXT NOT NULL DEFAULT 'trainee' CHECK (score IN ('trainee', 'novice', 'competent', 'professional', 'fleet_elite'))
    )
  `);
  // vehicles, old (pre-v61/v62) shape with no is_spare/payment_method
  // columns — same real reason as the v58 fixture's own routes/drivers
  // pre-creation above: with the same-session migration-stacking bug
  // fixed, this fixture now walks through v61's and v62's own
  // `ALTER TABLE vehicles ADD COLUMN is_spare/payment_method ...`, which
  // throw "duplicate column name" unless vehicles pre-exists in its true
  // old shape rather than being created fresh (already with both
  // columns) by openSave()'s own unconditional `db.exec(SCHEMA)`.
  raw60.exec(`CREATE TABLE liveries (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw60.exec(`CREATE TABLE routes (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw60.exec(`
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      model_id TEXT NOT NULL,
      length_m REAL NOT NULL,
      variant_label TEXT,
      power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
      category_digit INTEGER NOT NULL,
      sequential_number INTEGER NOT NULL,
      fleet_number TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL UNIQUE,
      condition REAL NOT NULL DEFAULT 100,
      purchase_price_gbp INTEGER NOT NULL,
      bought_at TEXT NOT NULL,
      bought_game_day INTEGER NOT NULL DEFAULT 0,
      livery_id INTEGER REFERENCES liveries(id),
      bought_for_route_id INTEGER REFERENCES routes(id)
    )
  `);
  // route_timetables, old (pre-v64) shape with neither mirror column —
  // this fixture walks all the way through to the current version (the
  // v58-62 branches' own same-session-stacking fix), reaching the
  // v64->v65 migration's own ADD COLUMNs, which throw "duplicate column
  // name" unless this table pre-exists in its true old shape.
  raw60.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw60.exec(`INSERT INTO depot_groups (id, name, region) VALUES (1, 'V60 Migration Test', 'East Scotland')`);
  raw60.exec(`INSERT INTO depots (id, depot_group_id, name, lon, lat) VALUES (1, 1, 'V60 Depot', -3.1, 55.9)`);
  raw60.exec(`INSERT INTO drivers (id, depot_group_id, depot_id, name, score) VALUES (1, 1, 1, 'Pre-existing Driver', 'novice')`);
  raw60.exec("PRAGMA user_version = 60");
  raw60.close();

  const migrated60 = openSave(migrationPath60);
  const versionCheck60 = new DatabaseSync(migrationPath60);
  const { user_version: version60 } = versionCheck60.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck60.close();
  assert(version60 === SCHEMA_VERSION, `the v60 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version60}`);

  const preExistingDriver = listDriversForDepotGroup(migrated60, 1).find((d) => d.id === 1);
  assert(preExistingDriver !== undefined && preExistingDriver.name === "Pre-existing Driver", "the pre-existing driver row survives the migration untouched");
  assert(preExistingDriver?.privateHireVehicleId === null, "the new column backfills to NULL for a pre-existing driver, not an error or a default vehicle id");

  migrated60.close();
  unlinkSync(migrationPath60);
}

// --- v61 -> v62 migration: vehicles.is_spare (T184 — spare bus
// designation, Q22/OPEN-ITEMS.md). Old (v61) vehicles shape with no such
// column, plus one pre-existing vehicle row, to prove the ADD COLUMN
// migrates a real existing row to is_spare = 0/false rather than throwing
// or leaving it NULL. ---
{
  const migrationPath61 = "./electron/.verify-migration-v61.sqlite";
  if (existsSync(migrationPath61)) unlinkSync(migrationPath61);
  const raw61 = new DatabaseSync(migrationPath61);
  raw61.exec(`
    CREATE TABLE depot_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL DEFAULT '')
  `);
  raw61.exec(`
    CREATE TABLE depots (id INTEGER PRIMARY KEY AUTOINCREMENT, depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id), name TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL)
  `);
  // Empty stand-ins so vehicles' own FK columns below have a real table to
  // reference — node:sqlite's DatabaseSync enforces PRAGMA foreign_keys ON
  // by default, which fails an INSERT into vehicles with "no such table"
  // if livery_id/bought_for_route_id reference tables that don't exist at
  // all, even when the inserted values themselves are NULL.
  raw61.exec(`CREATE TABLE liveries (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw61.exec(`CREATE TABLE routes (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw61.exec(`
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      model_id TEXT NOT NULL,
      length_m REAL NOT NULL,
      variant_label TEXT,
      power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
      category_digit INTEGER NOT NULL,
      sequential_number INTEGER NOT NULL,
      fleet_number TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL UNIQUE,
      condition REAL NOT NULL DEFAULT 100,
      purchase_price_gbp INTEGER NOT NULL,
      bought_at TEXT NOT NULL,
      bought_game_day INTEGER NOT NULL DEFAULT 0,
      livery_id INTEGER REFERENCES liveries(id),
      bought_for_route_id INTEGER REFERENCES routes(id)
    )
  `);
  raw61.exec(`INSERT INTO depot_groups (id, name, region) VALUES (1, 'V61 Migration Test', 'East Scotland')`);
  raw61.exec(`INSERT INTO depots (id, depot_group_id, name, lon, lat) VALUES (1, 1, 'V61 Depot', -3.1, 55.9)`);
  raw61.exec(`
    INSERT INTO vehicles (id, depot_group_id, depot_id, model_id, length_m, power_type, category_digit, sequential_number, fleet_number, plate, purchase_price_gbp, bought_at)
    VALUES (1, 1, 1, 'adl-enviro400', 11.5, 'diesel', 4, 1, '4001', 'SA01ABC', 235000, '2026-01-01T00:00:00.000Z')
  `);
  // route_timetables, old (pre-v64) shape — this fixture walks all the
  // way through to the current version; see the v58 fixture's own
  // comment above for the full reasoning.
  raw61.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw61.exec("PRAGMA user_version = 61");
  raw61.close();

  const migrated61 = openSave(migrationPath61);
  const versionCheck61 = new DatabaseSync(migrationPath61);
  const { user_version: version61 } = versionCheck61.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck61.close();
  assert(version61 === SCHEMA_VERSION, `the v61 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version61}`);

  const preExistingVehicle = listVehiclesForDepotGroup(migrated61, 1).find((v) => v.id === 1);
  assert(preExistingVehicle !== undefined && preExistingVehicle.fleetNumber === "4001", "the pre-existing vehicle row survives the migration untouched");

  // is_spare (T184) existed briefly between v61->v62 and v63->v64, when
  // the spare-bus mechanic was removed entirely per the user's own direct
  // instruction 2026-11-14 (OPEN-ITEMS.md). This v61 fixture walks the
  // whole chain in one openSave() call (same same-session-stacking the
  // v58 fixture above exercises) — added then dropped in the same run —
  // so checking the real on-disk schema here proves the column is truly
  // gone, not just unused in the TypeScript layer.
  const finalColumns61 = migrated61.prepare("PRAGMA table_info(vehicles)").all() as { name: string }[];
  assert(!finalColumns61.some((c) => c.name === "is_spare"), "is_spare does not exist in the real schema after a v61 save walks the whole migration chain to the current version");

  migrated61.close();
  unlinkSync(migrationPath61);
}

// --- v62 -> v63 migration: vehicles.payment_method (T185 — real lease
// billing, follow-up to T184). Old (v62) vehicles shape with no such
// column, plus one pre-existing vehicle row, to prove the ADD COLUMN
// migrates a real existing row to payment_method = 'buy_outright' rather
// than throwing or leaving it NULL. ---
{
  const migrationPath62 = "./electron/.verify-migration-v62.sqlite";
  if (existsSync(migrationPath62)) unlinkSync(migrationPath62);
  const raw62 = new DatabaseSync(migrationPath62);
  raw62.exec(`
    CREATE TABLE depot_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL DEFAULT '')
  `);
  raw62.exec(`
    CREATE TABLE depots (id INTEGER PRIMARY KEY AUTOINCREMENT, depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id), name TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL)
  `);
  // Empty stand-ins so vehicles' own FK columns below have a real table to
  // reference — same reasoning as the v61 fixture above.
  raw62.exec(`CREATE TABLE liveries (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw62.exec(`CREATE TABLE routes (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw62.exec(`
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      model_id TEXT NOT NULL,
      length_m REAL NOT NULL,
      variant_label TEXT,
      power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
      category_digit INTEGER NOT NULL,
      sequential_number INTEGER NOT NULL,
      fleet_number TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL UNIQUE,
      condition REAL NOT NULL DEFAULT 100,
      purchase_price_gbp INTEGER NOT NULL,
      bought_at TEXT NOT NULL,
      bought_game_day INTEGER NOT NULL DEFAULT 0,
      livery_id INTEGER REFERENCES liveries(id),
      bought_for_route_id INTEGER REFERENCES routes(id),
      is_spare INTEGER NOT NULL DEFAULT 0
    )
  `);
  raw62.exec(`INSERT INTO depot_groups (id, name, region) VALUES (1, 'V62 Migration Test', 'East Scotland')`);
  raw62.exec(`INSERT INTO depots (id, depot_group_id, name, lon, lat) VALUES (1, 1, 'V62 Depot', -3.1, 55.9)`);
  raw62.exec(`
    INSERT INTO vehicles (id, depot_group_id, depot_id, model_id, length_m, power_type, category_digit, sequential_number, fleet_number, plate, purchase_price_gbp, bought_at)
    VALUES (1, 1, 1, 'adl-enviro400', 11.5, 'diesel', 4, 1, '4001', 'SA01ABC', 235000, '2026-01-01T00:00:00.000Z')
  `);
  // route_timetables, old (pre-v64) shape — this fixture walks all the
  // way through to the current version; see the v58 fixture's own
  // comment above for the full reasoning.
  raw62.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw62.exec("PRAGMA user_version = 62");
  raw62.close();

  const migrated62 = openSave(migrationPath62);
  const versionCheck62 = new DatabaseSync(migrationPath62);
  const { user_version: version62 } = versionCheck62.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck62.close();
  assert(version62 === SCHEMA_VERSION, `the v62 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version62}`);

  const preExistingVehicle62 = listVehiclesForDepotGroup(migrated62, 1).find((v) => v.id === 1);
  assert(preExistingVehicle62 !== undefined && preExistingVehicle62.fleetNumber === "4001", "the pre-existing vehicle row survives the migration untouched");
  assert(preExistingVehicle62?.paymentMethod === "buy_outright", "the new payment_method column backfills to 'buy_outright' for a pre-existing vehicle, not NULL or something else");

  migrated62.close();
  unlinkSync(migrationPath62);
}

// --- v63 -> v64 migration: removal of vehicles.is_spare (T184's spare-bus
// mechanic was dropped entirely per the user's own direct instruction
// 2026-11-14, OPEN-ITEMS.md). Old (v63) vehicles shape with BOTH is_spare
// and payment_method already present (the real shape a save sitting at
// v63 actually has), plus one pre-existing vehicle row with is_spare = 1,
// to prove DROP COLUMN removes the column for real rather than just the
// renderer/TypeScript layer no longer reading it. ---
{
  const migrationPath63 = "./electron/.verify-migration-v63.sqlite";
  if (existsSync(migrationPath63)) unlinkSync(migrationPath63);
  const raw63 = new DatabaseSync(migrationPath63);
  raw63.exec(`
    CREATE TABLE depot_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL DEFAULT '')
  `);
  raw63.exec(`
    CREATE TABLE depots (id INTEGER PRIMARY KEY AUTOINCREMENT, depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id), name TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL)
  `);
  // Empty stand-ins so vehicles' own FK columns below have a real table to
  // reference — same reasoning as the v61/v62 fixtures above.
  raw63.exec(`CREATE TABLE liveries (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw63.exec(`CREATE TABLE routes (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw63.exec(`
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
      depot_id INTEGER NOT NULL REFERENCES depots(id),
      model_id TEXT NOT NULL,
      length_m REAL NOT NULL,
      variant_label TEXT,
      power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
      category_digit INTEGER NOT NULL,
      sequential_number INTEGER NOT NULL,
      fleet_number TEXT NOT NULL UNIQUE,
      plate TEXT NOT NULL UNIQUE,
      condition REAL NOT NULL DEFAULT 100,
      purchase_price_gbp INTEGER NOT NULL,
      bought_at TEXT NOT NULL,
      bought_game_day INTEGER NOT NULL DEFAULT 0,
      livery_id INTEGER REFERENCES liveries(id),
      bought_for_route_id INTEGER REFERENCES routes(id),
      is_spare INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'buy_outright' CHECK (payment_method IN ('buy_outright', 'lease', 'lease_to_own'))
    )
  `);
  raw63.exec(`INSERT INTO depot_groups (id, name, region) VALUES (1, 'V63 Migration Test', 'East Scotland')`);
  raw63.exec(`INSERT INTO depots (id, depot_group_id, name, lon, lat) VALUES (1, 1, 'V63 Depot', -3.1, 55.9)`);
  raw63.exec(`
    INSERT INTO vehicles (id, depot_group_id, depot_id, model_id, length_m, power_type, category_digit, sequential_number, fleet_number, plate, purchase_price_gbp, bought_at, is_spare, payment_method)
    VALUES (1, 1, 1, 'adl-enviro400', 11.5, 'diesel', 4, 1, '4001', 'SA01ABC', 235000, '2026-01-01T00:00:00.000Z', 1, 'lease')
  `);
  // route_timetables, old (pre-v64) shape — this fixture walks all the
  // way through to the current version; see the v58 fixture's own
  // comment above for the full reasoning.
  raw63.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw63.exec("PRAGMA user_version = 63");
  raw63.close();

  const migrated63 = openSave(migrationPath63);
  const versionCheck63 = new DatabaseSync(migrationPath63);
  const { user_version: version63 } = versionCheck63.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck63.close();
  assert(version63 === SCHEMA_VERSION, `the v63 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version63}`);

  const finalColumns63 = migrated63.prepare("PRAGMA table_info(vehicles)").all() as { name: string }[];
  assert(!finalColumns63.some((c) => c.name === "is_spare"), "is_spare is genuinely dropped from the vehicles table, not just left unused, after a v63 save migrates to the current version");

  const preExistingVehicle63 = listVehiclesForDepotGroup(migrated63, 1).find((v) => v.id === 1);
  assert(preExistingVehicle63 !== undefined && preExistingVehicle63.fleetNumber === "4001", "the pre-existing vehicle row (which had is_spare = 1) survives the DROP COLUMN migration untouched otherwise");
  assert(preExistingVehicle63?.paymentMethod === "lease", "the pre-existing vehicle's unrelated payment_method value is untouched by the is_spare DROP COLUMN migration");
  assert(!("isSpare" in preExistingVehicle63!), "the real Vehicle object returned after migration carries no isSpare field at all");

  migrated63.close();
  unlinkSync(migrationPath63);
}

// --- v64 -> v65 migration: mirror_source_timetable_id/mirror_offset_
// minutes (2026-11-15, the return-journey auto-offset timetable feature —
// DESIGN.md §7). Old (v64) route_timetables shape with neither column yet,
// plus one pre-existing row, to prove the ALTER TABLE ADD COLUMNs add real
// nullable columns that backfill to NULL for every existing row, rather
// than requiring a value or losing the row. ---
{
  const migrationPath64 = "./electron/.verify-migration-v64.sqlite";
  if (existsSync(migrationPath64)) unlinkSync(migrationPath64);
  const raw64 = new DatabaseSync(migrationPath64);
  raw64.exec(`
    CREATE TABLE depot_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL DEFAULT '')
  `);
  raw64.exec(`CREATE TABLE routes (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw64.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw64.exec(`INSERT INTO depot_groups (id, name, region) VALUES (1, 'V64 Migration Test', 'East Scotland')`);
  raw64.exec(`INSERT INTO routes (id) VALUES (1)`);
  raw64.exec(`
    INSERT INTO route_timetables (id, route_id, weekday_mask, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds)
    VALUES (1, 1, 31, 'both', '[]', '[]', '[0]', '[0]')
  `);
  raw64.exec("PRAGMA user_version = 64");
  raw64.close();

  const migrated64 = openSave(migrationPath64);
  const versionCheck64 = new DatabaseSync(migrationPath64);
  const { user_version: version64 } = versionCheck64.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck64.close();
  assert(version64 === SCHEMA_VERSION, `the v64 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version64}`);

  const finalColumns64 = migrated64.prepare("PRAGMA table_info(route_timetables)").all() as { name: string }[];
  assert(finalColumns64.some((c) => c.name === "mirror_source_timetable_id"), "mirror_source_timetable_id exists after a v64 save migrates to the current version");
  assert(finalColumns64.some((c) => c.name === "mirror_offset_minutes"), "mirror_offset_minutes exists after a v64 save migrates to the current version");

  const preExistingTimetable64 = listRouteTimetablesForRoute(migrated64, 1).find((t) => t.id === 1);
  assert(preExistingTimetable64 !== undefined && preExistingTimetable64.weekdayMask === 31, "the pre-existing timetable row survives the migration untouched");
  assert(preExistingTimetable64?.mirrorSourceTimetableId === null, "the pre-existing timetable's new mirrorSourceTimetableId backfills to null, not a crash or a fabricated value");
  assert(preExistingTimetable64?.mirrorOffsetMinutes === null, "the pre-existing timetable's new mirrorOffsetMinutes backfills to null");

  migrated64.close();
  unlinkSync(migrationPath64);
}

// --- v65 -> v66 migration: timing points became padding above the real
// fastest achievable time, with a separate peak figure (2026-11-15). Old
// (v65) route_timetables shape — has the v64->v65 mirror columns already,
// but neither "_peak" offset column — plus one pre-existing row with a
// REAL old-shape timing_points entry ({pointIndex, legMinutes,
// dwellMinutes}), to prove the reset-to-zero-padding migration (not just
// an empty array) and the new peak-offset columns backfilling to a real
// copy of the existing non-peak ones, not an empty '[]'. ---
{
  const migrationPath65 = "./electron/.verify-migration-v65.sqlite";
  if (existsSync(migrationPath65)) unlinkSync(migrationPath65);
  const raw65 = new DatabaseSync(migrationPath65);
  raw65.exec(`
    CREATE TABLE depot_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, region TEXT NOT NULL DEFAULT '')
  `);
  raw65.exec(`CREATE TABLE routes (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  raw65.exec(`
    CREATE TABLE route_timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id),
      weekday_mask INTEGER NOT NULL,
      term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
      direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
      time_bands TEXT NOT NULL,
      timing_points TEXT NOT NULL,
      arrival_offsets_seconds TEXT NOT NULL,
      departure_offsets_seconds TEXT NOT NULL,
      excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
      custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
      mirror_source_timetable_id INTEGER REFERENCES route_timetables(id),
      mirror_offset_minutes INTEGER,
      UNIQUE (route_id, weekday_mask, term_facet, direction)
    )
  `);
  raw65.exec(`INSERT INTO depot_groups (id, name, region) VALUES (1, 'V65 Migration Test', 'East Scotland')`);
  raw65.exec(`INSERT INTO routes (id) VALUES (1)`);
  raw65.exec(`
    INSERT INTO route_timetables (id, route_id, weekday_mask, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds)
    VALUES (1, 1, 31, 'both', '[]', '[{"pointIndex":1,"legMinutes":12,"dwellMinutes":2}]', '[0,900]', '[0,1020]')
  `);
  raw65.exec("PRAGMA user_version = 65");
  raw65.close();

  const migrated65 = openSave(migrationPath65);
  const versionCheck65 = new DatabaseSync(migrationPath65);
  const { user_version: version65 } = versionCheck65.prepare("PRAGMA user_version").get() as { user_version: number };
  versionCheck65.close();
  assert(version65 === SCHEMA_VERSION, `the v65 fixture migrates all the way to schema v${SCHEMA_VERSION}, got v${version65}`);

  const finalColumns65 = migrated65.prepare("PRAGMA table_info(route_timetables)").all() as { name: string }[];
  assert(finalColumns65.some((c) => c.name === "arrival_offsets_seconds_peak"), "arrival_offsets_seconds_peak exists after a v65 save migrates to the current version");
  assert(finalColumns65.some((c) => c.name === "departure_offsets_seconds_peak"), "departure_offsets_seconds_peak exists after a v65 save migrates to the current version");

  const preExistingTimetable65 = listRouteTimetablesForRoute(migrated65, 1).find((t) => t.id === 1);
  assert(
    JSON.stringify(preExistingTimetable65?.timingPoints) === JSON.stringify([{ pointIndex: 1, standardPaddingMinutes: 0, peakPaddingMinutes: 0, dwellMinutes: 2 }]),
    `the pre-existing timing point's old legMinutes is reset to standardPaddingMinutes/peakPaddingMinutes 0 (dwellMinutes untouched), got ${JSON.stringify(preExistingTimetable65?.timingPoints)}`,
  );
  assert(
    JSON.stringify(preExistingTimetable65?.arrivalOffsetsSecondsPeak) === JSON.stringify([0, 900]) &&
      JSON.stringify(preExistingTimetable65?.departureOffsetsSecondsPeak) === JSON.stringify([0, 1020]),
    "the new peak-offset columns backfill to a real copy of the existing non-peak offsets, not an empty array",
  );

  migrated65.close();
  unlinkSync(migrationPath65);
}

// composed_from_route_ids (v28->v29, DESIGN.md §6 "Combining variations"),
// against a copy of the player's own real save — their routes are real,
// valuable data, not a synthetic fixture, so the migration must be proven
// against the real shape before trusting it.
{
  const realSave = path2.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
  if (existsSync(realSave)) {
    const copy = "./electron/.verify-real-save-copy.sqlite";
    if (existsSync(copy)) unlinkSync(copy);
    copyFileSync(realSave, copy);
    const upgraded = openSave(copy);
    const realRoutes = listRoutes(upgraded);
    assert(
      realRoutes.every((r) => Array.isArray(r.composedFromRouteIds) && r.composedFromRouteIds.length === 0),
      `every real route should migrate with composedFromRouteIds: [] (none are composed yet), got a route with ${JSON.stringify(realRoutes.find((r) => r.composedFromRouteIds.length !== 0)?.composedFromRouteIds)}`,
    );
    const created = createRoute(upgraded, realRoutes[0]?.depotGroupId ?? 1, "TEST-COMPOSED", [], "outbound", null, null, "#000000", null, null, null, [1, 2]);
    assert(JSON.stringify(created.composedFromRouteIds) === JSON.stringify([1, 2]), "composedFromRouteIds round-trips through createRoute on the real save");
    deleteRoute(upgraded, created.id);
    upgraded.close();
    unlinkSync(copy);
  } else {
    console.log("skip real save upgrade check: no save at", realSave);
  }
}

// --- duties (OPERATIONS.md §7, Phase 3) — depot-anchored numbering
// (2026-10-17 correction: a duty always belongs to one physical depot in
// its group, with duty_number itself encoding which one — 1xxx for the
// main depot, 2xxx for the next, and so on) ---
{
  db = openSave(path);
  const dutyGroup = createDepotGroup(db, "Fort William", "North Scotland");
  const depotA = createDepot(db, dutyGroup.id, "Fort William Depot", -5.1, 56.8, []).depot;
  const depotB = createDepot(db, dutyGroup.id, "Mallaig Outstation", -5.7, 57.0, []).depot;

  const dutyA1 = createDuty(db, dutyGroup.id, depotA.id, MONDAY_FRIDAY_MASK);
  assert(dutyA1.dutyNumber === "1001", `first duty at the main (lowest-id) depot gets 1001, got ${dutyA1.dutyNumber}`);
  const dutyA2 = createDuty(db, dutyGroup.id, depotA.id, MONDAY_FRIDAY_MASK);
  assert(dutyA2.dutyNumber === "1002", `second duty at the same depot gets 1002, got ${dutyA2.dutyNumber}`);
  const dutyB1 = createDuty(db, dutyGroup.id, depotB.id, MONDAY_FRIDAY_MASK);
  assert(dutyB1.dutyNumber === "2001", `first duty at the group's second depot gets 2001, got ${dutyB1.dutyNumber}`);

  // No separate persisted counter — numbering is derived from the current
  // max, so deleting the current highest (1002) frees exactly that number
  // for reuse; a gap left by deleting a lower number would NOT be reused
  // (the max above it is unaffected either way).
  deleteDuty(db, dutyA2.id);
  const dutyA3 = createDuty(db, dutyGroup.id, depotA.id, MONDAY_FRIDAY_MASK);
  assert(dutyA3.dutyNumber === "1002", `deleting the current highest-numbered duty frees that exact number for reuse — expected 1002, got ${dutyA3.dutyNumber}`);

  const listed = listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK);
  assert(
    listed.map((d) => d.dutyNumber).join(",") === "1001,1002,2001",
    `listDutiesForDepotGroup sorts numerically, which already groups by depot — got ${listed.map((d) => d.dutyNumber).join(",")}`,
  );
  assert(listed.every((d) => d.depotGroupId === dutyGroup.id), "every listed duty carries the right depotGroupId");
  assert(
    listed.find((d) => d.dutyNumber === "1001")?.depotId === depotA.id && listed.find((d) => d.dutyNumber === "2001")?.depotId === depotB.id,
    "each duty carries its own real depotId",
  );

  setDutyLocked(db, dutyA1.id, true);
  assert(listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyA1.id)?.locked === true, "lock took effect");

  renameDuty(db, dutyA1.id, "1001X");
  assert(listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyA1.id)?.dutyNumber === "1001X", "manual rename overrides the generated number");

  const dutyRoute = createRoute(db, dutyGroup.id, "99", [], "outbound", null, null, "#ff0000", null, null, null, []);
  const piece = addDutyPiece(db, dutyB1.id, dutyRoute.id, 480);
  assert(listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyB1.id)?.pieces.length === 1, "piece added");
  removeDutyPiece(db, piece.id);
  assert(listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyB1.id)?.pieces.length === 0, "piece removed");

  // Real bug (2026-10-31): deleting a route with a duty_piece still
  // pointing at it threw "FOREIGN KEY constraint failed", silently
  // swallowed by the renderer's delete button with no visible error —
  // reported as "the button lights up but does nothing." deleteRoute now
  // clears duty_pieces first, the same treatment as route_timetables.
  const deletableRoute = createRoute(db, dutyGroup.id, "100", [], "outbound", null, null, "#00ff00", null, null, null, []);
  addDutyPiece(db, dutyB1.id, deletableRoute.id, 500);
  assert(listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyB1.id)?.pieces.length === 1, "piece added for the route about to be deleted");
  deleteRoute(db, deletableRoute.id);
  assert(!listRoutes(db).some((r) => r.id === deletableRoute.id), "the route itself is gone");
  assert(
    listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyB1.id)?.pieces.length === 0,
    "deleting a route also removes any duty_piece built against it, rather than throwing",
  );

  deleteDuty(db, dutyB1.id);
  assert(!listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).some((d) => d.id === dutyB1.id), "deleteDuty also removes it from the listing");

  // --- drivers (schema v57->v58) ---
  assert(listDriversForDepotGroup(db, dutyGroup.id).length === 0, "a new depot group starts with no drivers");

  const driver1 = createDriver(db, dutyGroup.id, depotA.id, "Test Driver One");
  assert(driver1.score === "trainee", "createDriver defaults to trainee when no score is given");
  const driver2 = createDriver(db, dutyGroup.id, depotA.id, "Test Driver Two", "professional");
  assert(driver2.score === "professional", "createDriver round-trips an explicit score");

  const drivers = listDriversForDepotGroup(db, dutyGroup.id);
  assert(drivers.length === 2 && drivers.every((d) => d.depotGroupId === dutyGroup.id), "both drivers are listed, with the right depotGroupId");

  renameDriver(db, driver1.id, "Renamed Driver");
  assert(listDriversForDepotGroup(db, dutyGroup.id).find((d) => d.id === driver1.id)?.name === "Renamed Driver", "renameDriver updates the name");

  setDriverScore(db, driver1.id, "fleet_elite");
  assert(listDriversForDepotGroup(db, dutyGroup.id).find((d) => d.id === driver1.id)?.score === "fleet_elite", "setDriverScore updates the score");

  assert(dutyA1.driverId === null, "a newly created duty starts unassigned");
  setDutyDriver(db, dutyA1.id, driver1.id);
  assert(
    listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyA1.id)?.driverId === driver1.id,
    "setDutyDriver assigns a driver to a duty",
  );
  setDutyDriver(db, dutyA1.id, null);
  assert(
    listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyA1.id)?.driverId === null,
    "setDutyDriver(null) unassigns it again",
  );
  setDutyDriver(db, dutyA1.id, driver1.id);

  deleteDriver(db, driver1.id);
  assert(!listDriversForDepotGroup(db, dutyGroup.id).some((d) => d.id === driver1.id), "deleteDriver removes it from the listing");
  assert(
    listDutiesForDepotGroup(db, dutyGroup.id, MONDAY_FRIDAY_MASK).find((d) => d.id === dutyA1.id)?.driverId === null,
    "deleting an assigned driver unassigns them from their duty rather than leaving a dangling reference",
  );
  db.close();
}

// --- vehicles (OPERATIONS.md §3) — a minimal buy-one-vehicle flow,
// real fleet number and plate on purchase ---
{
  db = openSave(path);
  const vg = createDepotGroup(db, "Perth", "East Scotland");
  // Glasgow's own real coordinates, so the plate generator picks a real,
  // checkable area code (SA, per OPERATIONS.md §3).
  const vDepot = createDepot(db, vg.id, "Perth Depot", -4.2518, 55.8642, []).depot;

  const v1 = buyVehicle(db, vg.id, vDepot.id, "adl-enviro400", 11.5, null, "diesel", 235_000);
  assert(v1.fleetNumber === "4001", `first double-decker twin-axle vehicle gets fleet number 4001, got ${v1.fleetNumber}`);
  assert(v1.plate.startsWith("SA"), `a Glasgow-area depot gets an SA plate, got ${v1.plate}`);
  assert(v1.condition === 100, "a new vehicle starts at full condition");
  assert(v1.paymentMethod === "buy_outright", "buyVehicle defaults to buy_outright when no paymentMethod argument is given (T185)");

  const v2 = buyVehicle(db, vg.id, vDepot.id, "adl-enviro400", 11.5, null, "diesel", 235_000);
  assert(v2.fleetNumber === "4002", `second vehicle in the same category gets 4002, got ${v2.fleetNumber}`);

  const v3 = buyVehicle(db, vg.id, vDepot.id, "adl-enviro400", 11.1, null, "electric", 380_000);
  assert(v3.fleetNumber === "4003e", `an electric double-decker twin-axle shares the same 4xxx sequence as its diesel sibling, with an e suffix, got ${v3.fleetNumber}`);

  const v4 = buyVehicle(db, vg.id, vDepot.id, "wrightbus-gb-kite", 12.2, null, "hydrogen", 420_000);
  assert(v4.fleetNumber === "3001h", `a hydrogen full-size single-deck gets category 3 with an h suffix, got ${v4.fleetNumber}`);

  const listed = listVehiclesForDepotGroup(db, vg.id);
  assert(listed.length === 4, `all 4 bought vehicles are listed, got ${listed.length}`);
  assert(listed.every((v) => v.depotGroupId === vg.id && v.depotId === vDepot.id), "every listed vehicle carries the right depot group and depot");
  assert(new Set(listed.map((v) => v.fleetNumber)).size === 4, "every fleet number is unique");
  assert(new Set(listed.map((v) => v.plate)).size === 4, "every plate is unique");

  deleteVehicle(db, v2.id);
  assert(listVehiclesForDepotGroup(db, vg.id).length === 3, "deleteVehicle removes it from the listing");
  // v2 (4002) is the MIDDLE entry in category 4, not the current max (v3
  // is 4003e) — deleting it leaves a gap rather than freeing a number,
  // the same MAX-based convention already established for duty numbers.
  const v5 = buyVehicle(db, vg.id, vDepot.id, "adl-enviro400", 11.5, null, "diesel", 235_000);
  assert(v5.fleetNumber === "4004", `deleting a non-max vehicle (4002) leaves a gap rather than reusing it — next is 4004, got ${v5.fleetNumber}`);

  let threwOnBadDepot = false;
  try {
    buyVehicle(db, vg.id, 999_999, "adl-enviro400", 11.5, null, "diesel", 235_000);
  } catch {
    threwOnBadDepot = true;
  }
  assert(threwOnBadDepot, "buying against a non-existent depot throws rather than silently generating a nonsense plate");

  // --- buyVehicle's own explicit paymentMethod argument (T185) — a
  // separate vehicle, not folded into the counted sequence above, so it
  // doesn't disturb any of that section's own fleet-number/count
  // assertions. ---
  const v1Leased = buyVehicle(db, vg.id, vDepot.id, "adl-enviro400", 11.5, null, "diesel", 235_000, null, null, null, "lease");
  assert(v1Leased.paymentMethod === "lease", "buyVehicle round-trips an explicit paymentMethod (T185)");
  assert(listVehiclesForDepotGroup(db, vg.id).find((v) => v.id === v1Leased.id)?.paymentMethod === "lease", "listVehiclesForDepotGroup round-trips paymentMethod too");
  assert(listAllVehicles(db).find((v) => v.id === v1Leased.id)?.paymentMethod === "lease", "listAllVehicles round-trips paymentMethod too");

  const transferredLeased = transferVehicle(db, v1Leased.id, vDepot.id);
  assert(transferredLeased.paymentMethod === "lease", "transferVehicle's own returned Vehicle still carries paymentMethod (T185)");

  db.close();
}

// --- buy-menu rebuild (2026-10-18): livery_id on vehicles, the basket,
// orders awaiting collection, and depot-to-depot transfers ---
{
  db = openSave(path);
  const bg = createDepotGroup(db, "Basket Test", "East Scotland");
  const bDepotA = createDepot(db, bg.id, "Depot A", -3.1883, 55.9533, []).depot;
  const bDepotB = createDepot(db, bg.id, "Depot B", -3.2, 55.96, []).depot;
  const livery = createLivery(db, "Test Livery", "#112233", "#445566");

  // buyVehicle's own optional liveryId/conditionOverride round-trip.
  const liveriedVehicle = buyVehicle(db, bg.id, bDepotA.id, "adl-enviro400", 10.5, null, "diesel", 235_000, livery.id);
  assert(liveriedVehicle.liveryId === livery.id, "buyVehicle round-trips an explicit liveryId");
  const usedConditionVehicle = buyVehicle(db, bg.id, bDepotA.id, "adl-enviro400", 10.5, null, "diesel", 100_000, null, 55);
  assert(usedConditionVehicle.condition === 55, "buyVehicle round-trips an explicit conditionOverride (for a used vehicle)");
  const plainVehicle = buyVehicle(db, bg.id, bDepotA.id, "adl-enviro400", 10.5, null, "diesel", 235_000);
  assert(plainVehicle.liveryId === null, "a vehicle bought with no liveryId argument defaults to null (plain white)");
  assert(listVehiclesForDepotGroup(db, bg.id).find((v) => v.id === liveriedVehicle.id)?.liveryId === livery.id, "listVehiclesForDepotGroup round-trips liveryId too");

  // setRouteVehicleRestrictions' own liveryId axis against a REAL livery id
  // (the earlier check elsewhere in this script used null, since no livery
  // existed yet that early) — confirms the vehicle_restriction_livery_id
  // REFERENCES liveries(id) foreign key accepts a genuine id, not just null.
  const restrictionRoute = createRoute(db, bg.id, "99R", [], "outbound", null, null, "#654321", null, null, null);
  setRouteVehicleRestrictions(db, restrictionRoute.id, { baseType: null, powerType: null, axleCount: null, liveryId: livery.id });
  const restrictedRoute = listRoutes(db).find((r) => r.id === restrictionRoute.id)!;
  assert(restrictedRoute.vehicleRestrictions.liveryId === livery.id, "setRouteVehicleRestrictions round-trips a real liveryId foreign key");

  // transferVehicle moves a vehicle to a different depot (and depot group,
  // if the target depot belongs to a different one).
  const transferred = transferVehicle(db, plainVehicle.id, bDepotB.id);
  assert(transferred.depotId === bDepotB.id, "transferVehicle updates depotId");
  assert(transferred.depotGroupId === bg.id, "transferVehicle keeps the same depot group when the target depot is in it");

  // --- basket ---
  const item1 = addBasketItem(db, bg.id, bDepotA.id, "adl-enviro400", 10.5, null, "diesel", null, "Alexander Dennis", 2, 235_000, "buy_outright", false, null);
  assert(item1.quantity === 2, "addBasketItem stores the quantity given");
  const item2 = addBasketItem(db, bg.id, bDepotA.id, "volvo-7900", 12, null, "hybrid", livery.id, "Volvo", 1, 240_000, "lease", false, null);
  assert(listBasket(db).length === 2, "both basket items are listed");

  setBasketItemQuantity(db, item1.id, 3);
  assert(listBasket(db).find((i) => i.id === item1.id)?.quantity === 3, "setBasketItemQuantity updates the quantity");
  setBasketItemQuantity(db, item2.id, 0);
  assert(listBasket(db).find((i) => i.id === item2.id) === undefined, "setBasketItemQuantity with 0 removes the item (same as Remove)");

  const item3 = addBasketItem(db, bg.id, bDepotA.id, "volvo-7900", 12, null, "hybrid", livery.id, "Volvo", 1, 240_000, "lease", false, null);
  setBasketItemDepot(db, item3.id, bg.id, bDepotB.id);
  assert(listBasket(db).find((i) => i.id === item3.id)?.depotId === bDepotB.id, "setBasketItemDepot moves a basket item to a different depot");
  setBasketItemLivery(db, item3.id, null);
  assert(listBasket(db).find((i) => i.id === item3.id)?.liveryId === null, "setBasketItemLivery clears a basket item's livery back to plain white");

  const usedItem = addBasketItem(db, bg.id, bDepotA.id, "adl-enviro400", 10.5, null, "diesel", null, "Alexander Dennis", 1, 90_000, "buy_outright", true, 42);
  assert(usedItem.isUsed && usedItem.usedCondition === 42, "a used basket item stores isUsed and usedCondition");

  removeBasketItem(db, usedItem.id);
  assert(listBasket(db).find((i) => i.id === usedItem.id) === undefined, "removeBasketItem removes it outright");

  // item1 (qty 3) + item3 (qty 1) = 4 vehicles' worth of orders.
  const beforeOrderCount = listOrders(db).length;
  const createdCount = placeOrder(db);
  assert(createdCount === 4, `placeOrder expands quantity into one order row per vehicle — 3 + 1 = 4, got ${createdCount}`);
  assert(listBasket(db).length === 0, "placeOrder empties the basket");
  const ordersNow = listOrders(db);
  assert(ordersNow.length === beforeOrderCount + 4, "the 4 new orders are listed");

  const orderToCollect = ordersNow.find((o) => o.modelId === "volvo-7900")!;
  // item3 (volvo-7900) was basketed with paymentMethod "lease" — this is
  // the real bug T185 fixes: collectOrder used to read payment_method off
  // the order and then silently discard it, so every collected vehicle
  // became buy_outright regardless of what was actually ordered.
  assert(orderToCollect.paymentMethod === "lease", "the order itself carries the real 'lease' paymentMethod it was basketed with");
  const beforeVehicleCount = listVehiclesForDepotGroup(db, bg.id).length;
  const collected = collectOrder(db, orderToCollect.id);
  assert(collected.modelId === "volvo-7900", "collectOrder finalises the right order into a real vehicle");
  assert(collected.fleetNumber.length > 0 && collected.plate.length > 0, "a collected order gets a real fleet number and plate, same as any other buyVehicle");
  assert(collected.paymentMethod === "lease", "collectOrder (T185) now carries the order's real paymentMethod through to the finalised vehicle, instead of silently dropping it to buy_outright");
  assert(listVehiclesForDepotGroup(db, bg.id).find((v) => v.id === collected.id)?.paymentMethod === "lease", "the collected vehicle's real paymentMethod round-trips through listVehiclesForDepotGroup too");
  assert(listVehiclesForDepotGroup(db, bg.id).length === beforeVehicleCount + 1, "the collected vehicle is now a real owned vehicle");
  assert(!listOrders(db).some((o) => o.id === orderToCollect.id), "collectOrder removes the order once finalised");

  const outrightOrder = ordersNow.find((o) => o.modelId === "adl-enviro400")!;
  assert(outrightOrder.paymentMethod === "buy_outright", "a basket item placed with 'buy_outright' carries that same value through to its own order");
  const collectedOutright = collectOrder(db, outrightOrder.id);
  assert(collectedOutright.paymentMethod === "buy_outright", "collectOrder carries a real 'buy_outright' paymentMethod through correctly too, not just the lease case");

  let threwOnBadOrder = false;
  try {
    collectOrder(db, 999_999);
  } catch {
    threwOnBadOrder = true;
  }
  assert(threwOnBadOrder, "collecting a non-existent order throws rather than silently doing nothing");

  // --- Private hire revival (T183, Q20/OPEN-ITEMS.md) — driver auto-hire
  // on collect, and cleanup on delete ---
  const phLivery = createLivery(db, "Lothian Coaches", "#203030", "#ffb000");
  addBasketItem(db, bg.id, bDepotA.id, "volvo-9700", 12.2, null, "diesel", phLivery.id, "Volvo", 1, 320_000, "buy_outright", false, null);
  placeOrder(db);
  const phOrder = listOrders(db).find((o) => o.modelId === "volvo-9700" && o.liveryId === phLivery.id)!;
  const phDriversBefore = listDriversForDepotGroup(db, bg.id).length;
  const phVehicle = collectOrder(db, phOrder.id);
  const phDriversAfter = listDriversForDepotGroup(db, bg.id);
  assert(phDriversAfter.length === phDriversBefore + 1, "collecting a Lothian-Coaches-liveried coach auto-hires exactly one new driver");
  const phDriver = phDriversAfter.find((d) => d.privateHireVehicleId === phVehicle.id);
  assert(phDriver !== undefined, "the auto-hired driver is traceable back to its own vehicle via privateHireVehicleId");
  assert(phDriver?.score === "trainee", "the auto-hired driver starts as a trainee, same default as any other createDriver call");

  // A vehicle bought with an ordinary livery (not Lothian Coaches) gets no
  // auto-hired driver at all — collectOrder is a no-op for every ordinary
  // purchase.
  addBasketItem(db, bg.id, bDepotA.id, "adl-enviro400", 10.5, null, "diesel", livery.id, "Alexander Dennis", 1, 235_000, "buy_outright", false, null);
  placeOrder(db);
  const ordinaryOrder = listOrders(db).find((o) => o.modelId === "adl-enviro400" && o.liveryId === livery.id)!;
  const driversBeforeOrdinary = listDriversForDepotGroup(db, bg.id).length;
  collectOrder(db, ordinaryOrder.id);
  assert(listDriversForDepotGroup(db, bg.id).length === driversBeforeOrdinary, "collecting an ordinarily-liveried vehicle auto-hires no driver");

  // --- private_hire_income_months tracking table (T183) — plain storage,
  // all the real month math lives in private-hire-income.mts (its own
  // verify.mts) — this just proves the round trip and the "re-recording
  // is a safe no-op" INSERT OR IGNORE behaviour. Done against phVehicle
  // BEFORE it's deleted below (month_key, like every other table here,
  // has a real REFERENCES vehicles(id) — node:sqlite's DatabaseSync
  // enforces foreign_keys ON by default, confirmed directly, so this
  // needs a real, still-existing vehicle id, not an arbitrary one).
  assert(listGeneratedPrivateHireMonths(db, phVehicle.id).length === 0, "a vehicle with no generated months yet returns an empty list");
  recordGeneratedPrivateHireMonths(db, phVehicle.id, ["2026-11", "2026-12"]);
  assert(
    JSON.stringify(listGeneratedPrivateHireMonths(db, phVehicle.id).sort()) === JSON.stringify(["2026-11", "2026-12"]),
    "recordGeneratedPrivateHireMonths/listGeneratedPrivateHireMonths round-trip for a vehicle",
  );
  recordGeneratedPrivateHireMonths(db, phVehicle.id, ["2026-11"]); // re-recording an already-generated month
  assert(
    listGeneratedPrivateHireMonths(db, phVehicle.id).length === 2,
    "re-recording an already-generated month is a safe no-op (INSERT OR IGNORE), not a duplicate or an error",
  );

  // --- lease_billing_months tracking table (T185) — plain storage,
  // identical shape/round-trip behaviour to private_hire_income_months
  // above; the real month math lives in vehicle-lease-billing.mts (its
  // own verify.mts). Run against `collected`, the real leased
  // volvo-7900 vehicle from earlier in this test block, so the FK to a
  // real vehicle id holds the same way the private-hire check above
  // relies on phVehicle.
  assert(listGeneratedLeaseBillingMonths(db, collected.id).length === 0, "a vehicle with no billed months yet returns an empty list");
  recordLeaseBillingMonths(db, collected.id, ["2026-11", "2026-12"], false);
  assert(
    JSON.stringify(listGeneratedLeaseBillingMonths(db, collected.id).sort()) === JSON.stringify(["2026-11", "2026-12"]),
    "recordLeaseBillingMonths/listGeneratedLeaseBillingMonths round-trip for a vehicle",
  );
  recordLeaseBillingMonths(db, collected.id, ["2026-11"], false); // re-recording an already-billed month
  assert(
    listGeneratedLeaseBillingMonths(db, collected.id).length === 2,
    "re-recording an already-billed month is a safe no-op (INSERT OR IGNORE), not a duplicate or an error",
  );
  assert(listVehiclesForDepotGroup(db, bg.id).find((v) => v.id === collected.id)?.paymentMethod === "lease", "recordLeaseBillingMonths with flipToOutright=false leaves paymentMethod untouched");

  // flipToOutright=true (the real lease-to-own term-completion moment,
  // OPERATIONS.md §3 "then ownership") flips payment_method in the same
  // call as recording the final billed month.
  recordLeaseBillingMonths(db, collected.id, ["2027-01"], true);
  assert(
    listGeneratedLeaseBillingMonths(db, collected.id).length === 3,
    "the final chargeable month is still recorded even when flipToOutright is also true",
  );
  assert(
    listVehiclesForDepotGroup(db, bg.id).find((v) => v.id === collected.id)?.paymentMethod === "buy_outright",
    "recordLeaseBillingMonths with flipToOutright=true flips the vehicle's own paymentMethod to buy_outright in the same call",
  );

  // Real bug found and fixed while writing this test (T185): deleteVehicle
  // only ever cleared private_hire_income_months before, never
  // lease_billing_months — a vehicle with real billed lease months would
  // have thrown "FOREIGN KEY constraint failed" on delete, the same class
  // of bug T183's own deleteVehicle comment already protects against for
  // its own table. Proven directly rather than just inferred from reading
  // the fix: deleting a vehicle with 3 real lease_billing_months rows
  // against it must not throw.
  let threwOnDeleteLeasedVehicle = false;
  try {
    deleteVehicle(db, collected.id);
  } catch {
    threwOnDeleteLeasedVehicle = true;
  }
  assert(!threwOnDeleteLeasedVehicle, "deleteVehicle also clears lease_billing_months first, so deleting a vehicle with billed lease months doesn't throw a foreign key constraint violation");
  assert(!listVehiclesForDepotGroup(db, bg.id).some((v) => v.id === collected.id), "the leased vehicle really is gone after delete");

  // Deleting the private-hire vehicle cleans up its auto-hired driver too
  // — no orphaned phantom driver left behind.
  deleteVehicle(db, phVehicle.id);
  assert(!listDriversForDepotGroup(db, bg.id).some((d) => d.id === phDriver!.id), "deleteVehicle removes the private-hire vehicle's own auto-hired driver too");

  // --- Game clock (game_clock, DESIGN.md §3) ---
  const defaultClock = getGameClock(db);
  assert(
    defaultClock.accumulatedGameSeconds === 0 && defaultClock.speedMultiplier === 1 && defaultClock.isPaused === false,
    "a never-set game clock defaults to second 0, 1x, unpaused",
  );
  setGameClock(db, { accumulatedGameSeconds: 123456, speedMultiplier: 20, isPaused: true });
  const afterSet = getGameClock(db);
  assert(
    afterSet.accumulatedGameSeconds === 123456 && afterSet.speedMultiplier === 20 && afterSet.isPaused === true,
    "setGameClock round-trips every field",
  );
  setGameClock(db, { accumulatedGameSeconds: 999, speedMultiplier: 1, isPaused: false });
  const afterSecondSet = getGameClock(db);
  assert(afterSecondSet.accumulatedGameSeconds === 999 && afterSecondSet.isPaused === false, "a second setGameClock updates in place, not a second row");

  // --- Finance ledger (DESIGN.md §10) ---
  assert(getCompanyBalanceGBPPence(db) === 10_000_000, "a brand new save is seeded with exactly the real £100,000 opening balance");
  const openingTxns = listFinanceTransactions(db);
  assert(openingTxns.length === 1 && openingTxns[0].category === "opening_balance", "the opening balance is itself a real transaction row, not a special-cased constant");

  recordFinanceTransaction(db, -500_00, "ticket_machine", g1.id, "Test spend", 5);
  assert(getCompanyBalanceGBPPence(db) === 10_000_000 - 50_000, "a recorded expense reduces the derived balance by exactly its own amount");
  recordFinanceTransaction(db, 200_00, "test_income", null, "Test income", 6);
  assert(getCompanyBalanceGBPPence(db) === 10_000_000 - 50_000 + 20_000, "income and expense transactions both net into the same derived balance");

  const g1Txns = listFinanceTransactions(db, g1.id);
  assert(g1Txns.length === 1 && g1Txns[0].description === "Test spend", "filtering by depot group returns only that group's own attributed transactions");
  assert(listFinanceTransactions(db).length === 3, "the whole-company view (no depot group filter) sees every transaction");

  db.close();
}

// --- Re-power (T179, OPEN-ITEMS.md): dealers.isRepowerSite, repower_bookings
// CRUD, and collectRepowerBooking actually converting the vehicle ---
{
  db = openSave(path);
  const rg = createDepotGroup(db, "Repower Test", "East Scotland");
  const rDepot = createDepot(db, rg.id, "Repower Depot", -3.19, 55.95, []).depot;

  const evmDealer = createDealer(db, "EVM (Horsham)", "evm", -0.3463469, 51.0367201, []).dealer;
  assert(evmDealer.isRepowerSite === false, "a newly created dealer is not a re-power site by default");

  setDealerRepowerSite(db, evmDealer.id, true);
  let dealersNow = listDealers(db);
  assert(dealersNow.find((d) => d.id === evmDealer.id)?.isRepowerSite === true, "setDealerRepowerSite round-trips true");

  // At most one dealer per manufacturer is the re-power site.
  const secondEvmDealer = createDealer(db, "Another EVM site", "evm", -1, 51, []).dealer;
  setDealerRepowerSite(db, secondEvmDealer.id, true);
  dealersNow = listDealers(db);
  assert(dealersNow.find((d) => d.id === secondEvmDealer.id)?.isRepowerSite === true, "the second dealer marked as the re-power site is now true");
  assert(dealersNow.find((d) => d.id === evmDealer.id)?.isRepowerSite === false, "marking a second dealer of the same manufacturer as the re-power site un-marks the first — at most one per manufacturer");

  // A diesel evm-cityline vehicle, booked and then collected, really
  // converts: power_type, fleet_number (the 'r' suffix), condition reset
  // to 100.
  const dieselVehicle = buyVehicle(db, rg.id, rDepot.id, "evm-cityline", 7.4, null, "diesel", 75_000, null, 40);
  assert(dieselVehicle.condition === 40, "the test vehicle starts at a real used condition, not 100 (so the post-collect reset is a genuine change)");
  const originalFleetNumber = dieselVehicle.fleetNumber;

  const booking = createRepowerBooking(db, dieselVehicle.id, secondEvmDealer.id, "electric", 62_500, 0, 1, 15);
  assert(booking.vehicleId === dieselVehicle.id && booking.toPowerType === "electric" && booking.finalPriceGBP === 62_500, "createRepowerBooking round-trips every field");
  assert(listAllRepowerBookings(db).some((b) => b.id === booking.id), "listAllRepowerBookings sees the new booking");

  const collected = collectRepowerBooking(db, booking.id);
  assert(collected.powerType === "electric", "collectRepowerBooking actually converts the vehicle's power_type");
  assert(collected.condition === 100, "collectRepowerBooking resets condition to 100 (NewPower's own 'fully checked and repaired')");
  assert(collected.fleetNumber !== originalFleetNumber && collected.fleetNumber.endsWith("re"), `collectRepowerBooking rewrites the fleet number with the re-power 'r' suffix, got "${collected.fleetNumber}" from "${originalFleetNumber}"`);
  assert(!listAllRepowerBookings(db).some((b) => b.id === booking.id), "the booking is gone once collected — nothing left to show");

  // Cancelling (deleting) an un-collected booking leaves the vehicle untouched.
  const secondVehicle = buyVehicle(db, rg.id, rDepot.id, "evm-cityline", 7.4, null, "diesel", 75_000);
  const cancellable = createRepowerBooking(db, secondVehicle.id, secondEvmDealer.id, "electric", 62_500, 0, 1, 15);
  deleteRepowerBooking(db, cancellable.id);
  assert(!listAllRepowerBookings(db).some((b) => b.id === cancellable.id), "deleteRepowerBooking removes a booking before it's collected");
  assert(listVehiclesForDepotGroup(db, rg.id).find((v) => v.id === secondVehicle.id)?.powerType === "diesel", "cancelling a booking never touches the vehicle — it's still diesel");

  let threwOnBadBooking = false;
  try {
    collectRepowerBooking(db, 999_999);
  } catch {
    threwOnBadBooking = true;
  }
  assert(threwOnBadBooking, "collecting a non-existent booking throws rather than silently doing nothing");

  db.close();
}

// v31 -> v36 (depot_id on duties, the vehicles table, the buy-menu
// rebuild's livery_id/basket_items/vehicle_orders, fare_zones, then its own
// colour column), against a copy of the player's own real save — proven
// against the real shape, not just a synthetic fixture.
{
  const realSave = path2.join(process.env.APPDATA ?? "", "bus-game", "save.sqlite");
  if (existsSync(realSave)) {
    const copy = "./electron/.verify-real-save-duties-copy.sqlite";
    if (existsSync(copy)) unlinkSync(copy);
    copyFileSync(realSave, copy);
    const upgraded = openSave(copy);
    const versionCheckDb = new DatabaseSync(copy);
    const { user_version } = versionCheckDb.prepare("PRAGMA user_version").get() as { user_version: number };
    versionCheckDb.close();
    assert(user_version === SCHEMA_VERSION, `real save migrates to schema v${SCHEMA_VERSION}, got v${user_version}`);
    const realGroups = listDepotGroups(upgraded);
    if (realGroups.length > 0) {
      const realDepots = listDepots(upgraded);
      const groupWithDepot = realGroups.find((g) => realDepots.some((d) => d.depotGroupId === g.id));
      if (groupWithDepot) {
        const depot = realDepots.find((d) => d.depotGroupId === groupWithDepot.id)!;
        const created = createDuty(upgraded, groupWithDepot.id, depot.id, MONDAY_FRIDAY_MASK);
        assert(created.depotId === depot.id, "a duty created on the real (migrated) save carries the right depotId");
        deleteDuty(upgraded, created.id);

        const boughtVehicle = buyVehicle(upgraded, groupWithDepot.id, depot.id, "adl-enviro400", 11.5, null, "diesel", 235_000);
        assert(boughtVehicle.fleetNumber.startsWith("4"), `a vehicle bought on the real (migrated) save gets a real fleet number, got ${boughtVehicle.fleetNumber}`);
        assert(/^[A-Z]{2,3}/.test(boughtVehicle.plate), `a vehicle bought on the real (migrated) save gets a real plate, got ${boughtVehicle.plate}`);
        deleteVehicle(upgraded, boughtVehicle.id);
      } else {
        console.log("skip real-save duty/vehicle creation check: no depot group in the real save has a depot yet");
      }
    }
    // Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9
    // redesign...", 2026-11-16) — real round-trip against the real
    // migrated save's own fresh stop_upgrades table.
    assert(listAllStopUpgrades(upgraded).length === 0, "a freshly migrated real save starts with no stop upgrades at all");
    assert(getStopUpgrade(upgraded, 123456) === null, "a stop with no row yet reports null, not a fabricated default");
    const installed = installStopUpgrade(upgraded, 123456, "seating", 7);
    assert(installed.hasSeating === true && installed.hasLighting === false && installed.hasShelter === false, "installing seating only flips that one flag");
    assert(installed.seatingInstalledGameDay === 7, "the real game day it was installed on is recorded");
    const installedLighting = installStopUpgrade(upgraded, 123456, "lighting", 9);
    assert(installedLighting.hasSeating === true && installedLighting.hasLighting === true, "installing a second upgrade at the same stop doesn't clear the first");
    assert(getStopUpgrade(upgraded, 123456)?.lightingInstalledGameDay === 9, "a second real install call updates the existing row (ON CONFLICT), not a duplicate");
    assert(listAllStopUpgrades(upgraded).length === 1, "still exactly one row for this one real stop, not two");

    upgraded.close();
    unlinkSync(copy);
  } else {
    console.log("skip real save v31->v36 migration check: no save at", realSave);
  }
}

unlinkSync(path);
console.log("\nAll checks passed.");
