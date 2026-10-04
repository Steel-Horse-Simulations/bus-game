// Drives the bar and label in the #loading-overlay markup (index.html).
export function setLoadingProgress(fraction: number, label: string): void {
  const fill = document.getElementById("loading-bar-fill");
  const text = document.getElementById("loading-label");
  if (fill) fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  if (text) text.textContent = label;
}
