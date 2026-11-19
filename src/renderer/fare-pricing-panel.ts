// Fare pricing settings (DESIGN.md §9, Phase 4 increment 2b) — the
// persistence/UI layer for fare-pricing.mts's own pure calculation
// functions (increment 2a). Every rate here is player-set per depot group
// (DESIGN.md: "bands set by the player"), stored as whole pence
// (fare_configs' own SCHEMA comment in db.mts) but edited here in pounds,
// since nobody wants to type "240" to mean £2.40.
//
// Reworked 2026-10-31 after a live user design discussion:
// (1) Fields are now gated on whether the depot group actually has a zone
//     of that type — a depot group with no city zones (Skye) doesn't need
//     city fields cluttering the panel. (2) Any field the depot group
//     genuinely needs but hasn't set yet is surfaced two ways: the
//     toggle button gets a red border if ANY depot group is missing
//     something, and the depot-group dropdown marks each affected group
//     with a 🔴 prefix — `createDropdown` only takes plain strings, so
//     this is a label prefix, not a drawn ring, the simplest way to get
//     a real visual marker without changing a shared component many
//     other panels also use. (3) Airport Express replaces "special
//     service" with its own Single/Return. (4) NETWORK is no longer
//     player-typed at all — it's a percentage markup on the Combined
//     price, computed and shown read-only (fare-pricing.mts's
//     networkFareGBPPence). (5) Sightseeing gained its own two prices,
//     per DESIGN.md's already-specified shape.
//
// Reworked again the same day (route types): Night/Airport Express/
// Sightseeing/Long-distance sections are no longer a manual toggle or
// shown unconditionally — each is gated on the depot group actually
// having a route of that type (routes.routeType), the same derived
// principle City/Country/Island zones already used. The old "runs night
// services" checkbox is gone entirely; routes drive it now.
import { createDropdown } from "./dropdown";
import { networkFareGBPPence, townFareGBPPence } from "./fare-pricing.mts";
import { setMenuOpen } from "./menu-visibility";

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

function formatPence(pence: number | null): string {
  return pence === null ? "—" : `£${(pence / 100).toFixed(2)}`;
}

const MISSING_MARKER = "🔴 ";

// The one shared rule behind both field visibility (render, below) and
// the missing-field indicator — a depot group's own real zones/routes
// decide what it actually needs, so the two can never disagree about
// what "needed" means. Reworked 2026-10-31 (route types): Night/Airport
// Express/Sightseeing/Long-distance are no longer manual toggles or
// shown unconditionally — each is gated on the depot group actually
// having a route of that type (routes.routeType), the same derived
// principle this already used for City/Country/Island zones.
export function fareRequirements(zones: FareZone[], routes: Route[], config: FareConfig) {
  const hasCity = zones.some((z) => z.zoneType === "city");
  const hasCountry = zones.some((z) => z.zoneType === "country");
  const hasIsland = zones.some((z) => z.zoneType === "island");
  const needsNight = routes.some((r) => r.routeType === "night");
  return {
    hasCity,
    hasCountry,
    hasIsland,
    needsCombined: hasCity && hasCountry,
    needsNetwork: hasCity && hasCountry && zones.length > 3,
    needsNight,
    needsIslandNight: needsNight && hasIsland,
    needsAirportExpress: routes.some((r) => r.routeType === "airport_express"),
    needsSightseeing: routes.some((r) => r.routeType === "sightseeing"),
    needsLongDistance: routes.some((r) => r.routeType === "long_distance"),
  };
}

