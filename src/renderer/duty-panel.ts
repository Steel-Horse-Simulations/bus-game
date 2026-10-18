// Duty building (OPERATIONS.md §7 "Duties", Phase 3) — a full-screen view,
// opened per depot group, listing that day type's real generated journeys
// and letting the player chain them into duties by hand, lock a duty so
// auto-complete won't touch it, and auto-complete the rest for lowest
// total dead mileage.
//
// Deliberately vehicle-only for this first increment, decided with the
// user (2026-10-17): no driver, no duty-length/hours validation — those
// are Phase 6's own concern once drivers (who can swap vehicles mid-duty,
// genuinely a separate layer) and the GB/EU hours regime actually exist.
//
// Every duty is anchored to one physical depot within its own group — a
// group can have more than one depot, and a duty always starts and ends
// its day there (the user's own correction, 2026-10-17, to this file's
// earlier "doesn't need to start/end at a depot" note: a driver will need
// to start/end there too once Phase 6 adds them). The duty_number itself
// encodes which depot it belongs to — 1xxx for the group's main depot,
// 2xxx for the next, and so on (electron/db.mts's own `nextDutyNumber`) —
// so the grid groups naturally by depot just by sorting on it.
import type { Router } from "./wasm/game_wasm.js";
import { journeysForDepotGroup, journeyKey, type Journey } from "./duty-journeys.mts";
import { stopsPanelState } from "./stops-layer";
import { createDropdown, type Dropdown } from "./dropdown";

const DAY_TYPES: DayType[] = ["monday_friday", "saturday", "sunday"];
const DAY_TYPE_LABELS: Record<DayType, string> = { monday_friday: "Mon-Fri", saturday: "Sat", sunday: "Sun" };

// Lets depot-groups-panel.ts (which has no router/map access — it mounts
// before either exists, see main.ts's own boot order) open this screen for
// a specific depot group without a direct import cycle, the same shared-
// mutable-state pattern stopsPanelState/routeDrawState already use.
export const dutyPanelState: {
  openForDepotGroup: ((depotGroupId: number, depotGroupName: string) => void) | null;
} = {
  openForDepotGroup: null,
};

function formatClockMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function approxDistanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon - a.lon);
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return R * Math.sqrt(dLat * dLat + x * x);
}

// The real road distance/time to drive empty between two points, via the
// router — null if no legal route exists at all (e.g. access-restricted
// either end with nothing permitting it), which the caller treats as
// "can't chain these two journeys," not a crash. Two points at the exact
// same spot (a same-route return journey arriving and departing the same
// terminus) short-circuit to zero rather than asking the router to route
// "from a point to itself." Also used for a duty's own pull-out (depot ->
// first piece) and pull-in (last piece -> depot) legs — a depot is just
// another {lon,lat} point as far as this is concerned.
function deadRun(router: Router, from: { lon: number; lat: number }, to: { lon: number; lat: number }): { distanceM: number; timeS: number } | null {
  if (from.lon === to.lon && from.lat === to.lat) return { distanceM: 0, timeS: 0 };
  const coords = router.find_route(from.lon, from.lat, to.lon, to.lat);
  if (coords.length === 0) return null;
  let distanceM = 0;
  for (let i = 0; i + 3 < coords.length; i += 2) {
    distanceM += approxDistanceM({ lon: coords[i], lat: coords[i + 1] }, { lon: coords[i + 2], lat: coords[i + 3] });
  }
  return { distanceM, timeS: router.last_route_time_seconds() };
}

// Whether `next` can legally/physically follow `last` in the same duty —
// there must be enough time between `last`'s own arrival and `next`'s own
// departure to actually drive the dead run between them (zero if they
// share an exact point), **plus** a minimum buffer on top — a live user
// request, 2026-10-17, so a duty isn't scheduled wall-to-wall with zero
// slack for a service running late. Applies to manual chaining too, not
// just auto-complete (the same function backs both, via `renderJourneys`'s
// own `canAdd` check), since a hand-built duty shouldn't be allowed a
// tighter connection than auto-complete would ever create. Returns the
// dead run itself (reused by both the feasibility check and the auto-
// complete cost comparison) or null if infeasible for either reason.
const MIN_LAYOVER_MINUTES = 5;

