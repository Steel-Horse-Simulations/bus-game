# Bus Management Game — Design Specification

A 2D bus company management game set on the real Scottish road network, using
OpenStreetMap data for the map, the routing, the stops and the demand.

The player runs a bus operator: buys vehicles, builds routes and timetables,
hires and rosters staff, bids for council contracts, and tries to make money.

Companion documents: `OPERATIONS.md` (depots, vehicles, staff, maintenance) and
`CLAUDE.md` (stack, build order, working notes).

---

## 1. World and data

### Extent
Scotland plus the English border towns — Carlisle, Berwick-upon-Tweed and the
surrounding strip. Built from a Geofabrik `scotland-latest.osm.pbf` extract
widened with `osmium extract` and a bounding polygon.

The whole map is open from the start. No expansion mechanic, no starting town.

### Taken from OSM
- **Roads** — `highway=*`, with `oneway`, `access`, `psv`, `bus`, turn
  restriction relations and `maxspeed`. Road width is rarely tagged, so it is
  inferred from road class; the renderer needs it for route bands (§11).
- **Stops** — `highway=bus_stop`, `public_transport=platform`.
- **Bus stations** — `amenity=bus_station`, with stands where mapped.
- **Stop groups** — `public_transport=stop_area` relations (§4).
- **Land use and POIs** — housing, retail, schools, workplaces, for demand.
- **Venues and ports** — `leisure=stadium`, `amenity=ferry_terminal` and
  park-and-ride tagging, for event contracts (§10).

### The override layer
OSM data is often wrong or incomplete. Every category of imported data must be
editable, with the edit stored in the save and the original recoverable.

One mechanism, used everywhere:
- a warning wherever the player has overridden imported data,
- a **Reset to OSM** action on every edit page,
- imported data held read-only and never mutated.

Covers stop positions, bus station stand counts, road geometry, inferred road
widths, and routing behaviour where the router picks an obviously wrong path.

### Licensing
OSM is ODbL. Rendered tiles are a Produced Work needing attribution only. The
derived road graph and stop database are a derived database, so share-alike
applies if distributed. Attribution must be visible in game.

---

## 2. Simulation model

### Vehicles
Every bus drives the real road network — not abstract movement along a route
line, and not a full traffic simulation with private cars.

Journey times come from road class and time of day, plus roadworks, incidents
and breakdowns. A late bus carries on and arrives late; it never skips stops,
but it recovers time at later timing points where the timetable has slack.

### Passengers — two tier
Individual passengers with an origin and destination, making multi-leg journeys
and changing buses where necessary. That cannot be simulated at national scale,
so it runs at two tiers:

- **Agent tier** — individual passengers, near the camera.
- **Statistical tier** — aggregate flows everywhere else.

Both must produce identical revenue and loading figures.

Because fare capping (§9) is retroactive, per-passenger spend has to persist
across a day and a week. The statistical tier needs an equivalent of that or the
two tiers will diverge on revenue.

Note that buses render as badges at every zoom (§11), so passengers are never
drawn as figures. The two tiers are an accounting distinction, not something the
player watches.

### Journey planning
Multi-leg journeys require the game to answer "how would this person get from A
to B on the network as it stands". A RAPTOR or Connection Scan implementation
over the player's own timetable, rebuilt whenever a route or timetable changes.

Passengers choose on a generalised cost of walking, waiting and in-vehicle time,
with waiting weighted more heavily than riding.

A stop on the far kerb is a different stop (§4), so the planner must handle
someone crossing the road to travel back.

### Demand
Generated from OSM land use. Varies through the day — commuter peaks, school
runs, quiet evenings and nights. Responds to fares through a single global price
sensitivity, and to awareness (§10).

---

## 3. Time and calendar

Real time, with pause and speed controls.

The calendar uses **28-day months of exactly four weeks**, so weekly rotas,
weekly fare caps and 28-day tickets all line up and a 28-day ticket is precisely
one month. A year is thirteen months. Anything annual — the MOT, the annual
test — is defined as **364 days** rather than twelve months.

Game pace comes from the clock speed, not from shortening the calendar.

---

## 4. Stops

Real OSM stops, plus stops the player places.

**Placement.** A new stop snaps to the road, on the **left kerb for the
direction of travel**, and creates **one stop serving one direction** — matching
how OSM tags them, so placed and imported stops behave identically. A stop can
be placed on a road buses cannot use, with a warning.

**Per-stop settings.**
- **Timing point** — set on the stop, overridable per route. A timing point
  holds a bus running early, and can carry separate arrival and departure times.
- **Connection stop** — any two services meeting here are connected (§7).
- A three-letter reference code, stored but never drawn.

