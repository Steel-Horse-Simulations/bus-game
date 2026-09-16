// Minimal timetable editor (DESIGN.md §7), opened per route from the Routes
// panel — the first real slice scoped in OPEN-ITEMS.md T29: one component
// per route per day type, a frequency generator (start/end time of day,
// interval) and optional timing points (a stop that holds a bus early,
// DESIGN.md §4), with running times derived from the WASM router's real
// travel times (DESIGN.md §6's fastest-route fix). Variations, padding,
// connections, extensions and the event calendar are all later increments.
import { Router } from "./wasm/game_wasm.js";
import { createDropdown, type Dropdown } from "./dropdown";
import {
  DAY_TYPES,
  type DayType,
  validateFrequency,
  validateTimingPoints,
  computeOffsets,
} from "./route-timetable.mts";
import { timetableEditorState } from "./timetable-editor-state";
import { stopsPanelState } from "./stops-layer";

function stopLabel(point: RoutePoint): string {
  if (point.kind !== "stop" || point.osmId === undefined) return "Stop";
  return stopsPanelState.displayNameFor?.(point.osmId) ?? `Stop ${point.osmId}`;
}

// The status line defaults to orange (info/error/warning) and switches to
// green only for a fully clean save — a save with an infeasible timing
// point stays orange, since it's a "saved, but..." situation.
const STATUS_COLOUR_WARNING = "#f97316";
const STATUS_COLOUR_SUCCESS = "#22c55e";

