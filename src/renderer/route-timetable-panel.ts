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
  type TimeBand,
  validateTimeBands,
  DEFAULT_TIME_BANDS,
  validateTimingPoints,
  generateDepartureMinutesForBands,
  applyExcludedDepartures,
  mergeCustomDepartures,
  validateNightWindow,
  validateNightFinishTime,
  describeWeekdayMask,
  validateWeekdayMask,
  weekdayMasksOverlap,
  WEEKDAY_BITS,
  MONDAY_FRIDAY_MASK,
  WEEKEND_MASK,
  EVERY_DAY_MASK,
  validateMirrorOffsetMinutes,
} from "./route-timetable.mts";
import { isIslandDepotGroup } from "./fare-journey.mts";
import { minTopSpeedMphForRoute } from "./vehicle-catalogue.mts";
import { LIVERY_SPECIFIC_ROUTE } from "./livery-seed-data.mts";
import { timetableEditorState } from "./timetable-editor-state";
import { stopsPanelState } from "./stops-layer";
import {
  buildRouteTimetableGrid,
  routeDirectionRanges,
  sliceGridToPointRange,
  buildMergedFamilyGrid,
  computeOffsetsForDirection,
  generateBaseDepartureMinutes,
  makeTimetableReferenceResolver,
  type MergedGridMember,
} from "./route-timetable-grid.mts";
import { buildMergedGridTable } from "./merged-grid-table";
import { resolveFamilyDisplayColours, resolveRouteFamily } from "./route-combine-variations.mts";
import { pickContrastColorForHex } from "./icon-contrast";

function stopLabel(point: RoutePoint): string {
  if (point.kind !== "stop" || point.osmId === undefined) return "Stop";
  return stopsPanelState.displayNameFor?.(point.osmId) ?? `Stop ${point.osmId}`;
}

