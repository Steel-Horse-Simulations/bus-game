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
  generateDepartureMinutesForBands,
  applyExcludedDepartures,
  mergeCustomDepartures,
} from "./route-timetable.mts";
import { timetableEditorState } from "./timetable-editor-state";
import { stopsPanelState } from "./stops-layer";
import {
  buildRouteTimetableGrid,
  routeDirectionRanges,
  sliceGridToPointRange,
  buildMergedFamilyGrid,
  computeOffsetsForDirection,
  type MergedGridMember,
} from "./route-timetable-grid.mts";
import { buildMergedGridTable } from "./merged-grid-table";

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
  // Specific generated departure minutes this component should skip — a
  // variation can take over one of the base route's own slots (user
  // request: 398A running at 398's own 0100, without splitting 398's own
  // bands just to carve out that one minute) without any band editing at
  // all. Independent of which bands generated the minute, so reshaping a
  // band around it later doesn't silently un-exclude it — only actually
  // removing that exact minute from the generated list does (route-
  // timetable.mts's applyExcludedDepartures).
  let currentExcludedMinutes = new Set<number>();
  // One-off departures entered directly rather than produced by any
  // band's own interval (user request: "an option to put in custom times
  // for departures instead of everything being on an interval") — merged
  // into the generated list (route-timetable.mts's mergeCustomDepartures),
  // deduplicated against it, not a second parallel timetable.
  let currentCustomMinutes = new Set<number>();
  // "Show excluded services" (user request) — off by default (today's
  // only past behaviour: an excluded departure just isn't there), on
  // shows it anyway as a struck-through column in the grid preview below,
  // so an exclusion's real effect is visible rather than just inferred
  // from its absence.
  let showExcludedServices = false;
  // Which leg of a terminus loop this component covers (DESIGN.md §6) —
  // 'both' (the only option before this, and the only one a non-loop
  // route ever gets) drives the whole route from one shared generator,
  // exactly as before. A loop route can instead have an independent
  // 'outbound'-only and/or 'inbound'-only component (user request: "set
  // inbound and outbound times separately... useful if I am running from
  // multiple depots" — two depots each crewing one leg are genuinely two
  // separate operations). Only ever "outbound"/"inbound" for a route that
  // actually IS a terminus loop; the direction dropdown below doesn't
  // exist at all otherwise.
  let currentDirection: RouteTimetableDirection = "both";
  const isTerminusLoop = route.terminusIndex !== null && route.startIndex !== null;
  const DIRECTION_LABELS: Record<RouteTimetableDirection, string> = {
    both: "Both directions (shared)",
    outbound: "Outbound only",
    inbound: "Inbound only",
  };
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

  // Every minute this day type's bands currently generate, each a small
  // clickable chip — click one to exclude it (or bring it back), rather
  // than needing to reshape a band around it. A minute that stops being
  // generated (the bands changed) just stops appearing here; its own
  // exclusion, if any, stays recorded but has no effect until it
  // reappears (route-timetable.mts's applyExcludedDepartures).
  const generatedDeparturesLabel = document.createElement("div");
  generatedDeparturesLabel.className = "label-muted";
  generatedDeparturesLabel.style.marginTop = "6px";
  generatedDeparturesLabel.textContent = "Generated departures (click one to exclude it)";
  const generatedDeparturesContainer = document.createElement("div");
  generatedDeparturesContainer.style.display = "flex";
  generatedDeparturesContainer.style.flexWrap = "wrap";
  generatedDeparturesContainer.style.gap = "4px";
  generatedDeparturesContainer.style.marginTop = "4px";

  function renderGeneratedDepartures(): void {
    generatedDeparturesContainer.innerHTML = "";
    let minutes: number[] = [];
    try {
      minutes = generateDepartureMinutesForBands(currentBands);
    } catch {
      // An invalid/empty band set — nothing to show until it validates,
      // same as everywhere else this generator is used.
    }
    for (const minute of minutes) {
      const excluded = currentExcludedMinutes.has(minute);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "btn btn-icon";
      chip.style.fontSize = "11px";
      chip.style.padding = "2px 6px";
      chip.style.opacity = excluded ? "0.5" : "1";
      chip.style.textDecoration = excluded ? "line-through" : "none";
      chip.title = excluded ? "Excluded — click to bring this departure back" : "Click to exclude this departure";
      // HHMM with no colon — matches the merged grid immediately below
      // (route-timetable-grid's own printed-timetable convention), not
      // the HH:MM the editable band start/end fields above use.
      chip.textContent = minutesToHHMM(minute).replace(":", "");
      chip.addEventListener("click", () => {
        if (excluded) currentExcludedMinutes.delete(minute);
        else currentExcludedMinutes.add(minute);
        renderGeneratedDepartures();
        refreshFamilyLive();
      });
      generatedDeparturesContainer.appendChild(chip);
    }
  }

  // Excludes a whole recurring pattern in one go rather than clicking
  // every generated-departure chip individually (user request: "an option
  // to exclude on an interval") — the exact same start/end/interval shape
  // a time band itself uses, but the result feeds into
  // currentExcludedMinutes instead of currentBands: any minute the given
  // pattern generates gets added to the exclusion set, whether or not
  // this route's own bands actually generate that exact minute (same
  // "quietly inert if it doesn't match anything real" rule
  // applyExcludedDepartures already has elsewhere).
  const excludeIntervalRow = document.createElement("div");
  excludeIntervalRow.style.display = "flex";
  excludeIntervalRow.style.gap = "4px";
  excludeIntervalRow.style.alignItems = "center";
  excludeIntervalRow.style.marginTop = "6px";

  const excludeStartInput = document.createElement("input");
  excludeStartInput.className = "field";
  excludeStartInput.style.width = "64px";
  excludeStartInput.placeholder = "Start";
  excludeStartInput.value = "00:00";
  excludeStartInput.addEventListener("blur", () => normalizeTimeInput(excludeStartInput));

  const excludeToLabel = document.createElement("span");
  excludeToLabel.className = "label-muted";
  excludeToLabel.textContent = "-";

  const excludeEndInput = document.createElement("input");
  excludeEndInput.className = "field";
  excludeEndInput.style.width = "64px";
  excludeEndInput.placeholder = "End";
  excludeEndInput.value = "23:59";
  excludeEndInput.addEventListener("blur", () => normalizeTimeInput(excludeEndInput));

  const excludeEveryLabel = document.createElement("span");
  excludeEveryLabel.className = "label-muted";
  excludeEveryLabel.textContent = "every";

  const excludeIntervalInput = document.createElement("input");
  excludeIntervalInput.className = "field";
  excludeIntervalInput.type = "number";
  excludeIntervalInput.min = "1";
  excludeIntervalInput.style.width = "52px";
  excludeIntervalInput.value = "60";

  const excludeMinLabel = document.createElement("span");
  excludeMinLabel.className = "label-muted";
  excludeMinLabel.textContent = "min";

  const excludeIntervalButton = document.createElement("button");
  excludeIntervalButton.className = "btn";
  excludeIntervalButton.textContent = "Exclude";
  excludeIntervalButton.addEventListener("click", () => {
    const startMinutes = hhmmToMinutes(excludeStartInput.value);
    const endMinutes = hhmmToMinutes(excludeEndInput.value);
    const intervalMinutes = Number(excludeIntervalInput.value);
    if (startMinutes === null || endMinutes === null || !Number.isFinite(intervalMinutes)) return;
    let toExclude: number[] = [];
    try {
      toExclude = generateDepartureMinutesForBands([{ startMinutes, endMinutes, intervalMinutes }]);
    } catch {
      return; // Same invalid-pattern guard every other generator here has.
    }
    for (const minute of toExclude) currentExcludedMinutes.add(minute);
    refreshFamilyLive();
  });

  excludeIntervalRow.appendChild(excludeStartInput);
  excludeIntervalRow.appendChild(excludeToLabel);
  excludeIntervalRow.appendChild(excludeEndInput);
  excludeIntervalRow.appendChild(excludeEveryLabel);
  excludeIntervalRow.appendChild(excludeIntervalInput);
  excludeIntervalRow.appendChild(excludeMinLabel);
  excludeIntervalRow.appendChild(excludeIntervalButton);

  // One-off departures added directly rather than generated by any band
  // — a real timetable's first departure of the day often isn't on a
  // clean interval at all (user request: "an option to put in custom
  // times for departures instead of everything being on an interval").
  // Kept separate from the generated-departures chips above rather than
  // merged into that same click-to-toggle list: a custom entry is
  // something the player typed in on purpose, so removing one deletes it
  // outright (route-timetable.mts's mergeCustomDepartures), not an
  // "excluded but still remembered" state the way a generated minute's
  // own exclusion is.
  const customDeparturesLabel = document.createElement("div");
  customDeparturesLabel.className = "label-muted";
  customDeparturesLabel.style.marginTop = "6px";
  customDeparturesLabel.textContent = "Custom departures";
  const customDeparturesContainer = document.createElement("div");
  customDeparturesContainer.style.display = "flex";
  customDeparturesContainer.style.flexWrap = "wrap";
  customDeparturesContainer.style.gap = "4px";
  customDeparturesContainer.style.marginTop = "4px";

  function renderCustomDepartures(): void {
    customDeparturesContainer.innerHTML = "";
    for (const minute of [...currentCustomMinutes].sort((a, b) => a - b)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "btn btn-icon";
      chip.style.fontSize = "11px";
      chip.style.padding = "2px 6px";
      chip.title = "Click to remove this custom departure";
      chip.textContent = `${minutesToHHMM(minute).replace(":", "")} ×`;
      chip.addEventListener("click", () => {
        currentCustomMinutes.delete(minute);
        renderCustomDepartures();
        refreshFamilyLive();
      });
      customDeparturesContainer.appendChild(chip);
    }
  }

  const addCustomRow = document.createElement("div");
  addCustomRow.style.display = "flex";
  addCustomRow.style.gap = "4px";
  addCustomRow.style.marginTop = "4px";
  const addCustomInput = document.createElement("input");
  addCustomInput.className = "field";
  addCustomInput.style.width = "80px";
  addCustomInput.placeholder = "HH:MM";
  const addCustomButton = document.createElement("button");
  addCustomButton.className = "btn";
  addCustomButton.textContent = "+ Add departure";
  const commitCustomInput = () => {
    const minutes = hhmmToMinutes(addCustomInput.value);
    if (minutes === null) return;
    currentCustomMinutes.add(minutes);
    addCustomInput.value = "";
    renderCustomDepartures();
    refreshFamilyLive();
  };
  addCustomButton.addEventListener("click", commitCustomInput);
  addCustomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitCustomInput();
  });
  addCustomRow.appendChild(addCustomInput);
  addCustomRow.appendChild(addCustomButton);

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

  // A real printed-timetable-shaped preview of this route's own current
  // (possibly unsaved) frequency fields — updates live as they're typed,
  // no save needed — built exactly the way the full-screen grid is
  // (stops-layer.ts / merged-grid-table.ts), so leaving this editor to
  // check the stop's own expand button isn't the only way to see it. Where
  // this route has family members (variations sharing the same direction,
  // routeDirectionRanges' own "page" split), their own last-saved
  // timetables are merged in alongside it, same as before — but showing
  // this route's own grid was never conditional on having siblings to
  // begin with (a user report: a standalone route's panel looked like it
  // had "no timetable" once the bands/generator section ended, when what
  // was missing was this preview, not a real regression).
  async function renderFamilySharedStops(dayType: DayType): Promise<void> {
    const family = await loadRouteFamily(route);
    familySection.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.textContent =
      family.length > 1
        ? `Shared stops — ${DAY_TYPE_LABELS[dayType]} (this route's own row updates live as you edit, before saving)`
        : `Timetable — ${DAY_TYPE_LABELS[dayType]} (updates live as you edit, before saving)`;
    familySection.appendChild(heading);

    const showExcludedLabel = document.createElement("label");
    showExcludedLabel.style.display = "flex";
    showExcludedLabel.style.alignItems = "center";
    showExcludedLabel.style.gap = "6px";
    showExcludedLabel.style.cursor = "pointer";
    showExcludedLabel.style.fontSize = "12px";
    const showExcludedCheckbox = document.createElement("input");
    showExcludedCheckbox.type = "checkbox";
    showExcludedCheckbox.checked = showExcludedServices;
    showExcludedCheckbox.addEventListener("change", () => {
      showExcludedServices = showExcludedCheckbox.checked;
      void renderFamilySharedStops(dayType);
    });
    showExcludedLabel.appendChild(showExcludedCheckbox);
    showExcludedLabel.appendChild(document.createTextNode("Show excluded services"));
    familySection.appendChild(showExcludedLabel);

    const otherMembers = family.filter((m) => m.id !== route.id);
    // Every family member's own saved timetables, route itself included —
    // needed for stacking both legs (below): when showing the leg that
    // ISN'T currently being edited, this route's own contribution has to
    // come from its own last-saved data too, not just siblings'.
    const allMembersTimetables = (await Promise.all(family.map((m) => window.routeTimetables.listForRoute(m.id)))).flat();
    const othersTimetables = allMembersTimetables.filter((t) => t.routeId !== route.id);

    let liveTimetable: RouteTimetable | null = null;
    if (validateTimeBands(currentBands) === null) {
      try {
        const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsetsForDirection(
          route,
          currentDirection,
          legTimesSecondsCache,
          timetableEditorState.timingPoints,
        );
        liveTimetable = {
          id: -1,
          routeId: route.id,
          dayType,
          direction: currentDirection,
          timeBands: currentBands.map((b) => ({ ...b })),
          timingPoints: timetableEditorState.timingPoints,
          arrivalOffsetsSeconds,
          departureOffsetsSeconds,
          excludedDepartureMinutes: [...currentExcludedMinutes],
          customDepartureMinutes: [...currentCustomMinutes],
        };
      } catch {
        // An in-progress edit that doesn't yet validate (e.g. a timing
        // point mid-change) — this route's own row just shows nothing
        // live until it does, same as the save button's own validation.
      }
    }

    // Which leg's own comparison to show: whichever leg is actively being
    // edited when this route has independent outbound/inbound components,
    // otherwise the route's own overall orientation (today's only case,
    // unchanged) — DESIGN.md's own §6 direction convention.
    const routeLabel = currentDirection !== "both" ? currentDirection : route.orientation === "outbound" ? "outbound" : "inbound";

    // User request: "an option to exclude times where a variation leaves
    // at the same time" — the general-purpose, one-click version of the
    // exact same workflow the original exclude-departures feature was
    // built for (398A taking over 398's own 0100), instead of finding and
    // clicking each colliding chip by hand. Only meaningful with
    // siblings, and only ever compares against a sibling running the same
    // leg (routeLabel) — a sibling running the opposite direction is a
    // different physical journey, not a real scheduling clash.
    if (family.length > 1) {
      const excludeSharedButton = document.createElement("button");
      excludeSharedButton.className = "btn";
      excludeSharedButton.textContent = "Exclude times a variation also runs";
      excludeSharedButton.title =
        "Excludes any of this route's own generated/custom departures that land at the same time as a variation's own departure";
      excludeSharedButton.addEventListener("click", () => {
        // Every sibling's own real (already-excluded-aware) departure
        // minutes for this same leg/day type — a sibling's own excluded
        // departure doesn't actually run either, so it's not a real
        // clash to defer to.
        const siblingMinutes = new Set<number>();
        for (const member of otherMembers) {
          for (const seg of routeDirectionRanges(member)) {
            const label = seg.label ?? (member.orientation === "outbound" ? "outbound" : "inbound");
            if (label !== routeLabel) continue;
            const memberTimetable =
              othersTimetables.find((t) => t.routeId === member.id && t.dayType === dayType && t.direction === label) ??
              othersTimetables.find((t) => t.routeId === member.id && t.dayType === dayType && t.direction === "both");
            if (!memberTimetable) continue;
            let generated: number[] = [];
            try {
              generated = applyExcludedDepartures(
                generateDepartureMinutesForBands(memberTimetable.timeBands),
                memberTimetable.excludedDepartureMinutes,
              );
            } catch {
              // An invalid/empty band set on a sibling contributes no
              // departures to compare against, not an error here.
            }
            for (const m of mergeCustomDepartures(generated, memberTimetable.customDepartureMinutes)) siblingMinutes.add(m);
          }
        }

        let myMinutes: number[] = [];
        try {
          myMinutes = generateDepartureMinutesForBands(currentBands);
        } catch {
          // Nothing generated yet — nothing to compare, same guard as
          // everywhere else this generator is used.
        }
        for (const m of mergeCustomDepartures(myMinutes, [...currentCustomMinutes])) {
          if (siblingMinutes.has(m)) currentExcludedMinutes.add(m);
        }
        refreshFamilyLive();
      });
      familySection.appendChild(excludeSharedButton);
    }

    const buildMembersForLabel = (label: "outbound" | "inbound"): MergedGridMember[] => {
      const members: MergedGridMember[] = [];
      for (const member of family) {
        for (const seg of routeDirectionRanges(member)) {
          const segLabel = seg.label ?? (member.orientation === "outbound" ? "outbound" : "inbound");
          if (segLabel !== label) continue;
          // This route's own LIVE (possibly unsaved) fields only stand in
          // for the leg actively being edited (routeLabel) — its OTHER
          // leg, shown read-only alongside it, comes from its own
          // last-saved data like any other member does. Prefer a
          // component saved specifically for this leg over the route's
          // shared 'both' one, same precedence as the full-screen grid
          // (stops-layer.ts).
          const timetable =
            member.id === route.id && label === routeLabel
              ? liveTimetable
              : allMembersTimetables.find((t) => t.routeId === member.id && t.dayType === dayType && t.direction === segLabel) ??
                allMembersTimetables.find((t) => t.routeId === member.id && t.dayType === dayType && t.direction === "both");
          if (!timetable) continue;
          const fullGrid = buildRouteTimetableGrid(member, timetable, { includeExcluded: showExcludedServices });
          const slicedGrid = sliceGridToPointRange(fullGrid, seg.fromPointIndex, seg.toPointIndex);
          members.push({ routeId: member.id, routeNumber: member.number, routeColour: member.colour, grid: slicedGrid });
        }
      }
      return members;
    };

    const renderGridSection = (label: "outbound" | "inbound", sectionHeading: string | null): void => {
      if (sectionHeading) {
        const subHeading = document.createElement("div");
        subHeading.className = "label-muted";
        subHeading.style.marginTop = "6px";
        subHeading.style.fontWeight = "700";
        subHeading.textContent = sectionHeading;
        familySection.appendChild(subHeading);
      }
      // A live user request: "show the time of the last service to finish
      // the route" (clarified: the route's own last stop). Always computed
      // with excluded departures dropped entirely, regardless of "Show
      // excluded services" — a hidden departure doesn't actually run, so
      // showing it as "the last service" would be misleading. Only shown
      // for the leg actually being edited (routeLabel) — an unedited leg
      // has nothing live to read this from.
      if (label === routeLabel && liveTimetable) {
        for (const seg of routeDirectionRanges(route)) {
          const segLabel = seg.label ?? (route.orientation === "outbound" ? "outbound" : "inbound");
          if (segLabel !== label) continue;
          const fullGrid = buildRouteTimetableGrid(route, liveTimetable, { includeExcluded: false });
          const segGrid = sliceGridToPointRange(fullGrid, seg.fromPointIndex, seg.toPointIndex);
          const lastJourney = segGrid.journeys[segGrid.journeys.length - 1];
          if (lastJourney) {
            for (let i = lastJourney.length - 1; i >= 0; i--) {
              const minutes = lastJourney[i];
              if (minutes === null) continue;
              const terminusOsmId = segGrid.rows[i].osmId;
              const terminusName = stopsPanelState.displayNameFor?.(terminusOsmId) ?? `Stop ${terminusOsmId}`;
              const lastServiceLine = document.createElement("div");
              lastServiceLine.style.fontSize = "12px";
              lastServiceLine.style.color = "var(--text-muted)";
              lastServiceLine.style.margin = "2px 0 4px";
              lastServiceLine.textContent = `Last service arrives ${terminusName}: ${minutesToHHMM(minutes)}`;
              familySection.appendChild(lastServiceLine);
              break;
            }
          }
        }
      }

      const members = buildMembersForLabel(label);
      if (members.length === 0) {
        const none = document.createElement("div");
        none.className = "label-muted";
        none.textContent =
          family.length > 1
            ? "No other family member has a timetable for this day type and direction yet."
            : "No departures yet — set up a time band above, or add a custom departure, to see the timetable here.";
        familySection.appendChild(none);
        return;
      }
      const merged = buildMergedFamilyGrid(members);
      const gridWrap = document.createElement("div");
      gridWrap.style.maxHeight = "320px";
      gridWrap.style.overflowY = "auto";
      gridWrap.appendChild(
        buildMergedGridTable(
          merged,
          (osmId) => stopsPanelState.displayNameFor?.(osmId) ?? `Stop ${osmId}`,
          // Only this route's own columns are actually toggleable — a
          // sibling's column is shown for comparison only (its own
          // exclusions are edited from its own panel), so a click there is
          // silently ignored rather than mutating a different route's data.
          (column) => {
            if (column.routeId !== route.id) return;
            if (currentExcludedMinutes.has(column.departureMinute)) currentExcludedMinutes.delete(column.departureMinute);
            else currentExcludedMinutes.add(column.departureMinute);
            renderGeneratedDepartures();
            refreshFamilyLive();
          },
        ),
      );
      familySection.appendChild(gridWrap);
    };

    // A terminus-loop route has a real outbound leg AND a real inbound
    // leg — user request: "it should show both timetables one above the
    // other with the current one being edited on top," so switching the
    // direction dropdown to check the other leg doesn't hide the one you
    // were just looking at. A non-loop route only ever has the one leg
    // (routeLabel) — unchanged single-grid behaviour.
    if (isTerminusLoop) {
      const otherLabel: "outbound" | "inbound" = routeLabel === "outbound" ? "inbound" : "outbound";
      const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
      renderGridSection(routeLabel, `${capitalize(routeLabel)} (being edited)`);
      renderGridSection(otherLabel, capitalize(otherLabel));
    } else {
      renderGridSection(routeLabel, null);
    }
  }

  // Live trigger: each band row's own inputs call this directly on every
  // keystroke (not just on blur, unlike normalizeTimeInput's reformatting)
  // so the point of this section — seeing the effect of an edit before
  // committing to Save — actually holds. Timing-point edits (the left-hand
  // stop list) go through the same onTimingPointsEdited hook
  // refreshTimingPointsHint already uses.
  const refreshFamilyLive = () => {
    renderGeneratedDepartures();
    renderCustomDepartures();
    const dayType = DAY_TYPES.find((d) => DAY_TYPE_LABELS[d] === dayTypeDropdown.value) ?? DAY_TYPES[0];
    void renderFamilySharedStops(dayType);
  };

  async function loadComponent(dayType: DayType, direction: RouteTimetableDirection): Promise<void> {
    const existing = (await window.routeTimetables.listForRoute(route.id)).find(
      (t) => t.dayType === dayType && t.direction === direction,
    );
    timetableEditorState.dayType = dayType;
    currentDirection = direction;
    // A day type/direction with its own saved timetable loads its own
    // timing points (real persisted data); one with none yet keeps
    // whatever's currently in memory rather than wiping it — timing
    // points are usually the same physical pattern (just the frequency/
    // hours differ), so switching to a blank one shouldn't throw away
    // work already done elsewhere. Either way this is a fresh array, not
    // the loaded one directly, since the stop list mutates it in place.
    if (existing) timetableEditorState.timingPoints = [...existing.timingPoints];
    refreshTimingPointsHint();
    timetableEditorState.onDayTypeChanged?.();
    statusLine.style.color = STATUS_COLOUR_WARNING;
    const directionSuffix = direction === "both" ? "" : ` (${DIRECTION_LABELS[direction].toLowerCase()})`;
    if (existing) {
      currentBands = existing.timeBands.map((b) => ({ ...b }));
      currentExcludedMinutes = new Set(existing.excludedDepartureMinutes);
      currentCustomMinutes = new Set(existing.customDepartureMinutes);
      statusLine.textContent = `Existing ${DAY_TYPE_LABELS[dayType]}${directionSuffix} timetable loaded.`;
    } else {
      // A fresh component starts from the UK-typical default bands
      // (DESIGN.md §7: "defined globally as defaults, overridable per
      // route") rather than empty — reshape or delete any of them freely.
      currentBands = DEFAULT_TIME_BANDS.map((b) => ({ ...b }));
      currentExcludedMinutes = new Set();
      currentCustomMinutes = new Set();
      statusLine.textContent = `No ${DAY_TYPE_LABELS[dayType]}${directionSuffix} timetable yet — starting from the default time bands.`;
    }
    renderBandRows();
    renderGeneratedDepartures();
    renderCustomDepartures();
    void renderFamilySharedStops(dayType);
  }

  const dayTypeDropdown: Dropdown = createDropdown(
    DAY_TYPES.map((d) => DAY_TYPE_LABELS[d]),
    DAY_TYPE_LABELS[DAY_TYPES[0]],
    (label) => {
      const dayType = DAY_TYPES.find((d) => DAY_TYPE_LABELS[d] === label)!;
      void loadComponent(dayType, currentDirection);
    },
  );

  // Only a terminus-loop route ever gets this — a non-loop route has
  // nothing to split (DESIGN.md §6: outbound/inbound for one are already
  // two separate Route rows, like 398/398A, each with its own ordinary
  // 'both' component).
  const directionDropdown: Dropdown | null = isTerminusLoop
    ? createDropdown(
        (["both", "outbound", "inbound"] as const).map((d) => DIRECTION_LABELS[d]),
        DIRECTION_LABELS.both,
        (label) => {
          const direction =
            (Object.entries(DIRECTION_LABELS).find(([, l]) => l === label)?.[0] as RouteTimetableDirection) ?? "both";
          const dayType = DAY_TYPES.find((d) => DAY_TYPE_LABELS[d] === dayTypeDropdown.value)!;
          void loadComponent(dayType, direction);
        },
      )
    : null;

  saveButton.addEventListener("click", async () => {
    // Reset from green in case a previous save on this same component
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
    const { arrivalOffsetsSeconds, departureOffsetsSeconds, infeasibleTimingPoints } = computeOffsetsForDirection(
      route,
      currentDirection,
      legTimesSeconds,
      timingPoints,
    );
    // Dropped against the live generated list before saving — an
    // exclusion for a minute these bands no longer generate is dead
    // weight, not a real setting worth keeping around indefinitely.
    const liveGeneratedMinutes = new Set(generateDepartureMinutesForBands(currentBands));
    const excludedDepartureMinutes = [...currentExcludedMinutes].filter((m) => liveGeneratedMinutes.has(m));
    await window.routeTimetables.upsert(
      route.id,
      dayType,
      currentDirection,
      currentBands.map((b) => ({ ...b })),
      timingPoints,
      arrivalOffsetsSeconds,
      departureOffsetsSeconds,
      excludedDepartureMinutes,
      [...currentCustomMinutes],
    );
    // Realistic running-time variation across the day comes from the
    // router's own junction delays (give-way, traffic lights) plus, later,
    // passenger boarding/alighting (Phase 4) — not from an artificial
    // multiplier bolted on here. An interim flat time-of-day multiplier
    // used to live in this file; it's gone now that the router itself is
    // getting a real junction-delay model to produce that variation
    // honestly.
    // The leg's own last point, not always the array's own last index —
    // for a split 'outbound' component that's the terminus, well short of
    // the route's own final point (which stays 0/unused for that leg).
    const legRange = currentDirection === "both" ? null : routeDirectionRanges(route).find((r) => r.label === currentDirection);
    const totalMinutesIndex = legRange ? legRange.toPointIndex : arrivalOffsetsSeconds.length - 1;
    const totalMinutes = Math.round(arrivalOffsetsSeconds[totalMinutesIndex] / 60);
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
  if (directionDropdown) body.appendChild(directionDropdown.el);
  body.appendChild(bandsContainer);
  body.appendChild(addBandButton);
  body.appendChild(generatedDeparturesLabel);
  body.appendChild(generatedDeparturesContainer);
  body.appendChild(excludeIntervalRow);
  body.appendChild(customDeparturesLabel);
  body.appendChild(customDeparturesContainer);
  body.appendChild(addCustomRow);
  body.appendChild(timingPointsHint);
  body.appendChild(saveButton);
  body.appendChild(statusLine);
  body.appendChild(familySection);

  void loadComponent(DAY_TYPES[0], "both");

  return { el: panel };
}
