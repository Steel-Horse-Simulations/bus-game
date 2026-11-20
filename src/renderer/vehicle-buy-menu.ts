// Buy menu shell (the user's own buy-menu spec, 2026-10-18): a full-sized
// overlay with tabs along the top — Catalogue | Used | Basket (count) |
// Deliveries — replacing the old small corner vehicle-catalogue-panel.ts.
// Configure (the per-model buy screen) isn't its own tab; it's reached by
// clicking a Catalogue row, matching the spec's own screen list.
import { type VehicleModel } from "./vehicle-catalogue.mts";
import type { Router } from "./wasm/game_wasm.js";
import { renderCatalogueScreen, type CatalogueFilters } from "./vehicle-buy-catalogue-screen";
import { renderConfigureScreen } from "./vehicle-buy-configure-screen";
import { renderBasketScreen } from "./vehicle-buy-basket-screen";
import { renderUsedScreen } from "./vehicle-buy-used-screen";
import { renderDeliveriesScreen } from "./vehicle-buy-deliveries-screen";

type Tab = "catalogue" | "used" | "basket" | "deliveries";

// Shown/hidden by the Fleet section of the bottom bar (main-screen-
// navigation.ts), not its own floating toggle button any more (2026-11-08,
// live request: "get all menus working... instead of temporary ones").
export const vehicleBuyMenuState: { open: (() => void) | null; close: (() => void) | null } = {
  open: null,
  close: null,
};

// `router` (added for Q18/Q19, OPEN-ITEMS.md Q18+Q19 plan) threads through
// to the Configure screen's own vehicleRestrictionReason check — a vehicle
// being bought for a specific route needs the router to re-resolve that
// route's own real OSM maxweight/maxheight/maxlength/maxwidth limits
// (§B's getters), since a route stores no cached figure of its own.
export function mountVehicleBuyMenu(router: Router): void {
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
  // Added 2026-11-07, T153 — "buying for a specific route" needs the
  // real route list to populate its dropdown (filtered by depot group).
  let routes: Route[] = [];
  // T179 — the transfer row's "also re-power" checkbox needs to know
  // which dealer (if any) is the current re-power site for a vehicle's
  // own manufacturer, and the existing repaint/re-power bookings for the
  // shared "2 away at once" depot-group cap (workshop-booking.mts).
  let dealers: Dealer[] = [];
  let repaintBookings: RepaintBooking[] = [];
  let repowerBookings: RepowerBooking[] = [];
  // Only needed for the real island away-cap (2026-11-19, see
  // repower-booking-panel.ts's own identical comment).
  let fareZones: FareZone[] = [];
  // The one-way company_upgrades flag (user request 2026-11-20) — once
  // true, GreenRoad is forced on for every new purchase in the Configure
  // screen below.
  let hasAdoptedGreenroad = false;

  async function fetchAll(): Promise<void> {
    let companyUpgrades: CompanyUpgrades;
    [depotGroups, depots, liveries, basketItems, orders, routes, dealers, repaintBookings, repowerBookings, fareZones, companyUpgrades] = await Promise.all([
      window.depotGroups.list(),
      window.depots.list(),
      window.liveries.list(),
      window.basket.list(),
      window.orders.list(),
      window.routes.list(),
      window.dealers.list(),
      window.repaintBookings.listAll(),
      window.repowerBookings.listAll(),
      window.fareZones.listAll(),
      window.companyUpgrades.get(),
    ]);
    hasAdoptedGreenroad = companyUpgrades.hasAdoptedGreenroad;
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
        ownedVehicles,
        routes,
        router,
        hasAdoptedGreenroad,
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
        dealers,
        repaintBookings,
        repowerBookings,
        fareZones,
        onChanged: () => void renderActive(),
      });
      return;
    }
  }

  vehicleBuyMenuState.open = () => {
    overlay.style.display = "flex";
    void renderActive();
  };
  vehicleBuyMenuState.close = () => {
    overlay.style.display = "none";
  };
  closeButton.addEventListener("click", () => vehicleBuyMenuState.close?.());
}
