// Throwaway replay of real route/timetable data (extracted from a copy of
// the real save by ../.jp-realcheck.mjs into ../.jp-realcheck-data.json)
// against the journey planner, run natively via `cargo run --example` —
// the project's own "replay real save against real pipeline data"
// convention (OPEN-ITEMS.md T74), applied here before wiring this into the
// actual WASM boundary. `plan_internal`/`Leg` are `pub` specifically so
// this can run outside a JS/wasm runtime (see journey_planner.rs's own
// comment on why).
use game_wasm::JourneyPlanner;
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 7 {
        eprintln!("usage: journey_planner_against_real_save <transit-data.json> <origin_lon> <origin_lat> <dest_lon> <dest_lat> <departure_seconds>");
        std::process::exit(1);
    }
    let json = fs::read_to_string(&args[1]).expect("couldn't read transit data json");
    let origin_lon: f64 = args[2].parse().unwrap();
    let origin_lat: f64 = args[3].parse().unwrap();
    let dest_lon: f64 = args[4].parse().unwrap();
    let dest_lat: f64 = args[5].parse().unwrap();
    let departure_seconds: u32 = args[6].parse().expect("departure_seconds must parse as u32");

    let planner = JourneyPlanner::new(&json).expect("transit data should parse");
    match planner.plan_internal(origin_lon, origin_lat, dest_lon, dest_lat, departure_seconds) {
        Some(legs) => {
            println!("journey found, {} leg(s):", legs.len());
            for leg in &legs {
                println!("  {leg:?}");
            }
        }
        None => println!("no journey found"),
    }
}
