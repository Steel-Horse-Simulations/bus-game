// Buy menu — Screen 5: Deliveries and collection (the user's own buy-menu
// spec, 2026-10-18). See vehicle_orders' own SCHEMA comment in db.mts for
// why this is simplified: no day-tick/calendar or driver-availability
// system exists yet (both Phase 6/7), so "2 or 3 a day", "who collects and
// when, depot manager skill", and "distance, driver time used" aren't
// simulated — every order is immediately available, and either button
// finalises it the same way. Transfers between depots are similarly
// immediate rather than "vehicle unusable in transit", for the same
// reason (no driver/duty system to hang a real transit delay on).
import { findVehicleModel, repowerTargetsFor, type PowerType } from "./vehicle-catalogue.mts";
import { gameClockState } from "./game-clock-engine";
import { SECONDS_PER_DAY } from "./game-clock.mts";
import { combinedAwayWindows } from "./workshop-booking.mts";
import { isIslandDepotGroup } from "./fare-journey.mts";
import {
  repowerUnlocked,
  repowerEligibleByAgeOrCondition,
  repowerEligibleByOwnership,
  repowerManufacturerFor,
  REPOWER_CONCURRENT_CAPACITY,
  scheduleRepowerBooking,
  repowerBasePriceGBP,
} from "./repower-booking.mts";

