// Company-wide one-off upgrades (TICKETING.md §4) — pure logic only: the
// real fixed prices, recorded in one place rather than scattered across
// db.mts/the UI. Second increment of T66 (OPEN-ITEMS.md), following the
// same "capacity/scheduling only, no money deducted — no finance system
// exists yet" scope call as ticket-machine.mts/repaint-booking.mts: this
// only tracks whether each upgrade has been bought, not any actual spend.
//
// Each upgrade's real effect needs a system that doesn't exist yet, not
// modelled here:
// - Upgradable ticket app raises how many tickets the QR machines can
//   process — meaningless until ticket machine tiers (ticket-machine.mts)
//   are wired into a real passenger/ticketing flow (Phase 4).
// - Mobile app live bus data and upgraded AVL data both affect
//   satisfaction/marketing, which don't exist as simulated numbers yet.
// - Upgraded AVL also feeds station/stop info screens (TICKETING.md §5,
//   not built) and the mobile app itself.
// - The info screens' own "mobile app uptake boost only once the mobile
//   app is bought" interaction (§5) is exactly this flag gating that
//   future effect — recorded here as the one real dependency to keep in
//   mind when §5 is eventually built, not something this file does.

export const UPGRADABLE_TICKET_APP_PRICE_GBP = 20_000;
export const MOBILE_APP_LIVE_DATA_PRICE_GBP = 12_000;
export const UPGRADED_AVL_DATA_PRICE_GBP = 60_000;

export interface CompanyUpgrades {
  hasUpgradableTicketApp: boolean;
  hasMobileAppLiveData: boolean;
  hasUpgradedAvlData: boolean;
}
