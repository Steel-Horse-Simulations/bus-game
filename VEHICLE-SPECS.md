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

(The Yutong E10/E12's own tip-up figures — 4 and 5 respectively — moved to
§4, "Dropped from the catalogue," alongside the rest of their specs, now
that both models are fully removed from the game.)

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

**Toilets** are not a configurable option:
- **Standard on every coach**, already included in the coach capacity figures
  below — no separate seat deduction.
- **Never available on the EVM Cityline minibus.** Instead: if the total
  journey is **over 4 hours**, the Cityline must stop after **3 hours** for a
  toilet break. If the journey is **under 4 hours**, it can run straight
  through with no stop at all. A duty-planning constraint for long tour work,
  not a repeating "every 4 hours" cycle.
- Required (not optional) for: all long distance journeys.

---

**Open-top conversion.** An existing vehicle can be converted to open-top
for **£10,000**, and this **cannot be undone**. Only available on vehicles
that have a defined open-top variant in the catalogue — currently the
Wrightbus StreetDeck (diesel, electric and hydrogen) only. The ADL
Enviro400 open-top (diesel and electric) that used to fill this slot is
dropped entirely (2026-11-13, the user's own call — it only existed
because no real open-top vehicle was known yet).

## 2. Options — selection type, price and general effect

Selection type is checkbox unless noted. Effect is the general rule applying
across every vehicle it's available on; per-vehicle figures (fuel tank,
battery) are in §3 against each vehicle. Prices confirmed 2026-10-18 — a
one-off cost at purchase, applied once (not per seat/litre/kg multiplied
twice) unless the option's own row says otherwise.

| Option | Power type | Price | Effect |
|---|---|---|---|
| CCTV cameras | All | Standard, no price | **Standard on every vehicle**, not optional |
| CCTV audio (dropdown: none / cab / full) | All | None £0 · Cab-only £150 · Full £450 | See below |
| USB and power sockets | All | **£30 per seat** (seated capacity only, never standing) | Small satisfaction boost + slight marketing/awareness boost |
| Wi-Fi | All | £2,200 flat | Same shape as USB, bigger effect — matters more to passengers |
| Comfier seats | All | **£120 per seat** (seated capacity only) | Bigger effect than Wi-Fi, no marketing boost. Scales on a **binary long-distance / short-journey split**, not continuously |
| Air conditioning | All | £8,000 flat (**£3,000 on the EVM Cityline minibus**) | Bigger effect than Wi-Fi, no marketing boost. **Seasonal** — bigger boost in summer months |
| Next-stop audio | All | £2,500 flat | Satisfaction + marketing boost. Matters **more** than screens (accessibility: essential for visually impaired passengers) |
| Passenger info screens | All | £3,500 flat | Satisfaction + marketing boost, smaller than audio |
| Premium driver seat | All | £1,800 flat | Driver happiness boost **and** reduces sickness/turnover — feeds into the existing warning/dismissal system |
| Larger fuel tank | Diesel only | **£15 per extra litre** above the vehicle's own base tank — see §3 and the worked examples below | Per-vehicle range boost — see §3 |
| Larger battery pack (dropdown) | Electric only | **£300 per extra kWh** above the base pack, except the Volvo 7900 Electric's own named tiers (below) — see §3 | Per-vehicle range boost — see §3 |
| Larger hydrogen tank (dropdown) | Hydrogen only | **£1,000 per extra kg** above the base tank — see §3 (Kite and StreetDeck Hydroliners already have their tank tiers recorded there) | Per-vehicle range boost — see §3 |
| Pantograph charging | Electric only | **£20,000** on the vehicle itself | Enables opportunity charging during layovers, reducing overnight depot charging need. Separate from the depot-side infrastructure: **£3,500 per stop**; at a bus station/interchange, **one per stance**, not one for the whole site |
| Low floor conversion | EVM Cityline only | £18,000 | Purely functional — satisfies accessibility requirements, avoids the stepped-vehicle accessibility penalty |
| Seatbelts | All | **£90 per seat** (seated capacity only) on non-coaches; **standard and free on coaches** | Standard on coaches. On other vehicle types, a purely cosmetic option with no in-game effect |
| Instructor mirrors | All | £400 flat | Training vehicles only. Purely functional — lets the instructor see properly. Not available/relevant on any non-training vehicle |
| Adding seats beyond the standard layout | All | **£120 per added seat** | New, confirmed 2026-10-18 — not yet given a passenger-facing effect beyond raising capacity |
| New luggage racks (vehicles without them) | All | **£1,500 per vehicle**, flat | New, confirmed 2026-10-18 |

