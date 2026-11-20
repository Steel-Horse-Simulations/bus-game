import { DatabaseSync } from "node:sqlite";
import { fleetCategoryDigit, powerTypeSuffix, formatFleetNumber, generatePlate, repowerFleetNumber } from "../src/renderer/fleet-numbering.mts";
import { SECONDS_PER_DAY } from "../src/renderer/game-clock.mts";
import { minimumStartingTier, TICKET_MACHINE_PRICE_GBP, type TicketMachineTier } from "../src/renderer/ticket-machine.mts";
import { OPERATOR_LIVERIES, ELECTRIC_LIVERY_VARIANT } from "../src/renderer/livery-seed-data.mts";
import type { VehicleCategory, PowerType } from "../src/renderer/vehicle-catalogue.mts";
import { randomDriverName } from "../src/renderer/driver-names.mts";
import type { PaymentMethod } from "../src/renderer/vehicle-buy-pricing.mts";
export type { TicketMachineTier } from "../src/renderer/ticket-machine.mts";

export type SaveDb = DatabaseSync;

// Exported so the real-save migration checks in db.verify.mts and
// fare-zones.verify.mts can assert against the live constant instead of a
// hardcoded literal (2026-11-01) — a hardcoded copy in each test went
// stale on every schema bump this session (3 times), each one only
// caught by the test failing rather than being naturally correct.
export const SCHEMA_VERSION = 70;

const SCHEMA = `
-- "ticket_machine_tier" and "has_tap_on_tap_off" (TICKETING.md §1/§2,
-- first increment, 2026-11-05): a depot group's ticket machines are
-- always the SAME tier across the whole group ("Upgrades are a bulk
-- action for the whole group" — TICKETING.md's own wording, so one
-- field per group is the real model, not a simplification). The
-- "Advanced ratchet" rule (once any group has Advanced, every NEW group
-- must start there) is enforced in createDepotGroup below, not here —
-- it only constrains a group's STARTING tier, never a later change to
-- an existing one. Both deliberately track only the real-world state
-- and its informational price (ticket-machine.mts) — no money is
-- actually deducted (no finance system exists yet, Phase 5) and no
-- install-time/engineer-vs-supplier scheduling exists yet either
-- (TICKETING.md §3, Phase 7) — same "capacity/scheduling only, be
-- honest about what's not simulated" scope call as repaint_bookings'
-- own CREATE TABLE comment. has_tap_on_tap_off is a plain boolean, not
-- a per-vehicle fitting/activation-threshold model (TICKETING.md: "only
-- becomes active once every bus in the depot group has it") — that
-- per-vehicle nuance is deferred to the same future install-scheduling
-- increment as the tier upgrades' own engineer/supplier timing.
CREATE TABLE IF NOT EXISTS depot_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  main_bus_station_osm_id INTEGER,
  ticket_machine_tier TEXT NOT NULL DEFAULT 'basic' CHECK (ticket_machine_tier IN ('basic', 'mid', 'advanced')),
  has_tap_on_tap_off INTEGER NOT NULL DEFAULT 0,
  -- A depot group's own colour (T154, confirmed 2026-11-07) — earmarked
  -- for a second branding-mask region on the Sightseeing livery
  -- specifically (for now), separate from whatever region a route's own
  -- colour (T153) tints. Data side only — no mask-tinting renderer exists
  -- in code at all yet (confirmed, not assumed). Same default as routes'
  -- own colour, for consistency.
  colour TEXT NOT NULL DEFAULT '#3b82f6'
);

CREATE TABLE IF NOT EXISTS osm_overrides (
  entity_type TEXT NOT NULL,
  osm_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  overridden_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, osm_id, field)
);

-- A route (DESIGN.md §6) is just a number, its owning depot group, its
-- drawn points and its computed orientation for now — variations, express
-- flags, activation state and timetables are later increments (route-draw.ts
-- is still the only thing that builds the point list). "points" is the
-- drawn DraftPoint[] as JSON: stops keep their osmId, waypoints don't.
-- "orientation" records which way the stored point order runs: travelling
-- points[0] -> points[last] is that direction (DESIGN.md §6 "Direction") —
-- the reverse traversal is the other one. Computed once at save time from
-- the owning depot group's main_bus_station_osm_id; there is no settlement
-- fallback yet (OPEN-ITEMS.md), so a depot group without one can't save a
-- route with a direction.
-- "terminus_index"/"start_index" (nullable, always both-or-neither) are the
-- one additional interior stop each the player can flag to end the outbound
-- leg early / begin the return leg, encoding a terminus loop (DESIGN.md §6
-- "Start and terminus stops"). The two may be the same stop (an early
-- terminus with no real loop). Null means neither is set: points[0]/
-- points[last] are the only start/terminus, same as before these columns
-- existed.
-- "colour" (DESIGN.md §11) is a plain hex string the player sets directly,
-- shown for the route's line on the map and its list swatch — separate from,
-- and ahead of, the livery system (OPERATIONS.md §4/§5) which is Phase 3+.
-- "name" is a plain player-set label (nullable — a route need not have one),
-- shown instead of the derived-from-last-stop destination the list falls
-- back to. It's a manual stand-in for the real destination display DESIGN.md
-- §6/§7 describes (built from variations/extensions), which needs those
-- systems and doesn't exist yet.
-- "pickup_dropoff_overrides" is a JSON array of {pointIndex, value} —
-- value is 'pickup_only' or 'setdown_only' — overriding, for this route
-- only, the stop's own global pick-up/set-down default (an osm_overrides
-- entry, entityType 'stop', field 'pickupDropoff'). Absence at either level
-- means unrestricted ("both"). Indexed against this route's own "points",
-- so cleared on any edit the same way timing points are, since the points
-- list (and therefore what a given pointIndex means) may have changed.
-- "timing_point_indexes" is a plain JSON array of numbers (schema v56->v57)
-- — which of this route's own "points" are timing points, same
-- indexed-against-"points" convention as pickup_dropoff_overrides right
-- above, cleared the same way on updateRoute for the same reason. DESIGN.md
-- §4 ("Timing point — set on the stop, overridable per route") and §6
-- ("timing points are per route") already specified this at the route
-- level; it only ever lived inside each route_timetables row's own
-- "timing_points" column before this, which meant re-flagging the same
-- stops for every separate day-type/direction component on the route. The
-- actual TIMES at each of these points (legMinutes/dwellMinutes) stay on
-- the timetable component (route_timetables.timing_points, below) since
-- those genuinely do vary by day type — only WHICH stops count moves here.
-- Point 0 (the journey's own departure) and the route's own terminus are
-- always implicit timing points and never appear in this list, the same
-- "always, regardless of this list" treatment route-timetable-panel.ts
-- and computeOffsets already give them.
-- "parent_route_id" (nullable, soft reference — no foreign-key cascade is
-- enabled on this database, same as depot_group_id) is the route this is a
-- lettered variation of (DESIGN.md §6 "Variations"), used for vehicle/
-- livery inheritance and for finding sibling variations when computing the
-- padding model (§7). Deliberately nullable even when "variation_letter"
-- is set: "route 7A and 7B can exist with no 7," so a variation need not
-- have a real parent row to point to. "variation_letter" (nullable TEXT)
-- is the single letter identifying this as a lettered variation (e.g. "A"
-- for "7A") — stored explicitly rather than parsed off the end of
-- "number", so an express's leading "X" (a separate mechanism, DESIGN.md
-- §6 "Express services") is never confused with a trailing variation
-- letter. A route with both columns null is a plain route or an
-- express-only route, not a variation. Set together by whatever UI creates
-- a variation; not validated against "number" itself matching at this
-- layer.
-- "is_minor_variation" (DESIGN.md §6, confirmed 2026-11-01 — the real
-- Skye 56 example, skipping Bernisdale on certain workings) marks a
-- variation that shares its parent's exact "number" with no letter at
-- all, and is ALWAYS live-linked to the parent's current path (see
-- route-combine-variations.mts's own resolveRoutePoints) rather than
-- only when the player explicitly builds from a sibling's diversion
-- (composed_from_route_ids). Mutually exclusive with variation_letter —
-- a route is a major variation (lettered, opt-in live link) or a minor
-- one (unlettered, always live-linked), never both — but enforced in
-- createRoute/updateRoute below, NOT as a CHECK constraint here.
-- Verified directly (not assumed) that a CHECK referencing
-- variation_letter would be unsafe: this table has real FK dependents
-- (route_timetables.route_id, duty_pieces.route_id and others, all
-- REFERENCES routes(id)), and this project's node:sqlite build rewrites
-- a dependent table's own FK clause to follow a RENAMEd parent table
-- (confirmed with a throwaway test — renaming table a to a_old while
-- b.a_id REFERENCES a(id) exists rewrites b's own schema to say
-- REFERENCES "a_old"(id) instead), which then makes DROP TABLE a_old
-- fail with "FOREIGN KEY constraint failed" once real rows exist —
-- exactly what a CHECK needing the rename-rebuild-drop rebuild pattern
-- would hit the moment a real save has timetables/duties on any route.
-- A plain ADD COLUMN (below) sidesteps this entirely.
-- "composed_from_route_ids" (DESIGN.md §6 "Combining variations") is a JSON
-- array of other route ids whose own diversions this variation reuses —
-- empty for an ordinary route or a variation drawn entirely by hand. When
-- non-empty, this route's own "points" column is a CACHE, not the source of
-- truth: the real, current points are re-derived from the parent route (see
-- parent_route_id) and these referenced siblings via composeVariation
-- (src/renderer/route-combine-variations.mts) every time anything actually
-- needs them, and the cache is refreshed by cascading from whichever save
-- triggered it — the same "merge is a projection, not a copy" principle
-- CLAUDE.md already establishes for timetables, so editing a reused
-- diversion updates every variation built from it automatically, not just
-- the one being edited. Decided by the user (2026-10-10): live reference,
-- not an independent copy at creation time.
-- "hail_and_ride_sections" (DESIGN.md §6 "Hail and ride") is a JSON array of
-- {fromIndex, toIndex} — both indexes into this route's own "points" column
-- and both always a "stop" point, never a waypoint, per the spec's "two
-- stops nominated on that route." Threaded through create/update like
-- terminus_index/start_index (built up during the same click-to-draw
-- session and persisted as-is), not reset-on-save like
-- pickup_dropoff_overrides. This is deliberately only the player-facing
-- half of the real feature: the spec's own invisible-boarding-points-every-
-- couple-hundred-metres and journey-planner integration need the RAPTOR
-- planner (Phase 4, not built yet) and are a separate increment — "store
-- the flag now, wire up the behaviour once the underlying mechanism
-- exists," the same precedent as Connection stop/long stop capacity.
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  number TEXT NOT NULL,
  points TEXT NOT NULL,
  orientation TEXT NOT NULL CHECK (orientation IN ('inbound', 'outbound')),
  terminus_index INTEGER,
  start_index INTEGER,
  colour TEXT NOT NULL DEFAULT '#3b82f6',
  name TEXT,
  pickup_dropoff_overrides TEXT NOT NULL DEFAULT '[]',
  timing_point_indexes TEXT NOT NULL DEFAULT '[]',
  parent_route_id INTEGER REFERENCES routes(id),
  variation_letter TEXT,
  composed_from_route_ids TEXT NOT NULL DEFAULT '[]',
  hail_and_ride_sections TEXT NOT NULL DEFAULT '[]',
  segments TEXT NOT NULL DEFAULT '[]',
  route_type TEXT NOT NULL DEFAULT 'ordinary' CHECK (route_type IN ('ordinary', 'night', 'sightseeing', 'airport_express', 'long_distance', 'staff')),
  is_minor_variation INTEGER NOT NULL DEFAULT 0,
  assigned_livery_id INTEGER REFERENCES liveries(id),
  use_branded_colour INTEGER NOT NULL DEFAULT 0,
  -- Manual, player-set vehicle eligibility restrictions (Q19, OPEN-ITEMS.md
  -- Q18+Q19 plan) — all 4 nullable, "unset means any vehicle qualifies on
  -- that axis," set via setRouteVehicleRestrictions, never createRoute/
  -- updateRoute, same dedicated-setter pattern as assigned_livery_id/
  -- use_branded_colour just above. The automatic OSM-road-limit axis
  -- (height/weight/length/width) carries no column of its own — it's
  -- computed at read time from the pipeline road graph + the vehicle
  -- catalogue, nothing to persist per-route.
  vehicle_restriction_base_type TEXT CHECK (vehicle_restriction_base_type IS NULL OR vehicle_restriction_base_type IN ('Double-deckers', 'Specialised (sightseeing, open-top only)', 'Single-deckers / midibuses', 'Minibus', 'Coaches')),
  vehicle_restriction_power_type TEXT CHECK (vehicle_restriction_power_type IS NULL OR vehicle_restriction_power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
  vehicle_restriction_axle_count TEXT CHECK (vehicle_restriction_axle_count IS NULL OR vehicle_restriction_axle_count IN ('twin-axle', 'tri-axle')),
  vehicle_restriction_livery_id INTEGER REFERENCES liveries(id)
);

-- Shared long-distance sections (live design discussion, 2026-10-31) — a
-- reusable piece of drawn path, authored once in its own menu, that
-- several otherwise-unrelated long-distance routes can all build from
-- (DESIGN.md: several services sharing a long corridor, e.g. Glasgow-
-- Carlisle, no longer need their own independent find_route call over
-- that same stretch). Deliberately a standalone table, not an extension
-- of routes' own composed_from_route_ids/parent_route_id composition
-- (route-combine-variations.mts) — that mechanism specifically matches a
-- sibling's diversion against a shared TRUNK at common stop points, which
-- doesn't apply here: a section has no "trunk" relationship to the routes
-- using it, it's just reused raw geometry spliced in wherever the player
-- puts it. No depot_group_id — sections are deliberately company-wide,
-- since the whole point is reuse across routes that may belong to
-- different depot groups/operators meeting at a shared corridor; this
-- wasn't explicitly confirmed by the user and is flagged as an open
-- question, not a silent assumption.
CREATE TABLE IF NOT EXISTS long_distance_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  points TEXT NOT NULL
);

-- A route's timetable (DESIGN.md §7), scoped to the minimal slice built so
-- far: one component per route per day type — no variations, padding,
-- connections, extensions or event calendar yet, all deliberately deferred
-- (see OPEN-ITEMS.md T29). "time_bands" is a JSON array of {startMinutes,
-- endMinutes, intervalMinutes} (route-timetable.mts's TimeBand) — DESIGN.md
-- §7 "Structure": "frequency varies across the day," the old single flat
-- start/end/interval being exactly the one-band case. Deliberately doesn't
-- also vary running time per band — see route-timetable.mts's own comment
-- on why that part of the spec is intentionally not built here.
-- "timing_points" is the player's own input: a JSON array of {pointIndex,
-- standardPaddingMinutes, peakPaddingMinutes, dwellMinutes} — the
-- published PADDING at each of the route's own timing points
-- (routes.timing_point_indexes, which stop counts as one at all; schema
-- v56->v57), on top of whatever the real fastest achievable time for that
-- leg currently is (schema v65->v66, 2026-11-15 — "can it be set so its
-- an amount of time more than the minimum with a separate time for peak
-- times of day"). peakPaddingMinutes is null for an island route's own
-- single timing point (fare-journey.mts's isIslandDepotGroup) — no
-- separate peak figure at all, standardPaddingMinutes applies regardless
-- of time of day. Only ever has entries for pointIndexes currently in
-- that route-level list; a component built before v57 may still carry a
-- stale entry for a point the route no longer flags, left as-is rather
-- than migrated (see that migration's own comment).
-- "arrival_offsets_seconds"/"departure_offsets_seconds" and their "_peak"
-- siblings (schema v65->v66) are the derived output — one entry per route
-- point, seconds from the journey's departure at point 0 — computed once
-- from the WASM router's real running times (only available in the
-- renderer, not here) and cached so a stop/station timetable query never
-- needs to re-route every leg just to read a time back. The "_peak" pair
-- is the exact same computation using each timing point's own
-- peakPaddingMinutes (falling back to standardPaddingMinutes where unset)
-- instead — buildRouteTimetableGrid (route-timetable-grid.mts) picks
-- between the two pairs per JOURNEY by that journey's own real departure
-- clock time, not once for the whole component, since the same physical
-- timing point can publish a different figure for an 08:00 working than
-- an 11:00 one. Regenerated whenever the frequency, timing points, or the
-- route's own point list changes. One row per (route, day type): a route
-- not yet given a timetable for a day type simply has no row for it.
-- "excluded_departure_minutes" is a JSON array
-- of specific generated departure minutes this component should NOT run
-- (a live user request: 398A taking over 398's own 0100 slot without
-- editing 398's own time bands) — checked against the live generated
-- list each time, so a minute that's no longer generated (bands changed)
-- simply has no effect rather than needing its own cleanup pass.
-- "custom_departure_minutes" is the opposite: specific one-off departures
-- entered directly rather than produced by any band's own interval (a
-- live user request: "an option to put in custom times for departures
-- instead of everything being on an interval") — merged into the
-- generated list (deduplicated against it, not appended blindly) rather
-- than kept as a separate, second timetable to reconcile.
-- "direction" defaults to 'both' — one component drives the whole route,
-- today's only behaviour. A terminus-loop route (DESIGN.md §6: one point
-- list encoding an outbound leg and a return leg) can instead have up to
-- two further components, 'outbound' and 'inbound', each independently
-- timetabled against just that leg's own points — a live user request:
-- "I should be able to set inbound and outbound times separately... useful
-- if I am running from multiple depots," since two depots each crewing
-- one leg of a loop are genuinely two separate operations, not one bus
-- continuing round a shared schedule. A non-loop route (most routes —
-- inbound/outbound already two separate Route rows, like 398/398A) only
-- ever has 'both' rows; the UI never offers the direction-specific option
-- for one. Reading a route's timetable prefers a leg-specific row over
-- 'both' where one exists (stops-layer.ts / route-timetable-panel.ts),
-- and falls back to 'both' otherwise — both kinds can coexist per
-- (route, day type), the extra ones simply unused once split rows exist.
-- "day_type" became "weekday_mask" + "term_facet" (schema v19->v20) — real
-- Skye timetable data (UK-EXPANSION.md §13) needs sub-patterns the old
-- fixed monday_friday/saturday/sunday enum can't express at all: 608 runs
-- Tuesdays-and-Thursdays on a different pattern than the rest of the week,
-- and 607 runs Fridays differently from Monday-Thursday. A bitmask (bit 0
-- = Monday ... bit 6 = Sunday, see WEEKDAY_BITS below) can express any
-- weekday combination without a schema change every time real data shows
-- a new one, crossed with an independent term_facet ('any' / 'term_time'
-- / 'holiday') — originally for Skye's own real school-day timetable
-- splits, which the game no longer models (school contracts and the
-- school-day/holiday split dropped, 2026-11-08), so term_facet is now
-- dormant rather than something a real pattern still needs. The
-- weekday_mask side is now exposed directly to the UI as a freeform
-- number (2026-11-07, the custom day-type picker — RouteTimetable.
-- weekdayMask below, electron/db.mts); term_facet stays
-- hardcoded to 'any' in upsertRouteTimetable for now — letting a player
-- actually pick a term-time pattern too is a separate, later increment
-- (OPEN-ITEMS.md).
-- "mirror_source_timetable_id"/"mirror_offset_minutes" (schema v64->v65):
-- when set, this component's own departures aren't generated from
-- time_bands at all — every real departure+exclude+custom-resolved
-- departure of the REFERENCED route_timetables row becomes a departure
-- here, offset by mirror_offset_minutes minutes after that service's own
-- arrival at its real end point (DESIGN.md §7's "Return departures" idea,
-- generalised to any two services rather than just a route's own
-- variations) — "a button to set a timetable to have a service after a
-- settable time after one arrives, it will make return journeys much
-- easier." A live link, not a one-time copy ("can the auto timetable bit
-- then automatically update whenever the other timetable is updated") —
-- route-timetable-grid.mts's generateBaseDepartureMinutes resolves it
-- fresh every time, the same "merged view is a projection" principle the
-- merged family grid already follows. Both nullable/default NULL; a
-- mirroring component's own time_bands are simply ignored while set
-- (left in place, not cleared, so turning mirror mode back off restores
-- whatever bands were there before). Deliberately NOT allowed to
-- reference another mirroring row (enforced by the application, not a
-- CHECK constraint here — SQLite can't express "the referenced row's own
-- mirror_source_timetable_id is NULL" declaratively) — this prevents a
-- mirror-of-a-mirror chain/cycle rather than needing cycle-detection at
-- generation time.
CREATE TABLE IF NOT EXISTS route_timetables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  weekday_mask INTEGER NOT NULL,
  term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
  direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
  time_bands TEXT NOT NULL,
  timing_points TEXT NOT NULL,
  arrival_offsets_seconds TEXT NOT NULL,
  departure_offsets_seconds TEXT NOT NULL,
  -- Peak-variant offsets (schema v65->v66) — see timing_points' own SCHEMA
  -- comment below for the full reasoning.
  arrival_offsets_seconds_peak TEXT NOT NULL DEFAULT '[]',
  departure_offsets_seconds_peak TEXT NOT NULL DEFAULT '[]',
  excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
  custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
  mirror_source_timetable_id INTEGER REFERENCES route_timetables(id),
  mirror_offset_minutes INTEGER,
  UNIQUE (route_id, weekday_mask, term_facet, direction)
);

-- A stop the player places directly (DESIGN.md §4: "Real OSM stops, plus
-- stops the player places"), kerb-snapped by the WASM router's
-- place_stop() at creation time rather than stored raw at the click
-- position. "bus_legal" records the router's own warning flag from that
-- same call (the road it snapped to may not be one buses can legally use)
-- so the map/panel can keep showing the warning without re-querying the
-- router. This table only ever grows an id; everywhere else in the game
-- (route points, the override layer, stop popups) a player-placed stop is
-- identified by the *negative* of this id, so it can be treated exactly
-- like a real OSM stop's (always-positive) osmId without ever colliding
-- with one — no "kind" flag needed at any of those call sites.
-- "depot_id" (schema v57->v58, live request 2026-11-08: "each depot have
-- the option to have a bus stop placed within it... only visible when
-- making a shuttle bus route") — nullable, non-null only for the one
-- special stop a depot can place at its own location, used as a staff-
-- route (schema's own "staff" RouteType) terminus. lon/lat for one of
-- these is the depot's own, copied in directly at creation
-- (createDepotStop) rather than kerb-snapped — a depot is already a
-- routable point in its own right everywhere else in this file (every
-- dead-mileage/pull-out/pull-in calculation already routes to/from a
-- depot's raw {lon, lat} with no snap step), so this needs none either.
-- Visibility (only while drawing a "staff" route) is enforced entirely
-- in the renderer (stops-layer.ts's visibleStops) — nothing here blocks
-- an ordinary route from using one if a caller really wanted to.
CREATE TABLE IF NOT EXISTS player_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  bus_legal INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  depot_id INTEGER REFERENCES depots(id)
);

-- Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9 redesign: stop
-- ownership dropped...", 2026-11-16). Keyed by the real OSM stop id, not a
-- player_stops row — these are ordinary council-owned stops, never bought
-- by the player, so there's nothing else in this save that already
-- identifies one; this table is the only place a real stop's own extra
-- state is persisted. One row is created the moment any upgrade first
-- triggers or is accelerated at that stop; a stop with no row yet has
-- none of the three. installed_at_game_day is kept per upgrade (not just
-- a single shared timestamp) since they trigger independently.
CREATE TABLE IF NOT EXISTS stop_upgrades (
  stop_osm_id INTEGER PRIMARY KEY,
  has_seating INTEGER NOT NULL DEFAULT 0,
  has_lighting INTEGER NOT NULL DEFAULT 0,
  has_shelter INTEGER NOT NULL DEFAULT 0,
  seating_installed_game_day INTEGER,
  lighting_installed_game_day INTEGER,
  shelter_installed_game_day INTEGER
);

-- A depot (OPERATIONS.md §2 "Placement and entrances"): a physical site the
-- player places on the map, belonging to exactly one depot group. Only the
-- placement mechanic itself is built here — deliberately not the tier
-- system (outstation/tiny/small/main), rent-vs-buy economics, build time,
-- capacity or maintenance facilities, all of which depend on money (Phase
-- 5) and staffing (Phase 6/7) that don't exist yet. "lon"/"lat" is the raw
-- click position (the site itself, which OPERATIONS.md says can be "built
-- anywhere suitable... enough space with road access") — unlike a stop,
-- this is never kerb-snapped, since a depot isn't a point on the road
-- itself.
CREATE TABLE IF NOT EXISTS depots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  name TEXT NOT NULL,
  lon REAL NOT NULL,
  lat REAL NOT NULL
);

-- A depot's access point(s) (OPERATIONS.md: "Entrances are placed by the
-- player on the surrounding roads, and there can be several. Each can be
-- entry only, exit only, or both"). Road-snapped at creation time by the
-- WASM router (Router::snap_entrance_to_junction) — "lon"/"lat" is the
-- snapped position, not the raw click. No foreign-key cascade is enabled
-- on this database (same as everywhere else), so deleting a depot must
-- delete its own entrances first.
-- Shown as a plain dot, not an oriented marker — a live user correction
-- (2026-10-02) after the previous oriented semi-circle marker (needing a
-- bearing to rotate and a road width to scale by, plus a manual nudge to
-- compensate for both) proved "constantly breaking": "entrances and exits
-- should not be shown on the map, only dots on the road... We should
-- remove all code that isnt needed other than for the basic
-- functionality." The bearing/road_width_m/size_scale columns and the
-- whole nudge mechanism were removed accordingly (schema v23->v24) — see
-- OPEN-ITEMS.md T61/T62 for the full history of why they existed.
CREATE TABLE IF NOT EXISTS depot_entrances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('entry', 'exit', 'both'))
);

-- A player-created stop group (DESIGN.md §4 "Grouped stops"). Originally
-- seeded automatically from OSM public_transport=stop_area relations; that
-- was dropped (2026-09-27, see OPEN-ITEMS.md) after a real relation on
-- Princes Street, Edinburgh grouped far more stops than made sense
-- together, with no way to correct it. Now the same "manual only, no
-- automatic seeding" model as the railway/subway/tram stop link
-- (stops-layer.ts). This table exists only to mint a stable id for a group
-- the player has created — its own name/hidden/always_show_members state
-- lives in osm_overrides under entity_type 'stop_group' exactly as before,
-- and its membership lives in osm_overrides under entity_type 'stop',
-- field 'group_id' (mirroring how bus station stand membership already
-- works), not a column here. A group's own map position is always the
-- live centroid of its current members, recomputed in the renderer, not
-- stored.
CREATE TABLE IF NOT EXISTS stop_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL
);

-- A player-created bus station (live request, 2026-11-08: "group bus stops
-- into a bus station but without having to place one" — the trigger was a
-- route whose sibling variations showed inconsistent inbound/outbound
-- because their depot group had no main_bus_station_osm_id to anchor on,
-- and there was no way to create one where OSM has none). Mints only an id,
-- exactly like stop_groups above, which this otherwise mirrors completely:
-- name lives in osm_overrides under entity_type 'bus_station' (the same
-- entity_type a real OSM station's own name override already uses),
-- membership is the SAME "stop"/"bus_station" override field every stop's
-- station assignment already uses — just pointing at one of these ids
-- instead of a real OSM one — and position is always the live centroid of
-- current members, recomputed in the renderer, same as a stop_group's own.
-- The one thing this needs that stop_groups doesn't: an osmId space that
-- can never collide with player_stops' own negative ids (-1, -2, -3...) —
-- stops-layer.ts offsets this table's own ids by a large constant before
-- using them as an osmId anywhere, rather than coordinating the two
-- tables' autoincrement counters.
CREATE TABLE IF NOT EXISTS player_bus_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL
);

-- A vehicle dealer (T62, OPEN-ITEMS.md — CLAUDE.md's Phase 9 "dealer
-- network," placed now so the real UK-EXPANSION.md §2 locations aren't
-- lost before Phase 9's buying/collection logistics exist). Deliberately
-- NOT linked to a depot_group — a real dealer (e.g. Volvo Glasgow) isn't
-- owned by any one operator, any depot group can buy from it, confirmed
-- directly with the user rather than assumed. "manufacturer" is a fixed
-- enum, not free text, matching UK-EXPANSION.md §2's own closed list —
-- Phase 9's nearest-depot collection rule (Wrightbus/Yutong) is
-- manufacturer-specific, so this needs to be a real, queryable field now
-- rather than inferred from a name string later. Otherwise an exact
-- mirror of "depots": same "lon"/"lat" is the raw site click, never
-- kerb-snapped.
-- manufacturer (schema v58->v59): 'western_commercial' replaced with
-- 'evm' — T179, confirmed 2026-11-13: Western Commercial only ever
-- stood in for EVM-prefixed vehicles (Sprinter/EVM Cityline) before
-- England was in scope; now EVM gets its own real dealer entry and
-- Western Commercial is removed entirely, not just renamed in place
-- (see the v58->v59 migration below for the real rebuild + row
-- translation this needs, since a CHECK can't be altered with a plain
-- ADD COLUMN). is_repower_site (same version): at most one dealer per
-- manufacturer may have this set (enforced in setDealerRepowerSite, not
-- a CHECK — the same "per-manufacturer uniqueness is an application-
-- layer rule" reasoning routes.variation_letter's own SCHEMA comment
-- already gives for why that one isn't a CHECK either) — the one real
-- site where that manufacturer re-powers buses (T179).
CREATE TABLE IF NOT EXISTS dealers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL CHECK (manufacturer IN ('volvo', 'adl', 'evm', 'wrightbus', 'yutong')),
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  -- Explicit, player-confirmed "I've added every entrance/exit this site
  -- needs" (2026-11-01, live user request) — replaces the old implicit
  -- "has at least one entrance" signal dealer-reference-pins.ts used to
  -- decide a dealer was done, which was wrong for any real site needing
  -- more than one entrance (the pin vanished after the first). Once set,
  -- a future session hard-codes that dealer's confirmed position and
  -- entrances into source (the same way REFERENCE_PINS already hard-codes
  -- position), per the user's own stated plan.
  is_entrances_complete INTEGER NOT NULL DEFAULT 0,
  is_repower_site INTEGER NOT NULL DEFAULT 0
);

-- A dealer's own entrances — exact mirror of depot_entrances, including
-- its plain-dot-not-oriented-marker simplification (see that table's own
-- comment).
CREATE TABLE IF NOT EXISTS dealer_entrances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('entry', 'exit', 'both'))
);

-- A minimal livery: its name and the two colours taken from its badge
-- (OPERATIONS.md §4). The badge artwork and branding masks come later.
CREATE TABLE IF NOT EXISTS liveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  primary_colour TEXT NOT NULL,
  secondary_colour TEXT NOT NULL
);

-- A livery's manual black/white override for one support vehicle icon.
-- No row means the automatic contrast pick (icon-contrast.ts) is used.
CREATE TABLE IF NOT EXISTS livery_support_icon_overrides (
  livery_id INTEGER NOT NULL REFERENCES liveries(id) ON DELETE CASCADE,
  icon TEXT NOT NULL CHECK (icon IN ('spanner', 'person', 'recovery', 'parcel')),
  colour TEXT NOT NULL CHECK (colour IN ('black', 'white')),
  PRIMARY KEY (livery_id, icon)
);

-- Operator groups (T155, livery-seed-data.mts's OPERATOR_LIVERIES) — a
-- depot GROUP's own player-set enabled-operator list, replacing nothing
-- (RESTRICTED_AREA_LIVERIES/the other existing locks still apply,
-- ANDed together) but adding this new, general, player-editable layer
-- on top. No row for a given (depot_group_id, operator_name) pair means
-- that operator is DISABLED there — every existing and newly-created
-- depot group is seeded with every operator enabled (openSave/
-- createDepotGroup) so this ships without silently narrowing anyone's
-- existing fleet down to plain white only.
CREATE TABLE IF NOT EXISTS depot_group_operators (
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id) ON DELETE CASCADE,
  operator_name TEXT NOT NULL,
  PRIMARY KEY (depot_group_id, operator_name)
);

-- A single DEPOT's own narrower selection within whatever its depot
-- group's enabled operators allow (T155) — no rows at all means "not
-- narrowed, inherits everything the group allows" (confirmed directly),
-- not "nothing available." A livery tied to another via
-- LIVERY_LINKED_TO (training liveries, Stagecoach Electric/First
-- Electric) ignores this table entirely for itself — it rides along
-- with whichever trigger livery is actually available at this depot,
-- confirmed never needing its own explicit row here.
CREATE TABLE IF NOT EXISTS depot_liveries (
  depot_id INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  livery_id INTEGER NOT NULL REFERENCES liveries(id) ON DELETE CASCADE,
  PRIMARY KEY (depot_id, livery_id)
);

-- A repaint shop the player has placed (OPERATIONS.md §5 — Ferrymill is
-- the original real one, ACE Commercial Refinishers the second).
-- concurrent_capacity and turnaround_days replace the old single
-- "weekly_capacity" figure entirely (2026-11-01, live user correction via
-- chat: "Ferrymill Motors can have 7 vehicles in its workshop at once...
-- A full repaint at Ferrymill takes 5 days, Monday to Friday only" —
-- "weekly capacity" was never the real shape of this at all: a shop has a
-- fixed number of bays (how many vehicles it can work on at once) and a
-- fixed turnaround time per vehicle (in real working days, weekends
-- excluded elsewhere in the app logic, not stored here), not a flat
-- weekly intake rate. Neither has a default — the real figures come from
-- the user, same as before.
CREATE TABLE IF NOT EXISTS repaint_shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  concurrent_capacity INTEGER NOT NULL CHECK (concurrent_capacity > 0),
  turnaround_days INTEGER NOT NULL CHECK (turnaround_days > 0)
);

-- A repaint shop's own entrances — exact mirror of dealer_entrances
-- (2026-11-01, live user request: "Loughborough is a repaint shop but I
-- have no way of adding an entrance to it" — repaint shops had no
-- entrance concept at all before this, unlike dealers/depots, which a
-- real site needs for dead-mileage routing the same as any other).
CREATE TABLE IF NOT EXISTS repaint_shop_entrances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repaint_shop_id INTEGER NOT NULL REFERENCES repaint_shops(id),
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('entry', 'exit', 'both'))
);

-- A vehicle booked in for a repaint (OPERATIONS.md §5 "Repainting"),
-- capacity/scheduling only (2026-11-05, user's own explicit scope call —
-- there is no money/finance system anywhere in this game yet, and
-- transferVehicle's own comment already notes there's no driver/duty
-- system to hang a simulated trip there-and-back on either). So this
-- tracks WHEN a vehicle is busy/away and WHAT it would cost, for display
-- only — nothing here deducts real money, and no travel time is
-- simulated; the vehicle is treated as departing immediately, same
-- "immediate, not simulated in transit" simplification transferVehicle
-- already makes. repaint_shop_id is NULL for a 'simple' repaint (done at
-- the vehicle's own home depot, never leaves). *_game_day are whole-day
-- indices from the game clock's own epoch (see game-clock.mts's own
-- gameDateTimeFromSeconds) — day granularity is all the real spec needs
-- ("5 days, Monday to Friday only" / "1-2 days"). base/discount/final
-- price are a snapshot at booking time, not recomputed later, so a later
-- catalogue price change can't retroactively change what a vehicle
-- already booked in is shown to cost.
CREATE TABLE IF NOT EXISTS repaint_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  repaint_shop_id INTEGER REFERENCES repaint_shops(id),
  repaint_type TEXT NOT NULL CHECK (repaint_type IN ('full', 'simple')),
  base_price_gbp INTEGER NOT NULL,
  discount_percent INTEGER NOT NULL,
  final_price_gbp INTEGER NOT NULL,
  booked_game_day INTEGER NOT NULL,
  start_game_day INTEGER NOT NULL,
  completion_game_day INTEGER NOT NULL
);

-- A vehicle booked in for a re-power (T179, OPEN-ITEMS.md, confirmed
-- 2026-11-13) — converting diesel to electric/hydrogen at the vehicle's
-- own manufacturer's one designated site (dealers.is_repower_site).
-- Exact same "capacity/scheduling snapshot only, no real money deducted
-- yet" shape as repaint_bookings above, same reasons. dealer_id is never
-- null (unlike repaint_bookings.repaint_shop_id, which is null for a
-- home-depot "simple" repaint) — every re-power happens at a real site,
-- there's no home-depot equivalent. to_power_type excludes 'diesel'/
-- 'hybrid' deliberately — nothing converts TO either, only away from
-- diesel.
CREATE TABLE IF NOT EXISTS repower_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  to_power_type TEXT NOT NULL CHECK (to_power_type IN ('electric', 'hydrogen')),
  final_price_gbp INTEGER NOT NULL,
  booked_game_day INTEGER NOT NULL,
  start_game_day INTEGER NOT NULL,
  completion_game_day INTEGER NOT NULL
);

-- A dead mileage route between a dealer and a depot (DESIGN.md "Dead mileage
-- routes"). trunk_waypoints is the shared path from the dealer entrance,
-- as a JSON array of {lon, lat} the player added to the router's path.
-- Near the depot the route forks into one or more branches (below), the
-- same shape as a route variation splitting off a trunk but only over the
-- last short stretch — one branch per depot entrance the player connects.
-- A depot with a single combined entrance/exit point has just one branch,
-- which is not a real fork.
-- direction matters for real routing, not just labelling: one-way streets
-- mean "dealer to depot" and "depot to dealer" are genuinely different
-- paths, not the same path reversed (a real bug found live — the outbound
-- path was computed dealer-to-entrance and just reused, which sent it the
-- wrong way down one-way roads). inbound's trunk runs dealer -> fork,
-- outbound's runs fork -> dealer; see dead-mileage-preview.ts for how each
-- direction's own stop order is built so every router call matches the
-- real direction of travel.
CREATE TABLE IF NOT EXISTS dead_mileage_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_entrance_id INTEGER NOT NULL REFERENCES dealer_entrances(id) ON DELETE CASCADE,
  depot_id INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  trunk_waypoints TEXT NOT NULL DEFAULT '[]'
);

-- One branch of a dead mileage route's own fork, from the end of its
-- trunk to one specific depot entrance. waypoints are added after the
-- trunk, same shape as trunk_waypoints above. SQLite does not enforce
-- ON DELETE CASCADE unless PRAGMA foreign_keys is on (it is not, here),
-- so deleteDeadMileageRoute removes a route's own branches itself rather
-- than relying on it.
CREATE TABLE IF NOT EXISTS dead_mileage_branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES dead_mileage_routes(id),
  depot_entrance_id INTEGER NOT NULL REFERENCES depot_entrances(id),
  waypoints TEXT NOT NULL DEFAULT '[]',
  UNIQUE (route_id, depot_entrance_id)
);

-- A driver (OPERATIONS.md §6 "Staff"), schema v57->v58 — the first real
-- driver entity in the save. Deliberately minimal, confirmed with the
-- user (2026-11-08): a roster entry a duty can be assigned to, no hours/
-- rota validation and no wage cost yet (both genuinely separate, later
-- increments) — one driver permanently assigned per duty, no daily
-- rotation. "score" is the 5-level progression OPERATIONS.md §6's own
-- wage-ratio table gives drivers specifically (trainee/novice/competent/
-- professional, plus fleet_elite as the extra 5th level drivers get that
-- every other role's own 4-level score doesn't) — player-set directly
-- for now, since the real progression-by-hours-worked mechanic that
-- table describes doesn't exist yet either. depot_id is this driver's
-- home depot, the same one-of-the-group's-own-depots anchoring duties
-- already use below.
-- private_hire_vehicle_id (schema v60->v61, T183 — private hire revival,
-- Q20/OPEN-ITEMS.md): set only on a driver auto-hired for a private-hire
-- vehicle (one bought/liveried Lothian Coaches on an eligible class —
-- see liveryVehicleLockReason, livery-seed-data.mts), traceable back to
-- that vehicle so deleteVehicle can clean the driver up too (no orphaned
-- phantom drivers left behind when the vehicle is sold). Null for every
-- ordinary driver, which is every driver that existed before this.
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  name TEXT NOT NULL,
  score TEXT NOT NULL DEFAULT 'trainee' CHECK (score IN ('trainee', 'novice', 'competent', 'professional', 'fleet_elite')),
  private_hire_vehicle_id INTEGER REFERENCES vehicles(id)
);

-- Tracks which calendar months have already had their private-hire income
-- bookings generated for a given vehicle (T183) — the same "re-checked
-- fresh every time the screen opens, since the game clock keeps advancing
-- while it's closed" lazy-generation pattern T179's re-power bookings
-- already use, rather than a real periodic game-tick (none exists anywhere
-- in this codebase). month_key is "<year>-<2-digit month>" (see
-- private-hire-income.mts's own monthKeyFromGameDay) — the PRIMARY KEY on
-- (vehicle_id, month_key) is what makes a re-open of the Depot groups
-- panel never double-generate the same month's bookings.
CREATE TABLE IF NOT EXISTS private_hire_income_months (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  month_key TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, month_key)
);

-- A duty (OPERATIONS.md §7 "Duties", Phase 3's own item): one vehicle's
-- continuous work pattern across a single day type, built from the day's
-- own generated journeys (a route's timetable, already published — nothing
-- new is persisted about the journeys themselves). Deliberately vehicle-only
-- at first: no driver, no hours/length validation — decided with the user,
-- 2026-10-17, as Phase 6's own concern once drivers and the GB/EU hours
-- regime actually exist. driver_id (schema v57->v58) is the first piece of
-- that: a simple, permanent one-driver-per-duty assignment (confirmed
-- 2026-11-08) — nullable, since a duty can exist unassigned, and
-- deliberately NOT validated against the driver's own depot_group_id/
-- depot_id here (no relief/cross-depot logistics yet either). Vehicle-
-- side hours/length validation (continuous-time cap, forced depot
-- breaks, the night/long-distance exceptions — OPEN-ITEMS.md) is still a
-- separate, not-yet-built increment; driver_id existing doesn't change
-- that.
--
-- depot_id (added 2026-10-17, same day as the table itself — real user
-- data never existed on the depot-less shape, so this was a straight
-- DROP+recreate, not a migrated column): every duty is anchored to one
-- physical depot within its own depot group, since that's where the
-- vehicle (and now the driver) actually starts and ends the day — a
-- depot group can have more than one physical depot, and a duty belongs to
-- exactly one of them, never floats free of all of them. duty_number is
-- generated from the depot's own rank within its group (ordered by id,
-- "the main depot" first) — 1xxx for the first depot, 2xxx for the second,
-- and so on (electron/db.mts's own createDuty), so the numbering itself
-- shows which depot a duty belongs to at a glance.
-- weekday_mask (schema v55->v56): a freeform weekday bitmask, the same
-- scheme route_timetables already uses (see that table's own SCHEMA
-- comment) — replaced the original 3-preset day_type enum once the
-- player-facing day-type picker (OPEN-ITEMS.md) needed duties to track
-- whatever patterns the depot group's routes actually use, not a fixed 3.
CREATE TABLE IF NOT EXISTS duties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  weekday_mask INTEGER NOT NULL CHECK (weekday_mask BETWEEN 1 AND 127),
  duty_number TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  driver_id INTEGER REFERENCES drivers(id)
);

-- One journey chained into a duty, in running order. A journey has no
-- identity of its own anywhere else in the save — it's derived fresh each
-- time from its route's own timetable (generateDepartureMinutesForBands),
-- the same "merged view is a projection, not a copy" principle the
-- timetable grid itself already follows — so a piece is just enough to
-- re-find that exact journey: which route, and which of its generated
-- departures (minutes from midnight). Dead running between consecutive
-- pieces (or before the first/after the last) is never stored either; it's
-- computed live from the router, same as the dead mileage preview and the
-- hail-and-ride overlay.
CREATE TABLE IF NOT EXISTS duty_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  duty_id INTEGER NOT NULL REFERENCES duties(id),
  sequence_order INTEGER NOT NULL,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  departure_minutes INTEGER NOT NULL
);

-- An owned vehicle (OPERATIONS.md §3 "Buying"/"Fleet numbers and plates").
-- model_id matches a VehicleModel.id in vehicle-catalogue.mts;
-- category_digit/sequential_number are their own columns (not parsed back
-- out of fleet_number) so numbering stays exact regardless of how many
-- digits the sequential part grows to. livery_id is nullable — NULL means
-- the real default (OPERATIONS.md §5): plain white with the route number
-- centred, unless a council-assigned area livery applies, which is
-- resolved at display time, not stored per vehicle.
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  model_id TEXT NOT NULL,
  length_m REAL NOT NULL,
  variant_label TEXT,
  power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
  category_digit INTEGER NOT NULL,
  sequential_number INTEGER NOT NULL,
  fleet_number TEXT NOT NULL UNIQUE,
  plate TEXT NOT NULL UNIQUE,
  condition REAL NOT NULL DEFAULT 100,
  purchase_price_gbp INTEGER NOT NULL,
  bought_at TEXT NOT NULL,
  -- bought_game_day (schema v58->v59, T179): the real IN-GAME day index
  -- this vehicle was bought on — bought_at above is the real wall-clock
  -- timestamp (new Date().toISOString()), which the re-power age gate
  -- (5+ years old, repower-booking.mts) can't use at all since the
  -- game's own calendar runs on its own clock, entirely independent of
  -- real time. Defaults to 0 for any vehicle bought before this column
  -- existed — an already-owned vehicle in an existing save is simply
  -- always old enough, the player-friendly reading rather than
  -- retroactively blocking something they already own.
  bought_game_day INTEGER NOT NULL DEFAULT 0,
  livery_id INTEGER REFERENCES liveries(id),
  bought_for_route_id INTEGER REFERENCES routes(id),
  -- payment_method (schema v62->v63, T185 — real lease billing, follow-up
  -- to T184's new Fleet screen, approved plan
  -- can-you-do-the-flickering-hopper.md, confirmed 2026-11-14):
  -- vehicle_orders.payment_method was already set at order time but
  -- never carried through into the real owned vehicle it becomes —
  -- collectOrder read the order's own payment_method and then simply
  -- discarded it, so a leased vehicle cost nothing, ever, after
  -- purchase. This column is the fix: the same three real OPERATIONS.md
  -- §3 "Buying" payment methods as basket_items/vehicle_orders already
  -- use, defaulting to buy_outright for any vehicle bought before this
  -- column existed (an already-owned vehicle in an existing save is
  -- simply always treated as fully paid for, the same player-friendly
  -- backfill precedent as bought_game_day's own default above).
  payment_method TEXT NOT NULL DEFAULT 'buy_outright' CHECK (payment_method IN ('buy_outright', 'lease', 'lease_to_own')),
  -- greenroad_fitted (schema v68->v69, user request 2026-11-20): whether
  -- this vehicle was bought/ordered with the GreenRoad driver-behaviour
  -- option (vehicle-catalogue.mts's "greenroad" GeneralOption) selected —
  -- the one option in that whole catalogue that needs a lasting per-
  -- vehicle record, since it carries an ongoing recurring charge
  -- (greenroad-billing.mts) rather than just a one-off price folded into
  -- unit_price_gbp like every other option. Defaults to 0 for any vehicle
  -- bought before this column existed, the same player-friendly backfill
  -- precedent as bought_game_day/payment_method's own defaults above.
  greenroad_fitted INTEGER NOT NULL DEFAULT 0
);

-- Tracks which calendar months have already had their real monthly lease
-- payment charged for a given leased/lease-to-own vehicle (T185) — the
-- identical shape and the identical "re-checked fresh every time the
-- screen opens" lazy-billing pattern as private_hire_income_months above
-- (see that table's own SCHEMA comment for the full reasoning; there is
-- still no real periodic/monthly game-tick anywhere in this codebase to
-- hang this off instead). month_key is "<year>-<2-digit month>" (see
-- vehicle-lease-billing.mts's own re-export of private-hire-income.mts's
-- monthKeyFromGameDay) — the PRIMARY KEY on (vehicle_id, month_key) is
-- what makes a re-open of the Fleet screen never double-charge the same
-- month.
CREATE TABLE IF NOT EXISTS lease_billing_months (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  month_key TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, month_key)
);

-- Tracks which calendar months have already had their real GreenRoad
-- recurring charge billed (schema v68->v69, user request 2026-11-20) —
-- identical shape/lazy-billing pattern to lease_billing_months above,
-- except the AMOUNT charged for a given month isn't a flat per-month
-- figure: it's (real days in that calendar month) x 10p, the user's own
-- literal "10p per day" rather than a rounded flat monthly fee (confirmed
-- directly — this game has no daily billing tick anywhere, so every
-- recurring charge is billed in calendar-month chunks lazily; this is a
-- new variant of that same pattern, not a new tick mechanism). See
-- greenroad-billing.mts for the real day-count math.
CREATE TABLE IF NOT EXISTS greenroad_billing_months (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  month_key TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, month_key)
);

-- Retrofitting GreenRoad onto an already-owned vehicle (user request
-- 2026-11-20: "Greenroad also needs to be retro-fitable for the same
-- fee. It will be installed overnight by a Greenroad Engineer" —
-- refined the same day: "Greenroad should take 14 days after retro-
-- fitting it for the engineer to come out, they can do 6 buses per
-- night" then "That 6 per night should drop by 1 for each extra depot
-- in a group the engineer has to visit," confirmed per depot GROUP, not
-- company-wide). The same £350 one-off fee as a new purchase (vehicle-
-- catalogue.mts's "greenroad" GeneralOption), charged at booking time.
-- ready_game_day is no longer a flat booked_game_day+1 — it's the real
-- scheduled night (greenroad-retrofit-scheduling.mts's own
-- scheduleGreenroadRetrofit), which can land well past the 14-day lead
-- time if the depot group's own nightly capacity is already full.
-- depot_id/depot_group_id are captured at booking time (the vehicle's
-- own values then, a stable snapshot — same reasoning as unit_price_gbp
-- elsewhere — not re-derived from a live vehicle lookup later, which
-- could drift if the vehicle is ever transferred before collection).
-- One row per booking, deleted on collection (same "collect, then gone"
-- convention as repower_bookings/repaint_bookings).
CREATE TABLE IF NOT EXISTS greenroad_retrofit_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  booked_game_day INTEGER NOT NULL,
  ready_game_day INTEGER NOT NULL
);

-- A line in the current, uncommitted order (OPERATIONS.md §3 "Buying") —
-- one basket, shared company-wide rather than scoped to a single depot
-- group, since the bulk discount itself groups "the whole basket... by
-- manufacturer regardless of each vehicle's own destination or livery."
-- unit_price_gbp is the already-computed per-vehicle price (base + power
-- delta + length delta + axle charge + selected options), the same figure
-- priceFor()/priceForGeneralOption() compute client-side — stored rather
-- than recomputed from scratch at order time, so a later catalogue change
-- can never retroactively alter an item already sitting in the basket.
-- manufacturer is stored directly (not re-derived from model_id every
-- query) purely so the bulk-discount grouping is a plain SQL/JS GROUP BY,
-- matching the real display name vehicle-catalogue.mts's manufacturerOf()
-- already derives.
CREATE TABLE IF NOT EXISTS basket_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  model_id TEXT NOT NULL,
  length_m REAL NOT NULL,
  variant_label TEXT,
  power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
  livery_id INTEGER REFERENCES liveries(id),
  manufacturer TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_gbp INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'buy_outright' CHECK (payment_method IN ('buy_outright', 'lease', 'lease_to_own')),
  is_used INTEGER NOT NULL DEFAULT 0,
  used_condition REAL,
  bought_for_route_id INTEGER REFERENCES routes(id),
  -- greenroad_fitted (schema v68->v69) — see vehicles' own column comment.
  -- Carried from the configure screen's checkbox through to the real
  -- vehicle row via placeOrder/collectOrder below.
  greenroad_fitted INTEGER NOT NULL DEFAULT 0
);

-- One vehicle "placed" (OPERATIONS.md §3 "Delivery and transfers") after
-- Basket's own "Place order" — one row per physical vehicle (a basket
-- line's own quantity > 1 expands into that many rows here), awaiting
-- collection. There's no day-tick/calendar or driver-availability system
-- yet (both Phase 6/7), so the real "2 or 3 a day, who collects and when,
-- depot manager skill" simulation this section describes isn't built —
-- every order is immediately available to collect, and collecting (by
-- either button the Deliveries screen shows) finalises it into a real
-- vehicles row straight away. Deliberately simplified rather than faked
-- with invented day-tick numbers; revisit once drivers/duties/a real
-- calendar exist to hang the real mechanic on.
CREATE TABLE IF NOT EXISTS vehicle_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  depot_id INTEGER NOT NULL REFERENCES depots(id),
  model_id TEXT NOT NULL,
  length_m REAL NOT NULL,
  variant_label TEXT,
  power_type TEXT NOT NULL CHECK (power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen')),
  livery_id INTEGER REFERENCES liveries(id),
  unit_price_gbp INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('buy_outright', 'lease', 'lease_to_own')),
  is_used INTEGER NOT NULL DEFAULT 0,
  used_condition REAL,
  ordered_at TEXT NOT NULL,
  bought_for_route_id INTEGER REFERENCES routes(id),
  -- greenroad_fitted (schema v68->v69) — see vehicles' own column comment.
  greenroad_fitted INTEGER NOT NULL DEFAULT 0
);

-- Fare zones (DESIGN.md §9, Phase 4 increment 1 of the fares build):
-- "fare zones are drawn on the map by the player... the depot group is the
-- unit of ticket validity and of fare capping" — confirmed with the user
-- (2026-10-18) that each depot group draws and prices its own zone map
-- independently, not one shared company-wide map, so every zone belongs to
-- exactly one depot group. "points" is a JSON array of {lon, lat} vertices
-- in order, an open ring (not repeating the first point) — same convention
-- as routes' own "points" column. This is geometry only: no pricing lives
-- here yet (that's increment 2 — a per-depot-group band/ticket-family
-- table — and increment 3's capping, both separate from this table since
-- neither is about to be worked out at the same time as the shape of the
-- zones themselves). "colour" (added 2026-10-30, live user request — "each
-- one can have a colour") is a per-zone hex override shown on the map,
-- independent of zone_type; validated the same way as liveries' own
-- primary/secondary colours (HEX_COLOUR below), not via a SQL CHECK.
CREATE TABLE IF NOT EXISTS fare_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('city', 'country', 'island', 'town')),
  points TEXT NOT NULL,
  colour TEXT NOT NULL DEFAULT '#3b82f6',
  -- Town zones only (T107) — the one parent Country or Island zone a town
  -- sits inside; always NULL for every other zone type. No ON DELETE
  -- CASCADE in SQLite's own FK support here, so deleteFareZone below
  -- handles it manually — deliberately different from parent_route_id's
  -- "clear the link, keep the child" precedent, since a Town zone makes no
  -- sense once its parent is gone (its own fares are entirely computed
  -- from the parent's figures, not independently priced).
  parent_zone_id INTEGER REFERENCES fare_zones(id)
);

-- Island-zone single-fare bands (2026-10-31, live user design discussion,
-- T107) — same shape as fare_country_zone_bands above (banded by exact
-- zone count, player-entered, not a formula), kept as its own table
-- rather than reusing the country one since an island zone's own bands
-- are never priced against a country zone's, even within the same depot
-- group (confirmed: Island fares "sit entirely outside the city/country/
-- combined/network system," the same treatment as Sightseeing).
CREATE TABLE IF NOT EXISTS fare_island_zone_bands (
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  zone_count INTEGER NOT NULL CHECK (zone_count > 0),
  price_gbp_pence INTEGER NOT NULL,
  PRIMARY KEY (depot_group_id, zone_count)
);

-- Fare pricing (DESIGN.md §9, Phase 4 increment 2) — see fare-pricing.mts
-- for the pure calculation layer this feeds, and why amounts are stored
-- as whole pence (penny-precision currency, avoiding the float-rounding
-- bug class this project already hit once, T99). One row per depot
-- group, every field nullable — a depot group can be partially
-- configured (the player fills these in one at a time), and each
-- calculation function throws rather than silently treating an unset
-- fare as free. The Return multiplier is NOT stored here — it's a fixed
-- game constant (RETURN_MULTIPLIER in fare-pricing.mts), not a setting.
--
-- Reworked 2026-10-31 after a live user design discussion: "special
-- service" renamed/narrowed to Airport Express (its own Single/Return,
-- not the standard 1.6x Return formula — AIR's own real fares don't
-- follow that ratio either); NETWORK is no longer its own typed-in price
-- at all — it's COMPUTED from the Combined (city+country) price times
-- network_markup_percent, rounded up to the nearest 5p (fare-
-- pricing.mts's networkFareGBPPence), so there's no network_*_gbp_pence
-- column to store, only the one percentage; runs_night_services is a new
-- real per-depot-group flag (not inferred from anything) gating whether
-- LATE/the two night-extra fields are even relevant; sightseeing gained
-- its own two prices, per DESIGN.md's own already-specified shape.
CREATE TABLE IF NOT EXISTS fare_configs (
  depot_group_id INTEGER PRIMARY KEY REFERENCES depot_groups(id),
  city_single_gbp_pence INTEGER,
  beyond_depot_group_per_mile_gbp_pence INTEGER,
  long_distance_base_gbp_pence INTEGER,
  long_distance_per_mile_gbp_pence INTEGER,
  airport_express_single_gbp_pence INTEGER,
  airport_express_return_gbp_pence INTEGER,
  night_extra_base_gbp_pence INTEGER,
  night_extra_per_zone_gbp_pence INTEGER,
  late_gbp_pence INTEGER,
  network_markup_percent REAL,
  sightseeing_day_gbp_pence INTEGER,
  sightseeing_single_gbp_pence INTEGER,
  city_day_gbp_pence INTEGER,
  city_weekly_gbp_pence INTEGER,
  country_day_gbp_pence INTEGER,
  country_weekly_gbp_pence INTEGER,
  combined_day_gbp_pence INTEGER,
  combined_weekly_gbp_pence INTEGER,
  island_day_gbp_pence INTEGER,
  island_weekly_gbp_pence INTEGER,
  island_late_gbp_pence INTEGER
);

-- The country-zone single-fare band table (DESIGN.md §9 "banded by zone
-- count, bands set by the player") — a flexible player-entered table
-- rather than a formula, confirmed 2026-10-18, since the real Lothian
-- reference has an irregular band that doesn't reduce to one. Keyed by
-- exact zone count, not a range — see fare-pricing.mts's own header for
-- why the real "or 2 if a specific zone pair" exception isn't
-- representable by this (it depends on which zones, not a count).
CREATE TABLE IF NOT EXISTS fare_country_zone_bands (
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  zone_count INTEGER NOT NULL CHECK (zone_count > 0),
  price_gbp_pence INTEGER NOT NULL,
  PRIMARY KEY (depot_group_id, zone_count)
);

-- The game clock (DESIGN.md §3: "real time, with pause and speed
-- controls"), confirmed 2026-11-01 — nothing tracked game time at all
-- before this; vehicle-simulation.ts just read Date.now() straight,
-- which can't be paused or sped up. A single row (id always 1, enforced
-- by the CHECK rather than a no-arg PRIMARY KEY, so a stray second INSERT
-- fails loudly instead of silently creating a second clock).
-- accumulated_game_seconds is the one source of truth for "what time is
-- it in the game" — real elapsed time only ever advances it while
-- !is_paused, scaled by speed_multiplier (DESIGN.md §3's own 1x/4x/10x/
-- 20x/60x, each a multiple of the already-tenfold "1 real second = 10
-- game seconds" base rate). Persisted (not just kept in memory) so
-- closing and reopening the app resumes from the same point rather than
-- silently losing time or jumping to "now".
CREATE TABLE IF NOT EXISTS game_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  accumulated_game_seconds REAL NOT NULL DEFAULT 0,
  speed_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (speed_multiplier IN (1, 4, 10, 20, 60)),
  is_paused INTEGER NOT NULL DEFAULT 0
);

-- Company-wide one-off upgrades (TICKETING.md §4, second increment of
-- T66 — see company-upgrades.mts's own header comment for the real
-- scope). Not per depot group, unlike ticket_machine_tier above —
-- TICKETING.md's own wording ("Company-wide one-off upgrades (not per
-- vehicle)") makes these flat, save-wide purchases, so a single row (id
-- always 1, same CHECK-enforced-singleton pattern as game_clock) is the
-- real model. Each flag's own real price is now actually deducted via
-- finance_transactions below (2026-11-05) when bought through the
-- renderer's own UI — db.mts's own setters just store the flag, same
-- "pure logic in the renderer, dumb storage here" split as the pricing
-- functions.
CREATE TABLE IF NOT EXISTS company_upgrades (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  has_upgradable_ticket_app INTEGER NOT NULL DEFAULT 0,
  has_mobile_app_live_data INTEGER NOT NULL DEFAULT 0,
  has_upgraded_avl_data INTEGER NOT NULL DEFAULT 0,
  -- has_adopted_greenroad (schema v68->v69, user request 2026-11-20:
  -- "Once this starts to be installed then all vehicles purchased from
  -- that point onwards have to be fitted with no option to remove it or
  -- opt-out when buying.") — one-way, company-wide, never cleared once
  -- set. buyVehicle (below) sets it to true the moment any vehicle is
  -- first bought with greenroad_fitted — the real "installed" moment,
  -- not merely added to basket (which can still be removed before
  -- checkout). Once true, the configure screen forces GreenRoad's own
  -- checkbox permanently on and disabled for every future purchase, the
  -- same "lockedOnForCoach" pattern seatbelts already uses for coaches.
  has_adopted_greenroad INTEGER NOT NULL DEFAULT 0
);

-- The finance ledger (DESIGN.md §10 "Money"/"Finance screen") — first
-- increment, 2026-11-05, prompted directly by the user ("a lot is now
-- starting to be waiting for that to be added" — repaint_bookings,
-- ticket_machine_tier and company_upgrades had all been built with real
-- prices shown but nothing deducted, for exactly this reason). "Company
-- cash is a single pot" (DESIGN.md's own wording) — one company-wide
-- balance, never per depot group, even though each transaction still
-- records WHICH depot group an asset was bought for ("that spend is
-- recorded against the group receiving the asset, so it is possible to
-- see whether one group is subsidising another") via depot_group_id,
-- nullable for a genuinely company-wide cost (the company_upgrades
-- above, which have no single owning depot group at all).
--
-- The running balance is deliberately NOT a stored/cached column
-- anywhere — it's always derived as the sum of every transaction ever
-- recorded (getCompanyBalanceGBPPence below), the same "merge is a
-- projection, not a copy" principle CLAUDE.md already establishes for
-- timetables: a stored balance could drift from its own transaction
-- log, a derived one never can. amount_gbp_pence is signed (positive =
-- income, negative = a cost) so a plain SUM is the whole calculation.
-- The real £100,000 starting balance (DESIGN.md §10, confirmed
-- 2026-11-05) is itself just the FIRST transaction ever recorded
-- (category 'opening_balance'), seeded once below in openSave the first
-- time a save's own finance_transactions table is found completely
-- empty — not a special-cased starting value anywhere else.
--
-- category is a free-text label, not yet a fixed enum — DESIGN.md §10's
-- own Finance screen groups spend into named categories (Fares,
-- Contracts, Staff, Vehicles, Property, Marketing, Penalties and fines)
-- but that whole screen needs systems (fares, contracts, staff, wages)
-- that don't exist yet; the categories actually in use today
-- (opening_balance, ticket_machine, company_upgrade) don't map cleanly
-- onto that table and aren't meant to pre-empt it — a real category
-- taxonomy is deferred to whenever the Finance screen itself is built.
-- game_day is the same whole-day-index convention repaint_bookings
-- already uses (from the game clock's own epoch) — day granularity is
-- all a ledger needs, matching every other game-clock-scheduled feature
-- so far.
CREATE TABLE IF NOT EXISTS finance_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_gbp_pence INTEGER NOT NULL,
  category TEXT NOT NULL,
  depot_group_id INTEGER REFERENCES depot_groups(id),
  description TEXT NOT NULL,
  game_day INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Route advertising (OPEN-ITEMS.md, "Phase 5/9 redesign", confirmed
-- 2026-11-16) — player-bought only, never council-triggered (unlike
-- shelter/seating/lighting, which genuinely serve every passenger
-- regardless of operator). stop_osm_id is the real OSM stop this
-- advertising is bought AT — stops aren't a persisted entity of their
-- own in this schema (they're derived from the pipeline's own stop
-- data), so the real osmId is the only stable identifier to key off,
-- same convention stop_groups/playerBusStations already use elsewhere
-- for a "which real stop" reference. mode is either a specific
-- route (route_id set, operator_name null) or the long-distance-generic
-- mode (operator_name set to the real derived company, route_id null) —
-- CHECK enforces exactly one of the two is ever set, matching which
-- column the mode implies. live_from_game_day is booked_game_day + 14
-- (OPERATIONS.md §16's own "work starts 14 days after ordering" fitting
-- convention, reused rather than inventing a separate delay) — a flat
-- calendar-day add, not a working-day-aware schedule like the repaint/
-- re-power shop-bay bookings use, since nothing here has a capacity
-- constraint (any number of stops can have advertising ordered on the
-- same day; there's no "fitter bay" bottleneck for printing a sign).
-- is_contract_bundle (added v67->v68, "Contract-stop bundling" —
-- OPEN-ITEMS.md's own "exactly ONE stop per contract" entry): true for
-- the one free, permanent booking a Fixed real contract (398/Airlink
-- 100/Express 500/AIR) grants its own real terminus stop automatically
-- on acceptance — bypasses the normal £500 setup fee / £20-a-month /
-- 14-day delay model entirely (live_from_game_day is set equal to
-- booked_game_day for these rows, not +14). Reuses this table's own
-- real shape rather than a parallel "free forever" record, per
-- CLAUDE.md's "build it once" convention — see stop_route_locks below
-- for the sibling lock this always comes paired with.
CREATE TABLE IF NOT EXISTS route_advertising_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stop_osm_id INTEGER NOT NULL,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  mode TEXT NOT NULL CHECK (mode IN ('specific_route', 'long_distance')),
  route_id INTEGER REFERENCES routes(id),
  operator_name TEXT,
  booked_game_day INTEGER NOT NULL,
  live_from_game_day INTEGER NOT NULL,
  is_contract_bundle INTEGER NOT NULL DEFAULT 0,
  CHECK ((mode = 'specific_route' AND route_id IS NOT NULL AND operator_name IS NULL)
      OR (mode = 'long_distance' AND route_id IS NULL AND operator_name IS NOT NULL))
);

-- Which calendar months' £20 recurring fee (route-advertising.mts's own
-- ROUTE_ADVERTISING_MONTHLY_FEE_GBP_PENCE) have already been charged for
-- a given booking — exact same shape and billing convention as
-- lease_billing_months above (real calendar months via
-- private-hire-income.mts's monthKeyFromGameDay/elapsedMonthKeysSince,
-- billed lazily whenever the relevant screen is opened, not on a
-- central tick).
CREATE TABLE IF NOT EXISTS route_advertising_billing_months (
  booking_id INTEGER NOT NULL REFERENCES route_advertising_bookings(id),
  month_key TEXT NOT NULL,
  PRIMARY KEY (booking_id, month_key)
);

-- Remote/rural route subsidies (OPEN-ITEMS.md "Contracts redesign",
-- settled 2026-11-19; src/renderer/remote-route-subsidy.mts has the full
-- real design). Replaces the dropped council-contracts bidding mechanic —
-- this is a per-JOURNEY top-up on a route the player already runs, not a
-- contract, so it needs no cost-per-passenger target or failure penalty,
-- just the real offer/accept/decline/withdrawal state.
--
-- One row per real SCHEDULED journey (a specific departure time on a
-- specific route, for a specific day-type), identified by
-- (route_id, departure_minutes, weekday_mask) — the same scheduled-
-- journey identity vehicle-simulation.ts's own timetable generation
-- already uses, NOT the live per-instance key
-- (routeId:departureMinutes:dayOffsetSeconds) that key also carries,
-- since the subsidy decision belongs to the schedule itself and must
-- persist across real calendar days, not to one single ephemeral running
-- instance of it.
--
-- Tables created unconditionally via this SCHEMA string (CREATE TABLE IF
-- NOT EXISTS), not a dedicated version-gated migration branch — same
-- precedent route_advertising_bookings' own comment above already
-- established: SCHEMA_VERSION's v66->v67 slot may be claimed by other
-- work landing in the same session, and this is pure new-table creation
-- with no existing data to migrate, so the unconditional IF-NOT-EXISTS
-- create is sufficient and safe on every openSave() call.
CREATE TABLE IF NOT EXISTS remote_route_subsidies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  departure_minutes INTEGER NOT NULL,
  weekday_mask INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('offered', 'accepted', 'declined', 'withdrawal_warned', 'withdrawn')),
  offered_game_day INTEGER NOT NULL,
  decided_game_day INTEGER,
  warning_started_game_day INTEGER,
  UNIQUE (route_id, departure_minutes, weekday_mask)
);

-- Fixed real contract failure handling (DESIGN.md "Fixed real contracts";
-- OPEN-ITEMS.md "Contracts redesign," confirmed 2026-11-19) — see
-- src/renderer/fixed-contract-failures.mts for the real fine/suspension
-- logic this stores; this layer is plain storage only, same split as
-- remote_route_subsidies just above. Applies to 398, Airlink 100,
-- Express 500 and SkyLink only: AIR is explicitly exempt (DESIGN.md §10,
-- "genuinely zero fines for anything") and Railair isn't a fixed contract
-- at all (UK-EXPANSION.md §9a, a player-created product) — neither is
-- enforced at the schema level (route_id alone can't tell one route type
-- from another), the renderer-side module is what actually gates which
-- routes this applies to before ever calling these.
--
-- Tables created unconditionally via this SCHEMA string (CREATE TABLE IF
-- NOT EXISTS), same precedent as remote_route_subsidies/
-- route_advertising_bookings just above: SCHEMA_VERSION's next slot may be
-- claimed by other work landing in the same session, and this is pure
-- new-table creation with no existing data to migrate, so the
-- unconditional IF-NOT-EXISTS create is sufficient and safe on every
-- openSave() call.
--
-- One row per real fine actually issued (one per route per real game day
-- it happened on, UNIQUE below) — not one row per missed departure, since
-- fixed-contract-failures.mts's own missedUnitsForDay already collapses a
-- day's shortfall into one whole-day figure.
CREATE TABLE IF NOT EXISTS fixed_contract_fine_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  game_day INTEGER NOT NULL,
  scheduled_units INTEGER NOT NULL,
  missed_units INTEGER NOT NULL,
  fine_gbp_pence INTEGER NOT NULL,
  UNIQUE (route_id, game_day)
);

-- One row per suspended BATCH (fixed-contract-failures.mts's own
-- ContractSuspension) — an escalation while an earlier batch is still
-- active creates a SECOND row with its own fresh 1-year return date,
-- rather than mutating the first, so each batch returns to the player on
-- its own real date independently (see that module's own header comment
-- on this choice, flagged as not explicitly confirmed by the user either
-- way).
CREATE TABLE IF NOT EXISTS fixed_contract_suspensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  weekday_mask INTEGER NOT NULL,
  suspended_units INTEGER NOT NULL,
  total_units INTEGER NOT NULL,
  start_game_day INTEGER NOT NULL,
  return_game_day INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- The real "Contracts" menu (DESIGN.md "Fixed real contracts": "Offered
-- alongside council, event, lifeline and cruise contracts through a
-- single contracts menu"; OPEN-ITEMS.md "Contracts redesign"/"Dounreay
-- contracts"/"Three further contracts — 800, 803 & 805", settled
-- 2026-11-19/20). One row per contract EVER accepted (eligibility itself
-- is computed live, not stored — see fixed-contract-eligibility.mts; this
-- table only remembers the player's own Accept action, permanently).
-- "contract_key" is a stable string identity — "398"/"airlink100"/
-- "express500"/"air" for the four real fixed-content contracts (the same
-- FixedContractKey strings fixed-contract-failures.mts already uses for
-- the first three, extended here with "air"), "dounreay_74".."dounreay_921"
-- for Dounreay's 8 real routes, and "800"/"803"/"805" for the three
-- Dounreay-progression contracts — never a plain route NUMBER. This is
-- deliberate, not incidental: 398/500/74/etc are all plain numeric
-- strings a player could otherwise choose for an ordinary route of their
-- own, so "is this contract accepted" must never be answered by scanning
-- routes.number, only by this table. "route_ids" is a JSON array of every
-- route id actually created for this contract (via
-- fixed-contract-route-seed-data.mts, NEW ids in THIS save, never the ids
-- the content was originally extracted from) — empty for Dounreay/
-- 800/803/805 today, since their real route content doesn't exist yet
-- (the user's own pending research); accepting one of those just records
-- that the player accepted it, ready for whenever real content lands.
-- "activation_game_day" is DESIGN.md's own "starts on the first Monday
-- after a minimum of 10 days have passed" rule, computed once at accept
-- time and stored rather than recomputed differently by different
-- callers. "granted_depot_id" is non-null only for 800/803/805 (the
-- user's own words: "this contract will provide it's own depot at the
-- end of the road" — DOUNREAY_END_OF_ROAD_DEPOT,
-- fixed-contract-eligibility.mts), set once at accept time; null for
-- every other contract, which grants no depot.
CREATE TABLE IF NOT EXISTS fixed_contract_acceptances (
  contract_key TEXT PRIMARY KEY,
  route_ids TEXT NOT NULL DEFAULT '[]',
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  accepted_game_day INTEGER NOT NULL,
  activation_game_day INTEGER NOT NULL,
  granted_depot_id INTEGER REFERENCES depots(id)
);

-- Generic "first real game day this route was observed" tracker — built
-- for Route 77's own Express 500 gate ("Route 77 has been running for 1
-- month," DESIGN.md "Route 77 — Glasgow Airport commercial service"):
-- unlike 398/Airlink 100/Express 500/AIR, Route 77 is NOT one of the
-- Contracts-menu's own fixed-content contracts (DESIGN.md: "Not a fixed
-- real contract... runs on ordinary commercial economics") — it's an
-- ordinary player-drawn route with a fixed livery/colour/vehicle, so it
-- has no Accept event of its own to time its "running for" period from.
-- Populated lazily (same "lazy catch-up" convention as
-- private-hire-income.mts/route-advertising-billing — CLAUDE.md's own
-- precedent), the first time any caller checks eligibility and finds a
-- route numbered "77" with no row here yet. Kept generic (keyed by any
-- route_id, not hardcoded to "77") in case a future fixed-content gate
-- needs the same "how long has this plain route existed" signal.
CREATE TABLE IF NOT EXISTS route_milestones (
  route_id INTEGER PRIMARY KEY REFERENCES routes(id),
  first_seen_game_day INTEGER NOT NULL
);

-- Stop route locks (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
-- dropped...", confirmed 2026-11-16) — the one shared "a stop is
-- exclusively tied to one route" primitive behind two features:
-- contract-stop bundling (398/Airlink 100/Express 500/AIR's own real
-- terminus stop, locked automatically and for free as a term of the
-- contract) and player-initiated airport-stop purchase (flat £15,000
-- placeholder, see stop-route-locks.mts's own AIRPORT_STOP_PURCHASE_
-- PRICE_GBP_PENCE — unlocks locking the bought stop to whichever of the
-- player's own routes they choose). stop_osm_id is PRIMARY KEY, not
-- just indexed — that IS the real exclusivity rule, enforced at the
-- schema level rather than only in application logic: a stop can only
-- ever be locked once, full stop, never per-route. contract_key is set
-- only when source = 'contract' (which real fixed contract this came
-- bundled with — "398"/"airlink100"/"express500"/"air", the same keys
-- fixed_contract_acceptances.contract_key already uses); purchase_
-- price_gbp_pence only when source = 'purchased' (what the player
-- actually paid) — CHECK below enforces exactly one of the two per row,
-- same convention as route_advertising_bookings' own mode/route_id/
-- operator_name CHECK above. New table only — no existing data to
-- migrate, since no stop-lock state existed anywhere before this; same
-- "pure new-table creation, unconditional IF-NOT-EXISTS create, no
-- dedicated version-gated branch needed" precedent as route_milestones/
-- route_advertising_bookings/fixed_contract_acceptances above.
CREATE TABLE IF NOT EXISTS stop_route_locks (
  stop_osm_id INTEGER PRIMARY KEY,
  locked_route_id INTEGER NOT NULL REFERENCES routes(id),
  source TEXT NOT NULL CHECK (source IN ('contract', 'purchased')),
  contract_key TEXT,
  purchase_price_gbp_pence INTEGER,
  locked_game_day INTEGER NOT NULL,
  CHECK ((source = 'contract' AND contract_key IS NOT NULL AND purchase_price_gbp_pence IS NULL)
      OR (source = 'purchased' AND contract_key IS NULL AND purchase_price_gbp_pence IS NOT NULL))
);
`;

export function openSave(path: string): SaveDb {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  // Looped rather than a single pass — a save can be more than one
  // version behind in the rare case several migrations land in one
  // session without a real release applying them in between (found as a
  // real bug 2026-10-31, see the v37 branch's own comment below for the
  // full story). Each iteration re-reads the real on-disk version after
  // the matching branch runs, so a save several versions behind keeps
  // advancing one step at a time instead of a single branch's own
  // ALTERs running once and the version then silently jumping straight
  // to SCHEMA_VERSION, skipping everything in between.
  let currentVersion = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  while (currentVersion !== SCHEMA_VERSION) {
    if (currentVersion === 0) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 1) {
    // v1 -> v2: depot groups gained a region (OPERATIONS.md §1a). No shipped
    // saves exist yet, so any existing rows just get an empty region rather
    // than a real migration prompt.
    db.exec("ALTER TABLE depot_groups ADD COLUMN region TEXT NOT NULL DEFAULT ''");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 2) {
    // v2 -> v3: the North East/North West England split (T14, OPEN-ITEMS.md)
    // was reverted — England is one region again, with Shetland added as its
    // own fifth. Remap any existing rows using the old split names.
    db.exec("UPDATE depot_groups SET region = 'North England' WHERE region IN ('North East England', 'North West England')");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 3) {
    // v3 -> v4: depot groups gained a manually-assigned main bus station
    // (DESIGN.md §6 "Direction"), and routes can now be saved. No shipped
    // saves exist yet, so existing depot groups just get a null station.
    db.exec("ALTER TABLE depot_groups ADD COLUMN main_bus_station_osm_id INTEGER");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 4) {
    // v4 -> v6: routes gained the start/terminus columns (DESIGN.md §6
    // "Start and terminus stops", encoding a terminus loop) — first as a
    // single mid_terminus_index (v5), then split into the current
    // terminus_index/start_index pair (v6) before anything shipped with
    // either shape. No shipped saves exist yet, so existing routes just get
    // null (no loop) throughout.
    db.exec("ALTER TABLE routes ADD COLUMN terminus_index INTEGER");
    db.exec("ALTER TABLE routes ADD COLUMN start_index INTEGER");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 5) {
    // v5 -> v6: mid_terminus_index split into terminus_index/start_index
    // (see above) — same reasoning, no shipped saves to migrate.
    db.exec("ALTER TABLE routes RENAME COLUMN mid_terminus_index TO terminus_index");
    db.exec("ALTER TABLE routes ADD COLUMN start_index INTEGER");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 6) {
    // v6 -> v7: routes can now carry a timetable (DESIGN.md §7, T29 in
    // OPEN-ITEMS.md) — the route_timetables table is created by the SCHEMA
    // statement above (CREATE TABLE IF NOT EXISTS already ran against this
    // save), this branch only needs to advance the version.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 7) {
    // v7 -> v8: routes gained a player-set colour (DESIGN.md §11), ahead of
    // the livery system. Existing rows get the same blue the map already
    // used as its hardcoded route-line colour, so nothing visibly changes
    // for a route that hasn't had a colour chosen yet.
    db.exec("ALTER TABLE routes ADD COLUMN colour TEXT NOT NULL DEFAULT '#3b82f6'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 8) {
    // v8 -> v9: routes gained an optional player-set name, standing in for
    // the real destination display (DESIGN.md §6/§7) until variations exist.
    // Existing rows get null, same as the list already treats "no name set".
    db.exec("ALTER TABLE routes ADD COLUMN name TEXT");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 9) {
    // v9 -> v10: routes gained per-route pick-up/set-down overrides,
    // alongside the stop's own global default (an osm_overrides entry).
    // Existing rows get none, same as "no override set" already means.
    db.exec("ALTER TABLE routes ADD COLUMN pickup_dropoff_overrides TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 10) {
    // v10 -> v11: routes gained an optional parent route + variation letter
    // (DESIGN.md §6 "Variations"), ahead of the branch/rejoin editing UI.
    // Existing rows get null in both, same as "not a variation" already
    // means implicitly.
    db.exec("ALTER TABLE routes ADD COLUMN parent_route_id INTEGER REFERENCES routes(id)");
    db.exec("ALTER TABLE routes ADD COLUMN variation_letter TEXT");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 11) {
    // v11 -> v12: route_timetables' flat start_minutes/end_minutes/
    // interval_minutes became a single time_bands JSON column (DESIGN.md
    // §7 "time-of-day bands" — route-timetable.mts's TimeBand[]). Existing
    // rows get their old flat frequency wrapped as a single-band array,
    // preserving exactly the same generated departures rather than losing
    // any existing timetable.
    db.exec("ALTER TABLE route_timetables ADD COLUMN time_bands TEXT NOT NULL DEFAULT '[]'");
    const rows = db
      .prepare("SELECT id, start_minutes, end_minutes, interval_minutes FROM route_timetables")
      .all() as unknown as { id: number; start_minutes: number; end_minutes: number; interval_minutes: number }[];
    for (const row of rows) {
      const bands = JSON.stringify([
        { startMinutes: row.start_minutes, endMinutes: row.end_minutes, intervalMinutes: row.interval_minutes },
      ]);
      db.prepare("UPDATE route_timetables SET time_bands = ? WHERE id = ?").run(bands, row.id);
    }
    db.exec("ALTER TABLE route_timetables DROP COLUMN start_minutes");
    db.exec("ALTER TABLE route_timetables DROP COLUMN end_minutes");
    db.exec("ALTER TABLE route_timetables DROP COLUMN interval_minutes");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 12) {
    // v12 -> v13: player-placed stops (DESIGN.md §4 "Placement") can now be
    // saved — the player_stops table is created by the SCHEMA statement
    // above (CREATE TABLE IF NOT EXISTS already ran against this save),
    // this branch only needs to advance the version.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 13) {
    // v13 -> v14: depots and their entrances (OPERATIONS.md §2 "Placement
    // and entrances") can now be saved — both tables are created by the
    // SCHEMA statement above, this branch only needs to advance the
    // version.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 14) {
    // v14 -> v15: grouped stops (DESIGN.md §4) became player-created only
    // instead of OSM-relation-seeded (see stop_groups' own SCHEMA comment)
    // — the stop_groups table is created by the SCHEMA statement above,
    // this branch only needs to advance the version. Any existing
    // 'stop'/'bus_station' override rows are untouched; any existing
    // 'stop'/<old relation osmId> group-membership state never existed as
    // an override in the first place (grouping was derived at read time,
    // never persisted), so there's nothing to migrate or lose.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 15) {
    // v15 -> v16: a route timetable can now exclude specific generated
    // departure minutes (a variation taking over one of the base route's
    // own slots, see route_timetables' own SCHEMA comment) — every
    // existing row simply gets an empty exclusion list, unchanged
    // behaviour until the player actually excludes something.
    db.exec("ALTER TABLE route_timetables ADD COLUMN excluded_departure_minutes TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 16) {
    // v16 -> v17: a route timetable can now also add one-off custom
    // departure minutes that no band's own interval produces (see
    // route_timetables' own SCHEMA comment) — every existing row simply
    // gets an empty list, unchanged behaviour until the player actually
    // adds one.
    db.exec("ALTER TABLE route_timetables ADD COLUMN custom_departure_minutes TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 17) {
    // v17 -> v18: a terminus-loop route can now have independent outbound/
    // inbound timetable components (see route_timetables' own SCHEMA
    // comment) — the UNIQUE constraint itself changes shape
    // ((route_id, day_type) -> (route_id, day_type, direction)), which
    // SQLite can't alter in place, so this rebuilds the table rather than
    // just adding a column. Every existing row becomes a 'both' row,
    // identical behaviour to before this migration.
    db.exec("ALTER TABLE route_timetables RENAME TO route_timetables_v17");
    db.exec(`
      CREATE TABLE route_timetables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER NOT NULL REFERENCES routes(id),
        day_type TEXT NOT NULL CHECK (day_type IN ('monday_friday', 'saturday', 'sunday')),
        direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
        time_bands TEXT NOT NULL,
        timing_points TEXT NOT NULL,
        arrival_offsets_seconds TEXT NOT NULL,
        departure_offsets_seconds TEXT NOT NULL,
        excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
        custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
        UNIQUE (route_id, day_type, direction)
      )
    `);
    db.exec(`
      INSERT INTO route_timetables
        (id, route_id, day_type, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes)
      SELECT id, route_id, day_type, 'both', time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes
      FROM route_timetables_v17
    `);
    db.exec("DROP TABLE route_timetables_v17");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 18) {
    // v18 -> v19: a depot entrance now carries its own bearing (see
    // depot_entrances' own SCHEMA comment) — every existing entrance
    // simply gets 0 (due north), a harmless default until it's re-created
    // or the player nudges it; no gameplay logic reads bearing yet
    // besides the marker's own visual orientation.
    db.exec("ALTER TABLE depot_entrances ADD COLUMN bearing REAL NOT NULL DEFAULT 0");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 19) {
    // v19 -> v20: "day_type" becomes "weekday_mask" + "term_facet" (see
    // route_timetables' own SCHEMA comment for why) — the UNIQUE
    // constraint's own shape changes, so this rebuilds the table rather
    // than just adding a column. Every existing row's day_type maps
    // straight across to the equivalent mask (still exactly the 3 original
    // presets, term_facet 'any') — identical behaviour to before this
    // migration, since no UI creates anything else yet.
    db.exec("ALTER TABLE route_timetables RENAME TO route_timetables_v19");
    db.exec(`
      CREATE TABLE route_timetables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER NOT NULL REFERENCES routes(id),
        weekday_mask INTEGER NOT NULL,
        term_facet TEXT NOT NULL DEFAULT 'any' CHECK (term_facet IN ('any', 'term_time', 'holiday')),
        direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('both', 'outbound', 'inbound')),
        time_bands TEXT NOT NULL,
        timing_points TEXT NOT NULL,
        arrival_offsets_seconds TEXT NOT NULL,
        departure_offsets_seconds TEXT NOT NULL,
        excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
        custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
        UNIQUE (route_id, weekday_mask, term_facet, direction)
      )
    `);
    db.exec(`
      INSERT INTO route_timetables
        (id, route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes)
      SELECT id, route_id,
        CASE day_type
          WHEN 'monday_friday' THEN ${MONDAY_FRIDAY_MASK}
          WHEN 'saturday' THEN ${SATURDAY_MASK}
          WHEN 'sunday' THEN ${SUNDAY_MASK}
        END,
        'any', direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes
      FROM route_timetables_v19
    `);
    db.exec("DROP TABLE route_timetables_v19");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 20) {
    // v20 -> v21: a depot entrance now also carries the real width of the
    // road it sits against (see depot_entrances' own SCHEMA comment) —
    // every existing entrance simply gets the same 5.5m placeholder
    // `snap_entrance_to_junction` used before this existed, a harmless
    // default until it's re-created or the player nudges it.
    db.exec("ALTER TABLE depot_entrances ADD COLUMN road_width_m REAL NOT NULL DEFAULT 5.5");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 21) {
    // v21 -> v22: a manual per-entrance size multiplier (see
    // depot_entrances' own SCHEMA comment) — every existing entrance
    // starts at 1.0 (no change from its current auto-computed size).
    db.exec("ALTER TABLE depot_entrances ADD COLUMN size_scale REAL NOT NULL DEFAULT 1.0");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 22) {
    // v22 -> v23: the dealers/dealer_entrances tables (T62, OPEN-ITEMS.md)
    // — brand new tables, `CREATE TABLE IF NOT EXISTS` in SCHEMA above
    // already creates them on this very `db.exec(SCHEMA)` call, so this
    // branch only needs to advance the version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 28) {
    // v28 -> v29: routes gained composed_from_route_ids (DESIGN.md §6
    // "Combining variations") — existing rows get '[]' (not composed), same
    // as the column's own DEFAULT already means for a brand new row.
    db.exec("ALTER TABLE routes ADD COLUMN composed_from_route_ids TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 27) {
    // v27 -> v28: dead_mileage_routes gains a required `direction` column
    // (a real one-way-street bug found this was needed — see the table's
    // own SCHEMA comment). Nothing built on the old shape was ever
    // functionally correct, so dropped rather than migrated; CREATE TABLE
    // IF NOT EXISTS above recreates both tables fresh.
    db.exec("DROP TABLE IF EXISTS dead_mileage_branches");
    db.exec("DROP TABLE IF EXISTS dead_mileage_routes");
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 26) {
    // v26 -> v27: the dead_mileage_routes table — brand new, created by the
    // CREATE TABLE IF NOT EXISTS in SCHEMA above, so this only advances the
    // version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 25) {
    // v25 -> v26: the repaint_shops table — brand new, created by the
    // CREATE TABLE IF NOT EXISTS in SCHEMA above, so this only advances
    // the version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 24) {
    // v24 -> v25: the liveries and livery_support_icon_overrides tables —
    // brand new, `CREATE TABLE IF NOT EXISTS` in SCHEMA above creates them,
    // so this branch only advances the version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 23) {
    // v23 -> v24: entrances/exits are shown as plain dots, not an
    // oriented marker (a live user correction — see depot_entrances' own
    // SCHEMA comment) — bearing/road_width_m/size_scale are no longer
    // used by anything, so dropped outright rather than left unused.
    db.exec("ALTER TABLE depot_entrances DROP COLUMN bearing");
    db.exec("ALTER TABLE depot_entrances DROP COLUMN road_width_m");
    db.exec("ALTER TABLE depot_entrances DROP COLUMN size_scale");
    db.exec("ALTER TABLE dealer_entrances DROP COLUMN bearing");
    db.exec("ALTER TABLE dealer_entrances DROP COLUMN road_width_m");
    db.exec("ALTER TABLE dealer_entrances DROP COLUMN size_scale");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 38) {
    // v38 -> v39: Town zones (2026-10-31, live user design discussion,
    // T107) — a new nested zone type, always inside exactly one parent
    // Country or Island zone; fare_zones' own CHECK constraint needs
    // 'town' added (same rebuild-rename-recreate-copy-drop reason as
    // every earlier CHECK change here) and gains a new parent_zone_id
    // column (self-referencing FK, nullable, NULL for every non-town
    // zone). No pricing table of its own — a town's fares are always
    // computed as 70% of its parent's own figures (fare-pricing.mts's
    // townFareGBPPence), never stored.
    db.exec("ALTER TABLE fare_zones RENAME TO fare_zones_v38");
    db.exec(`
      CREATE TABLE fare_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
        name TEXT NOT NULL,
        zone_type TEXT NOT NULL CHECK (zone_type IN ('city', 'country', 'island', 'town')),
        points TEXT NOT NULL,
        colour TEXT NOT NULL DEFAULT '#3b82f6',
        parent_zone_id INTEGER REFERENCES fare_zones(id)
      )
    `);
    db.exec(`
      INSERT INTO fare_zones (id, depot_group_id, name, zone_type, points, colour)
      SELECT id, depot_group_id, name, zone_type, points, colour FROM fare_zones_v38
    `);
    db.exec("DROP TABLE fare_zones_v38");
    // See the v37 branch's own comment below for why this is the explicit
    // next step (39) rather than SCHEMA_VERSION.
    db.exec("PRAGMA user_version = 39");
  } else if (currentVersion === 37) {
    // v37 -> v38: Island zones (2026-10-31, live user design discussion,
    // T107) — a new zone type parallel to city/country, banded by zone
    // count like country, with its own Day/Weekly/28-day/LATE (fare_zones'
    // own CHECK constraint needs 'island' added, which SQLite can't ALTER
    // in place — same reason route_timetables was rebuilt at v17->v18 —
    // so the table is renamed, recreated with the new CHECK, and the data
    // copied across unchanged). fare_island_zone_bands is brand new
    // (CREATE TABLE IF NOT EXISTS in SCHEMA above creates it, no ALTER
    // needed here, same as any other brand-new table at migration time).
    db.exec("ALTER TABLE fare_zones RENAME TO fare_zones_v37");
    db.exec(`
      CREATE TABLE fare_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
        name TEXT NOT NULL,
        zone_type TEXT NOT NULL CHECK (zone_type IN ('city', 'country', 'island')),
        points TEXT NOT NULL,
        colour TEXT NOT NULL DEFAULT '#3b82f6'
      )
    `);
    db.exec(`
      INSERT INTO fare_zones (id, depot_group_id, name, zone_type, points, colour)
      SELECT id, depot_group_id, name, zone_type, points, colour FROM fare_zones_v37
    `);
    db.exec("DROP TABLE fare_zones_v37");
    db.exec("ALTER TABLE fare_configs ADD COLUMN island_day_gbp_pence INTEGER");
    db.exec("ALTER TABLE fare_configs ADD COLUMN island_weekly_gbp_pence INTEGER");
    db.exec("ALTER TABLE fare_configs ADD COLUMN island_28day_gbp_pence INTEGER");
    db.exec("ALTER TABLE fare_configs ADD COLUMN island_late_gbp_pence INTEGER");
    // Sets the version to exactly the NEXT step (38), not straight to
    // SCHEMA_VERSION — found as a real bug 2026-10-31 when three
    // migrations (this one, Town zones, and shared long-distance
    // sections) all landed in one session without ever being applied for
    // real: the real save sat at v37 while SCHEMA_VERSION had reached 40,
    // and the outer migration dispatch (below) runs in a loop that
    // re-checks after every step specifically so a save more than one
    // version behind keeps advancing — but only once every branch it
    // passes through sets its own correct next version rather than
    // jumping to the latest. Every older branch below still jumps
    // straight to SCHEMA_VERSION, which remains correct for a save
    // exactly one version behind (the normal case in real use, where a
    // save is always migrated as each release ships) — if a future
    // session stacks several migrations in one sitting again without a
    // real release in between, whichever of those new branches run next
    // need the same one-step-at-a-time treatment this comment is leaving
    // here as a trail for.
    db.exec("PRAGMA user_version = 38");
  } else if (currentVersion === 36) {
    // v36 -> v37: fare_configs reworked (2026-10-31, live user design
    // discussion) — special_service_* replaced by airport_express_*
    // (its own Single/Return, not the standard Return formula);
    // network_gbp_pence dropped entirely, NETWORK is now computed from
    // the Combined price × network_markup_percent (fare-pricing.mts's
    // networkFareGBPPence), not its own typed-in figure; runs_night_services
    // and the two sightseeing columns are genuinely new. No real save had
    // anything meaningful stored in the dropped columns yet (fare_configs
    // itself only shipped in the previous session), so this is a clean
    // ALTER, not a data-preserving migration.
    db.exec("ALTER TABLE fare_configs DROP COLUMN special_service_single_gbp_pence");
    db.exec("ALTER TABLE fare_configs DROP COLUMN network_gbp_pence");
    db.exec("ALTER TABLE fare_configs ADD COLUMN airport_express_single_gbp_pence INTEGER");
    db.exec("ALTER TABLE fare_configs ADD COLUMN airport_express_return_gbp_pence INTEGER");
    db.exec("ALTER TABLE fare_configs ADD COLUMN runs_night_services INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE fare_configs ADD COLUMN network_markup_percent REAL");
    db.exec("ALTER TABLE fare_configs ADD COLUMN sightseeing_day_gbp_pence INTEGER");
    db.exec("ALTER TABLE fare_configs ADD COLUMN sightseeing_single_gbp_pence INTEGER");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 35) {
    // v35 -> v36: fare_zones gains a per-zone colour override (default
    // matches the old implicit "city" colour so every existing zone keeps
    // looking the same until the player changes it).
    db.exec("ALTER TABLE fare_zones ADD COLUMN colour TEXT NOT NULL DEFAULT '#3b82f6'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 34) {
    // v34 -> v35: fare_zones is brand new, created by the CREATE TABLE IF
    // NOT EXISTS in SCHEMA above, so this only advances the version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 33) {
    // v33 -> v34: the buy-menu rebuild (OPERATIONS.md §3) — vehicles
    // gained a nullable livery_id, and basket_items/vehicle_orders are
    // brand new (created by the CREATE TABLE IF NOT EXISTS in SCHEMA
    // above). Existing vehicles get livery_id = NULL, same as "plain
    // white" already means for a vehicle bought before this existed.
    db.exec("ALTER TABLE vehicles ADD COLUMN livery_id INTEGER REFERENCES liveries(id)");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 32) {
    // v32 -> v33: the vehicles table — brand new, created by the CREATE
    // TABLE IF NOT EXISTS in SCHEMA above, so this only advances the
    // version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 31) {
    // v31 -> v32: duties gains a required depot_id (see the table's own
    // SCHEMA comment) — nothing real was ever built on the depot-less
    // shape (the feature shipped and was unshipped again the same day), so
    // dropped rather than migrated; CREATE TABLE IF NOT EXISTS above
    // recreates both tables fresh.
    db.exec("DROP TABLE IF EXISTS duty_pieces");
    db.exec("DROP TABLE IF EXISTS duties");
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 30) {
    // v30 -> v31: the duties and duty_pieces tables — brand new, created by
    // the CREATE TABLE IF NOT EXISTS in SCHEMA above, so this only advances
    // the version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 29) {
    // v29 -> v30: routes gained hail_and_ride_sections (DESIGN.md §6 "Hail
    // and ride") — existing rows get '[]' (no hail-and-ride stretches),
    // same as the column's own DEFAULT already means for a brand new row.
    db.exec("ALTER TABLE routes ADD COLUMN hail_and_ride_sections TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 39) {
    // v39 -> v40: shared long-distance sections (see long_distance_sections'
    // own SCHEMA comment above) — routes gain a `segments` column (their
    // own build sequence of custom-point runs and section references);
    // long_distance_sections itself is brand new, CREATE TABLE IF NOT
    // EXISTS in SCHEMA above creates it, so this branch only needs the
    // ALTER plus advancing the version number, same precedent as every
    // other brand-new-table migration in this file.
    db.exec("ALTER TABLE routes ADD COLUMN segments TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = 40`);
  } else if (currentVersion === 40) {
    // v40 -> v41: 28-day tickets dropped entirely (live user request,
    // 2026-10-31: "I also think we should ditch 28 day tickets") — city/
    // country/combined/island all drop their own 28-day column. No real
    // save has ever had anything meaningful in these (the whole Day/
    // Weekly/28-day shape only shipped earlier the same session), so this
    // is a clean DROP, not a data-preserving migration.
    db.exec("ALTER TABLE fare_configs DROP COLUMN city_28day_gbp_pence");
    db.exec("ALTER TABLE fare_configs DROP COLUMN country_28day_gbp_pence");
    db.exec("ALTER TABLE fare_configs DROP COLUMN combined_28day_gbp_pence");
    db.exec("ALTER TABLE fare_configs DROP COLUMN island_28day_gbp_pence");
    db.exec(`PRAGMA user_version = 41`);
  } else if (currentVersion === 41) {
    // v41 -> v42: route types (live user request, 2026-10-31: night/
    // sightseeing/airport-express/long-distance should be chosen when a
    // route is made, not just fare-config toggles). `routes` gains
    // route_type, defaulting every existing row to 'ordinary' (the
    // previously-implicit case) — SQLite supports a CHECK-constrained ADD
    // COLUMN directly here since this is a brand new column, not altering
    // an existing one's constraint (unlike fare_zones' own zone_type,
    // which needed a full table rebuild earlier today for exactly that
    // reason). `runs_night_services` is dropped from fare_configs — no
    // longer a manual per-depot-group toggle, now computed on read from
    // whether the depot group has any route with route_type = 'night'
    // (getFareConfig's own comment below has the real reasoning).
    db.exec(
      "ALTER TABLE routes ADD COLUMN route_type TEXT NOT NULL DEFAULT 'ordinary' CHECK (route_type IN ('ordinary', 'night', 'sightseeing', 'airport_express', 'long_distance'))",
    );
    db.exec("ALTER TABLE fare_configs DROP COLUMN runs_night_services");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 42) {
    // v42 -> v43: the game clock (see its own CREATE TABLE comment in
    // SCHEMA above) — brand new table, CREATE TABLE IF NOT EXISTS in
    // SCHEMA already creates it for this branch to then seed.
    db.exec("INSERT OR IGNORE INTO game_clock (id) VALUES (1)");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 43) {
    // v43 -> v44: explicit "entrances complete" flag on dealers (2026-11-01,
    // live user request) — see dealers' own CREATE TABLE comment above.
    // Brand new column with a fixed default, not altering an existing
    // constraint, so a plain ADD COLUMN is enough (no table rebuild
    // needed, unlike fare_zones' own zone_type CHECK expansion earlier).
    db.exec("ALTER TABLE dealers ADD COLUMN is_entrances_complete INTEGER NOT NULL DEFAULT 0");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 44) {
    // v44 -> v45: repaint shop entrances (see repaint_shop_entrances' own
    // CREATE TABLE comment above) — brand new table, CREATE TABLE IF NOT
    // EXISTS in SCHEMA above already creates it for this branch.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 45) {
    // v45 -> v46: repaint_shops' weekly_capacity replaced by
    // concurrent_capacity + turnaround_days (see repaint_shops' own
    // CREATE TABLE comment above) — a genuine shape change, not just an
    // added column, so the same rename-recreate-copy-drop rebuild as
    // every earlier CHECK/column-shape change here. Any pre-existing
    // custom shop's own weekly_capacity carries across as its new
    // concurrent_capacity (closest available meaning), with a 5-working-
    // day turnaround default (Ferrymill's own real figure, a reasonable
    // placeholder until the player corrects it) — this never applies to
    // Ferrymill/ACE themselves, which are seeded fresh with their own
    // real figures regardless (dealer-reference-pins.ts-style seed).
    db.exec("ALTER TABLE repaint_shops RENAME TO repaint_shops_v45");
    db.exec(`
      CREATE TABLE repaint_shops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lon REAL NOT NULL,
        lat REAL NOT NULL,
        concurrent_capacity INTEGER NOT NULL CHECK (concurrent_capacity > 0),
        turnaround_days INTEGER NOT NULL CHECK (turnaround_days > 0)
      )
    `);
    db.exec(`
      INSERT INTO repaint_shops (id, name, lon, lat, concurrent_capacity, turnaround_days)
      SELECT id, name, lon, lat, weekly_capacity, 5 FROM repaint_shops_v45
    `);
    db.exec("DROP TABLE repaint_shops_v45");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 46) {
    // v46 -> v47: the repaint_bookings table — brand new, created by the
    // CREATE TABLE IF NOT EXISTS in SCHEMA above, so this only advances
    // the version number.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 47) {
    // v47 -> v48: routes gains is_minor_variation (DESIGN.md §6, major/
    // minor variations — see routes' own CREATE TABLE comment above for
    // why this is a plain ADD COLUMN, no CHECK, with the mutual-
    // exclusivity-with-variation_letter rule enforced in createRoute/
    // updateRoute instead of the database. Every existing row gets 0 (no
    // route was ever a minor variation before this column existed).
    db.exec("ALTER TABLE routes ADD COLUMN is_minor_variation INTEGER NOT NULL DEFAULT 0");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 48) {
    // v48 -> v49: real bug fix, found by testing (not assumed) while
    // building the v47->v48 migration above. The v45->v46 migration
    // (repaint_shops' own weekly_capacity -> concurrent_capacity/
    // turnaround_days rebuild) renamed repaint_shops to
    // repaint_shops_v45 — and this project's node:sqlite build rewrites
    // a DEPENDENT table's own FK clause to follow a renamed parent table
    // (confirmed directly with a throwaway test), so
    // repaint_shop_entrances' own schema was silently left permanently
    // saying "REFERENCES repaint_shops_v45(id)", a table that no longer
    // exists from that point on. Confirmed this is live, not
    // theoretical: the real save's own repaint_shop_entrances table has
    // exactly this corruption right now, and inserting a real entrance
    // into it throws "no such table: main.repaint_shops_v45" on a disposable
    // copy. Safe to rebuild outright (a rename-recreate-copy-drop, same
    // pattern as every other rebuild here) since nothing else in the
    // schema references repaint_shop_entrances itself (checked directly,
    // not assumed) — copies across any real rows regardless, even though
    // the real save currently has none.
    db.exec("ALTER TABLE repaint_shop_entrances RENAME TO repaint_shop_entrances_v48");
    db.exec(`
      CREATE TABLE repaint_shop_entrances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repaint_shop_id INTEGER NOT NULL REFERENCES repaint_shops(id),
        lon REAL NOT NULL,
        lat REAL NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('entry', 'exit', 'both'))
      )
    `);
    db.exec(`
      INSERT INTO repaint_shop_entrances (id, repaint_shop_id, lon, lat, mode)
      SELECT id, repaint_shop_id, lon, lat, mode FROM repaint_shop_entrances_v48
    `);
    db.exec("DROP TABLE repaint_shop_entrances_v48");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 49) {
    // v49 -> v50: depot_groups gains ticket_machine_tier and
    // has_tap_on_tap_off (TICKETING.md §1/§2 — see depot_groups' own
    // CREATE TABLE comment above for scope). Plain ADD COLUMN, each with
    // only a single-column CHECK (verified directly this is allowed
    // without a rebuild, unlike the cross-column CHECK the routes
    // migration above had to avoid) — every existing depot group
    // defaults to the real starting point, Basic with no tap-on tap-off.
    db.exec("ALTER TABLE depot_groups ADD COLUMN ticket_machine_tier TEXT NOT NULL DEFAULT 'basic' CHECK (ticket_machine_tier IN ('basic', 'mid', 'advanced'))");
    db.exec("ALTER TABLE depot_groups ADD COLUMN has_tap_on_tap_off INTEGER NOT NULL DEFAULT 0");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 50) {
    // v50 -> v51: the company_upgrades table (TICKETING.md §4) — brand
    // new, CREATE TABLE IF NOT EXISTS in SCHEMA above creates it, so
    // this only advances the version number (same as game_clock's own
    // row, it's created lazily by getCompanyUpgrades/the setters below,
    // not seeded here).
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 51) {
    // v51 -> v52: the finance_transactions table (DESIGN.md §10) —
    // brand new, CREATE TABLE IF NOT EXISTS in SCHEMA above creates it.
    // The real £100,000 opening balance is seeded just below in
    // openSave, not here — same reasoning as the opening dealer/livery
    // seed functions needing the renderer's own boot sequence for real
    // reference data, except this one real figure is simple enough to
    // seed directly here rather than round-trip through the renderer.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 52) {
    // v52 -> v53: route branding (DESIGN.md/OPEN-ITEMS T153) — a route
    // can be assigned a livery and opt into tinting it with the route's
    // own existing `colour` field rather than that livery's plain
    // default colours. Plain ADD COLUMN, no CHECK referencing another
    // column, so no rebuild needed (confirmed safe this way earlier this
    // session). Also vehicles.bought_for_route_id (T153) — which route a
    // vehicle was bought for, recorded for reference only, nothing reads
    // it as an enforced link. A new FK dependent on `routes` — routes
    // itself must never again be rebuilt via rename (the FK-corruption
    // bug fixed earlier this session), only ever ADD COLUMN.
    db.exec("ALTER TABLE routes ADD COLUMN assigned_livery_id INTEGER REFERENCES liveries(id)");
    db.exec("ALTER TABLE routes ADD COLUMN use_branded_colour INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE vehicles ADD COLUMN bought_for_route_id INTEGER REFERENCES routes(id)");
    db.exec("ALTER TABLE basket_items ADD COLUMN bought_for_route_id INTEGER REFERENCES routes(id)");
    db.exec("ALTER TABLE vehicle_orders ADD COLUMN bought_for_route_id INTEGER REFERENCES routes(id)");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 53) {
    // v53 -> v54: depot_groups gains its own colour (T154) — earmarked
    // for a second branding-mask region on the Sightseeing livery, data
    // side only. Plain ADD COLUMN, every existing depot group defaults
    // to the same blue routes already default to.
    db.exec("ALTER TABLE depot_groups ADD COLUMN colour TEXT NOT NULL DEFAULT '#3b82f6'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 54) {
    // v54 -> v55: operator groups (T155) — depot_group_operators and
    // depot_liveries are both brand new, CREATE TABLE IF NOT EXISTS in
    // SCHEMA above creates them. Every EXISTING depot group is seeded
    // with every operator enabled here — without this, a depot group
    // with zero enabled-operator rows would read as "nothing allowed,
    // plain white only" (the real, confirmed rule for a genuinely empty
    // list), silently breaking every save's existing fleet the moment
    // this ships. New depot groups get the same full seeding from
    // createDepotGroup itself, not from this migration.
    const groupIds = (db.prepare("SELECT id FROM depot_groups").all() as { id: number }[]).map((r) => r.id);
    const insertOperator = db.prepare("INSERT OR IGNORE INTO depot_group_operators (depot_group_id, operator_name) VALUES (?, ?)");
    for (const groupId of groupIds) {
      for (const operatorName of Object.keys(OPERATOR_LIVERIES)) {
        insertOperator.run(groupId, operatorName);
      }
    }
    db.exec(`PRAGMA user_version = 55`);
  } else if (currentVersion === 55) {
    // v55 -> v56: duties' day_type becomes a freeform weekday_mask, the
    // same scheme route_timetables already uses (see that table's own
    // v19->v20 migration, same reasoning) — the day-type picker
    // (OPEN-ITEMS.md) needs duties to track whatever patterns the depot
    // group's routes actually use, not the fixed 3 presets. Rebuilt rather
    // than ALTER COLUMN, since SQLite can't add a CHECK constraint to an
    // existing column in place.
    //
    // Built as CREATE new-name -> copy -> DROP old -> RENAME new to old,
    // NOT route_timetables' own RENAME-old-away-first pattern — found as a
    // real bug verifying this exact migration: duty_pieces.duty_id has a
    // live FK to duties(id), and SQLite's ALTER TABLE RENAME automatically
    // rewrites OTHER tables' FK text to follow a renamed table. Renaming
    // duties -> duties_v55 silently rewrote duty_pieces' FK to
    // "REFERENCES duties_v55(id)"; dropping duties_v55 at the end then
    // left duty_pieces permanently referencing a table that no longer
    // existed ("no such table: main.duties_v55" on the next delete).
    // route_timetables has no dependent table, so that rename was never
    // exposed to this. Renaming duties_new -> duties at the very end here
    // never touches duty_pieces at all, since nothing ever referenced
    // "duties_new". Every existing duty's day_type maps straight across to
    // the equivalent mask — identical behaviour to before this migration.
    db.exec(`
      CREATE TABLE duties_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
        depot_id INTEGER NOT NULL REFERENCES depots(id),
        weekday_mask INTEGER NOT NULL CHECK (weekday_mask BETWEEN 1 AND 127),
        duty_number TEXT NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO duties_new (id, depot_group_id, depot_id, weekday_mask, duty_number, locked)
      SELECT id, depot_group_id, depot_id,
        CASE day_type
          WHEN 'monday_friday' THEN ${MONDAY_FRIDAY_MASK}
          WHEN 'saturday' THEN ${SATURDAY_MASK}
          WHEN 'sunday' THEN ${SUNDAY_MASK}
        END,
        duty_number, locked
      FROM duties
    `);
    // Same latent bug the routes v57->v58 migration below found and
    // fixed for real (not assumed to apply here too — checked, since
    // this table's own DROP never actually failed against any save seen
    // so far): node:sqlite's `DatabaseSync` defaults `PRAGMA
    // foreign_keys` to ON, so `DROP TABLE duties` performs an implicit
    // `DELETE FROM duties` checked against every real duty_pieces row
    // still referencing a real duty. This table's own DROP never
    // actually hit it in practice only because nothing had put a real
    // row in duty_pieces yet at the point this migration last ran
    // against real data — the risk was always there, patched
    // defensively now that the mechanism is understood.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE duties");
    db.exec("ALTER TABLE duties_new RENAME TO duties");
    const dutyFkViolations = db.prepare("PRAGMA foreign_key_check").all();
    if (dutyFkViolations.length > 0) {
      throw new Error(`duties rebuild (v55->v56) left ${dutyFkViolations.length} foreign key violation(s): ${JSON.stringify(dutyFkViolations)}`);
    }
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`PRAGMA user_version = 56`);
  } else if (currentVersion === 56) {
    // v56 -> v57: which of a route's points are timing points moves from
    // being re-entered inside every separate timetable component to a
    // single list on the route itself — a live user request (2026-11-07):
    // "timing points should be set in the route and the times set in the
    // timetable." DESIGN.md §4 already specified this ("Timing point —
    // set on the stop, overridable per route") and §6's Express services
    // note ("timing points are per route") agrees; the component-level
    // storage this is replacing was a drift from that written spec, not
    // a deliberate design. A plain ADD COLUMN, same as
    // pickup_dropoff_overrides' own original migration — no CHECK
    // constraint needed, so none of the rename-rebuild FK risk (T141,
    // duties' own v55->v56 above) applies here. Existing timetable
    // components keep whatever {pointIndex, legMinutes, dwellMinutes}
    // entries they already have in their own "timing_points" column
    // (route-timetable-panel.ts only reads/writes those whose pointIndex
    // is also in the route's own new list going forward, but nothing here
    // deletes the now-unreferenced ones) — left as-is rather than
    // migrated, the same "shown as-is, player edits manually" precedent
    // the day-type picker work used for pre-existing components.
    db.exec("ALTER TABLE routes ADD COLUMN timing_point_indexes TEXT NOT NULL DEFAULT '[]'");
    db.exec(`PRAGMA user_version = 57`);
  } else if (currentVersion === 57) {
    // v57 -> v58: two unrelated changes bundled into one version bump —
    // drivers is brand new (CREATE TABLE IF NOT EXISTS in SCHEMA above
    // already creates it, same "brand-new table only needs the version
    // advanced" precedent as every other new table in this file), and
    // routes.route_type's own CHECK constraint needed a value added
    // ('staff' — a live request, 2026-11-08: "add a staff bus route type
    // ... to get drivers to and from work"). A CHECK can't be altered in
    // place, and ALTER TABLE ADD COLUMN only fixes a *new* column's own
    // constraint, not route_type's (added long before this save's own
    // history) — so this is a real rebuild, not a plain ADD COLUMN.
    // `routes` is this schema's most heavily-referenced table
    // (route_timetables.route_id, duty_pieces.route_id,
    // vehicles/basket_items/vehicle_orders.bought_for_route_id, and
    // routes.parent_route_id referencing itself) — built with the SAME
    // safe CREATE-new/copy/DROP-old/RENAME pattern the duties v55->v56
    // migration above established (never RENAME the table away first;
    // every dependent's own FK text already says "routes" and is never
    // touched), including the self-reference (parent_route_id), which
    // the final RENAME fixes up exactly the same way it would fix a
    // dependent in a different table. Takes the opportunity to drop the
    // CHECK entirely rather than just append 'staff' to its list — the
    // routes table's own SCHEMA comment already chose "enforced in the
    // application layer, not a CHECK constraint" for variation_letter's
    // own mutual-exclusivity rule, for exactly this reason (a CHECK on
    // this particular table is expensive to ever change again); every
    // real caller is TypeScript-typed to RouteType already, which is
    // the actual enforcement that matters day to day.
    //
    // A second, real bug found running this against the full suite (not
    // assumed safe): node:sqlite's own `DatabaseSync` defaults
    // `PRAGMA foreign_keys` to ON (confirmed directly: a fresh in-memory
    // DatabaseSync reports `{foreign_keys: 1}`) — contradicting this
    // file's own much older comment elsewhere ("ON DELETE CASCADE unless
    // PRAGMA foreign_keys is on (it is not, here)"), which must have
    // been true of an earlier node:sqlite version, or was simply wrong,
    // and nothing had exposed it since. With it genuinely on, `DROP
    // TABLE routes` performs SQLite's own documented implicit `DELETE
    // FROM routes` first, and that delete is checked against every real
    // route_timetables/duty_pieces/vehicles/etc. row still referencing a
    // real route — "FOREIGN KEY constraint failed" the moment any such
    // row exists (which the real save, and this very test script by
    // this point, both have). The duties v55->v56 migration above never
    // hit this only because nothing had put a real row in duty_pieces
    // yet at the point it last ran against real data — the same risk is
    // latent there too, not something this table is uniquely exposed
    // to. Fixed the standard way (SQLite's own documented 12-step
    // "Making Other Kinds Of Table Schema Changes" procedure): disable
    // enforcement for just this rebuild, restore it straight after, and
    // run `foreign_key_check` before restoring to confirm the rebuild
    // itself didn't silently corrupt anything (it doesn't touch any
    // dependent table's own rows, only routes' schema, so this is
    // expected to come back clean — checked directly, not assumed).
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(`
      CREATE TABLE routes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
        number TEXT NOT NULL,
        points TEXT NOT NULL,
        orientation TEXT NOT NULL CHECK (orientation IN ('inbound', 'outbound')),
        terminus_index INTEGER,
        start_index INTEGER,
        colour TEXT NOT NULL DEFAULT '#3b82f6',
        name TEXT,
        pickup_dropoff_overrides TEXT NOT NULL DEFAULT '[]',
        timing_point_indexes TEXT NOT NULL DEFAULT '[]',
        parent_route_id INTEGER REFERENCES routes_new(id),
        variation_letter TEXT,
        composed_from_route_ids TEXT NOT NULL DEFAULT '[]',
        hail_and_ride_sections TEXT NOT NULL DEFAULT '[]',
        segments TEXT NOT NULL DEFAULT '[]',
        route_type TEXT NOT NULL DEFAULT 'ordinary',
        is_minor_variation INTEGER NOT NULL DEFAULT 0,
        assigned_livery_id INTEGER REFERENCES liveries(id),
        use_branded_colour INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO routes_new (
        id, depot_group_id, number, points, orientation, terminus_index, start_index, colour, name,
        pickup_dropoff_overrides, timing_point_indexes, parent_route_id, variation_letter,
        composed_from_route_ids, hail_and_ride_sections, segments, route_type, is_minor_variation,
        assigned_livery_id, use_branded_colour
      )
      SELECT
        id, depot_group_id, number, points, orientation, terminus_index, start_index, colour, name,
        pickup_dropoff_overrides, timing_point_indexes, parent_route_id, variation_letter,
        composed_from_route_ids, hail_and_ride_sections, segments, route_type, is_minor_variation,
        assigned_livery_id, use_branded_colour
      FROM routes
    `);
    db.exec("DROP TABLE routes");
    db.exec("ALTER TABLE routes_new RENAME TO routes");
    const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
    if (fkViolations.length > 0) {
      throw new Error(`routes rebuild (v57->v58) left ${fkViolations.length} foreign key violation(s): ${JSON.stringify(fkViolations)}`);
    }
    db.exec("PRAGMA foreign_keys = ON");
    // duties already exists for an old save (drivers doesn't yet, hence
    // the brand-new-table-only-needs-the-version-advanced treatment
    // above) — a plain ADD COLUMN, no CHECK, no rebuild risk.
    db.exec("ALTER TABLE duties ADD COLUMN driver_id INTEGER REFERENCES drivers(id)");
    // A depot's own staff-route stop — see player_stops' own SCHEMA
    // comment. Plain ADD COLUMN: nothing references player_stops, so
    // there's no rebuild risk at all here.
    db.exec("ALTER TABLE player_stops ADD COLUMN depot_id INTEGER REFERENCES depots(id)");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 58) {
    // v58 -> v59 (T179, OPEN-ITEMS.md, confirmed 2026-11-13): the vehicle
    // re-power mechanic. vehicles.bought_game_day is a plain ADD COLUMN
    // (no CHECK, no rebuild risk) — existing vehicles default to day 0,
    // always old enough for the re-power age gate rather than
    // retroactively blocking something the player already owns (see that
    // column's own SCHEMA comment). dealers needs a real rebuild, not a
    // plain ADD COLUMN, since its manufacturer CHECK constraint is
    // changing ('western_commercial' dropped, 'evm' added — Western
    // Commercial only ever stood in for EVM-prefixed vehicles before
    // England was in scope) alongside the new is_repower_site column.
    // Same safe CREATE-new/copy-with-translation/DROP-old/RENAME pattern,
    // and the same real foreign-key-enforcement risk, as the routes
    // v57->v58 migration above (dealer_entrances.dealer_id and the
    // brand-new repower_bookings.dealer_id both reference this table) —
    // ids are preserved exactly, so dealer_entrances' own rows keep
    // resolving correctly with no changes of their own needed.
    db.exec("ALTER TABLE vehicles ADD COLUMN bought_game_day INTEGER NOT NULL DEFAULT 0");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(`
      CREATE TABLE dealers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        manufacturer TEXT NOT NULL CHECK (manufacturer IN ('volvo', 'adl', 'evm', 'wrightbus', 'yutong')),
        lon REAL NOT NULL,
        lat REAL NOT NULL,
        is_entrances_complete INTEGER NOT NULL DEFAULT 0,
        is_repower_site INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO dealers_new (id, name, manufacturer, lon, lat, is_entrances_complete)
      SELECT id, name, CASE WHEN manufacturer = 'western_commercial' THEN 'evm' ELSE manufacturer END, lon, lat, is_entrances_complete
      FROM dealers
    `);
    db.exec("DROP TABLE dealers");
    db.exec("ALTER TABLE dealers_new RENAME TO dealers");
    const dealerFkViolations = db.prepare("PRAGMA foreign_key_check").all();
    if (dealerFkViolations.length > 0) {
      throw new Error(`dealers rebuild (v58->v59) left ${dealerFkViolations.length} foreign key violation(s): ${JSON.stringify(dealerFkViolations)}`);
    }
    db.exec("PRAGMA foreign_keys = ON");
    // Steps to exactly the next version (59), not straight to
    // SCHEMA_VERSION — found as a real bug 2026-11-14 while building T185,
    // the same class of bug the v37 branch's own comment above already
    // documents and fixed: T179/T182/T183/T184/T185 all landed in one
    // continuous session (2026-11-13/14) with no real release applying
    // any of them in between, so this branch had five more migrations
    // stacked on top of it by the time this was caught — jumping straight
    // to SCHEMA_VERSION here silently skipped all of them for any save
    // sitting at v58, exactly the "skipping everything in between" bug
    // v37 warns about. Caught directly, not by inspection: this file's
    // own v58 migration-fixture test calls buyVehicle afterward, which
    // started throwing "no such column named payment_method" once T185's
    // own v62->v63 branch existed, because the vehicles table never
    // actually gained is_spare/payment_method (or routes' vehicle-
    // restriction columns, or drivers.private_hire_vehicle_id) — every
    // later branch's own ALTER had silently never run against this path.
    db.exec("PRAGMA user_version = 59");
  } else if (currentVersion === 59) {
    // v59 -> v60 (Q18+Q19, OPEN-ITEMS.md, confirmed 2026-11-13): route-level
    // manual vehicle eligibility restrictions. Four plain nullable ADD
    // COLUMNs — no rebuild risk (routes is never RENAMEd/dropped for this),
    // same "plain ADD COLUMN" precedent as assigned_livery_id/
    // use_branded_colour (v57->v58). Each CHECK explicitly allows NULL
    // (`col IS NULL OR col IN (...)`) since every existing row gets NULL
    // for a brand-new column with no DEFAULT — SQLite only refuses an
    // ADD COLUMN's CHECK if it would evaluate to false (not NULL) for a
    // pre-existing row, so this passes cleanly for every save. See the
    // routes table's own SCHEMA comment above for the full reasoning
    // (including why the automatic OSM-limit axis needs no column here).
    db.exec(
      "ALTER TABLE routes ADD COLUMN vehicle_restriction_base_type TEXT CHECK (vehicle_restriction_base_type IS NULL OR vehicle_restriction_base_type IN ('Double-deckers', 'Specialised (sightseeing, open-top only)', 'Single-deckers / midibuses', 'Minibus', 'Coaches'))",
    );
    db.exec(
      "ALTER TABLE routes ADD COLUMN vehicle_restriction_power_type TEXT CHECK (vehicle_restriction_power_type IS NULL OR vehicle_restriction_power_type IN ('diesel', 'electric', 'hybrid', 'hydrogen'))",
    );
    db.exec(
      "ALTER TABLE routes ADD COLUMN vehicle_restriction_axle_count TEXT CHECK (vehicle_restriction_axle_count IS NULL OR vehicle_restriction_axle_count IN ('twin-axle', 'tri-axle'))",
    );
    db.exec("ALTER TABLE routes ADD COLUMN vehicle_restriction_livery_id INTEGER REFERENCES liveries(id)");
    // Steps to exactly the next version (60), not straight to
    // SCHEMA_VERSION — same same-session-stacking fix as v58's own branch
    // above (found alongside it, 2026-11-14).
    db.exec("PRAGMA user_version = 60");
  } else if (currentVersion === 60) {
    // v60 -> v61 (T183 — private hire revival, Q20/OPEN-ITEMS.md, confirmed
    // 2026-11-13): a plain nullable ADD COLUMN on drivers, same "no rebuild
    // risk" precedent as every other plain ADD COLUMN above (drivers is
    // never RENAMEd/dropped for this). private_hire_income_months is a
    // brand-new table with no pre-existing rows to migrate at all, so it
    // needs no ALTER/rebuild here — CREATE TABLE IF NOT EXISTS in the base
    // SCHEMA above already creates it the moment this save is next opened.
    db.exec("ALTER TABLE drivers ADD COLUMN private_hire_vehicle_id INTEGER REFERENCES vehicles(id)");
    // Steps to exactly the next version (61), not straight to
    // SCHEMA_VERSION — same same-session-stacking fix as v58's own branch
    // above (found alongside it, 2026-11-14).
    db.exec("PRAGMA user_version = 61");
  } else if (currentVersion === 61) {
    // v61 -> v62 (T184 — spare bus designation, Q22/OPEN-ITEMS.md,
    // confirmed 2026-11-13): a plain nullable-with-default ADD COLUMN on
    // vehicles, same "no rebuild risk" precedent as every other plain
    // ADD COLUMN above (vehicles is never RENAMEd/dropped for this).
    db.exec("ALTER TABLE vehicles ADD COLUMN is_spare INTEGER NOT NULL DEFAULT 0");
    // Steps to exactly the next version (62), not straight to
    // SCHEMA_VERSION — same same-session-stacking fix as v58's own branch
    // above (found alongside it, 2026-11-14).
    db.exec("PRAGMA user_version = 62");
  } else if (currentVersion === 62) {
    // v62 -> v63 (T185 — real lease billing, follow-up to T184, confirmed
    // 2026-11-14): a plain NOT-NULL-with-default ADD COLUMN on vehicles,
    // same "no rebuild risk" precedent as every other plain ADD COLUMN
    // above (vehicles is never RENAMEd/dropped for this) — including a
    // CHECK constraint on the new column, same as the
    // vehicle_restriction_* columns' own v59->v60 migration already did.
    // lease_billing_months is a brand-new table with no pre-existing rows
    // to migrate, so it needs no ALTER/rebuild here — CREATE TABLE IF NOT
    // EXISTS in the base SCHEMA above already creates it the moment this
    // save is next opened.
    db.exec("ALTER TABLE vehicles ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'buy_outright' CHECK (payment_method IN ('buy_outright', 'lease', 'lease_to_own'))");
    // Steps to exactly the next version (63), not straight to
    // SCHEMA_VERSION — same same-session-stacking fix as v58's own branch
    // above (found alongside it, 2026-11-14).
    db.exec("PRAGMA user_version = 63");
  } else if (currentVersion === 63) {
    // v63 -> v64 (removal of T184's spare bus designation, per the user's
    // own direct instruction 2026-11-14 — see OPEN-ITEMS.md's new entry):
    // the mechanic (isSpare flag + coverage matching) is dropped entirely,
    // so the column it was stored in goes too, a real DROP COLUMN rather
    // than leaving it dead. Confirmed directly (scratch test against
    // node:sqlite's DatabaseSync) that modern SQLite's own DROP COLUMN
    // support handles this cleanly — no table rebuild needed, unlike a
    // RENAME/retype migration elsewhere in this file.
    db.exec("ALTER TABLE vehicles DROP COLUMN is_spare");
    // Explicit 64, not `${SCHEMA_VERSION}` (now 65, since the v64->v65
    // migration below was added after this branch) — the same "set the
    // real next step, not the shared constant, once a branch stops being
    // the newest one" fix the v37/v38 branch's own comment already
    // documents further down this file. Using SCHEMA_VERSION here again
    // would jump straight past the v64->v65 migration below, leaving a
    // genuinely v63-or-older save stuck without mirror_source_timetable_
    // id/mirror_offset_minutes despite PRAGMA user_version correctly
    // reading as "up to date" — caught live by this file's own v19->v20
    // full-chain migration test suddenly failing once the v64 branch was
    // added, not guessed.
    db.exec("PRAGMA user_version = 64");
  } else if (currentVersion === 64) {
    // v64 -> v65 (2026-11-15): a timetable component can mirror another
    // service's own arrivals instead of using the normal time-band
    // generator — "a button to set a timetable to have a service after a
    // settable time after one arrives, it will make return journeys much
    // easier," confirmed to mean every departure mirrors an arrival of
    // the referenced service, and confirmed separately that this must
    // stay a LIVE link ("can the auto timetable bit then automatically
    // update whenever the other timetable is updated") rather than a
    // one-time copy — so only the reference (which other route_timetables
    // row, and the offset) is stored; the actual mirrored departure
    // minutes are recomputed fresh every time, same as every other
    // derived/merged view in this schema. Both columns nullable and
    // default NULL — only a mirroring component ever sets them, every
    // existing row is unaffected. No ON DELETE behaviour relied on here
    // (this project doesn't enable `PRAGMA foreign_keys`, confirmed
    // elsewhere in this file) — a mirror whose source row no longer
    // exists in a fresh `listAllRouteTimetables()` read simply resolves
    // to nothing and produces zero departures, the same "can't find it,
    // don't fake it" convention used throughout this codebase, so no
    // explicit cleanup is needed when the source is deleted.
    db.exec("ALTER TABLE route_timetables ADD COLUMN mirror_source_timetable_id INTEGER REFERENCES route_timetables(id)");
    db.exec("ALTER TABLE route_timetables ADD COLUMN mirror_offset_minutes INTEGER");
    db.exec("PRAGMA user_version = 65");
  } else if (currentVersion === 65) {
    // v65 -> v66 (2026-11-15): a timing point's published leg time became
    // PADDING above the real fastest achievable time, with a separate
    // figure for the two fixed AM/PM peak windows — "can it be set so its
    // an amount of time more than the minimum with a separate time for
    // peak times of day please" (route-timetable.mts's own TimingPoint
    // comment has the full reasoning). `timing_points`' own JSON shape
    // changes from {pointIndex, legMinutes, dwellMinutes} to {pointIndex,
    // standardPaddingMinutes, peakPaddingMinutes, dwellMinutes}.
    //
    // Cannot compute each existing timing point's real historical padding
    // here — that needs the real fastest-achievable time for its own leg,
    // which only the WASM router can compute, and the router only runs in
    // the renderer process, not here (this file's own established "don't
    // import from the renderer" rule, confirmed by checking: no migration
    // in this file has ever called into the router). So every existing
    // timing point's padding is RESET to 0 (both standard and peak) — a
    // one-time, deliberate reset, not a silently wrong invented number;
    // the player will see 0 padding (= exactly the real fastest time) the
    // next time they open each affected timetable, and can re-add
    // whatever buffer they want. `peakPaddingMinutes: 0` (not null) is a
    // real, valid figure here, not "unset" — a genuinely island-restricted
    // route would only ever get null once the player (or the editor UI
    // enforcing the restriction) saves it that way going forward.
    //
    // The new arrival/departure peak-offset columns default to a COPY of
    // the existing (now-reset-to-zero-padding) non-peak offsets, not an
    // empty array — since standard and peak padding are both 0 at this
    // point, the two variants' real computed offsets ARE identical, so
    // this is the genuinely correct value, not a placeholder, and avoids
    // buildRouteTimetableGrid ever reading a mismatched-length peak array
    // before the player next saves that timetable through the UI.
    db.exec("ALTER TABLE route_timetables ADD COLUMN arrival_offsets_seconds_peak TEXT NOT NULL DEFAULT '[]'");
    db.exec("ALTER TABLE route_timetables ADD COLUMN departure_offsets_seconds_peak TEXT NOT NULL DEFAULT '[]'");
    db.exec("UPDATE route_timetables SET arrival_offsets_seconds_peak = arrival_offsets_seconds, departure_offsets_seconds_peak = departure_offsets_seconds");
    const timingPointRows = db.prepare("SELECT id, timing_points FROM route_timetables").all() as unknown as { id: number; timing_points: string }[];
    const updateTimingPointsStmt = db.prepare("UPDATE route_timetables SET timing_points = ? WHERE id = ?");
    for (const row of timingPointRows) {
      const oldPoints = JSON.parse(row.timing_points) as { pointIndex: number; legMinutes: number; dwellMinutes: number }[];
      const newPoints = oldPoints.map((tp) => ({
        pointIndex: tp.pointIndex,
        standardPaddingMinutes: 0,
        peakPaddingMinutes: 0,
        dwellMinutes: tp.dwellMinutes,
      }));
      updateTimingPointsStmt.run(JSON.stringify(newPoints), row.id);
    }
    db.exec("PRAGMA user_version = 66");
  } else if (currentVersion === 66) {
    // v66 -> v67 (2026-11-16): council-triggered stop upgrades (OPEN-
    // ITEMS.md "Phase 5/9 redesign: stop ownership dropped..."). New
    // table only — no existing data to migrate, since no stop-upgrade
    // state existed anywhere before this.
    db.exec(`
      CREATE TABLE IF NOT EXISTS stop_upgrades (
        stop_osm_id INTEGER PRIMARY KEY,
        has_seating INTEGER NOT NULL DEFAULT 0,
        has_lighting INTEGER NOT NULL DEFAULT 0,
        has_shelter INTEGER NOT NULL DEFAULT 0,
        seating_installed_game_day INTEGER,
        lighting_installed_game_day INTEGER,
        shelter_installed_game_day INTEGER
      )
    `);
    db.exec("PRAGMA user_version = 67");
  } else if (currentVersion === 67) {
    // v67 -> v68 (2026-11-20): contract-stop bundling/airport-stop
    // purchase (OPEN-ITEMS.md "Phase 5/9 redesign: stop ownership
    // dropped..."). stop_route_locks itself is a brand-new table,
    // already created unconditionally by the SCHEMA string above on
    // every openSave() call (same precedent as route_milestones etc.).
    //
    // route_advertising_bookings is trickier: it was ITSELF added without
    // a dedicated version-gated branch (unconditional CREATE TABLE IF NOT
    // EXISTS), so a save that never had the table at all (anything older
    // than this session's own v66/v67 work) gets it created FRESH, with
    // is_contract_bundle already included, by the unconditional
    // `db.exec(SCHEMA)` at the very top of openSave() — before this
    // migration loop even runs. Only a save where the table already
    // existed ON DISK without this column (a real save saved sometime
    // between route_advertising_bookings' own introduction and this
    // column being added) genuinely needs the ALTER. Checked directly via
    // PRAGMA table_info rather than assumed either way — found as a real
    // crash ("duplicate column name") against this file's own v58
    // migration fixture, which has no route_advertising_bookings table at
    // all going in and so gets the complete current shape for free.
    const existingColumns = db.prepare("PRAGMA table_info(route_advertising_bookings)").all() as unknown as { name: string }[];
    if (!existingColumns.some((c) => c.name === "is_contract_bundle")) {
      db.exec("ALTER TABLE route_advertising_bookings ADD COLUMN is_contract_bundle INTEGER NOT NULL DEFAULT 0");
    }
    // Steps to exactly the next version (68), not straight to
    // SCHEMA_VERSION — same same-session-stacking fix as v58's own branch
    // (this used to be the terminal branch when SCHEMA_VERSION was still
    // 68 itself, which is why it previously jumped straight there; now
    // that v68->v69 exists below, this must stop at 68 or a save sitting
    // at v67 would skip the v68 migration entirely).
    db.exec("PRAGMA user_version = 68");
  } else if (currentVersion === 68) {
    // v68 -> v69 (2026-11-20): GreenRoad driver-behaviour system, user's
    // own request by name. greenroad_billing_months is a brand-new table,
    // already created unconditionally by the SCHEMA string above on every
    // openSave() call (same precedent as stop_route_locks/route_milestones
    // etc.). The 3 ancient tables below predate this column, so they
    // normally need a real ALTER — EXCEPT for a fixture/save old enough
    // that one of them didn't exist on disk at all going in, which the
    // unconditional `CREATE TABLE IF NOT EXISTS` at the top of openSave()
    // (running before this loop) then creates fresh with the complete
    // CURRENT shape, greenroad_fitted already included. Same real crash
    // and same PRAGMA table_info guard as route_advertising_bookings'
    // is_contract_bundle column above (confirmed directly against this
    // file's own v19 migration fixture, which has no basket_items table
    // at all going in).
    for (const table of ["vehicles", "basket_items", "vehicle_orders"]) {
      const existingColumns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
      if (!existingColumns.some((c) => c.name === "greenroad_fitted")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN greenroad_fitted INTEGER NOT NULL DEFAULT 0`);
      }
    }
    // company_upgrades' own new column (has_adopted_greenroad) — same
    // guard, different column name, since this table predates GreenRoad
    // too.
    const companyUpgradeColumns = db.prepare("PRAGMA table_info(company_upgrades)").all() as unknown as { name: string }[];
    if (!companyUpgradeColumns.some((c) => c.name === "has_adopted_greenroad")) {
      db.exec("ALTER TABLE company_upgrades ADD COLUMN has_adopted_greenroad INTEGER NOT NULL DEFAULT 0");
    }
    // Steps to exactly the next version (69), not straight to
    // SCHEMA_VERSION — same same-session-stacking fix as v58's/v67's own
    // branches (this used to be the terminal branch when SCHEMA_VERSION
    // was still 69 itself; now that v69->v70 exists below, this must
    // stop at 69 or a save sitting at v68 would skip it entirely).
    db.exec("PRAGMA user_version = 69");
  } else if (currentVersion === 69) {
    // v69 -> v70 (2026-11-20, same day as v68->v69): the retrofit
    // booking's own real engineer-scheduling needs each booking's depot
    // and depot group (greenroad_retrofit_bookings' own SCHEMA comment
    // above) — added after v68->v69 had already shipped (and already
    // migrated the real live save, confirmed directly), so this is a
    // genuine second ALTER, not foldable into the branch above. No
    // existing row needs backfilling in practice — nothing had actually
    // called createGreenroadRetrofitBooking against any real save before
    // this column existed (checked directly) — but the columns are left
    // nullable regardless, the honest reading for a hypothetical old row
    // with no real depot to backfill from.
    const retrofitColumns = db.prepare("PRAGMA table_info(greenroad_retrofit_bookings)").all() as unknown as { name: string }[];
    if (!retrofitColumns.some((c) => c.name === "depot_id")) {
      db.exec("ALTER TABLE greenroad_retrofit_bookings ADD COLUMN depot_id INTEGER REFERENCES depots(id)");
    }
    if (!retrofitColumns.some((c) => c.name === "depot_group_id")) {
      db.exec("ALTER TABLE greenroad_retrofit_bookings ADD COLUMN depot_group_id INTEGER REFERENCES depot_groups(id)");
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Save file schema version ${currentVersion} is not supported (expected ${SCHEMA_VERSION})`,
    );
  }
    currentVersion = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  }

  // Opening balance (DESIGN.md §10, confirmed 2026-11-05: "£100,000...
  // granted exactly once, when a new company is created") — seeded the
  // first time this save's own finance_transactions table is found
  // completely empty, on EVERY openSave call (idempotent, same pattern
  // as seedRealDealers/seedRealLiveries elsewhere, just run from here
  // instead of the renderer's boot sequence since there's no real-world
  // reference data to look up). Never re-grants it on a save that
  // already has any transaction at all, including one for £0 or a
  // negative figure — only a genuinely brand new save ever has zero
  // rows here.
  const transactionCount = (db.prepare("SELECT COUNT(*) AS c FROM finance_transactions").get() as { c: number }).c;
  if (transactionCount === 0) {
    db.prepare(
      "INSERT INTO finance_transactions (amount_gbp_pence, category, depot_group_id, description, game_day, created_at) VALUES (?, 'opening_balance', NULL, 'Opening balance', 0, ?)",
    ).run(10_000_000, new Date().toISOString());
  }

  return db;
}

// The player-structured regions (OPERATIONS.md §1a) — fixed, not
// player-editable. A depot group belongs to exactly one.
export const REGIONS = [
  "North Scotland",
  "West Scotland",
  "East Scotland",
  "Shetland",
  "North England",
] as const;
export type Region = (typeof REGIONS)[number];

// Depot groups — the first real save-data object (OPERATIONS.md §1). A depot
// belongs to exactly one group; the group itself is just a name and region
// until routes, depots and fare zones exist to hang off it.
export interface DepotGroup {
  id: number;
  name: string;
  region: string;
  mainBusStationOsmId: number | null;
  ticketMachineTier: TicketMachineTier;
  hasTapOnTapOff: boolean;
  // T154, confirmed 2026-11-07 — earmarked for a second branding-mask
  // region on the Sightseeing livery specifically, data side only.
  colour: string;
}

interface DepotGroupRow {
  id: number;
  name: string;
  region: string;
  main_bus_station_osm_id: number | null;
  ticket_machine_tier: TicketMachineTier;
  has_tap_on_tap_off: number;
  colour: string;
}

function fromRow(row: DepotGroupRow): DepotGroup {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    mainBusStationOsmId: row.main_bus_station_osm_id === null ? null : Number(row.main_bus_station_osm_id),
    ticketMachineTier: row.ticket_machine_tier,
    hasTapOnTapOff: row.has_tap_on_tap_off !== 0,
    colour: row.colour,
  };
}

// The Advanced ratchet (TICKETING.md §1, ticket-machine.mts's own
// minimumStartingTier) only ever constrains a BRAND NEW group's own
// starting tier — never checked again once a group exists, so an
// existing group's own later tier change (setDepotGroupTicketMachineTier
// below) is free to move in either direction with no ratchet check.
export function createDepotGroup(db: SaveDb, name: string, region: string): DepotGroup {
  const existingTiers = (db.prepare("SELECT ticket_machine_tier FROM depot_groups").all() as { ticket_machine_tier: TicketMachineTier }[]).map(
    (r) => r.ticket_machine_tier,
  );
  const startingTier = minimumStartingTier(existingTiers);
  const result = db.prepare("INSERT INTO depot_groups (name, region, ticket_machine_tier) VALUES (?, ?, ?)").run(name, region, startingTier);
  const newGroupId = Number(result.lastInsertRowid);
  // T155: a brand new depot group starts with every operator enabled —
  // same "unrestricted by default" behaviour every depot group already
  // had before this system existed, not a surprising empty start.
  const insertOperator = db.prepare("INSERT OR IGNORE INTO depot_group_operators (depot_group_id, operator_name) VALUES (?, ?)");
  for (const operatorName of Object.keys(OPERATOR_LIVERIES)) {
    insertOperator.run(newGroupId, operatorName);
  }
  return {
    id: Number(result.lastInsertRowid),
    name,
    region,
    mainBusStationOsmId: null,
    ticketMachineTier: startingTier,
    hasTapOnTapOff: false,
    colour: "#3b82f6",
  };
}

export function listDepotGroups(db: SaveDb): DepotGroup[] {
  const rows = db
    .prepare("SELECT id, name, region, main_bus_station_osm_id, ticket_machine_tier, has_tap_on_tap_off, colour FROM depot_groups ORDER BY name")
    .all() as unknown as DepotGroupRow[];
  return rows.map(fromRow);
}

export function setDepotGroupColour(db: SaveDb, id: number, colour: string): void {
  db.prepare("UPDATE depot_groups SET colour = ? WHERE id = ?").run(colour, id);
}

// T155 — this depot group's own enabled operators (livery-seed-
// data.mts's OPERATOR_LIVERIES). An empty array is a real, valid state
// ("plain white only, confirmed directly") — only createDepotGroup/the
// v54->v55 migration seed the "everyone enabled" default, never this
// getter itself.
export function getEnabledOperatorsForDepotGroup(db: SaveDb, depotGroupId: number): string[] {
  return (db.prepare("SELECT operator_name FROM depot_group_operators WHERE depot_group_id = ?").all(depotGroupId) as { operator_name: string }[]).map(
    (r) => r.operator_name,
  );
}

// Replaces the whole enabled-operator set for this depot group — the
// caller passes the complete new list (e.g. every checked box in the
// panel), not a single toggle, same "replace the whole set" shape as
// setRouteBranding elsewhere in this file.
export function setEnabledOperatorsForDepotGroup(db: SaveDb, depotGroupId: number, operatorNames: readonly string[]): void {
  db.prepare("DELETE FROM depot_group_operators WHERE depot_group_id = ?").run(depotGroupId);
  const insert = db.prepare("INSERT INTO depot_group_operators (depot_group_id, operator_name) VALUES (?, ?)");
  for (const name of operatorNames) insert.run(depotGroupId, name);
}

// T155 — a single DEPOT's own narrower livery selection, by livery id.
// Null means "not narrowed, inherits everything the depot group's own
// enabled operators allow" (confirmed directly) — a real, different
// state from "narrowed to nothing," which is an empty array. Known,
// accepted limitation: since "narrowed to nothing" and "never narrowed"
// are both zero rows in the table, this getter can't actually tell them
// apart — it always returns null (unrestricted) once nothing is stored,
// even if the player explicitly unchecked every livery through a UI
// that allowed it. Flagged rather than silently guessed past.
export function getNarrowedLiveriesForDepot(db: SaveDb, depotId: number): number[] | null {
  const rows = db.prepare("SELECT livery_id FROM depot_liveries WHERE depot_id = ?").all(depotId) as { livery_id: number }[];
  return rows.length === 0 ? null : rows.map((r) => r.livery_id);
}

// Pass an empty array (not null) to explicitly narrow to nothing, or a
// real list of livery ids to narrow to exactly those. There's no way
// to call this with "clear back to unrestricted" other than deleting
// every row some other way — same known limitation as the getter above.
export function setNarrowedLiveriesForDepot(db: SaveDb, depotId: number, liveryIds: readonly number[]): void {
  db.prepare("DELETE FROM depot_liveries WHERE depot_id = ?").run(depotId);
  const insert = db.prepare("INSERT INTO depot_liveries (depot_id, livery_id) VALUES (?, ?)");
  for (const liveryId of liveryIds) insert.run(depotId, liveryId);
}

// A direct tier change on an EXISTING group — never ratchet-checked
// (see createDepotGroup's own comment above for why), so a group can
// freely move between any two tiers. Throws rather than silently
// clamping an invalid string, same defensiveness as createRoute/
// updateRoute's own isMinorVariation guard.
export function setDepotGroupTicketMachineTier(db: SaveDb, id: number, tier: TicketMachineTier): void {
  if (!(tier in TICKET_MACHINE_PRICE_GBP)) {
    throw new Error(`setDepotGroupTicketMachineTier: "${tier}" is not a real ticket machine tier`);
  }
  db.prepare("UPDATE depot_groups SET ticket_machine_tier = ? WHERE id = ?").run(tier, id);
}

export function setDepotGroupTapOnTapOff(db: SaveDb, id: number, hasTapOnTapOff: boolean): void {
  db.prepare("UPDATE depot_groups SET has_tap_on_tap_off = ? WHERE id = ?").run(hasTapOnTapOff ? 1 : 0, id);
}

export function renameDepotGroup(db: SaveDb, id: number, name: string): void {
  db.prepare("UPDATE depot_groups SET name = ? WHERE id = ?").run(name, id);
}

export function setDepotGroupRegion(db: SaveDb, id: number, region: string): void {
  db.prepare("UPDATE depot_groups SET region = ? WHERE id = ?").run(region, id);
}

// The direction-rule reference point (DESIGN.md §6) — manually assigned by
// the player from the bus stations in the imported stop data, not derived
// automatically. Pass null to clear it.
export function setDepotGroupMainBusStation(db: SaveDb, id: number, osmId: number | null): void {
  db.prepare("UPDATE depot_groups SET main_bus_station_osm_id = ? WHERE id = ?").run(osmId, id);
}

export function deleteDepotGroup(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM depot_groups WHERE id = ?").run(id);
}

// A route (DESIGN.md §6) — see the routes table's own comment in SCHEMA for
// what "points" and "orientation" mean and what's deliberately left out.
export interface RoutePoint {
  kind: "stop" | "waypoint";
  osmId?: number;
  lon: number;
  lat: number;
}

export interface RoutePickupDropoffOverride {
  pointIndex: number;
  // "skip" is an express's skipped stop (DESIGN.md §6) — see
  // pickup-dropoff.ts's own comment for why it's route-scoped only, never
  // a stop's global default.
  value: "pickup_only" | "setdown_only" | "skip";
}

// A hail-and-ride stretch (DESIGN.md §6 "Hail and ride") — "two stops
// nominated on that route," both indexes always a "stop" point, never a
// waypoint.
export interface RouteHailAndRideSection {
  fromIndex: number;
  toIndex: number;
}

// Confirmed 2026-10-31, live user request: a route is chosen as exactly one
// of these when it's created (the "+ New route" flow asks before drawing
// starts), mutually exclusive. "ordinary" is the default/previously-implicit
// case. This drives the fare-pricing panel's own gating (a depot group shows
// Night/Sightseeing/Airport Express/Long-distance fields only once it has a
// route of that type — see fare-pricing-panel.ts's fareRequirements()) and,
// for "night" specifically, limits that route's own timetable to a real
// window (UK-EXPANSION.md §10: "Operating window: typically 2345–0400").
// "staff" (schema v57->v58, live request 2026-11-08) is free — excluded
// from the fare-pricing panel entirely rather than gating fields of its
// own — and has no enforced time window, unlike night's.
export type RouteType = "ordinary" | "night" | "sightseeing" | "airport_express" | "long_distance" | "staff";

export interface Route {
  id: number;
  depotGroupId: number;
  number: string;
  points: RoutePoint[];
  orientation: "inbound" | "outbound";
  terminusIndex: number | null;
  startIndex: number | null;
  colour: string;
  name: string | null;
  pickupDropoffOverrides: RoutePickupDropoffOverride[];
  // Which of "points" are timing points (schema v56->v57) — see the
  // routes table's own SCHEMA comment. Set via setRouteTimingPoint, not
  // createRoute/updateRoute, same "dedicated setter for a less-central
  // field" pattern as pickup/dropoff overrides and branding.
  timingPointIndexes: number[];
  parentRouteId: number | null;
  variationLetter: string | null;
  composedFromRouteIds: number[];
  hailAndRideSections: RouteHailAndRideSection[];
  segments: RouteSegment[];
  routeType: RouteType;
  isMinorVariation: boolean;
  // Route branding (T153, confirmed 2026-11-07) — set via
  // setRouteBranding, not createRoute/updateRoute, same "dedicated
  // setter for a less-central field" pattern as depot groups' own
  // ticket machine tier.
  assignedLiveryId: number | null;
  useBrandedColour: boolean;
  // Manual, player-set vehicle eligibility restrictions (Q19, OPEN-ITEMS.md
  // Q18+Q19 plan) — set via setRouteVehicleRestrictions, not createRoute/
  // updateRoute, same "dedicated setter for a less-central field" pattern
  // as assignedLiveryId/useBrandedColour just above.
  vehicleRestrictions: VehicleRestrictions;
}

// Manual, player-set vehicle eligibility restrictions on a route (Q19) —
// each axis independently nullable; unset means "any vehicle qualifies on
// that axis." Composes alongside (not instead of) the automatic OSM-
// road-limit axis (height/weight/length/width), which has no column here
// at all since it's derived from the pipeline road graph + vehicle
// catalogue at read time, not stored per-route. See
// route-vehicle-eligibility.mts for the combined check.
export interface VehicleRestrictions {
  baseType: VehicleCategory | null;
  powerType: PowerType | null;
  axleCount: "twin-axle" | "tri-axle" | null;
  liveryId: number | null;
}

// A route's own build sequence (shared long-distance sections, 2026-10-31)
// — "custom" is a literal run of points the player drew by hand, "section"
// is a live reference to a `long_distance_sections` row. Resolving this
// into the route's actual point list (concatenating each segment's points,
// deduping a shared boundary point between consecutive segments) is pure
// logic that lives in `long-distance-sections.mts`, not here — this file
// only stores/round-trips the sequence itself, the same separation
// `composed_from_route_ids`/`route-combine-variations.mts` already uses.
// An ordinary route (no sections used) has an empty array, same no-op
// convention as `composedFromRouteIds`.
export type RouteSegment = { kind: "custom"; points: RoutePoint[] } | { kind: "section"; sectionId: number };

interface RouteRow {
  id: number;
  depot_group_id: number;
  number: string;
  points: string;
  orientation: string;
  terminus_index: number | null;
  start_index: number | null;
  colour: string;
  name: string | null;
  pickup_dropoff_overrides: string;
  timing_point_indexes: string;
  parent_route_id: number | null;
  variation_letter: string | null;
  composed_from_route_ids: string;
  hail_and_ride_sections: string;
  segments: string;
  route_type: string;
  is_minor_variation: number;
  assigned_livery_id: number | null;
  use_branded_colour: number;
  vehicle_restriction_base_type: string | null;
  vehicle_restriction_power_type: string | null;
  vehicle_restriction_axle_count: string | null;
  vehicle_restriction_livery_id: number | null;
}

function routeFromRow(row: RouteRow): Route {
  return {
    id: row.id,
    depotGroupId: row.depot_group_id,
    number: row.number,
    points: JSON.parse(row.points) as RoutePoint[],
    orientation: row.orientation as "inbound" | "outbound",
    terminusIndex: row.terminus_index === null ? null : Number(row.terminus_index),
    startIndex: row.start_index === null ? null : Number(row.start_index),
    colour: row.colour,
    name: row.name,
    pickupDropoffOverrides: JSON.parse(row.pickup_dropoff_overrides) as RoutePickupDropoffOverride[],
    timingPointIndexes: JSON.parse(row.timing_point_indexes) as number[],
    parentRouteId: row.parent_route_id === null ? null : Number(row.parent_route_id),
    variationLetter: row.variation_letter,
    composedFromRouteIds: JSON.parse(row.composed_from_route_ids) as number[],
    hailAndRideSections: JSON.parse(row.hail_and_ride_sections) as RouteHailAndRideSection[],
    segments: JSON.parse(row.segments) as RouteSegment[],
    routeType: row.route_type as RouteType,
    isMinorVariation: row.is_minor_variation !== 0,
    assignedLiveryId: row.assigned_livery_id === null ? null : Number(row.assigned_livery_id),
    useBrandedColour: row.use_branded_colour !== 0,
    vehicleRestrictions: {
      baseType: row.vehicle_restriction_base_type as VehicleCategory | null,
      powerType: row.vehicle_restriction_power_type as PowerType | null,
      axleCount: row.vehicle_restriction_axle_count as "twin-axle" | "tri-axle" | null,
      liveryId: row.vehicle_restriction_livery_id === null ? null : Number(row.vehicle_restriction_livery_id),
    },
  };
}

export function createRoute(
  db: SaveDb,
  depotGroupId: number,
  number: string,
  points: RoutePoint[],
  orientation: "inbound" | "outbound",
  terminusIndex: number | null,
  startIndex: number | null,
  colour: string,
  name: string | null,
  parentRouteId: number | null,
  variationLetter: string | null,
  composedFromRouteIds: number[] = [],
  hailAndRideSections: RouteHailAndRideSection[] = [],
  segments: RouteSegment[] = [],
  routeType: RouteType = "ordinary",
  isMinorVariation = false,
  // Set directly here, not left to the always-empty default createRoute
  // used to leave it at — a live user request (2026-11-07): "timing
  // points should also be copied between variations," so startVariation
  // (route-draw.ts) seeds this from the parent route's own
  // timingPointIndexes, and a brand-new route's own draft checkboxes
  // (set while drawing, same screen) land here too.
  timingPointIndexes: number[] = [],
): Route {
  if (isMinorVariation && variationLetter !== null) {
    throw new Error("createRoute: a minor variation can't also have a variation letter");
  }
  const result = db
    .prepare(
      "INSERT INTO routes (depot_group_id, number, points, orientation, terminus_index, start_index, colour, name, parent_route_id, variation_letter, composed_from_route_ids, hail_and_ride_sections, segments, route_type, is_minor_variation, timing_point_indexes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      depotGroupId,
      number,
      JSON.stringify(points),
      orientation,
      terminusIndex,
      startIndex,
      colour,
      name,
      parentRouteId,
      variationLetter,
      JSON.stringify(composedFromRouteIds),
      JSON.stringify(hailAndRideSections),
      JSON.stringify(segments),
      routeType,
      isMinorVariation ? 1 : 0,
      JSON.stringify(timingPointIndexes),
    );
  return {
    id: Number(result.lastInsertRowid),
    depotGroupId,
    number,
    points,
    orientation,
    terminusIndex,
    startIndex,
    colour,
    name,
    pickupDropoffOverrides: [],
    timingPointIndexes,
    parentRouteId,
    variationLetter,
    composedFromRouteIds,
    hailAndRideSections,
    segments,
    routeType,
    isMinorVariation,
    assignedLiveryId: null,
    useBrandedColour: false,
    vehicleRestrictions: { baseType: null, powerType: null, axleCount: null, liveryId: null },
  };
}

// Editing a saved route (route-panel.ts's "Edit" action) — updates every
// field in place rather than creating a duplicate, and always clears the
// route's own timetables (DESIGN.md §7) regardless of which fields
// actually changed. A timetable's offsets are indexed against the
// route's exact point list, so any edit could silently invalidate them;
// clearing unconditionally is simpler than diffing the old and new point
// lists to detect whether stops specifically changed, and errs on the
// side of never leaving a stale-but-technically-valid timetable behind.
// pickup_dropoff_overrides stays reset to '[]' unconditionally (route-
// draw.ts has no UI for it, so there's nothing a caller could usefully
// pass through), but timing_point_indexes is now a real parameter
// (2026-11-07, live request: "when making a route there is no way to
// set a timing point") — route-draw.ts's own stop list can flag one
// while drawing/editing, and the draft's current flags are what this
// writes, not an unconditional wipe.
export function updateRoute(
  db: SaveDb,
  id: number,
  depotGroupId: number,
  number: string,
  points: RoutePoint[],
  orientation: "inbound" | "outbound",
  terminusIndex: number | null,
  startIndex: number | null,
  colour: string,
  name: string | null,
  parentRouteId: number | null,
  variationLetter: string | null,
  composedFromRouteIds: number[] = [],
  hailAndRideSections: RouteHailAndRideSection[] = [],
  segments: RouteSegment[] = [],
  routeType: RouteType = "ordinary",
  isMinorVariation = false,
  timingPointIndexes: number[] = [],
): Route {
  if (isMinorVariation && variationLetter !== null) {
    throw new Error("updateRoute: a minor variation can't also have a variation letter");
  }
  // Branding (assigned_livery_id/use_branded_colour) and the manual vehicle
  // restrictions (vehicle_restriction_*, set via setRouteVehicleRestrictions)
  // are both set via their own dedicated setters, not here — fetched so the
  // returned object reflects what's actually still in the DB rather than
  // silently resetting it in the caller's eyes (this UPDATE never touches
  // any of these columns).
  const existingBranding = db
    .prepare(
      "SELECT assigned_livery_id, use_branded_colour, vehicle_restriction_base_type, vehicle_restriction_power_type, vehicle_restriction_axle_count, vehicle_restriction_livery_id FROM routes WHERE id = ?",
    )
    .get(id) as
    | {
        assigned_livery_id: number | null;
        use_branded_colour: number;
        vehicle_restriction_base_type: string | null;
        vehicle_restriction_power_type: string | null;
        vehicle_restriction_axle_count: string | null;
        vehicle_restriction_livery_id: number | null;
      }
    | undefined;
  db.prepare(
    `UPDATE routes SET depot_group_id = ?, number = ?, points = ?, orientation = ?, terminus_index = ?, start_index = ?, colour = ?, name = ?, pickup_dropoff_overrides = '[]', timing_point_indexes = ?, parent_route_id = ?, variation_letter = ?, composed_from_route_ids = ?, hail_and_ride_sections = ?, segments = ?, route_type = ?, is_minor_variation = ?
     WHERE id = ?`,
  ).run(
    depotGroupId,
    number,
    JSON.stringify(points),
    orientation,
    terminusIndex,
    startIndex,
    colour,
    name,
    JSON.stringify(timingPointIndexes),
    parentRouteId,
    variationLetter,
    JSON.stringify(composedFromRouteIds),
    JSON.stringify(hailAndRideSections),
    JSON.stringify(segments),
    routeType,
    isMinorVariation ? 1 : 0,
    id,
  );
  db.prepare("DELETE FROM route_timetables WHERE route_id = ?").run(id);
  return {
    id,
    depotGroupId,
    number,
    points,
    orientation,
    terminusIndex,
    startIndex,
    colour,
    name,
    pickupDropoffOverrides: [],
    timingPointIndexes,
    parentRouteId,
    variationLetter,
    composedFromRouteIds,
    hailAndRideSections,
    segments,
    routeType,
    isMinorVariation,
    assignedLiveryId: existingBranding?.assigned_livery_id ?? null,
    useBrandedColour: (existingBranding?.use_branded_colour ?? 0) !== 0,
    vehicleRestrictions: {
      baseType: (existingBranding?.vehicle_restriction_base_type ?? null) as VehicleCategory | null,
      powerType: (existingBranding?.vehicle_restriction_power_type ?? null) as PowerType | null,
      axleCount: (existingBranding?.vehicle_restriction_axle_count ?? null) as "twin-axle" | "tri-axle" | null,
      liveryId: existingBranding?.vehicle_restriction_livery_id ?? null,
    },
  };
}

// Sets a route's own branding (T153, confirmed 2026-11-07) — a separate
// setter from createRoute/updateRoute above, same "dedicated setter for
// a less-central field" pattern as depot groups' own ticket machine
// tier. `assignedLiveryId` is NOT validated against the normal lock
// system here — that's a pure-logic concern (livery-seed-data.mts's
// liveryEligibleForRoute), checked by the caller (route-panel.ts)
// before calling this, same separation already used everywhere else in
// this file (e.g. createDepotGroup's own ticket-machine-tier ratchet
// lives in db.mts because it needs other DB rows to check; this needs
// nothing from the DB at all, so it stays in the renderer).
export function setRouteBranding(db: SaveDb, routeId: number, assignedLiveryId: number | null, useBrandedColour: boolean): void {
  db.prepare("UPDATE routes SET assigned_livery_id = ?, use_branded_colour = ? WHERE id = ?").run(assignedLiveryId, useBrandedColour ? 1 : 0, routeId);
}

// Sets just a route's own colour (2026-11-08, live bug report: clicking the
// colour swatch went through updateRoute, which unconditionally clears
// route_timetables — see its own comment above — so a pure colour change was
// wiping a route's timetable as an unwanted side effect). Same "dedicated
// setter for a less-central field" pattern as setRouteBranding just above:
// a plain UPDATE touching only `colour`, nothing else. A minor variation's
// own stored colour is irrelevant for display (route-combine-variations.mts's
// effectiveRouteColour always resolves through its parent instead), but this
// still writes it through unconditionally rather than special-casing minor
// variations here — the renderer decides who's allowed to call this at all
// (route-panel.ts only shows the swatch as clickable for a non-minor-variation
// route).
export function setRouteColour(db: SaveDb, routeId: number, colour: string): void {
  db.prepare("UPDATE routes SET colour = ? WHERE id = ?").run(colour, routeId);
}

// Same "dedicated setter, not updateRoute" reasoning as setRouteColour —
// a plain UPDATE touching only `orientation`, nothing else. Used by the
// renderer's startup repair pass (stops-layer.ts) that recomputes every
// route's orientation once real station coordinates are loaded, fixing the
// 2026-11-12 bug where route-orientation.ts's own circular-route branch
// ignored the main bus station entirely for a terminus-loop route.
export function setRouteOrientation(db: SaveDb, routeId: number, orientation: "inbound" | "outbound"): void {
  db.prepare("UPDATE routes SET orientation = ? WHERE id = ?").run(orientation, routeId);
}

// Sets a route's own manual vehicle eligibility restrictions (Q19,
// OPEN-ITEMS.md Q18+Q19 plan) — a dedicated setter, not createRoute/
// updateRoute, same "dedicated setter for a less-central field" pattern as
// setRouteBranding/setRouteColour/setRouteOrientation above (neither
// createRoute's INSERT nor updateRoute's UPDATE touches these 4 columns,
// so a plain route edit can't silently wipe a restriction either). Not
// validated against anything here — same separation as setRouteBranding's
// own doc comment: this is a pure DB write, the caller (route-panel.ts)
// decides what's offered.
export function setRouteVehicleRestrictions(db: SaveDb, routeId: number, restrictions: VehicleRestrictions): void {
  db.prepare(
    "UPDATE routes SET vehicle_restriction_base_type = ?, vehicle_restriction_power_type = ?, vehicle_restriction_axle_count = ?, vehicle_restriction_livery_id = ? WHERE id = ?",
  ).run(restrictions.baseType, restrictions.powerType, restrictions.axleCount, restrictions.liveryId, routeId);
}

// Refreshes a composed route's own cached "points" to match what it should
// currently resolve to (composeVariation, computed in the renderer where
// every route's own data already lives) — called when something this route
// depends on changes (its trunk, or a sibling diversion it reuses), NOT
// when the player edits this route directly (updateRoute above is for
// that). Deliberately narrower than updateRoute: only "points" and the
// timetable cache change, since nothing else about this route (its colour,
// name, pickup/dropoff overrides, composed_from_route_ids itself) was
// actually touched — reusing updateRoute here would wrongly wipe the
// player's own pickup/dropoff overrides on every cascade refresh, which is
// exactly the kind of silent, unrelated data loss CLAUDE.md's safety
// guidance warns against.
export function refreshComposedRoutePoints(db: SaveDb, id: number, points: RoutePoint[]): void {
  db.prepare("UPDATE routes SET points = ? WHERE id = ?").run(JSON.stringify(points), id);
  db.prepare("DELETE FROM route_timetables WHERE route_id = ?").run(id);
}

// --- Shared long-distance sections (long_distance_sections' own SCHEMA
// comment above) ---
export interface LongDistanceSection {
  id: number;
  name: string;
  points: RoutePoint[];
}

interface LongDistanceSectionRow {
  id: number;
  name: string;
  points: string;
}

function longDistanceSectionFromRow(row: LongDistanceSectionRow): LongDistanceSection {
  return { id: row.id, name: row.name, points: JSON.parse(row.points) as RoutePoint[] };
}

export function createLongDistanceSection(db: SaveDb, name: string, points: RoutePoint[]): LongDistanceSection {
  if (points.length < 2) throw new Error("createLongDistanceSection: a section needs at least 2 points");
  const result = db.prepare("INSERT INTO long_distance_sections (name, points) VALUES (?, ?)").run(name, JSON.stringify(points));
  return { id: Number(result.lastInsertRowid), name, points };
}

export function listLongDistanceSections(db: SaveDb): LongDistanceSection[] {
  const rows = db.prepare("SELECT id, name, points FROM long_distance_sections ORDER BY name").all() as unknown as LongDistanceSectionRow[];
  return rows.map(longDistanceSectionFromRow);
}

export function renameLongDistanceSection(db: SaveDb, id: number, name: string): void {
  db.prepare("UPDATE long_distance_sections SET name = ? WHERE id = ?").run(name, id);
}

// Editing a section's own points — every route referencing it (via
// `segments`) is meant to reflect this live (the user's own confirmed
// design: "editing a section updates every route using it"), but that
// resolution happens in the renderer the same way `resolveRoutePoints`
// already works for composed variations — this function only updates the
// section's own stored points; the renderer is responsible for finding
// and refreshing every dependent route's own cached `points` afterward
// (`findRoutesUsingSectionId` + `resolveSegments` in
// `long-distance-sections.mts`, then `refreshComposedRoutePoints` per
// dependent — mirroring `findDependentRouteIds`'s own existing job for
// composed variations).
export function setLongDistanceSectionPoints(db: SaveDb, id: number, points: RoutePoint[]): void {
  if (points.length < 2) throw new Error("setLongDistanceSectionPoints: a section needs at least 2 points");
  db.prepare("UPDATE long_distance_sections SET points = ? WHERE id = ?").run(JSON.stringify(points), id);
}

export function deleteLongDistanceSection(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM long_distance_sections WHERE id = ?").run(id);
}

// A per-route override of a stop's pick-up/set-down restriction (see the
// routes table's own comment in SCHEMA) — independent of updateRoute, and
// deliberately doesn't touch route_timetables, since it's unrelated to the
// route's points shape. Pass value = null to clear the override (falling
// back to the stop's own global default, an osm_overrides entry).
export function setRoutePickupDropoffOverride(
  db: SaveDb,
  routeId: number,
  pointIndex: number,
  value: "pickup_only" | "setdown_only" | "skip" | null,
): void {
  const row = db.prepare("SELECT pickup_dropoff_overrides FROM routes WHERE id = ?").get(routeId) as
    | { pickup_dropoff_overrides: string }
    | undefined;
  if (!row) return;
  const overrides = (JSON.parse(row.pickup_dropoff_overrides) as RoutePickupDropoffOverride[]).filter(
    (o) => o.pointIndex !== pointIndex,
  );
  if (value !== null) overrides.push({ pointIndex, value });
  db.prepare("UPDATE routes SET pickup_dropoff_overrides = ? WHERE id = ?").run(
    JSON.stringify(overrides),
    routeId,
  );
}

// Flags (or unflags) one of a route's own points as a timing point (see
// the routes table's own SCHEMA comment) — independent of updateRoute,
// same shape as setRoutePickupDropoffOverride right above. Unlike that
// one, this DOES reach into route_timetables: a point no longer flagged
// can't keep a published time for it lying around (it would be
// unreachable from route-timetable-panel.ts going forward, and stale if
// the point index were ever reused), so it's stripped from every
// existing component's own "timing_points" JSON. Flagging a NEW timing
// point needs no such cleanup — every existing component simply has no
// entry for it yet, same as adding one has always worked.
export function setRouteTimingPoint(db: SaveDb, routeId: number, pointIndex: number, isTimingPoint: boolean): void {
  const row = db.prepare("SELECT timing_point_indexes FROM routes WHERE id = ?").get(routeId) as
    | { timing_point_indexes: string }
    | undefined;
  if (!row) return;
  const indexes = new Set(JSON.parse(row.timing_point_indexes) as number[]);
  if (isTimingPoint) {
    indexes.add(pointIndex);
  } else {
    indexes.delete(pointIndex);
    const timetableRows = db
      .prepare("SELECT id, timing_points FROM route_timetables WHERE route_id = ?")
      .all(routeId) as unknown as { id: number; timing_points: string }[];
    const updateTimingPoints = db.prepare("UPDATE route_timetables SET timing_points = ? WHERE id = ?");
    for (const tRow of timetableRows) {
      const points = (JSON.parse(tRow.timing_points) as { pointIndex: number }[]).filter(
        (tp) => tp.pointIndex !== pointIndex,
      );
      updateTimingPoints.run(JSON.stringify(points), tRow.id);
    }
  }
  db.prepare("UPDATE routes SET timing_point_indexes = ? WHERE id = ?").run(
    JSON.stringify([...indexes].sort((a, b) => a - b)),
    routeId,
  );
}

export function listRoutes(db: SaveDb): Route[] {
  const rows = db
    .prepare(
      "SELECT id, depot_group_id, number, points, orientation, terminus_index, start_index, colour, name, pickup_dropoff_overrides, timing_point_indexes, parent_route_id, variation_letter, composed_from_route_ids, hail_and_ride_sections, segments, route_type, is_minor_variation, assigned_livery_id, use_branded_colour, vehicle_restriction_base_type, vehicle_restriction_power_type, vehicle_restriction_axle_count, vehicle_restriction_livery_id FROM routes ORDER BY number",
    )
    .all() as unknown as RouteRow[];
  return rows.map(routeFromRow);
}

export function deleteRoute(db: SaveDb, id: number): void {
  // No cascade is defined on any reference to a route, so all three need
  // explicit handling before the row itself can go:
  // - a route's own timetables would otherwise survive orphaned — deleted
  //   outright, same as updateRoute already does on any point-list edit.
  // - any variation whose parent_route_id points at this route gets that
  //   link cleared to null rather than being deleted or blocked — DESIGN.md
  //   §6 already treats a variation with no real parent as normal ("route
  //   7A and 7B can exist with no 7"), so losing a parent is a valid state,
  //   not an error. Node's sqlite enforces the FK by default, so without
  //   this the DELETE below fails outright whenever a child exists.
  // - any duty_piece built against this route (a driver's scheduled working
  //   of it) is deleted outright, the same treatment as route_timetables —
  //   confirmed live via a real-save reproduction (2026-10-31): deleting a
  //   route referenced by duty_pieces threw "FOREIGN KEY constraint
  //   failed" with no handling anywhere up the call stack, which the
  //   renderer's delete button then silently swallowed as an unhandled
  //   promise rejection — the whole route list stayed unchanged with no
  //   visible error, reported by the user as "the button lights up but
  //   does nothing." A real route's own duty assignment doesn't survive
  //   the route disappearing from under it; the rest of that duty's other
  //   pieces are untouched.
  db.prepare("UPDATE routes SET parent_route_id = NULL WHERE parent_route_id = ?").run(id);
  db.prepare("DELETE FROM route_timetables WHERE route_id = ?").run(id);
  db.prepare("DELETE FROM duty_pieces WHERE route_id = ?").run(id);
  db.prepare("DELETE FROM routes WHERE id = ?").run(id);
}

// A route's timetable (DESIGN.md §7) — see the route_timetables table's own
// comment in SCHEMA for what's built so far and what's deliberately left
// out (variations, padding, connections, extensions, the event calendar).
//
// Stored underneath as a weekday bitmask + term-time facet (schema
// v19->v20, see SCHEMA's own comment) so real sub-patterns Skye's actual
// timetables need (UK-EXPANSION.md §13 — 608/607's Tuesday/Thursday
// footnote, 607's own separate Friday-differs pattern) can be represented
// without another schema change every time real data shows a new one. The
// weekday_mask side is now exposed directly as a freeform number (the
// original fixed-3-preset `DayType` was lifted 2026-11-07 once the
// player-facing day-type picker needed it) — term_facet stays hardcoded to
// 'any' below, now dormant rather than deferred: its only real use case
// (Skye's own school-day timetable split) no longer exists once school
// contracts and the school-day/holiday split were dropped, 2026-11-08.
export type TermFacet = "any" | "term_time" | "holiday";

// Bit 0 = Monday ... bit 6 = Sunday.
export const WEEKDAY_BITS = {
  monday: 1,
  tuesday: 2,
  wednesday: 4,
  thursday: 8,
  friday: 16,
  saturday: 32,
  sunday: 64,
} as const;

export const MONDAY_FRIDAY_MASK =
  WEEKDAY_BITS.monday | WEEKDAY_BITS.tuesday | WEEKDAY_BITS.wednesday | WEEKDAY_BITS.thursday | WEEKDAY_BITS.friday;
export const SATURDAY_MASK: number = WEEKDAY_BITS.saturday;
export const SUNDAY_MASK: number = WEEKDAY_BITS.sunday;

// A timing point is a published scheduling location, not every physical
// stop (route-timetable.mts's own comment has the full reasoning). WHICH
// points are timing points now lives on the route itself
// (routes.timing_point_indexes, above); this is just the per-timetable-
// component PADDING at each of those points (schema v65->v66, 2026-11-15)
// — whole minutes ADDED ON TOP of the real fastest achievable time,
// "standardPaddingMinutes" outside the two fixed peak windows,
// "peakPaddingMinutes" inside either (null for an island route's own
// single timing point — no separate peak figure at all). "dwellMinutes"
// is an optional layover (departure - arrival), 0 for the common case.
// Whole minutes, not seconds (route-timetable.mts's own TimingPoint,
// which this mirrors, confirmed this 2026-11-07: "timetables run on
// minutes not seconds").
export interface TimingPoint {
  pointIndex: number;
  standardPaddingMinutes: number;
  peakPaddingMinutes: number | null;
  dwellMinutes: number;
}

// One or more of these per timetable (DESIGN.md §7 "time-of-day bands") —
// see route-timetable.mts's own TimeBand for the full reasoning; this is
// the same shape, duplicated here the same way TimingPoint already is,
// since electron/db.mts doesn't import from the renderer.
export interface TimeBand {
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
}

export type RouteTimetableDirection = "both" | "outbound" | "inbound";

export interface RouteTimetable {
  id: number;
  routeId: number;
  weekdayMask: number;
  direction: RouteTimetableDirection;
  timeBands: TimeBand[];
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
  // Schema v65->v66 — see route_timetables' own SCHEMA comment.
  arrivalOffsetsSecondsPeak: number[];
  departureOffsetsSecondsPeak: number[];
  excludedDepartureMinutes: number[];
  customDepartureMinutes: number[];
  // Schema v64->v65 — see route_timetables' own SCHEMA comment. Both null
  // for the ordinary (non-mirroring) case, which is every row before this
  // schema version and most rows after it.
  mirrorSourceTimetableId: number | null;
  mirrorOffsetMinutes: number | null;
}

interface RouteTimetableRow {
  id: number;
  route_id: number;
  weekday_mask: number;
  term_facet: string;
  direction: string;
  time_bands: string;
  timing_points: string;
  arrival_offsets_seconds: string;
  departure_offsets_seconds: string;
  arrival_offsets_seconds_peak: string;
  departure_offsets_seconds_peak: string;
  excluded_departure_minutes: string;
  custom_departure_minutes: string;
  mirror_source_timetable_id: number | null;
  mirror_offset_minutes: number | null;
}

const ROUTE_TIMETABLE_COLUMNS =
  "id, route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, arrival_offsets_seconds_peak, departure_offsets_seconds_peak, excluded_departure_minutes, custom_departure_minutes, mirror_source_timetable_id, mirror_offset_minutes";

function routeTimetableFromRow(row: RouteTimetableRow): RouteTimetable {
  return {
    id: row.id,
    routeId: row.route_id,
    weekdayMask: row.weekday_mask,
    direction: row.direction as RouteTimetableDirection,
    timeBands: JSON.parse(row.time_bands) as TimeBand[],
    timingPoints: JSON.parse(row.timing_points) as TimingPoint[],
    arrivalOffsetsSeconds: JSON.parse(row.arrival_offsets_seconds) as number[],
    departureOffsetsSeconds: JSON.parse(row.departure_offsets_seconds) as number[],
    arrivalOffsetsSecondsPeak: JSON.parse(row.arrival_offsets_seconds_peak) as number[],
    departureOffsetsSecondsPeak: JSON.parse(row.departure_offsets_seconds_peak) as number[],
    excludedDepartureMinutes: JSON.parse(row.excluded_departure_minutes) as number[],
    customDepartureMinutes: JSON.parse(row.custom_departure_minutes) as number[],
    mirrorSourceTimetableId: row.mirror_source_timetable_id,
    mirrorOffsetMinutes: row.mirror_offset_minutes,
  };
}

// One row per (route, day type, direction) — creating a second timetable
// for a (route, day type, direction) that already has one replaces it
// outright, since there's still only ever one component per that triple.
export function upsertRouteTimetable(
  db: SaveDb,
  routeId: number,
  weekdayMask: number,
  direction: RouteTimetableDirection,
  timeBands: TimeBand[],
  timingPoints: TimingPoint[],
  arrivalOffsetsSeconds: number[],
  departureOffsetsSeconds: number[],
  arrivalOffsetsSecondsPeak: number[],
  departureOffsetsSecondsPeak: number[],
  excludedDepartureMinutes: number[],
  customDepartureMinutes: number[],
  mirrorSourceTimetableId: number | null = null,
  mirrorOffsetMinutes: number | null = null,
): RouteTimetable {
  const termFacet: TermFacet = "any"; // exposing term-time facet is a later increment
  db.prepare(
    `INSERT INTO route_timetables
       (route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, arrival_offsets_seconds_peak, departure_offsets_seconds_peak, excluded_departure_minutes, custom_departure_minutes, mirror_source_timetable_id, mirror_offset_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (route_id, weekday_mask, term_facet, direction) DO UPDATE SET
       time_bands = excluded.time_bands,
       timing_points = excluded.timing_points,
       arrival_offsets_seconds = excluded.arrival_offsets_seconds,
       departure_offsets_seconds = excluded.departure_offsets_seconds,
       arrival_offsets_seconds_peak = excluded.arrival_offsets_seconds_peak,
       departure_offsets_seconds_peak = excluded.departure_offsets_seconds_peak,
       excluded_departure_minutes = excluded.excluded_departure_minutes,
       custom_departure_minutes = excluded.custom_departure_minutes,
       mirror_source_timetable_id = excluded.mirror_source_timetable_id,
       mirror_offset_minutes = excluded.mirror_offset_minutes`,
  ).run(
    routeId,
    weekdayMask,
    termFacet,
    direction,
    JSON.stringify(timeBands),
    JSON.stringify(timingPoints),
    JSON.stringify(arrivalOffsetsSeconds),
    JSON.stringify(departureOffsetsSeconds),
    JSON.stringify(arrivalOffsetsSecondsPeak),
    JSON.stringify(departureOffsetsSecondsPeak),
    JSON.stringify(excludedDepartureMinutes),
    JSON.stringify(customDepartureMinutes),
    mirrorSourceTimetableId,
    mirrorOffsetMinutes,
  );
  const row = db
    .prepare(
      `SELECT ${ROUTE_TIMETABLE_COLUMNS}
       FROM route_timetables WHERE route_id = ? AND weekday_mask = ? AND term_facet = ? AND direction = ?`,
    )
    .get(routeId, weekdayMask, termFacet, direction) as unknown as RouteTimetableRow;
  return routeTimetableFromRow(row);
}

export function listRouteTimetablesForRoute(db: SaveDb, routeId: number): RouteTimetable[] {
  const rows = db
    .prepare(
      `SELECT ${ROUTE_TIMETABLE_COLUMNS}
       FROM route_timetables WHERE route_id = ? ORDER BY weekday_mask, term_facet`,
    )
    .all(routeId) as unknown as RouteTimetableRow[];
  return rows.map(routeTimetableFromRow);
}

// Every route_timetable across every route — what the stop/station
// timetable viewer (T29) will scan to find every service calling at a
// given stop, rather than looking routes up one at a time. Also the list
// a mirroring component's own reference gets resolved against
// (route-timetable-grid.mts's makeTimetableReferenceResolver) — a mirror
// can reference ANY route's timetable, not just a sibling/family one.
export function listAllRouteTimetables(db: SaveDb): RouteTimetable[] {
  const rows = db.prepare(`SELECT ${ROUTE_TIMETABLE_COLUMNS} FROM route_timetables`).all() as unknown as RouteTimetableRow[];
  return rows.map(routeTimetableFromRow);
}

export function deleteRouteTimetable(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM route_timetables WHERE id = ?").run(id);
}

// A stop the player places directly (DESIGN.md §4) — see the player_stops
// table's own comment in SCHEMA for why "osmId" is the negative of the
// table's own id rather than a separate identity scheme.
export interface PlayerStop {
  osmId: number;
  lon: number;
  lat: number;
  busLegal: boolean;
  // Schema v57->v58 — non-null only for a depot's own staff-route stop
  // (createDepotStop). See the player_stops table's own SCHEMA comment.
  depotId: number | null;
}

interface PlayerStopRow {
  id: number;
  lon: number;
  lat: number;
  bus_legal: number;
  depot_id: number | null;
}

function playerStopFromRow(row: PlayerStopRow): PlayerStop {
  return { osmId: -row.id, lon: row.lon, lat: row.lat, busLegal: row.bus_legal !== 0, depotId: row.depot_id };
}

export function createPlayerStop(db: SaveDb, lon: number, lat: number, busLegal: boolean): PlayerStop {
  const result = db
    .prepare("INSERT INTO player_stops (lon, lat, bus_legal, created_at) VALUES (?, ?, ?, ?)")
    .run(lon, lat, busLegal ? 1 : 0, new Date().toISOString());
  return { osmId: -Number(result.lastInsertRowid), lon, lat, busLegal, depotId: null };
}

// A depot's own staff-route stop (schema v57->v58) — see player_stops'
// own SCHEMA comment. At most one per depot; throws if one already
// exists (the caller, depot-placement.ts, only ever offers this button
// when stopByDepot has nothing for this depot yet).
export function createDepotStop(db: SaveDb, depotId: number): PlayerStop {
  const depot = db.prepare("SELECT lon, lat FROM depots WHERE id = ?").get(depotId) as { lon: number; lat: number } | undefined;
  if (!depot) throw new Error(`createDepotStop: no such depot ${depotId}`);
  const result = db
    .prepare("INSERT INTO player_stops (lon, lat, bus_legal, created_at, depot_id) VALUES (?, ?, 1, ?, ?)")
    .run(depot.lon, depot.lat, new Date().toISOString(), depotId);
  return { osmId: -Number(result.lastInsertRowid), lon: depot.lon, lat: depot.lat, busLegal: true, depotId };
}

export function listPlayerStops(db: SaveDb): PlayerStop[] {
  const rows = db.prepare("SELECT id, lon, lat, bus_legal, depot_id FROM player_stops").all() as unknown as PlayerStopRow[];
  return rows.map(playerStopFromRow);
}

export function deletePlayerStop(db: SaveDb, osmId: number): void {
  db.prepare("DELETE FROM player_stops WHERE id = ?").run(-osmId);
}

// A depot (OPERATIONS.md §2) — see the depots/depot_entrances tables' own
// comments in SCHEMA for what's deliberately not built yet (tiers, rent/
// buy economics, build time, capacity, maintenance facilities).
export type DepotEntranceMode = "entry" | "exit" | "both";

export interface DepotEntrance {
  id: number;
  depotId: number;
  lon: number;
  lat: number;
  mode: DepotEntranceMode;
}

export interface Depot {
  id: number;
  depotGroupId: number;
  name: string;
  lon: number;
  lat: number;
}

interface DepotRow {
  id: number;
  depot_group_id: number;
  name: string;
  lon: number;
  lat: number;
}

function depotFromRow(row: DepotRow): Depot {
  return { id: row.id, depotGroupId: row.depot_group_id, name: row.name, lon: row.lon, lat: row.lat };
}

interface DepotEntranceRow {
  id: number;
  depot_id: number;
  lon: number;
  lat: number;
  mode: DepotEntranceMode;
}

function depotEntranceFromRow(row: DepotEntranceRow): DepotEntrance {
  return { id: row.id, depotId: row.depot_id, lon: row.lon, lat: row.lat, mode: row.mode };
}

export function createDepot(
  db: SaveDb,
  depotGroupId: number,
  name: string,
  lon: number,
  lat: number,
  entrances: readonly { lon: number; lat: number; mode: DepotEntranceMode }[],
): { depot: Depot; entrances: DepotEntrance[] } {
  const result = db
    .prepare("INSERT INTO depots (depot_group_id, name, lon, lat) VALUES (?, ?, ?, ?)")
    .run(depotGroupId, name, lon, lat);
  const depotId = Number(result.lastInsertRowid);
  const createdEntrances = entrances.map((e) => {
    const entranceResult = db
      .prepare("INSERT INTO depot_entrances (depot_id, lon, lat, mode) VALUES (?, ?, ?, ?)")
      .run(depotId, e.lon, e.lat, e.mode);
    return { id: Number(entranceResult.lastInsertRowid), depotId, lon: e.lon, lat: e.lat, mode: e.mode };
  });
  return { depot: { id: depotId, depotGroupId, name, lon, lat }, entrances: createdEntrances };
}

export function listDepots(db: SaveDb): Depot[] {
  const rows = db.prepare("SELECT id, depot_group_id, name, lon, lat FROM depots").all() as unknown as DepotRow[];
  return rows.map(depotFromRow);
}

export function listDepotEntrances(db: SaveDb, depotId: number): DepotEntrance[] {
  const rows = db
    .prepare("SELECT id, depot_id, lon, lat, mode FROM depot_entrances WHERE depot_id = ?")
    .all(depotId) as unknown as DepotEntranceRow[];
  return rows.map(depotEntranceFromRow);
}

export function listAllDepotEntrances(db: SaveDb): DepotEntrance[] {
  const rows = db.prepare("SELECT id, depot_id, lon, lat, mode FROM depot_entrances").all() as unknown as DepotEntranceRow[];
  return rows.map(depotEntranceFromRow);
}

export function renameDepot(db: SaveDb, id: number, name: string): void {
  db.prepare("UPDATE depots SET name = ? WHERE id = ?").run(name, id);
}

export function addDepotEntrance(db: SaveDb, depotId: number, lon: number, lat: number, mode: DepotEntranceMode): DepotEntrance {
  const result = db.prepare("INSERT INTO depot_entrances (depot_id, lon, lat, mode) VALUES (?, ?, ?, ?)").run(depotId, lon, lat, mode);
  return { id: Number(result.lastInsertRowid), depotId, lon, lat, mode };
}

export function setDepotEntranceMode(db: SaveDb, id: number, mode: DepotEntranceMode): void {
  db.prepare("UPDATE depot_entrances SET mode = ? WHERE id = ?").run(mode, id);
}

export function deleteDepotEntrance(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM depot_entrances WHERE id = ?").run(id);
}

export function deleteDepot(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM depot_entrances WHERE depot_id = ?").run(id);
  // The depot's own staff-route stop (schema v57->v58), if it ever
  // placed one — same "no FK cascade enabled, so delete the dependent
  // first" convention as depot_entrances right above.
  db.prepare("DELETE FROM player_stops WHERE depot_id = ?").run(id);
  db.prepare("DELETE FROM depots WHERE id = ?").run(id);
}

// A vehicle dealer (T62, OPEN-ITEMS.md) — see the dealers/dealer_entrances
// tables' own comments in SCHEMA. Exact mirror of the Depot/DepotEntrance
// functions above except there is no owning depot_group_id (a dealer
// isn't owned by any one operator) and "manufacturer" replaces that field.
// 'western_commercial' -> 'evm' (schema v58->v59, T179, OPEN-ITEMS.md,
// confirmed 2026-11-13) — Western Commercial only ever stood in for
// EVM-prefixed vehicles (Sprinter/EVM Cityline) before England was in
// scope; removed entirely, not just renamed, now that EVM has its own
// real dealer entry.
export type DealerManufacturer = "volvo" | "adl" | "evm" | "wrightbus" | "yutong";
export type DealerEntranceMode = DepotEntranceMode;

export interface DealerEntrance {
  id: number;
  dealerId: number;
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

export interface Dealer {
  id: number;
  name: string;
  manufacturer: DealerManufacturer;
  lon: number;
  lat: number;
  isEntrancesComplete: boolean;
  isRepowerSite: boolean;
}

interface DealerRow {
  id: number;
  name: string;
  manufacturer: DealerManufacturer;
  lon: number;
  lat: number;
  is_entrances_complete: number;
  is_repower_site: number;
}

function dealerFromRow(row: DealerRow): Dealer {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    lon: row.lon,
    lat: row.lat,
    isEntrancesComplete: row.is_entrances_complete !== 0,
    isRepowerSite: row.is_repower_site !== 0,
  };
}

interface DealerEntranceRow {
  id: number;
  dealer_id: number;
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

function dealerEntranceFromRow(row: DealerEntranceRow): DealerEntrance {
  return { id: row.id, dealerId: row.dealer_id, lon: row.lon, lat: row.lat, mode: row.mode };
}

export function createDealer(
  db: SaveDb,
  name: string,
  manufacturer: DealerManufacturer,
  lon: number,
  lat: number,
  entrances: readonly { lon: number; lat: number; mode: DealerEntranceMode }[],
): { dealer: Dealer; entrances: DealerEntrance[] } {
  const result = db
    .prepare("INSERT INTO dealers (name, manufacturer, lon, lat) VALUES (?, ?, ?, ?)")
    .run(name, manufacturer, lon, lat);
  const dealerId = Number(result.lastInsertRowid);
  const createdEntrances = entrances.map((e) => {
    const entranceResult = db
      .prepare("INSERT INTO dealer_entrances (dealer_id, lon, lat, mode) VALUES (?, ?, ?, ?)")
      .run(dealerId, e.lon, e.lat, e.mode);
    return { id: Number(entranceResult.lastInsertRowid), dealerId, lon: e.lon, lat: e.lat, mode: e.mode };
  });
  return { dealer: { id: dealerId, name, manufacturer, lon, lat, isEntrancesComplete: false, isRepowerSite: false }, entrances: createdEntrances };
}

export function listDealers(db: SaveDb): Dealer[] {
  const rows = db.prepare("SELECT id, name, manufacturer, lon, lat, is_entrances_complete, is_repower_site FROM dealers").all() as unknown as DealerRow[];
  return rows.map(dealerFromRow);
}

// At most one dealer per manufacturer may be the re-power site (T179,
// confirmed 2026-11-13: "only one place for each manufacturer can
// re-power buses") — enforced here, in the application layer, not a
// CHECK (the same reasoning routes.variation_letter's own mutual-
// exclusivity rule already uses this file for: a CHECK can't express
// "unique among rows sharing another column's value" cleanly, and every
// real caller is already TypeScript-typed, which is the enforcement
// that matters day to day). Clears any OTHER dealer of the same
// manufacturer first, so there's never ambiguity about which one is
// "the" site.
export function setDealerRepowerSite(db: SaveDb, id: number, isRepowerSite: boolean): void {
  const dealer = db.prepare("SELECT manufacturer FROM dealers WHERE id = ?").get(id) as { manufacturer: DealerManufacturer } | undefined;
  if (!dealer) throw new Error(`setDealerRepowerSite: no dealer with id ${id}`);
  if (isRepowerSite) {
    db.prepare("UPDATE dealers SET is_repower_site = 0 WHERE manufacturer = ? AND id != ?").run(dealer.manufacturer, id);
  }
  db.prepare("UPDATE dealers SET is_repower_site = ? WHERE id = ?").run(isRepowerSite ? 1 : 0, id);
}

// Explicit, player-confirmed "I've added every entrance this dealer
// needs" (dealers' own CREATE TABLE comment) — replaces the old implicit
// zero-entrances signal dealer-reference-pins.ts used.
export function setDealerEntrancesComplete(db: SaveDb, id: number, isComplete: boolean): void {
  db.prepare("UPDATE dealers SET is_entrances_complete = ? WHERE id = ?").run(isComplete ? 1 : 0, id);
}

export function listDealerEntrances(db: SaveDb, dealerId: number): DealerEntrance[] {
  const rows = db
    .prepare("SELECT id, dealer_id, lon, lat, mode FROM dealer_entrances WHERE dealer_id = ?")
    .all(dealerId) as unknown as DealerEntranceRow[];
  return rows.map(dealerEntranceFromRow);
}

export function listAllDealerEntrances(db: SaveDb): DealerEntrance[] {
  const rows = db.prepare("SELECT id, dealer_id, lon, lat, mode FROM dealer_entrances").all() as unknown as DealerEntranceRow[];
  return rows.map(dealerEntranceFromRow);
}

export function renameDealer(db: SaveDb, id: number, name: string): void {
  db.prepare("UPDATE dealers SET name = ? WHERE id = ?").run(name, id);
}

export function setDealerManufacturer(db: SaveDb, id: number, manufacturer: DealerManufacturer): void {
  db.prepare("UPDATE dealers SET manufacturer = ? WHERE id = ?").run(manufacturer, id);
}

export function addDealerEntrance(db: SaveDb, dealerId: number, lon: number, lat: number, mode: DealerEntranceMode): DealerEntrance {
  const result = db.prepare("INSERT INTO dealer_entrances (dealer_id, lon, lat, mode) VALUES (?, ?, ?, ?)").run(dealerId, lon, lat, mode);
  return { id: Number(result.lastInsertRowid), dealerId, lon, lat, mode };
}

export function setDealerEntranceMode(db: SaveDb, id: number, mode: DealerEntranceMode): void {
  db.prepare("UPDATE dealer_entrances SET mode = ? WHERE id = ?").run(mode, id);
}

export function deleteDealerEntrance(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM dealer_entrances WHERE id = ?").run(id);
}

export function deleteDealer(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM dealer_entrances WHERE dealer_id = ?").run(id);
  db.prepare("DELETE FROM dealers WHERE id = ?").run(id);
}

// A player-created stop group (DESIGN.md §4) — see the stop_groups table's
// own comment in SCHEMA for why this mints only an id, with everything
// else (name, membership) living in the override layer.
export function createStopGroup(db: SaveDb): { id: number } {
  const result = db.prepare("INSERT INTO stop_groups (created_at) VALUES (?)").run(new Date().toISOString());
  return { id: Number(result.lastInsertRowid) };
}

export function listStopGroupIds(db: SaveDb): number[] {
  const rows = db.prepare("SELECT id FROM stop_groups").all() as unknown as { id: number }[];
  return rows.map((r) => Number(r.id));
}

// A player-created bus station — see the player_bus_stations table's own
// comment in SCHEMA for why this mints only an id, with everything else
// (name, membership, position) living in the override layer / renderer.
export function createPlayerBusStation(db: SaveDb): { id: number } {
  const result = db.prepare("INSERT INTO player_bus_stations (created_at) VALUES (?)").run(new Date().toISOString());
  return { id: Number(result.lastInsertRowid) };
}

export function listPlayerBusStationIds(db: SaveDb): number[] {
  const rows = db.prepare("SELECT id FROM player_bus_stations").all() as unknown as { id: number }[];
  return rows.map((r) => Number(r.id));
}

// The override layer (DESIGN.md §1) — one mechanism reused for every category
// of imported OSM data: stop positions, road geometry, inferred widths, bus
// station stand counts, and so on. Imported data itself (the Rust pipeline's
// road_graph.bin / stops.bin / etc.) is never mutated; an override here just
// shadows one field of one entity until reset ("Reset to OSM").
export function setOverride(
  db: SaveDb,
  entityType: string,
  osmId: number,
  field: string,
  value: unknown,
): void {
  db.prepare(
    `INSERT INTO osm_overrides (entity_type, osm_id, field, value, overridden_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (entity_type, osm_id, field)
     DO UPDATE SET value = excluded.value, overridden_at = excluded.overridden_at`,
  ).run(entityType, osmId, field, JSON.stringify(value), new Date().toISOString());
}

export function getOverride<T = unknown>(
  db: SaveDb,
  entityType: string,
  osmId: number,
  field: string,
): T | undefined {
  const row = db
    .prepare("SELECT value FROM osm_overrides WHERE entity_type = ? AND osm_id = ? AND field = ?")
    .get(entityType, osmId, field) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function hasOverride(db: SaveDb, entityType: string, osmId: number, field: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM osm_overrides WHERE entity_type = ? AND osm_id = ? AND field = ?")
      .get(entityType, osmId, field) !== undefined
  );
}

// Bulk read for a whole (entity_type, field) pair — e.g. every manual
// stop -> bus station assignment at once, rather than one query per stop.
export function listOverrides<T = unknown>(
  db: SaveDb,
  entityType: string,
  field: string,
): Array<{ osmId: number; value: T }> {
  const rows = db
    .prepare("SELECT osm_id, value FROM osm_overrides WHERE entity_type = ? AND field = ?")
    .all(entityType, field) as unknown as { osm_id: number; value: string }[];
  return rows.map((r) => ({ osmId: Number(r.osm_id), value: JSON.parse(r.value) as T }));
}

export function resetOverride(db: SaveDb, entityType: string, osmId: number, field: string): void {
  db.prepare("DELETE FROM osm_overrides WHERE entity_type = ? AND osm_id = ? AND field = ?").run(
    entityType,
    osmId,
    field,
  );
}

export type SupportIconKey = "spanner" | "person" | "recovery" | "parcel";
export type IconColour = "black" | "white";

export interface Livery {
  id: number;
  name: string;
  primaryColour: string;
  secondaryColour: string;
}

export interface LiverySupportIconOverride {
  liveryId: number;
  icon: SupportIconKey;
  colour: IconColour;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

export function createLivery(db: SaveDb, name: string, primaryColour: string, secondaryColour: string): Livery {
  if (!HEX_COLOUR.test(primaryColour) || !HEX_COLOUR.test(secondaryColour)) {
    throw new Error("livery colours must be #rrggbb");
  }
  const result = db
    .prepare("INSERT INTO liveries (name, primary_colour, secondary_colour) VALUES (?, ?, ?)")
    .run(name, primaryColour, secondaryColour);
  return { id: Number(result.lastInsertRowid), name, primaryColour, secondaryColour };
}

export function listLiveries(db: SaveDb): Livery[] {
  const rows = db
    .prepare("SELECT id, name, primary_colour, secondary_colour FROM liveries ORDER BY id")
    .all() as { id: number; name: string; primary_colour: string; secondary_colour: string }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    primaryColour: r.primary_colour,
    secondaryColour: r.secondary_colour,
  }));
}

// Passing null clears the override, so the icon goes back to the automatic pick.
export function setLiverySupportIconOverride(
  db: SaveDb,
  liveryId: number,
  icon: SupportIconKey,
  colour: IconColour | null,
): void {
  if (colour === null) {
    db.prepare("DELETE FROM livery_support_icon_overrides WHERE livery_id = ? AND icon = ?").run(liveryId, icon);
    return;
  }
  db.prepare(
    `INSERT INTO livery_support_icon_overrides (livery_id, icon, colour) VALUES (?, ?, ?)
     ON CONFLICT(livery_id, icon) DO UPDATE SET colour = excluded.colour`,
  ).run(liveryId, icon, colour);
}

export function listLiverySupportIconOverrides(db: SaveDb, liveryId: number): LiverySupportIconOverride[] {
  const rows = db
    .prepare("SELECT livery_id, icon, colour FROM livery_support_icon_overrides WHERE livery_id = ?")
    .all(liveryId) as { livery_id: number; icon: SupportIconKey; colour: IconColour }[];
  return rows.map((r) => ({ liveryId: r.livery_id, icon: r.icon, colour: r.colour }));
}

export interface RepaintShop {
  id: number;
  name: string;
  lon: number;
  lat: number;
  concurrentCapacity: number;
  turnaroundDays: number;
}

export function createRepaintShop(
  db: SaveDb,
  name: string,
  lon: number,
  lat: number,
  concurrentCapacity: number,
  turnaroundDays: number,
): RepaintShop {
  const result = db
    .prepare("INSERT INTO repaint_shops (name, lon, lat, concurrent_capacity, turnaround_days) VALUES (?, ?, ?, ?, ?)")
    .run(name, lon, lat, concurrentCapacity, turnaroundDays);
  return { id: Number(result.lastInsertRowid), name, lon, lat, concurrentCapacity, turnaroundDays };
}

export function listRepaintShops(db: SaveDb): RepaintShop[] {
  const rows = db.prepare("SELECT id, name, lon, lat, concurrent_capacity, turnaround_days FROM repaint_shops ORDER BY id").all() as {
    id: number;
    name: string;
    lon: number;
    lat: number;
    concurrent_capacity: number;
    turnaround_days: number;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, lon: r.lon, lat: r.lat, concurrentCapacity: r.concurrent_capacity, turnaroundDays: r.turnaround_days }));
}

export function setRepaintShopConcurrentCapacity(db: SaveDb, id: number, concurrentCapacity: number): void {
  db.prepare("UPDATE repaint_shops SET concurrent_capacity = ? WHERE id = ?").run(concurrentCapacity, id);
}

export function setRepaintShopTurnaroundDays(db: SaveDb, id: number, turnaroundDays: number): void {
  db.prepare("UPDATE repaint_shops SET turnaround_days = ? WHERE id = ?").run(turnaroundDays, id);
}

export function deleteRepaintShop(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM repaint_shop_entrances WHERE repaint_shop_id = ?").run(id);
  db.prepare("DELETE FROM repaint_shops WHERE id = ?").run(id);
}

// --- Repaint shop entrances (repaint_shop_entrances' own CREATE TABLE
// comment above) — exact mirror of dealer_entrances. ---
export interface RepaintShopEntrance {
  id: number;
  repaintShopId: number;
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

interface RepaintShopEntranceRow {
  id: number;
  repaint_shop_id: number;
  lon: number;
  lat: number;
  mode: DealerEntranceMode;
}

function repaintShopEntranceFromRow(row: RepaintShopEntranceRow): RepaintShopEntrance {
  return { id: row.id, repaintShopId: row.repaint_shop_id, lon: row.lon, lat: row.lat, mode: row.mode };
}

export function addRepaintShopEntrance(db: SaveDb, repaintShopId: number, lon: number, lat: number, mode: DealerEntranceMode): RepaintShopEntrance {
  const result = db
    .prepare("INSERT INTO repaint_shop_entrances (repaint_shop_id, lon, lat, mode) VALUES (?, ?, ?, ?)")
    .run(repaintShopId, lon, lat, mode);
  return { id: Number(result.lastInsertRowid), repaintShopId, lon, lat, mode };
}

export function listRepaintShopEntrances(db: SaveDb, repaintShopId: number): RepaintShopEntrance[] {
  const rows = db
    .prepare("SELECT id, repaint_shop_id, lon, lat, mode FROM repaint_shop_entrances WHERE repaint_shop_id = ?")
    .all(repaintShopId) as unknown as RepaintShopEntranceRow[];
  return rows.map(repaintShopEntranceFromRow);
}

export function listAllRepaintShopEntrances(db: SaveDb): RepaintShopEntrance[] {
  const rows = db.prepare("SELECT id, repaint_shop_id, lon, lat, mode FROM repaint_shop_entrances").all() as unknown as RepaintShopEntranceRow[];
  return rows.map(repaintShopEntranceFromRow);
}

export function setRepaintShopEntranceMode(db: SaveDb, id: number, mode: DealerEntranceMode): void {
  db.prepare("UPDATE repaint_shop_entrances SET mode = ? WHERE id = ?").run(mode, id);
}

export function deleteRepaintShopEntrance(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM repaint_shop_entrances WHERE id = ?").run(id);
}

// --- Repaint bookings (repaint_bookings' own CREATE TABLE comment above
// explains the capacity/scheduling-only scope) ---

export type RepaintType = "full" | "simple";

export interface RepaintBooking {
  id: number;
  vehicleId: number;
  repaintShopId: number | null;
  repaintType: RepaintType;
  basePriceGBP: number;
  discountPercent: number;
  finalPriceGBP: number;
  bookedGameDay: number;
  startGameDay: number;
  completionGameDay: number;
}

interface RepaintBookingRow {
  id: number;
  vehicle_id: number;
  repaint_shop_id: number | null;
  repaint_type: RepaintType;
  base_price_gbp: number;
  discount_percent: number;
  final_price_gbp: number;
  booked_game_day: number;
  start_game_day: number;
  completion_game_day: number;
}

function repaintBookingFromRow(row: RepaintBookingRow): RepaintBooking {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    repaintShopId: row.repaint_shop_id,
    repaintType: row.repaint_type,
    basePriceGBP: row.base_price_gbp,
    discountPercent: row.discount_percent,
    finalPriceGBP: row.final_price_gbp,
    bookedGameDay: row.booked_game_day,
    startGameDay: row.start_game_day,
    completionGameDay: row.completion_game_day,
  };
}

// Scheduling (which start/completion day, whether a shop/depot-group cap
// is free) and pricing (base price, discount) are both computed by the
// caller (repaint-booking.mts, pure renderer logic) — this just stores
// the result. Keeps db.mts a plain storage layer, same split already
// used for fare pricing (fare-pricing.mts) and vehicle bulk discounts
// (vehicle-buy-pricing.mts).
export function createRepaintBooking(
  db: SaveDb,
  vehicleId: number,
  repaintShopId: number | null,
  repaintType: RepaintType,
  basePriceGBP: number,
  discountPercent: number,
  finalPriceGBP: number,
  bookedGameDay: number,
  startGameDay: number,
  completionGameDay: number,
): RepaintBooking {
  const result = db
    .prepare(
      `INSERT INTO repaint_bookings
        (vehicle_id, repaint_shop_id, repaint_type, base_price_gbp, discount_percent, final_price_gbp, booked_game_day, start_game_day, completion_game_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(vehicleId, repaintShopId, repaintType, basePriceGBP, discountPercent, finalPriceGBP, bookedGameDay, startGameDay, completionGameDay);
  return {
    id: Number(result.lastInsertRowid),
    vehicleId,
    repaintShopId,
    repaintType,
    basePriceGBP,
    discountPercent,
    finalPriceGBP,
    bookedGameDay,
    startGameDay,
    completionGameDay,
  };
}

export function listAllRepaintBookings(db: SaveDb): RepaintBooking[] {
  const rows = db
    .prepare(
      `SELECT id, vehicle_id, repaint_shop_id, repaint_type, base_price_gbp, discount_percent, final_price_gbp, booked_game_day, start_game_day, completion_game_day
       FROM repaint_bookings ORDER BY start_game_day`,
    )
    .all() as unknown as RepaintBookingRow[];
  return rows.map(repaintBookingFromRow);
}

export function deleteRepaintBooking(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM repaint_bookings WHERE id = ?").run(id);
}

// --- Council-triggered stop upgrades (OPEN-ITEMS.md "Phase 5/9 redesign:
// stop ownership dropped...", 2026-11-16) ---

export type StopUpgradeType = "seating" | "lighting" | "shelter";

export interface StopUpgradeState {
  stopOsmId: number;
  hasSeating: boolean;
  hasLighting: boolean;
  hasShelter: boolean;
  seatingInstalledGameDay: number | null;
  lightingInstalledGameDay: number | null;
  shelterInstalledGameDay: number | null;
}

interface StopUpgradeRow {
  stop_osm_id: number;
  has_seating: number;
  has_lighting: number;
  has_shelter: number;
  seating_installed_game_day: number | null;
  lighting_installed_game_day: number | null;
  shelter_installed_game_day: number | null;
}

const STOP_UPGRADE_COLUMNS = "stop_osm_id, has_seating, has_lighting, has_shelter, seating_installed_game_day, lighting_installed_game_day, shelter_installed_game_day";

function stopUpgradeFromRow(row: StopUpgradeRow): StopUpgradeState {
  return {
    stopOsmId: row.stop_osm_id,
    hasSeating: row.has_seating !== 0,
    hasLighting: row.has_lighting !== 0,
    hasShelter: row.has_shelter !== 0,
    seatingInstalledGameDay: row.seating_installed_game_day,
    lightingInstalledGameDay: row.lighting_installed_game_day,
    shelterInstalledGameDay: row.shelter_installed_game_day,
  };
}

export function listAllStopUpgrades(db: SaveDb): StopUpgradeState[] {
  const rows = db.prepare(`SELECT ${STOP_UPGRADE_COLUMNS} FROM stop_upgrades`).all() as unknown as StopUpgradeRow[];
  return rows.map(stopUpgradeFromRow);
}

export function getStopUpgrade(db: SaveDb, stopOsmId: number): StopUpgradeState | null {
  const row = db.prepare(`SELECT ${STOP_UPGRADE_COLUMNS} FROM stop_upgrades WHERE stop_osm_id = ?`).get(stopOsmId) as unknown as StopUpgradeRow | undefined;
  return row ? stopUpgradeFromRow(row) : null;
}

// `upgradeType` is one of this file's own 3-literal union, never raw
// external input, so interpolating the real column name here (rather
// than a `?` placeholder, which SQL doesn't allow for identifiers) is
// safe — same convention this file already trusts itself with elsewhere
// for internally-selected column names.
export function installStopUpgrade(db: SaveDb, stopOsmId: number, upgradeType: StopUpgradeType, gameDay: number): StopUpgradeState {
  const flagColumn = upgradeType === "seating" ? "has_seating" : upgradeType === "lighting" ? "has_lighting" : "has_shelter";
  const dayColumn = upgradeType === "seating" ? "seating_installed_game_day" : upgradeType === "lighting" ? "lighting_installed_game_day" : "shelter_installed_game_day";
  db.prepare(
    `INSERT INTO stop_upgrades (stop_osm_id, ${flagColumn}, ${dayColumn}) VALUES (?, 1, ?)
     ON CONFLICT(stop_osm_id) DO UPDATE SET ${flagColumn} = 1, ${dayColumn} = ?`,
  ).run(stopOsmId, gameDay, gameDay);
  const result = getStopUpgrade(db, stopOsmId);
  if (!result) throw new Error(`installStopUpgrade: row missing immediately after insert for stop ${stopOsmId}`);
  return result;
}

// --- Route advertising (OPEN-ITEMS.md "Phase 5/9 redesign: stop
// ownership dropped...", confirmed 2026-11-16) — player-bought only,
// never council-triggered; see route_advertising_bookings' own SCHEMA
// comment above for the full real design (cost/timing/mode reasoning).
// Tables created unconditionally via the SCHEMA string above (CREATE
// TABLE IF NOT EXISTS), not a dedicated version-gated migration branch
// — SCHEMA_VERSION's own v66->v67 slot was already claimed by the
// sibling stop-upgrades feature built concurrently in this same session
// (see currentVersion === 66 above); since this is pure new-table
// creation with no existing data to migrate, the unconditional
// IF-NOT-EXISTS create is sufficient and safe on every openSave() call,
// same as it would be under a dedicated branch.

export type RouteAdvertisingMode = "specific_route" | "long_distance";

export interface RouteAdvertisingBooking {
  id: number;
  stopOsmId: number;
  depotGroupId: number;
  mode: RouteAdvertisingMode;
  routeId: number | null;
  operatorName: string | null;
  bookedGameDay: number;
  liveFromGameDay: number;
  // True only for the one free, permanent booking a Fixed real contract
  // grants its own terminus stop on acceptance (see stop_route_locks'
  // own CREATE TABLE comment and contracts-panel.ts's acceptRealContract)
  // — bypasses the setup fee/monthly fee/14-day delay entirely. False
  // for every ordinary player-bought booking.
  isContractBundle: boolean;
}

interface RouteAdvertisingBookingRow {
  id: number;
  stop_osm_id: number;
  depot_group_id: number;
  mode: RouteAdvertisingMode;
  route_id: number | null;
  operator_name: string | null;
  booked_game_day: number;
  live_from_game_day: number;
  is_contract_bundle: number;
}

const ROUTE_ADVERTISING_COLUMNS = "id, stop_osm_id, depot_group_id, mode, route_id, operator_name, booked_game_day, live_from_game_day, is_contract_bundle";

function routeAdvertisingBookingFromRow(row: RouteAdvertisingBookingRow): RouteAdvertisingBooking {
  return {
    id: row.id,
    stopOsmId: row.stop_osm_id,
    depotGroupId: row.depot_group_id,
    mode: row.mode,
    routeId: row.route_id,
    operatorName: row.operator_name,
    bookedGameDay: row.booked_game_day,
    liveFromGameDay: row.live_from_game_day,
    isContractBundle: row.is_contract_bundle === 1,
  };
}

export function createRouteAdvertisingBooking(
  db: SaveDb,
  stopOsmId: number,
  depotGroupId: number,
  mode: RouteAdvertisingMode,
  routeId: number | null,
  operatorName: string | null,
  bookedGameDay: number,
  liveFromGameDay: number,
  isContractBundle: boolean = false,
): RouteAdvertisingBooking {
  const result = db
    .prepare(
      `INSERT INTO route_advertising_bookings (stop_osm_id, depot_group_id, mode, route_id, operator_name, booked_game_day, live_from_game_day, is_contract_bundle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(stopOsmId, depotGroupId, mode, routeId, operatorName, bookedGameDay, liveFromGameDay, isContractBundle ? 1 : 0);
  return {
    id: Number(result.lastInsertRowid),
    stopOsmId,
    depotGroupId,
    mode,
    routeId,
    operatorName,
    bookedGameDay,
    liveFromGameDay,
    isContractBundle,
  };
}

export function listAllRouteAdvertisingBookings(db: SaveDb): RouteAdvertisingBooking[] {
  const rows = db.prepare(`SELECT ${ROUTE_ADVERTISING_COLUMNS} FROM route_advertising_bookings ORDER BY booked_game_day`).all() as unknown as RouteAdvertisingBookingRow[];
  return rows.map(routeAdvertisingBookingFromRow);
}

export function listRouteAdvertisingBookingsForStop(db: SaveDb, stopOsmId: number): RouteAdvertisingBooking[] {
  const rows = db
    .prepare(`SELECT ${ROUTE_ADVERTISING_COLUMNS} FROM route_advertising_bookings WHERE stop_osm_id = ? ORDER BY booked_game_day`)
    .all(stopOsmId) as unknown as RouteAdvertisingBookingRow[];
  return rows.map(routeAdvertisingBookingFromRow);
}

export function deleteRouteAdvertisingBooking(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM route_advertising_bookings WHERE id = ?").run(id);
}

// Same shape/convention as listGeneratedLeaseBillingMonths/
// recordLeaseBillingMonths below — plain storage only, the real month
// math lives in the renderer's own route-advertising.mts (reusing
// private-hire-income.mts's monthKeyFromGameDay/elapsedMonthKeysSince,
// the same calendar-correct utility vehicle-lease-billing.mts already
// uses for exactly this kind of recurring charge).
export function listGeneratedRouteAdvertisingMonths(db: SaveDb, bookingId: number): string[] {
  const rows = db.prepare("SELECT month_key FROM route_advertising_billing_months WHERE booking_id = ?").all(bookingId) as unknown as { month_key: string }[];
  return rows.map((r) => r.month_key);
}

export function recordRouteAdvertisingMonthsBilled(db: SaveDb, bookingId: number, monthKeys: string[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO route_advertising_billing_months (booking_id, month_key) VALUES (?, ?)");
  for (const key of monthKeys) stmt.run(bookingId, key);
}

// --- Re-power bookings (T179, OPEN-ITEMS.md) ---

export type RepowerPowerType = "electric" | "hydrogen";

export interface RepowerBooking {
  id: number;
  vehicleId: number;
  dealerId: number;
  toPowerType: RepowerPowerType;
  finalPriceGBP: number;
  bookedGameDay: number;
  startGameDay: number;
  completionGameDay: number;
}

interface RepowerBookingRow {
  id: number;
  vehicle_id: number;
  dealer_id: number;
  to_power_type: RepowerPowerType;
  final_price_gbp: number;
  booked_game_day: number;
  start_game_day: number;
  completion_game_day: number;
}

function repowerBookingFromRow(row: RepowerBookingRow): RepowerBooking {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    dealerId: row.dealer_id,
    toPowerType: row.to_power_type,
    finalPriceGBP: row.final_price_gbp,
    bookedGameDay: row.booked_game_day,
    startGameDay: row.start_game_day,
    completionGameDay: row.completion_game_day,
  };
}

// Scheduling and pricing are both computed by the caller
// (repower-booking.mts, pure renderer logic) — same storage-only split as
// createRepaintBooking above.
export function createRepowerBooking(
  db: SaveDb,
  vehicleId: number,
  dealerId: number,
  toPowerType: RepowerPowerType,
  finalPriceGBP: number,
  bookedGameDay: number,
  startGameDay: number,
  completionGameDay: number,
): RepowerBooking {
  const result = db
    .prepare(
      `INSERT INTO repower_bookings
        (vehicle_id, dealer_id, to_power_type, final_price_gbp, booked_game_day, start_game_day, completion_game_day)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(vehicleId, dealerId, toPowerType, finalPriceGBP, bookedGameDay, startGameDay, completionGameDay);
  return {
    id: Number(result.lastInsertRowid),
    vehicleId,
    dealerId,
    toPowerType,
    finalPriceGBP,
    bookedGameDay,
    startGameDay,
    completionGameDay,
  };
}

export function listAllRepowerBookings(db: SaveDb): RepowerBooking[] {
  const rows = db
    .prepare(
      `SELECT id, vehicle_id, dealer_id, to_power_type, final_price_gbp, booked_game_day, start_game_day, completion_game_day
       FROM repower_bookings ORDER BY start_game_day`,
    )
    .all() as unknown as RepowerBookingRow[];
  return rows.map(repowerBookingFromRow);
}

export function deleteRepowerBooking(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM repower_bookings WHERE id = ?").run(id);
}

// Auto-switches a vehicle's livery to/from an electric-only variant on
// repower (2026-11-20, user's own words: "I would like this livery to
// automatically apply if a vehicle gets repowered") — reads
// ELECTRIC_LIVERY_VARIANT (livery-seed-data.mts), keyed by base livery
// name, built as a lookup rather than a single hardcoded pair so a future
// electric-only variant needs nothing else touched. Only acts on a
// vehicle whose CURRENT livery is actually one side of a known pair —
// any other livery (including Stagecoach Electric, deliberately excluded
// from the map itself, not special-cased here) is untouched, matching
// the "can't tell, don't guess" convention used throughout this
// codebase. Repowering TO electric switches a base livery to its
// electric variant; repowering AWAY from electric switches an electric
// variant back to its own base livery — the natural symmetric case, not
// explicitly asked for but left stuck in an "Electric"-branded livery
// after leaving electric power would be a real, visible inconsistency.
function autoSwitchElectricLiveryVariant(db: SaveDb, vehicleId: number, toPowerType: RepowerPowerType): void {
  const vehicle = db.prepare("SELECT livery_id FROM vehicles WHERE id = ?").get(vehicleId) as { livery_id: number | null } | undefined;
  if (!vehicle || vehicle.livery_id === null) return;
  const currentLivery = db.prepare("SELECT name FROM liveries WHERE id = ?").get(vehicle.livery_id) as { name: string } | undefined;
  if (!currentLivery) return;

  let targetName: string | null = null;
  if (toPowerType === "electric") {
    targetName = ELECTRIC_LIVERY_VARIANT[currentLivery.name] ?? null;
  } else {
    const baseName = Object.entries(ELECTRIC_LIVERY_VARIANT).find(([, variant]) => variant === currentLivery.name)?.[0];
    targetName = baseName ?? null;
  }
  if (targetName === null) return;

  const targetLivery = db.prepare("SELECT id FROM liveries WHERE name = ?").get(targetName) as { id: number } | undefined;
  if (!targetLivery) return; // the variant livery hasn't been seeded into this save yet — can't switch to something that doesn't exist here
  db.prepare("UPDATE vehicles SET livery_id = ? WHERE id = ?").run(targetLivery.id, vehicleId);
}

// Applies the actual conversion once a booking's completion day has
// passed — unlike a repaint booking (display/scheduling only, nothing on
// the vehicle itself changes), a re-power really does change what the
// vehicle IS: its power_type, its fleet number (the "r" suffix,
// fleet-numbering.mts's repowerFleetNumber), and NewPower's own "fully
// checked and repaired" promise resets condition to 100. The booking row
// is removed on collection — same "collect, then gone" mechanic as
// nothing else needs it once the swap has happened.
export function collectRepowerBooking(db: SaveDb, id: number): Vehicle {
  const booking = db.prepare("SELECT vehicle_id, to_power_type FROM repower_bookings WHERE id = ?").get(id) as
    | { vehicle_id: number; to_power_type: RepowerPowerType }
    | undefined;
  if (!booking) throw new Error(`collectRepowerBooking: no booking with id ${id}`);
  const vehicle = db.prepare("SELECT fleet_number FROM vehicles WHERE id = ?").get(booking.vehicle_id) as { fleet_number: string } | undefined;
  if (!vehicle) throw new Error(`collectRepowerBooking: no vehicle with id ${booking.vehicle_id}`);
  const newFleetNumber = repowerFleetNumber(vehicle.fleet_number, booking.to_power_type);
  db.prepare("UPDATE vehicles SET power_type = ?, fleet_number = ?, condition = 100 WHERE id = ?").run(booking.to_power_type, newFleetNumber, booking.vehicle_id);
  autoSwitchElectricLiveryVariant(db, booking.vehicle_id, booking.to_power_type);
  db.prepare("DELETE FROM repower_bookings WHERE id = ?").run(id);
  const row = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, fleet_number, plate, condition, purchase_price_gbp, bought_at, bought_game_day, livery_id, bought_for_route_id, payment_method, greenroad_fitted
       FROM vehicles WHERE id = ?`,
    )
    .get(booking.vehicle_id) as {
    id: number;
    depot_group_id: number;
    depot_id: number;
    model_id: string;
    length_m: number;
    variant_label: string | null;
    power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
    fleet_number: string;
    plate: string;
    condition: number;
    purchase_price_gbp: number;
    bought_at: string;
    bought_game_day: number;
    livery_id: number | null;
    bought_for_route_id: number | null;
    payment_method: "buy_outright" | "lease" | "lease_to_own";
    greenroad_fitted: number;
  };
  return {
    id: row.id,
    depotGroupId: row.depot_group_id,
    depotId: row.depot_id,
    modelId: row.model_id,
    lengthM: row.length_m,
    variantLabel: row.variant_label,
    powerType: row.power_type,
    fleetNumber: row.fleet_number,
    plate: row.plate,
    condition: row.condition,
    purchasePriceGBP: row.purchase_price_gbp,
    boughtAt: row.bought_at,
    boughtGameDay: row.bought_game_day,
    liveryId: row.livery_id,
    boughtForRouteId: row.bought_for_route_id,
    paymentMethod: row.payment_method,
    greenroadFitted: !!row.greenroad_fitted,
  };
}

export interface DeadMileageWaypoint {
  lon: number;
  lat: number;
}

export interface DeadMileageBranch {
  id: number;
  routeId: number;
  depotEntranceId: number;
  waypoints: DeadMileageWaypoint[];
}

export type DeadMileageDirection = "inbound" | "outbound";

export interface DeadMileageRoute {
  id: number;
  dealerEntranceId: number;
  depotId: number;
  direction: DeadMileageDirection;
  trunkWaypoints: DeadMileageWaypoint[];
  branches: DeadMileageBranch[];
}

function validWaypoints(waypoints: readonly DeadMileageWaypoint[]): void {
  for (const w of waypoints) {
    if (!Number.isFinite(w.lon) || !Number.isFinite(w.lat)) throw new Error("waypoints must have finite lon and lat");
  }
}

export function createDeadMileageRoute(
  db: SaveDb,
  dealerEntranceId: number,
  depotId: number,
  direction: DeadMileageDirection,
  trunkWaypoints: readonly DeadMileageWaypoint[],
): DeadMileageRoute {
  validWaypoints(trunkWaypoints);
  const result = db
    .prepare("INSERT INTO dead_mileage_routes (dealer_entrance_id, depot_id, direction, trunk_waypoints) VALUES (?, ?, ?, ?)")
    .run(dealerEntranceId, depotId, direction, JSON.stringify(trunkWaypoints));
  return {
    id: Number(result.lastInsertRowid),
    dealerEntranceId,
    depotId,
    direction,
    trunkWaypoints: [...trunkWaypoints],
    branches: [],
  };
}

export function setDeadMileageTrunkWaypoints(db: SaveDb, routeId: number, waypoints: readonly DeadMileageWaypoint[]): void {
  validWaypoints(waypoints);
  db.prepare("UPDATE dead_mileage_routes SET trunk_waypoints = ? WHERE id = ?").run(JSON.stringify(waypoints), routeId);
}

// A route may hold at most one branch per depot entrance (UNIQUE in SCHEMA) —
// re-adding one updates its waypoints instead of creating a duplicate fork.
export function addDeadMileageBranch(
  db: SaveDb,
  routeId: number,
  depotEntranceId: number,
  waypoints: readonly DeadMileageWaypoint[],
): DeadMileageBranch {
  validWaypoints(waypoints);
  const result = db
    .prepare(
      `INSERT INTO dead_mileage_branches (route_id, depot_entrance_id, waypoints) VALUES (?, ?, ?)
       ON CONFLICT(route_id, depot_entrance_id) DO UPDATE SET waypoints = excluded.waypoints`,
    )
    .run(routeId, depotEntranceId, JSON.stringify(waypoints));
  const id =
    result.lastInsertRowid > 0
      ? Number(result.lastInsertRowid)
      : (db
          .prepare("SELECT id FROM dead_mileage_branches WHERE route_id = ? AND depot_entrance_id = ?")
          .get(routeId, depotEntranceId) as { id: number }).id;
  return { id, routeId, depotEntranceId, waypoints: [...waypoints] };
}

export function setDeadMileageBranchWaypoints(db: SaveDb, branchId: number, waypoints: readonly DeadMileageWaypoint[]): void {
  validWaypoints(waypoints);
  db.prepare("UPDATE dead_mileage_branches SET waypoints = ? WHERE id = ?").run(JSON.stringify(waypoints), branchId);
}

export function deleteDeadMileageBranch(db: SaveDb, branchId: number): void {
  db.prepare("DELETE FROM dead_mileage_branches WHERE id = ?").run(branchId);
}

export function listDeadMileageRoutesForDepot(db: SaveDb, depotId: number): DeadMileageRoute[] {
  const routeRows = db
    .prepare("SELECT id, dealer_entrance_id, depot_id, direction, trunk_waypoints FROM dead_mileage_routes WHERE depot_id = ? ORDER BY id")
    .all(depotId) as { id: number; dealer_entrance_id: number; depot_id: number; direction: DeadMileageDirection; trunk_waypoints: string }[];
  const branchRows = db
    .prepare(
      `SELECT b.id, b.route_id, b.depot_entrance_id, b.waypoints
       FROM dead_mileage_branches b
       JOIN dead_mileage_routes r ON r.id = b.route_id
       WHERE r.depot_id = ?
       ORDER BY b.id`,
    )
    .all(depotId) as { id: number; route_id: number; depot_entrance_id: number; waypoints: string }[];
  const branchesByRoute = new Map<number, DeadMileageBranch[]>();
  for (const b of branchRows) {
    const branch: DeadMileageBranch = {
      id: b.id,
      routeId: b.route_id,
      depotEntranceId: b.depot_entrance_id,
      waypoints: JSON.parse(b.waypoints) as DeadMileageWaypoint[],
    };
    const list = branchesByRoute.get(b.route_id) ?? [];
    list.push(branch);
    branchesByRoute.set(b.route_id, list);
  }
  return routeRows.map((r) => ({
    id: r.id,
    dealerEntranceId: r.dealer_entrance_id,
    depotId: r.depot_id,
    direction: r.direction,
    trunkWaypoints: JSON.parse(r.trunk_waypoints) as DeadMileageWaypoint[],
    branches: branchesByRoute.get(r.id) ?? [],
  }));
}

export function deleteDeadMileageRoute(db: SaveDb, routeId: number): void {
  db.prepare("DELETE FROM dead_mileage_branches WHERE route_id = ?").run(routeId);
  db.prepare("DELETE FROM dead_mileage_routes WHERE id = ?").run(routeId);
}

// Duties (OPERATIONS.md §7, Phase 3) — see the SCHEMA block's own comments
// on `duties`/`duty_pieces` for why a piece stores only enough to re-find
// its journey, not the journey itself.
export interface DutyPiece {
  id: number;
  routeId: number;
  departureMinutes: number;
}

export interface Duty {
  id: number;
  depotGroupId: number;
  depotId: number;
  weekdayMask: number;
  dutyNumber: string;
  locked: boolean;
  // Schema v57->v58 — set via setDutyDriver, not createDuty (same
  // "dedicated setter for a less-central field" pattern as route
  // branding/pickup-dropoff overrides). Null means unassigned.
  driverId: number | null;
  pieces: DutyPiece[];
}

// A driver (OPERATIONS.md §6), schema v57->v58 — see the drivers table's
// own SCHEMA comment for this increment's deliberate scope.
export interface Driver {
  id: number;
  depotGroupId: number;
  depotId: number;
  name: string;
  score: DriverScore;
  // Schema v60->v61 (T183) — see drivers' own SCHEMA comment. Null for
  // every ordinary driver; set via setDriverPrivateHireVehicleId only for
  // one auto-hired onto a private-hire vehicle.
  privateHireVehicleId: number | null;
}

export type DriverScore = "trainee" | "novice" | "competent" | "professional" | "fleet_elite";

interface DriverRow {
  id: number;
  depot_group_id: number;
  depot_id: number;
  name: string;
  score: string;
  private_hire_vehicle_id: number | null;
}

function driverFromRow(row: DriverRow): Driver {
  return {
    id: row.id,
    depotGroupId: row.depot_group_id,
    depotId: row.depot_id,
    name: row.name,
    score: row.score as DriverScore,
    privateHireVehicleId: row.private_hire_vehicle_id,
  };
}

export function createDriver(db: SaveDb, depotGroupId: number, depotId: number, name: string, score: DriverScore = "trainee"): Driver {
  const result = db
    .prepare("INSERT INTO drivers (depot_group_id, depot_id, name, score) VALUES (?, ?, ?, ?)")
    .run(depotGroupId, depotId, name, score);
  return { id: Number(result.lastInsertRowid), depotGroupId, depotId, name, score, privateHireVehicleId: null };
}

export function listDriversForDepotGroup(db: SaveDb, depotGroupId: number): Driver[] {
  const rows = db
    .prepare("SELECT id, depot_group_id, depot_id, name, score, private_hire_vehicle_id FROM drivers WHERE depot_group_id = ? ORDER BY id")
    .all(depotGroupId) as unknown as DriverRow[];
  return rows.map(driverFromRow);
}

export function renameDriver(db: SaveDb, driverId: number, name: string): void {
  db.prepare("UPDATE drivers SET name = ? WHERE id = ?").run(name, driverId);
}

export function setDriverScore(db: SaveDb, driverId: number, score: DriverScore): void {
  db.prepare("UPDATE drivers SET score = ? WHERE id = ?").run(score, driverId);
}

// T183 — links an auto-hired driver back to the private-hire vehicle that
// hired them (see drivers' own SCHEMA comment). Not exposed over IPC on
// its own; only ever called from maybeAutoHireDriverForPrivateHire below,
// right after createDriver, within the same collectOrder flow.
function setDriverPrivateHireVehicleId(db: SaveDb, driverId: number, vehicleId: number): void {
  db.prepare("UPDATE drivers SET private_hire_vehicle_id = ? WHERE id = ?").run(vehicleId, driverId);
}

// Deleting a driver unassigns them from every duty first — no FK cascade
// is enabled on this database (same convention as every other delete in
// this file), so a duty left pointing at a deleted driver's id would
// otherwise be a dangling reference.
export function deleteDriver(db: SaveDb, driverId: number): void {
  db.prepare("UPDATE duties SET driver_id = NULL WHERE driver_id = ?").run(driverId);
  db.prepare("DELETE FROM drivers WHERE id = ?").run(driverId);
}

// One driver permanently assigned per duty (confirmed 2026-11-08) — no
// daily rotation/rota grid yet, that's Phase 6's own real rota, a later
// increment. Pass driverId = null to unassign. Deliberately doesn't
// validate the driver's own depot/depot group against the duty's —
// cross-depot relief logistics don't exist yet either.
export function setDutyDriver(db: SaveDb, dutyId: number, driverId: number | null): void {
  db.prepare("UPDATE duties SET driver_id = ? WHERE id = ?").run(driverId, dutyId);
}

// A depot's 1-based rank within its own group, ordered by id (the first
// depot ever added to the group is "the main depot") — purely a numbering
// convention for duty_number, not stored anywhere of its own; recomputed
// fresh every time a duty is created so adding a new depot later doesn't
// require renumbering anything that already exists.
function depotRankInGroup(db: SaveDb, depotGroupId: number, depotId: number): number {
  const rows = db.prepare("SELECT id FROM depots WHERE depot_group_id = ? ORDER BY id").all(depotGroupId) as { id: number }[];
  const index = rows.findIndex((r) => r.id === depotId);
  return index === -1 ? rows.length : index + 1;
}

// The next duty_number for a depot, following the user's own convention
// (2026-10-17): 1xxx for the main depot in the group, 2xxx for the next,
// and so on — so the number alone shows which depot a duty belongs to.
// Takes the highest existing number for this depot's own block, not a
// plain count — there's no separate persisted counter, so deleting the
// current highest-numbered duty frees that exact number for reuse (the
// next create just sees a lower max again), but a gap left by deleting a
// lower one stays a gap, since the max above it is unaffected. Simple and
// good enough for a derived, non-authoritative number the player can
// always rename anyway (`renameDuty`).
function nextDutyNumber(db: SaveDb, depotGroupId: number, depotId: number): string {
  const rank = depotRankInGroup(db, depotGroupId, depotId);
  const base = rank * 1000;
  const { maxNumber } = db
    .prepare("SELECT MAX(CAST(duty_number AS INTEGER)) AS maxNumber FROM duties WHERE depot_id = ?")
    .get(depotId) as { maxNumber: number | null };
  return String(Math.max(maxNumber ?? base, base) + 1);
}

export function createDuty(db: SaveDb, depotGroupId: number, depotId: number, weekdayMask: number): Duty {
  const dutyNumber = nextDutyNumber(db, depotGroupId, depotId);
  const result = db
    .prepare("INSERT INTO duties (depot_group_id, depot_id, weekday_mask, duty_number, locked) VALUES (?, ?, ?, ?, 0)")
    .run(depotGroupId, depotId, weekdayMask, dutyNumber);
  return { id: Number(result.lastInsertRowid), depotGroupId, depotId, weekdayMask, dutyNumber, locked: false, driverId: null, pieces: [] };
}

export function deleteDuty(db: SaveDb, dutyId: number): void {
  db.prepare("DELETE FROM duty_pieces WHERE duty_id = ?").run(dutyId);
  db.prepare("DELETE FROM duties WHERE id = ?").run(dutyId);
}

export function setDutyLocked(db: SaveDb, dutyId: number, locked: boolean): void {
  db.prepare("UPDATE duties SET locked = ? WHERE id = ?").run(locked ? 1 : 0, dutyId);
}

export function renameDuty(db: SaveDb, dutyId: number, dutyNumber: string): void {
  db.prepare("UPDATE duties SET duty_number = ? WHERE id = ?").run(dutyNumber, dutyId);
}

// Appends one journey to the end of a duty's own running order — the only
// way pieces are added; manual chaining and auto-complete alike always
// build a duty forward in time, never splice one into the middle.
export function addDutyPiece(db: SaveDb, dutyId: number, routeId: number, departureMinutes: number): DutyPiece {
  const { maxOrder } = db
    .prepare("SELECT COALESCE(MAX(sequence_order), -1) AS maxOrder FROM duty_pieces WHERE duty_id = ?")
    .get(dutyId) as { maxOrder: number };
  const result = db
    .prepare("INSERT INTO duty_pieces (duty_id, sequence_order, route_id, departure_minutes) VALUES (?, ?, ?, ?)")
    .run(dutyId, maxOrder + 1, routeId, departureMinutes);
  return { id: Number(result.lastInsertRowid), routeId, departureMinutes };
}

// Removes one piece from wherever it sits in the duty — the remaining
// pieces' own sequence_order values are left with a gap, harmless since
// listDutiesForDepotGroup only ever orders by it, never assumes it's
// contiguous.
export function removeDutyPiece(db: SaveDb, pieceId: number): void {
  db.prepare("DELETE FROM duty_pieces WHERE id = ?").run(pieceId);
}

// Every duty across every depot in the group, for one day type — ordered
// by duty_number (not id), so the natural sort already groups them by
// depot (1xxx block, then 2xxx, ...) the way the user asked for
// (2026-10-17), without the caller needing to re-sort.
export function listDutiesForDepotGroup(db: SaveDb, depotGroupId: number, weekdayMask: number): Duty[] {
  const dutyRows = db
    .prepare(
      "SELECT id, depot_group_id, depot_id, weekday_mask, duty_number, locked, driver_id FROM duties WHERE depot_group_id = ? AND weekday_mask = ? ORDER BY CAST(duty_number AS INTEGER)",
    )
    .all(depotGroupId, weekdayMask) as {
    id: number;
    depot_group_id: number;
    depot_id: number;
    weekday_mask: number;
    duty_number: string;
    locked: number;
    driver_id: number | null;
  }[];
  const pieceRows = db
    .prepare(
      `SELECT p.id, p.duty_id, p.route_id, p.departure_minutes
       FROM duty_pieces p
       JOIN duties d ON d.id = p.duty_id
       WHERE d.depot_group_id = ? AND d.weekday_mask = ?
       ORDER BY p.duty_id, p.sequence_order`,
    )
    .all(depotGroupId, weekdayMask) as { id: number; duty_id: number; route_id: number; departure_minutes: number }[];
  const piecesByDuty = new Map<number, DutyPiece[]>();
  for (const p of pieceRows) {
    const list = piecesByDuty.get(p.duty_id) ?? [];
    list.push({ id: p.id, routeId: p.route_id, departureMinutes: p.departure_minutes });
    piecesByDuty.set(p.duty_id, list);
  }
  return dutyRows.map((d) => ({
    id: d.id,
    depotGroupId: d.depot_group_id,
    depotId: d.depot_id,
    weekdayMask: d.weekday_mask,
    dutyNumber: d.duty_number,
    locked: !!d.locked,
    driverId: d.driver_id,
    pieces: piecesByDuty.get(d.id) ?? [],
  }));
}

// Owned vehicles (OPERATIONS.md §3). See the vehicles table's own SCHEMA
// comment for this increment's deliberate scope: new, buy-outright only.
export interface Vehicle {
  id: number;
  depotGroupId: number;
  depotId: number;
  modelId: string;
  lengthM: number;
  variantLabel: string | null;
  powerType: "diesel" | "electric" | "hybrid" | "hydrogen";
  fleetNumber: string;
  plate: string;
  condition: number;
  purchasePriceGBP: number;
  boughtAt: string;
  // The real in-game day index this vehicle was bought on (schema
  // v58->v59, T179) — see that column's own SCHEMA comment for why
  // boughtAt (a real wall-clock timestamp) can't serve the re-power age
  // gate, which runs on the game's own independent calendar.
  boughtGameDay: number;
  liveryId: number | null;
  // Which route this vehicle was bought for (T153, confirmed
  // 2026-11-07) — recorded for reference only, same convention as the
  // comment on Route.assignedLiveryId in depot-groups.d.ts; nothing
  // reads this as an enforced link.
  boughtForRouteId: number | null;
  // How this vehicle was paid for (T185) — see the vehicles table's own
  // SCHEMA comment for why this exists and why it defaults to
  // buy_outright for a vehicle bought before this column existed.
  paymentMethod: "buy_outright" | "lease" | "lease_to_own";
  // Whether GreenRoad is fitted (schema v68->v69) — see the vehicles
  // table's own SCHEMA comment.
  greenroadFitted: boolean;
}

// Buys one vehicle: computes its real category digit from the model/
// length (fleet-numbering.mts, UK-EXPANSION.md §14), the next sequential
// number within that digit (MAX-based, same convention as duty numbering
// — deleting the current top vehicle in a category frees its exact
// number for reuse, a gap left by deleting a lower one does not), and a
// real registration plate for the depot's own location — the depot's
// coordinates stand in for "the area it was bought in" (OPERATIONS.md
// §3) since there's no dealer-selection step in this first increment.
export function buyVehicle(
  db: SaveDb,
  depotGroupId: number,
  depotId: number,
  modelId: string,
  lengthM: number,
  variantLabel: string | null,
  powerType: "diesel" | "electric" | "hybrid" | "hydrogen",
  purchasePriceGBP: number,
  liveryId: number | null = null,
  conditionOverride: number | null = null,
  boughtForRouteId: number | null = null,
  // How this vehicle was paid for (T185) — appended at the end, rather
  // than inserted among the other already-established optional
  // parameters above, purely so every existing call site (several in
  // this file's own verify.mts, none of which cared about payment
  // method before this) keeps compiling unchanged at its default of
  // buy_outright; collectOrder below passes the order's own real value.
  paymentMethod: PaymentMethod = "buy_outright",
  // Whether GreenRoad is fitted (schema v68->v69) — same "appended at the
  // end, default false, so every existing call site keeps compiling"
  // reasoning as paymentMethod above.
  greenroadFitted: boolean = false,
): Vehicle {
  const depot = db.prepare("SELECT lon, lat FROM depots WHERE id = ?").get(depotId) as { lon: number; lat: number } | undefined;
  if (!depot) throw new Error(`buyVehicle: depot ${depotId} not found`);

  const categoryDigit = fleetCategoryDigit(modelId, lengthM);
  const { maxSeq } = db.prepare("SELECT MAX(sequential_number) AS maxSeq FROM vehicles WHERE category_digit = ?").get(categoryDigit) as {
    maxSeq: number | null;
  };
  const sequentialNumber = (maxSeq ?? 0) + 1;
  const suffix = powerTypeSuffix(powerType);
  const fleetNumber = formatFleetNumber(categoryDigit, sequentialNumber, suffix);
  const boughtAt = new Date();
  const plate = generatePlate(depot.lon, depot.lat, boughtAt);
  const condition = conditionOverride ?? 100;
  // Real in-game day, independent of boughtAt's real wall-clock timestamp
  // above — the re-power age gate (repower-booking.mts) runs on the
  // game's own calendar, not the player's.
  const boughtGameDay = Math.floor(getGameClock(db).accumulatedGameSeconds / SECONDS_PER_DAY);

  const result = db
    .prepare(
      `INSERT INTO vehicles
        (depot_group_id, depot_id, model_id, length_m, variant_label, power_type, category_digit, sequential_number, fleet_number, plate, condition, purchase_price_gbp, bought_at, bought_game_day, livery_id, bought_for_route_id, payment_method, greenroad_fitted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(depotGroupId, depotId, modelId, lengthM, variantLabel, powerType, categoryDigit, sequentialNumber, fleetNumber, plate, condition, purchasePriceGBP, boughtAt.toISOString(), boughtGameDay, liveryId, boughtForRouteId, paymentMethod, greenroadFitted ? 1 : 0);

  // The real "installed" moment (user request 2026-11-20) — a NEW
  // vehicle bought with GreenRoad fitted is what starts the one-way
  // company-wide adoption, not merely adding it to a basket line.
  if (greenroadFitted) markGreenroadAdopted(db);

  return {
    id: Number(result.lastInsertRowid),
    depotGroupId,
    depotId,
    modelId,
    lengthM,
    variantLabel,
    powerType,
    fleetNumber,
    plate,
    condition,
    purchasePriceGBP,
    boughtAt: boughtAt.toISOString(),
    boughtGameDay,
    liveryId,
    boughtForRouteId,
    paymentMethod,
    greenroadFitted,
  };
}

export function listVehiclesForDepotGroup(db: SaveDb, depotGroupId: number): Vehicle[] {
  const rows = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, fleet_number, plate, condition, purchase_price_gbp, bought_at, bought_game_day, livery_id, bought_for_route_id, payment_method, greenroad_fitted
       FROM vehicles WHERE depot_group_id = ? ORDER BY bought_at`,
    )
    .all(depotGroupId) as {
    id: number;
    depot_group_id: number;
    depot_id: number;
    model_id: string;
    length_m: number;
    variant_label: string | null;
    power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
    fleet_number: string;
    plate: string;
    condition: number;
    purchase_price_gbp: number;
    bought_at: string;
    bought_game_day: number;
    livery_id: number | null;
    bought_for_route_id: number | null;
    payment_method: "buy_outright" | "lease" | "lease_to_own";
    greenroad_fitted: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    depotGroupId: r.depot_group_id,
    depotId: r.depot_id,
    modelId: r.model_id,
    lengthM: r.length_m,
    variantLabel: r.variant_label,
    powerType: r.power_type,
    fleetNumber: r.fleet_number,
    plate: r.plate,
    condition: r.condition,
    purchasePriceGBP: r.purchase_price_gbp,
    boughtAt: r.bought_at,
    boughtGameDay: r.bought_game_day,
    liveryId: r.livery_id,
    boughtForRouteId: r.bought_for_route_id,
    paymentMethod: r.payment_method,
    greenroadFitted: !!r.greenroad_fitted,
  }));
}

// Every vehicle in the save, across every depot group — for pickers that
// aren't scoped to one depot group, like the repaint booking form
// (repaint-shop-panel.ts), unlike listVehiclesForDepotGroup above.
export function listAllVehicles(db: SaveDb): Vehicle[] {
  const rows = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, fleet_number, plate, condition, purchase_price_gbp, bought_at, bought_game_day, livery_id, bought_for_route_id, payment_method, greenroad_fitted
       FROM vehicles ORDER BY fleet_number`,
    )
    .all() as {
    id: number;
    depot_group_id: number;
    depot_id: number;
    model_id: string;
    length_m: number;
    variant_label: string | null;
    power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
    fleet_number: string;
    plate: string;
    condition: number;
    purchase_price_gbp: number;
    bought_at: string;
    bought_game_day: number;
    livery_id: number | null;
    bought_for_route_id: number | null;
    payment_method: "buy_outright" | "lease" | "lease_to_own";
    greenroad_fitted: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    depotGroupId: r.depot_group_id,
    depotId: r.depot_id,
    modelId: r.model_id,
    lengthM: r.length_m,
    variantLabel: r.variant_label,
    powerType: r.power_type,
    fleetNumber: r.fleet_number,
    plate: r.plate,
    condition: r.condition,
    purchasePriceGBP: r.purchase_price_gbp,
    boughtAt: r.bought_at,
    boughtGameDay: r.bought_game_day,
    liveryId: r.livery_id,
    boughtForRouteId: r.bought_for_route_id,
    paymentMethod: r.payment_method,
    greenroadFitted: !!r.greenroad_fitted,
  }));
}

// T183 (private hire revival, Q20/OPEN-ITEMS.md) — a private-hire vehicle
// sold/deleted leaves its auto-hired driver behind with nothing to do, so
// that driver is deleted too (going through deleteDriver, not a bare
// DELETE, so any duty it's somehow been put on is unassigned first — same
// "no FK cascade enabled" caution as everywhere else in this file). An
// ordinary vehicle has no matching row here at all, so this is a no-op
// for every vehicle that isn't private hire.
export function deleteVehicle(db: SaveDb, vehicleId: number): void {
  const driver = db.prepare("SELECT id FROM drivers WHERE private_hire_vehicle_id = ?").get(vehicleId) as { id: number } | undefined;
  if (driver) deleteDriver(db, driver.id);
  // Also clears any private_hire_income_months rows (T183) and
  // lease_billing_months rows (T185) — node:sqlite's DatabaseSync
  // enforces `PRAGMA foreign_keys` ON by default (confirmed directly),
  // so leaving an orphaned child row referencing this vehicle in EITHER
  // table would make the DELETE below throw a foreign key constraint
  // violation, not just leave stale data behind.
  db.prepare("DELETE FROM private_hire_income_months WHERE vehicle_id = ?").run(vehicleId);
  db.prepare("DELETE FROM lease_billing_months WHERE vehicle_id = ?").run(vehicleId);
  db.prepare("DELETE FROM greenroad_billing_months WHERE vehicle_id = ?").run(vehicleId);
  db.prepare("DELETE FROM greenroad_retrofit_bookings WHERE vehicle_id = ?").run(vehicleId);
  db.prepare("DELETE FROM vehicles WHERE id = ?").run(vehicleId);
}

// A depot-to-depot transfer (OPERATIONS.md §3 "Delivery and transfers") —
// immediate, not simulated in transit (no driver/duty system yet to hang
// "a driver each way, vehicle unusable in transit" on). Repaint-on-transfer
// (OPERATIONS.md §3, confirmed 2026-10-18) is a separate, already-specified
// cost that needs to know whether the destination area requires a
// different livery — that area-matching logic lives in the renderer
// (livery-seed-data.mts's RESTRICTED_AREA_LIVERIES), so this function just
// moves the vehicle; the caller applies any repaint consequence.
export function transferVehicle(db: SaveDb, vehicleId: number, newDepotId: number): Vehicle {
  const depot = db.prepare("SELECT depot_group_id FROM depots WHERE id = ?").get(newDepotId) as { depot_group_id: number } | undefined;
  if (!depot) throw new Error(`transferVehicle: depot ${newDepotId} not found`);
  db.prepare("UPDATE vehicles SET depot_id = ?, depot_group_id = ? WHERE id = ?").run(newDepotId, depot.depot_group_id, vehicleId);
  const row = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, fleet_number, plate, condition, purchase_price_gbp, bought_at, bought_game_day, livery_id, bought_for_route_id, payment_method, greenroad_fitted
       FROM vehicles WHERE id = ?`,
    )
    .get(vehicleId) as {
    id: number;
    depot_group_id: number;
    depot_id: number;
    model_id: string;
    length_m: number;
    variant_label: string | null;
    power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
    fleet_number: string;
    plate: string;
    condition: number;
    purchase_price_gbp: number;
    bought_at: string;
    bought_game_day: number;
    livery_id: number | null;
    bought_for_route_id: number | null;
    payment_method: "buy_outright" | "lease" | "lease_to_own";
    greenroad_fitted: number;
  };
  return {
    id: row.id,
    depotGroupId: row.depot_group_id,
    depotId: row.depot_id,
    modelId: row.model_id,
    lengthM: row.length_m,
    variantLabel: row.variant_label,
    powerType: row.power_type,
    fleetNumber: row.fleet_number,
    plate: row.plate,
    condition: row.condition,
    purchasePriceGBP: row.purchase_price_gbp,
    boughtAt: row.bought_at,
    boughtGameDay: row.bought_game_day,
    liveryId: row.livery_id,
    boughtForRouteId: row.bought_for_route_id,
    paymentMethod: row.payment_method,
    greenroadFitted: !!row.greenroad_fitted,
  };
}

// --- Basket (OPERATIONS.md §3 "Buying") — see basket_items' own SCHEMA
// comment for why this is one company-wide basket, not per depot group. ---

export interface BasketItem {
  id: number;
  depotGroupId: number;
  depotId: number;
  modelId: string;
  lengthM: number;
  variantLabel: string | null;
  powerType: "diesel" | "electric" | "hybrid" | "hydrogen";
  liveryId: number | null;
  manufacturer: string;
  quantity: number;
  unitPriceGBP: number;
  paymentMethod: "buy_outright" | "lease" | "lease_to_own";
  isUsed: boolean;
  usedCondition: number | null;
  // Which route this line is being bought for (T153, confirmed
  // 2026-11-07) — carried through basket -> order -> the real vehicle,
  // recorded for reference only (see Vehicle.boughtForRouteId).
  boughtForRouteId: number | null;
  // Whether GreenRoad is selected (schema v68->v69) — see the vehicles
  // table's own SCHEMA comment; carried through basket -> order -> the
  // real vehicle, same as boughtForRouteId above.
  greenroadFitted: boolean;
}

interface BasketItemRow {
  id: number;
  depot_group_id: number;
  depot_id: number;
  model_id: string;
  length_m: number;
  variant_label: string | null;
  power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
  livery_id: number | null;
  manufacturer: string;
  quantity: number;
  unit_price_gbp: number;
  payment_method: "buy_outright" | "lease" | "lease_to_own";
  is_used: number;
  used_condition: number | null;
  bought_for_route_id: number | null;
  greenroad_fitted: number;
}

function basketItemFromRow(r: BasketItemRow): BasketItem {
  return {
    id: r.id,
    depotGroupId: r.depot_group_id,
    depotId: r.depot_id,
    modelId: r.model_id,
    lengthM: r.length_m,
    variantLabel: r.variant_label,
    powerType: r.power_type,
    liveryId: r.livery_id,
    manufacturer: r.manufacturer,
    quantity: r.quantity,
    unitPriceGBP: r.unit_price_gbp,
    paymentMethod: r.payment_method,
    isUsed: !!r.is_used,
    usedCondition: r.used_condition,
    boughtForRouteId: r.bought_for_route_id,
    greenroadFitted: !!r.greenroad_fitted,
  };
}

export function addBasketItem(
  db: SaveDb,
  depotGroupId: number,
  depotId: number,
  modelId: string,
  lengthM: number,
  variantLabel: string | null,
  powerType: "diesel" | "electric" | "hybrid" | "hydrogen",
  liveryId: number | null,
  manufacturer: string,
  quantity: number,
  unitPriceGBP: number,
  paymentMethod: "buy_outright" | "lease" | "lease_to_own",
  isUsed: boolean,
  usedCondition: number | null,
  boughtForRouteId: number | null = null,
  // Whether GreenRoad is selected (schema v68->v69) — appended at the end,
  // default false, same "every existing call site keeps compiling"
  // reasoning as boughtForRouteId above.
  greenroadFitted: boolean = false,
): BasketItem {
  const result = db
    .prepare(
      `INSERT INTO basket_items
        (depot_group_id, depot_id, model_id, length_m, variant_label, power_type, livery_id, manufacturer, quantity, unit_price_gbp, payment_method, is_used, used_condition, bought_for_route_id, greenroad_fitted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(depotGroupId, depotId, modelId, lengthM, variantLabel, powerType, liveryId, manufacturer, quantity, unitPriceGBP, paymentMethod, isUsed ? 1 : 0, usedCondition, boughtForRouteId, greenroadFitted ? 1 : 0);
  return {
    id: Number(result.lastInsertRowid),
    depotGroupId,
    depotId,
    modelId,
    lengthM,
    variantLabel,
    powerType,
    liveryId,
    manufacturer,
    quantity,
    unitPriceGBP,
    paymentMethod,
    isUsed,
    usedCondition,
    boughtForRouteId,
    greenroadFitted,
  };
}

export function listBasket(db: SaveDb): BasketItem[] {
  const rows = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, livery_id, manufacturer, quantity, unit_price_gbp, payment_method, is_used, used_condition, bought_for_route_id, greenroad_fitted
       FROM basket_items ORDER BY id`,
    )
    .all() as unknown as BasketItemRow[];
  return rows.map(basketItemFromRow);
}

export function setBasketItemQuantity(db: SaveDb, basketItemId: number, quantity: number): void {
  if (quantity <= 0) {
    db.prepare("DELETE FROM basket_items WHERE id = ?").run(basketItemId);
    return;
  }
  db.prepare("UPDATE basket_items SET quantity = ? WHERE id = ?").run(quantity, basketItemId);
}

export function setBasketItemDepot(db: SaveDb, basketItemId: number, depotGroupId: number, depotId: number): void {
  db.prepare("UPDATE basket_items SET depot_group_id = ?, depot_id = ? WHERE id = ?").run(depotGroupId, depotId, basketItemId);
}

export function setBasketItemLivery(db: SaveDb, basketItemId: number, liveryId: number | null): void {
  db.prepare("UPDATE basket_items SET livery_id = ? WHERE id = ?").run(liveryId, basketItemId);
}

export function removeBasketItem(db: SaveDb, basketItemId: number): void {
  db.prepare("DELETE FROM basket_items WHERE id = ?").run(basketItemId);
}

// Converts the whole basket into vehicle_orders (one row per vehicle, a
// basket line's own quantity expanded out) and empties the basket.
// Returns the number of orders created.
export function placeOrder(db: SaveDb): number {
  const items = listBasket(db);
  const orderedAt = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO vehicle_orders
      (depot_group_id, depot_id, model_id, length_m, variant_label, power_type, livery_id, unit_price_gbp, payment_method, is_used, used_condition, ordered_at, bought_for_route_id, greenroad_fitted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let count = 0;
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      insert.run(
        item.depotGroupId,
        item.depotId,
        item.modelId,
        item.lengthM,
        item.variantLabel,
        item.powerType,
        item.liveryId,
        item.unitPriceGBP,
        item.paymentMethod,
        item.isUsed ? 1 : 0,
        item.usedCondition,
        orderedAt,
        item.boughtForRouteId,
        item.greenroadFitted ? 1 : 0,
      );
      count++;
    }
  }
  db.prepare("DELETE FROM basket_items").run();
  return count;
}

// --- Orders awaiting collection (OPERATIONS.md §3 "Delivery and
// transfers") — see vehicle_orders' own SCHEMA comment for the
// deliberate "immediately available to collect" simplification. ---

export interface VehicleOrder {
  id: number;
  depotGroupId: number;
  depotId: number;
  modelId: string;
  lengthM: number;
  variantLabel: string | null;
  powerType: "diesel" | "electric" | "hybrid" | "hydrogen";
  liveryId: number | null;
  unitPriceGBP: number;
  paymentMethod: "buy_outright" | "lease" | "lease_to_own";
  isUsed: boolean;
  usedCondition: number | null;
  orderedAt: string;
  boughtForRouteId: number | null;
  greenroadFitted: boolean;
}

interface VehicleOrderRow {
  id: number;
  depot_group_id: number;
  depot_id: number;
  model_id: string;
  length_m: number;
  variant_label: string | null;
  power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
  livery_id: number | null;
  unit_price_gbp: number;
  payment_method: "buy_outright" | "lease" | "lease_to_own";
  is_used: number;
  used_condition: number | null;
  ordered_at: string;
  bought_for_route_id: number | null;
  greenroad_fitted: number;
}

function vehicleOrderFromRow(r: VehicleOrderRow): VehicleOrder {
  return {
    id: r.id,
    depotGroupId: r.depot_group_id,
    depotId: r.depot_id,
    modelId: r.model_id,
    lengthM: r.length_m,
    variantLabel: r.variant_label,
    powerType: r.power_type,
    liveryId: r.livery_id,
    unitPriceGBP: r.unit_price_gbp,
    paymentMethod: r.payment_method,
    isUsed: !!r.is_used,
    usedCondition: r.used_condition,
    orderedAt: r.ordered_at,
    boughtForRouteId: r.bought_for_route_id,
    greenroadFitted: !!r.greenroad_fitted,
  };
}

export function listOrders(db: SaveDb): VehicleOrder[] {
  const rows = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, livery_id, unit_price_gbp, payment_method, is_used, used_condition, ordered_at, bought_for_route_id, greenroad_fitted
       FROM vehicle_orders ORDER BY ordered_at`,
    )
    .all() as unknown as VehicleOrderRow[];
  return rows.map(vehicleOrderFromRow);
}

// Finalises an order into a real owned vehicle (same fleet-number/plate
// issuance as buyVehicle, since mechanically this IS the delayed half of
// that same purchase) and removes the order. Used for both the
// Deliveries screen's "Collect" and "Dealer delivers" buttons — the real
// difference between the two (time/cost) depends on the driver-
// availability and finance systems noted in vehicle_orders' own SCHEMA
// comment, neither of which exists yet.
export function collectOrder(db: SaveDb, orderId: number): Vehicle {
  const order = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, livery_id, unit_price_gbp, payment_method, is_used, used_condition, ordered_at, bought_for_route_id, greenroad_fitted
       FROM vehicle_orders WHERE id = ?`,
    )
    .get(orderId) as VehicleOrderRow | undefined;
  if (!order) throw new Error(`collectOrder: order ${orderId} not found`);
  const vehicle = buyVehicle(
    db,
    order.depot_group_id,
    order.depot_id,
    order.model_id,
    order.length_m,
    order.variant_label,
    order.power_type,
    order.unit_price_gbp,
    order.livery_id,
    order.is_used ? order.used_condition : null,
    order.bought_for_route_id,
    // T185: the real gap this fixes — order.payment_method was already
    // read above (it's part of VehicleOrderRow) but never passed to
    // buyVehicle until now, so every collected order silently became a
    // buy_outright vehicle regardless of what was actually ordered.
    order.payment_method,
    !!order.greenroad_fitted,
  );
  db.prepare("DELETE FROM vehicle_orders WHERE id = ?").run(orderId);
  maybeAutoHireDriverForPrivateHire(db, vehicle);
  return vehicle;
}

// T183 (private hire revival, Q20/OPEN-ITEMS.md, confirmed 2026-11-13):
// buying/liverying a vehicle Lothian Coaches on an eligible class (coach
// or the EVM Cityline "Sprinter" — liveryVehicleLockReason, livery-seed-
// data.mts, already enforces that no other vehicle can ever carry this
// livery) IS the "this is now a private-hire vehicle" designation, same
// as the renderer's own reasoning — no separate boolean column on
// vehicles at all. The moment such an order is COLLECTED into a real
// owned vehicle (this function's only caller) mirrors how T179's
// re-power/transfer flows hook this same collect moment, and is the
// right moment to auto-hire its driver too: "the commercial team do
// everything" is the whole premise of this feature, confirmed directly
// with the user. A vehicle bought with any other livery is left alone
// entirely — a plain no-op for every ordinary purchase.
function maybeAutoHireDriverForPrivateHire(db: SaveDb, vehicle: Vehicle): void {
  if (vehicle.liveryId === null) return;
  const livery = db.prepare("SELECT name FROM liveries WHERE id = ?").get(vehicle.liveryId) as { name: string } | undefined;
  if (!livery || livery.name !== "Lothian Coaches") return;
  const driver = createDriver(db, vehicle.depotGroupId, vehicle.depotId, randomDriverName(), "trainee");
  setDriverPrivateHireVehicleId(db, driver.id, vehicle.id);
}

// --- Private hire income tracking (private_hire_income_months' own SCHEMA
// comment above; T183) — plain storage only, the actual month math and
// booking generation is all in the renderer's pure private-hire-income.mts
// module (testable on its own, same convention as fare-pricing.mts etc.);
// this is just "which months has this vehicle already had generated" so a
// re-open of the Depot groups panel never double-generates.
export function listGeneratedPrivateHireMonths(db: SaveDb, vehicleId: number): string[] {
  const rows = db.prepare("SELECT month_key FROM private_hire_income_months WHERE vehicle_id = ?").all(vehicleId) as { month_key: string }[];
  return rows.map((r) => r.month_key);
}

// INSERT OR IGNORE since the PRIMARY KEY is (vehicle_id, month_key) — a
// re-entrant call with a month already recorded is a safe no-op, not an
// error, same defensive spirit as this whole feature's "never double-
// generate" design.
export function recordGeneratedPrivateHireMonths(db: SaveDb, vehicleId: number, monthKeys: string[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO private_hire_income_months (vehicle_id, month_key) VALUES (?, ?)");
  for (const monthKey of monthKeys) stmt.run(vehicleId, monthKey);
}

// --- Lease billing tracking (lease_billing_months' own SCHEMA comment
// above; T185, follow-up to T184) — plain storage only, identical shape
// and purpose to the private-hire tracking immediately above: which
// months have already had their real monthly lease payment charged for
// a given vehicle, so a re-open of the Fleet screen never double-charges
// the same month. The real month math/charge calculation is all in the
// renderer's pure vehicle-lease-billing.mts.
export function listGeneratedLeaseBillingMonths(db: SaveDb, vehicleId: number): string[] {
  const rows = db.prepare("SELECT month_key FROM lease_billing_months WHERE vehicle_id = ?").all(vehicleId) as { month_key: string }[];
  return rows.map((r) => r.month_key);
}

// INSERT OR IGNORE, same idempotent-storage convention as
// recordGeneratedPrivateHireMonths — a re-entrant call with a month
// already recorded is a safe no-op. flipToOutright additionally flips
// the vehicle's own payment_method to buy_outright, in the same call as
// recording the final chargeable month — the real lease-to-own term
// completion (OPERATIONS.md §3 "then ownership"), landed alongside the
// billing-month write rather than as a separate round-trip from the
// renderer that could land only one half if it were ever split.
export function recordLeaseBillingMonths(db: SaveDb, vehicleId: number, monthKeys: string[], flipToOutright: boolean): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO lease_billing_months (vehicle_id, month_key) VALUES (?, ?)");
  for (const monthKey of monthKeys) stmt.run(vehicleId, monthKey);
  if (flipToOutright) {
    db.prepare("UPDATE vehicles SET payment_method = 'buy_outright' WHERE id = ?").run(vehicleId);
  }
}

// --- GreenRoad billing tracking (greenroad_billing_months' own SCHEMA
// comment above; user request 2026-11-20) — plain storage only, identical
// shape/purpose to the lease-billing tracking immediately above: which
// months have already had their real GreenRoad charge billed for a given
// vehicle, so a re-open of the Fleet screen never double-charges the same
// month. The real month math/charge-amount calculation (days-in-month x
// 10p, not a flat figure) is all in the renderer's pure greenroad-
// billing.mts.
export function listGeneratedGreenroadBillingMonths(db: SaveDb, vehicleId: number): string[] {
  const rows = db.prepare("SELECT month_key FROM greenroad_billing_months WHERE vehicle_id = ?").all(vehicleId) as { month_key: string }[];
  return rows.map((r) => r.month_key);
}

export function recordGreenroadBillingMonths(db: SaveDb, vehicleId: number, monthKeys: string[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO greenroad_billing_months (vehicle_id, month_key) VALUES (?, ?)");
  for (const monthKey of monthKeys) stmt.run(vehicleId, monthKey);
}

// --- GreenRoad retrofit bookings (greenroad_retrofit_bookings' own SCHEMA
// comment above; user request 2026-11-20) — the £350 fee itself is
// charged by the renderer (fleet-list-panel.ts) in the same call as
// this create, same "pure storage here, finance orchestration in the
// renderer" split as every other paid booking in this file.
export interface GreenroadRetrofitBooking {
  id: number;
  vehicleId: number;
  depotId: number;
  depotGroupId: number;
  bookedGameDay: number;
  readyGameDay: number;
}

// readyGameDay is computed by the CALLER (fleet-list-panel.ts, using the
// renderer's own pure greenroad-retrofit-scheduling.mts) and passed in
// rather than derived here — the real 14-day-lead-time-plus-nightly-
// capacity-per-depot-group math needs to see every other currently
// pending booking in the same depot group, which this plain storage
// function has no reason to know about (same "pure logic in the
// renderer, dumb storage here" split as every other paid booking).
export function createGreenroadRetrofitBooking(
  db: SaveDb,
  vehicleId: number,
  depotId: number,
  depotGroupId: number,
  bookedGameDay: number,
  readyGameDay: number,
): GreenroadRetrofitBooking {
  const result = db
    .prepare("INSERT INTO greenroad_retrofit_bookings (vehicle_id, depot_id, depot_group_id, booked_game_day, ready_game_day) VALUES (?, ?, ?, ?, ?)")
    .run(vehicleId, depotId, depotGroupId, bookedGameDay, readyGameDay);
  return { id: Number(result.lastInsertRowid), vehicleId, depotId, depotGroupId, bookedGameDay, readyGameDay };
}

export function listAllGreenroadRetrofitBookings(db: SaveDb): GreenroadRetrofitBooking[] {
  const rows = db.prepare("SELECT id, vehicle_id, depot_id, depot_group_id, booked_game_day, ready_game_day FROM greenroad_retrofit_bookings ORDER BY booked_game_day").all() as {
    id: number;
    vehicle_id: number;
    depot_id: number;
    depot_group_id: number;
    booked_game_day: number;
    ready_game_day: number;
  }[];
  return rows.map((r) => ({ id: r.id, vehicleId: r.vehicle_id, depotId: r.depot_id, depotGroupId: r.depot_group_id, bookedGameDay: r.booked_game_day, readyGameDay: r.ready_game_day }));
}

// Fits GreenRoad onto the booking's own vehicle (greenroad_fitted = 1),
// marks the one-way company-wide adoption flag (the first-ever retrofit
// counts as "starting to be installed," same as a fresh purchase does in
// buyVehicle), removes the booking, and returns the updated vehicle —
// same "collect, then gone" shape as collectRepowerBooking.
export function collectGreenroadRetrofitBooking(db: SaveDb, id: number): Vehicle {
  const booking = db.prepare("SELECT vehicle_id FROM greenroad_retrofit_bookings WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!booking) throw new Error(`collectGreenroadRetrofitBooking: no booking with id ${id}`);
  db.prepare("UPDATE vehicles SET greenroad_fitted = 1 WHERE id = ?").run(booking.vehicle_id);
  markGreenroadAdopted(db);
  db.prepare("DELETE FROM greenroad_retrofit_bookings WHERE id = ?").run(id);
  const row = db
    .prepare(
      `SELECT id, depot_group_id, depot_id, model_id, length_m, variant_label, power_type, fleet_number, plate, condition, purchase_price_gbp, bought_at, bought_game_day, livery_id, bought_for_route_id, payment_method, greenroad_fitted
       FROM vehicles WHERE id = ?`,
    )
    .get(booking.vehicle_id) as {
    id: number;
    depot_group_id: number;
    depot_id: number;
    model_id: string;
    length_m: number;
    variant_label: string | null;
    power_type: "diesel" | "electric" | "hybrid" | "hydrogen";
    fleet_number: string;
    plate: string;
    condition: number;
    purchase_price_gbp: number;
    bought_at: string;
    bought_game_day: number;
    livery_id: number | null;
    bought_for_route_id: number | null;
    payment_method: "buy_outright" | "lease" | "lease_to_own";
    greenroad_fitted: number;
  };
  return {
    id: row.id,
    depotGroupId: row.depot_group_id,
    depotId: row.depot_id,
    modelId: row.model_id,
    lengthM: row.length_m,
    variantLabel: row.variant_label,
    powerType: row.power_type,
    fleetNumber: row.fleet_number,
    plate: row.plate,
    condition: row.condition,
    purchasePriceGBP: row.purchase_price_gbp,
    boughtAt: row.bought_at,
    boughtGameDay: row.bought_game_day,
    liveryId: row.livery_id,
    boughtForRouteId: row.bought_for_route_id,
    paymentMethod: row.payment_method,
    greenroadFitted: !!row.greenroad_fitted,
  };
}

// --- Fare zones (DESIGN.md §9) — see fare_zones' own SCHEMA comment above
// for why this is geometry-only (no pricing) and per depot group.
export interface FareZonePoint {
  lon: number;
  lat: number;
}

export type FareZoneType = "city" | "country" | "island" | "town";

export interface FareZone {
  id: number;
  depotGroupId: number;
  name: string;
  zoneType: FareZoneType;
  points: FareZonePoint[];
  colour: string;
  parentZoneId: number | null;
}

interface FareZoneRow {
  id: number;
  depot_group_id: number;
  name: string;
  zone_type: FareZoneType;
  points: string;
  colour: string;
  parent_zone_id: number | null;
}

function fareZoneFromRow(row: FareZoneRow): FareZone {
  return {
    id: row.id,
    depotGroupId: row.depot_group_id,
    name: row.name,
    zoneType: row.zone_type,
    points: JSON.parse(row.points) as FareZonePoint[],
    colour: row.colour,
    parentZoneId: row.parent_zone_id,
  };
}

// Plain UI default, not real data — matches the colour the map used before
// per-zone colour existed, so an existing zone looks the same until the
// player changes it.
const DEFAULT_ZONE_COLOUR_BY_TYPE: Record<FareZoneType, string> = {
  city: "#3b82f6",
  country: "#22c55e",
  island: "#f59e0b",
  town: "#a855f7",
};

// Plain ray-casting point-in-polygon test (odd-even rule) — mirrors
// fare-zone-drawing.ts's own `pointInRing`, duplicated here rather than
// shared since the renderer and the Electron main process are separate
// bundles with no shared module between them (same reason the renderer's
// own hole-cutting containment check isn't reused here either).
function pointInFareZoneRing(point: FareZonePoint, ring: FareZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersects = a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Whether two zones' polygons overlap at all — an approximate/practical
// test (any vertex of one sitting inside the other), the same standard
// this project already accepted for the existing hole-cutting containment
// check (fare-zone-drawing.ts's own `fullyContains`: "doesn't also check
// that none of the edges cross... good enough"), not a full edge-
// intersection test.
function fareZonesOverlap(a: FareZone | { points: FareZonePoint[] }, b: FareZone): boolean {
  return a.points.some((p) => pointInFareZoneRing(p, b.points)) || b.points.some((p) => pointInFareZoneRing(p, a.points));
}

// Confirmed 2026-10-31 (live user design discussion, T107): an Island
// zone can never share land with a City or Country zone — any "urban
// area on an island" need is served by a Town zone nested inside the
// Island zone instead (not yet built — T107 again), not a separate City
// zone. Geometric, not per-depot-group: Arran (an Island zone) still
// coexists fine with Glasgow's own City zones, since they cover
// different land entirely.
function assertNoIslandCityCountryOverlap(db: SaveDb, depotGroupId: number, zoneType: FareZoneType, points: FareZonePoint[], excludeZoneId?: number): void {
  const others = listFareZonesForDepotGroup(db, depotGroupId).filter((z) => z.id !== excludeZoneId);
  const candidate = { points };
  if (zoneType === "island") {
    const clashing = others.find((z) => (z.zoneType === "city" || z.zoneType === "country") && fareZonesOverlap(candidate, z));
    if (clashing) throw new Error(`createFareZone: an Island zone can't overlap "${clashing.name}" (a ${clashing.zoneType} zone)`);
  } else if (zoneType === "city" || zoneType === "country") {
    const clashing = others.find((z) => z.zoneType === "island" && fareZonesOverlap(candidate, z));
    if (clashing) throw new Error(`createFareZone: a ${zoneType} zone can't overlap "${clashing.name}" (an Island zone)`);
  }
}

// Town zones (T107, relaxed 2026-11-01): must have exactly one declared
// parent, which must be a real Country or Island zone in the SAME depot
// group, and must geometrically OVERLAP it — full containment was the
// original rule, but a live user report with a real example (a town
// straddling the boundary between two zones, e.g. partly in an Island
// zone and partly over open water/another zone) showed that was too
// strict: "it should only have to be partially [within another zone]."
// The declared parent still exists (for the town's own name/colour
// grouping, and as the baseline fare a wholly-inside trip uses) — it just
// no longer has to contain the whole shape. When a town's own area
// genuinely spans two zones of different prices, DESIGN.md §9 now
// documents the resolved rule (more expensive of the two wins, compared
// per fare type) — not yet wired into any actual journey-fare
// calculation, since that doesn't exist yet (RAPTOR/Phase 4), the same
// "confirmed rule, not yet actionable" treatment this file already gives
// other phase-gated rules (e.g. T107's own ferry-operator payout). A
// non-town zone must never carry a parent at all (defensive — nothing in
// this codebase currently lets that happen, but a null parentZoneId is
// the only sane state for city/country/island).
function assertValidTownParent(db: SaveDb, depotGroupId: number, zoneType: FareZoneType, points: FareZonePoint[], parentZoneId: number | null, excludeZoneId?: number): void {
  if (zoneType !== "town") {
    if (parentZoneId !== null) throw new Error("createFareZone: only a town zone can have a parent zone");
    return;
  }
  if (parentZoneId === null) throw new Error("createFareZone: a town zone needs a parent Country or Island zone");
  if (parentZoneId === excludeZoneId) throw new Error("createFareZone: a town zone can't be its own parent");
  const parent = listFareZonesForDepotGroup(db, depotGroupId).find((z) => z.id === parentZoneId);
  if (!parent) throw new Error(`createFareZone: no zone ${parentZoneId} in this depot group to be the town's parent`);
  if (parent.zoneType !== "country" && parent.zoneType !== "island") {
    throw new Error(`createFareZone: a town's parent must be a Country or Island zone, not ${parent.zoneType}`);
  }
  if (!fareZonesOverlap({ points }, parent)) {
    throw new Error(`createFareZone: a town zone must at least partially overlap its parent "${parent.name}"`);
  }
}

export function createFareZone(
  db: SaveDb,
  depotGroupId: number,
  name: string,
  zoneType: FareZoneType,
  points: FareZonePoint[],
  colour: string = DEFAULT_ZONE_COLOUR_BY_TYPE[zoneType],
  parentZoneId: number | null = null,
): FareZone {
  if (points.length < 3) throw new Error("createFareZone: a zone needs at least 3 points");
  if (!HEX_COLOUR.test(colour)) throw new Error("createFareZone: colour must be #rrggbb");
  assertNoIslandCityCountryOverlap(db, depotGroupId, zoneType, points);
  assertValidTownParent(db, depotGroupId, zoneType, points, parentZoneId);
  const result = db
    .prepare("INSERT INTO fare_zones (depot_group_id, name, zone_type, points, colour, parent_zone_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(depotGroupId, name, zoneType, JSON.stringify(points), colour, parentZoneId);
  return { id: Number(result.lastInsertRowid), depotGroupId, name, zoneType, points, colour, parentZoneId };
}

export function listFareZonesForDepotGroup(db: SaveDb, depotGroupId: number): FareZone[] {
  const rows = db
    .prepare("SELECT id, depot_group_id, name, zone_type, points, colour, parent_zone_id FROM fare_zones WHERE depot_group_id = ? ORDER BY id")
    .all(depotGroupId) as unknown as FareZoneRow[];
  return rows.map(fareZoneFromRow);
}

// Across every depot group — used for cross-zone snapping while drawing
// (DESIGN.md §9's zone map is meant to tile edge-to-edge, including between
// two different depot groups' own zones, which still share the same map).
export function listAllFareZones(db: SaveDb): FareZone[] {
  const rows = db
    .prepare("SELECT id, depot_group_id, name, zone_type, points, colour, parent_zone_id FROM fare_zones ORDER BY id")
    .all() as unknown as FareZoneRow[];
  return rows.map(fareZoneFromRow);
}

export function renameFareZone(db: SaveDb, zoneId: number, name: string): void {
  db.prepare("UPDATE fare_zones SET name = ? WHERE id = ?").run(name, zoneId);
}

// `parentZoneId` is required when retyping TO "town" and ignored (forced to
// NULL) for every other type — a zone that stops being a town stops having
// a parent, regardless of what's passed.
export function setFareZoneType(db: SaveDb, zoneId: number, zoneType: FareZoneType, parentZoneId: number | null = null): void {
  const zone = (
    db.prepare("SELECT id, depot_group_id, name, zone_type, points, colour, parent_zone_id FROM fare_zones WHERE id = ?").get(zoneId) as unknown as
      | FareZoneRow
      | undefined
  );
  if (!zone) throw new Error(`setFareZoneType: no zone with id ${zoneId}`);
  const points = JSON.parse(zone.points) as FareZonePoint[];
  assertNoIslandCityCountryOverlap(db, zone.depot_group_id, zoneType, points, zoneId);
  const resolvedParentId = zoneType === "town" ? parentZoneId : null;
  assertValidTownParent(db, zone.depot_group_id, zoneType, points, resolvedParentId, zoneId);
  db.prepare("UPDATE fare_zones SET zone_type = ?, parent_zone_id = ? WHERE id = ?").run(zoneType, resolvedParentId, zoneId);
}

export function setFareZoneColour(db: SaveDb, zoneId: number, colour: string): void {
  if (!HEX_COLOUR.test(colour)) throw new Error("setFareZoneColour: colour must be #rrggbb");
  db.prepare("UPDATE fare_zones SET colour = ? WHERE id = ?").run(colour, zoneId);
}

// Merging one zone into another (live user request, 2026-11-01: "how do i
// merge zones into another, there is no way of doing this"). Confirmed via
// AskUserQuestion before building, since getting this wrong risks real
// geometry corruption: properly combining two polygons into one new outer
// boundary ("union") is real geometry work this project has no library
// for, and could produce a broken/self-intersecting shape — the user's
// own choice was to NOT attempt that. This instead keeps both polygons
// exactly as drawn and just relabels the source zone to match the
// target's own name/type/colour, so the two shapes read as one merged
// zone (same name, same colour, same type) without computing any new
// boundary at all. The source zone's own row survives (never deleted),
// so anything still referencing its id (a town's own parentZoneId) keeps
// working — same reasoning parent_route_id's "clear the link, keep the
// child" precedent follows elsewhere in this file, just with nothing
// even needing to be cleared here. Town zones are excluded on either
// side — a town's own containment/parent rules make a plain relabel the
// wrong operation for it; merging Towns isn't what was asked for.
export function mergeFareZone(db: SaveDb, sourceZoneId: number, targetZoneId: number): void {
  if (sourceZoneId === targetZoneId) throw new Error("mergeFareZone: can't merge a zone into itself");
  const row = db.prepare("SELECT id, depot_group_id, name, zone_type, points, colour, parent_zone_id FROM fare_zones WHERE id = ?");
  const source = row.get(sourceZoneId) as unknown as FareZoneRow | undefined;
  const target = row.get(targetZoneId) as unknown as FareZoneRow | undefined;
  if (!source) throw new Error(`mergeFareZone: no zone with id ${sourceZoneId}`);
  if (!target) throw new Error(`mergeFareZone: no zone with id ${targetZoneId}`);
  if (source.depot_group_id !== target.depot_group_id) throw new Error("mergeFareZone: both zones must be in the same depot group");
  if (source.zone_type === "town" || target.zone_type === "town") throw new Error("mergeFareZone: a town zone can't be merged this way");
  const points = JSON.parse(source.points) as FareZonePoint[];
  assertNoIslandCityCountryOverlap(db, source.depot_group_id, target.zone_type as FareZoneType, points, sourceZoneId);
  db.prepare("UPDATE fare_zones SET name = ?, zone_type = ?, colour = ? WHERE id = ?").run(target.name, target.zone_type, target.colour, sourceZoneId);
}

// A town zone makes no sense once its parent is gone (its own fares are
// entirely computed from the parent's figures — T107), so deleting a
// Country/Island zone cascades to its own towns, unlike parent_route_id's
// "clear the link, keep the child" precedent elsewhere in this file. No FK
// ON DELETE CASCADE in SQLite here, so this is explicit.
export function deleteFareZone(db: SaveDb, zoneId: number): void {
  const children = db.prepare("SELECT id FROM fare_zones WHERE parent_zone_id = ?").all(zoneId) as unknown as { id: number }[];
  for (const child of children) deleteFareZone(db, child.id);
  db.prepare("DELETE FROM fare_zones WHERE id = ?").run(zoneId);
}

// --- Fare pricing config (DESIGN.md §9, Phase 4 increment 2b) — see
// fare_configs' own SCHEMA comment above for why every field is nullable
// and amounts are stored in pence. Field order here matches the SCHEMA's
// own column order.
// Reworked 2026-10-31 (live user design discussion) — see fare_configs'
// own SCHEMA comment for the full reasoning: Airport Express replaces
// "special service" with its own Single/Return; NETWORK has no price
// fields of its own at all any more, only networkMarkupPercent (the
// actual prices are computed from the Combined ones — fare-pricing.mts's
// networkFareGBPPence); sightseeing gained its own two prices. Reworked
// again the same day: `runsNightServices` is no longer stored here at all
// — route types (routes.route_type) now drive whether a depot group
// "runs night services" (it does iff it has any route with
// route_type = 'night'), so there's nothing left to toggle manually;
// callers that need this check `listRoutes` themselves (see
// fare-pricing-panel.ts's fareRequirements()), the same way Airport
// Express/Sightseeing/Long-distance gating now works too.
export interface FareConfig {
  depotGroupId: number;
  citySingleGBPPence: number | null;
  beyondDepotGroupPerMileGBPPence: number | null;
  longDistanceBaseGBPPence: number | null;
  longDistancePerMileGBPPence: number | null;
  airportExpressSingleGBPPence: number | null;
  airportExpressReturnGBPPence: number | null;
  nightExtraBaseGBPPence: number | null;
  nightExtraPerZoneGBPPence: number | null;
  lateGBPPence: number | null;
  networkMarkupPercent: number | null;
  sightseeingDayGBPPence: number | null;
  sightseeingSingleGBPPence: number | null;
  cityDayGBPPence: number | null;
  cityWeeklyGBPPence: number | null;
  countryDayGBPPence: number | null;
  countryWeeklyGBPPence: number | null;
  combinedDayGBPPence: number | null;
  combinedWeeklyGBPPence: number | null;
  islandDayGBPPence: number | null;
  islandWeeklyGBPPence: number | null;
  islandLateGBPPence: number | null;
}

// Maps every nullable-number FareConfig field to its own column — used by
// both the row-to-object reader and the dynamic partial-update writer
// below, so the two can never silently drift apart.
const FARE_CONFIG_COLUMNS: Record<Exclude<keyof FareConfig, "depotGroupId">, string> = {
  citySingleGBPPence: "city_single_gbp_pence",
  beyondDepotGroupPerMileGBPPence: "beyond_depot_group_per_mile_gbp_pence",
  longDistanceBaseGBPPence: "long_distance_base_gbp_pence",
  longDistancePerMileGBPPence: "long_distance_per_mile_gbp_pence",
  airportExpressSingleGBPPence: "airport_express_single_gbp_pence",
  airportExpressReturnGBPPence: "airport_express_return_gbp_pence",
  nightExtraBaseGBPPence: "night_extra_base_gbp_pence",
  nightExtraPerZoneGBPPence: "night_extra_per_zone_gbp_pence",
  lateGBPPence: "late_gbp_pence",
  networkMarkupPercent: "network_markup_percent",
  sightseeingDayGBPPence: "sightseeing_day_gbp_pence",
  sightseeingSingleGBPPence: "sightseeing_single_gbp_pence",
  cityDayGBPPence: "city_day_gbp_pence",
  cityWeeklyGBPPence: "city_weekly_gbp_pence",
  countryDayGBPPence: "country_day_gbp_pence",
  countryWeeklyGBPPence: "country_weekly_gbp_pence",
  combinedDayGBPPence: "combined_day_gbp_pence",
  combinedWeeklyGBPPence: "combined_weekly_gbp_pence",
  islandDayGBPPence: "island_day_gbp_pence",
  islandWeeklyGBPPence: "island_weekly_gbp_pence",
  islandLateGBPPence: "island_late_gbp_pence",
};

function emptyFareConfig(depotGroupId: number): FareConfig {
  const config = { depotGroupId } as FareConfig;
  for (const key of Object.keys(FARE_CONFIG_COLUMNS) as (keyof typeof FARE_CONFIG_COLUMNS)[]) {
    config[key] = null;
  }
  return config;
}

// Always returns a fully-shaped FareConfig, even if the depot group has no
// row at all yet (every field null, same as a row that exists but is
// entirely unset) — callers never need to handle "no config exists" as a
// separate case from "config exists but nothing in it is set yet".
export function getFareConfig(db: SaveDb, depotGroupId: number): FareConfig {
  const columns = Object.values(FARE_CONFIG_COLUMNS);
  const row = db.prepare(`SELECT ${columns.join(", ")} FROM fare_configs WHERE depot_group_id = ?`).get(depotGroupId) as
    | Record<string, number | null>
    | undefined;
  if (!row) return emptyFareConfig(depotGroupId);
  const config = { depotGroupId } as FareConfig;
  for (const [key, column] of Object.entries(FARE_CONFIG_COLUMNS)) {
    config[key as keyof typeof FARE_CONFIG_COLUMNS] = row[column];
  }
  return config;
}

// Merges only the given fields — the player fills these in one at a time
// (fare_configs' own SCHEMA comment), so this is never a full-row
// replacement. `INSERT ... ON CONFLICT DO UPDATE` with only the touched
// columns in the UPDATE clause, since every other column must keep
// whatever it already held (plain `INSERT OR REPLACE` would null them
// out). A no-op (empty `fields`) still ensures a row exists, for a depot
// group that's never been configured at all.
export function setFareConfigFields(db: SaveDb, depotGroupId: number, fields: Partial<Omit<FareConfig, "depotGroupId">>): void {
  const entries = Object.entries(fields) as [keyof typeof FARE_CONFIG_COLUMNS, number | null][];
  db.prepare("INSERT INTO fare_configs (depot_group_id) VALUES (?) ON CONFLICT(depot_group_id) DO NOTHING").run(depotGroupId);
  for (const [key, value] of entries) {
    const column = FARE_CONFIG_COLUMNS[key];
    db.prepare(`UPDATE fare_configs SET ${column} = ? WHERE depot_group_id = ?`).run(value, depotGroupId);
  }
}

// Whether a depot group has at least one route of the given type — the
// real source of truth for the fare panel's Night/Sightseeing/Airport
// Express/Long-distance gating (route types, 2026-10-31), replacing the
// old manual `runsNightServices` toggle entirely. Exposed as its own
// function (not folded into getFareConfig) since it reads `routes`, not
// `fare_configs` — a genuinely different table, kept visibly separate
// rather than silently blended into one "config" object.
export function depotGroupHasRouteType(db: SaveDb, depotGroupId: number, routeType: RouteType): boolean {
  const row = db
    .prepare("SELECT 1 FROM routes WHERE depot_group_id = ? AND route_type = ? LIMIT 1")
    .get(depotGroupId, routeType);
  return row !== undefined;
}

// --- Country-zone single-fare bands (fare_country_zone_bands' own SCHEMA
// comment above) ---
export interface CountryZoneBand {
  zoneCount: number;
  priceGBPPence: number;
}

export function setCountryZoneBand(db: SaveDb, depotGroupId: number, zoneCount: number, priceGBPPence: number): void {
  if (zoneCount <= 0) throw new Error("setCountryZoneBand: zoneCount must be > 0");
  db.prepare(
    `INSERT INTO fare_country_zone_bands (depot_group_id, zone_count, price_gbp_pence) VALUES (?, ?, ?)
     ON CONFLICT(depot_group_id, zone_count) DO UPDATE SET price_gbp_pence = excluded.price_gbp_pence`,
  ).run(depotGroupId, zoneCount, priceGBPPence);
}

export function deleteCountryZoneBand(db: SaveDb, depotGroupId: number, zoneCount: number): void {
  db.prepare("DELETE FROM fare_country_zone_bands WHERE depot_group_id = ? AND zone_count = ?").run(depotGroupId, zoneCount);
}

export function listCountryZoneBands(db: SaveDb, depotGroupId: number): CountryZoneBand[] {
  const rows = db
    .prepare("SELECT zone_count, price_gbp_pence FROM fare_country_zone_bands WHERE depot_group_id = ? ORDER BY zone_count")
    .all(depotGroupId) as unknown as { zone_count: number; price_gbp_pence: number }[];
  return rows.map((r) => ({ zoneCount: r.zone_count, priceGBPPence: r.price_gbp_pence }));
}

// --- Island-zone single-fare bands (T107, same shape as the country-zone
// bands above — see fare_island_zone_bands' own SCHEMA comment for why
// it's a separate table rather than reused) ---
export interface IslandZoneBand {
  zoneCount: number;
  priceGBPPence: number;
}

export function setIslandZoneBand(db: SaveDb, depotGroupId: number, zoneCount: number, priceGBPPence: number): void {
  if (zoneCount <= 0) throw new Error("setIslandZoneBand: zoneCount must be > 0");
  db.prepare(
    `INSERT INTO fare_island_zone_bands (depot_group_id, zone_count, price_gbp_pence) VALUES (?, ?, ?)
     ON CONFLICT(depot_group_id, zone_count) DO UPDATE SET price_gbp_pence = excluded.price_gbp_pence`,
  ).run(depotGroupId, zoneCount, priceGBPPence);
}

export function deleteIslandZoneBand(db: SaveDb, depotGroupId: number, zoneCount: number): void {
  db.prepare("DELETE FROM fare_island_zone_bands WHERE depot_group_id = ? AND zone_count = ?").run(depotGroupId, zoneCount);
}

export function listIslandZoneBands(db: SaveDb, depotGroupId: number): IslandZoneBand[] {
  const rows = db
    .prepare("SELECT zone_count, price_gbp_pence FROM fare_island_zone_bands WHERE depot_group_id = ? ORDER BY zone_count")
    .all(depotGroupId) as unknown as { zone_count: number; price_gbp_pence: number }[];
  return rows.map((r) => ({ zoneCount: r.zone_count, priceGBPPence: r.price_gbp_pence }));
}

// --- Game clock (game_clock's own SCHEMA comment above; DESIGN.md §3) ---
export interface GameClock {
  accumulatedGameSeconds: number;
  speedMultiplier: 1 | 4 | 10 | 20 | 60;
  isPaused: boolean;
}

const DEFAULT_GAME_CLOCK: GameClock = { accumulatedGameSeconds: 0, speedMultiplier: 1, isPaused: false };

export function getGameClock(db: SaveDb): GameClock {
  const row = db.prepare("SELECT accumulated_game_seconds, speed_multiplier, is_paused FROM game_clock WHERE id = 1").get() as
    | { accumulated_game_seconds: number; speed_multiplier: number; is_paused: number }
    | undefined;
  if (!row) return DEFAULT_GAME_CLOCK;
  return {
    accumulatedGameSeconds: row.accumulated_game_seconds,
    speedMultiplier: row.speed_multiplier as GameClock["speedMultiplier"],
    isPaused: row.is_paused !== 0,
  };
}

// Always a full-row replace, never partial — unlike setFareConfigFields,
// every field here changes together as one atomic tick/pause/speed
// update from the clock engine (game-clock-engine.ts), not filled in by
// the player one field at a time.
export function setGameClock(db: SaveDb, clock: GameClock): void {
  db.prepare(
    `INSERT INTO game_clock (id, accumulated_game_seconds, speed_multiplier, is_paused) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET accumulated_game_seconds = excluded.accumulated_game_seconds, speed_multiplier = excluded.speed_multiplier, is_paused = excluded.is_paused`,
  ).run(clock.accumulatedGameSeconds, clock.speedMultiplier, clock.isPaused ? 1 : 0);
}

// --- Company-wide one-off upgrades (company_upgrades' own SCHEMA
// comment above; TICKETING.md §4) — same singleton-row pattern as
// game_clock just above, each flag set independently rather than as
// one full-row replace, since these are three unrelated one-off
// purchases the player makes separately, not one atomic update. ---
export interface CompanyUpgrades {
  hasUpgradableTicketApp: boolean;
  hasMobileAppLiveData: boolean;
  hasUpgradedAvlData: boolean;
  // One-way, never cleared once true (user request 2026-11-20) — see
  // company_upgrades' own SCHEMA comment above for the full reasoning.
  hasAdoptedGreenroad: boolean;
}

const DEFAULT_COMPANY_UPGRADES: CompanyUpgrades = { hasUpgradableTicketApp: false, hasMobileAppLiveData: false, hasUpgradedAvlData: false, hasAdoptedGreenroad: false };

export function getCompanyUpgrades(db: SaveDb): CompanyUpgrades {
  const row = db
    .prepare("SELECT has_upgradable_ticket_app, has_mobile_app_live_data, has_upgraded_avl_data, has_adopted_greenroad FROM company_upgrades WHERE id = 1")
    .get() as
    | { has_upgradable_ticket_app: number; has_mobile_app_live_data: number; has_upgraded_avl_data: number; has_adopted_greenroad: number }
    | undefined;
  if (!row) return DEFAULT_COMPANY_UPGRADES;
  return {
    hasUpgradableTicketApp: row.has_upgradable_ticket_app !== 0,
    hasMobileAppLiveData: row.has_mobile_app_live_data !== 0,
    hasUpgradedAvlData: row.has_upgraded_avl_data !== 0,
    hasAdoptedGreenroad: row.has_adopted_greenroad !== 0,
  };
}

function setCompanyUpgradeFlag(
  db: SaveDb,
  column: "has_upgradable_ticket_app" | "has_mobile_app_live_data" | "has_upgraded_avl_data" | "has_adopted_greenroad",
  value: boolean,
): void {
  db.prepare(
    `INSERT INTO company_upgrades (id, ${column}) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}`,
  ).run(value ? 1 : 0);
}

export function setHasUpgradableTicketApp(db: SaveDb, value: boolean): void {
  setCompanyUpgradeFlag(db, "has_upgradable_ticket_app", value);
}

export function setHasMobileAppLiveData(db: SaveDb, value: boolean): void {
  setCompanyUpgradeFlag(db, "has_mobile_app_live_data", value);
}

// One-way by construction — there's no "value: boolean" parameter, so
// nothing can ever set this back to false (user request 2026-11-20:
// once adopted, GreenRoad is permanent company policy). Called from
// buyVehicle (a new purchase arrives with it fitted) and from
// collectGreenroadRetrofitBooking (the first-ever retrofit also counts
// as "starting to be installed"). A safe no-op once already true.
export function markGreenroadAdopted(db: SaveDb): void {
  setCompanyUpgradeFlag(db, "has_adopted_greenroad", true);
}

export function setHasUpgradedAvlData(db: SaveDb, value: boolean): void {
  setCompanyUpgradeFlag(db, "has_upgraded_avl_data", value);
}

// --- Finance ledger (finance_transactions' own SCHEMA comment above;
// DESIGN.md §10 "Money"/"Finance screen") ---
export interface FinanceTransaction {
  id: number;
  amountGBPPence: number;
  category: string;
  depotGroupId: number | null;
  description: string;
  gameDay: number;
}

interface FinanceTransactionRow {
  id: number;
  amount_gbp_pence: number;
  category: string;
  depot_group_id: number | null;
  description: string;
  game_day: number;
}

function financeTransactionFromRow(row: FinanceTransactionRow): FinanceTransaction {
  return {
    id: row.id,
    amountGBPPence: row.amount_gbp_pence,
    category: row.category,
    depotGroupId: row.depot_group_id === null ? null : Number(row.depot_group_id),
    description: row.description,
    gameDay: row.game_day,
  };
}

// The running balance is always derived from the full transaction log
// (see finance_transactions' own SCHEMA comment above for why) — never
// a stored/cached figure.
export function getCompanyBalanceGBPPence(db: SaveDb): number {
  const row = db.prepare("SELECT COALESCE(SUM(amount_gbp_pence), 0) AS balance FROM finance_transactions").get() as { balance: number };
  return row.balance;
}

// Plain storage only — no affordability check here. The caller (the
// renderer, which already has the real-time balance from a recent
// listFinanceTransactions/getCompanyBalanceGBPPence read) decides
// whether a discretionary purchase is affordable BEFORE calling this;
// this never rejects a transaction that would take the balance
// negative, since mandatory future costs (wages, leases) will
// eventually need to post here regardless of balance — "running out of
// money does not end the game," DESIGN.md's own wording, so this layer
// can't be the one place that enforces solvency.
export function recordFinanceTransaction(
  db: SaveDb,
  amountGBPPence: number,
  category: string,
  depotGroupId: number | null,
  description: string,
  gameDay: number,
): FinanceTransaction {
  const result = db
    .prepare("INSERT INTO finance_transactions (amount_gbp_pence, category, depot_group_id, description, game_day, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(amountGBPPence, category, depotGroupId, description, gameDay, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), amountGBPPence, category, depotGroupId, description, gameDay };
}

// Most recent first — a plain ledger view, not yet grouped into
// DESIGN.md §10's own Finance screen categories (deferred, see
// finance_transactions' own SCHEMA comment above). `depotGroupId` narrows
// to one group's own attributed spend; omitted for the whole-company view.
export function listFinanceTransactions(db: SaveDb, depotGroupId?: number): FinanceTransaction[] {
  const rows =
    depotGroupId === undefined
      ? (db.prepare("SELECT id, amount_gbp_pence, category, depot_group_id, description, game_day FROM finance_transactions ORDER BY id DESC").all() as unknown as FinanceTransactionRow[])
      : (db
          .prepare("SELECT id, amount_gbp_pence, category, depot_group_id, description, game_day FROM finance_transactions WHERE depot_group_id = ? ORDER BY id DESC")
          .all(depotGroupId) as unknown as FinanceTransactionRow[]);
  return rows.map(financeTransactionFromRow);
}

// --- Remote/rural route subsidies (OPEN-ITEMS.md "Contracts redesign",
// settled 2026-11-19; see remote_route_subsidies' own CREATE TABLE
// comment above for the full real design, and
// src/renderer/remote-route-subsidy.mts for the pure offer/accept/
// decline/withdrawal state machine this storage layer persists) ---

export type RemoteRouteSubsidyState = "offered" | "accepted" | "declined" | "withdrawal_warned" | "withdrawn";

export interface RemoteRouteSubsidy {
  id: number;
  routeId: number;
  departureMinutes: number;
  weekdayMask: number;
  state: RemoteRouteSubsidyState;
  offeredGameDay: number;
  decidedGameDay: number | null;
  warningStartedGameDay: number | null;
}

interface RemoteRouteSubsidyRow {
  id: number;
  route_id: number;
  departure_minutes: number;
  weekday_mask: number;
  state: RemoteRouteSubsidyState;
  offered_game_day: number;
  decided_game_day: number | null;
  warning_started_game_day: number | null;
}

const REMOTE_ROUTE_SUBSIDY_COLUMNS = "id, route_id, departure_minutes, weekday_mask, state, offered_game_day, decided_game_day, warning_started_game_day";

function remoteRouteSubsidyFromRow(row: RemoteRouteSubsidyRow): RemoteRouteSubsidy {
  return {
    id: row.id,
    routeId: row.route_id,
    departureMinutes: row.departure_minutes,
    weekdayMask: row.weekday_mask,
    state: row.state,
    offeredGameDay: row.offered_game_day,
    decidedGameDay: row.decided_game_day,
    warningStartedGameDay: row.warning_started_game_day,
  };
}

export function listAllRemoteRouteSubsidies(db: SaveDb): RemoteRouteSubsidy[] {
  const rows = db.prepare(`SELECT ${REMOTE_ROUTE_SUBSIDY_COLUMNS} FROM remote_route_subsidies`).all() as unknown as RemoteRouteSubsidyRow[];
  return rows.map(remoteRouteSubsidyFromRow);
}

export function getRemoteRouteSubsidy(db: SaveDb, routeId: number, departureMinutes: number, weekdayMask: number): RemoteRouteSubsidy | null {
  const row = db
    .prepare(`SELECT ${REMOTE_ROUTE_SUBSIDY_COLUMNS} FROM remote_route_subsidies WHERE route_id = ? AND departure_minutes = ? AND weekday_mask = ?`)
    .get(routeId, departureMinutes, weekdayMask) as unknown as RemoteRouteSubsidyRow | undefined;
  return row ? remoteRouteSubsidyFromRow(row) : null;
}

// Upserts the full real record for one scheduled journey — the caller
// (vehicle-simulation.ts, via remote-route-subsidy.mts's pure
// evaluateSubsidyDay/acceptOffer/declineOffer) already computed the
// complete next state; this layer just persists it, same "pure logic
// decides, storage just saves" split as every other mechanic in this
// file. `null` for `state` deletes the record outright (evaluateSubsidyDay
// returns `null` for "no subsidy relationship exists at all," e.g. a
// retracted unanswered offer — there is nothing meaningful to store for
// that case, the same way a brand-new scheduled journey has no row
// either).
export function upsertRemoteRouteSubsidy(
  db: SaveDb,
  routeId: number,
  departureMinutes: number,
  weekdayMask: number,
  state: RemoteRouteSubsidyState | null,
  offeredGameDay: number,
  decidedGameDay: number | null,
  warningStartedGameDay: number | null,
): RemoteRouteSubsidy | null {
  if (state === null) {
    db.prepare("DELETE FROM remote_route_subsidies WHERE route_id = ? AND departure_minutes = ? AND weekday_mask = ?").run(routeId, departureMinutes, weekdayMask);
    return null;
  }
  db.prepare(
    `INSERT INTO remote_route_subsidies (route_id, departure_minutes, weekday_mask, state, offered_game_day, decided_game_day, warning_started_game_day)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(route_id, departure_minutes, weekday_mask) DO UPDATE SET
       state = excluded.state,
       offered_game_day = excluded.offered_game_day,
       decided_game_day = excluded.decided_game_day,
       warning_started_game_day = excluded.warning_started_game_day`,
  ).run(routeId, departureMinutes, weekdayMask, state, offeredGameDay, decidedGameDay, warningStartedGameDay);
  return getRemoteRouteSubsidy(db, routeId, departureMinutes, weekdayMask);
}

export function deleteRemoteRouteSubsidy(db: SaveDb, routeId: number, departureMinutes: number, weekdayMask: number): void {
  db.prepare("DELETE FROM remote_route_subsidies WHERE route_id = ? AND departure_minutes = ? AND weekday_mask = ?").run(routeId, departureMinutes, weekdayMask);
}

// --- Fixed real contract fine/suspension storage (DESIGN.md "Fixed real
// contracts"; OPEN-ITEMS.md "Contracts redesign," confirmed 2026-11-19;
// see fixed_contract_fine_events'/fixed_contract_suspensions' own CREATE
// TABLE comments above, and src/renderer/fixed-contract-failures.mts for
// the real fine/suspension logic this persists) — plain storage only,
// same "pure logic decides, storage just saves" split as
// remote_route_subsidies above. No IPC wiring exists for this yet (no
// screen calls it) — see this feature's own handover report for that
// flagged gap.

export interface FixedContractFineEvent {
  id: number;
  routeId: number;
  gameDay: number;
  scheduledUnits: number;
  missedUnits: number;
  fineGBPPence: number;
}

interface FixedContractFineEventRow {
  id: number;
  route_id: number;
  game_day: number;
  scheduled_units: number;
  missed_units: number;
  fine_gbp_pence: number;
}

function fixedContractFineEventFromRow(row: FixedContractFineEventRow): FixedContractFineEvent {
  return {
    id: row.id,
    routeId: row.route_id,
    gameDay: row.game_day,
    scheduledUnits: row.scheduled_units,
    missedUnits: row.missed_units,
    fineGBPPence: row.fine_gbp_pence,
  };
}

// Records the fine event AND posts it to the real finance ledger in one
// call (finance_transactions, via recordFinanceTransaction below) — a
// fine that only existed as a row in this table and never actually
// touched the company's money would not be "a real, working mechanic," so
// this deliberately does both rather than leaving the caller to remember
// to post the finance side separately. `depotGroupId` is the route's own
// owning depot group, passed by the caller (this layer doesn't join
// against routes itself, same "caller already has the real data" pattern
// as createRepaintBooking above).
export function recordFixedContractFineEvent(
  db: SaveDb,
  routeId: number,
  routeNumber: string,
  depotGroupId: number,
  gameDay: number,
  scheduledUnits: number,
  missedUnits: number,
  fineGBPPence: number,
): FixedContractFineEvent {
  const result = db
    .prepare("INSERT INTO fixed_contract_fine_events (route_id, game_day, scheduled_units, missed_units, fine_gbp_pence) VALUES (?, ?, ?, ?, ?)")
    .run(routeId, gameDay, scheduledUnits, missedUnits, fineGBPPence);
  recordFinanceTransaction(
    db,
    -fineGBPPence,
    "Fixed contract fines",
    depotGroupId,
    `Route ${routeNumber} missed ${missedUnits} of ${scheduledUnits} scheduled departures`,
    gameDay,
  );
  return { id: Number(result.lastInsertRowid), routeId, gameDay, scheduledUnits, missedUnits, fineGBPPence };
}

export function listFixedContractFineEvents(db: SaveDb, routeId: number): FixedContractFineEvent[] {
  const rows = db
    .prepare("SELECT id, route_id, game_day, scheduled_units, missed_units, fine_gbp_pence FROM fixed_contract_fine_events WHERE route_id = ? ORDER BY game_day")
    .all(routeId) as unknown as FixedContractFineEventRow[];
  return rows.map(fixedContractFineEventFromRow);
}

export interface FixedContractSuspensionRecord {
  id: number;
  routeId: number;
  weekdayMask: number;
  suspendedUnits: number;
  totalUnits: number;
  startGameDay: number;
  returnGameDay: number;
  active: boolean;
}

interface FixedContractSuspensionRow {
  id: number;
  route_id: number;
  weekday_mask: number;
  suspended_units: number;
  total_units: number;
  start_game_day: number;
  return_game_day: number;
  active: number;
}

function fixedContractSuspensionFromRow(row: FixedContractSuspensionRow): FixedContractSuspensionRecord {
  return {
    id: row.id,
    routeId: row.route_id,
    weekdayMask: row.weekday_mask,
    suspendedUnits: row.suspended_units,
    totalUnits: row.total_units,
    startGameDay: row.start_game_day,
    returnGameDay: row.return_game_day,
    active: row.active !== 0,
  };
}

// Creates one new suspension BATCH — see fixed_contract_suspensions' own
// CREATE TABLE comment for why an escalation is a new row, not an update
// to an existing one.
export function createFixedContractSuspension(
  db: SaveDb,
  routeId: number,
  weekdayMask: number,
  suspendedUnits: number,
  totalUnits: number,
  startGameDay: number,
  returnGameDay: number,
): FixedContractSuspensionRecord {
  const result = db
    .prepare("INSERT INTO fixed_contract_suspensions (route_id, weekday_mask, suspended_units, total_units, start_game_day, return_game_day, active) VALUES (?, ?, ?, ?, ?, ?, 1)")
    .run(routeId, weekdayMask, suspendedUnits, totalUnits, startGameDay, returnGameDay);
  return { id: Number(result.lastInsertRowid), routeId, weekdayMask, suspendedUnits, totalUnits, startGameDay, returnGameDay, active: true };
}

export function listFixedContractSuspensions(db: SaveDb, routeId: number): FixedContractSuspensionRecord[] {
  const rows = db
    .prepare(
      "SELECT id, route_id, weekday_mask, suspended_units, total_units, start_game_day, return_game_day, active FROM fixed_contract_suspensions WHERE route_id = ? ORDER BY start_game_day",
    )
    .all(routeId) as unknown as FixedContractSuspensionRow[];
  return rows.map(fixedContractSuspensionFromRow);
}

export function listAllActiveFixedContractSuspensions(db: SaveDb): FixedContractSuspensionRecord[] {
  const rows = db
    .prepare("SELECT id, route_id, weekday_mask, suspended_units, total_units, start_game_day, return_game_day, active FROM fixed_contract_suspensions WHERE active = 1")
    .all() as unknown as FixedContractSuspensionRow[];
  return rows.map(fixedContractSuspensionFromRow);
}

// The 1-year automatic return (fixed-contract-failures.mts's own
// isExpired, checked by the caller before deciding to call this) — flips
// the batch inactive rather than deleting the row, so its own history
// (when it started, how many units, when it returned) stays in the save
// rather than vanishing.
export function deactivateFixedContractSuspension(db: SaveDb, id: number): void {
  db.prepare("UPDATE fixed_contract_suspensions SET active = 0 WHERE id = ?").run(id);
}

// --- Contracts menu: acceptance storage (see fixed_contract_acceptances'
// own CREATE TABLE comment above for the full reasoning) ------------------

export interface FixedContractAcceptance {
  contractKey: string;
  routeIds: number[];
  depotGroupId: number;
  acceptedGameDay: number;
  activationGameDay: number;
  grantedDepotId: number | null;
}

interface FixedContractAcceptanceRow {
  contract_key: string;
  route_ids: string;
  depot_group_id: number;
  accepted_game_day: number;
  activation_game_day: number;
  granted_depot_id: number | null;
}

function fixedContractAcceptanceFromRow(row: FixedContractAcceptanceRow): FixedContractAcceptance {
  return {
    contractKey: row.contract_key,
    routeIds: JSON.parse(row.route_ids) as number[],
    depotGroupId: row.depot_group_id,
    acceptedGameDay: row.accepted_game_day,
    activationGameDay: row.activation_game_day,
    grantedDepotId: row.granted_depot_id,
  };
}

const FIXED_CONTRACT_ACCEPTANCE_COLUMNS = "contract_key, route_ids, depot_group_id, accepted_game_day, activation_game_day, granted_depot_id";

// Records a contract as accepted — permanent, never deleted (the menu's
// own "accepted" list is read straight off this table, same "once
// accepted, always shows real status" shape as the fine/suspension
// tables above). Safe to call only once per contract_key in practice (the
// menu only offers Accept while no acceptance row exists yet) — a second
// call would violate the PRIMARY KEY and throw, which is the correct
// behaviour (a contract can't be accepted twice), not guarded against
// here with an upsert.
export function createFixedContractAcceptance(
  db: SaveDb,
  contractKey: string,
  routeIds: number[],
  depotGroupId: number,
  acceptedGameDay: number,
  activationGameDay: number,
  grantedDepotId: number | null,
): FixedContractAcceptance {
  db.prepare(
    `INSERT INTO fixed_contract_acceptances (${FIXED_CONTRACT_ACCEPTANCE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(contractKey, JSON.stringify(routeIds), depotGroupId, acceptedGameDay, activationGameDay, grantedDepotId);
  return { contractKey, routeIds, depotGroupId, acceptedGameDay, activationGameDay, grantedDepotId };
}

export function getFixedContractAcceptance(db: SaveDb, contractKey: string): FixedContractAcceptance | null {
  const row = db.prepare(`SELECT ${FIXED_CONTRACT_ACCEPTANCE_COLUMNS} FROM fixed_contract_acceptances WHERE contract_key = ?`).get(contractKey) as unknown as FixedContractAcceptanceRow | undefined;
  return row ? fixedContractAcceptanceFromRow(row) : null;
}

export function listFixedContractAcceptances(db: SaveDb): FixedContractAcceptance[] {
  const rows = db.prepare(`SELECT ${FIXED_CONTRACT_ACCEPTANCE_COLUMNS} FROM fixed_contract_acceptances`).all() as unknown as FixedContractAcceptanceRow[];
  return rows.map(fixedContractAcceptanceFromRow);
}

// --- Route milestones: generic "first observed" tracker (see
// route_milestones' own CREATE TABLE comment above) ------------------------

// INSERT OR IGNORE, not an upsert — the whole point is to remember the
// EARLIEST day a route was observed; a later call on an already-tracked
// route must never push its own first-seen day forward.
export function ensureRouteMilestone(db: SaveDb, routeId: number, todayGameDay: number): void {
  db.prepare("INSERT OR IGNORE INTO route_milestones (route_id, first_seen_game_day) VALUES (?, ?)").run(routeId, todayGameDay);
}

export function getRouteMilestone(db: SaveDb, routeId: number): number | null {
  const row = db.prepare("SELECT first_seen_game_day FROM route_milestones WHERE route_id = ?").get(routeId) as unknown as { first_seen_game_day: number } | undefined;
  return row ? row.first_seen_game_day : null;
}

// --- Stop route locks (see stop_route_locks' own CREATE TABLE comment
// above for the full real design) -----------------------------------------

export type StopRouteLockSource = "contract" | "purchased";

export interface StopRouteLock {
  stopOsmId: number;
  lockedRouteId: number;
  source: StopRouteLockSource;
  contractKey: string | null;
  purchasePriceGbpPence: number | null;
  lockedGameDay: number;
}

interface StopRouteLockRow {
  stop_osm_id: number;
  locked_route_id: number;
  source: StopRouteLockSource;
  contract_key: string | null;
  purchase_price_gbp_pence: number | null;
  locked_game_day: number;
}

const STOP_ROUTE_LOCK_COLUMNS = "stop_osm_id, locked_route_id, source, contract_key, purchase_price_gbp_pence, locked_game_day";

function stopRouteLockFromRow(row: StopRouteLockRow): StopRouteLock {
  return {
    stopOsmId: row.stop_osm_id,
    lockedRouteId: row.locked_route_id,
    source: row.source,
    contractKey: row.contract_key,
    purchasePriceGbpPence: row.purchase_price_gbp_pence,
    lockedGameDay: row.locked_game_day,
  };
}

// PRIMARY KEY on stop_osm_id (see the CREATE TABLE comment) enforces the
// real exclusivity rule at the schema level — a second lock on an
// already-locked stop throws rather than silently overwriting it. Callers
// (contracts-panel.ts, stops-layer.ts) check getStopRouteLock first and
// skip calling this when a lock already exists, same "check don't
// upsert" convention as createFixedContractAcceptance above, so the
// throw is a genuine bug signal, not expected control flow.
export function createStopRouteLock(
  db: SaveDb,
  stopOsmId: number,
  lockedRouteId: number,
  source: StopRouteLockSource,
  contractKey: string | null,
  purchasePriceGbpPence: number | null,
  lockedGameDay: number,
): StopRouteLock {
  db.prepare(`INSERT INTO stop_route_locks (${STOP_ROUTE_LOCK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`).run(
    stopOsmId,
    lockedRouteId,
    source,
    contractKey,
    purchasePriceGbpPence,
    lockedGameDay,
  );
  return { stopOsmId, lockedRouteId, source, contractKey, purchasePriceGbpPence, lockedGameDay };
}

export function listAllStopRouteLocks(db: SaveDb): StopRouteLock[] {
  const rows = db.prepare(`SELECT ${STOP_ROUTE_LOCK_COLUMNS} FROM stop_route_locks`).all() as unknown as StopRouteLockRow[];
  return rows.map(stopRouteLockFromRow);
}

export function getStopRouteLock(db: SaveDb, stopOsmId: number): StopRouteLock | null {
  const row = db.prepare(`SELECT ${STOP_ROUTE_LOCK_COLUMNS} FROM stop_route_locks WHERE stop_osm_id = ?`).get(stopOsmId) as unknown as StopRouteLockRow | undefined;
  return row ? stopRouteLockFromRow(row) : null;
}
