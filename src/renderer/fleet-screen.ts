// The Fleet section of the bottom bar (bottom-bar.ts's own header comment:
// "Fleet — vehicle buying + liveries/repaint, as tabs on one screen") —
// live request, 2026-11-08: "get all menus working... instead of temporary
// ones." Each of the three sub-screens already existed as its own
// independent full/floating panel with its own toggle button
// (vehicle-buy-menu.ts, livery-panel.ts, repaint-shop-panel.ts); this
// doesn't rebuild any of them, it just switches which one is visible,
// reusing each module's own content wholesale via the shared open()/close()
// state it now exposes instead of its own removed toggle button.
import { vehicleBuyMenuState } from "./vehicle-buy-menu";
import { liveryPanelState } from "./livery-panel";
import { repaintShopPanelState } from "./repaint-shop-panel";
import { repowerBookingPanelState } from "./repower-booking-panel";
import { fleetListPanelState } from "./fleet-list-panel";
import { gameClockState } from "./game-clock-engine";
import { repowerUnlocked } from "./repower-booking.mts";

// "myFleet" (T184, Q22/OPEN-ITEMS.md) is a new, separate tab from the
// existing "vehicles" buy-menu/catalogue tab — not a rename of it. The
// buy menu stays exactly as it is; this is the first screen that lists
// what's actually owned.
type FleetTab = "vehicles" | "myFleet" | "liveries" | "repaint" | "repower";

const TAB_LABELS: Record<FleetTab, string> = {
  vehicles: "Vehicles",
  myFleet: "My fleet",
  liveries: "Liveries",
  repaint: "Repaint shops",
  repower: "Re-power",
};

export interface FleetScreen {
  open(): void;
  close(): void;
}

export function mountFleetScreen(): FleetScreen {
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

  let activeTab: FleetTab = "vehicles";
  const buttons = new Map<FleetTab, HTMLButtonElement>();

  const closeAll = (): void => {
    vehicleBuyMenuState.close?.();
    fleetListPanelState.close?.();
    liveryPanelState.close?.();
    repaintShopPanelState.close?.();
    repowerBookingPanelState.close?.();
  };

  const openTab = (tab: FleetTab): void => {
    activeTab = tab;
    for (const [t, btn] of buttons) btn.classList.toggle("is-active", t === tab);
    closeAll();
    if (tab === "vehicles") vehicleBuyMenuState.open?.();
    else if (tab === "myFleet") fleetListPanelState.open?.();
    else if (tab === "liveries") liveryPanelState.open?.();
    else if (tab === "repaint") repaintShopPanelState.open?.();
    else repowerBookingPanelState.open?.();
  };

  for (const tab of ["vehicles", "myFleet", "liveries", "repaint", "repower"] as const) {
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
  closeButton.addEventListener("click", () => fleetScreen.close());
  tabBar.appendChild(closeButton);

  const fleetScreen: FleetScreen = {
    open() {
      tabBar.style.display = "flex";
      // Re-power's own tab only appears once unlocked (3 years in,
      // repowerUnlocked) — checked fresh on every open rather than once
      // at mount, since the game clock keeps advancing while this screen
      // stays closed.
      const repowerUnlockedNow = repowerUnlocked(gameClockState.accumulatedGameSeconds);
      const repowerButton = buttons.get("repower");
      if (repowerButton) repowerButton.style.display = repowerUnlockedNow ? "" : "none";
      if (activeTab === "repower" && !repowerUnlockedNow) activeTab = "vehicles";
      openTab(activeTab);
    },
    close() {
      tabBar.style.display = "none";
      closeAll();
    },
  };
  return fleetScreen;
}
