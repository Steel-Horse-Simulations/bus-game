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
existing £2 Highland/SPT cap) get built out as equivalents elsewhere, or
stay special cases, is still genuinely undecided — flag rather than guess
when it becomes relevant to a specific system.

---

## 2. Dealer network — real data, complete

**Yutong** (England): Pelican Bus and Coach, PJCC+3X Castleford, UK.

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
- **STANDARD**: long distance and private hire vehicles exempt
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
| Wales (all depots based there) | TrawsCymru | Depot-based | Long distance exempt; private hire NOT exempt (opposite emphasis from every other entry) |
| Plymouth + Cornwall | Transport for Cornwall | Depot-based | Standard |

Manchester and London went through two reversals (depot-based →
route-based 30% → back to depot-based) — depot-based is final for those
two. Don't reintroduce the route-based version.

---

## 8. Fare cap systems by nation (4 of 5 done; London pending map)

**General rule across every fare cap system below (Highland/SPT, England,
Wales, London):** sightseeing services get NO fare cap anywhere — full
price always applies, no exceptions. This generalises what was already
true of the original Highland/SPT £2 cap into a rule that holds across
every fare cap in the game.

### Highland + SPT (existing, unchanged)
£2 single cap within either zone, £4 crossing between them. See
DESIGN.md §9 for full detail — unaffected by this expansion.

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
- Exemptions: long distance, private hire, and sightseeing (standard
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

## 10. Night bus routes (N-prefix)

**Numbering:** N + the day route's number (e.g. day route 9 → N9). A
standalone night route with no day counterpart gets its own independent
N-number (e.g. N50). N-prefixed numbers only need to avoid colliding with
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

**Operating window:** typically **2345–0400** (real figure), but NOT tied
to the existing 2200–0700 staff night shift band — its own separate
window. Doesn't have to run to any fixed frequency at all: some night
routes run just once in each direction total, or a single bus doing one
out-and-back trip and nothing else. Where there IS a regular pattern,
it's much sparser than daytime — roughly every 30–60 minutes.

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
  timetable** — including real **school** timetable variations and real
  **seasonal** variations (§12), all sourced from actual data rather than
  generated.
- **School service exception, Skye-specific only:** Skye's school
  services do NOT use the general S-prefix convention (§ elsewhere in
  this spec) — they keep their real actual route numbers, since this is
  genuine fixed real-world data rather than a game-generated school
  route. This does NOT change the S-prefix system anywhere else in the
  game — it's a one-island carve-out.
- **Livery:** Skye already has its own established dedicated livery,
  "Rapsons" (bus-game-fare-caps-and-airports-2.md) — **confirmed still
  required**, unchanged in this real-fixed-content context.
- **Route list confirmed (15 routes) — timetables pending, arriving one
  at a time as they're downloaded.** ~~Route 54~~ was on the original
  list in error — it doesn't exist; it was replaced by 607 in the real
  world, so 607 covers that corridor now. **Route 150 was missed off the
  original list** and has since been added — a real, separate route.
  Track receipt of each route's real timetable (base + school + seasonal
  variants) here:

  | Route | Timetable received? |
  |---|---|
  | 52 *(through-runs with 152 — see below)* | ✅ received, format understood |
  | 55 | ✅ received, format understood |
  | 56 | ✅ received, format understood |
  | 56X | ✅ received, format understood |
  | 57A *(genuinely distinct from 57C, not a variation; Summer timetable only so far)* | ✅ received, format understood |
  | 57C *(genuinely distinct from 57A, not a variation; Summer timetable only so far)* | ✅ received, format understood |
  | 58 | ✅ received, format understood |
  | 150 *(through-runs with 155/158 — see below)* | ✅ received, format understood |
  | 152 *(term-time only; through-runs with 52 — see below)* | ✅ received, format understood |
  | 155 *(through-runs with 150/158 — see below)* | ✅ received, format understood |
  | 157 | ✅ received, format understood |
  | 158 *(through-runs with 155/150 — see below)* | ✅ received, format understood |
  | 159 *(term-time only, confirmed in advance)* | ✅ received, format understood |
  | 607 *(duty-linked with 608 — see below)* | ✅ received, format understood |
  | 608 *(duty-linked with 607 — see below)* | ✅ received, format understood |

  **ALL 15 ROUTES NOW RECEIVED.** Remaining open items before this
  section is fully closed: the second Portree-High-Square-bound bus's
  identity and the full Portree High departure order (user said they'd
  give this once all timetables were in — worth asking now); confirming
  Skye's "Rapsons" livery still applies unchanged in this real-content
  context; building all 15 routes' real stop geometry in-game before
  timetables can be coded in.
