// Route statistics panel (DESIGN.md §2/§11, Phase 4, plan #12 of the
// approved 2026-11-15 batch). Confirmed spec, OPEN-ITEMS.md verbatim: "a
// menu to see route statistics so i can adjust routes to be more
// efficient." Pure calculation lives in route-statistics.mts — this file
// is the UI/DOM layer only, matching this project's own established
// split (fare-pricing.mts/fare-pricing-panel.ts, etc.).
//
// Deliberately a standalone floating toggle, not wired into one of
// bottom-bar.ts's own 9 fixed sections — none of them (Fares/Routes/
// Timetables/Duties/Depots/Fleet/Calendar/Finance/Map) is scoped to cover
// this, and restructuring that shared, already-designed 9-section layout
// is out of scope for this one feature. Uses the exact same standalone-
// toggle convention several existing features already follow (stops-
// layer.ts's "Hidden stops", dealer-placement.ts, depot-placement.ts),
// anchored off bottom-bar.ts's own BOTTOM_BAR_CLEARANCE_PX.
//
// Of the 4 confirmed metrics, 2 are genuine, confirmed gaps shown
// honestly rather than faked — see route-statistics.mts's own header for
// exactly why: cost per mile (no real running-cost figure exists
// anywhere in this codebase yet) and punctuality (no real-time delay/
// variance model exists at all, so "on time %" would trivially always
// read 100% by construction).
import { createDropdown } from "./dropdown";
import { BOTTOM_BAR_CLEARANCE_PX } from "./bottom-bar";
import { computeRouteStatistics, type RouteStatistics, type RouteStatsAccumulator } from "./route-statistics.mts";

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatPerMile(pence: number | null): string {
  return pence === null ? "—" : `${formatPence(pence)}/mile`;
}

export const routeStatisticsPanelState: {
  open: (() => void) | null;
  close: (() => void) | null;
} = { open: null, close: null };

