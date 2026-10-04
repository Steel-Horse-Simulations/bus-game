use game_data::{OnewayDirection, RoadGraph, StopKind};
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}


/// One directed hop usable from a node: which edge to take, and which node
/// it leads to. Built once from the graph's oneway/access tags so pathfinding
/// itself never has to re-check them. `Copy` so the flat `adjacency` buffer
/// below can be filled by direct index assignment rather than needing a
/// placeholder-then-overwrite dance.
#[derive(Clone, Copy)]
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
    /// Every node's own outgoing hops, flattened into one shared buffer —
    /// `adjacency[adjacency_offsets[node]..adjacency_offsets[node + 1]]` is
    /// that node's own slice, the CSR ("compressed sparse row") shape
    /// standard for exactly this kind of graph adjacency. Was
    /// `Vec<Vec<Hop>>` (one separate heap allocation per node) until
    /// OPEN-ITEMS.md T55-map-boundary's "freezing, not recovering" bug:
    /// building that at whole-UK scale (10.3M nodes) measured at ~109 of a
    /// ~224 second freeze, specifically in wasm32 — the default allocator
    /// handles millions of small separate allocations far worse than a
    /// native one does (proven fast natively on the identical data first,
    /// not guessed). Built in two passes now (count hops per node, prefix-
    /// sum into offsets, then fill the flat buffer via a per-node write
    /// cursor) — a handful of large allocations instead of one per node.
    adjacency: Vec<Hop>,
    /// `adjacency`'s own offset index — see its doc comment. Always has
    /// exactly `graph.nodes.len() + 1` entries.
    adjacency_offsets: Vec<u32>,
    /// Edge ids used by the most recent `find_route` call, in traversal
    /// order — set alongside the coordinate result so a caller can ask
    /// `last_route_edges()` afterwards without a second Dijkstra run.
    /// `RefCell` rather than changing methods to `&mut self`: the JS side
    /// doesn't care either way, but this keeps `find_route`'s existing
    /// call shape unchanged.
    last_edges: RefCell<Vec<u32>>,
    /// Point count contributed by each edge in `last_edges`, in the same
    /// order — `edge.geometry_len + 1` per edge, matching how `find_route`
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
    /// A coarse spatial grid over every routable edge's own geometry, keyed
    /// by cell coordinates (`nearest_node_grid_key`) — built once here so
    /// `nearest_node` never has to scan the *whole* graph. A real bug this
    /// fixes, found via a real user report ("whenever I click on something
    /// it freezes for a long time") and confirmed directly with a CPU
    /// profile, not guessed: `nearest_node` was doing a full linear scan
    /// over every one of the ~1.4M routable edges in the whole-of-Great-
    /// Britain graph, on *every single call* — twice per `find_route` (once
    /// per endpoint), with no caching between calls. 98% of a real ~3s
    /// freeze opening a single route's timetable editor (5 legs = up to 10
    /// calls) was inside this one function. Same ~200m grid-cell technique
    /// already used elsewhere in this codebase (stops-layer.ts's own
    /// transit-link grid) for consistency, not because the exact figure
    /// matters here.
    edge_grid: HashMap<(i32, i32), Vec<u32>>,
}

/// Same cell size as stops-layer.ts's own `LINK_GRID_CELL_DEG` (0.002
/// degrees, roughly 200m at UK latitudes) — see `edge_grid`'s own comment.
const NEAREST_NODE_GRID_CELL_E7: i32 = 20_000;

fn nearest_node_grid_key(lon_e7: i32, lat_e7: i32) -> (i32, i32) {
    (
        lon_e7.div_euclid(NEAREST_NODE_GRID_CELL_E7),
        lat_e7.div_euclid(NEAREST_NODE_GRID_CELL_E7),
    )
}

