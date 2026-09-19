// Depot placement and entrances (OPERATIONS.md §2 "Placement and
// entrances", Phase 3): "Depots can be built anywhere suitable on the map
// — enough space with road access... Entrances are placed by the player on
// the surrounding roads, and there can be several. Each can be entry only,
// exit only, or both."
//
// Deliberately narrow scope, matching this session's other Phase 3
// increments: just the physical placement mechanic. Not built here — the
// depot tier system (outstation/tiny/small/main), rent-vs-buy economics,
// build time, capacity or maintenance facilities, since all of those
// depend on money (Phase 5) and staffing (Phase 6/7) that don't exist yet.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import type { Router } from "./wasm/game_wasm.js";
import { createDropdown } from "./dropdown";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";

export const placeDepotState = { isPlacing: false };

const ENTRANCE_MODE_LABELS: Record<DepotEntranceMode, string> = { entry: "Entry only", exit: "Exit only", both: "Entry and exit" };
const ENTRANCE_MODE_COLORS: Record<DepotEntranceMode, string> = { entry: "#22c55e", exit: "#ef4444", both: "#f59e0b" };

const emptyGeojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface DraftEntrance {
  lon: number;
  lat: number;
  mode: DepotEntranceMode;
}

export async function mountDepotPlacement(map: maplibregl.Map, router: Router): Promise<void> {
  let depotGroups = await window.depotGroups.list();
  let depots = await window.depots.list();
  let entrancesByDepot = new Map<number, DepotEntrance[]>();

  const refreshEntranceIndex = async (): Promise<void> => {
    const all = await window.depots.listAllEntrances();
    entrancesByDepot = new Map();
    for (const e of all) {
      const list = entrancesByDepot.get(e.depotId) ?? [];
      list.push(e);
      entrancesByDepot.set(e.depotId, list);
    }
  };
  await refreshEntranceIndex();

  map.addSource("depots", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "depots-points",
    type: "circle",
    source: "depots",
    minzoom: 9,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 17, 10],
      "circle-color": "#f59e0b",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "depots-labels",
    type: "symbol",
    source: "depots",
    minzoom: 11,
    layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.3], "text-allow-overlap": false },
    paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 },
  });

  map.addSource("depot-entrances", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "depot-entrances-points",
    type: "circle",
    source: "depot-entrances",
    minzoom: 13,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 6],
      "circle-color": ["match", ["get", "mode"], "entry", ENTRANCE_MODE_COLORS.entry, "exit", ENTRANCE_MODE_COLORS.exit, ENTRANCE_MODE_COLORS.both],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });

  // The in-progress placement (site + entrances not yet saved), separate
  // sources so nothing touches the real depots/entrances data until Save.
  map.addSource("depot-draft-site", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "depot-draft-site",
    type: "circle",
    source: "depot-draft-site",
    paint: { "circle-radius": 10, "circle-color": "#f59e0b", "circle-opacity": 0.6, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
  map.addSource("depot-draft-entrances", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "depot-draft-entrances",
    type: "circle",
    source: "depot-draft-entrances",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "mode"], "entry", ENTRANCE_MODE_COLORS.entry, "exit", ENTRANCE_MODE_COLORS.exit, ENTRANCE_MODE_COLORS.both],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  const refreshDepotsSource = (): void => {
    (map.getSource("depots") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: depots.map((d) => ({ type: "Feature", properties: { depotId: d.id, name: d.name }, geometry: { type: "Point", coordinates: [d.lon, d.lat] } })),
    });
    const entranceFeatures: GeoJSON.Feature[] = [];
    for (const list of entrancesByDepot.values()) {
      for (const e of list) {
        entranceFeatures.push({ type: "Feature", properties: { mode: e.mode }, geometry: { type: "Point", coordinates: [e.lon, e.lat] } });
      }
    }
    (map.getSource("depot-entrances") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: entranceFeatures });
  };
  refreshDepotsSource();

  // --- Placement toggle + draft panel ---
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Place depot";
  toggle.style.position = "absolute";
  toggle.style.bottom = "8px";
  toggle.style.left = "440px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const draftPanel = document.createElement("div");
  draftPanel.className = "panel";
  draftPanel.style.position = "absolute";
  draftPanel.style.bottom = "44px";
  draftPanel.style.left = "440px";
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
  let draftDepotGroupId: number | null = depotGroups[0]?.id ?? null;
  // Kept across renderDraftPanel calls so the name input's own 'input'
  // listener (which deliberately doesn't trigger a full re-render, or
  // every keystroke would lose focus) can still keep Save's disabled
  // state in sync — a real bug caught live: typing a name left Save
  // permanently disabled, since it was only ever computed once at the
  // panel's last full render, before any text existed.
  let saveButtonRef: HTMLButtonElement | null = null;
  const updateSaveDisabled = (): void => {
    if (saveButtonRef) saveButtonRef.disabled = draftName.trim() === "" || draftEntrances.length === 0 || draftDepotGroupId === null;
  };

  const resetDraft = (): void => {
    draftSite = null;
    draftEntrances = [];
    draftName = "";
    saveButtonRef = null;
    (map.getSource("depot-draft-site") as maplibregl.GeoJSONSource).setData(emptyGeojson);
    (map.getSource("depot-draft-entrances") as maplibregl.GeoJSONSource).setData(emptyGeojson);
  };

  const refreshDraftSources = (): void => {
    (map.getSource("depot-draft-site") as maplibregl.GeoJSONSource).setData(
      draftSite
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [draftSite.lon, draftSite.lat] } }] }
        : emptyGeojson,
    );
    (map.getSource("depot-draft-entrances") as maplibregl.GeoJSONSource).setData({
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
    header.textContent = "New depot";
    draftPanel.appendChild(header);

    const nameInput = document.createElement("input");
    nameInput.className = "field";
    nameInput.placeholder = "Depot name";
    nameInput.value = draftName;
    nameInput.addEventListener("input", () => {
      draftName = nameInput.value;
      updateSaveDisabled();
    });
    draftPanel.appendChild(nameInput);

    if (depotGroups.length === 0) {
      const warning = document.createElement("div");
      warning.style.color = "var(--text-muted)";
      warning.textContent = "Create a depot group first.";
      draftPanel.appendChild(warning);
    } else {
      const currentGroup = depotGroups.find((g) => g.id === draftDepotGroupId) ?? depotGroups[0];
      const groupDropdown = createDropdown(
        depotGroups.map((g) => g.name),
        currentGroup.name,
        (chosenName) => {
          draftDepotGroupId = depotGroups.find((g) => g.name === chosenName)?.id ?? draftDepotGroupId;
          updateSaveDisabled();
        },
      );
      draftPanel.appendChild(groupDropdown.el);
    }

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
        const mode = (Object.entries(ENTRANCE_MODE_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "both") as DepotEntranceMode;
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
        if (draftDepotGroupId === null || !draftSite) return;
        const { depot, entrances } = await window.depots.create(
          draftDepotGroupId,
          draftName.trim(),
          draftSite.lon,
          draftSite.lat,
          draftEntrances.map((e) => ({ lon: e.lon, lat: e.lat, mode: e.mode })),
        );
        depots = [...depots, depot];
        entrancesByDepot.set(depot.id, entrances);
        refreshDepotsSource();
        resetDraft();
        placeDepotState.isPlacing = false;
        toggle.classList.remove("is-active");
        renderDraftPanel();
      })();
    });
    actionRow.appendChild(saveButton);

    draftPanel.appendChild(actionRow);
  }

  toggle.addEventListener("click", () => {
    placeDepotState.isPlacing = !placeDepotState.isPlacing;
    toggle.classList.toggle("is-active", placeDepotState.isPlacing);
    if (placeDepotState.isPlacing) {
      // Refreshed on arming rather than kept live — depot groups rarely
      // change mid-session, and this is the only moment the dropdown is
      // actually shown.
      void window.depotGroups.list().then((groups) => {
        depotGroups = groups;
      });
    } else {
      resetDraft();
      renderDraftPanel();
    }
  });

  map.on("click", (e) => {
    if (!placeDepotState.isPlacing || routeDrawState.isDrawing || placeStopState.isPlacing) return;
    if (!draftSite) {
      draftSite = { lon: e.lngLat.lng, lat: e.lngLat.lat };
      draftDepotGroupId = depotGroups[0]?.id ?? null;
      refreshDraftSources();
      renderDraftPanel();
      return;
    }
    const snapped = router.snap_to_road(e.lngLat.lng, e.lngLat.lat);
    if (snapped.length !== 2) return;
    draftEntrances.push({ lon: snapped[0], lat: snapped[1], mode: "both" });
    refreshDraftSources();
    renderDraftPanel();
  });

  // --- Existing-depot popup: rename, manage entrances, delete ---
  let depotPopup: maplibregl.Popup | null = null;

  const openDepotPopup = (depot: Depot): void => {
    depotPopup?.remove();
    const container = document.createElement("div");
    container.style.minWidth = "220px";

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.justifyContent = "space-between";
    titleRow.style.alignItems = "center";
    titleRow.style.marginBottom = "6px";
    const title = document.createElement("span");
    title.style.fontWeight = "600";
    title.textContent = depot.name;
    titleRow.appendChild(title);
    container.appendChild(titleRow);

    const entrances = entrancesByDepot.get(depot.id) ?? [];
    const entrancesLabel = document.createElement("div");
    entrancesLabel.style.color = "var(--text-muted)";
    entrancesLabel.textContent = `${entrances.length} entrance${entrances.length === 1 ? "" : "s"}`;
    container.appendChild(entrancesLabel);

    for (const entrance of entrances) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.marginTop = "4px";
      const dropdown = createDropdown(Object.values(ENTRANCE_MODE_LABELS), ENTRANCE_MODE_LABELS[entrance.mode], (chosenLabel) => {
        const mode = (Object.entries(ENTRANCE_MODE_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "both") as DepotEntranceMode;
        void window.depots.setEntranceMode(entrance.id, mode).then(async () => {
          await refreshEntranceIndex();
          refreshDepotsSource();
        });
      });
      dropdown.el.style.flex = "1";
      row.appendChild(dropdown.el);

      const removeButton = document.createElement("button");
      removeButton.className = "btn btn-icon";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        void window.depots.deleteEntrance(entrance.id).then(async () => {
          await refreshEntranceIndex();
          refreshDepotsSource();
          openDepotPopup(depot);
        });
      });
      row.appendChild(removeButton);
      container.appendChild(row);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn btn-danger";
    deleteButton.textContent = "Delete depot";
    deleteButton.style.marginTop = "8px";
    deleteButton.addEventListener("click", () => {
      void window.depots.delete(depot.id).then(() => {
        depots = depots.filter((d) => d.id !== depot.id);
        entrancesByDepot.delete(depot.id);
        refreshDepotsSource();
        depotPopup?.remove();
      });
    });
    container.appendChild(deleteButton);

    depotPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
      .setLngLat([depot.lon, depot.lat])
      .setDOMContent(container)
      .addTo(map);
    depotPopup.on("close", () => {
      depotPopup = null;
    });
  };

  map.on("click", "depots-points", (e) => {
    if (placeDepotState.isPlacing || routeDrawState.isDrawing || placeStopState.isPlacing) return;
    const feature = e.features?.[0];
    const depotId = feature?.properties?.depotId as number | undefined;
    const depot = depots.find((d) => d.id === depotId);
    if (depot) openDepotPopup(depot);
  });
  map.on("mouseenter", "depots-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "depots-points", () => {
    map.getCanvas().style.cursor = "";
  });
}
