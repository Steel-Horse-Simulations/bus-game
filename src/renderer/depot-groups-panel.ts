import { createDropdown, type Dropdown } from "./dropdown";
import { busStationsState } from "./stops-layer";
import { dutyPanelState } from "./duty-panel";
import { TICKET_MACHINE_PRICE_GBP, TAP_ON_TAP_OFF_PRICE_GBP_PER_VEHICLE, type TicketMachineTier } from "./ticket-machine.mts";
import { UPGRADABLE_TICKET_APP_PRICE_GBP, MOBILE_APP_LIVE_DATA_PRICE_GBP, UPGRADED_AVL_DATA_PRICE_GBP } from "./company-upgrades.mts";
import { gameClockState } from "./game-clock-engine";
import { SECONDS_PER_DAY } from "./game-clock.mts";

function todayDayIndex(): number {
  return Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
}

// Shared by every spend below (ticket machine tier, tap-on tap-off,
// company upgrades) — checks the real current balance (DESIGN.md §10's
// finance ledger) rather than trusting a stale figure, and records a
// real transaction only if it's actually affordable. Returns whether it
// went through, so the caller can revert its own UI control (checkbox/
// dropdown) on a decline rather than show the game accepting a purchase
// it couldn't pay for — "running out of money does not end the game,"
// but it also shouldn't silently go negative on a discretionary spend
// either.
async function trySpend(amountGBPPence: number, category: string, depotGroupId: number | null, description: string): Promise<boolean> {
  const balance = await window.finance.getBalance();
  if (balance < amountGBPPence) return false;
  await window.finance.record(-amountGBPPence, category, depotGroupId, description, todayDayIndex());
  return true;
}

const TICKET_MACHINE_TIER_LABELS: Record<TicketMachineTier, string> = {
  basic: "Basic",
  mid: "Mid",
  advanced: "Advanced",
};
const TICKET_MACHINE_TIER_BY_LABEL: Record<string, TicketMachineTier> = {
  Basic: "basic",
  Mid: "mid",
  Advanced: "advanced",
};

const NO_STATION_LABEL = "(none)";

// "name (#osmId)" rather than the bare name — two bus stations can share a
// name (or have no OSM name at all, falling back to "Bus station"), and the
// dropdown needs a unique label per option to tell them apart and to look
// one back up by its chosen label.
function stationLabel(station: { osmId: number; name: string }): string {
  return `${station.name} (#${station.osmId})`;
}

function mainBusStationDropdown(
  selectedOsmId: number | null,
  onChange: (osmId: number | null) => void,
): Dropdown {
  const options = [NO_STATION_LABEL, ...busStationsState.map(stationLabel)];
  const selected = busStationsState.find((s) => s.osmId === selectedOsmId);
  const dropdown = createDropdown(options, selected ? stationLabel(selected) : NO_STATION_LABEL, (value) => {
    if (value === NO_STATION_LABEL) return onChange(null);
    const station = busStationsState.find((s) => stationLabel(s) === value);
    onChange(station?.osmId ?? null);
  });
  return dropdown;
}

// Depot groups screen (OPERATIONS.md §1) — the first real save-data object
// with its own UI, rather than something shadowing imported OSM data. A
// depot group is just a name and a region until routes, depots and fare
// zones exist to hang off it.
//
// Must match electron/db.mts's REGIONS — duplicated here since the renderer
// can't import a plain value across the IPC boundary, only call it.
const REGIONS = [
  "North Scotland",
  "West Scotland",
  "East Scotland",
  "Shetland",
  "North England",
];

function regionDropdown(selected: string, onChange: (value: string) => void): Dropdown {
  return createDropdown(REGIONS, selected, onChange);
}

