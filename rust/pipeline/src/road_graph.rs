use crate::boundary::{point_in_boundary, Ring};
pub use game_data::OnewayDirection;
use osmpbf::{Element, ElementReader};
use std::collections::HashMap;

/// Node coordinates for every node inside the extract boundary, keyed by OSM
/// node id. Stored as nanodegrees (1e-7 deg, matching OSM's own on-disk
/// convention) rather than f64, since every node in the graph needs this and
/// it halves the memory footprint versus f64 lon/lat.
pub struct NodeCoords {
    by_id: HashMap<i64, (i32, i32)>,
}

impl NodeCoords {
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    fn contains(&self, id: i64) -> bool {
        self.by_id.contains_key(&id)
    }

    pub fn get(&self, id: i64) -> Option<(i32, i32)> {
        self.by_id.get(&id).copied()
    }

    #[cfg(test)]
    pub fn from_pairs(pairs: impl IntoIterator<Item = (i64, (i32, i32))>) -> Self {
        Self {
            by_id: pairs.into_iter().collect(),
        }
    }
}

fn to_e7(deg: f64) -> i32 {
    (deg * 1e7).round() as i32
}

pub struct NodePassResult {
    pub coords: NodeCoords,
    pub stops: Vec<crate::stops::Stop>,
    pub bus_station_nodes: Vec<crate::stops::BusStation>,
    pub poi_nodes: Vec<crate::landuse::Poi>,
    pub venue_nodes: Vec<crate::venues::Venue>,
}

/// Pass 1: stream the whole file once, keeping the coordinates of every node
/// inside the extract boundary (needed before pass 2 can decide which ways
/// touch our area, since ways only carry node *references*), and — since
/// we're already looking at every node's tags to test the boundary — also
/// classifying point-mapped stops and bus stations here rather than paying
/// for a third full-file pass.
pub fn collect_boundary_node_coords(pbf_path: &str, rings: &[Ring]) -> NodePassResult {
    let reader = ElementReader::from_path(pbf_path)
        .unwrap_or_else(|e| panic!("failed to open {pbf_path}: {e}"));

    let mut by_id = HashMap::with_capacity(45_000_000);
    let mut stops = Vec::new();
    let mut bus_station_nodes = Vec::new();
    let mut poi_nodes = Vec::new();
    let mut venue_nodes = Vec::new();

    reader
        .for_each(|element| match element {
            Element::Node(n) => visit_node(
                n.id(),
                n.lon(),
                n.lat(),
                n.tags(),
                rings,
                &mut by_id,
                &mut stops,
                &mut bus_station_nodes,
                &mut poi_nodes,
                &mut venue_nodes,
            ),
            Element::DenseNode(n) => visit_node(
                n.id(),
                n.lon(),
                n.lat(),
                n.tags(),
                rings,
                &mut by_id,
                &mut stops,
                &mut bus_station_nodes,
                &mut poi_nodes,
                &mut venue_nodes,
            ),
            _ => {}
        })
        .unwrap_or_else(|e| panic!("pass 1 (node collection) failed on {pbf_path}: {e}"));

    NodePassResult {
        coords: NodeCoords { by_id },
        stops,
        bus_station_nodes,
        poi_nodes,
        venue_nodes,
    }
}

