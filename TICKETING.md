# TICKETING.md — ticket machines, mobile app, AVL, station screens

Companion to `DESIGN.md`/`OPERATIONS.md`/`VEHICLE-SPECS.md`/`UK-EXPANSION.md`/
`CLAUDE.md`; where it conflicts with any of the four, it wins, being the more
recent and more detailed source. Supplied by the user 2026-10-09, not yet
built — see `OPEN-ITEMS.md` for how it maps onto the current build order.

---

## 1. Ticket machine tiers (per depot group)

|  | Basic | Mid | Advanced |
|---|---|---|---|
| What it is | Default machine, no cost | In-place upgrade of the Basic machine | Completely new machine (full replacement, not an upgrade path) |
| Price | £0 | £350 per vehicle | £2,800 per vehicle |
| ITSO/concessionary pass reader | Yes (standard on all tiers) | Yes | Yes |
| Cash sales | Slower, manual change | Faster change-giving | Faster change-giving |
| QR code scanning | No | Yes | Yes |
| Data upload | End-of-day only (when the bus returns to depot) | End-of-day only | Real-time over 4G |
| GPS-linked automatic fare-stage calculation (uses AVL position) | No | No | Yes |
| Automatic Passenger Counting (APC), feeding real boarding/alighting counts into the demand sim | No | No | Yes |

**QR effects**: slightly faster boarding, less fare evasion, encourages mobile
app use, marketing boost, works with all ticket types.

**Depot-group uniformity**: every ticket machine in a depot group must be the
same tier. Upgrades are a bulk action for the whole group.

**Advanced ratchet**: once any depot group has Advanced machines, every new
depot group must start with Advanced. Mid does not trigger this. Groups can
sit at Basic or Mid independently, and a new group can still start at Basic
even if another group is on Mid.

**Defect cards**: drivers complete a defect card at first use of a bus each
day. It is paper by default and becomes digital once the depot group's
machines are upgraded to Advanced. The fields recorded and the maintenance
consequences are not specified yet.

---

## 2. Tap-on tap-off (separate option, any tier)

£1,500 per vehicle.

Small satisfaction boost (same tier as USB/Wi-Fi), faster boarding, and it
automatically charges the cheapest valid ticket for the journeys taken.

It can be fitted over several days, but it only becomes active once every bus
in the depot group has it.

Not available on long-distance vehicles, because their tickets are
pre-booked.

---

## 3. Install rules

Each upgrade can be installed by the depot's own engineers (free, uses
engineering time) or by the supplier (faster, for a fee per bus):

| Upgrade | Engineer (free) | Supplier (fee) |
|---|---|---|
| Tap-on tap-off | 2 hours/bus | 30 minutes/bus, £100/bus |
| Mid upgrade | 3 hours/bus | 1 hour/bus, £150/bus |
| Advanced | 5 hours/bus | 1.5 hours/bus, £250/bus |

**Engineer installs (free)**: done overnight and/or at weekends. Small depots
that don't normally work weekends can do it on a Saturday only, with staff
paid 2x.

**Supplier installs (fee)**: must be done at a weekend, so every bus is
finished before most are needed on Monday morning.

**Same-day rule (Mid and Advanced)**: every bus in the depot group switches on
the same day, so big depots will usually need the paid supplier option to fit
the whole fleet in one window.

---

## 4. Company-wide one-off upgrades (not per vehicle)

- **Upgradable ticket app**: £20,000. Raises how many tickets the QR machines
  can process. Purely functional, no satisfaction effect.
- **Mobile app live bus data**: £12,000. Satisfaction and marketing boost,
  fleet-wide.
- **Upgraded AVL data**: £60,000. Satisfaction boost at stops and stations,
  small marketing boost. Feeds the station and stop info screens and the
  mobile app.

---

## 5. Bus station / interchange option

**Ticket information screens**: £4,000 per bus station or interchange. They
display ticket info only and can't sell tickets. They give a slight boost to
loading speed at that site and increase mobile app uptake, but the uptake
effect only applies once the mobile app is bought.

---

## 6. Long-distance ticket purchase rules

Long-distance tickets can only be bought through the mobile app, or at a bus
station from a travel centre staff member (the existing role, used here as
the "service desk"). They can't be bought from on-board machines or the info
screens.

They must be bought at least 10 minutes before the bus is due at the pickup
stop.

This refines the existing rule that long-distance demand is pre-ticketed,
with no walk-up demand at those stops.
