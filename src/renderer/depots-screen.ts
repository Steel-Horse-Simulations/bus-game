// The Depots section of the bottom bar (bottom-bar.ts's own header
// comment: "Depots — depot placement + depot groups, as tabs on one
// screen") — T167, the same "get all menus working" conversion T162/T166
// already did for Fleet (fleet-screen.ts) and Fares (fares-screen.ts).
// Each of the two sub-screens already existed as its own independent
// floating tool with its own toggle button (depot-placement.ts's "Place
// depot" arm/disarm button plus draft panel, depot-groups-panel.ts's own
// management panel); this doesn't rebuild either of them, it just
// switches which one is active, reusing each module's own content
// wholesale via the shared open()/close() state each now exposes instead
// of its own removed toggle button.
import { placeDepotPanelState } from "./depot-placement";
import { depotGroupsPanelState } from "./depot-groups-panel";

type DepotsTab = "place" | "groups";

const TAB_LABELS: Record<DepotsTab, string> = {
  place: "Place depot",
  groups: "Depot groups",
};

export interface DepotsScreen {
  open(): void;
  close(): void;
}

export function mountDepotsScreen(): DepotsScreen {
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

  let activeTab: DepotsTab = "place";
  const buttons = new Map<DepotsTab, HTMLButtonElement>();

  const closeAll = (): void => {
    placeDepotPanelState.close?.();
    depotGroupsPanelState.close?.();
  };

  const openTab = (tab: DepotsTab): void => {
    activeTab = tab;
    for (const [t, btn] of buttons) btn.classList.toggle("is-active", t === tab);
    closeAll();
    if (tab === "place") placeDepotPanelState.open?.();
    else depotGroupsPanelState.open?.();
  };

  for (const tab of ["place", "groups"] as const) {
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
  closeButton.addEventListener("click", () => depotsScreen.close());
  tabBar.appendChild(closeButton);

  const depotsScreen: DepotsScreen = {
    open() {
      tabBar.style.display = "flex";
      openTab(activeTab);
    },
    close() {
      tabBar.style.display = "none";
      closeAll();
    },
  };
  return depotsScreen;
}
