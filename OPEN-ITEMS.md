# Open items

Running list of unanswered questions and outstanding tasks, kept in the repo so
it carries between sessions and is visible to both chat and Claude Code.

**Anyone may add to this file. Nothing is removed until it's actually done or
decided — move it to Settled with a one-line answer, don't just delete it.**

---

## Open questions

| # | Question | Blocks | Notes |
|---|---|---|---|
| Q12 | Pantograph/battery-buffer financing (OPERATIONS.md §15) was asked to match vehicle finance's deposit percentage, term length and interest premium (§3) — but §3 doesn't actually specify any of those three, only that lease-to-own totals ~10% more than buying outright. What should the real deposit/term/interest figures be, for both this and vehicle leasing itself? | Battery-buffer finance details, and arguably vehicle finance's own numeric detail | Not guessed at — see OPERATIONS.md §15's "Financing" paragraph |

## Outstanding tasks

| # | Task | Owner | Status |
|---|---|---|---|
| T34 | User request: show railway lines and railway stations on the map. Station-as-higher-demand-point is already specified (DESIGN.md §4, "Station, airport and park-and-ride stop linking") but unbuilt since Phase 4 (demand) hasn't started; the actually-actionable new piece is a new pipeline artifact — rail line geometry and station points don't exist in the pipeline at all yet (CLAUDE.md's artifact list has roads/stops/landuse/venues, no rail). Not started — needs scoping (new `.bin` artifact, WASM decoder, map layer) before starting, same shape as the original stops/landuse/venues work | Claude Code | Pending |
| T33 | Wrote two chat batches into DESIGN.md/OPERATIONS.md: pantograph charging points now get a local battery buffer (continuous capacity, real cost formula, buildable only at owned stops/stations/interchanges — OPERATIONS.md §15); and a complete island/remote-area review (12 areas' lifeline-need and dedicated-livery status, DESIGN.md's new "Island and remote-area review" table) plus the lifeline payment model (council keeps all farebox, operator paid a fixed isolation-scaled rate per mile instead) and confirmation that adding a route to an already-established remote depot re-runs the same negotiation every time. Also fixed a real task-number collision: this session had already used T29/T30 for its own tracked work before a separate edit reused the same numbers for unrelated content — renumbered the older pair to T31/T32 rather than leaving two different T29s and T30s in the table. One number left genuinely open rather than guessed — Q12: the battery financing was asked to match vehicle finance's deposit/term/interest figures, but §3 doesn't actually specify any of those. Doc-only change, no code affected | Chat | Done |
| T31 | Wrote a chat batch into DESIGN.md and OPERATIONS.md: SPT as the contracting body within its zone (subsidy-first, full contract as fallback, dedicated livery required above a subsidy threshold); per-fuel-type regional discounts scaling independently (diesel/electric/hydrogen no longer one blanket discount); on-site hydrogen production and hydrogen refuelling infrastructure; solar panels and batteries as depot infrastructure with time-of-use overnight charging stacking with the regional discount; facility electricity use for owned depots/stations, priced below real-world | Chat | Done |
| T32 | A separate VEHICLE-SPECS.md file exists (chat-maintained, not yet in this repo) covering the entire vehicle catalogue in detail — lengths, capacity, range, prices, every option's effect, training buses, the L-plate asset. User has this file directly; ask them for it when ready to fold it in, don't try to reconstruct it here | Chat | Pending — needs the file from the user |
| T29 | Build the read-only stop/bus-station timetable viewer (user request): click a stop or station, see every calling service by day/time, grouped by stand at a station. Increment 1 (router fastest-route fix) done. Increment 2 (real timetable data model + a minimal editor UI) done. Along the way: added a Routes panel, then rebuilt it properly to DESIGN.md §11's actual spec — a single persistent left-hand column with three states (route list / drawing / locked reference beside its timetable), grouped by depot group with proximity reordering, colour/activation/profit/problem-indicator/long-distance pieces deliberately deferred and flagged (need livery/finance/staffing/activation systems that don't exist yet). Still not started: the actual read-only stop/station timetable viewer | Claude Code | In progress |
| T30 | Wrote three small items into the specs: a hard minimum zoom level (DESIGN.md §1, alongside the existing playable-area rules, stops the player scrolling back out past the launch-time zoom); an explicit confirmation that basket vehicle buying already implies per-vehicle destination depot and livery, not one for the whole order (OPERATIONS.md §3); and a new "rail acceptance" mechanic (DESIGN.md §10, alongside road closures) — a random rare event where the operations manager can accept rail tickets on bus services near a disrupted station, paid the full single fare per passenger, uncapped, with the same one-month payment delay as the £2 fare cap | Chat | Done |
| T27 | Wrote a large chat batch into DESIGN.md/OPERATIONS.md: the £2 fare cap (Highland+Moray and the 12-council SPT zone, bordering directly with no gap), AIR as a fourth fixed real contract, the airport route type, walk distance (400m urban/600m rural) and wait tolerance (15/30 min), managing director role, comfier seats, twin/tri-axle coach seating (53/65), breakdown weighting (engineering quality > age), the 28-day/35-day servicing schedule, parts finance breakdown by category, maintenance paid monthly, and map/routing notes (playable-area consistency, fastest-route routing — the latter two were already present, not duplicated) | Chat | Done |
| T28 | Resolved a real contradiction while writing T27: chat's notes said the airport-specification vehicle (reduced seats, more luggage) was needed for Express 500, but DESIGN.md's Express 500 entry already had a different specific requirement (double deck/electric/80,000/livery). User confirmed both apply together — Express 500 now requires all of it stacked, not one or the other | User | Done |
| T18 | Write the Q1–Q9 answers (below, in Settled) into the specs. Needs a fresh copy of OPERATIONS.md and DESIGN.md first — chat's local copy predates T15/T16 and adding these blind risks conflicting with that work | Chat | Done |
| T15 | Add the revenue inspector role to OPERATIONS.md: one rung above controller, promoted from any role, assigned to a depot group and roams within it automatically. A fixed small percentage of passengers always evade, caught based on inspector skill. Fine is a multiple of the fare owed, like a penalty fare. No reputation effect. Cap scales with services run in the group | Chat | Done |
| T16 | Rework the wages model in OPERATIONS.md §6 from "settable per role" to a single base wage (professional driver = 1.00) with every other role set as a fixed ratio of it — no individual override. Add bulk pay-adjustment tools, company-wide and per depot group. Full proposed ratio table given in chat, fleet elite bonus reduced to £20/month | Chat | Done |
| T17 | Add automatic contrast colouring for the support vehicle icons (spanner/person/recovery/parcel), matching the route number colour system exactly: sample what's behind the icon's fixed badge position, pick black or white, allow a manual override per icon. The delivered icon PNGs are plain white shape masks, not final colours — treat them as a stencil the renderer tints | Chat | Pending |
| T4 | Get the combined update message to Claude Code | User | Done |
| T5 | Produce branding mask and number box images for each existing livery | User | Pending |
| T8 | Design the map-data output layout, versioning and manifest format for the pipeline, matching the "installer has no map data; downloads separately on first run, versioned independently from the app" model going into CLAUDE.md. Current pipeline output (`pipeline-data/*.bin`) is informal dev-scratch, not yet this. Blocks nothing in phase 1 | Claude Code | Pending |
| T9 | Add OpenMapTiles attribution to CLAUDE.md alongside the OSM credit | User | Done |
| T10 | Copy the four updated documents into the repo | User | Pending |
| T11 | Write the newest decisions into the specs | Chat | Done |
| T12 | Build the real installer + GitHub Releases + electron-updater pipeline (`CLAUDE.md`'s actual distribution model). Only an unpacked local dev build exists so far (see Settled). Needs an actual release process first — not started | Claude Code | Pending |
| T13 | Update DESIGN.md's "Islands and ferries" section — it still says Shetland is excluded, but the decision is now to keep it in (see Settled) | User | Done |
| T14 | Correct the region layout: North Scotland, West Scotland, East Scotland, North England (one, not split NE/NW), and Shetland as its own fifth region. Currently built as NE England / NW England split instead — needs the depot_groups region set changed and existing data migrated, same pattern as the v1→v2 migration | Claude Code | Done |
| T19 | Extract OSM `place=city/town/village` nodes (with population, or place-type rank where population is missing) into a new pipeline artifact, then use the largest one in a depot group as the settlement-fallback reference for DESIGN.md §6's direction rule ("a route touching no bus station"). Blocked on nothing except being built — deferred while building the bus-station path (see Settled) since it's a new pipeline artifact, not a small addition | Claude Code | Pending |
| T20 | Write chat's route-structure decisions into DESIGN.md/OPERATIONS.md: start/terminus stops and the 2/2 cap, the variations editing workflow and inheritance rules, the stand-seeking correction (no relocation step), vending machines, the route panel's full specification, and long-distance route numbering from 900 | Chat | Done |
| T21 | Implement start/terminus stops on the Route model (DESIGN.md §6, per T20): let the player flag one interior stop to end the outbound leg early, encoding a terminus loop, and compute direction correctly for a looped route | Claude Code | Done |
| T22 | Write chat's new "fixed real contracts" content into DESIGN.md: the contract category itself (shared contracts menu, warning-and-review penalties, 10-day lead time), Route 398 and Airlink 100 as worked examples, the general contract-depot-reassignment mechanic, station/airport stop linking, and the stop reservation/branding mechanic | Chat | Done |
| T23 | Bus station colour (#003a8c) sits too close to Route 398 (#002664) and Airlink 100 (#002b4e)'s reserved-stop colours — change it, and give airport/railway station stop linking (DESIGN.md §4, not yet built) their own colours on the same ring style. Rail fixed at #ff4200 by the user | User | Done |
| T24 | Extend T23's stop-linking treatment (always-visible, higher demand, own ring colour) to park and ride sites too, same as airports/railway stations. Stadiums and ferry terminals — grouped with park and ride as one pipeline data category — stay out of scope for now | User | Done |
| T25 | Add Express 500 (Glasgow Airport service) to DESIGN.md §10 as a third fixed real contract, alongside 398 and Airlink 100: real timetable (Mon-Fri/Sat/Sun PDFs), its own ticket family, colour #1e6e6f, reserved Buchanan Bus Station Stance 46, 80,000-range double-deck electric vehicle requirement. Also fixed 398's fleet range (30,000 -> 70,000, a correction from the user) and made all three contracts' awarding body explicit (ScotRail/Edinburgh Airport/Glasgow Airport) | Chat | Done |
| T26 | Add Route 77 (Glasgow Airport commercial service, real timetable) to DESIGN.md §10 — not a fixed real contract, ordinary commercial economics, but fixed identity (colour #93318e, shared Glasgow Airport livery, electric single-deck 70,000-range vehicles, reserved Buchanan Stance 45 + Glasgow Airport Stance 6) and doubles as Express 500's unlock gate (1 month running). Reworked Express 500 to match: shares the Glasgow Airport livery family (2 liveries, answering Q11) instead of its own dedicated one, reserves a second stand (Glasgow Airport Stance 1), can share vehicles with Route 77 overnight, and gained an extra unlock gate on top of its original condition | Chat | Done |

---

## Settled

Kept briefly so a decision isn't reopened by accident. The four documents remain
authoritative — this is a short record of decisions that were reversed, lost or
argued about, not a summary of the design.

- **Q1–Q9 answered and written into DESIGN.md/OPERATIONS.md (T18 done,
  verified against the actual files — §8a/§8b and the rest of T15/T16 are
  untouched):**
  - Q1: the third engineer/controller band is **Late**.
  - Q2: bulk vehicle discount is 2/4/6/9/12/15% for 1–6 vehicles, then **+1% per
    vehicle past 6, capped at 25%** (reached at 21).
  - Q3: rota changes need **5 days'** notice, same as a route/timetable change.
  - Q4: overtime pays a **flat 20%** above normal wage, same for every role.
  - Q5: depot and bus station capital costs sit **20% below real-world**.
  - Q6: LEZs stay at **Euro VI permanently** — never tighten further.
  - Q7: **3 warnings** before dismissal, the same number for every role.
  - Q8: revenue inspectors unlock at **10 routes** in a depot group.
  - Q9: cap is **1 inspector per 20 services run per day** in the depot group.

- **Large sync completed.** A substantial backlog of decisions from chat —
  fitters, the engineering promotion cascade and loan limits, the full remote
  depot system (proposal, staffing, hours, lifeline contracts, community
  transport, scoped road closures), maintenance groups, the dealer network
  (Volvo's 8 locations and universal servicing role, Alexander Dennis, Western
  Commercial, Ferrymill's corrected Torrance location, the Wrightbus/Yutong
  nearest-depot collection rule), remote parts logistics (van/bus legs, stance
  assistants, bus station staffing pattern and caps), general staffing caps,
  council contract hours and subsidies, shopper services, dual-purpose school
  routes, and fuller event contract rules — has now been written into DESIGN.md,
  OPERATIONS.md and CLAUDE.md in one pass. Treat the documents as caught up;
  this file no longer needs to carry that backlog.
- **Region layout conflict resolved.** North Scotland, West Scotland, East
  Scotland, North England (as one), and Shetland as a fifth region. Corrects
  Claude Code's built NE/NW England split, which needs reverting (T14).

- **Terminology.** Wherever the specs say "area" it means **depot group**. Two
  other boundaries exist: **regions** (North Scotland, West Scotland, East
  Scotland, North England — a depot group belongs to one) and **council areas**
  (real OSM `admin_level=6` boundaries, cutting across depot groups, governing
  contracts, stop fees, station ownership and subsidies).
- **Route numbering scope.** Commercial numbers per depot group; contract and
  school numbers per council area. Prefixes: X express, S school, T tours, C
  cruise, and player-set codes per venue.
- **Routes are activated and deactivated**, not created and deleted. Activation
  state and a pending start date belong in the route record from the start.
- **Islands.** Skye and the main ferry islands are in. Shetland was meant
  to be out, but the extract boundary's northern reach (~61.1°N, drawn to
  cover Orkney) scoops it in too — discovered 2026-09-04 with a full real
  road network there (30 features), not a partial/edge artifact. **Decided
  to keep Shetland in rather than fix the boundary** — DESIGN.md §"Islands
  and ferries" still says "Shetland is too far out and is not included"
  and needs updating to match (T13 below).
- **Installation.** electron-builder `.exe`, Program Files, no portable build, no
  code signing. Updates via GitHub Releases and electron-updater. **Map data is not
  bundled** — it downloads on first run with a progress screen, published as a
  separate release asset and **versioned independently of the app**.
- **Attribution.** OSM (ODbL) plus **OpenMapTiles** for the Planetiler basemap:
  "© OpenMapTiles © OpenStreetMap contributors".
- **Cross-group variations dropped.** A route belongs to exactly one depot group.
  Another group owning a shorter variation was agreed and then dropped as needless
  complexity, taking the shared numbering, fares, accounts and duties with it.
- **Long distance is the operations director's.** Run from company level, separate
  from local services, worked from named depots across regions, with its own
  accounts section split by depot.
- **Game clock.** 1 real second = 10 game seconds at normal speed. Speeds 1x, 4x,
  10x, 20x, 60x. Menus pause the game; it also pauses for decisions.
- **Recurring cycle.** Wages every Thursday. Operational changes on the Monday of
  every even-numbered week — fortnightly, replacing the earlier first-Monday-of-the-
  month rule.

- **OSM source must be Great Britain, not Scotland.** Geofabrik clips the
  Scotland file at the border, so it contains no Carlisle or Berwick to clip
  into. Agreed once in Claude Code, lost in a spec rewrite, agreed again.
- **No osmium.** The clip runs in the Rust pipeline crate using the `osmpbf`
  crate. The file is parsed in Rust anyway for everything downstream.
- **Route change lead times.** 2 days for adding or removing a stop, 5 for a path
  or timetable change, 10 minimum for activating a route.
- **Road width.** `width` tag, then `lanes`, then `highway` class defaults. The
  colours on openstreetmap.org are only a rendering of the class tag, so they
  carry no extra information.
- **Economy model.** Margin comes from contracts, sightseeing and private hire.
  Passenger numbers and running costs stay realistic. Property capital is the one
  deliberate exception.
- **Livery images.** Three per livery, same size and alignment: the badge, a
  branding mask (black unchanged, white primary, mid grey secondary), and a number
  box whose bounding rectangle is read once on import and stored as fractions.
  ChatGPT's 1891x832 output is the right aspect; keep the centre third of the badge
  a single flat colour.
- **Repainting.** £1,500 / £2,000 / £2,500 / £3,000 by vehicle type, 2% off per
  extra vehicle to a 10% cap, 5 working days at Ferrymill Motors Glasgow
  (55.9434706, -4.2055358), driven there and back or collected at 1.3x. Simple
  branding changes are a third of the cost, 1–2 days, at the main depot. Two
  vehicles per depot group away at once.
- **Livery requirements.** A route carries a list of acceptable liveries with
  strictness set per route, enforced through the duty filter. Where no correct
  vehicle is free the game warns — in advance and again at runout — and the
  controller decides, with competence governing how well it goes. Wrong livery
  only costs reputation on branded routes.
- **Tile build toolchain: Planetiler, not tippecanoe/osmium.** JVM-based (Java
  21+), so it runs on Windows without the "no official build" problem osmium
  had. Outputs PMTiles directly, and its built-in OpenMapTiles basemap profile
  covers the background layers MapLibre needs out of the box. Its `--polygon`
  flag accepts the same `.poly` boundary file already built for the Rust
  clip, so tile output is scoped to Scotland + the border corridor without
  needing a separate clipped `.osm.pbf`. Java installed into the user-level
  conda env at `C:\Users\SDown\miniconda3` (originally set up for
  osmium-tool). **osmium-tool answered (Q8): it was never used — "No osmium"
  held throughout — and has now been uninstalled from that env.** Only
  `openjdk` remains there, load-bearing for Planetiler.
- **MapLibre renders real tiles now — root cause of a silent blank-map bug found
  and fixed.** MapLibre GL JS computes its Web Worker script URL from
  `import.meta.url`, but only when that URL is `http(s):` — under Electron's
  `file://` (the default for `loadFile()`), it silently returns an empty
  string, the worker never starts, and every tile request hangs forever with
  no error, no console output, nothing. Fixed by calling
  `maplibregl.setWorkerUrl()` explicitly with a page-relative URL, and by
  copying `maplibre-gl-worker.mjs` and its sibling `maplibre-gl-shared.mjs`
  (which the worker imports via a hardcoded relative path Vite's asset hashing
  would otherwise break) unhashed into `src/renderer/public/` via
  `scripts/copy-maplibre-worker.mjs`, run automatically before `dev`/`build`.
  Verified end-to-end against the real pipeline output: real Scotland
  coastline, islands, motorways and the extract boundary all render correctly
  in the built Electron app. Diagnosed with a driver.mjs upgrade (`console`
  and `net` commands, capturing browser console/network activity) that's
  worth keeping for future debugging.
- **Save file uses `node:sqlite`, not better-sqlite3.** Built into Node
  (stable in the Node 24.18.1 Electron 44 bundles — verified directly, no
  flags needed), so no native-module rebuild step and no extra dependency.
  First use: `electron/db.mts` — depot groups (the first real save-data
  object, `OPERATIONS.md` §1) and the override layer (`DESIGN.md` §1) as one
  generic `osm_overrides(entity_type, osm_id, field, value)` table, reused
  for every category of imported OSM data rather than one mechanism per
  category. Wired into the real app lifecycle (opens on startup at
  `app.getPath('userData')/save.sqlite`, closes on quit) and verified against
  the actual file it creates, not just in isolation.
- **Phase 2 kickoff: the WASM router works end-to-end against the real road
  graph.** New shared crate `rust/game-data` holds the `RoadGraph`/`Edge`/
  `GraphNode`/`Restriction` types so the pipeline (writer) and `game-wasm`
  (reader) can never drift apart — a schema change is a compile error in
  both, not a runtime surprise in one. `game-wasm`'s new `Router` decodes
  `road_graph.bin`, builds a directed adjacency list honouring oneway and
  access/psv/bus tags, and runs Dijkstra with nearest-node snapping,
  including each edge's real shape points in the result (not just straight
  lines between junctions). Verified in the real Electron app: loaded the
  actual 95MB `road_graph.bin` (1,027,955 nodes / 1,170,137 edges — exact
  match with the pipeline's own numbers), found a real 223-point
  Waverley→Haymarket route, and confirmed on screen it follows real
  streets throughout, including a roundabout. `wasm-pack build --target web`
  regenerates `src/renderer/wasm/` (gitignored, build output). Temporary
  test wiring in `src/renderer/route-check.ts` — delete once the real
  click-to-draw route tool supersedes it.
- **Real OSM stops now render on the map.** `Stop`/`BusStation`/`StopArea`
  moved into `game-data` (same drift-prevention reasoning as `RoadGraph`);
  `game-wasm` gained `decode_stops`, and `src/renderer/stops-layer.ts` fetches
  `stops.bin`, decodes it and draws two circle layers — small dots for stops
  and platforms (visible from zoom 13), bigger dots for bus stations (visible
  from zoom 10). Verified in the real app: 30,849 stops decoded (30,715 bus
  stops, 75 platforms, 59 bus stations), all sitting correctly on real
  streets around Waverley at both a city-block and a close-up zoom. This is
  read-only display of imported data — clicking to place a new stop with
  kerb snapping (DESIGN.md §4) is the next increment, not yet built.
- **Bus station stands hide by default; plain grouped stops don't.** A
  station's individual stand stops are only revealed by clicking the
  station (clicking again hides them). Determined from `public_transport=
  stop_area` relations: if a stop_area's members include a bus station,
  its other members are that station's stands and get hidden; a stop_area
  with no bus station member (the Union Street Aberdeen case, DESIGN.md
  §4) is a plain grouped stop and keeps showing on the main map as before.
  **Known gap**: only stations tied together by an actual stop_area
  relation get this treatment — of the 59 bus stations in the current
  extract, only 2 have one (Gyle Centre Bus Terminus, 6 stands; one
  unnamed station, 12 stands). A station without a stop_area relation
  keeps any separately-mapped stand stops visible on the main map, since
  there's no data linking them to hide. Also added stop colouring ahead of
  routes existing: blue for a stop at least one service uses, grey
  otherwise — `isUsedByService()` in `stops-layer.ts` is a stub returning
  `false` for everything until routes exist to check against. Verified by
  clicking the Gyle Centre station in the running app and confirming its
  6 stands appear/disappear correctly.
- **Manual stop -> bus station assignment, and a per-station "always show
  stands" toggle.** First real use of the override layer (DESIGN.md §1)
  from the renderer: `electron/main.ts` exposes `setOverride`/`getOverride`/
  `hasOverride`/`resetOverride`/`listOverrides` over IPC
  (`overrides:set/get/has/reset/list`), `electron/preload.ts` bridges them
  via `contextBridge` as `window.overrides`, typed in
  `src/renderer/overrides.d.ts`. Clicking a stop opens a popup with a
  dropdown of the 12 nearest bus stations (sorted by distance) plus "(not
  part of a station)"; clicking a bus station opens a popup with an "Always
  show stops here" checkbox. Both write straight to
  `osm_overrides(entity_type, osm_id, field, value)` — `("stop", <stop
  osmId>, "bus_station", <station osmId | null>)` and `("bus_station",
  <station osmId>, "always_show_stands", <bool>)` — and take effect
  immediately, no save/reload needed. Verified end-to-end in the running
  app, including that it survives an app restart (SQLite, not in-memory
  state): assigned a Waverley-area stop to Edinburgh Bus Station, confirmed
  it disappeared from the main map and relaunched the app to confirm the
  assignment persisted, then reset it back to clean up the test.
  **Important limitation surfaced by this**: most real bus stations —
  Edinburgh Bus Station included — have no `stop_area` relation grouping
  their stands in OSM at all (only 2 of 59 stations in the current extract
  do), so their individual stand stops are *not* auto-hidden and show up
  as clutter by default, same as before this increment. Manual assignment
  now fixes this, but one stop at a time — Edinburgh Bus Station alone has
  roughly 15 stands, meaning 15 individual assignments to fully clean it
  up. **Resolved same session**: added a bulk "assign nearby stops" action
  to the station popup — a radius input (metres) with a live preview count
  ("16 stops in range", including how many would be reassigned from
  another station), and an Assign button that writes an override for each
  in one go. Verified on the real Edinburgh Bus Station: 50 m correctly
  found all 16 of its stands, assigning them all hid the clutter from the
  main map in one action, and clicking the station still reveals all 16
  with the station-membership outline. Test assignments reset afterwards
  to leave the save clean.
- **Road widths now follow openstreetmap.org's own scale.** The previous
  basemap style capped every road class's width at zoom 14 (motorway/major
  topped out around 4-5px, minor roads never grew past a flat 1px), so
  streets stayed thin slivers next to buildings at close zoom. Pulled the
  actual per-class, per-zoom pixel widths from the real openstreetmap-carto
  stylesheet (`gravitystorm/openstreetmap-carto`, `style/roads.mss` — the
  source for the "Standard" layer on openstreetmap.org) up to zoom 20, and
  applied them as `line-width` interpolations in `basemap-style.json`.
  Split the old single `roads-minor` layer (which had lumped minor,
  service and track together at one width) into `roads-track`,
  `roads-service` and `roads-minor`, since those differ substantially in
  real width. `roads-major` keeps grouping primary/secondary/tertiary/
  trunk into one curve — their real osm-carto values converge from zoom 15
  up and are close enough below that to not be worth a fourth split.
  Verified visually at zoom 12 (wide city view, roads stay thin and
  unobtrusive), zoom 15, and zoom 18 (streets now fill the visual gap to
  building faces, matching the request).
