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

#[derive(bincode::Encode, bincode::Decode)]
pub struct GraphNode {
    pub osm_id: i64,
    pub lon_e7: i32,
    pub lat_e7: i32,
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
    /// Shape points between `from` and `to`, exclusive of both endpoints.
    pub geometry: Vec<(i32, i32)>,
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
