// Throwaway: reproduce `routeLine()` in src/renderer/route-panel.ts (which
// renders every SAVED route's band on the map) against the real router,
// to see whether its pairwise-`find_route`-per-leg approach produces a
// visible spike near Portree Depot that `find_route_through` (used by the
// live route-drawing editor in route-draw.ts) does not.
//
// Points below are the depot-area segment of real route 41 (Portree -
// Lonmore), straight from the player's save: stop -7, a waypoint, stop
// -15, stop 5908363189, stop -32 -- the exact sequence that passes closest
// to the depot and to Broom Place.
use game_wasm::Router;
use std::fs;

fn dist_m(a: (f64, f64), b: (f64, f64)) -> f64 {
    let r = 6371000.0;
    let lat1 = a.1.to_radians();
    let lat2 = b.1.to_radians();
    let dlat = lat2 - lat1;
    let dlon = (b.0 - a.0).to_radians();
    let x = dlon * ((lat1 + lat2) / 2.0).cos();
    r * (dlat * dlat + x * x).sqrt()
}

fn detect_spikes(label: &str, pts: &[(f64, f64)]) {
    println!("--- {label}: {} points ---", pts.len());
    for (i, p) in pts.iter().enumerate() {
        println!("{i}: {:.7},{:.7}", p.0, p.1);
    }
    for i in 1..pts.len().saturating_sub(1) {
        let (pa, pb, pc) = (pts[i - 1], pts[i], pts[i + 1]);
        let detour = dist_m(pa, pb) + dist_m(pb, pc) - dist_m(pa, pc);
        if detour > 5.0 && dist_m(pa, pc) < 40.0 {
            println!(
                "SPIKE at point {i}: detour={detour:.1}m direct(a,c)={:.1}m  a={pa:?} b={pb:?} c={pc:?}",
                dist_m(pa, pc)
            );
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).map(String::as_str).unwrap_or("pipeline-data/road_graph.bin");
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    let router = Router::new(&bytes, vec![]);

    // Real route 41 points, depot-area segment: -7 -> waypoint -> -15 -> 5908363189 -> -32
    let seq: Vec<(f64, f64)> = vec![
        (-6.208191700279713, 57.4173042370937),   // stop -7
        (-6.1996005, 57.4210554),                 // waypoint
        (-6.202330067753792, 57.420227793540874), // stop -15
        (-6.208303514868021, 57.417138129182206), // stop 5908363189
        (-6.212196070700884, 57.420751077028484), // stop -32
    ];

    // Mimic routeLine() in route-panel.ts: pairwise find_route per leg,
    // concatenating ALL points of each leg (no de-dup at boundaries).
    let mut pairwise: Vec<(f64, f64)> = Vec::new();
    for i in 0..seq.len() - 1 {
        let (a, b) = (seq[i], seq[i + 1]);
        let flat = router.find_route(a.0, a.1, b.0, b.1);
        if flat.is_empty() {
            println!("leg {i}->{} : NO ROUTE", i + 1);
            continue;
        }
        let pts: Vec<(f64, f64)> = flat.chunks(2).map(|c| (c[0], c[1])).collect();
        pairwise.extend(pts);
    }
    detect_spikes("routeLine()-style pairwise find_route", &pairwise);

    // Mimic rebuildRoute() in route-draw.ts: one find_route_through call.
    let mut flat_seq: Vec<f64> = Vec::new();
    for p in &seq {
        flat_seq.push(p.0);
        flat_seq.push(p.1);
    }
    let through = router.find_route_through(flat_seq);
    let through_pts: Vec<(f64, f64)> = through.chunks(2).map(|c| (c[0], c[1])).collect();
    detect_spikes("find_route_through()-style single call", &through_pts);
}
