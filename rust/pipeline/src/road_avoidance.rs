//! Nudges a point off the road network, for markers that should sit in
//! clear space rather than wherever an OSM node happens to land — a real
//! case that prompted this: Edinburgh Waverley's `railway=station` node
//! sits right on "South Ramp," the station's own vehicle access road, so
//! the map marker rendered as if it were part of the road.
//!
//! Local equirectangular projection (metres, flat around the point's own
//! latitude) rather than the pipeline's own haversine `distance_m` — good
//! enough at the scale of "is this within a few tens of metres of a road,"
//! and lets ordinary planar segment-distance/perpendicular math do the
//! work instead of spherical trig.
use game_data::RoadGraph;
use std::collections::{HashMap, HashSet};

const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
const EARTH_RADIUS_M: f64 = 6_371_000.0;

/// Same cell size and same Bresenham-cells-touched approach as game-wasm's
/// own `edge_grid`/`nearest_node_grid_key` (`rust/game-wasm/src/lib.rs`) —
/// proven there for exactly the same "which edges are actually near this
/// point" problem, mirrored independently here since this is a separate
/// crate. 20,000 (0.002°, ~200m at UK latitudes) is coarse next to a
/// typical clearance distance (15m for railway stations) so a station
/// point's own cell plus its 8 neighbours always covers the full search
/// radius, even right at a cell boundary.
const EDGE_GRID_CELL_E7: i32 = 20_000;

fn edge_grid_cell(lon_e7: i32, lat_e7: i32) -> (i32, i32) {
    (lon_e7.div_euclid(EDGE_GRID_CELL_E7), lat_e7.div_euclid(EDGE_GRID_CELL_E7))
}

/// Every grid cell a straight segment between two cells passes through —
/// identical to game-wasm's own `cells_along_segment`, needed so a long
/// edge with sparse geometry still gets indexed under every cell it
/// actually passes through, not just its two endpoints' cells.
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

/// A spatial index over a `RoadGraph`'s own edges, built once and reused
/// for every point `keep_off_roads` is called on — checking all of a
/// whole-UK graph's ~11.5M edges per point (main.rs's own real measurement)
/// is what made railway-station placement the slowest single step in a
/// full UK+Ireland+Isle of Man build, once the graph itself stopped being
/// Scotland-sized. Building this is a single pass over every edge, the
/// same cost `Router::new` already pays in game-wasm for the identical
/// reason.
pub struct EdgeGrid {
    cells: HashMap<(i32, i32), Vec<u32>>,
}

pub fn build_edge_grid(graph: &RoadGraph) -> EdgeGrid {
    let mut cells: HashMap<(i32, i32), Vec<u32>> = HashMap::new();
    for (idx, edge) in graph.edges.iter().enumerate() {
        let from = &graph.nodes[edge.from as usize];
        let to = &graph.nodes[edge.to as usize];
        let mut touched: HashSet<(i32, i32)> = HashSet::new();
        let mut prev = (from.lon_e7, from.lat_e7);
        for &next in graph.edge_geometry(edge).iter().chain(std::iter::once(&(to.lon_e7, to.lat_e7))) {
            let prev_cell = edge_grid_cell(prev.0, prev.1);
            let next_cell = edge_grid_cell(next.0, next.1);
            for cell in cells_along_segment(prev_cell.0, prev_cell.1, next_cell.0, next_cell.1) {
                touched.insert(cell);
            }
            prev = next;
        }
        let edge_idx = idx as u32;
        for cell in touched {
            cells.entry(cell).or_default().push(edge_idx);
        }
    }
    EdgeGrid { cells }
}

fn to_local_xy(lon_e7: i32, lat_e7: i32, ref_lat_e7: i32) -> (f64, f64) {
    let lon = lon_e7 as f64 * 1e-7;
    let lat = lat_e7 as f64 * 1e-7;
    let ref_lat_rad = ref_lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
    let x = lon * DEG_TO_RAD * EARTH_RADIUS_M * ref_lat_rad.cos();
    let y = lat * DEG_TO_RAD * EARTH_RADIUS_M;
    (x, y)
}

