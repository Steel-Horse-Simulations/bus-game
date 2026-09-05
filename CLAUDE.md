# CLAUDE.md — handover brief

Read `DESIGN.md` and `OPERATIONS.md` first. They are the specification. This file
covers how to build it and how to work with the person you are building it for.

---

## What this is

A 2D bus company management game on the real Scottish road network, built on
OpenStreetMap data. The player runs a bus operator: routes, timetables, vehicles,
depots, crew rosters, council contracts and money.

A personal project, not a commercial product, though it may become one.

---

## Working style

Established preferences from an earlier project with the same person. They hold
here.

- **Ask rather than guess.** Whenever anything is unclear, ask. Do not infer a
  reasonable-sounding answer and build it. This specification was produced by
  several hundred questions; that is the expected mode.
- **Small increments.** Ship narrow, checkable changes rather than large batches.
  A big change that lands unchecked is worse than three small ones.
- **Give a check list.** After each change, provide specific things to test and
  report back on, so problems are caught while the context is fresh.
- **One area at a time** when gathering requirements — follow-ups first, then
  move on.

---

## Stack

| Layer | Choice |
|---|---|
| Shell | Electron + TypeScript |
| Map rendering | MapLibre GL |
| Simulation | Web Worker, typed arrays |
| Routing and journey planning | Rust compiled to WebAssembly |
| Save format | SQLite |
| Target | Windows 11, installed and run |
| Distribution | GitHub Releases with auto-update |

**Why this split.** About half the game is forms, tables and rosters, where a web
UI stack is the right tool. The other half is pathfinding and agent simulation,
where it is not. Rust/WASM handles road routing and the RAPTOR journey planner;
everything else stays in TypeScript.

**Why SQLite over JSON.** The game autosaves continuously in real time. SQLite
writes incrementally instead of re-serialising the whole world on every save. The
static world — road graph, stops, land use — lives in separate read-only files
and is never written into the save.

---

## Data pipeline

Preprocessing is a build step, not a runtime operation.

1. Download **`great-britain-latest.osm.pbf`** from Geofabrik — not the Scotland
   file, which is clipped at the border and contains no Carlisle or Berwick.
2. Clip to a bounding polygon covering Carlisle, Berwick-upon-Tweed and the
   border strip. Do this **in the Rust pipeline crate with the `osmpbf` crate** —
   not with `osmium`, which has no official Windows build and would only be doing
   the clip, since the file is parsed in Rust anyway for everything downstream.
3. Emit, as separate read-only artefacts:
   - routable road graph (oneway, turn restrictions, access/psv tags, maxspeed,
     inferred road widths),
   - stops, stations and stand data,
   - `public_transport=stop_area` groupings,
   - land use and POI demand points,
   - stadiums, ferry terminals and park-and-ride sites,
   - vector tiles (PMTiles) for the background.

Never call `openstreetmap.org` tile servers at runtime — their usage policy rules
out game clients. Serve your own tiles from the built PMTiles.

**Attribution is required, from two sources.**

OSM is ODbL. Rendered tiles are a Produced Work needing attribution; the derived
road graph and stop database are a derived database, so share-alike applies if
distributed with the game.

The basemap tiles are built with Planetiler's **OpenMapTiles** profile, which
carries its own required credit on top of the OSM one. Both must be visible in
game:

> © OpenMapTiles © OpenStreetMap contributors

---

## Installation and distribution

Packaged with **electron-builder** as a Windows `.exe` installer. Installs to
**Program Files**, so it requests admin. Installer only — no portable build.

Updates come from **GitHub Releases via electron-updater**: check on launch,
download in the background, prompt to restart.

**Map data is not bundled.** The preprocessed road graph, stops, land use and
tiles are downloaded **on first run with a progress screen**, and published as a
separate release asset. That keeps the installer small and means a code update is
a few megabytes rather than a gigabyte. Version the data separately from the app
so a data rebuild and a code release don't force each other.

No code signing, so Windows SmartScreen will warn on first run. Accepted.

## Build order