**Per-route settings at a stop.**
- **Drop-off only** and **Pick-up only**. Neither set means both, the default.
  These are per route — different routes can differ at the same stop. At a bus
  station they are set per stand instead and apply to every route using it.

**Grouped stops.** Some places have several shelters serving one location, each
used by different routes — Union Street in Aberdeen is the reference case. Stops
can be grouped; a route selects the group as a single stop then picks the
shelter. `public_transport=stop_area` relations seed the groups.

**Ownership and cost.** Stops are owned by the local council. The player pays a
monthly fee per stop plus a fee per route serving it. Variations count as one
service; an express counts as a separate service. The per-route fee is flat but
reduced for infrequent routes. Pricing depends on location — a city stop costs
more than a village one, and the same location-based pricing applies to depots,
outstations and bus stations.

**Free stops.** A pole-and-flag stop in a low-demand place costs nothing to
serve. Both conditions must hold — the stop must be pole and flag, and demand
must be low. A fee appears only if the **council** upgrades the stop; the player
cannot downgrade a stop to escape the fee, because the council decides what a
stop is. This keeps thin country routes viable, which the contract system relies
on.

A stop can be **bought** for a one-off price plus a smaller ongoing monthly fee,
which allows the player to add upgrades.

**Stop upgrades:** shelter, real-time departure screen, seating, lighting, and
route advertising (which raises awareness — §10).

---

## 5. Bus stations

A proper feature, not a generic stop.

**Ownership** varies by town — some council-owned with rented stands, some the
player can buy or build. Buying is expensive and priced on stand count and
location.

**Function:** layover and stand space, passenger interchange, staff facilities
and mess rooms, and automatic driver swap points.

### Stands
Stands are limited. As more routes use a station, departures must be spread out
or buses queue for a stand. The stand a service uses is set both on the route
creation page and in the bus station.

If a stand is busy, a bus may use **an adjacent stand on either side**. This
only avoids annoying passengers if the departure screens update *and* a PA
announcement is made — which requires those upgrades and a competent enough
controller.

### Rental
At stations the player does not own, renewed or updated monthly:

- **Per bus** — charged for each bus using the stand. Cheap at first, adds up
  quickly with frequency.
- **Monthly fee** — expensive up front, cheapest at volume.

Rental can be **per stand** or **for the whole station**. One or two stands is
cheap; renting every stand individually costs more than taking the whole
station. Stations of three stands or fewer are free to rent.

**Contract interaction:** on per-bus rental, a council owning the station charges
nothing for buses working one of its own contracts — but only when using a stand
already rented for other services. A different stand incurs a reduced fee.

**Without a rented stand**, services use on-street stops instead, which is worse
for passengers.

### Facilities and upgrades
Staff facilities are a monthly cost at stations the player does not own and a
one-time cost at owned ones. Owned stations cost per stand per day to maintain.

**Upgrades:** departure screens, PA announcements, heated waiting area, travel
centre, route advertising, and pantograph charging. Limited parking with
charging infrastructure exists at some stations, buyable with monthly
maintenance or rentable.

Upgrades affect reputation, not income — except the **travel centre**, which
sells season tickets and speeds boarding by selling tickets off the bus, and
which requires customer service staff (`OPERATIONS.md`).

---

## 6. Routes, variations and express

### Building a route
The player clicks stops in order and the roads auto-route between them.
Waypoints force a specific path where the router picks something silly.

### Direction
Every route has an **inbound** and **outbound** direction.

- Normally oriented on the main bus station in the operating area — inbound
  towards it, outbound away.
- On a **circular route**, clockwise is outbound, anticlockwise inbound.
- On a route touching **no bus station**, the largest settlement in the depot
  group is the reference, even if the route never reaches it. Where the route
  runs perpendicular to that anchor, the end nearest it is the inbound end.

### Variations
Unlimited, labelled as the route number plus a letter — route 1 direct, 1A via
a village. Variations may also have different end points while sharing most of
the route. A main route need not exist: 7A and 7B can exist with no 7.

Timetabling in §7.

### Express services
An express is **a variation with a list of skipped stops**, plus its own
pick-up-only and drop-off-only lists. It takes the route number with an X in
front. Some routes are express-only, and an express-only route needs no parent —
X7 can exist with no 7.

- Same fares as the parent route.
- Shares the parent route's band on the road display.
- Journeys sit in **one timetable** with the stopping ones, flagged as express.
- Can skip a timing point, since timing points are per route.
- Counts as a separate service for stop fees.

### Hail and ride
Any stretch of a route between **two stops nominated on that route** can be set
as hail and ride, where passengers board and alight anywhere along it. It is a
per-route setting, not a property of the road.

- Running time is calculated the same as any other section.
- **No council stop fees apply**, since there are no stops.

