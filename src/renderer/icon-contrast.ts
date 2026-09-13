// Contrast colour picker shared by anything that tints a flat icon or badge
// against a variable background — support vehicle icons first, the route
// number badge system next. WCAG relative luminance
// (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance) and contrast ratio,
// picking whichever of pure black or pure white contrasts more against the
// sampled colour.
export type ContrastColor = "black" | "white";

function linearizeChannel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const BLACK_LUMINANCE = relativeLuminance(0, 0, 0);
const WHITE_LUMINANCE = relativeLuminance(255, 255, 255);

export function pickContrastColor(r: number, g: number, b: number): ContrastColor {
  const behind = relativeLuminance(r, g, b);
  const againstBlack = contrastRatio(behind, BLACK_LUMINANCE);
  const againstWhite = contrastRatio(behind, WHITE_LUMINANCE);
  return againstWhite >= againstBlack ? "white" : "black";
}