- **Basemap style overhauled to closely match openstreetmap.org's own
  "Standard" look, self-hosted — not hotlinked.** The user asked to use
  osm.org's roads directly; that's ruled out (CLAUDE.md: never call
  openstreetmap.org tile servers at runtime, their usage policy rules out
  game clients). Went as close as the self-hosted PMTiles/MapLibre pipeline
  allows instead: pulled real colours and casing widths from
  `gravitystorm/openstreetmap-carto` (`road-colors.yaml` — LCH colour
  parameters, computed to hex by hand since the generation script needs
  Python/colormath2 which isn't part of this pipeline — cross-checked
  against the repo's own committed `style/road-colors-generated.mss`;
  `style/roads.mss` for widths/casing-width variables; `style/water.mss`,
  `landcover.mss`, `buildings.mss`, `style.mss` for land/water/building
  colours). Each road class (motorway, trunk, primary, secondary, tertiary,
  minor, service, track) is now its own pair of MapLibre layers — a wider
  "casing" line in the darker/saturated colour drawn first, a narrower
  "fill" line in the lighter colour on top — reproducing the outlined-road
  look (motorway's pink-with-dark-red-edge is the clearest example).
  Buildings, residential landuse and boundaries got their outline layers
  and real colours too. Verified visually across several zooms and
  locations: city-centre street grid (Edinburgh), a motorway/trunk
  junction (casing clearly visible, scales correctly with zoom), and a
  close-up on a tertiary/secondary road (casing present but subtle,
  matching how thin it genuinely is on osm.org at that class). Road name
  labels and motorway shield icons were explicitly out of scope for this
  pass — not attempted.
- **Casing redefined as a grade-separation indicator, not a per-class
  outline — fixes a real junction artifact.** The previous casing pass put
  an outline on every road of every class, always. At a junction between
  two different classes (a secondary road becoming a primary, say — one
  continuous street reclassified partway along, not a real crossing), the
  two independently-styled casing layers met at an angle and left a
  visible dark wedge right at the joint — confirmed with a close-up
  screenshot on Leith Walk showing exactly this. Reworked so ordinary
  roads (`brunnel` unset) render as a single flat-coloured line, no
  casing at all — clean joins everywhere, matching the request that
  joining roads shouldn't show a border. A **black casing** (matching
  osm-carto's own `@bridge-casing: black`) now appears only where
  `brunnel == "bridge"`, one dedicated layer per class reusing the
  original (now-unused-elsewhere) casing width curves. Tunnels
  (`brunnel == "tunnel"`) get 55% line-opacity instead of a casing — a
  road actually going underground reads better as dimmed than outlined.
  Verified: the Leith Walk artifact is gone (clean colour transition,
  confirmed by re-screenshotting the same spot), and a real bridge found
  via `querySourceFeatures` (City of Edinburgh Bypass area) shows the
  black casing appearing exactly on the bridged segment and nowhere else.
- **Self-hosted font glyphs added — first new pipeline asset outside the
  OSM/OpenMapTiles chain.** Road labels and shield text need MapLibre's
  glyph protocol (PBF font ranges under a `glyphs` URL template); there's
  no way to render `text-field` without it. Downloaded the "Noto Sans
  Regular" glyph PBFs (SIL Open Font License — free to redistribute, no
  on-screen credit required, unlike the OSM/OpenMapTiles ODbL terms) from
  `protomaps/basemaps-assets` (itself built for exactly this self-hosting
  case) for the Latin ranges covering GB/Gaelic place names (0-255,
  256-511, 512-767, 768-1023) into `pipeline-data/fonts/Noto Sans
  Regular/`, served by the existing local dev HTTP server — no new
  server code needed, it already serves the whole `pipeline-data/`
  directory generically. **Still informal dev-scratch like the rest of
  `pipeline-data/`** — folded into T8 (the pending map-data output
  layout/versioning/manifest task) rather than tracked separately.