The journey planner still needs somewhere to board and alight, and demand from
the buildings along the section needs somewhere to attach. The game therefore
places **invisible boarding points** along the section, spaced every couple of
hundred metres, which the planner treats as stops. The player never sees them,
cannot edit them, and is never charged for them.

### Route type and hours
Routes are **local** or **InterCity** (limited stop). Determined automatically
from route length — the real test is whether the route exceeds 50 km — shown to
the player, and overridable with a warning. It decides which drivers' hours
regime applies (`OPERATIONS.md`).

### Dead mileage routes
The player can define a fixed path between two places, such as a depot and a bus
station, which every bus running dead between those points follows. Contract
mileage is nonetheless paid on **actual miles driven**.

---

## 7. Timetables

Full timetables everywhere. Frequency is a **generator** that writes repeated
departures into the timetable, not an alternative model.

### Structure
- **Time-of-day bands** — frequency varies across the day. Defined globally as
  defaults, overridable per route.
- **Day types** — separate timetables per day of the week, each reusable across
  several days (Monday–Friday, Saturday, Sunday being the common case).
- **Event services** sit **on top of** the normal timetable rather than
  replacing it, so an event day runs the normal service plus the event workings.
  This means services need a calendar as well as day types.

### Timing points
A timing point holds a bus running early. Timetables need deliberate slack at
timing points, since that slack is what a delayed bus recovers with.

### Connections
Any two services meeting at a stop marked as a **connection stop** are
connected. If one is late the other waits, up to a **maximum wait set per
route** — but if the maximum is reached and the other bus is **less than 90
seconds away**, it still waits. Time lost is recovered at later timing points
where possible.

### Variation timetabling

**Case A — the variation leaves the main route and rejoins it.** One main
timetable for the route. The variation has its own timetable in each direction.
All timings after the rejoin point shift to account for the extra time.

**Case B — variations split near the end and terminate in different places.**
The shared section has one timetable, set once for the route. Each variation has
its own timings from the point it leaves the shared section.

Return departures are adjusted automatically so every variation returns to the
shared section after the **same elapsed time** from leaving it. The longest
variation sets that figure; shorter ones are padded to match.

*Worked example.* Variation A runs 5 minutes out, waits 5, runs 5 back — 15
minutes. Adding variation B at 7 out, 5 waiting, 7 back — 19 minutes. A's wait
extends from 5 to 9 so both cycles are 19, and the shared section keeps one
cadence regardless of which variation a bus went off on.

Rules that follow:
- Padding sits **entirely at the outer terminus**.
- Each variation has a **minimum wait** at its outer end that padding can raise
  but never cut into.
- Deleting the longest variation **shrinks padding back** to the new longest.
- The padded cycle need **not** divide cleanly into the shared headway. Because
  the player builds duties by hand and a bus is not tied to one route, a bus
  finishing a cycle can be put onto a different service. This is a duty problem,
  not a timetable problem.

---

## 8. Passengers

**Types:** adult, child, and concession/older person.

Concessionary travel is free to the passenger and **reimbursed at a percentage
of the adult fare**, as under the real Scottish scheme. Route choice therefore
has a second economic dimension: a route full of concessionary passengers earns
differently from the same route full of adults.

Season ticket purchase is decided per passenger, based on how often they travel.

Passenger satisfaction is driven by punctuality, vehicle capacity, comfort and
accessibility, cleanliness, stop and station quality, and three staff figures —
driver score, friendliness and happiness. These need to feed **one satisfaction
number** rather than stacking as six separate bonuses.

---

## 9. Fares and ticketing

Fare zones are drawn on the map by the player, in the style of Lothian's. Each
zone is typed **city** or **country**. The **depot group** is the unit of ticket
validity and of fare capping.

### Single fares

| Case | Pricing |
|---|---|
| Within a city zone group | Flat fare, no zone counting |
| Within a country zone group | Banded by zone count, bands set by the player |
| Beyond the originating depot group | Fixed price per mile |
| Long-distance services | No zones — base fare plus price per mile |
| Special services (e.g. airport) | Flat fare regardless of zones |

Where a journey crosses between city and country zones, the higher base price
applies, then the additional price for the type of zone being travelled through.

Night services add an extra base fee and an extra per-zone fee, both set by the
player.

Lothian's real figures for reference: country singles are 1 zone (or 2 if A/B)
£2.40, 2–3 zones £3.40, then £1 per zone to £6.40 at 6 zones; city singles a
flat £2.40; night singles 1 zone £3.50, 2–3 £5.50, 4–6 £8.50.

### Ticket families
Single, return, day, weekly, 28-day, **LATE** (evening, priced between a single
and a day ticket) and **NETWORK** (everything, including special services).

Weekly and 28-day tickets are bought up front, after which the passenger travels
free.

