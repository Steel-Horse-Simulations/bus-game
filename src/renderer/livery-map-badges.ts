// Wires the real livery badge artwork (assets/liveries/, livery-badges.mts)
// into the map's moving vehicle markers — DESIGN.md §11 "Buses": "a small
// angled rectangle in a simplified two- or three-colour version of the
// vehicle's livery, carrying the route number."
//
// Placeholder scope (user request, 2026-11-05): "get the vehicle liveries
// working... for now they can just be randomly put on the buses that
// currently run routes then implemented properly when we get to the right
// stage." There is no concept yet of which real owned `vehicles` row runs
// which simulated journey (vehicle-simulation.ts shows one marker per
// generated departure, not per owned vehicle), so a real per-vehicle
// livery assignment isn't buildable yet — this picks a livery at random
// per (route, departure) pair instead, which is at least stable across
// refresh ticks (same journey always shows the same livery, not a new
// random pick every 30s) and at least plausible (reuses the real area/
// nation/vehicle-type lock rules already built for the buy menu, so Skye
// only ever shows Rapsons/D&E/Highland Council, a long-distance livery
// only shows on a genuinely long-distance route, etc.).
import * as maplibregl from "maplibre-gl";
import { liveryBadgeUrl, liveryBadgeNames, hasLiveryBadge } from "./livery-badges.mts";
import { liveryEligibleForRoute } from "./livery-seed-data.mts";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load livery badge image: ${src}`));
    img.src = src;
  });
}

export function liveryBadgeImageId(liveryName: string): string {
  return `livery-badge-${liveryName}`;
}

// Real bug report, 2026-11-14: rotating the badge's own artwork through the
// "upside-down" half of the compass (the same half vehicles-badge-number
// already clamps away from, for the same reason) made liveries read upside
// down for any vehicle heading roughly west. A real bus doesn't drive
// upside down when it turns around — the correct real-world picture is a
// horizontal mirror of the same side-on livery, not a vertical flip. No
// second badge asset is supplied for this (same art as the plain badge),
// so a horizontally-flipped variant is generated once at registration time
// via a canvas, not requested from the user as new art.
export function liveryBadgeMirroredImageId(liveryName: string): string {
  return `livery-badge-mirrored-${liveryName}`;
}

function horizontallyFlipped(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(img.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

// Registers every real badge PNG as a map image, keyed by liveryBadgeImageId,
// plus a horizontally-mirrored variant of each (liveryBadgeMirroredImageId)
// for the upside-down-avoidance fix above. Safe to call more than once —
// skips any id already registered, same pattern as registerSupportVehicleIcons.
export async function registerLiveryBadgeIcons(map: maplibregl.Map): Promise<void> {
  const names = liveryBadgeNames();
  const images = await Promise.all(names.map((name) => loadImage(liveryBadgeUrl(name)!)));
  names.forEach((name, i) => {
    const id = liveryBadgeImageId(name);
    if (!map.hasImage(id)) map.addImage(id, images[i]);
    const mirroredId = liveryBadgeMirroredImageId(name);
    if (!map.hasImage(mirroredId)) map.addImage(mirroredId, horizontallyFlipped(images[i]));
  });
}

// A simple deterministic string hash, used only to seed the pick below —
// this is a cosmetic placeholder, not anything needing real randomness
// quality, just stability (the same route+departure keeps the same livery
// across refresh ticks rather than flickering every 30s).
function seededUnitInterval(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Picks a plausible random livery for one simulated journey, or null if
// nothing in the save qualifies (falls back to the plain route-coloured
// circle). Filters out liveries with no real badge art, then defers every
// other rule (area/nation/depot-group/route-type/specific-route/
// sightseeing locks) to `liveryEligibleForRoute` — the exact same check
// route branding (T153) validates its own assigned livery against,
// extracted once rather than duplicated (CLAUDE.md: "build it once").
export function pickLiveryForJourney(
  route: Route,
  departureMinutes: number,
  liveries: Livery[],
  depotGroup: DepotGroup | undefined,
  // Airlink 100's own last-resort fallback (2026-11-15) — see
  // `airlinkLothianFallbackEligible`'s own doc comment (livery-seed-
  // data.mts) for the full reasoning. The caller computes this from the
  // real owned-vehicle list and real repaint/re-power away-bookings;
  // omitted (the default) means "don't apply it," same as passing
  // `false` — this function has no owned-vehicle/booking data of its
  // own to compute it from.
  airlinkLothianFallbackAvailable?: boolean,
): Livery | null {
  const candidates = liveries.filter(
    (l) => hasLiveryBadge(l.name) && liveryEligibleForRoute(l.name, route, depotGroup, airlinkLothianFallbackAvailable),
  );
  if (candidates.length === 0) return null;
  const index = Math.floor(seededUnitInterval(`${route.id}:${departureMinutes}`) * candidates.length);
  return candidates[index];
}
