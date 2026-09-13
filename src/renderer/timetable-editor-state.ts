// Cross-module coordination between route-panel.ts's locked stop list
// (where timing points are now set, per DESIGN.md §4/§7 — one stop's own
// little menu, not a checkbox grid) and route-timetable-panel.ts's editor
// (which owns which day type is selected and persists the result) — same
// shared-mutable-object pattern already used elsewhere (stopsPanelState,
// routeDrawState) rather than either module importing the other.
import type { DayType, TimingPoint } from "./route-timetable.mts";

export const timetableEditorState: {
  // Null outside timetable mode, or before the first day type has loaded.
  dayType: DayType | null;
  // The selected day type's current in-memory timing points —
  // route-panel.ts's stop list reads and mutates this array directly;
  // route-timetable-panel.ts reads it back on Save, and replaces it
  // wholesale whenever the day type switches or a route is (re)loaded.
  timingPoints: TimingPoint[];
  // Set by route-panel.ts; called by route-timetable-panel.ts whenever the
  // day type switches or (re)loads, so the stop list re-renders against
  // the newly-current `timingPoints` array.
  onDayTypeChanged: (() => void) | null;
  // Set by route-timetable-panel.ts; called by route-panel.ts whenever the
  // stop list edits `timingPoints` directly, so the "N timing points set"
  // hint stays in sync without the stop list needing to know it exists.
  onTimingPointsEdited: (() => void) | null;
} = {
  dayType: null,
  timingPoints: [],
  onDayTypeChanged: null,
  onTimingPointsEdited: null,
};