#[allow(clippy::too_many_arguments)]
fn visit_node<'a>(
    id: i64,
    lon: f64,
    lat: f64,
    tags: impl Iterator<Item = (&'a str, &'a str)> + Clone,
    rings: &[Ring],
    by_id: &mut HashMap<i64, (i32, i32)>,
    stops: &mut Vec<crate::stops::Stop>,
    bus_station_nodes: &mut Vec<crate::stops::BusStation>,
    poi_nodes: &mut Vec<crate::landuse::Poi>,
    venue_nodes: &mut Vec<crate::venues::Venue>,
) {
    if !point_in_boundary(lon, lat, rings) {
        return;
    }
    let (lon_e7, lat_e7) = (to_e7(lon), to_e7(lat));
    by_id.insert(id, (lon_e7, lat_e7));

    match crate::stops::classify_node_tags(tags.clone()) {
        crate::stops::NodeClassification::Stop(kind) => {
            stops.push(crate::stops::Stop {
                osm_id: id,
                lon_e7,
                lat_e7,
                name: crate::stops::name_tag(tags.clone()),
                kind,
            });
        }
        crate::stops::NodeClassification::BusStation => {
            bus_station_nodes.push(crate::stops::BusStation {
                osm_id: id,
                lon_e7,
                lat_e7,
                name: crate::stops::name_tag(tags.clone()),
            });
        }
        crate::stops::NodeClassification::None => {}
    }

    if let Some(category) = crate::landuse::classify_poi_tags(tags.clone()) {
        poi_nodes.push(crate::landuse::Poi {
            osm_id: id,
            category,
            lon_e7,
            lat_e7,
            name: crate::landuse::name_tag(tags.clone()),
        });
    }

    if let Some(kind) = crate::venues::classify_venue_tags(tags.clone()) {
        venue_nodes.push(crate::venues::Venue {
            osm_id: id,
            kind,
            lon_e7,
            lat_e7,
            name: crate::venues::name_tag(tags),
        });
    }
}

/// Vehicle-navigable highway classes we care about for the road graph.
/// Deliberately excludes footway/cycleway/path/steps/pedestrian/bridleway
/// (not drivable) and highway=services/rest_area (area features, not through
/// routes) — this is the drivable network buses and dead-running use, not a
/// pedestrian graph.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HighwayClass {
    Motorway,
    MotorwayLink,
    Trunk,
    TrunkLink,
    Primary,
    PrimaryLink,
    Secondary,
    SecondaryLink,
    Tertiary,
    TertiaryLink,
    Unclassified,
    Residential,
    LivingStreet,
    Service,
    Track,
}

impl HighwayClass {
    pub const ALL: [HighwayClass; 15] = [
        Self::Motorway,
        Self::MotorwayLink,
        Self::Trunk,
        Self::TrunkLink,
        Self::Primary,
        Self::PrimaryLink,
        Self::Secondary,
        Self::SecondaryLink,
        Self::Tertiary,
        Self::TertiaryLink,
        Self::Unclassified,
        Self::Residential,
        Self::LivingStreet,
        Self::Service,
        Self::Track,
    ];

    fn from_tag(v: &str) -> Option<Self> {
        Some(match v {
            "motorway" => Self::Motorway,
            "motorway_link" => Self::MotorwayLink,
            "trunk" => Self::Trunk,
            "trunk_link" => Self::TrunkLink,
            "primary" => Self::Primary,
            "primary_link" => Self::PrimaryLink,
            "secondary" => Self::Secondary,
            "secondary_link" => Self::SecondaryLink,
            "tertiary" => Self::Tertiary,
            "tertiary_link" => Self::TertiaryLink,
            "unclassified" => Self::Unclassified,
            "residential" => Self::Residential,
            "living_street" => Self::LivingStreet,
            "service" => Self::Service,
            "track" => Self::Track,
            _ => return None,
        })
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Motorway => "motorway",
            Self::MotorwayLink => "motorway_link",
            Self::Trunk => "trunk",
            Self::TrunkLink => "trunk_link",
            Self::Primary => "primary",
            Self::PrimaryLink => "primary_link",
            Self::Secondary => "secondary",
            Self::SecondaryLink => "secondary_link",
            Self::Tertiary => "tertiary",
            Self::TertiaryLink => "tertiary_link",
            Self::Unclassified => "unclassified",
            Self::Residential => "residential",
            Self::LivingStreet => "living_street",
            Self::Service => "service",
            Self::Track => "track",
        }
    }

    /// Inferred carriageway width in metres, used to fill the route band to
    /// the road's width when rendering (DESIGN.md §11). OSM splits dual
    /// carriageways into one one-way way per direction, so this is the width
    /// of what a single way represents, not the whole road. Figures agreed
    /// 2026-09-01: UK single-carriageway A-road standard (7.3m) for
    /// trunk/primary, DMRB-derived defaults elsewhere.
    pub fn width_metres(&self) -> f32 {
        match self {
            Self::Motorway => 11.0,
            Self::MotorwayLink => 6.0,
            Self::Trunk => 7.3,
            Self::TrunkLink => 5.5,
            Self::Primary => 7.3,
            Self::PrimaryLink => 5.5,
            Self::Secondary => 6.5,
            Self::SecondaryLink => 5.0,
            Self::Tertiary => 6.0,
            Self::TertiaryLink => 5.0,
            Self::Unclassified => 5.5,
            Self::Residential => 5.5,
            Self::LivingStreet => 5.0,
            Self::Service => 3.5,
            Self::Track => 3.0,
        }
    }

    pub fn index(self) -> usize {
        self as usize
    }

    /// Default speed (mph) for a way of this class with no `maxspeed` tag —
    /// see `game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH` for the figures and
    /// why the table itself lives in the shared crate rather than here.
    pub fn default_speed_mph(&self) -> u16 {
        game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH[self.index()]
    }
}

