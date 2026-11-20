# Bus Management Game — Operations Specification

The company side of the game: depots, vehicles, staff and maintenance. Read
`DESIGN.md` first for the world, routes, timetables, fares and contracts.

---

## 1. Depot groups

Main depots, small depots and outstations are collected into a named group —
"Edinburgh", for example. **A depot belongs to exactly one group.**

The group is the unit for a lot of the game, which makes it the first object to
build:

- route allocation for local routes,
- ticket validity,
- fare capping area,
- marketing budget,
- reputation,
- route display toggling,
- the anchor settlement used for route direction.

---

## 1a. Regions and council areas

Two boundaries sit above depot groups.

**Regions** are the player's own structure: **North Scotland, West Scotland, East
Scotland, Shetland and North England**. A depot group belongs to exactly one. A
region only appears once the player has built there, so the early game never
shows empty regional posts. Regions carry the store manager, the operations
manager and the marketing manager.

**Council areas** are real local authority boundaries taken from OSM
(`admin_level=6`). They are not the player's structure and will not align with
depot groups — one group may deal with three councils. Council areas govern which
council offers each contract, stop fees, station ownership, subsidies, and
contract route numbering.

The full hierarchy is therefore **depot → depot group → region → company**, with
council areas cutting across it.

**Terminology.** Wherever this spec or `DESIGN.md` says "area", it means **depot
group**, except where a council area is named explicitly.

## 2. Depots

### Types
Three tiers below a main depot, each a genuine stepping stone to the next:

- **Outstation** — five buses or fewer, **no staff**. Overnight parking only;
  cannot fuel, clean or maintain anything. Either rented parking or built and
  owned. Its vehicles **belong to the depot it's linked to**, not to the
  outstation itself — the outstation just holds an allocation of them. It exists
  to **start services from with minimal dead mileage**, not as an operation in
  its own right.
- **Tiny depot** — an outstation with a **porta cabin** added (below), up to 10
  vehicles.
- **Small depot** — its own completely separate rota, linked to a main depot in
  the depot overview when created. Can have fuel pumps and/or electric chargers
  **built in as part of the depot's price**, and maintenance facilities purchased
  if the depot is owned or inherited as-is if rented. Maintenance facilities need
  staff. Some work still returns to the main depot.
- **Main depot** — full facilities: fuelling and maintenance.

The progression is deliberate: **outstation → tiny depot → small depot**, each
upgraded in place once the location proves itself, rather than needing to be
rebuilt from scratch at the next tier.

Linked depots and outstations are covered by a small cost and can be a minimum
of one shift.

Depot, outstation and bus station pricing depends on location, the same as stop
pricing.

### Outstations in detail
An outstation is **linked to any one depot** — main, small or tiny — not
necessarily a main depot specifically, and to only one at a time. There is **no
distance limit** from the linked depot; that's left to the player's judgement,
since a badly placed outstation just costs more in dead running than it saves.

**Rent scales with the number of vehicles allocated**, and stays very cheap since
there are no buildings or facilities, just parking space. It snaps to the road
like a full depot, but gets only a **single entrance** rather than the entry/exit
split a main depot can have.

**Daily vehicle swap.** Because an outstation can't fuel, clean or maintain
anything, its vehicles are swapped back to the linked depot — this **tries to
happen at a bus station**, using the same in-service swap pattern as a
maintenance group (§2), rather than running dead each way.

### The porta cabin and tiny depots
A **porta cabin** can be bought for an outstation: a **flat one-off price**, a
**5 working day delivery time**, and it turns the site into a **tiny depot**
holding up to **10 vehicles** — deliberately capped low so there's a real reason
to move up to a proper small depot rather than staying here indefinitely.

- Vehicles at a tiny depot are its **own allocation**, not the linked depot's —
  unlike an outstation. They still have to be sent elsewhere at some point in the
  day for **fuelling and cleaning**, which can happen while the driver takes a
  break. Sent for actual **maintenance**, the same maintenance group rules apply.
- Beyond **5 vehicles**, a tiny depot needs a **controller**. They work
  **Monday to Friday only**, and are only in control until the last bus leaves —
  at which point they **drive that last bus themselves** and finish their day
  driving.
- **Controllers fuel in the morning; drivers plug in electric vehicles
  themselves in the evening** — there's no shunter at this scale.
- A tiny depot can be used as a **layover for driver breaks**, but only for
  drivers **based there**. Visiting drivers from elsewhere still need a proper
  building — a small or main depot — to break at.

### Getting a depot
- **Rent** early on, **buy or build** later. Both buying and building take time
  before the site is usable; build time scales with the depot, to a maximum of
  **two weeks**.
- A depot can be **built anywhere suitable** on the map — enough space with road
  access.
- On a **rented** depot the player can pay **15% of an installation's cost**, and
  the rent then rises in proportion to what was installed. The same 15% rule
  applies at rented bus stations. It is the landlord financing the work: cheap
  now, dearer forever, the same shape as the vehicle lease options.
- Depots and bus stations can be **sold again at market value**.

### Placement and entrances
Depots **snap to the road** like stops. What snapping gives is the **access
point** — where buses enter and leave, and what dead running routes to.

**Entrances are placed by the player** on the surrounding roads, and there can be
several. Each can be **entry only, exit only, or both**. A bus uses the nearest to
where it is coming from or going to, with a manual override. A badly placed pair
sends buses the long way round on every runout.

### Route allocation
- **Local routes** are assigned to a depot group. By default any depot or
  outstation in that group can work them, but a route can be **locked to named
  depots** within the group where that matters.
- A route belongs to **exactly one depot group**. Another group cannot own a
  shorter variation of a route crossing into it — that was considered and dropped,
  along with the shared numbering, fares, accounts and duties it would have needed.
- **Long-distance routes** are assigned to one or more individual depots, and those
  depots may be **in different regions**. Inverness–Edinburgh might start one
  service at each end simultaneously plus two from Perth in opposite directions,
  worked from Inverness, Perth and Edinburgh. Journey-to-depot allocation is
  automatic with manual override.
- Long distance is **owned by the operations director** and runs completely
  separately from local services, unaffected by them. Regional operations managers
  still flag problems on those routes but do not change them.
- The **first service on a route** always starts from the nearest depot to its
  start point.

### Getting home
Buses and drivers should end the day at their home depot. For long-distance work
the player decides **per vehicle working** whether a return working brings the
bus home the same day or it stays out overnight at the far depot.

### Maintenance groups
Depots can belong to a **maintenance group** — for example Ayr, Kilmarnock and
Stranraer — so not every depot in the group needs its own engineering facilities.

**Worked example.** A Stranraer bus due for servicing swaps with an Ayr bus
overnight: the Stranraer bus travels to Ayr and stays there overnight; an Ayr bus
goes to Stranraer in its place. During the day the two swap back at a bus station
while **both stay in service** — passengers never see a gap. Once the Stranraer
bus's work is finished, it swaps again at a bus station with the Ayr bus so each
ends up back at its correct home depot.

### Vending machines
Can be added to depots and bus stations, for **employees only**. Three types:
hot drink, cold drink, snack. Priced to give the player only **5% profit** per
item. Boosts **driver happiness** (§7), scaling with how many of the three
types are present. **Restocked by the storekeeper** as part of their job —
one more thing competing for that role's time (§9).

---

## 2a. Remote depot staffing

A remote depot (`DESIGN.md` §10) cannot host the region or company staff tiers,
so it staffs itself differently.

**Dual roles.** The workshop manager also acts as an engineer; the depot manager
also acts as a controller. Each is paid a **single wage covering both roles, no
top-up**. Storekeepers can also do a **limited driving role — one morning
service, out and back**.

