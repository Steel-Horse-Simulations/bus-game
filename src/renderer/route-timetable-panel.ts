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

function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
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

  const statusLine = document.createElement("div");
  statusLine.className = "label-muted";
  statusLine.style.padding = "8px 12px";
  panel.appendChild(statusLine);

  const startInput = document.createElement("input");
  startInput.className = "field";
  startInput.placeholder = "Start (HH:MM)";
  const endInput = document.createElement("input");
  endInput.className = "field";
  endInput.placeholder = "End (HH:MM)";
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
    // A fresh array, not the loaded one directly — the stop list mutates
    // this in place, and re-loading (e.g. switching day type and back)
    // shouldn't leave it aliased to a previous load's array.
    timetableEditorState.timingPoints = existing ? [...existing.timingPoints] : [];
    refreshTimingPointsHint();
    timetableEditorState.onDayTypeChanged?.();
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
    const { arrivalOffsetsSeconds, departureOffsetsSeconds, infeasiblePointIndexes } = computeOffsets(
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
    const totalMinutes = Math.round(arrivalOffsetsSeconds[arrivalOffsetsSeconds.length - 1] / 60);
    statusLine.textContent =
      infeasiblePointIndexes.length > 0
        ? `Saved, but ${infeasiblePointIndexes.length} timing point${infeasiblePointIndexes.length === 1 ? "" : "s"} ` +
          `published faster than the route can be driven — scheduled at the fastest achievable time instead. ` +
          `End-to-end running time: ${totalMinutes} min.`
        : `Saved. End-to-end running time: ${totalMinutes} min.`;
  });

  body.appendChild(dayTypeDropdown.el);
  body.appendChild(startInput);
  body.appendChild(endInput);
  body.appendChild(intervalInput);
  body.appendChild(timingPointsHint);
  body.appendChild(saveButton);

  void loadDayType(DAY_TYPES[0]);

  return { el: panel };
}
