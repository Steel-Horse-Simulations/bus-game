// Buy menu shell (the user's own buy-menu spec, 2026-10-18): a full-sized
// overlay with tabs along the top — Catalogue | Used | Basket (count) |
// Deliveries — replacing the old small corner vehicle-catalogue-panel.ts.
// Configure (the per-model buy screen) isn't its own tab; it's reached by
// clicking a Catalogue row, matching the spec's own screen list.
import { type VehicleModel } from "./vehicle-catalogue.mts";
import { renderCatalogueScreen, type CatalogueFilters } from "./vehicle-buy-catalogue-screen";
import { renderConfigureScreen } from "./vehicle-buy-configure-screen";
import { renderBasketScreen } from "./vehicle-buy-basket-screen";
import { renderUsedScreen } from "./vehicle-buy-used-screen";
import { renderDeliveriesScreen } from "./vehicle-buy-deliveries-screen";
import { BOTTOM_BAR_CLEARANCE_PX } from "./bottom-bar";

type Tab = "catalogue" | "used" | "basket" | "deliveries";

export function mountVehicleBuyMenu(): void {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Vehicles";
  toggle.style.position = "absolute";
  toggle.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX}px`;
  toggle.style.left = "330px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const overlay = document.createElement("div");
  overlay.className = "panel";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.borderRadius = "0";
  overlay.style.zIndex = "1000";
  overlay.style.display = "none";
  overlay.style.flexDirection = "column";
  document.body.appendChild(overlay);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "16px";
  overlay.appendChild(header);

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = "Vehicles";
  header.appendChild(title);

  const tabBar = document.createElement("div");
  tabBar.style.display = "flex";
  tabBar.style.gap = "6px";
  header.appendChild(tabBar);

  const closeButton = document.createElement("button");
  closeButton.className = "btn btn-icon";
  closeButton.style.marginLeft = "auto";
  closeButton.textContent = "×";
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.overflow = "hidden";
  overlay.appendChild(body);

  let activeTab: Tab = "catalogue";
  let configuringVehicle: VehicleModel | null = null;
  let catalogueFilters: CatalogueFilters = { category: null, power: null, manufacturer: null };

  let depotGroups: DepotGroup[] = [];
  let depots: Depot[] = [];
  let liveries: Livery[] = [];
  let ownedVehicles: Vehicle[] = [];
  let basketItems: BasketItem[] = [];
  let orders: VehicleOrder[] = [];

  async function fetchAll(): Promise<void> {
    [depotGroups, depots, liveries, basketItems, orders] = await Promise.all([
      window.depotGroups.list(),
      window.depots.list(),
      window.liveries.list(),
      window.basket.list(),
      window.orders.list(),
    ]);
    const perGroup = await Promise.all(depotGroups.map((g) => window.vehicles.listForDepotGroup(g.id)));
    ownedVehicles = perGroup.flat();
  }

  function renderTabs(): void {
    tabBar.innerHTML = "";
    const tabs: { key: Tab; label: string }[] = [
      { key: "catalogue", label: "Catalogue" },
      { key: "used", label: "Used" },
      { key: "basket", label: `Basket (${basketItems.reduce((n, i) => n + i.quantity, 0)})` },
      { key: "deliveries", label: "Deliveries" },
    ];
    for (const tab of tabs) {
      const button = document.createElement("button");
      button.className = "btn";
      button.classList.toggle("is-active", activeTab === tab.key && configuringVehicle === null);
      button.textContent = tab.label;
      button.addEventListener("click", () => {
        activeTab = tab.key;
        configuringVehicle = null;
        void renderActive();
      });
      tabBar.appendChild(button);
    }
  }

  async function renderActive(): Promise<void> {
    await fetchAll();
    renderTabs();

    if (activeTab === "catalogue" && configuringVehicle) {
      renderConfigureScreen(body, configuringVehicle, {
        depotGroups,
        depots,
        liveries,
        onAddedToBasket: () => {
          configuringVehicle = null;
          activeTab = "basket";
          void renderActive();
        },
        onBack: () => {
          configuringVehicle = null;
          void renderActive();
        },
      });
      return;
    }

    if (activeTab === "catalogue") {
      renderCatalogueScreen(body, catalogueFilters, (f) => {
        catalogueFilters = f;
        void renderActive();
      }, (vehicle) => {
        configuringVehicle = vehicle;
        void renderActive();
      });
      return;
    }

    if (activeTab === "used") {
      renderUsedScreen(body, {
        depotGroups,
        depots,
        onAddedToBasket: () => {
          activeTab = "basket";
          void renderActive();
        },
      });
      return;
    }

    if (activeTab === "basket") {
      renderBasketScreen(body, basketItems, {
        depotGroups,
        depots,
        liveries,
        onChanged: () => void renderActive(),
        onOrderPlaced: () => {
          activeTab = "deliveries";
          void renderActive();
        },
      });
      return;
    }

    if (activeTab === "deliveries") {
      renderDeliveriesScreen(body, orders, {
        depotGroups,
        depots,
        ownedVehicles,
        onChanged: () => void renderActive(),
      });
      return;
    }
  }

  let panelOpen = false;
  toggle.addEventListener("click", () => {
    panelOpen = !panelOpen;
    overlay.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) void renderActive();
  });
  closeButton.addEventListener("click", () => {
    panelOpen = false;
    overlay.style.display = "none";
    toggle.classList.remove("is-active");
  });
}
