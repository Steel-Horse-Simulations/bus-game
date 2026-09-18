# VEHICLE-SPECS.md — full vehicle catalogue

Companion to DESIGN.md, OPERATIONS.md and CLAUDE.md. Where this file gives a
figure that conflicts with anything already in those three, **this file wins**
— it's the more recent and more detailed source. Add it to CLAUDE.md's
reference material list.

Real-world figures are used where available; anything without a "Real" note is
an estimate and should be treated as provisional. A few genuine gaps are
flagged explicitly near the end — don't guess at those, ask.

---

## 1. General rules (apply across the whole catalogue)

**Wheelchair space.** Every vehicle has exactly **1 wheelchair space**, and it
is always **additional** to the seated/standing figures given below — never
included within them. Where the bay isn't occupied, it can convert to extra
standing capacity on some vehicles (noted per-vehicle where confirmed).

**Twin-axle / tri-axle.** Not a selectable option — it's **derived
automatically from a coach's length**: up to and including 12.9m is
twin-axle; over 12.9m must be tri-axle by law.

**Top speed.** Not a per-vehicle figure — a simple rule by category:
- **50mph** — buses (single-deck, double-deck, open-top)
- **62mph** — coaches, and the EVM Cityline minibus (van-based, not a bus
  chassis)

**Tip-up seats.** Not a general mechanic — real sources don't consistently
say whether they're included in published seat counts, so don't add tip-ups
to a vehicle unless explicitly stated. Confirmed cases only:
- ADL Enviro500: 3 tip-ups
- Yutong E10: 4 tip-ups
- Yutong E12: 5 tip-ups

**Max-seating / max-standing configurator mode.** Several vehicles (the
StreetDeck family, the Wrightbus GB Kite family) publish a **max capacity**
figure that does **not** equal max seated + max standing, because those are
two different configuration modes, not simultaneous maximums. Where this
applies, the player chooses:
- **Max-seating mode** — use the max seated figure, fill the remainder with
  standing to reach max capacity.
- **Max-standing mode** — use the max standing figure, fill the remainder
  with seats to reach max capacity.

Example (StreetDeck Ultroliner at 11.5m, max capacity 100): max-seating =
75 seated + 25 standing; max-standing = 28 standing + 72 seated.

**Battery units.** Always **kWh** (energy capacity), never kW (which is
power, the wrong unit for battery size).

**School run capacity.** On a school contract, capacity is **seated capacity
only** — no standing passengers permitted at all, since every student must
have a seatbelt. This overrides the normal seated+standing model specifically
for school work, and is what the council's minimum capacity requirement is
checked against.

**Seats and luggage racks are shippable inventory**, not just fitted parts:
- Fitting/removing seats is **free** — just engineering staff time (a fitter,
  specifically).
- Removed seats go into **storage at the depot that removed them**, visible
  and usable company-wide from there.
- Shipping seats between depots: **£5 each for the first 10, £2 each above
  10** (volume discount, same shape as the vehicle bulk discount).
- Shipping luggage racks between depots: **£7 each for the first 10, £4 each
  above 10** (bigger item, higher fee).
- This system is available on **any vehicle with a dual seating-layout
  option** (see §2, seating layout), not just the Volvo 7900.
- **Airport-specification conversion** uses this same system: converting to
  airport-spec removes seats (into storage) and requires luggage racks
  (bought new or taken from storage); converting back adds seats and returns
  the luggage racks to storage.

**Private hire vehicles** have **2 extra seats** compared to an otherwise
identical vehicle. These are removed (following the seat system above) if a
wheelchair user is booked onto that specific hire, then refitted once the
hire is complete.

**Toilets** are not a configurable option:
- **Standard on every coach**, already included in the coach capacity figures
  below — no separate seat deduction.
- **Never available on the EVM Cityline minibus.** Instead: if the total
  journey is **over 4 hours**, the Cityline must stop after **3 hours** for a
  toilet break. If the journey is **under 4 hours**, it can run straight
  through with no stop at all. A duty-planning constraint for long private
  hire and tour work, not a repeating "every 4 hours" cycle.