// The status line defaults to orange (info/error/warning) and switches to
// green only for a fully clean save — a save with an infeasible timing
// point stays orange, since it's a "saved, but..." situation.
const STATUS_COLOUR_WARNING = "#f97316";
const STATUS_COLOUR_SUCCESS = "#22c55e";

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
// NOTE (2026-10-11): briefly migrated to `find_route_through` for the whole
// sequence in one call (same fix shape as route-draw.ts's own
// `rebuildRoute`). Reverted the same day after a live install hung
// indefinitely on boot — not yet root-caused; see `vehicle-simulation.ts`'s
// own `buildLegs` for the fuller note and OPEN-ITEMS.md for the real fix to
// retry, properly verified against the live packaged app first.
// Real max-speed floor, added 2026-11-19 ("Each vehicle should have a
// max speed"): the router computes each leg's time from the real road
// network's own speed limits alone, with no notion of what vehicle will
// actually run it — a bus-only route's genuinely fastest achievable time
// can still be faster than any real bus could physically go if a road's
// own limit exceeds the vehicle category's cap (e.g. a 70mph dual
// carriageway stretch, a 50mph-capped bus). `minTopSpeedMphForRoute`
// (vehicle-catalogue.mts) resolves the real per-model cap for whichever
// vehicle type is actually locked to this route (or the whole
// catalogue's own slowest model, for an unrestricted route). Floored
// per leg — `max(router's own real time, distance / that speed)` — right
// where legTimesSeconds is computed, so computeOffsets's existing
// feasibility check (route-timetable.mts) respects it automatically with
// no separate feasibility logic needed.
function computeLegTimesSeconds(router: Router, points: readonly { lon: number; lat: number }[], routeNumber: string): number[] {
  const maxSpeedMph = minTopSpeedMphForRoute(routeNumber, LIVERY_SPECIFIC_ROUTE);
  const maxSpeedMetresPerSecond = (maxSpeedMph * 1609.344) / 3600;
  const legs: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    router.find_route(a.lon, a.lat, b.lon, b.lat);
    const realSeconds = router.last_route_time_seconds();
    const distanceM = router.last_route_distance_m();
    const speedFloorSeconds = distanceM / maxSpeedMetresPerSecond;
    legs.push(Math.max(realSeconds, speedFloorSeconds));
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
  return resolveRouteFamily(route, all);
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
    // Live request, 2026-11-08: "if variations are the same colour each
    // one should be given a unique colour in the timetable editor... [and]
    // colours should always be shown around the button in the top and
    // something different should show which is being edited." Every tab
    // gets a coloured ring in its own DISPLAY colour (resolveFamilyDisplay
    // Colours — a real stored colour where it's not ambiguous, a
    // reassigned one where it collides with a sibling's, e.g. a minor
    // variation that always follows its parent's colour); the one
    // currently being edited is filled solid with that colour instead of
    // just ringed, so it reads as a genuinely different state rather than
    // just "slightly bolder."
    const displayColours = resolveFamilyDisplayColours(family, family);
    for (const member of family) {
      const tab = document.createElement("button");
      tab.className = "btn btn-icon";
      tab.textContent = member.number;
      const colour = displayColours.get(member.id) ?? member.colour;
      tab.style.borderWidth = "2px";
      tab.style.borderColor = colour;
      if (member.id === route.id) {
        tab.disabled = true;
        tab.style.fontWeight = "700";
        tab.style.background = colour;
        tab.style.color = pickContrastColorForHex(colour);
        tab.title = "Currently being edited";
      } else {
        tab.title = `Switch to ${member.number}`;
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
  // Mirror mode (DESIGN.md §7, 2026-11-15 — "a button to set a timetable
  // to have a service after a settable time after one arrives"): when
  // set, this component's own departures come from the referenced
  // service's own real arrivals instead of currentBands, which are
  // simply ignored (not cleared — switching mirror mode back off
  // restores whatever bands were already there). null/0 means "not
  // mirroring", the default and by far the common case.
  let currentMirrorSourceTimetableId: number | null = null;
  let currentMirrorOffsetMinutes = 10;
  // Every route+timetable in the whole game, for the mirror-source
  // picker and for resolving a reference whenever it's actually used —
  // a mirror can point at any route's own timetable, not just a family
  // member's, so this is the full game-wide list, not scoped to `route`.
  // Fetched once, below, and kept live-enough for this panel's own
  // lifetime (reopening the panel re-fetches).
  let allRoutesForMirror: readonly Route[] = [];
  let allTimetablesForMirror: readonly RouteTimetable[] = [];
  void (async () => {
    [allRoutesForMirror, allTimetablesForMirror] = await Promise.all([window.routes.list(), window.routeTimetables.listAll()]);
    renderMirrorUI();
  })();
  function resolveMirrorReference(timetableId: number) {
    return makeTimetableReferenceResolver(allRoutesForMirror, allTimetablesForMirror)(timetableId);
  }
  // The single choke point every live generated-departures computation in
  // this panel reads through (renderGeneratedDepartures, the "exclude
  // shared times" button, the night-window check, the live family
  // preview) — branches to the mirror resolution when mirror mode is on,
  // otherwise behaves exactly as generateDepartureMinutesForBands(
  // currentBands) always did. Kept as one function specifically so every
  // one of those call sites picks up mirror mode uniformly, rather than
  // needing the same branch copied at each of them.
  function currentBaseDepartureMinutes(): number[] {
    return generateBaseDepartureMinutes(
      { mirrorSourceTimetableId: currentMirrorSourceTimetableId, mirrorOffsetMinutes: currentMirrorOffsetMinutes, weekdayMask: selectedWeekdayMask, timeBands: currentBands },
      resolveMirrorReference,
    );
  }
  // "Show excluded services" (user request) — off by default (today's
  // only past behaviour: an excluded departure just isn't there), on
  // shows it anyway as a struck-through column in the grid preview below,
  // so an exclusion's real effect is visible rather than just inferred
  // from its absence.
  let showExcludedServices = false;
  // Which leg of a terminus loop this component covers (DESIGN.md §6).
  // 'both' is still the only value a non-loop route ever gets — one
  // shared generator drives the whole route, exactly as before. A loop
  // route always splits into independent 'outbound' and 'inbound'
  // components instead (live user request, 2026-11-07: "remove both
  // directions from the timetable and have just inbound and outbound" —
  // the earlier "Both directions (shared)" choice let a loop route's two
  // legs drift out of sync with whichever depot crews each one, so it's
  // no longer offered for a new or edited component; the direction
  // dropdown below doesn't exist at all for a non-loop route). A handful
  // of real saves still have an old 'both' row sitting alongside a
  // proper outbound/inbound pair for the same (route, day type) — left
  // alone rather than migrated, since the schema's own precedence rule
  // already prefers the leg-specific row and the 'both' one was already
  // dead weight; it simply stops being reachable from this editor.
  const isTerminusLoop = route.terminusIndex !== null && route.startIndex !== null;
  let currentDirection: RouteTimetableDirection = isTerminusLoop ? "outbound" : "both";
  const DIRECTION_LABELS: Record<RouteTimetableDirection, string> = {
    both: "Both directions (shared)",
    outbound: "Outbound only",
    inbound: "Inbound only",
  };
  // Mirror mode's own UI (DESIGN.md §7, 2026-11-15): a checkbox that
  // swaps the whole bands section out for a source-service picker plus an
  // offset-minutes field — "instead of" the normal generator, per the
  // user's own framing, so the two are mutually exclusive in the UI, not
  // just in which one the data actually uses.
  const mirrorToggleRow = document.createElement("div");
  mirrorToggleRow.style.display = "flex";
  mirrorToggleRow.style.alignItems = "center";
  mirrorToggleRow.style.gap = "6px";
  const mirrorToggle = document.createElement("input");
  mirrorToggle.type = "checkbox";
  mirrorToggle.id = "mirror-mode-toggle";
  const mirrorToggleLabel = document.createElement("label");
  mirrorToggleLabel.htmlFor = "mirror-mode-toggle";
  mirrorToggleLabel.textContent = "Mirror another service's arrivals instead of a frequency generator";
  mirrorToggleRow.append(mirrorToggle, mirrorToggleLabel);

  const mirrorControls = document.createElement("div");
  mirrorControls.style.display = "none";
  mirrorControls.style.flexDirection = "column";
  mirrorControls.style.gap = "6px";
  mirrorControls.style.padding = "8px 0";
  const mirrorSourceContainer = document.createElement("div");
  const mirrorOffsetRow = document.createElement("div");
  mirrorOffsetRow.style.display = "flex";
  mirrorOffsetRow.style.alignItems = "center";
  mirrorOffsetRow.style.gap = "6px";
  const mirrorOffsetLabel = document.createElement("span");
  mirrorOffsetLabel.textContent = "Minutes after it arrives:";
  const mirrorOffsetInput = document.createElement("input");
  mirrorOffsetInput.type = "number";
  mirrorOffsetInput.min = "0";
  mirrorOffsetInput.step = "1";
  mirrorOffsetInput.className = "field";
  mirrorOffsetInput.style.width = "80px";
  mirrorOffsetInput.addEventListener("change", () => {
    const value = Math.round(Number(mirrorOffsetInput.value));
    const error = validateMirrorOffsetMinutes(value);
    if (error) {
      mirrorOffsetInput.value = String(currentMirrorOffsetMinutes);
      return;
    }
    currentMirrorOffsetMinutes = value;
    renderGeneratedDepartures();
  });
  mirrorOffsetRow.append(mirrorOffsetLabel, mirrorOffsetInput);
  const mirrorWarning = document.createElement("div");
  mirrorWarning.className = "label-muted";
  mirrorWarning.style.color = STATUS_COLOUR_WARNING;
  mirrorControls.append(mirrorSourceContainer, mirrorOffsetRow, mirrorWarning);

  // The real stop this component's own generated departures will leave
  // from — point[fromPointIndex] of whichever leg `currentDirection` is
  // (point[0] for a non-loop route's single "both" component). This is
  // the terminus a mirror source's own arrival has to match: DESIGN.md
  // §7's "return journeys" idea only makes physical sense when the
  // vehicle genuinely turns round at the same stop it just arrived at,
  // not an unrelated one elsewhere in the game.
  function editedRouteDepartureTerminusOsmId(): number | null {
    const segment = currentDirection === "both" ? undefined : routeDirectionRanges(route).find((r) => r.label === currentDirection);
    const fromPointIndex = segment?.fromPointIndex ?? 0;
    const point = route.points[fromPointIndex];
    return point && point.kind === "stop" && point.osmId != null ? point.osmId : null;
  }

  // Flat "route number — day type (direction)" picker across every
  // timetable in the whole game (a mirror can reference any route, not
  // just a family member's — it just has to genuinely terminate at the
  // same stop this component departs from, see
  // editedRouteDepartureTerminusOsmId above) — rebuilt whenever the
  // game-wide lists are (re)fetched, since createDropdown has no way to
  // swap its own option set after construction.
  //
  // Live correction, 2026-11-20: this used to list every timetable in
  // the whole game with no terminus check at all — "why does the mirror
  // another services arrival show every route in the game, it should
  // only show routes that terminate at the same terminus." If the
  // edited component's own departure point genuinely can't be resolved
  // (its leg's own start isn't a real stop — shouldn't happen against a
  // real drawn route, but not impossible), this falls back to the old
  // unfiltered list rather than showing nothing, the same "can't
  // determine it, don't silently break the feature" convention used
  // elsewhere in this file.
  function renderMirrorUI(): void {
    const optionLabels: string[] = [];
    const optionIds: number[] = [];
    const departureTerminusOsmId = editedRouteDepartureTerminusOsmId();
    for (const t of allTimetablesForMirror) {
      // Excludes this route's own component being edited (can't mirror
      // itself) and any timetable that's ITSELF already mirroring
      // something (no mirror-of-a-mirror chains — see route_timetables'
      // own SCHEMA comment in electron/db.mts for why).
      if (t.mirrorSourceTimetableId != null) continue;
      const r = allRoutesForMirror.find((rt) => rt.id === t.routeId);
      if (!r) continue;
      if (departureTerminusOsmId !== null) {
        const candidateSegment = t.direction === "both" ? undefined : routeDirectionRanges(r).find((rd) => rd.label === t.direction);
        const toPointIndex = candidateSegment?.toPointIndex ?? r.points.length - 1;
        const arrivalPoint = r.points[toPointIndex];
        const arrivalOsmId = arrivalPoint && arrivalPoint.kind === "stop" && arrivalPoint.osmId != null ? arrivalPoint.osmId : null;
        if (arrivalOsmId !== departureTerminusOsmId) continue;
      }
      const directionSuffix = t.direction === "both" ? "" : ` (${t.direction})`;
      optionLabels.push(`${r.number} — ${describeWeekdayMask(t.weekdayMask)}${directionSuffix}`);
      optionIds.push(t.id);
    }
    const selectedIndex = optionIds.indexOf(currentMirrorSourceTimetableId ?? -1);
    const noOptionsLabel = departureTerminusOsmId !== null ? "No other service arrives at this terminus yet" : "No other timetables exist yet";
    const dropdown = createDropdown(optionLabels.length > 0 ? optionLabels : [noOptionsLabel], selectedIndex >= 0 ? optionLabels[selectedIndex] : optionLabels[0] ?? "", (value) => {
      const i = optionLabels.indexOf(value);
      currentMirrorSourceTimetableId = i >= 0 ? optionIds[i] : null;
      renderGeneratedDepartures();
    });
    mirrorSourceContainer.replaceChildren(dropdown.el);
    if (selectedIndex < 0 && currentMirrorSourceTimetableId != null) {
      mirrorWarning.textContent = "The timetable this used to mirror no longer exists — pick another, or no departures will be generated.";
    } else {
      mirrorWarning.textContent = "";
    }
  }

  mirrorToggle.addEventListener("change", () => {
    if (mirrorToggle.checked) {
      currentMirrorSourceTimetableId = currentMirrorSourceTimetableId ?? null;
      mirrorControls.style.display = "flex";
      bandsContainer.style.display = "none";
      mirrorOffsetInput.value = String(currentMirrorOffsetMinutes);
      renderMirrorUI();
    } else {
      currentMirrorSourceTimetableId = null;
      mirrorControls.style.display = "none";
      bandsContainer.style.display = "flex";
    }
    renderGeneratedDepartures();
  });

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
    // currentBaseDepartureMinutes already handles an invalid/empty band
    // set (or an unresolved mirror reference) by producing nothing,
    // rather than throwing — same as everywhere else this is used.
    const minutes: number[] = currentBaseDepartureMinutes();
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

  // Timing points are set on the route (schema v56->v57, routes.
  // timing_point_indexes), not here — each stop's own little menu in the
  // locked route list on the left (route-panel.ts) flags/unflags one.
  // This module still owns, and still persists, the TIMES at each of the
  // route's own timing points for whichever day type is selected
  // (timetableEditorState.timingPoints), coordinated with route-panel.ts
  // through the same state object. This is just a live count of how many
  // of the route's timing points already have a time for this day type.
  const timingPointsHint = document.createElement("div");
  timingPointsHint.className = "label-muted";
  timingPointsHint.style.padding = "0 12px";

  const saveButton = document.createElement("button");
  saveButton.className = "btn";
  saveButton.textContent = "Save timetable for this day type";

  timetableEditorState.onTimingPointsEdited = refreshTimingPointsHint;

  function refreshTimingPointsHint(): void {
    const total = route.timingPointIndexes.length;
    if (total === 0) {
      timingPointsHint.textContent = "No timing points set on this route yet — click a stop on the left to flag one.";
      return;
    }
    const timed = timetableEditorState.timingPoints.length;
    timingPointsHint.textContent = `${timed} of ${total} timing point${total === 1 ? "" : "s"} timed for this day type — click a stop on the left to edit.`;
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
  const legTimesSecondsCache = computeLegTimesSeconds(router, route.points, route.number);

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
  async function renderFamilySharedStops(weekdayMask: number): Promise<void> {
    const family = await loadRouteFamily(route);
    // Same collision-aware colours the family tabs above use (T164's
    // resolveFamilyDisplayColours) — live bug report, 2026-11-08: "it's
    // only showing 2 colours in the timetable even though I have 3
    // variations" (e.g. two minor variations both following the same
    // parent colour live, T164). The grid's own header-row swatch
    // (buildMembersForLabel below) used to read each member's raw stored
    // `colour` directly, so a real collision there silently showed fewer
    // distinct colours than the tabs already correctly deduped.
    const familyDisplayColours = resolveFamilyDisplayColours(family, family);
    familySection.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.textContent =
      family.length > 1
        ? `Shared stops — ${describeWeekdayMask(weekdayMask)} (this route's own row updates live as you edit, before saving)`
        : `Timetable — ${describeWeekdayMask(weekdayMask)} (updates live as you edit, before saving)`;
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
      void renderFamilySharedStops(weekdayMask);
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
          "standard",
        );
        const { arrivalOffsetsSeconds: arrivalOffsetsSecondsPeak, departureOffsetsSeconds: departureOffsetsSecondsPeak } = computeOffsetsForDirection(
          route,
          currentDirection,
          legTimesSecondsCache,
          timetableEditorState.timingPoints,
          "peak",
        );
        liveTimetable = {
          id: -1,
          routeId: route.id,
          weekdayMask,
          direction: currentDirection,
          timeBands: currentBands.map((b) => ({ ...b })),
          timingPoints: timetableEditorState.timingPoints,
          arrivalOffsetsSeconds,
          departureOffsetsSeconds,
          arrivalOffsetsSecondsPeak,
          departureOffsetsSecondsPeak,
          excludedDepartureMinutes: [...currentExcludedMinutes],
          customDepartureMinutes: [...currentCustomMinutes],
          mirrorSourceTimetableId: currentMirrorSourceTimetableId,
          mirrorOffsetMinutes: currentMirrorSourceTimetableId != null ? currentMirrorOffsetMinutes : null,
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
            // weekdayMasksOverlap, not exact equality (2026-11-14 live bug:
            // "if I have a M-F timetable I can't see that when editing a
            // M-S timetable it's the same") — a sibling's Mon-Fri-only
            // component must still count as a real clash on the days it
            // shares with whatever day type is currently being edited.
            const memberTimetable =
              othersTimetables.find((t) => t.routeId === member.id && weekdayMasksOverlap(t.weekdayMask, weekdayMask) && t.direction === label) ??
              othersTimetables.find((t) => t.routeId === member.id && weekdayMasksOverlap(t.weekdayMask, weekdayMask) && t.direction === "both");
            if (!memberTimetable) continue;
            // generateBaseDepartureMinutes, not a raw band read — a
            // sibling's own component can itself be mirroring something
            // (2026-11-15), and an invalid/empty band set (or an
            // unresolved mirror reference) already safely contributes no
            // departures to compare against, not an error here.
            const generated = applyExcludedDepartures(
              generateBaseDepartureMinutes(memberTimetable, resolveMirrorReference),
              memberTimetable.excludedDepartureMinutes,
            );
            for (const m of mergeCustomDepartures(generated, memberTimetable.customDepartureMinutes)) siblingMinutes.add(m);
          }
        }

        const myMinutes: number[] = currentBaseDepartureMinutes();
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
          // weekdayMasksOverlap, not exact equality — same fix as the
          // "exclude shared times" lookup above, so a sibling's shared
          // row still appears when its own day type merely overlaps
          // (rather than exactly matches) the one being viewed.
          const timetable =
            member.id === route.id && label === routeLabel
              ? liveTimetable
              : (allMembersTimetables.find((t) => t.routeId === member.id && weekdayMasksOverlap(t.weekdayMask, weekdayMask) && t.direction === segLabel) ??
                allMembersTimetables.find((t) => t.routeId === member.id && weekdayMasksOverlap(t.weekdayMask, weekdayMask) && t.direction === "both"));
          if (!timetable) continue;
          const fullGrid = buildRouteTimetableGrid(member, timetable, { includeExcluded: showExcludedServices }, resolveMirrorReference);
          const slicedGrid = sliceGridToPointRange(fullGrid, seg.fromPointIndex, seg.toPointIndex);
          members.push({
            routeId: member.id,
            routeNumber: member.number,
            routeColour: familyDisplayColours.get(member.id) ?? member.colour,
            grid: slicedGrid,
            isMinorVariation: member.isMinorVariation,
          });
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
          const fullGrid = buildRouteTimetableGrid(route, liveTimetable, { includeExcluded: false }, resolveMirrorReference);
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
    void renderFamilySharedStops(selectedWeekdayMask);
  };

  // Every component for the route's CURRENT direction only (DESIGN.md §6:
  // an independent outbound-only and inbound-only component for the same
  // days are two different physical legs, not a real overlap) — refreshed
  // by loadComponent and after save/delete, read by renderDayTypePillsUI
  // and the "already taken" greying in the add-day-type picker below.
  let currentDirectionComponents: RouteTimetable[] = [];

  async function loadComponent(weekdayMask: number, direction: RouteTimetableDirection): Promise<void> {
    const allForRoute = await window.routeTimetables.listForRoute(route.id);
    currentDirectionComponents = allForRoute.filter((t) => t.direction === direction);
    const existing = currentDirectionComponents.find((t) => t.weekdayMask === weekdayMask);
    selectedWeekdayMask = weekdayMask;
    currentDirection = direction;
    timetableEditorState.weekdayMask = weekdayMask;
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
    const label = describeWeekdayMask(weekdayMask);
    if (existing) {
      currentBands = existing.timeBands.map((b) => ({ ...b }));
      currentExcludedMinutes = new Set(existing.excludedDepartureMinutes);
      currentCustomMinutes = new Set(existing.customDepartureMinutes);
      currentMirrorSourceTimetableId = existing.mirrorSourceTimetableId;
      currentMirrorOffsetMinutes = existing.mirrorOffsetMinutes ?? 10;
      statusLine.textContent = `Existing ${label}${directionSuffix} timetable loaded.`;
    } else {
      // A fresh component starts from the UK-typical default bands
      // (DESIGN.md §7: "defined globally as defaults, overridable per
      // route") rather than empty — reshape or delete any of them freely.
      currentBands = DEFAULT_TIME_BANDS.map((b) => ({ ...b }));
      currentExcludedMinutes = new Set();
      currentCustomMinutes = new Set();
      currentMirrorSourceTimetableId = null;
      currentMirrorOffsetMinutes = 10;
      statusLine.textContent = `No ${label}${directionSuffix} timetable yet — starting from the default time bands.`;
    }
    mirrorToggle.checked = currentMirrorSourceTimetableId != null;
    mirrorControls.style.display = mirrorToggle.checked ? "flex" : "none";
    bandsContainer.style.display = mirrorToggle.checked ? "none" : "flex";
    mirrorOffsetInput.value = String(currentMirrorOffsetMinutes);
    renderMirrorUI();
    renderBandRows();
    renderGeneratedDepartures();
    renderCustomDepartures();
    renderDayTypePillsUI();
    void renderFamilySharedStops(weekdayMask);
  }

  // Which weekday mask is currently loaded into the editor below — set by
  // loadComponent, read by the save handler and the family-live preview.
  // Starts on Mon-Fri purely as a sensible first guess before the initial
  // loadComponent call (below) replaces it with whatever this route
  // actually has, or keeps it if the route has nothing saved yet.
  let selectedWeekdayMask = MONDAY_FRIDAY_MASK;

  // One pill per existing day-type component for the current direction
  // (DESIGN.md §7: any number of components, confirmed 2026-11-07), each
  // clickable to load it for editing below, plus its own delete button.
  // The currently-selected mask always shows — as a real pill if it's
  // already saved, or a dashed "(new)" placeholder if it's an in-progress,
  // not-yet-saved choice from the add-day-type picker.
  const dayTypePills = document.createElement("div");
  dayTypePills.style.display = "flex";
  dayTypePills.style.flexWrap = "wrap";
  dayTypePills.style.gap = "6px";
  dayTypePills.style.alignItems = "center";

  function renderDayTypePillsUI(): void {
    dayTypePills.innerHTML = "";
    const sorted = [...currentDirectionComponents].sort((a, b) => a.weekdayMask - b.weekdayMask);
    for (const comp of sorted) {
      const row = document.createElement("span");
      row.style.display = "inline-flex";
      row.style.alignItems = "center";
      row.style.gap = "2px";

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "btn btn-icon";
      pill.classList.toggle("is-active", comp.weekdayMask === selectedWeekdayMask);
      pill.textContent = describeWeekdayMask(comp.weekdayMask);
      pill.addEventListener("click", () => void loadComponent(comp.weekdayMask, currentDirection));
      row.appendChild(pill);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-icon btn-danger";
      removeButton.textContent = "×";
      removeButton.title = "Delete this day type";
      removeButton.addEventListener("click", async () => {
        await window.routeTimetables.delete(comp.id);
        const remaining = currentDirectionComponents.filter((c) => c.id !== comp.id);
        await loadComponent(remaining[0]?.weekdayMask ?? MONDAY_FRIDAY_MASK, currentDirection);
      });
      row.appendChild(removeButton);

      dayTypePills.appendChild(row);
    }
    if (!sorted.some((c) => c.weekdayMask === selectedWeekdayMask)) {
      const unsavedPill = document.createElement("span");
      unsavedPill.className = "btn btn-icon is-active";
      unsavedPill.style.borderStyle = "dashed";
      unsavedPill.title = "Not saved yet — click \"Save timetable for this day type\" below to create it";
      unsavedPill.textContent = `${describeWeekdayMask(selectedWeekdayMask)} (new)`;
      dayTypePills.appendChild(unsavedPill);
    }
  }

  // "+ Add day type" opens a 7-day toggle picker with Mon-Fri/Weekend/
  // Every day presets (confirmed 2026-11-07: "7 day text which highlights
  // when selected + quick-preset buttons") — a day already claimed by
  // another component in this same direction is disabled rather than
  // toggleable (confirmed: "Grey out/disable already-taken days"), and
  // presets silently drop any of their own days that are already taken
  // rather than offering an overlap the toggles themselves would refuse.
  const addDayTypeButton = document.createElement("button");
  addDayTypeButton.type = "button";
  addDayTypeButton.className = "btn";
  addDayTypeButton.textContent = "+ Add day type";

  const addPickerContainer = document.createElement("div");
  addPickerContainer.style.display = "none";
  addPickerContainer.style.flexDirection = "column";
  addPickerContainer.style.gap = "6px";
  addPickerContainer.style.padding = "8px";
  addPickerContainer.style.border = "1px solid var(--border)";
  addPickerContainer.style.borderRadius = "4px";

  const presetRow = document.createElement("div");
  presetRow.style.display = "flex";
  presetRow.style.gap = "4px";

  const dayToggleRow = document.createElement("div");
  dayToggleRow.style.display = "flex";
  dayToggleRow.style.gap = "4px";

  const DAY_PICKER_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  const DAY_PICKER_BITS = [
    WEEKDAY_BITS.monday,
    WEEKDAY_BITS.tuesday,
    WEEKDAY_BITS.wednesday,
    WEEKDAY_BITS.thursday,
    WEEKDAY_BITS.friday,
    WEEKDAY_BITS.saturday,
    WEEKDAY_BITS.sunday,
  ];

  let pendingMask = 0;
  let takenMask = 0;

  const confirmAddButton = document.createElement("button");
  confirmAddButton.type = "button";
  confirmAddButton.className = "btn";
  confirmAddButton.textContent = "Add";

  const cancelAddButton = document.createElement("button");
  cancelAddButton.type = "button";
  cancelAddButton.className = "btn";
  cancelAddButton.textContent = "Cancel";

  const dayToggleButtons = DAY_PICKER_LABELS.map((dayLabel, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-icon";
    btn.textContent = dayLabel;
    btn.addEventListener("click", () => {
      pendingMask ^= DAY_PICKER_BITS[i];
      renderPendingMaskUI();
    });
    dayToggleRow.appendChild(btn);
    return btn;
  });

  function renderPendingMaskUI(): void {
    DAY_PICKER_BITS.forEach((bit, i) => {
      const btn = dayToggleButtons[i];
      const takenByOther = (takenMask & bit) !== 0;
      btn.disabled = takenByOther;
      btn.style.opacity = takenByOther ? "0.35" : "1";
      btn.classList.toggle("is-active", (pendingMask & bit) !== 0);
    });
    confirmAddButton.disabled = validateWeekdayMask(pendingMask) !== null;
  }

  for (const preset of [
    { label: "Mon-Fri", mask: MONDAY_FRIDAY_MASK },
    { label: "Weekend", mask: WEEKEND_MASK },
    { label: "Every day", mask: EVERY_DAY_MASK },
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      pendingMask = preset.mask & ~takenMask;
      renderPendingMaskUI();
    });
    presetRow.appendChild(btn);
  }

  function openAddPicker(): void {
    pendingMask = 0;
    takenMask = currentDirectionComponents
      .filter((c) => c.weekdayMask !== selectedWeekdayMask)
      .reduce((acc, c) => acc | c.weekdayMask, 0);
    renderPendingMaskUI();
    addPickerContainer.style.display = "flex";
  }
  function closeAddPicker(): void {
    addPickerContainer.style.display = "none";
  }
  addDayTypeButton.addEventListener("click", openAddPicker);
  cancelAddButton.addEventListener("click", closeAddPicker);
  confirmAddButton.addEventListener("click", () => {
    if (validateWeekdayMask(pendingMask) !== null) return;
    closeAddPicker();
    void loadComponent(pendingMask, currentDirection);
  });

  const addPickerButtonRow = document.createElement("div");
  addPickerButtonRow.style.display = "flex";
  addPickerButtonRow.style.gap = "4px";
  addPickerButtonRow.appendChild(confirmAddButton);
  addPickerButtonRow.appendChild(cancelAddButton);

  addPickerContainer.appendChild(presetRow);
  addPickerContainer.appendChild(dayToggleRow);
  addPickerContainer.appendChild(addPickerButtonRow);

  const dayTypeSection = document.createElement("div");
  dayTypeSection.style.display = "flex";
  dayTypeSection.style.flexDirection = "column";
  dayTypeSection.style.gap = "6px";
  dayTypeSection.appendChild(dayTypePills);
  dayTypeSection.appendChild(addDayTypeButton);
  dayTypeSection.appendChild(addPickerContainer);

  // Only a terminus-loop route ever gets this — a non-loop route has
  // nothing to split (DESIGN.md §6: outbound/inbound for one are already
  // two separate Route rows, like 398/398A, each with its own ordinary
  // 'both' component).
  const directionDropdown: Dropdown | null = isTerminusLoop
    ? createDropdown(
        (["outbound", "inbound"] as const).map((d) => DIRECTION_LABELS[d]),
        DIRECTION_LABELS.outbound,
        (label) => {
          const direction =
            (Object.entries(DIRECTION_LABELS).find(([, l]) => l === label)?.[0] as RouteTimetableDirection) ??
            "outbound";
          void loadComponent(selectedWeekdayMask, direction);
        },
      )
    : null;

  saveButton.addEventListener("click", async () => {
    // Reset from green in case a previous save on this same component
    // succeeded cleanly and this attempt doesn't.
    statusLine.style.color = STATUS_COLOUR_WARNING;
    const bandsError = validateTimeBands(currentBands);
    if (bandsError) {
      statusLine.textContent = bandsError;
      return;
    }
    // Live bug report (2026-11-07): "I cant set a timetable to have no
    // services on a day, it says I have to have at least one." This used
    // to require at least one band or custom departure before saving —
    // removed; zero of both is a real, deliberate state (this day type
    // genuinely runs no service) and the pure logic underneath already
    // handles it safely throughout (generateDepartureMinutesForBands([])
    // returns [], validateNightWindow/validateNightFinishTime both treat
    // an empty minutes list as trivially valid) — this was an added UI
    // restriction, not something anything downstream actually needed.
    // Route types (2026-10-31, tightened 2026-11-01): a Night-type
    // route's last departure must be no later than 03:45 (UK-EXPANSION.md
    // §10's own window, tightened from the doc's general "typically
    // 2345-0400"); the separate "must finish by 04:15" rule needs the
    // route's actual running time, so it's checked further down once
    // that's computed.
    let allNightMinutes: number[] = [];
    if (route.routeType === "night") {
      allNightMinutes = mergeCustomDepartures(currentBaseDepartureMinutes(), [...currentCustomMinutes]);
      const nightWindowError = validateNightWindow(allNightMinutes);
      if (nightWindowError) {
        statusLine.textContent = nightWindowError;
        return;
      }
    }
    const timingPoints = timetableEditorState.timingPoints;
    // Island restriction (2026-11-15, user: "It should be based on the
    // fare zone type a depot is in") — checked here too, not just left to
    // route-panel.ts's UI, so a bypassed client can't save invalid data;
    // see fare-journey.mts's isIslandDepotGroup for the full reasoning.
    const [islandDepots, islandZones] = await Promise.all([window.depots.list(), window.fareZones.listAll()]);
    const isIslandRoute = isIslandDepotGroup(route.depotGroupId, islandDepots, islandZones);
    const tpError = validateTimingPoints(route.points, timingPoints, isIslandRoute, route.timingPointIndexes);
    if (tpError) {
      statusLine.textContent = tpError;
      return;
    }

    statusLine.textContent = "Computing running times…";
    const legTimesSeconds = computeLegTimesSeconds(router, route.points, route.number);
    const { arrivalOffsetsSeconds, departureOffsetsSeconds } = computeOffsetsForDirection(
      route,
      currentDirection,
      legTimesSeconds,
      timingPoints,
      "standard",
    );
    const { arrivalOffsetsSeconds: arrivalOffsetsSecondsPeak, departureOffsetsSeconds: departureOffsetsSecondsPeak } = computeOffsetsForDirection(
      route,
      currentDirection,
      legTimesSeconds,
      timingPoints,
      "peak",
    );
    if (route.routeType === "night") {
      const runningTimeSeconds = Math.max(...arrivalOffsetsSeconds);
      const nightFinishError = validateNightFinishTime(allNightMinutes, runningTimeSeconds);
      if (nightFinishError) {
        statusLine.textContent = nightFinishError;
        return;
      }
    }
    // Dropped against the live generated list before saving — an
    // exclusion for a minute these bands (or this mirror) no longer
    // generate is dead weight, not a real setting worth keeping around
    // indefinitely.
    const liveGeneratedMinutes = new Set(currentBaseDepartureMinutes());
    const excludedDepartureMinutes = [...currentExcludedMinutes].filter((m) => liveGeneratedMinutes.has(m));
    await window.routeTimetables.upsert(
      route.id,
      selectedWeekdayMask,
      currentDirection,
      currentBands.map((b) => ({ ...b })),
      timingPoints,
      arrivalOffsetsSeconds,
      departureOffsetsSeconds,
      arrivalOffsetsSecondsPeak,
      departureOffsetsSecondsPeak,
      excludedDepartureMinutes,
      [...currentCustomMinutes],
      currentMirrorSourceTimetableId,
      currentMirrorSourceTimetableId != null ? currentMirrorOffsetMinutes : null,
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
    // No "infeasible, clamped" warning any more — padding can never be
    // negative under the new model, so the published time can never fall
    // below the real fastest achievable time in the first place.
    statusLine.style.color = STATUS_COLOUR_SUCCESS;
    statusLine.textContent = `Saved. End-to-end running time: ${totalMinutes} min.`;
    // Refreshes the pill list too — a brand-new (previously "(new)",
    // unsaved) mask is now a real saved component.
    currentDirectionComponents = (await window.routeTimetables.listForRoute(route.id)).filter(
      (t) => t.direction === currentDirection,
    );
    renderDayTypePillsUI();
    void renderFamilySharedStops(selectedWeekdayMask);
  });

  body.appendChild(dayTypeSection);
  if (directionDropdown) body.appendChild(directionDropdown.el);
  body.appendChild(mirrorToggleRow);
  body.appendChild(mirrorControls);
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

  // Opens on whichever day type this route already has (the lowest mask,
  // for a stable order), falling back to Mon-Fri as a sensible first guess
  // for a route with nothing saved yet. A loop route opens on its
  // outbound leg (currentDirection's own default, above); a non-loop
  // route still opens on 'both', its only ever value.
  void window.routeTimetables.listForRoute(route.id).then((existing) => {
    const first = existing
      .filter((t) => t.direction === currentDirection)
      .sort((a, b) => a.weekdayMask - b.weekdayMask)[0];
    void loadComponent(first?.weekdayMask ?? MONDAY_FRIDAY_MASK, currentDirection);
  });

  return { el: panel };
}