**CCTV audio detail:**
- **Cab-only audio** — protects the driver in a complaint (evidence), slightly
  deters abuse.
- **Full audio** — **disliked** on ordinary routes (feels intrusive, a
  negative satisfaction effect), but **liked** on routes with a known
  abuse/bad-behaviour problem, since it makes passengers feel safer there.
  Requires a new route flag, set by the operations manager, shown in the
  route list. Once flagged, full-audio vehicles are preferentially assigned
  to that route where possible.

**Smaller tank/battery/hydrogen-tank alternatives are a discount, not a
separate price** (confirmed 2026-10-18): the bigger option is the base —
already what §3's/§4a's base prices assume — and choosing a *smaller*
tank/battery/hydrogen tank removes exactly what the step up would have
cost, at the same per-unit rate. Two worked examples, both confirmed
directly:
- **ADL Enviro400 (diesel), 200L smaller tank (350mi)** — −£1,125 off the
  £235,000 base (275L/475mi base; 75L × £15/L).
- **Wrightbus StreetDeck Ultroliner, 190L smaller tank (330mi)** — −£825 off
  the £310,000 base (245L/425mi base; 55L × £15/L).

This only applies where the catalogue's own pair is explicitly named
"Standard tank" + "Smaller tank" (the Enviro400 and StreetDeck Ultroliner).
The Volvo 9700's own "Standard tank" (480L) vs "InterCity tank" (600L) pair
is named differently and reads the other way round under the general
rule above — InterCity is the paid-for upgrade, not a relabelled
"smaller": **+£1,800** (120L × £15/L) over the 480L Standard base. Flagged
here rather than assumed, since the user's own confirmation only covered
the two "Standard/Smaller" pairs by name.

**Volvo 7900 Electric's own named battery tiers** (confirmed 2026-10-18,
given directly rather than computed from a flat per-kWh rate, since they
don't reduce to one evenly — NCA is £300/kWh, LFP is £250/kWh, both
measured against the 280kWh NCA base, but the LFP figures below don't
match a plain "extra kWh × £250" calculation and are used exactly as
given instead):

| Pack | Price |
|---|---|
| NCA 280kWh (base) | £0 |
| NCA 375kWh | +£28,500 |
| NCA 470kWh | +£57,000 |
| LFP 350kWh | +£3,500 |
| LFP 500kWh | +£41,000 |

---

## 3. Vehicle catalogue, by fleet number category

Organised by the current category-digit scheme (OPERATIONS.md §3, full
spec UK-EXPANSION.md §14) rather than the old X,000-range convention
(superseded everywhere, 2026-10-30).

Every vehicle: **1 wheelchair space additional** to the figures below (§1).

### Category 4 — double-deckers, twin-axle (diesel)

**ADL Enviro400 MMC** — built on the **Volvo B5TL chassis**
| Length | Seated | Standing |
|---|---|---|
| 10.5m | 74 | 16 |
| 10.9m | 82 | 18 |
| 11.5m | 85 | 20 |

Fuel: standard tank 275L / ~475 miles; smaller tank option 200L / ~350 miles.

**(The ADL Enviro500 that used to be listed here is gone from the
catalogue — replaced by the ADL Enviro400 XLB, category digit 5,
tri-axle; see UK-EXPANSION.md §14a for the confirmed replacement spec.
Leaving it listed under a renamed header would have kept a dropped
vehicle looking current.)**

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

### Category 5 — double-deckers, tri-axle

**ADL Enviro400 XLB** — fixed **13.4m**, diesel only. Replaces the ADL
Enviro500 above (UK-EXPANSION.md §14a, confirmed final spec). Base price
**£270,000**. Capacity: **100 fixed seats** (61 upper deck, 36 lower deck)
+ 3 tip-ups, 25 standing (the tip-ups trade off against standing space,
not adding to the total capacity ceiling). Fuel: one tank size, **250L /
380 miles**. Airlink 100's own vehicle requirement now points at this XLB
(it was previously a 13m Volvo 9700DD).

---

### Category 3 / Category 2 — single-deckers and midibuses

