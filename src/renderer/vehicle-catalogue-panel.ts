// Browsable vehicle catalogue (VEHICLE-SPECS.md, vehicle-catalogue.mts)
// plus a minimal buy-one-vehicle flow and owned-fleet list (OPERATIONS.md
// §3) — this panel's own first increment was read-only by the user's own
// choice; this second pass wires in purchasing, deliberately scoped small
// (decided with the user, 2026-10-18): new vehicles only, buy-outright
// only, no basket/bulk discount, no leasing, no condition decay over
// time, no delivery lead time — a vehicle is bought and appears at its
// depot immediately, but still gets a real fleet number and plate
// (fleet-numbering.mts), since that was the point of starting here.
import {
  VEHICLE_MODELS,
  GENERAL_RULES,
  DROPPED_VEHICLES,
  vehicleModelsByCategory,
  generalOptionsFor,
  axleCountForLength,
  findVehicleModel,
  type VehicleModel,
  type LengthVariant,
  type Capacity,
  type EnergyOption,
} from "./vehicle-catalogue.mts";
import { createDropdown } from "./dropdown";

function formatPrice(vehicle: VehicleModel): string {
  if (vehicle.basePriceGBP === null) return vehicle.priceNote ?? "Priced as donor vehicle";
  const formatted = `£${vehicle.basePriceGBP.toLocaleString("en-GB")}`;
  return vehicle.priceNote ? `${formatted} (${vehicle.priceNote})` : formatted;
}

function formatCapacity(capacity: Capacity): string {
  switch (capacity.kind) {
    case "seatedStanding":
      return `${capacity.seated} seated, ${capacity.standing} standing` + (capacity.tipUps ? ` (+${capacity.tipUps} tip-ups)` : "");
    case "seatedOnly":
      return `${capacity.seated} seated`;
    case "maxCapacity":
      return `max ${capacity.maxCapacity} — max-seating ${capacity.maxSeated} seated, or max-standing ${capacity.maxStanding} standing`;
    case "wheelchairBayDependent":
      return `${capacity.bayConverted.seated} seated, ${capacity.bayConverted.standing} standing with the bay converted / ${capacity.bayInUse.seated} seated, ${capacity.bayInUse.standing} standing with a wheelchair user aboard`;
    case "unspecified":
      return "not stated in VEHICLE-SPECS.md";
  }
}

function formatEnergyOption(o: EnergyOption): string {
  const cap = o.capacity === null ? "capacity not stated" : `${o.capacity}${o.unit}`;
  return `${o.label}: ${cap}, ${o.rangeMiles} miles`;
}

function formatLengthHeading(vehicle: VehicleModel, length: LengthVariant): string {
  const parts = [`${length.lengthM}m`, `(${length.fleetNumberRange})`];
  if (length.variantLabel) parts.push(`— ${length.variantLabel}`);
  if (vehicle.category.includes("coaches")) parts.push(`— ${axleCountForLength(length.lengthM)}`);
  return parts.join(" ");
}

function buildLengthSection(vehicle: VehicleModel, length: LengthVariant): HTMLElement {
  const section = document.createElement("div");
  section.style.borderTop = "1px solid var(--border)";
  section.style.padding = "8px 0";

  const heading = document.createElement("div");
  heading.style.fontWeight = "600";
  heading.textContent = formatLengthHeading(vehicle, length);
  section.appendChild(heading);

  const capacityLine = document.createElement("div");
  capacityLine.style.color = "var(--text-muted)";
  capacityLine.textContent = formatCapacity(length.capacity);
  section.appendChild(capacityLine);

  const energyList = document.createElement("ul");
  energyList.style.margin = "4px 0";
  energyList.style.paddingLeft = "18px";
  for (const o of length.energyOptions) {
    const li = document.createElement("li");
    li.textContent = formatEnergyOption(o);
    energyList.appendChild(li);
  }
  section.appendChild(energyList);

  if (length.bufferBatteryKWh !== undefined) {
    const buffer = document.createElement("div");
    buffer.style.color = "var(--text-muted)";
    buffer.textContent = `Fixed buffer battery: ${length.bufferBatteryKWh}kWh`;
    section.appendChild(buffer);
  }

  for (const note of length.notes ?? []) {
    const noteEl = document.createElement("div");
    noteEl.style.color = "var(--text-muted)";
    noteEl.style.fontStyle = "italic";
    noteEl.style.marginTop = "2px";
    noteEl.textContent = note;
    section.appendChild(noteEl);
  }

  return section;
}