**Working hours.** Engineering roles and cleaners work fixed hours, **0800–1700**.
Engineering staff (fitters, technicians, engineers) at remote areas and
islands — **including Shetland** — work **Monday to Friday only**, weekends
off entirely, on top of the fixed hours. (Shetland's 2-days-a-week MOT
testers, §9, are a separate specialised role and don't contradict this.)
Local services normally run **0600–1830**. Long distance services can run any
time after 0800, but must **leave the remote area no later than 1830** and,
travelling the other way, **arrive no later than 2115** — exceptions allowed
where connecting to a ferry.

**Controllers.** Work five days, Monday to Saturday — council contracts don't run
Sundays, so no controller is needed that day. The only Sunday traffic is long
distance buses, which are subsidised lifeline services rather than proper
contracts, and are covered instead by **relief controllers at the main depot at
the other end of the route**.

Controllers (including the depot manager acting as one) can also drive, limited
to **one out-and-back run at any time of day**. Their working window is **half an
hour before the first bus leaves until 15 minutes after the last arrives back**.
The same principle applies at any non-24-hour depot, mainland included, with
**20 minutes either side** instead.

**Recruitment.** No ongoing pay premium — wages match everywhere else. Where
hiring genuinely fails, a **£1,000 signing-on bonus** can be offered instead:
£500 at the end of training, £500 after a month worked following it.

**Layout.** Several small outstations can feed into one point in the mornings
around a remote depot, and outstations on islands are **very cheap to rent or
buy** — those with two buses or fewer are **free to rent**.

**Parts.** See §9's dealer network for how remote depots are supplied.

---

## 3. Vehicles

### Configurator
Vehicles are configurable, not fixed catalogue entries. One model appears in the
list with options for power type, length and equipment; the configuration
decides price, range, power output, length and **which fleet number
category digit the vehicle lands in** once bought (§3 "Fleet numbers and
plates").

The ADL Enviro200 MMC is the clearest case: one catalogue entry, offered at
8.9m/9.7m/10.8m (midibus, digit 2) or 11.5m/11.8m (full-size single-deck,
digit 3) — the length chosen at configuration decides which digit the
vehicle lands in, in either diesel or electric.

Examples of options: larger fuel tank on diesel coaches (more range, better for
InterCity), USB and power sockets, Wi-Fi, **comfier seats** (the passenger
seating upgrade, retrofittable — required on Airlink 100, Express 500, AIR
(§10) and Railair (UK-EXPANSION.md §9a)), air conditioning, passenger
information with next-stop audio and screens, premium driver seat,
pantograph charging on electric vehicles.

**Some options are retrofittable later as upgrades**; some are purchase-only.

### Condition
**Every vehicle has a condition**, not just used ones. New vehicles start at full
condition and decline with age and neglect. Condition drives reliability,
passenger perception, resale value and annual test risk — so a well-maintained
fifteen-year-old is genuinely better than a neglected five-year-old.

**Used buses** are therefore not a separate category: any catalogue model can be
bought used, at a used price and a lower condition. They are very cheap and much
less reliable, and passengers dislike them — good early, poor long term.

**Used price formula** (confirmed 2026-10-30, replacing the earlier
placeholder): the new price **falls 10% per year of age**, down to a
**floor of 20%** of new price, then that figure is **scaled by the
vehicle's own condition** — two identically-aged buses priced differently
if one has been better maintained than the other.

### Delivery and transfers
New vehicles arrive at the dealer **two or three a day**, a randomised number
each day, so a large order takes several days to land. They must be **collected
from the local external maintenance facility** rather than delivered to the
depot.

How many a depot can collect in a day depends on **staff available and how far
the dealer is**, so a Highland depot collecting from Glasgow loses a driver for
most of a day per vehicle. The **depot manager** works out who collects and when,
and their skill affects it. If nobody is free the dealer will deliver for a fee —
but **only to the depot that ordered the vehicle**.

**Transfers between depots** need a driver each way, the same as a repaint. A
vehicle in transit cannot be used. The driver travels back on the company's own
long distance and local services where possible; where that isn't possible they
take the **train, charged to the home depot**. A transferring vehicle is
collected by anyone at the receiving depot holding the right licence.

**Repaint on transfer** (confirmed 2026-10-18): where the destination depot or
area requires a different livery from the one the vehicle already carries
(DESIGN.md's own "Island and remote-area review" and its "Livery lock in
the buy menu" note), the transfer also repaints it, at a flat one-off cost
by vehicle size — minibus or midibus **£2,500**, single-decker or coach
**£4,000**, double-decker **£5,500**. Separate from, and much cheaper than,
the existing player-initiated repaint-shop queue (§5's own "Repainting" —
deliberately expensive and slow); this one is an automatic consequence of
the transfer itself, not a manual repaint job.

### Buying
Vehicles can be bought **new, second-hand, or leased**. Several can be bought at
once through a **basket allowing mixed specifications in one order** —
**destination depot and livery are both set per vehicle** within that basket,
not once for the whole order, the same way specification already varies
vehicle by vehicle. The bulk discount below still groups the whole basket by
manufacturer regardless of each vehicle's own destination or livery.

**Work type flags.** A vehicle is flagged for one kind of work and cannot cross
over. **Open-top double-deckers work sightseeing only.**

**Bulk discount.** Buying several at once is rewarded. The discount counts every
vehicle in the order **from the same manufacturer**, whatever their model or
configuration.

| Vehicles | Discount |
|---|---|
| 1 | 2% |
| 2 | 4% |
| 3 | 6% |
| 4 | 9% |
| 5 | 12% |
| 6 | 15% |
| 7 | 16% |
| 8 | 17% |
| ... | +1% per vehicle |
| 21 or more | 25% (cap) |

That is 2% per vehicle for the first three, 3% per additional vehicle to six, then
**+1% per vehicle beyond six, capped at 25%** — reached at 21 vehicles. A large
order is rewarded further than a six-vehicle one, without the discount running
away entirely.

Because the discount groups by manufacturer, a basket of five Volvos and five
Alexander Dennis earns two smaller discounts rather than one large one. That
quietly rewards standardising on a manufacturer, which also makes the fleet
easier to maintain and stock parts for.

Three ways to pay:

- **Buy outright** — full price now, owned forever.
- **Lease** — **60 months at 1.4% of the vehicle's price per month** (total
  **84% of price** over the full term), bus returned to the dealer at the
  end, or the lease extended. At the end there is an option to **buy out
  the remaining credit** and keep the vehicle.
- **Lease to own** — **60 months at 1.83% of price per month** (total
  **110% of price**), then ownership — confirming the earlier "about 10%
  more than buying outright" figure as a real rate rather than a rough
  estimate (2026-10-30).

Real figures confirmed 2026-10-30, replacing the earlier placeholder
instruction not to hard-code a rate or term.

**Lease payments are real, recurring charges (2026-11-14).** A vehicle bought on
lease or lease to own is billed every month, for real, at the rates above —
not just a figure shown once at purchase time. The Fleet screen's "My fleet"
tab shows each leased vehicle's own age, payment method, and real months/money
remaining on its lease, and bills any months fallen due the moment that screen
is opened. A plain lease simply stops billing once its 60 months are up (shown
as "Lease term ended" — there's no return/extend/buy-out flow built yet); a
lease to own flips to **buy outright** automatically at that same point, per
"then ownership" above.

**Missed payments** add that month's interest to the balance, so the player pays
more overall. Vehicles are never repossessed.

### Fleet numbers and plates
Every vehicle gets a unique fleet number and a unique registration plate
based on the area it was bought in. UK plates encode area and age —
Scottish tags run SA–SJ Glasgow, SK–SO Edinburgh, SP–ST Dundee, SU–SW Aberdeen,
SX–SY Inverness — so the plate doubles as a visible age cue.

Both stay with the vehicle for life, including on transfer between depots.

**Fleet number format**: `[category digit][sequential number, 3+ digits]
[e/h suffix]` — this fully supersedes the old X,000-range convention
(reconfirmed 2026-10-30; full spec and worked examples in
UK-EXPANSION.md §14, already implemented in `fleet-numbering.mts`):

| Digit | Category |
|---|---|
| 1 | Minibus |
| 2 | Midibus |
| 3 | Full-size single-deck |
| 4 | Double-decker, twin-axle |
| 5 | Double-decker, tri-axle |
| 6 | Coach, twin-axle |
| 7 | Coach, tri-axle |
| 9 | Support vehicles (pool cars, staff transport) |

The digit encodes **size/type only**, never power — an **e** suffix means
electric, an **h** suffix means hydrogen, and diesel/hybrid take no suffix
at all. A minibus is digit 1 whether it's diesel or electric; the old range
convention used to fold power into some ranges and not others (diesel-only
midibuses, diesel-or-electric minibuses, a separate electric-everything
60,000s catch-all), which is exactly what this format fixes.

Within a category, **each make starts in its own block** so numbers do not run
together. Numbers are issued chronologically. When a category fills, warn the
player and let them decide.

### Custom number plates
Added 2026-10-30. A vehicle's **plate** (not its fleet number) can be
replaced with a custom one, layered on top of the automatic area/age plate
above rather than replacing that system.

- **Any valid UK plate format**, unique across the whole fleet.
- **Fixed fees**, not player-adjustable settings:
  - **£80** to apply a plate to a vehicle for the first time (the DVLA
    assignment fee).
  - **£24 (30%)** to move a plate — putting a saved plate on a new vehicle
    after a sale, or putting a vehicle's original plate back on it.
- **Takes a few days to update.** The bus keeps running on its old plate
  throughout and switches automatically once the update completes.
- **The original plate is always kept**, not discarded — it sits in
  company plate stock, ready to be put back on the same vehicle later for
  the £24/30% move fee.
- **Fitting**: a fitter spends **15 minutes** fitting the plate, then the
  bonding glue takes **5 hours** to set. The bus **cannot be used** while
  the glue is setting.
- **Plates move between vehicles.** Selling a vehicle doesn't lose its
  plate — the plate is saved to **company plate stock** instead, and can
  be fitted to a different vehicle later (at the £24/30% move fee).

**Buying the registration itself** (separate from the £80 first-fitting
fee, which still applies on top):

| Plate length | Price |
|---|---|
| 7 characters | £250 |
| 6 characters | £1,500 |
| 5 characters | £5,000 |
| 4 characters | £15,000 |
| 3 characters | £40,000 |
| 2 characters | £100,000 |
| 1 character | £250,000 |

Multipliers stack on top of the base price above:
- **×3** — reads as a real word, name or set of initials.
- **×2** — repeated or sequential digits.
- **×1.5** — matches a real route number or fleet number the company
  actually uses.

**Bulk buying**: the player types a start plate and an end plate, and every
valid plate in that range is bought into company plate stock in one go.
The price is the **sum of each individual plate's own price** (length and
multipliers computed per plate), with the existing vehicle bulk discount
(`OPERATIONS.md` §3 "Buying") applied on top — 2% per vehicle for the first
three, 3% each to six, then +1% each, capped at 25% at 21 or more. Stock
plates are fitted to vehicles later, as needed, same as any other saved
plate.

### Transfers
Vehicles can be transferred between depots and must **drive to the new depot**,
collected by anyone at the receiving depot holding the right licence.

### Catalogue
Real models with specifications balanced for the game. Makes: Volvo,
Alexander Dennis, Wrightbus, Mercedes/EVM, Yutong. **The real, current
vehicle list lives in `VEHICLE-SPECS.md` and `vehicle-catalogue.mts`** —
this section no longer keeps its own copy of it. The list that used to be
here was organised by the old X,000-range convention and had drifted out
of sync with the real catalogue (it still named vehicles since dropped,
like the Volvo B8L and Yutong E12DD/U11DD) — rather than hand-patch stale
vehicle associations onto new category digits, it's removed outright
(2026-10-30) in favour of the one real source of truth.

Coaches come in **twin-axle and tri-axle** versions, a configurator choice
like power type or length: twin-axle Volvo 9700 seats **53**, tri-axle
**65**. The 9700DD only exists as tri-axle. A low-floor variant on the EVM
Cityline costs extra at purchase and is retrofittable later at greater
expense.

**Support vehicles** (category digit 9, above) — Ford Transit Custom
(diesel); Ford E-Transit Custom; Mercedes Sprinter crew van, diesel and
electric; Vauxhall Corsa (petrol — the diesel Corsa was discontinued
years ago in reality, corrected 2026-11-20); Vauxhall Corsa Electric;
heavy recovery unit, diesel and electric. Skoda Octavia Estate/Enyaq
dropped (2026-11-20, confirmed with the user) — the Corsa/Corsa Electric
pair already covers the pool-car role with a genuine diesel/electric
match of the same model, which Octavia/Enyaq never were (Enyaq is
Škoda's EV-only model, with no diesel equivalent). **Real prices/
ranges: VEHICLE-SPECS.md §3/§4a/§5.** Car/van prices are trade-discounted
20% off real UK list (confirmed with the user, 2026-11-20 — a genuine
fleet-buyer figure, not a nerf); both heavy recovery unit prices are
user-confirmed (£190,000 diesel, £215,000 electric); the Sprinter crew
van's own price is derived from those two facts rather than a found
list price. Only the electric heavy recovery unit's real driving range
remains an open gap.

The **heavy recovery unit is a Volvo FMX** (diesel) or **Volvo FMX Electric**
(2026-11-20) — real UK recovery vehicles are commonly built on exactly this
chassis by specialist bodybuilders (e.g. Falkom, who fitted the UK's first
Volvo FMX recovery vehicle), confirmed directly rather than assumed. The
diesel version matches how
real heavy recovery trucks are actually built; no production electric
heavy recovery vehicle exists in the real world yet, so the electric
version is a deliberate, confirmed exception to this project's usual
"every figure stays realistic" rule, kept for gameplay parity with every
other support vehicle role having both options.

The **heavy recovery unit needs an HGV licence**, which engineers gain through
external training. It lets the player recover a bus themselves instead of paying
the contractor.

**Repower** (2026-11-20, confirmed with the user) — the heavy recovery
unit, bought diesel, can later go through the same repower conversion
process already used for buses to become electric. None of the other
support vehicles can: a Transit Custom, Sprinter or Corsa bought diesel
stays diesel for good — there's no conversion path, the electric version
has to be bought outright from new instead.

**Charging a support fleet** (2026-11-20) — the small electric support
vehicles (E-Transit Custom, Sprinter electric, Corsa Electric) are
car/van-scale EVs and don't need this game's own heavy bus-charger
infrastructure (below) at all: a depot can have a **Zappi** charging unit
installed for them, **£1,200 installed** (a real domestic/commercial
22kW unit, grounded in myenergi's own retail pricing and typical UK
installed quotes) — a flat, one-off per-depot purchase, not metered
against the bus fleet's own grid-connection/charger-sharing rules at all,
since a 22kW unit's draw is trivial next to a bus charger's. The Volvo
FMX Electric recovery unit is a different scale of problem entirely — a
heavy truck's battery is far beyond what a 22kW unit could usefully
charge — so it plugs into the **same depot charger infrastructure the bus
fleet uses** (floor/drop-down chargers, grid-connection tiers, and the
per-charger/depot-wide power-sharing rules, all below), sharing capacity
with the buses rather than getting its own dedicated charger type.

### Electric vehicles
Range varies with weather and hilly routes. Charging blocks the vehicle. A duty
exceeding a bus's range gives a warning when planned and fails in service if
ignored.

Adoption is driven by lower running costs against higher purchase price, council
grants, and low emission zones.

**LEZs require Euro VI**, as the real Scottish ones do (Glasgow, Edinburgh,
Dundee, Aberdeen), and **this stays permanent — the requirement never tightens
further over time**. Non-compliant buses are **not banned but fined**, with a
larger fine for each emissions level below Euro VI. Electric buses seen in an LEZ
raise the company rating.

### Accessibility
Every passenger vehicle is either **low floor** or **stepped with a lift**. Low
floor implies a ramp, so ramp is not a separate category — low floor is the only
label needed.

All buses in the catalogue are low floor except the standard EVM Sprinter. All
coaches have lifts except the **Volvo 9700DD**, which is low floor. A lift takes
time to deploy and **counts against punctuality**, except on long distance
services where the time is built into the schedule.

Where accessibility is required:

| Work | Requirement |
|---|---|
| Council contracts | Low floor, plus a minimum capacity set by the council |
| Event contracts | Low floor only |
| Cruise contracts | Any mix, but at least one low floor |
| Sightseeing | Low floor only |
| Tours | Anything |

Event and cruise requirements are enforced by **warning and penalty**, not by
blocking the assignment. Running a stepped vehicle on service work always counts
against the accessibility rating, so in practice stepped vehicles are for
tours.

### Selling, scrapping and cascades
Upgrades stay with a bus when sold and raise its sale price. Price is decided
mostly by **condition and upgrades**; age matters only slightly. Selling in
**bulk fetches more per vehicle**, since a dealer wants a batch.

Four things can be done with a vehicle:
- **Sell** — the operations director gets a better price the more skilled they
  are.
- **Scrap** — a small sum, and only where nobody will buy it.
- **Replace** — buy the new vehicle first, and only once it has arrived does the
  old one go.
- **Trade in** — cars and vans only, against a new purchase.

There is **no end of life**. A vehicle can be kept indefinitely, but once it gets
too old customer satisfaction drops slightly.

**Cascades.** Selling and transferring chain into a single planned operation run
by the operations director: ten new buses arrive in Edinburgh, ten middle-aged
ones transfer to Inverness, ten old Inverness buses are sold. Each step runs **as
its buses arrive** rather than waiting for the whole batch, buses can be
**repainted en route**, and the whole thing can be cancelled or changed mid-way.
A better operations director completes it faster and sells better.

Vehicles **transferring out permanently** are not subject to the two-per-depot
repaint cap, since the depot is not going to be short of them — only Ferrymill's
own capacity of **seven vehicles in the workshop at once** applies.

---

## 4. Map badge liveries

There is no drawn vehicle artwork in the game. Buses appear on the map only as
badge markers, and each livery is supplied as a small badge image.

### Image specification
- **256 × 112 px PNG, transparent background**, badge filling the full width.
- Shows **only the livery pattern** on a rounded rectangle — the bands, sweeps
  and colour split that make the operator recognisable at a glance.
- **No route number.** The game draws it over the top. Baking it in would mean
  one image per livery per route number.
- **No direction arrow.** The game draws it so it can point the right way as the
  bus turns.
- Leave a clear band for the route number to sit in (see the fixed
  placement rule below, which replaces "middle third").

### The two images per livery — number box resolved
**Resolved 2026-11-05** (open since 2026-10-18, "we can talk about that
when we get to that bit" — asked again directly, the user confirmed now
was the right time): the third per-livery image (the magenta number
box) is dropped entirely, **with no replacement per-livery asset or
settings field** — proposed and confirmed as a single **universal fixed
placement**, since every badge already has to keep its number area clear
regardless. The exact ratio comes from a real reference the user
supplied (a live bus-tracker map badge: route number centred in a white
band roughly in the middle of the marker, with margin above for a small
livery accent and margin below for the direction-pointer tip) — **the
route number is drawn centred in a band spanning the middle 40% of the
badge's height and up to 85% of its width**, both centred, on every
livery with zero per-image authoring needed. This is a close reading of
that reference rather than an exact pixel measurement from it (a casual
photo of another site's own marker, not source data this game can
measure directly) — refine the exact fractions once real badge art is
tested on screen, the same tolerance already given to other
visually-judged figures in this document. The badge and mask (items 1-2
below) are unaffected — real badge images are already in
`assets/liveries/`, named by livery name (not id — see that folder's own
note elsewhere in this file).

Each livery is supplied as images at the same size and alignment:

1. **The badge** — the livery pattern itself, as specified above.
2. **A branding mask** — black where the livery is unchanged, **white** for the
   primary branding region and **mid grey** for the secondary. The renderer tints
   only those pixels, so one asset serves every branding colour.

That's the whole set now — no third per-livery image.

### Accompanying data
Each livery also stores two hex values — a **primary** and **secondary** colour
taken from the badge — used for the route list swatches.

The **livery selector on the purchase screen shows the badge image itself**, not
a plain colour dot, so you pick a livery by recognising it rather than by
guessing from a colour.

Reference values for the two liveries drawn so far:

| Livery | Primary | Secondary |
|---|---|---|
| Lothian | `#8c1d2f` madder | `#f2f0ec` white |
| Stagecoach Local | `#00539b` blue | `#f2f0ec` white |

Badges are produced from photographs of real buses. Store them in
`assets/liveries/`, flat (no subfolders, matching `assets/icons/`'s own
convention) — `<name>.png` for the badge, `<name>-mask.png` for the
branding mask (no number-box file any more — the route number is a
fixed placement the renderer applies to every badge, see above).
**Named by the livery's own name, not its numeric id** (corrected
2026-10-18) — a livery's id is only ever assigned once it's actually
created in a given save, so it isn't a stable, predictable key for a
shipped asset the way the name is; the renderer matches on name instead.
37 real badges are already in place as of 2026-10-18 (Lothian, SPT,
Stagecoach's own variants, Citylink, Airlink 100, the training and
island/remote liveries, and more) — masks still outstanding.

## 5. Liveries

Liveries are **cosmetic only**.

- A **per-depot-group default**.
- **One-off vehicle liveries** are possible.

### Starting livery
New and starting buses default to **plain white with the route number
perfectly centred** — unless the starting depot group is in an area with a
council-assigned livery already established (SPT, or any of the island
liveries in `DESIGN.md` §10's island and remote-area review), in which case
buses use **that** livery instead of plain white.

### Branded routes
A livery has up to **two branding regions**, a primary and a secondary, marked by
the mask above. Their colours **default to the route colour** and can be
overridden.

This gives sub-categories rather than separate liveries: the operator's standard
livery with a purple flash and the same livery with an orange one are the same
asset with different branding colours, applied to specific vehicles.

**Data side built 2026-11-07 (T153)** — a route can now be assigned a livery
and opt into tinting its mask with the route's own `colour` instead of that
livery's plain default (`routes.assigned_livery_id`/`use_branded_colour`,
set from the route editor's own "Branding" section, "locks still apply" —
only a livery already valid for that route's depot group/type is offered).
The actual mask-tinted badge render is still not built at all (the mask
files themselves don't exist in code yet, confirmed earlier this session) —
this is the data side only, the deliberate first step.

**A second, separate branding region confirmed 2026-11-07 (T154)** —
distinct from the route-colour region above, not overriding it: each depot
group now has its own stored `colour` (`depot_groups.colour`, a plain colour
picker in the Depot groups panel), earmarked for a **second** mask region on
the **Sightseeing livery specifically**, for now — e.g. a shared Sightseeing
base pattern with a different accent per depot group's own fleet. Scoped
narrower than it might sound: not a general per-depot-group tint for every
livery, just this one case, by the player's own choice. Same honesty
pattern as above — no mask-tinting renderer exists in code at all yet, so
this is the data side only.

### Repainting
Repainting is deliberately expensive and slow.

| Vehicle | Full repaint |
|---|---|
| Small bus (40,000 range) | £1,500 |
| Single deck | £2,000 |
| Double deck, single deck coach | £2,500 |
| Double deck coach | £3,000 |

- **2% discount per additional vehicle** in an order, capped at 10%.
- A **simple repaint** — switching to or from route branding — costs **a third**
  of a full repaint, takes **1–2 days**, and is done **at the main depot** in the
  area.
- A **full repaint takes 5 days**, counting **Monday to Friday only**; weekends do
  not count.
- Only **two vehicles per depot group** may be away at once, though several can be
  booked in one order and swapped in as each finishes.

**Where.** Full repaints are all carried out at **Ferrymill Motors**, Torrance,
Glasgow. The vehicle is **driven there and back** — dead mileage
and a driver each way. Ferrymill will collect and deliver instead, at **1.3x** what
using your own driver would cost, the same shape as the dealer delivering a new
bus when nobody is free.

Because Ferrymill is a fixed point, geography matters: a Highland operator pays
considerably more for the same paint than a Glasgow one. And the two-at-a-time cap
makes rebranding a twenty-vehicle fleet a ten-week programme rather than a cheque,
so it is a commitment rather than a whim.

### Livery requirements on routes
A route carries a **list of acceptable liveries**, and whether that list is
**strict is set per route**. The requirement lives **on the route** and is
enforced **through the duty filter**, alongside the vehicle type filter — so a
duty on a strict route only draws from vehicles that are both the right type and
an acceptable livery.

**A journey is never dropped over paintwork.** Where no correctly liveried vehicle
is free, the game **warns** — once in advance when duties are allocated, and again
as a runout alert — and the **controller decides**, with their competence
governing how well it goes.

So strictness means: **strict** warns and puts the decision in front of you;
**non-strict** substitutes quietly. Running the wrong livery costs reputation
**only on branded routes**, which keeps liveries cosmetic by default and gives
"branded route" a meaning beyond appearance — a route you have chosen to hold to a
standard, and which costs you when you cannot.
- **Route-branded defaults** — a simple livery carrying just the route number and
  destinations — as a lighter alternative to a fully custom route livery. The
  branding text is generated automatically from the route, with manual override.

Real operators' liveries are used directly. They are trade dress, so liveries are
held in an **editable data file** rather than in code, making it a file edit to
swap them for inspired-by versions if the project is ever published. Since a livery is
one small image and two colours, that swap is trivial.

Each livery is a badge image plus its two colours, as specified in §4. New
liveries are added by supplying a new badge.

### National Express Scottish (T190, 2026-11-14)
Three National Express liveries exist: plain **National Express**, **National
Express Local**, and **National Express Scottish**. The rule, confirmed
directly: **any National Express livery can run to Scotland, but the
Scottish one can only run to/from Scotland.**

- Plain National Express and National Express Local are **unrestricted by
  route destination** — the only geography either carries is National
  Express's own existing England/Wales depot-region lock (it can't be bought
  from a Scottish depot group at all; National Express Local carries no
  depot-region lock either).
- National Express Scottish carries **no depot-region lock of its own** —
  deliberately, since locking it to England/Wales depots would contradict
  "runs to/from Scotland." Instead it requires a **real route terminus
  inside Scotland**: at least one of the route's two endpoints (not every
  intermediate stop) must fall inside Scotland's real political border.
- That check is against a **genuinely separate real boundary artefact**
  (`scotland_boundary.bin`, built from Geofabrik's own `scotland.poly`
  region file), not the pipeline's existing extract-clip boundary
  (`extract-boundary.poly`), which is deliberately extended south into
  England (the hand-drawn Carlisle/Berwick corridor) to capture the border
  strip for the road-graph extract — using that one for a "is this really
  in Scotland" check would wrongly pass Carlisle, Berwick-upon-Tweed and
  Newcastle.
- A missing/failed boundary load (e.g. the artefact not yet downloaded)
  fails **open**: the restriction simply doesn't block anything rather than
  crashing, matching this game's "no known limit" convention elsewhere.

**Flagged, not built:** a duty-manager preference — when assigning a bus to
a Scotland-bound National Express working, prefer a National Express
Scottish vehicle over a plain National Express one if both are eligible.
There is no vehicle-to-duty assignment mechanism in this game yet (a `Duty`
carries no vehicle field, and no "morning assignment" process exists), so
this is recorded here as a requirement for whenever that system is built,
not implemented now. See OPEN-ITEMS.md.

### National Express Welsh (2026-11-15)
A fourth National Express livery, added at the user's own direct
instruction: **follows all the same rules as National Express Scottish
above, with Wales substituted for Scotland throughout.** No depot-region
lock of its own; requires a real route terminus inside Wales (checked
against a genuinely separate `wales_boundary.bin` artefact, built from
Geofabrik's own `wales.poly` region file, same fail-open convention on a
missing/failed load). Colours sampled directly from the real supplied
badge artwork: body `#f1f0f0`, dragon/accent `#c8102e`.

### TaithCymru and TrawsCymru (2026-11-19)
TaithCymru is a real Welsh long-distance coach operator, swapped in for
MegaBus's old Wales-only role at the user's own direct instruction: "swap
Megabus for TaithCymru in Wales as that's the actual operator in Wales,
Megabus will still be kept with no restrictions on use apart from coaches
and long distance routes." A standalone operator in its own right (not a
National Express sub-brand), coach-only vehicle lock, long-distance route
type. Colours are this model's own read of the real supplied vehicle
photo (no standalone badge PNG given): body `#111111`, ring-and-bars logo
`#00a551`.

**Nation lock, revised same day.** Originally given the same
terminus-only rule as National Express Welsh, then corrected by the user
directly: "TaithCymru should only operate routes that are 85% or more in
Wales, otherwise it should be National Express." A real distance-weighted
fraction of the whole route's length against the `wales_boundary.bin`
boundary (each segment's own midpoint decides whether that segment counts
as "in Wales," a flagged approximation rather than a true polygon
intersection) — not just the two endpoints. No separate fallback logic
was needed for "otherwise it should be National Express": plain National
Express has no Wales-specific restriction of its own, so it's already the
next available long-distance choice the moment TaithCymru's own 85% gate
blocks it.

**TrawsCymru**, added the same day — the real LOCAL Welsh bus operator
(Transport for Wales's own regional network), genuinely distinct from
TaithCymru's long-distance coach role: "let's use TrawsCymru as the local
operator that is used in Wales." Standalone operator, `local_night` route
type (no coach-only lock), same terminus-only Wales nation lock as
National Express Welsh (not TaithCymru's stricter 85% rule — a local
route is far less likely to clip through Wales at one end only the way a
long-distance coach route can; an inferred choice, not explicitly
confirmed). Colours are this model's own read of real-world descriptions
of TrawsCymru's branding ("green, white and red" is the traditional
palette per a secondhand forum report, not a confirmed hex) rather than a
sampled badge PNG: body `#00693e`, `#ffffff`.

MegaBus's own former England/Wales nation lock is removed as part of the
same change — it now has no nation/area lock at all, usable from any
depot group, keeping only its existing coach-only vehicle lock and
long-distance-only route-type note.

---

## 6. Staff

### Common rules
Every role has a score. Drivers use five levels; everyone else uses four:
**trainee, novice, competent, professional**. Score affects how well the role is
performed.

### Wages
With around 25 distinct roles, setting each one's wage individually would be
tedious to manage — so wages work off **one base wage plus a fixed ratio per
role**, not an independently settable figure for each.

**The base is the professional driver's wage, at 1.00.** Every other role is a
ratio of it. There is **no individual override** — the ratio is the only control
— but **bulk pay-adjustment tools** exist both **company-wide** and **per depot
group**, so a wholesale rise or a struggling group's pay cut is one action rather
than editing every line.

**Base figure, confirmed 2026-11-06: £16.30/hour** — the real ONS ASHE 2025
median for UK bus/coach drivers (≈£33,950/year at a 40-hour week), the same
"use a real published figure, not a guess" approach already applied to the
fare model (DESIGN.md §9). Every ratio in the table below multiplies this.

| Role | Ratio |
|---|---|
| Cleaner | 0.65 |
| Shunter | 0.65 |
| Fitter | 0.70 |
| Travel centre staff | 0.70 |
| Stance assistant | 0.70 |
| Storekeeper | 0.75 |
| Trainee driver | 0.75 |
| Novice driver | 0.88 |
| Competent driver | 0.93 |
| **Professional driver** | **1.00 — the base** |
| Technician | 0.95 |
| Relief controller | 1.05 |
| Marketing assistant | 1.05 |
| Commercial assistant | 1.05 |
| Driving instructor | 1.10 |
| Controller | 1.15 |
| Revenue inspector | 1.25 |
| Engineer | 1.35 |
| Workshop manager | 1.50 |
| Store manager | 1.55 |
| Marketing manager | 1.55 |
| Commercial manager | 1.55 |
| Depot manager | 1.60 |
| Operations manager | 1.65 |
| Stores director | 2.00 |
| Marketing director | 2.00 |
| Commercial director | 2.00 |
| Operations director | 2.20 |

**Fleet elite** is a flat **£20/month** top-up on top of the professional
driver's wage, kept as an absolute bonus rather than folded into the ratio, since
it's a small number of drivers rather than a whole role.

**Casual roles are outside the ratio system entirely** — tour guides are paid
per tour or per hour worked, since a ratio implies a standing wage they don't
have.

Every employee has a tracked **driving licence and type**: normal (cars and
vans), PSV (buses and coaches), or HGV (recovery unit). Engineers can be sent
through the training school for a PSV licence so they can take buses for
maintenance and MOTs.

### Recruitment
A pool of applicants near each depot, of varying quality. **Advertising** can be
bought with a monthly budget; more spend, bigger pool.

### Shunters
Fuel and charge vehicles as they arrive at the depot in the evening. **Paid the
same as a cleaner**, but subject to the general staffing cap like most other
roles — pay level and headcount cap are independent decisions.

Work the hours when buses are mostly arriving — evenings. **Large depots must
have a shunter 7 days a week**: one full-time Monday to Friday, one part-time at
weekends. **Fitters cover shunter holidays.**

Where there is no shunter, **controllers fuel in the morning** and **drivers
plug in electric vehicles themselves** at the end of their shift. At a **remote**
depot the controller does this as buses arrive at the end of the day, since
remote depots don't get a shunter at all.

Recruited externally or promoted from cleaners. Can go on to become a **fitter or
a driver**.

### Unlock conditions
Roles become available as the company grows, so the opening scenario never shows
an org chart it can't fill.

| Role | Available when |
|---|---|
| Drivers, cleaners, relief controllers | From the first depot |
| Fitters | From the first depot |
| Shunters | At a depot with fuelling facilities |
| Storekeepers | With the fleet — 1 under 30 buses, 2 at 30 or more |
| Marketing assistant | From the first depot group |
| Commercial assistant | At 10 routes in a depot group |
| Commercial manager | At 2 depots in a region |
| Commercial director | At 4 depots company-wide |
| Driving instructor | On owning a training bus |
| Engineers and technicians | On building maintenance facilities |
| Stance assistants, other bus station staff | Where the station has staff facilities |
| Controllers | At 5 routes, when the council's free cover ends |
| Revenue inspectors | At 10 routes in a depot group |
| Workshop manager | At 3 engineers in a depot, technicians counting as half |
| Depot manager | At 15 staff in a depot |
| Store, operations and marketing managers | At 2 depots in that region |
| Stores director | At 4 depots company-wide |
| Marketing director | At 4 depots company-wide |
| Operations director | At 6 depots company-wide |
| Travel centre staff | On building a travel centre |
| Tour guides | On creating a tour route |

Relief controllers unlock separately: only once weekend or evening service runs,
and they are **never** covered by the council's free controllers.

### Discipline
Every employee carries a single **warning count**. For drivers it accumulates
from accidents, running early and repeated sickness together; for other roles
from sickness, poor work and repeated mistakes. One count rather than three
means a broadly unreliable employee is caught where separate thresholds would
miss them.

**Dismissal follows 3 warnings, the same number for every role.**

The player is **warned before any dismissal**. Warnings **fade over time** if
behaviour improves.

### Promotion and vacancy chains
Four roles are filled by promotion:

| Role | Comes from | Keeps old job? |
|---|---|---|
| Driving instructor | Drivers | Yes |
| Relief controller | Drivers | Yes — drives weekday afternoons |
| Controller | Relief controllers | No |
| Revenue inspector | Any role | No |
| Operations manager (region) | Controllers, depot managers | No |
| Operations director (company) | Operations managers | No |
| Fitter | Any role, or hired externally | — entry role |
| Shunter | Cleaners, or hired externally | — entry-adjacent |
| Technician | Fitters only | No |
| Engineer | Technicians only | No |
| Workshop manager | Engineers | Yes |
| Storekeeper | Any role | — entry role |
| Store manager (region) | Storekeepers only | Covers vacancies only |
| Stores director (company) | Store managers | No |
| Marketing assistant | Hired externally | — entry role |
| Marketing manager (region) | Marketing assistants | No |
| Marketing director (company) | Marketing managers | No |
| Commercial assistant | Controllers, bus drivers, or hired externally (less experienced) | No |
| Commercial manager (region) | Commercial assistants | No |
| Commercial director (company) | Commercial managers | No |
| Depot manager | Controllers, workshop managers, store managers | Yes |
| Tour guide | Travel centre staff, external | Casual |
| Store manager | Storekeepers only | No — one for the whole company |
| Managing director (region, plus one for long distance) | Any role with "manager" in its job title | No |

Cleaners can move into storekeeper, engineer, driver or shunter roles. Shunters
can go on to fitter or driver. Travel centre staff can be promoted into driving
and controlling.

**Process.** The player opens an application to employees. Two days later it
closes and a list of applicants is shown to choose from. Promotion requires time
served as well as score. Promoted staff **start at novice with credit for
experience**.

If there is nobody to backfill the promoted person, the player can either move
them straight away or **contract in** until the old job is filled. This trickles
down until the bottom of the chain is filled — so a new controller can be delayed
while a new driver is trained. **Build this as a chain, not a single swap.**

Employees from other depots can apply. From another area, a **£1,000 relocation
fee** is paid to them.

All four promoted roles can be **contracted in** until filled, costing more than
promoting.

### Managing director
A tier above the existing per-function regional managers (store, operations,
marketing) — **one per region, plus one for long distance** — sitting
alongside them rather than replacing any of them.

Eligible for promotion: **any role with "manager" in its job title**, a
simple naming rule rather than a curated list of eligible posts. Their skill
gives a **multiplier on the performance of every staff member in that
region**, across every function, not just their own.

**Long distance has its own dedicated management team**, staffed by hiring
from regional management teams rather than the operations director alone
running it single-handed.

### Staffing caps
Every role except **cleaners, drivers and engineers** has a maximum headcount, so
the player cannot over-hire into it. Caps are set per depot, per group or per
region, whichever level fits the role; company-level roles are already capped at
one per company and need nothing further.

| Role | Cap |
|---|---|
| Storekeepers | 1 under 30 buses, 2 at 30 or more |
| Shunters | Same general cap as most roles — not exempt like cleaners despite matching their pay |
| Technicians | 2 per engineer |
| Fitters | 1 per technician |
| Controllers | 3 per depot (they work Monday–Friday only; weekends are relief controllers) |
| Revenue inspectors | 1 per 20 services run per day in the depot group |
| Relief controllers | 3 per depot |
| Bus station roles (stance assistant, travel centre staff, non-24/7 controllers) | 4 per station |
| Workshop manager, depot manager, driving instructors, store/operations/marketing managers, all directors | No separate cap — already fixed by their own rule |
| Tour guides | Uncapped, casual |

The bus station figure of 4, and the controller figure of 3, both follow from
covering the role's actual working week on a normal 5-day contract — see §9a for
the worked reasoning.

---

## 7. Drivers

### Three routes in

1. **Trained in-house** — one week per driver. Needs a paid driving instructor
   and an owned training bus. Two trainees per bus, one instructor per bus. The
   training bus runs Monday–Friday 0800–1700, visibly leaving the main depot and
   driving the local area, returning to the depot for a break mid-day. A bus is
   **out of service while flagged as a training bus**. Trainees can be sent to
   another main depot, costing travel time and accommodation like a loan.
   Training starts on the next Monday.
2. **Qualified drivers** — 10–20% of the applicant pool. Require a starting bonus
   of **1.5x the cost of training**, and can start two days later.
3. **External training school** — **2.5x the cost of training in-house**, and
   they start on the second Monday after hiring. Useful early on and when opening
   a big new route.

### Driver score

| Level | Pay | Notes |
|---|---|---|
| Trainee | 25% below professional | Paid during training |
| Novice | 12% below | On completing training |
| Competent | 7% below | |
| Professional | Base rate | Reached in about 3 months |
| Fleet elite | Base rate + £20 per month | Only 10–15% of drivers reach it |

Progression to professional varies with hours worked — 40 hours a week is the
baseline — plus a slight per-driver variable so they progress at different
speeds. Fleet elite takes a further 2–3 months after professional.

Fleet elite pays **£20 at the end of each full month** after gaining the status,
shown in finances as *fleet elite payments*. The badge on the driver settings
page advances green, silver, gold, then elite (gold with wings), one level at the
end of each full month.

**Traits:** experience, reliability, friendliness. **Happiness** is separate,
raised by things like premium driver seats. A higher score, friendliness and
happiness all mean better service to passengers.

### Rotas

A rota is a set of **lines**, each one week long. It is either **rotating** —
everyone moves down a line each week, so a twelve-line rota takes twelve weeks to
come round and everyone shares the early starts — or **fixed**, where each driver
keeps the same week permanently. Chosen per rota.

**Rota types** — full time, part time, night, EU work, outstation. The type is not
just a label: it sets which shift bands the rota may use, what overtime a driver
on it can be asked to work, and the pay rules.

Rotas are renamable and a depot has as many as it needs. Outstation rotas nest
inside their main depot's; small depots have their own entirely.

**Cells and bands.** Each cell holds a shift band:

| Role | Bands |
|---|---|
| Drivers | Early, Middle, Late, Night |
| Engineers, controllers | Night 2200–0700, Day 0600–1500, Late 1400–2300 |
| Cleaners | Two of the three above |

Non-driving bands are a fixed nine hours and tile the day with an hour of overlap
at each changeover, so there is a handover rather than a hard switch.

**Rest.** Any cell left unfilled is rest — you do not mark it — and it counts
towards legal rest. A four-day line is simply a line with three unfilled days.

**Spares.** A cell can be marked **spare within a band**, so a spare early is a
different thing from a spare night and cover matches the shape of the absence. The
**spare pool fills any line left empty**, so rota size and headcount need not
match — a rota can be built before everyone is hired and degrades rather than
breaking.

**From band to duty.** The rota says a driver is on an early; the **controller
allocates the actual duty on the day**.

**The screen** is a grid, lines down and days across, with a **count of unassigned
duties by type** and an **auto-fill button** that places any duty not yet on a
rota, using the same lowest-cost objective as duty auto-complete.

**Changes** need **5 days'** notice before they take effect — the same lead time as a route path or timetable change.

Drivers are hired onto a specific rota and **move between rotas only by
request** — a small chance when a new line is added, and a smaller chance for
four-day drivers to move to five-day when a slot opens.

### Duty limits and driver wellbeing
- Duties are capped at **11 hours** total length, sign-on to sign-off, aiming for
  10. **EU work** may run to **12 hours**, also aiming for 10. These measure duty
  length including breaks, not driving time, so a split shift with a long unpaid
  break burns the same allowance as a solid one.
- Drivers are annoyed by working **more than six days in a row** without a day
  off, measured over two weeks; for four-day drivers the limit is five.
- Annoyance drops **happiness**, and sustained annoyance can make a driver leave.
  Happiness otherwise drives the quality of service they give passengers.

### Pay floors
- Anyone on a **five-day week is paid a minimum 39 hours**, per week with no
  averaging, whether or not they are scheduled that much.
- Fewer contracted days pay that floor **pro rata** — four days pays four fifths.
- **Casual staff**, such as tour guides, are paid only for hours actually
  worked.
- The floor applies to **drivers only**.

An under-filled line therefore costs real money that same week, which gives duty
building a purpose beyond legality.

### Holiday and sickness
Both are **paid**. Drivers request holiday and **controllers approve it** — a less
experienced controller causes more problems. No more than **10% of staff in a
role** may be on holiday at once; a poor controller can let it reach 12%, a good
one never will. The **workshop manager** handles holiday for engineers and
cleaners.

Unreliable drivers go sick more often. When absences outrun the spares the
controller asks for **overtime**, and a better controller causes fewer delays.

Sizing the spare pool is a real decision: too few and a bad week cancels journeys,
too many and you are paying people to sit at the depot.

### Festive pay
Confirmed 2026-11-06, tied to the five festive day types (DESIGN.md §7
"Structure"). Staff who actually work one of these days are paid an
enhanced rate on top of normal pay:

- **Christmas Eve: triple time (3x).**
- **Christmas Day: triple time (3x)** — same rate as Christmas Eve. Only
  pays out at all in Greater London and Greater Manchester, the only two
  places that run any service that day; nowhere else needs staff on
  Christmas Day since nothing runs.
- **Boxing Day, New Year's Eve, New Year's Day and 2 January: double time
  (2x)** — the same rate already used elsewhere for remote-depot engineer
  away-work (§9a) and small-depot Saturday installs (TICKETING.md §3).
- Applies to **any staff role actually rostered and working that day** —
  drivers, engineers, controllers, cleaners and so on — not restricted to
  drivers the way the 39-hour pay floor above is.
- It's for **hours actually worked**, same principle as casual pay above —
  being contracted to a rota that happens to include a festive day doesn't
  by itself trigger it if the shift isn't worked.

### Duties
Buses are assigned a **duty**. Each day a vehicle is chosen at random to work it,
filtered by vehicle type — double deck, single deck, coach or minibus.

**Day classes:** Monday–Friday as one, Saturday and Sunday each separate. Where a
council contract runs on specific days only, the duties covering those services
need two variations while the rest stay the same.

**Building duties:**
- Services can be manually linked and locked to build chains by hand.
- A button auto-completes the rest, optimising for **lowest cost to run**.
- Whole duties can be locked so the automatic system will not change them.
- **Return journeys are always chained automatically** — never with dead running
  after them, never onto a different route, unless changed by hand.

### Drivers' hours
Enforced, not advisory. **GB domestic rules** for local routes, **retained EU
rules** for InterCity. The regime follows the route type (`DESIGN.md` §6).

A duty mixing local and InterCity work falls under the **stricter regime for the
whole duty**. Duty validation must account for this.

The two rule sets are genuinely different — get the actual rules right before
building validation, because every duty depends on them.

### Relief and staff movement
Drivers physically exist and must be present to take over a bus.

- **Swap points** are set by the player in the duty. Depots and bus stations are
  automatically swap points and cannot be deselected; anywhere else must be
  marked as a relief point.
- **Staff cars** — bought per depot, kept at depots or bus stations, used to move
  drivers to relief points. Available in diesel and electric.
- Drivers can **walk** between timing points, bus stations and depots to take a
  break or start and finish their day.
- **Staff buses** can run in the mornings between bus stations and depots.

If a relief driver will not reach the swap point in time, the player gets a
warning in advance.

On long-distance routes drivers swap with drivers from other depots to stay
legal — an Inverness driver breaks at Perth while a Perth driver continues to
Edinburgh.

### Overtime and loans
- **Overtime** at any local depot, paid at a **flat 20% above the normal
  wage**, the same rate for every role, set by the game rather than by the
  player. Extra travel is charged per
  mile on the shortest route from the home depot. Minimum one shift.

  Overtime is the short-term pressure valve — it covers a new route before staff
  are hired, or a shift left open by a driver away on a multi-day tour. It is
  deliberately not viable as a long-term substitute for hiring, being limited by
  **legal hours** and by a **per-driver willingness limit**: some drivers will
  take far more of it than others, and none will take it indefinitely.
- **Loans** to another depot are longer term and cost accommodation and expenses.
  One day of travel out and one back, both paid. Depots can automatically request
  loan drivers; the player chooses whether to offer it, drivers apply, and the
  player selects who goes.

---

## 8. Controllers

A controller **fixes small things automatically and alerts the player on big
ones**. When a bus is off the road at runout, the controller assigns a
replacement — a more competent one does it quicker and picks a more suitable bus.
Controller competence also governs whether stand changes are announced properly.

**Numbers scale with active fleet and operating hours.** Controllers work 9-hour
days covering the hours buses run: a small fleet running 0900–1700 needs one;
0600–2100 needs two overlapping in the middle; 24-hour operation needs three.

Main controllers work Monday–Friday. **Relief controllers** work five days a
week — controlling at weekends and mornings, driving weekday afternoons — and
have a controller area on the rota.

Controllers are based at bus stations, except one at the depot each morning for
the runout period, who drives for the rest of the shift.

---

## 8a. Revenue inspectors

One rung above controller. Promoted from any role — an entry point into this
part of the ladder the same way fitter and storekeeper are for engineering and
stores — and assigned to a **depot group**, roaming within it automatically
rather than being tied to one depot or route.

A fixed small percentage of passengers always evade the fare. An inspector
**catches evaders based on their own skill** — a better inspector catches more
of that fixed evading population, not fewer people evading in the first place.
Caught evaders are fined a **multiple of the fare they owed**, the same shape
as a real penalty fare. Evasion has **no reputation effect** — it is revenue
recovery, not a service-quality measure.

The number of inspectors a depot group can carry is capped at **1 per 20
services run per day** in that group — tuned so inspectors don't cost more than
they recover, but evasion isn't left mostly uncaught either. The role unlocks
at **10 routes** in a depot group.

---

## 8b. Operations managers and directors

Above controllers sit two more tiers, mirroring stores.

**Operations manager — one per region.** Handles punctuality across the region,
cross-depot driver loans, disruption and early running, and **approving route
and timetable changes** — approval is automatic, and their skill only affects
how quickly it happens, so a good one shortens the lead times.

**Timetable optimising and frequency suggestion moved to the commercial
team (§13a), 2026-10-30** — the operations manager no longer does this at
all; disruption and early running are what's left of their own hands-on
timetable work.

**Operations director — one for the company.** Negotiates **better council
contract terms** and sets company-wide service standards. They also optimise
**stand allocation** at bus stations, sell vehicles at a better price the more
skilled they are, run **cascades**, and negotiate **charger hire** contracts with
outside companies.

Their own optimisation work (stand allocation, cascades) still only acts when a
route is created or modified, and takes effect on the **Monday of every
even-numbered week** — fortnightly — with anything decided after a changeover
batching into the next one, so the timetable doesn't shift under the player
daily. The commercial team's own timetable retiming (§13a) follows the same
fortnightly batching, for the same reason.

## 9. Engineering and maintenance

### Fitters
The true entry role in engineering — **all external and cross-role recruitment
into engineering enters at fitter**; nobody joins directly as a technician or
engineer. They handle **basic servicing only** — no inspections, no breakdowns.
Recruited from any role, the same as technicians used to be.

**Fitters can be promoted into technician**, at a **1:1 ratio** — one fitter
supported per technician.

### Technicians
Paid about **30% less than an engineer**. They handle **routine servicing,
inspections and breakdowns**, but not major repairs, and are the **preferred
people for driving vehicles on engineering business** — Volvo runs, MOTs,
collecting new vehicles.

They need a **PSV licence** for that, gained either by having been a driver or
through the same training routes drivers use. Engineering staff can be trained
in house, not only externally.

**Only technicians can become engineers.** They count as **half** towards the
three engineers a workshop manager needs. Technicians are capped at a **2:1
ratio** to engineers.

### Engineers
The player chooses how many a depot needs, with a **rough estimate shown**.

**Opening a new engineering department.** Since recruitment only enters at
fitter, a depot with no engineering history yet has nobody qualified. The player
either hires **relocating staff**, or brings in a **contract employee** — used
when starting the first engineering department, or when no other depot has more
than two engineers to spare. A contract employee stays until either a homegrown
technician is ready to replace them, or a depot with spare capacity **sends
someone on loan**.

**Loan limits.** No depot can have more than **one engineer on loan** at a time,
and no depot can be left with **fewer than two engineers** after sending one out.
A loaned engineer **automatically leaves** once a homegrown technician at that
depot is ready for promotion to engineer; where several are ready at once, **time
served** decides who gets it.

**Cascading promotion.** When an engineer leaves or is promoted, everyone below
cascades up a level if they're at a high enough standard — but only where there's
someone available to fill the vacancy that creates further down. The bar for a
cascade is **stricter than a normal promotion**, since it happens automatically
all at once. The player only sees it if the chain **stalls partway** — a clean
cascade happens silently.

### Workshop manager
Builds the depot **work list** that engineers pull from. Higher competence gives
better job ordering and **spots faults before they become breakdowns**.

**Servicing schedule.** A vehicle needs a service every **28 days**, and can
run up to **35 days** before one — beyond 35 days it can't be driven in
service at all. When new vehicles join the fleet, the workshop manager
**staggers their service dates** (some early, some late) so the 28-day cycle
stays evenly spread rather than bunching, applying the same principle to
MOTs.

### Stores — storekeepers
One storekeeper up to 25 buses in a depot, two above that. **Without stores staff
the engineers cannot work.**

Stores order parts automatically based on the fleet. Higher competence means
earlier reordering, less excess stock, and faster arrival of parts ordered in for
a breakdown.

**Finance breakdown.** Parts spending shows in the finance menu **grouped into
a few broad categories** (e.g. brakes, engine/drivetrain, electrical,
bodywork, tyres) rather than one lump "parts" line, so the player can see
where the money is actually going.

Each depot holds **parts stock**, shown on the finance screen — too much is wasted
money, too little leaves buses waiting.

**Part categories map to the maintenance job types**, so a brake job stalls for
brake parts specifically. A shortage is diagnosable rather than a generic "no
parts".

**Transfers between depots** in the same group happen automatically, run by the
storekeepers.

**Obsolete stock.** When a vehicle type leaves the fleet its parts become
obsolete. They can be transferred to another depot that still runs the type; if
none can take them, they are **scrapped and the money is lost**. Retiring a type
therefore has a tail, which reinforces standardising a fleet in the same way the
manufacturer bulk discount does at purchase.

There are **no warranties on vehicles themselves** — but **parts do carry
warranties**, and storekeepers handle the claims, reclaiming money for defective
parts. Their skill decides **how quickly and efficiently** claims are settled, and
**whether they chase every claim or only some** — so a poor storekeeper quietly
leaves money uncollected rather than failing visibly.

A better storekeeper holds **less excess stock**; a worse one holds more, which is
company money sitting idle and should be visible on the finance screen rather than
buried.

Storekeepers also **transfer parts between depots automatically** when another
depot needs something urgently. Transfers within a depot group are free; transfers
to another group carry a **flat fee**.

### Store manager — one per region
Oversees the storekeepers in their region. A better one means better stock levels
and less money wasted on parts that aren't needed.

They cover a storekeeper post for **holiday and sickness with no effect on their
own performance**. Where a depot has **no storekeeper at all** they cover it
automatically — the player is warned — but take a **25% hit** to their manager
performance while doing so.

**Only storekeepers can apply.**

### Stores director — one for the company
The company-wide role, and a single point of leverage: one good appointment
improves parts costs everywhere at once.

They choose suppliers and negotiate **contracts for discounts that every
storekeeper then uses**, and separately negotiate **cheaper diesel and
electricity for each region**, with bigger discounts the more buses the company
runs. Contracts are **time-limited and renegotiated periodically**. If the post is
vacant, existing contracts **run until they expire** and are not replaced.

Competence affects the **size of the discounts**, **supplier lead times**, and
**spotting shortages before they bite**.

**Only store managers can apply**, which completes the ladder: cleaners and
drivers into stores, storekeeper to store manager to stores director.

### Obsolete stock
When a vehicle type leaves the fleet its parts become obsolete. They can be
transferred to another depot that still runs the type; if none can take them they
are **scrapped and the money lost**. Retiring a type therefore has a tail, which
reinforces standardising a fleet in the same way the manufacturer bulk discount
does at purchase.

### Job types
Scheduled service, repairs, safety inspections at fixed intervals, vehicle
upgrades, and an **annual test the bus can fail**. Failing puts the bus off the
road until fixed, with a big repair bill — no fine, no reputation hit.

MOTs are done at external repair places for a **£150 fee**.

### External maintenance and the dealer network
Two distinct external businesses, not one generic category.

**Ferrymill** is for **repaints only** (`OPERATIONS.md` §5). Its location:
Torrance, Glasgow.

**Volvo is the one universal servicing business** — maintenance, MOTs and parts
collection, for **every vehicle regardless of manufacturer**. It is not merely
preferred, it is the only place this work is done, at **8 locations**: Inverness,
Aberdeen, Perth, Edinburgh (Broxburn), Glasgow, Glasgow East (Hamilton), Ayr and
Carlisle. Before a depot has its own facility, servicing goes to Volvo instead, at
**2x** what the same work would cost at the home depot — both to push the player
towards building facilities and as a way to clear a backlog.

Each depot has a **fixed route** to its assigned Volvo location, used for both
bus movements and van parts runs, and different Volvo branches can be used for
different kinds of work — not necessarily the same one for maintenance, MOT and
parts. **Every depot with facilities sends a van daily** to its Volvo for
routine parts collection, as a standing habit rather than only when something is
specifically ordered. This does not apply at remote depots, which use the parts
logistics chain in §9a instead.

**MOTs** cost **£150**, done at the assigned Volvo. At a **remote depot**, the
DVSA visits instead, at about **10% extra**, rather than the vehicle travelling
to a test centre.

**Island and remote-area MOT testing.** Island buses are tested at their **own
home depot** rather than sent away, but the +10% above covers the DVSA
tester's own travel there.

- Islands get MOT slots **once a day, once a month** — several buses may need
  to be off the road on that same single day.
- Islands in the same region get their slots **2 days apart** from each
  other — the same tester travels a circuit visiting several islands in
  sequence.
- The same once-a-month, 2-days-apart pattern applies to remote **mainland**
  areas too (Fort William, Caithness, Oban, Ullapool, Campbeltown,
  Galashiels) — not island-specific.
- **Exception: Shetland** has its own dedicated testers, not part of the
  travelling circuit, so gets **2 days a week** instead of once a month.
- Ordinary mainland depots (near a Volvo location) can be tested any weekday.
  Island and remote-area testing **also only ever happens Monday to
  Friday** — no weekend testing anywhere in the game.
- MOTs are spread **evenly across the year**, the same spreading principle
  used for the 28-day service cycle (§9, workshop manager staggering),
  applied to the MOT's own annual cycle instead.

**Missing a slot.** Miss the monthly slot and it's a full month's wait for the
next one — no shorter grace period, no way to request an extra visit. A
lapsed MOT from this scheduling constraint carries **no fine**: the bus
simply can't run until tested. This is deliberately different from the
general warning/fine pattern used everywhere else — a genuinely unavoidable
geographic constraint, not something to punish.

**Buying new vehicles** is the only thing split by manufacturer, between two
dealer networks:

| Manufacturer | Dealer | Locations |
|---|---|---|
| Volvo | Volvo | The same 8 locations above; has fixed routes |
| Alexander Dennis | Alexander Dennis | 1 location, near Falkirk |
| Mercedes-Benz / EVM | Western Commercial | 4 locations: Dundee, Edinburgh (Broxburn), Bellshill, Glasgow |
| Wrightbus | *(no dealer)* | Collected from whichever depot is nearest Stranraer by road |
| Yutong | *(no dealer)* | Collected from whichever depot is nearest Newcastle upon Tyne by road |

Only Volvo has **fixed routes** to depots. Alexander Dennis and Western
Commercial each cover several depots from one location, so the game **works out
the best route each time** rather than a route being pre-planned.

**Cars and vans** (Ford, Skoda, Vauxhall, and the Mercedes crew van) are simply
**delivered to the depot that ordered them** — no dealer location or collection
needed. Only buses and coaches use the collection model above.

### Breakdowns
Likelihood depends on **vehicle age and engineering team quality**, with
**engineering quality weighted more heavily** — a well-run engineering team
keeps an older fleet reliable, while a poor one makes even young buses break
down more than they should.

**Engineering vans** — as many as the player wants, diesel or electric — attend
roadside breakdowns and either fix the vehicle there or recover it, depending on
the fault. With no van at the depot, a contractor recovers it at a cost.

Passengers on a broken-down bus get a **replacement bus sent to them**.

---

## 9a. Remote parts logistics

Ordinary depots supply themselves with a daily Volvo run (§9). A remote depot
often can't, so parts routing is planned explicitly, in its own menu separate
from bus routes.

### Van and bus legs
- **No van needed** where a service already visits a depot for a break, or to
  start or finish the day — parts travel with it directly.
- Where a long distance bus **doesn't call at a depot**, a van can meet the bus
  instead, at its **terminus only**, or at a **bus station** even mid-route. The
  van's departure time is worked out automatically from the bus's own timing —
  vans carrying parts have **no timetable** of their own.
- A route can have **multiple legs, van and bus mixed in any order** — the same
  shape as Shetland's van–flight–van, generalised. Where one leg doesn't finish at
  a depot, or a depot sits **between** a main depot and another remote one, it can
  receive parts and **forward them on**, relaying supply along a chain.
- Shown in the menu as **each leg listed separately**, pieced together by the
  player rather than as one merged journey.
- A **van leg is set up once and reused** by any parts route that needs it — an
  Inverness Depot–Inverness Bus Station leg can serve Portree, Thurso and Ullapool
  connections all off the same leg.
- A shared leg still runs **once per trip that needs it** — sharing a van across
  routes needs **staff at the bus station** to move parts between buses (see
  stance assistants, §11).
- Only **long distance bus routes** can share parts this way, to any depot in any
  region, provided staff exist at each bus station involved.
- **Engineering vans carry the parts.** While on a delivery, a van's icon swaps
  from a spanner to a **parcel** rather than carrying both. The storekeeper who
  arranged the run **drives it themselves** — a normal licence is enough, no PSV
  needed.

### Shetland and Orkney
Shetland is the one place with the flight-based pattern (`DESIGN.md` §1): a van
to the departure airport, the flight, a van from the arrival airport to the
depot. It still gets its parts supply from **Aberdeen**, with the same rule as
elsewhere: parts cost the same whichever leg carries them, only staff travel is
dearer by air.

Orkney (Thurso–Kirkwall) and every other ferry-reachable island use a **simple
direct ferry** — no van-at-each-end pattern.

---

## 10. Cleaners

Hired for depots to keep buses clean. Cleanliness affects passenger satisfaction.

Cleaners can be **hired directly** or **contracted in**. Contracting is quicker to
set up and dearer over time, and the contractor **automatically adjusts numbers
to fleet size**.

---

## 11. Travel centre staff and stance assistants

Both are bus station roles, introduced by the relevant upgrade, and both can
only be hired where the station has **staff facilities**.

**Travel centre staff.** Introduced by the travel centre upgrade. They sell
season tickets and speed up boarding by selling tickets off the bus. **One
minimum per travel centre**, more optional. Their score affects ticket sales and
speed. They can be promoted into driving and controlling.

**Stance assistants.** Work the stands, handling parts transfer between buses
(§9a) and helping customers. Standard skill score, affecting both speed and how
well customers are served. Recruited either externally or promoted from travel
centre staff.

### Bus station staffing pattern
Every bus station role (travel centre staff, stance assistants, and controllers
at a non-24/7 station) follows the same shift pattern:

- **Bands:** morning, day, evening. With 1 person, they work the day shift; with
  2, they split morning and evening; with 3, they spread across all three.
- **Cap:** **4** per role per station on weekdays, **falling to a smaller working
  pattern at weekends** — except controllers, who stay covered 24/7 at bigger
  depots. The 4 follows from covering 3 weekday shifts and 2 weekend shifts on a
  normal 5-day working week: 3×5 + 2×2 = 19 shift-days, and 19 ÷ 5 rounds up to 4.
- The same cap applies at **every** station with facilities, regardless of size.

---

## 12. Depot managers

**One per depot**, available at **15 staff**, promoted from controllers, workshop
managers or store managers — so a depot manager always comes from a role that
already understands the company, and taking one leaves a hole to backfill.

They oversee everyone at the depot, with their competence lifting every role
slightly, and handle **hiring and rota approval** — the player can always
override. They also work out **who collects new vehicles and when**, price **tour
bookings** (a more skilled manager secures a better price), and work out the
timings and staffing for tour routes.

## 13. Marketing

Three tiers, matching stores: a **marketing assistant** per depot group, a
**marketing manager** per region, and a **marketing director** for the company.
Assistants are hired externally; managers and directors are promoted from below.

They decide where the budget is best spent and **propose a budget the player
approves** — monthly, plus one-offs for new route launches.

**Only the marketing director can advertise long distance routes**, except where
such a route never leaves a region, in which case the marketing manager can.

Marketing must **never over-advertise**. A route already running full gains
nothing, so the budget stops helping once the network has no headroom and the
money is better spent on vehicles.

## 13a. Commercial team

Added 2026-10-30, taking over timetable optimising and frequency suggestion
from the operations manager (§8b) — that is now this team's main job, not a
side duty of operations. Looks after **destinations, timing points and
timetables**.

Three tiers, the same shape as marketing (§13): a **commercial assistant**
per depot group, a **commercial manager** per region, a **commercial
director** for the company. Pay ratios 1.05 / 1.55 / 2.00 — identical to
marketing's own three ratios (§6 "Wages").

**Unlock**: a depot group needs **10 routes** before it gets a commercial
assistant; a manager needs **2 depots in a region**; a director needs **4
depots company-wide**.

**Promotion**: managers are promoted from assistants, directors from
managers — the same shape as every other three-tier staff group. Assistants
themselves can be promoted from **controllers or bus drivers**, or **hired
externally** (less experienced than a promoted one).

**The player creates every timetable.** The commercial team only
**optimises** an existing one — retiming journeys to ease congestion without
changing any route's own frequency. **Any change to frequency, up or down,
needs the player's own approval** — the team can propose it, but never
applies it unilaterally. This mirrors the operations manager's own guard
rail (§8b, "leaves the timetable alone and tells the player" where it can't
solve congestion without breaking a locked constraint) — the commercial
team has the identical constraint, just for a different kind of change.

**Two more fixed guard rails, confirmed 2026-10-31 (T108) when
ferry-linked long-distance routes were being designed:**
- **A ferry connection time is a fixed anchor** the optimiser builds
  around, never retimes — the same "ferry locks" category CLAUDE.md's own
  hard-parts list already names, now with a concrete source: a route
  calling at a ferry terminal (DESIGN.md §1 "Islands and ferries") is
  timed against the real sailing, and the optimiser must never move that
  journey in a way that breaks the connection.
- **Skye's own real fixed-timetable services, and Route 398, must never
  be touched by the commercial-team optimiser at all** — they always run
  on their real, author-supplied timetables (UK-EXPANSION.md's Skye
  content), not a candidate for retiming the way an ordinary route is.

## 14. Tour guides

Casual staff paid **per tour**, hired externally or from travel centre staff.
Optional on a tour route rather than required — customers pay **an extra
percentage** when one is aboard, scaled by the guide's skill, and a guide's
**languages depend on their quality**.

Guides **cannot drive**, which makes them the only role that can't be folded into
driving duties. On multi-day tours their accommodation is needed alongside the
driver's and is added to the customer price.

## 15. Fuel and energy

Fuel and electricity are a **fixed price** per litre and per kWh — no market
movement. Prices vary by **region**: diesel is dearer in North Scotland,
electricity cheapest there.

**Running cost.** Electric and hydrogen vehicles cost **less than diesel** in
both maintenance and recharging/refuelling — a genuine ongoing saving, not
just an upfront price difference.

**Regional fuel discounts.** The **stores director** negotiates a discount
**per fuel type** — diesel, electricity, and hydrogen are three separate
discounts, not one blanket figure. Each scales independently with how many
vehicles of that specific fuel type the company runs: more diesel vehicles
grows the diesel discount, more electric vehicles grows the electric one,
more hydrogen vehicles grows the hydrogen one. A company standardised
heavily on one power type gets real leverage on that fuel specifically,
rather than fleet size alone doing the work.

Fuelling at the player's own depot is **cheaper**; fuelling on the road costs
more, which quietly disadvantages outstations since a bus parked at one cannot be
fuelled there.

**Chargers** have limited capacity and are bought as the fleet grows. Chargers
need no maintenance and do not wear out.

**Per-charger power sharing** (real figures, confirmed 2026-11-01, replacing
an earlier "two buses charging slowly, or one at 1.5x that speed"
placeholder): each charger unit is **200kW of hardware capacity**, but caps
a **single bus at 150kW**, not the full 200kW. With two buses plugged into
the same unit, the split is **dynamic, not a fixed 100/100** — each bus
draws whatever it can actually accept (see the SOC taper below), and the
charger always pushes its full available 200kW across both if there's
demand to absorb it. Two buses both still below 80% SOC genuinely do split
100kW/100kW, since neither is tapered yet. But once one of them crosses
80% and tapers down, the **other speeds up to take the freed capacity**
(up to its own 150kW single-bus cap) — and when one finishes outright, the
remaining bus gets the full 150kW. This is a property of one charger unit;
the separate depot-wide grid connection limit still applies on top of it
across every charger on site, below.

**Yutong through-charging** (confirmed 2026-11-01, restricted to
**Outstations, Tiny and Small depots only** — a Main depot's buses can't
use it). **Currently inert in-game** (T181, 2026-11-13): both Yutong
electric models (E10/E12, the Yutong coach) have been fully removed from
the catalogue — VEHICLE-SPECS.md §4 — so no vehicle exists that this
mechanic can ever apply to. Kept here as documented real-world reference,
not deleted, the same treatment as the dropped models themselves: Yutong's
electric models can be **plugged into each other**,
daisy-chaining up to
**4 vehicles** off a single charger connection, sharing that one charger's
power evenly between however many are chained in. The same dynamic
reallocation as the two-bus floor-charger case above applies, generalised
to the whole chain: while every chained bus is still below 80% SOC they
split the charger's output evenly between them (so 4 Yutongs share 50kW
each off one 200kW unit); as each one crosses 80% and tapers, its unused
share gets redistributed across whichever chained buses can still accept
it. The charger's own 150kW single-bus cap still applies to whichever
vehicle in the chain is, at any moment, the only one left still drawing
power.

