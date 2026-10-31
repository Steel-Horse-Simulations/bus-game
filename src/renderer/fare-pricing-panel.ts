// Fare pricing settings (DESIGN.md §9, Phase 4 increment 2b) — the
// persistence/UI layer for fare-pricing.mts's own pure calculation
// functions (increment 2a). Every rate here is player-set per depot group
// (DESIGN.md: "bands set by the player"), stored as whole pence
// (fare_configs' own SCHEMA comment in db.mts) but edited here in pounds,
// since nobody wants to type "240" to mean £2.40.
import { createDropdown } from "./dropdown";

function penceToPoundsString(pence: number | null): string {
  if (pence === null) return "";
  return (pence / 100).toFixed(2);
}

// Returns null for an empty/invalid input — the caller treats that as
// "leave this field unset", not "set it to zero", since a £0.00 fare and
// an unconfigured one mean different things (fare-pricing.mts throws on
// the latter, deliberately, rather than silently charging nothing).
function poundsStringToPence(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const pounds = Number(trimmed);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

export async function mountFarePricingPanel(): Promise<void> {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Fare pricing";
  toggle.style.position = "absolute";
  toggle.style.bottom = "8px";
  // Confirmed live (2026-10-31) that 1400px overlapped "Place stop"
  // (1379.9-1456px) — every other bottom toggle button's own real
  // rendered position was measured first this time, not guessed; 1600px
  // sits clear of "Hidden stops", the rightmost existing button, which
  // ends at 1576px.
  toggle.style.left = "1600px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "8px";
  panel.style.left = "330px";
  panel.style.zIndex = "2";
  panel.style.width = "480px";
  panel.style.maxHeight = "85vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Fare pricing";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let depotGroups: DepotGroup[] = [];
  let selectedDepotGroupId: number | null = null;
  let config: FareConfig | null = null;
  let bands: CountryZoneBand[] = [];
  let errorMessage = "";

  function currentDepotGroup(): DepotGroup | undefined {
    return depotGroups.find((g) => g.id === selectedDepotGroupId);
  }

  async function reloadConfig(): Promise<void> {
    if (selectedDepotGroupId === null) {
      config = null;
      bands = [];
      return;
    }
    [config, bands] = await Promise.all([
      window.farePricing.getConfig(selectedDepotGroupId),
      window.farePricing.listCountryZoneBands(selectedDepotGroupId),
    ]);
  }

  function showError(err: unknown): void {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // One label + £ input + Set button, sharing the save/error/re-render
  // plumbing every field below needs — reduces this panel's own 18 fields
  // plus the band table to one repeated shape instead of 18 near-copies.
  function moneyField(container: HTMLElement, label: string, currentPence: number | null, onSet: (pence: number | null) => Promise<void>): void {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.padding = "3px 0";

    const labelEl = document.createElement("span");
    labelEl.style.flex = "1";
    labelEl.style.fontSize = "12px";
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const prefix = document.createElement("span");
    prefix.className = "label-muted";
    prefix.textContent = "£";
    row.appendChild(prefix);

    const input = document.createElement("input");
    input.className = "field";
    input.type = "number";
    input.step = "0.01";
    input.min = "0";
    input.placeholder = "not set";
    input.value = penceToPoundsString(currentPence);
    input.style.width = "80px";
    row.appendChild(input);

    const setButton = document.createElement("button");
    setButton.className = "btn";
    setButton.textContent = "Set";
    setButton.addEventListener("click", async () => {
      try {
        await onSet(poundsStringToPence(input.value));
        errorMessage = "";
        await reloadConfig();
      } catch (err) {
        showError(err);
      }
      render();
    });
    row.appendChild(setButton);

    container.appendChild(row);
  }

  function sectionHeading(container: HTMLElement, text: string): void {
    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.style.marginTop = "12px";
    heading.style.fontWeight = "600";
    heading.textContent = text;
    container.appendChild(heading);
  }

  function render(): void {
    body.replaceChildren();

    if (depotGroups.length === 0) {
      const note = document.createElement("div");
      note.style.color = "var(--text-muted)";
      note.textContent = "Create a depot group first — fares belong to one.";
      body.appendChild(note);
      return;
    }

    const groupLabel = document.createElement("div");
    groupLabel.className = "label-muted";
    groupLabel.textContent = "Depot group";
    body.appendChild(groupLabel);

    const groupDropdown = createDropdown(
      depotGroups.map((g) => g.name),
      currentDepotGroup()?.name ?? depotGroups[0].name,
      async (name) => {
        selectedDepotGroupId = depotGroups.find((g) => g.name === name)?.id ?? null;
        await reloadConfig();
        render();
      },
    );
    groupDropdown.el.style.marginBottom = "8px";
    body.appendChild(groupDropdown.el);

    if (!config) return;
    const cfg = config;
    const groupId = selectedDepotGroupId!;

    sectionHeading(body, "Single fares");
    moneyField(body, "City (flat)", cfg.citySingleGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { citySingleGBPPence: pence }),
    );
    moneyField(body, "Beyond depot group (per mile)", cfg.beyondDepotGroupPerMileGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { beyondDepotGroupPerMileGBPPence: pence }),
    );
    moneyField(body, "Long distance — base fare", cfg.longDistanceBaseGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { longDistanceBaseGBPPence: pence }),
    );
    moneyField(body, "Long distance — per mile", cfg.longDistancePerMileGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { longDistancePerMileGBPPence: pence }),
    );
    moneyField(body, "Special service (flat)", cfg.specialServiceSingleGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { specialServiceSingleGBPPence: pence }),
    );
    moneyField(body, "Night — extra base fee", cfg.nightExtraBaseGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { nightExtraBaseGBPPence: pence }),
    );
    moneyField(body, "Night — extra per zone", cfg.nightExtraPerZoneGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { nightExtraPerZoneGBPPence: pence }),
    );

    sectionHeading(body, "Country zone bands");
    const bandsNote = document.createElement("div");
    bandsNote.style.fontSize = "11px";
    bandsNote.style.color = "var(--text-muted)";
    bandsNote.textContent = "One price per exact zone count — e.g. set zones 2 and 3 to the same price to band them together.";
    body.appendChild(bandsNote);

    for (const band of bands) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.padding = "3px 0";

      const label = document.createElement("span");
      label.style.flex = "1";
      label.style.fontSize = "12px";
      label.textContent = `${band.zoneCount} zone${band.zoneCount === 1 ? "" : "s"}`;
      row.appendChild(label);

      const prefix = document.createElement("span");
      prefix.className = "label-muted";
      prefix.textContent = "£";
      row.appendChild(prefix);

      const input = document.createElement("input");
      input.className = "field";
      input.type = "number";
      input.step = "0.01";
      input.min = "0";
      input.value = penceToPoundsString(band.priceGBPPence);
      input.style.width = "80px";
      row.appendChild(input);

      const setButton = document.createElement("button");
      setButton.className = "btn";
      setButton.textContent = "Set";
      setButton.addEventListener("click", async () => {
        const pence = poundsStringToPence(input.value);
        if (pence === null) {
          errorMessage = "Give the band a price.";
          render();
          return;
        }
        await window.farePricing.setCountryZoneBand(groupId, band.zoneCount, pence);
        errorMessage = "";
        await reloadConfig();
        render();
      });
      row.appendChild(setButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        await window.farePricing.deleteCountryZoneBand(groupId, band.zoneCount);
        await reloadConfig();
        render();
      });
      row.appendChild(deleteButton);

      body.appendChild(row);
    }

    const addBandRow = document.createElement("div");
    addBandRow.style.display = "flex";
    addBandRow.style.alignItems = "center";
    addBandRow.style.gap = "6px";
    addBandRow.style.padding = "4px 0";
    const zoneCountInput = document.createElement("input");
    zoneCountInput.className = "field";
    zoneCountInput.type = "number";
    zoneCountInput.min = "1";
    zoneCountInput.placeholder = "zone count";
    zoneCountInput.style.width = "90px";
    const priceInput = document.createElement("input");
    priceInput.className = "field";
    priceInput.type = "number";
    priceInput.step = "0.01";
    priceInput.min = "0";
    priceInput.placeholder = "£ price";
    priceInput.style.width = "80px";
    const addButton = document.createElement("button");
    addButton.className = "btn";
    addButton.textContent = "Add band";
    addButton.addEventListener("click", async () => {
      const zoneCount = Math.round(Number(zoneCountInput.value));
      const pence = poundsStringToPence(priceInput.value);
      if (!Number.isFinite(zoneCount) || zoneCount <= 0 || pence === null) {
        errorMessage = "Give the new band a zone count and a price.";
        render();
        return;
      }
      await window.farePricing.setCountryZoneBand(groupId, zoneCount, pence);
      errorMessage = "";
      await reloadConfig();
      render();
    });
    addBandRow.append(zoneCountInput, priceInput, addButton);
    body.appendChild(addBandRow);

    sectionHeading(body, "Ticket families");
    moneyField(body, "LATE", cfg.lateGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { lateGBPPence: pence }));
    moneyField(body, "NETWORK", cfg.networkGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { networkGBPPence: pence }));

    sectionHeading(body, "Capping / Day, Weekly, 28-day (city)");
    moneyField(body, "City — Day", cfg.cityDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { cityDayGBPPence: pence }));
    moneyField(body, "City — Weekly", cfg.cityWeeklyGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { cityWeeklyGBPPence: pence }));
    moneyField(body, "City — 28-day", cfg.city28DayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { city28DayGBPPence: pence }));

    sectionHeading(body, "Capping / Day, Weekly, 28-day (country)");
    moneyField(body, "Country — Day", cfg.countryDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { countryDayGBPPence: pence }));
    moneyField(body, "Country — Weekly", cfg.countryWeeklyGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { countryWeeklyGBPPence: pence }));
    moneyField(body, "Country — 28-day", cfg.country28DayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { country28DayGBPPence: pence }));

    sectionHeading(body, "Capping / Day, Weekly, 28-day (city + country combined)");
    moneyField(body, "Combined — Day", cfg.combinedDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { combinedDayGBPPence: pence }));
    moneyField(body, "Combined — Weekly", cfg.combinedWeeklyGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { combinedWeeklyGBPPence: pence }));
    moneyField(body, "Combined — 28-day", cfg.combined28DayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { combined28DayGBPPence: pence }));

    const cappingNote = document.createElement("div");
    cappingNote.style.fontSize = "11px";
    cappingNote.style.color = "var(--text-muted)";
    cappingNote.style.marginTop = "6px";
    cappingNote.textContent = "These Day/Weekly/28-day prices also double as the automatic capping thresholds (DESIGN.md §9) — there's no separate cap figure to set.";
    body.appendChild(cappingNote);

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "8px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  let panelOpen = false;
  toggle.addEventListener("click", async () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) {
      depotGroups = await window.depotGroups.list();
      if (selectedDepotGroupId === null) selectedDepotGroupId = depotGroups[0]?.id ?? null;
      await reloadConfig();
      render();
    }
  });
}
