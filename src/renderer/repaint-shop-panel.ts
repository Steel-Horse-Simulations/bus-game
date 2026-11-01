// Repaint shops (T63): place shops on the map, and set each shop's
// concurrent capacity (bays — how many vehicles it can work on at once)
// and turnaround time (working days per vehicle). Neither has a default —
// a shop needs real figures before it can be saved, since they come from
// the user (2026-11-01: "Ferrymill Motors can have 7 vehicles in its
// workshop at once... a full repaint at Ferrymill takes 5 days, Monday to
// Friday only" — replaced the old single "weekly capacity" figure
// entirely, see repaint_shops' own CREATE TABLE comment in db.mts).
//
// Entrances (2026-11-01, live user report: "Loughborough is a repaint
// shop but I have no way of adding an entrance to it") — exact mirror of
// dealer-placement.ts's own entrance management, except inline in this
// panel's existing per-shop row rather than a map popup, matching this
// panel's own established UI language (no map-popup precedent existed
// here before).
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import type { Router } from "./wasm/game_wasm.js";
import { createDropdown } from "./dropdown";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";
import { placeDepotState } from "./depot-placement";
import { placeDealerState } from "./dealer-placement";
import { ENTRANCE_MODE_LABELS, ENTRANCE_MODE_COLORS } from "./entrance-marker";
import { BOTTOM_BAR_CLEARANCE_PX } from "./bottom-bar";

const SOURCE_ID = "repaint-shops";
const LAYER_ID = "repaint-shops-circles";

