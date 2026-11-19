// Throwaway: dump the real road_graph.bin nodes/edges for the 7 OSM nodes
// making up Broom Place (way 35259480, found via find_broom_place.rs
// against great-britain-latest.osm.pbf), near Portree Depot, to see how
// Broom Place is actually connected in the routable graph -- looking for a
// graph-construction cause of a reported route-rendering spike nearby.
use game_data::{self, RoadGraph};
use std::collections::HashMap;

const BROOM_PLACE_NODE_IDS: [i64; 7] = [
    413289684, 413289681, 4641797279, 846273328, 4641797476, 4641797442, 846273618,
];

fn from_e7(v: i32) -> f64 {
    v as f64 * 1e-7
}

fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "pipeline-data/road_graph.bin".to_string());
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let graph: RoadGraph = game_data::decode(&bytes);
    println!("graph nodes={} edges={}", graph.nodes.len(), graph.edges.len());

    let mut osm_to_idx: HashMap<i64, usize> = HashMap::new();
    for (i, n) in graph.nodes.iter().enumerate() {
        osm_to_idx.insert(n.osm_id, i);
    }

    for &osm_id in &BROOM_PLACE_NODE_IDS {
        match osm_to_idx.get(&osm_id) {
            None => println!("node {osm_id}: NOT FOUND in graph.nodes"),
            Some(&idx) => {
                let n = &graph.nodes[idx];
                println!(
                    "node {osm_id} (idx {idx}): lon={:.7} lat={:.7} junction={:?}",
                    from_e7(n.lon_e7),
                    from_e7(n.lat_e7),
                    n.junction_control
                );
            }
        }
    }

    println!("\n--- edges touching any Broom Place node ---");
    let target_idxs: Vec<usize> = BROOM_PLACE_NODE_IDS
        .iter()
        .filter_map(|id| osm_to_idx.get(id).copied())
        .collect();
    for (ei, e) in graph.edges.iter().enumerate() {
        if target_idxs.contains(&(e.from as usize)) || target_idxs.contains(&(e.to as usize)) {
            let from_node = &graph.nodes[e.from as usize];
            let to_node = &graph.nodes[e.to as usize];
            let geom = graph.edge_geometry(e);
            println!(
                "edge {ei}: from_osm={} ({:.7},{:.7}) -> to_osm={} ({:.7},{:.7}) way={} class={} oneway={:?} access_restricted={} psv_yes={} bus_yes={} len={:.1}m geom_pts={}",
                from_node.osm_id,
                from_e7(from_node.lon_e7),
                from_e7(from_node.lat_e7),
                to_node.osm_id,
                from_e7(to_node.lon_e7),
                from_e7(to_node.lat_e7),
                e.osm_way_id,
                e.class,
                e.oneway,
                e.access_restricted,
                e.psv_yes,
                e.bus_yes,
                e.length_m,
                geom.len()
            );
            for (gi, g) in geom.iter().enumerate() {
                println!("    geom[{gi}]: {:.7},{:.7}", from_e7(g.0), from_e7(g.1));
            }
        }
    }
}