/// Every grid cell a straight segment between two cells passes through —
/// Bresenham's line algorithm over cell coordinates, not just the two
/// endpoint cells. Matters for a long edge with sparse geometry (a few
/// points over a long stretch of road): without walking the cells in
/// between, a query from the *middle* of that edge would find it in
/// neither endpoint's cell and miss it entirely.
fn cells_along_segment(x0: i32, y0: i32, x1: i32, y1: i32) -> Vec<(i32, i32)> {
    let mut cells = Vec::new();
    let dx = (x1 - x0).abs();
    let dy = -(y1 - y0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx + dy;
    let (mut x, mut y) = (x0, y0);
    loop {
        cells.push((x, y));
        if x == x1 && y == y1 {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x += sx;
        }
        if e2 <= dx {
            err += dx;
            y += sy;
        }
    }
    cells
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

/// Compass bearing (degrees, 0 = north, 90 = east) from one point to
/// another — used to orient a depot entrance's own semi-circle marker
/// (flat edge against the road it joins, DESIGN.md-adjacent user request)
/// along the real local direction of the road it's snapped to, the same
/// local flattening as `point_to_segment_closest`/`signed_side_of_segment`.
fn bearing_degrees(from_lon_e7: i32, from_lat_e7: i32, to_lon_e7: i32, to_lat_e7: i32) -> f64 {
    const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
    const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;
    let lat0 = (from_lat_e7 as f64 + to_lat_e7 as f64) * 0.5 * 1e-7 * DEG_TO_RAD;
    let cos_lat0 = lat0.cos();
    let dx = (to_lon_e7 - from_lon_e7) as f64 * 1e-7 * DEG_TO_RAD * cos_lat0;
    let dy = (to_lat_e7 - from_lat_e7) as f64 * 1e-7 * DEG_TO_RAD;
    let deg = dx.atan2(dy) * RAD_TO_DEG;
    if deg < 0.0 { deg + 360.0 } else { deg }
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
        let mut has_incoming = vec![false; graph.nodes.len()];

        // Pass 1 of 2 for the flat adjacency buffer (see its own doc
        // comment on the `Router` struct): count each node's own outgoing
        // hops first, so the exact right amount of space can be allocated
        // once, rather than growing 10M+ separate Vecs incrementally.
        let mut hop_counts: Vec<u32> = vec![0; graph.nodes.len()];
        for edge in &graph.edges {
            if !edge_is_routable(edge, &psv_override_way_ids) {
                continue;
            }
            if matches!(edge.oneway, OnewayDirection::Forward | OnewayDirection::TwoWay) {
                hop_counts[edge.from as usize] += 1;
                has_incoming[edge.to as usize] = true;
            }
            if matches!(edge.oneway, OnewayDirection::Reverse | OnewayDirection::TwoWay) {
                hop_counts[edge.to as usize] += 1;
                has_incoming[edge.from as usize] = true;
            }
        }

        let mut adjacency_offsets: Vec<u32> = Vec::with_capacity(graph.nodes.len() + 1);
        let mut running_offset = 0u32;
        adjacency_offsets.push(0);
        for &count in &hop_counts {
            running_offset += count;
            adjacency_offsets.push(running_offset);
        }

        // Pass 2: fill the flat buffer. `write_cursor` starts as a copy of
        // each node's own starting offset and advances past each hop as
        // it's written, so every hop lands in its own node's own slice
        // without needing a second counting pass per node.
        let mut write_cursor = adjacency_offsets[..graph.nodes.len()].to_vec();
        let mut adjacency: Vec<Hop> = vec![Hop { edge: 0, to_node: 0 }; running_offset as usize];
        for (idx, edge) in graph.edges.iter().enumerate() {
            if !edge_is_routable(edge, &psv_override_way_ids) {
                continue;
            }
            let edge_idx = idx as u32;
            if matches!(edge.oneway, OnewayDirection::Forward | OnewayDirection::TwoWay) {
                let pos = write_cursor[edge.from as usize] as usize;
                adjacency[pos] = Hop { edge: edge_idx, to_node: edge.to };
                write_cursor[edge.from as usize] += 1;
            }
            if matches!(edge.oneway, OnewayDirection::Reverse | OnewayDirection::TwoWay) {
                let pos = write_cursor[edge.to as usize] as usize;
                adjacency[pos] = Hop { edge: edge_idx, to_node: edge.from };
                write_cursor[edge.to as usize] += 1;
            }
        }

        // See edge_grid's own doc comment for why this exists. Built once
        // here, alongside adjacency, rather than lazily on first use — the
        // whole point is that nearest_node itself should never pay for
        // this, no matter how many times it's called.
        let mut edge_grid: HashMap<(i32, i32), Vec<u32>> = HashMap::new();
        for (idx, edge) in graph.edges.iter().enumerate() {
            if !edge_is_routable(edge, &psv_override_way_ids) {
                continue;
            }
            let from = &graph.nodes[edge.from as usize];
            let to = &graph.nodes[edge.to as usize];
            let mut touched: HashSet<(i32, i32)> = HashSet::new();
            let mut prev = (from.lon_e7, from.lat_e7);
            for &next in graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
                let prev_cell = nearest_node_grid_key(prev.0, prev.1);
                let next_cell = nearest_node_grid_key(next.0, next.1);
                for cell in cells_along_segment(prev_cell.0, prev_cell.1, next_cell.0, next_cell.1) {
                    touched.insert(cell);
                }
                prev = next;
            }
            let edge_idx = idx as u32;
            for cell in touched {
                edge_grid.entry(cell).or_default().push(edge_idx);
            }
        }

        Router {
            graph,
            adjacency,
            adjacency_offsets,
            last_edges: RefCell::new(Vec::new()),
            last_edge_point_counts: RefCell::new(Vec::new()),
            last_route_time_seconds: RefCell::new(0.0),
            has_incoming,
            psv_override_way_ids,
            edge_grid,
        }
    }

    /// A node's own outgoing hops — see `adjacency`'s own doc comment on
    /// the `Router` struct for why this is a slice into a shared flat
    /// buffer rather than `&self.adjacency[node]` directly.
    fn node_adjacency(&self, node: u32) -> &[Hop] {
        let start = self.adjacency_offsets[node as usize] as usize;
        let end = self.adjacency_offsets[node as usize + 1] as usize;
        &self.adjacency[start..end]
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

        // Only the routable edges in cells actually near the query point —
        // see edge_grid's own doc comment for why this exists instead of
        // scanning the whole graph. Expands ring by ring (0 = just the
        // query's own cell, 1 = the 8 cells around it, 2 = the next layer
        // out...) until a match has been found *and* no closer edge could
        // possibly exist further out, the standard grid-search stopping
        // rule. `seen_edges` skips an edge already evaluated from an
        // earlier, adjacent cell — every edge is registered in every cell
        // its own geometry touches, so a long edge is often found from
        // more than one cell in the same search.
        const EARTH_RADIUS_M: f64 = 6_371_000.0;
        let cell_size_m = (NEAREST_NODE_GRID_CELL_E7 as f64 * 1e-7).to_radians() * EARTH_RADIUS_M;
        let (center_x, center_y) = nearest_node_grid_key(lon_e7, lat_e7);
        let mut seen_edges: HashSet<u32> = HashSet::new();

        // A ring this wide (~200 * 200m = 40km) comfortably covers "query
        // point is nowhere near any mapped road at all" as a hard stop
        // rather than searching forever — real queries (a real stop, a
        // real click on the map) are never remotely this far from the
        // nearest routable edge.
        for ring in 0..=200i32 {
            for cx in (center_x - ring)..=(center_x + ring) {
                for cy in (center_y - ring)..=(center_y + ring) {
                    // Only this ring's own outer edge — smaller rings were
                    // already fully covered on earlier iterations.
                    if ring > 0
                        && cx != center_x - ring
                        && cx != center_x + ring
                        && cy != center_y - ring
                        && cy != center_y + ring
                    {
                        continue;
                    }
                    let Some(edge_idxs) = self.edge_grid.get(&(cx, cy)) else {
                        continue;
                    };
                    for &edge_idx in edge_idxs {
                        if !seen_edges.insert(edge_idx) {
                            continue;
                        }
                        let edge = &self.graph.edges[edge_idx as usize];
                        let from = &self.graph.nodes[edge.from as usize];
                        let to = &self.graph.nodes[edge.to as usize];

                        let mut prev = (from.lon_e7, from.lat_e7);
                        for &next in self.graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
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
                                    let from_has_out = !self.node_adjacency(edge.from).is_empty();
                                    let to_has_out = !self.node_adjacency(edge.to).is_empty();
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
                }
            }

            if best.is_some() && (ring as f64) * cell_size_m > best_dist {
                break;
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
            for &next in self.graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
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

    /// The compass bearing (0 = north) of the direction of travel a stop
    /// at `(lon, lat)` serves — which way a bus using it is heading. A
    /// real user request against stop groups (DESIGN.md §4): "each stop
    /// needs to know the direction it faces, otherwise if [a route
    /// change] uses a better stop it might be on the wrong side of the
    /// road." Works for a real imported OSM stop exactly the same way as
    /// a player-placed one — `place_stop`'s own doc comment already notes
    /// this direction "isn't stored anywhere; it's implicit in which
    /// physical kerb it lands on," so it can be derived on demand from any
    /// stop's already-fixed position, without a pipeline rebuild or a new
    /// stored field: a oneway road has one legal direction regardless of
    /// which side the stop is on; a two-way road's direction is read off
    /// **which side of the road the stop's own real position already
    /// sits on** — the same side-determination `place_stop` uses against
    /// a fresh click, applied here to a stop's existing coordinates
    /// instead.
    ///
    /// Returns `0.0` if the graph has no edges at all (never true against
    /// real pipeline data) — a stop is always near some road in practice,
    /// so this isn't a meaningful "no road found" signal the caller needs
    /// to check.
    pub fn stop_facing_bearing(&self, lon: f64, lat: f64) -> f64 {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        let (p_lon_e7, p_lat_e7) = (to_e7(lon), to_e7(lat));

        let mut best_dist = f64::INFINITY;
        // segment a, segment b, this edge's oneway.
        let mut best: Option<(i32, i32, i32, i32, OnewayDirection)> = None;

        for edge in &self.graph.edges {
            let from = &self.graph.nodes[edge.from as usize];
            let to = &self.graph.nodes[edge.to as usize];
            let mut prev = (from.lon_e7, from.lat_e7);
            for &next in self.graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
                let (d, _, _) = point_to_segment_closest(p_lon_e7, p_lat_e7, prev.0, prev.1, next.0, next.1);
                if d < best_dist {
                    best_dist = d;
                    best = Some((prev.0, prev.1, next.0, next.1, edge.oneway));
                }
                prev = next;
            }
        }

        let Some((a_lon_e7, a_lat_e7, b_lon_e7, b_lat_e7, oneway)) = best else {
            return 0.0;
        };

        let cross = signed_side_of_segment(p_lon_e7, p_lat_e7, a_lon_e7, a_lat_e7, b_lon_e7, b_lat_e7);
        let forward = match oneway {
            OnewayDirection::Forward => true,
            OnewayDirection::Reverse => false,
            OnewayDirection::TwoWay => cross >= 0.0,
        };
        if forward {
            bearing_degrees(a_lon_e7, a_lat_e7, b_lon_e7, b_lat_e7)
        } else {
            bearing_degrees(b_lon_e7, b_lat_e7, a_lon_e7, a_lat_e7)
        }
    }

    /// The nearest point on **any** road (not just a bus-legal one) to
    /// `(lon, lat)`, as `[lon, lat]` — for depot placement (OPERATIONS.md
    /// §2), where `snap_to_road`'s own bus-legal-only search
    /// (`nearest_node`, built for real route drawing where a bus must
    /// actually be able to drive there) was the wrong tool: a real depot's
    /// own access road is very often a private/restricted road exactly
    /// like the ones that filter excludes, so both the depot's own site
    /// and its entrances would silently snap onto the nearest *public*
    /// street instead of the depot's own real access road (a live user
    /// report: "it won't snap to the correct road" near a real depot).
    /// Shares `place_stop`'s own every-edge foot-point search rather than
    /// `nearest_node`'s filtered one, but skips its kerb offset — an
    /// entrance or a depot site sits ON the road it meets, not beside it
    /// on a kerb the way a passenger-facing stop does.
    pub fn snap_to_any_road(&self, lon: f64, lat: f64) -> Vec<f64> {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        let (p_lon_e7, p_lat_e7) = (to_e7(lon), to_e7(lat));

        let mut best_dist = f64::INFINITY;
        let mut best: Option<(i32, i32)> = None;

        for edge in &self.graph.edges {
            let from = &self.graph.nodes[edge.from as usize];
            let to = &self.graph.nodes[edge.to as usize];
            let mut prev = (from.lon_e7, from.lat_e7);
            for &next in self.graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
                let (d, foot_lon_e7, foot_lat_e7) =
                    point_to_segment_closest(p_lon_e7, p_lat_e7, prev.0, prev.1, next.0, next.1);
                if d < best_dist {
                    best_dist = d;
                    best = Some((foot_lon_e7, foot_lat_e7));
                }
                prev = next;
            }
        }

        let Some((foot_lon_e7, foot_lat_e7)) = best else {
            return Vec::new();
        };
        vec![foot_lon_e7 as f64 * 1e-7, foot_lat_e7 as f64 * 1e-7]
    }

    /// For a depot **entrance** specifically (OPERATIONS.md §2): a click
    /// near a private access road that dead-ends into a depot site is
    /// usually meant as "the entrance is here, where this road meets the
    /// public road network," not literally the exact point clicked partway
    /// along that access road — a real user request, with an ASCII
    /// diagram confirmed against: the marker should sit at the junction
    /// where the depot's own road meets the main road, not scattered along
    /// whichever point of the access road happened to be nearest the
    /// click.
    ///
    /// Finds the nearest road the same way `snap_to_any_road` does, then
    /// checks its own two endpoint nodes' degree (how many edges touch
    /// each one at all, not just this one) — a routing graph only ever
    /// creates a node at a real topological point (a junction or a dead
    /// end), never at a plain shape point (those stay inside `geometry`),
    /// so degree 1 always means a genuine dead end and degree ≥2 always
    /// means a real junction. Any end that reaches a real junction (degree
    /// ≥3) is a candidate; when only one side does (the depot-access-road
    /// shape from the diagram — one dead end, one junction) that one wins
    /// outright. When *both* sides do — a real case, not hypothetical: a
    /// depot's own access road can already meet the wider network this
    /// close on both sides of wherever was clicked, rather than dead-
    /// ending cleanly first — snaps to whichever candidate junction is
    /// geographically nearer the click, since that's the one the player
    /// meant. Two dead ends (a short isolated stub, touching the road
    /// network nowhere) is the only shape left with no real junction to
    /// snap to at all, and falls back to the plain nearest point.
    ///
    /// Returns `[lon, lat]` — the junction node's own real position, with
    /// no offset at all. Entrances/exits are now shown as plain dots (a
    /// live user request after the previous oriented semi-circle marker
    /// — which needed a bearing to rotate and a road width to scale by,
    /// both now removed entirely — proved "constantly breaking": several
    /// rounds of kerb offsets and pull-back distances all fought the same
    /// underlying problem, that a real-world metre offset has no reliable
    /// relationship to the basemap's own fixed-pixel-per-zoom road width,
    /// see this function's own git history). A plain dot has no
    /// orientation to get wrong, so anchoring directly at the junction's
    /// own already-correct position is simply correct, with nothing left
    /// to calibrate.
    ///
    /// This is now the ONLY visual signal a player gets about where an
    /// entrance will land — a live follow-up instruction removed the
    /// candidate-junction hint dots `nearby_junctions` used to show before
    /// a click, since "junction snapping... is now only to let buses know
    /// which roads to use, not for anything visual." The player simply
    /// clicks a road near a depot/dealer and this function snaps to
    /// whichever real junction (or, lacking one, the nearest point on the
    /// clicked road) is reached by walking outward from there — see
    /// `walk_to_junction_or_dead_end`'s own doc comment for exactly how
    /// that walk picks a junction.
    pub fn snap_entrance_to_junction(&self, lon: f64, lat: f64) -> Vec<f64> {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        let (p_lon_e7, p_lat_e7) = (to_e7(lon), to_e7(lat));

        let mut best_dist = f64::INFINITY;
        let mut best: Option<(u32, i32, i32)> = None; // edge index, foot lon/lat e7

        for (edge_idx, edge) in self.graph.edges.iter().enumerate() {
            let from = &self.graph.nodes[edge.from as usize];
            let to = &self.graph.nodes[edge.to as usize];
            let mut prev = (from.lon_e7, from.lat_e7);
            for &next in self.graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
                let (d, foot_lon_e7, foot_lat_e7) =
                    point_to_segment_closest(p_lon_e7, p_lat_e7, prev.0, prev.1, next.0, next.1);
                if d < best_dist {
                    best_dist = d;
                    best = Some((edge_idx as u32, foot_lon_e7, foot_lat_e7));
                }
                prev = next;
            }
        }

        let Some((edge_idx, foot_lon_e7, foot_lat_e7)) = best else {
            return Vec::new();
        };
        let edge = &self.graph.edges[edge_idx as usize];

        // Real OSM depot access roads are very often more than one edge —
        // a gentle bend, or just how the way happened to get digitized —
        // so checking only the clicked edge's own two endpoints (as a
        // first version of this function did) missed real depots whose
        // access road has an intermediate node before reaching the
        // junction with the main road. Walk outward from each of the
        // clicked edge's own endpoints, following a chain of nodes where
        // only two edges meet (a plain "the road just continues here," not
        // a real fork) until reaching a node where that's no longer true —
        // either a genuine dead end (degree 1) or a real junction (degree
        // >= 3). A 500-hop cap guards a closed loop of degree-2 nodes with
        // no junction anywhere on it (never true for a real depot access
        // road, but cheap insurance against looping forever).
        const MAX_WALK_HOPS: u32 = 500;
        // Returns (terminal node, its degree, the node one hop back from
        // it along the walk, the edge id the walk arrived via) — the last
        // two let the caller compute both the access road's own real
        // approach bearing AND, separately, the real main road's own
        // bearing (any OTHER edge touching the junction), rather than
        // assuming the two roads meet at a clean right angle.
        //
        // Stops at the FIRST node that isn't a plain pass-through (degree
        // != 2) — a real dead end, or a real junction, whichever comes
        // first walking outward from the clicked edge. A same-session
        // detour tried "keep walking past a degree >= 3 node whenever
        // every other road there is less major," aiming to reach a
        // genuinely major road further out (a real depot's driveway can
        // pass several minor side-track junctions first) — but a live
        // follow-up report showed this overshoots just as badly the other
        // way: it walked straight past the real junction the player
        // actually clicked near, all the way to an unrelated, much more
        // major road far away, changing both the position and the
        // returned road width to a road with no real relationship to
        // where the player clicked. The player's own proposed fix is the
        // simpler and more predictable one: snap to whichever real
        // junction is nearest wherever they actually click, and trust
        // them to click near the junction they mean — not guess how far
        // out "the real main road" must be by reasoning about road class.
        // A 500-hop cap guards a closed loop of degree-2 nodes with no
        // junction anywhere on it (never true for a real depot access
        // road, but cheap insurance against looping forever).
        let walk_to_junction_or_dead_end = |start_node: u32, start_edge: u32, came_from: u32| -> (u32, usize, u32, u32) {
            let mut current_node = start_node;
            let mut prev_node = came_from;
            let mut last_edge = start_edge;
            for _ in 0..MAX_WALK_HOPS {
                let touching: Vec<u32> = self
                    .graph
                    .edges
                    .iter()
                    .enumerate()
                    .filter(|(_, e)| e.from == current_node || e.to == current_node)
                    .map(|(i, _)| i as u32)
                    .collect();
                if touching.len() != 2 {
                    return (current_node, touching.len(), prev_node, last_edge);
                }
                let Some(&next_edge_idx) = touching.iter().find(|&&i| i != last_edge) else {
                    // Both touching edges are the same one we arrived on
                    // (a dangling duplicate) — treat as a dead end rather
                    // than looping on it.
                    return (current_node, 1, prev_node, last_edge);
                };
                let next_edge = &self.graph.edges[next_edge_idx as usize];
                prev_node = current_node;
                current_node = if next_edge.from == current_node { next_edge.to } else { next_edge.from };
                last_edge = next_edge_idx;
            }
            (current_node, 2, prev_node, last_edge) // Hit the hop cap — neither a dead end nor a junction, so it's skipped below.
        };

        let (from_terminal, from_degree, _, _) = walk_to_junction_or_dead_end(edge.from, edge_idx, edge.to);
        let (to_terminal, to_degree, _, _) = walk_to_junction_or_dead_end(edge.to, edge_idx, edge.from);
        // A real user report against a real depot: neither end of the
        // clicked road was a dead end at all — both walks hit a genuine
        // junction (degree >= 3) immediately, zero hops in either
        // direction, because the clicked segment was itself a short link
        // directly between two nearby junctions (a real access road can
        // already touch the wider network this closely; the original
        // "exactly one dead end, one junction" shape was too narrow).
        // That fell through to the no-junction fallback, which is why the
        // marker landed on the plain clicked point with an arbitrary
        // bearing instead of snapping anywhere. When both ends qualify,
        // snap to whichever is geographically nearer the click — that's
        // the one the player actually meant.
        let junction: Option<u32> = match (from_degree, to_degree) {
            (1, d) if d >= 3 => Some(to_terminal),
            (d, 1) if d >= 3 => Some(from_terminal),
            (a, b) if a >= 3 && b >= 3 => {
                let dist2 = |node: u32| {
                    let n = &self.graph.nodes[node as usize];
                    let dlon = (n.lon_e7 - foot_lon_e7) as i64;
                    let dlat = (n.lat_e7 - foot_lat_e7) as i64;
                    dlon * dlon + dlat * dlat
                };
                if dist2(from_terminal) <= dist2(to_terminal) {
                    Some(from_terminal)
                } else {
                    Some(to_terminal)
                }
            }
            _ => None,
        };

        if let Some(node) = junction {
            let n = &self.graph.nodes[node as usize];
            vec![n.lon_e7 as f64 * 1e-7, n.lat_e7 as f64 * 1e-7]
        } else {
            // No real junction to anchor against — the plain nearest
            // point on the clicked road itself.
            vec![foot_lon_e7 as f64 * 1e-7, foot_lat_e7 as f64 * 1e-7]
        }
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
            .map(|&(edge_idx, _)| (self.graph.edges[edge_idx as usize].geometry_len + 1) as u32)
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
                for &(lon_e7, lat_e7) in self.graph.edge_geometry(edge) {
                    push_e7(&mut coords, lon_e7, lat_e7);
                }
            } else {
                for &(lon_e7, lat_e7) in self.graph.edge_geometry(edge).iter().rev() {
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

            for hop in self.node_adjacency(node) {
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
            geometry_start: 0,
            geometry_len: 0,
        }
    }

    fn graph_node(osm_id: i64, lon_e7: i32, lat_e7: i32) -> GraphNode {
        GraphNode { osm_id, lon_e7, lat_e7, junction_control: game_data::JunctionControl::None }
    }


    /// `adjacency`'s own flat CSR buffer (`Router` struct's own doc
    /// comment, OPEN-ITEMS.md T55-map-boundary's WASM-allocator fix) must
    /// give each node exactly its own hops, with no bleed into a
    /// neighbouring node's own slice — the exact class of off-by-one a
    /// two-pass offset/write-cursor refactor like this one could silently
    /// introduce. A 4-node star, all edges two-way (the `edge()` test
    /// helper's own default): node 0 has three real outgoing hops (to 1,
    /// 2, 3); nodes 1/2/3 each have exactly one hop of their own, straight
    /// back to node 0 — never to each other, and never more than one.
    #[test]
    fn node_adjacency_gives_each_node_exactly_its_own_hops_no_bleed_into_neighbours() {
        let nodes = vec![
            graph_node(1, 0, 0),
            graph_node(2, 0, 1_000_000),
            graph_node(3, 1_000_000, 0),
            graph_node(4, -1_000_000, 0),
        ];
        let edges = vec![
            edge(0, 1, 1, 11, 100.0),
            edge(0, 2, 2, 11, 100.0),
            edge(0, 3, 3, 11, 100.0),
        ];
        let bytes = game_data::encode(&RoadGraph { nodes, edges, restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        let hops_from_0 = router.node_adjacency(0);
        let mut to_nodes: Vec<u32> = hops_from_0.iter().map(|h| h.to_node).collect();
        to_nodes.sort();
        assert_eq!(to_nodes, vec![1, 2, 3], "node 0 should have exactly its own 3 hops, in no particular order");

        for (node, expected_back_to) in [(1u32, 0u32), (2, 0), (3, 0)] {
            let hops = router.node_adjacency(node);
            assert_eq!(
                hops.len(),
                1,
                "node {node} should have exactly its own 1 return hop, no bleed from node 0's own 3"
            );
            assert_eq!(hops[0].to_node, expected_back_to, "node {node}'s own hop should lead back to node 0, not to a sibling");
        }
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
        let bytes = game_data::encode(&RoadGraph { nodes, edges, restrictions: vec![], geometry_points: vec![] });

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
            geometry_points: vec![],
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
            geometry_points: vec![],
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
            geometry_points: vec![],
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
            geometry_points: vec![],
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
            geometry_points: vec![],
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
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
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
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
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
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
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
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        let result = router.place_stop(0.0005, 0.05);
        assert_eq!(result.len(), 3, "an access-restricted road should still be a valid placement target, not skipped");
        assert_eq!(result[2], 0.0, "an access-restricted road with no psv/bus override should be flagged as not bus-legal");
    }

    /// A real user request against stop groups: "each stop needs to know
    /// the direction it faces." A oneway road has one legal direction
    /// regardless of which side of the road a stop sits on — same
    /// north-south road as `place_stop_oneway_forward_always_uses_its_own_left_kerb`.
    #[test]
    fn stop_facing_bearing_oneway_forward_always_faces_north() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)];
        let mut road = edge(0, 1, 900, 11, 100.0);
        road.oneway = OnewayDirection::Forward;
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        // Checked from both sides of the road — a forward-only road's
        // direction doesn't depend on which side the stop is on.
        let west_side = router.stop_facing_bearing(-0.0005, 0.05);
        let east_side = router.stop_facing_bearing(0.0005, 0.05);
        assert!((west_side - 0.0).abs() < 1e-3, "expected north (0°), got {west_side}");
        assert!((east_side - 0.0).abs() < 1e-3, "expected north (0°), got {east_side}");
    }

    /// The mirror case: a reverse-only road always faces south.
    #[test]
    fn stop_facing_bearing_oneway_reverse_always_faces_south() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)];
        let mut road = edge(0, 1, 900, 11, 100.0);
        road.oneway = OnewayDirection::Reverse;
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        let result = router.stop_facing_bearing(0.0005, 0.05);
        assert!((result - 180.0).abs() < 1e-3, "expected south (180°), got {result}");
    }

    /// A two-way road: the direction is read off which side of the road
    /// the stop's own position already sits on — matching
    /// `place_stop_two_way_road_uses_the_click_s_own_side`'s own west/east
    /// kerb split, west faces north (left-kerb-for-northbound) and east
    /// faces south (left-kerb-for-southbound), exactly mirroring which
    /// kerb `place_stop` would have chosen for each side.
    #[test]
    fn stop_facing_bearing_two_way_road_reads_the_stop_s_own_side() {
        let nodes = vec![graph_node(1, 0, 0), graph_node(2, 0, 1_000_000)];
        let road = edge(0, 1, 900, 11, 100.0); // TwoWay by default
        let bytes = game_data::encode(&RoadGraph { nodes, edges: vec![road], restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        let west_side = router.stop_facing_bearing(-0.0005, 0.05);
        let east_side = router.stop_facing_bearing(0.0005, 0.05);
        assert!((west_side - 0.0).abs() < 1e-3, "west kerb should face north (0°), got {west_side}");
        assert!((east_side - 180.0).abs() < 1e-3, "east kerb should face south (180°), got {east_side}");
    }

    ///        F
    ///        |
    /// A --- B --- C --- D
    ///              \
    ///               G
    /// A and D and F and G are genuine dead ends (degree 1). B and C are
    /// **real** junctions (degree 3 — a third road actually branches off
    /// each one, F at B and G at C), not just a bend in one continuous
    /// road. A-B is a depot's own private access road; B-C is the main
    /// road it joins. Matches the user's own diagram: a short depot road
    /// meeting a longer main road at a real fork.
    fn depot_access_road_graph() -> Vec<u8> {
        let nodes = vec![
            graph_node(1, 0, 0),                  // 0 = A, depot's own dead end
            graph_node(2, 0, 1_000_000),           // 1 = B, real junction (A, C, F all meet here)
            graph_node(3, 1_000_000, 1_000_000),   // 2 = C, real junction (B, D, G all meet here)
            graph_node(4, 2_000_000, 1_000_000),   // 3 = D, a dead end off the main road's far side
            graph_node(5, 0, 2_000_000),           // 4 = F, a dead-end stub off B (gives B degree 3)
            graph_node(6, 1_000_000, 2_000_000),   // 5 = G, a dead-end stub off C (gives C degree 3)
        ];
        let edges = vec![
            edge(0, 1, 1, 11, 100.0), // A-B: the depot access road
            edge(1, 2, 2, 6, 500.0),  // B-C: the main road
            edge(2, 3, 3, 11, 100.0), // C-D: continues past C
            edge(1, 4, 4, 11, 50.0),  // B-F: the stub that makes B a real fork
            edge(2, 5, 5, 11, 50.0),  // C-G: the stub that makes C a real fork
        ];
        game_data::encode(&RoadGraph { nodes, edges, restrictions: vec![], geometry_points: vec![] })
    }

    /// A click anywhere along the depot's own access road (A-B) should
    /// snap to B, the real junction with the main road — not the plain
    /// nearest point on the clicked edge, which could be anywhere between
    /// the depot and the road.
    #[test]
    fn snap_entrance_to_junction_snaps_a_dead_end_spur_to_its_junction() {
        let bytes = depot_access_road_graph();
        let router = Router::new(&bytes, vec![]);

        // Roughly the midpoint of A-B (lat 0.05), off to one side (lon
        // 0.0003) the same way a real click never lands exactly on the
        // line.
        let result = router.snap_entrance_to_junction(0.0003, 0.05);
        assert_eq!(result.len(), 2, "expected [lon, lat]");
        // The marker's own position is junction B's own real position,
        // with no offset at all.
        assert!(
            (result[0] - 0.0).abs() < 1e-6 && (result[1] - 0.1).abs() < 1e-6,
            "expected junction B's own real position (0.0, 0.1), got ({}, {})",
            result[0],
            result[1]
        );
    }

    /// A real user report against a real depot: the clicked road's own two
    /// endpoints were BOTH real junctions already (a short link directly
    /// between two nearby forks, rather than a clean dead-end-to-junction
    /// shape) — the original version gave up on this entirely and fell
    /// back to the plain clicked point with an arbitrary bearing, which is
    /// exactly what the user saw ("not at the junction... 90 degrees
    /// off"). A click on B-C (both B and C are real forks in this graph,
    /// degree 3 each) should now snap to whichever of the two is
    /// geographically nearer the click, not fall back.
    #[test]
    fn snap_entrance_to_junction_on_a_through_road_snaps_to_the_nearer_junction() {
        let bytes = depot_access_road_graph();
        let router = Router::new(&bytes, vec![]);

        // Clicked clearly nearer B (0.0, 0.1) than C (0.1, 0.1).
        let result = router.snap_entrance_to_junction(0.03, 0.1005);
        assert_eq!(result.len(), 2, "expected [lon, lat]");
        assert!(
            (result[0] - 0.0).abs() < 1e-6 && (result[1] - 0.1).abs() < 1e-6,
            "expected junction B's own real position (0.0, 0.1), got ({}, {})",
            result[0],
            result[1]
        );

        // Clicked clearly nearer C (0.1, 0.1) than B.
        let result = router.snap_entrance_to_junction(0.08, 0.1005);
        assert_eq!(result.len(), 2, "expected [lon, lat]");
        assert!(
            (result[0] - 0.1).abs() < 1e-6 && (result[1] - 0.1).abs() < 1e-6,
            "expected junction C's own real position (0.1, 0.1), got ({}, {})",
            result[0],
            result[1]
        );
    }

    /// The real motivation for the walk (not just checking the clicked
    /// edge's own two endpoints): a depot's own access road is often more
    /// than one edge — a gentle bend digitized as a separate node, with
    /// nothing else connecting there. A --- A2 --- B(real junction), where
    /// A2 only has the two edges either side of it (degree 2, a plain
    /// continuation, not a fork). A live user report: entrances "snap to
    /// a road... but don't snap to a junction" — this was exactly the gap,
    /// since the original single-hop check saw A2 as just "another
    /// non-dead-end endpoint" and gave up rather than walking past it.
    #[test]
    fn snap_entrance_to_junction_walks_past_an_intermediate_bend() {
        let nodes = vec![
            graph_node(1, 0, 0),                 // 0 = A, depot's own dead end
            graph_node(2, 0, 500_000),            // 1 = A2, a mid-road bend (degree 2, not a fork)
            graph_node(3, 0, 1_000_000),          // 2 = B, the real junction
            graph_node(4, 1_000_000, 1_000_000),  // 3 = C, main road continuing from B
            graph_node(5, 0, 2_000_000),          // 4 = F, a dead-end stub off B (gives B degree 3)
        ];
        let edges = vec![
            edge(0, 1, 1, 11, 50.0),  // A-A2: first half of the depot access road
            edge(1, 2, 1, 11, 50.0),  // A2-B: second half, same way id, just a bend
            edge(2, 3, 2, 6, 500.0),  // B-C: the main road
            edge(2, 4, 3, 11, 50.0),  // B-F: the stub that makes B a real fork
        ];
        let bytes = game_data::encode(&RoadGraph { nodes, edges, restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        // A click on the FIRST half of the access road (A-A2) — the real
        // junction (B) is a whole extra hop past where the click landed.
        // The walk must still reach it, not stop at A2 (a plain bend).
        let result = router.snap_entrance_to_junction(0.0003, 0.025);
        assert_eq!(result.len(), 2, "expected [lon, lat]");
        assert!(
            (result[0] - 0.0).abs() < 1e-6 && (result[1] - 0.1).abs() < 1e-6,
            "expected junction B's own real position (0.0, 0.1), got ({}, {})",
            result[0],
            result[1]
        );
    }

    /// A same-session detour and revert, both against the same real depot
    /// (Broom Place, Portree). A live report after T61 shipped ("the
    /// entrance is facing the wrong road") led to a version that kept
    /// walking past a degree >= 3 node whenever every other road there was
    /// *less major* than the one just walked in on, aiming to reach a
    /// genuinely major road further out rather than stopping at the first
    /// minor side-track fork. That fix was itself wrong in the other
    /// direction: a live follow-up report showed it overshooting past the
    /// real junction the player had actually clicked near, all the way to
    /// an unrelated, much more major road far away — changing the position
    /// AND the returned road width to a road with no real connection to
    /// where the player clicked. The player's own proposed fix — snap to
    /// whichever real junction is nearest wherever they click, and trust
    /// them to click near the junction they mean, rather than have the
    /// algorithm guess how far out "the real main road" must be — is what
    /// shipped instead (see `walk_to_junction_or_dead_end`'s own doc
    /// comment). This test pins that choice down: J1 (the *first* fork,
    /// even though its own other road is a minor, less-major spur) is
    /// where the walk should stop, not J2 (a genuinely more major road,
    /// further out) — the reverse of what an earlier version of this test
    /// asserted.
    #[test]
    fn snap_entrance_to_junction_stops_at_the_first_fork_even_when_a_more_major_road_is_further_out() {
        let nodes = vec![
            graph_node(1, 0, 0),                 // 0 = A, depot's own dead end
            graph_node(2, 0, 1_000_000),          // 1 = J1, the first fork — should be where the walk stops
            graph_node(3, 500_000, 1_000_000),    // 2 = S1, a dead-end track off J1 (gives J1 degree 3)
            graph_node(4, 0, 2_000_000),          // 3 = J2, a more major road, further out — NOT the answer
            graph_node(5, 1_000_000, 2_000_000),  // 4 = C, the major road, due east of J2
            graph_node(6, 0, 3_000_000),          // 5 = F, a dead-end stub off J2 (gives J2 degree 3)
        ];
        let edges = vec![
            edge(0, 1, 1, 11, 100.0), // A-J1: the depot's own driveway (Residential)
            edge(1, 3, 1, 11, 100.0), // J1-J2: SAME way (1) — the driveway just keeps going
            edge(1, 2, 2, 13, 30.0),  // J1-S1: a minor track (Service, less major than 11)
            edge(3, 4, 3, 4, 500.0),  // J2-C: a more major road (Primary), further out
            edge(3, 5, 4, 11, 50.0),  // J2-F: stub, just to give J2 degree 3
        ];
        let bytes = game_data::encode(&RoadGraph { nodes, edges, restrictions: vec![], geometry_points: vec![] });
        let router = Router::new(&bytes, vec![]);

        let result = router.snap_entrance_to_junction(0.0003, 0.05);
        assert_eq!(result.len(), 2, "expected [lon, lat]");
        // The position must be J1 (lat 0.1), not J2 (lat 0.2) — the walk
        // should stop at the nearest fork, not overshoot to a more major
        // road further out.
        assert!(
            result[1] < 0.15,
            "expected the marker anchored near J1 (lat ~0.1), not J2 (lat 0.2) — walked too far, got lat {}",
            result[1]
        );
    }

}