- **One-way arrows, road labels and shield badges added.** Arrows and
  shield badges are two small canvas-drawn icons registered at runtime via
  `map.addImage()` (`src/renderer/map-icons.ts`) rather than a prebuilt
  sprite sheet — not worth a sprite build step for two images. Arrows: a
  symbol layer filtered on the vector tile's `oneway` property, placed
  along the line, rotating to match each road's own bearing. Labels: road
  names along the line from the `transportation_name` source-layer (this
  layer exists in our Planetiler output but only becomes queryable once a
  style layer actually references it — `querySourceFeatures` against it
  returned nothing until the label layer was added to the style, which
  cost some time to figure out). Shields: primary/trunk/motorway `ref`
  numbers in a rounded-rect badge via `icon-text-fit`, no per-network
  authentic shield artwork — a plain badge, not real UK road-sign shapes.
  Verified all three in the running app: arrows angled correctly per
  street, "London Road"/"Montrose Terrace"/etc. labels following road
  curvature, and an "A1" shield at the London Road/A1 junction.
- **Fixed a width regression the junction-casing fix introduced.** Moving
  casing to bridges-only kept the normal (always-rendered) line at the
  narrowed "fill" width from the earlier casing pass — width minus
  2×casing-side — instead of restoring the full openstreetmap-carto width
  now that casing no longer eats into it, so every road class quietly
  went back to being too thin. Fill layers now use the true full-width
  curves again (matching the "Road widths now follow openstreetmap.org's
  own scale" entry above) at all times; bridge-casing widths were
  recomputed the other way round — full width **plus** 2×casing-side, so
  the black edge still shows beyond the (now-wider) fill on a bridge.
  Verified: re-screenshotted the Leith Walk junction (still clean, no
  border) and a residential street (visibly wider, filling the gap to
  buildings again) and the Edinburgh Bypass bridge (black casing still
  correctly bridge-only).
- **Road widths don't scale like openstreetmap.org's actually do — flagged
  by the user, and only partly fixable.** Real osm-carto uses a **step**
  function per integer zoom (`[zoom >= 14] { line-width: X }` cascading
  rules in the Mapnik stylesheet) — the width snaps to a new fixed value
  at each defined zoom and holds constant until the next one, not a smooth
  ramp. It also **skips some zoom levels outright** (primary has no z14 or
  z16 rule at all) and just holds the last defined value through the gap.
  `interpolate` (what this style uses) instead ramps smoothly between
  stops, and the stops for the skipped zooms had been filled in with
  invented halfway values that don't exist in the real stylesheet. Given
  the choice between matching the literal step behaviour (which would
  visibly snap/pop mid-zoom on our continuously-zooming vector tiles,
  unlike osm.org's per-zoom raster tile swaps where a snap is invisible)
  or a smooth ramp using only the real breakpoints, chose the latter — no
  invented values, matches osm.org exactly at every zoom level it actually
  defines, no popping. Every class's width curve (and the dependent
  bridge-casing curves) was rebuilt from just the real breakpoints.
- **Tried general "slight border" on every road again with round joins —
  didn't actually fix the junction seam, reverted.** Reintroduced casing
  on ordinary roads (each class's real colour) with `"line-join": "round"`
  / `"line-cap": "round"`, believing that would blend the seam at class
  transitions. The user caught it immediately with a screenshot circling
  the exact same artifact still present — I hadn't looked closely enough
  at my own "verification" screenshot before claiming it fixed. Properly
  diagnosed this time by toggling layers on/off and querying rendered
  features directly: the seam isn't a class-transition problem at all —
  it happens even between two segments of the **same** class (Montrose
  Terrace and London Road, both `primary`, meeting at a bend), because
  they're separate OSM ways rendered as separate features. Where two
  independently-stroked features meet at an angle, the inside of the bend
  gets double-covered, and neither `line-join` nor `line-cap` (tried both
  `round` and `butt`, and `line-blur: 0`) changes this, because join/cap
  settings only govern a single feature's own geometry — MapLibre has no
  concept of two separate features being "meant" to connect smoothly.
  This is a structural limit of per-class casing as independent line
  layers, not fixable with paint properties. **Reverted to bridges/
  tunnels-only casing** — the version already confirmed to have zero
  junction artifacts anywhere, including bends within the same class.
  Re-verified at the exact spot the user circled, at the same extreme
  zoom that made the artifact obvious before: clean, no patch, at both
  the London Road/A1 kink and the Abbey Street/Montrose Terrace junction.
- **First standalone build of the app — an unpacked local build, not the
  real installer.** The user wants to run the game themselves and try
  features as they land, which is a different need from `CLAUDE.md`'s
  installer + GitHub Releases + electron-updater pipeline — that's for
  real players getting updates later, needs an actual release process
  that doesn't exist yet, and would be slow to reinstall after every small
  change during active development anyway. Added `electron-builder` and an
  `npm run package` script using its `--dir` target: an unpacked folder
  (`release/win-unpacked/Bus Game.exe`), no installer, no admin prompt —
  rebuild and relaunch the same exe after each change. `pipeline-data/` is
  copied in via `extraResources` (filtered to exclude the 2GB source
  `.osm.pbf` and build logs — runtime only needs `tiles.pmtiles`,
  `road_graph.bin`, `stops.bin`, `landuse.bin`, `venues.bin`, `fonts/`,
  397MB total), and `electron/main.ts`'s map-data path resolution now
  branches on `app.isPackaged` (`process.resourcesPath` when packaged,
  the existing dev-relative path otherwise). Verified by launching the
  actual built exe directly (not the dev-mode driver) and confirming the
  real Scotland map renders with no console errors. The real installer +
  auto-update pipeline is a separate, later task for when there's an
  actual release to ship — tracked as a new open task below.
- **First game UI beyond the map: a depot groups screen.** OPERATIONS.md
  §1a settled that a depot group belongs to exactly one region (North
  Scotland, West Scotland, East Scotland, North England) — the existing
  `depot_groups` table only had a name, so added a `region` column via a
  proper schema migration (`SCHEMA_VERSION` 1 → 2, `ALTER TABLE ... ADD
  COLUMN`, run automatically on an old save rather than throwing). Full
  CRUD now exists end to end: `electron/db.mts` functions →
  `depotGroups:*` IPC handlers in `electron/main.ts` → `window.
  depotGroups` bridge in `electron/preload.ts` → a small toggleable panel
  (`src/renderer/depot-groups-panel.ts`) with inline rename, a region
  dropdown per row, and a delete button, plus a name+region form to add
  one. Verified in the running app: create, rename, region change and
  delete all take effect immediately and persist across an app restart
  (the real SQLite file, not in-memory state); the v1→v2 migration was
  exercised for real against the actual dev save file, not just a fresh
  one. `electron/db.verify.mts`'s smoke test updated and passing.
- **England split into North East England and North West England — now 5
  regions.** `REGIONS` in `electron/db.mts` and `depot-groups-panel.ts`
  updated and verified in the running app's region dropdown. Supersedes
  the single "North England" mentioned in the depot-groups entry above.
  **Reverted by T14 below** — this split turned out to be the wrong call.
- **T14 done: NE/NW England split reverted, Shetland added as a fifth
  region.** `REGIONS` in `electron/db.mts` and `depot-groups-panel.ts` is
  now `North Scotland, West Scotland, East Scotland, North England,
  Shetland`, matching OPERATIONS.md §1a (which also had a stale line
  still listing only four regions with no Shetland — fixed as part of
  this, since T14's wording was unambiguous about five). Added a v2→v3
  schema migration in `db.mts` (`SCHEMA_VERSION` 2→3) remapping any
  existing `depot_groups` row with region `North East England` or `North
  West England` to `North England`, following the same pattern as the
  v1→v2 migration — including a defensive remap in the v1→v3 jump path in
  case a very old save somehow carried one of the split names. Verified
  for real: copied the actual dev save to a scratch file, seeded rows
  with both old split-region names plus an untouched `East Scotland` row,
  ran the real `openSave` from `db.mts` against it, and confirmed both
  split rows remapped to `North England`, `East Scotland` was left alone,
  and `user_version` advanced to 3. `tsc --noEmit`, `npm run build`, and
  `electron/db.verify.mts` all pass. Repackaged (`npm run package`) and
  confirmed in the running app that the region dropdown now lists exactly
  `North Scotland | West Scotland | East Scotland | North England |
  Shetland`. No boundary or pipeline changes needed — Shetland's presence
  on the map was already settled separately (see Islands, above).
- **Northern Ireland, Isle of Man and a Republic-of-Ireland border strip
  were added to the map, then fully reverted — real engineering dead
  ends worth recording so they aren't retried the same way.** The user
  asked for Northern Ireland (confirmed scope: NI only, not the
  Republic), then separately for the Isle of Man, then a strip down to
  Dundalk. Real admin boundaries for both were fetched from Nominatim
  (NI: relation 156393, 977 points; Isle of Man: relation 62269, 78
  points) and added as extra rings to `extract-boundary.poly` (which
  already supported multiple unioned rings) — confirmed correct against
  reference towns (Belfast/Derry/Douglas in, Dublin/Cork out) before
  going further, a check worth repeating if this is picked up again.
  Merging the extra `.osm.pbf` source files turned out to be the real
  blocker: **`osmpbf` (already used throughout this pipeline) is
  read-only, with no serialization/writing support**, so no full re-encode
  is possible through it. A hand-rolled raw-blob concatenation
  (`merge_pbf.rs`, since deleted) worked for *our own* pipeline (which
  doesn't care about global ordering) but failed Planetiler twice: first
  because Planetiler requires the whole file globally ordered nodes-then-
  ways-then-relations (not just per-file), then — after a block-classify-
  and-bucket rewrite using `osmpbf::BlobReader` for classification
  alongside independent raw-byte capture — because it *also* requires
  nodes sorted **ascending by ID** across the whole file, and GB/Ireland
  OSM IDs interleave arbitrarily (no geographic correlation). Fixing that
  needs a true element-level merge-sort with re-encoding, which requires
  a PBF *writer* — something no read-only crate can provide. The standard
  tool for exactly this is `osmium sort`/`osmium merge`, which is the
  tool `CLAUDE.md` already ruled out for lacking an official Windows
  build (conda-forge does package a working Windows build, narrowly
  reopening that decision just for merging, not clipping — never actually
  used since the work was abandoned before reaching that point). **The
  user chose to abandon the Ireland/NI/IoM addition and keep the original
  GB-only scope.** Everything was reverted: `extract-boundary.poly` and
  `boundary.rs`'s test cases restored to their exact original content,
  the downloaded Ireland/IoM `.osm.pbf` files and the merged file deleted,
  `road_graph.bin`/`stops.bin`/`landuse.bin`/`venues.bin`/`tiles.pmtiles`
  all rebuilt from the plain original `great-britain-latest.osm.pbf` and
  verified byte-for-byte equivalent to the very first baseline build
  (node/edge/stop counts matched exactly). If Ireland ever comes back:
  the boundary-ring approach and the Nominatim source are still good;
  the merge problem needs a real writer-capable tool (osmium via
  conda-forge is the concrete option already scoped out above), not
  another hand-rolled attempt.
- **The "map goes down to Manchester" concern was a misreading, not a
  bug — checked directly rather than trusting the boundary polygon's own
  vertex coordinates, which turned out not to be a reliable guide either.**
  During the Ireland work the user asked to cut the southern boundary back
  to Forton (near Lancaster), believing the map currently reached
  Manchester. Checked the *rendered* extent directly (`queryRenderedFeatures`
  for real road data at increasing latitudes) rather than trusting the
  polygon file's listed coordinates, since a ring's vertex list doesn't
  reliably indicate where an edge *between* two vertices actually falls.
  Found the true current cutoff is around **Penrith/Shap in Cumbria**
  (~54.5–54.6) — confirmed by zero road features at Lancaster (54.05),
  Kendal (54.33), or even Carnforth, and real data appearing only around
  Penrith. That's roughly 70km short of Lancaster and 130km short of
  Manchester — the map never reached anywhere near Manchester, in this
  session or before it. Forton would have been a genuine *extension*, not
  a cutback. **User's decision: leave the boundary exactly as it is** —
  no change made. Worth remembering for next time a "where does the map
  actually reach" question comes up: check rendered content directly,
  since eyeballing a screenshot or reading polygon vertex coordinates are
  both unreliable for judging this.
- **Dark dashboard base theme added — applies to all management UI, not the
  map.** The user supplied a full palette/layout/typography spec (dark,
  compact, data-dense — mockups shown in a separate chat this session has no
  access to). Built as `src/renderer/theme.css`, one shared stylesheet linked
  directly in `index.html` (not just imported from `main.ts`) so the CSS
  variables are guaranteed available before first paint: background layers
  (`--bg-page` through `--bg-warning`), border tones, text tones, plus a
  small set of reusable classes — `.panel`/`.panel-header`/`.panel-section`
  (bordered sections, not spacing, per the spec), `.btn`/`.btn.is-active`/
  `.btn-icon`/`.btn-danger`, `.field` (shared by inputs and selects),
  `.swatch` (rounded-square colour chips for later route/livery use),
  `.badge`/`.badge-warning`/`.badge-danger`/`.badge-success`/`.badge-info`
  (~15%-opacity background, full-opacity text), and `.data-grid` (muted
  uppercase headers, bordered rows, no zebra striping, a `.num` class for
  bigger/bolder numeric cells). Applied it to the only two UI surfaces that
  exist so far: the status readout box in `index.html` and the whole depot
  groups panel (`depot-groups-panel.ts`, rewritten to use the theme classes
  instead of its old light-mode inline styles). The **map's own style is
  untouched** — `basemap-style.json` and the MapLibre layers weren't part of
  this pass, only the game's own chrome. Verified visually via the driver:
  screenshotted the toggle button, the empty-state panel, and a populated
  row with the delete button, confirming panel/border/text colours, the
  accent state on the active toggle, and the section-divider pattern all
  render as specified; native `<select>` elements pick up the dark
  background/text/border but their open dropdown list still renders with
  OS-native (light) chrome — a known limitation of styling a native select,
  not something CSS alone can fix. `tsc --noEmit` and `npm run build` both
  clean; repackaged. Every future screen (route panel, timetables, rotas,
  finance, purchasing, staff lists) should build on this same `theme.css`
  rather than styling itself independently.
- **Custom themed dropdown replaces native `<select>`, and a real bug in
  it caught and fixed before shipping.** The dark theme pass above left one
  known gap: a native select's open option list uses OS-native chrome and
  can't be restyled. Built `src/renderer/dropdown.ts` (`createDropdown`) —
  a small popover component exposing a `.value` getter/setter so call sites
  can treat it like a select — and switched `depot-groups-panel.ts`'s region
  picker (both the add-row and per-group pickers) over to it. **First
  version was visibly broken**: the menu is a child of the dropdown root,
  positioned `absolute` relative to it, but the dropdown lives inside
  `.panel`, which has `overflow: hidden` (for its rounded corners) — that
  clipped the open menu invisibly even though `menu.hidden` was correctly
  `false` and it had the right 5 items, caught by screenshotting after a
  driver-issued click and seeing nothing rendered below the trigger.
  **Fixed** by making `.dropdown-menu` `position: fixed` instead, with its
  `left`/`top`/`width` computed from the trigger's own `getBoundingClientRect()`
  on open — `position: fixed` isn't clipped by a plain-`overflow:hidden`
  ancestor unless that ancestor also establishes a fixed-position containing
  block (a transform/filter/etc.), which `.panel` doesn't. Deliberately
  avoided the alternative fix of portaling the menu element to
  `document.body`, since `depot-groups-panel.ts` recreates every row's
  controls from scratch on every `refresh()` (`list.innerHTML = ""`) — a
  portaled menu wouldn't be a child of the removed row and would leak as an
  orphaned element in `body` on every refresh. Keeping the menu a normal
  (if fixed-positioned) child of the dropdown root means it's cleaned up
  automatically along with the rest of the row. Verified in the running
  app: opened both the empty-state add-row dropdown and a populated row's
  dropdown, confirmed all 5 regions render with the dark theme and the
  selected one highlighted in the accent colour, and confirmed clicking an
  option actually changes the row's region (tested by adding a row,
  switching it to Shetland, reading the trigger's label back). Test rows
  deleted afterwards to leave the dev save clean.
- **OSM/OpenMapTiles attribution text was unreadable after the dark theme
  pass — fixed.** MapLibre's `.maplibregl-ctrl-attrib` control has no
  `color` rule of its own for plain (non-link) text — only its child `<a>`
  tags get one from MapLibre's own stylesheet — so it was inheriting the
  new dark theme's near-white `body` text colour, invisible against the
  control's own light, semi-transparent background. The attribution text is
  a legal requirement (`CLAUDE.md`), not app chrome, so fixed it at the
  point closest to the map rather than in `theme.css`: a scoped
  `.maplibregl-ctrl-attrib { color: rgba(0,0,0,.75) } ` rule added to
  `index.html`'s existing map-specific `<style>` block, matching the colour
  MapLibre's own CSS already uses for the link text inside it. Verified
  visually — the "© OpenMapTiles © OpenStreetMap contributors" text in the
  bottom-right is now clearly dark and legible.
- **Phase 2 kicked off for real: click-to-draw route tool (DESIGN.md §6, §11),
  superseding the hardcoded WASM-router proof of concept.** With Phase 1's
  foundations in place (road graph, stops, tiles, override layer, depot
  groups), this is the first real Phase 2 feature. Added
  `src/renderer/route-draw.ts`: a "Draw route" toggle (mirroring the depot
  groups panel's pattern) that, once active, turns clicks on stops and bus
  stations into a route — each new stop calls the existing WASM `Router.
  find_route` against the previous one and appends the returned road-
  following coordinates, rendered live as a translucent band at 75% opacity
  with direction chevrons (DESIGN.md §11's "while building" look), reusing
  the same `oneway-arrow` icon and line-placement approach already used for
  the road network's own one-way arrows — no per-feature bearing needed,
  MapLibre derives it from the line geometry. A small dark panel shows the
  running stop count with Clear/Finish buttons. Deleted `route-check.ts`
  (its own comment said to, once the real tool existed) and wired
  `stops-layer.ts`'s existing stop/station click handlers to defer to
  drawing mode via a small shared `routeDrawState` flag, so a click adds to
  the route instead of opening the normal assignment popup while drawing,
  and behaves exactly as before otherwise. **Scope of this increment is
  deliberately narrow**: click-to-draw and live rendering only — waypoints
  (DESIGN.md §6's "force a specific path where the router picks something
  silly") and actually saving a route as a numbered, timetabled object are
  separate later increments, since there's no `routes` table yet. Verified
  in the running app: drew a real 3-stop route across Edinburgh (Waverley
  area to Calton Hill) via the driver, confirming the band follows real
  roads with correct chevron direction, the panel's stop count updates live,
  Finish correctly exits drawing mode while leaving the drawn route visible,
  and — importantly — clicking a stop **without** drawing mode active still
  opens the ordinary assignment popup exactly as before (checked
  `draftStops.length` stayed 0 and a real popup opened). `tsc --noEmit` and
  `npm run build` clean, repackaged. **Known gap surfaced but not fixed**:
  the stop/bus-station assignment popups in `stops-layer.ts` still use their
  pre-dark-theme inline styles (plain white background, unstyled `<select>`)
  — out of scope for this increment, noted for a future theme pass.
- **Stop/bus-station assignment popups brought into the dark theme, and a
  real CSS specificity bug found and fixed along the way.** Restyled both
  popup builders in `stops-layer.ts` (the checkbox + bulk-assign-radius
  section on a bus station, and the nearby-station picker on a stop) with
  theme tokens/classes, and swapped the stop popup's native `<select>` for
  the same `createDropdown` component used for the region picker, so its
  open list is dark too rather than reintroducing the native-select gap
  just fixed. Added a `.maplibregl-popup-content` (etc.) override to
  `theme.css` for MapLibre's own popup chrome. **First version silently did
  nothing** — screenshotting a popup after the "fix" still showed the old
  white card, because maplibre-gl.css defines the same classes at equal
  specificity and Vite happens to bundle it after `theme.css` in the
  combined output, so the tie went to source order and maplibre's own
  `background:#fff` won. Confirmed by grepping the built CSS for both
  rules and checking which one came last. **Fixed** by prefixing every
  popup override with `body` (`body .maplibregl-popup-content`, etc.),
  which raises specificity just enough to win regardless of bundle order —
  more robust than relying on import order, which Vite doesn't guarantee.
  Verified in the running app: both the stop popup (with its dropdown open)
  and the bus station popup now render fully dark and legible, matching
  the depot groups panel's look.
- **Route drawing's snapping was badly broken — replaced the router's
  nearest-node search with nearest-routable-edge projection, fixed a
  resulting dead-end bug, added first-stop snapping and a there-and-back
  chevron fix.** User feedback after trying the route tool: routes cut
  straight through buildings ignoring roads, landed on the opposite side
  of the road from the clicked stop, veered onto a nearby dead-end past
  buildings, and the drawn line sometimes didn't appear until several more
  stops had been clicked — described as happening on "lots of stops" and
  "multiple routes". Root cause: `Router::nearest_node` (`game-wasm/src/
  lib.rs`) picked the closest node among **all** graph nodes by straight-
  line distance, with no concept of which road was actually nearest or
  whether a road was legally usable by buses — so it could snap onto a
  footway/private-track node, the wrong carriageway of a dual carriageway,
  or a node with no routable edges at all, silently making `find_route`
  return empty (explaining the "doesn't show until several clicks" symptom:
  `routeCoords` stayed stuck below 2 points, then a later successful leg
  drew a straight cartesian jump from the very first raw point to wherever
  that leg landed — the "through buildings" symptom). **Fixed** by
  rewriting `nearest_node` to scan every *routable* edge's own geometry
  (not just its two endpoint nodes), find the true nearest point on the
  real road line, and snap to whichever of that edge's two actual junction
  nodes is closer — distance-to-the-real-line is what correctly
  discriminates between two carriageways or a through road vs. a nearby
  dead-end spur, which nearest-node-by-point never could. **A second real
  bug surfaced while re-testing this fix**: the edge-choice didn't account
  for one-way direction, so it could still pick a node with zero *outgoing*
  hops as a route start (fine as a destination, useless as an origin) —
  found by noticing a specific stop pair still failed to route after the
  first fix, tracing it with a temporary `window.__router` debug exposure
  (removed once diagnosed), and fixing by preferring whichever of an edge's
  two nodes actually has outgoing adjacency when the two aren't equally
  usable. Also added `Router::snap_to_road` (used for the route's very
  first point, which previously used the raw stop position while every
  later point was already road-snapped) and `Router::last_route_edges` /
  `last_route_edge_point_counts` (used by `route-draw.ts` to tag each
  traversed edge, count how many times it's used across the whole route,
  and filter the chevron layer to skip any edge used **both** ways — a
  there-and-back stretch no longer shows direction arrows, per feedback
  that chevrons should only appear where a stretch runs one way). Also
  added a visible warning in the drawing panel when a leg genuinely can't
  be routed (rare now, but no longer silent). Verified in the running app:
  sampled 12 stops across central Edinburgh for connectivity — all
  connected fine, confirming the one pair that still failed during testing
  is a genuine isolated real OSM-data gap for that specific spot (`CLAUDE.
  md`'s own "OSM data quality" caveat — override-layer territory later, not
  a router bug) rather than a systemic issue; redrew a 3-stop route and
  confirmed it now follows real roads throughout with no building-cutting
  or wrong-carriageway jumps; confirmed the first point is now measurably
  road-snapped (differs from the raw stop position by the stop's own
  kerbside offset); drew a there-and-back route and confirmed chevrons
  correctly disappear on the shared reversed stretch while staying on the
  unique portions. `cargo test --workspace` (29 tests) still passes,
  `tsc --noEmit` and `npm run build` clean, repackaged. **Known cost**:
  the edge-projection scan is noticeably slower than the old node scan —
  measured roughly 1–2 seconds per click (each `find_route` call does two
  such scans) — acceptable for a click-based tool but worth optimising
  later (e.g. a spatial index) if it ever feels laggy in practice.
- **Waverley Bridge "missing from the map" traced to a real pipeline bug —
  `highway=pedestrian` ways with `bus=yes` were silently dropped, not just
  a rendering quirk.** User-reported. Checked the real OSM tags via
  Overpass: Waverley Bridge's central section (several way segments) is
  tagged `highway=pedestrian` with `motor_vehicle=no` but `bus=yes` — a
  genuine, common UK "bus gate" street (pedestrians and buses only).
  `HighwayClass::from_tag` (`rust/pipeline/src/road_graph.rs`) has no
  `pedestrian` variant at all (deliberately, for the general case — most
  pedestrian ways aren't bus-legal), and that exclusion happened *before*
  the `bus`/`psv` override tags were even consulted: the way was dropped as
  `class.is_none()` regardless of what else it carried, so the "psv/bus
  tags override the restriction" design principle never got a chance to
  apply. This broke both routing (confirmed via `find_route`: a route
  between points either side of the gap detoured ~400m rather than
  crossing directly) and rendering (Planetiler's own OpenMapTiles
  classification apparently treats it the same way — no road casing drawn
  under the label, though this is a separate third-party classification
  system we don't control and wasn't investigated further). **Fixed** by
  capturing the raw `highway` tag value alongside the existing tag scan,
  then after all tags are seen, treating `highway=pedestrian` combined with
  `bus=yes` or `psv=yes` as `HighwayClass::Service` rather than dropping it
  — order-independent, since OSM doesn't guarantee tag order. Re-ran the
  full pipeline against the real `great-britain-latest.osm.pbf` (GB-wide,
  not just Edinburgh — this affects every bus-gate street in the extract):
  edges rose from 1,170,137 to 1,170,151, junction nodes from 1,027,955 to
  1,027,963, a small, plausible, bounded change. Verified directly: a
  `find_route` call between the two ends of the gap went from a 100-point,
  ~400m-bounding-box detour to a direct 17-point crossing tightly bounded
  between the two query points; redrew a route across the bridge in the
  running app and confirmed it now runs straight down Waverley Bridge
  instead of routing around. `cargo test --workspace` (29 tests) still
  passes. **Known remaining gap, not fixed**: the map still shows no road
  casing drawn under the "Waverley Bridge" label for this stretch — that's
  Planetiler's own OpenMapTiles road classification, a separate pipeline
  from our own `road_graph.bin`/`stops.bin` build, and wasn't investigated
  or changed. Worth a future look if other bus-gate streets turn out to
  have the same cosmetic gap.
- **Stop rename and hide, plus a viewport-scoped "Stops in view" panel.**
  User asked for an option to rename stops, hide them from the map, and a
  menu to show stops in an area; confirmed via a clarifying question that
  "area" should mean the current map viewport (matching DESIGN.md's route
  panel pattern — "area currently being viewed at the top" — over a search
  box or a depot-group scope). Built into `stops-layer.ts` directly (rather
  than a separate module) since it needed direct access to the same `stops`
  array and render-refresh functions. Both rename and hide go through the
  existing generic override layer — `entity_type` is `"stop"` or
  `"bus_station"` depending on the stop's `kind`, matching the split
  `always_show_stands` already established, fields `"name"` and `"hidden"`.
  A new bottom-left "Stops" toggle opens a panel listing every stop within
  `map.getBounds()` (refreshed on `moveend`), gated behind zoom 13 (matching
  the stop layer's own minzoom) and capped at 200 rows with a "zoom in for
  the rest" note beyond that. Each row is a rename-in-place text field
  (empty or unchanged reverts to the OSM name via `Reset to OSM`, i.e.
  `window.overrides.reset`) and a Hide/Unhide button. `displayName()` — the
  shared name-resolution helper — is now used everywhere a stop's name is
  shown (the panel, both existing assignment popups, the nearest-station
  picker), so a rename is reflected consistently rather than only in one
  place. Verified in the running app: opened the panel (144 stops in a
  typical Edinburgh view), renamed a stop and confirmed the override saved
  correctly to the actual save file; hid it and confirmed it disappeared
  from the rendered `stops-points` layer; relaunched the app from scratch
  and confirmed both the hide and the rename persisted and the renamed
  stop's label reads correctly once unhidden again (`queryRenderedFeatures`
  showing `properties.name: "Renamed Test Stop"`) — a real end-to-end
  round trip, not just checked in isolation. Caught my own test-scripting
  mistake along the way: an early check queried `.panel input.field`
  without disambiguating which of the two now-simultaneously-mountable
  panels (depot groups vs. stops) it would hit, silently editing the wrong
  one — worth remembering that DOM queries need to scope by panel header
  text now that more than one floating panel can be open at once. Test
  overrides deleted afterwards to leave the dev save clean. `tsc --noEmit`
  and `npm run build` clean, repackaged.
- **Second round of routing/rendering fixes after further user feedback:
  roundabouts, a genuinely-missing snap point, and two more invisible
  bus-legal streets (Rose Street, Castle Street) alongside Waverley
  Bridge.**
  - **Roundabouts routed the wrong way.** `junction=roundabout` implies
    oneway in the way's own node direction by long-standing OSM convention
    (every real router treats it this way), but our pipeline never read the
    `junction` tag at all, so any roundabout with no separate explicit
    `oneway` tag — most of them — was treated as two-way. Fixed in
    `road_graph.rs`: capture the raw `junction` tag alongside `oneway`, and
    if no explicit `oneway` tag was seen, infer `Forward` for
    `roundabout`/`circular`. Re-ran the full GB pipeline: forward-oneway
    edges rose from 42,146 to 48,331 (+6,185), confirming real effect
    GB-wide, not just locally.
  - **Stops still snapping to the wrong spot, sometimes a long way down the
    right road.** Root cause: `Router::nearest_node` (game-wasm) picked
    which of an edge's two *endpoint nodes* was closer, but a stop can sit
    anywhere along a long edge between distant junctions — snapping to
    whichever end happened to be nearer could land the route hundreds of
    metres from the actual stop. Fixed by having `nearest_node` return the
    true nearest *point* on the road (not just a node) alongside the node
    Dijkstra still needs; `find_route` now uses that true point as the
    route's visible first/last coordinate instead of the junction node's
    own position, and `snap_to_road` does the same for the very first
    clicked stop.
  - **Rose Street and part of Castle Street also invisible on the map,
    same as Waverley Bridge.** Checked the real tags via Overpass: unlike
    Waverley Bridge, these have no `bus`/`psv` override at all — they're
    genuinely not bus-legal (correctly excluded from routing), but they
    share Waverley Bridge's underlying rendering gap: OpenMapTiles classes
    a pedestrianised *street* as `class:"path", subclass:"pedestrian"` —
    distinct from ordinary footway/steps/cycleway paths — and our style had
    no layer for it at all, so real streets rendered as nothing. Added
    `roads-pedestrian-street` (+ a bridge-casing variant) to
    `basemap-style.json` filtering on exactly that class/subclass pair —
    deliberately narrow so it doesn't flood the map with every sidewalk,
    only genuine pedestrianised streets. **No tile rebuild needed** — the
    data was already in the existing `tiles.pmtiles`, confirmed by querying
    `querySourceFeatures` directly before making the change. Verified:
    Waverley Bridge now renders as a continuous road line at every zoom
    tested, matching North Ramp/South Ramp; a route drawn straight down it
    no longer shows a gap in the background even though the route line
    itself was already correct.
  - Also added `Router::last_route_edges`/`last_route_edge_point_counts`
    were already in place from the first round; this round only touched
    `nearest_node`'s return shape and callers. `cargo test --workspace` (29
    tests) passes throughout.
- **Stop rename/hide moved from a list into each stop's own popup, per
  feedback — plus a real CSS bug this surfaced.** The previous "Stops in
  view" list (rename input + Hide button per row) is gone; each stop's
  existing popup now has a small pencil-icon button (click to edit inline,
  Enter or the pencil again to save and exit) and a Hide/Unhide button,
  right next to its title — same override mechanism as before, just
  relocated. The bottom-left panel is now "Hidden stops": a plain list of
  whatever's currently hidden, each with only an Unhide button, per
  "the button at the bottom should only be to see hidden stops to unhide
  them". Refactored `openStopPopup`/`openStationPopup` to take a
  `DecodedStop` directly instead of a MapLibre feature (simpler, and needed
  so the route-draw panel's new "Edit" button — see below — can open a
  popup by osmId without a synthetic feature object).
  **Found the real cause of "the stops menu doesn't close" while rebuilding
  this**: both this panel and the route-draw panel set an inline
  `style.display = "flex"` for their column layout, and an inline `display`
  beats the `[hidden]` attribute's own `display: none` UA rule on
  specificity — so toggling `.hidden` was silently doing nothing visually
  the whole time, in both panels. Fixed by driving visibility through
  `style.display` directly (`"flex"`/`"none"`) instead of the `hidden`
  attribute wherever a panel also sets its own `display`. Verified by
  screenshotting a fresh launch (both panels absent), opening the hidden-
  stops panel (visible, correct empty state), and closing it again
  (confirmed fully gone, not just attribute-toggled).
- **Route-draw panel: a real stop list, an edit-and-jump button, and
  insert-in-the-middle.** The panel now lists every stop picked so far by
  name (via a new `stopsPanelState.displayNameFor` hook into
  `stops-layer.ts`, so a rename shows up here too) instead of just a count.
  Each row has an **Edit** button that flies the camera to that stop and
  opens its popup (reusing `stopsPanelState.openPopupFor`, the same hook
  the popup-refactor above set up). Clicking a row (not its Edit button)
  arms it as an insertion point — highlighted, with a status line ("Inserting
  after…") — and the next map click(s) insert right after it instead of
  appending at the end, advancing the insertion point to each new stop in
  turn so a run of clicks builds a contiguous inserted sequence; clicking
  the armed row again cancels it. A normal append still only recomputes the
  one new leg (fast path); an insertion recomputes the whole route from the
  new stop order (`rebuildRoute`), since earlier legs may now sit
  differently — accepted as a slower path only taken on a deliberate
  mid-list edit. Verified end-to-end: inserted a third stop between two
  existing ones, confirmed the list re-ordered, the route re-routed through
  the new stop, and the "inserting after" status line tracked correctly;
  confirmed Edit jumps the camera and opens the right popup.
  **Deferred, not attempted**: colouring a stop's name in the list once it's
  marked a timing point or interchange — neither concept exists in the data
  model yet (no route/timetable objects at all), so there's nothing to key
  the colour off; worth returning to once those land.
- **A second, unrelated dropdown bug found while testing the above: it
  opened at completely wrong coordinates inside a MapLibre popup.**
  Suspected at first to be the "opens off the bottom of the screen"
  complaint, but investigating showed the menu wasn't just low — it was
  positioned hundreds of pixels off to the side of its own trigger.
  Root cause: `position: fixed` is relative to the nearest ancestor with
  its own `transform` (or filter/perspective/etc.) if one exists, not
  always the viewport — and MapLibre positions its popup elements with
  exactly such a `transform`, silently re-anchoring the menu to the popup's
  own box instead of the screen. Fixed by portaling the menu to
  `document.body` while open (moving it back under the dropdown's own root
  on close, so it's still cleaned up if the row or popup goes away) —
  sidesteps the issue regardless of what a dropdown ends up nested inside.
  The originally-reported "opens off the bottom" flip-to-fit-viewport logic
  (added alongside this) is confirmed working now that positioning is
  correct: verified a station-picker dropdown near the bottom of the
  screen now opens *above* its trigger, fully on-screen and usable.
- **Station picker capped to 1000m.** Follow-up ask mid-session: the
  nearest-station dropdown on a stop's popup showed up to 12 stations
  regardless of distance (one test case showed Dunfermline Bus Station,
  21km away). Changed to filter by distance (≤1000m) rather than a fixed
  count, keeping the *currently assigned* station in the list even if
  it's further than that so the picker never silently misrepresents a
  real assignment as "not part of a station". Verified: a stop that
  previously listed 8+ options down to a station 21km away now lists
  just the one real nearby station (560m) plus "(not part of a station)".
- **Waypoints — the last deferred piece of route drawing (DESIGN.md §6:
  "force a specific path where the router picks something silly").**
  `route-draw.ts`'s data model changed from a stops-only array to a
  unified `DraftPoint` sequence (`{kind:"stop", osmId, ...}` or
  `{kind:"waypoint", ...}`) — routing treats every consecutive pair the
  same regardless of kind, so no special-casing was needed in
  `appendLeg`/`rebuildRoute` at all; a waypoint is just another point the
  path must pass through. Click handling changed from three per-layer
  listeners to one general `map.on("click", ...)` that checks
  `queryRenderedFeatures` at the click point: a hit on a stop/station adds
  a named stop as before, a miss adds a waypoint at the exact clicked
  point. Waypoints are deliberately left out of the stop list (no name, no
  popup — the list only shows stop-kind entries, looked up by their real
  index in `draftPoints` so insertion/edit still target the right position
  in the underlying sequence) but do get their own small map marker,
  visually distinct from a stop's bigger filled circle. The status line now
  reads e.g. "2 stops, 1 waypoint so far", and a hint line explains the two
  click behaviours. Verified in the running app: drew stop → waypoint →
  stop, confirmed `draftPoints` held the right three entries in order with
  no warning, and the rendered route visibly detoured through the clicked
  waypoint rather than taking the router's own shortest path; confirmed
  Clear resets a route containing a waypoint correctly. `tsc --noEmit` and
  `npm run build` clean, repackaged.
- **Waypoints and stops both now listed with a remove button, per
  feedback.** The route-draw panel's list now shows every `draftPoint`, not
  just stops: a waypoint row reads "Waypoint" in muted italics with no
  number (numbering only increments across stop-kind entries), a stop row
  is unchanged. Every row — stop or waypoint — gets a small "×" `btn-icon
  btn-danger` button that removes just that point and triggers a full
  `rebuildRoute()`, since removing a middle point changes what the
  surrounding legs need to route through; `insertAfterIndex` is adjusted
  (cleared if it pointed at the removed point, shifted down if it pointed
  past it) so an armed insertion point doesn't silently point at the wrong
  entry after a removal.
- **A real regression from the earlier "avoid dead-end nodes" fix: it
  applied to a route's goal too, not just its start, and could send the
  route past a stop and back again to reach it.** User-reported, with a
  screenshot of a route passing a Princes Street stop and looping back —
  matches "1. Most follow real roads, some stops are clipping to the wrong
  road" from the previous round, just smaller-scale and specific to a
  route's *last* stop. Root cause: `nearest_node`'s "prefer whichever
  endpoint has outgoing capability" rule (added to fix a real dead-end bug)
  was applied unconditionally to both ends of a leg — but a route's *goal*
  is only ever arrived at, never departed from, so forcing it onto whichever
  node has outgoing hops could pick a node farther away than the true
  nearest one for no reason, overshooting the actual stop position and then
  backtracking to reach the (wrongly-preferred) node. Fixed by adding a
  `needs_outgoing: bool` parameter to `nearest_node`: `true` for a route's
  `start` (and for `snap_to_road`, which is always used for a route's very
  first point) so the dead-end fix still applies where it matters, `false`
  for `goal`, which now just takes the true nearest node/point regardless
  of outgoing capability. Verified against raw coordinates, not just a
  screenshot (screenshots of this exact class of bug have been misleading
  before — a nearby *other* road's own one-way arrows are easy to mistake
  for the drawn route at a glance): redrew the same Abercromby Place →
  Princes Street (Waverley Steps) route from the report, queried the
  rendered `route-draft-line` source directly, and confirmed the route's
  actual final coordinate now sits within a few metres of the stop's own
  position rather than continuing past it. `cargo test --workspace` (29
  tests) passes; WASM bindings regenerated. **Small residual noted, not
  chased further**: the last couple of points before the final one still
  show a small (~30–40m) zigzag in some cases, which may reflect genuine
  local road topology near a busy junction rather than a snapping bug —
  worth another look only if it turns out to recur somewhere unambiguous.
- **Waypoints made much more visible, snapped onto the road properly, and
  clickable on the map like a stop.** Follow-up feedback on the waypoints
  increment above. Fixed three things: (1) waypoint marker changed from a
  small dark ring to a 7px amber circle with a thick white stroke —
  deliberately bigger than a stop's marker, not smaller, since a waypoint
  has no name/popup to fall back on for identification; (2) a waypoint's
  own stored position is now `router.snap_to_road`'d at the moment it's
  placed, not just implicitly correct in the routed line — previously the
  *marker* sat at the raw click position (which could be visibly off the
  road) while only the *line* used the snapped point; (3) clicking an
  *existing* point's marker on the map (stop or waypoint) now arms/disarms
  it as the insertion point, the same action its list row already offered
  — extracted into a shared `toggleInsertAt` used by both, and the general
  click handler now checks `route-draft-points` before falling through to
  the stop-layers check and then the "empty road" waypoint case. Verified:
  drew stop → waypoint → stop, confirmed the waypoint's stored coordinates
  looked properly snapped (clean decimal values, not raw click noise);
  clicked the amber marker directly on the map and confirmed
  `insertAfterIndex` armed correctly and the matching list row highlighted.
- **Hidden stops now preview in red on the map while the panel is open, and
  a row jumps the camera there when clicked.** Added a dedicated
  `hidden-stops-preview` source/layer (red circle, white stroke) populated
  only while the "Hidden stops" panel is open (cleared on close, so a
  hidden stop stays genuinely invisible the rest of the time) — refreshed
  by the same `refreshHiddenPanel` that rebuilds the list, so the two never
  drift apart. Each row is now clickable (not just its Unhide button) and
  flies the camera to that stop. Verified: seeded a hidden stop, opened the
  panel, confirmed a red marker appeared on the map; clicked a real hidden
  stop's row (the user's own "Hermiston Park and Ride", found already
  hidden from their own testing — left untouched) and confirmed the map
  actually recentred there.
- **South Gyle Broadway routing near a roundabout — diagnosed, not yet
  fixed.** User-reported with a screenshot: a route's last leg looped
  almost the entire way around a roundabout to reach a stop ("South Gyle
  Wynd") sitting right at its edge, rather than the short way in. Checked
  directly: `snap_to_road` for that stop's real coordinates returns a point
  within ~3m of the stop itself, so the *snap point* is correct — the
  problem is which underlying *edge* gets treated as nearest. Likely cause
  (not fully confirmed): the stop sits close enough to the roundabout's own
  circular way that it — not the approach road's own junction node — wins
  the nearest-edge comparison, and because roundabouts are now correctly
  one-way (this session's earlier fix), reaching a node on the *far* side
  of that circle from the approach direction genuinely requires going most
  of the way around. If so this is a real, narrower edge case than the
  three routing bugs fixed earlier today (dead-end nodes, wrong-carriageway
  snapping, excluded bus-gate streets) — those were generalisable data/logic
  bugs; this would need an actual design decision (e.g. de-prioritising a
  roundabout's own circular way in nearest-edge selection unless it's
  substantially closer than any spur road) rather than a quick fix, so
  flagged rather than attempted this session. The "second picture" (more
  stops added) and "third picture" (Gyle Centre) mentioned alongside this
  were never received — the user chose to have this investigated from the
  description rather than resending them, so those two remain unconfirmed.
- **Ferry rule clarification (not yet implemented — ferries are Phase 9):**
  the user confirmed buses should still not use ferries on scheduled
  service (DESIGN.md §4's existing rule stands), but **private hire and
  booked tour coaches** (the player-built, bookable tour product) should
  both be able to use them, not just private hire as currently worded.
  No code change needed yet since ferries don't exist in the game — this
  is a note for whoever next touches `DESIGN.md` §4 to reword "only on
  private hire" to cover both, and for whenever Phase 9 ferry work
  actually starts.
- **Routes can now be saved (DESIGN.md §6), with direction for the
  bus-station case.** Nothing previously persisted a drawn route as a real
  object — `route-draw.ts` was pure in-memory drawing. Added a `routes`
  table (save schema v3->v4: number, owning depot group, the drawn point
  list as JSON, and `orientation` — which way travelling the stored point
  order runs, inbound or outbound) plus a manually-assigned
  `main_bus_station_osm_id` on depot groups, since DESIGN.md never specifies
  how that reference point is derived and there's no data linking bus
  stations to depot groups to derive it automatically. `computeRouteOrientation`
  (`route-orientation.ts`) handles both route shapes: linear (whichever
  drawn end sits nearer the station is the inbound end) and circular
  (clockwise = outbound, anticlockwise = inbound, via signed area). The
  settlement-fallback rule ("a route touching no bus station") is **not**
  built — nothing in the pipeline extracts OSM place nodes at all, so this
  was deliberately scoped out rather than guessed at (see T19). A depot
  group with no main bus station set simply can't save a route yet.
  Verified end-to-end in the real app: created a depot group, assigned it a
  real bus station (Aberdeen Bus Station, picked from the live list of all
  59 stations), drew a two-point route near it, saved it, confirmed the
  computed orientation was correct for the two points' actual distance to
  the station, and confirmed both the depot group's station assignment and
  the saved route survived a full app restart (SQLite, not in-memory).
  Test data deleted afterwards to leave the save clean.
- **T15 done: revenue inspector role added to OPERATIONS.md as new §8a**
  (existing §8a "Operations managers and directors" renumbered to §8b —
  checked first that nothing else in the four documents referenced "§8a"
  by number, so the renumber is safe). One rung above controller, promoted
  from any role (an entry point the same shape as fitter/storekeeper),
  assigned to a depot group and roaming it automatically. A fixed small
  percentage of passengers always evade; an inspector's skill decides how
  many of *that* fixed population get caught, not how many evade in the
  first place. Caught evaders are fined a multiple of the fare owed (a
  penalty fare), with no reputation effect. Also added matching rows to
  §6's unlock conditions, promotion/vacancy chain and staffing cap tables,
  consistent with how every other role is documented in three places.
  **Two numbers T15 didn't specify — added as Q8/Q9 rather than guessed**:
  the unlock condition (every other role in the unlock table has one) and
  the exact cap formula (T15 says "scales with services run in the group",
  no figure). Doc-only change, no code affected.
  **Sync gotcha hit and fixed along the way**: this section was written
  once, then silently lost when chat's separate T16 write to OPERATIONS.md
  landed from a base copy that predated it — chat and Claude Code can both
  write these four documents directly, and the last save wins with no
  merge. Re-diffed the file against what T15 actually required and
  reapplied the missing section and table rows a second time. Worth
  remembering: after any "chat has updated X" signal, re-read the current
  file in full before assuming a prior edit of your own to that same file
  survived.
- **Dropdown fix (`dropdown.ts`): selecting an option, or dragging its
  scrollbar, silently did nothing.** Root cause: the open menu is portaled
  to `document.body` (needed so a dropdown inside a MapLibre popup isn't
  mis-positioned by the popup's own CSS transform), but the "click outside
  closes the menu" check still tested `root.contains(e.target)` only — once
  portaled, the menu is no longer a descendant of `root`, so *every* click
  inside the open menu (an item, the scrollbar) read as an outside click and
  fired `close()` on mousedown, before the item's own click handler (or a
  scrollbar drag) ever ran. Affected every dropdown in the app, including
  the stop popup's bus-station picker, not just the new main-bus-station
  one — it went unnoticed earlier because that one had only been exercised
  with synthetic `.click()` calls (which skip the real mousedown), not a
  real mouse. Fixed by also checking `menu.contains(e.target)`; also widened
  the menu to fit long option text (a bus station's name) instead of
  truncating it to the trigger's own width. Verified with real mouse clicks
  (not synthetic ones) on both the depot group's main-bus-station picker and
  the stop popup's bus-station assignment picker.
- **Route-draw: clicking a stop already in the route now always adds it
  again, rather than arming an insertion point.** The insertion-point-arming
  behaviour for a map click on an existing point (built earlier this
  session) turned out to conflict with a real need: a there-and-back route
  or terminus loop (see T20's start/terminus stops entry below) revisits the
  same physical stop, and there was no way to add that repeat visit from the
  map — every click on it just toggled insertion-arming instead. Resolved in
  the user's favour: a map click on any stop or waypoint now always adds it,
  whether or not it's already in the route; arming an insertion point is
  now reachable only by clicking that point's row in the list, which still
  works exactly as before.
- **Route-draw: the "no main bus station set" save warning could persist
  after fixing it.** `depotGroups` (used to check the chosen depot group's
  `mainBusStationOsmId` at save time) was only refetched when the draw panel
  transitioned closed -> open. Setting a main bus station in the other panel
  without closing and reopening this one left a stale cached copy showing
  no station, so Save kept refusing even after the station was set. Fixed
  by refetching depot groups right before the check runs, at the moment
  Save is actually clicked, rather than relying on however stale the
  panel-open snapshot happened to be.
- **T20 done: chat's route-structure decisions written into DESIGN.md and
  OPERATIONS.md.** Start/terminus stops (§6): a route's first/last stop is
  a start/terminus by default, capped at 2 of each total (one per
  direction) rather than an open-ended list, with a terminus loop encoded
  as an ordered stop list — first stop flagged terminus ends the outbound
  leg, the next one flagged start begins the return leg, and the hop
  between them is dead running counted every round trip. Variations (§6):
  documented the editing workflow (last shared stop -> draw the divergent
  section -> first shared stop where it rejoins), that an extension keeps
  the same route number and reuses §7's existing extension mechanism rather
  than a new one, vehicle/livery inheritance (defaults to the parent,
  manual override only, reverts if not explicitly overridden), and timing
  point inheritance (identical before the split; gap-preserving after it
  unless the variation doesn't interleave with its parent, in which case
  timing points after the split are freely adjustable). Stand-seeking (§5):
  corrected "gets as close to stand 5 as it can" to the actual rule — it
  goes straight to stand 5, no relocation step, ever, applying identically
  at bus stations and grouped stops. Vending machines (OPERATIONS.md §2):
  new small depot/bus-station facility, staff-only, 5% profit margin,
  boosts driver happiness, restocked by the storekeeper. Route panel
  (DESIGN.md §11): filled in per-entry contents (swatch, number, name,
  problem indicator, a real profit figure not just a colour, activation
  state), position/visibility rules, long-distance routes grouped at the
  bottom of their depot group's section, and the panel's three states
  (route list / route under construction / locked reference beside its
  timetable). Route numbering (§6): long distance routes number from 900,
  same pattern as commercial (1+) and council contract (201+). Doc-only
  change, no code affected.
- **T21 done: start and terminus stops implemented on the Route model.**
  Went through two iterations before landing on the right shape (both times
  from user feedback, not guessed) — the DESIGN.md rule alone is genuinely
  ambiguous between a few plausible mechanisms:
  1. First built a single `midTerminusIndex` with the return leg's start
     inferred as "the next stop after it" — rejected: the player wants two
     independent flags they set explicitly, not one inferred from position.
  2. Rebuilt as one button at the bottom of the point list, reusing the
     existing click-to-arm row selection as its target: "Terminate service"
     flags the selected stop as the terminus, then the same button becomes
     "Start service" for the return leg's start (which can be the *same*
     stop, covering an early terminus with no real loop), then "Loop set —
     clear" once both are set. Per-row buttons and inferred positioning are
     both gone.
  For display: a flagged stop gets a sub-line underneath it connected with
  "└" rather than modified row text — a stop flagged both gets **two**
  separate sub-lines ("└ Terminus — service ends here" / "└ Start — return
  begins here"), not merged into one, per explicit correction mid-session.
  Schema: `routes` gained `terminus_index`/`start_index` (nullable, save
  v4->v6, via an intermediate single-column v5 abandoned before anything
  shipped with it). `computeRouteOrientation` now takes an optional
  `outboundEndIndex` so direction is computed from the *outbound leg's* own
  two ends (points[0] and the terminus) rather than always points[0] vs.
  points[last] — needed because a looped route's point list contains both
  legs explicitly, so the true last point is the *return* leg's own end, not
  the outbound one. Verified: pure-function cases for validation and the
  orientation override (all pass), then live in the app with real mouse
  clicks — terminus+start on the same stop, the button's three-label cycle,
  and a saved loop route surviving a restart with both indices intact. Test
  routes deleted afterwards.
- **T22 done: "fixed real contracts" written into DESIGN.md §10, plus two
  general mechanics into §4.** A genuinely new contract type — route,
  timetable and (for 398) the route number are entirely fixed, nothing the
  player designs. Two worked examples, both real services: **Route 398**
  (ScotRail's Glasgow Central/Queen St/Buchanan loop, same stop as start and
  terminus, paid £9/journey with zero fare revenue and partial dead-mileage
  cover, auto-routable from real OSM stop codes) and **Airlink 100**
  (Edinburgh Airport to the city centre, guaranteed-minimum-revenue
  economics, its own fare table with concessionary passengers paying full
  adult fare, no stop codes so built manually). Both have a fixed route
  colour and a reserved start/terminus stop, pre-owned by the contract
  rather than through the new general **stop reservation and branding**
  mechanic (§4: own the stop, pay a flat fee, 2 weeks to apply, 7 days'
  notice to move other routes off it, with a long-distance variant using
  one fixed company colour). Also added **station and airport stop
  linking** (§4: always-visible stops, unlike hideable bus station stands,
  with higher demand) and **contracts moving between depots** (§10: any
  contract can be reassigned overnight after 7 days' notice; a
  vehicle locked to a contract gets a gradual depot handover via a driver
  swap point rather than a hard cutover). One number was left genuinely
  open rather than guessed — added as **Q10**: the exact consequence when a
  reassignment extends a contract's dead mileage (the source only says
  "the contract owner is unhappy").
  **Airlink 100's real timetable PDF arrived mid-session** (after the text
  above was already written from the chat description alone, which had
  flagged the overnight schedule as unconfirmed) — read it and replaced the
  placeholder with the real data: genuinely 24/7, identical every day, a
  10-minute frequent service 0504–2358 (and symmetrically the other
  direction), with named fixed-time night journeys filling the rest of the
  night in both directions, none running on the mornings of 25/26 December
  or 1 January. Doc-only change, no code affected.
- **T23 done: bus station colour changed to #7c3aed (violet), and the
  future airport/railway colours picked to match.** The old #003a8c navy
  sat too close to two of T22's new fixed real contract colours (398
  #002664, Airlink #002b4e), especially since bus stations use the same
  "coloured ring around a member stop" visual pattern those contracts'
  reserved stops will eventually use too. Bus stations moved to violet;
  airports will use emerald #059669 and railway stations the user's fixed
  #ff4200 once station/airport stop linking (DESIGN.md §4) is actually
  built — recorded in the spec now so the colour is settled ahead of that
  work, even though the linking feature itself doesn't exist in code yet.
  `stops-layer.ts`'s three hardcoded `#003a8c` occurrences (the "part of a
  station" stroke, the bus station marker fill, and the reveal-on-click
  stands' stroke) replaced with a single `BUS_STATION_COLOR` constant.
  Verified visually in the running app.
- **T24 done: park and ride added to the stop-linking treatment, doc-only.**
  Same always-visible/higher-demand/own-colour package as T23 gave
  airports and railway stations, extended to park and ride — the user's
  first colour suggestion (amber #d97706) was dropped for sitting too close
  to rail's #ff4200, settling on rose #db2777 instead (a different hue
  family from all three existing ring colours and from the waypoint
  amber). Deliberately scoped to park and ride only — stadiums and ferry
  terminals, grouped with it as one pipeline data category in `CLAUDE.md`,
  stay out of this for now (stadiums already have event-contract mechanics
  coming, ferries are Phase 9). No code changes: like airport/railway
  linking, the mechanic itself isn't built yet, only specified.
- **Gyle Centre confirmed staying a bus station.** Raised alongside T24 as
  an example of "similar places," then confirmed it makes more sense left
  as-is — it's already a real bus station in the data (Gyle Centre Bus
  Terminus, 6 stands, one of only two stations with an OSM `stop_area`
  relation). No change made.
- **Q10 answered: a contract's forced depot reassignment extending its dead
  mileage is judged by the same excess-dead-mileage rule already on every
  contract** (DESIGN.md §10, Council contracts) — too much waste risks
  losing the contract to the competitor until the next bidding round,
  re-bid with a changed route. No separate penalty invented just for this
  being a reassignment.
- **T25 done: Express 500 added as a third fixed real contract, alongside
  398 and Airlink 100.** The real Greater Glasgow service 500, Glasgow
  Airport to the city centre via Buchanan Bus Station and Waterloo St,
  contract held by Glasgow Airport. Unlocked at 3 routes running both into
  and out of Buchanan; same payment structure as Airlink (guaranteed
  minimum revenue, zero dead mileage paid); its own ticket family (single/
  day/return/Glasgow Explore, all with a connecting-journey or
  Glasgow-City-services component, up to 5 in a group); numbered plain
  **500** (no X — "Express" is a brand name, same reasoning as 398 and
  Airlink keeping their real numbers); coloured **#1e6e6f**; a **strict**
  double-deck/electric/80,000-range vehicle requirement (matching 398's
  approach, not Airlink's softer one), with 398's own fines for the wrong
  vehicle. First fixed real contract to reserve a bus station **stand**
  rather than a plain stop — Buchanan Stance 46 — so extended §5's Stands
  section with a reservation mechanic mirroring §4's stop version. Real
  timetable data (Mon-Fri/Saturday/Sunday PDFs) described qualitatively
  (near-24/7, ~10-15 min through the day, tapering overnight) rather than
  transcribed minute-by-minute, since — unlike 398's constant running
  times — 500's vary continuously through the day and don't reduce to a
  short fixed list the way Airlink's overnight schedule did.
  **Also corrected while in the area**: 398's vehicle fleet range was
  30,000, should have been 70,000 (the user's own mistake, caught this
  session) — fixed. Made the contract-holding body explicit for all three
  fixed real contracts (ScotRail for 398, Edinburgh Airport for Airlink,
  Glasgow Airport for Express 500), which had been implied but not stated
  outright before now. **One gap left open rather than guessed — Q11**:
  Express 500's livery image requirements weren't specified, unlike the
  other two. Doc-only change, no code affected.
- **Q11 answered: 2 images, same as Airlink's standard livery** (badge +
  number box, no branding mask).
- **Kite fleet range confirmed: no gap to fill.** The user asked where the
  Wrightbus GB Kite Electroliner sits in the fleet numbering — it's
  already in OPERATIONS.md's 70,000s (Electric single-deckers), so no
  catalogue change was needed; it already matches 398's corrected
  single-deck electric requirement exactly.
- **T26 done: Route 77 added to DESIGN.md §10, and Express 500 reworked to
  depend on it.** Route 77 (the real Greater Glasgow service, Glasgow city
  centre to Glasgow Airport via Charing Cross/Partick/QEUH/Braehead) started
  life in this conversation as a fourth fixed real contract — paid per
  service like 398 but with normal ticket revenue going to the airport
  instead of the operator, and only the journeys reaching the airport
  being paid that way (the rest run commercially). **When asked for a
  per-service price** (the route is ~10 miles, too long to just reuse
  398's short-loop £9 figure), the user dropped that whole payment model
  instead of settling on a number: **Route 77 is now ordinary commercial
  service**, no contract payment, no ticket-revenue quirk — kept only its
  fixed identity (colour #93318e, a shared "Glasgow Airport" livery family,
  electric single-deck 70,000-range vehicles, two reserved bus station
  stands) because it's airport-sponsored rather than freely designed. Its
  real purpose in the spec now is doubled: real content, and **the unlock
  gate for Express 500** — once Route 77 has run a month, Express 500
  becomes available, layered on top of (not replacing) Express 500's
  original 3-routes-to-Buchanan condition. Express 500 itself changed to
  match: dropped its own dedicated livery for the same shared Glasgow
  Airport family (2 liveries, either satisfies it, answering Q11 above),
  gained a second reserved stand (Glasgow Airport Stance 1, alongside
  Buchanan Stance 46), and can swap vehicles with Route 77 overnight when
  demand is quieter, which only works because they share that livery
  family. Real timetable data (Mon-Fri/Saturday/Sunday PDFs) described
  qualitatively (near-24/7, ~15 min through the day, roughly half of
  daytime journeys short-working short of the airport) rather than
  transcribed minute-by-minute, same reasoning as Express 500's own
  timetable. Doc-only change, no code affected.
- **Router now finds the fastest route by travel time, not the shortest by
  distance — closing a gap against DESIGN.md §6 that had stood since the
  router was first built.** Surfaced while scoping T29 (the stop/station
  timetable viewer): a real timetable needs a running time per leg, and
  the obvious source is the existing WASM router — but its Dijkstra cost
  was raw `edge.length_m`, with no speed weighting at all, contradicting
  §6's explicit "Auto-routing takes the fastest route, not the shortest —
  accounting for speed limits." Fixed at the root: added
  `game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH`, a 15-entry table (indexed
  the same way `Edge.class` already is) giving a default mph per highway
  class when a way has no `maxspeed` tag, based on UK statutory bus/coach
  speed limits (30 built-up, 50 single carriageway, 60 dual carriageway, 70
  motorway) mapped onto the closest class — an assumption, not a sourced
  figure the way the width table is, flagged as such in its own doc
  comment for future revision. Lives in `game-data` rather than either the
  pipeline or `game-wasm` alone, the same drift-prevention reasoning as
  `RoadGraph`/`Edge` themselves. `game-wasm`'s `dijkstra` now costs each
  edge in seconds (`edge_time_cost_s`: `length_m / effective_mph`,
  `maxspeed_mph` where present else the class default) instead of metres;
  `QueueEntry.cost_m` renamed to `cost_s` throughout to keep the unit
  honest. Added a synthetic-graph unit test
  (`dijkstra_prefers_the_faster_edge_over_the_shorter_one`) with two
  parallel edges between the same two nodes — a 100m Service-class edge
  and a 500m Motorway-class edge, both with no `maxspeed` tag — confirming
  the router now takes the longer-but-faster motorway (500m/70mph ≈ 16.0s)
  over the shorter-but-slower service road (100m/10mph ≈ 22.4s), which the
  old distance-only cost would have gotten backwards. Also added a pinned
  table test for the default-speed figures themselves (mirroring
  `width_table_matches_agreed_figures`'s pattern) and a table-shape test in
  `game-data`. `cargo test --workspace` (32 tests, up from 29) passes.
  Regenerated `src/renderer/wasm/` via `wasm-pack build --target web`;
  `tsc --noEmit` and `npm run build` both clean. Verified live, not just in
  the unit test: launched the real Electron app via a scripted Playwright
  driver (`.claude/skills/run-desktop/driver.mjs`'s approach, but written
  as a one-shot script since the REPL's line-buffered stdin races ahead of
  an async `launch` when piped — a gotcha worth remembering for next time),
  flew to Waverley, queried real stops via `querySourceFeatures`, filtered
  to ones actually on screen (that call returns every feature in loaded
  tiles, not just the viewport, which the first attempt didn't account
  for), clicked "Draw route" and two real stops (Waverley Bridge → Jeffrey
  Street), and confirmed a real ~60-point road-following route was drawn
  with no console errors — screenshot shows it running cleanly down South
  Ramp onto Jeffrey Street, matching real streets throughout. Existing
  route-drawing behaviour (nearest-node snapping, dead-end avoidance,
  there-and-back chevron suppression) is untouched — only the cost metric
  Dijkstra optimises for changed. Not yet done: the timetable data model
  itself (T29 continues from here).
- **Routes could be drawn and saved but never seen again — added a Routes
  panel (bottom-right, alongside Draw route/Depot groups/Hidden stops).**
  User-requested mid-session, and a genuine gap: `routes:list`/`routes:
  delete` IPC already existed but nothing in the UI ever called them.
  Refactored the WASM `Router` to be loaded once and shared, rather than
  each feature fetching and parsing the ~95MB `road_graph.bin` itself —
  new `src/renderer/router.ts` (`loadRouter()`), `route-draw.ts`'s
  `mountRouteDrawTool` now takes a `Router` parameter instead of loading
  its own, `main.ts` loads it once and passes the same instance to both
  `mountRouteDrawTool` and the new `mountRoutesPanel`. The panel
  (`routes-panel.ts`) lists every saved route (number, depot group name,
  direction, stop count) with **Show** (re-routes every leg of the saved
  point list through the router — only the point list is persisted, not
  the drawn polyline itself — and fits the map to it) and **delete**.
  Deliberately not DESIGN.md §11's full route panel (colour swatch from
  livery, profit figure, activation state, problem indicator, grouping by
  area) — those need livery/finance/staffing/activation systems that don't
  exist yet; this is the minimal real slice the gap actually needed.
  **A real bug caught live, not just in the unit-test sense**: the first
  version gated adding its map source/layer on `map.isStyleLoaded()`,
  falling back to `map.once("load", addLayers)` — copied from route-draw.
  ts's own pattern, which mounts right after the map is first created.
  This panel mounts later in the init chain (after `mountRouteDrawTool`
  has already added its own layers, proof the style has loaded at least
  once), and at that point `isStyleLoaded()` read `false` — it also
  reflects tiles still in flight elsewhere, not just "never loaded yet" —
  so the fallback listener attached to a `"load"` event that had already
  fired once and would never fire again, silently leaving the source/layer
  never added. Symptom: the Show button ran `find_route` correctly (traced
  with a temporary `console.log`, then confirmed properly via a new
  permanent `window.__router` debug hook alongside the existing
  `window.__map` one) but had nothing to draw into, and drew nothing, with
  no error anywhere. Fixed by adding the source/layer unconditionally —
  correct specifically because this module is known to mount after the
  style's first load, not a general fix for every "isStyleLoaded" gate in
  the codebase. Verified end-to-end via a scripted Playwright run: created
  a depot group, drew and saved a 2-stop route, opened the Routes panel,
  confirmed it listed the route correctly, clicked Show, and confirmed via
  both the rendered source data and a screenshot that a real 98-point
  road-following line was drawn and the map fitted to it. `tsc --noEmit`,
  `cargo test --workspace` (32 tests) and `npm run build` all clean; test
  route and depot group deleted afterwards to leave the save clean.
- **T29 increment 2: the real timetable data model, plus a minimal editor
  UI, both working end-to-end — day types, a frequency generator, timing
  points, and real running times from the router.** Scoped deliberately
  small (agreed with the user before starting): one component per route
  per day type, no variations, padding, connections, extensions or event
  calendar yet — all flagged in code comments as later increments, not
  guessed at.
  **Schema** (save v6->v7): new `route_timetables` table, one row per
  (route, day type) — `start_minutes`/`end_minutes`/`interval_minutes` (the
  frequency generator), `timing_points` (the player's own input: which
  stops hold a bus early and for how long, DESIGN.md §4), and
  `arrival_offsets_seconds`/`departure_offsets_seconds` (derived output —
  one entry per route point, seconds from the journey's own departure,
  cached so the eventual stop/station viewer never needs to re-route a
  leg just to read a time back). `deleteRoute` now also deletes a route's
  own timetables explicitly, since this database has no foreign-key
  cascade enabled. Migration verified against a **copy of the real dev
  save** (not just a fresh database): v6 -> v7, `route_timetables` created,
  existing depot group data untouched.
  **Pure logic** (`src/renderer/route-timetable.mts`, dual Vite/Node
  the same way `db.mts` is, for a hand-rolled verify script with no WASM/
  DOM dependency — `route-timetable.verify.mts`, 24 checks, run via `node
  --experimental-strip-types`): `validateFrequency`/`generateDepartureMinutes`
  (a service is a start/end time of day plus an interval — deliberately
  capped within one calendar day; an overnight-crossing service like
  Airlink 100's real timetable needs day-crossing handling this doesn't
  attempt yet), `validateTimingPoints` (must be a real stop, not a
  waypoint, no duplicates, no negative wait), and `computeOffsets` (turns
  per-leg running times into per-point arrival/departure offsets — this is
  the fiddly arithmetic CLAUDE.md's "write tests before the UI" warns
  about, so it's tested in isolation: a timing point's wait shows up as an
  arrival/departure split at that point and carries forward into every
  later offset, tested directly rather than assumed).
  **Router integration**: added `Router::last_route_time_seconds()` to
  game-wasm (sums `edge_time_cost_s` over the most recent `find_route`
  call's edges, mirroring `last_route_edges()`'s existing "ask about the
  last call rather than re-running it" pattern), tested with the same
  synthetic two-edge graph as the fastest-route fix above. WASM bindings
  regenerated.
  **Shared Router, not one per feature**: pulled the `Router` construction
  out of `route-draw.ts` into a new `src/renderer/router.ts`
  (`loadRouter()`), so `main.ts` loads the ~95MB road graph once and hands
  the same instance to route drawing, the Routes panel and the timetable
  editor — was already overdue once a second consumer existed, now there
  are three.
  **Editor UI** (`route-timetable-panel.ts`, opened via a new "Timetable"
  button on each Routes-panel row): day type dropdown, HH:MM start/end and
  a minutes interval, a checkbox + wait-seconds field per real stop on the
  route, and a save button that validates both the frequency and the
  timing points, computes real leg times via the router, computes the
  offsets, and upserts. Loads whichever day type's existing timetable
  exists (if any) when the dropdown changes, so reopening the editor
  doesn't lose previous work.
  Verified end-to-end via a scripted Playwright run, not just the unit
  tests: drew and saved a 2-stop route, opened its Timetable editor, set
  06:00-19:00 every 30 minutes with a 45s timing-point wait on the second
  stop, saved, and confirmed via `window.routeTimetables.listForRoute`
  that the persisted row has the right frequency, timing points, and
  correctly-computed offsets (164.36s real router running time on the
  arrival, +45s = 209.36s on the departure) — plus a screenshot showing
  the editor's actual on-screen state, including the real "Saved.
  End-to-end running time: 3 min." status line. `tsc --noEmit`, `cargo
  test --workspace` (32 tests) and `npm run build` all clean; test route
  and depot group deleted afterwards.
  **Not yet done**: the stop/bus-station timetable viewer itself (T29's
  original ask) — this increment built what it needed to read from, not
  the viewer.
- **The route panel rebuilt to match DESIGN.md §11 properly, not the
  scattered toggles it was.** User-requested: the previous session had a
  top-left "Draw route" toggle+panel, a separate bottom-right "Routes"
  list toggle+panel, and the timetable editor as a centred floating modal
  — three independent overlays rather than the spec's single left-hand
  column with three states ("route list, route under construction, or
  locked route reference next to its timetable — rather than three
  separate panels").
  **Structural refactor**: `route-draw.ts`'s `mountRouteDrawTool` no
  longer creates its own toggle or positions its own panel — it now
  returns a `RouteDrawController` (`{ el, startDrawing() }`) so a caller
  can mount its existing panel content into a shared slot and trigger
  drawing mode externally; its Finish button now also calls an `onFinish`
  callback. `route-timetable-panel.ts`'s `openRouteTimetableEditor` became
  `createRouteTimetableEditor`, returning `{ el }` instead of positioning
  itself centred/floating, with an `onClose` callback replacing its own
  close-button handler. New `route-panel.ts` is the actual left-hand slot
  DESIGN.md §11 describes: a persistent container (left:8, top:44,
  bottom:8, width 320) whose single child swaps between the three states,
  plus a second right-hand slot (left:336 to right:8) that only appears in
  timetable mode — "the timetable grid fills the rest of the screen to the
  right." `routes-panel.ts` is deleted, folded into `route-panel.ts`'s
  list mode. `main.ts` now calls one `mountRoutePanel(map, router)`
  instead of two separate mounts.
  **A real layout collision found and fixed along the way**: the route
  panel now occupying the full left-hand height collides with the
  "Hidden stops" toggle, previously bottom-left — relocated it to
  bottom-right (stops-layer.ts), which the old bottom-right "Routes"
  toggle vacated.
  **What's built vs. deliberately deferred, flagged inline in
  `route-panel.ts` rather than guessed at**: grouping by depot group is
  real, with the group nearest the current map centre (using its main bus
  station as the proxy, the same anchor DESIGN.md §6's direction rule
  uses, since a depot group has no shape of its own to test the viewport
  against) reordered to the top on every `moveend` — matching "panning
  the map reshuffles the list into view." Not built, because the systems
  they'd read from don't exist yet: the colour swatch (no livery/route-
  colour data — every entry gets the same neutral placeholder rather than
  a fabricated colour that would look real), activation state (no
  activation model — every route reads as a plain running one), the
  problem indicator (no staffing/punctuality simulation), a real monthly
  profit figure (no finance model, Phase 5 — omitted rather than shown as
  a fake £0), and long-distance routes grouped at the bottom of their
  area's section (no route-type distinction yet). The "destination/short
  name" shown per entry is also a placeholder — the last stop's name, not
  a real destination display (that belongs to the timetable's own
  extension/destination mechanism, DESIGN.md §6).
  Verified end-to-end via a scripted Playwright run: confirmed the route
  list is visible immediately with no toggle needed, drew and saved a
  route via "+ New route", confirmed Finish returns to list mode showing
  the route grouped under its depot group with Show/Timetable/delete,
  opened Timetable mode and confirmed the left column shows the locked
  read-only stop list while the timetable editor fills the right side,
  and confirmed its own × button returns to list mode — plus screenshots
  of all three states. `tsc --noEmit`, `cargo test --workspace` (32
  tests), both `.verify.mts` scripts, and `npm run build` all clean; test
  route and depot group deleted afterwards.
- **Three real bugs/gaps in the new route panel, all user-reported after
  trying it, all fixed.**
  1. **Drawing was invisible.** `route-draw.ts`'s own map layers
     (`route-draft-line`/`-edges`/`-points`) still used the old
     `if (map.isStyleLoaded()) addLayers(); else map.once("load", addLayers)`
     gate, never updated when the panel was refactored to mount later in
     `main.ts`'s init chain (after `route-panel.ts`'s own layers already
     succeeded) — the exact same latent bug already found and fixed once
     for the "Show" preview layer, just not also fixed here at the time.
     `isStyleLoaded()` read false at that point and the `"load"` fallback
     waited for an event that had already fired and would never fire
     again, so the drafted line/points/chevrons never appeared, silently,
     while the underlying draft state kept working fine (which is why
     saving still worked). Fixed the same way: call `addLayers()`
     unconditionally.
  2. **No way to edit a saved route.** Only Show/Timetable/Delete existed.
     Added `updateRoute` to `electron/db.mts` (updates every field in
     place and unconditionally clears the route's own `route_timetables`
     rows, since they're indexed against the exact point list an edit
     could change — confirmed with the user rather than guessed: simpler
     than diffing old vs. new point lists to detect whether stops
     specifically changed, erring on the side of never leaving a stale
     timetable behind) with matching `routes:update` IPC/preload wiring
     and `db.verify.mts` coverage. `route-draw.ts`'s `RouteDrawController`
     gained `startEditing(route)` — loads the route's points, terminus/
     start flags, number and depot group back into the draft state,
     switches the header to "Editing route", and its Save button now
     calls `routes.update` instead of `routes.create` while an
     `editingRouteId` is set (also now set after a *first* save of a
     genuinely new route, so a second Save click without leaving drawing
     mode updates rather than creating a numbered duplicate — a small
     adjacent bug fixed as a natural byproduct, not scope creep). A new
     "Edit" button per route row opens this.
  3. **Too many buttons showing at once.** Every row showed Show/
     Timetable/Delete permanently. `route-panel.ts` now tracks a single
     `expandedRouteId`; a row shows only its swatch/number/destination/
     sub-line until clicked, and only the clicked row's actions
     (Show/Edit/Timetable/delete) appear, collapsing any previously
     expanded row. Button clicks call `stopPropagation()` so they don't
     also toggle the row.
  Verified end-to-end via a scripted Playwright run covering all three
  together: drew a route and confirmed the draft line/points render
  immediately (132-point line, 2 markers) with a screenshot; saved it,
  gave it a timetable directly via IPC; confirmed the list shows only
  "+ New route" until a row is clicked, then confirmed exactly
  Show/Edit/Timetable/× appear for that row and no others (screenshot);
  clicked Edit and confirmed the header switched to "Editing route", the
  number field and draft line (132 points again) reloaded correctly;
  changed the number and saved again, confirming the status read "Updated
  route..." (not "Saved"), exactly one route existed afterward (not a
  duplicate), and its timetable was gone. No console errors throughout.
  `tsc --noEmit`, `cargo test --workspace` (32 tests), `db.verify.mts` (34
  checks), and `npm run build` all clean; test route and depot group
  deleted afterwards.
- **User-reported "route won't go the correct way" near Glasgow Central —
  a real bug, found and fixed, after a first diagnosis that got the
  geography wrong and wrongly cleared it.** Two screenshots showed a
  drawn route looping almost a full city block instead of a short direct
  path from Gordon Street (outside Central Station) onto Hope Street.
  **First pass, wrong**: guessed test coordinates from the screenshot
  rather than the real stop, happened to land south of where Gordon
  Street actually meets Hope Street, and concluded (with real Overpass
  data on Hope Street's one-way-northbound tagging, genuinely correct as
  far as it went) that the loop was legal one-way-grid behaviour, not a
  bug. The user then corrected the geography directly ("it starts on
  Gordon Street outside Central Station then goes west to Hope Street
  where it then goes north" — the *legal* direction, not the illegal one
  my test had used) and separately reported the road right outside the
  station being refused entirely ("it won't go onto the little road...
  it just wants to stop at the junction"). **Root cause, found this
  time with the real stop's real coordinates**: looked up the actual
  "Gordon Street / Central Station" stop in the real `stops.bin` (a
  temporary diagnostic `#[test]` — game-wasm compiles as a normal `rlib`
  too, so this ran natively via `cargo test`, bypassing the Electron/
  Playwright driver's intermittent launch failures in this environment
  entirely — deleted once diagnosed) rather than guessing again, then
  `find_route`'d from its real coordinates. Real result: a 46-second,
  10-point detour east via Renfield Street instead of the ~20-second
  direct path. Overpass confirmed why: the stretch of Gordon Street
  immediately outside the station is tagged `access=no` with no `psv`/
  `bus` override at all, so the pipeline (correctly, per its own rules)
  excludes it from the routable graph entirely — but a real, named bus
  stop sits right on it, which a road genuinely closed to buses couldn't
  have, so this is almost certainly a tagging gap (missing `psv=yes`),
  the same shape of issue as the Waverley Bridge bus-gate fix earlier.
  **Fix, per the user's explicit choice** (offered a quick pipeline-only
  patch vs. the proper reusable mechanism; they chose the latter): built
  the **road-edge override layer** DESIGN.md §1/CLAUDE.md's "OSM data
  quality" section already anticipated but never actually built —
  extends the existing generic `osm_overrides` mechanism (entity_type/
  osm_id/field/value) from stops/bus stations to road edges, keyed by
  the way's own OSM id, field `"psv_override"`. `Router::new` (game-wasm)
  now takes a second argument, `psv_override_way_ids: Vec<f64>` (`f64`
  for the wasm-bindgen boundary, matching `decode_stops`'s existing OSM-id
  convention) — `edge_is_routable` became a function of both the edge
  *and* this override set, checked identically to a real `psv`/`bus` tag
  rather than as a separate pass, at both call sites (`Router::new`'s
  adjacency build and `nearest_node`'s scan). `router.ts`'s `loadRouter()`
  now fetches `road_edge`/`psv_override` overrides via the existing
  `window.overrides.list` IPC before constructing the `Router`. New
  synthetic-graph unit test (`psv_override_makes_an_access_restricted_
  edge_routable`) proves the mechanism itself: an `access_restricted`
  edge is unroutable by default, routable once its way id is flagged.
  **Scope deliberately narrow**: this increment is the override
  *mechanism* plus applying it to the one diagnosed way (45885961, seeded
  directly into the real save via `setOverride` — same tool a future
  in-game UI would call). A player-facing "click a road to flag it"
  interaction is real future work, not built here — there's no way yet
  to click/select a raw road edge in the renderer at all (only stops and
  bus stations are clickable), which is a separate, larger interaction
  pattern. Verified at every layer: the Rust unit test; a native
  before/after comparison against the real `road_graph.bin` (46.98s/10pts
  without the override, 20.77s/13pts with it, exactly matching the
  synthetic test's shape); and live in the real running app via the
  Playwright driver (which cooperated this time) — confirmed the seeded
  override loads (`window.overrides.list` returned it), and the live
  `window.__router` instance (built through the real `loadRouter()` path)
  independently reproduced the same 13-point/20.77s result. `cargo test
  --workspace` (34 tests, up from 32), `tsc --noEmit`, and `npm run
  build` all clean.
  **Follow-up in the same session, same root cause class**: after seeing
  the fix, the user reported two more specific symptoms on the same
  route — a small eastward wiggle right at the Gordon Street start before
  heading west, and "the route still doesn't use the actual road the bus
  uses in real life, it stays on the main road." Overpass turned up the
  actual cause: two short covered service-road ways (751643926,
  751643927 — Central Station's real covered bus/taxi layby, running
  parallel to Gordon Street) tagged `access=no` + `motor_vehicle=
  designated`. Our pipeline's tag scan only recognises `psv=yes`/
  `bus=yes` as overrides for `access=no`, not `motor_vehicle=designated`
  (a real, if less common, OSM access value meaning "motor vehicles
  specifically allowed here") — so both ways were excluded, forcing the
  router to stay on the main carriageway and produce the wiggle while
  snapping around the excluded edges. Same fix, same mechanism: flagged
  both way ids via the road-edge override layer just built. Verified
  with the same before/after native test: 13 points/20.77s (main-road-
  only, with the wiggle) before, 12 points/16.3s after — the "after"
  path starts at the exact real stop coordinate with no wiggle at all
  and is faster, since it's the genuine direct route through the real
  layby. Seeded into the real save alongside the first override; not
  re-verified live this time (the Electron/Playwright driver was
  uncooperative again after the first live check succeeded) but high
  confidence given the identical mechanism already proved live and the
  native test matching the earlier one exactly in shape.
  **Also tested, and confirmed NOT a bug**: whether Killermont Street/
  Buchanan Bus Station routes directly to Gordon Street/Central Station
  without the waypoint — it doesn't (`find_route` returns zero points
  for the direct leg, both real Killermont stop variants tried). The
  user separately confirmed this is expected ("the waypoint is still
  needed as its a slightly longer route but that's fine") — so this
  isn't something to fix, just confirms a waypoint is genuinely required
  on that leg, not a workaround for a bug.
  **Third follow-up, and this one was a real router bug, not another
  data gap — found and fixed.** Asked the user which specific leg showed
  the "through buildings" symptom rather than guessing a third time
  (got Hope Street wrong once already this session): "between stop 3
  and the waypoint," plus a second symptom — "between the waypoint and
  stop 4 it just can't make the route" (the panel's own warning
  confirmed this: "No road route found between a waypoint and Gordon
  Street / Central Station"). Rather than guess the waypoint's own
  coordinates a second time, tested the real Killermont Street/Buchanan
  Bus Station stop directly against the real Gordon Street stop —
  **`find_route` returned zero points one way (Killermont -> Gordon)
  but a real 36-point route the other way (Gordon -> Killermont)**, an
  asymmetry a directed one-way graph can legitimately have, but zero
  points in a dense real city grid is far more often a data/logic gap
  than a genuine dead end.
  **Root cause, this time a real bug in the router itself**:
  `nearest_node`'s existing `needs_outgoing` fix (from an earlier
  session, OPEN-ITEMS.md's own history) made a route's *start* prefer
  an outgoing-capable node over a nearer dead-end one — but a route's
  *goal* had no equivalent check, so it just took whichever endpoint of
  the nearest edge was closer by raw distance, even if that endpoint had
  *no incoming edge at all* and could only ever be departed from, never
  arrived at. Confirmed directly: the real nearest edge to the Gordon St
  stop (way 751643927, part of the layby, 0m away) had its nearer
  endpoint reachable only by *arriving* via that same edge — which itself
  needed an as-yet-unfixed third short connector way (23381503, 9m,
  `access_restricted=true`, no override, sitting exactly between the two
  already-fixed layby ways) to be reachable at all.
  **Fix**: added the missing mirror image. `Router` gained a precomputed
  `has_incoming: Vec<bool>` (built alongside `adjacency` in `Router::new`,
  same one-pass approach) and `nearest_node` gained a `needs_incoming`
  parameter with the same shape as `needs_outgoing`'s existing tie-break
  logic, just checking incoming instead of outgoing capability. `find_route`'s
  goal call now passes `needs_incoming: true` (previously `false` with no
  incoming check at all); `snap_to_road` and `find_route`'s start call pass
  `false` (unchanged). New permanent unit test
  (`goal_prefers_a_reachable_node_over_a_nearer_unreachable_one`) with a
  synthetic 3-node graph where the geometrically-nearer node to the goal
  has zero incoming capability and the correct answer requires picking
  the farther-but-reachable one instead — this is the case that would
  have failed before the fix. Also flagged the third connector way
  (23381503) through the same road-edge override layer, seeded alongside
  the other three. **Both reported symptoms traced to this one bug plus
  the one missing override**: the fixed corridor (`cargo test` and live,
  both directions, 41 and 36 points respectively) runs cleanly through
  real streets end-to-end with no anomalous jumps, covering both the
  stop3-to-waypoint leg and the waypoint-to-stop4 leg the user pointed
  at. `cargo test --workspace` (33 tests, up from 32), `tsc --noEmit`,
  and `npm run build` all clean; WASM rebuilt (the router's actual
  logic changed this time, not just data); verified live via the
  Playwright driver (cooperated this time) — both directions confirmed
  non-zero through the real `window.__router` instance.
  **Still open** (at the time): whether the broader `access=no`-no-override
  pattern (whether via a real tagging gap or an unrecognised access value
  like `motor_vehicle=designated`) recurs elsewhere in the extract — worth
  a systematic check once a real "click a road to override it" UI exists,
  rather than each instance needing a bespoke diagnosis like the four
  found this session.
- **Fourth follow-up on the same route: "the route completes but the
  waypoint is still broken" — a real, distinct router bug, not a data gap
  this time, and not one guessed coordinates alone would have found.**
  User confirmed both prior fixes worked (the route now completes; the
  layby routes correctly) but one waypoint still showed the "through
  buildings" symptom. Rather than guess a third/fourth waypoint location
  from screenshots (already got Hope Street wrong once), asked which of
  the *two* waypoints on this route it was, then asked the user to hit
  **Save route** as-is so the exact real point list could be read
  straight from the save file (`listRoutes`/`openSave`, the same
  `db.mts` functions used for seeding overrides) — no more coordinate
  estimation at all. The saved points showed the broken waypoint (call
  it waypointB) at `(-4.2555176, 55.864612799999996)`, about 100m from
  every earlier guess, which is exactly why prior estimated tests didn't
  reproduce it.
  **Root cause**: a second, genuinely different bug from the
  `needs_incoming` one fixed earlier today, in the *same* area of code.
  `find_route` always overwrote its final coordinate with the goal's
  "true nearest point on the road" — correct when that point sits near
  whichever endpoint Dijkstra's own path actually reaches, but the true
  nearest point can legitimately sit *anywhere* along the nearest edge's
  own geometry, including tens of metres from either endpoint on a long
  edge. Confirmed directly: the real nearest edge to waypointB (way
  4483894, 83m, one-way) has its only-*arrivable* endpoint reachable
  exclusively via a *different* edge (4903952) — never via 4483894
  itself, since 4483894 is one-way *away* from that endpoint. The old
  code didn't check this: it unconditionally drew the final segment from
  wherever the path's last edge (4903952) actually ended straight to the
  true snap point on a *different* edge (4483894) that was never
  traversed at all — a straight line with no relationship to any real
  road, which is exactly "through buildings."
  **Fix**: `nearest_node` now also returns which edge its answer came
  from. `find_route` only performs the snap-point overwrite (start or
  goal) when the path's own first/last edge *is* that same edge — safe
  in that case since sliding the displayed point anywhere along an edge
  actually being traversed is always a real position on a real road.
  Otherwise it leaves the plain, real graph-node position already
  pushed during traversal, rather than drawing a fabricated connection
  to a point that was never reached. Fixed symmetrically for both the
  start and goal ends, even though only the goal side had concrete
  evidence — the same risk exists at the start by the identical
  reasoning. New permanent unit test
  (`goal_snap_point_not_used_when_its_edge_was_never_actually_reached`)
  with a synthetic 3-node graph reproducing the exact shape: a goal
  query point whose true-nearest edge can only be arrived at via a
  different edge entirely. Verified against the real data at every
  level: `cargo test --workspace` (34 tests, up from 33); the real
  saved route's exact leg (Killermont St -> waypointB) now ends at
  `(-4.2554398, 55.8648617)` — the real junction node — instead of
  jumping to the unreached point 28m away; confirmed live via the
  Playwright driver using the exact coordinates read from the real save
  file. `tsc --noEmit` and `npm run build` clean; WASM rebuilt (real
  logic change, not just data). No new override needed this time — this
  was a pure router logic bug, not a missing tag.
  **Retrospective on this whole thread**: four rounds of "still broken"
  reports on one route, each traced to a genuinely different root cause
  (one real one-way street working as designed, three distinct data/
  logic bugs) — a reminder that "the same symptom" across follow-ups
  doesn't mean "the same cause," and that reading the real save file
  directly (once available) beats estimating coordinates from a
  screenshot every time, not just when estimates first go wrong.
