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
  type TimeBand,
  validateTimeBands,
  DEFAULT_TIME_BANDS,
  validateTimingPoints,
  computeOffsets,
} from "./route-timetable.mts";
import { timetableEditorState } from "./timetable-editor-state";
import { stopsPanelState } from "./stops-layer";
import { computeStopCallingServices, formatClockMinutes } from "./stop-calling-services.mts";

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
// A route's "family" for timetable coordination purposes (user request:
// "they should all be shown in each variation timetable so it is easier
// to adjust everything to work together") — the root (this route itself
// if it has no parent, otherwise its parent) plus every route whose own
// parentRouteId points at that same root, including this route. Degrades
// gracefully if the parent was itself deleted (parentRouteId cleared to
// null, db.mts's deleteRoute) — the "family" just becomes whatever this
// route's own remaining relationships still say.
async function loadRouteFamily(route: Route): Promise<Route[]> {
  const all = await window.routes.list();
  const rootId = route.parentRouteId ?? route.id;
  return all
    .filter((r) => r.id === rootId || r.parentRouteId === rootId)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

export function createRouteTimetableEditor(
  route: Route,
  router: Router,
  onClose: () => void,
  onSwitchRoute: (route: Route) => void,
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

  // Tabs across the top (DESIGN.md §7: "Components are navigated by tabs
  // across the top of the grid") — here, one tab per sibling route in this
  // route's variation family rather than per merged component, since each
  // variation is its own Route row with its own timetable rows, not a
  // component of one shared route. Clicking a non-current tab reopens this
  // same panel for that route instead (route-panel.ts's setMode), so
  // coordinating a family means clicking between tabs, not leaving to the
  // route list and back.
  const familyTabs = document.createElement("div");
  familyTabs.style.display = "flex";
  familyTabs.style.gap = "4px";
  familyTabs.style.padding = "8px 12px 0";
  familyTabs.style.flexWrap = "wrap";
  panel.appendChild(familyTabs);
  void loadRouteFamily(route).then((family) => {
    if (family.length <= 1) return; // a lone route with no variations needs no tabs
    familyTabs.innerHTML = "";
    for (const member of family) {
      const tab = document.createElement("button");
      tab.className = "btn btn-icon";
      tab.textContent = member.number;
      if (member.id === route.id) {
        tab.disabled = true;
        tab.style.fontWeight = "700";
        tab.style.borderColor = member.colour;
      } else {
        tab.addEventListener("click", () => onSwitchRoute(member));
      }
      familyTabs.appendChild(tab);
    }
  });

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

  // Time-of-day bands (DESIGN.md §7 "Structure": "frequency varies across
  // the day") — one or more (start, end, interval) rows rather than a
  // single flat frequency, the old flat model being exactly the one-band
  // case. A day type with no timetable yet starts from DEFAULT_TIME_BANDS
  // (the UK-typical AM peak/inter-peak/PM peak/evening/night shape) as a
  // template the player can freely reshape — "defined globally as
  // defaults, overridable per route."
  let currentBands: TimeBand[] = [];
  const bandsContainer = document.createElement("div");
  bandsContainer.style.display = "flex";
  bandsContainer.style.flexDirection = "column";
  bandsContainer.style.gap = "4px";

  function renderBandRows(): void {
    bandsContainer.innerHTML = "";
    currentBands.forEach((band, i) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "4px";
      row.style.alignItems = "center";

      const startInput = document.createElement("input");
      startInput.className = "field";
      startInput.style.width = "64px";
      startInput.placeholder = "Start";
      startInput.value = minutesToHHMM(band.startMinutes);
      startInput.addEventListener("blur", () => normalizeTimeInput(startInput));
      startInput.addEventListener("input", () => {
        const v = hhmmToMinutes(startInput.value);
        if (v !== null) {
          currentBands[i] = { ...currentBands[i], startMinutes: v };
          refreshFamilyLive();
        }
      });

      const toLabel = document.createElement("span");
      toLabel.className = "label-muted";
      toLabel.textContent = "-";

      const endInput = document.createElement("input");
      endInput.className = "field";
      endInput.style.width = "64px";
      endInput.placeholder = "End";
      endInput.value = minutesToHHMM(band.endMinutes);
      endInput.addEventListener("blur", () => normalizeTimeInput(endInput));
      endInput.addEventListener("input", () => {
        const v = hhmmToMinutes(endInput.value);
        if (v !== null) {
          currentBands[i] = { ...currentBands[i], endMinutes: v };
          refreshFamilyLive();
        }
      });

      const everyLabel = document.createElement("span");
      everyLabel.className = "label-muted";
      everyLabel.textContent = "every";

      const intervalInput = document.createElement("input");
      intervalInput.className = "field";
      intervalInput.type = "number";
      intervalInput.min = "1";
      intervalInput.style.width = "52px";
      intervalInput.value = String(band.intervalMinutes);
      intervalInput.addEventListener("input", () => {
        const v = Number(intervalInput.value);
        if (Number.isFinite(v)) {
          currentBands[i] = { ...currentBands[i], intervalMinutes: v };
          refreshFamilyLive();
        }
      });

      const minLabel = document.createElement("span");
      minLabel.className = "label-muted";
      minLabel.textContent = "min";

      const removeButton = document.createElement("button");
      removeButton.className = "btn btn-icon btn-danger";
      removeButton.textContent = "×";
      removeButton.title = "Remove this band";
      removeButton.addEventListener("click", () => {
        currentBands.splice(i, 1);
        renderBandRows();
        refreshFamilyLive();
      });

      row.appendChild(startInput);
      row.appendChild(toLabel);
      row.appendChild(endInput);
      row.appendChild(everyLabel);
      row.appendChild(intervalInput);
      row.appendChild(minLabel);
      row.appendChild(removeButton);
      bandsContainer.appendChild(row);
    });
  }

  const addBandButton = document.createElement("button");
  addBandButton.className = "btn";
  addBandButton.textContent = "+ Add time band";
  addBandButton.addEventListener("click", () => {
    const last = currentBands[currentBands.length - 1];
    const start = last ? last.endMinutes : 0;
    currentBands.push({ startMinutes: start, endMinutes: Math.min(start + 60, 1439), intervalMinutes: 30 });
    renderBandRows();
    refreshFamilyLive();
  });

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

  // Shows every family member's own timetable for whichever day type is
  // currently selected, side by side — so padding/interleaving two
  // variations' frequencies (DESIGN.md §7's worked example) can be judged
  // by eye without switching tabs back and forth. Point 0's own departures
  // stand in for "when each family member runs" — a full per-stop
  // comparison is what the expand-to-grid view (stops-layer.ts) is for.
  const familySection = document.createElement("div");
  familySection.style.display = "flex";
  familySection.style.flexDirection = "column";
  familySection.style.gap = "8px";
  familySection.style.borderTop = "1px solid var(--border)";
  familySection.style.paddingTop = "8px";

  // Leg times depend only on route.points (fixed for this editor instance,
  // never edited here) — computed once, reused for every live recompute
  // below so editing the frequency fields doesn't re-route on every
  // keystroke. Timing points *do* still change (via the left-hand stop
  // list), so offsets are recomputed from this cache each time, not cached
  // themselves.
  const legTimesSecondsCache = computeLegTimesSeconds(router, route.points);

  // A "timetable" the way the user asked for it: the current route (this
  // route's own in-progress, possibly-unsaved frequency fields — updates
  // live as they're typed, no save needed) plus every other family
  // member's own last-saved timetable, restricted to the stops every
  // family member actually shares — DESIGN.md §7's Case B padding is about
  // exactly this shared section, and this is where a mismatch would show
  // up. Reuses computeStopCallingServices/formatClockMinutes verbatim
  // (stop-calling-services.mts) rather than a second copy of the same
  // merge-by-point-index logic.
  async function renderFamilySharedStops(dayType: DayType): Promise<void> {
    const family = await loadRouteFamily(route);
    familySection.innerHTML = "";
    if (family.length <= 1) return;

    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.textContent = `Shared stops — ${DAY_TYPE_LABELS[dayType]} (this route's own row updates live as you edit, before saving)`;
    familySection.appendChild(heading);

    const stopIdSetsByMember = family.map(
      (m) => new Set(m.points.filter((p): p is RoutePoint & { kind: "stop" } => p.kind === "stop").map((p) => p.osmId)),
    );
    const sharedOsmIds = new Set(
      [...stopIdSetsByMember[0]].filter((id) => stopIdSetsByMember.every((s) => s.has(id))),
    );
    const orderedSharedOsmIds: number[] = [];
    for (const p of route.points) {
      if (p.kind !== "stop" || p.osmId === undefined) continue;
      if (sharedOsmIds.has(p.osmId) && !orderedSharedOsmIds.includes(p.osmId)) {
        orderedSharedOsmIds.push(p.osmId);
      }
    }
    if (orderedSharedOsmIds.length === 0) {
      const none = document.createElement("div");
      none.className = "label-muted";
      none.textContent = "No stops are shared by every member of this family.";
      familySection.appendChild(none);
      return;
    }

    const otherMembers = family.filter((m) => m.id !== route.id);
    const othersTimetables = (
      await Promise.all(otherMembers.map((m) => window.routeTimetables.listForRoute(m.id)))
    ).flat();

    let liveTimetable: RouteTimetable | null = null;
    if (validateTimeBands(currentBands) === null) {
      try {
        const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsets(
          route.points.length,
          legTimesSecondsCache,
          timetableEditorState.timingPoints,
        );
        liveTimetable = {
          id: -1,
          routeId: route.id,
          dayType,
          timeBands: currentBands.map((b) => ({ ...b })),
          timingPoints: timetableEditorState.timingPoints,
          arrivalOffsetsSeconds,
          departureOffsetsSeconds,
        };
      } catch {
        // An in-progress edit that doesn't yet validate (e.g. a timing
        // point mid-change) — this route's own row just shows nothing
        // live until it does, same as the save button's own validation.
      }
    }
    const allTimetables = liveTimetable ? [...othersTimetables, liveTimetable] : othersTimetables;

    const list = document.createElement("div");
    list.style.maxHeight = "220px";
    list.style.overflowY = "auto";
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    for (const osmId of orderedSharedOsmIds) {
      const point = route.points.find((p) => p.kind === "stop" && p.osmId === osmId)!;
      const services = computeStopCallingServices(osmId, family, allTimetables).filter(
        (s) => s.dayType === dayType,
      );
      if (services.length === 0) continue;

      const stopBlock = document.createElement("div");
      const stopHeading = document.createElement("div");
      stopHeading.style.fontSize = "11px";
      stopHeading.style.fontWeight = "600";
      stopHeading.textContent = stopLabel(point);
      stopBlock.appendChild(stopHeading);

      for (const svc of services) {
        const row = document.createElement("div");
        row.style.fontSize = "11px";
        row.style.paddingLeft = "10px";
        const swatch = document.createElement("span");
        swatch.style.display = "inline-block";
        swatch.style.width = "8px";
        swatch.style.height = "8px";
        swatch.style.borderRadius = "50%";
        swatch.style.backgroundColor = svc.routeColour;
        swatch.style.marginRight = "4px";
        row.appendChild(swatch);
        const numberSpan = document.createElement("strong");
        numberSpan.textContent = svc.routeNumber + (svc.routeId === route.id ? " (this route) " : " ");
        row.appendChild(numberSpan);
        row.appendChild(document.createTextNode(svc.departureClockMinutes.map(formatClockMinutes).join(", ")));
        stopBlock.appendChild(row);
      }
      list.appendChild(stopBlock);
    }
    familySection.appendChild(list);
  }

  // Live trigger: each band row's own inputs call this directly on every
  // keystroke (not just on blur, unlike normalizeTimeInput's reformatting)
  // so the point of this section — seeing the effect of an edit before
  // committing to Save — actually holds. Timing-point edits (the left-hand
  // stop list) go through the same onTimingPointsEdited hook
  // refreshTimingPointsHint already uses.
  const refreshFamilyLive = () => {
    const dayType = DAY_TYPES.find((d) => DAY_TYPE_LABELS[d] === dayTypeDropdown.value) ?? DAY_TYPES[0];
    void renderFamilySharedStops(dayType);
  };

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
      currentBands = existing.timeBands.map((b) => ({ ...b }));
      statusLine.textContent = `Existing ${DAY_TYPE_LABELS[dayType]} timetable loaded.`;
    } else {
      // A fresh day type starts from the UK-typical default bands
      // (DESIGN.md §7: "defined globally as defaults, overridable per
      // route") rather than empty — reshape or delete any of them freely.
      currentBands = DEFAULT_TIME_BANDS.map((b) => ({ ...b }));
      statusLine.textContent = `No ${DAY_TYPE_LABELS[dayType]} timetable yet — starting from the default time bands.`;
    }
    renderBandRows();
    void renderFamilySharedStops(dayType);
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
    const bandsError = validateTimeBands(currentBands);
    if (bandsError) {
      statusLine.textContent = bandsError;
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
      currentBands.map((b) => ({ ...b })),
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
    void renderFamilySharedStops(dayType);
  });

  body.appendChild(dayTypeDropdown.el);
  body.appendChild(bandsContainer);
  body.appendChild(addBandButton);
  body.appendChild(timingPointsHint);
  body.appendChild(saveButton);
  body.appendChild(statusLine);
  body.appendChild(familySection);

  void loadDayType(DAY_TYPES[0]);

  return { el: panel };
}
