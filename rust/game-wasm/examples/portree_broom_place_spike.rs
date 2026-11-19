// Throwaway: query the real router directly between the stop pair closest
// to Portree Depot (osmId -65 and osmId -7, 97m from the depot, shared by
// routes 40/41/57/58/63 per the real save) to see whether the live routed
// polyline itself has a spike, since route points only store sparse
// stop/waypoint markers -- the detailed road-following shape is computed
// live by the router, not stored in the save.
use game_wasm::Router;
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).map(String::as_str).unwrap_or("pipeline-data/road_graph.bin");
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    let router = Router::new(&bytes, vec![]);

    // osmId -65 (closest to depot, 97m) -> osmId -7 (448m away)
    let a = (-6.212044022977352, 57.420753875315825);
    let b = (-6.2081920355558395, 57.41730441764537);
    println!("Querying route {a:?} -> {b:?}");
    let flat = router.find_route(a.0, a.1, b.0, b.1);
    println!("{} coords ({} points)", flat.len(), flat.len() / 2);
    let pts: Vec<(f64, f64)> = flat.chunks(2).map(|c| (c[0], c[1])).collect();
    for (i, p) in pts.iter().enumerate() {
        println!("{i}: {:.7},{:.7}", p.0, p.1);
    }
    // detour check
    fn dist_m(a: (f64, f64), b: (f64, f64)) -> f64 {
        let r = 6371000.0;
        let lat1 = a.1.to_radians();
        let lat2 = b.1.to_radians();
        let dlat = lat2 - lat1;
        let dlon = (b.0 - a.0).to_radians();
        let x = dlon * ((lat1 + lat2) / 2.0).cos();
        r * (dlat * dlat + x * x).sqrt()
    }
    for i in 1..pts.len() - 1 {
        let (pa, pb, pc) = (pts[i - 1], pts[i], pts[i + 1]);
        let detour = dist_m(pa, pb) + dist_m(pb, pc) - dist_m(pa, pc);
        if detour > 10.0 && dist_m(pa, pc) < 30.0 {
            println!("SPIKE at point {i}: detour={detour:.1}m direct={:.1}m", dist_m(pa, pc));
        }
    }
}