const DAY_TYPE_LABELS: Record<DayType, string> = {
  monday_friday: "Monday-Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Accepts "08:00" as typed, or "0800"/"800" typed without the colon (which
// normalizeTimeInput below then rewrites in place so the field always
// settles on the colon form) — a colon shouldn't be mandatory just to
// enter a time.
function hhmmToMinutes(value: string): number | null {
  const trimmed = value.trim();
  const withColon = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  const digitsOnly = /^(\d{3,4})$/.exec(trimmed);
  let h: number;
  let m: number;
  if (withColon) {
    h = Number(withColon[1]);
    m = Number(withColon[2]);
  } else if (digitsOnly) {
    const padded = digitsOnly[1].padStart(4, "0");
    h = Number(padded.slice(0, 2));
    m = Number(padded.slice(2));
  } else {
    return null;
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

// Rewrites a time field to the "HH:MM" form as soon as the player leaves
// it — "0800" becomes "08:00" — silently leaving anything unparseable
// alone (validateFrequency's own error message covers that at save time).
function normalizeTimeInput(input: HTMLInputElement): void {
  const minutes = hhmmToMinutes(input.value);
  if (minutes !== null) input.value = minutesToHHMM(minutes);
}

// One leg per consecutive pair of the route's own points — stops and
// waypoints alike, since a waypoint still takes real time to pass even
// though it's never itself a timing point.
function computeLegTimesSeconds(router: Router, points: readonly { lon: number; lat: number }[]): number[] {
  const legs: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    router.find_route(a.lon, a.lat, b.lon, b.lat);
    legs.push(router.last_route_time_seconds());
  }
  return legs;
}

export interface RouteTimetableEditor {
  el: HTMLElement;
}

// Builds the editor's DOM without positioning or mounting it — DESIGN.md
// §11: "the timetable grid fills the rest of the screen to the right,"
// which is route-panel.ts's job to arrange, not this module's. `onClose`
// is called when the player wants to leave the timetable-editing state
// entirely (back to the route list) — the day-type dropdown inside still
// switches between a route's own day types without closing anything.
export function createRouteTimetableEditor(
  route: Route,
  router: Router,
  onClose: () => void,
): RouteTimetableEditor {
  const panel = document.createElement("div");
  panel.className = "panel panel-flush";
  panel.style.height = "100%";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";

  const header = document.createElement("div");
  header.className = "panel-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  const title = document.createElement("span");
  title.textContent = `Timetable — ${route.number}`;
  const closeButton = document.createElement("button");
  closeButton.className = "btn btn-icon";
  closeButton.textContent = "×";
  closeButton.title = "Back to the route list";
  closeButton.addEventListener("click", onClose);
  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-section";
  body.style.overflowY = "auto";
  body.style.flex = "1 1 auto";
  body.style.minHeight = "0";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "10px";
  panel.appendChild(body);

  // Appended into `body` (right after the Save button, below), not
  // `panel` directly — as a sibling of `body` it would sit below it in the
  // flex column, and since `body` is flex:1 (grows to fill all remaining
  // height), that pushed it all the way to the bottom of a mostly-empty
  // panel: far from the Save button that produces it, and easy to miss
  // entirely (reported as "nothing shows when I press save").
  const statusLine = document.createElement("div");
  statusLine.className = "label-muted";
  statusLine.style.padding = "8px 12px";
  // Orange rather than the class's own muted grey — it was easy to miss
  // (see the placement fix above), so it should stand out once you do
  // look at it.
  statusLine.style.color = STATUS_COLOUR_WARNING;
  statusLine.style.fontWeight = "600";

  const startInput = document.createElement("input");
  startInput.className = "field";
  startInput.placeholder = "Start (HH:MM)";
  startInput.addEventListener("blur", () => normalizeTimeInput(startInput));
  const endInput = document.createElement("input");
  endInput.className = "field";
  endInput.placeholder = "End (HH:MM)";
  endInput.addEventListener("blur", () => normalizeTimeInput(endInput));
  const intervalInput = document.createElement("input");
  intervalInput.className = "field";
  intervalInput.type = "number";
  intervalInput.min = "1";
  intervalInput.placeholder = "Interval (minutes)";

  // Timing points are no longer set here — DESIGN.md §4/§7's redesign
  // moved that to each stop's own little menu in the locked route list on
  // the left (route-panel.ts), coordinated through timetableEditorState so
  // this module still owns which day type is selected and still persists
  // the result. This is just a live count, and a warning line for anything
  // scheduled faster than the route can actually be driven.
  const timingPointsHint = document.createElement("div");
  timingPointsHint.className = "label-muted";
  timingPointsHint.style.padding = "0 12px";

  const saveButton = document.createElement("button");
  saveButton.className = "btn";
  saveButton.textContent = "Save timetable for this day type";

  timetableEditorState.onTimingPointsEdited = refreshTimingPointsHint;

  function refreshTimingPointsHint(): void {
    const count = timetableEditorState.timingPoints.length;
    timingPointsHint.textContent =
      count === 0
        ? "No timing points set — click a stop on the left to add one."
        : `${count} timing point${count === 1 ? "" : "s"} set — click a stop on the left to edit.`;
  }

  async function loadDayType(dayType: DayType): Promise<void> {
    const existing = (await window.routeTimetables.listForRoute(route.id)).find((t) => t.dayType === dayType);
    timetableEditorState.dayType = dayType;
    // A day type with its own saved timetable loads its own timing points
    // (real persisted data); a day type with none yet keeps whatever's
    // currently in memory rather than wiping it — timing points are
    // usually the same physical pattern across day types (just the
    // frequency/hours differ), so switching to a blank day type shouldn't
    // throw away work already done on another one. Either way this is a
    // fresh array, not the loaded one directly, since the stop list
    // mutates it in place.
    if (existing) timetableEditorState.timingPoints = [...existing.timingPoints];
    refreshTimingPointsHint();
    timetableEditorState.onDayTypeChanged?.();
    statusLine.style.color = STATUS_COLOUR_WARNING;
    if (existing) {
      startInput.value = minutesToHHMM(existing.startMinutes);
      endInput.value = minutesToHHMM(existing.endMinutes);
      intervalInput.value = String(existing.intervalMinutes);
      statusLine.textContent = `Existing ${DAY_TYPE_LABELS[dayType]} timetable loaded.`;
    } else {
      startInput.value = "";
      endInput.value = "";
      intervalInput.value = "";
      statusLine.textContent = `No ${DAY_TYPE_LABELS[dayType]} timetable yet.`;
    }
  }

  const dayTypeDropdown: Dropdown = createDropdown(
    DAY_TYPES.map((d) => DAY_TYPE_LABELS[d]),
    DAY_TYPE_LABELS[DAY_TYPES[0]],
    (label) => {
      const dayType = DAY_TYPES.find((d) => DAY_TYPE_LABELS[d] === label)!;
      void loadDayType(dayType);
    },
  );

  saveButton.addEventListener("click", async () => {
    // Reset from green in case a previous save on this same day type
    // succeeded cleanly and this attempt doesn't.
    statusLine.style.color = STATUS_COLOUR_WARNING;
    const dayType = DAY_TYPES.find((d) => DAY_TYPE_LABELS[d] === dayTypeDropdown.value)!;
    const startMinutes = hhmmToMinutes(startInput.value);
    const endMinutes = hhmmToMinutes(endInput.value);
    const intervalMinutes = Number(intervalInput.value);
    if (startMinutes === null || endMinutes === null) {
      statusLine.textContent = "Enter start and end times as HH:MM.";
      return;
    }
    const freqError = validateFrequency(startMinutes, endMinutes, intervalMinutes);
    if (freqError) {
      statusLine.textContent = freqError;
      return;
    }
    const timingPoints = timetableEditorState.timingPoints;
    const tpError = validateTimingPoints(route.points, timingPoints);
    if (tpError) {
      statusLine.textContent = tpError;
      return;
    }

    statusLine.textContent = "Computing running times…";
    const legTimesSeconds = computeLegTimesSeconds(router, route.points);
    const { arrivalOffsetsSeconds, departureOffsetsSeconds, infeasibleTimingPoints } = computeOffsets(
      route.points.length,
      legTimesSeconds,
      timingPoints,
    );
    await window.routeTimetables.upsert(
      route.id,
      dayType,
      startMinutes,
      endMinutes,
      intervalMinutes,
      timingPoints,
      arrivalOffsetsSeconds,
      departureOffsetsSeconds,
    );
    // Realistic running-time variation across the day comes from the
    // router's own junction delays (give-way, traffic lights) plus, later,
    // passenger boarding/alighting (Phase 4) — not from an artificial
    // multiplier bolted on here. An interim flat time-of-day multiplier
    // used to live in this file; it's gone now that the router itself is
    // getting a real junction-delay model to produce that variation
    // honestly.
    const totalMinutes = Math.round(arrivalOffsetsSeconds[arrivalOffsetsSeconds.length - 1] / 60);
    if (infeasibleTimingPoints.length > 0) {
      const details = infeasibleTimingPoints
        .map(
          (tp) =>
            `${stopLabel(route.points[tp.pointIndex])} (published ${tp.publishedMinutes} min, fastest possible is ${tp.fastestMinutes} min — used ${tp.fastestMinutes} min instead)`,
        )
        .join("; ");
      statusLine.style.color = STATUS_COLOUR_WARNING;
      statusLine.textContent = `Saved, but ${details}. End-to-end running time: ${totalMinutes} min.`;
    } else {
      statusLine.style.color = STATUS_COLOUR_SUCCESS;
      statusLine.textContent = `Saved. End-to-end running time: ${totalMinutes} min.`;
    }
  });

  body.appendChild(dayTypeDropdown.el);
  body.appendChild(startInput);
  body.appendChild(endInput);
  body.appendChild(intervalInput);
  body.appendChild(timingPointsHint);
  body.appendChild(saveButton);
  body.appendChild(statusLine);

  void loadDayType(DAY_TYPES[0]);

  return { el: panel };
}
