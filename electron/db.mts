import { DatabaseSync } from "node:sqlite";

export type SaveDb = DatabaseSync;

const SCHEMA_VERSION = 26;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS depot_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  main_bus_station_osm_id INTEGER
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
  parent_route_id INTEGER REFERENCES routes(id),
  variation_letter TEXT
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
-- waitSeconds} flagging which of the route's stops (indexes into the
-- owning route's own "points" column) hold a bus that arrives early, and
-- for how long. "arrival_offsets_seconds" and "departure_offsets_seconds"
-- are the derived output — one entry per route point, seconds from the
-- journey's departure at point 0 — computed once from the WASM router's
-- real running times (only available in the renderer, not here) and
-- cached so a stop/station timetable query never needs to re-route every
-- leg just to read a time back. Regenerated whenever the frequency,
-- timing points, or the route's own point list changes. One row per
-- (route, day type): a route not yet given a timetable for a day type
-- simply has no row for it. "excluded_departure_minutes" is a JSON array
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
-- 607 runs Fridays differently from Monday-Thursday, and Portree High
-- School/Portree Square need a school-day vs non-school-day split. A
-- bitmask (bit 0 = Monday ... bit 6 = Sunday, see WEEKDAY_BITS below) can
-- express any weekday combination without a schema change every time real
-- data shows a new one, crossed with an independent term_facet ('any' /
-- 'term_time' / 'holiday'). **No UI lets a player create anything beyond
-- the original 3 presets yet** — the TS-facing DayType type and every
-- existing caller are deliberately unchanged (still exactly
-- "monday_friday" | "saturday" | "sunday"); this only makes what's
-- actually stored able to represent more, translated at the boundary by
-- dayTypeToMaskAndFacet/maskAndFacetToDayType below. Letting a player
-- actually pick a custom weekday+term-time pattern in the timetable editor
-- is a separate, later increment (OPEN-ITEMS.md).
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
  excluded_departure_minutes TEXT NOT NULL DEFAULT '[]',
  custom_departure_minutes TEXT NOT NULL DEFAULT '[]',
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
CREATE TABLE IF NOT EXISTS player_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  bus_legal INTEGER NOT NULL,
  created_at TEXT NOT NULL
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
CREATE TABLE IF NOT EXISTS dealers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL CHECK (manufacturer IN ('volvo', 'adl', 'western_commercial', 'wrightbus', 'yutong')),
  lon REAL NOT NULL,
  lat REAL NOT NULL
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

-- A repaint shop the player has placed (OPERATIONS.md §5 Ferrymill is the
-- original). weekly_capacity is how many vehicles the shop can take each
-- week; there is deliberately no default, since the real figure per shop
-- comes from the user.
CREATE TABLE IF NOT EXISTS repaint_shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  weekly_capacity INTEGER NOT NULL CHECK (weekly_capacity > 0)
);
`;

export function openSave(path: string): SaveDb {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const { user_version: currentVersion } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
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
  } else if (currentVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Save file schema version ${currentVersion} is not supported (expected ${SCHEMA_VERSION})`,
    );
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
}

interface DepotGroupRow {
  id: number;
  name: string;
  region: string;
  main_bus_station_osm_id: number | null;
}

function fromRow(row: DepotGroupRow): DepotGroup {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    mainBusStationOsmId: row.main_bus_station_osm_id === null ? null : Number(row.main_bus_station_osm_id),
  };
}

export function createDepotGroup(db: SaveDb, name: string, region: string): DepotGroup {
  const result = db.prepare("INSERT INTO depot_groups (name, region) VALUES (?, ?)").run(name, region);
  return { id: Number(result.lastInsertRowid), name, region, mainBusStationOsmId: null };
}

export function listDepotGroups(db: SaveDb): DepotGroup[] {
  const rows = db
    .prepare("SELECT id, name, region, main_bus_station_osm_id FROM depot_groups ORDER BY name")
    .all() as unknown as DepotGroupRow[];
  return rows.map(fromRow);
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
  parentRouteId: number | null;
  variationLetter: string | null;
}

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
  parent_route_id: number | null;
  variation_letter: string | null;
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
    parentRouteId: row.parent_route_id === null ? null : Number(row.parent_route_id),
    variationLetter: row.variation_letter,
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
): Route {
  const result = db
    .prepare(
      "INSERT INTO routes (depot_group_id, number, points, orientation, terminus_index, start_index, colour, name, parent_route_id, variation_letter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    parentRouteId,
    variationLetter,
  };
}

