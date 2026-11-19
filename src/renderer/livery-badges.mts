// Loads every real livery badge PNG in assets/liveries/ as a build-time URL,
// keyed by the livery's own name (OPERATIONS.md §4: "Named by the livery's
// own name, not its numeric id... the renderer matches on name instead").
// A plain static import can't work here since the set of names isn't known
// until the folder is read — import.meta.glob is Vite's own mechanism for
// exactly this ("every file matching this pattern, bundled and URL'd").
// Mask files (`<name>-mask.png`) are deliberately excluded: OPERATIONS.md §4
// says masks aren't built yet, and even once they are, this module is only
// ever asked for the plain badge shown in the buy menu.
const badgeModules = import.meta.glob("../../assets/liveries/*.png", { eager: true, import: "default", query: "?url" }) as Record<string, string>;

const BADGE_URLS_BY_NAME: Record<string, string> = {};
for (const [path, url] of Object.entries(badgeModules)) {
  const filename = path.split("/").pop()!;
  if (filename.endsWith("-mask.png")) continue;
  const name = filename.slice(0, -4);
  BADGE_URLS_BY_NAME[name] = url;
}

// "Citylink/West Coast Motors" is the one real livery name with a literal
// slash in it, which can't be a filename — its real badge PNG is named
// with a dash in its place ("Citylink-West Coast Motors.png", confirmed
// directly against the real file). A targeted one-line fallback rather
// than a bigger id-based lookup system, since this is the only livery
// name that needs it: try the literal name first, then the slash->dash
// transform.
function withSlashDashFallback(liveryName: string): string {
  return liveryName.includes("/") ? liveryName.replace(/\//g, "-") : liveryName;
}

export function liveryBadgeUrl(liveryName: string): string | null {
  return BADGE_URLS_BY_NAME[liveryName] ?? BADGE_URLS_BY_NAME[withSlashDashFallback(liveryName)] ?? null;
}

export function hasLiveryBadge(liveryName: string): boolean {
  return liveryName in BADGE_URLS_BY_NAME || withSlashDashFallback(liveryName) in BADGE_URLS_BY_NAME;
}

// Every livery name with real badge art, for anything that needs to
// register every badge up front (e.g. livery-map-badges.ts) rather than
// look one up by name.
export function liveryBadgeNames(): string[] {
  return Object.keys(BADGE_URLS_BY_NAME);
}
