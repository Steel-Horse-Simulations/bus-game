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

**The recurring cycle.** **Wages are paid every Thursday.** **Operational changes
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
from stand 5, it gets as close to stand 5 as it can. If it is not leaving in
service it drops off at whichever stand suits.

**Setting the departure stand.** As well as on the route, the stand can be set
from the **bus station settings**, so congestion can be moved off a busy stand
without editing every route that uses it.

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
number from **1** upwards; council contracts from **201**.

**Commercial numbers are per depot group**; **all contract numbering follows
council areas**. A route running into more than one takes the next number free, so
it cannot clash — duplicates within a depot group are avoided automatically with
no warning.

Prefixes say what a working is before you read the number:

| Prefix | Meaning |
|---|---|
| *(none)* | Commercial service, from 1 |
| *(none)* | Council contract, from 201 |
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
buying a bus station, are deliberately set **below real-world levels**. They are
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

Each entry carries its colour swatch, number and name. Routes activated but not
yet running show greyed with a countdown; deactivated routes show hollow.

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
