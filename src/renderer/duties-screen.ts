// The Duties section of the bottom bar (bottom-bar.ts's own header
// comment: "Duties — the duty panel, plus dead mileage preview as a
// tab") — T168, the same "get all menus working" conversion already done for
// Fleet/Fares/Depots (fleet-screen.ts/fares-screen.ts/depots-screen.ts).
// Unlike those three, duty-panel.ts's own full-screen tool
// (dutyPanelState.openForDepotGroup) isn't a co-equal pair of sub-panels
// to switch between — it's one pre-existing tool that needs a depot-group
// picker in front of it, since the bottom bar itself has no depot-group
// context of its own. A depot group with exactly one real candidate skips
// the picker outright (same "don't make the player click through a
// picker with one entry" reasoning as everywhere else this project
// degrades a picker to a direct action).
import { dutyPanelState } from "./duty-panel";
import { setMenuOpen } from "./menu-visibility";

export interface DutiesScreen {
  open(): void;
  close(): void;
}

export function mountDutiesScreen(): DutiesScreen {
  const picker = document.createElement("div");
  picker.className = "panel";
  picker.style.position = "fixed";
  picker.style.top = "8px";
  picker.style.left = "50%";
  picker.style.transform = "translateX(-50%)";
  picker.style.zIndex = "1001";
  picker.style.flexDirection = "row";
  picker.style.alignItems = "center";
  picker.style.gap = "6px";
  picker.style.padding = "6px";
  picker.style.display = "none";
  document.body.appendChild(picker);

  const closeButton = document.createElement("button");
  closeButton.className = "btn btn-icon";
  closeButton.textContent = "×";
  closeButton.title = "Close";
  closeButton.addEventListener("click", () => dutiesScreen.close());

  const hidePicker = (): void => {
    picker.style.display = "none";
  };

  const dutiesScreen: DutiesScreen = {
    open() {
      void (async () => {
        const groups = await window.depotGroups.list();
        setMenuOpen("duties-screen", true);

        if (groups.length === 0) {
          picker.innerHTML = "";
          const note = document.createElement("span");
          note.className = "label-muted";
          note.textContent = "Create a depot group first — duties belong to one.";
          picker.appendChild(note);
          picker.appendChild(closeButton);
          picker.style.display = "flex";
          return;
        }

        if (groups.length === 1) {
          hidePicker();
          dutyPanelState.openForDepotGroup?.(groups[0].id, groups[0].name);
          return;
        }

        // Rebuilt fresh on every open() — same throwaway-rebuild
        // convention duty-panel.ts's own renderDayTypeBar/renderDrivers
        // already use, rather than diffing against whatever was there
        // last time this screen was open.
        picker.innerHTML = "";
        const label = document.createElement("span");
        label.className = "label-muted";
        label.textContent = "Duties at:";
        picker.appendChild(label);
        for (const group of groups) {
          const btn = document.createElement("button");
          btn.className = "btn";
          btn.textContent = group.name;
          btn.addEventListener("click", () => {
            hidePicker();
            dutyPanelState.openForDepotGroup?.(group.id, group.name);
          });
          picker.appendChild(btn);
        }
        picker.appendChild(closeButton);
        picker.style.display = "flex";
      })();
    },
    close() {
      hidePicker();
      setMenuOpen("duties-screen", false);
      dutyPanelState.close?.();
    },
  };
  return dutiesScreen;
}
