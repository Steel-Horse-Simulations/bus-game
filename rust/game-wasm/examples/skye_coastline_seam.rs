// Throwaway diagnostic for the live bug report "when making a zone around
// Skye it will jump the entire way around the outside of Skye... instead
// of just a few hundred meters along" — the project's own "replay real
// save against real pipeline data" convention (OPEN-ITEMS.md T74), run
// natively via `cargo run --example` against the real coastline.bin rather
// than guessing. Confirms whether Skye's own coastline chain has its two
// open ends (first/last point — the only two points `assemble_chains`
// never joins to anything, by construction) sitting close together in
// real terms despite being far apart in array index, which is exactly the
// shape that would make `coastlineWalkBetween`'s plain index-order walk
// pick the long way round instead of the short way.
use game_data::decode_coastline;
use std::fs;

fn deg(e7: i32) -> f64 {
    e7 as f64 / 1e7
}

fn distance_m(a: (i32, i32), b: (i32, i32)) -> f64 {
    const DEG_TO_M_LAT: f64 = 111_000.0;
    let lat = (deg(a.1) + deg(b.1)) * 0.5;
    let deg_to_m_lon = DEG_TO_M_LAT * lat.to_radians().cos();
    let dx = (deg(a.0) - deg(b.0)) * deg_to_m_lon;
    let dy = (deg(a.1) - deg(b.1)) * DEG_TO_M_LAT;
    (dx * dx + dy * dy).sqrt()
}

fn main() {
    let bytes = fs::read("pipeline-data/coastline.bin").expect("couldn't read pipeline-data/coastline.bin");
    let data = decode_coastline(&bytes);

    // With a chain index argument, dump its full geometry as JSON
    // [[lon,lat],...] to stdout instead of the summary scan below — used
    // to feed one real near-closed chain into a throwaway Node script that
    // exercises the actual TS fix against real data, not just synthetic.
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        let idx: usize = args[1].parse().expect("chain index must be a number");
        let chain = &data.chains[idx];
        let points: Vec<(f64, f64)> = chain.geometry.iter().map(|&(lon, lat)| (deg(lon), deg(lat))).collect();
        println!("{}", serde_json::to_string(&points).unwrap());
        return;
    }

    println!("{} total coastline chains", data.chains.len());

    // Skye's rough real extent.
    let min_lon = -6.7_f64;
    let max_lon = -5.6_f64;
    let min_lat = 57.0_f64;
    let max_lat = 57.9_f64;

    for (i, chain) in data.chains.iter().enumerate() {
        if chain.geometry.len() < 50 {
            continue; // skip small/unrelated chains, Skye's own coast is long
        }
        let overlaps = chain.geometry.iter().any(|&(lon_e7, lat_e7)| {
            let lon = deg(lon_e7);
            let lat = deg(lat_e7);
            lon >= min_lon && lon <= max_lon && lat >= min_lat && lat <= max_lat
        });
        if !overlaps {
            continue;
        }
        let first = chain.geometry[0];
        let last = *chain.geometry.last().unwrap();
        let seam_m = distance_m(first, last);
        println!(
            "chain {i}: {} points, first=({:.5},{:.5}) last=({:.5},{:.5}), seam gap = {:.1}m",
            chain.geometry.len(),
            deg(first.0),
            deg(first.1),
            deg(last.0),
            deg(last.1),
            seam_m
        );
    }
}
