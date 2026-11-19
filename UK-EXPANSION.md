# UK-EXPANSION.md — whole-UK scope expansion, full reference

Companion to DESIGN.md, OPERATIONS.md, CLAUDE.md and VEHICLE-SPECS.md. This
compiles everything from the UK expansion sessions in chat. Where this file
gives a figure that conflicts with anything already in those documents,
**this file wins** — it's the more recent, more detailed source. Add it to
CLAUDE.md's reference material list.

Active priority, not a someday note. Nothing here affects work already in
progress; this is phase 1/5/6/7/9 territory throughout.

Sightseeing services are exempt from EVERY mandatory area livery in the
game (§7), on top of whatever else is already exempt there — a general
rule, not London-specific.

---

## 1. Map boundary

Playable area expands to the whole UK (England, Scotland, Wales, Northern
Ireland) plus the Isle of Man.

- GB: use the existing `great-britain-latest.osm.pbf`, simply drop the
  current clip (the old "consistent southernmost limit" rule, originally
  there to exclude Newcastle, is now obsolete).
- Northern Ireland: pull from Geofabrik's combined "Ireland and Northern
  Ireland" extract, clipping OUT the Republic of Ireland — NI only.
- Isle of Man: its own separate Geofabrik file, merged in — it isn't part
  of any other regional extract.

Whether Scotland-specific systems (the island/remote-area review, the
existing £2 Highland/SPT/Aberdeen cap, §8) get built out as equivalents
elsewhere, or stay special cases, is still genuinely undecided — flag
rather than guess when it becomes relevant to a specific system.

---

## 2. Dealer network — real data, complete

**Yutong** (England): Pelican Bus and Coach, PJCC+3X Castleford, UK.

**MCV Bus & Coach Ltd** (the MCV Evora dealer, confirmed 2026-11-01):
94WP+R2 Ely, UK.

**Wrightbus**: VM4F+RF Ballymena, UK (Northern Ireland — its real HQ/
factory, replacing the old "nearest depot to Stranraer" workaround now NI
is in scope).

**Alexander Dennis**: 254F+F2 Falkirk, UK — OPERATIONS.md's own "1
location, near Falkirk" (§"Buying new vehicles"), now with an exact
position (supplied directly by the user, 2026-10-02).

**Western Commercial** (the Mercedes-Benz/EVM dealer): VM4Q+J8 Glasgow,
WHR2+86 Broxburn (Edinburgh), RXH4+58 Bellshill, F4M5+PW Dundee, UK —
OPERATIONS.md's own "4 locations: Dundee, Edinburgh (Broxburn), Bellshill,
Glasgow," now with exact positions (supplied directly by the user,
2026-10-02).

**Volvo** — complete network (confirmed finished; mid-Wales, the north
Wales coast, and Dorset checked and confirmed genuinely sparse, nothing
missing there):

*Scotland (existing, unchanged):* Inverness FQRJ+H3, Aberdeen 3V89+J9,
Perth CG8C+4Q, Edinburgh/Broxburn WGPV+WF, Glasgow VJ5X+6P, Glasgow
East/Hamilton QWRG+98, Ayr FCQC+FM, Carlisle W2FW+X9.

*England/Wales:* Newcastle-upon-Tyne (Washington) VCXV+J3, Stockton-on-Tees
HPHG+7Q, York (Roecliffe) 3HQQ+PG, Batley P9Q3+MP, Castleford PJ82+9P,
Pontefract JP2C+PP, Rotherham CJ4R+V9, Leicester (Coalville) MMX8+Q2,
Wellingborough 8746+22, Cambridge (Ely) 96QH+2J, Milton Keynes (Bedford)
3GQJ+WF, Banbury 2PP4+HJ, London North (Enfield) MX3C+GQ, London East
(Grays) F7JC+VW, London South (Croydon) 9VJC+98, Reading C2FF+2R, London
West (Hayes) GH2R+6W, Lincoln (North Hykeham) 5CV4+FG, Nottingham VQ3H+H8,
Walsall HXMH+2M, Rugby 9PRR+H3, Coventry 9G9J+C9, Warwick 7CV2+43,
Peterborough GPWX+R9, Swindon H6JR+H5, Witham RJ3X+F7, Aylesford 8F3V+27,
Hythe 32J6+XV, Burgess Hill XV34+86, Southampton WGJG+28, Exeter PH5P+RG,
Plymouth CV8C+C7, Saint Austell C5CC+QF, Redruth 6QPG+W4, Bridgwater
5226+PR, Bristol G8HP+RW, Newport H392+Q6, Swansea (Winch Wen) M33W+7V,
Frome 5HRC+FP, Gloucester RPQM+9V, Evesham 33C8+WH, Hull PPXV+66,
Birmingham East G59W+W7, Birmingham West (Kingswinford) GV34+HJ, Alfreton
3JMM+65, Newcastle 2QW2+FJ (a second, distinct point from the
Washington one above), Deeside 6XHM+MR, Manchester FM8P+GC, Liverpool
F4MR+GP, Chorley M82V+97, Bury Saint Edmunds 5JPC+CC, Ipswich 26H4+H7,
Thetford CPFX+58, Norwich J7V6+JJ.

*Northern Ireland:* Ballyclare P2X4+FW, Dungannon F7M7+G7, Coleraine
48VV+2V, Newry 5JGR+W9.

**Special:** Loughborough (QQHG+HR, UK) is NOT a Volvo service centre — it's
a body and paintshop, functioning exactly like Ferrymill Motors (same
repaint pricing/turnaround/capacity rules). A second dedicated repaint
facility, giving England/Midlands players an option without funnelling
through Glasgow.

All UK coordinates are Plus Codes ("+" grid references) — parse
accordingly, not as postcodes.

---

## 3. EU driver hours — double-manning

Double-manning (two drivers on one duty) lets the vehicle skip the
overnight/rest stop a single driver would need, running much longer
continuously.

- Applied AUTOMATICALLY whenever a route/tour is long enough that
  single-driver hours would be exceeded — not a manual player toggle.
- Both drivers paid normally for the whole duty — straightforwardly costs
  double, no discount for the "resting" driver's portion.
- Kept to a **minimum** — see §4's driver-swap hierarchy, which this now
  sits at the bottom of.

---

## 4. Long distance driver duty logistics — full hierarchy

When a long distance driver can't get home within a shift, there's a clear
preference order:

1. **Preferred: driver swap at a bus station**, if a depot exists in that
   area along the route — like a relay, each driver only covers part of
   the route and gets home the same day. No overnight cost, no
   double-manning.
2. **Overnight stay**, if no swap is available: **£120 per rest period**
   the driver needs, plus **30 minutes' extra travel time** built into
   both the start and end of shifts spent away (getting to/from the
   accommodation).
3. **Double-manning** (§3) — the last resort, only used when no depot
   along the route can offer a swap.

---

## 5. Outstations without a depot group

A small outstation (max 5 spaces) can be built in an area with NO depot
group yet at all — not linked to an existing depot, unlike the current
outstation rule. It can later be upgraded into a proper depot once a
depot group is established there, and can itself become the FIRST depot
in that new group.

---

