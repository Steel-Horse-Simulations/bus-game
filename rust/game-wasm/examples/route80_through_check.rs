// Throwaway: does `find_route_through` on route 80's FULL point sequence
// (a loop starting and ending at stop -113, right by Portree Depot) show
// the same snap-spur spike at its very first point that pairwise
// `find_route` showed? This checks whether the bug is specific to
// route-panel.ts's pairwise rendering, or lives in the shared start/goal
// snap-handling code inside the router itself (and would therefore also
// affect route-draw.ts's own `find_route_through` call).
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).map(String::as_str).unwrap_or("pipeline-data/road_graph.bin");
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    let router = Router::new(&bytes, vec![]);

    let seq: Vec<(f64, f64)> = vec![
        (-6.210937947034836, 57.420569458697514),
        (-6.208191700279713, 57.4173042370937),
        (-6.1993806, 57.421027699999996),
        (-6.202329732477665, 57.42022797407813),
        (-6.208303347229958, 57.417138129182206),
        (-6.1940703, 57.4131715),
        (-6.194234825670719, 57.41296017713631),
        (-6.20187945663929, 57.410375272467576),
        (-6.200317740440369, 57.40317352395306),
        (-6.201346032321453, 57.40133782331796),
        (-6.200317740440369, 57.403173704574385),
        (-6.2018730863928795, 57.41064055209347),
        (-6.1940738, 57.413172499999995),
        (-6.194234825670719, 57.41296017713631),
        (-6.196311861276627, 57.416078992975486),
        (-6.192790791392326, 57.41414607168443),
        (-6.1949796, 57.4125837),
        (-6.194234825670719, 57.41296017713631),
        (-6.208902485668659, 57.416030061803525),
        (-6.208191700279713, 57.4173042370937),
        (-6.1993741, 57.421025),
        (-6.202329732477665, 57.42022797407813),
        (-6.208303347229958, 57.417138129182206),
        (-6.210937947034836, 57.420569458697514),
    ];
    let mut flat: Vec<f64> = Vec::new();
    for p in &seq { flat.push(p.0); flat.push(p.1); }
    let path_out = router.find_route_through(flat);
    let pts: Vec<(f64, f64)> = path_out.chunks(2).map(|c| (c[0], c[1])).collect();
    println!("find_route_through: {} points", pts.len());
    for (i, p) in pts.iter().take(10).enumerate() {
        println!("{i}: {:.7},{:.7}", p.0, p.1);
    }
    println!("...");
    for (i, p) in pts.iter().enumerate().rev().take(10).collect::<Vec<_>>().into_iter().rev() {
        println!("{i}: {:.7},{:.7}", p.0, p.1);
    }
    // spike check on first/last few points
    for i in 1..pts.len().saturating_sub(1) {
        let (pa, pb, pc) = (pts[i - 1], pts[i], pts[i + 1]);
        let detour = dist_m(pa, pb) + dist_m(pb, pc) - dist_m(pa, pc);
        let direct = dist_m(pa, pc);
        if detour > 5.0 && direct < 40.0 {
            println!("SPIKE idx {i}: detour={detour:.1}m direct={direct:.1}m a={pa:?} b={pb:?} c={pc:?}");
        }
    }
}