function formatGBP(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

interface DeliveriesScreenContext {
  depotGroups: DepotGroup[];
  depots: Depot[];
  ownedVehicles: Vehicle[];
  dealers: Dealer[];
  repaintBookings: RepaintBooking[];
  repowerBookings: RepowerBooking[];
  // Only needed for the real island away-cap below (2026-11-19).
  fareZones: FareZone[];
  onChanged: () => void;
}

export function renderDeliveriesScreen(container: HTMLElement, orders: VehicleOrder[], ctx: DeliveriesScreenContext): void {
  container.innerHTML = "";
  container.style.padding = "14px 16px";
  container.style.overflowY = "auto";
  container.style.height = "100%";

  const ordersHeading = document.createElement("div");
  ordersHeading.className = "label-muted";
  ordersHeading.textContent = `Awaiting collection (${orders.length})`;
  container.appendChild(ordersHeading);

  const simplificationNote = document.createElement("div");
  simplificationNote.style.fontSize = "11px";
  simplificationNote.style.color = "var(--text-muted)";
  simplificationNote.style.margin = "4px 0 10px";
  simplificationNote.textContent = "Every order is ready to collect immediately — the real day-by-day arrival queue and driver-availability simulation need systems (a calendar, drivers) that don't exist yet.";
  container.appendChild(simplificationNote);

  if (orders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "label-muted";
    empty.textContent = "Nothing on order.";
    container.appendChild(empty);
  } else {
    const table = document.createElement("table");
    table.className = "data-grid";
    container.appendChild(table);
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Vehicle</th><th>Destination</th><th>Price</th><th>Payment</th><th></th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    for (const order of orders) {
      const vehicle = findVehicleModel(order.modelId);
      const depot = ctx.depots.find((d) => d.id === order.depotId);
      const depotGroup = ctx.depotGroups.find((g) => g.id === order.depotGroupId);
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = `${vehicle?.name ?? order.modelId} (${order.lengthM}m)${order.isUsed ? " · used" : ""}`;
      tr.appendChild(nameTd);

      const destTd = document.createElement("td");
      destTd.textContent = `${depotGroup?.name ?? "?"} — ${depot?.name ?? "?"}`;
      tr.appendChild(destTd);

      const priceTd = document.createElement("td");
      priceTd.className = "num";
      priceTd.textContent = formatGBP(order.unitPriceGBP);
      tr.appendChild(priceTd);

      const paymentTd = document.createElement("td");
      paymentTd.textContent = order.paymentMethod;
      tr.appendChild(paymentTd);

      const actionTd = document.createElement("td");
      actionTd.style.display = "flex";
      actionTd.style.gap = "6px";

      const collectButton = document.createElement("button");
      collectButton.className = "btn";
      collectButton.textContent = "Collect";
      collectButton.addEventListener("click", async () => {
        await window.orders.collect(order.id);
        ctx.onChanged();
      });
      actionTd.appendChild(collectButton);

      const dealerDeliverButton = document.createElement("button");
      dealerDeliverButton.className = "btn";
      dealerDeliverButton.title = "Dealer delivers for a fee (placeholder — not charged yet, no finance system exists)";
      dealerDeliverButton.textContent = "Dealer delivers (fee)";
      dealerDeliverButton.addEventListener("click", async () => {
        await window.orders.collect(order.id);
        ctx.onChanged();
      });
      actionTd.appendChild(dealerDeliverButton);

      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }
  }

  // --- Transfers between depots ---
  const transferHeading = document.createElement("div");
  transferHeading.className = "label-muted";
  transferHeading.style.marginTop = "20px";
  transferHeading.textContent = `Transfer an owned vehicle (${ctx.ownedVehicles.length})`;
  container.appendChild(transferHeading);

  if (ctx.ownedVehicles.length === 0) {
    const empty = document.createElement("div");
    empty.className = "label-muted";
    empty.textContent = "No owned vehicles yet.";
    container.appendChild(empty);
    return;
  }

  const allDepots = ctx.depots.map((d) => ({ depot: d, group: ctx.depotGroups.find((g) => g.id === d.depotGroupId) }));
  const today = Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
  const unlocked = repowerUnlocked(gameClockState.accumulatedGameSeconds);
  const repowerSiteByManufacturer = new Map(ctx.dealers.filter((d) => d.isRepowerSite).map((d) => [d.manufacturer, d]));

  for (const vehicle of ctx.ownedVehicles) {
    const model = findVehicleModel(vehicle.modelId);
    const currentDepot = ctx.depots.find((d) => d.id === vehicle.depotId);
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "4px 0";
    row.style.borderBottom = "1px solid var(--border)";

    const label = document.createElement("span");
    label.style.flex = "1";
    label.textContent = `${vehicle.fleetNumber} · ${vehicle.plate} — ${model?.name ?? vehicle.modelId} @ ${currentDepot?.name ?? "?"}`;
    row.appendChild(label);

    const select = document.createElement("select");
    select.className = "field";
    for (const { depot, group } of allDepots) {
      if (depot.id === vehicle.depotId) continue;
      const option = document.createElement("option");
      option.value = String(depot.id);
      option.textContent = `${group?.name ?? "?"} — ${depot.name}`;
      select.appendChild(option);
    }
    row.appendChild(select);

    // T179: "also re-power" alongside a transfer — a diversion via the
    // vehicle's own manufacturer's one re-power site, same eligibility
    // gate and pricing repower-booking-panel.ts uses on its own, just
    // reached from the transfer flow instead of booked standalone.
    let repowerCheckbox: HTMLInputElement | null = null;
    const targets = model && unlocked ? repowerTargetsFor(model, vehicle.lengthM) : [];
    const repowerDealer = targets.length > 0 ? repowerSiteByManufacturer.get(repowerManufacturerFor(vehicle.modelId)) : undefined;
    // Ownership restriction, 2026-11-19 ("Re-powering can't be done on
    // leased buses, only fully owned buses") — this screen's own
    // separate re-power eligibility check (the main repower-booking-
    // panel.ts flow already has its own, via findEligibleVehicles) was
    // missing it; a real gap, not just a follow-up to that one.
    const repowerEligible =
      vehicle.powerType === "diesel" &&
      repowerDealer !== undefined &&
      repowerEligibleByAgeOrCondition(vehicle.boughtGameDay, today, vehicle.condition) &&
      repowerEligibleByOwnership(vehicle.paymentMethod);
    if (repowerEligible) {
      const toPowerType: PowerType = targets[0];
      repowerCheckbox = document.createElement("input");
      repowerCheckbox.type = "checkbox";
      repowerCheckbox.title = `Also re-power to ${toPowerType} at ${repowerDealer!.name}`;
      row.appendChild(repowerCheckbox);
      const repowerLabel = document.createElement("span");
      repowerLabel.style.fontSize = "12px";
      repowerLabel.style.color = "var(--text-muted)";
      repowerLabel.textContent = `also re-power (${toPowerType})`;
      row.appendChild(repowerLabel);
    }

    const transferButton = document.createElement("button");
    transferButton.className = "btn";
    transferButton.textContent = "Transfer";
    transferButton.disabled = allDepots.length <= 1;
    transferButton.addEventListener("click", async () => {
      const newDepotId = Number(select.value);
      if (!newDepotId) return;
      transferButton.disabled = true;
      try {
        await window.vehicles.transfer(vehicle.id, newDepotId);
        if (repowerCheckbox?.checked && repowerDealer) {
          const toPowerType: PowerType = targets[0];
          const basePriceGBP = model ? repowerBasePriceGBP(model, vehicle.lengthM, toPowerType) : null;
          if (basePriceGBP !== null) {
            const fullRepaintAway = ctx.repaintBookings.filter((b) => b.repaintType === "full").map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));
            const repowerAway = ctx.repowerBookings.map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));
            const newDepotGroupId = allDepots.find((d) => d.depot.id === newDepotId)?.group?.id ?? vehicle.depotGroupId;
            const groupCapBookings = combinedAwayWindows(ctx.ownedVehicles, fullRepaintAway, repowerAway, newDepotGroupId);
            const dealerBookings = ctx.repowerBookings.filter((b) => b.dealerId === repowerDealer.id).map((b) => ({ startDay: b.startGameDay, completionDay: b.completionGameDay }));
            const siteCapacity = REPOWER_CONCURRENT_CAPACITY[repowerDealer.manufacturer];
            // Island away-cap, 2026-11-19 — see repaint-shop-panel.ts's
            // own identical comment. Checked against the NEW depot group
            // (newDepotGroupId, just above), since a transfer moves the
            // vehicle there before the re-power booking is made.
            const groupAwayCap = isIslandDepotGroup(newDepotGroupId, ctx.depots, ctx.fareZones) ? 1 : 2;
            const bookingWindow = scheduleRepowerBooking(today, dealerBookings, siteCapacity, groupCapBookings, groupAwayCap);
            await window.repowerBookings.create(vehicle.id, repowerDealer.id, toPowerType as "electric" | "hydrogen", basePriceGBP, today, bookingWindow.startDay, bookingWindow.completionDay);
          }
        }
        ctx.onChanged();
      } finally {
        transferButton.disabled = false;
      }
    });
    row.appendChild(transferButton);

    container.appendChild(row);
  }
}
