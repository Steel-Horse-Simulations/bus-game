// Buy menu — Screen 2: Configure (the user's own buy-menu spec,
// 2026-10-18). Three columns (Livery+Power, Length+Options, Range+Depot+
// Quantity), payment-method cards, "Add to basket".
import {
  generalOptionsFor,
  axleCountForLength,
  lengthsForPower,
  priceFor,
  seatedCapacityOf,
  manufacturerOf,
  type VehicleModel,
  type LengthVariant,
  type PowerType,
  type GeneralOption,
} from "./vehicle-catalogue.mts";
import { createDropdown } from "./dropdown";
import { liveryBadgeUrl } from "./livery-badges.mts";
import { liveryRestrictionForArea, liveryUnavailableReason, longDistanceNationLockReason, nationForRegion } from "./livery-seed-data.mts";
import { bulkDiscountPercent, leaseMonthlyGBP, leaseToOwnMonthlyGBP, type PaymentMethod } from "./vehicle-buy-pricing.mts";

const POWER_LABELS: Record<PowerType, string> = { diesel: "Diesel", electric: "Electric", hybrid: "Hybrid", hydrogen: "Hydrogen" };

function formatGBP(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

interface ConfigureContext {
  depotGroups: DepotGroup[];
  depots: Depot[];
  liveries: Livery[];
  // Every vehicle the company already owns, across every depot group —
  // added 2026-11-07 for Lothian Girraffe's own 1-vehicle-ever cap
  // (liveryCapReason, livery-seed-data.mts). Optional so a caller that
  // genuinely has no such list yet just skips the cap check, same
  // "undefined means not checked" convention liveryUnavailableReason
  // already uses for depotGroup.
  ownedVehicles?: { liveryId: number | null }[];
  onAddedToBasket: () => void;
  onBack: () => void;
}

export function renderConfigureScreen(container: HTMLElement, vehicle: VehicleModel, ctx: ConfigureContext): void {
  container.innerHTML = "";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.height = "100%";
  container.style.overflow = "hidden";

  // --- Header ---
  const header = document.createElement("div");
  header.style.padding = "10px 16px";
  header.style.borderBottom = "1px solid var(--border)";
  header.style.display = "flex";
  header.style.alignItems = "baseline";
  header.style.gap = "10px";

  const backButton = document.createElement("button");
  backButton.className = "btn btn-icon";
  backButton.textContent = "←";
  backButton.title = "Back to catalogue";
  backButton.addEventListener("click", ctx.onBack);
  header.appendChild(backButton);

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.fontSize = "14px";
  title.textContent = vehicle.name;
  header.appendChild(title);

  const categoryTag = document.createElement("span");
  categoryTag.className = "badge badge-info";
  categoryTag.textContent = vehicle.category;
  header.appendChild(categoryTag);

  const subtitle = document.createElement("div");
  subtitle.className = "label-muted";
  subtitle.style.marginLeft = "auto";
  subtitle.textContent = "Configure, then add to basket";
  header.appendChild(subtitle);

  container.appendChild(header);

  // --- Body: scrollable, 3 columns + bottom payment section ---
  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.overflowY = "auto";
  body.style.padding = "14px 16px";
  container.appendChild(body);

  const columns = document.createElement("div");
  columns.style.display = "flex";
  columns.style.gap = "20px";
  body.appendChild(columns);

  const col1 = document.createElement("div");
  col1.style.flex = "1";
  col1.style.minWidth = "200px";
  columns.appendChild(col1);

  const col2 = document.createElement("div");
  col2.style.flex = "1.4";
  col2.style.minWidth = "260px";
  columns.appendChild(col2);

  const col3 = document.createElement("div");
  col3.style.flex = "1";
  col3.style.minWidth = "200px";
  columns.appendChild(col3);

  const paymentSection = document.createElement("div");
  paymentSection.style.marginTop = "20px";
  paymentSection.style.borderTop = "1px solid var(--border)";
  paymentSection.style.paddingTop = "14px";
  body.appendChild(paymentSection);

  // --- Mutable configuration state ---
  let selectedPower: PowerType = vehicle.powerOptions[0].powerType;
  let selectedLength: LengthVariant = lengthsForPower(vehicle, selectedPower)[0];
  let selectedEnergyOptionIndex = 0;
  // Seatbelts are standard (and free — see the catalogue's own price
  // override) on every coach, not a real choice — pre-checked here so the
  // checkbox below renders ticked from the start, not just once a render
  // pass forces it.
  const selectedCheckboxOptionIds = new Set<string>(vehicle.category === "Coaches" ? ["seatbelts"] : []);
  const selectedDropdownChoiceIndex: Record<string, number> = {};
  let selectedDepotGroupId: number | null = ctx.depotGroups[0]?.id ?? null;
  let selectedDepotId: number | null = null;
  let quantity = 1;
  let paymentMethod: PaymentMethod = "buy_outright";

  function currentDepotGroup(): DepotGroup | undefined {
    return ctx.depotGroups.find((g) => g.id === selectedDepotGroupId);
  }

  function liveryRestriction(): { accepted: string[]; preferred: string } | null {
    const group = currentDepotGroup();
    return group ? liveryRestrictionForArea(group.name) : null;
  }

  function currentVehicleCountForLivery(liveryId: number): number | undefined {
    if (!ctx.ownedVehicles) return undefined;
    return ctx.ownedVehicles.filter((v) => v.liveryId === liveryId).length;
  }

  function liveryLockReason(name: string): string | null {
    const livery = ctx.liveries.find((l) => l.name === name);
    return liveryUnavailableReason(name, vehicle, currentDepotGroup(), livery ? currentVehicleCountForLivery(livery.id) : undefined);
  }

  function liveryIsAccepted(name: string): boolean {
    return liveryLockReason(name) === null;
  }

  // Plain white is reserved for used vehicles (the Used screen's own flow
  // is unchanged — OPERATIONS.md's "new buses default to plain white"
  // still applies there) — a new vehicle has to leave with a real livery
  // instead, the user's own instruction, so there's no plain-white choice
  // offered here at all. Prefers the depot's own area-restricted default,
  // then falls back to the first livery that's actually available for
  // this vehicle/depot; only returns null if `ctx.liveries` is somehow
  // completely empty.
  function pickDefaultLiveryId(): number | null {
    const restriction = liveryRestriction();
    const preferred = restriction ? ctx.liveries.find((l) => l.name === restriction.preferred) : undefined;
    if (preferred) return preferred.id;
    const firstAvailable = ctx.liveries.find((l) => liveryIsAccepted(l.name));
    return firstAvailable?.id ?? null;
  }

  let selectedLiveryId: number | null = pickDefaultLiveryId();

  function applyLiveryLockDefault(): void {
    const currentName = ctx.liveries.find((l) => l.id === selectedLiveryId)?.name ?? null;
    if (currentName && liveryIsAccepted(currentName)) return;
    selectedLiveryId = pickDefaultLiveryId();
  }

  function unitOptionsTotal(): number {
    let total = 0;
    for (const option of generalOptionsFor(vehicle, selectedPower)) {
      if (option.priceKind === "perEnergyOption") continue; // priced via the energy option itself, not here
      if (option.selectionType === "dropdown" && option.dropdownChoices) {
        const idx = selectedDropdownChoiceIndex[option.id] ?? 0;
        total += option.dropdownChoices[idx]?.amountGBP ?? 0;
      } else if (option.selectionType === "checkbox" && selectedCheckboxOptionIds.has(option.id)) {
        total += priceForOption(option);
      }
    }
    return total;
  }

  function priceForOption(option: GeneralOption): number {
    if (option.priceKind === "standard" || option.priceKind === "perEnergyOption") return 0;
    const base = option.priceOverridesByModelId?.[vehicle.id] ?? option.priceGBP ?? 0;
    if (option.priceKind === "perSeat") return base * seatedCapacityOf(selectedLength.capacity);
    return base;
  }

  function unitPriceGBP(): number {
    const base = priceFor(vehicle, selectedLength) ?? 0;
    const energyDelta = selectedLength.energyOptions[selectedEnergyOptionIndex]?.priceDeltaGBP ?? 0;
    return base + energyDelta + unitOptionsTotal();
  }

  function rerenderCol1(): void {
    col1.innerHTML = "";

    const liveryHeading = document.createElement("div");
    liveryHeading.className = "label-muted";
    liveryHeading.textContent = "Livery";
    col1.appendChild(liveryHeading);

    const selectedLivery = ctx.liveries.find((l) => l.id === selectedLiveryId);
    const badgeBox = document.createElement("div");
    // Real badges (OPERATIONS.md §4) are only 256×112px. Stretching that
    // to the full width of a column on a now-full-screen overlay (easily
    // 300-400px) upscales a small source image well past its native
    // resolution, which is what was blurry — capping the width near the
    // badge's own native size keeps it sharp. The aspect-ratio (matching
    // the real 256:112 badges) is kept so the plain-white placeholder
    // still fills exactly the same footprint as a real badge image,
    // rather than appearing a different size.
    badgeBox.style.width = "100%";
    badgeBox.style.maxWidth = "220px";
    badgeBox.style.aspectRatio = "256 / 112";
    badgeBox.style.borderRadius = "6px";
    badgeBox.style.marginTop = "6px";
    badgeBox.style.display = "flex";
    badgeBox.style.alignItems = "center";
    badgeBox.style.justifyContent = "center";
    badgeBox.style.overflow = "hidden";
    if (selectedLivery) {
      const url = liveryBadgeUrl(selectedLivery.name);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        badgeBox.appendChild(img);
      } else {
        badgeBox.style.background = selectedLivery.primaryColour;
        badgeBox.style.border = `3px solid ${selectedLivery.secondaryColour}`;
      }
    } else {
      // Only reachable if ctx.liveries is completely empty — plain white
      // isn't offered as a real choice any more (see pickDefaultLiveryId).
      badgeBox.style.background = "var(--bg-surface-1)";
      badgeBox.style.border = "1px solid var(--border-strong)";
      const label = document.createElement("span");
      label.style.color = "var(--text-muted)";
      label.style.fontSize = "11px";
      label.textContent = "No livery available";
      badgeBox.appendChild(label);
    }
    col1.appendChild(badgeBox);

    const liveryName = document.createElement("div");
    liveryName.style.marginTop = "6px";
    liveryName.style.fontWeight = "600";
    liveryName.textContent = selectedLivery?.name ?? "No livery available";
    col1.appendChild(liveryName);

    const liveryCount = document.createElement("div");
    liveryCount.className = "label-muted";
    liveryCount.textContent = `${ctx.liveries.length} liveries`;
    col1.appendChild(liveryCount);

    const restriction = liveryRestriction();
    const group = currentDepotGroup();
    if (restriction) {
      const lockNote = document.createElement("div");
      lockNote.style.fontSize = "11px";
      lockNote.style.color = "var(--text-warning)";
      lockNote.style.marginTop = "4px";
      lockNote.textContent = `${group?.name} only accepts: ${restriction.accepted.join(", ")} (preferred: ${restriction.preferred})${group && longDistanceNationLockReason("Citylink", group.region) === null ? " — Citylink and Ember are always allowed too." : ""}`;
      col1.appendChild(lockNote);
    }

    if (group) {
      const longDistanceNote = document.createElement("div");
      longDistanceNote.style.fontSize = "11px";
      longDistanceNote.style.color = "var(--text-muted)";
      longDistanceNote.style.marginTop = "4px";
      longDistanceNote.textContent = nationForRegion(group.region) === "scotland"
        ? "Citylink and Ember are allowed in every Scottish depot but are long-distance only (not enforced yet). Citylink needs a coach; Ember needs the Yutong coach specifically. Citylink/West Coast Motors is the same but Glasgow and Oban depots only."
        : "MegaBus and National Express are allowed in every England/Wales depot but are long-distance only (not enforced yet). Both need a coach.";
      col1.appendChild(longDistanceNote);
    }

    // Added 2026-11-07, user request — the opposite restriction: National
    // Express Local is local-routes only. No nation/depot lock (unlike
    // National Express itself), so this shows regardless of region —
    // same "not enforced yet at purchase time" honesty as the note above,
    // though it IS actually applied where it can be (the map's random
    // livery picker, livery-map-badges.mts, already knows a route's own
    // type).
    const localOnlyNote = document.createElement("div");
    localOnlyNote.style.fontSize = "11px";
    localOnlyNote.style.color = "var(--text-muted)";
    localOnlyNote.style.marginTop = "4px";
    localOnlyNote.textContent = "National Express Local is local-routes only (not enforced yet at purchase time).";
    col1.appendChild(localOnlyNote);

    const strip = document.createElement("div");
    strip.style.display = "flex";
    strip.style.flexWrap = "wrap";
    strip.style.gap = "4px";
    strip.style.marginTop = "8px";

    // Confirmed 2026-11-07, user request: "in the configure page liverys
    // will only show for vehicles they can be applied to otherwise they
    // will be hidden" (and, same message, "only show liverys that can be
    // bought for use in the specific depot where a vehicle will be
    // based") — a locked livery used to render greyed-out and disabled;
    // now it's filtered out of the strip entirely, for ANY lock reason
    // (vehicle type, nation, specific depot group, area, sightseeing),
    // since liveryLockReason already combines all of them.
    for (const livery of ctx.liveries) {
      if (!liveryIsAccepted(livery.name)) continue;
      const thumb = document.createElement("div");
      thumb.style.width = "36px";
      thumb.style.height = "20px";
      thumb.style.borderRadius = "3px";
      thumb.style.cursor = "pointer";
      thumb.style.border = selectedLiveryId === livery.id ? "2px solid var(--border-accent)" : "1px solid var(--border-strong)";
      thumb.title = livery.name;
      const url = liveryBadgeUrl(livery.name);
      if (url) {
        thumb.style.backgroundImage = `url(${url})`;
        thumb.style.backgroundSize = "cover";
      } else {
        thumb.style.background = livery.primaryColour;
      }
      thumb.addEventListener("click", () => {
        selectedLiveryId = livery.id;
        rerenderCol1();
      });
      strip.appendChild(thumb);
    }
    col1.appendChild(strip);

    // --- Power ---
    if (vehicle.powerOptions.length > 1) {
      const powerHeading = document.createElement("div");
      powerHeading.className = "label-muted";
      powerHeading.style.marginTop = "16px";
      powerHeading.textContent = "Power";
      col1.appendChild(powerHeading);

      const powerDropdown = createDropdown(
        vehicle.powerOptions.map((p) => POWER_LABELS[p.powerType]),
        POWER_LABELS[selectedPower],
        (label) => {
          const found = vehicle.powerOptions.find((p) => POWER_LABELS[p.powerType] === label);
          if (found) {
            selectedPower = found.powerType;
            selectedLength = lengthsForPower(vehicle, selectedPower)[0];
            selectedEnergyOptionIndex = 0;
            rerenderCol2();
            rerenderCol3();
            renderPaymentSection();
          }
        },
      );
      powerDropdown.el.style.marginTop = "4px";
      col1.appendChild(powerDropdown.el);
    }
  }

  function rerenderCol2(): void {
    col2.innerHTML = "";

    const lengthHeading = document.createElement("div");
    lengthHeading.className = "label-muted";
    lengthHeading.textContent = "Length";
    col2.appendChild(lengthHeading);

    const lengths = lengthsForPower(vehicle, selectedPower);
    const shortest = lengths.reduce((s, l) => (l.lengthM < s.lengthM ? l : s));
    for (const length of lengths) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px 8px";
      row.style.marginTop = "4px";
      row.style.borderRadius = "5px";
      row.style.cursor = lengths.length > 1 ? "pointer" : "default";
      row.style.border = length === selectedLength ? "1px solid var(--border-accent)" : "1px solid var(--border)";
      row.style.background = length === selectedLength ? "var(--bg-accent)" : "transparent";

      const delta = priceFor(vehicle, length)! - priceFor(vehicle, shortest)!;
      const axleLabel = vehicle.category === "Coaches" ? ` — ${axleCountForLength(length.lengthM)}` : "";
      const left = document.createElement("span");
      left.textContent = `${length.lengthM}m${length.variantLabel ? ` — ${length.variantLabel}` : ""}${axleLabel} · ${seatedCapacityOf(length.capacity)} seated`;
      row.appendChild(left);

      const right = document.createElement("span");
      right.style.color = "var(--text-muted)";
      right.textContent = delta === 0 ? "base" : `+${formatGBP(delta)}`;
      row.appendChild(right);

      if (lengths.length > 1) {
        row.addEventListener("click", () => {
          selectedLength = length;
          selectedEnergyOptionIndex = 0;
          rerenderCol2();
          rerenderCol3();
          renderPaymentSection();
        });
      }
      col2.appendChild(row);
    }

    const optionsHeading = document.createElement("div");
    optionsHeading.className = "label-muted";
    optionsHeading.style.marginTop = "16px";
    optionsHeading.textContent = "Options";
    col2.appendChild(optionsHeading);

    const options = generalOptionsFor(vehicle, selectedPower).filter((o) => o.priceKind !== "perEnergyOption");
    for (const option of options) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "5px 2px";
      row.style.borderBottom = "1px solid var(--border)";

      const left = document.createElement("label");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "6px";
      left.style.cursor = option.selectionType === "checkbox" ? "pointer" : "default";

      if (option.selectionType === "checkbox") {
        // Seatbelts are standard on coaches (free there too — see the
        // catalogue's own price override), not a real choice, so the
        // checkbox is forced on and locked rather than offered.
        const lockedOnForCoach = option.id === "seatbelts" && vehicle.category === "Coaches";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = lockedOnForCoach ? true : selectedCheckboxOptionIds.has(option.id);
        checkbox.disabled = lockedOnForCoach;
        if (lockedOnForCoach) left.title = "Standard on coaches — can't be unticked.";
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedCheckboxOptionIds.add(option.id);
          else selectedCheckboxOptionIds.delete(option.id);
          renderPaymentSection();
        });
        left.appendChild(checkbox);
      } else if (option.selectionType === "standard") {
        const tick = document.createElement("span");
        tick.style.color = "var(--text-success)";
        tick.textContent = "✓";
        left.appendChild(tick);
      }

      const label = document.createElement("span");
      label.textContent = option.label;
      left.appendChild(label);
      row.appendChild(left);

      if (option.selectionType === "dropdown" && option.dropdownChoices) {
        const choiceDropdown = createDropdown(
          option.dropdownChoices.map((c) => `${c.label} — ${c.amountGBP === 0 ? "£0" : formatGBP(c.amountGBP)}`),
          (() => {
            const idx = selectedDropdownChoiceIndex[option.id] ?? 0;
            const c = option.dropdownChoices![idx];
            return `${c.label} — ${c.amountGBP === 0 ? "£0" : formatGBP(c.amountGBP)}`;
          })(),
          (label2) => {
            const idx = option.dropdownChoices!.findIndex((c) => `${c.label} — ${c.amountGBP === 0 ? "£0" : formatGBP(c.amountGBP)}` === label2);
            if (idx >= 0) selectedDropdownChoiceIndex[option.id] = idx;
            renderPaymentSection();
          },
        );
        choiceDropdown.el.style.width = "170px";
        row.appendChild(choiceDropdown.el);
      } else {
        const price = document.createElement("span");
        price.style.color = "var(--text-muted)";
        const amount = priceForOption(option);
        price.textContent = option.priceKind === "standard" ? "included" : amount === 0 ? "£0" : formatGBP(amount);
        row.appendChild(price);
      }

      col2.appendChild(row);
    }
  }

  function rerenderCol3(): void {
    col3.innerHTML = "";

    const rangeHeading = document.createElement("div");
    rangeHeading.className = "label-muted";
    rangeHeading.textContent = "Range";
    col3.appendChild(rangeHeading);

    const energyOptions = selectedLength.energyOptions;
    const selectedEnergy = energyOptions[selectedEnergyOptionIndex] ?? energyOptions[0];

    const bigRange = document.createElement("div");
    bigRange.style.fontSize = "28px";
    bigRange.style.fontWeight = "700";
    bigRange.style.marginTop = "4px";
    bigRange.textContent = selectedEnergy.rangeMiles !== null ? `${selectedEnergy.rangeMiles} mi` : "—";
    col3.appendChild(bigRange);

    const energyLabel = document.createElement("div");
    energyLabel.className = "label-muted";
    energyLabel.textContent = selectedEnergy.label;
    col3.appendChild(energyLabel);

    if (energyOptions.length > 1) {
      const tankDropdown = createDropdown(
        energyOptions.map((o, i) => `${o.label}${o.priceDeltaGBP ? ` (+${formatGBP(o.priceDeltaGBP)})` : ""}${i === selectedEnergyOptionIndex ? "" : ""}`),
        `${selectedEnergy.label}${selectedEnergy.priceDeltaGBP ? ` (+${formatGBP(selectedEnergy.priceDeltaGBP)})` : ""}`,
        (label) => {
          const idx = energyOptions.findIndex((o) => `${o.label}${o.priceDeltaGBP ? ` (+${formatGBP(o.priceDeltaGBP)})` : ""}` === label);
          if (idx >= 0) selectedEnergyOptionIndex = idx;
          rerenderCol3();
          renderPaymentSection();
        },
      );
      tankDropdown.el.style.marginTop = "8px";
      col3.appendChild(tankDropdown.el);

      const otherNote = document.createElement("div");
      otherNote.style.fontSize = "11px";
      otherNote.style.color = "var(--text-muted)";
      otherNote.style.marginTop = "6px";
      otherNote.textContent = `Other option${energyOptions.length > 2 ? "s" : ""}: ${energyOptions
        .filter((_, i) => i !== selectedEnergyOptionIndex)
        .map((o) => `${o.label} (${o.rangeMiles ?? "?"} mi)`)
        .join(", ")}`;
      col3.appendChild(otherNote);
    }

    // --- Depot ---
    const depotHeading = document.createElement("div");
    depotHeading.className = "label-muted";
    depotHeading.style.marginTop = "16px";
    depotHeading.textContent = "Depot";
    col3.appendChild(depotHeading);

    if (ctx.depotGroups.length === 0) {
      const note = document.createElement("div");
      note.className = "label-muted";
      note.textContent = "Create a depot group and place a depot first.";
      col3.appendChild(note);
      return;
    }

    const depotGroupDropdown = createDropdown(
      ctx.depotGroups.map((g) => g.name),
      currentDepotGroup()?.name ?? ctx.depotGroups[0].name,
      (name) => {
        selectedDepotGroupId = ctx.depotGroups.find((g) => g.name === name)?.id ?? null;
        applyLiveryLockDefault();
        rerenderCol1();
        rerenderCol3();
      },
    );
    depotGroupDropdown.el.style.marginTop = "4px";
    col3.appendChild(depotGroupDropdown.el);

    const depotsHere = ctx.depots.filter((d) => d.depotGroupId === selectedDepotGroupId);
    if (depotsHere.length === 0) {
      selectedDepotId = null;
      const note = document.createElement("div");
      note.className = "label-muted";
      note.style.marginTop = "4px";
      note.textContent = "No depot placed for this group yet.";
      col3.appendChild(note);
    } else {
      if (!depotsHere.some((d) => d.id === selectedDepotId)) selectedDepotId = depotsHere[0].id;
      const depotDropdown = createDropdown(
        depotsHere.map((d) => d.name),
        depotsHere.find((d) => d.id === selectedDepotId)?.name ?? depotsHere[0].name,
        (name) => {
          selectedDepotId = depotsHere.find((d) => d.name === name)?.id ?? null;
        },
      );
      depotDropdown.el.style.marginTop = "4px";
      col3.appendChild(depotDropdown.el);
    }

    // --- Quantity ---
    const quantityHeading = document.createElement("div");
    quantityHeading.className = "label-muted";
    quantityHeading.style.marginTop = "16px";
    quantityHeading.textContent = "Quantity";
    col3.appendChild(quantityHeading);

    const quantityInput = document.createElement("input");
    quantityInput.className = "field";
    quantityInput.type = "number";
    quantityInput.min = "1";
    quantityInput.value = String(quantity);
    quantityInput.style.width = "70px";
    quantityInput.style.marginTop = "4px";
    quantityInput.addEventListener("input", () => {
      quantity = Math.max(1, Math.round(Number(quantityInput.value) || 1));
      renderPaymentSection();
    });
    col3.appendChild(quantityInput);
  }

  function renderPaymentSection(): void {
    paymentSection.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "label-muted";
    heading.textContent = "How to pay";
    paymentSection.appendChild(heading);

    const cards = document.createElement("div");
    cards.style.display = "flex";
    cards.style.gap = "10px";
    cards.style.marginTop = "8px";
    paymentSection.appendChild(cards);

    const unit = unitPriceGBP();
    const methods: { key: PaymentMethod; title: string; detail: string }[] = [
      { key: "buy_outright", title: "Buy outright", detail: formatGBP(unit) },
      { key: "lease", title: "Lease", detail: `${formatGBP(leaseMonthlyGBP(unit))}/month over 60 months` },
      { key: "lease_to_own", title: "Lease to own", detail: `${formatGBP(leaseToOwnMonthlyGBP(unit))}/month over 60 months` },
    ];
    for (const method of methods) {
      const card = document.createElement("div");
      card.style.flex = "1";
      card.style.border = method.key === paymentMethod ? "1px solid var(--border-accent)" : "1px solid var(--border)";
      card.style.background = method.key === paymentMethod ? "var(--bg-accent)" : "var(--bg-surface-1)";
      card.style.borderRadius = "6px";
      card.style.padding = "10px";
      card.style.cursor = "pointer";
      card.addEventListener("click", () => {
        paymentMethod = method.key;
        renderPaymentSection();
      });

      const title = document.createElement("div");
      title.style.fontWeight = "600";
      title.textContent = method.title;
      card.appendChild(title);

      const detail = document.createElement("div");
      detail.style.color = "var(--text-muted)";
      detail.style.marginTop = "4px";
      detail.textContent = method.detail;
      card.appendChild(detail);

      cards.appendChild(card);
    }

    const note = document.createElement("div");
    note.style.fontSize = "11px";
    note.style.color = "var(--text-muted)";
    note.style.marginTop = "8px";
    note.textContent = "Missed payments add that month's interest to the balance. Vehicles are never repossessed.";
    paymentSection.appendChild(note);

    const bulkHint = document.createElement("div");
    bulkHint.style.fontSize = "11px";
    bulkHint.style.color = "var(--text-muted)";
    bulkHint.style.marginTop = "4px";
    bulkHint.textContent = quantity > 1 ? `This order's own bulk discount (by manufacturer, applied in the basket): ${bulkDiscountPercent(quantity)}% for ${quantity} from ${manufacturerOf(vehicle.id)}.` : "";
    paymentSection.appendChild(bulkHint);

    const addButton = document.createElement("button");
    addButton.className = "btn";
    addButton.style.marginTop = "10px";
    addButton.textContent = `Add to basket — ${quantity} × ${formatGBP(unit)}`;
    addButton.disabled = selectedDepotGroupId === null || selectedDepotId === null;
    addButton.addEventListener("click", async () => {
      if (selectedDepotGroupId === null || selectedDepotId === null) return;
      addButton.disabled = true;
      try {
        await window.basket.add(
          selectedDepotGroupId,
          selectedDepotId,
          vehicle.id,
          selectedLength.lengthM,
          selectedLength.variantLabel ?? null,
          selectedPower,
          selectedLiveryId,
          manufacturerOf(vehicle.id),
          quantity,
          unit,
          paymentMethod,
          false,
          null,
        );
        ctx.onAddedToBasket();
      } finally {
        addButton.disabled = false;
      }
    });
    paymentSection.appendChild(addButton);
  }

  applyLiveryLockDefault();
  rerenderCol1();
  rerenderCol2();
  rerenderCol3();
  renderPaymentSection();
}
