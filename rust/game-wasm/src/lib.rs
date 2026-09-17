use game_data::{OnewayDirection, RoadGraph, StopKind};
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashSet};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// One directed hop usable from a node: which edge to take, and which node
/// it leads to. Built once from the graph's oneway/access tags so pathfinding
/// itself never has to re-check them.
struct Hop {
    edge: u32,
    to_node: u32,
}

/// A road graph loaded for pathfinding — `RoadGraph` plus a directed
/// adjacency list built from it. Kept separate from `game_data::RoadGraph`
/// itself since the adjacency list is a routing-specific derived structure,
/// not part of the on-disk artefact.
#[wasm_bindgen]
pub struct Router {
    graph: RoadGraph,
    adjacency: Vec<Vec<Hop>>,
    /// Edge ids used by the most recent `find_route` call, in traversal
    /// order — set alongside the coordinate result so a caller can ask
    /// `last_route_edges()` afterwards without a second Dijkstra run.
    /// `RefCell` rather than changing methods to `&mut self`: the JS side
    /// doesn't care either way, but this keeps `find_route`'s existing
    /// call shape unchanged.
    last_edges: RefCell<Vec<u32>>,
    /// Point count contributed by each edge in `last_edges`, in the same
    /// order — `edge.geometry.len() + 1` per edge, matching how `find_route`
    /// itself builds the flat coordinate array. Lets a caller slice that
    /// flat array back into one chunk per edge without re-deriving it.
    last_edge_point_counts: RefCell<Vec<u32>>,
    /// OSM way ids the player has manually flagged as bus-legal despite
    /// their own tags saying otherwise (DESIGN.md §1's override layer,
    /// extended here from stops/bus stations to road edges — CLAUDE.md's
    /// "OSM data quality" hard part: "missing turn restrictions and
    /// mis-tagged one-ways... the override layer must be built once and
    /// reused"). A real case that prompted this: a stretch of Gordon
    /// Street right outside Glasgow Central Station is tagged `access=no`
    /// with no `psv`/`bus` override, even though a real named bus stop
    /// sits on it — almost certainly a tagging gap, not a genuine
    /// restriction, but not something to silently override for every
    /// `access=no` road without evidence. `HashSet` for O(1) lookup since
    /// every edge in the graph is checked against it at construction and
    /// on every `nearest_node` scan.
    psv_override_way_ids: HashSet<i64>,
    /// Total travel time (seconds) of the most recent `find_route` call,
    /// including junction delays — computed once by `dijkstra` itself as it
    /// searches, since a junction delay depends on which edge was used to
    /// *arrive* at each node, information `last_route_time_seconds` can no
    /// longer recover just by re-summing `last_edges`' own plain edge costs
    /// (unlike before junction delays existed).
    last_route_time_seconds: RefCell<f64>,
    /// Whether each node has at least one *incoming* routable hop — the
    /// mirror image of `adjacency` (which only records *outgoing* hops).
    /// A real bug this fixes: `nearest_node` already preferred an
    /// outgoing-capable node for a route's *start* (a dead-end start sends
    /// the route nowhere), but a *goal* had no equivalent check — it just
    /// picked whichever endpoint of the nearest edge was closer by raw
    /// distance, even if that endpoint could only ever be *departed*, never
    /// *arrived at* (a one-way edge only registers a hop one way). Found via
    /// a real user report: a stop sat almost exactly on a short one-way
    /// service road, and `find_route` returned zero points even though a
    /// point barely 10m further away routed fine — the goal had silently
    /// snapped to an unreachable node.
    has_incoming: Vec<bool>,
}

fn edge_is_routable(edge: &game_data::Edge, psv_override_way_ids: &HashSet<i64>) -> bool {
    // A road buses can't legally use at all is excluded outright; psv/bus
    // tags are specifically the OSM convention for "closed to general
    // traffic but open to buses", so they override the restriction — same
    // as a player's own override, which is checked identically here rather
    // than as a separate pass.
    !edge.access_restricted
        || edge.psv_yes
        || edge.bus_yes
        || psv_override_way_ids.contains(&edge.osm_way_id)
}

const MPH_TO_MPS: f64 = 0.44704;

/// Time in seconds to traverse an edge at its effective speed — the
/// `maxspeed` tag where present, otherwise the class default (DESIGN.md
/// §1's "road width" three-step fallback has the same shape: a real tag
/// first, a table of defaults otherwise). Used as Dijkstra's edge cost so
/// the router finds the fastest route rather than the shortest one
/// (DESIGN.md §6: "Auto-routing takes the fastest route, not the shortest —
/// accounting for speed limits, not just distance").
fn edge_time_cost_s(edge: &game_data::Edge) -> f64 {
    let mph = edge
        .maxspeed_mph
        .unwrap_or(game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH[edge.class as usize]);
    let mps = mph as f64 * MPH_TO_MPS;
    edge.length_m as f64 / mps
}

// Placeholder magnitudes, not sourced figures — worth revisiting once real
// routes are checked against real timetables, the same as
// `HIGHWAY_CLASS_DEFAULT_SPEED_MPH`. A later increment scales these by time
// of day (heavier traffic queues longer at lights and give-ways, lighter at
// night); this first cut is flat.
const TRAFFIC_SIGNAL_DELAY_S: f64 = 15.0;
const STOP_SIGN_DELAY_S: f64 = 8.0;
const MINI_ROUNDABOUT_DELAY_S: f64 = 5.0;
const GIVE_WAY_DELAY_S: f64 = 8.0;

/// Extra time (seconds) to cross a junction, on top of the plain edge travel
/// time `edge_time_cost_s` already charges — DESIGN.md §2's "journey times
/// come from road class and time of day": the edge cost alone assumes a
/// vehicle holds the speed limit continuously, which is never true at a real
/// junction, and that gap is what made 398's router-computed running time
/// (under 4 minutes) look nothing like its real published time (17 minutes)
/// even at a quiet time of day.
///
/// `incoming_class` is the class of the edge just used to *arrive* at this
/// junction, `None` only at the very start of a route (a bus pulling away
/// from its first stop has nothing to give way to yet, so no delay
/// applies). `outgoing_class` is the edge about to be taken next.
///
/// Traffic signals, a stop sign and a mini-roundabout all apply to any
/// vehicle passing through regardless of which road it's on (nobody skips a
/// red light because their road happens to be the bigger one). An explicit
/// `give_way` tag and a plain untagged junction are handled the same way:
/// only a genuine "joining a more major road" move costs anything — a lower
/// class index is a more major road (the same ordering
/// `HIGHWAY_CLASS_DEFAULT_SPEED_MPH` uses) — since continuing on the
/// same-or-more-major road, or turning onto an equally/less major one, is a
/// plain uncontrolled crossing a real bus wouldn't stop for.
fn junction_delay_s(
    junction_control: game_data::JunctionControl,
    incoming_class: Option<u8>,
    outgoing_class: u8,
) -> f64 {
    use game_data::JunctionControl;
    let Some(incoming_class) = incoming_class else {
        return 0.0;
    };
    match junction_control {
        JunctionControl::TrafficSignals => TRAFFIC_SIGNAL_DELAY_S,
        JunctionControl::Stop => STOP_SIGN_DELAY_S,
        JunctionControl::MiniRoundabout => MINI_ROUNDABOUT_DELAY_S,
        JunctionControl::GiveWay | JunctionControl::None => {
            if outgoing_class < incoming_class {
                GIVE_WAY_DELAY_S
            } else {
                0.0
            }
        }
    }
}

