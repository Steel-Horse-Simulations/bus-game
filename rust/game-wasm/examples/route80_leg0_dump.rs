// Throwaway: dump the full geometry of route 80's first leg
// (find_route(stop -113, stop -7)) -- the exact call routeLine() in
// route-panel.ts makes to render this leg of the saved route band -- to
// see the real detour/spike found near Broom Place (idx 1 in the combined
// pairwise dump, ~36m from the depot).
use game_wasm::Router;
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).map(String::as_str).unwrap_or("pipeline-data/road_graph.bin");
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    let router = Router::new(&bytes, vec![]);

    let a = (-6.210937947034836, 57.420569458697514); // stop -113
    let b = (-6.208191700279713, 57.4173042370937); // stop -7
    println!("find_route({a:?} -> {b:?})");
    let flat = router.find_route(a.0, a.1, b.0, b.1);
    println!("{} points", flat.len() / 2);
    for (i, c) in flat.chunks(2).enumerate() {
        println!("{i}: {:.7},{:.7}", c[0], c[1]);
    }
    println!("last_route_edges: {:?}", router.last_route_edges());
    println!("last_route_edge_point_counts: {:?}", router.last_route_edge_point_counts());

    // Attribute each coordinate range to its edge using the two arrays
    // above (counts sum to len-1, per that field's own doc comment style
    // elsewhere in this codebase: point 0 is the leg's own start, then
    // each edge contributes `count` further points).
    let edges = router.last_route_edges();
    let counts = router.last_route_edge_point_counts();
    let mut idx: usize = 0;
    println!("\n--- point ranges per edge ---");
    println!("point 0 (leg start)");
    for (e, c) in edges.iter().zip(counts.iter()) {
        let start_i = idx + 1;
        let end_i = idx + (*c as usize);
        println!("edge {e}: points {start_i}..={end_i} ({c} points)");
        idx += *c as usize;
    }
}