**Charging slows above 80% SOC** — real li-ion/LFP cell behaviour (the
exact curve isn't published by any bus manufacturer; this is a reasonable
stand-in, not a sourced figure, same caution as the diesel/hydrogen pump
rates below being calibrated to reference points rather than a spec
sheet): a bus charges at its full available rate (whatever the per-charger
sharing rule above gives it) up to **80% SOC**, then **half that rate from
80–90%**, then **a quarter of that rate from 90–100%**.

**Depot-wide grid throttling** (confirmed 2026-11-01): the per-charger
sharing rule above is local to one charger unit; the depot's own grid
connection limit (below) is site-wide. When total demand across every
charger on site would exceed that limit, **every charger throttles down
equally** (the same proportional cut applied everywhere, not some buses
prioritised over others) so the site's total draw stays within the grid
connection — and **speeds back up** as buses finish or taper off and
demand drops, the same way a single shared charger's two buses trade
capacity above.

**Battery storage covers grid shortfall** (confirmed 2026-11-01): if the
depot has battery storage installed (above, £300/kWh), it discharges to
make up the gap once the grid connection limit is reached, up to its own
**max discharge rate of 1C** — a 100kWh battery can put out up to 100kW —
reducing or avoiding the equal-throttling above rather than letting buses
charge slower than they need to. The battery drains as it does this and
needs its own overnight recharge window like anything else drawing off
the same grid.

