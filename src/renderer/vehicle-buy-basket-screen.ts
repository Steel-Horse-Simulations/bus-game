// Buy menu — Screen 3: Basket (the user's own buy-menu spec, 2026-10-18).
// Mixed specifications in one order, a per-manufacturer bulk discount
// (OPERATIONS.md §3), totals, "Place order".
//
// "Option summary" per row (the spec's own wording) isn't shown: a basket
// row only stores the already-computed unit price, not which individual
// options went into it (deliberate — see basket_items' own SCHEMA comment
// in db.mts, "a later catalogue change can never retroactively alter an
// item already sitting in the basket"), so there's nothing to summarise
// beyond length/power, which are shown.
//
// The spec's own two screens disagree slightly on payment: Configure picks
// a method per item (its own three cards), while Basket separately says
// "Payment choice applies to the whole basket." Reconciled here as: each
// item keeps whatever method Configure gave it, and Basket additionally
// offers a "set all to" convenience control that overwrites every item's
// method at once — not an arbitrary guess, but the only reading that
// keeps both statements true rather than silently dropping one.
import { findVehicleModel, manufacturerOf } from "./vehicle-catalogue.mts";
import { liveryBadgeUrl } from "./livery-badges.mts";
import { liveryRestrictionForArea } from "./livery-seed-data.mts";
import { bulkDiscountPercent, type PaymentMethod } from "./vehicle-buy-pricing.mts";
import { createDropdown } from "./dropdown";

