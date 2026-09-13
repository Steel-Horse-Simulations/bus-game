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
  panel.className = "panel";
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

  const stopRows: { pointIndex: number; checkbox: HTMLInputElement; waitInput: HTMLInputElement }[] = [];
  const stopsSection = document.createElement("div");
  stopsSection.style.display = "flex";
  stopsSection.style.flexDirection = "column";
  stopsSection.style.gap = "4px";

  route.points.forEach((p, i) => {
    if (p.kind !== "stop") return;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const label = document.createElement("span");
    label.textContent = `Stop ${i + 1}`;
    label.style.flex = "1";
    const waitInput = document.createElement("input");
    waitInput.className = "field";
    waitInput.type = "number";
    waitInput.min = "0";
    waitInput.value = "0";
    waitInput.style.width = "70px";
    waitInput.disabled = true;
    waitInput.placeholder = "Wait (s)";

    checkbox.addEventListener("change", () => {
      waitInput.disabled = !checkbox.checked;
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(waitInput);
    stopsSection.appendChild(row);
    stopRows.push({ pointIndex: i, checkbox, waitInput });
  });

  const saveButton = document.createElement("button");
  saveButton.className = "btn";
  saveButton.textContent = "Save timetable for this day type";

  async function loadDayType(dayType: DayType): Promise<void> {
    const existing = (await window.routeTimetables.listForRoute(route.id)).find((t) => t.dayType === dayType);
    if (existing) {
      startInput.value = minutesToHHMM(existing.startMinutes);
      endInput.value = minutesToHHMM(existing.endMinutes);
      intervalInput.value = String(existing.intervalMinutes);
      const waitByIndex = new Map(existing.timingPoints.map((tp) => [tp.pointIndex, tp.waitSeconds]));
      for (const row of stopRows) {
        const wait = waitByIndex.get(row.pointIndex);
        row.checkbox.checked = wait !== undefined;
        row.waitInput.disabled = wait === undefined;
        row.waitInput.value = String(wait ?? 0);
      }
      statusLine.textContent = `Existing ${DAY_TYPE_LABELS[dayType]} timetable loaded.`;
    } else {
      startInput.value = "";
      endInput.value = "";
      intervalInput.value = "";
      for (const row of stopRows) {
        row.checkbox.checked = false;
        row.waitInput.disabled = true;
        row.waitInput.value = "0";
      }
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
    const timingPoints: TimingPoint[] = stopRows
      .filter((r) => r.checkbox.checked)
      .map((r) => ({ pointIndex: r.pointIndex, waitSeconds: Number(r.waitInput.value) || 0 }));
    const tpError = validateTimingPoints(route.points, timingPoints);
    if (tpError) {
      statusLine.textContent = tpError;
      return;
    }

    statusLine.textContent = "Computing running times…";
    const legTimesSeconds = computeLegTimesSeconds(router, route.points);
    const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsets(
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
    statusLine.textContent = `Saved. End-to-end running time: ${totalMinutes} min.`;
  });

  body.appendChild(dayTypeDropdown.el);
  body.appendChild(startInput);
  body.appendChild(endInput);
  body.appendChild(intervalInput);
  const stopsLabel = document.createElement("div");
  stopsLabel.className = "label-muted";
  stopsLabel.textContent = "Timing points";
  body.appendChild(stopsLabel);
  body.appendChild(stopsSection);
  body.appendChild(saveButton);

  void loadDayType(DAY_TYPES[0]);

  return { el: panel };
}
