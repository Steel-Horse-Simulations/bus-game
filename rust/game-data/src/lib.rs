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
}
