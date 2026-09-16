// Start/terminus colours (DESIGN.md §6) — read-only, derived entirely from
// a route's own startIndex/terminusIndex (defaulting to points[0]/points
// [last] when neither is set), never a per-stop toggle. Shared between
// route-draw.ts (while a route is being drawn/edited) and route-panel.ts
// (the locked stop list shown alongside a route's timetable) so both show
// the same colours for the same stop. A point can be both at once (an
// early terminus with no real loop, the two indexes equal) —
// BOTH_START_TERMINUS_COLOUR disambiguates that from either alone.
export const START_COLOUR = "#22c55e";
export const TERMINUS_COLOUR = "#a855f7";
export const BOTH_START_TERMINUS_COLOUR = "#f59e0b";

export function startTerminusColour(isStart: boolean, isTerminus: boolean): string | null {
  if (isStart && isTerminus) return BOTH_START_TERMINUS_COLOUR;
  if (isStart) return START_COLOUR;
  if (isTerminus) return TERMINUS_COLOUR;
  return null;
}