function canFollow(router: Router, last: Journey, next: Journey): { distanceM: number; timeS: number } | null {
  if (next.startClockMinutes < last.endClockMinutes) return null;
  const dr = deadRun(router, last.endPoint, next.startPoint);
  if (!dr) return null;
  if (last.endClockMinutes + dr.timeS / 60 + MIN_LAYOVER_MINUTES > next.startClockMinutes) return null;
  return dr;
}

function stopName(osmId: number | null): string {
  if (osmId === null) return "";
  return stopsPanelState.displayNameFor?.(osmId) ?? `Stop ${osmId}`;
}

// Readable text colour for a badge chip painted with a route's own colour
// — some of the golden-angle-generated route colours (route-draw.ts's own
// `nextRouteColour`) land pale/light (a live user report: "I can barely
// read the 467 and 888 route numbers" against fixed white text), so the
// text colour itself now follows the background's real luminance (the
// standard relative-luminance formula) rather than always being white.
function readableTextColour(hexColour: string): string {
  const hex = hexColour.replace("#", "");
  if (hex.length !== 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "#111" : "#fff";
}

function journeyLabel(journey: Journey): string {
  const start = stopName(journey.startStopOsmId);
  const end = stopName(journey.endStopOsmId);
  const stops = start && end ? ` — ${start} → ${end}` : "";
  return `${formatClockMinutes(journey.startClockMinutes)}–${formatClockMinutes(journey.endClockMinutes)}  ${journey.routeNumber}${stops}`;
}

export async function mountDutyPanel(router: Router): Promise<void> {
  let depotGroupId: number | null = null;
  let depotGroupName = "";
  let dayType: DayType = "monday_friday";
  let journeys: Journey[] = [];
  let duties: Duty[] = [];
  let routes: Route[] = [];
  let depots: Depot[] = []; // this depot group's own depots, ordered by id (rank order — id order is "main depot first")
  let selectedDepotId: number | null = null; // which depot a newly-created duty is assigned to
  let activeDutyId: number | null = null; // the one duty box currently expanded, and the add-journey target
  let busy = false;

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "10";
  overlay.style.background = "var(--bg-page)";
  overlay.style.display = "none";
  overlay.style.flexDirection = "column";
  document.body.appendChild(overlay);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "12px";
  header.style.padding = "12px 16px";
  header.style.borderBottom = "1px solid var(--border)";
  header.style.flexWrap = "wrap";

  const title = document.createElement("span");
  title.style.fontWeight = "600";
  title.style.flex = "1";
  header.appendChild(title);

  const dayTypeBar = document.createElement("div");
  dayTypeBar.style.display = "flex";
  dayTypeBar.style.gap = "4px";
  const dayTypeButtons = new Map<DayType, HTMLButtonElement>();
  for (const dt of DAY_TYPES) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = DAY_TYPE_LABELS[dt];
    btn.addEventListener("click", () => {
      dayType = dt;
      activeDutyId = null;
      void refresh();
    });
    dayTypeButtons.set(dt, btn);
    dayTypeBar.appendChild(btn);
  }
  header.appendChild(dayTypeBar);

  // "A way to see different depots in a group" (2026-10-17): every duty
  // belongs to exactly one depot, so this picks which depot a newly
  // created duty is assigned to. The duties grid itself always shows every
  // depot in the group together, grouped by section header — this is just
  // for "+ New duty", not a view filter.
  const depotLabel = document.createElement("span");
  depotLabel.className = "label-muted";
  depotLabel.textContent = "New duties at:";
  header.appendChild(depotLabel);
  const depotDropdownContainer = document.createElement("div");
  depotDropdownContainer.style.minWidth = "160px";
  header.appendChild(depotDropdownContainer);
  let depotDropdown: Dropdown | null = null;

  const newDutyButton = document.createElement("button");
  newDutyButton.className = "btn";
  newDutyButton.textContent = "+ New duty";
  header.appendChild(newDutyButton);

  const autoCompleteButton = document.createElement("button");
  autoCompleteButton.className = "btn";
  autoCompleteButton.textContent = "Auto-complete";
  autoCompleteButton.title = "Chains every remaining unassigned journey into the lowest total dead mileage (including pull-out/pull-in to a depot), extending existing unlocked duties, starting new ones at whichever depot in the group is cheapest, as needed";
  header.appendChild(autoCompleteButton);

  const closeButton = document.createElement("button");
  closeButton.className = "btn";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    overlay.style.display = "none";
  });
  header.appendChild(closeButton);

  overlay.appendChild(header);

  const noDepotsNotice = document.createElement("div");
  noDepotsNotice.style.padding = "8px 16px";
  noDepotsNotice.style.color = "var(--text-danger)";
  noDepotsNotice.style.display = "none";
  noDepotsNotice.textContent = "Place a depot for this depot group first (OPERATIONS.md §1) — a duty always belongs to one.";
  overlay.appendChild(noDepotsNotice);

  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.display = "flex";
  body.style.minHeight = "0";
  overlay.appendChild(body);

  // Services on the left, duties on the right (the user's own layout
  // request, 2026-10-17) — the reverse of this panel's first cut.
  const journeysColumn = document.createElement("div");
  journeysColumn.style.width = "440px";
  journeysColumn.style.flexShrink = "0";
  journeysColumn.style.borderRight = "1px solid var(--border)";
  journeysColumn.style.overflowY = "auto";
  journeysColumn.style.padding = "8px";
  body.appendChild(journeysColumn);

  const dutiesColumn = document.createElement("div");
  dutiesColumn.style.flex = "1";
  dutiesColumn.style.overflowY = "auto";
  dutiesColumn.style.padding = "8px";
  // Reserves the scrollbar's own width always, not just once content
  // actually overflows — renderDuties measures `clientWidth` fresh on
  // every render, but it does so right after clearing out the previous
  // render's own children (so there's nothing to overflow yet, and no
  // scrollbar showing, at the exact moment it measures) — without this,
  // that measurement would be wrong on every single render, not just the
  // first, since the real scrollbar only reappears once the fresh content
  // is back in and overflowing again. Pinning the gutter open regardless
  // makes the measurement stable and correct every time.
  dutiesColumn.style.scrollbarGutter = "stable";
  body.appendChild(dutiesColumn);

  const dutyLastJourney = (duty: Duty): Journey | null => {
    if (duty.pieces.length === 0) return null;
    const last = duty.pieces[duty.pieces.length - 1];
    return journeys.find((j) => j.routeId === last.routeId && j.departureMinutes === last.departureMinutes) ?? null;
  };

  const assignedKeys = (): Set<string> => {
    const set = new Set<string>();
    for (const duty of duties) {
      for (const piece of duty.pieces) set.add(journeyKey(piece.routeId, piece.departureMinutes));
    }
    return set;
  };

  const depotById = (id: number): Depot | null => depots.find((d) => d.id === id) ?? null;

  // The route badge data for a duty's own collapsed box — unique routes it
  // covers, in first-appearance order. Looked up against `routes` (not
  // `journeys`) so a badge still shows correctly even for a piece whose
  // exact departure has since been excluded from the published timetable
  // (the piece itself still carries a real routeId either way).
  const dutyRouteBadges = (duty: Duty): { routeId: number; number: string; colour: string }[] => {
    const seen = new Set<number>();
    const badges: { routeId: number; number: string; colour: string }[] = [];
    for (const piece of duty.pieces) {
      if (seen.has(piece.routeId)) continue;
      seen.add(piece.routeId);
      const route = routes.find((r) => r.id === piece.routeId);
      badges.push({ routeId: piece.routeId, number: route?.number ?? `#${piece.routeId}`, colour: route?.colour ?? "#888" });
    }
    return badges;
  };

  // A real masonry pack (2026-10-17, after two CSS-grid-only attempts both
  // just traded one gap for another — a grid row is always as tall as its
  // tallest item and nothing can backfill the dead space a shorter sibling
  // or a now-isolated tall item leaves behind; only genuine per-column
  // height tracking avoids that). Confirmed with the user: duty order may
  // end up visually out of strict left-to-right sequence as a result
  // (items pack into whichever column has room next), but each depot's
  // own section still renders as a contiguous block, never interleaved
  // with another depot's.
  const MASONRY_COL_WIDTH = 230;
  const MASONRY_GAP = 8;

  const renderDuties = (): void => {
    dutiesColumn.innerHTML = "";
    dutiesColumn.style.display = "block";
    dutiesColumn.style.position = "relative";

    if (duties.length === 0) {
      const empty = document.createElement("div");
      empty.className = "label-muted";
      empty.textContent = "No duties yet — click + New duty to start one.";
      dutiesColumn.appendChild(empty);
      return;
    }

    // clientWidth, not getBoundingClientRect().width — the latter is the
    // element's own border-box width, which does NOT shrink when a
    // vertical scrollbar appears (the scrollbar eats into the content box,
    // not the border box), so cards were overlapping the real scrollbar
    // once there was enough content to need one (a live user report,
    // 2026-10-18: "the duties go behind the scroll bar").
    const containerWidth = dutiesColumn.clientWidth || MASONRY_COL_WIDTH;
    const numCols = Math.max(1, Math.floor((containerWidth + MASONRY_GAP) / (MASONRY_COL_WIDTH + MASONRY_GAP)));
    const colWidth = (containerWidth - MASONRY_GAP * (numCols - 1)) / numCols;

    // Pass 1: build every element (section headers and duty cards) exactly
    // as before, tagged with how many of the numCols real columns it
    // should occupy — but appended in plain document flow for now, not
    // yet positioned, so each one's own real rendered height can be
    // measured in pass 2 (impossible to know before the browser lays out
    // its real content — number of pieces, wrapped badge rows, etc).
    const blocks: { el: HTMLElement; span: number; isHeader: boolean }[] = [];

    let lastDepotId: number | null = null;
    for (const duty of duties) {
      // duties is already ordered by duty_number (db.mts), so it's already
      // grouped by depot — a section header just needs to fire on change.
      if (duty.depotId !== lastDepotId) {
        const sectionHeader = document.createElement("div");
        sectionHeader.style.fontWeight = "600";
        sectionHeader.style.borderBottom = "1px solid var(--border)";
        sectionHeader.style.paddingBottom = "4px";
        sectionHeader.textContent = depotById(duty.depotId)?.name ?? `Depot ${duty.depotId}`;
        blocks.push({ el: sectionHeader, span: numCols, isHeader: true });
        lastDepotId = duty.depotId;
      }

      const expanded = duty.id === activeDutyId;
      const card = document.createElement("div");
      card.className = "panel";
      card.style.padding = "8px";
      card.style.cursor = "pointer";
      card.style.boxSizing = "border-box";
      card.style.border = expanded ? "2px solid #3b82f6" : "1px solid var(--border)";
      blocks.push({ el: card, span: expanded ? Math.min(3, numCols) : 1, isHeader: false });
      card.addEventListener("click", (e) => {
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
        activeDutyId = expanded ? null : duty.id;
        renderDuties();
        renderJourneys();
      });

      const cardHeader = document.createElement("div");
      cardHeader.style.display = "flex";
      cardHeader.style.alignItems = "center";
      cardHeader.style.gap = "6px";
      cardHeader.style.marginBottom = "4px";

      const numberLabel = document.createElement("span");
      numberLabel.style.fontWeight = "600";
      numberLabel.textContent = duty.dutyNumber;
      cardHeader.appendChild(numberLabel);

      const lockButton = document.createElement("button");
      lockButton.className = "btn btn-icon";
      lockButton.textContent = duty.locked ? "\u{1F512}" : "\u{1F513}";
      lockButton.title = duty.locked ? "Locked — auto-complete won't change this duty" : "Unlocked — auto-complete may extend this duty";
      lockButton.addEventListener("click", async () => {
        await window.duties.setLocked(duty.id, !duty.locked);
        await refresh();
      });
      cardHeader.appendChild(lockButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon btn-danger";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete duty";
      deleteButton.style.marginLeft = "auto";
      deleteButton.addEventListener("click", async () => {
        await window.duties.delete(duty.id);
        if (activeDutyId === duty.id) activeDutyId = null;
        await refresh();
      });
      cardHeader.appendChild(deleteButton);

      card.appendChild(cardHeader);

      const badges = dutyRouteBadges(duty);
      if (!expanded) {
        const badgeRow = document.createElement("div");
        badgeRow.style.display = "flex";
        badgeRow.style.flexWrap = "wrap";
        badgeRow.style.gap = "4px";
        if (badges.length === 0) {
          const empty = document.createElement("span");
          empty.className = "label-muted";
          empty.style.fontSize = "12px";
          empty.textContent = "No journeys yet";
          badgeRow.appendChild(empty);
        }
        for (const badge of badges) {
          const chip = document.createElement("span");
          chip.textContent = badge.number;
          chip.style.fontSize = "11px";
          chip.style.fontWeight = "600";
          chip.style.padding = "1px 6px";
          chip.style.borderRadius = "10px";
          chip.style.background = badge.colour;
          chip.style.color = readableTextColour(badge.colour);
          badgeRow.appendChild(chip);
        }
        card.appendChild(badgeRow);
        continue;
      }

      // Expanded: full detail — rename field, pull-out, every piece with
      // its dead run, pull-in.
      const numberInput = document.createElement("input");
      numberInput.className = "field";
      numberInput.value = duty.dutyNumber;
      numberInput.style.width = "90px";
      numberInput.style.marginBottom = "6px";
      numberInput.addEventListener("change", async () => {
        await window.duties.rename(duty.id, numberInput.value);
        await refresh();
      });
      card.appendChild(numberInput);

      if (duty.pieces.length === 0) {
        const empty = document.createElement("div");
        empty.className = "label-muted";
        empty.textContent = "No journeys yet — click a journey on the left to add it.";
        card.appendChild(empty);
      }

      const depot = depotById(duty.depotId);
      const addDeadRunRow = (text: string): void => {
        const row = document.createElement("div");
        row.className = "label-muted";
        row.style.fontStyle = "italic";
        row.style.fontSize = "12px";
        row.textContent = text;
        card.appendChild(row);
      };

      let prevJourney: Journey | null = null;
      const firstJourney = dutyFirstJourney(duty);
      if (depot && firstJourney) {
        const pullOut = deadRun(router, { lon: depot.lon, lat: depot.lat }, firstJourney.startPoint);
        if (pullOut && pullOut.distanceM > 1) addDeadRunRow(`\u{1F3E0} ${depot.name} → pull-out: ${(pullOut.distanceM / 1000).toFixed(1)}km`);
      }

      for (const piece of duty.pieces) {
        const journey = journeys.find((j) => j.routeId === piece.routeId && j.departureMinutes === piece.departureMinutes);
        if (journey && prevJourney) {
          const dr = deadRun(router, prevJourney.endPoint, journey.startPoint);
          if (dr && dr.distanceM > 1) addDeadRunRow(`  dead run: ${(dr.distanceM / 1000).toFixed(1)}km`);
        }

        const pieceRow = document.createElement("div");
        pieceRow.style.display = "flex";
        pieceRow.style.alignItems = "center";
        pieceRow.style.gap = "6px";
        pieceRow.style.fontSize = "12px";
        pieceRow.style.padding = "2px 0";

        if (journey) {
          const swatch = document.createElement("span");
          swatch.style.width = "10px";
          swatch.style.height = "10px";
          swatch.style.borderRadius = "2px";
          swatch.style.background = journey.routeColour;
          swatch.style.flexShrink = "0";
          pieceRow.appendChild(swatch);
        }

        const label = document.createElement("span");
        label.style.flex = "1";
        label.textContent = journey ? journeyLabel(journey) : `(route ${piece.routeId} — journey no longer published)`;
        pieceRow.appendChild(label);

        const removeButton = document.createElement("button");
        removeButton.className = "btn btn-icon";
        removeButton.textContent = "×";
        removeButton.title = "Remove from this duty";
        removeButton.addEventListener("click", async () => {
          await window.duties.removePiece(piece.id);
          await refresh();
        });
        pieceRow.appendChild(removeButton);

        card.appendChild(pieceRow);
        if (journey) prevJourney = journey;
      }

      const lastJourney = dutyLastJourney(duty);
      if (depot && lastJourney) {
        const pullIn = deadRun(router, lastJourney.endPoint, { lon: depot.lon, lat: depot.lat });
        if (pullIn && pullIn.distanceM > 1) addDeadRunRow(`pull-in → \u{1F3E0} ${depot.name}: ${(pullIn.distanceM / 1000).toFixed(1)}km`);
      }
    }

    // Pass 2: append everything in plain flow first — a freshly-created,
    // un-positioned element's real height can't be read before it's
    // actually in the document and laid out — then immediately switch
    // each one to absolute positioning computed from real per-column
    // heights tracked as we go (the standard masonry/Pinterest-style
    // greedy placement: a span-1 card goes in whichever single column is
    // currently shortest; the expanded span-3 card goes wherever the
    // worst of its 3 columns is shortest, then raises all 3 to match). A
    // section header breaks the pack: it always starts its own full-width
    // row, and every column height resets to its own bottom edge
    // afterward, which is what keeps one depot's duties from interleaving
    // with another's despite the free-form packing.
    for (const { el } of blocks) dutiesColumn.appendChild(el);

    // A normal collapsed card's own real height, as the "row" unit the
    // expanded card's own height snaps to (below) — measured once, real,
    // not assumed, since it depends on live content (route badges can
    // wrap to a second line).
    const collapsedHeight = blocks.find((b) => !b.isHeader && b.span === 1)?.el.getBoundingClientRect().height ?? 0;
    const rowUnit = collapsedHeight + MASONRY_GAP;

    const colHeights = new Array(numCols).fill(0);
    for (const { el, span, isHeader } of blocks) {
      let height = el.getBoundingClientRect().height;
      // The expanded card's own bottom edge always snaps down to the next
      // row boundary — extended to reach it, never shortened below its
      // own real content (a live user clarification, 2026-10-18: "always
      // extended, never shortened") — so whatever duty comes next in its
      // own column lines up with its neighbours in other columns rather
      // than starting partway through a row.
      if (!isHeader && span > 1 && rowUnit > 0) {
        const rows = Math.ceil((height + MASONRY_GAP) / rowUnit);
        height = rows * rowUnit - MASONRY_GAP;
        // The snapped figure above was only ever used for the column-
        // height bookkeeping below, never applied to the box itself — it
        // kept the right amount of space clear, but the box stayed its
        // own shorter natural height inside that space, leaving a real
        // visible gap under its own content (a live user report,
        // 2026-10-18: "the box should extend to fill that gap"). Setting
        // its own height explicitly is what actually closes it.
        el.style.height = `${height}px`;
      }
      if (isHeader) {
        const top = Math.max(...colHeights);
        el.style.position = "absolute";
        el.style.left = "0px";
        el.style.top = `${top}px`;
        el.style.width = `${containerWidth}px`;
        colHeights.fill(top + height + MASONRY_GAP);
        continue;
      }
      let bestStart = 0;
      let bestTop = Infinity;
      for (let start = 0; start <= numCols - span; start++) {
        const top = Math.max(...colHeights.slice(start, start + span));
        if (top < bestTop) {
          bestTop = top;
          bestStart = start;
        }
      }
      el.style.position = "absolute";
      el.style.left = `${bestStart * (colWidth + MASONRY_GAP)}px`;
      el.style.top = `${bestTop}px`;
      el.style.width = `${colWidth * span + MASONRY_GAP * (span - 1)}px`;
      for (let c = bestStart; c < bestStart + span; c++) colHeights[c] = bestTop + height + MASONRY_GAP;
    }

    // A 0-size "sizer" at the bottom, not an explicit height on
    // dutiesColumn itself — setting the container's own height to match
    // its content exactly was a real bug (2026-10-18, live user report:
    // "I can't scroll down"): it defeats the point of its own
    // `overflow-y: auto`, since there's nothing left to overflow *within
    // a box already sized to fit everything*, so the box just grows past
    // its flex-constrained parent instead with no scrollbar anywhere.
    // dutiesColumn needs to keep its normal flex-driven (viewport-bounded)
    // height so real overflow exists for it to scroll; an absolutely
    // positioned descendant with nothing but a bottom coordinate is enough
    // on its own to extend the scrollable area down to meet it.
    const sizer = document.createElement("div");
    sizer.style.position = "absolute";
    sizer.style.top = `${Math.max(...colHeights)}px`;
    sizer.style.left = "0px";
    sizer.style.width = "1px";
    sizer.style.height = "1px";
    dutiesColumn.appendChild(sizer);
  };

  function dutyFirstJourney(duty: Duty): Journey | null {
    if (duty.pieces.length === 0) return null;
    const first = duty.pieces[0];
    return journeys.find((j) => j.routeId === first.routeId && j.departureMinutes === first.departureMinutes) ?? null;
  }

  const renderJourneys = (): void => {
    journeysColumn.innerHTML = "";
    const assigned = assignedKeys();
    const activeDuty = duties.find((d) => d.id === activeDutyId) ?? null;
    const activeLast = activeDuty ? dutyLastJourney(activeDuty) : null;

    for (const journey of journeys) {
      const key = journeyKey(journey.routeId, journey.departureMinutes);
      if (assigned.has(key)) continue;

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "4px 6px";
      row.style.borderBottom = "1px solid var(--border)";

      const canAdd = !!activeDuty && !activeDuty.locked && (!activeLast || !!canFollow(router, activeLast, journey));
      row.style.cursor = canAdd ? "pointer" : "default";
      row.style.opacity = activeDuty && !canAdd ? "0.4" : "1";

      const swatch = document.createElement("span");
      swatch.style.width = "10px";
      swatch.style.height = "10px";
      swatch.style.borderRadius = "2px";
      swatch.style.background = journey.routeColour;
      swatch.style.flexShrink = "0";
      row.appendChild(swatch);

      const label = document.createElement("span");
      label.style.flex = "1";
      label.style.fontSize = "13px";
      label.textContent = journeyLabel(journey);
      row.appendChild(label);

      if (canAdd) {
        row.addEventListener("click", async () => {
          if (!activeDuty) return;
          await window.duties.addPiece(activeDuty.id, journey.routeId, journey.departureMinutes);
          await refresh();
        });
      }

      journeysColumn.appendChild(row);
    }
  };

  const refreshDepotDropdown = (): void => {
    depotDropdownContainer.innerHTML = "";
    if (depots.length === 0) {
      selectedDepotId = null;
      return;
    }
    if (selectedDepotId === null || !depots.some((d) => d.id === selectedDepotId)) selectedDepotId = depots[0].id;
    const selected = depots.find((d) => d.id === selectedDepotId) ?? depots[0];
    depotDropdown = createDropdown(
      depots.map((d) => d.name),
      selected.name,
      (name) => {
        const chosen = depots.find((d) => d.name === name);
        if (chosen) selectedDepotId = chosen.id;
      },
    );
    depotDropdownContainer.appendChild(depotDropdown.el);
  };

  const refresh = async (): Promise<void> => {
    if (depotGroupId === null) return;
    title.textContent = `Duties — ${depotGroupName}`;
    for (const [dt, btn] of dayTypeButtons) btn.classList.toggle("is-active", dt === dayType);

    const [allDepots, fetchedRoutes, timetables, fetchedDuties] = await Promise.all([
      window.depots.list(),
      window.routes.list(),
      window.routeTimetables.listAll(),
      window.duties.listForDepotGroup(depotGroupId, dayType),
    ]);
    depots = allDepots.filter((d) => d.depotGroupId === depotGroupId).sort((a, b) => a.id - b.id);
    routes = fetchedRoutes;
    journeys = journeysForDepotGroup(fetchedRoutes, timetables, depotGroupId, dayType);
    duties = fetchedDuties;
    if (activeDutyId !== null && !duties.some((d) => d.id === activeDutyId)) activeDutyId = null;

    noDepotsNotice.style.display = depots.length === 0 ? "block" : "none";
    newDutyButton.disabled = depots.length === 0;
    autoCompleteButton.disabled = depots.length === 0;

    refreshDepotDropdown();
    renderDuties();
    renderJourneys();
  };

  newDutyButton.addEventListener("click", async () => {
    if (depotGroupId === null || selectedDepotId === null || busy) return;
    const created = await window.duties.create(depotGroupId, selectedDepotId, dayType);
    activeDutyId = created.id;
    await refresh();
  });

  // Greedy lowest-total-dead-mileage assignment (OPERATIONS.md §7's own
  // "optimising for lowest cost to run"; "cost" = dead mileage for this
  // vehicle-only increment, decided with the user 2026-10-17). Processes
  // every unassigned journey in time order, extending whichever open
  // (unlocked) duty can legally reach it for the least dead mileage. For a
  // brand new duty, the cost is the real pull-out dead run from that
  // duty's own depot (not assumed zero) — and when nothing open fits, a
  // new duty is started at whichever depot in the group gives the
  // cheapest pull-out to this journey's own start, not always the
  // currently-selected one. A same-route return journey sharing its
  // outbound's exact arrival point still wins this comparison outright
  // (zero cost beats anything above zero), which is what gives
  // OPERATIONS.md's "return journeys are always chained automatically"
  // without needing a separate special-cased pass.
  autoCompleteButton.addEventListener("click", async () => {
    if (depotGroupId === null || busy || depots.length === 0) return;
    busy = true;
    autoCompleteButton.disabled = true;
    try {
      // Most routes reuse the same handful of termini across every one of
      // their own departures (e.g. every 398 starts from the same stop),
      // so the same (depot, point) or (point, point) dead run gets asked
      // for over and over across a big journey list — a real measured
      // slowdown (2026-10-17: 280s for ~130 journeys against 2 depots,
      // against 7.7s for 452 journeys before depot-awareness was added).
      // Memoised per run, not shared across runs, since a run's own
      // mutations (new duties, moving pieces) never change what a given
      // pair of points costs to drive between.
      const pointKey = (p: { lon: number; lat: number }) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
      const deadRunCache = new Map<string, { distanceM: number; timeS: number } | null>();
      const cachedDeadRun = (from: { lon: number; lat: number }, to: { lon: number; lat: number }) => {
        const key = `${pointKey(from)}|${pointKey(to)}`;
        const hit = deadRunCache.get(key);
        if (hit !== undefined) return hit;
        const result = deadRun(router, from, to);
        deadRunCache.set(key, result);
        return result;
      };
      const cachedCanFollow = (last: Journey, next: Journey) => {
        if (next.startClockMinutes < last.endClockMinutes) return null;
        const dr = cachedDeadRun(last.endPoint, next.startPoint);
        if (!dr) return null;
        if (last.endClockMinutes + dr.timeS / 60 + MIN_LAYOVER_MINUTES > next.startClockMinutes) return null;
        return dr;
      };

      const assigned = assignedKeys();
      const unassigned = journeys.filter((j) => !assigned.has(journeyKey(j.routeId, j.departureMinutes)));
      const open = duties
        .filter((d) => !d.locked)
        .map((d) => ({ id: d.id, depotId: d.depotId, lastJourney: dutyLastJourney(d) }));

      for (const journey of unassigned) {
        let best: { kind: "existing"; dutyId: number; costM: number } | { kind: "new"; depotId: number; costM: number } | null = null;

        for (const duty of open) {
          if (duty.lastJourney === null) {
            const depot = depotById(duty.depotId);
            const pullOut = depot ? cachedDeadRun({ lon: depot.lon, lat: depot.lat }, journey.startPoint) : null;
            if (!pullOut) continue;
            if (!best || pullOut.distanceM < best.costM) best = { kind: "existing", dutyId: duty.id, costM: pullOut.distanceM };
            continue;
          }
          const dr = cachedCanFollow(duty.lastJourney, journey);
          if (!dr) continue;
          if (!best || dr.distanceM < best.costM) best = { kind: "existing", dutyId: duty.id, costM: dr.distanceM };
        }

        for (const depot of depots) {
          const pullOut = cachedDeadRun({ lon: depot.lon, lat: depot.lat }, journey.startPoint);
          if (!pullOut) continue;
          if (!best || pullOut.distanceM < best.costM) best = { kind: "new", depotId: depot.id, costM: pullOut.distanceM };
        }

        if (!best) continue; // no depot/duty can legally reach this journey at all — leave it unassigned rather than guess

        let targetId: number;
        if (best.kind === "existing") {
          targetId = best.dutyId;
        } else {
          const created = await window.duties.create(depotGroupId, best.depotId, dayType);
          open.push({ id: created.id, depotId: best.depotId, lastJourney: null });
          targetId = created.id;
        }
        await window.duties.addPiece(targetId, journey.routeId, journey.departureMinutes);
        const target = open.find((d) => d.id === targetId);
        if (target) target.lastJourney = journey;
      }
      await refresh();
    } finally {
      busy = false;
      autoCompleteButton.disabled = depots.length === 0;
    }
  });

  dutyPanelState.openForDepotGroup = (id, name) => {
    depotGroupId = id;
    depotGroupName = name;
    activeDutyId = null;
    overlay.style.display = "flex";
    void refresh();
  };
}
