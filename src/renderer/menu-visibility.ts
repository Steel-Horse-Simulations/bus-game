// Shared "is any menu/panel open" signal (2026-11-08, live request: "the
// time controls shouldn't be open when any menus are open"). Every floating
// panel/screen that covers the map — the same set bottom-bar.ts's own
// BOTTOM_BAR_CLEARANCE_PX comment already enumerates (fare zones, fare
// pricing, vehicle buy menu, livery panel, depot/dealer placement,
// long-distance sections, repaint shops, hidden stops, place stop, route
// drawing, the timetable editor, and the bottom bar's own non-map screens)
// — calls setMenuOpen(id, true/false) as it opens/closes. Keyed by an
// arbitrary caller-chosen id (not a boolean) so two panels opening at once
// (e.g. a dropdown inside an already-open screen) don't clobber each
// other's close.
const openMenus = new Set<string>();

export function setMenuOpen(id: string, open: boolean): void {
  if (open) openMenus.add(id);
  else openMenus.delete(id);
}

export function anyMenuOpen(): boolean {
  return openMenus.size > 0;
}
