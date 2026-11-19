// Vehicle re-power booking (T179, OPEN-ITEMS.md) — the UI half of
// repower-booking.mts's pure scheduling/eligibility logic. Deliberately
// mirrors repaint-shop-panel.ts's own "book a vehicle in" section (same
// Booked/In progress/Done states, same Cancel button while still
// pending), with two differences that section doesn't have: a dealer is
// never placed from this panel (dealer-placement.ts already owns that —
// this only reads `isRepowerSite` dealers), and a completed booking needs
// an explicit "Collect" step that actually converts the vehicle
// (collectRepowerBooking, db.mts) rather than just fading out.
//
// General options (battery size, pantograph charging, etc.) are
// deliberately NOT offered here yet — repowerOptionsFor exists in
// repower-booking.mts for a later options-UI pass, same scope cut this
// project's own repaint booking already makes (no options there either).
// This books and prices the base conversion only.
import { createDropdown } from "./dropdown";
import { gameClockState } from "./game-clock-engine";
import { gameDateTimeFromSeconds, formatGameDate, SECONDS_PER_DAY } from "./game-clock.mts";
import { findVehicleModel, repowerTargetsFor, type PowerType } from "./vehicle-catalogue.mts";
import { fullRepaintBasePriceGBP } from "./repaint-booking.mts";
import { combinedAwayWindows, type BookingWindow } from "./workshop-booking.mts";
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

export const repowerBookingPanelState: { open: (() => void) | null; close: (() => void) | null } = {
  open: null,
  close: null,
};

function todayDayIndex(): number {
  return Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
}

function formatDay(dayIndex: number): string {
  return formatGameDate(gameDateTimeFromSeconds(dayIndex * SECONDS_PER_DAY));
}

function vehicleLabel(v: Vehicle): string {
  return `${v.fleetNumber} — ${findVehicleModel(v.modelId)?.name ?? v.modelId}`;
}

// A diesel vehicle this panel can offer a re-power for right now: has a
// real electric/hydrogen variant at its own length (repowerTargetsFor),
// has cleared the age-or-condition gate, and its manufacturer currently
// has a dealer marked as the re-power site.
interface EligibleVehicle {
  vehicle: Vehicle;
  targets: PowerType[];
  dealer: Dealer;
}

function findEligibleVehicles(vehicles: readonly Vehicle[], dealers: readonly Dealer[], today: number): EligibleVehicle[] {
  const repowerSiteByManufacturer = new Map(dealers.filter((d) => d.isRepowerSite).map((d) => [d.manufacturer, d]));
  const result: EligibleVehicle[] = [];
  for (const vehicle of vehicles) {
    if (vehicle.powerType !== "diesel") continue;
    if (!repowerEligibleByAgeOrCondition(vehicle.boughtGameDay, today, vehicle.condition)) continue;
    // Real restriction, 2026-11-19: "Re-powering can't be done on leased
    // buses, only fully owned buses" — same silent-filter convention this
    // function already uses for the other eligibility checks above.
    if (!repowerEligibleByOwnership(vehicle.paymentMethod)) continue;
    const model = findVehicleModel(vehicle.modelId);
    if (!model) continue;
    const targets = repowerTargetsFor(model, vehicle.lengthM);
    if (targets.length === 0) continue;
    const dealer = repowerSiteByManufacturer.get(repowerManufacturerFor(vehicle.modelId));
    if (!dealer) continue;
    result.push({ vehicle, targets, dealer });
  }
  return result;
}

