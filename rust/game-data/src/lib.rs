//! Shared data structures for the road graph artefact (`road_graph.bin`).
//!
//! The Rust pipeline crate writes this; the WASM router crate reads it. They
//! share these exact type definitions so encoding and decoding can never
//! silently drift apart — a bincode schema change here is a compile error in
//! both places, not a runtime surprise in one of them.

/// Default speed (mph) for a road with no `maxspeed` tag, indexed by the
/// same ordering the pipeline's `HighwayClass::index()` encodes into
/// `Edge.class` (`Motorway, MotorwayLink, Trunk, TrunkLink, Primary,
/// PrimaryLink, Secondary, SecondaryLink, Tertiary, TertiaryLink,
/// Unclassified, Residential, LivingStreet, Service, Track`). Lives here
/// rather than in the pipeline crate so the pipeline (which never reads it)
/// and `game-wasm`'s router (which does, for the fastest-route cost —
/// DESIGN.md §6) can never drift onto different tables, the same reasoning
/// as `RoadGraph`/`Edge` themselves.
///
/// Based on UK statutory speed limits for buses and coaches not exceeding
/// 12m (30 built-up, 50 single carriageway, 60 dual carriageway, 70
/// motorway — lower than the car NSL on single carriageways), mapped onto
/// the closest highway class. An assumption, not a sourced-per-class figure
/// the way the width table is — worth revisiting if journeys built on it
/// look wrong.
pub const HIGHWAY_CLASS_DEFAULT_SPEED_MPH: [u16; 15] = [
    70, // Motorway
    50, // MotorwayLink
    60, // Trunk
    40, // TrunkLink
    50, // Primary
    40, // PrimaryLink
    40, // Secondary
    30, // SecondaryLink
    30, // Tertiary
    30, // TertiaryLink
    30, // Unclassified
    20, // Residential
    10, // LivingStreet
    10, // Service
    15, // Track
];

/// Which direction(s) of a way traffic may legally use.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum OnewayDirection {
    TwoWay,
    Forward,
    Reverse,
}

