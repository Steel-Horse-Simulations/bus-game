// Dealer placement and entrances (T62, OPEN-ITEMS.md — CLAUDE.md's Phase 9
// "dealer network," placed now so the real UK-EXPANSION.md §2 locations
// aren't lost before Phase 9's buying/collection logistics exist).
// Deliberately permanent (confirmed directly with the user, unlike T55's
// one-off Portree bypass): "I think the code should be left in for this
// one so I can add more in future if I need to." Exact mirror of
// depot-placement.ts's own site+entrances mechanic, except a dealer has
// no owning depot group (confirmed directly: any depot group can buy from
// any dealer) and carries a fixed manufacturer field instead (confirmed
// directly: Phase 9's nearest-depot collection rule is manufacturer-
// specific for Wrightbus/Yutong, so this needs to be real and queryable
// now rather than inferred from a name string later).
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import type { Router } from "./wasm/game_wasm.js";
import { createDropdown } from "./dropdown";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";
import { placeDepotState } from "./depot-placement";
import { ENTRANCE_MODE_LABELS, ENTRANCE_MODE_COLORS } from "./entrance-marker";

export const placeDealerState = { isPlacing: false };

const emptyGeojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const MANUFACTURER_LABELS: Record<DealerManufacturer, string> = {
  volvo: "Volvo",
  adl: "Alexander Dennis",
  western_commercial: "Western Commercial",
  wrightbus: "Wrightbus",
  yutong: "Yutong",
};

