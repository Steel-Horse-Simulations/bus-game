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
import {
  isLongDistanceLiveryName,
  longDistanceNationLockReason,
  liveryRestrictionForArea,
  isLocalOnlyLiveryName,
} from "./livery-seed-data.mts";

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

// Registers every real badge PNG as a map image, keyed by liveryBadgeImageId.
// Safe to call more than once — skips any id already registered, same
// pattern as registerSupportVehicleIcons.
export async function registerLiveryBadgeIcons(map: maplibregl.Map): Promise<void> {
  const names = liveryBadgeNames();
  const images = await Promise.all(names.map((name) => loadImage(liveryBadgeUrl(name)!)));
  names.forEach((name, i) => {
    const id = liveryBadgeImageId(name);
    if (!map.hasImage(id)) map.addImage(id, images[i]);
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
// circle). Filters out: liveries with no real badge art (only "Highland
// Council" as of 2026-11-05, livery-seed-data.mts), long-distance
// liveries on a non-long-distance route or outside their nation, a
// local-only livery on a long-distance route (added 2026-11-07 — unlike
// the Configure screen, this function already knows the real route's own
// `routeType`, so the exclusion is genuinely enforceable here, not just a
// UI note), and any livery an area restriction doesn't accept.
export function pickLiveryForJourney(
  route: Route,
  departureMinutes: number,
  liveries: Livery[],
  depotGroup: DepotGroup | undefined,
): Livery | null {
  const candidates = liveries.filter((l) => {
    if (!hasLiveryBadge(l.name)) return false;
    if (isLongDistanceLiveryName(l.name)) {
      if (route.routeType !== "long_distance") return false;
      if (depotGroup && longDistanceNationLockReason(l.name, depotGroup.region)) return false;
      return true;
    }
    if (isLocalOnlyLiveryName(l.name) && route.routeType === "long_distance") return false;
    if (depotGroup) {
      const restriction = liveryRestrictionForArea(depotGroup.name);
      if (restriction && !restriction.accepted.includes(l.name)) return false;
    }
    return true;
  });
  if (candidates.length === 0) return null;
  const index = Math.floor(seededUnitInterval(`${route.id}:${departureMinutes}`) * candidates.length);
  return candidates[index];
}