- **Term-time-only routes, running tally:** 607, 150, 155, 152, 157, 158
  and 159 all run zero service during Highland school holidays (152 and
  159 confirmed in advance, ahead of receiving their timetables).
- **Duty linking:** 607 and 608 must be linked when building driver/vehicle
  duties (a bus/driver can work between the two across a shift) — this
  pair is otherwise completely separate from the other 12 routes. This is
  the first confirmed case of the "some services link onto other
  services" linking the user flagged earlier; more such links may be
  confirmed for the remaining routes once all timetables are in.
- **Primary school buses + public-access exception:** Skye also runs
  dedicated primary-school buses, distinct from the secondary/high-school
  angle already seen on 608. Confirmed so far:
  - 608's school-run journeys are fully covered by the two already
    identified (0848, 1510) — nothing further needed there.
  - Route 55 (not yet received) will have 2 services that double as
    school runs.
  - **157 and 158 are exclusively primary school buses** — their entire
    service is school-run, unlike 607/608 which mix school and general
    journeys.
  - **General rule: every Skye service is open to the public, even
    journeys flagged as school runs** (608's 0848/1510, all of 607) —
    **except 157 and 158**, which are closed/restricted to primary
    school pupils only. This is the one access exception on the island.
  - Other primary-school runs elsewhere on Skye typically carry only 2-3
    students each — confirmed this needs no special vehicle/mechanic
    treatment, just noted as real low demand.
- **Routes 52 & 152 received (Portree - Armadale, Stagecoach North
  Scotland) — linked like 150/155:**
  - 52 and 152 are linked the same way as 150/155 (same bus continues
    from one to the other).
  - Together, 52 and 152 are run by just ONE bus and driver all day.
  - **Partial reveal of the Portree High School departure order:** most
    buses waiting at Portree High terminate there — only 2 continue on
    to Portree Somerled Square. 152's AM working (arrives High School
    0837, continues to the Square 0844) is one of those 2, and happens
    to be the one that leaves first once the waiting group starts moving
    off (not a separate priority rule, just the order it occurs in) —
    **the second Square-bound "bus" identified: it's not a distinct
    scheduled working like 152's, it's the 57C (the one that came from
    Flodigarry via the 57A→57C link) returning to the Square as a
    shuttle bus, not a proper timetabled service** — matches the
    earlier-established mechanic of passengers changing onto the 52 or
    the 57C-shuttle to reach the Square.
  - **52 is NOT term-time-only** — it has a genuine unlabelled
    (runs-regardless-of-term-time) service plus NSCH and Friday-only
    journeys, unlike 152 which IS fully term-time-only (matches the
    152/157/158/159 school-days-only rule already stated).
  - **Seasonal/Summer timetable — fully confirmed:**
    - **Operative date range:** always starts on the **3rd Monday of May**
      and always ends on the **2nd Saturday of September**, every year —
      a simplified rule, not the PDF's literal printed dates (18 May – 12
      Sept 2026 is just what that rule works out to for this year) and
      not the earlier-stated "first Monday of May" (imprecise).
    - **Outbound (Portree Square → Armadale Pier), 6 columns:**
      1. 0905 — base timetable, every Mon-Fri, all year round.
      2. 1105 (first) — school holidays only, every day Mon-Fri.
      3. 1105 (second) — school days only, Monday-Thursday (not Friday).
      4. 1330 — school holidays only, every day Mon-Fri.
      5. 1545 (first) — Fridays only, school days only.
      6. 1545 (second) — every day Mon-Fri, school holidays only.
    - **Return (Armadale Pier → Portree Square), 5 main columns:**
      1. 1035 — base timetable, every Mon-Fri, all year round.
      2. 1235 (first) — Monday-Friday, school holidays.
      3. 1235 (second) — Monday-Thursday, school days.
      4. 1505 — Monday-Friday, school holidays.
      5. 1710 — base timetable, every Mon-Fri, all year round.
    - Plus a separate **6th return-only short working**: dep New
      Broadford Hospital 0805 → arr Portree Square 0843 (no
      Armadale-originating counterpart) — school holidays only,
      Monday-Friday.
    - **Saturday: the entire Saturday 52 service (all 3 outbound times
      0905/1230/1545 and their returns) is a summer-only addition**, not
      part of the base timetable at all.
    - The confirmed "2 extra summer weekday services run by a different
      Portree driver/bus, not part of the regular 52/152 duty" = the
      Sch/Mon-Thu pair specifically (outbound 1105-second + return
      1235-second) — matches the user's original description "the extra
      1105 and 1235 school day not Friday services" exactly.
    - Working interpretation (consistent, not separately challenged): all
      other Summer-only journeys (the #Sch/holiday-flagged columns, and
      the Friday-only 1545/Sch pair) are extra round trips run by the
      SAME regular single 52/152 duty — freed up during school holidays
      since no 152 school-run duty is needed then. Only the Mon-Thu 1105/
      1235 pair needs a genuinely separate driver/bus.