/// Equirectangular approximation, adequate for comparing distances to find
/// the nearest node — not for the route length itself, which uses the
/// graph's own precomputed haversine edge lengths.
fn approx_distance_m(a_lon_e7: i32, a_lat_e7: i32, b_lon_e7: i32, b_lat_e7: i32) -> f64 {
    const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let lat1 = a_lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
    let lat2 = b_lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
    let dlat = lat2 - lat1;
    let dlon = (b_lon_e7 - a_lon_e7) as f64 * 1e-7 * DEG_TO_RAD;
    let x = dlon * ((lat1 + lat2) / 2.0).cos();
    EARTH_RADIUS_M * (dlat * dlat + x * x).sqrt()
}

/// Distance in metres from a point to the segment `a`–`b`, and the closest
/// point on that segment (as `lon_e7, lat_e7`) — via the same local
/// equirectangular flattening as `approx_distance_m` (adequate at the scale
/// of a single road segment). Used both to find which edge is nearest and,
/// since a stop can sit anywhere along a long edge between distant
/// junctions, to snap to the actual nearest point on it rather than
/// whichever junction node happens to be closer — the "stop snaps a long
/// way down the road" bug.
fn point_to_segment_closest(
    p_lon_e7: i32,
    p_lat_e7: i32,
    a_lon_e7: i32,
    a_lat_e7: i32,
    b_lon_e7: i32,
    b_lat_e7: i32,
) -> (f64, i32, i32) {
    const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
    const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let lat0 = (a_lat_e7 as f64 + b_lat_e7 as f64) * 0.5 * 1e-7 * DEG_TO_RAD;
    let cos_lat0 = lat0.cos();
    let to_xy = |lon_e7: i32, lat_e7: i32| -> (f64, f64) {
        let lon = lon_e7 as f64 * 1e-7 * DEG_TO_RAD;
        let lat = lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
        (lon * cos_lat0 * EARTH_RADIUS_M, lat * EARTH_RADIUS_M)
    };
    let (px, py) = to_xy(p_lon_e7, p_lat_e7);
    let (ax, ay) = to_xy(a_lon_e7, a_lat_e7);
    let (bx, by) = to_xy(b_lon_e7, b_lat_e7);

    let (dx, dy) = (bx - ax, by - ay);
    let len_sq = dx * dx + dy * dy;
    let t = if len_sq > 0.0 { ((px - ax) * dx + (py - ay) * dy) / len_sq } else { 0.0 };
    let t = t.clamp(0.0, 1.0);
    let (cx, cy) = (ax + t * dx, ay + t * dy);
    let dist = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();

    let lon_deg = (cx / (cos_lat0 * EARTH_RADIUS_M)) * RAD_TO_DEG;
    let lat_deg = (cy / EARTH_RADIUS_M) * RAD_TO_DEG;
    (dist, (lon_deg * 1e7).round() as i32, (lat_deg * 1e7).round() as i32)
}

/// Which side of the line `a`->`b` the point `p` falls on, via the same
/// local equirectangular flattening as `point_to_segment_closest` — the
/// sign of the 2D cross product `(b-a) x (p-a)`. Positive means `p` is to
/// the **left** of someone facing from `a` towards `b` (standard
/// right-handed convention with x=east, y=north); negative means the
/// right. Used to decide which physical kerb a placed stop belongs on:
/// DESIGN.md §4's "left kerb for the direction of travel" is exactly this
/// side, once the direction of travel itself is known (`Router::
/// place_stop`).
fn signed_side_of_segment(
    p_lon_e7: i32,
    p_lat_e7: i32,
    a_lon_e7: i32,
    a_lat_e7: i32,
    b_lon_e7: i32,
    b_lat_e7: i32,
) -> f64 {
    const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let lat0 = (a_lat_e7 as f64 + b_lat_e7 as f64) * 0.5 * 1e-7 * DEG_TO_RAD;
    let cos_lat0 = lat0.cos();
    let to_xy = |lon_e7: i32, lat_e7: i32| -> (f64, f64) {
        let lon = lon_e7 as f64 * 1e-7 * DEG_TO_RAD;
        let lat = lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
        (lon * cos_lat0 * EARTH_RADIUS_M, lat * EARTH_RADIUS_M)
    };
    let (px, py) = to_xy(p_lon_e7, p_lat_e7);
    let (ax, ay) = to_xy(a_lon_e7, a_lat_e7);
    let (bx, by) = to_xy(b_lon_e7, b_lat_e7);
    (bx - ax) * (py - ay) - (by - ay) * (px - ax)
}

/// Moves a point `offset_m` along the **left** normal of the line `a`->`b`
/// (a negative `offset_m` moves it right instead) — used to slide a road's
/// nearest point sideways onto the correct kerb. Same local flattening as
/// `point_to_segment_closest`/`signed_side_of_segment`; a degenerate
/// zero-length segment (both endpoints coincide, never expected against
/// real road geometry) leaves the point where it is rather than dividing
/// by zero.
fn offset_point_perpendicular(
    point_lon_e7: i32,
    point_lat_e7: i32,
    a_lon_e7: i32,
    a_lat_e7: i32,
    b_lon_e7: i32,
    b_lat_e7: i32,
    offset_m: f64,
) -> (i32, i32) {
    const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
    const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let lat0 = (a_lat_e7 as f64 + b_lat_e7 as f64) * 0.5 * 1e-7 * DEG_TO_RAD;
    let cos_lat0 = lat0.cos();
    let to_xy = |lon_e7: i32, lat_e7: i32| -> (f64, f64) {
        let lon = lon_e7 as f64 * 1e-7 * DEG_TO_RAD;
        let lat = lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
        (lon * cos_lat0 * EARTH_RADIUS_M, lat * EARTH_RADIUS_M)
    };
    let (px, py) = to_xy(point_lon_e7, point_lat_e7);
    let (ax, ay) = to_xy(a_lon_e7, a_lat_e7);
    let (bx, by) = to_xy(b_lon_e7, b_lat_e7);
    let (dx, dy) = (bx - ax, by - ay);
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-9 {
        return (point_lon_e7, point_lat_e7);
    }
    let (nx, ny) = (-dy / len, dx / len); // left normal of a -> b
    let (ox, oy) = (px + nx * offset_m, py + ny * offset_m);
    let lon_deg = (ox / (cos_lat0 * EARTH_RADIUS_M)) * RAD_TO_DEG;
    let lat_deg = (oy / EARTH_RADIUS_M) * RAD_TO_DEG;
    ((lon_deg * 1e7).round() as i32, (lat_deg * 1e7).round() as i32)
}

// Placeholder magnitude, not a sourced real-world kerb offset — same
// caveat as the junction delay constants above, worth revisiting once a
// placed stop is checked against a real kerb-to-centreline distance.
const KERB_OFFSET_M: f64 = 4.5;

#[derive(PartialEq)]
struct QueueEntry {
    cost_s: f64,
    node: u32,
}

