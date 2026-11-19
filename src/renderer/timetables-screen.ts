// The Timetables section of the bottom bar (bottom-bar.ts's own header
// comment: "Timetables — shows the route list again, but picking a route
// here jumps straight to its timetable instead of the normal edit view")
// — a single mode toggle on route-panel.ts's own always-visible list
// (routePanelState.setTimetablePickMode), not multiple sub-features, so a
// small banner rather than a tab bar like Fleet/Fares/Depots/Routes.
import { routePanelState } from "./route-panel";

export interface TimetablesScreen {
  open(): void;
  close(): void;
}

export function mountTimetablesScreen(): TimetablesScreen {
  const banner = document.createElement("div");
  banner.className = "panel";
  banner.style.position = "fixed";
  banner.style.top = "8px";
  banner.style.left = "50%";
  banner.style.transform = "translateX(-50%)";
  banner.style.zIndex = "1001";
  banner.style.flexDirection = "row";
  banner.style.alignItems = "center";
  banner.style.gap = "8px";
  banner.style.padding = "6px 10px";
  banner.style.display = "none";
  document.body.appendChild(banner);

  const label = document.createElement("span");
  label.textContent = "Timetable mode — click any route to open its timetable";
  banner.appendChild(label);

  const closeButton = document.createElement("button");
  closeButton.className = "btn btn-icon";
  closeButton.textContent = "×";
  closeButton.title = "Close";
  closeButton.addEventListener("click", () => timetablesScreen.close());
  banner.appendChild(closeButton);

  const timetablesScreen: TimetablesScreen = {
    open() {
      banner.style.display = "flex";
      routePanelState.setTimetablePickMode?.(true);
    },
    close() {
      banner.style.display = "none";
      routePanelState.setTimetablePickMode?.(false);
    },
  };
  return timetablesScreen;
}