interface BuyContext {
  depotGroups: DepotGroup[];
  depots: Depot[];
  onBought: () => void;
}

function buildBuySection(vehicle: VehicleModel, ctx: BuyContext): HTMLElement {
  const section = document.createElement("div");
  section.style.borderTop = "1px solid var(--border)";
  section.style.padding = "8px 0";
  section.style.display = "flex";
  section.style.flexDirection = "column";
  section.style.gap = "6px";

  if (vehicle.basePriceGBP === null) {
    const note = document.createElement("div");
    note.className = "label-muted";
    note.textContent = "Can't be bought directly — built from its donor vehicle via a conversion, not yet in the game.";
    section.appendChild(note);
    return section;
  }
  if (ctx.depotGroups.length === 0) {
    const note = document.createElement("div");
    note.className = "label-muted";
    note.textContent = "Create a depot group and place a depot before buying a vehicle.";
    section.appendChild(note);
    return section;
  }

  const heading = document.createElement("div");
  heading.style.fontWeight = "600";
  heading.textContent = "Buy";
  section.appendChild(heading);

  let selectedLength = vehicle.lengths[0];
  let selectedDepotGroupId: number | null = ctx.depotGroups[0].id;
  let selectedDepotId: number | null = null;

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "6px";
  row.style.flexWrap = "wrap";
  section.appendChild(row);

  if (vehicle.lengths.length > 1) {
    const lengthDropdown = createDropdown(
      vehicle.lengths.map((l) => formatLengthHeading(vehicle, l)),
      formatLengthHeading(vehicle, selectedLength),
      (label) => {
        const found = vehicle.lengths.find((l) => formatLengthHeading(vehicle, l) === label);
        if (found) selectedLength = found;
      },
    );
    lengthDropdown.el.style.flex = "1";
    lengthDropdown.el.style.minWidth = "140px";
    row.appendChild(lengthDropdown.el);
  }

  const depotGroupDropdown = createDropdown(
    ctx.depotGroups.map((g) => g.name),
    ctx.depotGroups[0].name,
    (name) => {
      const found = ctx.depotGroups.find((g) => g.name === name);
      selectedDepotGroupId = found?.id ?? null;
      refreshDepotDropdown();
    },
  );
  depotGroupDropdown.el.style.flex = "1";
  depotGroupDropdown.el.style.minWidth = "140px";
  row.appendChild(depotGroupDropdown.el);

  const depotDropdownContainer = document.createElement("div");
  depotDropdownContainer.style.flex = "1";
  depotDropdownContainer.style.minWidth = "140px";
  row.appendChild(depotDropdownContainer);

  function refreshDepotDropdown(): void {
    depotDropdownContainer.innerHTML = "";
    const depotsHere = ctx.depots.filter((d) => d.depotGroupId === selectedDepotGroupId);
    if (depotsHere.length === 0) {
      selectedDepotId = null;
      const note = document.createElement("div");
      note.className = "label-muted";
      note.style.fontSize = "0.85em";
      note.textContent = "No depot placed for this group yet.";
      depotDropdownContainer.appendChild(note);
      buyButton.disabled = true;
      return;
    }
    selectedDepotId = depotsHere[0].id;
    const dropdown = createDropdown(
      depotsHere.map((d) => d.name),
      depotsHere[0].name,
      (name) => {
        selectedDepotId = depotsHere.find((d) => d.name === name)?.id ?? null;
      },
    );
    depotDropdownContainer.appendChild(dropdown.el);
    buyButton.disabled = false;
  }

  const buyButton = document.createElement("button");
  buyButton.className = "btn";
  buyButton.textContent = `Buy — ${formatPrice(vehicle)}`;
  buyButton.addEventListener("click", async () => {
    if (selectedDepotGroupId === null || selectedDepotId === null || vehicle.basePriceGBP === null) return;
    buyButton.disabled = true;
    try {
      const bought = await window.vehicles.buy(
        selectedDepotGroupId,
        selectedDepotId,
        vehicle.id,
        selectedLength.lengthM,
        selectedLength.variantLabel ?? null,
        vehicle.powerType,
        vehicle.basePriceGBP,
      );
      result.textContent = `Bought — fleet number ${bought.fleetNumber}, plate ${bought.plate}.`;
      result.style.display = "block";
      ctx.onBought();
    } finally {
      buyButton.disabled = false;
    }
  });
  section.appendChild(buyButton);

  const result = document.createElement("div");
  result.style.color = "var(--text-success)";
  result.style.display = "none";
  section.appendChild(result);

  refreshDepotDropdown();
  return section;
}

