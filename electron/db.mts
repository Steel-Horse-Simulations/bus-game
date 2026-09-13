import { DatabaseSync } from "node:sqlite";

export type SaveDb = DatabaseSync;

const SCHEMA_VERSION = 9;

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
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  depot_group_id INTEGER NOT NULL REFERENCES depot_groups(id),
  number TEXT NOT NULL,
  points TEXT NOT NULL,
  orientation TEXT NOT NULL CHECK (orientation IN ('inbound', 'outbound')),
  terminus_index INTEGER,
  start_index INTEGER,
  colour TEXT NOT NULL DEFAULT '#3b82f6',
  name TEXT
);

-- A route's timetable (DESIGN.md §7), scoped to the minimal slice built so
-- far: one component per route per day type — no variations, padding,
-- connections, extensions or event calendar yet, all deliberately deferred
-- (see OPEN-ITEMS.md T29). "timing_points" is the player's own input: a
-- JSON array of {pointIndex, waitSeconds} flagging which of the route's
-- stops (indexes into the owning route's own "points" column) hold a bus
-- that arrives early, and for how long. "arrival_offsets_seconds" and
-- "departure_offsets_seconds" are the derived output — one entry per route
-- point, seconds from the journey's departure at point 0 — computed once
-- from the WASM router's real running times (only available in the
-- renderer, not here) and cached so a stop/station timetable query never
-- needs to re-route every leg just to read a time back. Regenerated
-- whenever the frequency, timing points, or the route's own point list
-- changes. One row per (route, day type): a route not yet given a
-- timetable for a day type simply has no row for it.
CREATE TABLE IF NOT EXISTS route_timetables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  day_type TEXT NOT NULL CHECK (day_type IN ('monday_friday', 'saturday', 'sunday')),
  start_minutes INTEGER NOT NULL,
  end_minutes INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL,
  timing_points TEXT NOT NULL,
  arrival_offsets_seconds TEXT NOT NULL,
  departure_offsets_seconds TEXT NOT NULL,
  UNIQUE (route_id, day_type)
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
): Route {
  const result = db
    .prepare(
      "INSERT INTO routes (depot_group_id, number, points, orientation, terminus_index, start_index, colour, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(depotGroupId, number, JSON.stringify(points), orientation, terminusIndex, startIndex, colour, name);
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
): Route {
  db.prepare(
    `UPDATE routes SET depot_group_id = ?, number = ?, points = ?, orientation = ?, terminus_index = ?, start_index = ?, colour = ?, name = ?
     WHERE id = ?`,
  ).run(depotGroupId, number, JSON.stringify(points), orientation, terminusIndex, startIndex, colour, name, id);
  db.prepare("DELETE FROM route_timetables WHERE route_id = ?").run(id);
  return { id, depotGroupId, number, points, orientation, terminusIndex, startIndex, colour, name };
}

export function listRoutes(db: SaveDb): Route[] {
  const rows = db
    .prepare(
      "SELECT id, depot_group_id, number, points, orientation, terminus_index, start_index, colour, name FROM routes ORDER BY number",
    )
    .all() as unknown as RouteRow[];
  return rows.map(routeFromRow);
}

export function deleteRoute(db: SaveDb, id: number): void {
  // No foreign-key cascade is enabled on this database, so a route's own
  // timetables would otherwise survive orphaned — deleted explicitly here
  // rather than left to accumulate.
  db.prepare("DELETE FROM route_timetables WHERE route_id = ?").run(id);
  db.prepare("DELETE FROM routes WHERE id = ?").run(id);
}

// A route's timetable (DESIGN.md §7) — see the route_timetables table's own
// comment in SCHEMA for what's built so far and what's deliberately left
// out (variations, padding, connections, extensions, the event calendar).
export type DayType = "monday_friday" | "saturday" | "sunday";
export const DAY_TYPES: readonly DayType[] = ["monday_friday", "saturday", "sunday"];

export interface TimingPoint {
  pointIndex: number;
  waitSeconds: number;
}

export interface RouteTimetable {
  id: number;
  routeId: number;
  dayType: DayType;
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
  timingPoints: TimingPoint[];
  arrivalOffsetsSeconds: number[];
  departureOffsetsSeconds: number[];
}

interface RouteTimetableRow {
  id: number;
  route_id: number;
  day_type: string;
  start_minutes: number;
  end_minutes: number;
  interval_minutes: number;
  timing_points: string;
  arrival_offsets_seconds: string;
  departure_offsets_seconds: string;
}

function routeTimetableFromRow(row: RouteTimetableRow): RouteTimetable {
  return {
    id: row.id,
    routeId: row.route_id,
    dayType: row.day_type as DayType,
    startMinutes: row.start_minutes,
    endMinutes: row.end_minutes,
    intervalMinutes: row.interval_minutes,
    timingPoints: JSON.parse(row.timing_points) as TimingPoint[],
    arrivalOffsetsSeconds: JSON.parse(row.arrival_offsets_seconds) as number[],
    departureOffsetsSeconds: JSON.parse(row.departure_offsets_seconds) as number[],
  };
}

// One row per (route, day type) — creating a second timetable for a day
// type that already has one replaces it outright, since there's only ever
// one component per route per day type in this slice (no variations to
// tell apart yet).
export function upsertRouteTimetable(
  db: SaveDb,
  routeId: number,
  dayType: DayType,
  startMinutes: number,
  endMinutes: number,
  intervalMinutes: number,
  timingPoints: TimingPoint[],
  arrivalOffsetsSeconds: number[],
  departureOffsetsSeconds: number[],
): RouteTimetable {
  db.prepare(
    `INSERT INTO route_timetables
       (route_id, day_type, start_minutes, end_minutes, interval_minutes, timing_points, arrival_offsets_seconds, departure_offsets_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (route_id, day_type) DO UPDATE SET
       start_minutes = excluded.start_minutes,
       end_minutes = excluded.end_minutes,
       interval_minutes = excluded.interval_minutes,
       timing_points = excluded.timing_points,
       arrival_offsets_seconds = excluded.arrival_offsets_seconds,
       departure_offsets_seconds = excluded.departure_offsets_seconds`,
  ).run(
    routeId,
    dayType,
    startMinutes,
    endMinutes,
    intervalMinutes,
    JSON.stringify(timingPoints),
    JSON.stringify(arrivalOffsetsSeconds),
    JSON.stringify(departureOffsetsSeconds),
  );
  const row = db
    .prepare(
      `SELECT id, route_id, day_type, start_minutes, end_minutes, interval_minutes, timing_points, arrival_offsets_seconds, departure_offsets_seconds
       FROM route_timetables WHERE route_id = ? AND day_type = ?`,
    )
    .get(routeId, dayType) as unknown as RouteTimetableRow;
  return routeTimetableFromRow(row);
}

export function listRouteTimetablesForRoute(db: SaveDb, routeId: number): RouteTimetable[] {
  const rows = db
    .prepare(
      `SELECT id, route_id, day_type, start_minutes, end_minutes, interval_minutes, timing_points, arrival_offsets_seconds, departure_offsets_seconds
       FROM route_timetables WHERE route_id = ? ORDER BY day_type`,
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
      `SELECT id, route_id, day_type, start_minutes, end_minutes, interval_minutes, timing_points, arrival_offsets_seconds, departure_offsets_seconds
       FROM route_timetables`,
    )
    .all() as unknown as RouteTimetableRow[];
  return rows.map(routeTimetableFromRow);
}

export function deleteRouteTimetable(db: SaveDb, id: number): void {
  db.prepare("DELETE FROM route_timetables WHERE id = ?").run(id);
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