**Charger hire.** The operations director can let outside companies, including
hauliers, use depot chargers during the day while buses are out — modelled on
Stagecoach's real Charged scheme. It is **pay per use**, not contracted, so income
varies with their demand and scales with how many chargers sit free. Only depots
with **spare daytime capacity** can offer it, and **hired chargers are genuinely
unavailable** to the player's own buses, so it's a decision rather than free
money.

**Pantograph battery buffers.** A pantograph charging point (DESIGN.md §5)
gets a **local battery buffer installed alongside it**, not just at depots —
needed so a stop can support a fast charge without requiring a full grid
upgrade. Both the pantograph charger itself and its battery **can only be
built at a stop, bus station or interchange the player owns** — the same
ownership rule applies identically across all three site types (DESIGN.md
§4, §5, §5a). This stop/station-level buffer is separate from a depot's own
battery storage below, which is priced and capped per depot tier instead.

**Pantograph power tiers** (confirmed 2026-11-01): a pantograph charging
point comes in **100kW, 200kW or 300kW**, chosen per installation — each
step up is an **upgrade** on top of the base £3,500-per-stop
infrastructure price (VEHICLE-SPECS.md), not three separate flat prices.
**£750 per level** if the higher tier is chosen at installation itself
(so +£750 for 200kW, +£1,500 for 300kW, bought from new). Retrofitting an
existing point up a level later costs more: **£1,250 for a single later
upgrade** (100kW→200kW or 200kW→300kW), or **£2,000 to jump both levels in
one later upgrade** (100kW→300kW directly — cheaper than two separate
£1,250 single-level retrofits).