function buildVehicleDetail(vehicle: VehicleModel, ctx: BuyContext): HTMLElement {
  const detail = document.createElement("div");
  detail.className = "panel-section";
  detail.style.padding = "8px 12px";

  const meta = document.createElement("div");
  meta.style.color = "var(--text-muted)";
  meta.style.marginBottom = "6px";
  const metaParts = [vehicle.chassis ? `Chassis: ${vehicle.chassis}` : null, `Top speed: ${vehicle.topSpeedMph}mph`, `Base price: ${formatPrice(vehicle)}`];
  meta.textContent = metaParts.filter((p): p is string => p !== null).join(" · ");
  detail.appendChild(meta);

  for (const note of vehicle.notes ?? []) {
    const noteEl = document.createElement("div");
    noteEl.style.color = "var(--text-muted)";
    noteEl.style.fontStyle = "italic";
    noteEl.style.marginBottom = "4px";
    noteEl.textContent = note;
    detail.appendChild(noteEl);
  }

  for (const length of vehicle.lengths) {
    detail.appendChild(buildLengthSection(vehicle, length));
  }

  const options = generalOptionsFor(vehicle);
  if (options.length > 0) {
    const optionsHeading = document.createElement("div");
    optionsHeading.style.fontWeight = "600";
    optionsHeading.style.marginTop = "8px";
    optionsHeading.textContent = "Options";
    detail.appendChild(optionsHeading);
    const optionsList = document.createElement("ul");
    optionsList.style.margin = "4px 0";
    optionsList.style.paddingLeft = "18px";
    for (const o of options) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.style.fontWeight = "600";
      label.textContent = `${o.label}${o.selectionType === "standard" ? " (standard)" : o.selectionType === "dropdown" ? " (dropdown)" : ""}: `;
      li.appendChild(label);
      li.appendChild(document.createTextNode(o.effect));
      optionsList.appendChild(li);
    }
    detail.appendChild(optionsList);
  }

  detail.appendChild(buildBuySection(vehicle, ctx));

  return detail;
}

