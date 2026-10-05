// Repaint shops (T63): place shops on the map, and set each shop's weekly
// capacity. Capacity has no default — a shop needs a figure before it can be
// saved, since the real per-shop figures come from the user.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";

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

function parseCapacity(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function mountRepaintShops(map: maplibregl.Map): Promise<void> {
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

  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Repaint shops";
  toggle.style.position = "absolute";
  toggle.style.bottom = "44px";
  toggle.style.left = "1000px";
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
  let errorMessage = "";
  let placing = false;
  let pendingLngLat: maplibregl.LngLat | null = null;

  async function reload(): Promise<void> {
    shops = await window.repaintShops.list();
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(toGeojson(shops));
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
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "4px 0";

      const name = document.createElement("span");
      name.style.flex = "1";
      name.textContent = shop.name;
      row.appendChild(name);

      const capacity = document.createElement("input");
      capacity.type = "number";
      capacity.min = "1";
      capacity.step = "1";
      capacity.value = String(shop.weeklyCapacity);
      capacity.style.width = "64px";
      row.appendChild(capacity);

      const perWeek = document.createElement("span");
      perWeek.textContent = "/ week";
      row.appendChild(perWeek);

      const setButton = document.createElement("button");
      setButton.className = "btn";
      setButton.textContent = "Set";
      setButton.addEventListener("click", async () => {
        const value = parseCapacity(capacity.value);
        if (value === null) {
          errorMessage = "Weekly capacity must be a whole number above zero.";
          render();
          return;
        }
        try {
          await window.repaintShops.setWeeklyCapacity(shop.id, value);
          errorMessage = "";
          await reload();
        } catch (err) {
          showError(err);
        }
        render();
      });
      row.appendChild(setButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        await window.repaintShops.delete(shop.id);
        errorMessage = "";
        await reload();
        render();
      });
      row.appendChild(deleteButton);

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
      const capacityInput = document.createElement("input");
      capacityInput.type = "number";
      capacityInput.min = "1";
      capacityInput.step = "1";
      capacityInput.placeholder = "Vehicles per week";
      capacityInput.style.display = "block";
      capacityInput.style.marginBottom = "4px";
      const save = document.createElement("button");
      save.className = "btn";
      save.textContent = "Save shop";
      save.addEventListener("click", async () => {
        const value = parseCapacity(capacityInput.value);
        const name = nameInput.value.trim();
        if (!name) {
          errorMessage = "Give the shop a name.";
          render();
          return;
        }
        if (value === null) {
          errorMessage = "Weekly capacity must be a whole number above zero.";
          render();
          return;
        }
        try {
          await window.repaintShops.create(name, pendingLngLat!.lng, pendingLngLat!.lat, value);
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
      form.append(nameInput, capacityInput, save, cancel);
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