/// Everything pass 2 needs to keep about a qualifying highway way, ready for
/// graph-topology building in pass 3 (in-memory, no further file reads).
pub struct WayRecord {
    pub id: i64,
    pub class: HighwayClass,
    pub oneway: OnewayDirection,
    pub access_restricted: bool,
    pub psv_yes: bool,
    pub bus_yes: bool,
    pub maxspeed_mph: Option<u16>,
    /// Parsed `width` tag, in metres — authoritative but rare.
    pub width_tag_m: Option<f32>,
    /// Parsed `lanes` tag — a much better proxy than class alone, since a
    /// two-lane and a four-lane primary are the same class but very
    /// different roads.
    pub lanes: Option<u8>,
    pub refs: Vec<i64>,
}

/// A typical UK traffic lane, plus a margin for verge/markings/edge
/// clearance — used only when a way has `lanes` but no `width` tag. Figures
/// are a deliberate approximation (DESIGN.md §1 asks for "a typical lane
/// width and a margin" without specifying one); roughly calibrated so
/// lanes=2 lands close to the primary/trunk class default of 7.3m.
const LANE_WIDTH_M: f32 = 3.0;
const LANE_MARGIN_M: f32 = 1.0;

/// Parses an OSM `width` tag. Values are plain metres, sometimes with an
/// explicit `m` suffix (e.g. `"6"`, `"6.5 m"`) — imperial-unit values
/// (`"20'"`) are rare enough on UK roads to skip for now. A sanity range
/// guards against mistagged values (e.g. a width in centimetres) leaking
/// into the graph.
fn parse_width_metres(raw: &str) -> Option<f32> {
    let trimmed = raw.trim();
    let numeric = trimmed.strip_suffix('m').map(str::trim).unwrap_or(trimmed);
    numeric
        .parse::<f32>()
        .ok()
        .filter(|w| (0.5..50.0).contains(w))
}

/// Parses an OSM `maxspeed` tag to mph — the UK's own unit, and OSM's
/// documented default for UK ways when no unit is given (unlike most of
/// Europe, where an unsuffixed value means km/h). Handles `"30 mph"`,
/// `"48 km/h"`, and bare `"30"` (assumed mph). `national` (the NSL) needs
/// road type and vehicle class to resolve and isn't handled here — a known
/// gap, left as `None` rather than guessed.
fn parse_maxspeed_mph(raw: &str) -> Option<u16> {
    let trimmed = raw.trim();
    if let Some(mph) = trimmed.strip_suffix("mph").map(str::trim) {
        return mph.parse::<u16>().ok();
    }
    if let Some(kmh) = trimmed.strip_suffix("km/h").map(str::trim) {
        return kmh
            .parse::<f32>()
            .ok()
            .map(|kmh| (kmh / 1.60934).round() as u16);
    }
    trimmed.parse::<u16>().ok()
}

impl WayRecord {
    /// Width fallback settled 2026-09-03: the `width` tag where present,
    /// then `lanes` scaled by a typical lane width and margin, then the
    /// highway-class default.
    pub fn inferred_width_m(&self) -> f32 {
        self.width_tag_m
            .or_else(|| self.lanes.map(|n| n as f32 * LANE_WIDTH_M + LANE_MARGIN_M))
            .unwrap_or_else(|| self.class.width_metres())
    }
}