**ADL Enviro200 MMC** — one model spanning both categories by length:
8.9m/9.7m/10.8m land in **category 2 (midibus)**; 11.5m/11.8m land in
**category 3 (full-size single-deck)**.
| Length | Seated | Standing |
|---|---|---|
| 8.9m | 30 | 14 |
| 9.7m | 34 | 15 |
| 10.8m | 40 | 16 |
| 11.5m | 43 | 17 |
| 11.8m | 43 | 17 |

Fuel: one tank size, 220L. Range: 8.9m=500mi, 9.7m=490mi, 10.8m=475mi,
11.5m=460mi, 11.8m=440mi.

**Volvo 7900 Hybrid** — fixed **12m**, category 3. Only Hybrid and Electric
variants exist in Scotland (see "Category 3e" below for Electric); plain
diesel and the 10.6m length don't exist here and are dropped from the
catalogue. Capacity: 38 seated, 62 standing.

Fuel: one tank size (no options), 425 mile range.

**MCV Evora** — new addition. 10.8m lands in **category 2**, 12.9m in
**category 3** (same threshold as the Enviro200 MMC).
| Length | Seated | Standing | Notes |
|---|---|---|---|
| 10.8m | 35 | 34 (wheelchair in use) / 43 (bay converted) | 69+wheelchair / 78 total. Confirmed real figure, no longer provisional |
| 12.9m | 47 | 38 (wheelchair in use) / 46 (bay converted) | 86 total / 93 total |

Fuel: one tank size, 350L. Range: 10.8m=990mi, 12.9m=900mi.

---

### Category 1 — minibus

