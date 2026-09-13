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

**Buses do not use ferries on service or contract work** — only on private hire
and tours. Island networks are therefore self-contained: a Mull depot runs Mull
routes, and the ferry is where passengers arrive from rather than something the
timetable depends on. Piers generate both local demand and ferry arrivals.

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

The calendar uses **28-day months of exactly four weeks**, so weekly rotas,
weekly fare caps and 28-day tickets all line up and a 28-day ticket is precisely
one month. A year is thirteen months. Anything annual — the MOT, the annual
test — is defined as **364 days** rather than twelve months.

Game pace comes from the clock speed, not from shortening the calendar.

**The clock.** At normal speed **one real second is ten game seconds**, so a game
day takes about 2.4 real hours — slow enough to watch buses work a route, which is
the point of simulating real roads.

Speeds are **1x, 4x, 10x, 20x and 60x**. At 60x a day passes in about 2.4 real
minutes and a 28-day month in roughly an hour, so the monthly cycle — wages, rent,
contract reviews, the operations manager's changes — comes round several times in a
session rather than once.

Note the simulation must **step properly at 60x** rather than teleporting vehicles:
ten game minutes pass per real second, and a naive update will skip buses past
stops. It works at 1x and breaks quietly at speed.

**The recurring cycle.** **Wages are paid every Thursday** (weekly). **Maintenance
is paid monthly**, on the 28-day cycle. **Operational changes
take effect on the Monday of every even-numbered week**, so the network settles
fortnightly rather than shifting daily. Rent, contract reviews and other monthly
items run on the 28-day month.

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

### Station, airport and park-and-ride stop linking
Railway stations, airports and park-and-ride sites get stops linked to
them, the same way stops link to a bus station (§5). Unlike bus station
stands — hideable via the map's stop toggle — these linked stops are
**always visible** on the map, and all three generate **higher passenger
demand** for journeys starting or ending there than ordinary land use (§2
"Demand").

Stadiums and ferry terminals — grouped with park and ride as one pipeline
data category (`CLAUDE.md`) — don't get this treatment; stadiums already
have their own eventual event-contract mechanics (§10) and ferries are
Phase 9.

**Colour.** Follows the same ring-around-the-stop visual pattern as bus
station membership, but each stands out in its own colour: bus stations
**#7c3aed** (moved off the original navy, which sat too close to fixed real
contracts' route colours — §10), railway stations **#ff4200**, airports
**#059669**, park and ride **#db2777**.

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
Current waypoint behaviour is unreliable — worth trying: place a waypoint on
a road and make the route follow the closest graph nodes on either side of
it, rather than whatever it currently does.

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

**Timing points.** Identical to the parent before the split, since it's
physically the same operation. After the split, the first timing point can be
freely adjusted; later ones keep the same **gap between stops** as already
established — unless the variation doesn't run interleaved with its parent
(an evening slow service replacing a daytime fast-plus-local pattern, say),
in which case every timing point after the split is freely adjustable, since
there's no interleaving relationship left to preserve. Timetabling in full
in §7.

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
- Adjusts automatically when the operations manager retimes the main route — if
  service 7's timings are extended, the service 12 journey departs later; if
  service 1 keeps arriving late, its departure is moved **earlier** while the
  arrival is held. Shifting a service by an hour moves its positioning journeys
  with it.

Peak positioning journeys — extra runs to get buses to the start of routes for a
higher rush hour frequency — can be added by hand, and the operations manager works
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
  places take only 40,000-range vehicles.
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

Where a terminus genuinely has no turning point nearby, **reversing at the
terminus is allowed**. Reversing is otherwise confined to the player's own land —
off a stand or into a parking space — which mirrors how operators treat it in
reality. A reverse takes a few seconds and **briefly blocks the adjacent stand**.

A badly sited terminus is therefore visibly expensive: no turning point nearby
means a long loop on every journey, and it shows up in the mileage.

### What the optimiser may not touch
The operations manager retimes services to spread congestion, both at bus stations
and along **corridors** — defined as two routes sharing **multiple stops on the
same stretch of road**, and only where the same depot works both. It also nudges
timing points and can extend a layover beyond the player's minimum.

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
| *player-set* | Event routes, a short code per venue |

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
- **Event services** sit **on top of** the normal timetable rather than
  replacing it, so an event day runs the normal service plus the event workings.
  This means services need a calendar as well as day types.

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

**Types:** adult, child, and concession/older person.

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

### Sightseeing tickets
A separate ticket type from the ordinary families, sold in two forms at
different prices: a **hop-on hop-off day ticket** and a **single trip** round the
loop. Sightseeing fares sit outside the zone system and outside capping.

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

### £2 fare cap (Highland and SPT)
Modelled on the real Scottish schemes. Two zones:

- **Highland** — the Highland council area plus Moray.
- **SPT** — the twelve council areas the former Strathclyde region divided
  into in 1996: Argyll and Bute, East Ayrshire, East Dunbartonshire, East
  Renfrewshire, Glasgow City, Inverclyde, North Ayrshire, North Lanarkshire,
  Renfrewshire, South Ayrshire, South Lanarkshire, West Dunbartonshire — full
  council areas throughout.

**Deliberate departure from reality:** in the game these two zones border
each other directly, with no gap — real Argyll and Bute already touches
Highland, so this falls out naturally from using whole council areas rather
than needing an artificial patch.

Within either zone, a **single ticket is capped at £2** to the passenger.
The operator still receives the **full real fare** — the government pays the
gap between £2 and the real fare, not a fixed top-up. Leaving the zone,
normal fare applies to the rest of the journey, paid by the customer as
normal. **Crossing from one zone into the other, the single is capped at £4**
instead of £2.

The cap applies to **single tickets only** — day, weekly, 28-day and return
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

**Vehicle.** Must be ScotRail liveried, electric, single deck, in the
70,000 fleet range — a strict requirement, not a preference. (Corrected
from an earlier 30,000 — the player caught their own mistake.)

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

**Vehicle.** Not a strict requirement — any coach is allowed, but only the
**Volvo 9700DD (low floor)** carries full demand; a different coach means
some passengers get left behind.

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
electric, in the **80,000 fleet range**, and **airport-specification**
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
- **Vehicle.** Electric, single deck, **70,000 fleet range**.
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
  requirements (double deck, electric, 80,000 range, Glasgow Airport
  livery — see above) rather than replacing any of them. On a player-built
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
| Skye | Lifeline | Rapsons (a real historic Highland operator name) |
| Fort William | Mixed commercial/subsidised | None |
| Caithness | Mixed commercial/subsidised | None |
| Oban | Mostly commercial, partial subsidy | None |
| Ullapool | Lifeline only, including its long distance buses | Rapsons (shared with Skye) |
| Campbeltown | Lifeline | Town-only services (never leaving Campbeltown) use the SPT livery; longer or connecting services from Campbeltown carry no specific livery |
| Galashiels | Mixed commercial/lifeline | None |

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

- **Four used buses** from the 30,000 range — three contracts' worth plus a
  spare, which matters because used buses break down.
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
| Fares — singles and returns, day and LATE, weekly and 28-day, capping, concessionary reimbursement | Staff — drivers, engineering and stores, controllers and travel centre, overtime and loans, fleet elite payments |
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
- **While building a route** — drawn over the road, filled to the road's width,
  at about 75% transparency so the road shows beneath, with small chevrons
  indicating one-directional running.
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