## 6. Pre-activation staffing/fleet preview

When viewing a built-but-not-yet-activated route, show how many
ADDITIONAL drivers and buses would be needed to start operating it.
Subtracts existing spare capacity at the depot — shows only the genuine
shortfall. Purely informational, doesn't block activation.

---

## 7. Mandatory regional/national liveries (9 total)

Two exemption patterns, plus one universal addition:
- **STANDARD**: long distance vehicles exempt
- **NONE**: every vehicle must comply, no exceptions
- **UNIVERSAL**: sightseeing services are exempt from EVERY mandatory
  livery in this table, regardless of which pattern it otherwise
  follows — this applies on top of STANDARD or NONE, not instead of it

General enforcement rule (applies to ALL mandatory liveries, including the
pre-existing SPT and island liveries): a bus transferred in gets a
**1-month grace period** in its old livery. After that, **25% of revenue**
fined for every service run in the wrong livery.

| Area | Livery | Trigger | Exemptions |
|---|---|---|---|
| Greater Manchester | Bee Network | Depot-based | Standard |
| Greater London | TfL | Zone-based (§8) — see below, this table's Depot/Route split doesn't apply to London | Standard + sightseeing (universal) |
| Liverpool City + St Helens | Merseytravel Metro | Route-based, 40% mileage threshold or starts/ends in area | Standard |
| Belfast | Translink Metro | Depot-based | Standard |
| Isle of Man | Bus Vannin | Whole island | NONE |
| Isle of Wight | Southern Vectis | Whole island | NONE |
| Bristol + Bath | WESTbus | Depot-based | Standard |
| Wales (all depots based there) | TrawsCymru | Depot-based | Standard |
| Plymouth + Cornwall | Transport for Cornwall | Depot-based | Standard |

Manchester and London went through two reversals (depot-based →
route-based 30% → back to depot-based) — depot-based is final for those
two. Don't reintroduce the route-based version.

---

## 8. Fare cap systems by nation (4 of 5 done; London pending map)

**General rule across every fare cap system below (Highland/SPT/Aberdeen,
England, Wales, London):** sightseeing services get NO fare cap anywhere —
full price always applies, no exceptions. This generalises what was already
true of the original Highland/SPT £2 cap into a rule that holds across
every fare cap in the game.

### Highland + SPT + Aberdeen
£2 single cap within any one zone, £4 crossing between two of them. Extended
to a third zone, Aberdeen (Aberdeen City and Aberdeenshire), 2026-10-17 —
matching the real scheme's own extension — on the same terms as the
original two. See DESIGN.md §9 for full detail, including why no
England-style special higher-cap crossing case is needed for Aberdeen (it's
nowhere near the England border, unlike SPT).

### England
- All services: single ticket capped at **£3**.
- Cross-border: if a journey starts in England, capped crossing borders.
  If it starts elsewhere and enters England, only the English portion is
  capped — same portion-based logic as Highland/SPT.
- **Crossing from SPT into England specifically is capped at £5** — a
  distinct, higher figure for this one crossing, on top of the general
  rule above.

### Wales
Different structure — age/status-based, not a flat price cap:
- Ages 5–21: **£1** single fare
- Over-60s: **free**
- Disabled residents: **free**
- Under 5: **free**
- Welsh government reimburses the operator fully for all of this — same
  "operator gets the real fare, government pays the gap" pattern as every
  other cap in the game.

### Northern Ireland
**No fare cap system at all.** Stays outside this whole framework.

### London — COMPLETE

**Fares:**
- Any single journey capped at **£1.75** (flat, not zone-scaled).
- Real Day/Week travelcard-style pricing by zone combination:

| Zone(s) | One Day Anytime | Monday to Sunday |
|---|---|---|
| Zone 1 only | £8.90 | £44.70 |
| Zone 1 and 2 | £8.90 | £44.70 |
| Zone 1, 2 and 3 | £10.50 | £52.50 |
| Zone 1, 2, 3 and 4 | £12.80 | £64.20 |
| Zone 1, 2, 3, 4 and 5 | £15.30 | £76.40 |
| Zone 1, 2, 3, 4, 5 and 6 | £16.30 | £81.60 |

