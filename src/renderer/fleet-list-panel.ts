// "My fleet" — a minimal owned-fleet-list screen (T184, Q22/OPEN-ITEMS.md,
// approved plan `can-you-do-the-flickering-hopper.md`, confirmed
// 2026-11-13). Fleet's existing "Vehicles" tab (vehicle-buy-menu.ts) is
// the buy menu/catalogue, not a list of what's already owned — this is
// the first screen that actually lists owned vehicles, one depot group at
// a time.
//
// The spare-bus toggle and coverage readout this screen originally also
// carried have been removed (per the user's own direct instruction
// 2026-11-14 — see OPEN-ITEMS.md's new entry: the mechanic is dropped
// entirely, a pulled branded vehicle is simply covered by an ordinary
// bus, since there is no vehicle-to-duty/journey assignment anywhere in
// this codebase for a dedicated "spare" to attach to in the first place).
// This screen stays — the user confirmed they wanted it regardless.
import { createDropdown } from "./dropdown";
import { gameClockState } from "./game-clock-engine";
import { gameDateTimeFromSeconds, SECONDS_PER_DAY } from "./game-clock.mts";
import { findVehicleModel, GENERAL_OPTIONS } from "./vehicle-catalogue.mts";
import { chargeableMonthKeys, leaseMonthsElapsed, leaseMonthsRemaining, leaseMoneyRemainingGBP, shouldFlipLeaseToOwnToOutright } from "./vehicle-lease-billing.mts";
import { chargeableMonthKeys as greenroadChargeableMonthKeys, greenroadMonthChargeGBPPence } from "./greenroad-billing.mts";
import { scheduleGreenroadRetrofit, type ScheduledGreenroadVisit } from "./greenroad-retrofit-scheduling.mts";

// GreenRoad retrofit's own £350 fee (user request 2026-11-20: "Greenroad
// also needs to be retro-fitable for the same fee") — read directly off
// the catalogue's own "greenroad" GeneralOption rather than a second,
// separately-maintained constant, so the two can never drift apart.
const GREENROAD_OPTION = GENERAL_OPTIONS.find((o) => o.id === "greenroad")!;

export const fleetListPanelState: { open: (() => void) | null; close: (() => void) | null } = {
  open: null,
  close: null,
};

function todayDayIndex(): number {
  return Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
}

