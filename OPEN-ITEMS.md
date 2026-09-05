# Open items

Running list of unanswered questions and outstanding tasks, kept in the repo so
it carries between sessions and is visible to both chat and Claude Code.

**Anyone may add to this file. Nothing is removed until it's actually done or
decided — move it to Settled with a one-line answer, don't just delete it.**

---

## Open questions

| # | Question | Blocks | Notes |
|---|---|---|---|
| Q1 | Should the third engineer/controller shift band be "late" or "evening"? | Phase 6 | Cosmetic. Bands are night 2200–0700, day 0600–1500, this one 1400–2300 |
| Q2 | Should orders above 6 vehicles earn more than 15%? | Phase 3 | Cap currently reached at 6, so 30 vehicles earns the same as 6 |
| Q3 | What is the rota-change notice period? | Phase 6 | Agreed as fixed, figure not set |
| Q4 | What percentage above normal wage is overtime paid at? | Phase 6 | Fixed by the game, not player-set |
| Q5 | How far below real-world should depot and station capital costs sit? | Phase 5 | Vehicle prices stay realistic |
| Q6 | Do LEZs tighten beyond Euro VI over time? | Phase 9 | Currently Euro VI, fines below it |
| Q7 | Warning thresholds before dismissal | Phase 7 | One shared count per employee; number not set |

## Outstanding tasks

| # | Task | Owner | Status |
|---|---|---|---|
| T4 | Get the combined update message to Claude Code | User | Done |
| T5 | Produce branding mask and number box images for each existing livery | User | Pending |
| T8 | Design the map-data output layout, versioning and manifest format for the pipeline, matching the "installer has no map data; downloads separately on first run, versioned independently from the app" model going into CLAUDE.md. Current pipeline output (`pipeline-data/*.bin`) is informal dev-scratch, not yet this. Blocks nothing in phase 1 | Claude Code | Pending |
| T9 | Add OpenMapTiles attribution to CLAUDE.md alongside the OSM credit | User | Done |
| T10 | Copy the four updated documents into the repo | User | Pending |
| T11 | Write the newest decisions into the specs | Chat | Done |
| T12 | Build the real installer + GitHub Releases + electron-updater pipeline (`CLAUDE.md`'s actual distribution model). Only an unpacked local dev build exists so far (see Settled). Needs an actual release process first — not started | Claude Code | Pending |
| T13 | Update DESIGN.md's "Islands and ferries" section — it still says Shetland is excluded, but the decision is now to keep it in (see Settled) | User | Done |
| T14 | Correct the region layout: North Scotland, West Scotland, East Scotland, North England (one, not split NE/NW), and Shetland as its own fifth region. Currently built as NE England / NW England split instead — needs the depot_groups region set changed and existing data migrated, same pattern as the v1→v2 migration | Claude Code | Done |

---

## Settled

Kept briefly so a decision isn't reopened by accident. The four documents remain
authoritative — this is a short record of decisions that were reversed, lost or
argued about, not a summary of the design.

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
- **Ferry rule clarification (not yet implemented — ferries are Phase 9):**
  the user confirmed buses should still not use ferries on scheduled
  service (DESIGN.md §4's existing rule stands), but **private hire and
  booked tour coaches** (the player-built, bookable tour product) should
  both be able to use them, not just private hire as currently worded.
  No code change needed yet since ferries don't exist in the game — this
  is a note for whoever next touches `DESIGN.md` §4 to reword "only on
  private hire" to cover both, and for whenever Phase 9 ferry work
  actually starts.