interface DraftEntrance {
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

export async function mountDealerPlacement(map: maplibregl.Map, router: Router): Promise<void> {
  let dealers = await window.dealers.list();
  let entrancesByDealer = new Map<number, DealerEntrance[]>();
  // Set while "Add entrance" is armed on an already-existing dealer (as
  // opposed to placeDealerState, which is for placing a brand-new dealer)
  // — mirrors depot-placement.ts's own addEntranceForDepot exactly.
  let addEntranceForDealer: Dealer | null = null;

  const refreshEntranceIndex = async (): Promise<void> => {
    const all = await window.dealers.listAllEntrances();
    entrancesByDealer = new Map();
    for (const e of all) {
      const list = entrancesByDealer.get(e.dealerId) ?? [];
      list.push(e);
      entrancesByDealer.set(e.dealerId, list);
    }
  };
  await refreshEntranceIndex();

  map.addSource("dealers", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "dealers-points",
    type: "circle",
    source: "dealers",
    minzoom: 9,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 17, 10],
      // Violet — distinct from the depot site marker's amber.
      "circle-color": "#8b5cf6",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "dealers-labels",
    type: "symbol",
    source: "dealers",
    minzoom: 11,
    layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.3], "text-allow-overlap": false },
    paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 },
  });

  // Entrances/exits are plain dots, coloured by mode, shown only for
  // whichever dealer's own popup is currently open — see
  // depot-placement.ts's own identical `showEntrancesForDepot`/
  // `hideEntrances` comment for why (a live user request).
  map.addSource("dealer-entrances", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "dealer-entrances-points",
    type: "circle",
    source: "dealer-entrances",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "mode"], "entry", ENTRANCE_MODE_COLORS.entry, "exit", ENTRANCE_MODE_COLORS.exit, ENTRANCE_MODE_COLORS.both],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  const showEntrancesForDealer = (dealer: Dealer): void => {
    const entrances = entrancesByDealer.get(dealer.id) ?? [];
    (map.getSource("dealer-entrances") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: entrances.map((e) => ({ type: "Feature", properties: { mode: e.mode }, geometry: { type: "Point", coordinates: [e.lon, e.lat] } })),
    });
  };
  const hideEntrances = (): void => {
    (map.getSource("dealer-entrances") as maplibregl.GeoJSONSource).setData(emptyGeojson);
  };

  map.addSource("dealer-draft-site", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "dealer-draft-site",
    type: "circle",
    source: "dealer-draft-site",
    paint: { "circle-radius": 10, "circle-color": "#8b5cf6", "circle-opacity": 0.6, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
  map.addSource("dealer-draft-entrances", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "dealer-draft-entrances",
    type: "circle",
    source: "dealer-draft-entrances",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "mode"], "entry", ENTRANCE_MODE_COLORS.entry, "exit", ENTRANCE_MODE_COLORS.exit, ENTRANCE_MODE_COLORS.both],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  const refreshDealersSource = (): void => {
    (map.getSource("dealers") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: dealers.map((d) => ({ type: "Feature", properties: { dealerId: d.id, name: d.name, manufacturer: d.manufacturer }, geometry: { type: "Point", coordinates: [d.lon, d.lat] } })),
    });
  };
  refreshDealersSource();

  // --- Placement toggle + draft panel ---
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Place dealer";
  toggle.style.position = "absolute";
  toggle.style.bottom = "8px";
  toggle.style.left = "560px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const draftPanel = document.createElement("div");
  draftPanel.className = "panel";
  draftPanel.style.position = "absolute";
  draftPanel.style.bottom = "44px";
  draftPanel.style.left = "560px";
  draftPanel.style.zIndex = "2";
  draftPanel.style.width = "300px";
  draftPanel.style.padding = "10px";
  draftPanel.style.display = "none";
  draftPanel.style.flexDirection = "column";
  draftPanel.style.gap = "6px";
  document.body.appendChild(draftPanel);

  let draftSite: { lon: number; lat: number } | null = null;
  let draftEntrances: DraftEntrance[] = [];
  let draftName = "";
  let draftManufacturer: DealerManufacturer = "volvo";
  let saveButtonRef: HTMLButtonElement | null = null;
  const updateSaveDisabled = (): void => {
    if (saveButtonRef) saveButtonRef.disabled = draftName.trim() === "" || draftEntrances.length === 0;
  };

  const resetDraft = (): void => {
    draftSite = null;
    draftEntrances = [];
    draftName = "";
    draftManufacturer = "volvo";
    saveButtonRef = null;
    (map.getSource("dealer-draft-site") as maplibregl.GeoJSONSource).setData(emptyGeojson);
    (map.getSource("dealer-draft-entrances") as maplibregl.GeoJSONSource).setData(emptyGeojson);
  };

  const refreshDraftSources = (): void => {
    (map.getSource("dealer-draft-site") as maplibregl.GeoJSONSource).setData(
      draftSite
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [draftSite.lon, draftSite.lat] } }] }
        : emptyGeojson,
    );
    (map.getSource("dealer-draft-entrances") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: draftEntrances.map((e) => ({ type: "Feature", properties: { mode: e.mode }, geometry: { type: "Point", coordinates: [e.lon, e.lat] } })),
    });
  };

  function renderDraftPanel(): void {
    draftPanel.innerHTML = "";
    if (!draftSite) {
      draftPanel.style.display = "none";
      return;
    }
    draftPanel.style.display = "flex";

    const header = document.createElement("div");
    header.style.fontWeight = "600";
    header.textContent = "New dealer";
    draftPanel.appendChild(header);

    const nameInput = document.createElement("input");
    nameInput.className = "field";
    nameInput.placeholder = "Dealer name";
    nameInput.value = draftName;
    nameInput.addEventListener("input", () => {
      draftName = nameInput.value;
      updateSaveDisabled();
    });
    draftPanel.appendChild(nameInput);

    const manufacturerDropdown = createDropdown(
      Object.values(MANUFACTURER_LABELS),
      MANUFACTURER_LABELS[draftManufacturer],
      (chosenLabel) => {
        draftManufacturer = (Object.entries(MANUFACTURER_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "volvo") as DealerManufacturer;
      },
    );
    draftPanel.appendChild(manufacturerDropdown.el);

    const entrancesLabel = document.createElement("div");
    entrancesLabel.style.color = "var(--text-muted)";
    entrancesLabel.textContent =
      draftEntrances.length === 0 ? "Click nearby roads to add entrances." : `${draftEntrances.length} entrance${draftEntrances.length === 1 ? "" : "s"} — click more roads to add another.`;
    draftPanel.appendChild(entrancesLabel);

    for (const [i, entrance] of draftEntrances.entries()) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";

      const modeDropdown = createDropdown(Object.values(ENTRANCE_MODE_LABELS), ENTRANCE_MODE_LABELS[entrance.mode], (chosenLabel) => {
        const mode = (Object.entries(ENTRANCE_MODE_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "both") as DealerEntranceMode;
        draftEntrances[i] = { ...entrance, mode };
        refreshDraftSources();
      });
      modeDropdown.el.style.flex = "1";
      row.appendChild(modeDropdown.el);

      const removeButton = document.createElement("button");
      removeButton.className = "btn btn-icon";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        draftEntrances.splice(i, 1);
        refreshDraftSources();
        renderDraftPanel();
      });
      row.appendChild(removeButton);

      draftPanel.appendChild(row);
    }

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "6px";
    actionRow.style.marginTop = "4px";

    const cancelButton = document.createElement("button");
    cancelButton.className = "btn";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      resetDraft();
      renderDraftPanel();
    });
    actionRow.appendChild(cancelButton);

    const saveButton = document.createElement("button");
    saveButton.className = "btn";
    saveButton.textContent = "Save";
    saveButtonRef = saveButton;
    updateSaveDisabled();
    saveButton.addEventListener("click", () => {
      void (async () => {
        if (!draftSite) return;
        const { dealer, entrances } = await window.dealers.create(
          draftName.trim(),
          draftManufacturer,
          draftSite.lon,
          draftSite.lat,
          draftEntrances.map((e) => ({ lon: e.lon, lat: e.lat, mode: e.mode })),
        );
        dealers = [...dealers, dealer];
        entrancesByDealer.set(dealer.id, entrances);
        refreshDealersSource();
        resetDraft();
        placeDealerState.isPlacing = false;
        toggle.classList.remove("is-active");
        renderDraftPanel();
      })();
    });
    actionRow.appendChild(saveButton);

    draftPanel.appendChild(actionRow);
  }

  toggle.addEventListener("click", () => {
    placeDealerState.isPlacing = !placeDealerState.isPlacing;
    toggle.classList.toggle("is-active", placeDealerState.isPlacing);
    if (!placeDealerState.isPlacing) {
      resetDraft();
      renderDraftPanel();
    }
  });

  map.on("click", (e) => {
    if (!placeDealerState.isPlacing || routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing) return;
    if (!draftSite) {
      // Same `snap_to_any_road` as depot-placement.ts — a dealer's own
      // forecourt access is often a private road too.
      const snappedSite = router.snap_to_any_road(e.lngLat.lng, e.lngLat.lat);
      draftSite = snappedSite.length === 2 ? { lon: snappedSite[0], lat: snappedSite[1] } : { lon: e.lngLat.lng, lat: e.lngLat.lat };
      refreshDraftSources();
      renderDraftPanel();
      return;
    }
    // Junction snapping is routing-only now, not a visual aid — see
    // depot-placement.ts's own identical comment on this click handler.
    const snapped = router.snap_entrance_to_junction(e.lngLat.lng, e.lngLat.lat);
    if (snapped.length !== 2) return;
    draftEntrances.push({ lon: snapped[0], lat: snapped[1], mode: "both" });
    refreshDraftSources();
    renderDraftPanel();
  });

  // "Add entrance" on an already-existing dealer.
  map.on("click", (e) => {
    if (!addEntranceForDealer || placeDealerState.isPlacing || routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing) return;
    const dealer = addEntranceForDealer;
    addEntranceForDealer = null;
    map.getCanvas().style.cursor = "";
    const snapped = router.snap_entrance_to_junction(e.lngLat.lng, e.lngLat.lat);
    if (snapped.length !== 2) return;
    void window.dealers.addEntrance(dealer.id, snapped[0], snapped[1], "both").then(async () => {
      await refreshEntranceIndex();
      openDealerPopup(dealer);
    });
  });

  // --- Existing-dealer popup: manufacturer, manage entrances, delete ---
  let dealerPopup: maplibregl.Popup | null = null;

  const openDealerPopup = (dealer: Dealer): void => {
    dealerPopup?.remove();
    showEntrancesForDealer(dealer);
    const container = document.createElement("div");
    container.style.minWidth = "220px";

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.justifyContent = "space-between";
    titleRow.style.alignItems = "center";
    titleRow.style.marginBottom = "6px";
    const title = document.createElement("span");
    title.style.fontWeight = "600";
    title.textContent = dealer.name;
    titleRow.appendChild(title);
    container.appendChild(titleRow);

    const manufacturerDropdown = createDropdown(Object.values(MANUFACTURER_LABELS), MANUFACTURER_LABELS[dealer.manufacturer], (chosenLabel) => {
      const manufacturer = (Object.entries(MANUFACTURER_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "volvo") as DealerManufacturer;
      void window.dealers.setManufacturer(dealer.id, manufacturer).then(() => {
        dealers = dealers.map((d) => (d.id === dealer.id ? { ...d, manufacturer } : d));
      });
    });
    container.appendChild(manufacturerDropdown.el);

    const entrances = entrancesByDealer.get(dealer.id) ?? [];
    const entrancesLabel = document.createElement("div");
    entrancesLabel.style.color = "var(--text-muted)";
    entrancesLabel.style.marginTop = "6px";
    entrancesLabel.textContent = `${entrances.length} entrance${entrances.length === 1 ? "" : "s"}`;
    container.appendChild(entrancesLabel);

    for (const entrance of entrances) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.marginTop = "4px";
      const dropdown = createDropdown(Object.values(ENTRANCE_MODE_LABELS), ENTRANCE_MODE_LABELS[entrance.mode], (chosenLabel) => {
        const mode = (Object.entries(ENTRANCE_MODE_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "both") as DealerEntranceMode;
        void window.dealers.setEntranceMode(entrance.id, mode).then(async () => {
          await refreshEntranceIndex();
          showEntrancesForDealer(dealer);
        });
      });
      dropdown.el.style.flex = "1";
      row.appendChild(dropdown.el);

      const removeButton = document.createElement("button");
      removeButton.className = "btn btn-icon";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        void window.dealers.deleteEntrance(entrance.id).then(async () => {
          await refreshEntranceIndex();
          openDealerPopup(dealer);
        });
      });
      row.appendChild(removeButton);
      container.appendChild(row);
    }

    const addEntranceButton = document.createElement("button");
    addEntranceButton.className = "btn";
    addEntranceButton.style.marginTop = "6px";
    addEntranceButton.textContent = "+ Add entrance";
    addEntranceButton.title = "Click a road near this dealer to add an entrance";
    addEntranceButton.addEventListener("click", () => {
      addEntranceForDealer = dealer;
      map.getCanvas().style.cursor = "crosshair";
      dealerPopup?.remove();
    });
    container.appendChild(addEntranceButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn btn-danger";
    deleteButton.textContent = "Delete dealer";
    deleteButton.style.marginTop = "8px";
    deleteButton.addEventListener("click", () => {
      void window.dealers.delete(dealer.id).then(() => {
        dealers = dealers.filter((d) => d.id !== dealer.id);
        entrancesByDealer.delete(dealer.id);
        refreshDealersSource();
        dealerPopup?.remove();
      });
    });
    container.appendChild(deleteButton);

    dealerPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
      .setLngLat([dealer.lon, dealer.lat])
      .setDOMContent(container)
      .addTo(map);
    dealerPopup.on("close", () => {
      dealerPopup = null;
      hideEntrances();
    });
  };

  map.on("click", "dealers-points", (e) => {
    if (placeDealerState.isPlacing || routeDrawState.isDrawing || placeStopState.isPlacing || addEntranceForDealer) return;
    const feature = e.features?.[0];
    const dealerId = feature?.properties?.dealerId as number | undefined;
    const dealer = dealers.find((d) => d.id === dealerId);
    if (dealer) openDealerPopup(dealer);
  });
  map.on("mouseenter", "dealers-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "dealers-points", () => {
    map.getCanvas().style.cursor = "";
  });
}