export function missingFields(zones: FareZone[], routes: Route[], bands: CountryZoneBand[], islandBands: IslandZoneBand[], config: FareConfig): string[] {
  const req = fareRequirements(zones, routes, config);
  const missing: string[] = [];
  if (req.hasCity) {
    if (config.citySingleGBPPence === null) missing.push("City single fare");
    if (config.cityDayGBPPence === null) missing.push("City Day");
    if (config.cityWeeklyGBPPence === null) missing.push("City Weekly");
  }
  if (req.hasCountry) {
    if (bands.length === 0) missing.push("Country zone bands");
    if (config.countryDayGBPPence === null) missing.push("Country Day");
    if (config.countryWeeklyGBPPence === null) missing.push("Country Weekly");
  }
  if (req.needsCombined) {
    if (config.combinedDayGBPPence === null) missing.push("Combined Day");
    if (config.combinedWeeklyGBPPence === null) missing.push("Combined Weekly");
  }
  if (req.needsNetwork && config.networkMarkupPercent === null) missing.push("Network markup");
  if (req.needsNight) {
    if (config.nightExtraBaseGBPPence === null) missing.push("Night extra base fee");
    if (config.nightExtraPerZoneGBPPence === null) missing.push("Night extra per zone");
    if (config.lateGBPPence === null) missing.push("LATE");
  }
  if (req.hasIsland) {
    if (islandBands.length === 0) missing.push("Island zone bands");
    if (config.islandDayGBPPence === null) missing.push("Island Day");
    if (config.islandWeeklyGBPPence === null) missing.push("Island Weekly");
  }
  if (req.needsIslandNight && config.islandLateGBPPence === null) missing.push("Island LATE");
  if (req.needsAirportExpress) {
    if (config.airportExpressSingleGBPPence === null) missing.push("Airport Express Single");
    if (config.airportExpressReturnGBPPence === null) missing.push("Airport Express Return");
  }
  if (req.needsSightseeing) {
    if (config.sightseeingDayGBPPence === null) missing.push("Sightseeing day ticket");
    if (config.sightseeingSingleGBPPence === null) missing.push("Sightseeing single");
  }
  if (req.needsLongDistance) {
    if (config.longDistanceBaseGBPPence === null) missing.push("Long distance base fare");
    if (config.longDistancePerMileGBPPence === null) missing.push("Long distance per mile");
  }
  return missing;
}

// Shown/hidden by the Fares section of the bottom bar (fares-screen.ts),
// not its own floating toggle button any more (T165 — same "get all menus
// working" conversion T162 already did for Fleet's three sub-screens).
// `onMissingFieldsChanged` lets fares-screen.ts's own tab button show the
// red-border warning this panel's old standalone toggle button used to
// carry directly (missingFields's own header comment below) — it's a
// callback, not a plain boolean, since the real recompute only ever
// happens from inside this module (reloadMissingIndicators).
export const farePricingPanelState: {
  open: (() => void) | null;
  close: (() => void) | null;
  onMissingFieldsChanged: ((anyMissing: boolean) => void) | null;
} = { open: null, close: null, onMissingFieldsChanged: null };