- Required (not optional) for: any private hire longer than 2 hours without a
  stop at a venue, and all long distance journeys.

---

**Open-top conversion.** An existing vehicle can be converted to open-top
for **£10,000**, and this **cannot be undone**. Only available on vehicles
that have a defined open-top variant in the catalogue — currently the
ADL Enviro400 (diesel and electric) only.

## 2. Options — selection type and general effect

Selection type is checkbox unless noted. Effect is the general rule applying
across every vehicle it's available on; per-vehicle figures (fuel tank,
battery) are in §3 against each vehicle.

| Option | Power type | Effect |
|---|---|---|
| CCTV cameras | All | **Standard on every vehicle**, not optional |
| CCTV audio (dropdown: none / cab / full) | All | See below |
| USB and power sockets | All | Small satisfaction boost + slight marketing/awareness boost |
| Wi-Fi | All | Same shape as USB, bigger effect — matters more to passengers |
| Comfier seats | All | Bigger effect than Wi-Fi, no marketing boost. Scales on a **binary long-distance / short-journey split**, not continuously |
| Air conditioning | All | Bigger effect than Wi-Fi, no marketing boost. **Seasonal** — bigger boost in summer months |
| Next-stop audio | All | Satisfaction + marketing boost. Matters **more** than screens (accessibility: essential for visually impaired passengers) |
| Passenger info screens | All | Satisfaction + marketing boost, smaller than audio |
| Premium driver seat | All | Driver happiness boost **and** reduces sickness/turnover — feeds into the existing warning/dismissal system |
| Larger fuel tank | Diesel only | Per-vehicle range boost — see §3 |
| Larger battery pack (dropdown) | Electric only | Per-vehicle range boost — see §3 |
| Larger hydrogen tank (dropdown) | Hydrogen only | Per-vehicle range boost — see §3 (Kite and StreetDeck Hydroliners already have their tank tiers recorded there) |
| Pantograph charging | Electric only | Enables opportunity charging during layovers, reducing overnight depot charging need. Needs infrastructure: **£3,500 per stop**; at a bus station/interchange, **one per stance**, not one for the whole site |
| Low floor conversion | EVM Cityline only | Purely functional — satisfies accessibility requirements, avoids the stepped-vehicle accessibility penalty |
| Seatbelts | All | Standard on coaches. On other vehicle types, a functional option satisfying school contract eligibility — no satisfaction effect |
| Foldable school signs | All | Purely functional, satisfies school contract requirements, shown/hidden per journey |
| Instructor mirrors | All | Training vehicles only. Purely functional — lets the instructor see properly. Not available/relevant on any non-training vehicle |

**CCTV audio detail:**
- **Cab-only audio** — protects the driver in a complaint (evidence), slightly
  deters abuse.
- **Full audio** — **disliked** on ordinary routes (feels intrusive, a
  negative satisfaction effect), but **liked** on routes with a known
  abuse/bad-behaviour problem, since it makes passengers feel safer there.
  Requires a new route flag, set by the operations manager, shown in the
  route list. Once flagged, full-audio vehicles are preferentially assigned
  to that route where possible.

---

## 3. Vehicle catalogue, by fleet number range

Every vehicle: **1 wheelchair space additional** to the figures below (§1).

### 10,000s — diesel double-deckers

**ADL Enviro400 MMC** — built on the **Volvo B5TL chassis**
| Length | Seated | Standing |
|---|---|---|
| 10.5m | 74 | 16 |
| 10.9m | 82 | 18 |
| 11.5m | 85 | 20 |

Fuel: standard tank 275L / ~475 miles; smaller tank option 200L / ~350 miles.

**ADL Enviro500** — fixed length **13.8m**. Capacity: 80 fixed seats (25
lower deck, 55 upper deck) + **3 tip-ups**, 32 standing, 112 total (the
tip-ups trade off against standing space, not adding to the 112 ceiling).
Fuel: one tank size, **430L / 660 miles** (Scotland-spec figure).

**StreetDeck Ultroliner (diesel)** — three lengths, max-seating/max-standing
pattern applies (§1):
| Length | Max capacity | Max seated | Max standing |
|---|---|---|---|
| 10.6m | 96 | 74 | 26 |
| 11m | 98 | 83 | 18 |
| 11.5m | 100 | 75 | 28 |