/// How a junction is controlled — read from OSM point tags on the junction
/// node itself (`highway=traffic_signals`/`stop`/`give_way`, or
/// `highway=mini_roundabout`). `None` covers both an uncontrolled junction
/// and one with no explicit control tag at all (the common case for a plain
/// UK T-junction or crossroads with paint-only priority) — the router still
/// applies a give-way delay there when the road class says a minor road is
/// joining a more major one, the same as an explicit `GiveWay` tag; the
/// distinction only matters if a future increment wants to treat a signed
/// give-way differently from an unsigned priority junction.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum JunctionControl {
    None,
    TrafficSignals,
    Stop,
    GiveWay,
    MiniRoundabout,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct GraphNode {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub junction_control: JunctionControl,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct Edge {
    pub from: u32,
    pub to: u32,
    pub osm_way_id: i64,
    pub class: u8,
    pub width_m: f32,
    pub length_m: f32,
    pub oneway: OnewayDirection,
    pub access_restricted: bool,
    pub psv_yes: bool,
    pub bus_yes: bool,
    pub maxspeed_mph: Option<u16>,
    /// Parsed `maxweight` tag, tonnes — a real legal weight limit (e.g. a
    /// weak bridge). `None` means "no known limit," never a default/0.0 —
    /// mirrors `maxspeed_mph`'s own "missing tag, not inferred" treatment,
    /// unlike `width_m`'s inferred-fallback chain. No versioning gate on
    /// this struct (plain bincode derive), so every consumer rebuilds
    /// together.
    pub maxweight_tonnes: Option<f32>,
    /// Parsed `maxheight` tag, metres — a real legal height limit (e.g. a
    /// low bridge or tunnel). Same "no tag = no known limit" rule.
    pub maxheight_metres: Option<f32>,
    /// Parsed `maxlength` tag, metres — a real legal length limit. Same
    /// "no tag = no known limit" rule.
    pub maxlength_metres: Option<f32>,
    /// Parsed `maxwidth` tag, metres — a real legal (posted) width
    /// restriction, distinct from `width_m` (the road's own physical/
    /// inferred width used for rendering). Same "no tag = no known limit"
    /// rule.
    pub maxwidth_metres: Option<f32>,
    /// Shape points between `from` and `to` (exclusive of both endpoints)
    /// live in `RoadGraph::geometry_points`, at
    /// `[geometry_start, geometry_start + geometry_len)` — a flat shared
    /// buffer rather than a `Vec<(i32,i32)>` per edge (OPEN-ITEMS.md
    /// T55-map-boundary's "freezing, not recovering" bug): decoding ~11.5M
    /// edges each carrying their own small heap-allocated Vec measured at
    /// ~85 of a ~224 second freeze specifically in wasm32 (proven fast
    /// natively on the identical file first, so this wasn't guessed at —
    /// the WASM default allocator handles "millions of small separate
    /// allocations" far worse than a native one). One shared buffer per
    /// `RoadGraph` means decode is still O(total points) but with a
    /// handful of large allocations instead of millions of tiny ones.
    pub geometry_start: u32,
    pub geometry_len: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum RestrictionKind {
    NoLeftTurn,
    NoRightTurn,
    NoStraightOn,
    NoUTurn,
    OnlyLeftTurn,
    OnlyRightTurn,
    OnlyStraightOn,
}

/// A resolved turn restriction: at node `via`, coming from edge `from_edge`,
/// `kind` applies to the movement onto `to_edge`.
#[derive(bincode::Encode, bincode::Decode)]
pub struct Restriction {
    pub via: u32,
    pub from_edge: u32,
    pub to_edge: u32,
    pub kind: RestrictionKind,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct RoadGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<Edge>,
    pub restrictions: Vec<Restriction>,
    /// Shared flat buffer every `Edge`'s own `geometry_start`/`geometry_len`
    /// slices into — see `Edge::geometry_start`'s own doc comment for why.
    pub geometry_points: Vec<(i32, i32)>,
}

impl RoadGraph {
    /// The shape points between an edge's own `from`/`to` endpoints
    /// (exclusive of both), in `from`->`to` order — the equivalent of the
    /// old per-edge `geometry: Vec<(i32,i32)>` field, as a borrowed slice
    /// into this graph's own shared buffer instead.
    pub fn edge_geometry(&self, edge: &Edge) -> &[(i32, i32)] {
        let start = edge.geometry_start as usize;
        let end = start + edge.geometry_len as usize;
        &self.geometry_points[start..end]
    }
}

pub fn encode(graph: &RoadGraph) -> Vec<u8> {
    bincode::encode_to_vec(graph, bincode::config::standard()).expect("encode road graph")
}

pub fn decode(bytes: &[u8]) -> RoadGraph {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode road graph")
        .0
}

/// Shared data structures for the stop artefact (`stops.bin`). Same
/// writer/reader split as `RoadGraph` above — the pipeline writes these, the
/// renderer (via `game-wasm`) reads them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum StopKind {
    /// `highway=bus_stop`
    BusStop,
    /// `public_transport=platform`
    Platform,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct Stop {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
    pub kind: StopKind,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct BusStation {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct StopArea {
    pub osm_id: i64,
    pub name: Option<String>,
    /// OSM node ids of member stops/platforms — resolved to `Stop` indices
    /// downstream, once both lists exist (DESIGN.md §4).
    pub member_stop_osm_ids: Vec<i64>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct StopData {
    pub stops: Vec<Stop>,
    pub bus_stations: Vec<BusStation>,
    pub stop_areas: Vec<StopArea>,
}

pub fn encode_stops(data: &StopData) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode stop data")
}

pub fn decode_stops(bytes: &[u8]) -> StopData {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode stop data")
        .0
}

/// Shared data structures for the "railway stations and platforms"
/// artefact (`railway.bin`) — rail *lines* already render from the
/// existing vector tiles, no pipeline change needed for those. Stations:
/// point-mapped and way-mapped (a station building/platform-area
/// footprint, position is the centroid — same scoping caveat as
/// `StopData`'s own doc comment, relation-mapped stations are a known gap,
/// not silently mismodelled). Platforms: way-mapped `railway=platform`
/// full shapes (not just a centroid — real physical geometry, per the
/// deliberate choice over simple markers), used both to recentre a
/// station on the true middle of its own platforms where any are found
/// nearby, and available for a future close-zoom platform-shape render.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum RailwayStationKind {
    /// `railway=station`
    Station,
    /// `railway=halt`
    Halt,
    /// `railway=station` + `station=subway` — a metro/underground station
    /// (Glasgow Subway in this game's own area), tagged with the same
    /// primary `railway=station` key as a real National Rail station but
    /// distinguished by this sub-tag, per OSM's own documented convention.
    Subway,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct RailwayStation {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
    pub kind: RailwayStationKind,
}

/// A tram stop — `railway=tram_stop`, a wholly separate primary tag from
/// `railway=station` (trams don't carry the platform/building infrastructure
/// a real station does), point-mapped only.
#[derive(bincode::Encode, bincode::Decode)]
pub struct TramStop {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
}

/// A platform's full physical shape — every resolved node of the
/// `railway=platform` way, in order (a line for a simple platform edge, a
/// closed ring for one mapped as an area). At least 2 points.
#[derive(bincode::Encode, bincode::Decode)]
pub struct Platform {
    pub osm_id: i64,
    pub geometry: Vec<(i32, i32)>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct RailwayData {
    pub stations: Vec<RailwayStation>,
    pub platforms: Vec<Platform>,
    pub tram_stops: Vec<TramStop>,
}

pub fn encode_railway(data: &RailwayData) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode railway data")
}

pub fn decode_railway(bytes: &[u8]) -> RailwayData {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode railway data")
        .0
}

/// A `place=city/town/village/hamlet` node — used as the direction-rule
/// fallback reference (DESIGN.md §6) when a depot group has no bus
/// station set. See `pipeline/src/settlements.rs`'s own doc comment for
/// the full reasoning and scoping caveats.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, bincode::Encode, bincode::Decode)]
pub enum PlaceRank {
    City,
    Town,
    Village,
    Hamlet,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct Settlement {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
    pub rank: PlaceRank,
    pub population: Option<u32>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct SettlementData {
    pub settlements: Vec<Settlement>,
}

pub fn encode_settlements(data: &SettlementData) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode settlement data")
}

pub fn decode_settlements(bytes: &[u8]) -> SettlementData {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode settlement data")
        .0
}

/// A real sailing line, extracted from a single `route=ferry`-tagged OSM
/// way (`pipeline/src/ferry_routes.rs`'s own doc comment has the full
/// scoping reasoning) — the real geometry, not a centroid, since the whole
/// point is an exact distance for fare/timing use (T107/T108,
/// OPEN-ITEMS.md), not just a marker.
#[derive(bincode::Encode, bincode::Decode)]
pub struct FerryRoute {
    pub osm_id: i64,
    pub name: Option<String>,
    pub geometry: Vec<(i32, i32)>,
    /// Precomputed at pipeline build time (sum of each consecutive leg's
    /// haversine distance) so no consumer needs to redo that work, and so
    /// every consumer — map rendering, a future fare calculation — reads
    /// the exact same figure.
    pub distance_m: f64,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct FerryRouteData {
    pub routes: Vec<FerryRoute>,
}

pub fn encode_ferry_routes(data: &FerryRouteData) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode ferry route data")
}

pub fn decode_ferry_routes(bytes: &[u8]) -> FerryRouteData {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode ferry route data")
        .0
}

/// One continuous stretch of real coastline, assembled at pipeline build
/// time from one or more joined OSM `natural=coastline` ways
/// (`pipeline/src/coastline.rs`'s own doc comment has the full scoping
/// reasoning). Consumed client-side by `fare-zone-drawing.ts` to clip a
/// drawn fare zone's own straight (Shift-click) water-crossing segments
/// back to the real shore.
#[derive(bincode::Encode, bincode::Decode)]
pub struct CoastlineChain {
    pub geometry: Vec<(i32, i32)>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct CoastlineData {
    pub chains: Vec<CoastlineChain>,
}

pub fn encode_coastline(data: &CoastlineData) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode coastline data")
}

pub fn decode_coastline(bytes: &[u8]) -> CoastlineData {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode coastline data")
        .0
}

/// The "land use and POI demand points" artefact (`landuse.bin`, CLAUDE.md
/// data pipeline step 3) — moved here 2026-11-15 from `pipeline::landuse`
/// (which now re-exports these same names) so `game-wasm` can decode the
/// real data too, the same split `CoastlineData` above already uses.
/// `pipeline::landuse` still owns the actual OSM tag classification
/// (`classify_zone_tags`/`classify_poi_tags`) — only the data SHAPE moved,
/// not the extraction logic. This pass only classifies and extracts raw
/// geometry; DESIGN.md §2's own "Demand" section ("Generated from OSM land
/// use...") is deliberately not given a precise weighting formula there,
/// so real demand-weight figures are computed client-side
/// (`src/renderer/landuse-demand.mts`) from this raw classified data,
/// not baked in at pipeline time.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum DemandCategory {
    Housing,
    Retail,
    Schools,
    Workplaces,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct LandUseZone {
    pub osm_id: i64,
    pub category: DemandCategory,
    pub centroid_lon_e7: i32,
    pub centroid_lat_e7: i32,
    pub name: Option<String>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct Poi {
    pub osm_id: i64,
    pub category: DemandCategory,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct LandUseData {
    pub zones: Vec<LandUseZone>,
    pub pois: Vec<Poi>,
}

pub fn encode_landuse(data: &LandUseData) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode land use data")
}

pub fn decode_landuse(bytes: &[u8]) -> LandUseData {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode land use data")
        .0
}

/// The real Scotland political border (T190, 2026-11-14) — genuinely
/// separate from the extract boundary `boundary.rs` already uses
/// (`extract-boundary.poly`/`RoadGraph` clipping), which is deliberately
/// extended south into England (the hand-drawn Carlisle/Berwick corridor,
/// confirmed by reading that file's own doc comment) and so would wrongly
/// pass Carlisle/Berwick/Newcastle for a genuine "is this really in
/// Scotland" check. This artefact is built from Geofabrik's own
/// `scotland.poly` region boundary file (the real political border,
/// `data/scotland-boundary.poly`) instead — one or more outer rings, same
/// `i32` lon_e7/lat_e7 fixed-point convention as every other artefact
/// here, no serde. Consumed by `game-wasm`'s `point_in_scotland` for the
/// National Express Scottish route-terminus restriction
/// (livery-seed-data.mts).
#[derive(bincode::Encode, bincode::Decode)]
pub struct ScotlandBoundary {
    pub rings: Vec<Vec<(i32, i32)>>,
}

pub fn encode_scotland_boundary(data: &ScotlandBoundary) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode scotland boundary")
}

pub fn decode_scotland_boundary(bytes: &[u8]) -> ScotlandBoundary {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode scotland boundary")
        .0
}

/// The real Wales political border (2026-11-15) — exact structural mirror
/// of `ScotlandBoundary` above, built from Geofabrik's own `wales.poly`
/// region boundary file (`data/wales-boundary.poly`) instead of
/// `scotland.poly`. Added at the user's own direct instruction: "National
/// Express Welsh... should follow all the same rules as the Scottish
/// livery except Wales instead of Scotland." Consumed by `game-wasm`'s
/// `point_in_wales` for the National Express Welsh route-terminus
/// restriction (livery-seed-data.mts).
#[derive(bincode::Encode, bincode::Decode)]
pub struct WalesBoundary {
    pub rings: Vec<Vec<(i32, i32)>>,
}

pub fn encode_wales_boundary(data: &WalesBoundary) -> Vec<u8> {
    bincode::encode_to_vec(data, bincode::config::standard()).expect("encode wales boundary")
}

pub fn decode_wales_boundary(bytes: &[u8]) -> WalesBoundary {
    bincode::decode_from_slice(bytes, bincode::config::standard())
        .expect("decode wales boundary")
        .0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_speed_table_covers_every_highway_class_with_a_plausible_value() {
        assert_eq!(HIGHWAY_CLASS_DEFAULT_SPEED_MPH.len(), 15, "one entry per HighwayClass variant");
        for &mph in &HIGHWAY_CLASS_DEFAULT_SPEED_MPH {
            assert!(mph > 0 && mph <= 70, "speed out of a sane UK road range: {mph}");
        }
        assert_eq!(HIGHWAY_CLASS_DEFAULT_SPEED_MPH[0], 70, "motorway is the fastest class");
    }

    #[test]
    fn scotland_boundary_round_trips_through_encode_decode() {
        let data = ScotlandBoundary {
            rings: vec![vec![(-31_883_000, 559_533_000), (-10_000_000, 600_000_000), (-20_000_000, 580_000_000)], vec![(0, 0), (1, 1), (2, 2)]],
        };
        let bytes = encode_scotland_boundary(&data);
        let decoded = decode_scotland_boundary(&bytes);
        assert_eq!(decoded.rings.len(), 2);
        assert_eq!(decoded.rings[0], data.rings[0]);
        assert_eq!(decoded.rings[1], data.rings[1]);
    }

    #[test]
    fn wales_boundary_round_trips_through_encode_decode() {
        let data = WalesBoundary {
            rings: vec![vec![(-32_000_000, 517_000_000), (-30_000_000, 520_000_000), (-31_000_000, 518_000_000)], vec![(0, 0), (1, 1), (2, 2)]],
        };
        let bytes = encode_wales_boundary(&data);
        let decoded = decode_wales_boundary(&bytes);
        assert_eq!(decoded.rings.len(), 2);
        assert_eq!(decoded.rings[0], data.rings[0]);
        assert_eq!(decoded.rings[1], data.rings[1]);
    }
}
