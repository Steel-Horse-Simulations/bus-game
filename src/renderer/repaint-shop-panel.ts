// Repaint shops (T63): place shops on the map, and set each shop's
// concurrent capacity (bays — how many vehicles it can work on at once)
// and turnaround time (working days per vehicle). Neither has a default —
// a shop needs real figures before it can be saved, since they come from
// the user (2026-11-01: "Ferrymill Motors can have 7 vehicles in its
// workshop at once... a full repaint at Ferrymill takes 5 days, Monday to
// Friday only" — replaced the old single "weekly capacity" figure
// entirely, see repaint_shops' own CREATE TABLE comment in db.mts).
//
// Entrances (2026-11-01, live user report: "Loughborough is a repaint
// shop but I have no way of adding an entrance to it") — exact mirror of
// dealer-placement.ts's own entrance management, except inline in this
// panel's existing per-shop row rather than a map popup, matching this
// panel's own established UI language (no map-popup precedent existed
// here before).
//
// Booking a vehicle in (2026-11-05) — capacity/scheduling only, the
// user's own explicit scope call when asked ("there is no money/finance
// system and no driver-transit system yet, how much should I build?").
// See repaint-booking.mts's own header comment for the full reasoning.
// One simplification worth flagging here too: this form books exactly
// one vehicle at a time, so the real "2% discount per additional vehicle
// in an order" never applies (an order of 1 is always 0% off) — a real
// multi-vehicle order UI is a bigger piece, deferred.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import type { Router } from "./wasm/game_wasm.js";
import { createDropdown } from "./dropdown";
import { routeDrawState } from "./route-draw";
import { placeStopState } from "./stops-layer";
import { placeDepotState } from "./depot-placement";
import { placeDealerState } from "./dealer-placement";
import { ENTRANCE_MODE_LABELS, ENTRANCE_MODE_COLORS } from "./entrance-marker";
// Shown/hidden by the Fleet section of the bottom bar (main-screen-
// navigation.ts), not its own floating toggle button any more (2026-11-08,
// live request: "get all menus working... instead of temporary ones") —
// except the "placing" flow above, which still opens the panel directly
// once a new shop is placed on the map.
export const repaintShopPanelState: { open: (() => void) | null; close: (() => void) | null } = {
  open: null,
  close: null,
};
import { gameClockState } from "./game-clock-engine";
import { gameDateTimeFromSeconds, formatGameDate, SECONDS_PER_DAY } from "./game-clock.mts";
import { findVehicleModel } from "./vehicle-catalogue.mts";
import {
  scheduleRepaintBooking,
  fullRepaintBasePriceGBP,
  simpleRepaintBasePriceGBP,
  SIMPLE_REPAINT_TURNAROUND_DAYS,
  repaintBulkDiscountPercent,
  applyDiscount,
  type BookingWindow,
} from "./repaint-booking.mts";
import { combinedAwayWindows } from "./workshop-booking.mts";
import { REPOWER_CONCURRENT_CAPACITY, REPOWER_TURNAROUND_WORKING_DAYS } from "./repower-booking.mts";
import { isIslandDepotGroup } from "./fare-journey.mts";

function todayDayIndex(): number {
  return Math.floor(gameClockState.accumulatedGameSeconds / SECONDS_PER_DAY);
}

function formatDay(dayIndex: number): string {
  return formatGameDate(gameDateTimeFromSeconds(dayIndex * SECONDS_PER_DAY));
}

function vehicleLabel(v: Vehicle): string {
  return `${v.fleetNumber} — ${findVehicleModel(v.modelId)?.name ?? v.modelId}`;
}

const SOURCE_ID = "repaint-shops";
const LAYER_ID = "repaint-shops-circles";