function formatGBP(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = { buy_outright: "Buy outright", lease: "Lease", lease_to_own: "Lease to own" };

interface BasketScreenContext {
  depotGroups: DepotGroup[];
  depots: Depot[];
  liveries: Livery[];
  onChanged: () => void;
  onOrderPlaced: (count: number) => void;
}

export function renderBasketScreen(container: HTMLElement, items: BasketItem[], ctx: BasketScreenContext): void {
  container.innerHTML = "";
  container.style.padding = "14px 16px";
  container.style.overflowY = "auto";
  container.style.height = "100%";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "label-muted";
    empty.textContent = "Nothing in the basket yet — add a vehicle from the Catalogue or Used screen.";
    container.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "data-grid";
  container.appendChild(table);

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Livery</th><th>Vehicle</th><th>Length</th><th>Power</th><th>Depot</th><th>Qty</th><th>Payment</th><th>Line price</th><th></th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  for (const item of items) {
    const vehicle = findVehicleModel(item.modelId);
    const tr = document.createElement("tr");

    const liveryTd = document.createElement("td");
    const livery = ctx.liveries.find((l) => l.id === item.liveryId);
    const swatch = document.createElement("div");
    swatch.style.width = "32px";
    swatch.style.height = "18px";
    swatch.style.borderRadius = "3px";
    if (livery) {
      const url = liveryBadgeUrl(livery.name);
      if (url) {
        swatch.style.backgroundImage = `url(${url})`;
        swatch.style.backgroundSize = "cover";
      } else {
        swatch.style.background = livery.primaryColour;
      }
    } else {
      swatch.style.background = "#ffffff";
      swatch.style.border = "1px solid var(--border-strong)";
    }
    liveryTd.appendChild(swatch);
    tr.appendChild(liveryTd);

    const nameTd = document.createElement("td");
    nameTd.textContent = vehicle?.name ?? item.modelId;
    tr.appendChild(nameTd);

    const lengthTd = document.createElement("td");
    lengthTd.textContent = `${item.lengthM}m${item.variantLabel ? ` (${item.variantLabel})` : ""}${item.isUsed ? " · used" : ""}`;
    tr.appendChild(lengthTd);

    const powerTd = document.createElement("td");
    powerTd.textContent = item.powerType;
    tr.appendChild(powerTd);

    const depotTd = document.createElement("td");
    const depotGroup = ctx.depotGroups.find((g) => g.id === item.depotGroupId);
    const currentDepot = ctx.depots.find((d) => d.id === item.depotId);
    const restriction = depotGroup ? liveryRestrictionForArea(depotGroup.name) : null;
    const depotDropdown = createDropdown(
      ctx.depotGroups.flatMap((g) => ctx.depots.filter((d) => d.depotGroupId === g.id).map((d) => `${g.name} — ${d.name}`)),
      depotGroup && currentDepot ? `${depotGroup.name} — ${currentDepot.name}` : "Pick a depot",
      async (label) => {
        const [groupName, depotName] = label.split(" — ");
        const group = ctx.depotGroups.find((g) => g.name === groupName);
        const depot = ctx.depots.find((d) => d.depotGroupId === group?.id && d.name === depotName);
        if (!group || !depot) return;
        await window.basket.setDepot(item.id, group.id, depot.id);
        ctx.onChanged();
      },
    );
    depotDropdown.el.style.minWidth = "140px";
    depotTd.appendChild(depotDropdown.el);
    if (restriction) {
      const lockNote = document.createElement("div");
      lockNote.style.fontSize = "10px";
      lockNote.style.color = "var(--text-warning)";
      lockNote.textContent = `Livery locked to: ${restriction.accepted.join(", ")}`;
      depotTd.appendChild(lockNote);
    }
    tr.appendChild(depotTd);

    const qtyTd = document.createElement("td");
    const qtyInput = document.createElement("input");
    qtyInput.className = "field";
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.value = String(item.quantity);
    qtyInput.style.width = "50px";
    qtyInput.addEventListener("change", async () => {
      await window.basket.setQuantity(item.id, Math.max(0, Math.round(Number(qtyInput.value) || 0)));
      ctx.onChanged();
    });
    qtyTd.appendChild(qtyInput);
    tr.appendChild(qtyTd);

    const paymentTd = document.createElement("td");
    paymentTd.textContent = PAYMENT_LABELS[item.paymentMethod];
    tr.appendChild(paymentTd);

    const priceTd = document.createElement("td");
    priceTd.className = "num";
    priceTd.textContent = formatGBP(item.unitPriceGBP * item.quantity);
    tr.appendChild(priceTd);

    const removeTd = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.className = "btn btn-icon btn-danger";
    removeButton.textContent = "×";
    removeButton.addEventListener("click", async () => {
      await window.basket.remove(item.id);
      ctx.onChanged();
    });
    removeTd.appendChild(removeButton);
    tr.appendChild(removeTd);

    tbody.appendChild(tr);
  }

  // --- Bulk discount panel, grouped by manufacturer ---
  const manufacturerCounts = new Map<string, number>();
  const manufacturerSubtotals = new Map<string, number>();
  for (const item of items) {
    manufacturerCounts.set(item.manufacturer, (manufacturerCounts.get(item.manufacturer) ?? 0) + item.quantity);
    manufacturerSubtotals.set(item.manufacturer, (manufacturerSubtotals.get(item.manufacturer) ?? 0) + item.unitPriceGBP * item.quantity);
  }

  const discountPanel = document.createElement("div");
  discountPanel.style.marginTop = "16px";
  discountPanel.className = "panel-section";
  container.appendChild(discountPanel);

  const discountHeading = document.createElement("div");
  discountHeading.className = "label-muted";
  discountHeading.textContent = "Bulk discount (by manufacturer)";
  discountPanel.appendChild(discountHeading);

  let totalDiscountGBP = 0;
  let subtotalGBP = 0;
  for (const [manufacturer, count] of manufacturerCounts) {
    const subtotal = manufacturerSubtotals.get(manufacturer)!;
    subtotalGBP += subtotal;
    const percent = bulkDiscountPercent(count);
    const discount = Math.round(subtotal * (percent / 100));
    totalDiscountGBP += discount;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.marginTop = "4px";

    const left = document.createElement("span");
    left.textContent = `${manufacturer} × ${count} — ${percent}%`;
    row.appendChild(left);

    const right = document.createElement("span");
    right.style.color = "var(--text-success)";
    right.textContent = `−${formatGBP(discount)}`;
    row.appendChild(right);
    discountPanel.appendChild(row);

    let nextCount = count + 1;
    while (bulkDiscountPercent(nextCount) <= percent && nextCount < 30) nextCount++;
    if (bulkDiscountPercent(nextCount) > percent) {
      const hint = document.createElement("div");
      hint.style.fontSize = "11px";
      hint.style.color = "var(--text-muted)";
      hint.textContent = `${nextCount - count} more ${manufacturer}${nextCount - count > 1 ? "s" : ""} for ${bulkDiscountPercent(nextCount)}%`;
      discountPanel.appendChild(hint);
    }
  }

  // --- Totals ---
  const totals = document.createElement("div");
  totals.style.marginTop = "16px";
  totals.style.textAlign = "right";
  container.appendChild(totals);

  const subtotalLine = document.createElement("div");
  subtotalLine.textContent = `Subtotal: ${formatGBP(subtotalGBP)}`;
  totals.appendChild(subtotalLine);

  const discountLine = document.createElement("div");
  discountLine.style.color = "var(--text-success)";
  discountLine.textContent = `Discount: −${formatGBP(totalDiscountGBP)}`;
  totals.appendChild(discountLine);

  const totalLine = document.createElement("div");
  totalLine.style.fontWeight = "700";
  totalLine.style.fontSize = "15px";
  totalLine.textContent = `Total: ${formatGBP(subtotalGBP - totalDiscountGBP)}`;
  totals.appendChild(totalLine);

  const placeOrderButton = document.createElement("button");
  placeOrderButton.className = "btn";
  placeOrderButton.style.marginTop = "10px";
  placeOrderButton.textContent = "Place order";
  placeOrderButton.addEventListener("click", async () => {
    placeOrderButton.disabled = true;
    try {
      const count = await window.basket.placeOrder();
      ctx.onOrderPlaced(count);
    } finally {
      placeOrderButton.disabled = false;
    }
  });
  totals.appendChild(placeOrderButton);
}