export function mountRepowerBookingPanel(): void {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "fixed";
  panel.style.top = "72px";
  panel.style.left = "50%";
  panel.style.transform = "translateX(-50%)";
  panel.style.zIndex = "1000";
  panel.style.width = "360px";
  panel.style.maxHeight = "80vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Re-power";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let bookingVehicleId: number | null = null;
  let bookingToPowerType: PowerType | null = null;
  let bundleRepaint = false;
  let errorMessage = "";

  async function render(): Promise<void> {
    body.replaceChildren();
    const today = todayDayIndex();

    if (!repowerUnlocked(gameClockState.accumulatedGameSeconds)) {
      const locked = document.createElement("div");
      locked.style.color = "var(--text-muted)";
      locked.textContent = "Re-powering unlocks 3 years into the game.";
      body.appendChild(locked);
      return;
    }

    const [vehicles, dealers, repaintBookings, repowerBookings, islandCheckDepots, islandCheckZones] = await Promise.all([
      window.vehicles.listAll(),
      window.dealers.list(),
      window.repaintBookings.listAll(),
      window.repowerBookings.listAll(),
      window.depots.list(),
      window.fareZones.listAll(),
    ]);
    const dealerById = new Map(dealers.map((d) => [d.id, d]));
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const section = document.createElement("div");
    section.style.borderBottom = "1px solid var(--border)";
    section.style.paddingBottom = "8px";
    section.style.marginBottom = "8px";
    const heading = document.createElement("div");
    heading.style.fontWeight = "600";
    heading.style.marginBottom = "4px";
    heading.textContent = "Book a re-power";
    section.appendChild(heading);

    const eligible = findEligibleVehicles(vehicles, dealers, today);
    if (eligible.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No vehicle is currently eligible — a diesel bus needs to be 5+ years old or under 70% condition, have a real electric/hydrogen variant at its own length, and its manufacturer needs a dealer marked as the re-power site.";
      section.appendChild(empty);
      body.appendChild(section);
      renderBookingsList(vehicleById, dealerById, repowerBookings, today);
      return;
    }

    if (bookingVehicleId === null || !eligible.some((e) => e.vehicle.id === bookingVehicleId)) bookingVehicleId = eligible[0].vehicle.id;
    const chosen = eligible.find((e) => e.vehicle.id === bookingVehicleId) ?? eligible[0];
    if (bookingToPowerType === null || !chosen.targets.includes(bookingToPowerType)) bookingToPowerType = chosen.targets[0];
    // A plain non-null local, since `bookingToPowerType` itself stays a
    // mutable outer `let` the dropdown callbacks below reassign — TS
    // can't carry the null-check narrowing through those closures.
    const toPowerType: PowerType = bookingToPowerType;

    const vehicleDropdown = createDropdown(
      eligible.map((e) => vehicleLabel(e.vehicle)),
      vehicleLabel(chosen.vehicle),
      (chosenLabel) => {
        const picked = eligible.find((e) => vehicleLabel(e.vehicle) === chosenLabel);
        if (picked) {
          bookingVehicleId = picked.vehicle.id;
          bookingToPowerType = null;
          void render();
        }
      },
    );
    section.appendChild(vehicleDropdown.el);

    if (chosen.targets.length > 1) {
      const powerLabels: Record<PowerType, string> = { diesel: "Diesel", electric: "Electric", hybrid: "Hybrid", hydrogen: "Hydrogen" };
      const powerDropdown = createDropdown(
        chosen.targets.map((t) => powerLabels[t]),
        powerLabels[toPowerType],
        (chosenLabel) => {
          bookingToPowerType = (Object.entries(powerLabels).find(([, l]) => l === chosenLabel)?.[0] ?? chosen.targets[0]) as PowerType;
          void render();
        },
      );
      section.appendChild(powerDropdown.el);
    }

    const model = findVehicleModel(chosen.vehicle.modelId);
    const basePriceGBP = model ? repowerBasePriceGBP(model, chosen.vehicle.lengthM, toPowerType) : null;

    const isWrightbusNewPower = chosen.dealer.manufacturer === "wrightbus";
    let bundleCheckbox: HTMLInputElement | null = null;
    if (isWrightbusNewPower) {
      const bundleRow = document.createElement("label");
      bundleRow.style.display = "flex";
      bundleRow.style.alignItems = "center";
      bundleRow.style.gap = "6px";
      bundleRow.style.marginTop = "6px";
      bundleCheckbox = document.createElement("input");
      bundleCheckbox.type = "checkbox";
      bundleCheckbox.checked = bundleRepaint;
      bundleCheckbox.addEventListener("change", () => {
        bundleRepaint = bundleCheckbox!.checked;
        void render();
      });
      bundleRow.appendChild(bundleCheckbox);
      bundleRow.appendChild(document.createTextNode("Also repaint while there (no extra time — it fits in the same visit)"));
      section.appendChild(bundleRow);
    } else {
      bundleRepaint = false;
    }

    if (basePriceGBP !== null) {
      const fullRepaintAwayBookings = repaintBookings.filter((b) => b.repaintType === "full").map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));
      const repowerAwayBookings = repowerBookings.map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));
      const groupCapBookings = combinedAwayWindows(vehicles, fullRepaintAwayBookings, repowerAwayBookings, chosen.vehicle.depotGroupId);
      const dealerBookings: BookingWindow[] = repowerBookings.filter((b) => b.dealerId === chosen.dealer.id).map((b) => ({ startDay: b.startGameDay, completionDay: b.completionGameDay }));
      const siteCapacity = REPOWER_CONCURRENT_CAPACITY[chosen.dealer.manufacturer];
      // Island away-cap, 2026-11-19 — see repaint-shop-panel.ts's own
      // identical comment for the full reasoning.
      const groupAwayCap = isIslandDepotGroup(chosen.vehicle.depotGroupId, islandCheckDepots, islandCheckZones) ? 1 : 2;
      const window_ = scheduleRepowerBooking(today, dealerBookings, siteCapacity, groupCapBookings, groupAwayCap);
      const repaintPriceGBP = isWrightbusNewPower ? fullRepaintBasePriceGBP(chosen.vehicle.modelId) : 0;
      const totalPriceGBP = basePriceGBP + (bundleRepaint ? repaintPriceGBP : 0);

      const detail = document.createElement("div");
      detail.style.color = "var(--text-muted)";
      detail.style.marginTop = "6px";
      detail.textContent = `${chosen.dealer.name} — ${formatDay(window_.startDay)} to ${formatDay(window_.completionDay)} — £${totalPriceGBP}${bundleRepaint ? ` (£${basePriceGBP} re-power + £${repaintPriceGBP} repaint)` : ""}`;
      section.appendChild(detail);

      const bookButton = document.createElement("button");
      bookButton.className = "btn";
      bookButton.style.marginTop = "6px";
      bookButton.textContent = "Book re-power";
      bookButton.addEventListener("click", () => {
        errorMessage = "";
        void window.repowerBookings
          .create(chosen.vehicle.id, chosen.dealer.id, toPowerType as "electric" | "hydrogen", basePriceGBP, today, window_.startDay, window_.completionDay)
          .then(async () => {
            if (bundleRepaint) {
              await window.repaintBookings.create(chosen.vehicle.id, null, "full", repaintPriceGBP, 0, repaintPriceGBP, today, window_.startDay, window_.completionDay);
            }
            bundleRepaint = false;
            await render();
          })
          .catch((err) => {
            errorMessage = err instanceof Error ? err.message : String(err);
            void render();
          });
      });
      section.appendChild(bookButton);
    }

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "6px";
      error.textContent = errorMessage;
      section.appendChild(error);
    }

    body.appendChild(section);
    renderBookingsList(vehicleById, dealerById, repowerBookings, today);
  }

  function renderBookingsList(vehicleById: Map<number, Vehicle>, dealerById: Map<number, Dealer>, bookings: RepowerBooking[], today: number): void {
    const listHeading = document.createElement("div");
    listHeading.style.fontWeight = "600";
    listHeading.style.marginBottom = "4px";
    listHeading.textContent = "Bookings";
    body.appendChild(listHeading);

    if (bookings.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No re-power bookings yet.";
      body.appendChild(empty);
      return;
    }

    for (const booking of bookings) {
      const row = document.createElement("div");
      row.style.borderTop = "1px solid var(--border)";
      row.style.paddingTop = "4px";
      row.style.marginTop = "4px";

      const vehicle = vehicleById.get(booking.vehicleId);
      const dealer = dealerById.get(booking.dealerId);
      const status = today < booking.startGameDay ? "Booked" : today > booking.completionGameDay ? "Done" : "In progress";

      const summary = document.createElement("div");
      summary.textContent = `${vehicle ? vehicleLabel(vehicle) : `Vehicle #${booking.vehicleId}`} — to ${booking.toPowerType} at ${dealer?.name ?? "an unknown dealer"}`;
      row.appendChild(summary);

      const detail = document.createElement("div");
      detail.style.color = "var(--text-muted)";
      detail.textContent = `${status} — ${formatDay(booking.startGameDay)} to ${formatDay(booking.completionGameDay)} — £${booking.finalPriceGBP}`;
      row.appendChild(detail);

      const actionButton = document.createElement("button");
      actionButton.className = "btn btn-icon";
      actionButton.style.marginTop = "2px";
      if (status === "Done") {
        actionButton.textContent = "Collect";
        actionButton.addEventListener("click", async () => {
          await window.repowerBookings.collect(booking.id);
          await render();
        });
      } else {
        actionButton.textContent = "Cancel";
        actionButton.addEventListener("click", async () => {
          await window.repowerBookings.delete(booking.id);
          await render();
        });
      }
      row.appendChild(actionButton);

      body.appendChild(row);
    }
  }

  repowerBookingPanelState.open = () => {
    panel.style.display = "flex";
    void render();
  };
  repowerBookingPanelState.close = () => {
    panel.style.display = "none";
  };
}