function toGeojson(shops: RepaintShop[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: shops.map((s) => ({
      type: "Feature",
      properties: { id: s.id, name: s.name },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Real repaint shops, seeded directly into `repaint_shops` the same
// idempotent-by-name way seedRealDealers does for dealers (2026-11-01,
// live user data). Positions: Ferrymill decoded from its real Plus Code
// (WQVV+9W Torrance, Glasgow — recovered against Glasgow's own already-
// known reference point via the same validated Open Location Code
// decoder used for every dealer, landing ~13km north of it at Torrance,
// consistent with every other real decode in this project); Loughborough
// already had a decoded position from dealer-reference-pins.ts's own
// earlier "repaint" placeholder entry (never actually seeded there — see
// that file's own comment on why); ACE given as plain coordinates
// directly. Capacities: Ferrymill 7 concurrent / 5 working days, Loughborough
// the same (confirmed directly: "the same capacity rules as Ferrymill"),
// ACE 2 concurrent / 10 working days ("effectively 2 weeks").
interface RealRepaintShop {
  name: string;
  lon: number;
  lat: number;
  concurrentCapacity: number;
  turnaroundDays: number;
}

const REAL_REPAINT_SHOPS: RealRepaintShop[] = [
  { name: "Ferrymill Motors", lon: -4.205188, lat: 55.943438, concurrentCapacity: 7, turnaroundDays: 5 },
  { name: "Loughborough repaint/bodyshop", lon: -1.222997, lat: 52.778878, concurrentCapacity: 7, turnaroundDays: 5 },
  { name: "ACE Commercial Refinishers", lon: -2.650232, lat: 56.730237, concurrentCapacity: 2, turnaroundDays: 10 },
  // T179's bundled-repaint-while-there bonus: a bus in for a re-power at
  // Wrightbus's NewPower site can also get a full repaint done in the
  // same visit (repower-booking-panel.ts), since the re-power's own
  // 15-working-day stay comfortably covers a repaint that would normally
  // take 5 elsewhere on its own — this row exists so that bundled
  // booking has a real repaintShopId to point at. Same real Bicester
  // location as the matching dealer pin (dealer-reference-pins.ts).
  { name: "Wrightbus NewPower (Bicester)", lon: -1.1822564, lat: 51.9035125, concurrentCapacity: REPOWER_CONCURRENT_CAPACITY.wrightbus, turnaroundDays: REPOWER_TURNAROUND_WORKING_DAYS },
];

export async function seedRealRepaintShops(): Promise<void> {
  const existing = await window.repaintShops.list();
  const existingNames = new Set(existing.map((s) => s.name));
  for (const shop of REAL_REPAINT_SHOPS) {
    if (existingNames.has(shop.name)) continue;
    await window.repaintShops.create(shop.name, shop.lon, shop.lat, shop.concurrentCapacity, shop.turnaroundDays);
  }
}

export async function mountRepaintShops(map: maplibregl.Map, router: Router): Promise<void> {
  map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": 7,
      "circle-color": "#f59e0b",
      "circle-stroke-color": "#18181b",
      "circle-stroke-width": 2,
    },
  });
  map.addSource("repaint-shop-entrances", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "repaint-shop-entrances-points",
    type: "circle",
    source: "repaint-shop-entrances",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "mode"], "entry", ENTRANCE_MODE_COLORS.entry, "exit", ENTRANCE_MODE_COLORS.exit, ENTRANCE_MODE_COLORS.both],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "fixed";
  panel.style.top = "72px";
  panel.style.left = "50%";
  panel.style.transform = "translateX(-50%)";
  panel.style.zIndex = "1000";
  panel.style.width = "340px";
  panel.style.maxHeight = "75vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Repaint shops";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let shops: RepaintShop[] = [];
  let entrancesByShop = new Map<number, RepaintShopEntrance[]>();
  let errorMessage = "";
  let placing = false;
  let pendingLngLat: maplibregl.LngLat | null = null;
  // The shop whose entrances are currently expanded in the panel (at most
  // one at a time, same "too many buttons at once" reasoning route-panel.ts
  // already settled on) — also controls which shop's entrances the map
  // layer above shows.
  let expandedShopId: number | null = null;
  // Set while "+ Add entrance" is armed on a shop, mirrors dealer-
  // placement.ts's own addEntranceForDealer exactly.
  let addEntranceForShop: RepaintShop | null = null;

  // Booking a vehicle in — see the file header comment for scope.
  let vehicles: Vehicle[] = [];
  let bookings: RepaintBooking[] = [];
  // Only needed for the "2 away at once" depot-group cap below, which
  // re-power now counts toward too (T179) — never shown in this panel's
  // own UI.
  let repowerBookings: RepowerBooking[] = [];
  // Only needed for the real island away-cap below (2026-11-19) — see
  // previewBooking's own comment.
  let allDepotsForIslandCheck: Depot[] = [];
  let allZonesForIslandCheck: FareZone[] = [];
  let bookingVehicleId: number | null = null;
  let bookingType: RepaintType = "full";
  let bookingShopId: number | null = null;
  let bookingError = "";

  async function reload(): Promise<void> {
    shops = await window.repaintShops.list();
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(toGeojson(shops));
    const allEntrances = await window.repaintShops.listAllEntrances();
    entrancesByShop = new Map();
    for (const e of allEntrances) {
      const list = entrancesByShop.get(e.repaintShopId) ?? [];
      list.push(e);
      entrancesByShop.set(e.repaintShopId, list);
    }
    refreshEntrancesLayer();
    vehicles = await window.vehicles.listAll();
    bookings = await window.repaintBookings.listAll();
    repowerBookings = await window.repowerBookings.listAll();
    allDepotsForIslandCheck = await window.depots.list();
    allZonesForIslandCheck = await window.fareZones.listAll();
    if (bookingVehicleId === null && vehicles.length > 0) bookingVehicleId = vehicles[0].id;
    if (bookingShopId === null && shops.length > 0) bookingShopId = shops[0].id;
  }

  function refreshEntrancesLayer(): void {
    const entrances = expandedShopId === null ? [] : (entrancesByShop.get(expandedShopId) ?? []);
    (map.getSource("repaint-shop-entrances") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: entrances.map((e) => ({ type: "Feature", properties: { mode: e.mode }, geometry: { type: "Point", coordinates: [e.lon, e.lat] } })),
    });
  }

  function showError(err: unknown): void {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Pure preview of what booking the current selection would produce —
  // used both to show a live price/date estimate before submitting and
  // to compute the real values the booking is actually created with, so
  // the two can never drift apart.
  function previewBooking(vehicle: Vehicle, type: RepaintType, shopId: number | null): { basePriceGBP: number; discountPercent: number; finalPriceGBP: number; window: BookingWindow } | null {
    const discountPercent = repaintBulkDiscountPercent(1);
    const today = todayDayIndex();
    if (type === "simple") {
      const basePriceGBP = simpleRepaintBasePriceGBP(vehicle.modelId);
      const bookingWindow = scheduleRepaintBooking(today, SIMPLE_REPAINT_TURNAROUND_DAYS, [], Infinity, [], Infinity);
      return { basePriceGBP, discountPercent, finalPriceGBP: applyDiscount(basePriceGBP, discountPercent), window: bookingWindow };
    }
    const shop = shopId === null ? undefined : shops.find((s) => s.id === shopId);
    if (!shop) return null;
    const basePriceGBP = fullRepaintBasePriceGBP(vehicle.modelId);
    const shopBookings: BookingWindow[] = bookings.filter((b) => b.repaintShopId === shop.id).map((b) => ({ startDay: b.startGameDay, completionDay: b.completionGameDay }));
    // "2 away at once" per depot group — shared with re-power (T179),
    // since a bus away for either reason occupies the same real slot.
    // Tightened to 1 for an island depot group (2026-11-19, live
    // request: "On Islands when a vehicle is away for re-painting or
    // re-powering then only 1 can be away") — real `isIslandDepotGroup`
    // check (fare-journey.mts), same real depot-location-against-real-
    // fare-zones machinery already used for the Airlink 100/Lothian XLB
    // fallback and the stop-upgrade work.
    const fullRepaintAwayBookings = bookings.filter((b) => b.repaintType === "full").map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));
    const repowerAwayBookings = repowerBookings.map((b) => ({ vehicleId: b.vehicleId, startGameDay: b.startGameDay, completionGameDay: b.completionGameDay }));
    const groupCapBookings = combinedAwayWindows(vehicles, fullRepaintAwayBookings, repowerAwayBookings, vehicle.depotGroupId);
    const groupAwayCap = isIslandDepotGroup(vehicle.depotGroupId, allDepotsForIslandCheck, allZonesForIslandCheck) ? 1 : 2;
    const bookingWindow = scheduleRepaintBooking(today, shop.turnaroundDays, shopBookings, shop.concurrentCapacity, groupCapBookings, groupAwayCap);
    return { basePriceGBP, discountPercent, finalPriceGBP: applyDiscount(basePriceGBP, discountPercent), window: bookingWindow };
  }

  function renderBookingSection(): HTMLElement {
    const section = document.createElement("div");
    section.style.borderBottom = "1px solid var(--border)";
    section.style.paddingBottom = "8px";
    section.style.marginBottom = "8px";

    const heading = document.createElement("div");
    heading.style.fontWeight = "600";
    heading.style.marginBottom = "4px";
    heading.textContent = "Book a repaint";
    section.appendChild(heading);

    if (vehicles.length === 0) {
      const none = document.createElement("div");
      none.style.color = "var(--text-muted)";
      none.textContent = "No vehicles owned yet.";
      section.appendChild(none);
      return section;
    }

    const vehicle = vehicles.find((v) => v.id === bookingVehicleId) ?? vehicles[0];

    const vehicleDropdown = createDropdown(vehicles.map(vehicleLabel), vehicleLabel(vehicle), (chosenLabel) => {
      const chosen = vehicles.find((v) => vehicleLabel(v) === chosenLabel);
      if (chosen) bookingVehicleId = chosen.id;
      bookingError = "";
      render();
    });
    vehicleDropdown.el.style.marginBottom = "4px";
    section.appendChild(vehicleDropdown.el);

    const typeLabels = { full: "Full repaint (at a shop)", simple: "Simple repaint (at the home depot)" };
    const typeDropdown = createDropdown(Object.values(typeLabels), typeLabels[bookingType], (chosenLabel) => {
      bookingType = (Object.entries(typeLabels).find(([, l]) => l === chosenLabel)?.[0] ?? "full") as RepaintType;
      bookingError = "";
      render();
    });
    typeDropdown.el.style.marginBottom = "4px";
    section.appendChild(typeDropdown.el);

    if (bookingType === "full") {
      if (shops.length === 0) {
        const none = document.createElement("div");
        none.style.color = "var(--text-muted)";
        none.textContent = "No repaint shops placed yet — place one above first.";
        section.appendChild(none);
        return section;
      }
      const shop = shops.find((s) => s.id === bookingShopId) ?? shops[0];
      const shopDropdown = createDropdown(shops.map((s) => s.name), shop.name, (chosenLabel) => {
        const chosen = shops.find((s) => s.name === chosenLabel);
        if (chosen) bookingShopId = chosen.id;
        bookingError = "";
        render();
      });
      shopDropdown.el.style.marginBottom = "4px";
      section.appendChild(shopDropdown.el);
    }

    const preview = previewBooking(vehicle, bookingType, bookingType === "full" ? bookingShopId : null);
    const previewLine = document.createElement("div");
    previewLine.style.color = "var(--text-muted)";
    previewLine.style.marginBottom = "4px";
    previewLine.textContent = preview
      ? `£${preview.finalPriceGBP} — away from ${formatDay(preview.window.startDay)} to ${formatDay(preview.window.completionDay)}`
      : "Pick a shop to see the price and dates.";
    section.appendChild(previewLine);

    const bookButton = document.createElement("button");
    bookButton.className = "btn";
    bookButton.textContent = "Book it";
    bookButton.disabled = preview === null;
    bookButton.addEventListener("click", async () => {
      const latest = previewBooking(vehicle, bookingType, bookingType === "full" ? bookingShopId : null);
      if (!latest) return;
      try {
        await window.repaintBookings.create(
          vehicle.id,
          bookingType === "full" ? bookingShopId : null,
          bookingType,
          latest.basePriceGBP,
          latest.discountPercent,
          latest.finalPriceGBP,
          todayDayIndex(),
          latest.window.startDay,
          latest.window.completionDay,
        );
        bookingError = "";
        await reload();
      } catch (err) {
        bookingError = err instanceof Error ? err.message : String(err);
      }
      render();
    });
    section.appendChild(bookButton);

    if (bookingError) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "4px";
      error.textContent = bookingError;
      section.appendChild(error);
    }

    return section;
  }

  function renderBookingsList(): HTMLElement {
    const section = document.createElement("div");
    section.style.borderBottom = "1px solid var(--border)";
    section.style.paddingBottom = "8px";
    section.style.marginBottom = "8px";

    const heading = document.createElement("div");
    heading.style.fontWeight = "600";
    heading.style.marginBottom = "4px";
    heading.textContent = "Booked in";
    section.appendChild(heading);

    if (bookings.length === 0) {
      const none = document.createElement("div");
      none.style.color = "var(--text-muted)";
      none.textContent = "Nothing booked in.";
      section.appendChild(none);
      return section;
    }

    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const shopById = new Map(shops.map((s) => [s.id, s]));
    const today = todayDayIndex();

    for (const booking of bookings) {
      const row = document.createElement("div");
      row.style.borderTop = "1px solid var(--border)";
      row.style.paddingTop = "4px";
      row.style.marginTop = "4px";

      const vehicle = vehicleById.get(booking.vehicleId);
      const where = booking.repaintType === "simple" ? "at the home depot" : (shopById.get(booking.repaintShopId ?? -1)?.name ?? "an unknown shop");
      const status = today < booking.startGameDay ? "Booked" : today > booking.completionGameDay ? "Done" : "In progress";

      const summary = document.createElement("div");
      summary.textContent = `${vehicle ? vehicleLabel(vehicle) : `Vehicle #${booking.vehicleId}`} — ${booking.repaintType === "full" ? "Full" : "Simple"} repaint ${where}`;
      row.appendChild(summary);

      const detail = document.createElement("div");
      detail.style.color = "var(--text-muted)";
      detail.textContent = `${status} — ${formatDay(booking.startGameDay)} to ${formatDay(booking.completionGameDay)} — £${booking.finalPriceGBP}${booking.discountPercent > 0 ? ` (${booking.discountPercent}% off)` : ""}`;
      row.appendChild(detail);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon";
      deleteButton.style.marginTop = "2px";
      deleteButton.textContent = "Cancel";
      deleteButton.addEventListener("click", async () => {
        await window.repaintBookings.delete(booking.id);
        await reload();
        render();
      });
      row.appendChild(deleteButton);

      section.appendChild(row);
    }

    return section;
  }

  function render(): void {
    body.replaceChildren();
    body.appendChild(renderBookingSection());
    body.appendChild(renderBookingsList());

    if (shops.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No repaint shops placed yet.";
      body.appendChild(empty);
    }

    for (const shop of shops) {
      const row = document.createElement("div");
      row.style.borderBottom = "1px solid var(--border)";
      row.style.padding = "6px 0";

      const topRow = document.createElement("div");
      topRow.style.display = "flex";
      topRow.style.alignItems = "center";
      topRow.style.gap = "6px";

      const name = document.createElement("span");
      name.style.flex = "1";
      name.textContent = shop.name;
      topRow.appendChild(name);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        await window.repaintShops.delete(shop.id);
        errorMessage = "";
        if (expandedShopId === shop.id) expandedShopId = null;
        await reload();
        render();
      });
      topRow.appendChild(deleteButton);
      row.appendChild(topRow);

      const capacityRow = document.createElement("div");
      capacityRow.style.display = "flex";
      capacityRow.style.alignItems = "center";
      capacityRow.style.gap = "6px";
      capacityRow.style.marginTop = "4px";

      const concurrentInput = document.createElement("input");
      concurrentInput.type = "number";
      concurrentInput.min = "1";
      concurrentInput.step = "1";
      concurrentInput.value = String(shop.concurrentCapacity);
      concurrentInput.style.width = "48px";
      concurrentInput.title = "Concurrent capacity — how many vehicles the shop can work on at once";
      capacityRow.appendChild(concurrentInput);
      const atOnceLabel = document.createElement("span");
      atOnceLabel.style.color = "var(--text-muted)";
      atOnceLabel.textContent = "at once,";
      capacityRow.appendChild(atOnceLabel);

      const turnaroundInput = document.createElement("input");
      turnaroundInput.type = "number";
      turnaroundInput.min = "1";
      turnaroundInput.step = "1";
      turnaroundInput.value = String(shop.turnaroundDays);
      turnaroundInput.style.width = "48px";
      turnaroundInput.title = "Turnaround — working days per vehicle";
      capacityRow.appendChild(turnaroundInput);
      const daysLabel = document.createElement("span");
      daysLabel.style.color = "var(--text-muted)";
      daysLabel.textContent = "days each";
      capacityRow.appendChild(daysLabel);

      const setCapacityButton = document.createElement("button");
      setCapacityButton.className = "btn btn-icon";
      setCapacityButton.textContent = "Set";
      setCapacityButton.addEventListener("click", async () => {
        const concurrent = parsePositiveInt(concurrentInput.value);
        const turnaround = parsePositiveInt(turnaroundInput.value);
        if (concurrent === null || turnaround === null) {
          errorMessage = "Concurrent capacity and turnaround days must both be whole numbers above zero.";
          render();
          return;
        }
        try {
          await window.repaintShops.setConcurrentCapacity(shop.id, concurrent);
          await window.repaintShops.setTurnaroundDays(shop.id, turnaround);
          errorMessage = "";
          await reload();
        } catch (err) {
          showError(err);
        }
        render();
      });
      capacityRow.appendChild(setCapacityButton);
      row.appendChild(capacityRow);

      const entrances = entrancesByShop.get(shop.id) ?? [];
      const toggleEntrancesButton = document.createElement("button");
      toggleEntrancesButton.className = "btn btn-icon";
      toggleEntrancesButton.style.marginTop = "4px";
      toggleEntrancesButton.textContent = `${expandedShopId === shop.id ? "Hide" : "Show"} entrances (${entrances.length})`;
      toggleEntrancesButton.addEventListener("click", () => {
        expandedShopId = expandedShopId === shop.id ? null : shop.id;
        refreshEntrancesLayer();
        render();
      });
      row.appendChild(toggleEntrancesButton);

      if (expandedShopId === shop.id) {
        const entrancesSection = document.createElement("div");
        entrancesSection.style.marginTop = "4px";
        entrancesSection.style.paddingLeft = "8px";
        entrancesSection.style.borderLeft = "2px solid var(--border)";

        if (entrances.length === 0) {
          const none = document.createElement("div");
          none.style.color = "var(--text-muted)";
          none.textContent = "No entrances yet.";
          entrancesSection.appendChild(none);
        }
        for (const entrance of entrances) {
          const entranceRow = document.createElement("div");
          entranceRow.style.display = "flex";
          entranceRow.style.alignItems = "center";
          entranceRow.style.gap = "6px";
          entranceRow.style.marginTop = "4px";
          const modeDropdown = createDropdown(Object.values(ENTRANCE_MODE_LABELS), ENTRANCE_MODE_LABELS[entrance.mode], (chosenLabel) => {
            const mode = (Object.entries(ENTRANCE_MODE_LABELS).find(([, l]) => l === chosenLabel)?.[0] ?? "both") as DealerEntranceMode;
            void window.repaintShops.setEntranceMode(entrance.id, mode).then(async () => {
              await reload();
              render();
            });
          });
          modeDropdown.el.style.flex = "1";
          entranceRow.appendChild(modeDropdown.el);

          const removeEntranceButton = document.createElement("button");
          removeEntranceButton.className = "btn btn-icon";
          removeEntranceButton.textContent = "Remove";
          removeEntranceButton.addEventListener("click", async () => {
            await window.repaintShops.deleteEntrance(entrance.id);
            await reload();
            render();
          });
          entranceRow.appendChild(removeEntranceButton);
          entrancesSection.appendChild(entranceRow);
        }

        const addEntranceButton = document.createElement("button");
        addEntranceButton.className = "btn";
        addEntranceButton.style.marginTop = "4px";
        addEntranceButton.textContent = "+ Add entrance";
        addEntranceButton.title = "Click a road near this shop to add an entrance";
        addEntranceButton.addEventListener("click", () => {
          addEntranceForShop = shop;
          map.getCanvas().style.cursor = "crosshair";
        });
        entrancesSection.appendChild(addEntranceButton);

        row.appendChild(entrancesSection);
      }

      body.appendChild(row);
    }

    const placeSection = document.createElement("div");
    placeSection.style.borderTop = "1px solid var(--border)";
    placeSection.style.marginTop = "8px";
    placeSection.style.paddingTop = "8px";

    if (pendingLngLat) {
      const form = document.createElement("div");
      const nameInput = document.createElement("input");
      nameInput.placeholder = "Shop name";
      nameInput.style.display = "block";
      nameInput.style.marginBottom = "4px";
      const concurrentInput = document.createElement("input");
      concurrentInput.type = "number";
      concurrentInput.min = "1";
      concurrentInput.step = "1";
      concurrentInput.placeholder = "Concurrent capacity (vehicles at once)";
      concurrentInput.style.display = "block";
      concurrentInput.style.marginBottom = "4px";
      const turnaroundInput = document.createElement("input");
      turnaroundInput.type = "number";
      turnaroundInput.min = "1";
      turnaroundInput.step = "1";
      turnaroundInput.placeholder = "Turnaround (working days per vehicle)";
      turnaroundInput.style.display = "block";
      turnaroundInput.style.marginBottom = "4px";
      const save = document.createElement("button");
      save.className = "btn";
      save.textContent = "Save shop";
      save.addEventListener("click", async () => {
        const concurrent = parsePositiveInt(concurrentInput.value);
        const turnaround = parsePositiveInt(turnaroundInput.value);
        const name = nameInput.value.trim();
        if (!name) {
          errorMessage = "Give the shop a name.";
          render();
          return;
        }
        if (concurrent === null || turnaround === null) {
          errorMessage = "Concurrent capacity and turnaround days must both be whole numbers above zero.";
          render();
          return;
        }
        try {
          await window.repaintShops.create(name, pendingLngLat!.lng, pendingLngLat!.lat, concurrent, turnaround);
          pendingLngLat = null;
          errorMessage = "";
          await reload();
        } catch (err) {
          showError(err);
        }
        render();
      });
      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        pendingLngLat = null;
        errorMessage = "";
        render();
      });
      form.append(nameInput, concurrentInput, turnaroundInput, save, cancel);
      placeSection.appendChild(form);
    } else {
      const place = document.createElement("button");
      place.className = "btn";
      place.textContent = placing ? "Cancel placing" : "Place repaint shop";
      place.addEventListener("click", () => {
        placing = !placing;
        errorMessage = "";
        render();
      });
      placeSection.appendChild(place);
      if (placing) {
        const hint = document.createElement("div");
        hint.style.color = "var(--text-muted)";
        hint.style.marginTop = "4px";
        hint.textContent = "Click the map where the shop is.";
        placeSection.appendChild(hint);
      }
    }
    body.appendChild(placeSection);

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "6px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  map.on("click", (e) => {
    if (!placing || pendingLngLat) return;
    placing = false;
    pendingLngLat = e.lngLat;
    errorMessage = "";
    panel.style.display = "flex";
    render();
  });

  // "Add entrance" on an already-existing shop — exact mirror of
  // dealer-placement.ts's own identical handler.
  map.on("click", (e) => {
    if (!addEntranceForShop || placing || routeDrawState.isDrawing || placeStopState.isPlacing || placeDepotState.isPlacing || placeDealerState.isPlacing) return;
    const shop = addEntranceForShop;
    addEntranceForShop = null;
    map.getCanvas().style.cursor = "";
    const snapped = router.snap_entrance_to_junction(e.lngLat.lng, e.lngLat.lat);
    if (snapped.length !== 2) return;
    void window.repaintShops.addEntrance(shop.id, snapped[0], snapped[1], "both").then(async () => {
      await reload();
      render();
    });
  });

  repaintShopPanelState.open = () => {
    panel.style.display = "flex";
    void reload().then(() => render());
  };
  repaintShopPanelState.close = () => {
    panel.style.display = "none";
  };

  await reload();
}
