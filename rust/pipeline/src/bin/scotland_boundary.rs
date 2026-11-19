//! One-shot tool (T190, 2026-11-14): converts a real Geofabrik region
//! boundary `.poly` file into this game's own `ScotlandBoundary` artefact
//! (`game-data`). Deliberately separate from `main.rs`'s single `[[bin]]`
//! pipeline binary, which always requires a `.pbf` and runs the full
//! GB+Ireland+IoM extract/scan — this tool takes a `.poly` file and
//! writes a `.bin` straight out, nothing else. Run once by hand whenever
//! `data/scotland-boundary.poly` changes (it won't, in the ordinary
//! course of this project — Geofabrik's own political border is static),
//! not part of the regular pipeline run.
//!
//! Usage: `cargo run --release --bin scotland_boundary -- <path to .poly> <output .bin path>`
//! (both arguments optional — default to this crate's own
//! `data/scotland-boundary.poly` and `scotland_boundary.bin` in the
//! current directory).
//!
//! `boundary.rs` is reused via `#[path]` rather than duplicated — it
//! already parses the Osmosis `.poly` format Geofabrik publishes
//! (`parse_poly`) and already carries the project's one shared
//! degree->fixed-point conversion (`to_e7`), the same one every other
//! artefact uses. It has no further crate-internal dependencies of its
//! own, so pulling it in here doesn't drag in `road_graph.rs`'s much
//! heavier OSM-parsing machinery just for this one-shot conversion.
#[path = "../boundary.rs"]
mod boundary;

fn main() {
    let mut args = std::env::args().skip(1);
    let poly_path = args
        .next()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("data/scotland-boundary.poly"));
    let out_path = args.next().unwrap_or_else(|| "scotland_boundary.bin".to_string());

    let rings = boundary::parse_poly(&poly_path);
    assert!(!rings.is_empty(), "no rings found in {poly_path:?} — refusing to write an artefact with no restriction at all");

    let scotland_boundary = game_data::ScotlandBoundary {
        rings: rings
            .iter()
            .map(|ring| ring.points().iter().map(|&(lon, lat)| (boundary::to_e7(lon), boundary::to_e7(lat))).collect())
            .collect(),
    };

    let bytes = game_data::encode_scotland_boundary(&scotland_boundary);
    std::fs::write(&out_path, &bytes).unwrap_or_else(|e| panic!("failed to write {out_path}: {e}"));

    println!(
        "Wrote {out_path} ({} bytes, {} ring(s), {} total points) from {poly_path:?}",
        bytes.len(),
        scotland_boundary.rings.len(),
        scotland_boundary.rings.iter().map(|r| r.len()).sum::<usize>(),
    );
}
