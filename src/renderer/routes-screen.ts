// The Routes section of the bottom bar (bottom-bar.ts's own header
// comment: "Routes — starts a new route (replaces the route list's own
// '+ New route' button entirely...); long-distance section management...
// also lives here, not under Timetables") — same "get all menus working"
// conversion this session already did for Fleet/Fares/Depots, but with one
// real difference: "+ New route" isn't a toggleable panel of its own —
// route-panel.ts's drawing/choosing-type UI already lives in its own
// always-visible left-hand column, so clicking that tab is a one-shot
// action (routePanelState.startNewRoute), not something with independent
// open/closed state the way the other tab (long-distance sections) has.
import { routePanelState } from "./route-panel";
import { longDistanceSectionsPanelState } from "./long-distance-sections-panel";

type RoutesTab = "new-route" | "long-distance-sections";

const TAB_LABELS: Record<RoutesTab, string> = {
  "new-route": "+ New route",
  "long-distance-sections": "Long-distance sections",
};

export interface RoutesScreen {
  open(): void;
  close(): void;
}

export function mountRoutesScreen(): RoutesScreen {
  const tabBar = document.createElement("div");
  tabBar.className = "panel";
  tabBar.style.position = "fixed";
  tabBar.style.top = "8px";
  tabBar.style.left = "50%";
  tabBar.style.transform = "translateX(-50%)";
  tabBar.style.zIndex = "1001";
  tabBar.style.flexDirection = "row";
  tabBar.style.gap = "6px";
  tabBar.style.padding = "6px";
  tabBar.style.display = "none";
  document.body.appendChild(tabBar);

  let activeTab: RoutesTab = "new-route";
  const buttons = new Map<RoutesTab, HTMLButtonElement>();

  const openTab = (tab: RoutesTab): void => {
    activeTab = tab;
    for (const [t, btn] of buttons) btn.classList.toggle("is-active", t === tab);
    // Only the sections side has anything to close — "+ New route" isn't a
    // panel this screen owns the visibility of, see this file's own header
    // comment.
    longDistanceSectionsPanelState.close?.();
    if (tab === "new-route") routePanelState.startNewRoute?.();
    else longDistanceSectionsPanelState.open?.();
  };

  for (const tab of ["new-route", "long-distance-sections"] as const) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = TAB_LABELS[tab];
    btn.addEventListener("click", () => openTab(tab));
    buttons.set(tab, btn);
    tabBar.appendChild(btn);
  }

  const closeButton = document.createElement("button");
  closeButton.className = "btn btn-icon";
  closeButton.textContent = "×";
  closeButton.title = "Close";
  closeButton.addEventListener("click", () => routesScreen.close());
  tabBar.appendChild(closeButton);

  const routesScreen: RoutesScreen = {
    open() {
      tabBar.style.display = "flex";
      openTab(activeTab);
    },
    close() {
      tabBar.style.display = "none";
      // Deliberately does NOT reset route-panel.ts's own mode (e.g. an
      // in-progress draft draw) — that's existing, independent, always-on
      // behaviour; switching bottom-bar sections or hitting Map shouldn't
      // force-cancel a player's half-drawn route out from under them.
      longDistanceSectionsPanelState.close?.();
    },
  };
  return routesScreen;
}