fn from_local_xy(x: f64, y: f64, ref_lat_e7: i32) -> (i32, i32) {
    let ref_lat_rad = ref_lat_e7 as f64 * 1e-7 * DEG_TO_RAD;
    let lon = x / (DEG_TO_RAD * EARTH_RADIUS_M * ref_lat_rad.cos());
    let lat = y / (DEG_TO_RAD * EARTH_RADIUS_M);
    ((lon * 1e7).round() as i32, (lat * 1e7).round() as i32)
}

/// The closest point to `p` on segment `a`-`b`, in the same flat xy space.
fn closest_point_on_segment(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> (f64, f64) {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        return a;
    }
    let t = (((p.0 - a.0) * dx) + ((p.1 - a.1) * dy)) / len_sq;
    let t = t.clamp(0.0, 1.0);
    (a.0 + t * dx, a.1 + t * dy)
}

/// If `point` lies within `clearance_m` of any road edge, returns a point
/// moved directly away from the nearest one until it clears that distance;
/// otherwise returns `point` unchanged. Only checks edges `grid` (built
/// once via `build_edge_grid`) places in the point's own cell or its 8
/// neighbours — safe as long as `clearance_m` stays comfortably under the
/// grid's own cell size (`EDGE_GRID_CELL_E7`, ~200m), true for every real
/// caller (15m for railway stations); checking every edge in the whole
/// graph per point was the actual bottleneck in a real full-UK build
/// (main.rs), not a hypothetical one.
pub fn keep_off_roads(point: (i32, i32), graph: &RoadGraph, grid: &EdgeGrid, clearance_m: f64) -> (i32, i32) {
    let ref_lat_e7 = point.1;
    let p_xy = to_local_xy(point.0, point.1, ref_lat_e7);

    let mut best_dist = f64::INFINITY;
    let mut best_closest = p_xy;
    let mut best_segment = ((0.0, 0.0), (0.0, 0.0));

    let (cx, cy) = edge_grid_cell(point.0, point.1);
    let mut candidate_edges: HashSet<u32> = HashSet::new();
    for dx in -1..=1 {
        for dy in -1..=1 {
            if let Some(edges) = grid.cells.get(&(cx + dx, cy + dy)) {
                candidate_edges.extend(edges);
            }
        }
    }

    for &edge_idx in &candidate_edges {
        let edge = &graph.edges[edge_idx as usize];
        let from = &graph.nodes[edge.from as usize];
        let to = &graph.nodes[edge.to as usize];
        let mut prev_xy = to_local_xy(from.lon_e7, from.lat_e7, ref_lat_e7);
        let mut rest = graph
            .edge_geometry(edge)
            .iter()
            .map(|&(lon_e7, lat_e7)| to_local_xy(lon_e7, lat_e7, ref_lat_e7))
            .collect::<Vec<_>>();
        rest.push(to_local_xy(to.lon_e7, to.lat_e7, ref_lat_e7));

        for next_xy in rest {
            let closest = closest_point_on_segment(p_xy, prev_xy, next_xy);
            let d = ((closest.0 - p_xy.0).powi(2) + (closest.1 - p_xy.1).powi(2)).sqrt();
            if d < best_dist {
                best_dist = d;
                best_closest = closest;
                best_segment = (prev_xy, next_xy);
            }
            prev_xy = next_xy;
        }
    }

    if !best_dist.is_finite() || best_dist >= clearance_m {
        return point;
    }

    // Direction directly away from the nearest road point — except when
    // the point sits exactly on the road (distance 0), where "away from
    // itself" is undefined; fall back to the segment's own perpendicular.
    let (dir_x, dir_y) = if best_dist > 1e-6 {
        ((p_xy.0 - best_closest.0) / best_dist, (p_xy.1 - best_closest.1) / best_dist)
    } else {
        let (a, b) = best_segment;
        let (sx, sy) = (b.0 - a.0, b.1 - a.1);
        let len = (sx * sx + sy * sy).sqrt();
        if len > 1e-9 {
            (-sy / len, sx / len)
        } else {
            (1.0, 0.0)
        }
    };

    let new_xy = (best_closest.0 + dir_x * clearance_m, best_closest.1 + dir_y * clearance_m);
    from_local_xy(new_xy.0, new_xy.1, ref_lat_e7)
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_data::{Edge, GraphNode, JunctionControl, OnewayDirection};

    fn node(osm_id: i64, lon_e7: i32, lat_e7: i32) -> GraphNode {
        GraphNode { osm_id, lon_e7, lat_e7, junction_control: JunctionControl::None }
    }

    fn edge(from: u32, to: u32) -> Edge {
        Edge {
            from,
            to,
            osm_way_id: 1,
            class: 11,
            width_m: 5.5,
            length_m: 100.0,
            oneway: OnewayDirection::TwoWay,
            access_restricted: false,
            psv_yes: false,
            bus_yes: false,
            maxspeed_mph: None,
            geometry_start: 0,
            geometry_len: 0,
        }
    }

    // A short east-west road segment near Edinburgh, roughly 100m long.
    fn road_graph() -> RoadGraph {
        RoadGraph {
            nodes: vec![node(1, -31_883_000, 559_533_000), node(2, -31_870_000, 559_533_000)],
            edges: vec![edge(0, 1)],
            restrictions: vec![],
            geometry_points: vec![],
        }
    }

    #[test]
    fn a_point_far_from_any_road_is_unchanged() {
        let graph = road_graph();
        let grid = build_edge_grid(&graph);
        // Roughly 500m north of the road.
        let point = (-31_876_000, 559_578_000);
        let result = keep_off_roads(point, &graph, &grid, 15.0);
        assert_eq!(result, point, "a point already clear of every road shouldn't move");
    }

    #[test]
    fn a_point_on_the_road_is_nudged_at_least_the_clearance_distance() {
        let graph = road_graph();
        let grid = build_edge_grid(&graph);
        // Sits exactly on the segment (midpoint).
        let point = (-31_876_500, 559_533_000);
        let result = keep_off_roads(point, &graph, &grid, 15.0);
        assert_ne!(result, point, "a point on the road should move");

        // The resulting point should now be at least ~15m from the road.
        let ref_lat_e7 = result.1;
        let p_xy = to_local_xy(result.0, result.1, ref_lat_e7);
        let a_xy = to_local_xy(-31_883_000, 559_533_000, ref_lat_e7);
        let b_xy = to_local_xy(-31_870_000, 559_533_000, ref_lat_e7);
        let closest = closest_point_on_segment(p_xy, a_xy, b_xy);
        let d = ((closest.0 - p_xy.0).powi(2) + (closest.1 - p_xy.1).powi(2)).sqrt();
        assert!(d >= 14.9, "expected at least ~15m clearance from the road, got {d}m");
    }

    #[test]
    fn a_point_just_inside_the_clearance_radius_moves_to_clear_it() {
        let graph = road_graph();
        let grid = build_edge_grid(&graph);
        // ~5m north of the road (within a 15m clearance radius).
        let point = (-31_876_500, 559_533_450);
        let result = keep_off_roads(point, &graph, &grid, 15.0);
        assert_ne!(result, point);
    }

    #[test]
    fn an_empty_graph_leaves_the_point_unchanged() {
        let empty = RoadGraph { nodes: vec![], edges: vec![], restrictions: vec![], geometry_points: vec![] };
        let grid = build_edge_grid(&empty);
        let point = (-31_876_500, 559_533_000);
        assert_eq!(keep_off_roads(point, &empty, &grid, 15.0), point);
    }

    /// A real risk with a cell-based index: a road passing right along a
    /// cell boundary, with the query point just on the other side of that
    /// boundary from the road's own "home" cell, must still be found — this
    /// is exactly why the 8 neighbouring cells are checked too, not just
    /// the point's own cell.
    #[test]
    fn a_point_finds_a_road_in_a_neighbouring_grid_cell() {
        // A road running due east, positioned so its own midpoint sits
        // right at a grid cell boundary (a multiple of EDGE_GRID_CELL_E7).
        let boundary_lat = EDGE_GRID_CELL_E7 as i64 * 2000; // an exact cell-boundary latitude
        let graph = RoadGraph {
            nodes: vec![
                node(1, -31_883_000, boundary_lat as i32),
                node(2, -31_870_000, boundary_lat as i32),
            ],
            edges: vec![edge(0, 1)],
            restrictions: vec![],
            geometry_points: vec![],
        };
        let grid = build_edge_grid(&graph);
        // Just across the boundary from the road's own cell, ~5m away.
        let point = (-31_876_500, boundary_lat as i32 - 450);
        let result = keep_off_roads(point, &graph, &grid, 15.0);
        assert_ne!(result, point, "a road just across a grid cell boundary must still be found");
    }
}