### Depot infrastructure

Replaces the old hydrogen/on-site-production/solar/battery pricing above
(2026-10-30) — those were priced on a continuous-capacity formula with no
depot-tier caps at all; this is a flat price per unit, tiered by depot size,
and covers every kind of depot capital infrastructure, not just energy.

**Rules:**
- **Flat price per unit** at every depot, with **hard caps per depot tier**
  (below) — no continuous scaling, no per-depot haggling.
- **Bought and upgraded in place.** Nothing installed here **ever breaks**,
  and anything can be **sold back at 50% of its price**. A **rented** depot
  **loses everything installed** on leaving — matches the existing rented-
  depot rule for other installations (§2 "Getting a depot", the 15% rule).
- **Financing (resolved 2026-11-05, Q12)**: any item in the price table
  below can also be bought **lease to own**, reusing vehicle finance's own
  rate exactly (§3 "Buying") rather than a separate figure — **60 months
  at 1.83%/month, 110% of price total, then owned** — no deposit. Only
  two ways to pay here, **buy outright or lease to own** — no plain
  return-at-the-end lease option, unlike vehicle finance's own three-way
  choice (confirmed directly: infrastructure is fixed in place, not
  something a depot hands back and swaps out the way a leased bus is
  returned to the dealer). A lease-to-own item **still counts for the
  tier caps above**, and the 50% sell-back above only applies once it's
  actually owned outright (bought outright, or the lease-to-own term
  completed) — mid-term, it isn't the player's own to sell back.
