// Main screen navigation (2026-11-01, live user request, worked out
// together rather than guessed): a single bottom bar for switching
// between the game's main screens, replacing the scattered individual
// on-screen toggles each of these currently has. Originally shipped as
// the visual shell only (icons, layout, single-select active state),
// deliberately deferred; wiring it up for real started 2026-11-08 (live
// request: "get all menus working... instead of temporary ones") — this
// file itself still only owns the icons/layout/active-state, same as
// before; which screen actually shows for each section is main.ts's own
// `onSelect` callback (fleet-screen.ts for Fleet, plain placeholders for
// Calendar/Finance so far). The game clock cluster on the left is, and
// always was, fully live (game-clock-engine.ts) regardless.
//
// The 9 sections and their shape were worked out together, not guessed:
// - Map — the default view.
// - Fleet — vehicle buying + liveries/repaint, as tabs on one screen.
//   Depot/dealer placement are deliberately NOT here: Dealers stays its
//   own separate temporary toggle (a one-time real-world data-entry
//   task, not a repeat gameplay feature); Depots got split out below.
// - Depots — depot placement + depot groups, as tabs on one screen.
// - Duties — the duty panel, plus dead mileage preview as a tab.
// - Fares — fare zone drawing + fare pricing, as tabs on one screen.
// - Routes — starts a new route (replaces the route list's own
//   "+ New route" button entirely, confirmed, not left as a second
//   path); long-distance section management (create/edit/rename a
//   section) also lives here, not under Timetables.
// - Timetables — shows the route list again, but picking a route here
//   jumps straight to its timetable instead of the normal edit view.
// - Calendar — placeholder, confirmed to do nothing until a real
//   calendar screen exists (the day-type Mon-Fri/Sat/Sun bar stays
//   exactly where it is until then, a separate temporary stand-in).
// - Finance — placeholder, confirmed to do nothing until Phase 5's
//   financial screen exists.
import { gameClockState, setPaused, setSpeedMultiplier } from "./game-clock-engine";
import { gameDateTimeFromSeconds, formatGameDate, formatGameTime, SPEED_MULTIPLIERS, type SpeedMultiplier } from "./game-clock.mts";
import { anyMenuOpen, setMenuOpen } from "./menu-visibility";

export type BottomBarSection = "map" | "fleet" | "depots" | "duties" | "fares" | "routes" | "timetables" | "calendar" | "finance";

interface BottomBarEntry {
  section: BottomBarSection;
  label: string;
  icon: string;
}

// Inline SVG, stroke-based, matching dropdown.ts's own CHEVRON_SVG
// convention (currentColor stroke so the icon follows the button's own
// text colour, including the is-active accent tint) — no icon font/sprite
// sheet exists in this project yet, so this stays consistent with the
// one other hand-drawn icon already in the codebase. Each one rendered
// standalone and visually checked before being wired in here, not
// trusted blind.
const ICON_MAP =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z"/><path d="M9 4v14M15 6v14"/></svg>';
// Modelled on a Volvo 7900's own low-floor city-bus shape: flat roof and
// square back on the left, sweeping into one continuously curved
// nose/windscreen on the right, a window belt line carried into the
// curve, wheels tucked mostly under the body line.
const ICON_FLEET =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15V9a2 2 0 0 1 2-2h9c3 0 6.5 1.5 7.5 4.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M3 11h11.5M18 8.3 15 11"/><path d="M7.5 7v4M12 7v4"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';
const ICON_DEPOTS =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9.5L12 4l8 5.5V20"/><path d="M4 20h16"/><rect x="9" y="13" width="6" height="7"/></svg>';
const ICON_DUTIES =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8 11h8M8 14h8M8 17h5"/></svg>';
const ICON_FARES =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a1.5 1.5 0 0 0 0 3v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a1.5 1.5 0 0 0 0-3Z"/><path d="M15 7v10" stroke-dasharray="2.5 2.5"/></svg>';
const ICON_ROUTES =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 17c4-1 4-9 8-10" stroke-dasharray="3 3"/></svg>';
const ICON_TIMETABLES =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 4v16M13 9v11M18 9v11"/></svg>';
const ICON_CALENDAR =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>';
const ICON_FINANCE =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V13M10 20V9M16 20V5M4 20h16"/></svg>';

const ENTRIES: BottomBarEntry[] = [
  { section: "map", label: "Map", icon: ICON_MAP },
  { section: "fleet", label: "Fleet", icon: ICON_FLEET },
  { section: "depots", label: "Depots", icon: ICON_DEPOTS },
  { section: "duties", label: "Duties", icon: ICON_DUTIES },
  { section: "fares", label: "Fares", icon: ICON_FARES },
  { section: "routes", label: "Routes", icon: ICON_ROUTES },
  { section: "timetables", label: "Timetables", icon: ICON_TIMETABLES },
  { section: "calendar", label: "Calendar", icon: ICON_CALENDAR },
  { section: "finance", label: "Finance", icon: ICON_FINANCE },
];

export interface BottomBar {
  readonly el: HTMLElement;
  get active(): BottomBarSection;
}

// The bar itself stays full viewport width, button group centred inside
// it (theme.css's .bottom-bar justify-content:center, .bottom-bar-item's
// fixed, not flex-grow, width). Each icon sits in a circle that sticks up
// slightly above the bar's own top edge (the bar's overflow is
// deliberately visible, not clipped, to allow this).
const BAR_HEIGHT_PX = 64;

