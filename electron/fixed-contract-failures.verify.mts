// Manual verification for the fixed-contract fine/suspension STORAGE layer
// (db.mts's own fixed_contract_fine_events/fixed_contract_suspensions
// tables) — the real algorithmic decisions live in
// src/renderer/fixed-contract-failures.mts and are tested there; this
// checks only that the plain storage round-trips correctly and that a
// fine genuinely posts to the real finance ledger, same scope/style as
// repaint-shop.verify.mts. Run with
// `node --experimental-strip-types electron/fixed-contract-failures.verify.mts`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openSave,
  createDepotGroup,
  createRoute,
  recordFixedContractFineEvent,
  listFixedContractFineEvents,
  createFixedContractSuspension,
  listFixedContractSuspensions,
  listAllActiveFixedContractSuspensions,
  deactivateFixedContractSuspension,
  listFinanceTransactions,
  getCompanyBalanceGBPPence,
} from "./db.mts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixed-contract-verify-"));
const db = openSave(path.join(dir, "save.sqlite"));

const depotGroup = createDepotGroup(db, "Glasgow", "West Scotland");
const route398 = createRoute(
  db,
  depotGroup.id,
  "398",
  [
    { kind: "waypoint", lon: -4.25, lat: 55.86 },
    { kind: "waypoint", lon: -4.24, lat: 55.86 },
    { kind: "waypoint", lon: -4.26, lat: 55.86 },
  ],
  "outbound",
  1,
  1,
  "#002664",
  "398",
  null,
  null,
);

// --- Fine events: round-trip, AND a real finance posting ------------------
const balanceBefore = getCompanyBalanceGBPPence(db);
const fine = recordFixedContractFineEvent(db, route398.id, "398", depotGroup.id, 1_000, 57, 20, 150_000);
assert(fine.routeId === route398.id && fine.gameDay === 1_000 && fine.missedUnits === 20 && fine.fineGBPPence === 150_000, "a fine event is recorded and returned with the real values");
assert(listFixedContractFineEvents(db, route398.id).length === 1, "the fine event is listed back for its route");
assert(listFixedContractFineEvents(db, route398.id)[0].scheduledUnits === 57, "scheduledUnits round-trips");

const balanceAfter = getCompanyBalanceGBPPence(db);
assert(balanceAfter === balanceBefore - 150_000, "recording a fine event ALSO posts the real negative amount to the finance ledger — a fine that only lived in this table, never touching company money, would not be a real mechanic");

const financeRows = listFinanceTransactions(db, depotGroup.id);
assert(financeRows.length === 1 && financeRows[0].category === "Fixed contract fines", "the finance posting uses the 'Fixed contract fines' category");
assert(financeRows[0].description.includes("398") && financeRows[0].description.includes("20"), "the finance posting's own description names the route and the missed-unit count");

// A second fine event for a different day is a separate row, not an update.
recordFixedContractFineEvent(db, route398.id, "398", depotGroup.id, 1_001, 57, 5, 37_500);
assert(listFixedContractFineEvents(db, route398.id).length === 2, "a second day's fine event is a separate row");
assert(getCompanyBalanceGBPPence(db) === balanceBefore - 150_000 - 37_500, "both fines are reflected in the real running balance");

// The UNIQUE(route_id, game_day) constraint rejects a duplicate fine for
// the same route on the same real day — fixed-contract-failures.mts's own
// evaluateFixedContractDay is only ever meant to run once per route per
// day, so a second call for the same day is a caller bug, not a valid
// second fine.
let rejectedDuplicateDay = false;
try {
  recordFixedContractFineEvent(db, route398.id, "398", depotGroup.id, 1_000, 57, 10, 75_000);
} catch {
  rejectedDuplicateDay = true;
}
assert(rejectedDuplicateDay, "a second fine event for the same route on the same game day is rejected (UNIQUE route_id+game_day)");

// --- Suspensions: round-trip, multiple batches, and the real 1-year
// return (deactivate) ------------------------------------------------------
const suspension1 = createFixedContractSuspension(db, route398.id, 0b0011111, 20, 57, 1_002, 1_002 + 365);
assert(suspension1.active === true && suspension1.suspendedUnits === 20 && suspension1.totalUnits === 57, "a suspension batch is created and returned with the real values, active by default");
assert(listFixedContractSuspensions(db, route398.id).length === 1, "the suspension is listed back for its route");

// An escalation is a SECOND independent row, not an update to the first —
// see fixed_contract_suspensions' own CREATE TABLE comment.
const suspension2 = createFixedContractSuspension(db, route398.id, 0b0011111, 14, 57, 1_010, 1_010 + 365);
assert(listFixedContractSuspensions(db, route398.id).length === 2, "an escalation creates a second, independent batch row");
assert(suspension1.id !== suspension2.id, "the two batches have distinct ids, each with its own start/return day");

assert(listAllActiveFixedContractSuspensions(db).length === 2, "both batches are listed as active across the whole save, not just this one route");

deactivateFixedContractSuspension(db, suspension1.id);
const afterDeactivate = listFixedContractSuspensions(db, route398.id);
assert(afterDeactivate.find((s) => s.id === suspension1.id)?.active === false, "deactivating the first batch (its real 1-year return) flips it inactive");
assert(afterDeactivate.find((s) => s.id === suspension2.id)?.active === true, "the second, still-running batch is untouched by the first one's return");
assert(listAllActiveFixedContractSuspensions(db).length === 1, "the active-suspensions listing now reflects only the still-active batch");

// The row itself is kept, not deleted — real history stays in the save.
assert(afterDeactivate.length === 2, "a returned (deactivated) batch is kept as real history, not deleted");

console.log("\nAll fixed-contract-failures storage checks passed.");
