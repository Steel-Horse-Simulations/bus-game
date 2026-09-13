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
contract and school route numbering.

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
decides price, range, power output, length and **which fleet number range the
vehicle lands in** once bought.

The Volvo 7900 is the clearest case: one entry, offered as 10.6m diesel, 12m
diesel, hybrid or electric, landing in the 20,000s or 70,000s accordingly.

Examples of options: larger fuel tank on diesel coaches (more range, better for
InterCity), USB and power sockets, Wi-Fi, **comfier seats** (the passenger
seating upgrade, retrofittable — required on Airlink 100, Express 500 and AIR,
§10), air conditioning, passenger information with next-stop audio and
screens, premium driver seat, pantograph charging on electric vehicles.

**Some options are retrofittable later as upgrades**; some are purchase-only.

### Condition
**Every vehicle has a condition**, not just used ones. New vehicles start at full
condition and decline with age and neglect. Condition drives reliability,
passenger perception, resale value and annual test risk — so a well-maintained
fifteen-year-old is genuinely better than a neglected five-year-old.

**Used buses** are therefore not a separate category: any catalogue model can be
bought used, at a used price and a lower condition. They are very cheap and much
less reliable, and passengers dislike them — good early, poor long term.

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

### Buying
Vehicles can be bought **new, second-hand, or leased**. Several can be bought at
once through a **basket allowing mixed specifications in one order** —
**destination depot and livery are both set per vehicle** within that basket,
not once for the whole order, the same way specification already varies
vehicle by vehicle. The bulk discount below still groups the whole basket by
manufacturer regardless of each vehicle's own destination or livery.

**Work type flags.** A vehicle is flagged for one kind of work and cannot cross
over. **Open-top double-deckers work sightseeing only**; **coaches and Sprinter
vans flagged for private hire work private hire only**. A private hire vehicle
can be returned to service work, but it costs time and money.

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
- **Lease** — monthly payments, returned to the dealer at the end or the lease
  extended. At the end there is an option to **buy out the remaining credit** and
  keep the vehicle.
- **Lease to own** — a higher monthly payment, then ownership. Total cost is
  about **10% more than buying outright**.

**Missed payments** add that month's interest to the balance, so the player pays
more overall. Vehicles are never repossessed.

### Fleet numbers and plates
Every vehicle gets a unique five-digit fleet number and a unique registration
plate based on the area it was bought in. UK plates encode area and age —
Scottish tags run SA–SJ Glasgow, SK–SO Edinburgh, SP–ST Dundee, SU–SW Aberdeen,
SX–SY Inverness — so the plate doubles as a visible age cue.

Both stay with the vehicle for life, including on transfer between depots.

| Range | Category |
|---|---|
| 10,000–19,999 | Diesel double-deckers |
| 20,000–29,999 | Diesel single-deckers |
| 30,000–39,999 | Diesel door-forward midibuses |
| 40,000–49,999 | Diesel or electric minibuses and wheel-forward midibuses |
| 50,000–59,999 | Coaches |
| 60,000–69,999 | Electric midibuses, electric coaches and other specialised |
| 70,000–79,999 | Electric single-deckers |
| 80,000–89,999 | Electric and other alternative-fuel double-deckers |
| 90,000–99,999 | Pool cars, staff transport and support vehicles |

Within a category, **each make starts in its own block** so numbers do not run
together. Numbers are issued chronologically. When a range fills, warn the
player and let them decide.

### Transfers
Vehicles can be transferred between depots and must **drive to the new depot**,
collected by anyone at the receiving depot holding the right licence.

### Catalogue
Twenty-one buses and coaches, real models with specifications balanced for the
game. Makes: Volvo, Alexander Dennis, Wrightbus, Mercedes/EVM, Yutong.

- **10,000s** — ADL Enviro400 MMC; Volvo B8L
- **20,000s** — ADL Enviro200 MMC 11.5m; Volvo 7900 (12m and 10.6m diesel);
  Volvo 7900 Hybrid
- **30,000s** — ADL Enviro200 MMC 8.9m
- **40,000s** — Mercedes-Benz Sprinter, EVM conversion, diesel and electric.
  Defaults to steps; a low floor variant costs extra at purchase and is
  retrofittable later at greater expense
- **50,000s** — Volvo 9700, Volvo 9700DD (from 50,000); Yutong T12E, Yutong T15E
  (from 55,000). Coaches come in **twin-axle and tri-axle** versions, a
  configurator choice like power type or length: twin-axle 9700 seats **53**,
  tri-axle **65**. The 9700DD only exists as tri-axle.
