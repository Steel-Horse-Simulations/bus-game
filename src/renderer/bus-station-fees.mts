// Real per-departure bus station fee (Phase 5, 2026-11-16) — settled with
// the user via direct research against SPT's own real, current rate sheet
// (effective April 2025) rather than guessed. See OPEN-ITEMS.md's "Phase 5
// scoping, settled 2026-11-16" entry for the full reasoning trail this
// mirrors.
//
// Real findings this is built from:
// - Plain bus STOPS carry no fee at all — no UK council charges operators
//   a recurring fee for routine stop usage; the only real per-stop charges
//   found (Bristol/Surrey/Greater Manchester) are one-off temporary-
//   suspension charges billed to works contractors, not operators running
//   a timetable. So this module is never consulted for an ordinary stop —
//   only for a real bus STATION (DESIGN.md's own distinct `amenity=
//   bus_station` classification, `stops-layer.ts`'s `busStationsState`).
// - Buchanan Bus Station: £1.15 per departure (SPT's real rate sheet,
//   Category A/ordinary local service, VAT excluded per the user's own
//   call — this game doesn't model VAT anywhere else).
// - Greenock, Partick and Govan bus stations: £0 — SPT's own rate sheet
//   explicitly states these three have no charges at all, unlike
//   Buchanan.
// - Every other real bus station defaults to the same £1.15 rate — the
//   user's own reasoning: most real bus stations DO charge something,
//   and the 3 free ones are SPT's own named exception, not the norm.
export const BUCHANAN_DEPARTURE_FEE_GBP_PENCE = 115;
export const DEFAULT_STATION_DEPARTURE_FEE_GBP_PENCE = 115;
export const FREE_STATION_DEPARTURE_FEE_GBP_PENCE = 0;

// Matched by substring, case-insensitive — same tolerant-matching
// convention this codebase already uses for other real-world names
// (livery-seed-data.mts's `nationForRegion`), since the real OSM name
// string could carry minor variation ("Partick Bus Station" vs "Partick
// Interchange" etc.) that an exact match would miss.
const FREE_STATION_NAME_PATTERNS = [/greenock/i, /partick/i, /govan/i];

// Returns the real per-departure fee in GBP pence for a real bus station
// name, or `null` if `stationName` doesn't match a known free station and
// isn't Buchanan either — in which case the caller should use the default
// rate, not treat `null` as "no fee" (a plain stop returning no fee at
// all is a SEPARATE, deliberate case — see `stationDepartureFeeGBPPence`
// below, which is the real entry point every caller should use instead of
// calling this directly).
function namedStationFeeGBPPence(stationName: string): number | null {
  if (/buchanan/i.test(stationName)) return BUCHANAN_DEPARTURE_FEE_GBP_PENCE;
  if (FREE_STATION_NAME_PATTERNS.some((p) => p.test(stationName))) return FREE_STATION_DEPARTURE_FEE_GBP_PENCE;
  return null;
}

// The real entry point. `isBusStation` must come from the real OSM
// `amenity=bus_station` classification (`stops-layer.ts`'s
// `busStationsState`, ultimately `rust/pipeline/src/stops.rs`'s
// `NodeClassification::BusStation`) — NOT guessed from the stop's name
// alone, since an ordinary stop could coincidentally contain one of these
// words in its own name. A plain stop (`isBusStation` false) returns
// `null` — no fee, full stop, not a silent £0 that could later be
// mistaken for "a recognised free station."
export function stationDepartureFeeGBPPence(stationName: string, isBusStation: boolean): number | null {
  if (!isBusStation) return null;
  return namedStationFeeGBPPence(stationName) ?? DEFAULT_STATION_DEPARTURE_FEE_GBP_PENCE;
}