// Editing a saved route (route-panel.ts's "Edit" action) — updates every
// field in place rather than creating a duplicate, and always clears the
// route's own timetables (DESIGN.md §7) regardless of which fields
// actually changed. A timetable's timing points and offsets are indexed
// against the route's exact point list, so any edit could silently
// invalidate them; clearing unconditionally is simpler than diffing the
// old and new point lists to detect whether stops specifically changed,
// and errs on the side of never leaving a stale-but-technically-valid
// timetable behind.
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
): Route {
  db.prepare(
    `UPDATE routes SET depot_group_id = ?, number = ?, points = ?, orientation = ?, terminus_index = ?, start_index = ?, colour = ?, name = ?, pickup_dropoff_overrides = '[]', parent_route_id = ?, variation_letter = ?
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
    parentRouteId,
    variationLetter,
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
    parentRouteId,
    variationLetter,
  };
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

export function listRoutes(db: SaveDb): Route[] {
  const rows = db
    .prepare(
      "SELECT id, depot_group_id, number, points, orientation, terminus_index, start_index, colour, name, pickup_dropoff_overrides, parent_route_id, variation_letter FROM routes ORDER BY number",
    )
    .all() as unknown as RouteRow[];
  return rows.map(routeFromRow);
}

export function deleteRoute(db: SaveDb, id: number): void {
  // No cascade is defined on either reference to a route, so both need
  // explicit handling before the row itself can go:
  // - a route's own timetables would otherwise survive orphaned — deleted
  //   outright, same as updateRoute already does on any point-list edit.
  // - any variation whose parent_route_id points at this route gets that
  //   link cleared to null rather than being deleted or blocked — DESIGN.md
  //   §6 already treats a variation with no real parent as normal ("route
  //   7A and 7B can exist with no 7"), so losing a parent is a valid state,
  //   not an error. Node's sqlite enforces the FK by default, so without
  //   this the DELETE below fails outright whenever a child exists.
  db.prepare("UPDATE routes SET parent_route_id = NULL WHERE parent_route_id = ?").run(id);
  db.prepare("DELETE FROM route_timetables WHERE route_id = ?").run(id);
  db.prepare("DELETE FROM routes WHERE id = ?").run(id);
}

// A route's timetable (DESIGN.md §7) — see the route_timetables table's own
// comment in SCHEMA for what's built so far and what's deliberately left
// out (variations, padding, connections, extensions, the event calendar).
//
// Stored underneath as a weekday bitmask + term-time facet (schema
// v19->v20, see SCHEMA's own comment) so real sub-patterns Skye's actual
// timetables need (UK-EXPANSION.md §13 — 608/607's Tuesday/Thursday
// footnote, 607's own separate Friday-differs pattern, Portree High
// School vs Portree Square's school-day split) can be represented without
// another schema change every time real data shows a new one. `DayType`
// itself stays exactly the original 3 presets for now — no UI lets a
// player create anything else yet, that's a separate later increment —
// translated at this boundary by dayTypeToMaskAndFacet/
// maskAndFacetToDayType below.
export type DayType = "monday_friday" | "saturday" | "sunday";
export const DAY_TYPES: readonly DayType[] = ["monday_friday", "saturday", "sunday"];

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

function dayTypeToMaskAndFacet(dayType: DayType): { weekdayMask: number; termFacet: TermFacet } {
  switch (dayType) {
    case "monday_friday":
      return { weekdayMask: MONDAY_FRIDAY_MASK, termFacet: "any" };
    case "saturday":
      return { weekdayMask: SATURDAY_MASK, termFacet: "any" };
    case "sunday":
      return { weekdayMask: SUNDAY_MASK, termFacet: "any" };
  }
}

// Throws on any combination beyond the 3 original presets — correct for
// now, since nothing can create one yet (see the type's own doc comment
// above); once a real picker exists this becomes the natural place to
// widen DayType itself rather than a fixed 3-value union.
function maskAndFacetToDayType(weekdayMask: number, termFacet: string): DayType {
  if (weekdayMask === MONDAY_FRIDAY_MASK && termFacet === "any") return "monday_friday";
  if (weekdayMask === SATURDAY_MASK && termFacet === "any") return "saturday";
  if (weekdayMask === SUNDAY_MASK && termFacet === "any") return "sunday";
  throw new Error(
    `unrecognised weekday_mask/term_facet combination (${weekdayMask}/${termFacet}) — no DayType beyond the 3 original presets exists yet`,
  );
}

// A timing point is a published scheduling location, not every physical
// stop (route-timetable.mts's own comment has the full reasoning).
// "legMinutes" is the published running time, in whole minutes, from the
// previous timing point (or point 0) to this one's arrival; "dwellSeconds"
// is an optional layover (departure - arrival), 0 for the common case.
export interface TimingPoint {
  pointIndex: number;
  legMinutes: number;
  dwellSeconds: number;
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
  dayType: DayType;
  direction: RouteTimetableDirection;
  timeBands: TimeBand[];
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
  excludedDepartureMinutes: number[];
  customDepartureMinutes: number[];
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
  excluded_departure_minutes: string;
  custom_departure_minutes: string;
}

function routeTimetableFromRow(row: RouteTimetableRow): RouteTimetable {
  return {
    id: row.id,
    routeId: row.route_id,
    dayType: maskAndFacetToDayType(row.weekday_mask, row.term_facet),
    direction: row.direction as RouteTimetableDirection,
    timeBands: JSON.parse(row.time_bands) as TimeBand[],
    timingPoints: JSON.parse(row.timing_points) as TimingPoint[],
    arrivalOffsetsSeconds: JSON.parse(row.arrival_offsets_seconds) as number[],
    departureOffsetsSeconds: JSON.parse(row.departure_offsets_seconds) as number[],
    excludedDepartureMinutes: JSON.parse(row.excluded_departure_minutes) as number[],
    customDepartureMinutes: JSON.parse(row.custom_departure_minutes) as number[],
  };
}

// One row per (route, day type, direction) — creating a second timetable
// for a (route, day type, direction) that already has one replaces it
// outright, since there's still only ever one component per that triple.
export function upsertRouteTimetable(
  db: SaveDb,
  routeId: number,
  dayType: DayType,
  direction: RouteTimetableDirection,
  timeBands: TimeBand[],
  timingPoints: TimingPoint[],
  arrivalOffsetsSeconds: number[],
  departureOffsetsSeconds: number[],
  excludedDepartureMinutes: number[],
  customDepartureMinutes: number[],
): RouteTimetable {
  const { weekdayMask, termFacet } = dayTypeToMaskAndFacet(dayType);
  db.prepare(
    `INSERT INTO route_timetables
       (route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (route_id, weekday_mask, term_facet, direction) DO UPDATE SET
       time_bands = excluded.time_bands,
       timing_points = excluded.timing_points,
       arrival_offsets_seconds = excluded.arrival_offsets_seconds,
       departure_offsets_seconds = excluded.departure_offsets_seconds,
       excluded_departure_minutes = excluded.excluded_departure_minutes,
       custom_departure_minutes = excluded.custom_departure_minutes`,
  ).run(
    routeId,
    weekdayMask,
    termFacet,
    direction,
    JSON.stringify(timeBands),
    JSON.stringify(timingPoints),
    JSON.stringify(arrivalOffsetsSeconds),
    JSON.stringify(departureOffsetsSeconds),
    JSON.stringify(excludedDepartureMinutes),
    JSON.stringify(customDepartureMinutes),
  );
  const row = db
    .prepare(
      `SELECT id, route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes
       FROM route_timetables WHERE route_id = ? AND weekday_mask = ? AND term_facet = ? AND direction = ?`,
    )
    .get(routeId, weekdayMask, termFacet, direction) as unknown as RouteTimetableRow;
  return routeTimetableFromRow(row);
}

export function listRouteTimetablesForRoute(db: SaveDb, routeId: number): RouteTimetable[] {
  const rows = db
    .prepare(
      `SELECT id, route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes
       FROM route_timetables WHERE route_id = ? ORDER BY weekday_mask, term_facet`,
    )
    .all(routeId) as unknown as RouteTimetableRow[];
  return rows.map(routeTimetableFromRow);
}

// Every route_timetable across every route — what the stop/station
// timetable viewer (T29) will scan to find every service calling at a
// given stop, rather than looking routes up one at a time.
export function listAllRouteTimetables(db: SaveDb): RouteTimetable[] {
  const rows = db
    .prepare(
      `SELECT id, route_id, weekday_mask, term_facet, direction, time_bands, timing_points, arrival_offsets_seconds, departure_offsets_seconds, excluded_departure_minutes, custom_departure_minutes
       FROM route_timetables`,
    )
    .all() as unknown as RouteTimetableRow[];
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
}

interface PlayerStopRow {
  id: number;
  lon: number;
  lat: number;
  bus_legal: number;
}

function playerStopFromRow(row: PlayerStopRow): PlayerStop {
  return { osmId: -row.id, lon: row.lon, lat: row.lat, busLegal: row.bus_legal !== 0 };
}

export function createPlayerStop(db: SaveDb, lon: number, lat: number, busLegal: boolean): PlayerStop {
  const result = db
    .prepare("INSERT INTO player_stops (lon, lat, bus_legal, created_at) VALUES (?, ?, ?, ?)")
    .run(lon, lat, busLegal ? 1 : 0, new Date().toISOString());
  return { osmId: -Number(result.lastInsertRowid), lon, lat, busLegal };
}

export function listPlayerStops(db: SaveDb): PlayerStop[] {
  const rows = db.prepare("SELECT id, lon, lat, bus_legal FROM player_stops").all() as unknown as PlayerStopRow[];
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
  db.prepare("DELETE FROM depots WHERE id = ?").run(id);
}

// A vehicle dealer (T62, OPEN-ITEMS.md) — see the dealers/dealer_entrances
// tables' own comments in SCHEMA. Exact mirror of the Depot/DepotEntrance
// functions above except there is no owning depot_group_id (a dealer
// isn't owned by any one operator) and "manufacturer" replaces that field.
export type DealerManufacturer = "volvo" | "adl" | "western_commercial" | "wrightbus" | "yutong";
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
}

interface DealerRow {
  id: number;
  name: string;
  manufacturer: DealerManufacturer;
  lon: number;
  lat: number;
}

function dealerFromRow(row: DealerRow): Dealer {
  return { id: row.id, name: row.name, manufacturer: row.manufacturer, lon: row.lon, lat: row.lat };
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
  return { dealer: { id: dealerId, name, manufacturer, lon, lat }, entrances: createdEntrances };
}

export function listDealers(db: SaveDb): Dealer[] {
  const rows = db.prepare("SELECT id, name, manufacturer, lon, lat FROM dealers").all() as unknown as DealerRow[];
  return rows.map(dealerFromRow);
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
  weeklyCapacity: number;
}

export function createRepaintShop(
  db: SaveDb,
  name: string,
  lon: number,
  lat: number,
  weeklyCapacity: number,
): RepaintShop {
  const result = db
    .prepare("INSERT INTO repaint_shops (name, lon, lat, weekly_capacity) VALUES (?, ?, ?, ?)")
    .run(name, lon, lat, weeklyCapacity);
  return { id: Number(result.lastInsertRowid), name, lon, lat, weeklyCapacity };
}

export function listRepaintShops(db: SaveDb): RepaintShop[] {
  const rows = db
    .prepare("SELECT id, name, lon, lat, weekly_capacity FROM repaint_shops ORDER BY id")
    .all() as { id: number; name: string; lon: number; lat: number; weekly_capacity: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, lon: r.lon, lat: r.lat, weeklyCapacity: r.weekly_capacity }));
}

export function setRepaintShopWeeklyCapacity(db: SaveDb, id: number, weeklyCapacity: number): void {
  db.prepare("UPDATE repaint_shops SET weekly_capacity = ? WHERE id = ?").run(weeklyCapacity, id);
}

export function deleteRepaintShop(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM repaint_shops WHERE id = ?").run(id);
}