**Zone map:** real "nominal fare zone" data, sourced from
data.london.gov.uk (https://data.london.gov.uk/dataset/mylondon?resource=94baeb22-9d31-4332-95ab-84d4aaf72f22),
based on census output areas. The source itself notes official TfL fare
zones are actually defined by specific stations/points along lines, not
clean polygons — this nominal version is the practical approximation to
build from; use the linked dataset directly for real boundary data rather
than approximating from an image. Six zones, roughly concentric but
genuinely irregular in real shape: Zone 1 (innermost — Westminster/City
of London/Kensington & Chelsea core) outward through Zones 2, 3, 4, 5, to
Zone 6 (outermost).

**TfL livery trigger (final — replaces the earlier depot-based
placeholder in §7):**
- Any bus operating in **Zones 1-5**: TfL livery required, no threshold —
  blanket requirement for any presence there at all.
- **Zone 6 gets a lenient threshold instead**: a route can use a
  non-TfL livery if **less than 40%** of its route mileage is within
  Zone 6 specifically (this 40% test applies to Zone 6 only, not to
  Zones 1-5).
- Exemptions: long distance and sightseeing (standard
  pattern + the universal sightseeing exemption, §7).
- **Export direction, new rule**: a TfL-liveried bus moved to operate
  OUTSIDE the zones entirely CANNOT keep TfL livery — must be repainted.
  This is stricter than, and separate from, the general 1-month-grace-
  then-fine rule, which covers the import direction only (a bus arriving
  in a mandatory-livery area with an old livery).

---

## 8a. Depot group structure — London (fixed) and large conurbations (threshold-based)

### London — fixed four-way split

All depots built within the London fare zones (§8) are sorted into one of
**FOUR London depot groups**: North, East, South, West London. NOT part
of the existing 5-region scheme (North Scotland, West Scotland, East
Scotland, North England, Shetland) — London is its own thing entirely.

- Each of the 4 groups is **hidden from the player** until a depot
  actually exists in that specific area.
- The 4 groups do **NOT share buses or staff** with each other — fully
  isolated resource-wise, unlike ordinary depot groups elsewhere in the
  game which can loan/cascade between each other.
- Each group only operates routes **specifically assigned to it**.
- **Shared across all 4 groups**: only the very top tier — managing
  director and the company-wide directors (operations/stores/marketing).
  One set of each covering all of London.
- **NOT shared, separate per group**: everything below that, including
  the regional manager tier (operations manager, store manager, marketing
  manager) AND everything at depot manager/engineering manager level and
  below. Each of the 4 groups (North/East/South/West) effectively runs
  as its own self-contained mini-region with its own full management
  stack below the shared top tier.

### Large conurbations outside London — threshold-based split (new, general mechanic)

Genuinely different mechanic from London's fixed pre-built split. Applies
to ANY sufficiently large conurbation (Manchester was the trigger case,
but this is general — Birmingham, Leeds etc. could split the same way if
they grow large enough), not just Manchester specifically.

- Starts as one ordinary region, same as everywhere else.
- Once the conurbation's depot count reaches **~7 depots**, it splits
  into **two** sub-groups (not four like London).
- Split axis is **East/West or North/South, chosen dynamically** based
  on wherever the majority of the existing routes and depots actually
  sit at the point the threshold is crossed — not a fixed pre-determined
  direction the way London's four quadrants are baked in from the start.
- Below the threshold, the region behaves exactly like any other region
  in the game — nothing London-specific applies until the split actually
  triggers.

## 9. Long distance route numbering (routes mostly outside Scotland)

Long distance routes spending the majority of their route mileage OUTSIDE
Scotland get a 3-digit number starting at **300** (not 001 — 300 sits
clear above the 201+ contract range with headroom to spare).

- Must not match any service number operating anywhere else in the UK,
  nor any number in use in any area the route passes through.
- Collision matching for this specific comparison (long distance vs
  local) ignores BOTH leading zeros AND letters — "007", "07", "7", "X7"
  and "7A" all count as "7" for this check. DELIBERATELY NARROW SCOPE:
  does NOT affect the S/X/C prefix system elsewhere — S13/X13/C13 keep
  their normal relationship to plain route 13.
- Conflict resolution: a colliding new city/local route number gets
  bumped up by one — long distance numbers take priority and never
  change once assigned.
- Avoids the ranges already reserved for contracts (201+).

---

## 9a. Railair (RA-prefix, station-to-airport express)

Added 2026-10-30. A station-to-airport express product the **player
creates** — any route from a rail station to an airport can be set as
Railair, not a single fixed contract like AIR (DESIGN.md §10).

- **Coaches only.**
- **Numbering: RA1, RA2 and so on, counting up across the whole company**
  — not per depot group or council area, the only route-numbering scheme
  in the game that works this way (DESIGN.md §6's own prefix table flags
  this explicitly).
- **Limited stop, treated as InterCity** for timetabling and fare purposes.
- **Its own livery**, supplied by the user — use a placeholder badge until
  then. **Railair can only run in this livery, and this livery can only run
  on Railair** — a two-way exclusive lock, not the one-way vehicle locks
  Citylink/MegaBus already have (`livery-seed-data.mts`).
- **Needs luggage racks** (airport-spec conversion, VEHICLE-SPECS.md's own
  "Seats and luggage racks are shippable inventory" system) **and comfier
  seats**, the same equipment AIR and Express 500 already require
  (`OPERATIONS.md` §3 "Configurator").
- **Outside the £2 fare cap** (DESIGN.md §9), the same exclusion AIR and
  Express 500 already have.
- **Tickets**: Railair's own ticket, plus a **combined rail-and-bus
  ticket** that works with the main rail operator at the stations on the
  route — a ticket **shared with the rail company**, not sold purely by
  the player. The player receives **about 10% less** revenue from a
  combined ticket than from an equivalent Railair-only ticket.

---

## 10. Night bus routes (N-prefix)

**Numbering:** N + the day route's number (e.g. day route 9 → N9). A
standalone night route with no day counterpart gets its own independent
N-number (e.g. N50). **Mandatory, not optional** (confirmed 2026-11-01,
live user instruction) — a Night-type route's number must start with "N"
or it can't be saved. N-prefixed numbers only need to avoid colliding with
OTHER N-routes — no clash check against plain-numbered routes, since the
prefix already disambiguates them.

**Creation:** two ways —
1. As a time-based variant of an existing day route (reuses the existing
   variation-creation editing mechanism — branch/rejoin — but for
   time-of-day context; path CAN differ from the day route: more direct,
   fewer stops, or extended to serve nightlife areas).
2. As a genuinely standalone route, built from scratch, not linked to any
   day route at all.

**Scope:** opt-in per route — player chooses which get a night version,
not automatic.

**Operating window:** typically **2345–0400** (real figure, as a general
guide), but NOT tied
to the existing 2200–0700 staff night shift band — its own separate
window. Doesn't have to run to any fixed frequency at all: some night
routes run just once in each direction total, or a single bus doing one
out-and-back trip and nothing else. Where there IS a regular pattern,
it's much sparser than daytime — roughly every 30–60 minutes.

**Enforced limits (2026-11-01):** the last departure of the night may be
no later than **03:45**, and must actually arrive at its final
destination by **04:15** — the two are checked separately, since the
second depends on the route's own running time.

**Fare:** a flat night surcharge on top of the normal fare (roughly +50p
as an example figure, not necessarily final).

**Vehicle/accessibility:** inherits the day route's requirements exactly
where linked to one.

**Duty rules:**
- A bus stays on the SAME night service for the whole night — cannot
  switch from one night service directly to a different one mid-shift.
- Day-to-night direct transition IS allowed (linking into the night
  service at the start).
- Night-to-day transition is NOT allowed. A bus finishing a night service
  always returns to a depot for **at least 1 hour** (cleaning +
  fuelling/charging) before it can do anything else.

---

## 11. Passenger demand refinements

- **Long distance is pre-ticketed.** Long distance tickets are sold
  online in advance, so passengers only appear waiting at a long
  distance stop if they already hold a ticket — no walk-up/spontaneous
  demand generation the way local stops have. Long distance load factors
  are effectively locked in before the bus leaves the depot, unlike local
  routes where demand is generated dynamically.
- **Attractions generate more tourist demand** than an equivalent
  ordinary destination, and this demand is **somewhat seasonal** rather
  than flat year-round — ties into §12's seasonal services below.
- **Hotels generate higher demand specifically toward attractions,
  railway stations, airports and ferry terminals** — hotel-originating
  trips skew toward these destination types rather than being uniform
  across all destinations.

---

## 12. Seasonal services

A route, a variant, or — at the finest grain — an individual journey
within a timetable, that only operates during part of the year.

- **Defined via preset named seasons**, not custom player-set date
  ranges. Three seasons:
  - **Summer** — Easter to September
  - **Winter** — December to March (covers ski season — Cairngorm,
    Glenshee, Nevis Range etc.)
  - **Christmas** — November to early January
- **Granularity — three levels, all seasonal, not just whole routes:**
  1. A whole standalone route can be seasonal.
  2. A variant of an existing year-round route can be seasonal (mirrors
     night buses, §10's variant-creation approach).
  3. **An individual journey within a timetable can be flagged seasonal**
     on its own — the finest grain. A single journey time can be made to
     only run in a given season without touching anything else in that
     timetable.
- **Multiple/stacking seasons — genuinely flexible, not one-season-each:**
  - Several different seasonal timetables can coexist on the same route
    at once (e.g. a base year-round timetable, plus a separate Summer
    timetable, plus a separate Winter timetable, all active
    simultaneously, each only running in its own window).
  - A single timetable OR a whole route can itself be assigned to **more
    than one season at once** (e.g. active in both Summer and Christmas
    but not Winter) — not restricted to exactly one season each.
- **Staffing:** drivers and vehicles are **automatically reassigned
  elsewhere** when a seasonal route's season ends — they don't sit idle,
  and the player doesn't have to manually reassign them.
- **Creation of a standalone seasonal route:** its own dedicated number
  block, **800–899**, separate from a seasonal variant, which keeps its
  parent route's number.
- **Visibility:** a seasonal route stays visible on the route panel/map
  when out of season, shown as inactive/greyed out, rather than
  disappearing entirely.

---

## 13. Isle of Skye — real fixed content (major, data pending)

Unlike the rest of the island/remote-area review (§ in
bus-game-fare-caps-and-airports-2.md, which only covers livery/subsidy
treatment), Skye gets a much deeper treatment: **every local bus service
on the island becomes real fixed content**, not player-buildable —
matching the "locked in before the game ships" approach already used for
398, Airlink 100, Express 500 and X99, but scaled up to a whole island's
local network rather than one route.

- **Scope: ALL local services on Skye**, not just the council-contract
  majority (confirmed — even the smaller commercial minority gets the
  same real-fixed-content treatment, for consistency across the island).
- Each service uses its **real route number, real path/stops, and real
  timetable** — including real **seasonal** variations (§12), all
  sourced from actual data rather than generated.
- **Livery:** Skye already has its own established dedicated livery,
  "Rapsons" (bus-game-fare-caps-and-airports-2.md) — **confirmed still
  required**, unchanged in this real-fixed-content context.
- **Route list confirmed (7 routes) — timetables pending, arriving one
  at a time as they're downloaded.** ~~Route 54~~ was on the original
  list in error — it doesn't exist; it was replaced by 607 in the real
  world (see 608's own note below for where that corridor ended up).
  Routes 157 and 158 (Portree primary-school interchange shuttles) have
  since been dropped from scope entirely — school-run content and the
  mechanics it depended on (term-time timetable splits, the Portree High
  School wait/departure-order interchange) were dropped from the game,
  2026-11-08, leaving 157/158 with no real-world service left to model.
  **Routes 150, 152, 155, 159 and 56X were dropped from scope by the
  user's own decision, 2026-11-08** — each was a through-running/linked
  appendage, or (56X) a short branch off another kept route, rather than
  a self-contained service worth the real-content treatment on its own.
  **Route 607 was folded into 608 as one of its own shorter workings,
  not kept as a separate route** (same decision) — see 608's own entry
  below. Track receipt of each remaining route's real timetable (base +
  seasonal variants) here:

  | Route | Timetable received? |
  |---|---|
  | 52 | ✅ received, format understood |
  | 55 | ✅ received, format understood |
  | 56 | ✅ received, format understood |
  | 57A *(genuinely distinct from 57C, not a variation; Summer timetable only so far)* | ✅ received, format understood |
  | 57C *(genuinely distinct from 57A, not a variation; Summer timetable only so far)* | ✅ received, format understood |
  | 58 | ✅ received, format understood |
  | 608 *(includes 607's own shorter working — see below)* | ✅ received, format understood |

  **ALL 7 ROUTES NOW RECEIVED.** Remaining open items before this
  section is fully closed: confirming Skye's "Rapsons" livery still
  applies unchanged in this real-content context; building all 7
  routes' real stop geometry in-game before timetables can be coded in;
  608's own shorter (ex-607) working still needs its real departure times
  re-sourced, since the original 607/608 material was almost entirely
  bound up in school-run timetable splits that no longer apply.
- **Route 52 received (Portree - Armadale, Stagecoach North Scotland):**
  - **Seasonal/Summer timetable — fully confirmed:**
    - **Operative date range:** always starts on the **3rd Monday of May**
      and always ends on the **2nd Saturday of September**, every year —
      a simplified rule, not the PDF's literal printed dates (18 May – 12
      Sept 2026 is just what that rule works out to for this year) and
      not the earlier-stated "first Monday of May" (imprecise).
    - **Outbound (Portree Square → Armadale Pier), every Mon-Fri,
      year-round:** 0905, 1105, 1330, 1545.
    - **Return (Armadale Pier → Portree Square), every Mon-Fri,
      year-round:** 1035, 1235, 1505, 1710.
    - Plus a separate short working: dep New Broadford Hospital 0805 →
      arr Portree Square 0843, Monday-Friday (no Armadale-originating
      counterpart).
    - **Saturday: the entire Saturday 52 service (all 3 outbound times
      0905/1230/1545 and their returns) is a summer-only addition**, not
      part of the base timetable at all.
- **Route 55 (Kyle of Lochalsh - Glasnakille, Stagecoach North Scotland)
  received.** Confirmed details (as described by the user, not
  independently re-derived from the raw PDF grid — exact minute-by-minute
  times to be confirmed once the route is built in-game):
  - **Footnote polarity**: on 55, "a" = does not run Fridays, "b" = only
    runs Fridays — confirms a/b meaning is never fixed and must be read
    per-route, not assumed to match any other route's own convention.
  - Route 55 is self-contained — 1 bus and 1 driver cover it all day.
  - **Minibus requirement:** routes 55, 58 and 608 must all be operated
    with minibuses specifically, not full-size buses — **confirmed to
    mean a Mercedes Sprinter specifically**, not just any minibus class.
  - **Saturday minibus swap:** the 58's minibus and the 55's minibus get
    swapped with each other on Saturdays.
  - **Corrected:** the 55/58 Saturday minibus swap is DONE BY a Lead
    Driver or a Relief Lead Driver (a duty assigned to those senior
    roles) — the earlier "don't be" phrasing was a misspelling, not a
    restriction excluding those roles.
  - **Swap location, confirmed:** the bus travels from **Portree Depot**
    (Plus Code CQCQ+4V, Portree, United Kingdom) and the swap itself
    happens at **Broadford Yard**, which is an **outstation, not a full
    depot** (Plus Code 63VM+7JJ, Broadford, Isle of Skye, UK).
  - **Skye refuelling, general rule:** drivers normally keep the same bus
    all day and refuel at the depot, paid 15 minutes for doing so. Buses
    only get swapped at the depot during the day for maintenance needs.
  - **Skye refuelling, 55-specific exception:** between the 0940 and 1010
    services, the 55's driver takes the bus to a real filling station
    (Plus Code **63RV+G2, Broadford, Isle of Skye**) during a natural
    timetable gap rather than returning to a depot, and is paid for the
    *entire* gap. This mid-route refuelling arrangement is Skye-only;
    everywhere else in the game, refuelling only happens at depots.
- **Depot/outstation network and route unlock gating (major, part
  received):**
  - **Confirmed: Skye becomes a selectable starting region/scenario** for
    a new game. Choosing it hands the player Portree Depot already
    unlocked, replacing the normal build-your-first-depot process.
  - General mechanic: some routes are locked until specific outstations
    are rented or bought.
  - **Portree Depot** — full depot, has engineering facilities, starts
    rented, can be bought outright later.
  - **Broadford Yard** (outstation) — max 4 buses, can be rented OR
    bought. Plus Code 63VM+7JJ, Broadford, Isle of Skye, UK.
  - **Lonmore outstation** — free to rent, CANNOT be bought/owned
    (rent-only), described as "just a layby". Max 2 buses. Plus Code
    CFF2+XCC, Lonmore, Isle of Skye, UK.
  - **Fiscavaig** — no actual depot exists here at all; buses
    terminating here simply disappear from the map (no parking/facility
    representation needed).
  - **Route gating confirmed so far:**
    - 608: no outstation gating — only needs enough vehicles owned.
    - 55, 52: locked until Broadford Yard is rented/bought.
    - 56: locked until Lonmore is rented — **except** the 56's runs
      to/from Bernisdale, which operate out of Portree and so are NOT
      locked (only the rest of 56 needs Lonmore).
    - Not yet stated: gating for 57A, 57C — pending. (58 never leaves
      Portree — see below — so likely needs no outstation gating, but
      this hasn't been explicitly confirmed by the user yet.)
- **Route 58 (Portree town service, Stagecoach North Scotland) received
  — simple, fully confirmed:**
  - A pure Portree town circular: Broom Place Depot → Dental Surgery (3
    min) → Somerled Sq (8) → Skye Candles Visitor Centre (13) → Somerled
    Sq again (17) → Martin Cr (20) → Somerled Sq again (22) → Dental
    Surgery (29) → Broom Place Depot (32) — a genuine loop passing
    through Somerled Square three times per circuit.
  - Hourly Mon-Fri departures: **0915, 1015, 1115, 1215, 1315(a),
    1415(a)**. Footnote a = does not run on Fridays, applying
    to the 1315 and 1415 departures (matches 56's own a-polarity
    pattern). **No Saturday or Sunday service at all.**
  - **Confirmed: "Broom Place Depot" IS Portree Depot** (Plus Code
    CQCQ+4V) — same physical depot, Broom Place is just its street name.
  - Needs a **Mercedes Sprinter** (see minibus requirement above).
- **Routes 57A & 57C (Staffin+Uig circular / Uig+Staffin circular,
  Stagecoach North Scotland) received — very complex, mostly understood:**
  - **Same physical loop, opposite directions:** 57A = Portree → Torvaig
    → Staffin → Flodigarry → Kilmaluag → Duntulm → Kilmuir → Uig →
    Kensaleyre → Portree (anti-clockwise). 57C = Portree → Kensaleyre →
    Uig → Kilmuir → Duntulm → Kilmaluag → Flodigarry → Staffin → Torvaig
    → Portree (clockwise) — genuinely distinct routes, not variations of
    each other, despite being the reverse of one loop.
  - **These are SUMMER timetables only** (effective 17/08/2026) — winter
    ones to follow separately.
  - **Footnote polarity, yet another distinct combination:** 57A: a=Fri
    only, b=Mon+Wed only, c=Tue+Thu only, d=not-Friday. 57C: a=not-Friday,
    b=Fri only (no Mon+Wed/Tue+Thu split at all).
  - **Mon/Wed→Tue/Thu override (57A only):** 57A has genuine separate
    "b" (Mon+Wed) and "c" (Tue+Thu) journeys — the b-flagged ones are
    IGNORED entirely and the c-flagged journey's times are used for
    Monday and Wednesday too (c becomes the Mon-Thu standard). 57C has
    no such split at all, so the override has no effect there.
  - **Duty-linking chain confirmed, same-bus continuity both ways round
    the loop:**
    - **57A → 57C at Flodigarry** (any 57A reaching Flodigarry always
      turns and continues as a 57C): 0705 (Mon-Fri) → 0751; 0730 (Sat) →
      0811 (Sat); 1755 (Mon-Sat) → 1840 (Mon-Sat).
    - **57C → 57A at Uig Pier** (any 57C terminating at Uig Pier always
      continues as a 57A from Uig): 0630 (Mon-Sat) → 0700 (Mon-Sat); 0740
      → 0810; 1320 (Fri) → 1400 (Fri); 1550 (not-Fri) → 1630 (not-Fri).
  - **Not all services go via Portree Co-op** — confirmed: an early
    working (Uig Pier 0700 → Uig E Police 0702 → Kensaleyre 0716 →
    Somerled Square 0726) skips Co-op and the second Portree High stop
    entirely.
  - **Saturday is seasonal — two different Saturday timetables:**
    Monday-Friday is identical winter and summer. The already-received
    Saturday table (57A: 0655/0730/0910/1210/1550/1755; 57C:
    0630/1010/1320/1550/1750) is **Summer-only**, running for the exact
    same window as the 52's Summer timetable (3rd Monday of May – 2nd
    Saturday of September). The rest of the year uses a separate,
    reduced **Winter Saturday** timetable, not yet fully supplied: 57A
    runs only **0655 and 1755**; 57C runs only **1010 and 1550**.
    - **Confirmed:** winter's 0655 (57A) and 1010/1550 (57C) are the same
      workings as their identically-timed Summer Saturday entries, reused
      exactly as-is, no time-shift.
    - Winter's 1755 (57A) is **NOT** the same as Summer Saturday's own
      1755 entry (a short Portree→Flodigarry working that links onward
      to a 57C) — it must instead be constructed by taking Summer
      Saturday's **1550 full-loop** timing pattern and adding **exactly
      2 hours 5 minutes to every timing point**.
- **Skye-wide vehicle requirements — re-expressed in size/type terms.**
  Fleet numbers now carry a fixed leading digit per vehicle type/size
  category, assigned in size order — 1=minibus, 2=midibus, 3=full-size
  single-deck, 4=double-decker (twin-axle), 5=double-decker (tri-axle),
  6=coach (twin-axle), 7=coach (tri-axle) — followed by a sequential
  number of at least 3 digits, with an "e"/"h" suffix for electric/
  hydrogen only (no suffix for diesel/hybrid, matching real-world
  Lothian Buses practice). See the main vehicle catalogue
  (bus-game-vehicle-options-effects.md) for the full category-to-model
  mapping. Every requirement below is stated directly by size/type
  category rather than by number:
  - **Mercedes Sprinter** (the specific model, not a size category):
    routes 55, 58, 608.
  - **Midibus** (single-deck, shorter-length class): 57A/57C Winter
    Saturday.
  - **56 — governed by a Milovaig-reach rule, based on vehicle size vs.
    the road, not any other factor** (an earlier recorded version of
    this rule was wrong and has been superseded — see the full route
    breakdown below for the complete per-journey table): any 56 journey
    that physically reaches or starts at Milovaig itself needs a
    **midibus**; any journey terminating/starting short of Milovaig (at
    Lonmore, Bernisdale, or Co-op) defaults to a **full-size single-deck**
    bus — regardless of time of day. Two named journey pairs (56's 1015
    outbound/1119 return, and 56's 1320 outbound/its return leg 1422)
    are flexible exceptions that can use EITHER size.
  - **Full-size single-deck:** 57A/57C Summer Saturday; **every other
    Skye service by default** (i.e. anything not given a specific
    vehicle type above).
  - **Power type is a free choice within whichever size category is
    required, everywhere on Skye** (diesel, hybrid, electric or
    hydrogen), unless a specific model is named (as with the Sprinter
    above) — power type and size are independent attributes under the
    current fleet-numbering scheme, so this replaces the earlier
    "electric/hydrogen siblings satisfy a fleet-range requirement" rule,
    which is now moot.
  - **Depot returns:** all Skye buses except the 55 return to Portree
    Depot when drivers are on rest — specifically to avoid a bus sitting
    at Portree Square while a driver has to take a CAR to swap with
    another driver elsewhere (no car-based driver changeovers away from
    the depot). This is SEPARATE from the already-established 55/58
    Saturday minibus swap at Broadford Yard, which still stands as its
    own deliberate weekly arrangement.
  - **608's buses CAN be swapped at Portree Depot** specifically when a
    vehicle needs swapping for maintenance.
- **Route 56 (Portree - Milovaig, Stagecoach North Scotland) —
  FULLY RE-DERIVED directly from the source PDFs.** An earlier round of
  incremental corrections in chat produced an inaccurate record; that
  version is superseded entirely by the per-journey breakdown below,
  read straight from both timetables.
  - **Route 56 (plain), Mon-Fri, effective 19/08/2024 — collapsed to one
    everyday pattern (no term-time split):**
    - *Outbound (Portree Somerled Sq → Milovaig):*
      1. 0654 — starts at Lonmore (dep) → Colbost → Milovaig.
      2. 0800 — Somerled Sq → terminates Bernisdale PO.
      3. 1015 — Somerled Sq → terminates Lonmore.
      4. 1310 (calls Portree High School 1320), Fridays only — Somerled
         Sq → full run to Milovaig.
      5. 1320, not Fridays — Somerled Sq → terminates Lonmore.
      6. 1320 (starts at Portree High School), Fridays only →
         terminates Bernisdale PO.
      7. 1550 — Somerled Sq → terminates Lonmore.
      8. 1550 (starts at Portree High School) → terminates Bernisdale
         PO.
      9. 1740 — Somerled Sq → terminates Lonmore.
    - *Return (Milovaig → Portree Somerled Sq):*
      1. 0820 — starts at Bernisdale PO → terminates at Portree High
         School (never reaches Somerled Sq) — pick-up only.
      2. 0759 — starts at Lonmore → via Portree High School 0842 →
         Somerled Sq 0847 — drop-off only from Bernisdale onward.
      3. 0800 — starts at Lonmore → Somerled Sq 0844, no High School
         call.
      4. 1119 — Lonmore → Somerled Sq 1207, no High School call.
      5. 1347, Fridays only — starts at Bernisdale PO → terminates
         Portree Co-op.
      6. 1422, not Fridays — Lonmore → Somerled Sq 1510.
      7. 1422, Fridays only — Lonmore → Somerled Sq 1510.
      8. 1452, Fridays only — starts at Milovaig → terminates Lonmore.
      9. 1617, not Fridays — starts at Bernisdale PO → terminates
         Portree Co-op.
      10. 1642 — Lonmore → Somerled Sq 1727, no High School call.
      11. 1706, not Fridays — starts at Milovaig → terminates Lonmore.
  - **Vehicle-size rule — Milovaig-reach:** any 56 journey reaching or
    starting at Milovaig needs a midibus; anything short of Milovaig
    (Lonmore, Bernisdale, Co-op) defaults to a full-size single-deck
    bus. This holds even when a Milovaig-reaching journey also calls at
    Portree High School (the 1310/1320 full run keeps the midibus
    assignment regardless). Power type (diesel/hybrid/electric/hydrogen)
    is a free choice regardless of which size applies.
    - **Named flexible exceptions** (either size, player's choice): 56
      outbound 1015 + its return leg 1119; and 56's 1320 outbound pair
      (not-Fri/Fri-from-HS) + its return leg 1422 pair. No other
      Lonmore-terminating journey gets this flexibility — the 1550
      pair, 1740, 1642, 0800, 0759, 0820, 1347 and 1617 all stay strictly
      on the full-size-single-deck default.
    - **"Linked" meaning confirmed: same bus.** Where two journeys are
      "linked"/"connects to" each other, it means the SAME BUS runs one
      then continues to run the other (duty/vehicle continuity, not
      just a timed passenger connection) — the general meaning of
      "linked"/"connects to" throughout this Skye section, confirmed by
      608's own short working (below).
  - **"Drop-off only" segments — already implemented in-game** (a
    per-stop drop-off-only/pick-up-only option already exists in code;
    this was just new information to this conversation, not a new
    mechanic to design). Apply the existing per-stop flag to:
    - 56's AM journey from Lonmore via Bernisdale: normal until
      Bernisdale, then drop-off only from Bernisdale to Portree High
      School.
    - 56's PM journey via Bernisdale: drop-off only between Portree High
      School and just after Bernisdale.

  **Real-data import notes, established from working through 608
  (Portree-Fiscavaig), apply to all 7 routes:**
  - Sources are Traveline Scotland PDFs. Real operator names shown on
    them (e.g. "Alasdair Macdonald" on 608) are pure real-world colour —
    they mean nothing in-game. The player's own company runs every Skye
    route regardless of who really operates it.
  - Skye routes are NOT all Stagecoach — expect a mix of real operators
    across the 7.
  - A journey starting partway along a route (never visiting one of the
    termini) is just an ordinary partial-route journey — no special
    handling needed, the same as any route where not every journey runs
    the full length.
  - **NEW genuine Skye pattern: Fridays differ.** On Skye, Fridays run a
    different timetable from Monday-Thursday on most routes. Expect most
    routes to need a Mon-Thu / Friday / (Saturday / Sunday where they
    run) split, rather than a flat Monday-Friday block — check each
    route's Friday table separately rather than assuming it matches
    Mon-Thu.
  - **608's own shorter working** (previously recorded as a separate
    route, 607 — Portree-Fiskavaig, a near-identical name/corridor to
    608's own but with a shorter stop list; folded into 608 as just
    another one of its runs, 2026-11-08, rather than kept as a second
    route): its own "a"/"b" footnotes read "a = Only runs on Fridays" /
    "b = Does not run on Fridays" — a live, current example of the
    Friday-differs pattern above. This also confirms the footnote
    letters "a"/"b" are **assigned per timetable, not fixed in
    meaning** — always read each route's own footnote text rather than
    assuming "a"/"b" mean the same thing route to route. Real departure
    times for this shorter working still need re-sourcing — the
    original material was almost entirely bound up in the now-dropped
    school-day timetable split.
  - No route so far (608) has shown a Saturday or Sunday table at
    all — absence of a weekend table in the PDF means no weekend service
    that day.

- **Naming note (2026-09-28).** "Portree Square" is the same real place
  elsewhere in this section as "Portree Somerled Square" — use "Portree
  Square" going forward as the short form.

- **Portree Square — stance rules (2026-09-28, Portree Square only unless
  noted).** Confirmed by the user; none of this is built yet — see
  OPEN-ITEMS.md.
  - **Stance 1**: long-distance services only. Portree Square only rule.
  - **Stances 2 and 3**: local services. They use whichever of the two
    has space, but always **prefer Stance 2** first. Up to **2 buses can
    occupy the same stance at once** — the second one in can only leave
    once the first has left, a genuine queue of two, not just "wait for
    a free stance." Portree Square only rule.
  - **Stance 3 also carries tour buses**, on top of the local-service use
    above, but only when **no more than 2 buses are scheduled across
    Stances 2 and 3 combined** at that time, and only for a **maximum of
    10 minutes**. When a tour bus needs an actual break rather than just
    a stop, it parks at **Bayfield car park** (Plus Code **CR63+RX,
    Portree**) instead of occupying a stance. This parking rule is
    **Portree-wide, not Portree-Square-specific** — the user's own
    distinction, preserved exactly (every other rule above is scoped to
    Portree Square only; this one is scoped to Portree as a whole).
  - This is the first concrete real-world case needing **per-stance**
    override rules (which vehicle categories may use a stance, queue-of-N
    behaviour with ordered departure, a dedicated break-parking location
    for one vehicle category) rather than just per-station rules —
    DESIGN.md §5 "Stands" only has station-wide/per-stand mechanics today
    (drop-off-only, reservation). See the cross-reference there.

- **General stop capacity ("long stop"), confirmed separately from the
  Portree Square stance rules above (2026-09-28) — not Skye-specific, see
  DESIGN.md §4.** Recorded here only because the Portree Square work
  surfaced it; the mechanic itself applies to any ordinary stop anywhere.

- **Portree bypass (2026-09-28, confirmed one-off — not a reusable
  feature).** A bypass road is under construction in Portree; it does not
  exist in OSM data yet. Routes **57A and 57C** will route over it once
  it's usable in-game. The user explicitly confirmed this is a **one-off,
  won't be needed again** — so this should NOT become a general
  "player-drawn road" tool/mechanism (no `player_roads` table, no
  in-game drawing UI, no reusable engine capability). Build the smallest
  thing that gets one specific road segment onto the map: most likely a
  manual one-off addition directly to the pipeline data/`road_graph.bin`
  build (real coordinates for the bypass's path, added as an ordinary
  edge, the same shape as any other imported road), not a player-facing
  feature. Two-stage plan, confirmed with the user:
  1. **Now — done 2026-10-10.** Real path derived from the user's own
     official Highland Council engineering drawing PDF (`Portree Link
     Road Update.pdf`), not estimated: PyMuPDF vector/text extraction of
     the drawing's own printed reference grid, a rigorous two-point
     similarity transform (scale+rotation+translation, not an assumed
     north-up/exact-scale guess) anchored on two user-given real-world
     grid references, then — once the user supplied a PDF overlay
     screenshot directly on a known, pixel-exact live game screenshot —
     the two new roundabout centres and the real connecting road shape
     were read directly via MapLibre's own `map.unproject()` against that
     exact view (far more precise than the CAD transform alone), with the
     original CAD-derived curve's own real curvature kept and only
     shifted (a few metres) to land exactly on the two measured roundabout
     centres, per the user's own correction. Final geometry: existing
     (untouched) roundabout -> new ~25m roundabout at Cearn Romasdail ->
     new ~25m roundabout where the bypass meets Staffin Road, replacing a
     short stretch of it (confirmed with the user: the new roundabout's
     east edge sits exactly on Staffin Road's real centreline). Added as
     **Primary class, 30mph** (both the user's explicit choice -- not the
     default 50mph a plain Primary tag would imply), two-way.
     Implemented as `rust/pipeline/examples/add_portree_bypass.rs`: loads
     `road_graph.bin`, finds the real existing roundabout node and the
     real Staffin Road edge nearest the computed coordinates (asserts
     <15m or refuses rather than guessing), splits that edge at the exact
     splice point, and appends the new edges -- the same shape as
     `graph_build::merge_road_graphs`'s own index-renumbering pattern,
     applied to a single manual addition rather than a whole second
     source. **Revised same day** after the user tested a drawn route and
     found "I couldn't see any roundabouts": the first version only kept
     each roundabout's centre as a plain waypoint on one continuous edge,
     so a route just curved smoothly through the point with no visible
     loop. Rebuilt (from the pre-patch backup, not double-patched) with
     **real circular geometry** at both roundabouts: 16 graph nodes per
     circle at a 12.5m radius, joined by 16 one-way edges going clockwise
     (UK convention, same rule `road_graph.rs` already applies to real
     `junction=roundabout` ways), with the entry/exit nodes on each circle
     chosen from the real curve's own incoming/outgoing bearings at that
     point (not guessed) so the arms meet the circle where the real road
     actually would. The user confirmed wanting this over the simpler
     point-only version.

     **Revised a third time, same day**, after the user live-tested the
     circles and sent screenshots showing two real problems: (1) the
     existing (untouched) roundabout now had a route cutting straight
     through its middle, and (2) both new roundabouts showed a "weird"
     near-full loop instead of a natural bend. Root cause of (1): the
     bypass had been connected directly to an existing real ring node
     (osm_id 34580186) -- topologically valid, but it let the router
     shortcut straight onto the new road instead of ever using the real
     ring's own arc, and added a new edge incident to one of the ring's own
     4 nodes, which isn't truly "untouched." Fixed by tracing the real ring
     directly from the graph (a 4-node real UK mini-roundabout) and
     splicing a genuinely new node onto it at the exact point the bypass's
     own real approach bearing meets the ring (computed, not guessed),
     leaving the ring's own 4 original nodes/edges byte-for-byte unchanged
     -- the same splice technique now used for both the existing roundabout
     and Staffin Road, via one shared `split_nearest_edge` helper. Root
     cause of (2): the two new roundabout circles were one-way clockwise
     (true UK convention), which with only two roughly-opposite arms and no
     give-way/circulation simulated yet (Phase 9 "hard part") forced every
     route the *long* way around; switched both to two-way, letting the
     router take the natural shorter arc in each direction instead -- a
     deliberate realism-vs-legibility tradeoff, worth revisiting if real
     roundabout circulation rules are ever simulated. Live re-verified
     after the fix: the existing roundabout now shows both route
     directions following its real circular shape, and both new
     roundabouts show a small natural bend rather than a loop.

     Live-verified, not just offline: reloaded
     the running packaged game against the patched
     `%APPDATA%\bus-game\map-data\road_graph.bin`, confirmed
     `router.node_count()`/`edge_count()` match the patch's own reported
     totals exactly, and confirmed `find_route` from the housing estate
     past the existing roundabout to Staffin Road actually routes via the
     new edge (not a detour) and continues correctly onto the split
     Staffin Road pieces. Both the dev `pipeline-data/road_graph.bin` and
     the installed game's own copy were patched; originals backed up to
     `pipeline-data/.backup-before-portree-bypass/`.
     **Important: this patch does NOT survive a full pipeline rebuild** --
     running the main pipeline binary regenerates `road_graph.bin` from
     raw OSM data from scratch, which doesn't include the bypass yet, so
     `add_portree_bypass.rs` must be re-run against the fresh output every
     time until stage 2 below happens. Routes 57A/57C themselves (using
     this road in their timetables) are not yet built -- that's separate,
     still-pending work.

     **Visual road layer abandoned 2026-10-10 after live testing, by the
     user's own instruction** ("This is rubbish") -- the
     `road_graph.bin` patch itself (real circular roundabouts, the 3-arm
     Staffin Road splice) is kept and still live. The visual road layer
     (`portree-bypass-layer.ts`, drawn on top of the patch purely so the
     bypass showed as a road surface on the map) went through several
     rounds of live correction and still didn't look right once actually
     tested in the running game -- a route drawn through it looked like it
     was cutting through the roundabouts rather than going around them,
     and the layer's own road line ran straight through each roundabout's
     centre instead of connecting to its edge. That layer has been fully
     reverted: `portree-bypass-layer.ts` deleted, its `main.ts` hook
     removed, a clean installer rebuilt with neither present.
     `road_graph.bin` was briefly restored to the real-OSM-only backup
     alongside it, in a misreading of the user's next instruction -- the
     user immediately corrected that ("I need to make the routes before
     you do that"), so the patch was re-applied to both copies (dev
     `pipeline-data/` and the installed game's own
     `%APPDATA%\bus-game\map-data\`) and is live again.

     **The actual plan, given directly by the user, in full** (a second
     correction after an incomplete first reading only captured part of
     it -- "don't just randomly do some of what I say and ignore the
     rest"):
     1. **Draw the real, permanent 57A/57C now**, in the ordinary in-game
        route editor, routed *over the bypass* -- made possible by the
        `road_graph.bin` patch staying in place for exactly this purpose.
        This captures the route's real intended path while the patched
        data is available to draw against, well before OSM actually
        surveys the bypass.
     2. **Separately, also draw temporary 57A/57C** routed over the
        *existing* real road network (no bypass) -- for actual play now,
        since the real bypass doesn't exist in OSM yet and the permanent
        version can't be used live until it does.
     3. **Once both are drawn and saved**, the one-off `road_graph.bin`
        patch can be reverted -- a saved route's own path is stored as
        its own waypoint data, independent of whatever `road_graph.bin`
        currently contains, so the permanent route's geometry survives the
        patch being removed. `add_portree_bypass.rs` is kept (not
        deleted) purely as the record of how to re-apply it if needed
        again before that point.
     Real route detail for 57A/57C (termini, stops, current real-world
     path for the temporary version, timetable/frequency) -- the same
     kind of information the other real fixed routes (398, Airlink 100)
     were built from -- is not yet known and is a genuine open question
     for the user, not guessed at. See OPEN-ITEMS.md T73.
  2. **Later**: once the bypass is properly surveyed and lands in a real
     OSM extract, the pipeline is rebuilt against that newer data (by
     then the one-off patch is long gone, step 3 above), and the
     temporary 57A/57C are swapped for the already-drawn permanent
     versions from step 1, the same as any other route update.

## 14. Fleet numbering scheme — FINALIZED (replaces every old number-range block)

This replaces the entire original fleet-number-range convention used
throughout the project (10,000s double-deckers, 20,000s/30,000s
full-size/midibus diesel-hybrid single-deck, 40,000s small bus, 50,000s
coach, 70,000s/67,000 electric/hydrogen single-deck, 80,000s/87,000
electric/hydrogen double-deck, 90,000s support fleet). Any older document
or note still using "X,000-range" language is superseded by this section.
**Reconfirmed and fully propagated 2026-10-30** — the user's own
instruction ("the old X,000-range system is superseded everywhere") after
finding OPERATIONS.md §3's own fleet-number table and VEHICLE-SPECS.md's
section headings still hadn't been updated to match this section when it
was first finalised; both are fixed now.

**Format:** `[category digit][sequential number, 3+ digits][e/h suffix]`
— e.g. `4001` (diesel double-decker, twin-axle), `3014e` (electric
full-size single-deck), `7002h` (hydrogen coach, tri-axle).

- The sequential number is at least 3 digits, so every fleet number is
  4+ digits long before any letter suffix.
- Letter suffix: **e** = electric, **h** = hydrogen. **No suffix at all**
  for diesel or hybrid (matches real-world Lothian Buses practice).
  There is no "d" or "b" suffix — those were dropped.
- The leading digit encodes vehicle TYPE/SIZE only, assigned in size
  order. It carries no information about power type — power type is a
  free choice within whichever size category a route/contract requires,
  everywhere in the game, unless a specific model is named.

**Category digits, in size order:**

| Digit | Category | Vehicles in this category |
|---|---|---|
| 1 | Minibus | Mercedes-Benz Sprinter/EVM Cityline (diesel or electric). "Small bus" is not a separate category — folded into this digit. |
| 2 | Midibus | ADL Enviro200 MMC at 8.9m/9.7m/10.8m; ADL Enviro200EV at 9.9m; MCV Evora at 10.8m (all at/under the 10.8m size-class cutoff) |
| 3 | Full-size single-deck | ADL Enviro200 MMC at 11.5m/11.8m; ADL Enviro200EV at 10.9m/11.7m; MCV Evora at 12.9m; Volvo 7900 Hybrid/Electric; Wrightbus GB Kite Electroliner/Hydroliner (all over the 10.8m cutoff) |
| 4 | Double-decker, twin-axle | ADL Enviro400 MMC, ADL Enviro400EV, Wrightbus StreetDeck Ultroliner/Electroliner/Hydroliner and their open-top variant (buses, not coaches) |
| 5 | Double-decker, tri-axle | ADL Enviro400 XLB (13.4m — see §14a; replaces the ADL Enviro500) |
| 6 | Coach, twin-axle | Volvo 9700 at 12.4m |
| 7 | Coach, tri-axle | Volvo 9700 at 13.1m/13.9m/15m; Volvo 9700DD (13m/14.8m) |
| 9 | Support vehicles | Pool cars, staff transport and other support vehicles (confirmed 2026-10-30) — not a bus at all, so it sits outside the size-order sequence 1-7 rather than slotting in by length. Still takes the same e/h suffix convention for electric/hydrogen support vehicles. |

Twin-axle vs tri-axle is derived automatically from length (up to 12.9m
= twin-axle, over 12.9m = tri-axle by law), not a separate selectable
option. Where a size class has both twin- and tri-axle real vehicles
(double-decker, coach), tri-axle gets its own digit, exactly one higher
than the twin-axle digit for that same size class.

**Live fleet numbers are now being issued** — this stopped being a pure
category-digit structure once the buy menu (OPERATIONS.md §3) started
assigning real numbers through `formatFleetNumber()` (`fleet-numbering.mts`).

### 14a. Vehicle catalogue change — Enviro500 replaced by Enviro400 XLB

The **ADL Enviro500 is removed from the catalogue** and replaced by the
**ADL Enviro400 XLB**. Confirmed final spec:

| Spec | Value |
|---|---|
| Length | 13.4m fixed — tri-axle (over the 12.9m threshold) |
| Seated | 100 (61 upper deck / 36 lower deck) |
| Standing | 25 |
| Total capacity | 125 |
| Tip-up seats | 3 (trade off against standing space when deployed; don't add to the total capacity ceiling) |
| Wheelchair space | 1 (additional, on top of the above) |
| Fuel | Diesel only, 250L tank, ~380 miles range (estimated, unsourced — flag for a real-world figure if one turns up) |
| Top speed | 50mph (standard bus-category rule) |
| Price | **£270,000** (confirmed) |
| Fleet-numbering category | Digit 5 — double-decker, tri-axle |

**Airlink 100's vehicle requirement changes** from the 13m Volvo 9700DD
to this ADL Enviro400 XLB. AIR and Express 500's vehicle requirements
are unaffected — this change is Airlink 100 only.