// Age (T185) — "X years, Y months" since boughtGameDay, via the real
// calendar civil-date fields gameDateTimeFromSeconds already derives
// (year/month/day), not a hand-rolled 30-day-per-month approximation.
// Partial months are never rounded up: a vehicle bought on the 20th
// isn't "1 month old" until the 20th of the following month has really
// passed. "under a month" at exactly 0.
function vehicleAgeLabel(boughtGameDay: number, nowGameDay: number): string {
  const bought = gameDateTimeFromSeconds(boughtGameDay * SECONDS_PER_DAY);
  const now = gameDateTimeFromSeconds(nowGameDay * SECONDS_PER_DAY);
  let totalMonths = (now.year - bought.year) * 12 + (now.month - bought.month);
  if (now.day < bought.day) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  if (totalMonths === 0) return "under a month";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function paymentMethodLabel(paymentMethod: Vehicle["paymentMethod"]): string {
  if (paymentMethod === "lease") return "Lease";
  if (paymentMethod === "lease_to_own") return "Lease to own";
  return "Buy outright";
}

// Lease remaining (T185) — blank/dash for buy_outright (nothing is ever
// owed); "Lease term ended" once a plain lease's own 60 months are fully
// elapsed (no buy-out/extend flow exists yet to offer instead — flagged,
// deferred, same treatment as the grey spare livery); otherwise the real
// months/money remaining via vehicle-lease-billing.mts's own pure math.
// A lease-to-own vehicle never actually reaches "term ended" here — by
// the time this renders, billLeaseCharges below has already flipped it
// to buy_outright, which shows "—" instead.
function leaseRemainingLabel(vehicle: Vehicle, nowGameDay: number): string {
  if (vehicle.paymentMethod === "buy_outright") return "—";
  const monthsElapsed = leaseMonthsElapsed(vehicle.boughtGameDay, nowGameDay);
  const monthsRemaining = leaseMonthsRemaining(monthsElapsed);
  if (monthsRemaining <= 0) return "Lease term ended";
  const moneyRemainingGBP = leaseMoneyRemainingGBP(vehicle.paymentMethod, vehicle.purchasePriceGBP, monthsRemaining);
  return `${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"}, £${moneyRemainingGBP.toLocaleString("en-GB")} remaining`;
}

// Real monthly lease billing (T185) — the lazy "re-checked fresh every
// time this exact screen opens" trigger, same pattern depot-groups-
// panel.ts's own generatePrivateHireIncome already uses for private hire
// income (see vehicle-lease-billing.mts's own header comment for why
// there's no real periodic game-tick to hang this off instead). For
// every vehicle that isn't buy_outright, bills every calendar month
// that's fully elapsed since purchase and hasn't already been charged
// (capped at the 60-month term by chargeableMonthKeys itself), as a real
// negative "Vehicle lease" finance transaction, then flips a lease-to-
// own vehicle to buy_outright the moment its own term completes
// (OPERATIONS.md §3 "then ownership") — in the same call as recording
// the final billed month, so the two can never land out of step.
async function billLeaseCharges(vehiclesToBill: readonly Vehicle[]): Promise<void> {
  const nowGameDay = todayDayIndex();
  for (const vehicle of vehiclesToBill) {
    if (vehicle.paymentMethod === "buy_outright") continue;
    const alreadyBilled = await window.leaseBilling.listGeneratedMonths(vehicle.id);
    const monthsToCharge = chargeableMonthKeys(vehicle.boughtGameDay, nowGameDay, alreadyBilled);
    if (monthsToCharge.length > 0) {
      const monthlyGBP = leaseMoneyRemainingGBP(vehicle.paymentMethod, vehicle.purchasePriceGBP, 1);
      for (const monthKey of monthsToCharge) {
        await window.finance.record(-monthlyGBP * 100, "Vehicle lease", vehicle.depotGroupId, `Lease payment — fleet ${vehicle.fleetNumber}, ${monthKey}`, nowGameDay);
      }
    }
    const monthsElapsed = leaseMonthsElapsed(vehicle.boughtGameDay, nowGameDay);
    const flipToOutright = shouldFlipLeaseToOwnToOutright(vehicle.paymentMethod, monthsElapsed);
    if (monthsToCharge.length > 0 || flipToOutright) {
      await window.leaseBilling.recordMonthsBilled(vehicle.id, monthsToCharge, flipToOutright);
    }
  }
}

// Real GreenRoad recurring billing (user request 2026-11-20) — same lazy
// "re-checked fresh every time this screen opens" trigger as
// billLeaseCharges above, for every vehicle with greenroadFitted set,
// regardless of payment method (this charge is separate from the lease/
// buy-outright cost — it's the ongoing GreenRoad subscription, not part
// of the vehicle's own price). No term cap, unlike lease billing. The
// amount isn't flat (see greenroad-billing.mts's own header comment) —
// greenroadMonthChargeGBPPence already returns pence, so it's passed to
// finance.record directly, unlike leaseMoneyRemainingGBP's whole-pounds
// figure above which needs its own x100.
async function billGreenroadCharges(vehiclesToBill: readonly Vehicle[]): Promise<void> {
  const nowGameDay = todayDayIndex();
  for (const vehicle of vehiclesToBill) {
    if (!vehicle.greenroadFitted) continue;
    const alreadyBilled = await window.greenroadBilling.listGeneratedMonths(vehicle.id);
    const monthsToCharge = greenroadChargeableMonthKeys(vehicle.boughtGameDay, nowGameDay, alreadyBilled);
    if (monthsToCharge.length === 0) continue;
    for (const monthKey of monthsToCharge) {
      const chargePence = greenroadMonthChargeGBPPence(monthKey);
      await window.finance.record(-chargePence, "GreenRoad", vehicle.depotGroupId, `GreenRoad driver-behaviour system — fleet ${vehicle.fleetNumber}, ${monthKey}`, nowGameDay);
    }
    await window.greenroadBilling.recordMonthsBilled(vehicle.id, monthsToCharge);
  }
}

export function mountFleetListPanel(): void {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "fixed";
  panel.style.top = "72px";
  panel.style.left = "50%";
  panel.style.transform = "translateX(-50%)";
  panel.style.zIndex = "1000";
  // Widened from the original 640px (T184) to fit T185's 3 new columns
  // (Age/Payment/Lease remaining) without the table overflowing.
  panel.style.width = "900px";
  panel.style.maxHeight = "80vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "My fleet";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let depotGroups: DepotGroup[] = [];
  let selectedDepotGroupId: number | null = null;
  let vehicles: Vehicle[] = [];
  let liveries: Livery[] = [];
  let retrofitBookings: GreenroadRetrofitBooking[] = [];

  // Collects any GreenRoad retrofit booking that's reached its own
  // ready_game_day — the real scheduled engineer night (14-day lead
  // time, then queued further out if the depot group's own nightly
  // capacity is full, greenroad-retrofit-scheduling.mts) — via the same
  // real lazy "collect when the screen next opens and it's ready"
  // pattern as repower/repaint bookings elsewhere, rather than a special-
  // cased instant-fit.
  async function collectReadyGreenroadRetrofits(): Promise<void> {
    const nowGameDay = todayDayIndex();
    const ready = retrofitBookings.filter((b) => b.readyGameDay <= nowGameDay);
    for (const booking of ready) {
      await window.greenroadRetrofit.collect(booking.id);
    }
    if (ready.length > 0) retrofitBookings = await window.greenroadRetrofit.listAll();
  }

  async function reload(): Promise<void> {
    depotGroups = await window.depotGroups.list();
    if (selectedDepotGroupId === null) selectedDepotGroupId = depotGroups[0]?.id ?? null;
    if (selectedDepotGroupId !== null && !depotGroups.some((g) => g.id === selectedDepotGroupId)) {
      selectedDepotGroupId = depotGroups[0]?.id ?? null;
    }
    [vehicles, liveries, retrofitBookings] = await Promise.all([
      selectedDepotGroupId === null ? Promise.resolve([]) : window.vehicles.listForDepotGroup(selectedDepotGroupId),
      window.liveries.list(),
      window.greenroadRetrofit.listAll(),
    ]);
    await collectReadyGreenroadRetrofits();
    // Bills any real lease charges due for this depot group's own leased
    // vehicles before the table renders, then re-reads vehicles so a
    // lease-to-own vehicle that just flipped to buy_outright (or a fresh
    // "Lease payment" transaction's effect on the figures below) shows up
    // immediately, not a screen re-open later. Also picks up any vehicle
    // a retrofit just fitted.
    await billLeaseCharges(vehicles);
    await billGreenroadCharges(vehicles);
    if (selectedDepotGroupId !== null) {
      vehicles = await window.vehicles.listForDepotGroup(selectedDepotGroupId);
    }
  }

  function liveryName(liveryId: number | null): string {
    if (liveryId === null) return "(none — plain operator colours)";
    return liveries.find((l) => l.id === liveryId)?.name ?? `Livery #${liveryId}`;
  }

  function render(): void {
    body.replaceChildren();

    if (depotGroups.length === 0) {
      const note = document.createElement("div");
      note.style.color = "var(--text-muted)";
      note.textContent = "Create a depot group first — a fleet belongs to one.";
      body.appendChild(note);
      return;
    }

    const groupLabel = document.createElement("div");
    groupLabel.className = "label-muted";
    groupLabel.textContent = "Depot group";
    body.appendChild(groupLabel);

    const selectedGroup = depotGroups.find((g) => g.id === selectedDepotGroupId) ?? depotGroups[0];
    const groupDropdown = createDropdown(
      depotGroups.map((g) => g.name),
      selectedGroup.name,
      async (label) => {
        selectedDepotGroupId = depotGroups.find((g) => g.name === label)?.id ?? null;
        await reload();
        render();
      },
    );
    groupDropdown.el.style.marginBottom = "8px";
    body.appendChild(groupDropdown.el);

    if (vehicles.length === 0) {
      const none = document.createElement("div");
      none.style.color = "var(--text-muted)";
      none.textContent = "This depot group owns no vehicles yet.";
      body.appendChild(none);
      return;
    }

    const today = todayDayIndex();

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "13px";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Fleet #", "Model", "Length", "Power", "Livery", "Condition", "Age", "Payment", "Lease remaining", "GreenRoad"]) {
      const th = document.createElement("th");
      th.textContent = label;
      th.style.textAlign = "left";
      th.style.borderBottom = "1px solid var(--border)";
      th.style.padding = "4px 6px";
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const vehicle of vehicles) {
      const model = findVehicleModel(vehicle.modelId);

      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid var(--border)";

      const cell = (text: string): HTMLTableCellElement => {
        const td = document.createElement("td");
        td.textContent = text;
        td.style.padding = "4px 6px";
        return td;
      };

      row.appendChild(cell(vehicle.fleetNumber));
      row.appendChild(cell(model?.name ?? vehicle.modelId));
      row.appendChild(cell(`${vehicle.lengthM}m`));
      row.appendChild(cell(vehicle.powerType));
      row.appendChild(cell(liveryName(vehicle.liveryId)));
      row.appendChild(cell(`${Math.round(vehicle.condition)}%`));
      row.appendChild(cell(vehicleAgeLabel(vehicle.boughtGameDay, today)));
      row.appendChild(cell(paymentMethodLabel(vehicle.paymentMethod)));
      row.appendChild(cell(leaseRemainingLabel(vehicle, today)));

      const greenroadCell = document.createElement("td");
      greenroadCell.style.padding = "4px 6px";
      const pendingBooking = retrofitBookings.find((b) => b.vehicleId === vehicle.id);
      if (vehicle.greenroadFitted) {
        greenroadCell.textContent = "Fitted";
      } else if (pendingBooking) {
        greenroadCell.textContent = `Fitting — ready day ${pendingBooking.readyGameDay}`;
      } else {
        const fitButton = document.createElement("button");
        fitButton.className = "btn";
        fitButton.textContent = `Fit — £${GREENROAD_OPTION.priceGBP}`;
        fitButton.addEventListener("click", async () => {
          fitButton.disabled = true;
          const bookedGameDay = todayDayIndex();
          // Real engineer scheduling (user request 2026-11-20: 14-day
          // lead time, 6 vehicles/night per depot group, dropping by 1
          // for each extra depot the engineer has to visit that night)
          // — every OTHER currently-pending booking in this same depot
          // group counts toward the contention, regardless of which
          // depot within the group each one is at.
          const alreadyScheduledInGroup: ScheduledGreenroadVisit[] = retrofitBookings
            .filter((b) => b.depotGroupId === vehicle.depotGroupId)
            .map((b) => ({ depotId: b.depotId, night: b.readyGameDay }));
          const readyGameDay = scheduleGreenroadRetrofit(bookedGameDay, vehicle.depotId, alreadyScheduledInGroup);
          // Charged at booking time (same convention as the airport-stop
          // purchase/route-advertising setup fee — stops-layer.ts), not
          // on collection once the engineer actually arrives.
          await window.finance.record(-GREENROAD_OPTION.priceGBP! * 100, "GreenRoad", vehicle.depotGroupId, `GreenRoad retrofit booked — fleet ${vehicle.fleetNumber}`, bookedGameDay);
          await window.greenroadRetrofit.create(vehicle.id, vehicle.depotId, vehicle.depotGroupId, bookedGameDay, readyGameDay);
          await reload();
          render();
        });
        greenroadCell.appendChild(fitButton);
      }
      row.appendChild(greenroadCell);

      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  }

  fleetListPanelState.open = () => {
    panel.style.display = "flex";
    void reload().then(() => render());
  };
  fleetListPanelState.close = () => {
    panel.style.display = "none";
  };
}