- **60,000s** — ADL Enviro400 open-top, diesel and electric (sightseeing only); ADL Enviro400 open-top, diesel and
  electric (sightseeing only)
- **70,000s** — Yutong E12; Yutong E10; ADL Enviro200EV; Volvo 7900 EV;
  Wrightbus GB Kite Electroliner
- **80,000s** — ADL Enviro400EV; Yutong E12DD; Volvo BZL DD (MCV body)

**90,000s support fleet** — Ford Transit Custom (diesel); Ford E-Transit Custom;
Mercedes Sprinter crew van, diesel and electric; Skoda Octavia Estate; Vauxhall
Corsa; Vauxhall Corsa Electric; Skoda Enyaq; heavy recovery unit.

The **heavy recovery unit needs an HGV licence**, which engineers gain through
external training. It lets the player recover a bus themselves instead of paying
the contractor.

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
| School contracts | Low floor **or** coach — the exception |
| Event contracts | Low floor only |
| Cruise contracts | Any mix, but at least one low floor |
| Sightseeing | Low floor only |
| Private hire and tours | Anything |

Event and cruise requirements are enforced by **warning and penalty**, not by
blocking the assignment. Running a stepped vehicle on service work always counts
against the accessibility rating, so in practice stepped vehicles are for school
contracts, private hire and tours.

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
- Leave the **middle third clear** for the route number to sit in.

### The three images per livery
Each livery is supplied as three images at the same size and alignment:

1. **The badge** — the livery pattern itself, as specified above.
2. **A branding mask** — black where the livery is unchanged, **white** for the
   primary branding region and **mid grey** for the secondary. The renderer tints
   only those pixels, so one asset serves every branding colour.
3. **A number box** — a plain **magenta `#FF00FF`** rectangle, hard-edged, on a
   transparent background, showing where the route number sits. Magenta never
   occurs in a real livery, so it is detectable with a wide tolerance and cannot
   be confused with the mask.

The number box is an authoring convenience. What the game needs is four numbers,
so the pipeline reads the box's bounding rectangle once on import and stores it as
fractions of the image. After that the number can be nudged in a settings field
without regenerating artwork.

Keep the **centre third of the badge a single flat colour**, so the route number
does not land half on one colour and half on another.

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
`assets/liveries/` named by livery id.

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
| Driving instructor | 1.10 |
| Controller | 1.15 |
| Revenue inspector | 1.25 |
| Engineer | 1.35 |
| Workshop manager | 1.50 |
| Store manager | 1.55 |
| Marketing manager | 1.55 |
| Depot manager | 1.60 |
| Operations manager | 1.65 |
| Stores director | 2.00 |
| Marketing director | 2.00 |
| Operations director | 2.20 |

**Fleet elite** is a flat **£20/month** top-up on top of the professional
driver's wage, kept as an absolute bonus rather than folded into the ratio, since
it's a small number of drivers rather than a whole role.

**Casual roles are outside the ratio system entirely** — tour guides, school
drivers and private hire drivers are paid per tour or per hour worked, since a
ratio implies a standing wage they don't have.

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
- **Casual staff**, such as on-demand private hire drivers, are paid only for
  hours actually worked.
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

### Private hire drivers
- Must be **professional or higher** to drive a private hire.
- Paid **10% more than a regular driver** while on one.
- **One driver completes the entire hire**, up to five days. On a multi-day hire
  the driver is paid to stay away in accommodation, and the cost is passed to the
  customer.
- They work on the **EU work rota**, which covers long distance and private hire
  only, so the hours regime follows the rota rather than being worked out per
  duty.
- **EU drivers' hours always apply**, whatever the distance. Rest stops must be
  built into the route where it would exceed driving time; the game warns and
  suggests where one is needed.
- Some private hire drivers are **part time and do private hires only**, hired
  from a **separate pool** to regular drivers. They are called on per job, but
  need a minimum amount of work to stay with the company.

### Overtime and loans
- **Overtime** at any local depot, paid at a **flat 20% above the normal
  wage**, the same rate for every role, set by the game rather than by the
  player. Extra travel is charged per
  mile on the shortest route from the home depot. Minimum one shift.

  Overtime is the short-term pressure valve — it covers a new route before staff
  are hired, or a shift left open by a driver away on private hire. It is
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
cross-depot driver loans, disruption spanning several depots, and **approving
route and timetable changes** — approval is automatic, and their skill only
affects how quickly it happens, so a good one shortens the lead times.

They also **optimise the timetable**, which is their main job (`DESIGN.md` §7).