**Mercedes-Benz Sprinter/EVM Cityline** — fixed length **7.4m** (7367mm).
No toilet ever available (§1's 4-hour rule applies). Low floor is a
retrofittable option (defaults to steps).
- Diesel: 93L tank, 350 mile range
- Electric: 115kWh battery, 190 mile range

---

### Category 6 / Category 7 — coaches (twin-axle / tri-axle)

**Volvo 9700** — lengths 12.4m (twin-axle), 13.1m/13.9m/15m (tri-axle).
Capacity: **twin-axle = 53 seated, tri-axle = 65 seated** (doesn't vary
further by the specific tri-axle length). Fuel: standard tank 480L / 900
miles; larger "InterCity" tank option 600L / 1125 miles — only these two
tank sizes exist.

Both lengths land in category 6 at 12.4m or category 7 at 13.1m/13.9m/15m —
the twin-/tri-axle digit is derived from length, not chosen directly.

**Volvo 9700DD** — lengths 13m and 14.8m (both tri-axle, category 7 — a separate buying
menu entry from the 9700, not merged, since single vs double deck is a
fundamental distinction). Fuel: one tank size in Scotland, 690L. Range:
13m = 1080 miles, 14.8m = 980 miles. **Airlink 100 requires the 13m
version specifically.**

*(Dropped from the catalogue: the Yutong coach — see §4.)*

---

### Category 4 — open-top double-deckers (sightseeing only)

**Wrightbus StreetDeck open-top** (replaces the ADL Enviro400 open-top,
dropped 2026-11-13) — all three powers **reuse their donor StreetDeck's
own stats entirely** (fuel/battery/hydrogen tank, chassis) at the length
below, except for tour-specific options (tour audio + PA, languages) and
standing capacity, which open-top removes (max capacity becomes max
seated):
- **Diesel** (10.6m, not the Ultroliner's own shortest-by-default length —
  picked because its 74 seated sits closest to the electric/hydrogen
  seated counts below): 74 seated, 0 standing, 245L/425mi standard tank
  (190L/330mi smaller tank option)
- **Electric** (10.7m): reuses the Electroliner's figures — 73 seated, 0
  standing, 442kWh/275mi
- **Hydrogen** (10.9m): reuses the Hydroliner's figures — 69 seated, 0
  standing, 27kg hydrogen tank + 111kWh buffer battery, 295mi

---

### Category 3h — hydrogen single-deckers

**Wrightbus GB Kite Hydroliner** — fixed length **12.2m**. One buying entry
shared with the Electroliner below (Electric/Hydrogen selector). Capacity:
max capacity 79, max seated 41, max standing 41 (max-seating/max-standing
pattern, §1). Fuel: hydrogen tank 32kg/340mi, 40kg/425mi, or 50kg/530mi, plus
a **fixed 54kWh buffer battery** (doesn't vary with tank size).

---

### Category 3e — electric single-deckers

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

*(Dropped from the catalogue: Yutong E10/E12 — see §4. Yutong's electric
through-charging mechanic, OPERATIONS.md §15, no longer has any in-game
vehicle to apply to now that both Yutong electric models are gone.)*

---

### Category 4e — electric double-deckers

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

### Category 4h — hydrogen double-deckers

**StreetDeck Hydroliner** — fixed **10.9m**. Capacity: max capacity 90, max
seated 69, max standing 24 (max-seating/max-standing pattern). Fuel:
hydrogen tank 27kg + a **fixed 111kWh buffer battery**, 295 mile range (one
tank size only).

---

### Category 9 — support fleet

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
- **Yutong E10/E12** (electric single-deckers, category 3e) — soft-removed
  as `discontinued` in T179 (2026-11-13: every manufacturer can now offer
  electric via the re-power programme, removing Yutong's one
  differentiator), then fully removed from the catalogue in T181 the same
  day, per the user's own confirmation. Real figures, kept for the record:
  one merged buying-menu entry, base price **£300,000**.
  - **E10** (10.9m): 29 seated + 4 tip-ups, 37 standing (worked out from a
    max capacity of 70 minus seats+tip-ups). Battery: 350kWh/230mi or
    422kWh/275mi.
  - **E12** (12.2m): 34 seated + 5 tip-ups, 31 standing (same method).
    Battery: 350kWh/225mi or 422kWh/275mi (same options as the E10,
    different range). Priced at the E10 base **+£19,500** (length-pricing
    formula, confirmed 2026-10-18).
- **Yutong coach** (category 6/7, twin-/tri-axle by length) — soft-removed
  as `discontinued` in T179 alongside the E10/E12 above, then fully removed
  in T181. Real models are **GTe12/GTe14** — corrected from the originally
  recorded "T12E"/"T15E" names, with GTe14's real length confirmed as
  **14m**, not the 15m first recorded (see OPEN-ITEMS.md T99/T101 for the
  correction). Real figures, kept for the record: one merged buying-menu
  entry, base price **£310,000**.
  - **GTe12** (12m, twin-axle): 50 seated. Battery: 399kWh/320mi or
    465kWh/370mi.
  - **GTe14** (14m, tri-axle): 57 seated. Battery: 621kWh/335mi or
    704kWh/380mi. Priced at the GTe12 base **+£31,000** raw length delta,
    plus the standard twin→tri-axle crossing charge.
  - Was also the only vehicle covered by **Yutong through-charging**
    (confirmed 2026-11-01, daisy-chaining up to 4 electric vehicles off one
    charger connection, power shared dynamically — OPERATIONS.md §15); that
    mechanic now has no in-game vehicle left to apply to, since the E10/E12
    above are gone too.

## 3b. Depot energy infrastructure

**Migrated to OPERATIONS.md §15 (Fuel and energy) → "Depot infrastructure",
2026-10-30** — the note above about a missing OPERATIONS.md copy no longer
applies. OPERATIONS.md §15 now holds the full, current depot infrastructure
spec (diesel/hydrogen pumps and tanks, chargers, grid connection tiers,
solar, battery, workshop bays, inspection pits, wash bays, parking, build
times, per-tier caps, fuelling-time formulas and hydrogen transport
logistics) — this duplicate copy is intentionally gone rather than kept in
sync by hand in two places.

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
| Wrightbus StreetDeck open-top | Priced as its donor vehicle (Ultroliner/Electroliner/Hydroliner) |
| Wrightbus GB Kite Hydroliner | £420,000 |
| Wrightbus StreetDeck Hydroliner | £550,000 |
| Volvo 7900 Electric (NCA base) | £320,000 |
| Wrightbus GB Kite Electroliner | £350,000 |
| ADL Enviro200EV | £290,000 |
| ADL Enviro400EV | £380,000 |
| Wrightbus StreetDeck Electroliner | £560,000 |

(Yutong coach and Yutong E10/E12 dropped from this table — both fully
removed from the catalogue, §4 above.)

## 5. Open gaps — need real figures, don't estimate

None remaining — every gap from previous versions of this file, including
the MCV Evora's 10.8m capacity, has now been closed with confirmed real
figures.
