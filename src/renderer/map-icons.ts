// Small runtime-drawn icons for the basemap style (one-way arrows, road
// shield badges). Generated on a canvas and registered via map.addImage
// rather than a prebuilt sprite sheet — there are only two of them, and
// this avoids a whole sprite build step for something this small.
import * as maplibregl from "maplibre-gl";

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

const ONEWAY_ARROW_SIZE = 16;

function drawArrow(color: string): ImageData {
  const size = ONEWAY_ARROW_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(2, 3);
  ctx.lineTo(size - 2, size / 2);
  ctx.lineTo(2, size - 3);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function registerOnewayArrow(map: maplibregl.Map): void {
  map.addImage("oneway-arrow", drawArrow("#333333"));
}

// A route's own chevrons (route-panel.ts's saved-route-preview, showing
// direction of running against that route's own colour) need to read against
// whatever colour the route is, unlike the fixed dark grey road one-ways
// above — so both a black and white variant are pre-registered, picked
// between via icon-contrast.ts's contrast check, the same pattern
// support-vehicle-icons.ts already uses for its own icons.
export function onewayArrowImageId(color: "black" | "white"): string {
  return `oneway-arrow-${color}`;
}

function registerOnewayArrowContrastVariants(map: maplibregl.Map): void {
  map.addImage(onewayArrowImageId("black"), drawArrow("#000000"));
  map.addImage(onewayArrowImageId("white"), drawArrow("#ffffff"));
}

function registerShieldBadge(map: maplibregl.Map): void {
  const width = 20;
  const height = 14;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#3b3b3b";
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, 0.75, 0.75, width - 1.5, height - 1.5, 3);
  ctx.fill();
  ctx.stroke();
  map.addImage("shield-badge", ctx.getImageData(0, 0, width, height));
}

export function registerMapIcons(map: maplibregl.Map): void {
  registerOnewayArrow(map);
  registerOnewayArrowContrastVariants(map);
  registerShieldBadge(map);
}
