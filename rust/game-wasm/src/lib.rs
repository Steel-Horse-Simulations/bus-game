use game_data::{OnewayDirection, RoadGraph, StopKind};
use std::cmp::Ordering;
use std::collections::BinaryHeap;
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
}

fn edge_is_routable(edge: &game_data::Edge) -> bool {
    // A road buses can't legally use at all is excluded outright; psv/bus
    // tags are specifically the OSM convention for "closed to general
    // traffic but open to buses", so they override the restriction.
    !edge.access_restricted || edge.psv_yes || edge.bus_yes
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

#[derive(PartialEq)]
struct QueueEntry {
    cost_m: f64,
    node: u32,
}

impl Eq for QueueEntry {}
impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed: BinaryHeap is a max-heap, Dijkstra wants the smallest cost.
        other.cost_m.partial_cmp(&self.cost_m).expect("edge costs are always finite")
    }
}
impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[wasm_bindgen]
impl Router {
    #[wasm_bindgen(constructor)]
    pub fn new(graph_bytes: &[u8]) -> Router {
        let graph = game_data::decode(graph_bytes);
        let mut adjacency: Vec<Vec<Hop>> = (0..graph.nodes.len()).map(|_| Vec::new()).collect();

        for (idx, edge) in graph.edges.iter().enumerate() {
            if !edge_is_routable(edge) {
                continue;
            }
            let edge_idx = idx as u32;
            if matches!(edge.oneway, OnewayDirection::Forward | OnewayDirection::TwoWay) {
                adjacency[edge.from as usize].push(Hop { edge: edge_idx, to_node: edge.to });
            }
            if matches!(edge.oneway, OnewayDirection::Reverse | OnewayDirection::TwoWay) {
                adjacency[edge.to as usize].push(Hop { edge: edge_idx, to_node: edge.from });
            }
        }

        Router { graph, adjacency }
    }

    pub fn node_count(&self) -> usize {
        self.graph.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.graph.edges.len()
    }

    /// Index of the graph node nearest the given point, or `None` (returned
    /// as `-1`, since wasm-bindgen doesn't hand back `Option<u32>` neatly)
    /// if the graph has no nodes at all.
    fn nearest_node(&self, lon_e7: i32, lat_e7: i32) -> Option<u32> {
        self.graph
            .nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (i as u32, approx_distance_m(lon_e7, lat_e7, n.lon_e7, n.lat_e7)))
            .min_by(|a, b| a.1.partial_cmp(&b.1).expect("distances are always finite"))
            .map(|(i, _)| i)
    }

    /// Shortest path by distance between two points, snapped to the nearest
    /// routable graph node each. Returns a flattened `[lon, lat, lon, lat,
    /// ...]` array (degrees, not nanodegrees) tracing the route — including
    /// each edge's intermediate shape points, not just junctions, so the
    /// line actually follows the road rather than cutting corners — or an
    /// empty array if no route exists. `Vec<f64>` crosses the wasm-bindgen
    /// boundary without needing a serde-wasm-bindgen dependency.
    pub fn find_route(&self, from_lon: f64, from_lat: f64, to_lon: f64, to_lat: f64) -> Vec<f64> {
        let to_e7 = |deg: f64| (deg * 1e7).round() as i32;
        let (Some(start), Some(goal)) = (
            self.nearest_node(to_e7(from_lon), to_e7(from_lat)),
            self.nearest_node(to_e7(to_lon), to_e7(to_lat)),
        ) else {
            return Vec::new();
        };

        let Some(steps) = self.dijkstra(start, goal) else {
            return Vec::new();
        };

        let push_e7 = |coords: &mut Vec<f64>, lon_e7: i32, lat_e7: i32| {
            coords.push(lon_e7 as f64 * 1e-7);
            coords.push(lat_e7 as f64 * 1e-7);
        };

        let mut coords = Vec::new();
        let start_node = &self.graph.nodes[start as usize];
        push_e7(&mut coords, start_node.lon_e7, start_node.lat_e7);

        let mut current = start;
        for (edge_idx, next_node) in steps {
            let edge = &self.graph.edges[edge_idx as usize];
            if edge.from == current {
                for &(lon_e7, lat_e7) in &edge.geometry {
                    push_e7(&mut coords, lon_e7, lat_e7);
                }
            } else {
                for &(lon_e7, lat_e7) in edge.geometry.iter().rev() {
                    push_e7(&mut coords, lon_e7, lat_e7);
                }
            }
            let n = &self.graph.nodes[next_node as usize];
            push_e7(&mut coords, n.lon_e7, n.lat_e7);
            current = next_node;
        }
        coords
    }

    /// Returns the path as a list of `(edge, node arrived at)` steps in
    /// order, or `None` if unreachable.
    fn dijkstra(&self, start: u32, goal: u32) -> Option<Vec<(u32, u32)>> {
        let n = self.graph.nodes.len();
        let mut dist = vec![f64::INFINITY; n];
        let mut prev: Vec<Option<(u32, u32)>> = vec![None; n]; // (prev_node, via_edge)
        let mut visited = vec![false; n];

        dist[start as usize] = 0.0;
        let mut queue = BinaryHeap::new();
        queue.push(QueueEntry { cost_m: 0.0, node: start });

        while let Some(QueueEntry { cost_m, node }) = queue.pop() {
            if visited[node as usize] {
                continue;
            }
            visited[node as usize] = true;
            if node == goal {
                break;
            }

            for hop in &self.adjacency[node as usize] {
                let edge = &self.graph.edges[hop.edge as usize];
                let next_cost = cost_m + edge.length_m as f64;
                if next_cost < dist[hop.to_node as usize] {
                    dist[hop.to_node as usize] = next_cost;
                    prev[hop.to_node as usize] = Some((node, hop.edge));
                    queue.push(QueueEntry { cost_m: next_cost, node: hop.to_node });
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
        Some(steps)
    }
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
