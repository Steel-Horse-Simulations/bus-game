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
surrounding strip. Built from Geofabrik's **`great-britain-latest.osm.pbf`**,
clipped to a bounding polygon covering that area.

**It must be the Great Britain file, not the Scotland one.** Geofabrik clips the
Scotland extract at the border, so it contains no Carlisle or Berwick to clip
into. GB is roughly 1.8 GB against 250 MB, so the download and first parse are
slower, but it is a one-off build step and the clipped output is identical
either way.

The clip is done **in the Rust pipeline crate using the `osmpbf` crate**, not with
`osmium`. The file has to be parsed in Rust anyway to build the road graph and
extract stops, stations and land use, so osmium would only be doing the clip —
not worth an external dependency that has no official Windows build.

The whole map is open from the start. No expansion mechanic, no starting town.

**Playable area consistency.** The playable extent should end at the same
southernmost limit consistently across the whole map — currently based on
distance from the Scottish border, which produces an inconsistent edge (e.g.
Newcastle isn't currently playable). Fix the boundary to a single consistent
rule. Non-playable map should not be shown at all, and the map should zoom to
the playable area only on launch, not the whole extract. A **hard minimum
zoom level** stops this being undone by scrolling back out afterwards — the
launch-time zoom sets where the player starts, the minimum zoom is what keeps
them from leaving the playable area again by their own action.

### Taken from OSM
- **Roads** — `highway=*`, with `oneway`, `access`, `psv`, `bus`, turn
  restriction relations and `maxspeed`.

  **Road width** is needed by the renderer for route bands (§11), and comes from
  a three-step fallback:
  1. the **`width`** tag where present — authoritative but rare,
  2. **`lanes`** where present — much more commonly tagged and a far better proxy
     than class, since a two-lane and a four-lane primary are the same class but
     very different roads. Multiply by a typical lane width and add a margin,
  3. **`highway` class defaults** where neither exists.

  Note the colours on openstreetmap.org are only a rendering of the `highway`
  tag, so they carry no information the tag does not.
- **Stops** — `highway=bus_stop`, `public_transport=platform`.
- **Bus stations** — `amenity=bus_station`, with stands where mapped.
- **Stop groups** — `public_transport=stop_area` relations (§4).
- **Land use and POIs** — housing, retail, schools, workplaces, for demand.
- **Venues and ports** — `leisure=stadium`, `amenity=ferry_terminal` and
  park-and-ride tagging, for event contracts (§10).

### Islands and ferries
**Skye and the main ferry islands are included, and so is Shetland** — despite
being genuinely remote, it follows the same rules as the other islands. Skye
needs nothing special, being road-connected.

**Shetland's connection to the mainland also includes a flight**, alongside the
ferry, given the distance. Flights carry **staff and small cargo only** — buses
always travel by ferry. Flights are simplified: available a few times a day, with
no real timetable modelled, unlike the ferries. The flight leg is **dearer than
the ferry but faster**, though parts cost the same by either route — only staff
travel carries the premium.

**Ferries are modelled**, with timetables taken from real OSM ferry routes.
Vehicles cross at a cost and take time, and ferries form part of **passenger
journey planning**, so someone can travel Oban–Craignure–Tobermory as one journey
with a sailing as the middle leg.

**Buses do not use ferries on service or contract work** — only on private
hire and tours, **with one confirmed exception: the Corran Ferry below**, a
short local vehicle crossing buses genuinely drive onto. Island networks are
otherwise self-contained: a Mull depot runs Mull routes, and the ferry is
where passengers arrive from rather than something the timetable depends on.
Piers generate both local demand and ferry arrivals.

**Resolved 2026-11-05** (previously flagged here and in §9 as an
unreconciled inconsistency): neither of §9's ferry mechanisms actually
contradicts the rule above. T108's Citylink 923 Glasgow–Cairnryan–Belfast
case, confirmed directly by the user, is **not** a bus boarding a ferry —
the Scotland-side coach terminates at Cairnryan, passengers cross the
Stena Line sailing on foot, and a separate Northern-Ireland-side coach
continues from the ferry terminal on the far side, under the same route
number as a variation (§6). T107's island ferry tickets work the same
way: a foot-passenger crossing sold alongside, or bundled into, an
ordinary bus ticket — never a bus itself on a vessel. The Corran Ferry
below is the **only** genuine vehicle crossing in the game (and any
future short local crossing confirmed the same way would be the only
other kind) — everything else in §9 is passenger-journey continuity
across a ferry leg the bus itself never touches:
- A **long-distance** route can call at a ferry terminal and continue on
  the far side as a **variation under the same route number** (923, not a
  new number) — the player draws and times both legs as perfectly
  ordinary routes; the game itself only supplies the ferry crossing
  (real OSM ferry-route data, rendered as a dotted line, which also gives
  the real distance for timing and ticket mileage — **built**, see the
  ferry pipeline work, `rust/pipeline/src/ferry_routes.rs`).
- **Resolved 2026-11-05**: this is the first variation that must always
  be run by a **completely separate vehicle** from its parent's own
  fleet, since the two sides of the crossing can never physically reach
  each other. No new mechanism needed — the far-side variation simply
  belongs to a **different depot group** from its parent (see §6), the
  genuinely correct description of it, and duty/vehicle chaining already
  never crosses that boundary.
- The whole Glasgow→Belfast journey sells as **one through-fare** on the
  existing long-distance formula (§9: base + per-mile) — not T107's
  island per-mile ferry-ticket mechanism, a deliberately separate case.
  Of that one fare, **87.5% goes to the ferry company, 12.5% stays with
  the player** ("due to the complexities of running the long distance
  ferry routes") — a bigger operator cut than T107's own 95%/5% island
  split, since this is a major cross-border operator (Stena Line), not a
  small island ferry company.
- Scoped to **long-distance routes only** — not ordinary local/regional
  services.

**A third real confirmed case, strengthening the same flag**: the
**Corran Ferry** (Corran↔Ardgour, near Fort William, run by **The
Highland Council**, real timetable supplied 2026-11-01) is a short
(~5 minute), frequent, local vehicle crossing — buses genuinely drive
onto it as part of ordinary scheduled service, not just long-distance or
island-linking routes. A **different revenue model from both T107 and
T108**, confirmed directly:
- The player pays Highland Council for crossings the **real way a
  company actually does it**, not the casual cash fare: a **book of 30
  tickets for £191.00 (excluding VAT), issued in the business's own
  name** (buses/coaches get their own cheaper book rate — other
  vehicle types pay £229.50 including VAT for the same 30), consumed
  **3 tickets per crossing for a 17–35 seat bus, 5 tickets for 36+
  seats** — an effective **£19.10 per crossing (17–35 seats) or £31.83
  per crossing (36+ seats)**, each a discount on the casual cash fares
  (£23/£35) that only apply to a one-off, non-company crossing. **A
  16-seats-and-under bus/coach uses 2 tickets** (effective £12.73) — the
  user's own rule, not in the real published table (which only breaks
  out 17–35 and 36+), filling the gap below it at the same rate the real
  table already gives a small van/lorry. With **no cut back** either
  way, a pure operating cost, unlike T107/T108's own revenue splits.
- **The ticket book only covers buses/coaches belonging to the Fort
  William depot group** — it's issued in that one business's own name,
  not a company-wide rate any depot group's vehicles can draw on.
  **Private hire work pays the normal casual cash fare** (£23/£35,
  not the book rate) even when it's the Fort William depot group's own
  vehicle making the crossing — the book is for the depot group's own
  scheduled service, not every use of its buses.
- Passengers on that bus pay the real **£2 foot-passenger fare** to the
  player, **in addition to** whatever ticket they already hold for the
  journey — kept as ordinary player revenue, not shared with Highland
  Council.
- Real sailings: every 20–30 minutes through most of the day, Monday to
  Saturday (6:30am–9:30pm) and Sunday (8:45am–9:30pm, a later start),
  not running 25/26 December or 1/2 January.
- Real vehicle restrictions apply from the timetable (two vessels, each
  with its own weight/height/length limits for larger vehicles) —
  relevant mainly to which coach a long-distance or contract service
  could use, not ordinary buses.

**Two more real Highland Council ferries, foot-passenger only** (real
timetables supplied 2026-11-01) — shown on the map for completeness, but
**buses can't use either and the player makes no money from them**:
- **Fort William–Camusnagaul**: Monday–Saturday only (Sunday by special
  arrangement, £100 charge), departures roughly every 2–2.5 hours
  (08:00/10:30/12:20/16:15, plus a 17:30 request-only sailing).
- **Cromarty–Nigg**: every 20–30 minutes through the day (from 08:00
  weekdays/10:00 weekends until 1800), **seasonal — April to October
  only**. Camper vans/motorhomes have real weight/length limits (4
  tonnes, 6m) and motorhomes aren't carried at all (grounding risk).

Where a route calls at a ferry terminal, individual services can be **locked to
the ferry** so retiming never breaks the connection.

Island operations cost the same as the mainland **except vehicle movements**,
which are dearer — every transfer, repaint and collection involves a crossing.

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

**The game's own calendar is the normal, real one, confirmed 2026-11-06** —
real months of their real varying lengths, real leap years, real dates, so
Christmas Day is always 25 December and the festive day types above
(§7 "Structure") land on the actual date every year without any special
handling. This replaces an earlier 28-day-month/13-month calendar that had
been built specifically to keep weekly rotas and weekly fare caps lining up
with it cleanly — reversed because calendar-pinned dates (festive days,
term dates, seasons) need to be real dates, and a well-run company tying
its rotas to a different, shorter internal calendar instead (below) solves
the original problem anyway, the same way real companies do it.

**The company's own financial/operational calendar is separate: a 13-period,
4-week-each cycle (364 days), confirmed 2026-11-06** — "this is what some
real companies do," not just this game. Wages, maintenance, rent, contract
reviews and the fortnightly operational-change cadence below all run on
this period calendar, not the real one, so they keep lining up with weekly
rotas and weekly fare caps exactly as intended. **It floats freely against
the real calendar rather than realigning each year** — period 1 of a new
company year starts the day after the previous period 13 ended, so it
slowly drifts relative to the real calendar over time (364 vs 365/366 real
days), rather than resetting to 1 January. Confirmed as the intended
behaviour, not a bug to fix later.

**Anything annual — the MOT, the annual test — is one real year (365 or
366 days)**, following the real calendar now rather than the old fixed
364-day figure.

Game pace comes from the clock speed, not from shortening the calendar.

**The clock.** At normal speed **one real second is ten game seconds**, so a game
day takes about 2.4 real hours — slow enough to watch buses work a route, which is
the point of simulating real roads.

Speeds are **1x, 4x, 10x, 20x and 60x**. At 60x a day passes in about 2.4 real
minutes and a 28-day company period in roughly an hour, so the periodic cycle —
wages, rent, contract reviews, the operations manager's and commercial team's
changes — comes round several times in a session rather than once.

Note the simulation must **step properly at 60x** rather than teleporting vehicles:
ten game minutes pass per real second, and a naive update will skip buses past
stops. It works at 1x and breaks quietly at speed.

**The recurring cycle.** **Wages are paid every Thursday** (weekly). **Maintenance
is paid every company period**, on its 28-day cycle. **Operational changes
take effect on the Monday of every even-numbered week**, so the network settles
fortnightly rather than shifting daily. Rent, contract reviews and other
period-based items run on the same 28-day company period, not a calendar month.

**Time pauses** automatically for anything needing a decision, and **menus pause the
game** — building a rota or planning a cascade takes real minutes, and running late
while heads-down in a spreadsheet would be miserable.

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
- **Long stop (2026-09-28, not yet built).** Lets more than one bus stop here
  at once, with a configurable capacity up to **3**. A bus behind can leave
  even while the one ahead of it is still stopped — no ordered-departure
  queueing, unlike a bus station stand (§5) or Portree Square's own stance
  rules (UK-EXPANSION.md §13), which this is explicitly separate from. Plain
  ordinary stops only; a bus station's own stand capacity is a different
  mechanic (§5).

**Per-route settings at a stop.**
- **Drop-off only** and **Pick-up only**. Neither set means both, the default.
  These are per route — different routes can differ at the same stop. At a bus
  station they are set per stand instead and apply to every route using it.

**Grouped stops.** Some places have several shelters serving one location, each
used by different routes — Union Street in Aberdeen is the reference case. Stops
can be grouped; a route selects the group as a single stop then picks the
shelter. **Grouping is manual, player-created only** (changed 2026-09-27) — not
seeded from `public_transport=stop_area` relations. A real relation on Princes
Street, Edinburgh grouped far more stops than made sense together, with no way
to correct it; the same problem, and the same fix, as the railway/subway/tram
stop link above (§4 "Station, airport and park-and-ride stop linking"): nothing
groups until the player groups it, either from a stop's own popup (pick an
existing group or create one) or a bulk "assign nearby stops within a radius"
tool on the group's own marker, mirroring bus station stand assignment.

**Facing direction (2026-09-28).** A live user concern: "each stop needs to
know the direction it faces, otherwise if [a route change] uses a better stop
it might be on the wrong side of the road." Every stop's facing direction
(the compass bearing of the travel direction it serves) is now derivable on
demand from its own real position — a new `Router::stop_facing_bearing`
(game-wasm), which reads the road's own oneway direction where one exists,
or for a two-way road, which side of the road the stop's own position
already sits on (the identical side-determination `place_stop` uses against
a fresh click, applied here to a stop's existing coordinates instead). No
pipeline rebuild or new stored field needed — this works uniformly for a
real imported OSM stop and a player-placed one. Shown as a read-only "Faces
[N/NE/E/…]" line in a stop's own popup, and per-member in a group's popup's
new "Members" list, so the direction mismatch the user is worried about is
at least visible wherever a player might swap which group member a route
uses. **Not yet wired into route-drawing itself** — DESIGN.md's own "a
route selects the group as a single stop then picks the shelter" doesn't
exist as a real interactive step yet (route-draw.ts has no group-aware
placement logic), and there's no automated group-member swap either (that's
the commercial team's optimiser, Phase 7+, CLAUDE.md's own hard part on
respecting real-world constraints) — informational only for now, same
"store/surface the data now, wire up the behaviour once the mechanism
exists" precedent as Connection stop and Long stop.

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

**Stop upgrades:** shelter, seating, lighting, and route advertising (which
raises awareness — §10). The old generic "real-time departure screen" upgrade
is gone, replaced entirely by the two real display types in `OPERATIONS.md`
§16 (E-ink and LED stop displays, assigned automatically by a stop's own
busy-hour bus and boarding counts, not bought freely like the other
upgrades here).

