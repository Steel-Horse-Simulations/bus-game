// Shared renderer for a MergedGrid (route-timetable-grid.mts): a fixed,
// never-scrolling stop-name column beside a separately horizontally-
// scrolling times grid, with a route-colour header row when more than one
// route contributes a column. Originally built once for the full-screen
// timetable (stops-layer.ts) and then reused as-is for the side-panel
// family comparison (route-timetable-panel.ts) after user feedback that the
// two should look like the same UI, not two differently-styled versions of
// it — CLAUDE.md's "Place-the-ends-and-spread-the-rest": build a shared
// piece once, not per caller.
import type { MergedGrid } from "./route-timetable-grid.mts";
import { formatClockMinutes } from "./stop-calling-services.mts";
import { pickContrastColorForHex } from "./icon-contrast";

const ROW_HEIGHT_PX = 24;

// Real pixel width of the widest string in `texts`, at the grid's own font
// (12px, theme.css's --font stack) — gives the name column an explicit
// width rather than trusting auto column-width layout, which breaks once a
// sibling column starts scrolling (see the two-panel split below).
function measureMaxTextWidthPx(texts: readonly string[]): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 200; // Never actually null in a real browser; a sane fallback keeps this from throwing.
  ctx.font = '12px -apple-system, "Segoe UI", system-ui, sans-serif';
  const MEASUREMENT_SAFETY_MARGIN_PX = 8;
  return Math.ceil(Math.max(...texts.map((t) => ctx.measureText(t).width))) + MEASUREMENT_SAFETY_MARGIN_PX;
}

