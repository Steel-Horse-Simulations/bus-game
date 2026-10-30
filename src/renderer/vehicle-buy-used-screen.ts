// Buy menu — Screen 4: Used (the user's own buy-menu spec, 2026-10-18).
// The used PRICE formula is now real (OPERATIONS.md §3 "Condition",
// confirmed 2026-10-30) — see used-vehicle-stock.mts's own header for what
// is and isn't real here (condition itself and the age range are still
// placeholders). Specification is fixed per listing; "Add to basket" defaults to
// the first available depot group/depot (changeable afterward in Basket,
// which already supports editing a basket row's destination) since this
// screen has no depot picker of its own — the spec doesn't ask for one,
// and reusing Basket's existing editable depot avoids building a second.
import { generateUsedListings, type UsedListing } from "./used-vehicle-stock.mts";
import { manufacturerOf } from "./vehicle-catalogue.mts";

function formatGBP(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

function conditionColour(condition: number): string {
  if (condition >= 70) return "var(--text-success)";
  if (condition >= 45) return "var(--text-warning)";
  return "var(--text-danger)";
}

interface UsedScreenContext {
  depotGroups: DepotGroup[];
  depots: Depot[];
  onAddedToBasket: () => void;
}

let cachedListings: UsedListing[] | null = null;
function listings(): UsedListing[] {
  if (!cachedListings) cachedListings = generateUsedListings();
  return cachedListings;
}

export function renderUsedScreen(container: HTMLElement, ctx: UsedScreenContext): void {
  container.innerHTML = "";
  container.style.padding = "14px 16px";
  container.style.overflowY = "auto";
  container.style.height = "100%";

  const note = document.createElement("div");
  note.style.fontSize = "11px";
  note.style.color = "var(--text-muted)";
  note.style.marginBottom = "10px";
  note.textContent = "Used prices use the real depreciation formula (10%/year to a 20% floor, scaled by condition) — condition itself and the age shown are still placeholder figures.";
  container.appendChild(note);

  const table = document.createElement("table");
  table.className = "data-grid";
  container.appendChild(table);

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Livery</th><th>Vehicle</th><th>Age / plate</th><th>Condition</th><th title="Very cheap, much less reliable, passengers dislike them">Used price</th><th>Saving vs new</th><th></th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const firstDepotGroup = ctx.depotGroups[0];
  const firstDepot = firstDepotGroup ? ctx.depots.find((d) => d.depotGroupId === firstDepotGroup.id) : undefined;

  for (const listing of listings()) {
    const tr = document.createElement("tr");

    const liveryTd = document.createElement("td");
    const swatch = document.createElement("div");
    swatch.style.width = "32px";
    swatch.style.height = "18px";
    swatch.style.borderRadius = "3px";
    swatch.style.background = "#ffffff";
    swatch.style.border = "1px solid var(--border-strong)";
    liveryTd.appendChild(swatch);
    tr.appendChild(liveryTd);

    const nameTd = document.createElement("td");
    nameTd.textContent = `${listing.vehicle.name} (${listing.length.lengthM}m)`;
    tr.appendChild(nameTd);

    const ageTd = document.createElement("td");
    ageTd.textContent = `${listing.ageYears}y · ${listing.plate}`;
    tr.appendChild(ageTd);

    const conditionTd = document.createElement("td");
    conditionTd.title = "Very cheap, much less reliable, passengers dislike them";
    const bar = document.createElement("div");
    bar.style.width = "70px";
    bar.style.height = "8px";
    bar.style.borderRadius = "4px";
    bar.style.background = "var(--bg-surface-1)";
    bar.style.overflow = "hidden";
    const fill = document.createElement("div");
    fill.style.height = "100%";
    fill.style.width = `${listing.condition}%`;
    fill.style.background = conditionColour(listing.condition);
    bar.appendChild(fill);
    conditionTd.appendChild(bar);
    const conditionLabel = document.createElement("div");
    conditionLabel.style.fontSize = "10px";
    conditionLabel.style.color = "var(--text-muted)";
    conditionLabel.textContent = `${listing.condition}%`;
    conditionTd.appendChild(conditionLabel);
    tr.appendChild(conditionTd);

    const priceTd = document.createElement("td");
    priceTd.className = "num";
    priceTd.textContent = formatGBP(listing.usedPriceGBP);
    tr.appendChild(priceTd);

    const savingTd = document.createElement("td");
    savingTd.style.color = "var(--text-success)";
    savingTd.textContent = `−${formatGBP(listing.newPriceGBP - listing.usedPriceGBP)}`;
    tr.appendChild(savingTd);

    const actionTd = document.createElement("td");
    const addButton = document.createElement("button");
    addButton.className = "btn";
    addButton.textContent = "Add to basket";
    addButton.disabled = !firstDepotGroup || !firstDepot;
    addButton.addEventListener("click", async () => {
      if (!firstDepotGroup || !firstDepot) return;
      addButton.disabled = true;
      try {
        await window.basket.add(
          firstDepotGroup.id,
          firstDepot.id,
          listing.vehicle.id,
          listing.length.lengthM,
          listing.length.variantLabel ?? null,
          listing.powerType,
          null,
          manufacturerOf(listing.vehicle.id),
          1,
          listing.usedPriceGBP,
          "buy_outright",
          true,
          listing.condition,
        );
        ctx.onAddedToBasket();
      } finally {
        addButton.disabled = false;
      }
    });
    actionTd.appendChild(addButton);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  }

  if (!firstDepotGroup || !firstDepot) {
    const warning = document.createElement("div");
    warning.className = "label-muted";
    warning.style.marginTop = "10px";
    warning.textContent = "Create a depot group and place a depot before buying a used vehicle.";
    container.appendChild(warning);
  }
}