### Capping
Caps apply **automatically** once a passenger reaches them, behaving like a day
ticket bought retroactively. Three tiers, each with a daily and a weekly figure:
city zones (including special services), country zones, and city and country
combined.

Lothian's figures for reference: City DAY £6.00, Country DAY £6.30, City&Country
DAY £9.60; weekly £26.50 / £25.00 / £38.50.

Reference PDFs of the Lothian, Airlink and Lothian Country fares pages are in
`reference/`.

---

## 10. Contracts and economics

### Revenue
Fares, concessionary reimbursement, council contracts and event contracts.

### Council contracts
Councils advertise routes connecting smaller, unprofitable towns to cities or
larger towns.

- Paid per mile on **actual miles driven**, including dead mileage.
- The contract sets the first departure and hours of operation; the player sets
  timings within them.
- Judged on **cost per passenger actually carried**, against a target set
  individually per contract, so a country route is not measured against an urban
  one.
- Too much waste — an over-long route, too much dead mileage — loses the
  contract to the competitor until the next bidding round, when it can be re-bid
  with a changed route.
- **Failure penalties:** a service not run is penalised at **1.2x to 1.8x** what
  it would have paid. Too many failures within a set timeframe loses the
  contract. The multiplier, misses allowed and timeframe are set per contract.

### Event contracts
Large venues and cruise ports offer event-day contracts.

- Routes run from bus stations, park and rides and nearby railway stations.
- Set up once, then run whenever there is an event, to a timetable and frequency
  set by the venue.
- The contract states a minimum and maximum number of events per month when
  offered, and gives **two weeks' notice** of any new event.
- Same penalty and regain rules as council contracts.
- **These pay very well** — see the economy targets below.

**Gate:** contracts are only offered where the player already runs services to
the bus station nearest the contract area.

### The competitor
A named rival with no network of its own, existing only in one area, purely to
punish failed contracts. It runs the route in a made-up livery while it holds
it. There is no head-to-head commercial competition.

### Regulation and reputation
Punctuality targets with financial penalties. LEZ fines for non-Euro VI vehicles
(`OPERATIONS.md`).

**Reputation is per depot group**, affected by punctuality, staff quality,
vehicle quality, cleanliness, and stop and station upgrades.

### Awareness
Three levers, all feeding one demand figure — they must be designed together
rather than as separate bonuses:
- a **marketing budget**, per depot group,
- **route advertising** at owned stops and bus stations,
- **next-stop screens** on vehicles carrying company social media.

### Money
The player starts with **money only** — every depot, vehicle and member of staff
is bought.

There are **no cash loans**; leasing is the only credit. Running out of money
does not end the game — the player simply cannot buy anything until income
recovers.

### Economy targets
The tuning goal is **a well-run route paying back its bus in about 12 months**,
with a badly-run route losing money. Margin follows from that rather than being
set directly.

Reached by three gentle dials rather than one aggressive one: slightly higher
passenger numbers than reality, slightly cheaper running costs, and generous
contract rates — with venue and cruise contracts carrying most of the
generosity, so council rates stay credible.

Every figure the player reads — fares, wages, fuel, vehicle prices — stays
realistic.

### Finance screen
Categorised into groups with expandable sections: revenue, staff, vehicles,
property, contracts at the top level, opening into the lines beneath. Fleet
elite payments sit under staff, stand rental under property, parts stock under
vehicles.

---

## 11. Presentation

One full-screen borderless window. No detachable windows. Player time is
expected to split evenly between map and management screens, so both are
first-class.

### Route display
- **While building a route** — drawn over the road, filled to the road's width,
  at about 75% transparency so the road shows beneath, with small chevrons
  indicating one-directional running.
- **In normal view** — every route on a road is drawn as an even band filling
  the road at 100% opacity. Bands are ordered so they **do not cross at
  junctions**, which is a global constraint rather than a per-road choice; where
  a crossing is genuinely unavoidable the game asks. Where too many routes share
  a road, the number of bands is capped and a count shown for the rest.
- Route display toggles **per depot group**, so the map can show buses alone.

### Buses
Buses are drawn as **badge markers at every zoom** — a small angled rectangle in
a simplified two- or three-colour version of the vehicle's livery, carrying the
route number, with a **direction arrow at the front of the bus**. There are no
mid- or close-zoom sprites, which means the renderer needs no sprite
level-of-detail.

Because the badge reduces a livery to two or three flat colours, livery data
must carry an explicit primary and secondary colour alongside the full design.
Those same colours give the route list its swatches.

### No vehicle artwork
There is no drawn vehicle art anywhere in the game. The purchase screen shows
specifications and a livery swatch, not a picture of the bus. A livery is
therefore a small set of colours rather than an illustration.
