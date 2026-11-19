// Custom colour picker — replaces native <input type="color"> everywhere
// in this game (live user request, 2026-11-08: the native picker's own
// Chromium-rendered popup can land on the wrong monitor or get clipped on
// a multi-monitor setup with mixed DPI scaling — not a config-flag fix,
// the same "OS-native popup chrome can't be controlled/restyled/
// positioned reliably" reasoning dropdown.ts already solved for a native
// <select>). Same trigger + portaled-popup architecture as dropdown.ts's
// own createDropdown — copied deliberately, not reinvented; see that
// file's own comments for why the popup portals to document.body on open
// (escapes an ancestor's overflow:hidden/transform stacking context) and
// back under the trigger's own parent on close (so it's still cleaned up
// automatically if the row/popup it belongs to is removed later).
//
// First shipped (T169) as a palette-grid-plus-hex-input popup, confirmed
// with the user at the time — but a live follow-up report, 2026-11-08,
// was blunt: "I want a proper colour picker for route colours like what I
// had, I didn't want what I now have." Rebuilt as a real saturation/value
// gradient square plus a hue slider, matching the native picker's own
// feel, while keeping the exact same portaled-popup shell (so the
// multi-monitor positioning fix this whole component exists for is still
// in effect) and the hex field (still the fastest way to enter an exact
// known value). Unlike the old grid (a discrete pick per swatch, closing
// the popup immediately), dragging the square/slider fires `onChange`
// continuously — the same live-preview feel the native picker's own
// `input` event gave every call site that relied on it (route-draw.ts's
// draft line, route-panel.ts's map preview) — and does NOT close the
// popup, since picking a colour here is a continuous adjustment, not a
// single discrete choice.
export interface ColourPicker {
  readonly el: HTMLElement;
  value: string;
  disabled: boolean;
}

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

// h in [0,360), s/v in [0,1].
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function createColourPicker(initial: string, onChange: (hex: string) => void): ColourPicker {
  let current = initial;
  let [hue, sat, val] = rgbToHsv(...hexToRgb(current));

  const root = document.createElement("div");
  root.className = "colour-picker";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "colour-picker-trigger swatch";
  trigger.style.background = current;
  root.appendChild(trigger);

  const popup = document.createElement("div");
  popup.className = "colour-picker-popup";
  popup.hidden = true;
  root.appendChild(popup);

  // Saturation (x, 0 left -> 1 right) / value (y, 1 top -> 0 bottom)
  // square for the currently selected hue — the classic two-layer-
  // gradient-over-a-solid-hue trick, not a canvas: white-to-transparent
  // left to right lays the saturation axis over the hue, black-to-
  // transparent bottom to top lays the value axis over that.
  const svBox = document.createElement("div");
  svBox.className = "colour-picker-sv";
  const svCursor = document.createElement("div");
  svCursor.className = "colour-picker-sv-cursor";
  svBox.appendChild(svCursor);
  popup.appendChild(svBox);

  const hueSlider = document.createElement("div");
  hueSlider.className = "colour-picker-hue";
  const hueCursor = document.createElement("div");
  hueCursor.className = "colour-picker-hue-cursor";
  hueSlider.appendChild(hueCursor);
  popup.appendChild(hueSlider);

  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "field colour-picker-hex";
  hexInput.placeholder = "#rrggbb";
  hexInput.value = current;
  popup.appendChild(hexInput);

  // Updates every visual (trigger swatch, SV box's own hue-tinted
  // background, both cursors, hex field) from the current hue/sat/val —
  // called after any of the three changes, from whichever source (drag,
  // typed hex, or an external `.value =` set).
  function syncVisuals(): void {
    svBox.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
    svCursor.style.left = `${sat * 100}%`;
    svCursor.style.top = `${(1 - val) * 100}%`;
    hueCursor.style.left = `${(hue / 360) * 100}%`;
    trigger.style.background = current;
    hexInput.value = current;
  }

  function commit(hex: string): void {
    current = hex;
    [hue, sat, val] = rgbToHsv(...hexToRgb(hex));
    syncVisuals();
    onChange(current);
  }

  // Recomputes the hex from the current hue/sat/val and commits — used by
  // the SV box/hue slider drags, which change one of the three without
  // already knowing the resulting hex the way a typed/preset value would.
  function commitFromHsv(): void {
    current = rgbToHex(...hsvToRgb(hue, sat, val));
    syncVisuals();
    onChange(current);
  }

  // Reverts to the last real value rather than passing garbage through —
  // same "ignore invalid input, don't crash" treatment the rest of this
  // codebase's own typed-number/time fields already use.
  const commitHexInput = (): void => {
    const normalized = normalizeHex(hexInput.value);
    if (normalized) commit(normalized);
    else hexInput.value = current;
  };
  hexInput.addEventListener("blur", commitHexInput);
  hexInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") hexInput.blur();
  });
  // Typing in the hex field, or dragging the square/slider, shouldn't
  // close the popup via the outside-click listener below — only the
  // trigger's own click (toggling open/closed) should.
  hexInput.addEventListener("click", (e) => e.stopPropagation());

  // Shared drag plumbing for both the SV box and the hue slider — pointer
  // capture so a fast drag past the element's own edge still tracks
  // correctly (clamped by `onMove` itself) rather than losing the pointer
  // the instant it leaves the element's bounds.
  function armDrag(el: HTMLElement, onMove: (e: PointerEvent) => void): void {
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      onMove(e);
      const onPointerMove = (ev: PointerEvent) => onMove(ev);
      const onPointerUp = () => {
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
      };
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
    });
  }

  armDrag(svBox, (e) => {
    const rect = svBox.getBoundingClientRect();
    sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    val = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    commitFromHsv();
  });
  armDrag(hueSlider, (e) => {
    const rect = hueSlider.getBoundingClientRect();
    hue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    commitFromHsv();
  });

  const onOutsideClick = (e: MouseEvent) => {
    if (!root.contains(e.target as Node) && !popup.contains(e.target as Node)) close();
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  function close(): void {
    popup.hidden = true;
    root.appendChild(popup);
    trigger.classList.remove("is-active");
    document.removeEventListener("mousedown", onOutsideClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  }

  function position(): void {
    document.body.appendChild(popup);
    const rect = trigger.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.minWidth = `${rect.width}px`;
    const popupHeight = popup.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < popupHeight + 4 && spaceAbove > spaceBelow;
    if (openUpward) {
      popup.style.top = "";
      popup.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      popup.style.bottom = "";
      popup.style.top = `${rect.bottom + 4}px`;
    }
  }

  function open(): void {
    syncVisuals();
    popup.hidden = false;
    position();
    trigger.classList.add("is-active");
    document.addEventListener("mousedown", onOutsideClick, true);
    document.addEventListener("keydown", onKeydown, true);
  }

  // Stops a click reaching whatever click handler the trigger's own
  // parent row has (route-panel.ts's own route row, which must NOT also
  // expand/collapse when the swatch is clicked) — safe to always do here,
  // since opening the picker is never something a parent row should react
  // to either.
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (popup.hidden) open();
    else close();
  });

  return {
    el: root,
    get value() {
      return current;
    },
    set value(v: string) {
      current = v;
      [hue, sat, val] = rgbToHsv(...hexToRgb(v));
      syncVisuals();
    },
    get disabled() {
      return trigger.disabled;
    },
    set disabled(d: boolean) {
      trigger.disabled = d;
    },
  };
}