impl Eq for QueueEntry {}
impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed: BinaryHeap is a max-heap, Dijkstra wants the smallest cost.
        other.cost_s.partial_cmp(&self.cost_s).expect("edge costs are always finite")
    }
}
impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[wasm_bindgen]
impl Router {
    /// `psv_override_way_ids`: OSM way ids to treat as bus-legal regardless
    /// of their own tags (the road-edge override layer above) — `f64` to
    /// cross the wasm-bindgen boundary cleanly, the same convention
    /// `decode_stops` already uses for OSM ids elsewhere in this file (safe
    /// for real OSM way ids, well within f64's exact-integer range).
    #[wasm_bindgen(constructor)]
    pub fn new(graph_bytes: &[u8], psv_override_way_ids: Vec<f64>) -> Router {
        let graph = game_data::decode(graph_bytes);
        let psv_override_way_ids: HashSet<i64> =
            psv_override_way_ids.iter().map(|&id| id as i64).collect();
        let mut adjacency: Vec<Vec<Hop>> = (0..graph.nodes.len()).map(|_| Vec::new()).collect();
        let mut has_incoming = vec![false; graph.nodes.len()];

        for (idx, edge) in graph.edges.iter().enumerate() {
            if !edge_is_routable(edge, &psv_override_way_ids) {
                continue;
            }
            let edge_idx = idx as u32;
            if matches!(edge.oneway, OnewayDirection::Forward | OnewayDirection::TwoWay) {
                adjacency[edge.from as usize].push(Hop { edge: edge_idx, to_node: edge.to });
                has_incoming[edge.to as usize] = true;
            }
            if matches!(edge.oneway, OnewayDirection::Reverse | OnewayDirection::TwoWay) {
                adjacency[edge.to as usize].push(Hop { edge: edge_idx, to_node: edge.from });
                has_incoming[edge.from as usize] = true;
            }
        }

        Router {
            graph,
            adjacency,
            last_edges: RefCell::new(Vec::new()),
            last_edge_point_counts: RefCell::new(Vec::new()),
            last_route_time_seconds: RefCell::new(0.0),
            has_incoming,
            psv_override_way_ids,
        }
    }

    pub fn node_count(&self) -> usize {
        self.graph.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.graph.edges.len()
    }

    /// The graph node to snap to for a click at the given point — for
    /// Dijkstra, which only knows about nodes — plus the *true* nearest
    /// point on the road itself (`snap_lon_e7, snap_lat_e7`), which can sit
    /// well short of that node if the edge runs a long way between distant
    /// junctions: without this, a stop halfway along a 400m edge snapped to
    /// whichever end happened to be closer, landing the route hundreds of
    /// metres down the road from the actual stop. Found by scanning every
    /// *routable* edge's own real geometry (not just the nearest node in the
    /// whole graph, which includes footways, private tracks and anything
    /// else `psv`/`bus` tags exclude) for the closest point on the true
    /// road line, then taking whichever of that edge's two actual junction
    /// nodes is closer for the node half of the answer. Distance-to-the-
    /// real-line is also what correctly tells two carriageways of a dual
    /// carriageway apart, or a through road from a nearby dead-end spur —
    /// nearest-node-by-straight-line-distance alone can't.
    ///
    /// `needs_outgoing`: whether the caller intends to route *from* this
    /// node (only a route's start does — forcing a dead-end-as-start onto
    /// whichever endpoint has outgoing hops avoids sending the route past
    /// the actual stop and back again to reach it).
    ///
    /// `needs_incoming`: the mirror case, for a route's *goal* — a one-way
    /// edge only registers a hop into *one* of its two endpoints, so the
    /// *other* endpoint can only ever be departed, never arrived at. Without
    /// this check, a goal could silently snap to such a node and `find_route`
    /// would return nothing at all, even though a point barely metres away
    /// (the edge's *other* end, or a different nearby edge) routes fine —
    /// exactly the shape of a real user-reported bug: a stop sat almost
    /// exactly on a short one-way service road, and the leg into it failed
    /// completely rather than just taking a worse path.
    ///
    /// Also returns the *edge index* the snap point was found on
    /// (`nearest_node`'s fourth return value) — `find_route` needs this to
    /// know whether it's safe to redraw the final point at the true snap
    /// position. It's only safe when the actual traversed path's last edge
    /// *is* this same edge: the chosen node is always one of this edge's own
    /// two endpoints, so sliding the displayed point anywhere along that
    /// same edge's own geometry is always a real position on a real road.
    /// But when the near endpoint can only be *arrived at* via a different
    /// edge (this edge being one-way away from it, say), the path's last
    /// edge is that other one — and overwriting its endpoint with a point
    /// possibly tens of metres along an edge that was never actually
    /// traversed draws a straight line with no relationship to any real
    /// road at all. Found via a real user report ("goes through buildings")
    /// on an 83m one-way edge whose only-reachable end sat right at the
    /// junction, with the true snap point (correctly 0m from the real stop)
    /// most of that 83m further along — the previous code always overwrote
    /// regardless, silently drawing exactly that fake jump.
    fn nearest_node(
        &self,
        lon_e7: i32,
        lat_e7: i32,
        needs_outgoing: bool,
        needs_incoming: bool,
    ) -> Option<(u32, i32, i32, u32)> {
        let mut best_dist = f64::INFINITY;
        let mut best: Option<(u32, i32, i32, u32)> = None;

        for (edge_idx, edge) in self.graph.edges.iter().enumerate() {
            if !edge_is_routable(edge, &self.psv_override_way_ids) {
                continue;
            }
            let from = &self.graph.nodes[edge.from as usize];
            let to = &self.graph.nodes[edge.to as usize];

            let mut prev = (from.lon_e7, from.lat_e7);
            for &next in edge.geometry.iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
                let (d, snap_lon_e7, snap_lat_e7) = point_to_segment_closest(
                    lon_e7, lat_e7, prev.0, prev.1, next.0, next.1,
                );
                if d < best_dist {
                    best_dist = d;
                    let d_from = approx_distance_m(lon_e7, lat_e7, from.lon_e7, from.lat_e7);
                    let d_to = approx_distance_m(lon_e7, lat_e7, to.lon_e7, to.lat_e7);
                    let node = if needs_outgoing {
                        // Prefer whichever endpoint can actually go
                        // somewhere; distance only breaks the tie between
                        // two that both can (or both can't).
                        let from_has_out = !self.adjacency[edge.from as usize].is_empty();
                        let to_has_out = !self.adjacency[edge.to as usize].is_empty();
                        match (from_has_out, to_has_out) {
                            (true, false) => edge.from,
                            (false, true) => edge.to,
                            _ => if d_from <= d_to { edge.from } else { edge.to },
                        }
                    } else if needs_incoming {
                        // Same idea, mirrored: prefer whichever endpoint can
                        // actually be arrived at.
                        let from_has_in = self.has_incoming[edge.from as usize];
                        let to_has_in = self.has_incoming[edge.to as usize];
                        match (from_has_in, to_has_in) {
                            (true, false) => edge.from,
                            (false, true) => edge.to,
                            _ => if d_from <= d_to { edge.from } else { edge.to },
                        }
                    } else {
                        if d_from <= d_to { edge.from } else { edge.to }
                    };
                    best = Some((node, snap_lon_e7, snap_lat_e7, edge_idx as u32));
                }
                prev = next;
            }
        }

