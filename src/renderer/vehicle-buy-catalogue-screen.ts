// Buy menu — Screen 1: Catalogue (the user's own buy-menu spec, pasted
// 2026-10-18). Left filter column (category/power/manufacturer), one row
// per catalogue entry. Clicking a row opens Configure for that model.
//
// Livery badges aren't shown per catalogue row — no single livery is
// fixed for a catalogue entry (that only applies once a livery is
// actually picked, which happens in Configure), so there's nothing real
// to show here; a generic placeholder would just be decoration standing
// in for nothing. Configure's own LIVERY column is where the spec is
// unambiguous about a real badge image.
import { VEHICLE_MODELS, manufacturerOf, type VehicleModel, type PowerType } from "./vehicle-catalogue.mts";

function formatGBP(amount: number): string {
  return `£${amount.toLocaleString("en-GB")}`;
}

const POWER_LABELS: Record<PowerType, string> = { diesel: "Diesel", electric: "Electric", hybrid: "Hybrid", hydrogen: "Hydrogen" };

function seatedStandingRangeText(vehicle: VehicleModel): string {
  const seatedValues: number[] = [];
  const standingValues: number[] = [];
  for (const length of vehicle.lengths) {
    const c = length.capacity;
    if (c.kind === "seatedStanding") {
      seatedValues.push(c.seated);
      standingValues.push(c.standing);
    } else if (c.kind === "seatedOnly") {
      seatedValues.push(c.seated);
      standingValues.push(0);
    } else if (c.kind === "maxCapacity") {
      seatedValues.push(c.maxSeated);
      standingValues.push(c.maxStanding);
    } else if (c.kind === "wheelchairBayDependent") {
      seatedValues.push(c.bayConverted.seated);
      standingValues.push(c.bayConverted.standing);
    }
  }
  if (seatedValues.length === 0) return "capacity not stated";
  const seatedRange = Math.min(...seatedValues) === Math.max(...seatedValues) ? `${seatedValues[0]}` : `${Math.min(...seatedValues)}–${Math.max(...seatedValues)}`;
  const standingRange = Math.min(...standingValues) === Math.max(...standingValues) ? `${standingValues[0]}` : `${Math.min(...standingValues)}–${Math.max(...standingValues)}`;
  return `${seatedRange} seated, ${standingRange} standing`;
}

function lengthRangeText(vehicle: VehicleModel): string {
  const lengths = vehicle.lengths.map((l) => l.lengthM);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  return min === max ? `${min}m` : `${min}–${max}m`;
}

export interface CatalogueFilters {
  category: string | null;
  power: PowerType | null;
  manufacturer: string | null;
}

export function renderCatalogueScreen(container: HTMLElement, filters: CatalogueFilters, onFiltersChange: (f: CatalogueFilters) => void, onSelectVehicle: (vehicle: VehicleModel) => void): void {
  container.innerHTML = "";
  container.style.display = "flex";
  container.style.height = "100%";
  container.style.overflow = "hidden";

  const sellable = VEHICLE_MODELS.filter((v) => v.basePriceGBP !== null);
  const categories = [...new Set(sellable.map((v) => v.category))];
  const powers = [...new Set(sellable.flatMap((v) => v.powerOptions.map((p) => p.powerType)))];
  const manufacturers = [...new Set(sellable.map((v) => manufacturerOf(v.id)))];

  // --- Left filter column ---
  const filterColumn = document.createElement("div");
  filterColumn.style.width = "180px";
  filterColumn.style.flex = "none";
  filterColumn.style.borderRight = "1px solid var(--border)";
  filterColumn.style.padding = "10px";
  filterColumn.style.overflowY = "auto";
  filterColumn.style.display = "flex";
  filterColumn.style.flexDirection = "column";
  filterColumn.style.gap = "12px";
  container.appendChild(filterColumn);

  function filterGroup(label: string, options: string[], selected: string | null, onPick: (value: string | null) => void): HTMLElement {
    const group = document.createElement("div");
    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.style.marginBottom = "4px";
    heading.textContent = label;
    group.appendChild(heading);

    const allRow = document.createElement("div");
    allRow.textContent = "All";
    allRow.style.padding = "3px 0";
    allRow.style.cursor = "pointer";
    allRow.style.color = selected === null ? "var(--text-accent)" : "var(--text-primary)";
    allRow.addEventListener("click", () => onPick(null));
    group.appendChild(allRow);

    for (const opt of options) {
      const row = document.createElement("div");
      row.textContent = opt;
      row.style.padding = "3px 0";
      row.style.cursor = "pointer";
      row.style.color = selected === opt ? "var(--text-accent)" : "var(--text-primary)";
      row.addEventListener("click", () => onPick(opt));
      group.appendChild(row);
    }
    return group;
  }

  filterColumn.appendChild(filterGroup("Category", categories, filters.category, (v) => onFiltersChange({ ...filters, category: v })));
  filterColumn.appendChild(filterGroup("Power", powers, filters.power, (v) => onFiltersChange({ ...filters, power: v as PowerType | null })));
  filterColumn.appendChild(filterGroup("Manufacturer", manufacturers, filters.manufacturer, (v) => onFiltersChange({ ...filters, manufacturer: v })));

  // --- Right row list ---
  const list = document.createElement("div");
  list.style.flex = "1";
  list.style.overflowY = "auto";
  list.style.padding = "4px 0";
  container.appendChild(list);

  const filtered = sellable.filter((v) => {
    if (filters.category && v.category !== filters.category) return false;
    if (filters.power && !v.powerOptions.some((p) => p.powerType === filters.power)) return false;
    if (filters.manufacturer && manufacturerOf(v.id) !== filters.manufacturer) return false;
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "label-muted";
    empty.style.padding = "12px";
    empty.textContent = "No catalogue entries match these filters.";
    list.appendChild(empty);
  }

  for (const vehicle of filtered) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.padding = "10px 16px";
    row.style.cursor = "pointer";
    row.style.borderBottom = "1px solid var(--border)";
    row.addEventListener("mouseenter", () => (row.style.background = "var(--bg-surface-1)"));
    row.addEventListener("mouseleave", () => (row.style.background = ""));
    row.addEventListener("click", () => onSelectVehicle(vehicle));

    const name = document.createElement("div");
    name.style.flex = "1";
    name.style.fontWeight = "600";
    name.textContent = vehicle.name;
    row.appendChild(name);

    const category = document.createElement("div");
    category.style.flex = "1";
    category.style.color = "var(--text-muted)";
    category.textContent = vehicle.category;
    row.appendChild(category);

    const length = document.createElement("div");
    length.style.width = "90px";
    length.style.color = "var(--text-muted)";
    length.textContent = lengthRangeText(vehicle);
    row.appendChild(length);

    const capacity = document.createElement("div");
    capacity.style.width = "160px";
    capacity.style.color = "var(--text-muted)";
    capacity.textContent = seatedStandingRangeText(vehicle);
    row.appendChild(capacity);

    const power = document.createElement("div");
    power.style.width = "130px";
    power.style.color = "var(--text-muted)";
    power.textContent = vehicle.powerOptions.map((p) => POWER_LABELS[p.powerType]).join(" / ");
    row.appendChild(power);

    const price = document.createElement("div");
    price.style.width = "100px";
    price.style.textAlign = "right";
    price.style.fontWeight = "600";
    price.textContent = `from ${formatGBP(vehicle.basePriceGBP!)}`;
    row.appendChild(price);

    list.appendChild(row);
  }
}