- **NEW ROUTE 150 discovered (Kyle of Lochalsh - Broadford, Stagecoach
  North Scotland) — through-running chain with 155 and 158 confirmed:**
  - 150 was missed off the original 15-route list — a real, separate
    route, now added.
  - **Confirmed chain (cross-checked against both timetables, times line
    up exactly):** AM — 150 departs Kyle of Lochalsh 0733, arrives
    Broadford 0759, the SAME BUS becomes the 155 departing Broadford 0801,
    arriving Portree High School 0840, then becomes the 158 onward to
    Portree Primary School. PM — mirror image, two workings: the 155
    departs Portree High School (1320 a,SCH or 1550 b,SCH), arrives
    Broadford (1400/1630), becomes the 150 departing Broadford
    (1401/1631), arriving Kyle of Lochalsh (1421/1651).
  - This resolves 158's link partner (see above): it's the 155, which
    links onward to 150. 157 and 158 have genuinely different partners
    (157->56, 158->155->150), as previously stated.
  - **Through-ticketing:** customers don't change buses on this chain and
    can buy a single ticket from Kyle of Lochalsh to Portree High School
    (and reverse), despite it formally being 3 different route numbers.
  - **Confirmed: 150 and 155 are also fully term-time-only**, zero
    service during Highland school holidays — same pattern as 607.
  - Footnote polarity: a = Fridays only, b = not Fridays (matches the
    607/56/56X/157/158 family, opposite of 55's).
- **Route 55 (Kyle of Lochalsh - Glasnakille, Stagecoach North Scotland)
  received.** Confirmed details (as described by the user, not
  independently re-derived from the raw PDF grid — exact minute-by-minute
  times to be confirmed once the route is built in-game):
  - Three named school-run variations: the 0801 SCH journey diverts via
    Broadford Primary School for an extra bit of route (school-run only),
    resuming as a regular service afterwards; the 1455 a,SCH journey
    diverts via Broadford Primary for 1 stop only, otherwise matching the
    main route; the 1215 b,SCH journey is a school run for the entire
    route, start to end (not partial).
  - **Footnote polarity flips again**: on 55, "a" = does not run Fridays,
    "b" = only runs Fridays — the *opposite* of 607. Confirms (a third
    time) that a/b meaning is never fixed and must be read per-route.
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
    - 607 and 608: no outstation gating — only need enough vehicles owned.
    - 55, 52, 152, 155, 158: locked until Broadford Yard is rented/bought.
    - 56 and 56X: locked until Lonmore is rented — **except** the 56's
      runs to/from Bernisdale, which operate out of Portree and so are
      NOT locked (only the rest of 56, plus all of 56X, needs Lonmore).
    - Not yet stated: gating for 57A, 57C, 157, 159 — pending. (58 never
      leaves Portree — see below — so likely needs no outstation gating,
      but this hasn't been explicitly confirmed by the user yet.)
- **Route 58 (Portree town service, Stagecoach North Scotland) received
  — simple, fully confirmed:**
  - A pure Portree town circular, NOT school-related (no SCH/NSCH labels
    at all): Broom Place Depot → Dental Surgery (3 min) → Somerled Sq
    (8) → Skye Candles Visitor Centre (13) → Somerled Sq again (17) →
    Martin Cr (20) → Somerled Sq again (22) → Dental Surgery (29) →
    Broom Place Depot (32) — a genuine loop passing through Somerled
    Square three times per circuit.
  - Hourly Mon-Fri departures: **0915, 1015, 1115, 1215, 1315(a),
    1415(a)**. Footnote a = does not run on Fridays, applying
    to the 1315 and 1415 departures (matches the 607/56/56X/157/158/150/
    152/155 a-polarity family). **No Saturday or Sunday service at all.**
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
  - **School-run identification rule:** any journey that stops at
    "Portree, o/s High School" (distinct from Somerled Square) is a
    school service — not the SCH flag alone.
  - **57A school runs (4):** 0810 SCH (short working from Uig only); 0655
    SCH (full-loop-via-Kilmuir working, paired with an 0655 NSCH holiday
    equivalent); 1550 c,SCH (→ Mon-Thu standard per the override); 1320
    a,SCH (Fridays only).
  - **57C school runs:** 0751 SCH — becomes a shuttle FROM the school TO
    Portree Square, then the SAME bus goes on to run the 0910 57A; 0751
    NSCH — holiday equivalent (no shuttle needed, waits at the Square,
    still continues to the 0910 57A); 1320 b,SCH (Fri only) — a
    complementary pair, one working TO Uig (drop-off only throughout) and
    one TO Portree (pick-up only until Uig Pier, then normal); 1550
    a,SCH (Mon-Thu) — the same complementary pair pattern (TO Uig
    drop-off-only / TO Portree pick-up-only-until-Uig then normal).
  - **Duty-linking chain confirmed, same-bus continuity both ways round
    the loop:**
    - **57A → 57C at Flodigarry** (any 57A reaching Flodigarry always
      turns and continues as a 57C): 0705 (Mon-Fri) → 0751 (splits
      SCH/NSCH by term); 0730 (Sat) → 0811 (Sat); 1755 (Mon-Sat) → 1840
      (Mon-Sat).
    - **57C → 57A at Uig Pier** (any 57C terminating at Uig Pier always
      continues as a 57A from Uig): 0630 (Mon-Sat) → 0700 (Mon-Sat); 0740
      (SCH) → 0810 (SCH); 1320 b,SCH (Fri) → 1400 a,SCH (Fri); 1550 a,SCH
      (not-Fri) → 1630 d,SCH (not-Fri).
  - **Not all services go via Portree Co-op** — confirmed: an early
    working (Uig Pier 0700 → Uig E Police 0702 → Kensaleyre 0716 →
    Somerled Square 0726) skips Co-op and the second Portree High stop
    entirely.
  - **Returning Uig school buses (57A) terminate at Portree Co-op, NOT
    Somerled Square** — same pattern noted for 56's Bernisdale afternoon
    school runs (added above).
  - **Pick-up/drop-off split between the two overlapping 57A morning
    school workings — fully resolved:** Uig → Kensaleyre: full-loop bus =
    drop-off only, Uig bus = pick-up only. Kensaleyre → Portree: roles
    swap — Uig bus becomes drop-off only, full-loop bus becomes normal
    pick-up AND drop-off. Net effect: at every stop on the corridor, at
    least one of the two buses is always available to pick up — it just
    alternates which one, switching over at Kensaleyre.
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
- **Route 159 (Portree - Peinchorran via Lower Ollach/Braes) received —
  LAST of the 15 Skye routes, fully resolved:**
  - No proper PDF exists for this one — user typed the timetable out by
    hand. Term-time only (school days only, zero service in Highland
    school holidays), no Saturday or Sunday service at all.
  - **Structure:** at each end of the day, the SAME bus/driver runs a
    "not school bus" leg immediately followed by a "school bus" leg
    reversing direction back toward Portree High (mirror image in the
    afternoon) — same-bus/same-driver duty continuity, with a consistent
    **5-minute layover at Peinchorran** between the two legs every time.
  - **"School bus" vs "not school bus" is NOT a public-access
    restriction** — all school runs on Skye are open to the public
    (matches the general rule already established); it's purely a
    demand-modelling label, not a boarding restriction.
  - **Confirmed stop-by-stop:**
    - AM not-school-bus: Portree Square 0735 → Lower Ollach 0750 →
      Peinchorran 0800.
    - AM school-bus (5 min later): Peinchorran 0805 → Lower Ollach 0819 →
      Penifiller Turning Circle 0830 → Portree High 0841.
    - Mon-Thu PM school-bus: Portree High 1550 → Penifiller Turning
      Circle 1559 → Lower Ollach 1612 → Peinchorran 1625.
    - Mon-Thu PM not-school-bus (5 min later): Peinchorran 1630 → Lower
      Ollach 1638 → Portree Square 1655.
    - Friday PM school-bus: Portree High 1320 → Penifiller Turning Circle
      1329 → Lower Ollach 1342 → Peinchorran **1355** (corrected from an
      initial typo of 1455, confirmed — keeps the same 5-min pattern).
    - Friday PM not-school-bus (5 min later): Peinchorran 1400 → Lower
      Ollach 1408 → Portree Square 1425.
  - Operates from **Portree Depot**, no outstation gating needed (like
    56's Bernisdale workings).
  - **Vehicle requirement: a midibus** (single-deck, shorter-length
    class — distinct from the smaller "small bus" narrow-road class).
    Any power type (diesel, hybrid, electric or hydrogen) is fine —
    power type is independent of size under the current fleet-numbering
    scheme (see the main vehicle catalogue).
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
  - **Midibus** (single-deck, shorter-length class): route 159; 57A/57C
    Winter Saturday.
  - **56 and 56X — governed by a Milovaig-reach rule, NOT a school/
    non-school split** (an earlier recorded version of this rule was
    wrong and has been superseded — see the full route breakdown below
    for the complete per-journey table): any 56/56X journey that
    physically reaches or starts at Milovaig itself needs a **midibus**;
    any journey terminating/starting short of Milovaig (at Lonmore,
    Bernisdale, or Co-op) defaults to a **full-size single-deck** bus —
    regardless of whether it's a school run or calls at Portree High
    School. Four named journeys (56's 1015 outbound/1119 return pair,
    and 56's non-school 1320 outbound/1422 return pair) are flexible
    exceptions that can use EITHER size.
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
  - **607 and 608 CAN have their buses swapped at Portree Depot**
    specifically when a vehicle needs swapping for maintenance.
- **PORTREE HIGH SCHOOL DEPARTURE ORDER — fully resolved, fixed order,
  same both AM and PM:**
  1. 152 – Armadale
  2. 155 – Torrin
  3. 56 – Lonmore
  4. 57A/57C – Full Loop
  5. 57C/57A – Flodigarry
  6. 56X – Milovaig
  7. 607 – Fiscavaig
  8. 159 – Peinchorran
  9. 57A/57C – Uig
  10. 56 – Bernisdale
  11. 150/155 – Kyle of Lochalsh

  (608 is not in this list because it **simply doesn't call at Portree
  High School at all** — not a timing coincidence, a genuine route fact.
  "Torrin" is just the **155's terminus** — nothing more to it. Why the
  route number changes mid-journey through the 150→155→158 through-
  running chain is unexplained even to the user, but confirmed as
  genuinely how the real service is numbered, not an error.)
- **Routes 56 & 56X (Portree - Milovaig, Stagecoach North Scotland) —
  FULLY RE-DERIVED directly from the source PDFs.** An earlier round of
  incremental corrections in chat produced an inaccurate record (only 4
  "school-run" journeys, muddled 56/56X attribution); that version is
  superseded entirely by the per-journey breakdown below, read straight
  from both timetables.
  - **Route 56 (plain), Mon-Fri, effective 19/08/2024 — 11 outbound + 11
    return journeys, not 4:**
    - *Outbound (Portree Somerled Sq → Milovaig):*
      1. 0654 SCH — starts at Lonmore (dep) → Colbost → Milovaig.
      2. 0800 SCH — Somerled Sq → terminates Bernisdale PO.
      3. 1015 (no flag, daily) — Somerled Sq → terminates Lonmore.
      4. 1310 (calls HS 1320) a,SCH (Fri only) — Somerled Sq → full run
         to Milovaig.
      5. 1320 b,SCH (not Fri) — Somerled Sq → terminates Lonmore.
      6. 1320 NSCH (holidays) — twin of #5.
      7. 1320 (starts AT Portree HS) a,SCH (Fri only) → terminates
         Bernisdale PO.
      8. 1550 NSCH (holidays) — Somerled Sq → terminates Lonmore.
      9. 1550 a,SCH (Fri only) — twin of #8.
      10. 1550 (starts AT Portree HS) b,SCH (not Fri) → terminates
          Bernisdale PO.
      11. 1740 (no flag, daily) — Somerled Sq → terminates Lonmore.
    - *Return (Milovaig → Portree Somerled Sq):*
      1. 0820 SCH — starts at Bernisdale PO → terminates AT Portree High
         School (never reaches Somerled Sq) — pick-up only, linked to 157.
      2. 0759 SCH — starts at Lonmore → via HS 0842 → Somerled Sq 0847 —
         drop-off only from Bernisdale onward.
      3. 0800 NSCH — starts at Lonmore → Somerled Sq 0844, no HS call.
      4. 1119 (no flag, daily) — Lonmore → Somerled Sq 1207, no HS call.
      5. 1347 a,SCH (Fri only) — starts at Bernisdale PO → terminates
         Portree Co-op (confirms "returning Bernisdale school runs
         terminate at Co-op, not the Square").
      6. 1422 "b" (not Fri, no SCH flag) — Lonmore → Somerled Sq 1510.
      7. 1422 "a" (Fri only, no SCH flag) — twin of #6.
      8. 1452 a,SCH (Fri only) — starts AT Milovaig → terminates Lonmore.
      9. 1617 b,SCH (not Fri) — starts at Bernisdale PO → terminates
         Portree Co-op.
      10. 1642 (no flag, daily) — Lonmore → Somerled Sq 1727, no HS call.
      11. 1706 b,SCH (not Fri) — starts AT Milovaig → terminates Lonmore.
  - **Route 56X, Mon-Fri — 100% SCH, no NSCH/holiday service at all:**
    - *Outbound, effective 31/10/2026 — 3 journeys, all call at or start
      from Portree High School:*
      1. 1320, a,SCH (Fri only) — starts AT Portree HS → terminates
         Lonmore. Midibus.
      2. 1540 (calls HS 1550), b,SCH (not Fri) — Somerled Sq → full run
         to Milovaig (the ONLY 56X journey reaching Milovaig).
         Full-size single-deck.
      3. 1550, b,SCH (not Fri) — starts AT Portree HS → terminates
         Lonmore. Midibus.
    - *Return, effective 19/08/2024 — only 1 journey, the whole service:*
      1. 0728, SCH — starts AT Milovaig → ... → HS 0845 → Somerled Sq
         0849. Full-size single-deck.
  - **Vehicle-size rule — Milovaig-reach, not school/non-school:** any
    56/56X journey reaching or starting at Milovaig needs a midibus;
    anything short of Milovaig (Lonmore, Bernisdale, Co-op) defaults to a
    full-size single-deck bus — regardless of school-run status. This
    holds even when a Milovaig-reaching journey also calls at Portree
    High and queues in the departure order (56's 1310/1320 full run;
    56X's 1540/1550 full run keep the midibus/full-size assignment
    despite queuing). Power type (diesel/hybrid/electric/hydrogen) is a
    free choice regardless of which size applies.
    - **Named flexible exceptions** (either size, player's choice): 56
      outbound 1015 + its return leg 1119; and 56's non-school 1320
      outbound pair (b,SCH/NSCH) + its return leg 1422 pair (a/b). No
      other Lonmore-terminating journey gets this flexibility — the 1550
      pair, 1740, 1642, 0800, 0759, 0820, 1347 and 1617 all stay strictly
      on the full-size-single-deck default.
  - **Portree High departure-order queue membership:** of the 26 total
    56/56X journeys above, 9 call at or start from Portree High School
    and therefore queue in the fixed departure order (§ below): 56
    outbound #4, #7, #10; 56 return #1, #2; and all 4 of 56X. The
    departure order's "56 - Lonmore", "56X - Milovaig" and "56 -
    Bernisdale" entries are destination-level slots used by whichever of
    that group's journeys is departing at a given time, not one-journey-
    each slots.
    - **"Linked" meaning confirmed: same bus.** Some of these school-
      calling 56 journeys are linked with route 157 (0820 pick-up-only,
      0759 drop-off-only, and 56X's 1320/1550 short workings, which are
      also drop-off-only after Portree High) — the SAME BUS that runs
      those journeys then continues to run the 157 (duty/vehicle
      continuity, not just a timed passenger connection). This is the
      general meaning of "linked"/"connects to" throughout this Skye
      section — applies retroactively to 607/608, the 56X-to-56 Milovaig
      connection, and the Friday 56X-terminates-at-Lonmore-connects-to-
      the-1422 case too.
  - **"Drop-off only" segments — already implemented in-game** (a
    per-stop drop-off-only/pick-up-only option already exists in code;
    this was just new information to this conversation, not a new
    mechanic to design). Apply the existing per-stop flag to:
    - 56X into Portree (AM): drop-off only from Lonmore to Portree.
    - 56X out of Portree (PM): drop-off only from after Portree High
      School until Lonmore, then normal pickup+dropoff resumes.
    - 56 school runs from Lonmore (AM): normal until Bernisdale, then
      drop-off only from Bernisdale to Portree High School.
    - 56 school runs (PM): drop-off only between Portree High School and
      just after Bernisdale.
  - **NEW (from 57A/57C work): the returning Bernisdale afternoon 56
    school runs terminate at Portree Co-op, NOT Portree Somerled
    Square** — same short-working-terminus pattern as 57A's returning
    Uig school buses (see below).
  - **CONFIRMED REAL, needs building:** the school-run-services-don't-
    reach-Portree-Somerled-Square interchange is NOT obsolete — it's a
    genuine current arrangement. Passengers wanting the square change
    onto the 52 (into Portree) and the 57C (run as a shuttle to the
    square), both then continuing back out again as the 52 and 57A.
  - The 56X always connects to a 56 at Milovaig (the far terminus) —
    exact nature (duty-link vs. timed passenger connection) not yet
    spelled out.
  - A 56X journey on Fridays terminates early at Lonmore instead of
    continuing to Milovaig, connecting to "the 1422" (a 56 departure) —
    exact stop/journey cross-reference to be nailed down when the route
    is built in-game.
- **Routes 157 & 158 received — Portree primary-school interchange
  shuttles:**
  - 157 = Portree - High School, connecting **Bun Sgoil Ghaidhlig Phort
    Righ** (Gaelic-medium primary school) with Portree High School (via
    Dental Surgery, Co-Op). 158 = Portree High School - **Portree Primary
    School** (mainstream), via Co-Op only.
  - Both are pure interchange shuttles: primary pupils transfer to/from
    other services at Portree High School.
  - **Capacity:** 157 runs at ~70% of seated capacity, 158 at ~60%.
  - **Confirmed:** AM = High School -> primary school; PM = primary
    school -> High School — a single ~10 min leg each way, timed to meet
    the rural services already linked to 157 (56's 0820 AM pickup-only,
    1320/1550 PM drop-off-only).
  - **158 links to DIFFERENT services than 157 — RESOLVED: it's the
    155**, which itself links onward to 150 (a route the user had missed
    off the original list). Full chain confirmed below.
  - Mon-Fri only, no weekend service, every journey SCH-tagged (fully
    term-time only) — consistent with being pure school shuttles.
- **RESOLVED — Portree High School wait/departure-order mechanic:**
  "157 and 158 connected to all other school runs at the same time"
  means all school buses at Portree High School must **wait until every
  other connecting school bus has arrived, no matter the delay** —
  departure is gated on last arrival, not the printed timetable time.
  There is also a **fixed order** in which buses leave the high school,
  even when the timetable shows several leaving simultaneously. The
  exact order is **not yet given** — pending from the user once the
  rest of the Skye timetable work is done; don't invent one meanwhile.
  Not yet confirmed whether this is Portree-specific or a general
  school-interchange mechanic.

  **Real-data import notes, established from working through 608
  (Portree-Fiscavaig), apply to all 15 routes:**
  - Sources are Traveline Scotland PDFs. Real operator names shown on
    them (e.g. "Alasdair Macdonald" on 608) are pure real-world colour —
    they mean nothing in-game. The player's own company runs every Skye
    route regardless of who really operates it.
  - Skye routes are NOT all Stagecoach — expect a mix of real operators
    across the 15.
  - "SCH" = Highland school term-time days only. "NSCH" = Highland
    school holiday days only. An unlabelled column = runs regardless of
    term/holiday.
  - A journey starting partway along a route (never visiting one of the
    termini) is just an ordinary partial-route journey — no special
    handling needed, the same as any route where not every journey runs
    the full length.
  - **NEW REQUIREMENT surfaced by 608's "a"/"b" footnotes** (Tuesdays-
    and-Thursdays-only vs every-SCH-day-except-Tuesdays-and-Thursdays):
    the timetable system needs genuine **day-of-week-specific
    sub-patterns within a Monday-Friday block** — not just the existing
    Mon-Fri / Sat / Sun granularity. A journey needs to be flaggable as
    running on specific weekdays only, or all-but-specific-weekdays,
    within what would otherwise be treated as one uniform block. This is
    a general timetable-engine requirement, not Skye-specific — confirmed
    needed here but likely useful wherever a real timetable has this kind
    of weekday variation.
  - **CORRECTION on how to read 608's own "a"/"b" footnote, Skye-specific:**
    the "a" (Tuesdays-and-Thursdays-only school run) variant is a real-world
    leftover that no longer actually happens — some Skye services used to
    run a last school trip specifically on Tuesdays and Thursdays, but this
    stopped in reality and the published Traveline timetable was simply
    never updated to remove it. So for Skye, **ignore the "a" pattern
    entirely** and use the "b" (does-not-run-Tue/Thu) times for every
    weekday instead, including Tuesdays and Thursdays — that's what
    actually runs now. This is Skye data-cleaning guidance only, not a
    reversal of the general day-of-week sub-pattern requirement above —
    other areas/routes do have genuinely different day-to-day timetables
    that still need that engine capability.
  - **Same obsolete Tue/Thu correction also applies to 607, confirmed
    2026-09-28 — this one was missed the first time round.** 607 carries
    the identical real-world leftover Tuesday/Thursday split 608 has, on
    top of (not instead of) 607's own separate, genuine, still-current
    Friday-differs pattern documented just below — the two are independent
    dimensions on the same route. Every other route in the source file was
    already corrected for this obsolete pattern; 607 and 608 were the two
    that got missed. Use the not-Tue/Thu times for every weekday on 607
    too, exactly as for 608, while still keeping its own real Friday split.
  - **NEW genuine (current, not obsolete) Skye pattern: Fridays differ.**
    On Skye, Fridays run a different timetable from Monday-Thursday on
    most of the 15 routes. Expect most routes to need a Mon-Thu / Friday /
    (Saturday / Sunday where they run) split, rather than a flat
    Monday-Friday block — check each route's Friday table separately
    rather than assuming it matches Mon-Thu.
  - **Confirmed by 607 (Portree-Fiskavaig, a separate real route from 608
    of a near-identical name/corridor but a shorter stop list):** its own
    "a"/"b" footnotes read "a = Only runs on Fridays" / "b = Does not run
    on Fridays" — a live, current example of the Friday-differs pattern
    above (unlike 608's obsolete Tue/Thu case). This also confirms the
    footnote letters "a"/"b" are **assigned per timetable, not fixed in
    meaning** — always read each route's own footnote text rather than
    assuming "a"/"b" mean the same thing route to route.
  - No route so far (608, 607) has shown a Saturday or Sunday table at
    all — absence of a weekend table in the PDF means no weekend service
    that day, the same reading convention used for 608.
  - **607 is confirmed term-time-only**: every journey on it is SCH-tagged
    (no NSCH, no unlabelled journeys), confirmed to mean it runs zero
    service during Highland school holidays — a genuine route-level
    holiday shutdown, not just an artefact of this PDF.

- **Portree High School / Portree Square substitution on non-school days
  (2026-09-28).** Any Skye service that normally calls at Portree High
  School on school days, and also operates on non-school days (i.e. it
  isn't a school-day-only working), calls at **Portree Square** instead
  of Portree High School on those non-school days. Portree Square is the
  same real place already referred to elsewhere in this section as
  "Portree Somerled Square" — use "Portree Square" going forward as the
  short form. This is separate from, and doesn't resolve, the still-open
  Portree High departure-order question above.

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
  1. **Now**: get the bypass's real path (coordinates or a traced route)
     and add it as a one-off to the road graph.
  2. **Later**: once the bypass is properly surveyed and lands in a real
     OSM extract, the pipeline is rebuilt against that newer data and the
     one-off addition is simply dropped in favour of the real geometry —
     no reconciliation mechanism needed since nothing reusable was built.

## 14. Fleet numbering scheme — FINALIZED (replaces every old number-range block)

This replaces the entire original fleet-number-range convention used
throughout the project (10,000s double-deckers, 20,000s/30,000s
full-size/midibus diesel-hybrid single-deck, 40,000s small bus, 50,000s
coach, 70,000s/67,000 electric/hydrogen single-deck, 80,000s/87,000
electric/hydrogen double-deck). Any older document or note still using
"X,000-range" language is superseded by this section.

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
| 3 | Full-size single-deck | ADL Enviro200 MMC at 11.5m/11.8m; ADL Enviro200EV at 10.9m/11.7m; MCV Evora at 12.9m; Volvo 7900 Hybrid/Electric; Yutong E10/E12; Wrightbus GB Kite Electroliner/Hydroliner (all over the 10.8m cutoff) |
| 4 | Double-decker, twin-axle | ADL Enviro400 MMC, ADL Enviro400EV, the Enviro400 open-topper (both power variants), Wrightbus StreetDeck Ultroliner/Electroliner/Hydroliner (buses, not coaches) |
| 5 | Double-decker, tri-axle | ADL Enviro400 XLB (13.4m — see §14a; replaces the ADL Enviro500) |
| 6 | Coach, twin-axle | Volvo 9700 at 12.4m; Yutong T12E |
| 7 | Coach, tri-axle | Volvo 9700 at 13.1m/13.9m/15m; Volvo 9700DD (13m/14.8m); Yutong T15E |

Twin-axle vs tri-axle is derived automatically from length (up to 12.9m
= twin-axle, over 12.9m = tri-axle by law), not a separate selectable
option. Where a size class has both twin- and tri-axle real vehicles
(double-decker, coach), tri-axle gets its own digit, exactly one higher
than the twin-axle digit for that same size class.

No live fleet numbers have been issued to any specific vehicle yet —
this is the category-digit structure only.

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
