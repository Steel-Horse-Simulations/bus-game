//! One-shot tool (2026-11-15): converts a real Geofabrik region boundary
//! `.poly` file into this game's own `WalesBoundary` artefact
//! (`game-data`). Exact structural mirror of `scotland_boundary.rs` —
//! Wales instead of Scotland, per the user's own direct instruction
//! ("National Express Welsh... should follow all the same rules as the
//! Scottish livery except Wales instead of Scotland"). Deliberately
//! separate from `main.rs`'s single `[[bin]]` pipeline binary, which
//! always requires a `.pbf` and runs the full GB+Ireland+IoM
//! extract/scan — this tool takes a `.poly` file and writes a `.bin`
//! straight out, nothing else. Run once by hand whenever
//! `data/wales-boundary.poly` changes (it won't, in the ordinary course
//! of this project — Geofabrik's own political border is static), not
//! part of the regular pipeline run.
//!
//! Usage: `cargo run --release --bin wales_boundary -- <path to .poly> <output .bin path>`
//! (both arguments optional — default to this crate's own
//! `data/wales-boundary.poly` and `wales_boundary.bin` in the current
//! directory).
//!
//! `boundary.rs` is reused via `#[path]` rather than duplicated — see
//! `scotland_boundary.rs`'s own doc comment for why.
#[path = "../boundary.rs"]
mod boundary;

fn main() {
    let mut args = std::env::args().skip(1);
    let poly_path = args
        .next()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("data/wales-boundary.poly"));
    let out_path = args.next().unwrap_or_else(|| "wales_boundary.bin".to_string());

    let rings = boundary::parse_poly(&poly_path);
    assert!(!rings.is_empty(), "no rings found in {poly_path:?} — refusing to write an artefact with no restriction at all");

    let wales_boundary = game_data::WalesBoundary {
        rings: rings
            .iter()
            .map(|ring| ring.points().iter().map(|&(lon, lat)| (boundary::to_e7(lon), boundary::to_e7(lat))).collect())
            .collect(),
    };

    let bytes = game_data::encode_wales_boundary(&wales_boundary);
    std::fs::write(&out_path, &bytes).unwrap_or_else(|e| panic!("failed to write {out_path}: {e}"));

    println!(
        "Wrote {out_path} ({} bytes, {} ring(s), {} total points) from {poly_path:?}",
        bytes.len(),
        wales_boundary.rings.len(),
        wales_boundary.rings.iter().map(|r| r.len()).sum::<usize>(),
    );
}
