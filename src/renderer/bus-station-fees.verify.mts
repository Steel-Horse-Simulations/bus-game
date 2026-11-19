// Manual verification script, run with
// `node --experimental-strip-types src/renderer/bus-station-fees.verify.mts`
import { stationDepartureFeeGBPPence, BUCHANAN_DEPARTURE_FEE_GBP_PENCE, DEFAULT_STATION_DEPARTURE_FEE_GBP_PENCE } from "./bus-station-fees.mts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok:", msg);
}

assert(
  stationDepartureFeeGBPPence("Buchanan Bus Station", true) === BUCHANAN_DEPARTURE_FEE_GBP_PENCE,
  `Buchanan's real fee is ${BUCHANAN_DEPARTURE_FEE_GBP_PENCE}p`,
);
assert(stationDepartureFeeGBPPence("Greenock Bus Station", true) === 0, "Greenock is free");
assert(stationDepartureFeeGBPPence("Partick Bus Station", true) === 0, "Partick is free");
assert(stationDepartureFeeGBPPence("Govan Bus Station", true) === 0, "Govan is free");
assert(
  stationDepartureFeeGBPPence("Dundee Bus Station", true) === DEFAULT_STATION_DEPARTURE_FEE_GBP_PENCE,
  `an unrecognized real bus station defaults to ${DEFAULT_STATION_DEPARTURE_FEE_GBP_PENCE}p, got ${stationDepartureFeeGBPPence("Dundee Bus Station", true)}`,
);
assert(
  stationDepartureFeeGBPPence("Buchanan Street", false) === null,
  "a plain stop (isBusStation false) is never charged, even if its name happens to match — no silent £0",
);
assert(
  stationDepartureFeeGBPPence("Random Street Stop", false) === null,
  "an ordinary non-station stop is never charged",
);

console.log("\nAll bus-station-fees checks passed.");