// Exported so every scattered floating toggle button elsewhere (fare
// zones, fare pricing, vehicle buy menu, livery panel, depot/dealer
// placement, long-distance sections, repaint shops, hidden stops, place
// stop...) can sit its own `bottom` this far up instead of the old flat
// 8px, clearing the full-width bar and its icons' overhang. 64 (bar) + 20
// (circle overhang) + 12 (margin) = 96, a shared constant rather than
// each file guessing its own clearance.
export const BOTTOM_BAR_CLEARANCE_PX = 96;

// The game clock cluster (2026-11-01, live user request: "there should
// also be somewhere on the bottom for the time and date to show" / "there
// should be something to control time") — docked to the bar's own left
// edge via absolute positioning, so it doesn't fight the centred nav
// button group's own flex layout. Fully live, unlike the nav buttons
// themselves: pausing here really stops vehicle-simulation.ts's own
// animation (game-clock-engine.ts is the shared state both read).
function buildClockCluster(): HTMLElement {
  const cluster = document.createElement("div");
  cluster.className = "bottom-bar-clock";
  // Live report, 2026-11-01: "the date, its hidden behind the route list"
  // — this used to be a DOM child of `bar` itself, which caps it at the
  // bar's OWN z-index (3) no matter what z-index the clock element tries
  // to set on itself, since a descendant can never escape its own
  // stacking context's ceiling. route-panel.ts's list slot sits at
  // z-index 4 (confirmed above the bar on its own explicit request), so
  // it always painted over the clock. Appended straight to `document.body`
  // instead — a true sibling, not a descendant — with its own fixed
  // position replacing the old "centred inside the bar via top:50%"
  // trick, and a z-index above every panel this game currently has.
  cluster.style.position = "fixed";
  // Bottom-right (2026-11-08, live request) — was bottom-left; moved to
  // leave the left-hand route list's own corner clear.
  cluster.style.right = "16px";
  cluster.style.bottom = "0";
  cluster.style.height = `${BAR_HEIGHT_PX}px`;
  cluster.style.zIndex = "5";

  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "btn btn-icon";
  const PAUSE_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>';
  const PLAY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4Z"/></svg>';
  pauseButton.addEventListener("click", () => setPaused(!gameClockState.isPaused));

  const speedRow = document.createElement("div");
  speedRow.className = "bottom-bar-clock-speeds";
  const speedButtons = new Map<SpeedMultiplier, HTMLButtonElement>();
  for (const speed of SPEED_MULTIPLIERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-icon";
    btn.textContent = `${speed}x`;
    btn.addEventListener("click", () => setSpeedMultiplier(speed));
    speedButtons.set(speed, btn);
    speedRow.appendChild(btn);
  }

  const dateEl = document.createElement("div");
  dateEl.className = "bottom-bar-clock-date";
  const timeEl = document.createElement("div");
  timeEl.className = "bottom-bar-clock-time";
  const dateTimeCol = document.createElement("div");
  dateTimeCol.className = "bottom-bar-clock-datetime";
  dateTimeCol.append(dateEl, timeEl);

  cluster.append(pauseButton, speedRow, dateTimeCol);

  function render(): void {
    // Hidden whenever any floating panel/screen is open (menu-visibility.ts)
    // — live request, 2026-11-08: "the time controls shouldn't be open when
    // any menus are open." Checked every frame rather than only on
    // open/close events, since it's cheap and there's no single choke point
    // every panel's open/close already passes through.
    cluster.style.display = anyMenuOpen() ? "none" : "";
    pauseButton.innerHTML = gameClockState.isPaused ? PLAY_ICON : PAUSE_ICON;
    pauseButton.title = gameClockState.isPaused ? "Resume" : "Pause";
    for (const [speed, btn] of speedButtons) btn.classList.toggle("is-active", speed === gameClockState.speedMultiplier);
    const dt = gameDateTimeFromSeconds(gameClockState.accumulatedGameSeconds);
    dateEl.textContent = formatGameDate(dt);
    timeEl.textContent = formatGameTime(dt);
    requestAnimationFrame(render);
  }
  render();

  return cluster;
}

export function mountBottomBar(onSelect?: (section: BottomBarSection) => void): BottomBar {
  let active: BottomBarSection = "map";

  const bar = document.createElement("div");
  bar.className = "bottom-bar";
  bar.style.position = "fixed";
  bar.style.bottom = "0";
  bar.style.left = "0";
  bar.style.right = "0";
  bar.style.height = `${BAR_HEIGHT_PX}px`;
  bar.style.zIndex = "3";
  bar.style.display = "flex";

  document.body.appendChild(buildClockCluster());

  const buttons = new Map<BottomBarSection, HTMLButtonElement>();

  for (const entry of ENTRIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bottom-bar-item";
    btn.classList.toggle("is-active", entry.section === active);
    btn.innerHTML = `<span class="bottom-bar-circle">${entry.icon}</span><span>${entry.label}</span>`;
    btn.title = entry.label;
    btn.addEventListener("click", () => {
      if (entry.section === active) return;
      active = entry.section;
      for (const [s, b] of buttons) b.classList.toggle("is-active", s === active);
      setMenuOpen("bottom-bar-screen", active !== "map");
      onSelect?.(active);
    });
    buttons.set(entry.section, btn);
    bar.appendChild(btn);
  }

  document.body.appendChild(bar);

  return {
    el: bar,
    get active() {
      return active;
    },
  };
}