export async function mountFarePricingPanel(): Promise<void> {
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
  let islandBands: IslandZoneBand[] = [];
  let zones: FareZone[] = [];
  let routes: Route[] = [];
  // Missing-field count per depot group, across ALL groups — drives the
  // toggle's red border and the dropdown's 🔴 markers. Recomputed
  // whenever anything is saved, not just on panel open, so the markers
  // never go stale while the panel stays open.
  let missingByGroup = new Map<number, string[]>();
  let errorMessage = "";

  function currentDepotGroup(): DepotGroup | undefined {
    return depotGroups.find((g) => g.id === selectedDepotGroupId);
  }

  async function reloadMissingIndicators(): Promise<void> {
    const allRoutes = await window.routes.list();
    const entries = await Promise.all(
      depotGroups.map(async (g) => {
        const [groupZones, groupConfig, groupBands, groupIslandBands] = await Promise.all([
          window.fareZones.listForDepotGroup(g.id),
          window.farePricing.getConfig(g.id),
          window.farePricing.listCountryZoneBands(g.id),
          window.farePricing.listIslandZoneBands(g.id),
        ]);
        const groupRoutes = allRoutes.filter((r) => r.depotGroupId === g.id);
        return [g.id, missingFields(groupZones, groupRoutes, groupBands, groupIslandBands, groupConfig)] as const;
      }),
    );
    missingByGroup = new Map(entries);
    const anyMissing = [...missingByGroup.values()].some((m) => m.length > 0);
    farePricingPanelState.onMissingFieldsChanged?.(anyMissing);
  }

  async function reloadConfig(): Promise<void> {
    if (selectedDepotGroupId === null) {
      config = null;
      bands = [];
      islandBands = [];
      zones = [];
      routes = [];
      return;
    }
    let allRoutes: Route[];
    [config, bands, islandBands, zones, allRoutes] = await Promise.all([
      window.farePricing.getConfig(selectedDepotGroupId),
      window.farePricing.listCountryZoneBands(selectedDepotGroupId),
      window.farePricing.listIslandZoneBands(selectedDepotGroupId),
      window.fareZones.listForDepotGroup(selectedDepotGroupId),
      window.routes.list(),
    ]);
    routes = allRoutes.filter((r) => r.depotGroupId === selectedDepotGroupId);
    await reloadMissingIndicators();
  }

  function showError(err: unknown): void {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // One label + £ input + Set button, sharing the save/error/re-render
  // plumbing every field below needs.
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

  // Shared by Country's and Island's own zone-band editors (T107 — Island
  // bands are a separate table from Country's, never priced against one
  // another, but the editing UI itself — one price per exact zone count,
  // add/edit/delete — is identical, so this is the one shared component
  // rather than a second near-copy of the same ~90 lines.
  function zoneBandEditor(
    container: HTMLElement,
    bands: CountryZoneBand[] | IslandZoneBand[],
    setBand: (zoneCount: number, priceGBPPence: number) => Promise<void>,
    deleteBand: (zoneCount: number) => Promise<void>,
  ): void {
    const bandsNote = document.createElement("div");
    bandsNote.style.fontSize = "11px";
    bandsNote.style.color = "var(--text-muted)";
    bandsNote.textContent = "One price per exact zone count — e.g. set zones 2 and 3 to the same price to band them together.";
    container.appendChild(bandsNote);

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
        await setBand(band.zoneCount, pence);
        errorMessage = "";
        await reloadConfig();
        render();
      });
      row.appendChild(setButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        await deleteBand(band.zoneCount);
        await reloadConfig();
        render();
      });
      row.appendChild(deleteButton);

      container.appendChild(row);
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
      await setBand(zoneCount, pence);
      errorMessage = "";
      await reloadConfig();
      render();
    });
    addBandRow.append(zoneCountInput, priceInput, addButton);
    container.appendChild(addBandRow);
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

    // 🔴-prefixed labels for any group with something missing — see
    // missingFields's own header comment for why this is a plain string
    // prefix rather than a drawn marker.
    const groupOptions = depotGroups.map((g) => ({
      group: g,
      label: (missingByGroup.get(g.id)?.length ?? 0) > 0 ? `${MISSING_MARKER}${g.name}` : g.name,
    }));
    const selectedOption = groupOptions.find((o) => o.group.id === selectedDepotGroupId) ?? groupOptions[0];
    const groupDropdown = createDropdown(
      groupOptions.map((o) => o.label),
      selectedOption.label,
      async (label) => {
        selectedDepotGroupId = groupOptions.find((o) => o.label === label)?.group.id ?? null;
        await reloadConfig();
        render();
      },
    );
    groupDropdown.el.style.marginBottom = "8px";
    body.appendChild(groupDropdown.el);

    if (!config) return;
    const cfg = config;
    const groupId = selectedDepotGroupId!;
    const req = fareRequirements(zones, routes, cfg);

    sectionHeading(body, "Single fares");
    if (req.hasCity) {
      moneyField(body, "City (flat)", cfg.citySingleGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { citySingleGBPPence: pence }),
      );
    }
    moneyField(body, "Beyond depot group (per mile)", cfg.beyondDepotGroupPerMileGBPPence, (pence) =>
      window.farePricing.setConfigFields(groupId, { beyondDepotGroupPerMileGBPPence: pence }),
    );

    if (req.needsLongDistance) {
      moneyField(body, "Long distance — base fare", cfg.longDistanceBaseGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { longDistanceBaseGBPPence: pence }),
      );
      moneyField(body, "Long distance — per mile", cfg.longDistancePerMileGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { longDistancePerMileGBPPence: pence }),
      );
    }

    if (req.hasCountry) {
      sectionHeading(body, "Country zone bands");
      zoneBandEditor(
        body,
        bands,
        (zoneCount, pence) => window.farePricing.setCountryZoneBand(groupId, zoneCount, pence),
        (zoneCount) => window.farePricing.deleteCountryZoneBand(groupId, zoneCount),
      );
    }

    if (req.needsAirportExpress) {
      sectionHeading(body, "Airport Express");
      const airportNote = document.createElement("div");
      airportNote.style.fontSize = "11px";
      airportNote.style.color = "var(--text-muted)";
      airportNote.textContent = "The player-flaggable airport route type (DESIGN.md §10) — Return is its own price, not the standard Return formula.";
      body.appendChild(airportNote);
      moneyField(body, "Single", cfg.airportExpressSingleGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { airportExpressSingleGBPPence: pence }),
      );
      moneyField(body, "Return", cfg.airportExpressReturnGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { airportExpressReturnGBPPence: pence }),
      );
    }

    if (req.needsSightseeing) {
      sectionHeading(body, "Sightseeing");
      moneyField(body, "Hop-on hop-off day ticket", cfg.sightseeingDayGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { sightseeingDayGBPPence: pence }),
      );
      moneyField(body, "Single trip", cfg.sightseeingSingleGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { sightseeingSingleGBPPence: pence }),
      );
    }

    if (req.needsNight) {
      sectionHeading(body, "Night services");
      const nightNote = document.createElement("div");
      nightNote.style.fontSize = "11px";
      nightNote.style.color = "var(--text-muted)";
      nightNote.textContent = "Shown because this depot group has at least one Night-type route (route types, not a manual toggle).";
      body.appendChild(nightNote);
      moneyField(body, "LATE", cfg.lateGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { lateGBPPence: pence }));
      moneyField(body, "Night — extra base fee", cfg.nightExtraBaseGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { nightExtraBaseGBPPence: pence }),
      );
      moneyField(body, "Night — extra per zone", cfg.nightExtraPerZoneGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { nightExtraPerZoneGBPPence: pence }),
      );
    }

    if (req.hasCity) {
      sectionHeading(body, "Capping / Day, Weekly (city)");
      moneyField(body, "City — Day", cfg.cityDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { cityDayGBPPence: pence }));
      moneyField(body, "City — Weekly", cfg.cityWeeklyGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { cityWeeklyGBPPence: pence }));
    }

    if (req.hasCountry) {
      sectionHeading(body, "Capping / Day, Weekly (country)");
      moneyField(body, "Country — Day", cfg.countryDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { countryDayGBPPence: pence }));
      moneyField(body, "Country — Weekly", cfg.countryWeeklyGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { countryWeeklyGBPPence: pence }));
    }

    if (req.needsCombined) {
      sectionHeading(body, "Capping / Day, Weekly (city + country combined)");
      moneyField(body, "Combined — Day", cfg.combinedDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { combinedDayGBPPence: pence }));
      moneyField(body, "Combined — Weekly", cfg.combinedWeeklyGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { combinedWeeklyGBPPence: pence }));

      const cappingNote = document.createElement("div");
      cappingNote.style.fontSize = "11px";
      cappingNote.style.color = "var(--text-muted)";
      cappingNote.style.marginTop = "6px";
      cappingNote.textContent = "These Day/Weekly prices also double as the automatic capping thresholds (DESIGN.md §9) — there's no separate cap figure to set.";
      body.appendChild(cappingNote);
    }

    if (req.needsNetwork) {
      sectionHeading(body, "NETWORK (city + country + Airport Express)");
      const networkNote = document.createElement("div");
      networkNote.style.fontSize = "11px";
      networkNote.style.color = "var(--text-muted)";
      networkNote.textContent = "Not its own price — a percentage on top of the matching Combined price, rounded up to the nearest 5p, same percentage for Day/Weekly.";
      body.appendChild(networkNote);

      const percentRow = document.createElement("div");
      percentRow.style.display = "flex";
      percentRow.style.alignItems = "center";
      percentRow.style.gap = "6px";
      percentRow.style.padding = "3px 0";
      const percentLabel = document.createElement("span");
      percentLabel.style.flex = "1";
      percentLabel.style.fontSize = "12px";
      percentLabel.textContent = "Markup over Combined";
      const percentInput = document.createElement("input");
      percentInput.className = "field";
      percentInput.type = "number";
      percentInput.step = "0.5";
      percentInput.min = "0";
      percentInput.placeholder = "not set";
      percentInput.value = cfg.networkMarkupPercent === null ? "" : String(cfg.networkMarkupPercent);
      percentInput.style.width = "70px";
      const percentSuffix = document.createElement("span");
      percentSuffix.className = "label-muted";
      percentSuffix.textContent = "%";
      const percentSetButton = document.createElement("button");
      percentSetButton.className = "btn";
      percentSetButton.textContent = "Set";
      percentSetButton.addEventListener("click", async () => {
        const trimmed = percentInput.value.trim();
        const percent = trimmed === "" ? null : Number(trimmed);
        if (percent !== null && (!Number.isFinite(percent) || percent < 0)) {
          errorMessage = "Give the network markup a percentage.";
          render();
          return;
        }
        await window.farePricing.setConfigFields(groupId, { networkMarkupPercent: percent });
        errorMessage = "";
        await reloadConfig();
        render();
      });
      percentRow.append(percentLabel, percentInput, percentSuffix, percentSetButton);
      body.appendChild(percentRow);

      // Computed, read-only — never stored directly (fare_configs has no
      // network_*_gbp_pence columns at all any more).
      const computedRows: [string, number | null][] = [
        ["NETWORK — Day", cfg.combinedDayGBPPence],
        ["NETWORK — Weekly", cfg.combinedWeeklyGBPPence],
      ];
      for (const [label, combinedPence] of computedRows) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "6px";
        row.style.padding = "3px 0";
        const labelEl = document.createElement("span");
        labelEl.style.flex = "1";
        labelEl.style.fontSize = "12px";
        labelEl.style.color = "var(--text-muted)";
        labelEl.textContent = label;
        const valueEl = document.createElement("span");
        valueEl.style.fontWeight = "600";
        const computable = combinedPence !== null && cfg.networkMarkupPercent !== null;
        valueEl.textContent = computable ? formatPence(networkFareGBPPence(combinedPence!, cfg.networkMarkupPercent!)) : "— (set Combined and the markup first)";
        row.append(labelEl, valueEl);
        body.appendChild(row);
      }
    }

    if (req.hasIsland) {
      sectionHeading(body, "Island");
      const islandNote = document.createElement("div");
      islandNote.style.fontSize = "11px";
      islandNote.style.color = "var(--text-muted)";
      islandNote.textContent =
        "Sits entirely outside the city/country/combined/network system (T107) — its own single, Day/Weekly and LATE, never mixed with the fares above. A NETWORK ticket still covers travel on island services as a coverage benefit, but that doesn't change any price here.";
      body.appendChild(islandNote);

      sectionHeading(body, "Island zone bands");
      zoneBandEditor(
        body,
        islandBands,
        (zoneCount, pence) => window.farePricing.setIslandZoneBand(groupId, zoneCount, pence),
        (zoneCount) => window.farePricing.deleteIslandZoneBand(groupId, zoneCount),
      );

      sectionHeading(body, "Island — Day, Weekly");
      moneyField(body, "Island — Day", cfg.islandDayGBPPence, (pence) => window.farePricing.setConfigFields(groupId, { islandDayGBPPence: pence }));
      moneyField(body, "Island — Weekly", cfg.islandWeeklyGBPPence, (pence) =>
        window.farePricing.setConfigFields(groupId, { islandWeeklyGBPPence: pence }),
      );

      if (req.needsIslandNight) {
        moneyField(body, "Island — LATE", cfg.islandLateGBPPence, (pence) =>
          window.farePricing.setConfigFields(groupId, { islandLateGBPPence: pence }),
        );
      }
    }

    const towns = zones.filter((z) => z.zoneType === "town");
    if (towns.length > 0) {
      sectionHeading(body, "Town zones");
      const townsNote = document.createElement("div");
      townsNote.style.fontSize = "11px";
      townsNote.style.color = "var(--text-muted)";
      townsNote.textContent =
        "Never priced directly — always 70% of the parent zone's own 1-zone figures, rounded up to the nearest 5p. Set the parent's own prices above to fill these in.";
      body.appendChild(townsNote);

      for (const town of towns) {
        const parent = zones.find((z) => z.id === town.parentZoneId);
        const parentHeading = document.createElement("div");
        parentHeading.style.fontSize = "12px";
        parentHeading.style.fontWeight = "600";
        parentHeading.style.marginTop = "8px";
        parentHeading.textContent = parent ? `${town.name} (inside ${parent.name})` : `${town.name} (no parent zone found)`;
        body.appendChild(parentHeading);

        if (!parent) continue;

        // The parent's own 1-zone single + Day/Weekly, whichever type it
        // is — Town never mixes city/country/island, only whatever its own
        // one parent actually is.
        const parentOneZonePence = parent.zoneType === "island" ? (islandBands.find((b) => b.zoneCount === 1)?.priceGBPPence ?? null) : parent.zoneType === "country" ? (bands.find((b) => b.zoneCount === 1)?.priceGBPPence ?? null) : null;
        const parentDay = parent.zoneType === "island" ? cfg.islandDayGBPPence : parent.zoneType === "country" ? cfg.countryDayGBPPence : null;
        const parentWeekly = parent.zoneType === "island" ? cfg.islandWeeklyGBPPence : parent.zoneType === "country" ? cfg.countryWeeklyGBPPence : null;

        const computedRows: [string, number | null][] = [
          ["Single", parentOneZonePence],
          ["Day", parentDay],
          ["Weekly", parentWeekly],
        ];
        for (const [label, parentPence] of computedRows) {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = "6px";
          row.style.padding = "3px 0";
          const labelEl = document.createElement("span");
          labelEl.style.flex = "1";
          labelEl.style.fontSize = "12px";
          labelEl.style.color = "var(--text-muted)";
          labelEl.textContent = label;
          const valueEl = document.createElement("span");
          valueEl.style.fontWeight = "600";
          valueEl.textContent = parentPence === null ? `— (set ${parent.name}'s own ${label.toLowerCase()} first)` : formatPence(townFareGBPPence(parentPence));
          row.append(labelEl, valueEl);
          body.appendChild(row);
        }
      }
    }

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "8px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  farePricingPanelState.open = () => {
    panel.style.display = "flex";
    setMenuOpen("fare-pricing-panel", true);
    void (async () => {
      depotGroups = await window.depotGroups.list();
      if (selectedDepotGroupId === null) selectedDepotGroupId = depotGroups[0]?.id ?? null;
      await reloadMissingIndicators();
      await reloadConfig();
      render();
    })();
  };
  farePricingPanelState.close = () => {
    panel.style.display = "none";
    setMenuOpen("fare-pricing-panel", false);
  };

  // The red border needs to reflect reality even while the panel is
  // closed (so opening the game later still shows it), so it's computed
  // once right away too, not only the first time the toggle is clicked.
  depotGroups = await window.depotGroups.list();
  await reloadMissingIndicators();
}
