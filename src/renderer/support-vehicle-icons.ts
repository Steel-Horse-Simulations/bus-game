// Support vehicle icons (spanner, staff figure, recovery unit, parcel van) —
// DESIGN.md's "Support vehicles on the map". Delivered as plain white shape
// masks (assets/icons/*.png); this recolours each to flat black or white and
// registers both variants with the map so a badge layer can switch between
// them per-feature with a data expression, no per-frame canvas work.
//
// No support vehicle is simulated on the map yet (Phase 3/7), so there is
// nothing here to sample a real "behind" colour from or place a badge at —
// this is the reusable piece (contrast pick + tinted image registration) for
// whoever wires up the actual badge layer once support vehicles exist.
import * as maplibregl from "maplibre-gl";
import iconSpanner from "../../assets/icons/icon-spanner.png";
import iconPerson from "../../assets/icons/icon-person.png";
import iconRecovery from "../../assets/icons/icon-recovery.png";
import iconParcel from "../../assets/icons/icon-parcel.png";
import { pickContrastColor, type ContrastColor } from "./icon-contrast";

export type SupportVehicleIconKey = "spanner" | "person" | "recovery" | "parcel";

const ICON_SOURCES: Record<SupportVehicleIconKey, string> = {
  spanner: iconSpanner,
  person: iconPerson,
  recovery: iconRecovery,
  parcel: iconParcel,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load icon image: ${src}`));
    img.src = src;
  });
}

// Recolours a white-shape-on-transparent mask to a flat black or white,
// preserving the mask's alpha channel (and antialiasing) exactly.
function tintMask(image: HTMLImageElement, color: ContrastColor): ImageData {
  const { width, height } = image;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color === "black" ? "#000000" : "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export function supportIconImageId(key: SupportVehicleIconKey, color: ContrastColor): string {
  return `support-icon-${key}-${color}`;
}

// Registers a black and a white tinted variant of every support vehicle
// icon. Safe to call more than once (e.g. on a style reload) — skips any
// image id already registered.
export async function registerSupportVehicleIcons(map: maplibregl.Map): Promise<void> {
  const entries = Object.entries(ICON_SOURCES) as [SupportVehicleIconKey, string][];
  const images = await Promise.all(entries.map(([, src]) => loadImage(src)));
  entries.forEach(([key], i) => {
    const image = images[i];
    for (const color of ["black", "white"] as const) {
      const id = supportIconImageId(key, color);
      if (!map.hasImage(id)) {
        map.addImage(id, tintMask(image, color));
      }
    }
  });
}

// Picks which pre-registered variant a badge should show, given the colour
// sampled from directly behind its icon (its badge's own flat colour, once
// support vehicle badges exist). A manual override — set per icon by the
// player — always wins over the automatic pick.
export function pickSupportIconImage(
  key: SupportVehicleIconKey,
  behindColor: readonly [number, number, number],
  manualOverride?: ContrastColor | null,
): string {
  const [r, g, b] = behindColor;
  const color = manualOverride ?? pickContrastColor(r, g, b);
  return supportIconImageId(key, color);
}
