// Throwaway: where does stop -113 (lon=-6.210937947034836,
// lat=57.420569458697514, route 80's first point, ~34m from Portree
// Depot) actually snap onto the road graph, and what edges/restrictions
// sit around that snap point? Investigating the real spike found at the
// very start of route 80's first leg (find_route(-113, -7)): the path
// goes from the snap point slightly SOUTH then reverses hard NORTH along
// Broom Place before heading south again via a different road.
use game_data::RoadGraph;
use game_wasm::Router;
use std::fs;

fn from_e7(v: i32) -> f64 {
    v as f64 * 1e-7
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).map(String::as_str).unwrap_or("pipeline-data/road_graph.bin");
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    let router = Router::new(&bytes, vec![]);

    let stop = (-6.210937947034836, 57.420569458697514);
    let snap = router.snap_to_road(stop.0, stop.1);
    println!("snap_to_road({stop:?}) = {snap:?}");

    // Also decode the graph directly to inspect edges 1653155/1653156 and
    // anything else incident to node 4641797476 / 4641797442 / 846273328.
    let graph: RoadGraph = game_data::decode(&bytes);
    let mut osm_to_idx = std::collections::HashMap::new();
    for (i, n) in graph.nodes.iter().enumerate() {
        osm_to_idx.insert(n.osm_id, i);
    }
    let watch_osm = [4641797476i64, 4641797442, 846273328, 413289684];
    let watch_idx: Vec<usize> = watch_osm.iter().filter_map(|id| osm_to_idx.get(id).copied()).collect();
    println!("watch node indices: {watch_idx:?}");

    for (ei, e) in graph.edges.iter().enumerate() {
        if watch_idx.contains(&(e.from as usize)) || watch_idx.contains(&(e.to as usize)) {
            let fn_ = &graph.nodes[e.from as usize];
            let tn = &graph.nodes[e.to as usize];
            println!(
                "edge {ei}: {}({:.7},{:.7}) -> {}({:.7},{:.7}) way={} oneway={:?} class={} access_restricted={} psv_yes={} bus_yes={} len={:.1}",
                fn_.osm_id, from_e7(fn_.lon_e7), from_e7(fn_.lat_e7),
                tn.osm_id, from_e7(tn.lon_e7), from_e7(tn.lat_e7),
                e.osm_way_id, e.oneway, e.class, e.access_restricted, e.psv_yes, e.bus_yes, e.length_m
            );
        }
    }

    println!("\n--- restrictions touching these nodes ---");
    for r in &graph.restrictions {
        let via_osm = graph.nodes[r.via as usize].osm_id;
        if watch_osm.contains(&via_osm) {
            println!("restriction via={via_osm} from_edge={} to_edge={} kind={:?}", r.from_edge, r.to_edge, r.kind);
        }
    }
}