        best
    }

    /// The road-network point a click at `(lon, lat)` would snap to, as
    /// `[lon, lat]` in degrees — the true nearest point on the road, not
    /// just the nearest junction node — for showing a route's very first
    /// point snapped onto the road like every later point already is,
    /// rather than the raw stop position.
    pub fn snap_to_road(&self, lon: f64, lat: f64) -> Vec<f64> {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        // Used for a route's very first point, which always goes on to be
        // a route *start* — needs outgoing capability, same as `find_route`
        // gives its own `start`.
        let Some((_, snap_lon_e7, snap_lat_e7, _)) = self.nearest_node(to_e7(lon), to_e7(lat), true, false) else {
            return Vec::new();
        };
        vec![snap_lon_e7 as f64 * 1e-7, snap_lat_e7 as f64 * 1e-7]
    }

    /// Edge ids traversed by the most recent `find_route` call, in order —
    /// lets a caller work out which stretches of road a route uses more
    /// than once (e.g. there-and-back along the same street), without
    /// re-running Dijkstra just to find out.
    pub fn last_route_edges(&self) -> Vec<u32> {
        self.last_edges.borrow().clone()
    }

    /// Point count contributed by each edge in `last_route_edges()`, same
    /// order — see the field doc comment on `last_edge_point_counts`.
    pub fn last_route_edge_point_counts(&self) -> Vec<u32> {
        self.last_edge_point_counts.borrow().clone()
    }

    /// Kerb-snaps a click to the nearest road for a new player-placed stop
    /// (DESIGN.md §4 "Placement": "a new stop snaps to the road, on the
    /// left kerb for the direction of travel, and creates one stop serving
    /// one direction"). Deliberately scans **every** edge, not just
    /// bus-legal ones — `nearest_node`'s own scan is filtered to
    /// `edge_is_routable` because pathfinding must never touch a road it
    /// can't drive, but DESIGN.md §4 explicitly allows placing a stop on a
    /// road buses can't use, with a warning; if the search itself excluded
    /// those roads the warning could never fire near one. A road with no
    /// highway classification at all (footway, cycleway, a plain
    /// pedestrian street with no `bus`/`psv` override) is dropped entirely
    /// during the pipeline build and never becomes an edge here, so it's
    /// outside this search's reach — a real, known limit, not attempted in
    /// this increment.
    ///
    /// The direction a placed stop serves isn't stored anywhere; it's
    /// implicit in which physical kerb it lands on, exactly like a real
    /// imported OSM stop. A oneway road has one legal direction, so its
    /// left kerb is fixed regardless of where the click landed; a two-way
    /// road lets the click's own side choose which direction this stop
    /// will serve, mirroring how a real two-way street carries two
    /// independent, oppositely-facing stops rather than one shared one.
    ///
    /// Returns `[lon, lat, busLegal]` (`busLegal` is `1.0`/`0.0`), or an
    /// empty array only if the graph has no edges at all (never true
    /// against real pipeline data).
    pub fn place_stop(&self, lon: f64, lat: f64) -> Vec<f64> {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        let (p_lon_e7, p_lat_e7) = (to_e7(lon), to_e7(lat));

        let mut best_dist = f64::INFINITY;
        // foot point, segment a, segment b, this edge's oneway, bus-legal.
        let mut best: Option<(i32, i32, i32, i32, i32, i32, OnewayDirection, bool)> = None;

        for edge in &self.graph.edges {
            let from = &self.graph.nodes[edge.from as usize];
            let to = &self.graph.nodes[edge.to as usize];
            let mut prev = (from.lon_e7, from.lat_e7);
            for &next in edge.geometry.iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
                let (d, foot_lon_e7, foot_lat_e7) =
                    point_to_segment_closest(p_lon_e7, p_lat_e7, prev.0, prev.1, next.0, next.1);
                if d < best_dist {
                    best_dist = d;
                    let bus_legal = edge_is_routable(edge, &self.psv_override_way_ids);
                    best = Some((foot_lon_e7, foot_lat_e7, prev.0, prev.1, next.0, next.1, edge.oneway, bus_legal));
                }
                prev = next;
            }
        }

        let Some((foot_lon_e7, foot_lat_e7, a_lon_e7, a_lat_e7, b_lon_e7, b_lat_e7, oneway, bus_legal)) = best else {
            return Vec::new();
        };

        let cross = signed_side_of_segment(p_lon_e7, p_lat_e7, a_lon_e7, a_lat_e7, b_lon_e7, b_lat_e7);
        let offset_sign = match oneway {
            OnewayDirection::Forward => 1.0,
            OnewayDirection::Reverse => -1.0,
            OnewayDirection::TwoWay => {
                if cross >= 0.0 {
                    1.0
                } else {
                    -1.0
                }
            }
        };

        let (kerb_lon_e7, kerb_lat_e7) = offset_point_perpendicular(
            foot_lon_e7,
            foot_lat_e7,
            a_lon_e7,
            a_lat_e7,
            b_lon_e7,
            b_lat_e7,
            KERB_OFFSET_M * offset_sign,
        );

        vec![kerb_lon_e7 as f64 * 1e-7, kerb_lat_e7 as f64 * 1e-7, if bus_legal { 1.0 } else { 0.0 }]
    }

    /// Total travel time (seconds) of the most recent `find_route` call,
    /// including junction delays — the exact cost Dijkstra minimised,
    /// recorded as it searched rather than re-derived afterward (see the
    /// field doc comment). Used to build a route's automatic running time
    /// between stops (DESIGN.md §7).
    pub fn last_route_time_seconds(&self) -> f64 {
        *self.last_route_time_seconds.borrow()
    }

    /// Fastest path by travel time (DESIGN.md §6) between two points,
    /// snapped to the nearest routable graph node each. Returns a flattened
    /// `[lon, lat, lon, lat, ...]` array (degrees, not nanodegrees) tracing
    /// the route — including each edge's intermediate shape points, not
    /// just junctions, so the line actually follows the road rather than
    /// cutting corners — or an empty array if no route exists. `Vec<f64>`
    /// crosses the wasm-bindgen boundary without needing a
    /// serde-wasm-bindgen dependency.
    pub fn find_route(&self, from_lon: f64, from_lat: f64, to_lon: f64, to_lat: f64) -> Vec<f64> {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        let (
            Some((start, start_snap_lon_e7, start_snap_lat_e7, start_snap_edge)),
            Some((goal, goal_snap_lon_e7, goal_snap_lat_e7, goal_snap_edge)),
        ) = (
            self.nearest_node(to_e7(from_lon), to_e7(from_lat), true, false),
            self.nearest_node(to_e7(to_lon), to_e7(to_lat), false, true),
        ) else {
            self.last_edges.borrow_mut().clear();
            self.last_edge_point_counts.borrow_mut().clear();
            *self.last_route_time_seconds.borrow_mut() = 0.0;
            return Vec::new();
        };

        let Some((steps, total_cost_s)) = self.dijkstra(start, goal) else {
            self.last_edges.borrow_mut().clear();
            self.last_edge_point_counts.borrow_mut().clear();
            *self.last_route_time_seconds.borrow_mut() = 0.0;
            return Vec::new();
        };
        *self.last_route_time_seconds.borrow_mut() = total_cost_s;

        *self.last_edges.borrow_mut() = steps.iter().map(|&(edge_idx, _)| edge_idx).collect();
        *self.last_edge_point_counts.borrow_mut() = steps
            .iter()
            .map(|&(edge_idx, _)| (self.graph.edges[edge_idx as usize].geometry.len() + 1) as u32)
            .collect();

        let push_e7 = |coords: &mut Vec<f64>, lon_e7: i32, lat_e7: i32| {
            coords.push(lon_e7 as f64 * 1e-7);
            coords.push(lat_e7 as f64 * 1e-7);
        };

        let mut coords = Vec::new();
        // The route's first point is the true nearest point on the road
        // (from `nearest_node`), not the start node's own position — a stop
        // can sit well short of the junction its edge happens to end at, and
        // starting there instead sent the route hundreds of metres down the
        // wrong stretch before it even began (the "long way down the road"
        // bug). Only safe when the path's own first edge *is* the edge the
        // snap point was found on — sliding along that same edge's own
        // geometry is always a real position on a real road. When the
        // reachable node can only be departed via a *different* edge (this
        // one being one-way away from it, say), the snap point can sit tens
        // of metres from wherever the path actually starts, along an edge
        // never actually used — a real user-reported bug ("goes through
        // buildings"): the fallback here, the start node's own plain
        // position, is always on the path that's actually drawn next.
        let start_edge_matches = steps.first().is_some_and(|&(edge_idx, _)| edge_idx == start_snap_edge);
        if steps.is_empty() || start_edge_matches {
            push_e7(&mut coords, start_snap_lon_e7, start_snap_lat_e7);
        } else {
            let n = &self.graph.nodes[start as usize];
            push_e7(&mut coords, n.lon_e7, n.lat_e7);
        }

        let mut current = start;
        for (edge_idx, next_node) in &steps {
            let edge = &self.graph.edges[*edge_idx as usize];
            if edge.from == current {
                for &(lon_e7, lat_e7) in &edge.geometry {
                    push_e7(&mut coords, lon_e7, lat_e7);
                }
            } else {
                for &(lon_e7, lat_e7) in edge.geometry.iter().rev() {
                    push_e7(&mut coords, lon_e7, lat_e7);
                }
            }
            let n = &self.graph.nodes[*next_node as usize];
            push_e7(&mut coords, n.lon_e7, n.lat_e7);
            current = *next_node;
        }

        // Same idea at the far end — only overwrite the last point with the
        // goal's true snap position when the path's own last edge is the
        // edge that snap point was found on. Otherwise the plain goal node
        // position (already pushed above) is the correct, real-road point:
        // overwriting it with a point off on some other edge is exactly the
        // "goes through buildings" bug, found via a real user report and a
        // real 83m one-way edge whose only-reachable end was a junction the
        // true snap point sat most of that 83m further along, on a stretch
        // Dijkstra's own path never actually used.
        let goal_edge_matches = steps.last().is_some_and(|&(edge_idx, _)| edge_idx == goal_snap_edge);
        if goal_edge_matches {
            let len = coords.len();
            coords[len - 2] = goal_snap_lon_e7 as f64 * 1e-7;
            coords[len - 1] = goal_snap_lat_e7 as f64 * 1e-7;
        }

        coords
    }

    /// Returns the path as a list of `(edge, node arrived at)` steps in
    /// order, plus the total travel time (seconds) Dijkstra minimised to
    /// find it, or `None` if unreachable. Minimises `edge_time_cost_s` plus
    /// `junction_delay_s` at every node crossed, not distance — see those
    /// functions' doc comments. The junction delay at `node` depends on
    /// which edge was used to *arrive* there (`prev[node]`, `None` only for
    /// `start` itself) versus the edge about to be taken next (`hop.edge`).
    fn dijkstra(&self, start: u32, goal: u32) -> Option<(Vec<(u32, u32)>, f64)> {
        let n = self.graph.nodes.len();
        let mut best_cost_s = vec![f64::INFINITY; n];
        let mut prev: Vec<Option<(u32, u32)>> = vec![None; n]; // (prev_node, via_edge)
        let mut visited = vec![false; n];

        best_cost_s[start as usize] = 0.0;
        let mut queue = BinaryHeap::new();
        queue.push(QueueEntry { cost_s: 0.0, node: start });

        while let Some(QueueEntry { cost_s, node }) = queue.pop() {
            if visited[node as usize] {
                continue;
            }
            visited[node as usize] = true;
            if node == goal {
                break;
            }

            let incoming_class = prev[node as usize].map(|(_, edge_idx)| self.graph.edges[edge_idx as usize].class);
            let junction_control = self.graph.nodes[node as usize].junction_control;

            for hop in &self.adjacency[node as usize] {
                let edge = &self.graph.edges[hop.edge as usize];
                let delay_s = junction_delay_s(junction_control, incoming_class, edge.class);
                let next_cost = cost_s + edge_time_cost_s(edge) + delay_s;
                if next_cost < best_cost_s[hop.to_node as usize] {
                    best_cost_s[hop.to_node as usize] = next_cost;
                    prev[hop.to_node as usize] = Some((node, hop.edge));
                    queue.push(QueueEntry { cost_s: next_cost, node: hop.to_node });
                }
            }
        }

        if !visited[goal as usize] {
            return None;
        }

        let mut steps = Vec::new();
        let mut current = goal;
        while current != start {
            let (p, edge) = prev[current as usize]?;
            steps.push((edge, current));
            current = p;
        }
        steps.reverse();
        Some((steps, best_cost_s[goal as usize]))
    }
}