Phases 1–3 are scaffolding you cannot play. Phase 4 is the first playable build.
Phases 5–9 add depth to a game that already works. Do not reorder without asking.

### Phase 1 — Foundations
Extract and preprocessing pipeline. Road graph with inferred widths. Stops,
stations, land use. Tile build. Renderer with level-of-detail zoom. The override
layer, built once and reused everywhere. **Depot groups**, since almost
everything keys off them.

### Phase 2 — Routes and timetables
Route drawing over the road at 75% with chevrons, waypoints. Stop placement with
kerb snapping. Grouped stops. Direction rules. Variations and the padding model
(`DESIGN.md` §7). Express journeys flagged in one timetable. Timing points with
separate arrival and departure times. Frequency as a generator. Time-of-day
bands, day types and the event calendar. Connection stops.

### Phase 3 — Buses moving and the fleet
Vehicles driving the real graph. The vehicle configurator and catalogue. Vehicle
condition, used purchases and delivery lead times. Fleet numbers and plates.
Basket buying. Route numbering. Depot placement, entrances and the opening
scenario. Route bands at full
opacity with non-crossing ordering. Badge markers. Depots. Duties with chaining,
locking and lowest-cost auto-complete. Dead running and dead mileage routes.

### Phase 4 — Passengers and money — *first playable*
Demand from land use. RAPTOR journey planner. Two-tier passenger simulation.
Passenger types and concessionary reimbursement. Fare zones, the five
single-fare cases, ticket families and automatic capping.

**Milestone: a bus carries a passenger and earns money.**

### Phase 5 — The business
Finances, leasing and the three payment options. Stop and stand fees. Council
contracts, bidding, cost-per-passenger targets and failure penalties. Event
contracts for venues and cruise ports. The competitor. Punctuality. Reputation.
The three awareness levers, designed together.

### Phase 6 — Drivers
Rotas in full — types, lines, bands, spares, the grid, auto-fill, pay floors,
holiday and sickness, duty limits and driver wellbeing. Legal hours enforcement. Swap points, staff
cars, staff buses, walking. The three recruitment routes, training buses and
instructors. Driver score, traits and happiness. Overtime and loans.

### Phase 7 — The rest of the staff
Fitters, technicians, engineers, workshop manager — including the fitter-to-
technician-to-engineer cascade, loan limits and contract hiring. The three-tier
stores structure (storekeeper, store manager, stores director). Controllers,
relief controllers and the operations manager and director above them. Depot
managers. The three-tier marketing structure. Cleaners, travel centre staff,
stance assistants, tour guides. Licences. Promotion and vacancy chains. Unlock
conditions. Staffing caps. Discipline and warnings. The wages page.

### Phase 8 — Maintenance
Work list, job types, safety inspections, MOT and the annual test. Parts stock.
Breakdowns, engineering vans and the recovery unit. External maintenance. Vehicle
upgrades.

### Phase 9 — Depth and polish
Livery branding regions and repainting (Ferrymill, travel, caps and timings).
Depot renting, buying and building. Concealment areas and depot arrival visuals.
Stand placement, drop-off stands and stand-seeking behaviour. The customer ratings
page. Outstations and small depots. Buying stops and stations. Stop and station
upgrades. Stand changes and announcements. Electric charging, pantographs and
LEZ fines. Liveries. Second-hand sales, scrapping and cascades. Tour routes.
Islands and ferries, including Shetland's flight leg. Fuel, energy and charger
hire. Accidents. Accessibility. Road restrictions. Maintenance groups. The dealer
network (Volvo, Alexander Dennis, Western Commercial, and the Wrightbus/Yutong
nearest-depot collection rule) and remote parts logistics. Remote depots,
lifeline contracts, community transport and scoped road closures.

**Sightseeing and private hire** also land here. Private hire cannot come earlier
than phase 7 regardless, since it depends on drivers, duties and legal hours
being in place. Both matter to the economy, so if phase 5 tuning feels thin,
that is expected — the premium revenue arrives with these.

This phase is a grab-bag and will want splitting once you reach it.

---

## Known hard parts