/// A `type=restriction` relation, kept in raw OSM-id form. Resolving these to
/// graph node/edge indices happens in pass 3, once the graph exists.
pub struct RestrictionRecord {
    /// Kept for debugging/override-layer traceability, unused by pass 3 itself.
    #[allow(dead_code)]
    pub id: i64,
    pub restriction_type: String,
    pub from_way: Option<i64>,
    pub via_node: Option<i64>,
    pub via_way: Option<i64>,
    pub to_way: Option<i64>,
}

#[derive(Clone, Default)]
pub struct WayStats {
    pub total_matched: u64,
    pub by_class: [u64; 15],
    pub oneway_forward: u64,
    pub oneway_reverse: u64,
    pub access_restricted: u64,
    pub psv_yes: u64,
    pub bus_yes: u64,
    pub maxspeed_present: u64,
}


pub struct ScanResult {
    pub stats: WayStats,
    pub ways: Vec<WayRecord>,
    pub restrictions: Vec<RestrictionRecord>,
    /// How many qualifying ways reference each node — needed in pass 3 to
    /// tell a real junction (shared by 2+ ways) from an ordinary shape point.
    pub node_ref_counts: HashMap<i64, u32>,
    /// Bus stations mapped as closed ways (as opposed to a single node) —
    /// position is the centroid of their resolved nodes.
    pub bus_station_ways: Vec<crate::stops::BusStation>,
    pub stop_areas: Vec<crate::stops::StopArea>,
    /// `landuse=*` zone polygons — centroid only, not full footprints.
    pub landuse_zones: Vec<crate::landuse::LandUseZone>,
    /// POIs mapped as closed ways (school/shop/office/hospital buildings) —
    /// position is the centroid of their resolved nodes.
    pub poi_ways: Vec<crate::landuse::Poi>,
    /// Venues (stadium/ferry terminal/park-and-ride) mapped as closed ways —
    /// position is the centroid of their resolved nodes.
    pub venue_ways: Vec<crate::venues::Venue>,
}