Fuel: standard tank 245L / 425 miles (all three lengths); smaller tank option
190L / 330 miles (all three lengths).

---

### 20,000s / 30,000s — single-deckers and midibuses

**ADL Enviro200 MMC** — one model spanning both ranges by length: 8.9m/9.7m/
10.8m land in **30,000s**; 11.5m/11.8m land in **20,000s**.
| Length | Seated | Standing |
|---|---|---|
| 8.9m | 30 | 14 |
| 9.7m | 34 | 15 |
| 10.8m | 40 | 16 |
| 11.5m | 43 | 17 |
| 11.8m | 43 | 17 |

Fuel: one tank size, 220L. Range: 8.9m=500mi, 9.7m=490mi, 10.8m=475mi,
11.5m=460mi, 11.8m=440mi.

**Volvo 7900 Hybrid** — fixed **12m**, 20,000s. Only Hybrid and Electric
variants exist in Scotland (see 70,000s for Electric); plain diesel and the
10.6m length don't exist here and are dropped from the catalogue.
Capacity: 38 seated, 62 standing.

Fuel: one tank size (no options), 425 mile range.

**MCV Evora** — new addition. 10.8m lands in **30,000s**, 12.9m in
**20,000s** (same threshold as the Enviro200 MMC).
| Length | Seated | Standing | Notes |
|---|---|---|---|
| 10.8m | 35 | 34 (wheelchair in use) / 43 (bay converted) | 69+wheelchair / 78 total. Confirmed real figure, no longer provisional |
| 12.9m | 47 | 38 (wheelchair in use) / 46 (bay converted) | 86 total / 93 total |

Fuel: one tank size, 350L. Range: 10.8m=990mi, 12.9m=900mi.

---

### 40,000s — minibus