- **Build times**: pumps, bays and wash bays **2 weeks**; chargers and solar
  **4 weeks**; grid connections and batteries **8 weeks**; hydrogen (pump and
  tank) **12 weeks**. The depot **keeps running** throughout — only the
  specific fuel point being fitted is unavailable, not the whole site.
- **Charger points share power**, as already established above: when a
  depot's grid connection limit is reached, more chargers can still be
  built, but every charger on site shares that same limit, so buses charge
  slower and some may not finish a full overnight charge.
- **Drop-down (overhead) chargers**, for depots with more than 30 electric
  buses (confirmed 2026-11-01): every electric vehicle beyond the 30th at
  one depot needs its own dedicated overhead drop-down charger instead of
  a floor one — there isn't physical space for 30+ individual floor
  chargers and the buses to manoeuvre around them. Each drop-down charger
  is **150kW, dedicated to a single bus** (no two-bus sharing — the
  dynamic-split rule above is for floor chargers only), but still subject
  to the same 80%+ SOC taper and the same depot-wide grid throttling as
  every other charger on site. Drop-down chargers need an overhead
  **framework (gantry)** to mount them, built in **rows of 5** — the
  gantry is a one-off structural cost **per row**, separate from the
  £3,500-per-unit charger price (below), which still applies per
  drop-down charger exactly as it does for a floor one. Chargers within a
  row don't all have to be bought at once — the framework can sit
  under-populated while the fleet grows into it — but the **gantry's own
  cost is charged once per complete row of 5**, whether or not every
  charger in that row is filled yet. Build time **2 weeks**; price
  **£13,000 per row of 5** (confirmed 2026-11-01 — a simple steel
  structure, "nothing fancy").