### Station, airport and park-and-ride stop linking
Railway stations, airports and park-and-ride sites get stops linked to
them, the same way stops link to a bus station (§5). Unlike bus station
stands — hideable via the map's stop toggle — these linked stops are
**always visible** on the map, and all three generate **higher passenger
demand** for journeys starting or ending there than ordinary land use (§2
"Demand").

Stadiums — grouped with ferry terminals and park and ride as one pipeline
data category (`CLAUDE.md`) — don't get this treatment; stadiums already
have their own eventual event-contract mechanics (§10). Ferry terminals
don't get the stop-linking behaviour itself yet either (full linking is
Phase 9, the same as ferry route/timetable modelling), but reserve a ring
colour now, alongside the other three below, ready for when that lands.

**Colour.** Follows the same ring-around-the-stop visual pattern as bus
station membership, but each stands out in its own colour: bus stations
**#7c3aed** (moved off the original navy, which sat too close to fixed real
contracts' route colours — §10), railway stations **#ff4200**, airports
**#059669**, park and ride **#db2777**, ferry terminals **#0284c7**.

### Stop reservation and branding
A general mechanic, not unique to any one route or contract.

- The player must already **own** the stop (above), then pays a separate
  **one-off flat fee** — the same regardless of where the stop is — to apply
  route branding to it.
- Branding takes **2 weeks** to apply. Once applied, the stop **immediately
  becomes reserved** for that route or company only, and is shown in its
  colour.
- Any other route already using that stop is moved off it by the operations
  manager after **7 days' notice**.
- **Long distance variant.** Long distance services can reserve a stop too,
  but it is branded with **one single fixed long-distance company colour**
  (set once, applies everywhere) rather than one specific route's colour.
  Other long distance routes may still use a stop branded this way — only
  non-long-distance routes are excluded. Same 2-week/7-day timing.
- A contract can come with a reservation **pre-owned** rather than through
  this paid process — see Route 398 and Airlink 100 in §10.

---

## 5. Bus stations

A proper feature, not a generic stop.

**Ownership** varies by town — some council-owned with rented stands, some the
player can buy or build. Buying is expensive and priced on stand count and
location.

**Function:** layover and stand space, passenger interchange, staff facilities
and mess rooms, and automatic driver swap points.

### Stands
Stands are placed by **drawing a line and saying which stands sit on it**. The
first and last are positioned by hand and the rest spread equally along the line,
which snaps to the road even where it curves. This is the same
place-the-ends-and-spread-the-rest pattern used for route variations.

**Drop-off stands.** Some stations — Perth is the example — have a dedicated
drop-off stand. Any stand can be set **drop-off only**, and when one is, the
remaining stands become **pick-up only**. Where no drop-off stand is set, every
stand does both.

**Which stand a bus takes.** A bus arriving only cares about its stand if it is
**leaving again**. Arriving on a service that terminates at stand 3 but departing
from stand 5, it **goes straight to stand 5** — not "as close as it can get" —
because the duty already tells it that's where it needs to be. There is no
relocation step: when a bus finishes one service and starts a different one,
it never arrives somewhere else and then moves, it drops off directly at
whichever stop or stand its **next** service departs from. This applies
identically at bus stations and at grouped stops with no stand layout of
their own (Union Street, Aberdeen, is the example — §4). If it is not leaving
in service it drops off at whichever stand suits.

**Setting the departure stand.** As well as on the route, the stand can be set
from the **bus station settings**, so congestion can be moved off a busy stand
without editing every route that uses it.

**Reserving a stand.** A single stand can be reserved for one route or
company, the same general mechanic as reserving a plain stop (§4) — own
the station, pay the flat fee, 2 weeks to apply, 7 days' notice to move
other routes off it. A fixed real contract's reserved stand comes
pre-owned instead, skipping that process (Express 500's Buchanan Bus
Station Stance 46 — §10).

Stands are limited. As more routes use a station, departures must be spread out
or buses queue for a stand. The stand a service uses is set both on the route
creation page and in the bus station.

If a stand is busy, a bus may use **an adjacent stand on either side**. This
only avoids annoying passengers if the departure screens update *and* a PA
announcement is made — which requires those upgrades and a competent enough
controller.

**Per-stance override rules (2026-09-28, not yet built).** Portree Square
(UK-EXPANSION.md §13) is the first concrete real-world case needing rules
scoped to one specific stance rather than the whole station: which vehicle
category may use it (long-distance only; local only; tour only), a
queue-of-N-with-ordered-departure behaviour distinct from the plain "use an
adjacent stand" rule above, a cap on how many buses may be scheduled across a
named group of stances at once, a maximum dwell time, and a dedicated
break-parking location for one vehicle category once it can't use the stance
itself. Recorded here as a flag that station/stance design should stay
general enough to support this, not because Portree Square's own numbers
belong in this general spec — see UK-EXPANSION.md §13 for those.

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

### Parking, buildings and shared sites
**Parking** at a station is either placed as individual spaces, or left implicit
with the buses hidden as they are at a depot.

**Buildings.** Some depots and stations have buildings buses drive into. The
player draws these areas; they are invisible outside the edit tool. A vehicle
entering one is **progressively clipped at the boundary** — front half inside and
hidden, back half still visible — rather than fading or vanishing at once. It
stops buses disappearing oddly in the middle of open ground.

A bus inside a building **at a station still holds its stand or parking space**.
At a depot it does not, and simply adds to the depot's count.

**Shared sites.** Some bus stations have a depot on the same site — St Andrews is
the example — and that must be possible.

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

## 5a. Terminus and interchanges

A lighter object than a bus station and a separate thing from a grouped stop, used
at airports, railway stations and similar. Seeded from OSM where stops cluster, and
the player can add more.

- Owned by the **site owner** where there is one — the airport or the railway —
  otherwise by the council. Council ones may be buyable in future.
- **Cheap departure fees only**, the same everywhere, but airports and stations
  give a **discount as the player's departures grow**, since the business is worth
  rewarding.
- Stands are **limited but advisory** — the player picks one and nothing stops
  other buses using it, so there is no queuing as at a bus station.
- Features: **shelter, departure screens and seating**, but none of the fuller bus
  station facilities.
- Only some have **split roads**, and those are simply real roads on the map with
  stops on them rather than a drawn layout.
- Counts as a **proper interchange** for journey planning and supports
  **connections** like a connection stop.
- Has **its own map icon**, distinct from stops and bus stations.

## 6. Routes, variations and express

### Building a route
The player clicks stops in order and the roads auto-route between them.
Auto-routing takes the **fastest route, not the shortest** — accounting for
speed limits, not just distance, the same way a real driver would choose.

Waypoints force a specific path where the router picks something silly.

