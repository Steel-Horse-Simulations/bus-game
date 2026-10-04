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
| T55-map-boundary-perf | Runtime performance test of the whole-UK+Ireland+IoM build against the actual packaged game (2026-09-28) — the first of the 3 real open items T55-map-boundary itself flagged. Backed up the live `pipeline-data/` (and the packaged app's own separate `release/win-unpacked/resources/pipeline-data/` copy — **a real gotcha hit live**: the packaged app reads from its own resources copy made at package time, not the top-level dev folder, so the first test run was silently still measuring the OLD 114MB Scotland-only graph despite the swap — caught by checking `router.node_count()` against the real expected figure rather than trusting the test ran correctly, and fixed by copying into both locations) to `.backup-before-uk-expansion/`, swapped in the whole-UK build, launched the packaged app via CDP, confirmed real data loaded (`node_count: 10362689`, `edge_count: 11563997` — matches the real build exactly), then restored the original Scotland-only data afterward as planned, verified byte-for-byte against the backup. **Findings, real numbers, not guessed:** `snap_to_road` (nearest-road lookup) is near-instant at every location tested (Edinburgh/London/Cardiff/Belfast/Douglas IoM, 0–0.5ms) — the existing spatial grid index (T44's own fix, `nearest_node`/`edge_grid`) scales to whole-UK size exactly as designed, no surprise there. A **short local route** (Edinburgh, ~2km) is fine (~17ms). **A real, genuine concern**: a **long-distance route** (Edinburgh→London, ~400 miles) took **2.4 seconds** — Dijkstra over an 11.5M-edge graph is inherently more expensive than over the old Scotland-only one, and UK-EXPANSION.md explicitly adds more long-distance routes spanning comparable or greater distances once this ships. Zero console errors in the run itself. Memory footprint: the packaged app's own process went from ~510MB (old graph) to ~3.2GB (whole-UK graph) — a real, concrete ~6x increase worth knowing about, not alarming on its own but real. **Not fixed, not attempted** — a genuinely separate optimisation problem (bidirectional search / a real heuristic / contraction hierarchies are the standard fixes for exactly this), and how often a long-distance `find_route` actually gets called in real gameplay (once per route drawn? per simulated journey tick?) isn't established, so scoping a fix properly needs that answered first rather than guessing at an approach. **Follow-up (2026-09-28):** tried to get a real number for a realistic ~100-mile single-leg gap (the user's own real planned use case, not the artificial 400-mile no-stops test above) — CDP tooling failed consistently across 4 separate fresh-process attempts this time (more persistent than the usual documented flakiness), so this rests on a reasoned estimate only: ~150–600ms for one such leg, extrapolated from the two real measurements already in hand (not measured directly). **User's own decision: leaving this for now** — they can avoid long-distance gaps outside Scotland if needed, so this isn't blocking anything. Not pursuing further unless asked again | Claude Code | Deferred by the user — real numbers exist for short/very-long-with-no-stops legs, ~100-mile case is an estimate only, not blocking |
| T64 | Real-world livery data supplied in advance (2026-10-02), for whenever the mandatory-regional-livery work (UK-EXPANSION.md) is built: "Caithness vehicles should be D&E Livery or Highland Council Livery." Not acted on yet — just recorded so it isn't lost before that phase is reached | Claude Code | Queued, not started |
| T63 | Live user request (2026-09-28), queued after T61: "Can you also add in a re-paint shops for me to add as well as I want to add more than the ones we currently have, can these also have somewhere to set the weekly limits they can handle please." Implies at least one repaint shop already exists somewhere in the game/spec — needs checking against OPERATIONS.md before design (livery repainting is OPERATIONS.md §4, referenced from CLAUDE.md's Phase 9 list ("Livery branding regions and repainting")). Wants a weekly-throughput capacity field per shop. **Real-world data supplied in advance (2026-10-02), for when this is built**: a second real repaint shop — "ACE Commercials - repaint shop - P8JX+2MW Brechin" (a Google Plus Code; Ferrymill Motors, Torrance, Glasgow per OPERATIONS.md §5 is the other/original one) — **ACE has less capacity than Ferrymill** (exact figures not yet given; OPERATIONS.md §5's existing "two vehicles per depot group away at once" cap is a per-operator limit, not per-shop, so this implies each SHOP will need its own real capacity figure once this is designed, not just the existing per-operator cap). Not started — queued behind T62 and behind the user confirming T61's entrance/exit fix works | Claude Code | Queued, not started |
| T62 | Live user request (2026-09-28), mid-turn while T61 was being finished: "Can you also place a temporary marker where all dealerships are and a temporary way for me to add all the dealers and there entrances/exits please that once done will then fix there places into the game, I think the code should be left in for this one so I can add more in future If I need to." Explicitly NOT a one-off/throwaway tool like T55's Portree bypass injection — the user wants the placement UI kept permanently so more dealers can be added later. Real-world dealer network is CLAUDE.md's own reference: "the dealer network (Volvo, Alexander Dennis, Western Commercial, and the Wrightbus/Yutong nearest-depot collection rule)," scoped to Phase 9 in the build order and detailed further in UK-EXPANSION.md §2. **Built 2026-10-02, both halves.** Checked UK-EXPANSION.md §2 before designing rather than assuming the depot-placement pattern transferred directly, then confirmed three real design questions with the user via `AskUserQuestion` rather than guessing: (1) dealer entrances use the same entry/exit/both mode as depot entrances (not a simpler mode-less access point), (2) manufacturer is a fixed dropdown (volvo/adl/western_commercial/wrightbus/yutong), not free text — needed now since Phase 9's collection rule is manufacturer-specific, (3) a dealer belongs to no depot group (independent, since any operator can buy from any dealer) unlike a depot. **Permanent tool**: `dealer-placement.ts`, a close structural mirror of `depot-placement.ts` (site marker, draft panel, junction-hint dots, per-entrance mode dropdown, "+ Add entrance", delete) with a manufacturer dropdown replacing the depot-group dropdown and a violet site marker (`#8b5cf6`) distinct from the depot's amber. New `dealers`/`dealer_entrances` tables (schema v22→v23, `CREATE TABLE IF NOT EXISTS` — no ALTER needed, brand new tables) with the identical bearing/road_width_m/size_scale columns and manual-nudge mechanism as depot_entrances. Backend (`db.mts`), IPC (`main.ts`), and preload bridge (`window.dealers`) all mirror the depots API 1:1. Before writing dealer-placement.ts, pulled the shared, bug-prone entrance-marker logic (icon registration, mode colours, the nudge-button row and its bearing-rotation maths) out of depot-placement.ts into a new `entrance-marker.ts` module — CLAUDE.md's own "build it once as a shared component, not three times" principle, since repaint shops (T63) are a likely third user of the identical mechanic. depot-placement.ts refactored to import from it too, re-verified clean (`tsc --noEmit`, full `.verify.mts` suite) after the refactor before building on top of it. The two tools' map-click handlers check each other's placement state one-directionally (dealer-placement checks `placeDepotState`, matching the existing precedent where each newer tool defers to earlier ones — depot-placement already checks `routeDrawState`/`placeStopState` the same way) rather than adding a circular mutual import. **Temporary reference-pin layer** (the literal, repeated, most urgent part of the request — "place rough temporary locations/dots on the map"): a separate `dealer-reference-pins.ts`, explicitly marked for deletion once every real dealer is placed, toggled via its own "Show dealer reference pins (temporary)" button. All ~66 real UK-EXPANSION.md §2 locations (Volvo/Yutong/Wrightbus plus the Loughborough repaint shop) resolved to real coordinates — NOT guessed — via a throwaway Rust example querying the whole-UK settlements data built during T55-map-boundary (`pipeline-data-uk-expansion-verify/settlements.bin`, never swapped into the live Scotland-only pipeline-data/), deleted after its output was embedded as a static TS array. 64 of 66 resolved by locality name; the remaining two (Hayes, Deeside — not in the settlements data, likely tagged as an OSM "suburb" which that dataset doesn't decode) were decoded directly from their own real Plus Codes via a from-scratch Open Location Code decoder (no local package available, Nominatim doesn't resolve plus codes either — confirmed by trying it directly, not assumed), **validated against a real known case before being trusted**: decoding Castleford's own Plus Code landed 1.8km from its already-verified real town centre, well within the town, confirming the decoder's correctness before using it on Hayes/Deeside. Each reference pin is coloured by manufacturer and clickable for a label popup; real dot positions confirmed via live CDP screenshots across Scotland, Northern Ireland and northern England (pins render correctly even where the basemap itself has no tile detail, e.g. outside the Scotland-only PMTiles coverage, since they're independent lon/lat markers). **Both halves live-verified via CDP against the real packaged app**: created a throwaway test dealer with a real road-snapped entrance, opened its popup in the live app, confirmed all UI elements render (manufacturer dropdown, entrance mode dropdown, 6 nudge buttons, Add entrance, Delete dealer), clicked a nudge button and changed the manufacturer dropdown live, confirmed both persisted correctly via a direct data query, then deleted the test dealer — the real save's own pre-existing Portree depot was confirmed untouched throughout. Rust (game-data crate, used only for the one-off lookup, no game-wasm changes needed this round — snap_entrance_to_junction/nearby_junctions were reused unchanged), `tsc --noEmit` clean, full TS suite green (9 verify files), built, packaged, exe rebuilt 2026-10-02. **Update (2026-10-02): reference pins corrected to the real Plus Code position for all 68 entries, not just the 2 with no settlement-name match.** Direct user correction: "The reference pins should be on the plus code locations" — the first version used a town-centre settlement-name lookup for 64 of 66 entries, which was a rougher approximation than the real data actually supports. Re-decoded every single dealer's own Plus Code (not just Hayes/Deeside) with the same validated Open Location Code decoder, using each one's already-resolved settlement coordinate purely as the short-code recovery reference point (not as the final position). Checked the result wasn't silently wrong before trusting it on all 68: every decoded point landed within 0.4–12.3km of its own reference town — plausible real industrial-estate-from-town-centre distances, nowhere near the ~100km+ a recovery bug would produce. `locality` field replaced with `plusCode` (shown in each pin's popup) since settlement-name matching is no longer part of the positioning logic at all. Live-verified via CDP: Glasgow's pin now sits visibly several km southwest of the city-centre label, consistent with a real industrial dealer site rather than the town centre. `tsc --noEmit` clean, built, packaged, exe rebuilt 2026-10-02. **Not yet checked by the user** — ask them to open "Place dealer," place one real dealer using a reference pin as a guide, and confirm the manufacturer dropdown/entrances all behave as expected before relying on it for the rest.

**Update (2026-10-02): entrance/exit markers simplified to plain dots, the whole oriented-marker mechanism removed.** Direct user instruction: "I think entrances and exits should not be shown on the map, only dots on the road to show where entrances and exits are when placing depots and dealerships as they are constantly breaking. We should remove all code that isnt needed other than for the basic functionality." This was the entire T61 saga's accumulated complexity (bearing-rotated semicircle icon, road-width-based icon scaling, the manual nudge mechanism built specifically to compensate for both) — all removed outright rather than left dormant. **Rust**: `snap_entrance_to_junction` shrunk from returning `[lon, lat, bearing, road_width_m]` to just `[lon, lat]` — the junction's own raw position, no pull-back, no bearing computation at all (a plain dot has no orientation to get wrong, so the whole "kerb offset vs. pixel-width zoom mismatch" problem that drove T61's many rounds simply doesn't apply anymore). `ENTRANCE_PULL_BACK_M`/`move_point_along_bearing` deleted. `nearby_junctions` (the hint-dot layer, shown while choosing where to click) simplified from `[lon, lat, max_width_m, ...]` triples to plain `[lon, lat, ...]` pairs — its own road-width-based sizing (a separate, working T61 fix, "scale don't filter ambiguous candidates") was removed too, consistent with the same "basic functionality only" instruction, since the literal basic need is just a clickable candidate dot. `node_max_width_m` field deleted entirely (nothing left to use it). Rust 22/22 (3 obsolete tests rewritten to check plain `[lon, lat]`, 1 width-reporting test deleted outright since the feature it tested no longer exists). **Schema v23→v24**: `bearing`/`road_width_m`/`size_scale` columns dropped from both `depot_entrances` and `dealer_entrances` via `ALTER TABLE ... DROP COLUMN` (confirmed node:sqlite's bundled SQLite supports this before relying on it). `moveDepotEntrance`/`setDepotEntranceSizeScale`/`moveDealerEntrance`/`setDealerEntranceSizeScale` and their IPC/preload bridges deleted outright. **Renderer**: the SDF semicircle icon, `buildEntranceIconWidthScale`, and the 6-button nudge row all deleted from `entrance-marker.ts` (now just the mode labels/colours, ~20 lines down from ~170) — `depot-placement.ts`/`dealer-placement.ts`'s entrance layers changed from `symbol` (rotated icon) to plain `circle` (fixed 6px radius, coloured by mode), matching the site markers' own existing style. `db.verify.mts`'s now-invalid nudge assertions removed. A broad repo-wide grep confirmed zero leftover references to any removed symbol before shipping. Rust 22/22, WASM rebuilt, `tsc --noEmit` clean, full TS suite green, built, packaged. **Live-verified against the REAL user save** (not just the synthetic verify-save): launched the packaged app, confirmed the real Edinburgh/Portree depots and their entrances survived the v23→v24 column-drop migration intact (entrance rows now exactly `{id, depotId, lon, lat, mode}`), confirmed `snap_entrance_to_junction` returns exactly 2 elements live, created a real test depot+entrance via the actual snap function, opened its popup and confirmed it shows only the mode dropdown + Remove/Add entrance/Delete depot — no nudge buttons anywhere — then deleted the test depot, leaving the real save untouched. Screenshot confirms the entrance renders as a plain blue dot, not a semicircle. exe rebuilt 2026-10-02. **Ask the user to confirm this looks and feels right** — this closes out the fragile part of T61/T62 for good; if dots still look wrong, it would be a very different, much simpler kind of bug than the orientation/scaling issues chased before.

**Update (2026-10-02): entrance dots now popup-only, and the junction-hint dots removed entirely.** Direct user instruction: "The dots should only be visable when the depot is clicked on and the junction snapping should also have gone as it is now only to let buses know which roads to use not for anything visual." Two changes: (1) the `depot-entrances`/`dealer-entrances` map sources are now owned exclusively by new `showEntrancesForDepot`/`showEntrancesForDealer` (populate) and `hideEntrances` (clear) functions, called from `openDepotPopup`/`openDealerPopup` and the popup's own "close" handler respectively — the entrance dots are empty by default and only populate while a given depot/dealer's popup is actually open, confirmed live via `queryRenderedFeatures` (0 before click, 1 while the popup is open, 0 again after closing). (2) The junction-hint dot layer (`depot-junction-hints`/`dealer-junction-hints`, `refreshJunctionHints`/`clearJunctionHints`/`nearestHintToClick`) removed entirely from both placement files — a click now calls `router.snap_entrance_to_junction` directly with the raw click coordinates, no hint-dot re-aiming. Since this was the ONLY caller of `Router::nearby_junctions`, that whole Rust function was deleted too, along with the two now-fully-unused `node_degree`/`all_edges_adjacency` fields it alone depended on (confirmed via grep before removing) and the now-unused `VecDeque` import. `snap_entrance_to_junction`'s own doc comment updated to explain junction snapping is routing-only now, not a visual aid. Rust 20/20 (2 more `nearby_junctions_*` tests deleted outright, consistent with the already-deleted width-reporting one from the previous round). `tsc --noEmit` clean, full TS suite green, WASM rebuilt, built, packaged. **Live-verified against the real packaged app**: confirmed 0 entrance-dot features rendered before clicking Portree's real depot, exactly 1 while its popup is open (screenshot: a single blue dot at the real entrance position, no hint dots anywhere), 0 again after closing — and confirmed the `depot-junction-hints` layer no longer exists on the map at all. A first verification attempt gave a false negative (clicked the wrong pixel — the real Portree depot's own site coordinate differs from the entrance/junction coordinate used in earlier rounds' testing — caught by directly querying `window.depots.list()` for the real coordinate rather than assuming, then re-verified correctly). exe rebuilt 2026-10-02. **Ask the user to confirm**: open any depot/dealer — dots should appear only while its popup is open; placing a new entrance should feel the same as before (click near the junction, it still snaps), just without the hint dots.

**Update (2026-10-02): a real data gap found, not a bug — Alexander Dennis and Western Commercial have no reference pins yet.** User asked why ADL wasn't on the map. Checked directly rather than guessing: `UK-EXPANSION.md` §2 ("Dealer network — real data, complete") only has precise Plus Codes for Volvo/Yutong/Wrightbus — that's the whole source the 68-entry reference-pin list was built from. `OPERATIONS.md` (the earlier, less detailed source) separately names Alexander Dennis ("1 location, near Falkirk") and Western Commercial ("4 locations: Dundee, Edinburgh (Broxburn), Bellshill, Glasgow") but gives only town names, no exact Plus Codes for either. Asked the user whether to add rough town-level pins for these two (same settlement-lookup technique as most of the existing 68) or wait for exact Plus Codes — **they chose to wait**, so neither manufacturer has a reference pin yet; this is expected, not a bug. **When exact Plus Codes for Alexander Dennis (near Falkirk) and/or Western Commercial's 4 sites become available, add them to `dealer-reference-pins.ts`'s `REFERENCE_PINS` array** the same way the other entries were decoded (either a settlement-name lookup against the whole-UK data, or the from-scratch Open Location Code decoder if given as Plus Codes directly).

**Update (2026-10-02): the exact Plus Codes arrived, decoded, and the whole feature levelled up — real dealers are now auto-seeded, the reference layer is a live checklist.** User supplied real data directly: "Alexander Dennis - 254F+F2 Falkirk" and "Western Commercial - VM4Q+J8 Glasgow, WHR2+86 Broxburn, RXH4+58 Bellshill, & F4M5+PW Dundee." Decoded all 5 with the same validated Open Location Code decoder (drift from each town reference: 1.4–5.5km, consistent with every other entry in the file) and added them to `REFERENCE_PINS` — all 5 manufacturers now have at least one real position. In the same exchange the user asked for two related upgrades: (1) "if a dealer is placed within the dealer reference then the dealer reference should turn green," then refined moments later to (2) "add all dealers exactly where there plus codes place them but make the reference show on the map until I have added entrance and/or exits" — read as (2) superseding (1)'s manual-placement model entirely, not adding to it. Built: new `seedRealDealers()` (idempotent, matched by name — safe to call on every launch) creates every real dealer in `REFERENCE_PINS` directly in the `dealers` table at its own precise decoded position, skipping the Loughborough "repaint" entry (not a real dealer, no manufacturer the table's CHECK constraint accepts — T63's concern). Called in `main.ts` **before** `mountDealerPlacement` so its own initial `dealers` list already includes everything seeded, not stale until a reload. The reference-pin layer itself became a checklist: `refreshReferencePinsData` (re-run every time the layer is toggled on) filters `REFERENCE_PINS` down to only dealers with zero entrances — a pin simply stops rendering the moment its dealer gets its first one. Toggle button relabelled "Show dealers needing entrances" with an updated tooltip. **Live-verified against the real packaged app**: 76 real dealers now exist after seeding (69 Volvo + 1 Yutong + 1 Wrightbus + 1 ADL + 4 Western Commercial), confirmed idempotent (reloading a second time still shows exactly 76, nothing duplicated), Alexander Dennis screenshotted sitting correctly on the real Falkirk road network. **A real, separate limitation surfaced and confirmed directly, not guessed**: roughly 40+ of the seeded Volvo dealers (everywhere south of Carlisle/Newcastle — Birmingham, London, Bristol, Cornwall, etc.) are correctly stored with correct real coordinates but currently unreachable on the map at all — confirmed by trying to `jumpTo` London and watching MapLibre's own `maxBounds` (Scotland + border strip only, lat 54.48–60.98) clamp the centre back north. This is NOT a bug in this change — it's the already-known, already-documented T55-map-boundary situation (the whole-UK map data was built and proven working back in September but deliberately never swapped into the live game pending the user's own sign-off, since it's a large, hard-to-reverse jump in data size/memory/load time). These dealers will simply become visible and clickable automatically the moment that swap happens, with no further work needed here. `tsc --noEmit` clean, full TS suite green, built, packaged, exe rebuilt 2026-10-02 | Claude Code | Done, pending user check — see T55-map-boundary for the separate, already-known reason most English Volvo dealers aren't reachable on today's map yet |
| T61 | Three depot-entrance bugs from two live screenshots (2026-09-28), following on from T54: (1) Annandale Street, Edinburgh — "the flat edge of the semicircle needs to be on the edge of the main road it is currently in the middle" (T54 fixed orientation but not position — the marker still sat on the road's raw centreline node). (2) "I would also like the semicircles to be scaled to the width of the road they are on please." (3) Broom Place, Portree — "the entrance is facing the wrong road," a fresh orientation bug distinct from T54's original one. All three root-caused against the user's own real save + pipeline data (not guessed), per the established replay technique. **Orientation bug (3)**: the depot's own access-road OSM way continued straight through the chosen junction as a same-way edge, which the old "just take the first other edge" logic wrongly treated as the main road — fixed by preferring a candidate edge with a genuinely different `osm_way_id`, falling back to the first if none differs. New Rust test proves the old logic's answer was wrong (a same-way edge listed first gives 90°/270°, but the real different-way edge gives the correct 180°). **Position bug (1)**: `snap_entrance_to_junction` returned the raw junction node position (the road's centreline); new `move_point_along_bearing` helper offsets it half the main road's own real width in the bulge direction — a genuine kerb offset, not a centreline point. **Scaling (2)**: the function's return value grew from `[lon, lat, bearing]` to `[lon, lat, bearing, road_width_m]`; `depot_entrances` gained a `road_width_m REAL NOT NULL DEFAULT 5.5` column (schema v20→v21, plain ADD COLUMN), threaded through `createDepot`/`addDepotEntrance`/the IPC bridge/`DraftEntrance`/both click handlers in `depot-placement.ts`, and both entrance GeoJSON sources (real + draft) now carry `roadWidthM` as a feature property, multiplied into each layer's `icon-size` expression against a 5.5m reference width (`entranceIconWidthScale`) — a road half or double the reference width renders the marker half or double size accordingly. All three fixes verified against the real Broom Place/Portree data via a throwaway Rust example (bearing corrected from the buggy 253.22° to the correct 33.42°, road_width_m=3.5 confirmed), deleted afterward along with the `examples/` directory per CLAUDE.md's "no dead code" rule. Rust: 21/21 pass (game-wasm), including a new test proving the same-way-edge bug and updated assertions on all 4 pre-existing `snap_entrance_to_junction` tests for the new 4-element return shape and kerb-offset position. WASM rebuilt. TypeScript: `db.verify.mts` extended with round-trip assertions for `roadWidthM` through creation, manual add, and close/reopen persistence — a real gap caught by `tsc --noEmit` itself (3 call sites in the verify file still passed only 3-argument entrance objects, which the now-required `roadWidthM` field made a compile error, not a runtime one). `tsc --noEmit` clean, all 9 `.verify.mts` files green (8 renderer + db), `npm run build` and `npm run package` both clean, exe rebuilt 2026-09-28 16:41. **Not yet independently live-verified in the running app** — CDP tooling's persistent flakiness this session (see T55-map-boundary-perf) wasn't retried again here; rests on the Rust test's independently-computed proof against real coordinates plus a clean end-to-end build. **Update (2026-09-28): position bug root-caused for real, two separate fixes, one confirmed, one still open.** User reported both entrances "in the wrong place" with screenshots, then a follow-up annotating exactly where Portree's should sit. Investigated by replaying both depots' real coordinates against the real road graph (topology dump, not guessed). **Portree — root-caused and proven fixed.** The depot's driveway is one continuous OSM way passing through several minor side-track junctions (degree ≥3, but each one's other road is a narrower, less-major spur) before reaching the real through-road 141m out. `walk_to_junction_or_dead_end` stopped at the *first* degree-≥3 node regardless of what the other road there actually was — 22m out, a minor fork, not the real junction — then oriented toward an unrelated 77m-distant dead-end spur. Fixed by continuing the walk through a same-OSM-way-id continuation at a degree-≥3 node *unless* some other, genuinely different-way edge there is at least as major (`class` — lower is more major) as the road just arrived on, which marks a real crossroads rather than an incidental spur; a plain degree-2 pass-through node is unaffected (unchanged from T52). New test `snap_entrance_to_junction_keeps_walking_past_a_minor_spur_to_reach_the_real_major_road` proves the new capability without breaking the existing T61 same-way-continuation test (its own fixture already had the different road as more major, so it was — by luck, not design — already consistent with the new discriminator). Verified against the real Portree coordinates: now lands at (-6.2120758, 57.420795), within kerb-offset distance of the real major-road junction (-6.2121334, 57.4207894) the user's own yellow-circle annotation pointed at — a direct match. **Edinburgh/Annandale Street — a second real bug found and fixed, but confirmed NOT the cause of the visible complaint.** Separately found and fixed a real bug in the kerb-offset *position* formula: it moved straight along the main road's own perpendicular, which only lands exactly on the kerb line at a perfect right-angle junction — the same assumption T54 already had to fix for *bearing*, still baked into *position*. Generalised to move along the access road's own real approach bearing far enough to reach the kerb line (reduces to the identical old formula at 90°, new test `snap_entrance_to_junction_flat_edge_follows_the_real_road_not_a_right_angle_guess`'s expectations updated accordingly, all fixed via an independently-computed test helper, not hand-adjusted numbers). This is a real, worthwhile fix for any depot whose access road meets its main road at an oblique angle — but verified directly against Annandale Street's own real coordinates, and it moved the two stored entrances by about a centimetre each, because that junction is already very close to a right angle in the real data. **So Annandale Street's actual visible problem is still unexplained** — the junction chosen, the side of the road, and the general position all check out against the real topology; whatever's producing the visible gap in the user's screenshot isn't a bug either of these two fixes addresses. Rust: 22/22 pass. WASM rebuilt, `tsc --noEmit` clean, built, packaged, exe rebuilt 2026-09-28 17:21. **Update (2026-09-28): the walk-past-minor-spurs fix was itself wrong, reverted per the user's own better idea.** User removed and re-placed Portree's entrance, and this time it overshot the other way — walked straight past the real junction they'd clicked near, all the way to an unrelated, much more major road far off, with the width changing to match that distant road too (not a separate bug — a direct consequence of landing on the wrong road). User's own suggestion: "would setting it to the closest junction to where I click work?" — simpler and more predictable than trying to algorithmically judge how far out "the real main road" must be, and puts control back in the player's hands (click nearer the fork you mean). Reverted `walk_to_junction_or_dead_end` to stop at the first non-pass-through node again (the class-majority discriminator removed entirely); the T61 "prefer a genuinely different way id" bearing/width logic at whichever junction IS reached is untouched, since that part was never the problem. The test that had proven the walk-past-spurs behavior was rewritten (not deleted) to instead prove the *reverted* behaviour — same fixture, opposite assertion, with a doc comment explaining both the detour and the revert for future reference. Verified against the real Portree coordinates: clicking near the depot now correctly snaps to the first fork (22m out, matching pre-Portree-fix behaviour) rather than the distant major road. Rust 22/22. **Also fixed in the same pass**: the "both" entry+exit marker colour (`#f59e0b`) was identical to the depot site marker's own colour, making them indistinguishable on the map (a live user report) — changed to blue (`#3b82f6`), distinct from entry (green)/exit (red)/depot (amber). WASM rebuilt, `tsc --noEmit` clean, built, packaged, exe rebuilt 2026-09-28 17:30. **Update (2026-09-28): the "closest junction to click" model wasn't usable either, without seeing the junctions.** After the revert above, the user tried again and reported "it's not where I clicked" — a screenshot showed the marker on a straight, unbroken stretch of Broom Place with no visible fork anywhere near it. Root cause: the depot's driveway genuinely has several real junction nodes along it (minor side-track forks), but they render as nothing more than the one continuous road on screen at this zoom/style — the player has no way to see which invisible candidate is nearest their click. Rather than attempt a fourth positioning heuristic, asked the user directly how they'd like this to work; they chose showing every real junction while placing, over dropping junction-snapping entirely. Built: new `Router::nearby_junctions(lon, lat, radius_m)` (game-wasm) — a plain scan over every node's precomputed degree (a new `node_degree: Vec<u32>` field, built once, over *all* edges rather than only routable ones, since a private driveway is exactly the kind of `access_restricted` road `edge_grid`/`adjacency` exclude) returning every point with `degree != 2` (a real dead end or fork) within radius, deliberately unindexed since it's called once per "arm placement," not per click. New test proves dead ends/forks are found within radius, a plain pass-through point is excluded regardless of distance, and a too-far node is excluded regardless of degree. Rust 23/23. Renderer: new `depot-junction-hints` source/layer — small pale dots with a grey stroke, `minzoom: 11` (visible well before the entrance icon's own 13), populated via `refreshJunctionHints(lon, lat)` (300m radius) the moment a depot's own site is placed or "+ Add entrance" is armed on an existing depot, cleared via `clearJunctionHints()` on cancel, save, or whenever an armed click resolves (success or not). `tsc --noEmit` clean, full TS suite green, WASM rebuilt, built, packaged, exe rebuilt 2026-09-28 17:39. **Update (2026-09-28): the dots were showing correctly, but a near-miss click could still snap to the wrong one.** User tried again with the hint dots visible and reported "still broken" — screenshot showed the new entrance well short of the dot they'd clicked near. Verified directly against real Portree data: confirmed the hints were real (`nearby_junctions` returned 38 real points within 300m of a genuinely busy road network there, one exactly matching where the entrance landed) and confirmed clicking *exactly* on any given hint's own coordinates correctly round-trips to that same junction — so the underlying snap logic was sound. The actual gap: `snap_entrance_to_junction`'s own nearest-*road-edge* search has no idea which dot the player meant to click, and this depot's driveway area is dense with several short edges close together (the same density that makes multiple dots cluster close together on screen) — a click near, but not precisely on, a dot could land on a different nearby edge entirely, whose own walk resolves to a different real junction. Fixed by tying the two together: a new `nearestHintToClick` (depot-placement.ts) compares the click against every currently-shown hint dot in **screen pixels** (`map.project`, 14px tolerance — constant across zoom, unlike a fixed real-world radius), and if one is close enough, `snap_entrance_to_junction` is called at that dot's own exact coordinates instead of the raw click position, guaranteeing a click near a visible dot always produces that exact junction. Falls back to the raw click when no dot is close enough (e.g. clicking a plain point on an ordinary road, unrelated to a fork). `tsc --noEmit` clean, full TS suite green, built, packaged, exe rebuilt 2026-09-28 17:47. **Update (2026-09-28): the 14px tolerance was the actual bug.** User confirmed directly they'd been clicking the right dot the whole time — a screenshot with their own yellow annotation circling the exact dot at the real 141m major-road junction. Verified directly against real data: that junction (-6.2121334, 57.4207894) IS present in `nearby_junctions`' own output, and clicking its exact coordinates correctly resolves there (bearing 78°, width 7m, matching the real Trunk road) — so the hint data and the underlying snap were both right. The gap was purely the 14px screen-pixel tolerance added in the previous round: a hint dot only renders a few pixels wide at these zooms, and a real click is routinely 20-30px off its exact centre, well outside that tolerance — silently falling through to the raw click position, which could resolve to a different, closer, unrelated junction with no indication anything had gone wrong. Fixed by removing the distance cutoff entirely: whenever any hint dots are being shown, a click always resolves to whichever one is nearest in screen space, full stop — since the whole point of showing a fixed set of candidates is that the click should be constrained to choosing among them, not falling through to something else. `tsc --noEmit` clean, full TS suite green, built, packaged, exe rebuilt 2026-09-28 17:57. **Update (2026-10-02): the real cause — several real forks along this depot's driveway look visually identical, and the player was consistently choosing a minor one believing it was the major one.** User reported "still wrong" again, then directly: "can we just remove the invisible junctions if they can't even be seen." Checked the actual saved entrance position directly against the real road graph (not guessed) — it was landing at the exact same genuine 22-25m fork on three separate attempts, not the real major-road junction ~141m out the user originally circled in yellow. Root cause, confirmed against real edge data: this depot's driveway is one continuous Unclassified road passing through several minor Service-class side-track junctions (22m, 48m, 66m, 73m, 90m, 128m out) before reaching the one genuinely major road (a 7m-wide Trunk road) at 141m — every one of these intermediate forks looks like an ordinary Y-junction at any given zoom, visually indistinguishable from the real target, so the player had no way to tell them apart and was consistently clicking the first (nearest, most prominent at a tight zoom) one. **Deliberately did NOT filter any hints out** — a wrong filter risks hiding the exact dot the player needs, the same failure shape as the two already-reverted walk heuristics on this feature. Instead: `Router::nearby_junctions` now returns `[lon, lat, max_width_m, ...]` triples (a new `node_max_width_m: Vec<f32>` field, built once alongside `node_degree`, taking the widest/most-major road touching each node) rather than plain pairs, and the hint dots are now rendered with `circle-radius` scaled by that width (same "zoom curve stays top-level, width scale goes inside each stop's own output" pattern already used for the entrance icon's own size, validated against the real MapLibre style-spec before shipping) — a junction on the real 7m Trunk road now renders visibly bigger than one on a 3.5m private track, letting the player tell them apart without anything being hidden. New Rust test proves the reported width is the *maximum* across a node's own edges, not the minor one or an average. Rust 24/24. `tsc --noEmit` clean, full TS suite green, WASM rebuilt, built, packaged, exe rebuilt 2026-10-02 07:22. **Update (2026-10-02): live-verified via CDP, one more real fix found and applied before handing back.** User was away from their computer and asked for a screenshot instead of checking directly — drove the actual packaged app via CDP (a technique that had been unreliable earlier this session, but worked cleanly this time) to Portree, armed "+ Add entrance," and screenshotted the real hint layer. Found a real, separate problem: `nearby_junctions` was still showing 31 dots within 300m of the depot — barely fewer than before — because this specific real location is a genuinely dense, fully-connected residential street grid, not an unrelated neighbourhood bleeding in through a straight-line radius as originally suspected. Fixed by changing `nearby_junctions` from a plain Euclidean distance scan to a real walk along the road network: a new `all_edges_adjacency` field (built once, over every edge — same reasoning as `node_degree`) lets it relax real walking distance (`edge.length_m`, not straight-line) outward from the nearest node to the query point via a shortest-real-distance search, returning only junctions actually reachable from the depot's own road within `radius_m` of real walking, not simply physically nearby via some other street. New dedicated test proves a node positioned only ~11m away by raw coordinates, but with no edge connecting it to the depot's own network, never appears regardless of radius. Existing `nearby_junctions` tests updated to use real `length_m` distances instead of the coincidental degree-scale coordinate separations they'd been relying on. Rust 25/25. Verified live, for real, against the actual packaged app via CDP (not just unit tests): a direct screenshot crop at the exact real major-road (A87) junction's own screen position confirms it renders as a visibly larger circle than the small driveway-fork dots around it — the live app showing the fix working, screenshotted and sent to the user since they couldn't check themselves. WASM rebuilt, `tsc --noEmit` clean, full TS suite green, built, packaged, exe rebuilt 2026-10-02 (same day). **Update (2026-10-02): the real target was the near fork all along — I had misread the user's own earlier confirmation.** The user directly confirmed: "the junction where I have already be placing the entrance and already told you that's the entrance" — the ~22-25m fork next to the depot (entrance id 48, unchanged since several rounds ago) was correct the whole time. The chase toward the A87 junction (the "walk past minor spurs" detour, its revert, the hint-dot feature, and the width-scaling work) was built on a misreading of an earlier yellow-circle screenshot — genuinely confirmed via `AskUserQuestion` this time rather than assumed: "the nearest side-junction to the depot" is what's wanted, which is exactly what the already-reverted `walk_to_junction_or_dead_end` (stop at the first non-pass-through node) already produces, and has produced since that revert. **No further code change needed for Portree's own junction-choice logic** — it was already correct; the confusion was entirely about which dot to look for, not a remaining bug. The `nearby_junctions`/hint-dot/width-scaling work (network-scoped BFS, real per-node width) still stands as a genuine, real improvement in its own right (precise click-to-dot matching, visibility of real-but-invisible nearby forks) and is not being reverted — it just wasn't the fix this specific back-and-forth needed. **Update (2026-10-02): the REAL bug, finally — a units mismatch, not a logic bug, and the whole kerb-offset design was ripped out.** Immediately after the above, the user clarified with an annotated screenshot (their own red outline: "it should be where the red semicircle is with the flat part at the junction and the curved part facing the depot") and then "In Edinburgh it's not even on the road still" — confirming this was never Portree-specific. Root-caused by measuring a live screenshot's own exact pixel gap with `map.project` rather than computing on paper: the kerb-offset distance (half the road's real width, 1.75m+ for a wide road) is a real-world metre value, but the basemap draws roads at a fixed *pixel* width per zoom level (`basemap-style.json`'s own `line-width` zoom expressions) completely unrelated to real metres — at the close zoom entrance placement actually happens at, a real road might render under a metre wide on screen, so any real-world offset worth calling "at the kerb" sailed past the narrow rendered line into open space. A first attempt to shrink the offset to a small fixed 1.0m was *still* wrong by 2x — caught only by precisely measuring a live screenshot's pixel gap, not trusted from a paper calculation: MapLibre's own tiles are 512px, not the 256px a first-pass formula assumed. Rather than chase a third offset value, the user said plainly: "I think it's best to completely wipe the code for this and start again as it is continuously wrong in the exact same way every time" — agreed, and the entire "find the main road edge, compute its perpendicular, offset by some real-world distance" design was deleted outright (`ENTRANCE_KERB_OFFSET_M`, `move_point_along_bearing`, the `main_road_edge`/`candidate_edges`/`angular_diff` machinery, two now-obsolete tests built around "which edge is the main road"). Replaced with the simplest design that matches the user's own drawing exactly: position = the junction node's own real, unmodified coordinates (the same position the hint dots already render exactly on the road, proven correct by a debug marker placed precisely there and screenshotted against the real tile), bearing = `toward_depot` directly (no perpendicular step at all) — flat edge at the junction, bulge facing the depot. `road_width_m` is still returned (now `node_max_width_m`, the junction's own widest road) purely for the unrelated, already-working icon-size scaling. Rust 23/23 (two obsolete tests removed, the rest rewritten to assert the raw node position and direct `toward_depot` bearing with no offset), zero compiler warnings on a clean release build. **Live-verified via CDP against the real packaged app, both depots, this time with the position's own exact pixel alignment checked, not assumed**: screenshots of both Portree and Edinburgh at tight zoom (19.5-20) show the marker's flat edge sitting right on the rendered road edge at the junction, matching the user's own red-outline drawing. `tsc --noEmit` clean, full TS suite green, built, packaged, exe rebuilt 2026-10-02. Annandale Street's general positioning is now fixed by the same change (it was never a separate bug — the whole kerb-offset design was wrong everywhere, Portree just surfaced it first). **Update (2026-10-02): "wrong angle"/"wrong size" report traced to two testing artifacts, not a code bug — confirmed directly, not guessed, per the user's own explicit instruction to always check the code/data rather than infer.** User reported the Portree entrance was the wrong angle and the Edinburgh one the wrong size. Investigated by overlaying a precise debug marker at the exact real junction coordinate (via `map.project`) and comparing it pixel-for-pixel against the rendered icon — found the running app's in-memory GeoJSON source was showing stale entrances left over from several earlier verification rounds (the live source still held id49/50/51's old data, not the current id52/53 rows), because my own test script had called `window.depots.addEntrance`/`deleteEntrance` directly without reloading in between, bypassing the renderer's own cache-refresh path (the same class of issue as `feedback_ui_caches_need_reload.md`). A page reload immediately fixed the mismatch — a fresh overlay check showed the rendered icon exactly coincident with the real junction node for both depots, flat edge on the road, bulge toward the depot. Separately, the Edinburgh test entrance itself (created by auto-clicking at the depot's own exact coordinate, a test shortcut) had snapped to a minor 3.5m internal driveway track rather than Annandale Street itself (7m) — explaining the "wrong size" independently of any code bug, since that's genuinely the real width of the road at the point that was auto-clicked, not a representative real placement. Deleted both test entrances so the user can place fresh ones themselves via the real UI (hint dots still functioning). **User also gave a standing instruction this round**: "make no guesses always look at the code" — recorded as a new memory rule, applied immediately in this same investigation (reading the actual icon-drawing canvas code, inspecting its real pixel output, and querying the live GeoJSON source directly rather than inferring from a screenshot alone).

**Update (2026-10-02): two more real, measured fixes — pull-back reduced, icon size corrected via direct pixel measurement.** User, after seeing live screenshots: "They are both way too far back from the junction, the flat edge should be at the corner of the road, they are also both wider than the roads they are on as well." Investigated both directly rather than guessing a new number for either. **Size**: wrote a from-scratch PNG decoder (no image library available) to measure the actual rendered pixels of a real screenshot — found the icon rendering 22px wide against a real road rendering 17-18px wide at the same zoom, confirming the report exactly. `icon-size`'s base factors (0.35/0.7, and the draft layer's 0.5) scaled down by the precise measured ratio (~0.78) to 0.27/0.55 and 0.39. **Position**: attempted a precise geometric remeasurement of "the corner" via the map's own WebGL canvas (`gl.readPixels`) first, but found MapLibre's canvas context has `preserveDrawingBuffer: false`, so the buffer is already cleared by the time it can be read — a real, confirmed technical dead end, not guessed past. Fell back to a principled bisection instead of a fresh guess: 0 (the original, no pull-back) was "a tad far forward," 0.4m was "way too far back" — `ENTRANCE_PULL_BACK_M` set to 0.2m, the midpoint of the two known real data points. Along the way, repeatedly hit and finally disciplined around a real methodology flaw: temporary debug-marker `<div>`s added via `page.evaluate` do NOT reposition when the map is later panned/zoomed in a separate script call (unlike MapLibre's own markers), so several intermediate screenshots were contaminated by stale leftover dots from earlier verification rounds — the fix is to always add debug markers in the SAME script call as the final `jumpTo`, immediately before the screenshot, never across separate connections. Rust 23/23, `tsc --noEmit` clean, full TS suite green, built, packaged. **Live-verified and screenshots sent to the user for confirmation** — the 0.78 size ratio is solidly measured and should be correct; the 0.2m pull-back is a reasoned bisection, not independently re-measured against "the corner," so flagged as still pending the user's own look rather than asserted as finished.

**Update (2026-10-02): manual nudge buttons added, closing out T61.** User's own follow-up after the 0.2m bisection: "Portree is about 2 pixels to far forward Edinburgh looks good, can there be a manual nudge button just to fix the few odd gaps?" then "Can you add a horizontal and size nudge as well just incase there are other funny bits" — rather than chase a universal constant further (the 0.2m pull-back can't satisfy every junction's own geometry at once, which is exactly why a per-entrance manual override makes more sense than a fourth bisection), each entrance now carries its own manual `size_scale REAL NOT NULL DEFAULT 1.0` column (`depot_entrances`, schema v21→v22, plain ADD COLUMN) on top of the existing automatic width-based icon scaling (multiplied together, not replacing it), plus two new DB functions/IPC handlers `moveDepotEntrance`/`setEntranceSizeScale` that write a raw lon/lat and the size scale directly. The popup's existing per-entrance row (mode dropdown + Remove) gained a second row of six small buttons: ↑/↓ (forward/back along the entrance's own stored bearing, i.e. toward/away from the depot), ←/→ (left/right, along bearing±90°), −/+ (size, ±0.05 per click, clamped 0.3-3.0). Forward/back/left/right reuse the exact same bearing-rotation maths as Rust's own `move_point_along_bearing` (kept in sync by hand in TS — a one-off UI nudge isn't worth a wasm round-trip), stepping 0.1m per click. `electron/db.verify.mts` extended with round-trip assertions (default size_scale 1.0, moveDepotEntrance updates position while leaving bearing untouched, setEntranceSizeScale updates the scale) — all pass. `tsc --noEmit` clean, full TS suite green (9 files), built, packaged, exe rebuilt 2026-10-02. **Live-verified via CDP against the real packaged app** (not just unit tests): created a throwaway test depot+entrance at Portree's real junction, opened its popup in the live app, confirmed all six buttons render, clicked ↑ then + and confirmed via `listAllEntrances` the entrance moved exactly 0.1001m with its bearing unchanged and size_scale went 1.0→1.05, screenshotted the popup showing the button row, then deleted the test depot/group so nothing was left in the user's real save (which still has their own real Portree/Edinburgh depots, untouched). **T61 is now considered closed** — the remaining "2 pixels too far forward" Portree discrepancy, and any other small per-junction gaps, are exactly what these nudge buttons are for; ask the user to try nudging Portree's own real entrance themselves next time they're at their computer.

**Earlier update (2026-09-28): a real regression, caught and fixed the same day.** User reported entrances invisible at both real sites, even after deleting and re-placing. Checked the real save file directly rather than guessing — both depots' entrances existed with sane data (Edinburgh: road_width_m 7/7; Portree: road_width_m 3.5), so this wasn't a data-layer bug. Root cause found by validating the actual `icon-size` expression against MapLibre's own `@maplibre/maplibre-gl-style-spec` `createPropertyExpression` directly: `["*", ["interpolate", ["linear"], ["zoom"], ...], entranceIconWidthScale]` is rejected outright — MapLibre only allows a zoom-based `interpolate`/`step` as the TOP-LEVEL expression (or nested only within specific combining expressions), not wrapped inside an arbitrary `"*"`. That silently broke the whole `depot-entrances-points` layer (the real, saved entrances) — nothing rendered, old or new. The `depot-draft-entrances` layer (in-progress placement, before Save) was unaffected since its own `icon-size` never involved zoom. Fixed by moving the width scale inside each zoom stop's own output value instead: `["interpolate", ["linear"], ["zoom"], 13, ["*", 0.35, widthScale], 17, ["*", 0.7, widthScale]]` — validated successful (not just compiling) against the real spec validator for both layers before shipping. `tsc --noEmit` clean, built, packaged, exe rebuilt 16:47. **Ask the user to check both real cases again.** | Claude Code | Done, pending user check |
| T60 | "Last service" display in the timetable editor (2026-09-28) — live user request: "show the time of the last service to finish the route at the previous terminus." Asked what "previous terminus" meant rather than guessing (genuinely ambiguous — DESIGN.md §7 Extensions has a real "shorter vs extended terminus" concept it could have meant) — clarified as simply the route's own last stop. Shown as a "Last service arrives [stop name]: HH:MM" line above the grid in `route-timetable-panel.ts`, computed from the currently-edited leg's own live (possibly-unsaved) timetable, always with excluded departures dropped regardless of the "Show excluded services" toggle state — a hidden departure doesn't actually run, so it would be misleading to report it as the last real one. Only shown for the leg actually being edited (an unedited leg has no live data to read this from). `tsc --noEmit` clean, full TS suite green, packaged. **Not yet checked by the user** | Claude Code | Done, pending user check |
| T59 | Per-journey hide/unhide button directly above each column in the timetable grid (2026-09-28) — live user request: the existing flat list of "all times a service runs" chips (route-timetable-panel.ts) was hard to match against "the one I actually need to remove," since it shows bare HHMM values with no stop-by-stop context; moved the hide affordance into the actual grid, right above each journey's own column, where the full context makes it obvious which journey is which. New optional `departureMinutes: number[]` field on `RouteTimetableGrid` and `departureMinute: number` on `MergedGridColumn` (`route-timetable-grid.mts`) — previously not tracked on the grid types at all, needed so the button knows exactly which minute to toggle without re-deriving it from a journey's own (possibly-null) first row time. `buildMergedGridTable` (`merged-grid-table.ts`) gained an optional 3rd `onToggleExclude` callback parameter — omitted entirely by the read-only viewer (stops-layer.ts, T29), so that caller is completely unaffected; the editable side panel passes a callback that toggles the exact same `currentExcludedMinutes` set the flat chip list already uses (same mechanism, not a second one), guarded to no-op on a sibling family member's own column (only the route actually being edited is toggleable from here). Button label flips Hide/Unhide based on the column's own already-computed `excluded` flag. `tsc --noEmit` clean (caught 4 existing test fixtures in `route-timetable-grid.verify.mts` missing the new required field, fixed), full TS suite green, packaged. **Not yet checked by the user.**
| T58 | Combining variations, algorithm only (2026-09-28) — Q13's answer (segment-list, reusing siblings) implemented as a pure, tested module, `src/renderer/route-combine-variations.mts`, following the exact same "algorithm and tests before any UI or data model" precedent as `variation-padding.mts`. `findDiversion(trunk, sibling)` locates where a sibling variation's own point list diverges from and rejoins a trunk's, matched by the longest common prefix/suffix of each list's own **stop-only** subsequence (waypoints never anchor a match — no stable identity across separate drawings of the same road) — deliberately occurrence-by-occurrence, not "does this osmId appear anywhere," to handle a route that revisits the same physical stop (the identical class of bug already fixed once in `route-timetable-grid.mts`'s `mergeStopSequences`). `composeVariation(trunk, siblings)` splices one or more siblings' own diversions onto the trunk at their own real split points, in trunk order; two diversions sharing only their own boundary stop (one's rejoin is the next one's split — the ordinary case, e.g. the worked example's 1A rejoining at stop 5 while 1B splits away again at that same stop) compose cleanly, but two diversions genuinely overlapping throws rather than producing a garbled result — **a real bug caught and fixed while writing the tests, not left in**: the first version's overlap check used `<=` instead of `<` and would have wrongly rejected that exact ordinary "touching" case, caught by hand-tracing the worked example against the code before trusting the test to pass. 6 tests in `route-combine-variations.verify.mts`, including the full two-sibling worked example (result matches the user's own description exactly) and a dedicated repeated-stop disambiguation case. `tsc --noEmit` clean, full TS suite green, packaged (though nothing in the UI calls this yet). The padding model was deliberately NOT extended to reason about a composed variation's own internal split points, per Q13's own answer (outer-terminus-only for now). **Update 2026-09-28 — UI wired in.** Confirmed by reading the code directly (not assumed): route-draw.ts's existing "Diverge from here"/"Rejoin at" tools already support multiple diverge/rejoin cycles in one editing session with zero code changes needed — any point in the draft (including one added via a previous "Rejoin at") can be re-armed and diverged from again, and `divergeButton` has no gating that would prevent this. So the "split in 2 different places" half of the original request was **already buildable**, and the only real gap was "reuse a sibling's own diversion instead of redrawing it." Added a new "Build from existing variations" section to the variation-editing panel (shown only when the parent has existing sibling variations): a checkbox per sibling plus an Apply button that calls `composeVariation` **once** with every checked sibling and replaces the current draft outright with the result — a one-shot action rather than threading the algorithm through the incremental diverge/rejoin flow, which avoids the much harder problem of matching an already-in-progress draft's own position back into the parent's own index space. The existing manual tools still work normally on the composed result afterward for further tweaks. Errors (an overlap between two checked siblings, or a checked sibling sharing no real diversion with the parent) are surfaced as plain status text, not silently swallowed. `tsc --noEmit` clean, full TS suite green, packaged. **Live UI verification not completed** — the packaged app's Routes panel wasn't locatable via CDP in the time available (its own "Routes"/"+ New route" header text didn't appear in `document.body.innerText` even after the router loaded; not investigated further, unclear whether that's a real rendering gap or a timing/selector issue) — falls back on the same confidence basis as the algorithm itself: clean compilation, and the new DOM code closely mirrors the pre-existing "Diverge from here"/"Rejoin at" code in the same file, which is already known to work. **Ask the user to try this directly** — needs a parent route with at least one real sibling variation (398/398A in the current save has exactly one; a second variation would let the full two-sibling worked example be tried for real) | Claude Code | Algorithm and UI both done, live-unverified |
| T57 | Day-type schema extension for T55 item (2) and the pre-existing day-of-week sub-pattern gap (2026-09-28) — Q14's answer implemented. `route_timetables.day_type` (a fixed `CHECK (day_type IN ('monday_friday','saturday','sunday'))`) replaced with `weekday_mask INTEGER` (bit 0 = Monday … bit 6 = Sunday, any combination) + `term_facet TEXT CHECK (IN ('any','term_time','holiday'))`, `electron/db.mts`, schema v19→v20 (table rebuild, same pattern as v17→v18's direction column — old day_type values map straight across to the equivalent mask, term_facet 'any'). **Zero renderer changes needed** — the TS-facing `DayType` type stays exactly `"monday_friday" \| "saturday" \| "sunday"`, translated at the db.mts boundary by new `dayTypeToMaskAndFacet`/`maskAndFacetToDayType` helpers, so every one of the 10 files using `DayType`/`DAY_TYPES` today keeps working completely unchanged. New migration test in `electron/db.verify.mts` (a hand-built v19-schema file, migrated, all 3 rows' real day types and other fields verified preserved) plus the existing route-timetable tests now indirectly exercise the new translation layer too. `tsc --noEmit` clean, full TS suite green (including the new test), packaged. **What this does NOT do**: no UI lets a player actually create a weekday-mask/term-facet combination beyond the original 3 presets yet (Tuesdays/Thursdays-only, Fridays-differ, school-day splits) — the schema is now capable, the picker is a separate later increment (T58 covers a different piece, combining variations; the day-type picker itself isn't scheduled yet) | Claude Code | Done |
| T56 | Stop facing direction (2026-09-28) — user flagged a real gap while T55 was in progress: "stop groups work well but each stop needs to know the direction it faces, otherwise if [a route change] uses a better stop it might be on the wrong side of the road." New `Router::stop_facing_bearing(lon, lat)` (game-wasm) derives any stop's compass-bearing facing direction on demand from its own real position — no pipeline rebuild or stored field needed, works identically for a real OSM stop and a player-placed one, reusing the exact side-determination `place_stop` already does at placement time (oneway roads have one fixed direction; two-way roads read it off which side of the road the stop's own position already sits on). Rust: 3 new tests, 20/20 total pass. Shown as a "Faces [N/NE/E/…]" line in a stop's own popup and per-member in a group's popup's new "Members" list (`src/renderer/stops-layer.ts`) — DESIGN.md §4. Informational only for now, same "store/surface now, wire up later" precedent as Connection stop/Long stop — no group-aware route-drawing step or automated group-member swap exists yet to actually validate against. `tsc --noEmit` clean, full TS suite green, WASM rebuilt, packaged. **Not yet live-verified or checked by the user** — away from their computer this session | Claude Code | Done, pending user check |
| T55-map-boundary | Map boundary expansion (UK-EXPANSION.md §1), queued by the user specifically because it's slow (2026-09-28). Downloaded both new Geofabrik extracts (`pipeline-data/ireland-and-northern-ireland-latest.osm.pbf`, 414MB; `pipeline-data/isle-of-man-latest.osm.pbf`, 6MB) — both verified against their real Content-Length. Built a real Northern Ireland boundary polygon (`rust/pipeline/data/northern-ireland-boundary.poly`, 405 points) from OSM's own NI admin relation (id 156393) via Nominatim's polygon_geojson, simplified from its real 18,378-point coastline down to ~300m tolerance (Ramer-Douglas-Peucker) since Geofabrik doesn't publish an NI-only sub-region and the combined Ireland+NI extract needs the Republic of Ireland clipped out — verified against 6 reference towns including tight near-border cases (Newry inside, Dundalk/Letterkenny just across the border outside). Refactored `rust/pipeline` (`main.rs`, `road_graph.rs`, `boundary.rs`) to support multiple source files merged into one combined dataset: `boundary::point_in_boundary` now treats an empty rings slice as "no restriction" (for GB unclipped and the self-contained IoM file); added `NodeCoords`/`NodePassResult`/`ScanResult`/`WayStats::merge` (plain concatenation is correct since real OSM ids are globally unique across separate regional extracts — verified, not assumed); new CLI flags `--full-uk` (drops GB's old Scotland-only clip), `--ni <path>`, `--iom <path>`, `--out-dir <path>`, all optional so the original single-file invocation is completely unchanged when none are passed. Rust: 56/56 pipeline tests pass, including 3 new boundary tests. **Deliberately did NOT overwrite the live `pipeline-data/*.bin` files the packaged game actually reads** — a full UK+NI+IoM graph is a much bigger, genuinely hard-to-reverse change (data volume, load time, memory) that deserves the user's own sign-off before going live, especially since they can't test anything this session. Instead ran a real, full verification build via `--out-dir pipeline-data-uk-expansion-verify` to prove the new code actually works end to end against the real downloaded files, not just unit tests — kicked off as a background task since it's processing ~2.6GB of real OSM data (the unclipped GB file alone is 2.17GB, several times the node/way count the current Scotland-only build handles). **Update: the verification run was killed by the system (not a bug in the code) — the host ran critically low on memory while holding all of GB's 232M nodes + 5.2M ways plus NI's 10M nodes + 269K ways in memory at once, before ever reaching Isle of Man or the final graph-build/merge/save step.** What IS confirmed working, from real output before the kill: GB's pass 1/2 completed correctly (232,464,957 nodes, 5,248,848 ways, 37,762 restrictions — the whole unclipped file, no boundary filtering applied, as intended); NI's pass 1/2 completed correctly too, and **critically, the new NI boundary correctly filtered the combined Ireland+NI file down to just NI's own ~10.3M nodes** (not the whole island) — direct evidence the clip logic works on real data, not just the 6 reference towns in the unit test. Never reached Isle of Man or graph_build/merge, so **the merge/save code path and the final combined road_graph.bin are still unverified**. This points at a real architectural limit, not a one-off: the pipeline currently holds every source's entire node/way dataset in memory simultaneously before building anything, which the original Scotland-only clip never stressed — a genuinely bigger undertaking (streaming/chunking, or building+discarding per-source graphs before merging, rather than merging raw pass-1/2 data) would be needed to run this reliably, not attempted here. **Do not re-run the verification build without asking first** — the memory pressure that killed it may still apply, and CLAUDE Code's own tooling explicitly said not to restart it unprompted. **Update (2026-09-28): the Republic of Ireland is now included too, not clipped out** — direct instruction: "it will be a bit weird having it there but unusable," since Northern Ireland's road network stopping dead at the border with a blank landmass next to it would look broken. `--ni <path>` renamed to `--ireland <path>`, now passes the combined Ireland+NI extract through completely unclipped (empty rings), same as GB/IoM. The NI-only boundary work (polygon + `northern_ireland_boundary_path()` + its test) was removed rather than left unused (CLAUDE.md: don't design for hypothetical future requirements) — if a real need to separate Ireland/NI comes up later (a nation-specific fare cap, currency — Ireland uses the Euro, not GBP), the exact rebuild steps are: look up Northern Ireland's OSM admin relation (id 156393) via `https://nominatim.openstreetmap.org/lookup?osm_ids=R156393&format=json&polygon_geojson=1`, simplify the returned ring with Ramer-Douglas-Peucker (~0.003° tolerance got 18,378 points down to 405 and passed 6 real reference-town checks including tight near-border cases), write it as an Osmosis .poly file. Pipeline: 55/55 tests pass (56 minus the now-removed NI-specific test). **Update (2026-09-28): the real architectural fix is done.** Root cause: `main.rs` merged every source's own *raw* pass-1/2 output (node coordinates, ways) before ever calling `build_graph` once — holding GB's ~232M nodes and Ireland/NI's ~10M nodes in memory simultaneously. Restructured to build each source's own complete `RoadGraph` immediately within the loop (freeing that source's raw data before the next source's own pass 1 even starts), then merge the much smaller *built graphs* — new `graph_build::merge_road_graphs(into, other)`, which renumbers `other`'s own node/edge indices by `into`'s pre-merge counts (`Edge::from`/`to`, `Restriction::via`/`from_edge`/`to_edge`) rather than assuming they can just be concatenated — real OSM ids being globally unique means no *id* collision is possible, but the *local array indices* `RoadGraph` actually stores absolutely would collide without this renumbering. New dedicated test (`merge_road_graphs_renumbers_the_second_graph_s_own_indices`) merges two independently-built synthetic graphs and verifies the second one's own restriction still resolves to its own nodes/edges by real osm/way id at their new, offset positions — not just "doesn't crash." The now-unused `NodeCoords`/`NodePassResult`/`ScanResult::merge` methods (the old, memory-heavy approach) were deleted rather than left as dead code alongside the new approach. Pipeline: 56/56 tests pass. Re-running the real full verification build now that the fix is in — this run got well past the exact point that crashed before: all 3 sources' graphs built, merged, and saved successfully (`road_graph.bin` 865.2MB, 10,362,689 junction nodes, 11,563,997 edges, 1,039,448 km total length; `stops.bin`/`landuse.bin`/`venues.bin` all saved too) — **real, concrete proof the memory fix works**, not just a plausible theory. **A second, separate real problem then surfaced**: railway-station road-avoidance (`road_avoidance::keep_off_roads`) does a full unindexed scan of every edge per station — its own doc comment even said "fine for a few hundred station points against a ~1.4M-edge graph," an assumption now false at whole-UK scale (11.5M edges, thousands of stations); genuinely slow (potentially an hour+), not crashed. **Fixed separately** while the (now-superseded-by-events but still-running-on-old-code) verification continued: added `road_avoidance::build_edge_grid`, a spatial index mirroring game-wasm's own already-proven `edge_grid`/`nearest_node_grid_key` pattern (200m cells, built once, reused for every station — checks only the point's own cell + 8 neighbours instead of all 11.5M edges). New test proves a road sitting just across a grid cell boundary is still found (the real risk with any cell-based index). Pipeline: 58/58 tests pass. Killed the slow pre-fix run (which had gone 30+ minutes on the road-avoidance step with no sign of finishing) rather than wait indefinitely on a run already known to be superseded, and restarted with the fixed release build.

**FULL SUCCESS (2026-09-28).** The re-run completed end to end — every output file saved: `road_graph.bin` (865.2MB, 10,362,689 junction nodes, 11,563,997 edges, 1,039,448 km total length), `stops.bin` (298,149 stops, 12.0MB), `landuse.bin` (605,213 zones + 427,921 POIs, 26.0MB), `venues.bin` (2,192 venues, 0.1MB), **`railway.bin`** (3,535 stations + 82 halts + 283 subway stations + 9,064 platforms + 864 tram stops, 1.3MB) and **`settlements.bin`** (84 cities, 1,856 towns, 16,450 villages, 21,395 hamlets, 1.2MB) — the last two were never reached before either crash/stall. The road-avoidance speed fix is validated for real, not just by its own unit tests: processing all 3,900 railway stations against the 11.5M-edge whole-UK graph, plus settlements, took under 5 minutes total, down from 30+ minutes with no sign of finishing on the unindexed version. Output still sits in `pipeline-data-uk-expansion-verify/`, **not the live `pipeline-data/` the packaged game actually reads.**

**Deliberately NOT swapped into live data — needs the user's own sign-off, not assumed.** Three real open items before this could actually ship: (1) the game's own PMTiles vector tiles (the visual basemap) are still Scotland-only — CLAUDE.md's own data pipeline section covers this as a separate Planetiler/OpenMapTiles build step, not touched this session; without rebuilding them, the road network would work but the map underneath would still show nothing (or the old clipped extent) for Ireland/Isle of Man/the rest of GB. (2) The actual packaged game's own runtime performance against an 865MB road graph (versus whatever the current Scotland-only one is) is untested — nearest-node lookups, routing, WASM load time, memory footprint in Electron itself are all real unknowns at this new scale, separate from the pipeline tool's own performance. (3) The download-on-first-run flow (CLAUDE.md: "Map data is not bundled... downloaded on first run") would need the new, much bigger data artifacts actually published somewhere before a real player could ever get them.

**Update (2026-10-02): user explicitly authorised swapping the live map in** ("Can you expand the map to what is should be please"). Swapped the whole-UK/Ireland/IoM `pipeline-data-uk-expansion-verify/*.bin` into both live `pipeline-data/` and the packaged app's own `release/win-unpacked/resources/pipeline-data/` copy, updated `PLAYABLE_BOUNDS` in `src/renderer/main.ts`. **Immediately hit a real, severe bug**, reported directly by the user: "It is freezing just after start up and not recovering." Measured precisely rather than guessed (temporary timestamped logging in both Rust (`Router::new()`) and the renderer boot chain): `Router::new()` took **~220 seconds** against the whole-UK graph — decode ~85s, adjacency build ~109s, edge_grid build ~25s — with zero UI feedback. Root cause, confirmed directly: wasm32's default allocator handling millions of small, individually-grown heap allocations (one `Vec<(i32,i32)>` per edge's geometry in `Edge`, one `Vec<Hop>` per node in `Router::adjacency`) far worse than a native allocator — the identical `decode()` had already been proven fast natively, ruling out corrupted data or an infinite loop.

**Fix: flattened both into CSR (compressed sparse row) structures.** `Edge.geometry: Vec<(i32,i32)>` → `RoadGraph.geometry_points: Vec<(i32,i32)>` (one shared buffer across every edge) plus `Edge.geometry_start`/`geometry_len` per edge; `Router.adjacency: Vec<Vec<Hop>>` → one flat `Vec<Hop>` plus `adjacency_offsets: Vec<u32>` (built in two passes: count hops per node, prefix-sum to offsets, then fill via a per-node write-cursor). Both regenerated whole-UK and Scotland-only `road_graph.bin` from raw `.osm.pbf` sources in the new, incompatible-with-old (bincode's positional encoding has no schema versioning) format — node/edge counts matched the pre-refactor figures exactly in both cases (10,362,689/11,563,997 whole-UK; 1,244,487/1,419,099 Scotland-only), confirming the refactor preserved all graph-building logic. New tests added for exactly the failure mode this kind of index/offset refactor risks: `merge_road_graphs_shifts_the_second_graph_s_own_geometry_offsets`, `node_adjacency_gives_each_node_exactly_its_own_hops_no_bleed_into_neighbours`. Pipeline 58/58, game-wasm 21/21, game-data 1/1 — all green.

**Also added a loading screen** (plain HTML/CSS in `index.html`, visible from the very first frame rather than JS-mounted, so a genuine multi-minute load is never indistinguishable from a frozen blank screen) — the user's own suggestion, asked for directly ("is it worth adding a loading screen?").

**That loading screen then exposed a second, genuinely separate bug**: after the CSR fix, the overlay would sometimes never get removed even once the router itself had loaded (confirmed instant: 25ms for Scotland-only). Investigated directly rather than guessed — ruled out CDP-attachment artifacts and background-process resource contention by reproducing with a completely plain launch (no debugger, no `--remote-debugging-port`) and capturing main-process-side diagnostic output over IPC instead of console/CDP. Root cause: the map's style (fetched from the local pmtiles server) is not guaranteed loaded by the time the boot chain in `main.ts` starts calling `drawRailwayPlatforms`/`mountRoutePanel`/etc. — on a cold launch it usually isn't yet, so `map.addSource` threw `Error: Style is not done loading.`, and with no `.catch()` anywhere in the `init().then(async () => {...})` chain, that silently killed the rest of boot with the overlay stuck up forever. On a reload the style was usually already cached/loaded, which is why this only ever showed up on a genuine fresh start — explaining the apparent non-determinism. **Fixed once, at the top of the chain**, rather than patching every individual draw/mount function: added `waitForStyleLoad(map)`, awaited before anything else runs. Reproduced the hang 3/3 times before the fix and 0/4 after (plus one direct plain-launch confirmation), each via a genuinely fresh process, not a reused/stale one.

**Both fixes verified end-to-end against the real whole-UK data, packaged, fresh launch, no debugger attached**: router loads in **~26.5 seconds** (down from ~220s, an ~8x improvement) with correct node/edge counts, full boot (including dealers/depots/route panel/vehicle sim) completes in **~29.7 seconds** with the loading spinner visible throughout instead of a frozen screen. All 76 seeded dealers present and reachable, including the 59 south of Carlisle that were the original motivation for this expansion (previously outside the Scotland-only `PLAYABLE_BOUNDS`). `tsc --noEmit` clean | Claude Code | **Live in the game.** Whole-UK/Ireland/IoM road graph, loading screen and both the freeze and the overlay-stall bugs it exposed are all shipped and verified. PMTiles basemap tiles are still Scotland-only (item (1) above, unchanged) and the download-on-first-run flow (item (3)) remains unbuilt — both still open. |

**Update (2026-10-02): swapped into the live game — the user gave the explicit go-ahead ("Can you expand the map to what is should be please").** Backed up the current Scotland-only `pipeline-data/*.bin` to `.backup-scotland-only-pipeline-data/` (gitignored) first, in case of a problem. Measured the whole-UK graph's own real extent directly rather than reusing a remembered figure (a throwaway Rust example, `decode`'d the real `road_graph.bin`, deleted after use): lon -10.5593 to 1.7622, lat 49.8886 to 60.8350 — matches the already-recorded node/edge counts exactly (10,362,689 / 11,563,997), confirming it's the same proven September dataset. Copied the whole-UK `*.bin` files into both `pipeline-data/` (dev) and `release/win-unpacked/resources/pipeline-data/` (the packaged app's own separate copy — the same gotcha T55-map-boundary-perf already hit once, not repeated this time). Updated `PLAYABLE_BOUNDS` in `main.ts` from the Scotland-only figure to the real measured whole-UK extent (same 0.15° padding convention). `tsc --noEmit` clean, built, packaged. **Live verification hit the already-documented CDP websocket-hang flakiness** (`feedback_cdp_websocket_hang_packaged_build.md`) — `/json/version` stayed responsive but `connectOverCDP` itself timed out repeatedly across two fresh process launches and a long wait, so no live in-browser screenshot was obtained this round. Fell back to non-visual verification instead of continuing to fight it: the packaged app's own stdout showed a clean "Save opened" with no errors, and its real process memory footprint (~3.27GB) closely matches the exact figure T55-map-boundary-perf already measured live for this same dataset (~3.2GB) — strong indirect confirmation the graph loaded correctly, on top of the Rust-level decode proof and the file-level size checks. A same-session attempt to screen-capture the app window directly (bypassing CDP) instead captured unrelated on-screen content since it grabbed a fixed screen region rather than the actual app window — immediately deleted without being examined further or shown to the user; not retried. **What's still NOT done, flagged clearly rather than implied finished**: the PMTiles visual basemap is still Scotland-only (a separate Planetiler/OpenMapTiles build step, per CLAUDE.md's own data pipeline section, not attempted this round) — routing, stops, land use and now dealers all work across the whole UK+Ireland+IoM, but the map background itself will likely still show blank/missing tiles outside Scotland until that separate rebuild happens. **Ask the user to check the game directly** (CDP wasn't cooperative this round) and say whether they'd like the basemap tackled next, given it's a materially bigger, untested undertaking (Planetiler availability on this machine is unconfirmed).

**Update (2026-10-04): basemap rebuilt for the whole UK+Ireland+IoM and swapped live.** Planetiler's CLI accepts only one `--osm_path`, so the three regional extracts were first merged with `osmium merge` (conda-forge `osmium-tool` 1.19.1, installed into the existing miniconda env with `--solver=classic --override-channels`; output verified `Objects ordered (by type and id): yes`, which Planetiler requires). Planetiler was then run with a new rectangular tile boundary `rust/pipeline/data/uk-ireland-iom-tile-boundary.poly` (lon -11.2…2.4, lat 49.4…61.3). **Gotcha caught in the log, not assumed**: without an explicit `--maxzoom`, Planetiler silently lowered the default max zoom to 14 for this larger area (the original Scotland build was 16), so the first output had less close-zoom detail; rebuilt with `--maxzoom=16 --render_maxzoom=16` to match. Final `tiles.pmtiles`: 5.97GB, z0–16, bounds exactly as the poly, build ~6 min. Swapped into `pipeline-data/tiles.pmtiles` and the packaged `resources/pipeline-data/`; the Scotland-only file is kept as `pipeline-data/tiles-scotland-only-backup.pmtiles` (1.1GB) as a fallback. Repackaged; verified by a page-targeted screenshot: detail renders across Northern Ireland, Isle of Man, Ireland, northern England and the Scottish islands, attribution visible. Not yet checked by the user directly. Startup `AccessDeniedException` on `data\tmp` during Planetiler's own cleanup is non-fatal (build completed normally).

**Update (2026-10-02): the user reported "freezing just after start up and not recovering" — real bug found, root-caused precisely, and the whole-UK data REVERTED back out of the live game pending a real fix.** This explains the CDP connection failures from the update above too — the main thread genuinely was blocked, not just flaky tooling. Investigated properly rather than re-guessing: added temporary checkpoint logging (a renderer-side `console.log` per boot stage, forwarded to the main process's own stdout via a temporary `webContents.on("console-message")` handler, since CDP itself won't connect while the thread is blocked) and Rust-side timing (a minimal `console.log` extern binding + `js_sys::Date::now()`, since `web-sys` wasn't a dependency). **Exact findings, measured not guessed**: the ENTIRE ~224-second freeze is inside `Router::new()` — `decode()` (bincode-deserializing the 865MB file into Rust structs) takes **~85 seconds**, building `adjacency` (a simple per-edge loop pushing into 10.3 million separate per-node `Vec<Hop>`s) takes **~109 seconds**, and building `edge_grid` takes **~25 seconds**; everything else in the app's own boot sequence (drawStops, dealer seeding, etc.) completes in under 5 seconds total once the router is ready. Ruled out data corruption directly rather than assuming it: scanned every edge for its own real coordinate span before trusting the data — the longest real edge spans ~17.5km (a plausible real road/ferry link), nothing pathological. Ruled out an infinite loop: the same native-Rust `decode()` (via the `measure_graph_bounds` throwaway example used to measure the bounds above) was already proven fast on this exact file. **Root cause: a genuine WASM-vs-native performance gap**, not a logic bug — decoding/building structures with millions of individual small heap allocations (one `Vec` per edge's geometry, one `Vec` per node's adjacency list — tens of millions of separate small allocations at whole-UK scale) hits wasm32's default allocator far harder than it hits a native allocator, and this specific pattern was never exercised at this scale before (Scotland-only is ~1.4M edges; whole-UK is ~11.5M, a 7.5-8x jump that produced a ~every-which-way-worse-than-linear real-world slowdown, not just 7.5x). **Reverted the live swap the same session, immediately** rather than leave the user with a broken app: restored the Scotland-only `pipeline-data/*.bin` from the `.backup-scotland-only-pipeline-data/` backup made before the swap (both the dev and packaged copies), reverted `PLAYABLE_BOUNDS` in `main.ts` back to the Scotland-only figure, removed every temporary diagnostic (the console-message forwarder, the TS/Rust checkpoint logging) now that the cause is known, rebuilt Rust (20/20 tests), rebuilt WASM, `tsc --noEmit` clean, full TS suite green, built, packaged. **Live-verified the revert**: router now loads in ~82ms (matching the original Scotland-only figure), correct node/edge counts, and — importantly — confirmed the real dealers (all 76, seeded earlier this session) and the real Portree depot both survived the whole swap-and-revert round trip untouched. A side investigation during this check found Edinburgh's depot missing from the save; raised it directly with the user rather than assuming — **the user confirmed this was their own deliberate deletion of a temporary test depot, unrelated to any of this session's work**, not data loss. **What's still needed before the whole-UK map can ship**: a real architectural fix to cut the allocation count — most likely flattening `adjacency` (currently `Vec<Vec<Hop>>`, one heap allocation per node) and `Edge.geometry` (currently `Vec<(i32,i32)>`, one heap allocation per edge) into CSR-style flat buffers with offset arrays, which would need changes on both the pipeline's encode side and game-wasm's decode/routing side, plus careful retesting. **Not attempted yet — ask the user whether/when they want this tackled**, given it's a genuinely substantial piece of engineering, not a quick patch | Claude Code | **Reverted to Scotland-only, verified working. Whole-UK map needs a real allocator/data-structure fix before it can ship — not yet scheduled.** |
| T55 | A batch of six new design decisions given by the user (2026-09-28), explicitly framed as "to be added onto the big update" (UK-EXPANSION.md) — recorded in the relevant docs, **nothing implemented yet**. (1) Combining variations: a route can have more than one independent split/rejoin section, and each split point can diverge from either the trunk or any other variation's own path — two related capabilities, both confirmed: composing a new variation from existing siblings' own already-drawn diversions (worked example clarified via a follow-up question — route 1C reuses 1A's diversion at one split point and 1B's diversion at a later one), and freely drawing a genuinely new split at each of at least two points, each branching off the main route or another variation (a later mid-turn follow-up: "I should also be able to make route variations that split from the main route or other variations in 2 different places") — DESIGN.md §6 "Variations." Not Skye-specific; interacts with the variation-padding model (CLAUDE.md hard part) since padding currently only reasons about one outer terminus. (2) School-day/non-school-day Portree High↔Portree Square stop substitution — UK-EXPANSION.md §13. (3) Portree Square stance rules: Stance 1 long-distance only, Stances 2/3 local (prefer 2, queue of 2 with ordered departure), Stance 3 also tour buses (≤2 scheduled across 2+3 combined, 10 min max, breaks at Bayfield car park instead — the one rule scoped to Portree as a whole rather than Portree Square specifically) — UK-EXPANSION.md §13, cross-referenced from DESIGN.md §5 "Stands" as the first real case needing per-stance override rules, not just per-station ones. (4) General "long stop" stop capacity (configurable up to 3, no ordered-departure queueing, explicitly separate from (3)) — DESIGN.md §4, not Skye-specific. **Built 2026-09-28**: a `long_stop_capacity` field on the existing generic `osm_overrides` table (entity_type "stop"), exact same pattern as the already-shipped "Connection stop" flag — no schema migration needed. UI: checkbox + capacity dropdown (2/3) in the stop popup, `src/renderer/stops-layer.ts`. `tsc --noEmit` clean. Capacity storage only, same "store the flag now, wire up the behaviour once the underlying mechanism exists" precedent Connection stop already uses — there's no multi-vehicle stop-contention simulation yet (Phase 9 "hard part"). Packaged along with the rest of this session's work (see T56) — **not yet checked by the user**, away from their computer this session. (5) Portree bypass, not yet in OSM, 57A/57C to use it once built — **confirmed by the user as a one-off, won't be needed again**, so this is NOT to become a reusable "player-drawn road" feature (no `player_roads` table, no in-game drawing tool); build the smallest thing that gets this one road segment into the pipeline data (a manual one-off addition to the road graph build), then drop it once the bypass lands in a real OSM extract — UK-EXPANSION.md §13. Buildability, corrected after actually checking the schema (2026-09-28) — the earlier claim that (2) needed no new engine work was wrong, checked and fixed rather than left standing (CLAUDE.md "verify before fixing"): `route_timetables.day_type` is a hard `CHECK (day_type IN ('monday_friday', 'saturday', 'sunday'))` in `electron/db.mts` — there is no term-time/school-day dimension in the schema at all yet, and UK-EXPANSION.md's own T42 triage already separately flagged this exact gap ("the timetable system needs genuine day-of-week-specific sub-patterns... not just the existing Mon-Fri/Sat/Sun granularity"). So (2) is blocked on a real, foundational, hard-to-reverse schema decision (how term-time should be modelled — a new day_type value, an orthogonal flag, per-route or per-journey) that shouldn't be guessed at unilaterally — **question queued for the user**, not attempted. (4) was self-contained and is done. (1) is a real Phase 2 engine extension, buildable in principle but needs the padding-model design work done first, with tests, per CLAUDE.md's own guidance on padding — also large/foundational enough to check in on before committing to a specific data model, so **not attempted this pass either**, question queued. (5) needs the bypass's real path — attempting to research it independently (public info on the real Skye/Portree bypass project) since the user can't provide coordinates while away from their computer; if that doesn't yield a usable path, it queues too. (3) needs new per-stance engine capability, neither built nor scoped — blocked, no further action possible without the stand-contention simulation existing first | Claude Code | Pending |
| T54 | User feedback on T53 after trying it for real: "That doesnt work, the entrance and exit should be snapped onto the junction and have the flat part along the road they are leaving." Root-caused by re-reading T53's bearing computation rather than re-guessing: the bulge bearing was simply the reverse of the depot access road's own arrival bearing into the junction — mathematically only correct when the main road happens to meet the access road at exactly 90°. Any real junction at another angle produced a flat edge that didn't lie along the real road at all. Rewrote `snap_entrance_to_junction`'s junction case to find the real main road at the junction (any edge touching it other than the one the access road itself arrived via, tracked by extending `walk_to_junction_or_dead_end`'s return type to also carry the arrival edge index), compute that road's own real bearing, then pick whichever of its two perpendiculars is angularly closer to "back toward the depot" — genuinely following the real road's own angle instead of assuming a right angle. New dedicated Rust test using an oblique ~60° junction (all three prior tests happened to use perfect right angles, so none of them would have caught this), independently computing the expected bearing via inline trig in the test itself and asserting both that the result matches it and that it differs meaningfully from the old right-angle answer, to guarantee the test actually exercises the fix. Rust: 17/17 pass, including the three pre-existing `snap_entrance_to_junction` tests re-verified by hand to be unaffected (their fixtures happen to be perfect right angles, so the refactor doesn't change their expected output). WASM rebuilt, `tsc --noEmit` clean, full TS test suite green (all 8 `.verify.mts` files), `npm run build` and `npm run package` both clean. **Not independently live-verified against a real non-right-angle junction in the running app** — CDP tooling (both Playwright's `connectOverCDP` and a raw CDP websocket) hung against the freshly packaged build's browser target for reasons not root-caused (the HTTP `/json` endpoint answered fine throughout; only the websocket itself never returned a reply to any command sent), so no screenshot confirms the fix visually in-game. The fix rests on the Rust unit test's independently-computed proof plus the unchanged rendering pipeline (T53's symbol/bearing wiring was not touched by this change, only the bearing *value* Rust computes). Whether the "snapped onto the junction" half of the complaint (position, not just orientation) still has a separate bug was also not directly diagnosed against the user's own real depot — needs the user's own check | Claude Code | Done, pending user confirmation |
| T53 | The fourth item from the T47/T48 live-check report: "they should also be semi-circle on a junction with the flat bit against the road they are leaving/joining." Confirmed the exact shape with the user first (an ASCII preview: "a half-circle bulging away from the road, flat edge lying along the road") rather than guessing. `Router::snap_entrance_to_junction` now returns `[lon, lat, bearing]` instead of just `[lon, lat]` — a new `bearing_degrees` helper computes the compass direction (0 = north) from the node just before the real junction (tracked through the existing multi-hop walk) back to the junction itself, giving the direction the marker should bulge: back along the depot's own access road, away from the road it joins. The fallback case (no real junction to anchor against) bulges perpendicular to whichever road was actually clicked, picking one side arbitrarily (no depot-direction signal available there, same "pick one side deterministically" precedent `place_stop`'s own kerb logic already uses). New `bearing REAL NOT NULL DEFAULT 0` column on `depot_entrances` (schema v18→v19, plain ADD COLUMN — no rebuild needed since no constraint changed), threaded through `createDepot`/`addDepotEntrance`/the IPC bridge/both draft-entrance click handlers. Rendering switched from a plain MapLibre `circle` layer to a `symbol` layer using a small canvas-drawn SDF icon (a solid half-disk, flat edge at the bottom of its own bounding box so the default "anchor: center" lands exactly on the flat edge's own midpoint) with `icon-rotate: ["get", "bearing"]` and `icon-rotation-alignment: "map"` so the bulge points along the real compass bearing regardless of how the player has the map oriented; `icon-color` still recolors it per entry/exit/both exactly as the circle did. Rust: 16/16 pass, including corrected bearing assertions on all three existing `snap_entrance_to_junction` tests (a real bug caught while writing them: the bulge direction was initially computed backwards — pointing along the road's arrival direction instead of the reverse, back toward the depot — fixed before it ever shipped). `tsc --noEmit` clean, full test suite green, v18→v19 migration tested against a real hand-built old-schema file the same way v17→v18 was. Live-verified end to end: created a real depot with four entrances at bearings 0°/90°/180°/270°, reloaded the app so the renderer's own in-memory depot cache picked up the API-created data (a real gap in the test method, not the feature — directly creating via the API bypasses the same client-side cache the UI's own placement flow keeps updated), then screenshotted at close zoom and visually confirmed all four markers render as genuine half-circles (not plain circles) rotated correctly to their own bearings, with mode colours intact | Claude Code | Done |
| T52 | Three follow-ups from checking T47/T48 live: (1) "it should show both timetables one above the other with the current one being edited on top" — a terminus-loop route's side-panel grid preview now stacks BOTH legs (outbound and inbound), the currently-edited one first with a "(being edited)" heading, instead of only showing whichever direction the dropdown happened to select; the currently-edited leg still uses this route's own live in-progress fields, the other leg reads its own last-saved data, same precedence the rest of this machinery already uses. A non-loop route is completely unaffected (only ever had the one leg to begin with). (2) `snap_entrance_to_junction` (T47) wasn't actually snapping to a junction for the user's real depot — root-caused by re-reading the code: it only checked the CLICKED edge's own two endpoints, so a real OSM depot access road split into more than one edge (a bend digitized as a separate node, common in real data) defeated it, since neither of the immediate endpoints was the real fork. Rewrote it to walk outward from each endpoint through a chain of plain pass-through nodes (degree exactly 2 — the road just continues, no real fork) until reaching either a genuine dead end (degree 1) or a real junction (degree >= 3, an actual third road branching off), with a 500-hop safety cap. Also corrected the original test fixture, which never actually had a real branching junction in it (a straight A-B-C-D line has no forks at all, so the "junction" it was snapping to wasn't a real one) — added third edges at B and C to make them genuine forks, and a new dedicated multi-hop test for the exact bug (a depot road split into two edges via an intermediate bend). Rust: 16/16 pass. (3) Depot entrances could be removed from an existing depot but never added to one — only the original placement draft had an "add entrance" affordance. New "+ Add entrance" button in the depot popup arms the same `snap_entrance_to_junction` click-to-add flow already used for a fresh depot, landing straight in the database via the already-existing (but previously unused from the UI) `window.depots.addEntrance`. `tsc --noEmit` clean, full test suite unaffected. Live-verified: the stacked outbound/inbound layout renders correctly on route 467 (screenshot confirms "INBOUND (BEING EDITED)" on top); the add-entrance backend round-trip (create depot, no entrances, would-be add, delete) was confirmed clean via direct API calls, though the popup-click UI path itself couldn't be automatically clicked through (map pixel-scanning found 112 candidates, none matched the depot's own marker — the same class of test-tooling flakiness noted elsewhere this session, not treated as evidence of a bug given the button code is a direct mirror of the already-tested "Remove" button). The fourth item from the same report — the semi-circle marker shape — is built separately, see T53 below | Claude Code | Done |
| T51 | Third follow-up to the exclude-departures mechanic: "an option to exclude times where a variation leaves at the same time" — the general-purpose version of the original T46 workflow (398A taking over 398's own 0100), instead of finding and clicking each colliding chip by hand. A new "Exclude times a variation also runs" button in the timetable editor (only shown when the route actually has family members) computes every sibling's own real departures for the same leg/day-type (respecting a sibling's own already-saved exclusions — an excluded sibling departure isn't a real clash to defer to), compares against this route's own currently-generated/custom departures, and adds every coinciding minute to this route's own excludedDepartureMinutes in one click — reusing the exact same pure functions (`generateDepartureMinutesForBands`, `applyExcludedDepartures`, `mergeCustomDepartures`) the rest of the exclude/custom-departure machinery already uses, no new pure logic needed. `tsc --noEmit` clean, full existing test suite unaffected (UI-only feature, no new pure-function surface to test). Live-verified on 398/398A (398 every 15 min, 398A every 60 min on the hour): clicking the button excluded exactly the 24 on-the-hour departures 398A also runs, nothing else, with zero console errors — confirmed nothing was persisted (the button, like the other exclude tools, only edits in-memory state until Save is clicked) | Claude Code | Done |
| T50 | Two follow-ups to the exclude-departures mechanic (T46): (1) "an option to show excluded services" — previously an excluded departure just vanished from the grid entirely; `buildRouteTimetableGrid` gained an `includeExcluded` option and a parallel `excluded: boolean[]` array (one per journey, carried through `sliceGridToPointRange` and into `MergedGridColumn.excluded`), and both the side-panel and full-screen grids gained a "Show excluded services" checkbox that, when on, keeps excluded journeys as real columns rendered struck-through and dimmed (merged-grid-table.ts) instead of dropping them. (2) "an option to exclude on an interval" — a new "Exclude on an interval" row (the exact same start/end/interval shape a time band itself already uses) next to the "Generated departures" chips, which computes the pattern via the existing `generateDepartureMinutesForBands` and merges every resulting minute into `excludedDepartureMinutes` in one action instead of clicking each chip individually. New unit tests (`includeExcluded` behaviour and the parallel `excluded` flag) pass alongside the full existing suite; `tsc --noEmit` clean. Live-verified both: toggling "Show excluded services" for 398 produced exactly one new struck-through `0100` cell (398's own excluded departure, distinct from 398A's real one); applying "10:00-12:00 every 30" on route 576 excluded exactly `1000,1030,1100,1130,1200` | Claude Code | Done |
| T49 | Follow-up to T48, caught live by the user right after: "There is no timetable showing for routes that aren't a loop." Took several rounds to actually pin down — the side-panel timetable editor's "Shared stops" merged-grid preview had always been gated on the route actually having family members (`if (family.length <= 1) return`, pre-dating this session), so a standalone route with no variations (most routes) never showed any real timetable-shaped preview at all, just the frequency generator above it — not a regression from T48, but a real, longstanding gap the user hit right as this session's other timetable work made the gap obvious. Confirmed directly with the user (a multiple-choice check, not guessed) that the fix wanted was: show the same real grid preview in this panel for every route, not only ones with variations. Removed the family-size gate from `renderFamilySharedStops`; the merged-grid pipeline (`buildMergedFamilyGrid`/`buildMergedGridTable`) already handles a single-member "family" correctly (verified by an existing unit test: "a single sequence merges to itself"), so no changes needed there — only the heading and the empty-state message needed to read sensibly for a solo route ("Timetable — Monday-Friday..." instead of "Shared stops — ...", and a "no departures yet, set up a band above" hint instead of "no other family member has..."). Live-verified: route 576 (no siblings) now shows its own real stop-by-stop grid with real departure times underneath the generator. Along the way, spent real effort chasing what looked like it might be a data-loss bug from the T48 schema migration — inspected the real save file directly (not a synthetic one) via raw SQL and confirmed the migration was sound and no data had actually been lost; the report turned out to be a UI gap, not a persistence bug, found only by asking the user directly rather than continuing to guess after two earlier guesses missed | Claude Code | Done |
| T48 | A terminus-loop route (DESIGN.md §6: one point list encoding an outbound leg and a return leg) can now have independent outbound/inbound timetable components instead of one shared generator driving the whole loop — user request: "I should also be able to set inbound and outbound times separately as an option, useful if I am running from multiple depots," since two depots each crewing one leg genuinely run two separate operations, not one bus continuing round a shared schedule. Schema: `route_timetables` gained a `direction` column (`'both' \| 'outbound' \| 'inbound'`, default `'both'`) and its UNIQUE constraint widened from `(route_id, day_type)` to `(route_id, day_type, direction)` — SQLite can't alter a UNIQUE constraint in place, so the v17→v18 migration rebuilds the table (rename, recreate, copy, drop), tested against a real hand-built v17 file through the actual `openSave` migration path, not just reasoned about. New pure function `computeOffsetsForDirection` (route-timetable-grid.mts): for `'both'`, a plain passthrough to the existing whole-route `computeOffsets`, unchanged; for `'outbound'`/`'inbound'`, finds that leg's own point range (`routeDirectionRanges`), computes offsets **locally** as if that leg's own first point were point 0 (a fresh journey, not an extension of whatever happened on the other leg), then maps the result back into full-route-length arrays at the leg's own real positions — a timing point on the other leg is simply irrelevant to this leg's own computation, not an error. Falls back to `'both'` for a non-loop route rather than trusting the caller never asks. Six new unit tests cover both legs' independence, the other-leg-timing-point-ignored case, the `'both'` passthrough and the non-loop fallback — all pass, alongside the full existing suite (Rust 15/15 + 54/54 workspace; TypeScript route-timetable, route-timetable-grid, stop-calling-services and db verify scripts all green) and a fresh `tsc --noEmit`. UI: a "Direction" dropdown (Both/Outbound/Inbound) appears in the timetable editor only for a route that's actually a terminus loop; switching it loads/saves that leg's own independent bands, timing points, exclusions and custom departures, with the read side (both the full-screen grid in stops-layer.ts and the side-panel comparison) preferring a leg-specific component over `'both'` where one exists, falling back to `'both'` otherwise. Live-verified end to end on route 467 (a real terminus loop already in the save): set outbound's own start time, saved, switched to inbound (confirmed it showed its own fresh default, not outbound's value), set and saved a different inbound value, switched back to outbound (confirmed its own value survived, not overwritten), confirmed `'both'` stayed untouched throughout — then cleaned up the test-created rows and restored the route's original state exactly. One real verification wrinkle, not a product bug: an early pass of the live-verify script found no inbound row after a save that appeared to succeed — investigated rather than assumed, root-caused to the test script's own dropdown-selection race (a stale `document.querySelectorAll` input match right after a direction switch re-rendered the panel), confirmed by a cleaner, more careful reproduction that the actual save/persist path works correctly | Claude Code | Done |
| T47 | Follow-ups to T46, all from the same pending-checks pass (2026-09-27): (1) depot placement's road-snap (T46) turned out to be the wrong tool — `snap_to_road`'s bus-legal-only search can never find a private/restricted road, exactly what a real depot's own access road usually is (a live user report: couldn't place a depot/entrance on the real Lothian Edinburgh depot between East London Street and Green Street). New `Router::snap_to_any_road` (game-wasm) reuses `place_stop`'s own every-edge search without the kerb offset, wired into both the depot's own site and its entrances. (2) A second, more specific ask, confirmed via an ASCII diagram before building: an entrance/exit should snap to the junction where a depot's own private access road meets the wider road network, not wherever along that access road the click landed. New `Router::snap_entrance_to_junction`: finds the nearest road same as (1), then checks its two endpoint nodes' degree (a routing graph only creates a node at a real junction or dead end, never a plain shape point) — exactly one dead end and one junction snaps to the junction node; two junctions (an ordinary through-road) or two dead ends fall back to the plain nearest point, unaffected. Two new Rust unit tests cover both shapes. Wired into entrances only (not the depot's own site, which stays on `snap_to_any_road`). (3) A route can now exclude one of its own generated departures without touching its time bands — user request: "398A running at 398's own 0100, I only want 398A to run that time without anything complicated." New `excludedDepartureMinutes` field on `RouteTimetable` (schema v15→v16), `applyExcludedDepartures` (route-timetable.mts), a "Generated departures" chip row in the timetable editor (click a time to exclude/restore it), wired through `buildRouteTimetableGrid` so both the full-screen and side-panel merged grids respect it automatically. Live-verified end to end: excluded 398's own 0100, saved, confirmed via the merged grid's own column structure that only 398A's column still shows 0100. (4) A route can now also add one-off custom departures that no band's own interval produces — user request: "an option to put in custom times for departures instead of everything being on an interval." New `customDepartureMinutes` field (schema v16→v17), `mergeCustomDepartures` (deduplicated union with the generated list, sorted), a separate "Custom departures" add/remove row (kept apart from the exclude-chips — a custom entry is deleted outright, not "excluded but remembered"). Live-verified: added 05:47, appeared correctly in the merged grid, removed cleanly. All four items' own unit tests pass (Rust: 15/15 in game-wasm, 54/54 workspace-wide; TypeScript: route-timetable, route-timetable-grid, stop-calling-services and db verify scripts all green), `tsc --noEmit` clean throughout. A real bug caught mid-session by running the actual test suite (not just typecheck): two of `db.mts`'s own SELECT queries (`listRouteTimetablesForRoute`, `listAllRouteTimetables`) hadn't been updated to include `excluded_departure_minutes`, which would have crashed `JSON.parse(undefined)` the moment either was called in the real app — fixed before it ever reached the user | Claude Code | Done |
| T46 | Three small follow-ups from the pending-checks pass (2026-09-27): (1) side-panel "Shared stops" (route-timetable-panel.ts) rebuilt to use the exact same merged-grid rendering as the full-screen timetable, rather than its own differently-styled stacked list — extracted the two-panel names-column/times-grid renderer out of stops-layer.ts into a new shared module, `merged-grid-table.ts` (`buildMergedGridTable`), used by both now (CLAUDE.md's "build a shared component once" guidance), and `renderFamilySharedStops` switched from "stops every family member shares" to a real `buildMergedFamilyGrid` merge restricted to family members running the same direction as the route being edited. Live-verified: the side panel now shows the same navy/pink route-header cells and full stop-by-stop grid as the full-screen view, first row included, no console errors. (2) A player-placed stop (DESIGN.md §4) can now be deleted — a "Delete stop" button in its popup, shown only for a negative osmId (never a real OSM stop), calling the already-existing `window.playerStops.delete` IPC (unguarded, no confirm dialog and no check for routes still using it, matching depot-placement.ts's own "Delete depot" button — same convention, not a new one). The delete IPC call itself was proven live (a stop placed then deleted via the same call the button makes, confirmed gone from `playerStops.list()`); the popup-click path itself wasn't separately proven live due to map-click pixel precision in the automated test, not a sign of a problem — code review confirms it's wired the same way every other stop-popup action already is. (3) Depot placement (OPERATIONS.md §2) now road-snaps the depot's own site position (`router.snap_to_road`), not just its entrances — previously the site landed at the exact raw click point, which could be mid-building or in open water; entrances already used this same function, so this is the same idea applied one step earlier, not a new mechanic. Not separately live-verified end to end (an automated entrance click missed the actual road in testing, leaving Save correctly disabled rather than saving something wrong — no regression, just an unverified happy path) — low risk given it reuses an already-shipped, already-tested function verbatim. **Ask the user to check the delete-stop button and depot road-snap themselves**; the side-panel grid is already confirmed | Claude Code | Done, two need user check |
| T45 | Full-screen timetable grid: merged a route family's variations (e.g. 398/398A) onto one combined grid, matching the user's own Stagecoach reference (`reference/Stagecoach Timetable.pdf`, 28/28A/27A shown together on one page, interleaved by real departure time rather than grouped by route number). New pure functions in `route-timetable-grid.mts` — `mergeStopSequences` (anchor-based ordered-sequence merge: longest member's stop list as the base, each other member's stops inserted right after their last matched anchor, preserving every member's own real order) and `buildMergedFamilyGrid` (builds columns per journey per family member against that one merged stop list, sorted by first real departure time) — both unit-verified. `stops-layer.ts` computes the family's merged grid per direction/day-type and adds a route-header row (route number in its own colour) whenever more than one route contributes to the page. **Done (2026-09-27)**, then **live-verified against the running app on the user's own real 398/398A test routes** (a screenshot confirmed both routes correctly merged, interleaved by time, with a working route-header row). Three real bugs the user caught live in that first pass, all fixed same-day: (1) the merged grid's very first stop showed "-" for every column — real root cause found by inspecting the actual 398/398A save data directly (not guessed): both routes revisit the same physical stop more than once (398 starts and ends there, 398A visits it three times), and the merge's per-osmId `Map` lookups silently collapsed every repeat visit onto the *last* one, leaving earlier visits (including the true first stop) with no time at all. Fixed by rewriting `mergeStopSequences` to return an explicit position-based row mapping (searching for a match starting at the current merge cursor, not from the start of the list, so a route's own later revisit of a stop can never match backward onto an earlier visit's row) instead of reconstructing indexes from a raw-osmId `Map` — regression-tested with a dedicated loop/repeat-stop case in both `mergeStopSequences` and `buildMergedFamilyGrid`; (2) the route-header row's route number was rendered in the route's own colour as *text* on the panel's dark background, unreadable for several colours — changed to the route colour as the cell's background with contrast-computed text (`pickContrastColorForHex`, the same function the masthead badge already used), matching the masthead's existing look; (3) the masthead only showed the one route the popup happened to be opened from — now shows every family member's own badge, since the grid below already merges all of them onto one page. Re-verified live after all three fixes: first-stop row now carries real times for every column, header cells read clearly (navy background, white text), masthead shows both "398" and "398A". One small follow-up the user caught after that: the header row's route-number text sat high rather than centred (`line-height` shorter than the cell's own `height` leaves the leftover space at the bottom instead of splitting it) — fixed by matching `line-height` to `height`. **Confirmed working by the user directly, 2026-09-27** ("That looks great") | Claude Code | Done |
| T44 | Real performance bug: the WASM router's `nearest_node` did a full linear scan over every one of the ~1.4M routable edges in the whole-of-Great-Britain graph on every single call, with no spatial index and no caching — confirmed via CPU profiling after a real user report ("whenever I click on something it freezes for a long time"), not guessed. Rewrote it around a spatial grid built once at Router construction. **Done (2026-09-27)** — see Settled below for the full writeup | Claude Code | Done |
| T43 | Full-screen timetable grid: built DESIGN.md §7's already-specified "Inbound and outbound share one grid with a direction toggle" — the outbound/return-leg split (DESIGN.md §6's terminus loop) and its own toggle UI, compared directly against a real Stagecoach reference the user supplied (`reference/Stagecoach Timetable.pdf`). **Done (2026-09-27)** — see Settled below for the full writeup | Claude Code | Done |
| T42 | `UK-EXPANSION.md` received and read in full (2026-09-27) — added to CLAUDE.md's reference list. Whole-UK scope expansion, phase 1/5/6/7/9 territory throughout; triaged section-by-section against the actual current build state below in Settled, since most of it depends on phases not yet started. Not yet actioned beyond the triage itself — awaiting the user's call on sequencing | Claude Code | Pending |
| T41 | Full-screen timetable grid: fixed a real overlap bug the user caught live (departure times rendering behind the stop name — `position: sticky` on a `<th>` inside a `border-collapse: collapse` table, a known Chromium rendering conflict) and added showing every day type in one scrollable view instead of one at a time, per user feedback. **Done (2026-09-27)** — see Settled below for the full writeup | Claude Code | Done |
| T40 | Grouped stops (DESIGN.md §4) changed from OSM-seeded to player-created only, after the user found the original version grouping far too many stops together on Princes Street with no way to fix it. **Done (2026-09-27)** — see Settled below for the full writeup | Claude Code | Done |
| T39 | Depot placement and entrances (Phase 3, OPERATIONS.md §2). **Done (2026-09-19)** — see Settled below for the full writeup | Claude Code | Done |
| T38 | Vehicle catalogue data model + read-only browsable view (Phase 3, from `VEHICLE-SPECS.md`). **Done (2026-09-18)** — see Settled below for the full writeup | Claude Code | Done |
| T37 | Vehicles driving the real graph (Phase 3 kickoff, DESIGN.md §2). **Done (2026-09-17)** — see Settled below for the full writeup | Claude Code | Done |
| T36 | Stop placement with kerb snapping (Phase 2, DESIGN.md §4/§6). **Done (2026-09-17)** — see Settled below for the full writeup | Claude Code | Done |
| T35 | Time-of-day bands for route timetables (DESIGN.md §7). **Done (2026-09-17)** — see Settled below for the full writeup | Claude Code | Done |
| T34 | User request: show railway lines and railway stations on the map. **This row was stale — actually done across several sessions (2026-09-14/15, commits `7cc5eb5`/`512d7c7`/`d711307`), just never updated back here**, the exact staleness `feedback_write_decisions_to_docs.md` warns about. Rail/subway/tram lines render from the existing vector tiles (no pipeline change needed); stations, platforms (full shape, not markers) and tram stops extracted into a new `railway.bin` artifact; stations recentred on real platform geometry and nudged clear of roads; stop-linking is a manual per-stop dropdown (DESIGN.md §4's ring-colour pattern), not proximity-based. Station-as-higher-demand-point (DESIGN.md §4) is still genuinely unbuilt, but that's Phase 4 (demand) scope, not this task. See `project_railway_work_status.md` for the full history | Claude Code | Done |
| T33 | Wrote two chat batches into DESIGN.md/OPERATIONS.md: pantograph charging points now get a local battery buffer (continuous capacity, real cost formula, buildable only at owned stops/stations/interchanges — OPERATIONS.md §15); and a complete island/remote-area review (12 areas' lifeline-need and dedicated-livery status, DESIGN.md's new "Island and remote-area review" table) plus the lifeline payment model (council keeps all farebox, operator paid a fixed isolation-scaled rate per mile instead) and confirmation that adding a route to an already-established remote depot re-runs the same negotiation every time. Also fixed a real task-number collision: this session had already used T29/T30 for its own tracked work before a separate edit reused the same numbers for unrelated content — renumbered the older pair to T31/T32 rather than leaving two different T29s and T30s in the table. One number left genuinely open rather than guessed — Q12: the battery financing was asked to match vehicle finance's deposit/term/interest figures, but §3 doesn't actually specify any of those. Doc-only change, no code affected | Chat | Done |
| T31 | Wrote a chat batch into DESIGN.md and OPERATIONS.md: SPT as the contracting body within its zone (subsidy-first, full contract as fallback, dedicated livery required above a subsidy threshold); per-fuel-type regional discounts scaling independently (diesel/electric/hydrogen no longer one blanket discount); on-site hydrogen production and hydrogen refuelling infrastructure; solar panels and batteries as depot infrastructure with time-of-use overnight charging stacking with the regional discount; facility electricity use for owned depots/stations, priced below real-world | Chat | Done |
| T32 | **Done (2026-09-18):** user uploaded `VEHICLE-SPECS.md` into the repo root. Added to CLAUDE.md's reference material list (it now wins over DESIGN.md/OPERATIONS.md/CLAUDE.md on any conflicting vehicle figure, per the file's own header). Building the actual vehicle configurator/catalogue data model and UI from it is separate, not-yet-started work (Phase 3) — this task was only about getting the file itself into the repo | Chat / Claude Code | Done |
| T29 | Build the read-only stop/bus-station timetable viewer (user request): click a stop or station, see every calling service by day/time, grouped by stand at a station. Increment 1 (router fastest-route fix) done. Increment 2 (real timetable data model + a minimal editor UI) done. Along the way: added a Routes panel, then rebuilt it properly to DESIGN.md §11's actual spec — a single persistent left-hand column with three states (route list / drawing / locked reference beside its timetable), grouped by depot group with proximity reordering, colour/activation/profit/problem-indicator/long-distance pieces deliberately deferred and flagged (need livery/finance/staffing/activation systems that don't exist yet). **Increment 3 (2026-09-16, the viewer itself): done.** New pure module `stop-calling-services.mts` (`computeStopCallingServices`/`formatClockMinutes`, unit-verified — merges a route's multiple point-index matches at one physical stop, e.g. a loop's start/end, into one sorted list; sorts by route number numerically then day-type order; skips a degenerate zero/negative interval rather than hanging) plumbed into `stops-layer.ts`'s existing click popups: a plain stop/stand shows its own calling services, a bus station shows every stand's services grouped under its own heading, stands with none omitted. Fetches `window.routes.list()`/`window.routeTimetables.listAll()` fresh on each popup open rather than caching at startup, so it can't go stale while the map stays open. Verified live via the Playwright/CDP driver against the real running app and real save data: clicked route 398's own stop (Gordon Street/Central Station) and got its real 68 Monday-Friday departures; clicked Buchanan Bus Station and got two stands (467's and 900's) each with their own real departure lists, including 900's near-24/7 service correctly wrapping past midnight (23:52 -> 00:07). Zero console errors either time. `tsc --noEmit`, `npm run build`, and all `.verify.mts` scripts (including the new one) clean. **Not done, left for a future increment**: no UI yet to actually browse to an arbitrary stop/station without already having it on screen (e.g. a search box) — this is purely the click-to-view piece. | Claude Code | Done |
| T30 | Wrote three small items into the specs: a hard minimum zoom level (DESIGN.md §1, alongside the existing playable-area rules, stops the player scrolling back out past the launch-time zoom); an explicit confirmation that basket vehicle buying already implies per-vehicle destination depot and livery, not one for the whole order (OPERATIONS.md §3); and a new "rail acceptance" mechanic (DESIGN.md §10, alongside road closures) — a random rare event where the operations manager can accept rail tickets on bus services near a disrupted station, paid the full single fare per passenger, uncapped, with the same one-month payment delay as the £2 fare cap | Chat | Done |
| T27 | Wrote a large chat batch into DESIGN.md/OPERATIONS.md: the £2 fare cap (Highland+Moray and the 12-council SPT zone, bordering directly with no gap), AIR as a fourth fixed real contract, the airport route type, walk distance (400m urban/600m rural) and wait tolerance (15/30 min), managing director role, comfier seats, twin/tri-axle coach seating (53/65), breakdown weighting (engineering quality > age), the 28-day/35-day servicing schedule, parts finance breakdown by category, maintenance paid monthly, and map/routing notes (playable-area consistency, fastest-route routing — the latter two were already present, not duplicated) | Chat | Done |
| T28 | Resolved a real contradiction while writing T27: chat's notes said the airport-specification vehicle (reduced seats, more luggage) was needed for Express 500, but DESIGN.md's Express 500 entry already had a different specific requirement (double deck/electric/80,000/livery). User confirmed both apply together — Express 500 now requires all of it stacked, not one or the other | User | Done |
| T18 | Write the Q1–Q9 answers (below, in Settled) into the specs. Needs a fresh copy of OPERATIONS.md and DESIGN.md first — chat's local copy predates T15/T16 and adding these blind risks conflicting with that work | Chat | Done |
| T15 | Add the revenue inspector role to OPERATIONS.md: one rung above controller, promoted from any role, assigned to a depot group and roams within it automatically. A fixed small percentage of passengers always evade, caught based on inspector skill. Fine is a multiple of the fare owed, like a penalty fare. No reputation effect. Cap scales with services run in the group | Chat | Done |
| T16 | Rework the wages model in OPERATIONS.md §6 from "settable per role" to a single base wage (professional driver = 1.00) with every other role set as a fixed ratio of it — no individual override. Add bulk pay-adjustment tools, company-wide and per depot group. Full proposed ratio table given in chat, fleet elite bonus reduced to £20/month | Chat | Done |
| T17 | Add automatic contrast colouring for the support vehicle icons (spanner/person/recovery/parcel), matching the route number colour system exactly: sample what's behind the icon's fixed badge position, pick black or white, allow a manual override per icon. The delivered icon PNGs are plain white shape masks, not final colours — treat them as a stencil the renderer tints | Chat | Partly done (2026-10-04): automatic contrast is built and matches the route number system exactly — both use `pickContrastColor` in `icon-contrast.ts`, and the icons are tinted black/white variants in `support-vehicle-icons.ts`. Not yet done, and blocked: (a) sampling the colour behind each icon's badge needs the badge layer, which needs support vehicles on the map (Phase 3/7); (b) the per-icon manual override is now stored per livery (decided by the user, 2026-10-04). Built as a minimal livery layer: `liveries` (name, primary and secondary hex from OPERATIONS.md §4) and `livery_support_icon_overrides` (livery, icon, black/white), schema v24→v25, `electron/db.mts`. Verified by `electron/livery.verify.mts`, including an upgrade of a copy of the real save. Built since (2026-10-04): a "Liveries" panel (`src/renderer/livery-panel.ts`, toggle at the bottom of the map) to add liveries and set Automatic/Black/White per support icon, with IPC and a preload bridge. Driven live in the running app: a livery was added, an override saved and read back; the test rows were removed from the save afterwards. Not yet built: the badge layer that samples behind each icon |
| T4 | Get the combined update message to Claude Code | User | Done |
| T5 | Produce branding mask and number box images for each existing livery | User | Pending |
| T8 | Design the map-data output layout, versioning and manifest format for the pipeline, matching the "installer has no map data; downloads separately on first run, versioned independently from the app" model going into CLAUDE.md. Current pipeline output (`pipeline-data/*.bin`) is informal dev-scratch, not yet this. Blocks nothing in phase 1 | Claude Code | Partly done (2026-10-04): packaging and verification built, not yet published or wired into the game. Decisions from the user: host on GitHub Releases split into parts under the 2 GiB per-asset limit; keep full z16 basemap; independent data version with a manifest and SHA-256 per artefact. `scripts/package-map-data.mjs <version>` writes `dist-map-data/` (tiles.pmtiles split into 4 parts, all others single files) and `manifest.json`; `scripts/verify-map-data.mjs` checks every part and reassembles each artefact against its full hash. Verified for real on the 1.0.0 packaging of the live data: all seven artefacts ok, 12s. Update 2026-10-04: release `map-data-v1.0.0` created (https://github.com/Steel-Horse-Simulations/bus-game/releases/tag/map-data-v1.0.0) with 7 of 11 files (manifest.json, the six smaller .bin files, road_graph.bin). The four `tiles.pmtiles.part000`–`part003` uploads are PAUSED: from this machine `uploads.github.com` fails (gh reports no such host, curl gets connection resets) while github.com and api.github.com work. User chose to pause and resume later, e.g. from another network. The basemap cannot be downloaded in-game until those four parts are uploaded. User decision (2026-10-04): wait. The in-game first-run downloader is deferred until the four basemap parts are uploaded, so it can be tested end to end. Paused 2026-10-04 (user decision). Current release state: manifest.json and five font files and six data files are on map-data-v1.0.0; manifest.json now lists 12 basemap parts (tiles.pmtiles.part000–part011, ~500MB each) that are NOT on the release, so the first-run download fails at the basemap until they are uploaded. Uploads from this connection fail with HTTP 408 inactivity at 1.9GB and at 500MB. Resume from another network: upload the twelve tiles.pmtiles.part* files from dist-map-data/ with gh release upload --clobber, then rerun the downloader test. Still to do: the in-game first-run downloader with progress screen, which needs the release URL and switching the map server from the bundled resources folder to the userData download location. |
| T9 | Add OpenMapTiles attribution to CLAUDE.md alongside the OSM credit | User | Done |
| T10 | Copy the four updated documents into the repo | User | Pending |
| T11 | Write the newest decisions into the specs | Chat | Done |
| T12 | Build the real installer + GitHub Releases + electron-updater pipeline (`CLAUDE.md`'s actual distribution model). Only an unpacked local dev build exists so far (see Settled). Needs an actual release process first — not started | Claude Code | Partly done (2026-10-04): the NSIS installer (`npm run installer`, `electron-builder.installer.json`, per-machine, GitHub update source, no map data) builds at 163MB and installs, launches and uninstalls cleanly per the user's own test. Previous 8.5GB build was broken because the payload exceeded NSIS's ~2GB limit, so map data is now excluded from the installer. Updater code in `electron/main.ts` is written but not yet exercised against a published release. Still to do: the first-run map downloader (deferred by the user until the basemap parts are uploaded), publishing a test release for the updater (needs approval), and the git commit for these changes |
| T13 | Update DESIGN.md's "Islands and ferries" section — it still says Shetland is excluded, but the decision is now to keep it in (see Settled) | User | Done |
| T14 | Correct the region layout: North Scotland, West Scotland, East Scotland, North England (one, not split NE/NW), and Shetland as its own fifth region. Currently built as NE England / NW England split instead — needs the depot_groups region set changed and existing data migrated, same pattern as the v1→v2 migration | Claude Code | Done |
| T19 | Extract OSM `place=city/town/village` nodes (with population, or place-type rank where population is missing) into a new pipeline artifact, then use the largest one in a depot group as the settlement-fallback reference for DESIGN.md §6's direction rule ("a route touching no bus station"). **Done (2026-09-17).** New `settlements.bin` artifact (also `hamlet`, not just city/town/village — real data has plenty: 12 cities, 305 towns, 2231 villages, 6844 hamlets in the current extract), `decode_settlements` in game-wasm. Depot groups have no stored location of their own yet (Phase 3 depot placement), so "the largest settlement in the depot group" couldn't be built as literally specified — user's call: fall back to the largest settlement near the route being drawn instead (successively wider search radii, 50km/150km/unlimited, ranked by place significance then population then distance — `settlement-fallback.mts`, unit-verified). Verified live: a route drawn for a depot group with no bus station saved successfully or the first time, correctly picking Glasgow for a central-Glasgow route, with the fallback surfaced in the save status message so it's never silent | Claude Code | Done |
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

- **Q13 (combining variations data model) and Q14 (day-type term-time
  model), both answered 2026-09-28.** Q13: **segment-list, reusing
  siblings** (a variation stores an ordered list of segments, each either
  "follow the trunk" or "follow sibling X's own diversion between these two
  shared stops") — padding stays outer-terminus-only for now, deferred
  rather than handling each split point independently, per the user's own
  choice. Not yet implemented — see T58. Q14: weekday bitmask + term_facet
  (any/term_time/holiday) as two real columns, the user's own call after
  asking for a recommendation, given "one system for both" (term-time AND
  weekday sub-patterns together) for Q4. Implemented same day — see T57.
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
- **Event calendar (DESIGN.md §7 "Structure," Phase 2 checklist)
  deliberately deferred to Phase 5.** Asked directly rather than guessed:
  the actual event-services mechanic ("event services sit on top of the
  normal timetable... services need a calendar as well as day types")
  depends on event contracts and venues (DESIGN.md §10), which CLAUDE.md's
  build order puts in Phase 5 — there's nothing to hang it off yet.
  **User's call: defer to Phase 5**, not build a bare calendar data
  structure ahead of it. With this and the variation-padding model
  (already deferred earlier, see the live-comparison note above) both
  deliberately set aside, Phase 2's DESIGN.md checklist is otherwise
  complete — route drawing, stop placement with kerb snapping (T36),
  grouped stops, direction rules (T19), variations, express skip flags,
  timing points, frequency generation, time-of-day bands (T35), day
  types, and connection stops are all built and verified.
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
- **Route 398 running time: the time-of-day traffic multiplier plan was
  built, tested, then deliberately dropped mid-session in favour of real
  junction delays — recorded here now because it wasn't written down the
  first time and the decision was lost across a context reset.** Original
  plan: derive time-of-day multipliers (×1.00 deep night up to ×1.60 peak)
  from the real Lothian Route 1 timetable PDF, then extend to proper
  urban/semi-rural/rural/very-rural tiers using real Aberdeen, Inverness,
  Fort William and Shetland reference timetables the user supplied. Built
  as a TS-layer display multiplier on top of the router's raw fastest-route
  time. Testing against 398 exposed the real problem: even at the quietest
  time of day the router's own baseline (3.93 min) was wildly short of a
  real quiet-time car journey (13 min, Google Maps at 21:48) — no traffic
  multiplier can fix that gap, because it was never about traffic volume.
  The actual cause: `edge_time_cost_s` charged zero time for any junction,
  turn, traffic light or roundabout at all — pure distance÷speed-limit.
  **User's call**: "Let's possibly drop the artificial scaling we were
  going to do as this and the extra customers should add the delays we
  need to make it realistic" — dropped the multiplier entirely, in favour
  of (1) real junction-control delays in the router (give-way, traffic
  signals, stop signs, mini-roundabouts — see the pipeline/router work
  below) and (2) real passenger pickup/drop-off dwell time once Phase 4's
  passenger simulation exists, which should supply realistic variation
  organically rather than an invented multiplier. The Aberdeen/Inverness/
  Fort William/Shetland reference PDFs were gathered for the dropped
  multiplier tiers specifically — not needed for anything else, no need to
  re-derive or re-request them.
  **Increment 1 (shipped)**: junction-control extraction in the pipeline
  (`highway=traffic_signals`/`stop`/`give_way`/`mini_roundabout` on the
  junction node itself) plus a junction-delay cost in the WASM router's
  Dijkstra search — traffic signals/stop signs/mini-roundabouts always cost
  their flat delay, an untagged or explicit give-way junction only costs a
  delay when the vehicle is *joining a more major road* (continuing on the
  same class, or turning onto a less major one, is a plain uncontrolled
  crossing a real bus wouldn't stop for — this is deliberate, not a gap).
  Delays are flat (**not** time-of-day-scaled) on purpose — 398's computed
  time went from 3.93 min to 10.15 min (full loop) / ~8 min (the outbound
  leg to its terminus, point index 3 of 4 stops). **User reviewed this
  exact build and confirmed it**: "The 398 is showing as 8 minutes, that
  seems sensible for quiet time of day, I assume passenger delays at stops
  isn't implemented yet?" — correct on both counts; nothing further to fix
  here until Phase 4.
  **Increment 2 (not built, not scheduled)**: scaling the same junction
  delays by time of day (heavier queues at lights/give-ways in rush hour,
  quicker at night) — deliberately deferred pending increment 1's
  real-route verification, which is now done. Given the user's own
  preference for organic realism from passenger dwell over an artificial
  multiplier, revisit whether this is still wanted at all once Phase 4
  passenger boarding/alighting delays exist, rather than assuming it's
  still queued.
- **T35 done: time-of-day bands for route timetables (DESIGN.md §7).**
  Each route timetable's single flat start/end/interval frequency became a
  list of independent time-of-day bands, each with its own start/end/
  interval — one timetable row can now run every 15 min in the peaks and
  every 60 min overnight, rather than needing several manually-merged
  timetable rows to fake it. Deliberately **not** building per-band
  running-time adjustment, even though DESIGN.md's literal band text also
  mentions adjustable running times — that's the same multiplier mechanism
  the user already rejected (see the running-time entry directly above);
  only the frequency-varies-by-band half was in scope. Schema:
  `route_timetables`' three flat `*_minutes` columns became a single
  `time_bands` TEXT column (JSON array of `{startMinutes,endMinutes,
  intervalMinutes}`), `SCHEMA_VERSION` 11→12, with a data-preserving
  migration wrapping each existing row's flat frequency into a single-band
  array before dropping the old columns — verified directly against the
  real save file, all 6 pre-existing `route_timetables` rows migrated with
  no data loss (checked via direct sqlite inspection before and after,
  having first taken a backup copy). New pure-logic additions to
  `route-timetable.mts`: `validateTimeBands` (rejects empty lists, invalid
  per-band frequency, and overlapping-but-not-touching bands — touching
  boundaries are explicitly allowed) and `generateDepartureMinutesForBands`
  (merges/dedupes/sorts departures across bands), sitting alongside the
  existing single-band primitive which callers with one band still use
  internally; `DEFAULT_TIME_BANDS` gives a sensible UK-shaped default
  (night/AM peak/inter-peak/PM peak/evening) for a freshly-created day
  type, adjustable afterwards — this was the user's own answer to "what
  should the default bands be" (sensible UK defaults, adjustable later).
  `stop-calling-services.mts` and `route-timetable-grid.mts` swapped their
  flat departure-generation loop for the new band-aware one.
  `route-timetable-panel.ts`'s flat start/end/interval inputs became an
  add/remove list of band rows; the live family/variation comparison
  timetable (shipped earlier this session) picks up band edits
  immediately, same as it already did for timing-point edits. Live-tested
  via CDP against the real running app and real save data: an existing
  migrated band loads and displays correctly, a fresh day type pre-fills
  the UK defaults, bands can be added/removed/edited with the live
  comparison updating immediately, and save/reload round-trips correctly
  with zero console errors. `tsc --noEmit` and every affected
  `.verify.mts` script (including `electron/db.verify.mts`'s migration
  coverage) pass. **Known minor rough edge, not fixed**: adding a new band
  when the day is already fully covered up to 23:59 produces a valid but
  zero-length band (start=end=1439, generating exactly one departure) —
  mathematically valid and saves correctly, just a UX rough edge for the
  player to notice and adjust, not a bug.
- **T36 done: stop placement with kerb snapping (DESIGN.md §4).** A new
  "Place stop" toggle (next to "Hidden stops") lets the player place a
  stop directly on the map instead of only using imported OSM stops.
  DESIGN.md §4's own wording — "a new stop snaps to the road, on the left
  kerb for the direction of travel, and creates one stop serving one
  direction, matching how OSM tags them" — turned out to need no new data
  field at all: a real OSM stop has no direction attribute either, it's
  just a point on one physical side of the road, so a placed stop only
  needs the same. New `Router::place_stop(lon, lat)` (game-wasm) scans
  every road edge (deliberately not filtered to bus-legal ones, since
  DESIGN.md explicitly allows placing a stop on a road buses can't use,
  with a warning — the search itself can't exclude those roads or the
  warning could never fire), finds the nearest point on the nearest road,
  and offsets it perpendicular onto the correct kerb: a oneway road's left
  kerb is fixed by its own direction regardless of which side was clicked;
  a two-way road lets the click's own side choose which direction the new
  stop will serve, the same way a real two-way street carries two
  independently-facing stops rather than one shared one. 4 new Rust unit
  tests check the actual geometry (both oneway directions' fixed kerb, the
  two-way click-side behaviour, and the bus-legal warning flag on an
  access-restricted road) with a synthetic two-node road, not just wiring.
  New `player_stops` table (`SCHEMA_VERSION` 12->13, additive only) — a
  placed stop is identified everywhere else in the game (route points, the
  override layer, stop popups) by the *negative* of its own row id, so it
  slots into every existing "stop" mechanism (rename, hide, connection
  stop, pick-up/set-down, calling services) with zero further code, no
  separate "kind" flag needed anywhere. Verified live via CDP against the
  real running app: placed a stop in central Glasgow, confirmed it
  persisted with the correct kerb-snapped coordinates and bus-legal flag,
  confirmed it renders on the map, and confirmed its popup opens with the
  full normal stop toolset with zero console errors. `cargo test
  --workspace`, `tsc --noEmit`, `npm run build`, and `electron/
  db.verify.mts` (extended with player-stop CRUD and close/reopen
  persistence coverage) all pass. **Known, deliberate gap**: a road with
  no highway classification at all (footway, cycleway, a plain pedestrian
  street with no bus/psv override) never becomes an edge during the
  pipeline build, so it's outside `place_stop`'s reach — a click near only
  this kind of "road" currently falls back to whatever real road is
  nearest instead, rather than genuinely having nothing to snap to.
  **Not attempted this increment**: no delete action for a player-placed
  stop (only hide, the same as a real OSM stop) — logically a player might
  want to actually remove one they created by mistake rather than just
  hiding it; worth a small follow-up if it comes up in play.
- **T37 done: vehicles driving the real graph (DESIGN.md §2, Phase 3
  kickoff)** — the user's own choice of where to start Phase 3. Every
  generated departure on a saved, timetabled route now gets a real moving
  badge that follows the route's actual road-snapped path (re-routed leg
  by leg via the existing router, the same way the route panel's own
  "Show" preview already does, since only the point list is persisted),
  paced by the timetable's own precomputed stop-to-stop offsets — so a
  timing point's dwell is already handled for free, no new lateness/
  recovery logic needed. New pure module `vehicle-position.mts`
  (`interpolateAlongPolyline`/`computeVehiclePosition`, 15 unit tests)
  walks a leg's polyline by cumulative distance so a bus follows a bend
  rather than cutting the corner. Rendered as a coloured circle (the
  route's own colour) + route number + a rotated direction arrow (reusing
  the existing "oneway-arrow" icon) — a placeholder for DESIGN.md §11's
  real "angled rectangle in a simplified livery" badge, which needs the
  livery primary/secondary colours a later Phase 3 item (the vehicle
  catalogue) hasn't built yet. A manual Mon-Fri/Sat/Sun selector stands in
  for a real in-game calendar (doesn't exist yet) — also more useful for
  testing than waiting for an actual Saturday. Game clock runs
  continuously at DESIGN.md §3's 1-real-second-=-10-game-seconds rate; no
  pause/speed control UI yet, since there's nothing to manage mid-
  simulation until more systems exist. Runs on the main thread via
  `setInterval`, not yet the Web Worker CLAUDE.md's Stack table names for
  "Simulation" — deferred until Phase 4's passenger simulation actually
  needs the headroom. Verified live via CDP against the real running app
  and real save data: routes 900 (near-24/7) and 888 both showed live,
  independently-moving badges; two position snapshots 2 real seconds (20
  game seconds) apart confirmed real movement along the real road network;
  a close-zoom screenshot confirmed the circle/arrow/number badge renders
  correctly on a real street; the day-type selector switches correctly.
  Zero console errors. `cargo test --workspace`, `tsc --noEmit`, `npm run
  build`, and the new verify script all pass.
- **T38 done: vehicle catalogue data model + read-only browsable view
  (Phase 3), from the newly-supplied `VEHICLE-SPECS.md` (T32).** The
  user's own choice of scope: prove the data model reads correctly before
  wiring in purchasing, a fleet/ownership table, or depot assignment. New
  `vehicle-catalogue.mts` transcribes every model (22 models, 40 length
  variants) as static typed data — not derived from OSM/pipeline data like
  everything else in this project, so a plain module rather than a Rust/
  wasm artefact. A `Capacity` union covers the catalogue's real variety:
  plain seated+standing, coaches' seated-only, the max-seating/max-
  standing configurator mode (StreetDeck/Kite families), the MCV Evora's
  dynamic wheelchair-bay conversion (confirmed by the user as a live,
  per-journey state depending on whether a wheelchair passenger is
  currently aboard — not a purchase-time configurator choice), and
  `"unspecified"` for a real gap VEHICLE-SPECS.md itself doesn't state,
  rather than a guessed number. `axleCountForLength` derives twin/tri-axle
  from a coach's own length rather than storing it, per §1's "not a
  selectable option" rule. 22 unit tests, one of which caught a real bug
  before it ever reached the UI: `generalOptionsFor`'s two-filter chain
  excluded the EVM Cityline's own low-floor option in its first pass, so
  the second pass could never let it back in — fixed to a single filter
  with an explicit early branch. New `vehicle-catalogue-panel.ts` adds a
  "Vehicles" toggle (bottom-left, beside the route panel) opening a
  browsable list grouped by fleet-number range exactly like VEHICLE-
  SPECS.md's own §3 headings; each vehicle expands to its full detail —
  chassis, top speed, base price, every length's capacity/fuel-or-battery
  options/notes, and the general options that actually apply to its power
  type. No save-file interaction, no purchasing, no fleet table yet.
  **Real gaps found while transcribing, flagged as Q13 rather than
  guessed at**: seated/standing capacity is genuinely not stated anywhere
  in VEHICLE-SPECS.md for the EVM Cityline (either power variant), the
  Volvo 9700DD, or the Yutong coach — despite the source file's own §5
  saying no gaps remain. Verified live via CDP against the real running
  app: the panel opens, lists all 22 models under the correct category
  headings, and expanding the MCV Evora shows the wheelchair-bay note and
  the correct 35/34/43 figures, with zero console errors. `tsc --noEmit`,
  `npm run build`, and the new verify script (22 checks) all pass.
- **Q13 answered — all three vehicle capacity gaps filled in with real
  figures**, corrected once more mid-session after an initial wrong model
  (kept here as the final state, not the intermediate one). Volvo 9700DD:
  genuinely different seat counts at its two lengths, not one figure
  applied to both — 75 seated at 13m, 81 seated at 14.8m. EVM Cityline:
  the user corrected a wrong assumption of mine directly — every vehicle
  in the catalogue always has its wheelchair bay, there's no "bay fitted
  or not" purchase choice at all; capacity varies only with whether the
  bay is currently occupied, live at runtime, the same pattern the Evora
  already used. Replaced two separate capacity kinds
  (`"wheelchairConvertible"` for the Evora, `"configDependent"` for the
  Cityline) with one general `"wheelchairBayDependent"` kind covering
  both, since the Cityline's stepped-entrance build loses a *seat* (not
  standing space — it has none at all) when the bay is occupied, a
  pattern the Evora-specific shape couldn't express. Low floor vs stepped
  entrance turned out to be two genuinely different real builds (capacity
  differs, not just an accessibility flag), so `LengthVariant` gained an
  optional `variantLabel` to carry two builds sharing one length. Real
  figures: stepped entrance 16 seated (bay converted) / 14 seated (bay in
  use), 0 standing throughout, confirmed private-hire-only; low floor 16
  seated throughout, 8 standing (bay converted) / 4 standing (bay in use).
  Yutong coach: asked directly rather than guessed whether "GTe12"/"GTe14"
  were corrected names for "T12E"/"T15E" or different vehicles — confirmed
  as corrected names, with GTe14 also a real length correction (14m, not
  15m, still correctly tri-axle either way). GTe12 seats 50, GTe14 seats
  57. No unspecified capacity remains anywhere in the catalogue; verify
  script now 36 checks.
- **T39 done: depot placement and entrances (OPERATIONS.md §2, Phase
  3).** The other unblocked Phase 3 item alongside vehicles/the catalogue
  — resolves a gap flagged back in T19 (depot groups had no stored
  location, only the settlement fallback stood in for it). Deliberately
  narrow scope, matching this session's other Phase 3 increments: just
  the physical placement mechanic. Not built — the tier system
  (outstation/tiny/small/main), rent-vs-buy economics, build time,
  capacity or maintenance facilities, all of which depend on money (Phase
  5) and staffing (Phase 6/7) that don't exist yet. The full "opening
  scenario" CLAUDE.md bundles into the same build-order line needs
  contracts and passengers too (Phase 4/5) and is explicitly out of scope
  here. New `depots` table (the raw click position — not kerb-snapped
  like a stop, since OPERATIONS.md says a depot "can be built anywhere
  suitable... enough space with road access") and `depot_entrances`
  (road-snapped by the WASM router, "entry only, exit only, or both").
  `SCHEMA_VERSION` 13→14. A "Place depot" toggle arms a two-step
  placement — first click drops the site, subsequent clicks near roads
  snap and add entrances; a draft panel gates Save on a name, a depot
  group and at least one entrance. **Real bug caught live, not just in
  code review**: typing the depot's name left Save permanently disabled,
  since the disabled check was only ever recomputed at the panel's last
  full render and the name input deliberately doesn't trigger one (or
  every keystroke would lose cursor focus) — fixed by keeping a live
  reference to the Save button and recomputing its disabled state
  directly from the name/group change handlers. Verified end-to-end via
  CDP against the real running app and real save data: placed a depot in
  central Glasgow with two entrances snapped to real roads, confirmed
  Save enables correctly once complete, confirmed persistence via the
  API, confirmed the depot's popup opens with working rename/entrance-
  management/delete, cleaned up afterward. `tsc --noEmit`, `npm run
  build`, and `electron/db.verify.mts` (extended with depot/entrance CRUD
  and close/reopen persistence coverage) all pass. **Unrelated to this
  work, noticed and ruled out during testing**: a pre-existing 404 for
  `fonts/Open%20Sans%20Regular,Arial%20Unicode%20MS%20Regular/0-255.pbf`
  — some basemap layer's `text-font` falls back to a font family outside
  the downloaded Noto Sans glyph set. Not fixed, not in scope, worth a
  look if it recurs.
- **T40 done: grouped stops (DESIGN.md §4, commit 9953e8e) changed from
  OSM-seeded to player-created only (2026-09-27).** The user found the
  original grouping mechanism live: a real `public_transport=stop_area`
  relation on Princes Street, Edinburgh grouped far more stops than made
  sense together, and there was no way to correct it — the same class of
  problem, and the same fix, as the railway/subway/tram stop link's
  original proximity-based version (also corrected 2026-09-15, see
  DESIGN.md §4's "Station, airport and park-and-ride stop linking").
  Offered the user a choice between adding manual override on top of the
  existing OSM seeding (bus station stands' own model) or dropping
  automatic seeding entirely; the user chose the latter, matching the
  transit-link precedent exactly. New `stop_groups` table (`electron/
  db.mts`, `SCHEMA_VERSION` 14→15) mints only an id — a group's name/
  hidden/always_show_members state and its membership both live in the
  existing override layer (`'stop_group'`/id for the former, `'stop'`/
  osmId/`'group_id'` for the latter), exactly mirroring how bus station
  stand membership already works, so no new persistence mechanism was
  invented. A stop's own popup gained a "Grouped with" dropdown (pick an
  existing nearby group, or "+ Create new group here" with an inline name
  field); a group's own marker popup gained the same rename control and
  the same "assign everything within a radius" bulk tool a bus station's
  popup already has — the actual fix for Princes Street: draw a tight
  radius around just the stops that really belong together instead of
  inheriting one oversized automatic relation. A group's map position is
  always the live centroid of its current members, recomputed on every
  membership change, since (unlike a bus station) it has no position of
  its own. Verified end-to-end via a Playwright driver against the real
  packaged app: created a group from a stop's popup, confirmed its marker
  appears immediately (even with one member — deliberately not gated
  behind the old "2+ members" threshold, since every group is now a
  deliberate player action), opened the marker's own popup, ran the bulk
  radius tool, confirmed membership updated and the centroid moved. Real
  test data this produced in the live save file (two throwaway groups, 95
  membership overrides) was found and removed directly from the SQLite
  file afterward — not left in the user's real save. `tsc --noEmit`,
  `npm run build`, and `electron/db.verify.mts` (extended with stop-group
  id-minting, membership-via-override, and close/reopen persistence
  coverage) all pass.
- **T41 done: full-screen timetable grid, two real bugs fixed
  (2026-09-27).** The user checked the grid restyle (T30-adjacent,
  commit `ff1c464`) live and found it broken in two ways. **Bug 1 —
  overlap:** departure times rendered behind the stop name, making both
  unreadable. Root cause confirmed directly (not guessed): the sticky
  first column (`th`, `position: sticky; left: 0`) sat inside a
  `<table>` with `border-collapse: collapse` — a documented Chromium
  rendering conflict where the sticky cell stops reserving its own
  column width and paints over the next column instead of beside it.
  Fixed by switching to `border-collapse: separate; border-spacing: 0`
  (the standard remedy) plus giving the sticky `th` and its row an
  explicit background colour (`var(--bg-accent)`/`var(--bg-surface-2)`
  by row parity) instead of `background-color: inherit`, and a
  `z-index`. **Bug 2 — one day at a time:** the "⤢" expand button only
  ever opened the single day type the clicked departure belonged to,
  needing the whole modal reopened per day. Changed `showRouteTimetableModal`
  to take every `RouteTimetable` the route has (not one), rendering
  Mon-Fri/Sat/Sun as stacked sections in a single scroll, each with its
  own sticky day-type band and its own horizontally-scrollable table —
  fixes the "shouldn't have to open each day separately" complaint
  directly. Verified live via a Playwright driver against the real
  packaged app: opened route 900's grid (a real near-24/7 service, a
  good stress case), confirmed `thRect.right === tdRect.x` (zero overlap)
  across all three day-type tables via direct DOM measurement, and
  confirmed all three day bands render together. `tsc --noEmit` and
  `npm run build` clean.
  **Follow-up (same day): the user found the overlap wasn't fully gone**
  — a sliver of a departure time still peeked out before the stop name
  once the grid was actually scrolled. Root cause this time was deeper
  than the first fix: `border-collapse: separate` stopped the *character*
  overlap, but the sticky `th` was still logically part of the
  horizontally-scrolling `<table>` — scroll far enough and an earlier
  time column's own (non-sticky) position slides to a screen x *left* of
  the stuck column, which sticky positioning was never going to block
  since it only paints over content sharing its own screen position, not
  content that has scrolled past it. Also switched the day-type band's
  colour from the reference PDF's bright `#1677ff` to the theme's own
  `var(--bg-accent)`/`var(--text-accent)` pairing (the same one `.btn.is-
  active`/`.dropdown-item.is-selected` already use), per direct user
  feedback that the blue stood out against the rest of the game's dark
  chrome. **Real fix**: rebuilt the grid as two side-by-side panels
  instead of one scrolling `<table>` with a sticky first column — a
  fixed, never-scrolled flex column for stop names, and a separately
  horizontally-scrolling CSS-grid panel for times only, both driven off
  one explicit shared row height so they line up exactly. No `position:
  sticky` needed at all for the name column any more, which removes the
  whole class of "sticky item still inside the scrolling content" edge
  case rather than patching around it again. Column widths (both panels)
  come from a real canvas-measured text width, not the browser's own
  (unreliable for this exact case, confirmed via `document.
  elementFromPoint` at the failure pixel) auto-layout guess. A light
  `scroll-snap-type: x proximity` on the times panel is cosmetic polish
  on top, not the fix. Verified live via a Playwright driver against the
  real packaged app: 8 wheel-scroll ticks deep into route 467's grid
  (a good stress case — several long stop names, e.g. "West George
  Street / Queen Street Station"), confirmed every row's stop-name cell
  still owns its own left pixel (`document.elementFromPoint` returns the
  name cell, not a time cell) and that all 6 rows' vertical positions are
  exactly 24px apart (perfect two-panel alignment), at both rest and deep
  scroll. Zero console errors. `tsc --noEmit` and `npm run build` clean.
- **T42: `UK-EXPANSION.md` triaged against the actual current build state
  (2026-09-27).** The brief itself says "active priority... phase 1/5/6/7/9
  territory throughout," but CLAUDE.md's build order says not to reorder
  without asking, and much of the file depends on systems that plain
  don't exist in the codebase yet regardless of priority — so before
  touching any of it, here's what's actually buildable now versus
  blocked, section by section, checked against the real shipped state
  (Phase 1/2 done, Phase 3 partway — vehicles move and the catalogue is
  browsable but there's no purchasing/fleet ownership, no duties, no
  route-band crossing-solver; Phase 4 through 9 not started at all: no
  demand/RAPTOR/fares, no finance, no drivers/duties/rosters, no other
  staff, no maintenance, no liveries/seasonal/dealer-network):
  - **Buildable now, self-contained:** §14/14a (fleet-numbering scheme +
    Enviro500→Enviro400 XLB catalogue swap) — a direct, low-risk
    extension of the vehicle catalogue work already shipped (T38); no
    fleet numbers have been issued to any vehicle yet, so nothing to
    migrate.
  - **Buildable now, route/timetable mechanics only (current Phase 2/3
    tools already support this):** §9 (long-distance numbering, 300+) —
    but see the open question below; §10 (night bus routes) — the
    route/variant creation half only, its duty-continuity rules need
    Phase 6; §12 (seasonal services) — the route/variant/journey
    flagging and 800-899 number block only, the "automatic staff/vehicle
    reassignment when a season ends" half needs Phase 6/7 allocation
    systems that don't exist.
  - **Buildable now but large/slow, own undertaking:** §1 (map boundary
    — new NI + Isle of Man Geofabrik extracts, dropping the existing
    clip, re-running the whole pipeline against a much bigger road graph
    — a real Phase 1 pipeline change, not a quick edit).
  - **Blocked on unbuilt phases:** §2 dealer network (Phase 9 — CLAUDE.md
    already lists this under Phase 9 explicitly); §3/§4 double-manning
    and the duty-swap hierarchy (Phase 6 — no driver/duty system exists
    at all); §5 outstations without a depot group (needs the depot-tier/
    outstation system itself, Phase 9 — only plain depot placement, T39,
    exists today); §6 pre-activation staffing/fleet preview (needs Phase
    6 driver allocation and real fleet ownership, neither built); §7
    mandatory regional liveries (Phase 9 — no livery system in-game at
    all yet, only a placeholder route-colour badge); §8 fare caps by
    nation (Phase 4/5 — no fare/ticketing system exists in-game; DESIGN.md
    §9's Highland/SPT cap is spec only); §8a depot group structure at
    scale (depot groups themselves exist, Phase 1, but "isolated
    resourcing" and "shared top-tier management" are meaningless without
    Phase 6/7 staffing).
  - **Mixed, and explicitly not fully spec'd yet even on its own terms:**
    §13 Isle of Skye. The route/stop/timetable half is buildable with
    current tools (this is genuinely just "draw 15 real routes with real
    timetables," which the game already does), but duty-linking (607↔608
    etc.) needs Phase 6, the Rapsons livery needs Phase 9, and per-route
    vehicle-type gating needs real fleet ownership/assignment (not built,
    Phase 3 gap). The brief itself still flags open items (57A/57C/157/159
    outstation gating not yet stated, the exact Portree High departure-
    order wait mechanic's scope not yet confirmed as Portree-specific or
    general).
  - **Open question worth asking rather than guessing:** §9's 300+
    long-distance numbering may conflict with, or sit alongside, the
    existing 900+ long-distance convention already written into DESIGN.md
    per T20 — not clear from the brief alone whether 300+ replaces 900+
    for majority-outside-Scotland routes or the two ranges coexist by
    region. Flagged, not assumed.
  - **Recommendation given to the user:** start with §14/14a (smallest,
    cleanest, zero migration risk), then take the rest in whatever order
    the user prefers — not decided unilaterally, per CLAUDE.md's "ask
    rather than guess" and "do not reorder [the build order] without
    asking."
- **T43 done: full-screen timetable grid gets its outbound/return-leg
  split, comparing directly against a real reference (2026-09-27).** The
  user checked T41's restyle again and pointed out it didn't match what
  they meant — asked whether a real Stagecoach timetable was still
  available to compare against directly rather than working from a text
  description. It wasn't saved anywhere in the repo (only the fares PDFs
  live in `reference/`); the user then supplied one (Stagecoach Service
  28/28A, both directions), now saved as `reference/Stagecoach
  Timetable.pdf` for future reuse. Comparing it directly (PyMuPDF
  installed to render the PDF's pages as images, since no PDF renderer
  was otherwise available) showed each direction as a genuinely separate
  page — different stop order, different real times, not one direction's
  schedule read backwards — and confirmed DESIGN.md §7 already specifies
  exactly this ("Inbound and outbound share one grid with a direction
  toggle"), just never built.
  - **The data question, asked rather than guessed:** this game only ever
    generates departures starting from a route's own points[0] — there's
    no separately-stored return-leg schedule the way 398/398A are simply
    two separate route rows. The user's own answer: DESIGN.md §6's
    terminus-loop mechanic (terminusIndex/startIndex, "Start and terminus
    stops") already encodes a full round trip within one route's own
    point list — points[0..terminusIndex] is the outbound leg ending at
    the terminus, points[startIndex..last] is the return leg — so both
    legs already have their own real router-computed times sitting in the
    one stored timetable; nothing needed to change in the data model at
    all, just how the grid reads it. A route with neither set is a loop
    with no natural "other direction" (the user's own rule) and keeps
    showing every stop as one table.
  - New `routeDirectionRanges`/`sliceGridToPointRange` in
    `route-timetable-grid.mts`, unit-verified (7 new checks: a loop route
    produces one unlabelled segment; a terminus-loop route produces
    outbound/inbound segments with the correct stop membership *and* the
    correct real offsets for each — explicitly checked that the return
    leg's times come from its own stored offsets, not a reversal of the
    outbound leg's; the label flips correctly for an inbound-oriented
    route). `showRouteTimetableModal` (stops-layer.ts) restructured
    around it: first cut stacked both directions in one long scroll, but
    DESIGN.md's own already-written spec called for a toggle instead —
    corrected to a two-button OUTBOUND/INBOUND toggle (only shown when a
    route actually has two legs) switching which page is visible, each
    page keeping its own Mon-Fri/Sat/Sun sections nested inside exactly
    as T41 already built. Verified live against route 467, which already
    had a real terminus loop configured (terminusIndex 3, startIndex 4):
    confirmed the two pages show genuinely different stop lists (4 stops
    outbound, 2 on the return) with real distinct times (not mirrored),
    and that clicking the INBOUND button correctly swaps the visible page
    and highlights the active toggle button. `tsc --noEmit` and
    `npm run build` clean; all `.verify.mts` scripts across the project
    re-run and passing.
- **T44 done: real performance bug in the WASM router, found and fixed
  (2026-09-27).** The user reported "whenever I click on something it
  freezes for a long time, this is getting very annoying" — investigated
  directly rather than guessed: a Playwright driver measured real click-to-
  response latency in the actual packaged app (opening a route's timetable
  editor twice took 16.5s then 38s; the first measurement's "13s on the
  very first click, ~5ms after" shape initially looked like a one-time
  warmup cost, but the second open being *worse* than the first ruled that
  out), then a Chrome DevTools CPU profile taken via CDP around a slow
  open showed 98.5% of the time inside two WASM functions.
  - **Root cause, confirmed by reading the Rust source, not guessed
    further:** `Router::nearest_node` (`rust/game-wasm/src/lib.rs`) did a
    full linear scan over every one of the ~1.4M routable edges in the
    whole-of-Great-Britain graph — checking every geometry point of every
    edge — on *every single call*, with no spatial index and no caching.
    `find_route` calls it twice (once per endpoint); opening a 6-stop
    route's timetable editor computes leg times for all 5 legs
    (`computeLegTimesSeconds`), so up to 10 full-graph scans on one click,
    every single time, forever — not a one-time cost, which is why it
    hit "Show", the timetable editor, and (by the same code path) route
    drawing, depot placement and stop placement alike.
  - **Fix:** a coarse spatial grid over every routable edge's own
    geometry (`edge_grid`, keyed by cell — same ~200m cell size as
    stops-layer.ts's own `LINK_GRID_CELL_DEG`, for consistency, not
    because the exact figure matters here), built once in `Router::new`
    rather than per call. Cells are found via Bresenham's line algorithm
    walked along each edge's own geometry (`cells_along_segment`), not
    just its two endpoints, so a long edge with sparse geometry still
    registers in every cell along its real path — a query from the middle
    of such an edge would otherwise miss it entirely. `nearest_node`
    itself now searches outward ring by ring from the query point's own
    cell, stopping once a match is found and the next ring's own minimum
    possible distance can no longer beat it (the standard grid-search
    termination rule), with a wide (~40km) hard cap as a safety valve for
    a query nowhere near any mapped road, falling back to nothing found
    rather than spinning forever. All the existing endpoint-preference
    logic (`needs_outgoing`/`needs_incoming` — preferring whichever end of
    an edge can actually be departed from or arrived at) is unchanged,
    just moved inside the narrowed search.
  - **Verified, not assumed:** all 13 `game-wasm` unit tests and all 54
    across the Rust workspace still pass unchanged (the tie-break logic
    those tests exercise is byte-for-byte the same, just reached via a
    smaller candidate set). Real before/after timing in the actual
    packaged app: opening the timetable editor **first time 3128ms → 25ms,
    second time 38135ms → 25ms, third time → 20ms**; the "Show" route
    preview (a separate `find_route` call site) **3079ms → 24ms**. Wasm
    rebuilt via `wasm-pack build --target web --release` (the same
    output layout already checked into `src/renderer/wasm/`), `tsc
    --noEmit` and `npm run build` clean.