export async function mountRouteStatisticsPanel(): Promise<void> {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Route statistics";
  toggle.style.position = "absolute";
  toggle.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX}px`;
  // right: 268px, not 128px (2026-11-19 real bug fix) — this collided
  // pixel-for-pixel with stops-layer.ts's own "Place stop" toggle
  // (same bottom/right/z-index), which mounts earlier in main.ts's own
  // boot sequence; this panel being added later in the DOM meant it
  // silently rendered on top and fully hid "Place stop" underneath it —
  // live bug report: "There is no button to add a new stop." 268px
  // clears "Place stop"'s own real width with margin to spare.
  toggle.style.right = "268px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.bottom = `${BOTTOM_BAR_CLEARANCE_PX + 36}px`;
  panel.style.right = "268px";
  panel.style.zIndex = "2";
  panel.style.width = "640px";
  panel.style.maxHeight = "70vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Route statistics";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let depotGroups: DepotGroup[] = [];
  let selectedDepotGroupId: number | null = null;
  let routesInGroup: Route[] = [];
  let statsByRouteId = new Map<number, RouteStatistics>();

  function getVehicleSimBridge(): { routeStatsAccumulatorFor?: (routeId: number) => RouteStatsAccumulator | undefined } | undefined {
    return (window as unknown as { __vehicleSim?: { routeStatsAccumulatorFor?: (routeId: number) => RouteStatsAccumulator | undefined } }).__vehicleSim;
  }

  async function reload(): Promise<void> {
    [depotGroups] = await Promise.all([window.depotGroups.list()]);
    if (selectedDepotGroupId === null || !depotGroups.some((g) => g.id === selectedDepotGroupId)) {
      selectedDepotGroupId = depotGroups[0]?.id ?? null;
    }
    if (selectedDepotGroupId === null) {
      routesInGroup = [];
      statsByRouteId = new Map();
      return;
    }
    const [allRoutes, transactions, allTimetables] = await Promise.all([
      window.routes.list(),
      window.finance.list(selectedDepotGroupId),
      window.routeTimetables.listAll(),
    ]);
    routesInGroup = allRoutes.filter((r) => r.depotGroupId === selectedDepotGroupId);
    const bridge = getVehicleSimBridge();
    const fareTransactions = transactions.map((t) => ({ category: t.category, description: t.description, amountGBPPence: t.amountGBPPence }));
    statsByRouteId = new Map(
      routesInGroup.map((r) => [
        r.id,
        computeRouteStatistics(
          { id: r.id, number: r.number, points: r.points, terminusIndex: r.terminusIndex, startIndex: r.startIndex },
          bridge?.routeStatsAccumulatorFor?.(r.id),
          fareTransactions,
          allTimetables.filter((t) => t.routeId === r.id),
        ),
      ]),
    );
  }

  function render(): void {
    body.innerHTML = "";

    const groupLabel = document.createElement("label");
    groupLabel.className = "label-muted";
    groupLabel.textContent = "Depot group";
    body.appendChild(groupLabel);

    if (depotGroups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "label-muted";
      empty.textContent = "No depot groups yet.";
      body.appendChild(empty);
      return;
    }

    const groupDropdown = createDropdown(
      depotGroups.map((g) => g.name),
      depotGroups.find((g) => g.id === selectedDepotGroupId)?.name ?? depotGroups[0].name,
      async (name) => {
        selectedDepotGroupId = depotGroups.find((g) => g.name === name)?.id ?? null;
        await reload();
        render();
      },
    );
    groupDropdown.el.style.marginBottom = "10px";
    body.appendChild(groupDropdown.el);

    const refreshButton = document.createElement("button");
    refreshButton.className = "btn";
    refreshButton.textContent = "Refresh";
    refreshButton.style.marginBottom = "10px";
    refreshButton.addEventListener("click", async () => {
      await reload();
      render();
    });
    body.appendChild(refreshButton);

    if (routesInGroup.length === 0) {
      const empty = document.createElement("div");
      empty.className = "label-muted";
      empty.textContent = "This depot group has no routes yet.";
      body.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "13px";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Route", "Load factor", "Revenue/mile", "Cost/mile", "On time", "Carried vs. gave up", "Vehicles needed"]) {
      const th = document.createElement("th");
      th.textContent = label;
      th.style.textAlign = "left";
      th.style.padding = "4px 6px";
      th.style.borderBottom = "1px solid var(--border, #444)";
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const sortedRoutes = [...routesInGroup].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    for (const route of sortedRoutes) {
      const stats = statsByRouteId.get(route.id);
      const tr = document.createElement("tr");

      const numberCell = document.createElement("td");
      numberCell.textContent = route.number;
      numberCell.style.padding = "4px 6px";
      tr.appendChild(numberCell);

      const loadCell = document.createElement("td");
      loadCell.textContent = formatPercent(stats?.loadFactorPercent ?? null);
      loadCell.style.padding = "4px 6px";
      tr.appendChild(loadCell);

      const revenueCell = document.createElement("td");
      revenueCell.textContent = formatPerMile(stats?.revenuePerMileGBPPence ?? null);
      revenueCell.style.padding = "4px 6px";
      tr.appendChild(revenueCell);

      // Not tracked anywhere in this codebase yet — route-statistics.mts's
      // own header explains why (no real fuel/energy/maintenance running
      // cost figure exists). Shown as an explicit gap, never a fabricated
      // number.
      const costCell = document.createElement("td");
      costCell.textContent = "not tracked yet";
      costCell.className = "label-muted";
      costCell.style.padding = "4px 6px";
      tr.appendChild(costCell);

      // Not tracked anywhere in this codebase yet — see route-
      // statistics.mts's own header: no real-time delay/variance model
      // exists, so an "on time %" figure today would be a disguised
      // constant, not a real statistic.
      const punctualityCell = document.createElement("td");
      punctualityCell.textContent = "not tracked yet";
      punctualityCell.className = "label-muted";
      punctualityCell.style.padding = "4px 6px";
      tr.appendChild(punctualityCell);

      const carriedCell = document.createElement("td");
      if (stats && (stats.tripsCarried > 0 || stats.tripsGaveUp > 0)) {
        carriedCell.textContent = `${stats.tripsCarried} carried, ${stats.tripsGaveUp} gave up (${formatPercent(stats.giveUpRatePercent)} gave up)`;
      } else {
        carriedCell.textContent = "no data yet";
        carriedCell.className = "label-muted";
      }
      carriedCell.style.padding = "4px 6px";
      tr.appendChild(carriedCell);

      // Peak vehicle requirement (round-trip time ÷ busiest headway,
      // rounded up) — real, from the route's own published timetable
      // offsets; null only when the route has no real timetable at all
      // yet (route-statistics.mts's own null convention).
      const pvrCell = document.createElement("td");
      const pvr = stats?.peakVehicleRequirement ?? null;
      if (pvr) {
        pvrCell.textContent = `${pvr.vehicles} vehicle${pvr.vehicles === 1 ? "" : "s"} (${Math.round(pvr.roundTripSeconds / 60)} min round trip ÷ every ${pvr.busiestIntervalMinutes} min)`;
      } else {
        pvrCell.textContent = "no timetable yet";
        pvrCell.className = "label-muted";
      }
      pvrCell.style.padding = "4px 6px";
      tr.appendChild(pvrCell);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  }

  toggle.addEventListener("click", () => {
    if (panel.style.display === "none") routeStatisticsPanelState.open?.();
    else routeStatisticsPanelState.close?.();
  });

  routeStatisticsPanelState.open = () => {
    panel.style.display = "flex";
    void reload().then(render);
  };
  routeStatisticsPanelState.close = () => {
    panel.style.display = "none";
  };
}
