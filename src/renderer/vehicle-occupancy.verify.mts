// Manual verification for vehicle-occupancy.mts, run directly with
// `node --experimental-strip-types src/renderer/vehicle-occupancy.verify.mts`
// — same pattern as this project's other .verify.mts files.
import { processStopVisit, totalOperatorRevenueGBPPence, vehicleCapacityColour, type OnBoardPassenger } from "./vehicle-occupancy.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

function passenger(alightStopOsmId: number, passengerPaidGBPPence = 100, operatorReceivedGBPPence = 100): OnBoardPassenger {
  return { alightStopOsmId, passengerType: "adult", passengerPaidGBPPence, operatorReceivedGBPPence };
}

// --- alighting ---
{
  const onBoard = [passenger(1), passenger(2), passenger(1)];
  const result = processStopVisit(onBoard, 50, 1, []);
  assert(result.alighted.length === 2, `expected 2 passengers to alight at stop 1, got ${result.alighted.length}`);
  assert(result.onBoard.length === 1, `expected 1 passenger to remain on board, got ${result.onBoard.length}`);
  assert(result.onBoard[0].alightStopOsmId === 2, "the remaining passenger should be the one not destined for this stop");
}

// --- boarding within capacity ---
{
  const result = processStopVisit([], 10, 5, [passenger(9), passenger(9)]);
  assert(result.boarded.length === 2, `expected both candidates to board when well within capacity, got ${result.boarded.length}`);
  assert(result.leftBehind.length === 0, "nobody should be left behind when capacity allows it");
  assert(result.onBoard.length === 2, "onBoard should reflect the newly boarded passengers");
}

// --- boarding beyond capacity: real, honest overflow, not silently clipped through ---
{
  const existing = [passenger(9), passenger(9)];
  const candidates = [passenger(9), passenger(9), passenger(9)];
  const result = processStopVisit(existing, 3, 5, candidates);
  assert(result.boarded.length === 1, `only 1 more seat is free (capacity 3, 2 already on board) — expected 1 boarded, got ${result.boarded.length}`);
  assert(result.leftBehind.length === 2, `expected 2 candidates left behind, got ${result.leftBehind.length}`);
  assert(result.onBoard.length === 3, "onBoard should sit exactly at capacity, not over it");
}

// --- alighting frees capacity for boarding in the SAME stop visit ---
{
  const existing = [passenger(5), passenger(9)]; // one alights here, one doesn't
  const candidates = [passenger(9), passenger(9)];
  const result = processStopVisit(existing, 2, 5, candidates);
  assert(result.alighted.length === 1, "one passenger should alight, freeing a seat");
  assert(result.boarded.length === 1, `expected exactly 1 new boarding (the freed seat), got ${result.boarded.length}`);
  assert(result.leftBehind.length === 1, "the second candidate should be left behind — alighting freed only one seat");
  assert(result.onBoard.length === 2, "onBoard should still sit exactly at capacity after both alighting and boarding");
}

// --- revenue totalling ---
{
  const boarded = [passenger(9, 100, 100), passenger(9, 0, 60)]; // e.g. an adult and a concession passenger
  const total = totalOperatorRevenueGBPPence(boarded);
  assert(total === 160, `expected total operator revenue of 160p (100+60), got ${total}`);
  assert(totalOperatorRevenueGBPPence([]) === 0, "an empty boarding batch earns nothing");
}

// --- plan #10: bus capacity colour ---
// seated=56, total=70 — the real placeholder pair vehicle-simulation.ts
// actually uses (80% of the flat 70 placeholder), not an arbitrary round
// number, so these boundaries match what the live game really computes.
{
  assert(vehicleCapacityColour(0, 56, 70) === null, "empty vehicle gets no colour override");
  assert(vehicleCapacityColour(44, 56, 70) === null, "just below 80% of seated (44.8) stays default, got a colour");
  assert(vehicleCapacityColour(45, 56, 70) === "#eab308", "at/just above 80% of seated (44.8) should be yellow");
  assert(vehicleCapacityColour(55, 56, 70) === "#eab308", "just below full seated should still be yellow");
  assert(vehicleCapacityColour(56, 56, 70) === "#f97316", "exactly 100% seated (0 standing) should be orange");
  assert(vehicleCapacityColour(63, 56, 70) === "#f97316", "seated full, some standing, not yet at total capacity should be orange");
  assert(vehicleCapacityColour(69, 56, 70) === "#f97316", "one below total capacity should still be orange");
  assert(vehicleCapacityColour(70, 56, 70) === "#ef4444", "exactly 100% of total capacity (seated+standing both full) should be red");
  assert(vehicleCapacityColour(75, 56, 70) === "#ef4444", "over total capacity (shouldn't normally happen) still reads as red, not an error");
}
// A real coach-style vehicle with zero standing capacity (seated === total,
// VEHICLE-SPECS.md's own `seatedOnly` kind) correctly has no orange band at
// all — occupancy jumps straight from yellow to red the instant the last
// seat fills, since there is no standing room to ever occupy orange's own
// range.
{
  assert(vehicleCapacityColour(50, 56, 56) === "#eab308", "a seated-only vehicle below full should still be yellow");
  assert(vehicleCapacityColour(56, 56, 56) === "#ef4444", "a seated-only vehicle at full capacity jumps straight to red, skipping orange entirely");
}

console.log("\nAll vehicle-occupancy checks passed.");