**Operations director — one for the company.** Negotiates **better council
contract terms** and sets company-wide service standards. They also optimise
**stand allocation** at bus stations, sell vehicles at a better price the more
skilled they are, run **cascades**, and negotiate **charger hire** contracts with
outside companies.

Both only act on their optimisation work when a route is created or modified, and
their changes take effect on the **Monday of every even-numbered week** —
fortnightly — with anything decided after a changeover batching into the next one,
so the timetable doesn't shift under the player daily.

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
override. They also work out **who collects new vehicles and when**, price
**private hires** and **tour bookings** (a more skilled manager secures a better
price), and work out the timings and staffing for private hire routes.

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

**Chargers** have limited capacity and are bought as the fleet grows. They share
power: **two buses charging slowly, or one at 1.5x that speed**. Chargers need no
maintenance and do not wear out.

**Charger hire.** The operations director can let outside companies, including
hauliers, use depot chargers during the day while buses are out — modelled on
Stagecoach's real Charged scheme. It is **pay per use**, not contracted, so income
varies with their demand and scales with how many chargers sit free. Only depots
with **spare daytime capacity** can offer it, and **hired chargers are genuinely
unavailable** to the player's own buses, so it's a decision rather than free
money.

**Hydrogen refuelling.** A depot needs hydrogen facilities built before a
hydrogen bus can be fuelled there — the same one-off build-cost pattern as
electric chargers. Any depot with facilities can build it. Before a depot has
its own, a hydrogen bus can refuel at **Volvo** (the universal servicing
business, §9) at a premium.

**On-site hydrogen production** is an alternative to buying hydrogen in: a
one-off facility build cost, but cheaper hydrogen afterward than buying it in
from outside.

**Solar panels and batteries** — separate purchases, not one combined cost.
Batteries store solar power generated during the day, and also charge
overnight on a **time-of-use cheap-electricity rate** — separate from, and
stacking with, the stores director's regional volume discount above. Stored
energy (solar plus cheap overnight charging) powers the depot's own buses
during the day, and the same infrastructure can be sold via **charger hire**
to make extra profit charging external companies' vehicles too. **Solar
generation varies by both season and region** — not a flat year-round
figure.

**Pantograph battery buffers.** A pantograph charging point (DESIGN.md §5)
gets a **local battery buffer installed alongside it**, not just at depots —
needed so a stop can support a fast charge without requiring a full grid
upgrade. Both the pantograph charger itself and its battery **can only be
built at a stop, bus station or interchange the player owns** — the same
ownership rule applies identically across all three site types (DESIGN.md
§4, §5, §5a).

Battery capacity is **continuous, not fixed tiers** — a smoothly scaling
amount the player dials in, not small/medium/large packages. Realistic
sizing bands, for the input range rather than as fixed options:

| Site | Realistic capacity |
|---|---|
| A single pantograph point | ~150–300 kWh |
| A medium terminal (bus station/interchange) | ~0.5–1 MWh |
| A depot | ~1–4 MWh |

(Real reference: First Bus Aberdeen runs roughly 2MW/4MWh of battery storage
on site.)

**Cost** is deliberately game-balanced — real battery storage costs would be
far too high for the game's pacing, the same reasoning as the existing 20%
discount on property capital (DESIGN.md's economy targets):
- Base connection cost: **£7,500** (wiring, inverter, groundworks — the same
  regardless of size).
- First 300kWh: **£60/kWh**.
- Next 700kWh (300–1,000kWh): **£37.50/kWh**.
- Beyond 1,000kWh: **£22.50/kWh**.

Worked examples at these rates: a 200kWh pantograph-point battery costs
about **£19,500**; a 750kWh terminal battery about **£42,375**; a 2,500kWh
depot battery about **£85,500**.

**Financing.** Deposit plus instalments only — no pure lease option, unlike
vehicles (which have both): a battery isn't something you'd want to hand
back at the end of a lease. The deposit percentage, term length and interest
premium are meant to match vehicle finance's own figures (§3 above) —
**flagged as an open question rather than invented**: §3 doesn't currently
specify a deposit, a term length, or an interest rate for vehicle leasing,
only that lease-to-own totals about 10% more than buying outright overall.
There's nothing concrete there yet to reuse (OPEN-ITEMS.md Q12).

**Facility electricity.** Depots and bus stations the player owns also
consume electricity themselves — lighting, facilities, offices — not just
vehicle charging. This scales with the size of the site and is set **slightly
below real-world figures**, matching the pattern used elsewhere in the
economy (e.g. property capital at 20% below real-world).
