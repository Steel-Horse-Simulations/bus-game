// Manual verification for ticket-machine.mts (TICKETING.md §1/§2), run
// directly with `node --experimental-strip-types src/renderer/ticket-machine.verify.mts`.
import { TICKET_MACHINE_PRICE_GBP, TAP_ON_TAP_OFF_PRICE_GBP_PER_VEHICLE, minimumStartingTier, satisfiesMinimumTier } from "./ticket-machine.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

// --- Real figures ---
assert(TICKET_MACHINE_PRICE_GBP.basic === 0, "Basic is free");
assert(TICKET_MACHINE_PRICE_GBP.mid === 350, "Mid is £350/vehicle");
assert(TICKET_MACHINE_PRICE_GBP.advanced === 2800, "Advanced is £2,800/vehicle");
assert(TAP_ON_TAP_OFF_PRICE_GBP_PER_VEHICLE === 1500, "Tap-on tap-off is £1,500/vehicle");

// --- The Advanced ratchet ---
assert(minimumStartingTier([]) === "basic", "no existing groups at all -> a new group can start at Basic");
assert(minimumStartingTier(["basic", "basic"]) === "basic", "every existing group at Basic -> a new group can still start at Basic");
assert(minimumStartingTier(["mid"]) === "basic", "Mid does NOT trigger the ratchet -> a new group can still start at Basic");
assert(minimumStartingTier(["basic", "mid", "advanced"]) === "advanced", "one Advanced group among others -> every new group must start at Advanced");
assert(minimumStartingTier(["advanced"]) === "advanced", "a single existing Advanced group alone still triggers it");

// --- satisfiesMinimumTier ---
assert(satisfiesMinimumTier("basic", "basic") === true, "Basic satisfies a Basic minimum");
assert(satisfiesMinimumTier("mid", "basic") === true, "Mid satisfies a Basic minimum (higher is fine)");
assert(satisfiesMinimumTier("basic", "advanced") === false, "Basic does NOT satisfy an Advanced minimum");
assert(satisfiesMinimumTier("mid", "advanced") === false, "Mid does NOT satisfy an Advanced minimum either");
assert(satisfiesMinimumTier("advanced", "advanced") === true, "Advanced satisfies an Advanced minimum");

console.log("\nAll ticket-machine checks passed.");