**Fixed (2026-10-09), found via a live dead-mileage bug report** ("it's taking
lots of weird turns instead of going along the main road"): the router's
time-cost model had nothing discouraging it from leaving a major road to
weave through a residential grid, if the model judged the shortcut even
marginally faster — confirmed directly by replaying the real reported route
against the real road graph (a clear sawtooth path cutting through streets
near Ravelston Dykes, Edinburgh, instead of staying on the A90). Fixed with a
genuine turn penalty in `game-wasm`'s Dijkstra cost function: a flat 5-second
cost at any junction where the bearing changes by more than 30°, based on the
real geometry (the node-to-node bearing either side of the junction), not on
OSM way id — a single real road is routinely split into many separate OSM
ways with no actual turn involved, so a way-id-based penalty would have
wrongly punished driving straight down an ordinary road. Stacks with the
existing give-way delay rather than replacing it, since they model different
things (give-way: waiting to merge onto a busier road; turn penalty: the
general friction of any real turn at all). Verified two ways: a new
synthetic test proves the router now prefers a straight road over a
measurably shorter shortcut that needs one sharp turn, and the exact real
route from the bug report was replayed again post-fix — the sawtooth is
gone, replaced by smooth monotonic progress along the same stretch.

**Fixed (2026-10-10), a second, separate router issue found via the same
live-testing thread**: an interior waypoint (one with a leg both arriving at
it and leaving from it, as on a dead mileage route with multiple stops) was
snapped onto the road network **independently for each leg** — once as the
arriving leg's goal, once as the departing leg's start. At a junction with
one-way restrictions those two independent snaps could resolve to different
edges a street apart, so the spliced route arrived one way and had to leave a
different way, looping back through already-driven streets just to
reconnect — found as a real, visible spiral loop through a one-way gyratory
near Shandwick Place, Edinburgh. Fixed in `game-wasm`: a new
`Router::find_route_through(stops)` routes a whole multi-stop journey in one
call, snapping every interior stop exactly once (preferring a node reachable
both arriving and leaving, not just whichever is closer) rather than
splicing independently-snapped legs together in TypeScript. Two new tests
prove the mechanism on a synthetic one-way junction. **Important, checked
honestly rather than assumed fixed**: replaying the exact real Shandwick
Place route through the fix showed the waypoint already resolved to the same
node either way, so this specific loop wasn't actually caused by the splice
mismatch — routing from that exact point to the entrance, entirely alone,
still loops, which is Dijkstra's genuine shortest *legal* path given the
real one-way streets there — **wrongly concluded "not a bug" at the time**.
The splice fix itself is real and worth keeping, but the actual cause of
this loop (and a second one found the same way, a detour into Melville
Crescent) was a genuine data bug, found only once the user independently
checked the real road on Google Street View and pushed back directly rather
than accepting "this is correct, real road geometry" at face value: Princes
Street and Queensferry Street are tagged `access=no` + `psv=designated` in
the real OSM data (general traffic banned, buses specifically allowed — a
standard, *stronger* convention than `psv=yes`, not a different one), but
the pipeline's tag parser only matched the literal string `"yes"`, so the
whole street was wrongly excluded from the bus-routable graph. Fixed in
`rust/pipeline/src/road_graph.rs` and the real road graph rebuilt from the
actual `.osm.pbf` extract — see OPEN-ITEMS.md T69. **The lesson, recorded as
its own memory**: a router reproducing the identical path on an isolated
re-query proves the algorithm is deterministic, not that its input data is
correct — a tag-parsing bug makes a wrongly-excluded road "consistently"
avoided too. Don't stop at "self-consistent" when a human disputes the
result; check the real tags.

### Start and terminus stops
A route's **first stop is always a start and its last is always a terminus**,
by default — nothing to set. A route can carry **at most 2 start stops and 2
terminus stops in total**, one of each per direction, not an open-ended list.

Walking the stop list in order: the **first stop flagged terminus ends the
outbound leg**, and the **next stop after it flagged start begins the return
leg**. This is what encodes a **terminus loop** — outbound drops off at one
stop, return picks up from a different nearby one — as a single ordered list
rather than a special case. The hop between the two is dead running, counted
the same as any other dead mileage, but happens **every round trip** rather
than once per shift.

An earlier idea of a route carrying several start/terminus stops to handle it
sometimes starting from a different point (a ferry terminal once a day, say)
is dropped in favour of the 2/2 cap above — that case is a proper lettered
variation instead (below), using the branch/rejoin workflow.

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

**Editing workflow.** The player chooses the **last shared stop**, draws the
divergent section with the normal route-building tool, then chooses the
**first shared stop** where it rejoins — if it rejoins at all; some variations
just end differently.

**A different start, resolved 2026-11-05** (Skye's own real case: some
services start at the High School, not the Square) — the mirror image of
"some variations just end differently" above, now possible on the start
end too. The player begins the variation from a **blank draft rather than
a clone of the parent**, draws their own lead-in from the new start stop,
then uses the existing **Rejoin at** tool to splice onto the parent's own
path once it reaches the shared route — no new mechanism, Rejoin at
already does exactly this for the end of a draft.

**Extending rather than diverging.** Where a variation only **extends** a
route further, rather than diverging onto a different path, it keeps the
**same route number** — no new letter. The destination display changes along
the journey instead: "X99 to Thurso for Ferry Terminal" while approaching
Thurso, then "X99 to Ferry Terminal" once past where the ordinary route would
have ended. This is the **extension mechanism already in §7** ("Defining a
service"), not a separate one.

**Vehicle and livery inheritance.** A variation defaults to its parent
route's vehicle type and livery requirements. A different type can be set,
but only via manual override, and it **reverts to matching the parent**
unless explicitly overridden.

**Resolved 2026-11-05 (T108's own open variation question):** every
variation above assumes the same vehicle/duty could run it
interchangeably with its parent or any other variation of that route.
The far side of a ferry-linked long-distance route's crossing (§1
"Islands and ferries", §9) is the first variation that **must always be
run by a completely separate vehicle**, physically based beyond the
crossing, where duty/vehicle auto-complete must never try to chain its
duty with the parent route's own vehicles. Confirmed directly: this
needs no new flag or mechanism at all — **the far-side variation simply
belongs to a different depot group from its parent**, the genuinely
correct description of it (a different country, a different real
operator's buses and crew), and duty/vehicle chaining already never
crosses a depot group boundary. A route row's `depot_group_id` is
already independent of its `parent_route_id` in the schema (nothing
asserts a variation shares its parent's depot group), so this is a
reclassification of what the far-side leg already is, not new work —
confirmed before writing it in, not guessed at.

**Timing points.** Identical to the parent before the split, since it's
physically the same operation. After the split, the first timing point can be
freely adjusted; later ones keep the same **gap between stops** as already
established — unless the variation doesn't run interleaved with its parent
(an evening slow service replacing a daytime fast-plus-local pattern, say),
in which case every timing point after the split is freely adjustable, since
there's no interleaving relationship left to preserve. Timetabling in full
in §7.

**Combining variations (2026-09-28).** A route can have more than one
independent split/rejoin section along its length — this generalises the
single split/rejoin "Editing workflow" above to **multiple** split points per
variation, and each one can diverge from **either the trunk or any other
variation's own path** at that point, not only the parent route. Two related
capabilities, both confirmed by the user:
- **Composing from existing siblings.** Worked example the user gave: route 1
  has 1A (splits from 1 at point X, rejoins at point Y) and 1B (splits from 1
  at a later point P, rejoins at Q) — a new variation 1C can be built that
  takes 1A's own diversion at X–Y **and** 1B's own diversion at P–Q, splicing
  both onto the shared trunk, rather than being redrawn from scratch.
- **Freely drawing new splits.** A variation isn't limited to reusing an
  existing sibling's own diversion — the player can draw a genuinely new
  divergent section at each of its (up to at least two, per the user)
  split points, and each one can branch off **either the main route or
  another variation** at that point, the same way 1C above branches off 1B
  partway along what is otherwise 1's own trunk.

**Built (2026-10-10).** Decided first, since it changes the shape of the whole
feature: a split/rejoin mid-route needs **no padding at all** — times simply
diverge per variation from that point on, even if several variations later
share the same terminus. Padding (§7) is untouched and still only ever
happens at a variation's own final outer terminus, exactly as before; the
"multiple split points" capability turned out to be purely about how a
route's **points** are composed, not a timetabling change.

"Build from existing variations" in the route-drawing panel reuses a checked
sibling's own diversion by comparing stop lists directly — no separate
"diversion" record is stored; a diversion is just whatever stops a sibling's
full point list doesn't share with the trunk's longest common prefix and
suffix (`route-combine-variations.mts`'s `findDiversion`/`composeVariation`,
tested against the exact 1A/1B/1C worked example above). Decided
(2026-10-10): reusing a sibling's diversion is a **live reference**, not a
one-off copy — editing 1A's diversion later must update 1C automatically,
without reopening or resaving it. `routes` carries `composed_from_route_ids`
(which siblings a variation reuses); its own `points` column becomes a
cache, kept fresh by refreshing every dependent (transitively) immediately
after any save, since route-drawing is the only place a route is ever saved.
A route a player hand-edits after composing it loses the live link from that
point on — a hand-edited result is no longer a pure composition of its
sources. See OPEN-ITEMS.md T55 for the full build notes.

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

### Sightseeing routes
A sightseeing route is a normal route with its own ticket type and its own
vehicles. Worked by **open-top double-deckers only** — a sightseeing bus cannot
work a service route, and a service bus cannot work a sightseeing route.

Tourist demand comes from OSM tourist attractions together with cruise ports,
stations and hotels, and is tracked by a **tourist happiness** score separate
from ordinary passenger satisfaction.

Sightseeing routes are driven by ordinary drivers. A **tour guide** is optional
(`OPERATIONS.md` §12); carrying one adds a fixed percentage to the fare that
tourists are willing to pay, so every journey is a small choice between running
cheap and running staffed.

**Tour audio** is a retrofittable option on open-toppers, bundled with a PA
system; without it a tour won't be popular. Extra **languages** cost more, make
tourists happier and give a **10% usage boost**. Sightseeing carries a driver only
— guides belong to tour routes.

Sightseeing is **seasonal**, reduced in winter rather than stopping. There is no
weather in the game.

### Route type and hours
Routes are **local** or **InterCity** (limited stop). Determined automatically
from route length — the real test is whether the route exceeds 50 km — shown to
the player, and overridable with a warning. It decides which drivers' hours
regime applies (`OPERATIONS.md`).

### Start dates and lead time
A new route, and any alteration to an existing one, is given a **start date set
as a number of days ahead**. That gives the player time to make the other changes
a route needs — duties, rotas, stand bookings, hiring — before it goes live.

There is a **minimum lead time that scales with the size of the change**:

| Change | Minimum lead time |
|---|---|
| Adding or removing a stop | 2 days |
| Changing the path or the timetable | 5 days |
| Activating a route | 10 days |

### Activating and deactivating
Routes are **activated and deactivated** rather than created and deleted.

On activation the player sets **how many days until it starts**, with 10 as a
floor rather than a fixed figure — so a route can be given longer where drivers
still need training or a depot is still being built. The route panel shows the
duties needed against the drivers available, which is what the extra days are
usually for.

**Deactivating takes 2 days to stop.** Its **duties are removed** and have to be
rebuilt if it comes back; the **staff stay**, since they belong to the depot
rather than the route. The route itself and its timetable are preserved, so
reactivating is not starting from scratch — only the duties are lost.

This has a structural consequence worth building in from the start: a route has
a **current version and a pending version at the same time**. Planned changes are
records, not edits applied immediately, and the timetable, duties and stand
bookings all need to exist in both states until the change date passes.

### Positioning journeys
Rather than running dead, a bus can be repositioned **in service** by adding an
extra journey to an existing route — an extra journey on service 1 to reach a town,
then service 7 town runs, then an extra journey on service 12 back at the end of
the day.

- Marked in the timetable as a **positioning journey** so it's clear why a lone
  0612 departure exists, but otherwise a normal journey: it **carries fare-paying
  passengers**, **counts towards contract mileage**, and **appears in the public
  timetable**.
- Can name the **onward route** it feeds, so duty building always chains it
  correctly, and the same on the return.
- Can start later or finish earlier along a route than the full journey.
- Adjusts automatically when the commercial team retimes the main route
  (`OPERATIONS.md` §13a) — if service 7's timings are extended, the service
  12 journey departs later; if service 1 keeps arriving late, its departure
  is moved **earlier** while the arrival is held. Shifting a service by an
  hour moves its positioning journeys with it.

Peak positioning journeys — extra runs to get buses to the start of routes for a
higher rush hour frequency — can be added by hand, and the commercial team works
out any the player doesn't. It also **suggests dead runs that could be worked in
service**.

After the morning peak, extra buses can **stay out in service**; those not needed
return to the depot until the evening rush rather than sitting out all day.

### Linked services
A bus finishing a route can work another from the same point — reaching the end of
service 1, driving to another village, and taking up service 15.

- It **returns to the same route** unless another makes sense from the same stop,
  bus station or terminus. What "makes sense" is worked out automatically with a
  manual override; where several are possible the one giving the **shortest wait
  and least dead mileage** wins.
- **Livery and vehicle type filters still apply** on the onward route, so a strictly
  branded bus has fewer options and runs dead more often.
- A route can be marked as **never linking**, and specific pairings excluded.
- Whether the driver carries on or is relieved is **set in the duty**.
- Only routes in the **same depot group**, except long distance buses, which may
  take another group's route provided they can reach their home depot the next day.
  If they can't, the route simply isn't offered.

At a bus station this drives stand choice: a service 1 bus facing a 30-minute wait
will use stand 2 to drop off and work a service 6 leaving in 10 minutes.

### Road restrictions
OSM access tags say what is *legal*, not what is *sensible*, so a twelve-foot lane
between two farms is perfectly routable and completely wrong for a bus. The player
can therefore mark roads as unsuitable.

- Bans are **company-wide with per-route exceptions**, and can apply in **one
  direction only**.
- They apply to **dead running as well as service** — otherwise the router takes
  liberties where nobody is watching.
- Roads can also be banned **by vehicle type**, either as a maximum size or by
  ticking allowed types. A single decker might be fine where a decker isn't; some
  places take only minibus-sized vehicles (OPERATIONS.md §3's category digit 1).
- Cars and vans are allowed anywhere sensible to drive.

A route's **permitted vehicles are derived from the roads it uses**, and assigning
a banned vehicle is **blocked** rather than warned — a decker under a low bridge is
a bus that cannot move. Banning a type on a road an existing route uses warns and
blocks until it is fixed.

The player marks these themselves; the game does not suggest them.

### Turning round
**A bus cannot u-turn on the road.** To reverse direction it must reach a
roundabout, a junction, a turning circle, or one of the player's own sites — or
the route must be drawn to bring it back facing the right way.

OSM supplies much of this already through `junction=roundabout` and
`highway=turning_circle`, and turning circles at rural termini are exactly where a
bus turns in practice.

**The router itself should enforce this automatically**, not just rely on the
player drawing around it: when the cheapest path between two consecutive points
would otherwise require reversing direction on an ordinary road, the router
should detour via the nearest roundabout, junction or turning circle actually
capable of turning a bus around, rather than finding a technically-legal
graph path that implies a physical U-turn. **Not yet implemented** — confirmed
2026-10-17 by reading the router's own cost function: a reversal currently
costs the same flat sharp-turn penalty as any other turn over 30°, not a
prohibition, so the cheapest graph path can still imply a literal U-turn.
Until this exists, the player must force the loop manually with a waypoint
placed on the turning point itself (DESIGN.md §6 "waypoints"), the same way
any other "the router picks something silly" case is worked around.

Where a terminus genuinely has no turning point nearby, **reversing at the
terminus is allowed**. Reversing is otherwise confined to the player's own land —
off a stand or into a parking space — which mirrors how operators treat it in
reality. A reverse takes a few seconds and **briefly blocks the adjacent stand**.

A badly sited terminus is therefore visibly expensive: no turning point nearby
means a long loop on every journey, and it shows up in the mileage.

### What the optimiser may not touch
**Moved from the operations manager to the commercial team, 2026-10-30**
(`OPERATIONS.md` §13a) — the commercial team retimes services to spread
congestion, both at bus stations and along **corridors** — defined as two
routes sharing **multiple stops on the same stretch of road**, and only
where the same depot works both. It also nudges timing points and can
extend a layover beyond the player's minimum.

Four things constrain it:
- **Connected services** are left alone; others are moved instead.
- **Locked departures** cannot be moved, and a lock anchors the pattern around it.
- **Ferry-locked services** at a ferry terminal cannot be moved.
- **Frequencies are preserved as a set** — a half-hourly service stays half-hourly,
  so the whole pattern shifts together rather than one departure drifting.

Where it cannot solve congestion without breaking one of those, it **leaves the
timetable alone and tells the player**.

### Route numbering
Numbers are assigned automatically with a manual override. Commercial services
number from **1** upwards; council contracts from **201**; **long distance**
routes from **900** upwards, the same pattern as the other two.

**Commercial numbers are per depot group**; **all contract numbering follows
council areas**. A route running into more than one takes the next number free, so
it cannot clash — duplicates within a depot group are avoided automatically with
no warning.

Prefixes say what a working is before you read the number:

| Prefix | Meaning |
|---|---|
| *(none)* | Commercial service, from 1 |
| *(none)* | Council contract, from 201 |
| *(none)* | Long distance, from 900 |
| **X** | Express |
| **S** | School |
| **T** | Sightseeing tour, then the city letter — TE1, TG1, TS1 |
| **C** | Cruise |
| **RA** | Railair (station-to-airport express, UK-EXPANSION.md §9a) |
| *player-set* | Event routes, a short code per venue |

**Railair numbering is its own sequence**, unlike every other prefix above:
RA1, RA2 and so on count up across the **whole company**, not per depot
group or council area — there is no separate underlying number a Railair
route "decorates." Full spec in UK-EXPANSION.md §9a.

**School numbering.** S plus digits. Where a school run follows another route for
most of its length it takes that route's number — route 13 becomes S13 — and where
that route is three characters (237, X37) the first is replaced, giving S37. Where
two would collide the second takes the next free number. A school route with no
parent numbers from its own sequence at S1. S numbers are unique **per council
area**, and a run crossing two is numbered by **where the school is**.

**Tour routes** — the multi-day product, not sightseeing — are **named rather than
numbered**.

### Dead mileage routes
The player can define a fixed path between two places, such as a depot and a bus
station, which every bus running dead between those points follows. Contract
mileage is nonetheless paid on **actual miles driven**.

Decided by the user (2026-10-05): the router picks the path first, and the player
then adjusts it. A depot with **separate entrance-only and exit-only points** needs
the route split, one path in and one path out. A depot with combined entrance/exit
points does not need the split. The player adjusts the path by adding waypoints only (decided 2026-10-05).
Decided by the user (2026-10-05): clicking a depot lists its dead mileage routes in the depot menu, and the player opens one to adjust. The player picks the dealer for each new route from the depot menu; the router picks the path and the player adds waypoints before saving.

Corrected by the user (2026-10-09): the entrance/exit split is not two separate
routes. One route runs from the dealer and forks near the depot — a shared trunk
path, then a short branch to the entrance-only point and another to the
exit-only point, the same shape as a route variation splitting off a trunk but
only over the last short stretch. A depot with a single combined entrance/exit
point has just one branch.

---

## 7. Timetables

Full timetables everywhere. Frequency is a **generator** that writes repeated
departures into the timetable, not an alternative model.

### Components and the merged timetable
A route's timetable is built from **component timetables** which merge into one
public timetable the passenger sees.

- Each **variation** is its own component. Each **day type** has its own set of
  components.
- Components share the same running times and are adjusted automatically for
  peaks.
- Offsets between components are **automatic but adjustable**, so variant A hourly
  and variant B hourly interleave into a half-hourly corridor.
- The **merged timetable is read-only**. Every edit happens in a component, and
  each journey in the merged view carries a button to jump to its component.
- **Express journeys sit in the same component** as the stopping ones, flagged
  rather than separated, since they have to interleave on the same corridor.
- A day type's components can be **copied** to another as a starting point, with
  no ongoing link.

Components are navigated by **tabs across the top of the grid**.

### The grid
A timetable is a **grid, stops down and journeys across** — the traditional
printed shape, so a journey that skips stops shows as gaps down its column.
Inbound and outbound share one grid with a **direction toggle**.

**Editing.** A leg is edited by typing the **arrival time**, and the running time
follows from it. Later stops shift to preserve their running times. An edit can
apply to one journey or, with a modifier, to every journey in the band.

Edited legs are coloured against the automatic running time — **green where time
has been added, red where it has been removed** — with the difference shown
alongside. A running time below what is physically achievable gets a stronger
warning.

### Defining a service
A service is defined by a **start and end time of day**, which set the first and
last departure, with everything between generated by **frequency**.

Two things can be added on top:

- **Single journeys** — an extra journey the frequency wouldn't produce, such as
  one serving a ferry terminal. The game bolts it onto the most suitable existing
  service, and it shows highlighted in the grid so it reads as deliberate.
- **Extensions** — a short tail beyond a terminus, defined **once per route per
  terminus** with its own running times and a required arrival time. Any service
  that would have terminated there picks the extension up automatically. Its stops
  appear as extra rows only some journeys use. Stagecoach's X99 continuing from
  Thurso to Scrabster for the Orkney ferry is the model.

A **ferry planner** shows all ferry arrivals and departures filtered by terminal,
so extensions and single journeys can be built around real sailings. Where no
service is close enough to a sailing, the game says so rather than inventing a
journey.

### Structure
- **Time-of-day bands** — frequency varies across the day. Defined globally as
  defaults, overridable per route. Running times are automatic per band and
  adjustable per band.
- **Day types** — separate timetables per day of the week, each reusable across
  several days (Monday–Friday, Saturday, Sunday being the common case).
  **Underlying data model (2026-09-28, schema v19→v20):** a day type is a
  weekday bitmask (any combination, not just the 3 common presets) crossed
  with a term-time facet (any / term-time only / school holidays only) —
  real Skye timetable data (UK-EXPANSION.md §13) needs both: 608's
  Tuesday/Thursday footnote, 607's own separate Friday-differs pattern, and
  Portree High School/Portree Square's school-day split. **No UI lets a
  player actually create a custom weekday+term-time pattern yet** — this
  increment only made the schema capable of storing one; every existing
  call site still only ever uses the original 3 presets. Building the
  actual picker (how a player sets "Tuesdays and Thursdays only," or
  "term-time only") is a separate, later increment.
- **Event services** sit **on top of** the normal timetable rather than
  replacing it, so an event day runs the normal service plus the event workings.
  This means services need a calendar as well as day types.
- **Festive day types, confirmed 2026-11-06** — five calendar-pinned points
  over Christmas and New Year, genuinely distinct from the weekday/term-time
  day type model above because each is pinned to a specific date every year
  rather than a weekday pattern — needs its own facet in the day type data
  model once the day-type UI itself is built (the underlying model above is
  weekday bitmask × term-time only; there's no calendar-date axis yet):
  - **Christmas Eve** and **New Year's Eve** default to that day's normal
    timetable with an early finish to the evening service. The last
    working's departure time depends on what it has to do, confirmed
    2026-11-06/07, settled over several rounds: **6:00pm if the last run
    is already heading toward wherever the route would normally end its
    day anyway** (reusing the route's own existing short-working/extension
    pattern, not its full daytime terminus, if the two differ) — a single
    one-way run, nothing dead-mileaged. **5:00pm instead if it genuinely
    has to go out to the terminus and then run back** (an out-and-back,
    because nowhere sensible to end the day exists further out) — **and
    only where the out-and-back combined doesn't exceed 6 hours** (raised
    from an initial 4 hours). **A route whose out-and-back would exceed 6
    hours simply doesn't run its last working at all that day** — closing
    what had been an open gap, rather than guessing a fallback time. This
    replaced an earlier, more convoluted "compare the terminus's and a bus
    station's distance to the depot" idea — the concern that prompted it
    ("it shouldn't run out to a tiny village then run dead 30 miles to get
    back to the depot") is already covered by the 5pm/out-and-back case
    above.
  - **Boxing Day** and **New Year's Day** default to a Sunday-level
    timetable everywhere in the UK, **starting 9:00am, confirmed
    2026-11-06** (replacing Sunday's own normal start time on these two
    days only).
  - **2 January** is **Scotland's own second New Year bank holiday** —
    not observed in England, Wales or Northern Ireland. It only affects
    **services based out of a Scottish depot group** — ordinary local
    routes and long-distance alike — which default to the same
    Sunday-level, 9:00am-start timetable as Boxing Day/New Year's Day.
    **An English-based service that crosses the border into Scotland
    keeps running its completely normal timetable on 2 January**
    (confirmed 2026-11-06, refining an earlier "routes physically in
    Scotland" wording that would have wrongly caught a border-crossing
    English route too — it's the service's own base that decides, not
    which roads it happens to run on).
  - All five of the above are **optional for the player to build a
    dedicated festive timetable for** instead of the default — same
    "optional day type" pattern as the school holiday timetable (§9).
  - **Christmas Day itself runs no service at all anywhere in the UK**,
    with one exception: **Greater London and Greater Manchester run a
    reduced Sunday-level service, starting 9:00am** (confirmed 2026-11-06,
    same start time as Boxing Day/New Year's Day/2 January above), and
    only on routes where **at least
    80% of the route's mileage falls inside the city** (London's own fare
    zones, §9; the Greater Manchester conurbation region,
    UK-EXPANSION.md §8a) — the same mileage-threshold mechanic already
    used for livery requirements (Liverpool's 40%, London Zone 6's 40%,
    UK-EXPANSION.md §7/§8), just a much higher bar, and deciding whether a
    route runs at all rather than which livery it needs. A route that
    doesn't clear 80% doesn't run on Christmas Day even in those two
    cities. Nowhere else needs a Christmas Day timetable at all, default or
    otherwise.
  - **Pay**: see OPERATIONS.md §7 "Festive pay."

### Timing points
Buses run past ordinary stops but **wait at timing points when early**. Timetables
need deliberate slack at timing points, since that slack is what a delayed bus
recovers with.

A driver **can** run early through a timing point. Doing so repeatedly earns a
warning and eventually dismissal, and it generates passenger complaints that count
**worse than lateness** — someone at the stop for the advertised time has missed
the bus entirely. Likelihood comes from driver **reliability and happiness**
together, so a punishing rota shows up as early running.

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

**Types:** adult, child, concession/older person, and **student** (added
2026-11-05, alongside the Ridacard discussion in §9 — a genuine new
passenger type, not just a discounted ticket, with its own real place in
the demand simulation like the other three). **Confirmed 2026-11-05:
student demand is generated from university/college land use**, the same
way every other demand source already works (§2's own "Demand"
subsection) — a real education site on the map generates real student
demand, rather than students being some fixed percentage of general
demand. Not yet wired into the demand model itself (Phase 4), but
confirmed as the mechanism for when it is.

**Access and egress.** People walk up to **400m (about 5 minutes) to reach a
stop, or to change stops**, in urban areas — **600m in rural areas**, where
tolerance for walking to the only bus for miles is naturally higher.

**Wait tolerance.** A passenger who would have travelled gives up and doesn't
make the trip if the wait is too long: **15 minutes in urban areas, 30 minutes
in rural areas** — the same two-tier split as the walking distance, for the
same reason.

Concessionary travel is free to the passenger and **reimbursed at a percentage
of the adult fare**, as under the real Scottish scheme. Route choice therefore
has a second economic dimension: a route full of concessionary passengers earns
differently from the same route full of adults.

Season ticket purchase is decided per passenger, based on how often they
travel. **Confirmed 2026-11-05: this is Ridacard** (§9's own "Season
tickets" subsection) — the real product this line was always describing,
just never priced or named until the Ridacard discussion. Since this
drives both the individual AND the statistical passenger tier, the two
need to agree on season-ticket revenue the same way they already must for
capping (CLAUDE.md's own "Capping across two tiers" hard part) — not yet
designed in any further detail than that, flagged as the same class of
problem rather than solved here.

Passenger satisfaction is driven by punctuality, vehicle capacity, comfort and
accessibility, cleanliness, stop and station quality, and three staff figures —
driver score, friendliness and happiness. These need to feed **one satisfaction
number** rather than stacking as six separate bonuses.

---

## 9. Fares and ticketing

**Reworked 2026-11-01** — a live, multi-message design discussion replaced
large parts of this section's own fare model. The real anchor is Lothian
Buses' own published fares (screenshot supplied directly, 2026-11-01):
Adult Single £2.40, Child Single £1.20, Night Single £3.50, City DAY £6.00
(TapTapCap auto-capped £5.70), City LATE £5.50 (6pm–4:30am, day **and**
night services), NETWORK £14.00, City WEEK £26.50 (**TapTapCap-only — there
is no separately-purchasable walk-up Weekly ticket in Lothian's own real
fare structure at all**, only the automatic cap). That last point turned
out to matter: it's not just a real-world curiosity, it's the direct real
precedent for this game's own new rule that Weekly is purely an automatic
cap threshold, never a ticket a passenger buys up front.

**Ordinary, Night and Airport Express fares are all fixed, company-wide
game constants, not a per-depot-group player setting any more** —
confirmed directly: "I think having this done by the player is too
complex... fixed prices set once in code and just shown to the player,"
then Airport Express folded into the same fixed bucket too (2026-11-01,
with its own real reference screenshot — Lothian's Airlink Service 100:
Adult Single **£6.00**, Adult Open Return **£8.50**, Child Single £3.00,
Child Return £4.25, Family Return £22.00 — matching this section's own
existing "AIR's own Single £6/Return £8.50" reference exactly). **Only
Sightseeing stays player-set per depot group.** Every depot group's own
fare-pricing panel, for Ordinary/Night/Airport Express fares, becomes a
read-only display of these fixed figures rather than an editable one —
not yet built, this section records the confirmed target. (Lothian's own
real fares include Child and Family figures throughout — recorded here as
real reference data in case child/family tickets are taken up as their
own feature later, but that's not yet an actual concept in this game's
fare model and nothing here should be read as adding one.)

Fare zones are still drawn on the map by the player, in the style of
Lothian's. Each zone is typed **city**, **country**, **island** or
**town**. The **depot group** is the unit of ticket validity and of fare
capping.

### Zone types

- **City** — every city has up to **two** City zones, an inner **Zone A**
  and an outer **Zone B** (confirmed 2026-11-01) — **except London, which
  is out of scope for this rule and will be handled separately when
  reached.** A and B share one flat single fare between them (**£2.40**,
  the real Lothian figure) — there is no "combined A+B" fare and no
  per-mile pricing within the city at all. **Resolved 2026-11-05**: what
  happens once a journey leaves the city is fully covered by the existing
  "City-only vs Country buses" rule below (a route counts as Country the
  moment it leaves A/B at all) — confirmed directly, no separate mechanism
  needed.
- **Country** (i.e. anywhere beyond the city) and **Island** — **no
  longer banded by zone count.** Both now price Singles the same way
  Long-distance routes already do: a **base fee plus a price per mile**,
  real distance once the journey planner exists (Phase 4, RAPTOR — not
  built yet, so this is the confirmed target, not yet wired to anything).
  **Confirmed 2026-11-01, measured not guessed: £2.00 base + 20p/mile**,
  the same figures for both Country and Island (see "Single fares" below
  for the real Portree–Armadale distance check this was grounded against).
  Geometrically, Island stays exclusive with
  City/Country (an Island zone can never share land with a City or
  Country zone) — a depot group can still have an Island zone alongside
  City/Country zones elsewhere on its map; the exclusion is purely
  geometric, not a depot-group-wide restriction. Both Country and Island
  keep their own Dayrider (Day ticket), priced as its own flat figure (see
  "Single fares" and "Capping" below), not per-mile — a day ticket
  inherently doesn't scale with distance.
- **Town** — declares exactly one Country or Island zone as its parent,
  never a City one, and must at least **partially overlap** it (relaxed
  2026-11-01 — a live user report, with a real example, showed a town can
  genuinely straddle the boundary into a second zone, so full containment
  was dropped; it still needs some real overlap with its declared parent,
  not none at all). **No longer priced as a percentage of its parent** —
  confirmed 2026-11-01 as a flat, fixed **£2** single fare, company-wide,
  for a trip that stays entirely within the town (superseding the earlier
  "70% of the parent's own 1-zone figure" rule). Once a journey leaves the
  town and crosses into or through other zones, the town has no further
  effect on zone-counting — it always just counts as 1 zone of its parent.
  **Town's own Dayrider** is computed from the same real Lothian Day/Single
  ratio used for Weekly below, applied to the town's own £2 single, rounded
  up to the nearest 5p. **Where a town's own area genuinely spans into a
  second, different zone** (confirmed 2026-11-01): a trip touching the
  part of the town that overlaps the second zone uses whichever of the two
  zones is more expensive, compared **per fare type** (a Single might go
  one way, a Weekly the other, independently) — not yet wired into any
  actual journey-fare calculation, since that doesn't exist yet (RAPTOR,
  Phase 4); confirmed as the rule for whenever that's built, same
  "confirmed but not yet actionable" treatment already given to other
  phase-gated rules in this section (e.g. the ferry operator's monthly
  payout).

### Ferry and joint tickets (T107, confirmed 2026-10-31)

**Resolved 2026-11-05** (previously flagged against §1's "buses do not
use ferries on service or contract work" rule, which stands): nothing
below ever needed a bus to board a ferry. A ferry ticket here is the
**passenger's own** crossing, bought alongside or bundled into their bus
ticket on either side, including the Citylink 923 Cairnryan–Belfast case
— the Scotland-side coach terminates at the ferry terminal, the
passenger crosses on foot, and a separate coach continues on the far
side. §1's own Corran Ferry is the one real exception where a bus
physically drives onto a vessel; see there for that mechanism, which is
unrelated to the ticketing below.

**Which mechanism applies is decided by whether the link is a ferry or a
physical connection, not by the `depot_group_id` row**: two zones joined
by road or bridge (even island↔mainland, e.g. Skye's own bridge) use the
ordinary same-depot-group zone-crossing rule above. Two zones only
reachable by ferry always need the ferry-ticket/joint-ticket mechanism
below, even when they're technically the same depot group in the
database (Arran, run by the Glasgow depot group, still needs it to reach
Ardrossan, because the link is a ferry, not a road). Where an Island
zone links to a Town zone and the two don't directly touch, the link is
to whichever real ferry connection is nearest.

**Joint day rider rate** (one zone's day rider + a rate × the other
zone's day rider — the dearer zone's day rider is the base figure,
50/50 split between the two zones/depot groups involved): **0.6x** when
one side is a Town zone or an automatically-computed "most direct
route" corridor through a Country zone (e.g. Skye + Fort William — the
corridor is computed from the road network, never player-drawn); **0.7x**
when linking two full Country/Island zones. Both **rounded up to the
nearest 5p**, the same convention as Return and NETWORK.

**Ferry tickets** — a separate charge from the joint day rider above, for
the crossing itself: a real ferry operator (CalMac, Western Ferries,
etc.) sets its own per-mile rate; the crossing's mileage is the real
sailing-route distance, not player-entered. Sold as **Single or Return
only** (no Day/Weekly of its own), and can be bundled into any dayrider,
but **only one single-or-return per dayrider regardless of its own
duration** — a 7-day dayrider still only gets 1 return. The player
collects the full computed fare at time of sale; **95% is paid to the
real ferry operator at month-end, 5% stays with the player** (deferred
until Phase 5's finance system exists to hang the actual monthly payout
on). The ferry fee is **always charged separately on top of whatever
zone ticket is held, including NETWORK** — NETWORK bundles in Island
zone *access*, but never the ferry crossing itself, since a different,
real company runs the ferry. For a **same-depot-group** crossing (Arran
+ Ardrossan), the ferry ticket is the *only* extra cost beyond the
Island zone's own fare — no joint-ticket rate applies, since it's one
operator's own zones. For a **cross-depot-group** crossing (Skye +
Mallaig/Fort William), the ferry ticket is **additional** on top of the
joint day rider price — both charges apply together.

### Flight commission (island and Donegal Loganair routes, T108)

A separate mechanism from the ferry split above, confirmed 2026-10-31.
When a passenger's journey uses a connecting bus (an Airport Express
service or a NETWORK ticket) at **both** the departure and arrival end of
a Loganair flight, **the airline pays the player 7.5% of the flight's own
ticket price**, settled at month-end — the same deferred-until-Phase-5
treatment as the ferry split, but the **direction is reversed**: there,
the player collects the full fare and pays most of it away; here, the
airline pays the player a minority commission for feeding it passengers.

Scoped to **island airports (Kirkwall, Sumburgh, Stornoway, Benbecula,
Barra, Tiree, Islay) and Donegal only** — mainland-to-mainland legs don't
qualify. A flight's own ticket price is worked out per mile on the
**straight-line (great-circle) distance** between the two airports,
unlike a ferry's real sailing-route distance — the natural equivalent for
point-to-point air travel, with no path to follow.

**Exempt, no commission at all: Orkney's and Shetland's own inter-island
hop networks** (Kirkwall↔Stronsay/Sanday/North Ronaldsay/Westray/Papa
Westray/Eday, and the equivalent Tingwall-hub Shetland routes) — real
lifeline services, consistent with this document's own "Island and
remote-area review" (§10) already treating both as lifeline/mixed-subsidy
areas. The 7.5% only applies to commercial mainland-hub routes
(Kirkwall↔Aberdeen, Sumburgh↔Edinburgh, etc.), not these internal hops.

### Single fares

| Case | Pricing |
|---|---|
| Within a city (zone A, zone B, or crossing between them) | Flat **£2.40**, fixed in code |
| On a bus that leaves the city zones at all ("Country" — see "City-only vs Country buses" below) | **£2.00 base + 20p/mile**, fixed in code (confirmed 2026-11-01) |
| Within an island zone | **£2.00 base + 20p/mile**, same as Country (confirmed 2026-11-01 — base lowered from an earlier-proposed £2.40 to £2.00 specifically "to match better with towns") |
| Within a town zone | Flat **£2**, fixed in code (no longer a percentage of the parent — see "Zone types" above) |
| Long-distance routes | No zones — base fare plus price per mile, player-set (unchanged) |
| Airport Express routes | Flat Single **£6.00** and flat Return **£8.50**, fixed in code (real Lothian Airlink figures) — not the standard 1.6x return multiplier below |
| Sightseeing | Its own two prices, player-set per depot group, entirely outside the zone system — see below |

**Return** is a fixed game constant for every ticket family that isn't
independently set: **1.6x a single, rounded up to the nearest 5p** — except
Airport Express, which has its own fixed return fare instead (its real
fares don't follow that ratio either: £6.00 Single/£8.50 Return is 1.4167x).

Night fares are also fixed in code now, alongside Ordinary and Airport
Express (see the section intro above). **City's own Night extra is
confirmed**: real City Night Single (£3.50) against real City Day Single
(£2.40) is a flat **+£1.10** — clean, since City has no per-mile component
at all to complicate it.

**Country/Island's own Night extra — proposed 2026-11-05, approximation
not a direct measurement**: Lothian's real Night Single is zone-banded
(£3.50 / £5.50 / £8.50 for 1 / 2–3 / 4–6 zones), which doesn't convert
cleanly into a per-mile surcharge on its own. But the real data shows the
Night *extra* over Day growing by roughly £1.00 per zone step (zone 1:
+£1.10; zone "2–3": +£2.10) — about the same order of magnitude as Day's
own confirmed 20p/mile growth. Rather than invent an unrelated number,
**Night Country/Island = Day Single + £1.10 + 20p/mile** — reusing the
same already-confirmed per-mile rate for the extra, just with its own
£1.10 base matching City's own real flat extra exactly. Checked against
the real zone "2–3" figure (£5.50): assuming that band sits around 7
miles out, this formula gives £5.90 — about 7% over, a reasonable fit for
an approximation rather than an exact match (the same standard the main
per-mile rate itself was held to, "within 2%," doesn't apply as tightly
here since this is explicitly built from an approximation, not a direct
measurement).

**Child fare — confirmed 2026-11-05, applies to every ticket family in
this game, not just Ridacard**: exactly **50% of the Adult price, rounded
up to the nearest 5p**. Confirmed directly from the real data already
gathered — every single real Lothian/Airlink Child figure seen so far
(City Single £2.40→£1.20, City DAY £6.00→£3.00, Country DAY £6.30→£3.15,
Combined DAY £9.60→£4.80, NETWORK £14.00→£7.00, Airport Single £6.00→£3.00,
Airport Return £8.50→£4.25) is **exactly** 50% of its own Adult price,
every time — not an approximation, a genuinely consistent real-world rule.
For the base-fee-plus-per-mile Country/Island Single, Child is 50% of the
**final computed Adult price** (after its own 5p round-up), not 50% of the
base fee and per-mile rate separately — consistent with how every other
Child figure above is read off a finished retail price, not a formula
component.

**Family tickets — adopted 2026-11-05, Airport Express only**: real
Lothian/Airlink data exists for City/Country/Combined Day tickets too, but
the user confirmed this game only adopts it for **Airport Express**. Real
figure: Airport Open **Return**, up to 2 adults and 3 children, **£22.00**
— the only real Family figure Airlink actually publishes (there's no
separate real Family Single); treated as Airport Express Return-only
unless/until a real Single figure turns up. Not available for City,
Country, Combined or any other ticket family.

**Lothian's real Single reference data** (screenshots supplied directly,
2026-11-01 — these are Lothian's own real **zone-banded** fares, the model
this game is deliberately moving away from for Country/Island; recorded
here as the grounding data for working out a sensible base-fee-plus-
per-mile equivalent, not as a zone-banded model to actually build):

| Zones | Day Single | Night Single |
|---|---|---|
| 1 (or 2 if A/B) | £2.40 | £3.50 |
| 2 or 3 | £3.40 | £5.50 |
| 4 | £4.40 | £8.50 (4–6 banded together) |
| 5 | £5.40 | " |
| 6 | £6.40 | " |

**Resolved 2026-11-01, measured rather than guessed**: converting this real
zone-banded data into a base-fee-plus-per-mile formula needed a real sense
of distance, which the user supplied as a concrete real-world check rather
than an abstract one — "a ticket from Portree to Armadale on the Isle of
Skye is about £10.50." Rather than estimate that distance from memory, it
was measured directly against this project's own real road graph and stop
data: Armadale Pier (a real stop in `stops.bin`, not to be confused with
two other places named Armadale elsewhere in Scotland that the same lookup
turned up first) is a real **41.70-mile** route from Portree via the
project's own router. With the user's own **£2.00 base** (chosen to match
Town's own fixed fare) and that real distance: (£10.50 − £2.00) ÷ 41.70 ≈
**20p/mile** — a clean round number landing within 2% of the real fare
(£2.00 + 41.70 × 20p = £10.34), confirmed as the real figure to use.

### Sightseeing tickets
A separate ticket type from the ordinary families, sold in two forms at
different prices: a **hop-on hop-off day ticket** and a **single trip** round the
loop. Sightseeing fares sit outside the zone system and outside capping, and
are the **only** fare family still set by the player, per depot group.

### Ticket families
Single, return, day, **weekly** (now purely an automatic cap threshold, not
a separately-purchasable ticket — see "Capping" below), **LATE** (evening,
valid 6pm–4:30am on day **and** night services) and **NETWORK** (everything,
including Airport Express). **28-day and family tickets are not part of
this game's fare model** (28-day dropped twice now, most recently
2026-11-01 alongside this whole rework; family tickets were never adopted
even though Lothian/Airlink's own real fares include them — see the
section intro above) — the list above is complete, not a subset.

### City-only vs Country buses (ticket validity)
Confirmed 2026-11-01, from Lothian's own real Day ticket wording ("Country
DAY... not valid on Lothian Buses" — Lothian's own City and Country
services are run as genuinely separate operations in reality, each with
tickets that don't cross over). Replicated in-game at the **route** level,
not read off a passenger's own journey: a route counts as **City-only** if
it never leaves the city zones (A/B) anywhere along its length, and counts
as **Country** the moment it leaves the city zones at all, even once. A
City-only ticket (City DAY/LATE/the City cap) only validates on City-only
routes; a Country ticket only on Country routes; City&Country (Combined)
covers both. Not yet wired into any actual ticket-validity checking, since
there's no journey/ticketing engine yet (Phase 4/TICKETING.md) — recorded
as the confirmed rule for when there is one.

### NETWORK
Not an independently player-set price — a **percentage markup over the
Combined (city+country) price**, applied identically to both Day and Weekly,
rounded up to the nearest 5p. **The markup percentage itself is now a real,
fixed figure** (confirmed 2026-11-01) rather than player-set: Lothian's own
real NETWORK (£14.00) against City DAY (£6.00) — **≈2.333x**, i.e. a
**+133% markup**. Only shown (and only needed) for a depot group that has
both City and Country zones and more than 3 zones in total. A NETWORK
ticket covers travel on **all Ordinary, Night and Airport Express services
in the depot group**, plus Island (confirmed 2026-11-01) — that doesn't
change how the price itself is computed, which only ever reads the
Combined price and the fixed markup percentage.

### Capping
**Reintroduced 2026-11-01** (was briefly removed, then brought back with a
real-world restriction) — caps apply **automatically**, but **only on
buses fitted with a tap-on tap-off ticket machine** — its own real upgrade
tier (TICKETING.md §3: cheapest/fastest of the three, before Mid and
Advanced). This mirrors Lothian's own real TapTapCap system directly: every
real Weekly figure below has **no separate walk-up price at all** in
Lothian's real fares, only the TapTapCap automatic cap — the same is true
in-game now, Weekly is never a ticket a passenger buys up front, only a
threshold reached automatically by tapping on a tap-on tap-off-equipped
bus.

Caps are limited to the **Day and Weekly** thresholds only — **28-day
tickets don't exist any more at all** (see "Ticket families" above) and
**NETWORK is never capped into**, matching the existing "NETWORK sits
outside capping" rule. Island, Sightseeing and NETWORK all still sit
entirely outside the capping system, priced on their own.

**Weekly is no longer independently set by the player** — it's computed
automatically from whatever the (now fixed-in-code) Day price is, via a
real fixed ratio from Lothian's own figures, rounded up to the nearest 5p.

**Lothian's full real reference data** (screenshots supplied directly,
2026-11-01 — City-only, Country-only and City&Country/Combined are three
genuinely separate real products, matching the three-way City/Country/
Combined split this game's own fare config already has):

| Tier | Day (walk-up) | Day (TapTapCap) | Late | Week (TapTapCap only) |
|---|---|---|---|---|
| City | £6.00 | £5.70 | £5.50 | £26.50 |
| Country | £6.30 | £6.20 | £6.20 | £25.00 |
| City&Country (Combined) | £9.60 | £9.30 | £9.30 | £38.50 |

**Confirmed 2026-11-01**: the real Day→Week ratio isn't the same across
all three tiers (City ≈4.42x, Country ≈3.97x, Combined ≈4.01x) — the game
uses **three separate ratios, one per tier**, matching the real data
exactly rather than averaging or picking a single one.

Reference PDFs of the Lothian, Airlink and Lothian Country fares pages are
in `reference/`, plus real screenshots supplied directly 2026-11-01
(Lothian's own City fares, Airlink's own fares, and Lothian's own Country
fares) — see this section's own tables above for the real figures read
from them.

### Discounted m-ticket bundles (mobile app only)
Confirmed 2026-11-01, from a real screenshot of Lothian's own app: bulk-
bought bundles of Day tickets at a real discount over the walk-up price,
usable one at a time whenever the passenger wants within the bundle's own
validity window. **Locked until the depot group has bought the "Mobile app
live bus data" company-wide upgrade** (TICKETING.md §4, £12,000) — not
available at all before then, mirroring how this is genuinely an app-only
purchase route in reality too.

Lothian's own real bundle figures (Day tickets only — **no City-only
bundle is offered in reality**, only Country and City&Country/Combined):

| Tier | 5-pack | Per ticket | 20-pack | Per ticket | vs walk-up |
|---|---|---|---|---|---|
| Country | £22.00 | £4.40 | £63.00 | £3.15 | £6.30 walk-up |
| City&Country (Combined) | £32.50 | £6.50 | £120.00 | £6.00 | £9.60 walk-up |

Not yet wired into any actual purchase flow, since the mobile app itself
isn't built yet (TICKETING.md) — recorded as the confirmed target for
when it is.

### Season tickets — Ridacard
**Adopted 2026-11-05** (first spotted 2026-11-01, flagged, then confirmed
as real scope) — the concrete answer to §8's own pre-existing "season
ticket purchase is decided per passenger" line, not a bolt-on addition.
Modelled on Lothian's own real **Ridacard**: unlimited travel on Lothian
Buses, East Coast Buses and Lothian Country (zones A/B only, not the wider
B–H country network), Airlink 100 and NightBus, all in one product, bought
in advance for a fixed term.

**Cross-tier revenue reconciliation — worked through 2026-11-05**:
Ridacard doesn't need its own separate solution to this — it's the same
underlying mechanism as capping, not a new one. For an **individual**
passenger, a Ridacard purchase is revenue recognised **once, at purchase**
(§8's own "decided per passenger, based on how often they travel"), after
which that passenger rides free for the term — still counted for loading/
ridership/satisfaction purposes, just contributing no further per-trip
revenue. For the **statistical** tier, there's no individual purchase
decision to track, so it needs the exact equivalent capping already needs:
not per-passenger simulation, but a modelled **proportion** of statistical
demand assumed to hold a season ticket, with revenue recognised as a
periodic lump sum (scaled to that proportion) rather than per trip. The
two tiers are really solving one problem, not two — "a portion of demand
pays up front or accumulates to a threshold, then rides free for a
period" — Ridacard is just a **longer, fixed-term** version of exactly
what capping already needs (a week/4-week/year purchase decision instead
of a rolling day/week spend threshold). Still not built (Phase 4's
passenger simulation doesn't exist yet), but this means **capping's own
eventual mechanism should be designed to cover both from the start**,
rather than building two separate systems that would need reconciling
with each other later.

**Three tiers**: Weekly, **4-Week** (reintroduced specifically for
Ridacard, after being dropped twice as a general "28-day ticket" concept
earlier this session — the two aren't the same decision: this is a
season-ticket duration, not a bolt-on to the ordinary Day/Weekly family),
and **Annual**. Real Lothian figures, confirmed exact:

| Tier | Adult | Child (exactly 50% — confirms the universal rule above) | Student (real figure, not a clean ratio — see below) |
|---|---|---|---|
| 1 Week | £26.50 | £13.25 | £23.00 |
| 4 Week | £80.00 | £40.00 | £68.00 |
| Annual (Direct Debit, paid monthly) | £74.00/month + £25 one-off admin fee | £37.00/month | £58.00/month |
| Annual (paid up front) | £760.00 | £380.00 | £660.00 |

Student's own real discount **isn't a clean universal ratio** the way
Child's is — it ranges 78–87% of the Adult price across the four tiers, so
these are recorded as their own real, fixed figures rather than derived
from a formula.

**Adopted 2026-11-05: a genuine fifth tier, Student-only** — Lothian's own
**exclusive Student 9-month advance purchase** (available September/
October only, £570.00), confirmed because it fits the real academic year
("like Lothian does"). Not available to Adult or Child Ridacard — a
Student-specific product only, matching the real one exactly.

Not yet wired into any actual purchase flow or passenger simulation — the
Student passenger type itself (§8) isn't designed beyond being confirmed
to exist yet either, so this is deliberately recorded as real target data
for when both are built, not a half-built mechanic.

### Route types and fares
Every route has exactly one **route type** — Ordinary, Night, Sightseeing,
Airport Express or Long-distance (UK-EXPANSION.md §10 for Night's own real
operating window and its mandatory N-prefix numbering). Which fare sections
actually show in the fare-pricing panel is still **derived from the depot
group's real zones and routes**, never a manual toggle — but as of
2026-11-01, most of them show **read-only**, not editable: Ordinary, Night
and Airport Express fields are fixed, company-wide figures (see the section
intro above), shown only when the depot group actually has a route of that
type but not changeable there. **Sightseeing stays fully player-set**, and
**Long-distance stays fully player-set** too (its own base-fare-plus-per-
mile model was never part of this rework) — both still need a route of
their own type to show, same derived-visibility principle City/Country/
Island zone fields already use.

### £2 fare cap (Highland, SPT and Aberdeen)
Modelled on the real Scottish schemes. Three zones (extended to Aberdeen,
2026-10-17, matching the real scheme's own extension):

- **Highland** — the Highland council area plus Moray.
- **SPT** — the twelve council areas the former Strathclyde region divided
  into in 1996: Argyll and Bute, East Ayrshire, East Dunbartonshire, East
  Renfrewshire, Glasgow City, Inverclyde, North Ayrshire, North Lanarkshire,
  Renfrewshire, South Ayrshire, South Lanarkshire, West Dunbartonshire — full
  council areas throughout.
- **Aberdeen** — Aberdeen City and Aberdeenshire, full council areas.

**Deliberate departure from reality:** in the game these zones border each
other directly, with no gap — real Argyll and Bute already touches Highland,
and real Aberdeenshire already touches Moray (so Aberdeen already touches
Highland too), so this falls out naturally from using whole council areas
throughout rather than needing an artificial patch anywhere.

Within any one zone, a **single ticket is capped at £2** to the passenger.
The operator still receives the **full real fare** — the government pays the
gap between £2 and the real fare, not a fixed top-up. Leaving a zone into
anywhere that isn't one of the three, **normal (uncapped) fare applies to
that portion of the journey**, paid by the customer as normal — the cap only
ever covers the part of a journey actually inside a capped zone.
**Crossing directly from one zone into another (they all border each other
with no gap, per the departure from reality above), the single for that
whole journey is capped at £4** instead of £2 — the same rule regardless of
which two of the three zones are involved (Highland↔SPT, Highland↔Aberdeen,
SPT↔Aberdeen all behave identically; there is no three-zone "through fare"
case, since Highland sits between the other two and a journey crossing all
three in one go isn't a realistic single service). A journey that leaves a
capped zone, crosses real uncapped territory, and later enters a different
capped zone is **not** a £4 crossing — each capped portion gets its own £2
cap and the uncapped middle portion is charged normally, exactly as if it
were two separate journeys.

The cap applies to **single tickets only** — day, weekly and return
tickets are unaffected. The driver sells whichever ticket is actually
cheapest for the journeys the customer will make, so a capped single isn't
sold in preference to a cheaper option that already exists.

**Excluded entirely:** sightseeing tours, private hires, Airlink 100, Express
500.

**Government payments** arrive **monthly, with a one month delay** — a real
cash-flow lag between running the capped fares and being reimbursed for them.

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

**Operating hours.** First departure **0630–0700**, last departure **1800–1900**,
so the last bus is back by about 1930. Rural contracts sit tighter — **0700–1800**.

**Shopper services.** Some contracts want only **1 or 2 services a week in each
direction**, always ending at a shopping centre or supermarket, returning an hour
to an hour and a half later the same day. Offered **only in rural areas**, and
**never at a weekend**.

**Evening and morning subsidy.** Where a service stops in the late afternoon
because the evening is unprofitable but demand remains, the council can offer to
fund later journeys — and the same for an early start. Offered **automatically**;
the player accepts or declines. It only applies to journeys that would otherwise
lose money, so it cannot be gamed. It is a **subsidy on those journeys, not a
contract**, and the council **warns before withdrawing** it if the journey stops
losing money.

A **contracted** route can also get journeys funded beyond its set hours — but as
an **extension to the contract** rather than a subsidy, since the route is
already a contract.

**SPT as the contracting body.** Within the SPT zone (§9), any contract that
would otherwise come from the council instead comes from **SPT**, the real
regional transport authority — matching how it actually works, since SPT
rather than individual councils awards these contracts there.

SPT mostly **subsidises** routes rather than awarding full contracts — a
genuinely different mechanism, closer in shape to the evening/morning
subsidy above than to an ordinary council contract: it tops up a route
that's already running, rather than paying for the whole thing to be run on
SPT's behalf. SPT can still award a **full contract** for a route with no
commercial viability at all, alongside this main subsidy mechanism.

**SPT branding.** A contract requires a **full dedicated SPT livery** on the
vehicle — the same treatment as Airlink 100 or the long distance company
colour, not just a logo added to the operator's normal livery. This is only
required where an SPT **subsidy** makes up a large proportion of the route's
revenue; a light subsidy doesn't require it. A full SPT contract always
requires it.

### School contracts
A separate type of council contract, **high schools only**, running **term time
only**.

- The council pre-determines the **route**, and specifies the **vehicle type and
  minimum capacity** — low floor or coach, fitted with **seatbelts and foldable
  school signs**, shown on a school run and folded away otherwise.
- A school contract **never goes further than the nearest high school by road**.
  Catchments overlap slightly where runs meet: about **350m in cities**, and
  **proportionally in the country** — roughly 5% of the road distance to the
  school, since a fixed 800m band is meaningless where the school is fifteen miles
  away.
- Penalties are **larger than other contracts** and the contract is lost after a
  **tighter number of misses**, because a failed school run strands children.
  Running below the minimum capacity is penalised.
- **No livery requirement.**

**Vehicles** are not a school type — any bus with seatbelts and signs qualifies,
and spends the rest of the day on ordinary work. **Private hire vehicles can work
school runs**, which gives them something to do between hires.

**Drivers** are part time, paid only when on a school contract, and need the same
licence and training as anyone else. They can work a service between the depot or
local interchange and the school run, and **regular drivers can work school buses**
where the timetable allows — the operations manager decides who does what. In the
holidays school drivers can work normal duties, paid as casual.

**Term dates** are simplified: roughly six weeks in summer, two at Christmas and
two at Easter. In the holidays the school-run peak on ordinary routes goes quiet
while the middle of the day gets busier as families travel, so the summer network
is a different shape rather than a thinner one. A **holiday timetable** is optional
— another day type the player can build if it's worth it.

**Dual purpose.** Once a school route is running, the council can request it
become open to regular fare-paying passengers as well as pupils. The school
arrival time in the morning and departure time in the afternoon are both set by
the council; the rest of the journey works like any dual-purpose service.

### Event contracts
Large venues and cruise ports offer event-day contracts. Venues know roughly how
many people will attend, so they mostly get the number of buses and the duration
right for each event.

- Routes run from bus stations, park and rides and nearby railway stations.
- Set up once, then run whenever there is an event, to a timetable and frequency
  set by the venue.
- The contract states a minimum and maximum number of events per month when
  offered, and gives **two weeks' notice** of any new event.
- Same penalty and regain rules as council contracts, but **per destination** —
  each destination served can be lost separately, since a venue route usually
  serves several.
- **These pay very well** — see the economy targets below. Pay **scales with
  frequency and distance**.

**Gate:** contracts are only offered where the player already runs services to
the bus station nearest the contract area.

**Which destinations qualify.** A cruise port only ever wants a route to the
**nearest bus station**. A venue wants routes to **every bus station and park and
ride** within **1.2x the distance of the nearest bus station**, and may also want
the **nearest train station**, provided it is more than **225m from a bus
station** — whether it actually does varies by venue and event even when one
qualifies.

**Accepting destinations.** The venue specifies which of the eligible
destinations it wants; the player can **accept some and decline others** without
losing the contract as a whole. Each destination has its **own frequency**,
scaled to how busy it is. A **declined destination is picked up by the
competitor** — but only for that event; it is **offered again fresh next time**,
with no effect on future offers and no reputation consequence either way.

**Direction.** Services heading **to** a venue or port are always **pick-up
only**; services heading **away** are always **drop-off only** — set
automatically, not by the player.

**Prefix.** A venue's routes take a **short code the player sets per venue**
rather than always E. Cruise routes always keep the **C** prefix.

### Fixed real contracts
A genuinely different contract type from council, school, event, cruise or
lifeline (§10 below): the route, timetable — and for 398, the route number
too — are **entirely fixed**. The player, or the contract itself, doesn't
design any of it. Two instances exist so far (398 and Airlink 100, both
below), each a one-off special case rather than a general reusable type —
only worth generalising if a third ever comes along.

- Offered alongside council, school, event, lifeline and cruise contracts
  through a single **contracts menu** — one screen covering all five
  contract types, not five separate screens.
- Same **warning-and-review** penalty pattern as other contracts: the
  contract cannot be lost outright, but is heavily fined for any condition
  not met.
- Once accepted, a contract **starts on the first Monday after a minimum of
  10 days have passed** — the same lead time as activating a new route.

#### Route 398 — ScotRail Glasgow interchange bus
A real, currently-existing ScotRail service linking Glasgow Central, Queen
Street and Buchanan Bus Station. **Contract held by ScotRail.** In-game
it's a **circular loop**: Central Station Forecourt → Queen St Station →
Glasgow Buchanan → back to Central Station Forecourt — the same stop
serves as both start and terminus (§6).

**Eligibility and economics.**
- Offered once the player has at least **2 services running into Glasgow
  city centre**.
- Paid **per journey made**: £9/journey (a suggested starting figure).
- **No regular ticket types apply** — ScotRail handles all ticketing
  externally. The operator earns **zero fare revenue**, only the
  per-journey payment.
- **Dead mileage** is covered up to **5 miles**, for **2 return trips a
  day** (4 dead legs total, each up to 5 miles). Beyond that distance or
  that many journeys, the player pays their own dead mileage.

**Vehicle.** Must be ScotRail liveried, electric, single deck (OPERATIONS.md
§3's category digit 3, "e" suffix) — a strict requirement, not a
preference. (Corrected from an earlier, wrong size class — the player
caught their own mistake.)

**Route number and colour.** Fixed at **398**, colour fixed at
**#002664**, neither changeable. Central Station Forecourt (the combined
start/terminus) is shown in that colour and **reserved exclusively for
398** — the stop reservation mechanic (§4), but pre-owned by the contract
rather than through the normal paid process.

**Timetable** (real data, confirmed against real PDFs). Real stop codes:
Central Station Forecourt (6090194), Queen St Station (609088), Glasgow
Buchanan (6090118). Real running times, consistent all day: Central→Queen
St 6 min, Queen St→Buchanan 4 min, Buchanan→Central 7 min — a 17 minute
full loop.
- Mon–Fri: every 12 min 0800–1800, then every 20 min 1800–2000.
- Saturday: same pattern, starting at 0900 instead of 0800.
- Sunday: no official timetable exists. Use the same 6/4/7 minute running
  times as Saturday, every 20 minutes 1200–1800, except from the first
  Sunday in June to the last Sunday in September, when it starts at 1000
  instead of 1200.

Timings are real, so the bus should mostly keep to them without much
padding needed.

**Demand.** Passenger demand on 398 specifically is deliberately **capped**
so the bus never leaves anyone behind at peak times — special treatment
for 398 only, not a general rule for other routes.

**Build approach.** The player builds this route in the normal in-game
editor — auto-routing from the real stop codes above (confirmed to exist
in OSM), with waypoints addable to correct the path where the router picks
something wrong. Once built and saved, Claude Code extracts the route and
timetable to bundle as fixed content in the game files, identical in every
playthrough rather than player-editable.

**Livery.** Only 2 images needed: the badge and the number box. No
branding mask — no variations on this route, so no variable branding
region is needed.

#### Airlink 100 — Edinburgh airport service
The real Airlink 100 service, Edinburgh Airport to the city centre via
Maybury, Corstorphine, Murrayfield, Haymarket, West End and Princes
Street. **Contract held by Edinburgh Airport.**

**Eligibility and economics.**
- Offered once the player has a **depot within Edinburgh's city
  boundaries**.
- Earns from its own dedicated fares (below), topped up to a **guaranteed
  minimum revenue** if fares fall short in a given period — unlike 398,
  which stands entirely on the per-journey payment, Airlink mostly stands
  on its own commercial legs.
- **No dead mileage is paid at all** — the operator bears 100% of it,
  unlike 398's partial allowance.

**Vehicle.** Not a strict requirement — any double-decker is allowed, but
only the **ADL Enviro400 XLB** carries full demand (UK-EXPANSION.md §14a —
replaces the Volvo 9700DD this requirement used to name); a different
vehicle means some passengers get left behind.

**Ticketing** — its own dedicated ticket type, real fares:
- Single: Adult £6, Child £3.
- Return: Adult £8.50, Child £4.25, Family £22.00 (up to 2 adults and 3
  children).
- No day ticket exists for this service.
- **Concessionary passengers pay the full adult fare** — no discount,
  matching how real UK airport express services sit outside the national
  concessionary scheme. A deliberate exception to how concessionary
  reimbursement works everywhere else in the game.

**Timetable** (real data, confirmed against the real Airlink 100 timetable
PDF). Full physical stop list: Airport, Airport Hotels, Maybury Road, Drum
Brae South, Edinburgh Zoo, Western Corner, Murrayfield, Wester Coates,
Haymarket, Shandwick Place, Princes Street (**city-centre-bound only** — a
real example of the per-direction drop-off/pick-up restriction, §4),
Hanover Street, Waverley Bridge. Timing points (a subset): Edinburgh
Airport, Edinburgh Zoo, West End, Waverley Bridge.

Genuinely **24/7**, identical Mon–Fri/Saturday/Sunday — no seasonal or
weekend variation, unlike 398.
- **Frequent service, up to every 10 minutes**: Airport→City Centre 0504
  to 2358; City Centre→Airport, symmetrically, into the early morning
  through to 2357.
- **Overnight, fixed named times** cover the gap the frequent service
  doesn't run. Airport→City Centre (Edinburgh Airport departures): 0008,
  0018, 0028, 0038, 0048, 0100, 0120, 0140, 0200, 0240, 0300, 0320, 0340,
  0400, 0420, 0430, 0440, 0448, 0456. City Centre→Airport (Waverley Bridge
  departures): 0007, 0030, 0050, 0110, 0130, 0150, 0210, 0230, 0250, 0310,
  0330, 0350, 0400. None of these run on the mornings of 25 December, 26
  December or 1 January.

**Build approach — different from 398.** No stop codes could be found for
Airlink's real-world stops, so auto-routing from codes isn't available
here. The player builds this route **manually** in the editor.

The route, its stops and its timetable can be built **now**, even though
the per-stop pick-up/drop-off-only flag needed for the Princes Street
restriction doesn't exist in the editor yet — that flag only applies to
Princes Street specifically, and can be added to the already-built route
once the feature exists. It does not block building everything else.

**Route colour and reserved stops.** Colour fixed at **#002b4e**. Airlink's
start and terminus stops are reserved exclusively for Airlink and shown in
that colour (§4) — pre-owned by the contract, same as 398.

**Livery.** Two liveries: the standard Airlink livery (badge + number box,
no branding mask — no variations, so no variable branding region needed),
and **"Airlink_Giraffe"** — a real historic Lothian/Edinburgh Zoo tie-in
livery (fitting, since Zoo is a stop on the route). Counts as an Airlink
livery for the contract's vehicle requirement — either livery satisfies
it. Reuses the standard livery's number box image rather than needing its
own, so it only needs 1 new image (its own badge).

#### Express 500 — Glasgow Airport service
The real Greater Glasgow service 500, Glasgow Airport to Glasgow city
centre via Buchanan Bus Station and Waterloo St. **Contract held by
Glasgow Airport.**

**Eligibility and economics.**
- Offered once the player has at least **3 routes running both into and
  out of Buchanan Bus Station**, **and** Route 77 (below) has been running
  for **1 month** — an additional gate layered on top of the original
  condition, not a replacement for it.
- Same payment structure as Airlink 100: earns from its own dedicated
  fares (below), topped up to a **guaranteed minimum revenue** if fares
  fall short in a given period, and **no dead mileage is paid at all** —
  the operator bears 100% of it.

**Vehicle.** Must carry the Glasgow Airport livery (below), double deck,
electric (OPERATIONS.md §3's category digit 4 or 5, "e" suffix, whichever
axle class the chosen length lands in), and **airport-specification**
(reduced seating, increased luggage capacity, §10 below) — a strict
requirement, not a preference (matching 398's approach, not Airlink's softer
one). Same fines as Route 398 for running the wrong vehicle.

**Overnight sharing with Route 77.** When demand is quieter overnight,
Express 500 is allowed to run with Route 77's buses (below) instead of
its own — only possible because both routes draw from the same Glasgow
Airport livery family, so there's no livery mismatch either way.

**Ticketing** — its own dedicated ticket family, real fares:
- **Single** (1 Express 500 journey + 1 connecting Glasgow City journey):
  Adult £11, Child £6.50, Group £31.
- **Day** (unlimited Express 500 + all Glasgow City services): Adult
  £16.50, Child £9, Group £43.
- **Return** (2 Express 500 singles + 2 connecting Glasgow City
  journeys): Adult £17.50, Child £10.50.
- **Glasgow Explore** (2 Express 500 singles + a set number of Glasgow Day
  tickets): Adult 3-day £31, Adult 5-day £35.50, Adult 7-day £38.50, Child
  7-day £21.
- Group fares cover up to **5 passengers**.

**Route number, colour and reserved stands.** Numbered **500** (plain,
no X — "Express" is a brand name, not the game's express-service prefix,
same as 398 and Airlink both keeping their real numbers). Colour fixed at
**#1e6e6f**. Reserves two stands, both pre-owned by the contract the same
way as 398 and Airlink's stops, except these are bus station **stand**
reservations (§5) rather than plain stop reservations (§4) — the first
fixed real contract to reserve one, let alone two: **Buchanan Bus Station
Stance 46** and **Glasgow Airport Stance 1**, both shown in #1e6e6f and
locked from other use **immediately**.

**Timetable** (real data, confirmed against the real Greater Glasgow
service 500 timetables — Monday–Friday, Saturday and Sunday each supplied
separately, each slightly different). Timing points: Glasgow Airport,
Glasgow Buchanan, and (city-centre-bound direction only) Waterloo St.
Near enough **24/7** on all three day types: frequent, roughly every 10–15
minutes, from around 0430 through the evening, stepping down to roughly
half-hourly in the late evening and hourly through the early hours before
building back up to the frequent daytime pattern. Running times vary by
time of day (unlike 398's constant figures), so no single running time
applies throughout.

**Build approach.** The player draws the full route in the normal in-game
editor — the real timing points above can be auto-routed from their stop
codes, but the physical route also has extra stops not in the timetable,
so the player builds and finalises it by hand rather than relying on
auto-routing alone. Once drawn and saved, Claude Code locks it in as fixed
content, the same as 398 and Airlink.

**Livery.** No dedicated Express 500 livery — instead draws from a shared
**"Glasgow Airport" livery family** of 2 liveries with Route 77 (below),
either one satisfying Express 500's vehicle requirement, the same
either-livery-satisfies-it pattern as Airlink's two liveries. Each needs
2 images (badge + number box, no branding mask — no variations, so no
variable branding region needed), the same image count as Airlink's
standard livery.

#### Route 77 — Glasgow Airport commercial service
The real Greater Glasgow service 77, Glasgow city centre to Glasgow
Airport via Charing Cross, Partick, QEUH and Braehead Shopping Centre.
**Not a fixed real contract** — unlike 398, Airlink and Express 500, it
runs on **ordinary commercial economics**: normal fare revenue, kept by
the operator, no per-service payment and no dead-mileage rule change.
What it shares with the fixed real contracts is fixed identity — colour,
livery and vehicle — because it's sponsored/branded by Glasgow Airport
rather than freely designed, and its **unlock condition doubles as the
gate for Express 500** (above): once Route 77 has run for **1 month**,
Express 500 becomes available.

- Offered once the player has at least **3 routes running both into and
  out of Buchanan Bus Station** — the same condition Express 500 originally
  had on its own.
- **Vehicle.** Electric, single deck (OPERATIONS.md §3's category digit 3, "e" suffix).
- **Livery.** Carries the Glasgow Airport livery family (shared with
  Express 500, above) rather than a livery of its own.
- **Colour.** Fixed at **#93318e**.
- **Reserved stands**, pre-owned the same way as Express 500's: **Buchanan
  Bus Station Stance 45** and **Glasgow Airport Stance 6**.

**Timetable** (real data, confirmed against the real Greater Glasgow
service 77 timetables — Monday–Friday, Saturday and Sunday supplied
separately). Timing points: GLASGOW Buchanan, Berkley Street, Partick Bus
Station, QEUH Arrivals Sq, Braehead Shopping Centre, Renfrew Cross,
Glasgow Airport (city-bound direction uses a slightly different set —
Sauchiehall St at Charing Cross in place of Berkley Street, Partick
Merkland St in place of Partick Bus Station). Near enough **24/7** on all
three day types, roughly every 15 minutes through the day. Only about
half of daytime departures run the full route to Renfrew Cross and
Glasgow Airport — the rest short-work no further than Braehead Shopping
Centre or QEUH, an ordinary timetable pattern with no economic
significance now that the whole route is commercial.

#### AIR — Edinburgh Airport reward contract
A fourth fixed real contract, and a different kind from the other three: a
**reward** rather than a subsidy or a commercial route. **Contract held by
Edinburgh Airport.**

**Eligibility.** Offered once the player has run **both** Express 500 **and**
Airlink 100 successfully for **2 weeks each** — and both must be run by the
player specifically, the same operator, not just existing somewhere in the
game world.

**Economics.** No ongoing payment from the airport at all, and genuinely
**zero fines for anything**, including missing the timetable — a true
exception to the warning-and-review pattern every other contract follows.
Instead, the airport pays **15% of the fleet's cost**, for the **first
vehicle order only** — a one-off capital gift rather than ongoing revenue.

**Vehicle.** Tri-axle Volvo 9700 (65 seats), AIR livery, comfier seats
installed. AIR is mechanically an ordinary **long distance coach service** —
long distance rules, rota type, hours all apply as normal, and it only needs
regular customer announcements, no special passenger information system.

**Fares.** £7.50 single, £15 return. Partially falls within the SPT £2 fare
cap.

**Demand.** Buses are forced by the game to run at around **75% capacity,
averaged over 24 hours** — enforced directly on the passenger simulation,
the same mechanism as 398's demand cap.

**Reserved stops, at no cost to the player:** Stop D at Edinburgh Airport,
and Stance 48 at Buchanan Bus Station — both shown in AIR livery colours.

**Timetable.** Real timetable, to be supplied and built the same way as the
other three.

### Airport route type
A route type the player can create themselves, for any airport, separate
from the three fixed real contracts above.

- **Manually flagged** by the player — not auto-detected from OSM.
- The **airport-specification vehicle** (reduced seating, increased luggage
  capacity) is **mandatory on Express 500**, stacking with its other fixed
  requirements (double deck, electric, Glasgow Airport livery — see
  above) rather than replacing any of them. On a player-built
  airport route it's optional instead — free vehicle choice otherwise.
- **Cannot use stop reservation** — that stays exclusive to the fixed real
  contracts. A deliberate carve-out from the general stop reservation
  mechanic below, not a reversal of it.

### Contracts moving between depots
General to every contract type, not specific to 398 or Airlink.

- Any contract can be **reassigned to a different depot**. This happens
  **overnight, after 7 days' notice**.
- If the move extends the dead mileage involved, it's judged by the same
  rule as any other excess dead mileage on a contract (above): too much
  waste risks losing the contract to the competitor until the next bidding
  round, re-bid with a changed route. No separate penalty exists just for
  this being a reassignment rather than a route the player drew badly
  themselves.
- Vehicles can be **locked to a contract** (as 398's and Airlink's are).
  When a locked contract's depot changes, the transition is **gradual**
  rather than a hard cutover: the bus leaves its **old** depot as normal
  that morning, a driver from the **new** depot takes over at a scheduled
  driver swap point during the day, and the bus goes to the **new** depot
  at the end of that day rather than the old one.

### Private hire
Enabled **per depot group**. A distinct revenue stream with no timetable at all —
a job with a start, an end and a driver, rather than a service.

- **Vehicles**: coaches and Sprinter vans only, flagged **private hire only** so
  they cannot work service or sightseeing runs. A vehicle can be switched back to
  service work, but it costs time and money.
- **Bookings arrive based on reputation and fleet size**, so private hire rewards
  a well-run operation rather than carrying an early one. Declining a booking
  costs nothing.
- A customer books for a set number of people, never exceeding the capacity of
  available vehicles. **The price is set on the vehicle's capacity, not the
  number of customers.**
- Profit sits in a range between two hidden values, tuned so the work is always
  worth doing.
- **One driver completes the entire hire.** Hires can run **up to five days**;
  on a multi-day hire the driver is paid to stay away in accommodation, and that
  cost is added to the customer's price.

**Scheduling.** The customer gives the time they must **arrive** at the
destination and the time they need to **leave** for home. The game works the
timetable back from those two fixed points.

**Multi-day hires** end each day at a hotel, and may run **up to two attraction
trips a day** from it. A multi-day hire must always be **outside the operating
area the contract starts in**.

**Waiting.** When the bus drops off at a bus station — for an attraction or a
rest break — it can **pay to wait there off a stand** if the station has parking.
If it has none, the bus must drive somewhere else to park while the driver takes
their break.

Driver rules are in `OPERATIONS.md` §7. Note that private hire **always uses EU
drivers' hours**, and rest stops must be built into the route where it would
exceed the driver's driving time — the game warns and suggests where one is
needed.

### Tour routes
A separate product from sightseeing: a **named** multi-day or full-day tour, set
up once and run whenever there is demand, which **marketing raises**.

- Charged for **use of the vehicle**, not per person, so more customers means less
  each — and since hotels are the major cost, multi-day tours are normally coaches
  rather than Sprinters. Vehicles are chosen by customer numbers, and **electric
  vehicles earn slightly more**.
- The **depot manager** prices and books them, giving a margin of **8% rising to
  25%** at full skill. A **tour guide** adds a further percentage scaled by their
  skill. The player is told about bookings and can overrule, which sends the
  manager to rebook another day rather than losing the work.
- Up to **five days**, using the same private-hire-flagged vehicles. Only **two
  vehicles on a route at once**, and the second may not start until the first is
  **50% complete**.
- A tour is only accepted if it **doesn't affect a school run**.
- Minimum hire of **10 hours**; anything under an 8-hour day attracts no bookings.
- **EU drivers' hours**, with rest stops built into the itinerary.

The player designs the **itinerary and overnight stops** — fixed per route,
variable per booking. Each day must end at a **hotel**, taken from OSM, chosen by
the player. Hotel cost varies by place but not standard, they affect nothing
beyond cost, and all have parking. The vehicle parks at the hotel, a nearby car
park or a local depot — **free at a depot, paid elsewhere** — and the driver stays
at the customers' hotel.

**Electric coaches cannot charge on the road**, so are only usable where they can
complete the whole trip. Where a day ends within a few miles of a depot the vehicle
charges there overnight and the driver takes a lift to the hotel, having dropped
the guide off with the customers.

Tours run **more year-round than private hire**, with a rise in the school holidays
when vehicle demand is higher — so the same coach does school runs in term time and
tours in the holidays.

### Remote depots and lifeline contracts
Scottish islands and the far Highlands don't work like the mainland — most
service exists only because the council pays for it. Rather than offering
lifeline contracts individually, the player **proposes a remote depot**: a depot
in a remote area (built or rented), at least **two routes**, and the buses to run
them. The **operations director negotiates the whole package** with the council.
The council **always agrees**, provided the criteria are met — there is no
rejection.

**Adding a route later.** Once a remote depot is established, adding a
**further** route to it goes through this **same negotiation every time** —
proposing a depot only gates the first agreement, not every route added
afterward.

Once agreed:
- A **built** depot gets some council funding; a **rented** one gets a discount.
- Buses are bought at a **15–20% discount** on top of the bulk discount, since the
  council part-funds the fleet — the size depends on the operations director's
  skill. The same discount applies if leased instead.
- The depot is marked **remote**. Drivers cannot be trained there — they train at
  a bigger depot — and the region and company staff tiers cannot be based there.
  Staffing at a remote depot is covered in `OPERATIONS.md` §2a.

**Lifeline contracts** work differently from other council contracts:
- A required **number of services per day** to certain areas, defined outward
  from the island's main population centre, rather than a cost-per-passenger
  target. The contract is only lost by **failing to run that number**.
- The council sets the **first and last service times**, with half an hour's
  flex either side; everything between is the player's own spread.
- Pay scales with **isolation** — measured by both distance from the mainland
  and number of ferry legs. **Skye pays noticeably more than an ordinary rural
  contract** despite being road-connected, since it is still very remote.
- A lost contract is **re-tendered after a cooling-off period**, and only the
  player can bid for it during that time — there is no competitor on islands at
  all.

**Payment model.** A genuine structural difference from an ordinary council
contract, not just a different target: the council takes **all fare revenue**
on a lifeline route — the operator earns no farebox on it at all. In exchange,
the operator is paid a **fixed rate per mile** (not including dead mileage),
and that rate **scales with isolation**, the same measure used above. Lifeline
work therefore removes farebox risk, and reward, entirely — pay is guaranteed
regardless of how busy the route actually is.

**Long distance lifeline funding.** Long distance routes to very remote places —
Skye, Ullapool — can also attract council funding, on the whole route or just
part of it. Eligibility comes from a **fixed remoteness score per settlement**,
negotiated by the operations director; a partial subsidy is calculated **per
mile on just the funded section**, worked out automatically from the remoteness
score along the route. It is reviewed only if the route itself changes, not
withdrawn periodically like the evening subsidy.

**Downgrade rather than loss.** If a remote depot's lifeline route repeatedly
fails its service count, it can step down to **community transport** instead of
the contract being lost outright — the area still gets something.

### Island and remote-area review
A settled review of every island and remote area in scope, covering whether it
needs a lifeline/subsidy contract or can run commercial (or a mix of both),
and whether it has its own dedicated livery. Lifeline need and dedicated
livery are **independent** — Mull needs a lifeline contract but has no special
livery of its own; several areas reuse an existing livery (SPT, Rapsons)
rather than getting a new one. Don't assume one implies the other.

| Area | Contract | Livery |
|---|---|---|
| Shetland | Mixed lifeline/commercial | Shetland Transport — **universal**: required on any bus running there, regardless of that specific route's own contract type |
| Orkney | Lifeline | Orkney Council |
| Arran | Lifeline | Reuses the existing SPT livery (Arran/North Ayrshire sits within the SPT zone) |
| Lewis and Harris | Lifeline | Hebridean Transport |
| North Uist | Lifeline | North Uist Transport |
| Islay | Lifeline | Islay Coaches |
| Mull | Lifeline | None — the operator's normal livery |
| Skye | Lifeline | **Rapsons** only (narrowed 2026-11-05 — previously also accepted D&E and Highland Council) |
| Fort William | Mixed commercial/subsidised | None |
| Caithness | Mixed commercial/subsidised | **D&E** (preferred) — also accepts **Highland Council** (confirmed 2026-10-18, closing a gap this table left open since T64 first supplied the real-world detail: "Caithness vehicles should be D&E Livery or Highland Council Livery") |
| Oban | Mostly commercial, partial subsidy | None |
| Ullapool | Lifeline only, including its long distance buses | Rapsons (shared with Skye) |
| Campbeltown | Lifeline | Town-only services (never leaving Campbeltown) use the SPT livery; longer or connecting services from Campbeltown carry no specific livery |
| Galashiels | Mixed commercial/lifeline | None |

**Livery lock in the buy menu (confirmed 2026-10-18).** A depot in a
restricted area — any row above with a specific livery, not "None" — only
lets the player pick from that area's own acceptable set when buying a
vehicle there; every other livery is shown but greyed out, not hidden
(so the restriction itself stays visible, not just mysteriously absent).
Each restricted area currently has exactly one livery of its own, except
Caithness, which accepts Highland Council alongside D&E (confirmed
2026-10-18). Skye was briefly widened to accept D&E and Highland Council
too, then narrowed back to Rapsons only (2026-11-05). Where an area
accepts more than one livery, it also has its own **preferred** livery
(marked above) — picked
by default, and the selection snaps back to it automatically if the
player changes the buy menu's depot to a restricted area where whatever
was previously selected isn't on that area's own accepted list.

### Community transport
A demand-responsive service for communities too small even for a lifeline
contract. Council-funded, **free to passengers**.

- Booked ahead by passengers; the game works out the day's route from where the
  bookings are, rather than running to a fixed timetable.
- Only the **EVM Sprinter, low floor variant** works it. The council pays **30%
  of the purchase cost** if it wants community transport set up.
- Demand **rises in summer** as day-trippers and second-home owners add to
  ordinary local bookings.
- Remote depots get subsidised broadband to support the booking system.

### Road closures
A scoped-down risk, limited to roads flagged as **remote** — not a general
weather system, which the game does not have.

- **Random, rare** events. A closure can **block a road entirely**, forcing a
  service to divert or cancel until it reopens, or just **add delay** — depending
  on the event.
- A **short warning window** is given beforehand, not much notice.
- A blocked road **diverts automatically** where an alternative exists;
  otherwise the service cancels.
- A closure **exempts the operator from contract failure penalties** — it's bad
  luck, not poor operation.

### Rail acceptance
When a railway line has a problem, rail tickets can be accepted on bus
services as an alternative during the disruption — the same category of
event as road closures above (random, rare), but on the passenger-revenue
side rather than the road network.

- Any service passing **within a set distance** of the affected station(s)
  qualifies, not just one that actually calls there.
- The **operations manager** decides whether to accept or decline it for
  each occurrence — not the player directly, and not automatic.
- The operator is paid the **full single ticket price** for every passenger
  who boards showing a rail ticket during the disruption — **uncapped**, no
  limit on numbers.
- Payment arrives with a **one month delay**, the same lag as the £2 fare
  cap's government payments (above).

### The competitor
A named rival with no network of its own, existing only in one area, purely to
punish failed contracts. It runs the route in a made-up livery while it holds
it. There is no head-to-head commercial competition. **There is no competitor on
islands** — lost lifeline contracts are re-tendered instead (see above).

### Skipping time
A **skip button** appears when no vehicle is on a duty, jumping to the next
departure. It is most useful in the opening scenario with four buses on three
village routes, and quietly disappears as the network grows. A private hire parked
at a hotel overnight is not on duty; driving to the hotel is.

### Customer ratings
A rating page of its own, shown **company-wide and per depot group**, because the
same complaint means different things in different places — waiting times in the
Highlands and in Glasgow have completely different fixes, and one will not help
the other.

The rating breaks into five contributing figures:
- punctuality,
- waiting times and frequency,
- vehicle quality and cleanliness,
- staff and driver quality,
- accessibility.

Presented as a score **plus actual passenger complaints**, generated from real
events in the simulation rather than written from a list — so a complaint is a
specific passenger who waited too long on a specific journey.

This is the diagnostic face of the single satisfaction number in §8: one figure
drives passenger behaviour, while these four keep it explainable.

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

### Starting the game
The council sets the player up rather than leaving them with a blank map:

- **Four used diesel midibuses** (OPERATIONS.md §3's category digit 2, no
  suffix — confirmed 2026-10-30 as staying diesel-only rather than opening
  up to the electric equivalent, matching the flavour of an older, used
  starting fleet) — three contracts' worth plus a spare, which matters
  because used buses break down.
- **Two or three contracts** offered immediately, depending on the area, on
  simple routes linking two or three small villages so the buses are nowhere near
  capacity.
- **No other routes can be created** until those contracts are fulfilled, which
  means having buses running on them for at least one day.
- **Controllers are provided free** until the player has five routes, after which
  they must hire.

It works as a tutorial without being one: three forgiving routes, tired vehicles
that teach why maintenance matters, and no staffing system to fight on day one.

### Money
The player starts with **money only** beyond that opening gift — every depot, vehicle and member of staff
is bought.

**Starting balance, confirmed 2026-11-05: £100,000** — a round figure
with enough headroom to buy a depot (discounted 20% per this section's
own "Economy targets," below) or a few extra vehicles beyond the free
starting fleet, without making the opening contracts irrelevant. Granted
exactly once, when a new company is created.

There are **no cash loans**; leasing is the only credit. Running out of money
does not end the game — the player simply cannot buy anything until income
recovers.

### Economy targets
The tuning goal is **a well-run route paying back its bus in about 12 months**,
with a badly-run route losing money. Margin follows from that rather than being
set directly.

The profit comes from **premium work, not from inflating the scheduled network**.
Ordinary stopping services run on realistic, thin margins. What funds growth is
council and event contracts, sightseeing, and private hire — with venue and
cruise contracts carrying most of the generosity so council rates stay credible.

Passenger numbers and running costs are **not** tuned away from reality. Earlier
drafts inflated both; that was dropped once sightseeing and private hire gave the
economy somewhere better to get its margin from.

Note what this implies: a plain commercial urban route with no contract or
premium work attached may never pay back a bus in twelve months on its own. The
target applies to a **well-run depot group**, not to every individual route — and
it deliberately pushes the player towards the more interesting work.

Every figure the player reads — fares, wages, fuel, vehicle prices — stays
realistic.

**Property capital is the exception.** Depot purchase and construction, and
buying a bus station, are deliberately set **20% below real-world levels**. They
are
lumpy one-off costs that mainly govern how fast the game opens up, and nobody has
a strong instinct for what a bus depot should cost, so discounting them improves
pacing without anything looking wrong. Vehicle prices deliberately do not get the
same treatment — they are the most recognisable figures in the game, and cheaper
buses would duplicate the three dials above and overshoot the payback target.

### Finance screen
**Each depot group keeps its own finances.** Company cash is a single pot and is
what buys vehicles, depots and bus stations — but that spend is recorded against
the group receiving the asset, so it is possible to see whether one group is
subsidising another.

Layout, top to bottom:
1. **Company level** — cash, this month's profit, current period.
2. **Group selector** — each depot group, plus an all-groups view.
3. **That group's profit and loss**, in categories that expand into their lines.

Categories:

| Revenue | Costs |
|---|---|
| Fares — singles and returns, day and LATE, weekly, NETWORK, capping, concessionary reimbursement | Staff — drivers, engineering and stores, controllers and travel centre, overtime and loans, fleet elite payments |
| Contracts — council and event | Vehicles — fuel and energy, maintenance, parts stock, leasing |
| Sightseeing | Property — depot, stand rental, stop fees, station upkeep |
| Private hire | Marketing |
| | Penalties and fines |

**Long distance has its own section**, split by depot, rather than sitting in any
one group's figures — those routes draw vehicles and drivers from depots across
several groups, so attributing them to whichever group originated the route would
be misleading.

Capital purchases are shown separately at the foot of the group's figures, noted
as spent from company cash.

**Settings pages** sit alongside: a single wages page listing every role's rate,
a fares page for zones, bands and caps per group, a marketing page per group, and
contract terms shown read-only against each contract.

---

## 11. Presentation

One full-screen borderless window. No detachable windows. Player time is
expected to split evenly between map and management screens, so both are
first-class.

### Route display
- **While building a route, and while a saved route is shown on its own** —
  drawn over the road, filled to the road's width, at about 75% transparency
  so the road shows beneath. No directional chevrons: tried and dropped
  (2026-10-17) — a stretch a route genuinely travels both ways rendered
  arrows pointing both directions over the same short run, which read as
  cluttered and ambiguous in practice, worse than carrying no direction
  marking at all. Plain 75% opacity is used for both views instead.
- **In normal view** — every route on a road is drawn as an even band filling
  the road at 100% opacity. Bands are ordered so they **do not cross at
  junctions**, which is a global constraint rather than a per-road choice; where
  a crossing is genuinely unavoidable the game asks. Where too many routes share
  a road, the number of bands is capped and a count shown for the rest.
- Route display toggles **per depot group**, so the map can show buses alone.

### The route panel
Routes are **always visible in a side panel** on the main map, **grouped by
area**, with the area currently being viewed **at the top** — so panning to
Glasgow reshuffles the list rather than making the player hunt for it.

**Position and visibility.** Left-hand side of the screen. Visible whenever
the player is on the main map. Hidden only for full screens — rotas,
timetables, finance. Small overlays and popups do **not** hide it.

**Per entry:**
- Colour swatch (small square), route number, destination/short name.
- Activation state: normal for a running route; greyed with a day countdown
  for one activated but not yet started; hollow for a deactivated one.
- A small **problem indicator** (dot or icon), shown when the route has
  understaffing, poor punctuality, or a livery shortfall the controller is
  currently covering for.
- **Monthly profit as an actual figure** ("£320/mo", "-£45/mo" — not just a
  colour or trend arrow), coloured green for a profit, normal (not muted)
  text colour for exactly £0, and red (the theme's danger tone) for a loss.

No live bus count — the panel is for scanning at a glance, not a live
dashboard.

**Grouping.** Every depot group's routes are shown, grouped, with the depot
group currently being viewed reordered to the top — panning the map reshuffles
the list into view. **Long distance routes** worked from a depot group's
depots appear at the **bottom** of that group's section, after its local
routes, not mixed in among them.

**While drawing a new route**, the panel is replaced by the route currently
being built, at the same width and position the route list normally occupies.

**While building that route's timetable**, the same space keeps showing the
route, but **locked** — stops can't be added or removed from there. The
timetable grid fills the rest of the screen to the right.

So the left-hand column has **three states** depending on context — route
list, route under construction, or locked route reference next to its
timetable — rather than three separate panels.

**Visual style.** Follows the dark UI theme (backgrounds, text tones, borders,
panel/badge treatment). Each entry shows its swatch, number and name on one
line, with the problem indicator, profit figure and activation state inline.
Areas are separated by a small muted label, not a hard divider — the "thin
border over background change" pattern rather than a heavier section break.

### Buses
Buses are drawn as **badge markers at every zoom** — a small angled rectangle in
a simplified two- or three-colour version of the vehicle's livery, carrying the
route number, with a **direction arrow at the front of the bus**. There are no
mid- or close-zoom sprites, which means the renderer needs no sprite
level-of-detail.

Because the badge reduces a livery to two or three flat colours, livery data
must carry an explicit primary and secondary colour alongside the full design.
Those same colours give the route list its swatches.

### Accidents
**Minor bumps only** — no serious collisions or injuries. Likelihood depends on
**driver quality and vehicle condition**. The consequence is repair costs and the
bus off the road for a time set by the damage and the **workshop backlog**, so
accidents hurt more when engineering is already stretched. Passengers get a
replacement bus, as with a breakdown. There is no reputation hit and no insurance.

### Support vehicles on the map
Cars and vans show as a **smaller badge with an icon**, keeping the same visual
language as bus badges but clearly subordinate: a **spanner** for engineering vans,
a **figure** for staff cars, and a distinct icon for the recovery unit.

### Depots and stations on the map
A depot shows as an **icon with a bus count**. A bus arriving **drives into the
depot and fades once parked**, rather than vanishing at the gate.

At a bus station, badges **sit on their stand**, so congestion is visible at a
glance. That means stand positions must exist as data — OSM maps individual
stands at some stations and not others, so where it does not they are placed by
hand through the override layer.

### No vehicle artwork
There is no drawn vehicle art anywhere in the game. The purchase screen shows
specifications and a livery swatch, not a picture of the bus. A livery is
therefore a small set of colours rather than an illustration.