/// Decodes `railway.bin` into a plain JS array of `{lon, lat, kind, name,
/// osmId}` objects — `kind` is `"station"`, `"halt"` or `"subway"`.
/// Consumed by `src/renderer/railway-stations-layer.ts`. Position is
/// already the best available — recentred on nearby platforms and nudged
/// clear of roads by the pipeline itself (`main.rs`), not raw OSM node
/// position.
#[wasm_bindgen]
pub fn decode_railway_stations(bytes: &[u8]) -> js_sys::Array {
    let data = game_data::decode_railway(bytes);
    let out = js_sys::Array::new();
    for s in &data.stations {
        let kind = match s.kind {
            game_data::RailwayStationKind::Station => "station",
            game_data::RailwayStationKind::Halt => "halt",
            game_data::RailwayStationKind::Subway => "subway",
        };
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"lon".into(), &(s.lon_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(&obj, &"lat".into(), &(s.lat_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(&obj, &"kind".into(), &kind.into()).unwrap();
        js_sys::Reflect::set(
            &obj,
            &"name".into(),
            &s.name.as_deref().map(JsValue::from).unwrap_or(JsValue::NULL),
        )
        .unwrap();
        js_sys::Reflect::set(&obj, &"osmId".into(), &(s.osm_id as f64).into()).unwrap();
        out.push(&obj);
    }
    out
}

/// Decodes `railway.bin`'s platforms into a plain JS array of `{osmId,
/// coordinates}` objects — `coordinates` is a flat `[lon, lat, lon, lat,
/// ...]` array, the same flattening convention `Router.find_route` already
/// uses for route geometry. Full physical shape (a line or a closed ring),
/// not a centroid. No renderer consumes this yet — a close-zoom platform
/// shape render is a separate, not-yet-built follow-up; this data is used
/// today only by the pipeline itself, to recentre each station on its own
/// nearby platforms. Added now so that follow-up needs no pipeline rebuild.
#[wasm_bindgen]
pub fn decode_platforms(bytes: &[u8]) -> js_sys::Array {
    let data = game_data::decode_railway(bytes);
    let out = js_sys::Array::new();
    for p in &data.platforms {
        let coords = js_sys::Array::new();
        for &(lon_e7, lat_e7) in &p.geometry {
            coords.push(&(lon_e7 as f64 * 1e-7).into());
            coords.push(&(lat_e7 as f64 * 1e-7).into());
        }
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"osmId".into(), &(p.osm_id as f64).into()).unwrap();
        js_sys::Reflect::set(&obj, &"coordinates".into(), &coords).unwrap();
        out.push(&obj);
    }
    out
}

/// Decodes `railway.bin`'s tram stops into a plain JS array of `{lon, lat,
/// name, osmId}` objects — `railway=tram_stop`, a separate primary tag
/// from `railway=station`/`halt` (trams don't carry a station's platform
/// infrastructure), so these aren't part of `decode_railway_stations`'
/// own list. No road-avoidance nudge applied — see `main.rs`'s own
/// comment: a tram stop legitimately sits beside or in the middle of a
/// road, unlike a railway station.
#[wasm_bindgen]
pub fn decode_tram_stops(bytes: &[u8]) -> js_sys::Array {
    let data = game_data::decode_railway(bytes);
    let out = js_sys::Array::new();
    for t in &data.tram_stops {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"lon".into(), &(t.lon_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(&obj, &"lat".into(), &(t.lat_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(
            &obj,
            &"name".into(),
            &t.name.as_deref().map(JsValue::from).unwrap_or(JsValue::NULL),
        )
        .unwrap();
        js_sys::Reflect::set(&obj, &"osmId".into(), &(t.osm_id as f64).into()).unwrap();
        out.push(&obj);
    }
    out
}

/// Decodes `settlements.bin` into a plain JS array of `{lon, lat, name,
/// rank, population, osmId}` objects — `rank` is `"city"`, `"town"`,
/// `"village"` or `"hamlet"` (in that order of significance). Consumed by
/// route-draw.ts's settlement fallback for the direction rule (DESIGN.md
/// §6) when a depot group has no bus station set.
#[wasm_bindgen]
pub fn decode_settlements(bytes: &[u8]) -> js_sys::Array {
    let data = game_data::decode_settlements(bytes);
    let out = js_sys::Array::new();
    for s in &data.settlements {
        let rank = match s.rank {
            game_data::PlaceRank::City => "city",
            game_data::PlaceRank::Town => "town",
            game_data::PlaceRank::Village => "village",
            game_data::PlaceRank::Hamlet => "hamlet",
        };
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"lon".into(), &(s.lon_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(&obj, &"lat".into(), &(s.lat_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(
            &obj,
            &"name".into(),
            &s.name.as_deref().map(JsValue::from).unwrap_or(JsValue::NULL),
        )
        .unwrap();
        js_sys::Reflect::set(&obj, &"rank".into(), &rank.into()).unwrap();
        js_sys::Reflect::set(
            &obj,
            &"population".into(),
            &s.population.map(|p| JsValue::from(p as f64)).unwrap_or(JsValue::NULL),
        )
        .unwrap();
        js_sys::Reflect::set(&obj, &"osmId".into(), &(s.osm_id as f64).into()).unwrap();
        out.push(&obj);
    }
    out
}

/// Decodes `stops.bin` into a plain JS array of `{lon, lat, kind, name,
/// osmId}` objects — `kind` is `"bus_stop"`, `"platform"` or
/// `"bus_station"`. One flat list rather than separate stop/bus-station
/// arrays: the renderer only needs to draw markers, and can filter on
/// `kind` if it needs to style them differently.
#[wasm_bindgen]
pub fn decode_stops(bytes: &[u8]) -> js_sys::Array {
    let data = game_data::decode_stops(bytes);
    let out = js_sys::Array::new();

    let push = |lon_e7: i32, lat_e7: i32, kind: &str, name: &Option<String>, osm_id: i64| {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"lon".into(), &(lon_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(&obj, &"lat".into(), &(lat_e7 as f64 * 1e-7).into()).unwrap();
        js_sys::Reflect::set(&obj, &"kind".into(), &kind.into()).unwrap();
        js_sys::Reflect::set(
            &obj,
            &"name".into(),
            &name.as_deref().map(JsValue::from).unwrap_or(JsValue::NULL),
        )
        .unwrap();
        js_sys::Reflect::set(&obj, &"osmId".into(), &(osm_id as f64).into()).unwrap();
        obj
    };

    for s in &data.stops {
        let kind = match s.kind {
            StopKind::BusStop => "bus_stop",
            StopKind::Platform => "platform",
        };
        out.push(&push(s.lon_e7, s.lat_e7, kind, &s.name, s.osm_id));
    }
    for b in &data.bus_stations {
        out.push(&push(b.lon_e7, b.lat_e7, "bus_station", &b.name, b.osm_id));
    }

    out
}

/// Decodes the `stop_areas` (`public_transport=stop_area` relations) from
/// `stops.bin` into a plain JS array of `{osmId, name, memberOsmIds}`
/// objects — `memberOsmIds` is every node member of the relation (stops,
/// platforms, and the bus station itself where one is a member). The
/// renderer works out from that which stop_areas group a bus station's
/// stands (DESIGN.md §4/§5): a member id matching a known bus station's
/// `osmId` marks the rest of that group as stand stops to hide from the
/// main map and reveal only when the station is clicked.
#[wasm_bindgen]
pub fn decode_stop_areas(bytes: &[u8]) -> js_sys::Array {
    let data = game_data::decode_stops(bytes);
    let out = js_sys::Array::new();

    for area in &data.stop_areas {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"osmId".into(), &(area.osm_id as f64).into()).unwrap();
        js_sys::Reflect::set(
            &obj,
            &"name".into(),
            &area.name.as_deref().map(JsValue::from).unwrap_or(JsValue::NULL),
        )
        .unwrap();
        let members = js_sys::Array::new();
        for id in &area.member_stop_osm_ids {
            members.push(&(*id as f64).into());
        }
        js_sys::Reflect::set(&obj, &"memberOsmIds".into(), &members).unwrap();
        out.push(&obj);
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_data::{Edge, GraphNode, OnewayDirection, RoadGraph};

    fn edge(from: u32, to: u32, osm_way_id: i64, class: u8, length_m: f32) -> Edge {
        Edge {
            from,
            to,
            osm_way_id,
            class,
            width_m: 5.5,
            length_m,
            oneway: OnewayDirection::TwoWay,
            access_restricted: false,
            psv_yes: false,
            bus_yes: false,
            maxspeed_mph: None,
            geometry: vec![],
        }
    }

    fn graph_node(osm_id: i64, lon_e7: i32, lat_e7: i32) -> GraphNode {
        GraphNode { osm_id, lon_e7, lat_e7, junction_control: game_data::JunctionControl::None }
    }

    /// Two parallel edges between the same two nodes: a short one on a slow
    /// class (Service, default 10mph) and a longer one on a fast class
    /// (Motorway, default 70mph). Pure shortest-distance routing (the old
    /// behaviour) would pick the 100m service road; the fastest-route fix
    /// should pick the 500m motorway instead, since it's actually quicker
    /// (500m/70mph ≈ 16.0s vs 100m/10mph ≈ 22.4s).
    #[test]
    fn dijkstra_prefers_the_faster_edge_over_the_shorter_one() {
        let nodes = vec![
            graph_node(1, 0, 0),
            graph_node(2, 0, 1_000_000),
        ];
        let edges = vec![
            edge(0, 1, 100, 13 /* Service */, 100.0),
            edge(0, 1, 101, 0 /* Motorway */, 500.0),
        ];
        let bytes = game_data::encode(&RoadGraph { nodes, edges, restrictions: vec![] });

        let router = Router::new(&bytes, vec![]);
        let coords = router.find_route(0.0, 0.0, 0.0, 0.1);
        assert!(!coords.is_empty(), "expected a route to be found");
        assert_eq!(
            router.last_route_edges(),
            vec![1],
            "should take the longer-but-faster motorway edge (index 1), not the \
             shorter-but-slower service edge (index 0)"
        );
        let time_s = router.last_route_time_seconds();
        let expected_s = 500.0 / (70.0 * MPH_TO_MPS);
        assert!(
            (time_s - expected_s).abs() < 0.01,
            "expected ~{expected_s}s for the 500m motorway leg, got {time_s}s"
        );
    }

    /// A single edge with `access_restricted = true` and no psv/bus tag —
    /// unroutable by default, same as real `access=no` roads with no bus
    /// exception. Confirms both that it's excluded normally and that
    /// flagging its way id in `psv_override_way_ids` makes it routable
    /// again, the road-edge override layer's whole point.
    #[test]
    fn psv_override_makes_an_access_restricted_edge_routable() {
        let nodes = vec![
            graph_node(1, 0, 0),
            graph_node(2, 0, 1_000_000),
        ];
        let mut restricted_edge = edge(0, 1, 999, 11 /* Residential */, 100.0);
        restricted_edge.access_restricted = true;
        let bytes = game_data::encode(&RoadGraph {
            nodes,
            edges: vec![restricted_edge],
            restrictions: vec![],
        });

        let router_without_override = Router::new(&bytes, vec![]);
        let coords = router_without_override.find_route(0.0, 0.0, 0.0, 0.1);
        assert!(coords.is_empty(), "an access-restricted way with no psv/bus tag should not be routable by default");

        let router_with_override = Router::new(&bytes, vec![999.0]);
        let coords = router_with_override.find_route(0.0, 0.0, 0.0, 0.1);
        assert!(!coords.is_empty(), "flagging the way id as a psv override should make it routable");
    }

    /// The goal-side mirror of the existing `needs_outgoing` dead-end fix —
    /// found via a real user report: a stop sat right on a one-way edge
    /// whose *nearer* endpoint had no incoming hop at all, and `find_route`
    /// returned nothing whatsoever for a leg where a real route obviously
    /// existed, even though a point barely metres away (the edge's other
    /// end) routed fine. Node 1 is reachable from the start (edge 0->1);
    /// node 2 is *not* reachable by anything (only has an outgoing edge,
    /// 2->1) but sits closer to the goal point than node 1 does. Without
    /// checking incoming capability, `nearest_node` would snap the goal to
    /// node 2 purely on distance and Dijkstra would never reach it.
    #[test]
    fn goal_prefers_a_reachable_node_over_a_nearer_unreachable_one() {
        let nodes = vec![
            graph_node(1, 0, 0),         // 0: start
            graph_node(2, 0, 1_000_000), // 1: reachable from start
            graph_node(3, 0, 1_100_000), // 2: nothing arrives here
        ];
        let mut start_to_reachable = edge(0, 1, 900, 11, 100.0);
        start_to_reachable.oneway = OnewayDirection::Forward; // 0 -> 1 only
        let mut unreachable_to_reachable = edge(2, 1, 901, 11, 10.0);
        unreachable_to_reachable.oneway = OnewayDirection::Forward; // 2 -> 1 only: node 2 has no incoming hop from anything
        let bytes = game_data::encode(&RoadGraph {
            nodes,
            edges: vec![start_to_reachable, unreachable_to_reachable],
            restrictions: vec![],
        });
        let router = Router::new(&bytes, vec![]);

        // Goal just past node 2 (lat 1_090_000, closer to node 2's
        // 1_100_000 than to node 1's 1_000_000) - the unreachable node is
        // the geometrically nearer one, exactly the scenario that broke.
        let coords = router.find_route(0.0, 0.0, 0.0, 0.109);
        assert!(
            !coords.is_empty(),
            "should route via the reachable node (1) even though the unreachable one (2) is nearer to the goal point"
        );
    }

    /// A goal query point whose true nearest edge (B) can only be *arrived
    /// at* via a completely different edge (C) — the "goes through
    /// buildings" bug, found via a real user report and a real 83m one-way
    /// service road. Node 2 is the true-nearest edge's own far end (nothing
    /// arrives there at all); node 1 is what `needs_incoming` correctly
    /// picks instead, but only reachable via edge C, never via edge B
    /// itself (B only allows travelling *from* node 2 *to* node 1). The old
    /// code always overwrote the final point with the true snap position
    /// (near node 2, found by scanning edge B) regardless of which edge the
    /// path actually used last — drawing a straight line from node 1 (via
    /// C) to a point on B that was never traversed at all. The fix must
    /// leave the plain, real node-1 position as the final point instead.
    #[test]
    fn goal_snap_point_not_used_when_its_edge_was_never_actually_reached() {
        let nodes = vec![
            graph_node(1, 0, 0),         // 0: start
            graph_node(2, 0, 1_000_000), // 1: reached via edge C
            graph_node(3, 0, 1_100_000), // 2: true-nearest edge's far end
        ];
        let mut edge_c = edge(0, 1, 900, 11, 100.0); // start -> node 1
        edge_c.oneway = OnewayDirection::Forward;
        let mut edge_b = edge(1, 2, 901, 11, 10.0); // node 1 <-> node 2's own edge
        edge_b.oneway = OnewayDirection::Reverse; // only traversable 2 -> 1, so node 2 has no incoming
        let bytes = game_data::encode(&RoadGraph {
            nodes,
            edges: vec![edge_c, edge_b],
            restrictions: vec![],
        });
        let router = Router::new(&bytes, vec![]);

        // Goal near node 2 (lat 1_090_000, 90% of the way along edge B from
        // node 1) - edge B is the true nearest edge, but node 2 has no
        // incoming at all, so needs_incoming must pick node 1 instead, only
        // reachable via edge C.
        let coords = router.find_route(0.0, 0.0, 0.0, 0.109);
        assert!(!coords.is_empty(), "a route should exist (via edge C to node 1)");
        let len = coords.len();
        let (last_lon, last_lat) = (coords[len - 2], coords[len - 1]);
        assert!(
            (last_lat - 0.1).abs() < 0.0001,
            "final point should be node 1's own real position (lat 0.1), not the unreached snap point near lat 0.109 — got {last_lon},{last_lat}"
        );
    }

    // --- junction_delay_s (pure function) ---

    #[test]
    fn no_delay_at_the_route_s_own_start() {
        assert_eq!(
            junction_delay_s(game_data::JunctionControl::TrafficSignals, None, 0),
            0.0,
            "the very first node of a route has nothing to give way to yet, regardless of its control type"
        );
    }

    #[test]
    fn traffic_signals_stop_and_mini_roundabout_delay_every_approach_equally() {
        // Class 4 (Primary) continuing onto class 4 (Primary): the same
        // priority road throughout, yet these three control types should
        // still charge their flat delay — a red light or a stop sign
        // doesn't care which road is "bigger".
        assert_eq!(junction_delay_s(game_data::JunctionControl::TrafficSignals, Some(4), 4), TRAFFIC_SIGNAL_DELAY_S);
        assert_eq!(junction_delay_s(game_data::JunctionControl::Stop, Some(4), 4), STOP_SIGN_DELAY_S);
        assert_eq!(junction_delay_s(game_data::JunctionControl::MiniRoundabout, Some(4), 4), MINI_ROUNDABOUT_DELAY_S);
    }

    #[test]
    fn give_way_and_untagged_junctions_only_delay_a_move_onto_a_more_major_road() {
        // Class 11 (Residential, minor) joining class 4 (Primary, major) —
        // a real give-way case, whether or not the junction carries an
        // explicit `give_way` tag.
        assert_eq!(
            junction_delay_s(game_data::JunctionControl::GiveWay, Some(11), 4),
            GIVE_WAY_DELAY_S,
            "joining a more major road through an explicitly tagged give-way junction should cost the give-way delay"
        );
        assert_eq!(
            junction_delay_s(game_data::JunctionControl::None, Some(11), 4),
            GIVE_WAY_DELAY_S,
            "the same move through a plain untagged junction (the common case) should cost the same delay"
        );
        // The reverse move — already on the major road (class 4), turning
        // onto or continuing towards a minor one (class 11) — is not a
        // give-way case for this vehicle.
        assert_eq!(
            junction_delay_s(game_data::JunctionControl::None, Some(4), 11),
            0.0,
            "leaving the major road for a minor one costs nothing — the give-way applies to traffic joining the major road, not leaving it"
        );
        assert_eq!(
            junction_delay_s(game_data::JunctionControl::None, Some(4), 4),
            0.0,
            "continuing straight on the same-class road at an uncontrolled junction costs nothing"
        );
    }

    // --- junction delay wired into Dijkstra end to end ---

    /// A minor road (class 11) T-junctions onto a major road (class 4) at
    /// an explicitly `give_way`-tagged node. The route must turn onto the
    /// major road to reach the goal, so its total time should be the two
    /// edges' plain travel time *plus* the give-way delay — confirming the
    /// delay actually reaches `last_route_time_seconds()`, not just the
    /// pure function in isolation.
    #[test]
    fn find_route_charges_a_give_way_delay_when_joining_a_major_road() {
        let mut nodes = vec![
            graph_node(1, 0, 0),         // 0: start, on the minor road
            graph_node(2, 0, 1_000_000), // 1: the give-way junction
            graph_node(3, 0, 1_100_000), // 2: goal, on the major road
        ];
        nodes[1].junction_control = game_data::JunctionControl::GiveWay;
        let minor_leg = edge(0, 1, 900, 11 /* Residential */, 50.0);
        let major_leg = edge(1, 2, 901, 4 /* Primary */, 50.0);
        let bytes = game_data::encode(&RoadGraph {
            nodes,
            edges: vec![minor_leg, major_leg],
            restrictions: vec![],
        });
        let router = Router::new(&bytes, vec![]);

        let coords = router.find_route(0.0, 0.0, 0.0, 0.11);
        assert!(!coords.is_empty(), "expected a route to be found");

        let plain_time_s = 50.0 / (game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH[11] as f64 * MPH_TO_MPS)
            + 50.0 / (game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH[4] as f64 * MPH_TO_MPS);
        let time_s = router.last_route_time_seconds();
        assert!(
            (time_s - (plain_time_s + GIVE_WAY_DELAY_S)).abs() < 0.01,
            "expected plain travel time ({plain_time_s}s) plus the give-way delay ({GIVE_WAY_DELAY_S}s), got {time_s}s"
        );
    }

    /// The mirror case: the same two edges and the same give-way tag, but
    /// travelled the other way round (major road first, then turning onto
    /// the minor road) — no delay should apply, since the vehicle is never
    /// the one joining the major road.
    #[test]
    fn find_route_charges_no_delay_leaving_a_major_road_at_the_same_junction() {
        let mut nodes = vec![
            graph_node(1, 0, 0),         // 0: start, on the major road
            graph_node(2, 0, 1_000_000), // 1: the give-way junction
            graph_node(3, 0, 1_100_000), // 2: goal, on the minor road
        ];
        nodes[1].junction_control = game_data::JunctionControl::GiveWay;
        let major_leg = edge(0, 1, 900, 4 /* Primary */, 50.0);
        let minor_leg = edge(1, 2, 901, 11 /* Residential */, 50.0);
        let bytes = game_data::encode(&RoadGraph {
            nodes,
            edges: vec![major_leg, minor_leg],
            restrictions: vec![],
        });
        let router = Router::new(&bytes, vec![]);

        let coords = router.find_route(0.0, 0.0, 0.0, 0.11);
        assert!(!coords.is_empty(), "expected a route to be found");

        let plain_time_s = 50.0 / (game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH[4] as f64 * MPH_TO_MPS)
            + 50.0 / (game_data::HIGHWAY_CLASS_DEFAULT_SPEED_MPH[11] as f64 * MPH_TO_MPS);
        let time_s = router.last_route_time_seconds();
        assert!(
            (time_s - plain_time_s).abs() < 0.01,
            "expected plain travel time only ({plain_time_s}s), no give-way delay, got {time_s}s"
        );
    }

    // --- place_stop (kerb snapping for player-placed stops, DESIGN.md §4) ---

    /// A north-south two-way road: clicking to the west of it lands the
    /// kerb-snapped stop on the west kerb, and clicking to the east lands
    /// it on the east kerb — DESIGN.md §4's "one stop serving one
    /// direction" is implicit in which physical side the click chooses,
    /// since a two-way road carries two independently-facing stops.
    #[test]
    fn place_stop_two_way_road_uses_the_click_s_own_side() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)]; // node 1 due north of node 0
        let road = edge(0, 1, 900, 11, 100.0); // TwoWay by default
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![] });
        let router = Router::new(&bytes, vec![]);

        let west = router.place_stop(-0.0005, 0.05);
        assert_eq!(west.len(), 3, "expected [lon, lat, busLegal]");
        assert!(west[0] < 0.0, "clicking west of a two-way road should snap the stop to the west kerb, got lon {}", west[0]);
        assert_eq!(west[2], 1.0, "an ordinary residential road is bus-legal");

        let east = router.place_stop(0.0005, 0.05);
        assert!(east[0] > 0.0, "clicking east of a two-way road should snap the stop to the east kerb, got lon {}", east[0]);
    }

    /// A oneway road only legally travelled node0->node1 (northbound): the
    /// left kerb for northbound travel is fixed on the west side, no
    /// matter which side of the road the click landed on.
    #[test]
    fn place_stop_oneway_forward_always_uses_its_own_left_kerb() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)];
        let mut road = edge(0, 1, 900, 11, 100.0);
        road.oneway = OnewayDirection::Forward;
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![] });
        let router = Router::new(&bytes, vec![]);

        // Clicked on the *east* side — should still land west, matching
        // the road's own fixed direction rather than the click's side.
        let result = router.place_stop(0.0005, 0.05);
        assert!(
            result[0] < 0.0,
            "a forward-only road's left kerb (west, for northbound travel) should be used regardless of which side was clicked, got lon {}",
            result[0]
        );
    }

    /// The mirror case: a oneway road only legally travelled node1->node0
    /// (southbound) always uses the east kerb, the left side for
    /// southbound travel.
    #[test]
    fn place_stop_oneway_reverse_always_uses_its_own_left_kerb() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)];
        let mut road = edge(0, 1, 900, 11, 100.0);
        road.oneway = OnewayDirection::Reverse;
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![] });
        let router = Router::new(&bytes, vec![]);

        // Clicked on the *west* side — should still land east, matching
        // the reverse direction's own left kerb.
        let result = router.place_stop(-0.0005, 0.05);
        assert!(
            result[0] > 0.0,
            "a reverse-only road's left kerb (east, for southbound travel) should be used regardless of which side was clicked, got lon {}",
            result[0]
        );
    }

    /// A road buses can't legally use (access=no, no psv/bus override) is
    /// still a valid placement target — DESIGN.md §4 explicitly allows
    /// this, with a warning — so the search must not exclude it, and the
    /// returned flag must say so.
    #[test]
    fn place_stop_flags_a_road_buses_cannot_use() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)];
        let mut road = edge(0, 1, 900, 11, 100.0);
        road.access_restricted = true;
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![] });
        let router = Router::new(&bytes, vec![]);

        let result = router.place_stop(0.0005, 0.05);
        assert_eq!(result.len(), 3, "an access-restricted road should still be a valid placement target, not skipped");
        assert_eq!(result[2], 0.0, "an access-restricted road with no psv/bus override should be flagged as not bus-legal");
    }
}