function toGeojson(shops: RepaintShop[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: shops.map((s) => ({
      type: "Feature",
      properties: { id: s.id, name: s.name },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Real repaint shops, seeded directly into `repaint_shops` the same
// idempotent-by-name way seedRealDealers does for dealers (2026-11-01,
// live user data). Positions: Ferrymill decoded from its real Plus Code
// (WQVV+9W Torrance, Glasgow — recovered against Glasgow's own already-
// known reference point via the same validated Open Location Code
// decoder used for every dealer, landing ~13km north of it at Torrance,
// consistent with every other real decode in this project); Loughborough
// already had a decoded position from dealer-reference-pins.ts's own
// earlier "repaint" placeholder entry (never actually seeded there — see
// that file's own comment on why); ACE given as plain coordinates
// directly. Capacities: Ferrymill 7 concurrent / 5 working days, Loughborough
// the same (confirmed directly: "the same capacity rules as Ferrymill"),
// ACE 2 concurrent / 10 working days ("effectively 2 weeks").
interface RealRepaintShop {
  name: string;
  lon: number;
  lat: number;
  concurrentCapacity: number;
  turnaroundDays: number;
}

const REAL_REPAINT_SHOPS: RealRepaintShop[] = [
  { name: "Ferrymill Motors", lon: -4.205188, lat: 55.943438, concurrentCapacity: 7, turnaroundDays: 5 },
  { name: "Loughborough repaint/bodyshop", lon: -1.222997, lat: 52.778878, concurrentCapacity: 7, turnaroundDays: 5 },
  { name: "ACE Commercial Refinishers", lon: -2.650232, lat: 56.730237, concurrentCapacity: 2, turnaroundDays: 10 },
];

export async function seedRealRepaintShops(): Promise<void> {
  const existing = await window.repaintShops.list();
  const existingNames = new Set(existing.map((s) => s.name));
  for (const shop of REAL_REPAINT_SHOPS) {
    if (existingNames.has(shop.name)) continue;
    await window.repaintShops.create(shop.name, shop.lon, shop.lat, shop.concurrentCapacity, shop.turnaroundDays);
  }
}

export async function mountRepaintShops(map: maplibregl.Map, router: Router): Promise<void> {
  map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": 7,
      "circle-color": "#f59e0b",
      "circle-stroke-color": "#18181b",
      "circle-stroke-width": 2,
    },
  });
  map.addSource("repaint-shop-entrances", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "repaint-shop-entrances-points",
    type: "circle",
    source: "repaint-shop-entrances",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "mode"], "entry", ENTRANCE_MODE_COLORS.entry, "exit", ENTRANCE_MODE_COLORS.exit, ENTRANCE_MODE_COLORS.both],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Repaint shops";
  toggle.style.position = "absolute";
  toggle.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX}px`;
  toggle.style.left = "1150px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  panel.style.width = "340px";
  panel.style.maxHeight = "75vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Repaint shops";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let shops: RepaintShop[] = [];
  let entrancesByShop = new Map<number, RepaintShopEntrance[]>();
  let errorMessage = "";
  let placing = false;
  let pendingLngLat: maplibregl.LngLat | null = null;
  // The shop whose entrances are currently expanded in the panel (at most
  // one at a time, same "too many buttons at once" reasoning route-panel.ts
  // already settled on) — also controls which shop's entrances the map
  // layer above shows.
  let expandedShopId: number | null = null;
  // Set while "+ Add entrance" is armed on a shop, mirrors dealer-
  // placement.ts's own addEntranceForDealer exactly.
  let addEntranceForShop: RepaintShop | null = null;

  async function reload(): Promise<void> {
    shops = await window.repaintShops.list();
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(toGeojson(shops));
    const allEntrances = await window.repaintShops.listAllEntrances();
    entrancesByShop = new Map();
    for (const e of allEntrances) {
      const list = entrancesByShop.get(e.repaintShopId) ?? [];
      list.push(e);
      entrancesByShop.set(e.repaintShopId, list);
    }
    refreshEntrancesLayer();
  }

  function refreshEntrancesLayer(): void {
    const entrances = expandedShopId === null ? [] : (entrancesByShop.get(expandedShopId) ?? []);
    (map.getSource("repaint-shop-entrances") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: entrances.map((e) => ({ type: "Feature", properties: { mode: e.mode }, geometry: { type: "Point", coordinates: [e.lon, e.lat] } })),
    });
  }

  function showError(err: unknown): void {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  function render(): void {
    body.replaceChildren();

    if (shops.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No repaint shops placed yet.";
      body.appendChild(empty);
    }

    for (const shop of shops) {
      const row = document.createElement("div");
      row.style.borderBottom = "1px solid var(--border)";
      row.style.padding = "6px 0";

      const topRow = document.createElement("div");
      topRow.style.display = "flex";
      topRow.style.alignItems = "center";
      topRow.style.gap = "6px";

      const name = document.createElement("span");
      name.style.flex = "1";
      name.textContent = shop.name;
      topRow.appendChild(name);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        await window.repaintShops.delete(shop.id);
        errorMessage = "";
        if (expandedShopId === shop.id) expandedShopId = null;
        await reload();
        render();
      });
      topRow.appendChild(deleteButton);
      row.appendChild(topRow);

      const capacityRow = document.createElement("div");
      capacityRow.style.display = "flex";
      capacityRow.style.alignItems = "center";
      capacityRow.style.gap = "6px";
      capacityRow.style.marginTop = "4px";

      const concurrentInput = document.createElement("input");
      concurrentInput.type = "number";
      concurrentInput.min = "1";
      concurrentInput.step = "1";
      concurrentInput.value = String(shop.concurrentCapacity);
      concurrentInput.style.width = "48px";
      concurrentInput.title = "Concurrent capacity — how many vehicles the shop can work on at once";
      capacityRow.appendChild(concurrentInput);
      const atOnceLabel = document.createElement("span");
      atOnceLabel.style.color = "var(--text-muted)";
      atOnceLabel.textContent = "at once,";
      capacityRow.appendChild(atOnceLabel);

      const turnaroundInput = document.createElement("input");
      turnaroundInput.type = "number";
      turnaroundInput.min = "1";
      turnaroundInput.step = "1";
      turnaroundInput.value = String(shop.turnaroundDays);
      turnaroundInput.style.width = "48px";
      turnaroundInput.title = "Turnaround — working days per vehicle";
      capacityRow.appendChild(turnaroundInput);
      const daysLabel = document.createElement("span");
      daysLabel.style.color = "var(--text-muted)";
      daysLabel.textContent = "days each";
      capacityRow.appendChild(daysLabel);

      const setCapacityButton = document.createElement("button");
      setCapacityButton.className = "btn btn-icon";
      setCapacityButton.textContent = "Set";
      setCapacityButton.addEventListener("click", async () => {
        const concurrent = parsePositiveInt(concurrentInput.value);
        const turnaround = parsePositiveInt(turnaroundInput.value);
        if (concurrent === null || turnaround === null) {
          errorMessage = "Concurrent capacity and turnaround days must both be whole numbers above zero.";
          render();
          return;
        }
        try {
          await window.repaintShops.setConcurrentCapacity(shop.id, concurrent);
          await window.repaintShops.setTurnaroundDays(shop.id, turnaround);
          errorMessage = "";
          await reload();
        } catch (err) {
          showError(err);
        }
        render();
      });
      capacityRow.appendChild(setCapacityButton);
      row.appendChild(capacityRow);

      const entrances = entrancesByShop.get(shop.id) ?? [];
      const toggleEntrancesButton = document.createElement("button");
      toggleEntrancesButton.className = "btn btn-icon";
      toggleEntrancesButton.style.marginTop = "4px";
      toggleEntrancesButton.textContent = `${expandedShopId === shop.id ? "Hide" : "Show"} entrances (${entrances.length})`;
      toggleEntrancesButton.addEventListener("click", () => {
        expandedShopId = expandedShopId === shop.id ? null : shop.id;
        refreshEntrancesLayer();
        render();
      });
      row.appendChild(toggleEntrancesButton);

      if (expandedShopId === shop.id) {
        const entrancesSection = document.createElement("div");
        entrancesSection.style.marginTop = "4px";
        entrancesSection.style.paddingLeft = "8px";
        entrancesSection.style.borderLeft = "2px solid var(--border)";

        if (entrances.length === 0) {
          const none = document.createElement("div");
          none.style.color = "var(--text-muted)";
          none.textContent = "No entrances yet.";
          entrancesSection.appendChild(none);
        }
        for (const entrance of entrances) {
          const entranceRow = document.createElement("div");
          entranceRow.style.display = "flex";
          entranceRow.style.alignItems = "center";
          entranceRow.style.gap = "6px";
          entranceRow.style.marginTop = "4px";
          const modeDropdown = createDropdown(Object.values(ENTRANCE_MODE_LABELS), ENTRANCE_MODE_LABELS[entrance.mode], (chosenLabel) => {
            const mode = (Object.entries(ENTRANCE_MODE_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "both") as DealerEntranceMode;
            void window.repaintShops.setEntranceMode(entrance.id, mode).then(async () => {
              await reload();
              render();
            });
          });
          modeDropdown.el.style.flex = "1";
          entranceRow.appendChild(modeDropdown.el);

          const removeEntranceButton = document.createElement("button");
          removeEntranceButton.className = "btn btn-icon";
          removeEntranceButton.textContent = "Remove";
          removeEntranceButton.addEventListener("click", async () => {
            await window.repaintShops.deleteEntrance(entrance.id);
            await reload();
            render();
          });
          entranceRow.appendChild(removeEntranceButton);
          entrancesSection.appendChild(entranceRow);
        }

        const addEntranceButton = document.createElement("button");
        addEntranceButton.className = "btn";
        addEntranceButton.style.marginTop = "4px";
        addEntranceButton.textContent = "+ Add entrance";
        addEntranceButton.title = "Click a road near this shop to add an entrance";
        addEntranceButton.addEventListener("click", () => {
          addEntranceForShop = shop;
          map.getCanvas().style.cursor = "crosshair";
        });
        entrancesSection.appendChild(addEntranceButton);

        row.appendChild(entrancesSection);
      }

      body.appendChild(row);
    }

    const placeSection = document.createElement("div");
    placeSection.style.borderTop = "1px solid var(--border)";
    placeSection.style.marginTop = "8px";
    placeSection.style.paddingTop = "8px";

    if (pendingLngLat) {
      const form = document.createElement("div");
      const nameInput = document.createElement("input");
      nameInput.placeholder = "Shop name";
      nameInput.style.display = "block";
      nameInput.style.marginBottom = "4px";
      const concurrentInput = document.createElement("input");
      concurrentInput.type = "number";
      concurrentInput.min = "1";
      concurrentInput.step = "1";
      concurrentInput.placeholder = "Concurrent capacity (vehicles at once)";
      concurrentInput.style.display = "block";
      concurrentInput.style.marginBottom = "4px";
      const turnaroundInput = document.createElement("input");
      turnaroundInput.type = "number";
      turnaroundInput.min = "1";
      turnaroundInput.step = "1";
      turnaroundInput.placeholder = "Turnaround (working days per vehicle)";
      turnaroundInput.style.display = "block";
      turnaroundInput.style.marginBottom = "4px";
      const save = document.createElement("button");
      save.className = "btn";
      save.textContent = "Save shop";
      save.addEventListener("click", async () => {
        const concurrent = parsePositiveInt(concurrentInput.value);
        const turnaround = parsePositiveInt(turnaroundInput.value);
        const name = nameInput.value.trim();
        if (!name) {
          errorMessage = "Give the shop a name.";
          render();
          return;
        }
        if (concurrent === null || turnaround === null) {
          errorMessage = "Concurrent capacity and turnaround days must both be whole numbers above zero.";
          render();
          return;
        }
        try {
          await window.repaintShops.create(name, pendingLngLat!.lng, pendingLngLat!.lat, concurrent, turnaround);
          pendingLngLat = null;
          errorMessage = "";
          await reload();
        } catch (err) {
          showError(err);
        }
        render();
      });
      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        pendingLngLat = null;
        errorMessage = "";
        render();
      });
      form.append(nameInput, concurrentInput, turnaroundInput, save, cancel);
      placeSection.appendChild(form);
    } else {
      const place = document.createElement("button");
      place.className = "btn";
      place.textContent = placing ? "Cancel placing" : "Place repaint shop";
      place.addEventListener("click", () => {
        placing = !placing;
        errorMessage = "";
        render();
      });
      placeSection.appendChild(place);
      if (placing) {
        const hint = document.createElement("div");
        hint.style.color = "var(--text-muted)";
        hint.style.marginTop = "4px";
        hint.textContent = "Click the map where the shop is.";
        placeSection.appendChild(hint);
      }
    }
    body.appendChild(placeSection);

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "6px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  map.on("click", (e) => {
    if (!placing || pendingLngLat) return;
    placing = false;
    pendingLngLat = e.lngLat;
    errorMessage = "";
    panel.style.display = "flex";
    toggle.classList.add("is-active");
    render();
  });

  // "Add entrance" on an already-existing shop — exact mirror of
  // dealer-placement.ts's own identical handler.
  map.on("click", (e) => {
    if (!addEntranceForShop || placing || routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing || placeDealerState.isPlacing) return;
    const shop = addEntranceForShop;
    addEntranceForShop = null;
    map.getCanvas().style.cursor = "";
    const snapped = router.snap_entrance_to_junction(e.lngLat.lng, e.lngLat.lat);
    if (snapped.length !== 2) return;
    void window.repaintShops.addEntrance(shop.id, snapped[0], snapped[1], "both").then(async () => {
      await reload();
      render();
    });
  });

  let panelOpen = false;
  toggle.addEventListener("click", async () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) {
      await reload();
      render();
    }
  });

  await reload();
}