- **Depot charging capacity display** (confirmed 2026-11-01): a depot's
  own overview shows its **maximum simultaneous charging capacity** — the
  number of buses it can have plugged in and charging at once, not how
  fast. This is a pure count, unaffected by the depot-wide grid throttling
  above (which only slows charging down, never blocks a bus from plugging
  in): **(floor chargers × 2) + (drop-down chargers × 1)**. At an
  Outstation, Tiny or Small depot, Yutong through-charging (above) could
  push an individual floor charger's own occupancy up to 4 instead of 2,
  depending on which vehicles were actually plugged in at the time — shown
  as a live bonus on top of this headline figure, not baked into it. Currently
  inert (see the note above): no in-game vehicle can trigger it any more.

**Prices** (one-off, per unit, not monthly):

| Item | Price |
|---|---|
| Diesel pump | £12,000 |
| Diesel tank | £8,000 for the 10,000-litre minimum, then **£4,000 per extra 5,000-litre step** |
| Hydrogen pump | £20,400 (1.7× the diesel pump) |
| Hydrogen tank | £12,750 for the 1,500kg minimum, then **£4,250 per extra 500kg** (≈£8.50/kg — 1.7× the diesel tank's own per-litre rate, for equivalent bus range) |
| Charger point (floor or drop-down) | £3,500 |
| Overhead gantry (drop-down chargers, per row of 5) | £13,000 |
| Grid connection — 100kW | £15,000 |
| Grid connection — 250kW | £40,000 |
| Grid connection — 500kW | £90,000 |
| Grid connection — 1MW | £190,000 |
| Grid connection — 2MW | £400,000 |
| Grid connection — 2.5MW | £500,000 |
| Grid connection — 3MW | £600,000 |
| Grid connection — 3.5MW | £700,000 |
| Solar | £1,100 per kW |
| Battery | £300 per kWh |
| Workshop bay | £25,000 (needs staff, §9 "Engineering and maintenance") |
| Inspection pit | £12,000 |
| Wash bay | £15,000 |
| Parking space | £2,500 |

**Caps per depot tier** (depot tiers themselves are §2 "Depots" → "Types" —
an outstation has no staff and cannot fuel, clean or maintain anything at
all beyond electric charging (below), so none of this table applies there
otherwise, beyond its existing overnight parking):

| Tier | Caps |
|---|---|
| Outstation | Overnight parking only (§2's own 5-bus cap), charger points 2, grid up to 100kW, **nothing else** |
| Tiny depot | Parking 10, wash bay 1, charger points 5, grid up to 100kW, **nothing else** |
| Small depot | Parking 40, diesel pump 1, hydrogen pump 1, charger points uncapped, grid up to 500kW, workshop bay 2, inspection pit 1, wash bay 1 |
| Main depot | Parking uncapped, diesel pumps 12, hydrogen pumps uncapped, charger points uncapped, grid up to 3.5MW, workshop bays 12, inspection pits 6, wash bays 4 |

Outstations and Tiny depots getting charger points at all is a
2026-11-01 change — electric buses need overnight charging regardless of
staffing, unlike diesel/hydrogen refuelling which genuinely needs a
pump and someone to run it. Both tiers are capped to the smallest grid
tier (100kW) since they're small sites with no other infrastructure.

Solar, battery, diesel tanks and hydrogen tanks have **no cap at any tier
except tiny**, which can have **none** of them at all.

**Fuelling time** depends on tank size and how full the tank already is:

> time = amount added ÷ pump rate

- **Diesel pump rate: 40 litres/minute.**
- **Hydrogen pump rate: 2.25kg/minute.**
- These rates are calibrated to two real reference points: an average
  300-litre diesel tank going from 10% to 100% takes **7 minutes**; an
  average 30kg hydrogen tank going from 10% to 100% takes **12 minutes**. A
  bus going from 50% to 100% takes roughly half as long as the same bus
  from 10%. A 660-litre coach tank from 10% to 100% takes about **15
  minutes** of diesel.

**Hydrogen supply.** Hydrogen is **bought in**, not produced on site, by
default. Before a depot has its own hydrogen pump, its buses refuel at
**Volvo** (the universal servicing business, §9) at a premium — unchanged
from before.

**Hydrogen transport between depots**: the player can pay to move hydrogen
from one of their own depots to another.
- **£4.50 per mile**, minimum **100kg** and maximum **500kg** per trip. The
  sending depot's own hydrogen tank empties by the amount moved.
- The lorry follows **UK driver's hours**: a 45-minute break after 4.5
  hours of driving, 9 hours of driving in a day, then 11 hours of rest.
  Average speed **45mph**.
- Loading at the sending depot and unloading at the receiving depot both
  run at the **hydrogen pump rate** (2.25kg/minute) and each **occupies a
  pump** at that depot while it happens.
- **Arrival time = loading time + driving time (including any breaks/rest)
  + unloading time.**

**On-site hydrogen production is a LATER option**, deliberately left out of
this pass. When it is added: it will need at least a **500kW grid
connection**, will make hydrogen **about 40% cheaper** than buying it in,
**stops producing once the hydrogen tanks are full**, and **overnight bus
charging takes priority over it for power**. Its build price is not set
yet.

**Facility electricity.** Depots and bus stations the player owns also
consume electricity themselves — lighting, facilities, offices — not just
vehicle charging. This scales with the size of the site and is set **slightly
below real-world figures**, matching the pattern used elsewhere in the
economy (e.g. property capital at 20% below real-world).

---

## 16. Bus stop displays

Added 2026-10-30. Two real display types, **replacing the old generic
"real-time departure screen" stop upgrade entirely** (`DESIGN.md` §4) — a
stop gets one of these two, or neither, never the old generic screen.

### E-ink (lesser-used stops)
- Updates **once a minute**.
- Install **£1,200 per stop**, **£15/month** maintenance.
- **Always fitted with solar and battery** — E-ink stops aren't always
  near mains power, unlike LED below.
- **Timetable add-on**: one-off **£200**, no monthly charge. Adds route
  maps showing where the bus stops (a satisfaction boost).
- **Colour add-on**: one-off **£200**, no change to monthly cost. A small
  satisfaction boost on its own, and **only works where buses on that
  route have colour destination displays** (§17) — with both, the map
  shows the real route colours.

### LED (busy stops)
- Full colour, updates **much more often** and shows more information
  than E-ink.
- Install **£4,500 per stop**, **£45/month**.
- **Mains power is the default.** A **solar and battery option** costs
  **+£1,000 install** and actually **lowers** the monthly cost by £10 (to
  **£35/month**), rather than adding to it.
- **No-mains version**: a smaller, cheaper screen at **£3,500**, plus the
  same £1,000 solar option (**£4,500 total**) — limited to showing **4
  buses** at once, rather than LED's usual fuller display.
- With **colour destinations** (§17) fitted on a route, its LED stop
  displays show the real route colour **instead of black**.

### Which stop gets which
Decided by a stop's own **busiest-hour** bus and boarding counts, not daily
totals:

| Busy-hour buses | Busy-hour boardings | Display |
|---|---|---|
| Under 2 | Under 10 | None |
| Up to 6 | 10–40 | E-ink |
| Over 6 **or** over 40 | — | LED |

**Bus stations, interchanges, railway and airport stops, and city-centre
stops always get LED**, regardless of what the counts above would
otherwise say.

### Effects
- **E-ink**: a small satisfaction boost; the timetable add-on gives a
  little more at low-frequency stops specifically.
- **LED**: a bigger satisfaction boost, plus a small marketing boost.
- **A satisfaction penalty** applies at any stop whose busy-hour counts
  cross the LED boundary above but which only has E-ink, or nothing at
  all — being under-provisioned for real demand is worse than having no
  display at a quiet stop.
- **Without the £60,000 upgraded AVL data** (company-wide one-off, shared
  with the mobile app's own live data — `TICKETING.md`), displays show
  **scheduled times only**. **With it**, they show **live times** and get
  the **full** satisfaction/marketing boost, not the scheduled-only
  partial one.
- Displays can **push passengers to the mobile app** once the live bus
  data app upgrade (`TICKETING.md`) is bought.

**LED service promotion.** A larger LED can use its spare display space to
**advertise a service**, giving that service **3% more boardings** at that
stop specifically. Limited to **the route that actually stops there**, and
only usable at a stop that's **restricted to one service or one type of
service** — a reserved or branded stop (`DESIGN.md` §4 "Stop reservation
and branding"), not an ordinary multi-route stop.

### Fitting (shared by every stop upgrade, not just displays)
- Work **starts 14 days after ordering**.
- **1 hour on site per E-ink, 3 hours per LED.**
- Fitters work **0800–1700**, which includes travel time between stops,
  not just time on site.
- **Contractors are a shared pool per council region** (§1a — real OSM
  council areas, not depot groups): **2 fitters per region**, **3 for
  councils with over roughly 1,000 stops**. They only work within their
  own council area, and jobs **queue** once every fitter in that area is
  busy. **The same contractor pool does every stop upgrade in this spec**,
  not just displays.
- **Highland Council is split into six areas** for this pool specifically
  (its real area is too large for one 2-fitter pool to cover sensibly),
  following the old districts: **Caithness, Sutherland, Ross and
  Cromarty, Skye and Lochalsh, Lochaber, Inverness/Nairn/Badenoch and
  Strathspey** — **2 fitters each**. This is the one exception to "one
  pool per real council area" above.

### Bulk menu
Stop upgrades are bought through a **bulk menu**: every stop in a chosen
group (a village, or a whole route) gets the **same upgrades at the same
time**, so no stop in the group ends up better-equipped than another.
**A group's upgrades only start working once every stop in it is fitted**
— a partially-fitted group gets nothing yet. **5% off installation** for
orders of **10 or more stops**.

---

## 17. Bus destination displays

Added 2026-10-30. A real vehicle option — available **both when buying new
and as a retrofit** on an owned bus — built as two drop-downs in the buy
menu, the same shape as every other dropdown option (§3 "Configurator"):

1. **Colour tier**: standard white / route colour / full colour.
2. **Density**: standard / high density.

**Prices, buying new** (added to the vehicle's own price):
- Route colour: **+£200** over standard.
- Full colour: **+£550** over standard.
- High density: **+£300** on top of whichever colour tier is chosen.

**Prices, retrofitting an owned bus:**
- Route colour: **£1,800**.
- Full colour: **£2,600**.
- High density: **+£750** on top of whichever colour tier is chosen.

**Wireless destination updates** (lets destinations update over the air
rather than needing a controller or depot visit): **£75/bus** when bought
new, **£90** as a retrofit (£75 plus a **£15** fitting charge) — retrofitting
takes **30 minutes** of a fitter's time.

### Effects
- **Every tier** gives a small satisfaction boost plus a small marketing
  boost.
- **Route colour** unlocks the colour E-ink stop-display boost and adds a
  boost to LED stop displays (§16) — those boosts only apply once the
  bus's own destinations are actually coloured, not from the stop display
  alone.
- **Full colour** adds a small **company-wide** marketing boost — but only
  while the bus is **out of service**, showing the company logo or a
  service name (e.g. "AIR") rather than a passenger destination. This is
  not a per-service boost, unlike LED's own service-promotion mechanic
  (§16).

### Fitting and rollout
- **Retrofitting takes 2 hours per bus, for every display type** — done
  by the **company's own fitters only**; unlike the stop-display
  contractor pool (§16), the **supplier does not fit these**.
- **Colour rollout is per route, not per bus.** A route needs its own
  "colour destinations" option turned on. Colour only actually **shows
  once every bus working that route is fitted** — turned on **one route
  at a time**. Until then the route keeps the plain white style, even on
  buses that already have a coloured display fitted. **High density has
  no such rollout gating** — it's used as soon as a bus has it.
- **Overnight update**: a controller updates a bus's destinations at
  **5 minutes per bus** worked into their shift. **Wireless-equipped buses
  update themselves automatically overnight**, needing no controller time
  at all.
- **Delivery**: **2 weeks per order**, for every destination-display
  upgrade. Ordering is **bulk and cart-based**, the same shape as buying
  buses (`OPERATIONS.md` §3 "Buying") — buses in a depot group are added
  to a cart and bought from one menu, rather than ordered one at a time.
