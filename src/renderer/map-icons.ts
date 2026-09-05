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

function registerOnewayArrow(map: maplibregl.Map): void {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#333333";
  ctx.beginPath();
  ctx.moveTo(2, 3);
  ctx.lineTo(size - 2, size / 2);
  ctx.lineTo(2, size - 3);
  ctx.closePath();
  ctx.fill();
  map.addImage("oneway-arrow", ctx.getImageData(0, 0, size, size));
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
  registerShieldBadge(map);
}
