// Read-only browsable view of the vehicle catalogue (VEHICLE-SPECS.md,
// vehicle-catalogue.mts) — the user's own choice of scope for this first
// increment of Phase 3's "vehicle configurator and catalogue": prove the
// data model reads correctly before wiring in purchasing, a fleet/
// ownership table, or depot assignment. No save-file interaction at all.
import {
  VEHICLE_MODELS,
  GENERAL_RULES,
  DROPPED_VEHICLES,
  vehicleModelsByCategory,
  generalOptionsFor,
  axleCountForLength,
  type VehicleModel,
  type LengthVariant,
  type Capacity,
  type EnergyOption,
} from "./vehicle-catalogue.mts";

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

function buildVehicleDetail(vehicle: VehicleModel): HTMLElement {
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

  function render(): void {
    list.innerHTML = "";
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
          render();
        });
        list.appendChild(row);

        if (openVehicleId === vehicle.id) {
          list.appendChild(buildVehicleDetail(vehicle));
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
    if (panelOpen) render();
  });
}
