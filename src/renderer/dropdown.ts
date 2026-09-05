// Themed dropdown — replaces native <select>, whose open option list is
// OS-native chrome and can't be restyled to match the dark theme
// (theme.css). Exposes a `.value` getter/setter so call sites can treat it
// like a select.

export interface Dropdown {
  readonly el: HTMLElement;
  value: string;
}

const CHEVRON_SVG =
  '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

export function createDropdown(
  options: readonly string[],
  selected: string,
  onChange: (value: string) => void,
): Dropdown {
  let current = selected;

  const root = document.createElement("div");
  root.className = "dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "field dropdown-trigger";

  const label = document.createElement("span");
  label.className = "dropdown-trigger-label";
  label.textContent = current;

  const chevron = document.createElement("span");
  chevron.className = "dropdown-chevron";
  chevron.innerHTML = CHEVRON_SVG;

  trigger.appendChild(label);
  trigger.appendChild(chevron);
  root.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "dropdown-menu";
  menu.hidden = true;
  root.appendChild(menu);

  const onOutsideClick = (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  function close(): void {
    menu.hidden = true;
    trigger.classList.remove("is-active");
    document.removeEventListener("mousedown", onOutsideClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  }

  function renderMenu(): void {
    menu.innerHTML = "";
    for (const option of options) {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.textContent = option;
      if (option === current) item.classList.add("is-selected");
      item.addEventListener("click", () => {
        current = option;
        label.textContent = current;
        close();
        onChange(current);
      });
      menu.appendChild(item);
    }
  }

  function position(): void {
    // Fixed rather than absolute-in-parent: a dropdown can sit inside a
    // panel with `overflow: hidden` (for its rounded corners), which would
    // otherwise clip the open menu. `position: fixed` is computed from the
    // trigger's own viewport rect, so it escapes that clipping — the menu
    // stays a normal DOM child of `root` either way, so it's cleaned up
    // automatically whenever the row it belongs to is removed.
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.width = `${rect.width}px`;
  }

  function open(): void {
    renderMenu();
    position();
    menu.hidden = false;
    trigger.classList.add("is-active");
    document.addEventListener("mousedown", onOutsideClick, true);
    document.addEventListener("keydown", onKeydown, true);
  }

  trigger.addEventListener("click", () => {
    if (menu.hidden) open();
    else close();
  });

  return {
    el: root,
    get value() {
      return current;
    },
    set value(v: string) {
      current = v;
      label.textContent = v;
    },
  };
}
