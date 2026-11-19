// The Fares section of the bottom bar (bottom-bar.ts's own header comment:
// "Fares — fare zone drawing + fare pricing, as tabs on one screen") — T165,
// the same "get all menus working" conversion T162 already did for Fleet's
// three sub-screens (fleet-screen.ts). Each of the two sub-screens already
// existed as its own independent floating panel with its own toggle button
// (fare-zone-drawing.ts, fare-pricing-panel.ts); this doesn't rebuild either
// of them, it just switches which one is visible, reusing each module's own
// content wholesale via the shared open()/close() state each now exposes
// instead of its own removed toggle button.
import { fareZonePanelState } from "./fare-zone-drawing";
import { farePricingPanelState } from "./fare-pricing-panel";

type FaresTab = "zones" | "pricing";

const TAB_LABELS: Record<FaresTab, string> = {
  zones: "Zones",
  pricing: "Pricing",
};

export interface FaresScreen {
  open(): void;
  close(): void;
}

export function mountFaresScreen(): FaresScreen {
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

  let activeTab: FaresTab = "zones";
  const buttons = new Map<FaresTab, HTMLButtonElement>();

  const closeAll = (): void => {
    fareZonePanelState.close?.();
    farePricingPanelState.close?.();
  };

  const openTab = (tab: FaresTab): void => {
    activeTab = tab;
    for (const [t, btn] of buttons) btn.classList.toggle("is-active", t === tab);
    closeAll();
    if (tab === "zones") fareZonePanelState.open?.();
    else farePricingPanelState.open?.();
  };

  for (const tab of ["zones", "pricing"] as const) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = TAB_LABELS[tab];
    btn.addEventListener("click", () => openTab(tab));
    buttons.set(tab, btn);
    tabBar.appendChild(btn);
  }

  // The Pricing tab's own red-border "something's unset" warning — the
  // same signal fare-pricing-panel.ts's old standalone toggle button used
  // to carry directly on itself (DESIGN.md's own missing-field indicator).
  const pricingButton = buttons.get("pricing")!;
  farePricingPanelState.onMissingFieldsChanged = (anyMissing) => {
    pricingButton.style.border = anyMissing ? "2px solid #ef4444" : "";
  };

  const closeButton = document.createElement("button");
  closeButton.className = "btn btn-icon";
  closeButton.textContent = "×";
  closeButton.title = "Close";
  closeButton.addEventListener("click", () => faresScreen.close());
  tabBar.appendChild(closeButton);

  const faresScreen: FaresScreen = {
    open() {
      tabBar.style.display = "flex";
      openTab(activeTab);
    },
    close() {
      tabBar.style.display = "none";
      closeAll();
    },
  };
  return faresScreen;
}
