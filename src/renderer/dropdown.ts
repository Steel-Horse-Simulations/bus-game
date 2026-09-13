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
    // While open, `menu` is portaled under document.body (see `position`),
    // so it's no longer a descendant of `root` — checking `root.contains`
    // alone treated every click inside the open menu as an outside click,
    // firing `close()` on mousedown before the item's own click handler (or
    // a scrollbar drag) ever got a chance to run.
    if (!root.contains(e.target as Node) && !menu.contains(e.target as Node)) close();
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  function close(): void {
    menu.hidden = true;
    // Move back under `root` so it's cleaned up automatically if the row
    // or popup it belongs to is removed later — see the portal comment in
    // `open`. Safe even mid-list-refresh since it only ever matters while
    // the menu is closed (hidden either way).
    root.appendChild(menu);
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
    // otherwise clip the open menu — `position: fixed` escapes that. But
    // fixed positioning is relative to the nearest ancestor with its own
    // `transform` (or filter/perspective/etc.), not always the viewport —
    // and a MapLibre popup positions itself with exactly such a transform,
    // which silently re-anchored the menu to the popup's own box and sent
    // it to nonsense coordinates. Portaling to `document.body` on open (and
    // back under `root` on close, so it's still cleaned up if the row or
    // popup goes away) sidesteps that regardless of what the dropdown is
    // nested inside.
    document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    // Never narrower than the trigger, but free to grow for long option
    // text (e.g. a bus station's name) rather than truncating it — capped
    // so it can't run off the right edge of the window.
    menu.style.minWidth = `${rect.width}px`;
    menu.style.width = "max-content";
    menu.style.maxWidth = `${Math.max(rect.width, window.innerWidth - rect.left - 16)}px`;

    // Flip above the trigger when there isn't room below — a trigger near
    // the bottom of the viewport (a popup low on screen, say) otherwise
    // opened a menu that ran off the bottom edge with no way to reach the
    // lower options. Measured with the menu already unhidden (see `open`)
    // so its real rendered height — capped by its own max-height — is
    // known, not guessed.
    const menuHeight = menu.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < menuHeight + 4 && spaceAbove > spaceBelow;
    if (openUpward) {
      menu.style.top = "";
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      menu.style.bottom = "";
      menu.style.top = `${rect.bottom + 4}px`;
    }
  }

  function open(): void {
    renderMenu();
    menu.hidden = false;
    position();
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