export function mountDepotGroupsPanel(): void {
  // top:8px/right:8px is also vehicle-simulation.ts's own Mon-Fri/Sat/Sun
  // day-type bar's corner (fixed top-right, mounted later in main.ts's own
  // boot order) — at equal z-index, this button lost the DOM-order
  // tiebreak to that bar and was completely hidden behind it, a real live
  // user report ("I can't see the button anymore") for the exact same
  // root cause route-panel.ts already had to fix once (56px comfortably
  // clears the bar's own measured 42px height from top:8px, same value
  // reused here for consistency rather than re-deriving it).
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Depot groups";
  toggle.style.position = "absolute";
  toggle.style.top = "56px";
  toggle.style.right = "8px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "88px";
  panel.style.right = "8px";
  panel.style.zIndex = "2";
  panel.style.width = "360px";
  panel.hidden = true;
  document.body.appendChild(panel);

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.classList.toggle("is-active", !panel.hidden);
    if (!panel.hidden) {
      void refresh();
      void refreshUpgradesSection();
      void refreshBalanceSection();
    }
  });

  const title = document.createElement("div");
  title.className = "panel-header";
  title.textContent = "Depot groups";
  panel.appendChild(title);

  // Finance ledger balance (DESIGN.md §10, first increment) — same
  // "piggyback on an existing panel rather than guess a new on-screen
  // position" reasoning as the upgrades section just below. A real
  // Finance screen (the full per-depot-group P&L DESIGN.md §10
  // describes) needs fare/contract/staff systems that don't exist yet
  // — this is just the one real number (the derived balance) and the
  // most recent few transactions, enough to see today's upgrade/ticket
  // machine spends actually take effect.
  const balanceSection = document.createElement("div");
  balanceSection.className = "panel-section";
  balanceSection.style.display = "flex";
  balanceSection.style.flexDirection = "column";
  balanceSection.style.gap = "4px";
  balanceSection.style.borderBottom = "1px solid var(--border)";
  const balanceLine = document.createElement("div");
  balanceLine.style.fontWeight = "600";
  const recentTransactions = document.createElement("div");
  recentTransactions.style.fontSize = "0.85em";
  recentTransactions.style.color = "var(--text-muted)";
  recentTransactions.style.display = "flex";
  recentTransactions.style.flexDirection = "column";
  recentTransactions.style.gap = "2px";
  balanceSection.appendChild(balanceLine);
  balanceSection.appendChild(recentTransactions);
  panel.appendChild(balanceSection);

  async function refreshBalanceSection(): Promise<void> {
    const balancePence = await window.finance.getBalance();
    balanceLine.textContent = `Balance: £${(balancePence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const recent = (await window.finance.list()).slice(0, 5);
    recentTransactions.innerHTML = "";
    for (const t of recent) {
      const line = document.createElement("div");
      const amount = t.amountGBPPence / 100;
      const sign = amount >= 0 ? "+" : "−";
      line.textContent = `${sign}£${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — ${t.description}`;
      recentTransactions.appendChild(line);
    }
  }

  // Company-wide one-off upgrades (TICKETING.md §4, second increment of
  // T66) — added here rather than its own new floating toggle button:
  // this screen region already has several real, previously-reported
  // button-overlap bugs from guessed pixel coordinates (fare-pricing-
  // panel.ts/repaint-shop-panel.ts's own comments), and these upgrades
  // are genuinely company-wide, not per depot group, so they don't fit
  // the per-group list below either — a clearly-separated section at
  // the top of this already-existing panel avoids guessing a new
  // on-screen position entirely.
  const upgradesSection = document.createElement("div");
  upgradesSection.className = "panel-section";
  upgradesSection.style.display = "flex";
  upgradesSection.style.flexDirection = "column";
  upgradesSection.style.gap = "4px";
  upgradesSection.style.borderBottom = "1px solid var(--border)";
  const upgradesHeading = document.createElement("div");
  upgradesHeading.className = "label-muted";
  upgradesHeading.style.fontWeight = "600";
  upgradesHeading.textContent = "Company-wide upgrades";
  upgradesSection.appendChild(upgradesHeading);

  const upgradesError = document.createElement("div");
  upgradesError.style.color = "var(--text-danger)";
  upgradesError.style.fontSize = "0.85em";
  upgradesError.style.display = "none";

  // Each upgrade is a one-off, non-refundable spend — unchecking never
  // costs or refunds anything (TICKETING.md §4 gives no un-buy
  // mechanism), so only switching ON ever calls trySpend; a decline
  // reverts the checkbox and leaves the stored flag untouched.
  function upgradeCheckboxRow(labelText: string, priceGBP: number, initiallyChecked: boolean, category: string, onBuy: (checked: boolean) => Promise<void>): HTMLElement {
    const row = document.createElement("label");
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.alignItems = "center";
    row.style.cursor = "pointer";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = initiallyChecked;
    checkbox.addEventListener("change", () => {
      void (async () => {
        upgradesError.style.display = "none";
        if (checkbox.checked) {
          const ok = await trySpend(priceGBP * 100, category, null, labelText);
          if (!ok) {
            upgradesError.textContent = `Not enough money — ${labelText} costs £${priceGBP.toLocaleString("en-GB")}.`;
            upgradesError.style.display = "block";
            checkbox.checked = false;
            return;
          }
        }
        await onBuy(checkbox.checked);
        if (checkbox.checked) await refreshBalanceSection();
      })();
    });
    const labelEl = document.createElement("span");
    labelEl.className = "label-muted";
    labelEl.textContent = `${labelText} (£${priceGBP.toLocaleString("en-GB")})`;
    row.appendChild(checkbox);
    row.appendChild(labelEl);
    return row;
  }

  async function refreshUpgradesSection(): Promise<void> {
    const upgrades = await window.companyUpgrades.get();
    upgradesSection.querySelectorAll("label").forEach((el) => el.remove());
    upgradesError.style.display = "none";
    upgradesSection.appendChild(
      upgradeCheckboxRow("Upgradable ticket app", UPGRADABLE_TICKET_APP_PRICE_GBP, upgrades.hasUpgradableTicketApp, "company_upgrade", (checked) =>
        window.companyUpgrades.setHasUpgradableTicketApp(checked),
      ),
    );
    upgradesSection.appendChild(
      upgradeCheckboxRow("Mobile app live bus data", MOBILE_APP_LIVE_DATA_PRICE_GBP, upgrades.hasMobileAppLiveData, "company_upgrade", (checked) =>
        window.companyUpgrades.setHasMobileAppLiveData(checked),
      ),
    );
    upgradesSection.appendChild(
      upgradeCheckboxRow("Upgraded AVL data", UPGRADED_AVL_DATA_PRICE_GBP, upgrades.hasUpgradedAvlData, "company_upgrade", (checked) =>
        window.companyUpgrades.setHasUpgradedAvlData(checked),
      ),
    );
    upgradesSection.appendChild(upgradesError);
  }
  panel.appendChild(upgradesSection);

  const list = document.createElement("div");
  list.className = "panel-section";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "1px";
  list.style.padding = "0";
  panel.appendChild(list);

  const addRow = document.createElement("div");
  addRow.className = "panel-section";
  addRow.style.display = "flex";
  addRow.style.flexDirection = "column";
  addRow.style.gap = "6px";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "field";
  nameInput.placeholder = "New depot group name";
  const addControls = document.createElement("div");
  addControls.style.display = "flex";
  addControls.style.gap = "6px";
  const newRegionDropdown = regionDropdown(REGIONS[0], () => {});
  newRegionDropdown.el.style.flex = "1";
  const addButton = document.createElement("button");
  addButton.className = "btn";
  addButton.textContent = "Add";
  addControls.appendChild(newRegionDropdown.el);
  addControls.appendChild(addButton);
  addRow.appendChild(nameInput);
  addRow.appendChild(addControls);
  panel.appendChild(addRow);

  // Live user report: "I can't make a new depot group" — the Add button's
  // handler had no error handling at all, so a failed create (most likely
  // `depot_groups.name`'s own UNIQUE constraint — db.mts — rejecting a
  // name that's already taken) threw an unhandled rejection with zero
  // visible feedback: clicking Add just silently did nothing. This surfaces
  // whatever the real error actually is instead of guessing at it.
  const addError = document.createElement("div");
  addError.style.color = "var(--text-danger)";
  addError.style.fontSize = "0.85em";
  addError.style.display = "none";
  panel.appendChild(addError);

  const refresh = async () => {
    const groups = await window.depotGroups.list();
    list.innerHTML = "";
    if (groups.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No depot groups yet.";
      empty.style.color = "var(--text-muted)";
      empty.style.padding = "8px";
      list.appendChild(empty);
    }
    for (const group of groups) {
      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = "column";
      wrapper.style.gap = "6px";
      wrapper.style.padding = "6px 0";
      wrapper.style.borderBottom = "1px solid var(--border)";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "6px";
      row.style.alignItems = "center";

      const nameField = document.createElement("input");
      nameField.type = "text";
      nameField.className = "field";
      nameField.value = group.name;
      nameField.style.flex = "1";
      nameField.addEventListener("change", () => {
        void window.depotGroups.rename(group.id, nameField.value);
      });

      const region = regionDropdown(group.region, (value) => {
        void window.depotGroups.setRegion(group.id, value);
      });
      region.el.style.flex = "1";
      region.el.style.minWidth = "0";

      const dutiesButton = document.createElement("button");
      dutiesButton.className = "btn btn-icon";
      dutiesButton.textContent = "Duties";
      dutiesButton.title = "Build this depot group's vehicle duties (OPERATIONS.md §7)";
      dutiesButton.addEventListener("click", () => {
        dutyPanelState.openForDepotGroup?.(group.id, group.name);
      });

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon btn-danger";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete depot group";
      deleteButton.addEventListener("click", async () => {
        await window.depotGroups.delete(group.id);
        await refresh();
      });

      row.appendChild(nameField);
      row.appendChild(region.el);
      row.appendChild(dutiesButton);
      row.appendChild(deleteButton);

      // The direction rule's reference point (DESIGN.md §6) — manual only,
      // no auto-derivation exists (OPEN-ITEMS.md). A route can't be saved
      // with a direction until this is set.
      const stationRow = document.createElement("div");
      stationRow.style.display = "flex";
      stationRow.style.gap = "6px";
      stationRow.style.alignItems = "center";
      const stationLabelEl = document.createElement("span");
      stationLabelEl.className = "label-muted";
      stationLabelEl.textContent = "Main bus station";
      stationLabelEl.style.flexShrink = "0";
      const station = mainBusStationDropdown(group.mainBusStationOsmId, (osmId) => {
        void window.depotGroups.setMainBusStation(group.id, osmId);
      });
      station.el.style.flex = "1";
      station.el.style.minWidth = "0";
      stationRow.appendChild(stationLabelEl);
      stationRow.appendChild(station.el);

      // Ticket machine tier + tap-on tap-off (TICKETING.md §1/§2, first
      // increment, 2026-11-05) — one tier per depot group (a bulk
      // setting, not per vehicle), with its real £/vehicle price shown
      // for information only. Nothing is actually deducted (no finance
      // system exists yet) and no install-time scheduling exists either
      // — both deliberately deferred, see depot_groups' own CREATE
      // TABLE comment in db.mts.
      const ticketRow = document.createElement("div");
      ticketRow.style.display = "flex";
      ticketRow.style.gap = "6px";
      ticketRow.style.alignItems = "center";
      const ticketLabelEl = document.createElement("span");
      ticketLabelEl.className = "label-muted";
      ticketLabelEl.textContent = "Ticket machines";
      ticketLabelEl.style.flexShrink = "0";
      const groupError = document.createElement("div");
      groupError.style.color = "var(--text-danger)";
      groupError.style.fontSize = "0.85em";
      groupError.style.display = "none";

      const tierDropdown = createDropdown(Object.values(TICKET_MACHINE_TIER_LABELS), TICKET_MACHINE_TIER_LABELS[group.ticketMachineTier], (label) => {
        void (async () => {
          const tier = TICKET_MACHINE_TIER_BY_LABEL[label] ?? "basic";
          const oldPrice = TICKET_MACHINE_PRICE_GBP[group.ticketMachineTier];
          const newPrice = TICKET_MACHINE_PRICE_GBP[tier];
          groupError.style.display = "none";
          // TICKETING.md §1: Advanced is "a completely new machine (full
          // replacement, not an upgrade path)," so moving to a higher
          // tier always charges that tier's own full per-vehicle price —
          // never a discount for whatever tier it's replacing. Moving to
          // a LOWER tier (a real but unusual choice — no refund exists
          // in the real spec) costs nothing, same as re-selecting the
          // current tier.
          if (newPrice > oldPrice) {
            const vehicleCount = (await window.vehicles.listForDepotGroup(group.id)).length;
            const cost = newPrice * vehicleCount;
            const ok = await trySpend(cost * 100, "ticket_machine", group.id, `${group.name}: upgrade to ${TICKET_MACHINE_TIER_LABELS[tier]} ticket machines (${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"})`);
            if (!ok) {
              groupError.textContent = `Not enough money — upgrading ${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"} to ${TICKET_MACHINE_TIER_LABELS[tier]} costs £${cost.toLocaleString("en-GB")}.`;
              groupError.style.display = "block";
              tierDropdown.value = TICKET_MACHINE_TIER_LABELS[group.ticketMachineTier];
              return;
            }
          }
          await window.depotGroups.setTicketMachineTier(group.id, tier);
          await refresh();
          await refreshBalanceSection();
        })();
      });
      tierDropdown.el.style.flex = "1";
      tierDropdown.el.style.minWidth = "0";
      const tierPrice = document.createElement("span");
      tierPrice.className = "label-muted";
      tierPrice.style.flexShrink = "0";
      tierPrice.style.fontSize = "0.85em";
      tierPrice.textContent = `£${TICKET_MACHINE_PRICE_GBP[group.ticketMachineTier]}/vehicle`;
      ticketRow.appendChild(ticketLabelEl);
      ticketRow.appendChild(tierDropdown.el);
      ticketRow.appendChild(tierPrice);

      const tapOnTapOffRow = document.createElement("label");
      tapOnTapOffRow.style.display = "flex";
      tapOnTapOffRow.style.gap = "6px";
      tapOnTapOffRow.style.alignItems = "center";
      tapOnTapOffRow.style.cursor = "pointer";
      const tapOnTapOffCheckbox = document.createElement("input");
      tapOnTapOffCheckbox.type = "checkbox";
      tapOnTapOffCheckbox.checked = group.hasTapOnTapOff;
      tapOnTapOffCheckbox.addEventListener("change", () => {
        void (async () => {
          groupError.style.display = "none";
          const turningOn = tapOnTapOffCheckbox.checked;
          // Switching off has no real cost (no refund exists in the real
          // spec either) — only switching on actually spends anything.
          if (turningOn) {
            const vehicleCount = (await window.vehicles.listForDepotGroup(group.id)).length;
            const cost = TAP_ON_TAP_OFF_PRICE_GBP_PER_VEHICLE * vehicleCount;
            const ok = await trySpend(cost * 100, "tap_on_tap_off", group.id, `${group.name}: fit tap-on tap-off (${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"})`);
            if (!ok) {
              groupError.textContent = `Not enough money — fitting ${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"} costs £${cost.toLocaleString("en-GB")}.`;
              groupError.style.display = "block";
              tapOnTapOffCheckbox.checked = false;
              return;
            }
          }
          await window.depotGroups.setTapOnTapOff(group.id, turningOn);
          await refresh();
          await refreshBalanceSection();
        })();
      });
      const tapOnTapOffLabelEl = document.createElement("span");
      tapOnTapOffLabelEl.className = "label-muted";
      tapOnTapOffLabelEl.textContent = `Tap-on tap-off (£${TAP_ON_TAP_OFF_PRICE_GBP_PER_VEHICLE}/vehicle)`;
      tapOnTapOffRow.appendChild(tapOnTapOffCheckbox);
      tapOnTapOffRow.appendChild(tapOnTapOffLabelEl);

      // The group's own colour (T154, confirmed 2026-11-07) — earmarked
      // for a second branding-mask region on the Sightseeing livery,
      // data side only for now, same honesty pattern as route branding.
      const colourRow = document.createElement("label");
      colourRow.style.display = "flex";
      colourRow.style.gap = "6px";
      colourRow.style.alignItems = "center";
      colourRow.style.cursor = "pointer";
      const colourLabelEl = document.createElement("span");
      colourLabelEl.className = "label-muted";
      colourLabelEl.textContent = "Colour";
      const colourInput = document.createElement("input");
      colourInput.type = "color";
      colourInput.value = group.colour;
      colourInput.style.width = "40px";
      colourInput.style.padding = "0";
      colourInput.addEventListener("change", () => {
        void window.depotGroups.setColour(group.id, colourInput.value);
      });
      colourRow.appendChild(colourLabelEl);
      colourRow.appendChild(colourInput);

      wrapper.appendChild(row);
      wrapper.appendChild(stationRow);
      wrapper.appendChild(ticketRow);
      wrapper.appendChild(tapOnTapOffRow);
      wrapper.appendChild(colourRow);
      wrapper.appendChild(groupError);
      list.appendChild(wrapper);
    }
    const rows = list.querySelectorAll<HTMLDivElement>(":scope > div");
    const last = rows[rows.length - 1];
    if (last) last.style.borderBottom = "none";
  };

  addButton.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    addError.style.display = "none";
    try {
      await window.depotGroups.create(name, newRegionDropdown.value);
      nameInput.value = "";
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addError.textContent = message.includes("UNIQUE constraint failed")
        ? `A depot group named "${name}" already exists.`
        : `Couldn't create the depot group: ${message}`;
      addError.style.display = "block";
    }
  });
}