export function buildMergedGridTable(
  grid: MergedGrid,
  stopName: (osmId: number) => string,
  // A live user request: hide/un-hide buttons living in a separate flat
  // list of bare times were hard to match up with "the one I actually need
  // to remove" — moved to sit directly above each journey's own column
  // here instead, where the full stop-by-stop context makes it obvious
  // which journey is which. Optional and omitted entirely from the read-
  // only viewer (stops-layer.ts) — only the editable side panel
  // (route-timetable-panel.ts) passes it. Toggles the SAME
  // excludedDepartureMinutes state the flat list already does; behaviour
  // is otherwise identical, not a second mechanism.
  onToggleExclude?: (column: MergedGrid["columns"][number]) => void,
): HTMLElement {
  if (grid.columns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "label-muted";
    empty.style.padding = "0 16px 12px";
    empty.textContent = "This day type generates no journeys.";
    return empty;
  }

  // Two side-by-side panels, not one scrolling table with a sticky first
  // column — a real bug a user screenshot caught live traced back to the
  // sticky column still being part of the horizontally-scrolling content:
  // scroll far enough and an early time column's own (unstuck) position can
  // slide to a screen x left of the sticky column, which was never in its
  // way to begin with since sticky only blocks content that shares its own
  // screen position, not content that has scrolled past it. Taking the
  // stop-name column fully out of the scrolling content — a plain, never-
  // scrolled flex column beside a separately horizontally-scrolling time
  // grid — removes the whole class of edge case.
  const tableWrap = document.createElement("div");
  tableWrap.style.display = "flex";
  tableWrap.style.padding = "12px 16px";

  const stopNames = grid.rows.map((row) => stopName(row.osmId));
  const CELL_PADDING_PX = 14; // 4px + 10px, or 2×7px — matches every cell's own padding below.
  const stopColumnWidthPx = measureMaxTextWidthPx(stopNames) + CELL_PADDING_PX;
  // HHMM is always exactly 4 digits, "-" always 1 character — one
  // measurement covers every possible cell value in this column.
  const timeColumnWidthPx = measureMaxTextWidthPx(["0000", "-"]) + CELL_PADDING_PX;

  const namesColumn = document.createElement("div");
  namesColumn.style.flex = "none";
  namesColumn.style.width = `${stopColumnWidthPx}px`;

  const timesScroll = document.createElement("div");
  timesScroll.style.overflowX = "auto";
  timesScroll.style.flex = "1";
  timesScroll.style.minWidth = "0";
  // Snap horizontal scrolling to whole journey columns — a small polish,
  // not a correctness fix (that's the two-panel split above): settles on a
  // clean column boundary rather than an arbitrary mid-column stop.
  // "proximity" rather than "mandatory" so it still feels like free
  // scrolling.
  timesScroll.style.scrollSnapType = "x proximity";

  const timesGrid = document.createElement("div");
  timesGrid.style.display = "grid";
  timesGrid.style.gridTemplateColumns = `repeat(${grid.columns.length}, ${timeColumnWidthPx}px)`;
  timesGrid.style.width = "max-content";
  timesGrid.style.fontSize = "12px";

  // The hide/un-hide row — same grid-row precedent as the route-header row
  // just below, so it scrolls and aligns with the time columns for free.
  // Rendered above the route-header row (when both are present) since it's
  // the more frequently-used control.
  if (onToggleExclude) {
    const hideSpacer = document.createElement("div");
    hideSpacer.style.height = `${ROW_HEIGHT_PX}px`;
    hideSpacer.style.backgroundColor = "var(--bg-surface-1)";
    namesColumn.appendChild(hideSpacer);
    for (const column of grid.columns) {
      const hideCell = document.createElement("div");
      hideCell.style.height = `${ROW_HEIGHT_PX}px`;
      hideCell.style.display = "flex";
      hideCell.style.alignItems = "center";
      hideCell.style.justifyContent = "center";
      hideCell.style.backgroundColor = "var(--bg-surface-1)";
      hideCell.style.boxSizing = "border-box";
      hideCell.style.borderBottom = "1px solid var(--border)";
      const hideButton = document.createElement("button");
      hideButton.type = "button";
      hideButton.className = "btn btn-icon";
      hideButton.style.fontSize = "10px";
      hideButton.style.padding = "1px 6px";
      hideButton.style.lineHeight = "1.4";
      hideButton.textContent = column.excluded ? "Unhide" : "Hide";
      hideButton.title = column.excluded
        ? "Bring this journey back"
        : "Hide this journey (still visible with \"Show excluded services\" on)";
      hideButton.addEventListener("click", () => onToggleExclude(column));
      hideCell.appendChild(hideButton);
      timesGrid.appendChild(hideCell);
    }
  }

  // A route-header row — which service each column belongs to (colour
  // swatch + number) — only when more than one route actually contributes
  // a column here; a single route's own grid needs no reminder of which
  // route it is. Row 0 of the same grid/column structure as the stop rows
  // below (not a separate element pair), so it scrolls and aligns with the
  // time columns automatically rather than needing to stay in sync with a
  // second scroll container by hand.
  const showRouteHeader = new Set(grid.columns.map((c) => c.routeId)).size > 1;
  if (showRouteHeader) {
    const headerSpacer = document.createElement("div");
    headerSpacer.style.height = `${ROW_HEIGHT_PX}px`;
    headerSpacer.style.backgroundColor = "var(--bg-surface-1)";
    namesColumn.appendChild(headerSpacer);
    for (const column of grid.columns) {
      const headerCell = document.createElement("div");
      headerCell.style.height = `${ROW_HEIGHT_PX}px`;
      // Equal to the cell's own height, not shorter — a shorter line-height
      // leaves the leftover space at the bottom rather than splitting it
      // top/bottom, so the text sits high instead of centred.
      headerCell.style.lineHeight = `${ROW_HEIGHT_PX}px`;
      headerCell.style.textAlign = "center";
      headerCell.style.fontWeight = "700";
      headerCell.style.fontSize = "11px";
      // Route colour as the swatch, not the text colour — route colours are
      // chosen for map legibility against a light basemap, not against this
      // dark panel, so several of them read as barely-visible text here.
      headerCell.style.backgroundColor = column.routeColour;
      headerCell.style.color = pickContrastColorForHex(column.routeColour);
      headerCell.style.boxSizing = "border-box";
      headerCell.style.borderBottom = "1px solid var(--border)";
      headerCell.textContent = column.routeNumber;
      timesGrid.appendChild(headerCell);
    }
  }

  grid.rows.forEach((row, rowIndex) => {
    // Alternating row shading, same reason a printed timetable does it — a
    // long stop list is hard to track across a wide row of columns without
    // a visual anchor per line.
    const rowBackground = rowIndex % 2 === 1 ? "var(--bg-accent)" : "var(--bg-surface-2)";

    const stopCell = document.createElement("div");
    stopCell.textContent = stopNames[rowIndex];
    stopCell.style.height = `${ROW_HEIGHT_PX}px`;
    stopCell.style.lineHeight = `${ROW_HEIGHT_PX - 8}px`; // minus the 4px+4px vertical padding below.
    stopCell.style.backgroundColor = rowBackground;
    stopCell.style.fontSize = "12px";
    stopCell.style.textAlign = "left";
    stopCell.style.padding = "4px 10px 4px 4px";
    stopCell.style.boxSizing = "border-box";
    stopCell.style.whiteSpace = "nowrap";
    stopCell.style.overflow = "hidden";
    stopCell.style.textOverflow = "ellipsis";
    namesColumn.appendChild(stopCell);

    for (const column of grid.columns) {
      const timeCell = document.createElement("div");
      const value = column.times[rowIndex];
      // HHMM with no colon and a plain hyphen for a gap — matching the
      // reference timetable's own convention exactly, not the HH:MM/em-dash
      // style used elsewhere in this game's own UI.
      timeCell.textContent = value === null ? "-" : formatClockMinutes(value).replace(":", "");
      timeCell.style.height = `${ROW_HEIGHT_PX}px`;
      timeCell.style.lineHeight = `${ROW_HEIGHT_PX - 8}px`;
      timeCell.style.backgroundColor = rowBackground;
      timeCell.style.textAlign = "center";
      timeCell.style.padding = "4px 10px";
      timeCell.style.boxSizing = "border-box";
      timeCell.style.whiteSpace = "nowrap";
      timeCell.style.scrollSnapAlign = "start";
      // A "show excluded services" toggle (route-timetable-panel.ts /
      // stops-layer.ts) can ask for excluded journeys as real columns
      // instead of dropping them — struck-through and dimmed here so
      // they're visibly "doesn't actually run," not mistaken for a real
      // departure.
      if (column.excluded) {
        timeCell.style.textDecoration = "line-through";
        timeCell.style.opacity = "0.5";
      }
      timesGrid.appendChild(timeCell);
    }
  });

  timesScroll.appendChild(timesGrid);
  tableWrap.appendChild(namesColumn);
  tableWrap.appendChild(timesScroll);
  return tableWrap;
}
