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

export function liveryBadgeUrl(liveryName: string): string | null {
  return BADGE_URLS_BY_NAME[liveryName] ?? null;
}

export function hasLiveryBadge(liveryName: string): boolean {
  return liveryName in BADGE_URLS_BY_NAME;
}