- **Scale.** Individual passengers with origins, destinations and interchanges
  cannot be simulated across a country. The two-tier model is not optional, and
  both tiers must agree on revenue and loading. Build the split in from the
  start; retrofitting it is painful.
- **Capping across two tiers.** Automatic caps need each passenger's spend to
  persist across a day and a week. The statistical tier needs an equivalent or
  revenue will diverge.
- **Journey planning.** RAPTOR is real engineering and must be rebuilt whenever a
  route or timetable changes. It is on the critical path for phase 4.
- **Variation padding.** Pad every variation to the longest, at the outer
  terminus, never below its minimum wait, and shrink back when the longest is
  deleted. Fiddly and easy to get subtly wrong — write tests before the UI.
- **Band ordering.** Ordering route bands so they do not cross at junctions is a
  global constraint, not a per-road choice, and is unsolvable in some layouts.
  Solve automatically and ask where a crossing is unavoidable.
- **Place-the-ends-and-spread-the-rest.** Used in three places — station infill on
  the earlier rail map project, route variations, and bus station stands. Build it
  once as a shared component, not three times.
- **Rota validation.** Duty length caps, the six-days-in-a-row rule, legal rest
  from unfilled cells, the 10% holiday cap and the 39-hour pay floor all interact.
  Write the validator with tests before the rota UI, the same as variation
  padding.
- **Vacancy chains.** One promotion can open four posts down the line, with a
  week-long driver training course at the bottom. Build it as a chain.
- **Drivers' hours.** GB domestic rules are not retained EU rules. Get the actual
  rules right before building duty validation.
- **Stand contention.** Buses queue for stands. A small simulation of its own,
  and it means a timetable can fail for reasons unrelated to the road network.
- **Crew as physical entities.** Once a driver must be present to take over a
  bus, staff cars, walking and staff buses become a dependency chain the
  simulation resolves, not decoration.
- **OSM data quality.** Missing turn restrictions and mis-tagged one-ways will
  send buses the wrong way. The override layer must be built once and reused,
  with imported data read-only and always recoverable.
- **The optimiser's constraints.** The operations manager must respect connected
  services, locked departures, ferry locks and whole frequencies, and must report
  rather than improvise when it cannot. Get those guards in before the optimiser.
- **Timetable components.** The merged view is read-only and derived; every edit
  lands in a component. Build the merge as a projection, not a copy, or the two
  will drift.
- **Combining satisfaction inputs.** Driver score, friendliness, happiness,
  vehicle quality, cleanliness, punctuality and stop quality all feed passenger
  satisfaction. Design them into one number, not seven stacking bonuses. The same
  applies to the three awareness levers.
- **Vacancy chains reach into engineering too.** A departing engineer can
  cascade a promotion down through technician to fitter, constrained by loan
  limits (max 1 out, min 2 left behind) and a stricter automatic-promotion bar
  than a manual one. Build it as the same kind of chain as the wider staffing
  vacancy chain, not a separate mechanism.
- **Remote depot rules are pervasive, not one feature.** They touch drivers
  (training location, hours), engineering (dual roles), controllers (Sunday
  coverage via the other end of a route), stores (parts logistics, §9a), and
  contracts (lifeline structure). Treat "is this depot remote" as a flag every
  relevant system checks, not a separate remote-depot module.

---

## Economy tuning

The target is **a well-run route paying back its bus in about 12 months**, with a
badly-run route losing money. Margin follows from that; do not set a margin
directly.

The margin comes from **premium work**, not from inflating the scheduled network:
council and event contracts, sightseeing, and private hire. Passenger numbers and
running costs stay realistic — earlier drafts inflated both and that was dropped.

The target applies to a well-run **depot group**, not to every route. A plain
commercial urban route with no contract or premium work may never pay back a bus
in twelve months on its own, and that is intended.

Every figure the player reads stays realistic.

---

## Reference material

`reference/` holds:
- saved Lothian Buses, Airlink and Lothian Country fares pages, which the fare
  model in `DESIGN.md` §9 is based on — use for realistic starting values, not
  for structure.

There is no vehicle artwork to produce. Liveries are colour sets only
(`OPERATIONS.md` §4).