/// Pass 2: stream the file once more, sequentially. Covers ways (tags +
/// refs, for stats and later topology) and `type=restriction` relations in
/// the same pass — relations come after ways in a valid .osm.pbf, so there's
/// no need for a third file read just to pick them up. A way counts as "in
/// the extract" if any of its referenced nodes were kept in pass 1 — partial
/// overlap is fine at this checkpoint (border-crossing ways are a known
/// simplification: edges that reach outside the boundary get truncated where
/// coordinates run out, rather than causing a panic).
pub fn scan_ways_and_relations(pbf_path: &str, nodes: &NodeCoords) -> ScanResult {
    let reader = ElementReader::from_path(pbf_path)
        .unwrap_or_else(|e| panic!("failed to open {pbf_path}: {e}"));

    let mut stats = WayStats::default();
    let mut ways = Vec::with_capacity(700_000);
    let mut restrictions = Vec::new();
    let mut node_ref_counts: HashMap<i64, u32> = HashMap::with_capacity(15_000_000);
    let mut bus_station_ways = Vec::new();
    let mut stop_areas = Vec::new();
    let mut landuse_zones = Vec::new();
    let mut venue_ways = Vec::new();
    let mut poi_ways = Vec::new();

    reader
        .for_each(|element| match element {
            Element::Way(way) => {
                let mut highway_tag = None;
                let mut class = None;
                let mut oneway = OnewayDirection::TwoWay;
                let mut oneway_tag_seen = false;
                let mut junction_tag = None;
                let mut access_restricted = false;
                let mut psv_yes = false;
                let mut bus_yes = false;
                let mut maxspeed_mph = None;
                let mut width_tag_m = None;
                let mut lanes = None;
                let mut is_bus_station = false;
                let mut name = None;

                for (k, v) in way.tags() {
                    match k {
                        "highway" => {
                            highway_tag = Some(v);
                            class = HighwayClass::from_tag(v);
                        }
                        "oneway" => {
                            oneway_tag_seen = true;
                            oneway = match v {
                                "yes" | "true" | "1" => OnewayDirection::Forward,
                                "-1" | "reverse" => OnewayDirection::Reverse,
                                _ => OnewayDirection::TwoWay,
                            }
                        }
                        "junction" => junction_tag = Some(v),
                        "access" if matches!(v, "no" | "private") => access_restricted = true,
                        "psv" if v == "yes" => psv_yes = true,
                        "bus" if v == "yes" => bus_yes = true,
                        "maxspeed" => maxspeed_mph = parse_maxspeed_mph(v),
                        "width" => width_tag_m = parse_width_metres(v),
                        "lanes" => lanes = v.parse::<u8>().ok(),
                        "amenity" if v == "bus_station" => is_bus_station = true,
                        "name" => name = Some(v.to_string()),
                        _ => {}
                    }
                }

                // `junction=roundabout` (also `circular`) implies oneway in
                // the way's own node direction by long-standing OSM
                // convention, same as every other router treats it — but
                // only where the mapper hasn't tagged `oneway` explicitly
                // (rare, but an explicit tag, `no` included, always wins).
                // Missing this sent buses the wrong way around every
                // roundabout with no separate `oneway` tag, which is most
                // of them: the way is legally one-way by the junction tag
                // alone, and nothing else in the data says so.
                if !oneway_tag_seen && matches!(junction_tag, Some("roundabout") | Some("circular")) {
                    oneway = OnewayDirection::Forward;
                }

                // A real, common UK pattern: a pedestrianised street that
                // still explicitly permits buses (`highway=pedestrian` +
                // `bus=yes`/`psv=yes` — a bus gate), Waverley Bridge's
                // central section in Edinburgh being the discovered case.
                // `HighwayClass::from_tag` deliberately has no `pedestrian`
                // variant (rightly so for the general case — most
                // pedestrian ways aren't bus-legal), so without this the
                // psv/bus override tags never get a chance to apply at all:
                // the way was dropped as non-drivable before either tag was
                // even consulted, silently breaking routing (and, since
                // Planetiler classifies it as non-road too, rendering)
                // straight through a street real buses actually use.
                if class.is_none() && highway_tag == Some("pedestrian") && (psv_yes || bus_yes) {
                    class = Some(HighwayClass::Service);
                }

                let refs: Vec<i64> = way.refs().collect();

                // Bus stations, landuse zones and POIs mapped as closed ways
                // carry no highway tag, so they must be handled before the
                // highway-only early return below, or they'd be silently
                // dropped. All three need a resolved centroid to be worth
                // keeping.
                if class.is_none() {
                    let centroid = || crate::stops::way_centroid_e7(&refs, |id| nodes.get(id));
                    if is_bus_station {
                        if let Some((lon_e7, lat_e7)) = centroid() {
                            bus_station_ways.push(crate::stops::BusStation {
                                osm_id: way.id(),
                                lon_e7,
                                lat_e7,
                                name,
                            });
                        }
                        return;
                    }
                    if let Some(category) = crate::landuse::classify_zone_tags(way.tags()) {
                        if let Some((centroid_lon_e7, centroid_lat_e7)) = centroid() {
                            landuse_zones.push(crate::landuse::LandUseZone {
                                osm_id: way.id(),
                                category,
                                centroid_lon_e7,
                                centroid_lat_e7,
                                name,
                            });
                        }
                        return;
                    }
                    if let Some(category) = crate::landuse::classify_poi_tags(way.tags()) {
                        if let Some((lon_e7, lat_e7)) = centroid() {
                            poi_ways.push(crate::landuse::Poi {
                                osm_id: way.id(),
                                category,
                                lon_e7,
                                lat_e7,
                                name,
                            });
                        }
                        return;
                    }
                    if let Some(kind) = crate::venues::classify_venue_tags(way.tags()) {
                        if let Some((lon_e7, lat_e7)) = centroid() {
                            venue_ways.push(crate::venues::Venue {
                                osm_id: way.id(),
                                kind,
                                lon_e7,
                                lat_e7,
                                name,
                            });
                        }
                        return;
                    }
                }

                let Some(class) = class else { return };
                if !refs.iter().any(|&id| nodes.contains(id)) {
                    return;
                }

                stats.total_matched += 1;
                stats.by_class[class.index()] += 1;
                match oneway {
                    OnewayDirection::Forward => stats.oneway_forward += 1,
                    OnewayDirection::Reverse => stats.oneway_reverse += 1,
                    OnewayDirection::TwoWay => {}
                }
                if access_restricted {
                    stats.access_restricted += 1;
                }
                if psv_yes {
                    stats.psv_yes += 1;
                }
                if bus_yes {
                    stats.bus_yes += 1;
                }
                if maxspeed_mph.is_some() {
                    stats.maxspeed_present += 1;
                }

                for &id in &refs {
                    *node_ref_counts.entry(id).or_insert(0) += 1;
                }

                ways.push(WayRecord {
                    id: way.id(),
                    class,
                    oneway,
                    access_restricted,
                    psv_yes,
                    bus_yes,
                    maxspeed_mph,
                    width_tag_m,
                    lanes,
                    refs,
                });
            }
            Element::Relation(rel) => {
                let is_restriction = rel.tags().any(|(k, v)| k == "type" && v == "restriction");
                let is_stop_area = crate::stops::is_stop_area_relation(rel.tags());

                if is_stop_area {
                    let name = crate::stops::name_tag(rel.tags());
                    let member_stop_osm_ids = rel
                        .members()
                        .filter(|m| m.member_type == osmpbf::RelMemberType::Node)
                        .map(|m| m.member_id)
                        .collect();
                    stop_areas.push(crate::stops::StopArea {
                        osm_id: rel.id(),
                        name,
                        member_stop_osm_ids,
                    });
                    return;
                }

                if !is_restriction {
                    return;
                }
                let restriction_type = rel
                    .tags()
                    .find(|(k, _)| *k == "restriction")
                    .map(|(_, v)| v.to_string());
                let Some(restriction_type) = restriction_type else {
                    return;
                };

                let mut from_way = None;
                let mut via_node = None;
                let mut via_way = None;
                let mut to_way = None;
                for member in rel.members() {
                    match (member.role().unwrap_or(""), member.member_type) {
                        ("from", osmpbf::RelMemberType::Way) => from_way = Some(member.member_id),
                        ("via", osmpbf::RelMemberType::Node) => via_node = Some(member.member_id),
                        ("via", osmpbf::RelMemberType::Way) => via_way = Some(member.member_id),
                        ("to", osmpbf::RelMemberType::Way) => to_way = Some(member.member_id),
                        _ => {}
                    }
                }

                restrictions.push(RestrictionRecord {
                    id: rel.id(),
                    restriction_type,
                    from_way,
                    via_node,
                    via_way,
                    to_way,
                });
            }
            _ => {}
        })
        .unwrap_or_else(|e| panic!("pass 2 (way/relation scan) failed on {pbf_path}: {e}"));

    ScanResult {
        stats,
        ways,
        restrictions,
        node_ref_counts,
        bus_station_ways,
        stop_areas,
        landuse_zones,
        poi_ways,
        venue_ways,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Pins the agreed width table (2026-09-01) so a future edit can't drift
    // it silently — change the numbers here deliberately if they're revised.
    #[test]
    fn width_table_matches_agreed_figures() {
        let expected: [(HighwayClass, f32); 15] = [
            (HighwayClass::Motorway, 11.0),
            (HighwayClass::MotorwayLink, 6.0),
            (HighwayClass::Trunk, 7.3),
            (HighwayClass::TrunkLink, 5.5),
            (HighwayClass::Primary, 7.3),
            (HighwayClass::PrimaryLink, 5.5),
            (HighwayClass::Secondary, 6.5),
            (HighwayClass::SecondaryLink, 5.0),
            (HighwayClass::Tertiary, 6.0),
            (HighwayClass::TertiaryLink, 5.0),
            (HighwayClass::Unclassified, 5.5),
            (HighwayClass::Residential, 5.5),
            (HighwayClass::LivingStreet, 5.0),
            (HighwayClass::Service, 3.5),
            (HighwayClass::Track, 3.0),
        ];
        for (class, width) in expected {
            assert_eq!(
                class.width_metres(),
                width,
                "{} width changed unexpectedly",
                class.label()
            );
        }
    }

    // Pins the assumed default-speed table (2026-09-10) so a future edit
    // can't drift it silently — change the numbers here deliberately if
    // they're revised. See `game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH`'s
    // doc comment for the reasoning (UK bus/coach statutory limits).
    #[test]
    fn default_speed_table_matches_agreed_figures() {
        let expected: [(HighwayClass, u16); 15] = [
            (HighwayClass::Motorway, 70),
            (HighwayClass::MotorwayLink, 50),
            (HighwayClass::Trunk, 60),
            (HighwayClass::TrunkLink, 40),
            (HighwayClass::Primary, 50),
            (HighwayClass::PrimaryLink, 40),
            (HighwayClass::Secondary, 40),
            (HighwayClass::SecondaryLink, 30),
            (HighwayClass::Tertiary, 30),
            (HighwayClass::TertiaryLink, 30),
            (HighwayClass::Unclassified, 30),
            (HighwayClass::Residential, 20),
            (HighwayClass::LivingStreet, 10),
            (HighwayClass::Service, 10),
            (HighwayClass::Track, 15),
        ];
        for (class, mph) in expected {
            assert_eq!(
                class.default_speed_mph(),
                mph,
                "{} default speed changed unexpectedly",
                class.label()
            );
        }
    }

    fn way_with(class: HighwayClass, width_tag_m: Option<f32>, lanes: Option<u8>) -> WayRecord {
        WayRecord {
            id: 1,
            class,
            oneway: OnewayDirection::TwoWay,
            access_restricted: false,
            psv_yes: false,
            bus_yes: false,
            maxspeed_mph: None,
            width_tag_m,
            lanes,
            refs: vec![1, 2],
        }
    }

    #[test]
    fn width_tag_wins_over_lanes_and_class() {
        let way = way_with(HighwayClass::Residential, Some(8.0), Some(2));
        assert_eq!(way.inferred_width_m(), 8.0);
    }

    #[test]
    fn lanes_used_when_no_width_tag() {
        let way = way_with(HighwayClass::Primary, None, Some(2));
        assert_eq!(way.inferred_width_m(), 2.0 * LANE_WIDTH_M + LANE_MARGIN_M);
    }

    #[test]
    fn class_default_used_when_neither_tag_present() {
        let way = way_with(HighwayClass::Primary, None, None);
        assert_eq!(way.inferred_width_m(), HighwayClass::Primary.width_metres());
    }

    #[test]
    fn parse_width_metres_handles_plain_and_suffixed_values() {
        assert_eq!(parse_width_metres("6"), Some(6.0));
        assert_eq!(parse_width_metres("6.5"), Some(6.5));
        assert_eq!(parse_width_metres("6.5 m"), Some(6.5));
        assert_eq!(parse_width_metres("6.5m"), Some(6.5));
        assert_eq!(parse_width_metres("not-a-number"), None);
        assert_eq!(parse_width_metres("0.01"), None, "implausibly narrow, rejected");
        assert_eq!(parse_width_metres("999"), None, "implausibly wide, rejected");
    }

    #[test]
    fn parse_maxspeed_mph_handles_the_common_uk_forms() {
        assert_eq!(parse_maxspeed_mph("30"), Some(30), "bare number: UK default is mph");
        assert_eq!(parse_maxspeed_mph("30 mph"), Some(30));
        assert_eq!(parse_maxspeed_mph("70mph"), Some(70));
        assert_eq!(parse_maxspeed_mph("48 km/h"), Some(30), "48 km/h rounds to 30 mph");
        assert_eq!(parse_maxspeed_mph("national"), None, "NSL needs road/vehicle context, not resolved here");
        assert_eq!(parse_maxspeed_mph("signals"), None);
    }
}