export function mountVehicleCataloguePanel(): void {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Vehicles";
  toggle.style.position = "absolute";
  toggle.style.bottom = "8px";
  toggle.style.left = "330px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.bottom = "44px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  panel.style.width = "360px";
  panel.style.maxHeight = "75vh";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = `Vehicle catalogue (${VEHICLE_MODELS.length} models)`;
  panel.appendChild(header);

  const rulesSection = document.createElement("div");
  rulesSection.className = "panel-section";
  rulesSection.style.padding = "8px 12px";
  rulesSection.style.color = "var(--text-muted)";
  rulesSection.style.fontSize = "0.9em";
  rulesSection.textContent = `${GENERAL_RULES.wheelchairSpace} ${GENERAL_RULES.axleRule} ${GENERAL_RULES.maxSeatingMaxStanding}`;
  panel.appendChild(rulesSection);

  const list = document.createElement("div");
  list.style.overflowY = "auto";
  list.style.flex = "1";
  panel.appendChild(list);

  let openVehicleId: string | null = null;
  let depotGroups: DepotGroup[] = [];
  let depots: Depot[] = [];
  let ownedVehicles: Vehicle[] = [];

  async function render(): Promise<void> {
    [depotGroups, depots] = await Promise.all([window.depotGroups.list(), window.depots.list()]);
    const perGroup = await Promise.all(depotGroups.map((g) => window.vehicles.listForDepotGroup(g.id)));
    ownedVehicles = perGroup.flat();

    const ctx: BuyContext = { depotGroups, depots, onBought: () => void render() };

    list.innerHTML = "";

    const fleetLabel = document.createElement("div");
    fleetLabel.style.padding = "6px 12px";
    fleetLabel.style.color = "var(--text-muted)";
    fleetLabel.style.fontSize = "0.8em";
    fleetLabel.style.textTransform = "uppercase";
    fleetLabel.textContent = `Your fleet (${ownedVehicles.length})`;
    list.appendChild(fleetLabel);

    if (ownedVehicles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "label-muted";
      empty.style.padding = "4px 12px 8px";
      empty.textContent = "No vehicles bought yet — pick a model below.";
      list.appendChild(empty);
    }
    for (const owned of ownedVehicles) {
      const model = findVehicleModel(owned.modelId);
      const depot = depots.find((d) => d.id === owned.depotId);
      const row = document.createElement("div");
      row.style.padding = "4px 12px";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.fontSize = "0.9em";

      const label = document.createElement("span");
      label.style.flex = "1";
      const variant = owned.variantLabel ? ` (${owned.variantLabel})` : "";
      label.textContent = `${owned.fleetNumber} · ${owned.plate} — ${model?.name ?? owned.modelId}${variant} @ ${depot?.name ?? "?"}`;
      row.appendChild(label);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon btn-danger";
      deleteButton.textContent = "×";
      deleteButton.title = "Remove this vehicle";
      deleteButton.addEventListener("click", async () => {
        await window.vehicles.delete(owned.id);
        void render();
      });
      row.appendChild(deleteButton);

      list.appendChild(row);
    }
    for (const [category, vehicles] of vehicleModelsByCategory()) {
      const categoryLabel = document.createElement("div");
      categoryLabel.style.padding = "6px 12px";
      categoryLabel.style.color = "var(--text-muted)";
      categoryLabel.style.fontSize = "0.8em";
      categoryLabel.style.textTransform = "uppercase";
      categoryLabel.style.borderTop = "1px solid var(--border)";
      categoryLabel.textContent = category;
      list.appendChild(categoryLabel);

      for (const vehicle of vehicles) {
        const row = document.createElement("div");
        row.style.padding = "6px 12px";
        row.style.cursor = "pointer";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.gap = "8px";

        const name = document.createElement("span");
        name.textContent = vehicle.name;
        row.appendChild(name);

        const price = document.createElement("span");
        price.style.color = "var(--text-muted)";
        price.textContent = vehicle.basePriceGBP === null ? "—" : `£${vehicle.basePriceGBP.toLocaleString("en-GB")}`;
        row.appendChild(price);

        row.addEventListener("click", () => {
          openVehicleId = openVehicleId === vehicle.id ? null : vehicle.id;
          void render();
        });
        list.appendChild(row);

        if (openVehicleId === vehicle.id) {
          list.appendChild(buildVehicleDetail(vehicle, ctx));
        }
      }
    }

    const droppedLabel = document.createElement("div");
    droppedLabel.style.padding = "6px 12px";
    droppedLabel.style.color = "var(--text-muted)";
    droppedLabel.style.fontSize = "0.8em";
    droppedLabel.style.textTransform = "uppercase";
    droppedLabel.style.borderTop = "1px solid var(--border)";
    droppedLabel.textContent = "Dropped from the catalogue";
    list.appendChild(droppedLabel);
    for (const d of DROPPED_VEHICLES) {
      const row = document.createElement("div");
      row.style.padding = "4px 12px 4px 12px";
      row.style.color = "var(--text-muted)";
      row.style.fontSize = "0.9em";
      row.textContent = `${d.name} — ${d.reason}`;
      list.appendChild(row);
    }
  }

  let panelOpen = false;
  toggle.addEventListener("click", () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) void render();
  });
}
