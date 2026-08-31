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

## 2. Depots

### Types
- **Main depot** — full facilities: fuelling and maintenance.
- **Small depot** — its own completely separate rota, linked to a main depot in
  the depot overview when created. Can have fuel pumps and/or electric chargers
  and maintenance facilities, purchased if the depot is owned or inherited as-is
  if rented. Maintenance facilities need staff. Some work still returns to the
  main depot.
- **Outstation** — five buses or fewer, no staff. Overnight parking only; cannot
  fuel or maintain anything. Either rented parking or built and owned. Has its
  own rota nested inside the main depot's rota.

Linked depots and outstations are covered by a small cost and can be a minimum
of one shift.

Depot, outstation and bus station pricing depends on location, the same as stop
pricing.

### Route allocation
- **Local routes** are assigned to a depot group. Any depot or outstation in
  that group can run any service assigned to it.
- **Long-distance routes** are assigned to one or more individual depots.
  Inverness–Edinburgh might start one service at each end simultaneously plus
  two from Perth in opposite directions. Journey-to-depot allocation is
  automatic with manual override.
- The **first service on a route** always starts from the nearest depot to its
  start point.

### Getting home
Buses and drivers should end the day at their home depot. For long-distance work
the player decides **per vehicle working** whether a return working brings the
bus home the same day or it stays out overnight at the far depot.

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
InterCity), USB and power sockets, Wi-Fi, better seating, air conditioning,
passenger information with next-stop audio and screens, premium driver seat,
pantograph charging on electric vehicles.

**Some options are retrofittable later as upgrades**; some are purchase-only.

### Buying
Vehicles can be bought **new, second-hand, or leased**. Several can be bought at
once through a **basket allowing mixed specifications in one order**.

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
- **40,000s** — Mercedes-Benz Sprinter, EVM conversion, diesel and electric
- **50,000s** — Volvo 9700; Volvo 9700DD
- **60,000s** — Yutong T12E; Yutong T15E
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
Dundee, Aberdeen). Non-compliant buses are **not banned but fined**, with a
larger fine for each emissions level below Euro VI. Electric buses seen in an LEZ
raise the company rating.

### Selling
Upgrades stay with a bus when sold and raise its sale price.

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

### Accompanying data
Each livery also stores two hex values — a **primary** and **secondary** colour
taken from the badge — used for the route list swatches and the livery selector
on the purchase screen, so they match the badge exactly.

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
- Routes can specify particular vehicles in particular liveries, but may use any
  vehicle of the correct type if there are not enough in the right livery.
- **One-off vehicle liveries** are possible.
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

**Wages are settable per role**, on a single settings page showing all rates
together.

Every employee has a tracked **driving licence and type**: normal (cars and
vans), PSV (buses and coaches), or HGV (recovery unit). Engineers can be sent
through the training school for a PSV licence so they can take buses for
maintenance and MOTs.

### Recruitment
A pool of applicants near each depot, of varying quality. **Advertising** can be
bought with a monthly budget; more spend, bigger pool.

### Promotion and vacancy chains
Four roles are filled by promotion:

| Role | Comes from | Keeps old job? |
|---|---|---|
| Driving instructor | Drivers | Yes |
| Relief controller | Drivers | Yes — drives weekday afternoons |
| Controller | Relief controllers | No |
| Workshop manager | Engineering | Yes |
| Stores | Any role | No |

Cleaners can move into storekeeper, engineer or driver roles. Travel centre staff
can be promoted into driving and controlling.

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
| Fleet elite | Base rate + £50 per month | Only 10–15% of drivers reach it |

Progression to professional varies with hours worked — 40 hours a week is the
baseline — plus a slight per-driver variable so they progress at different
speeds. Fleet elite takes a further 2–3 months after professional.

Fleet elite pays **£50 at the end of each full month** after gaining the status,
shown in finances as *fleet elite payments*. The badge on the driver settings
page advances green, silver, gold, then elite (gold with wings), one level at the
end of each full month.

**Traits:** experience, reliability, friendliness. **Happiness** is separate,
raised by things like premium driver seats. A higher score, friendliness and
happiness all mean better service to passengers.

### Rotas
A weekly repeating pattern drivers work through. Multiple rotas are supported —
a night rota so drivers do not swap between day and night work, and four-day
rotas for drivers who do not want five. Rotas are renamable.

Drivers can be hired onto a specific rota, and may ask to move: a small chance
when a new line is added, and a smaller chance for four-day drivers to move to
five-day when a slot opens.

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
- **Overtime** at any local depot for a small cost, with extra travel charged per
  mile on the shortest route from the home depot. Minimum one shift. Overtime is
  the main way to run new routes before new staff are hired.
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

## 9. Engineering and maintenance

### Engineers
The player chooses how many a depot needs, with a **rough estimate shown**.

### Workshop manager
Builds the depot **work list** that engineers pull from. Higher competence gives
better job ordering and **spots faults before they become breakdowns**.

When several vehicles are bought at once, the workshop manager **spreads their
MOTs and services across the year** so they do not fall due together.

### Stores
One storekeeper up to 25 buses in a depot, two above that. **Without stores staff
the engineers cannot work.**

Stores order parts automatically based on the fleet. Higher competence means
earlier reordering, less excess stock, and faster arrival of parts ordered in for
a breakdown.

Each depot holds **parts stock**, shown on the finance screen — too much is
wasted money, too little leaves buses waiting.

### Job types
Scheduled service, repairs, safety inspections at fixed intervals, vehicle
upgrades, and an **annual test the bus can fail**. Failing puts the bus off the
road until fixed, with a big repair bill — no fine, no reputation hit.

MOTs are done at external repair places for a **£150 fee**.

### External maintenance
Before a depot has its own facility, buses go to an external maintenance place
such as Volvo, with a dead route set from the main depot. **One per area**, Volvo
preferred. It costs **2x** what the same work would cost at the home depot, both
to push the player towards building facilities and as a way to clear a backlog.

### Breakdowns
**Engineering vans** — as many as the player wants, diesel or electric — attend
roadside breakdowns and either fix the vehicle there or recover it, depending on
the fault. With no van at the depot, a contractor recovers it at a cost.

Passengers on a broken-down bus get a **replacement bus sent to them**.

---

## 10. Cleaners

Hired for depots to keep buses clean. Cleanliness affects passenger satisfaction.

Cleaners can be **hired directly** or **contracted in**. Contracting is quicker to
set up and dearer over time, and the contractor **automatically adjusts numbers
to fleet size**.

---

## 11. Travel centre staff

Introduced by the travel centre upgrade at a bus station. They sell season
tickets and speed up boarding by selling tickets off the bus.

**One minimum per travel centre**, more optional. Their score affects ticket
sales and speed. They can be promoted into driving and controlling.