**Mercedes-Benz Sprinter/EVM Cityline** — fixed length **7.4m** (7367mm).
No toilet ever available (§1's 4-hour rule applies). Low floor is a
retrofittable option (defaults to steps).
- Diesel: 93L tank, 350 mile range
- Electric: 115kWh battery, 190 mile range

---

### 50,000s — coaches

**Volvo 9700** — lengths 12.4m (twin-axle), 13.1m/13.9m/15m (tri-axle).
Capacity: **twin-axle = 53 seated, tri-axle = 65 seated** (doesn't vary
further by the specific tri-axle length). Fuel: standard tank 480L / 900
miles; larger "InterCity" tank option 600L / 1125 miles — only these two
tank sizes exist.

**Volvo 9700DD** — lengths 13m and 14.8m (both tri-axle — a separate buying
menu entry from the 9700, not merged, since single vs double deck is a
fundamental distinction). Fuel: one tank size in Scotland, 690L. Range:
13m = 1080 miles, 14.8m = 980 miles. **Airlink 100 requires the 13m
version specifically.**

**Yutong coach** — one buying menu entry with a length dropdown selecting
between two real models:
- **T12E** (12m, twin-axle): battery 399kWh/320mi or 465kWh/370mi
- **T15E** (15m, tri-axle): battery 621kWh/335mi or 704kWh/380mi

---

### 60,000s — specialised (sightseeing, open-top only)

**ADL Enviro400 open-top** — both power variants **reuse their donor
vehicle's stats entirely** (base capacity, fuel/battery, chassis), except for
tour-specific options (tour audio + PA, languages):
- **Diesel** (10.9m): reuses the Enviro400 MMC's 10.9m figures — 82 seated,
  18 standing, 275L/475mi, Volvo B5TL chassis
- **Electric** (11.1m): reuses the Enviro400EV's figures — 80 seated, 18
  standing, 354kWh/215mi or 472kWh/285mi

---

### 67,000 — hydrogen single-deckers (sub-range within 70,000s)

**Wrightbus GB Kite Hydroliner** — fixed length **12.2m**. One buying entry
shared with the Electroliner below (Electric/Hydrogen selector). Capacity:
max capacity 79, max seated 41, max standing 41 (max-seating/max-standing
pattern, §1). Fuel: hydrogen tank 32kg/340mi, 40kg/425mi, or 50kg/530mi, plus
a **fixed 54kWh buffer battery** (doesn't vary with tank size).

---

### 70,000s — electric single-deckers

**Volvo 7900 Electric ("7900e")** — fixed **12m**, the electric sibling of
the 7900 Hybrid above. Capacity: 38 seated, 57 standing (its own figure,
genuinely different from the Hybrid's despite the same seated count).
Genuinely the most complex vehicle in the catalogue: **two battery
chemistries**, each with multiple sizes.
| Chemistry | Size | Range |
|---|---|---|
| NCA | 280kWh | 140 miles |
| NCA | 375kWh | 190 miles |
| NCA | 470kWh | 235 miles |
| LFP | 350kWh | 175 miles |
| LFP | 500kWh | 250 miles |

**Wrightbus GB Kite Electroliner** — three lengths, shares its buying entry
with the Hydroliner (Electric/Hydrogen selector).
| Length | Max capacity | Max seated | Max standing |
|---|---|---|---|
| 10.9m | 78 | 37 | 39 |
| 11.6m | 79 | 41 | 44 |
| 12.5m | 82 | 45 | 51 |

Battery: 442kWh/300mi or 528kWh/365mi (same battery options regardless of
length). **398 can use any length of Electroliner, or the Hydroliner —
originally pinned to the 10.9m max-standing config for luggage space, but
that pin was dropped once the Hydroliner turned out not to share the
Electroliner's lengths.**

**ADL Enviro200EV** — lengths 9.9m, 10.9m, 11.7m (a different length set
from the diesel MMC).
| Length | Seated | Standing |
|---|---|---|
| 9.9m | 33 | 40 |
| 10.9m | 39 | 45 |
| 11.7m | 43 | 49 |

Battery: one size, 400kWh. Range: 9.9m=300mi, 10.9m=285mi, 11.7m=270mi.

**Yutong E10** (10.9m): 29 seats + 4 tip-ups, standing 37 (worked out from
max capacity 70 minus seats+tip-ups). Battery: 350kWh/230mi or 422kWh/275mi.

**Yutong E12** (12.2m): 34 seats + 5 tip-ups, standing 31 (worked out from
max capacity 70 minus seats+tip-ups). Battery: 350kWh/225mi or 422kWh/275mi
(same battery options as the E10, different range).

---

### 80,000s — electric double-deckers

**ADL Enviro400EV** — fixed **11.1m**. Capacity: 80 seated (51 upper deck,
29 lower deck), 18 standing (estimated, interpolated from the diesel
Enviro400 MMC — not a real figure). Battery: 354kWh/215mi or 472kWh/285mi.

**StreetDeck Electroliner** — fixed **10.7m** (a different length from the
Ultroliner's range — confirms the three StreetDeck variants genuinely
differ, not identical stats with a power selector). Capacity: max capacity
84, max seated 73, max standing 14 (max-seating/max-standing pattern).
Battery: one size, 442kWh/275mi.

*(Dropped from the catalogue: Volvo BZL DD — no real data available, and the
StreetDeck Electroliner already covers this space. Also dropped: Yutong
U11DD/"E12DD" — considered, then removed by choice.)*

---

### 87,000 — hydrogen double-deckers (sub-range within 80,000s)

**StreetDeck Hydroliner** — fixed **10.9m**. Capacity: max capacity 90, max
seated 69, max standing 24 (max-seating/max-standing pattern). Fuel:
hydrogen tank 27kg + a **fixed 111kWh buffer battery**, 295 mile range (one
tank size only).

---

### 90,000s — support fleet

Unchanged from the existing OPERATIONS.md spec — Ford Transit Custom /
E-Transit Custom, Mercedes Sprinter crew van (diesel and electric), Skoda
Octavia Estate, Vauxhall Corsa / Corsa Electric, Skoda Enyaq, heavy recovery
unit. Not part of this session's work.

---

## 3a. Training buses

A separate category, not a fleet-number range — any vehicle can be a
training bus if fitted out as one:
- **Instructor mirrors** fitted (see §2) — required, not optional, on any
  training vehicle.
- Uses one of a **dedicated set of training liveries** — exclusive to
  training buses, no ordinary bus may use them.
- **Cannot be used in service** at all, under any circumstances.
- Shows an **L-plate** (see game assets) in the route number box position
  instead of a route number — the livery itself is unaffected, this is a
  straight swap of what goes in that one spot.

## 4. Dropped from the catalogue (for the record — don't reintroduce)

- **Volvo B8L (tri-axle)** — was a chassis, not a complete vehicle. Replaced
  by the **ADL Enviro500**.
- **Volvo BZL DD** — no real data available; StreetDeck Electroliner covers
  the same space.
- **Yutong U11DD** ("E12DD" was the wrong name for it) — considered, then
  dropped by choice.
- **Plain diesel Volvo 7900, and the 7900 at 10.6m or articulated** — don't
  exist in the Scottish fleet.

## 3b. Depot energy infrastructure

**NOTE: this belongs in OPERATIONS.md §15 (Fuel and energy) alongside the
existing pantograph charging content — added here for now since a current
copy of OPERATIONS.md wasn't available. Migrate on next sync.**

**Running cost rule:** electric and hydrogen vehicles cost **less than
diesel** in both maintenance and recharging/refuelling — a genuine ongoing
saving, not just an upfront price difference.

**Hydrogen refuelling** — a depot needs hydrogen facilities built before a
hydrogen bus can be fuelled there, the same one-off build-cost pattern as
electric chargers. Any depot with facilities can build it. Before a depot
has its own, a hydrogen bus can refuel at **Volvo** (the universal servicing
business, already the fallback for maintenance/MOT/parts) at a premium.

**On-site hydrogen production** — an alternative to buying hydrogen in: a
one-off facility build cost, but cheaper hydrogen afterward than buying it
in from outside.

**Solar panels and batteries** — separate purchases, not one combined cost:
- Batteries store solar power generated during the day.
- Batteries also charge overnight on a **time-of-use cheap-electricity
  rate** — separate from, and stacking with, the stores director's existing
  regional volume discount on electricity.
- Stored energy (solar + cheap overnight charge) powers the depot's own
  buses during the day.
- The same infrastructure can also be sold via **charger hire** (existing
  mechanic, §OPERATIONS.md) to make extra profit charging external
  companies' vehicles during the day.
- **Solar generation varies by both season and region** — not a flat
  year-round figure.

## 4a. Base prices

Claude's estimates, based on real UK new-vehicle pricing patterns — confirmed
by the player except the two hydrogen figures, which were revised down.
**Price is for the vehicle's shortest/cheapest configuration only** — a
longer length, a bigger battery/tank, or fitted options all add their own
premium on top, not yet worked out.

| Vehicle | Base price |
|---|---|
| ADL Enviro400 MMC | £235,000 |
| ADL Enviro500 | £265,000 |
| StreetDeck Ultroliner | £310,000 |
| ADL Enviro200 MMC | £165,000 |
| Volvo 7900 Hybrid | £240,000 |
| MCV Evora | £155,000 |
| Sprinter/EVM Cityline (diesel) | £75,000 |
| Sprinter/EVM Cityline (electric) | £125,000 |
| Volvo 9700 | £290,000 |
| Volvo 9700DD | £420,000 |
| Yutong coach (T12E/T15E) | £310,000 |
| ADL Enviro400 open-top | Priced as its donor vehicle (Enviro400 MMC or Enviro400EV) |
| Wrightbus GB Kite Hydroliner | £420,000 |
| Wrightbus StreetDeck Hydroliner | £550,000 |
| Volvo 7900 Electric (NCA base) | £320,000 |
| Wrightbus GB Kite Electroliner | £350,000 |
| ADL Enviro200EV | £290,000 |
| Yutong E10/E12 | £300,000 |
| ADL Enviro400EV | £380,000 |
| Wrightbus StreetDeck Electroliner | £560,000 |

## 5. Open gaps — need real figures, don't estimate

None remaining — every gap from previous versions of this file, including
the MCV Evora's 10.8m capacity, has now been closed with confirmed real
figures.
