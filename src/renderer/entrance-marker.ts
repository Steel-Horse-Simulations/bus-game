// Shared entrance/exit marker pieces for depot-placement.ts and
// dealer-placement.ts — CLAUDE.md's "build it once as a shared
// component, not three times" principle (repaint shops, T63, are a
// likely third user).
//
// A plain, fixed-size dot — a live user correction (2026-10-02) after
// the previous oriented semi-circle marker (bearing-rotated, scaled to
// the road's own width, with a manual nudge mechanism to compensate for
// both) proved "constantly breaking": "entrances and exits should not be
// shown on the map, only dots on the road... We should remove all code
// that isnt needed other than for the basic functionality." See
// OPEN-ITEMS.md T61/T62 for the full history of the removed mechanism.

export type EntranceMode = "entry" | "exit" | "both";

export const ENTRANCE_MODE_LABELS: Record<EntranceMode, string> = { entry: "Entry only", exit: "Exit only", both: "Entry and exit" };
// Blue for "both" — distinct from entry (green), exit (red) and every
// site marker colour used so far, after a live report that an earlier
// "both" amber was indistinguishable from the depot site dot itself.
export const ENTRANCE_MODE_COLORS: Record<EntranceMode, string> = { entry: "#22c55e", exit: "#ef4444", both: "#3b82f6" };
