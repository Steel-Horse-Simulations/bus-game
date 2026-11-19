// Throwaway (timing-point padding recovery, 2026-11-19): for each route in
// routes.json (full-route points, lon/lat, in order), compute the REAL
// router leg time (seconds) and distance (m) for every consecutive pair --
// exactly the same per-leg calls route-timetable-panel.ts's own
// computeLegTimesSeconds makes (router.find_route + last_route_time_seconds
// + last_route_distance_m) -- against the real road graph, with the real
// live save's own psv_override way ids applied, so the result matches what
// the live app itself would compute today. Output is read back by a Node
// script that applies the vehicle max-speed floor (pure TS/data, no router
// needed) and then derives each timing point's real standardPaddingMinutes
// from the pre-migration backup's legMinutes. See the live investigation
// for the full story -- this script only answers "what does the real road
// network say," nothing about the padding model itself.
use game_wasm::Router;
use std::collections::BTreeMap;
use std::fs;

#[derive(serde::Deserialize)]
struct RoutePointIn {
    lon: f64,
    lat: f64,
}

#[derive(serde::Deserialize)]
struct RouteIn {
    id: i64,
    #[allow(dead_code)]
    number: String,
    points: Vec<RoutePointIn>,
}

#[derive(serde::Serialize)]
struct LegOut {
    real_seconds: f64,
    distance_m: f64,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let graph_path = args.get(1).map(String::as_str).unwrap_or("../../pipeline-data/road_graph.bin");
    let routes_path = args.get(2).map(String::as_str).unwrap_or("routes.json");
    let psv_path = args.get(3).map(String::as_str).unwrap_or("psv_override_ids.json");
    let out_path = args.get(4).map(String::as_str).unwrap_or("leg_times.json");

    let graph_bytes = fs::read(graph_path).unwrap_or_else(|e| panic!("failed to read {graph_path}: {e}"));
    let psv_json = fs::read_to_string(psv_path).unwrap_or_else(|e| panic!("failed to read {psv_path}: {e}"));
    let psv_override_way_ids: Vec<f64> = serde_json::from_str(&psv_json).expect("psv override ids parse");
    eprintln!("loaded {} psv override way ids", psv_override_way_ids.len());

    let router = Router::new(&graph_bytes, psv_override_way_ids);
    eprintln!("router loaded from {graph_path}");

    let routes_json = fs::read_to_string(routes_path).unwrap_or_else(|e| panic!("failed to read {routes_path}: {e}"));
    let routes: BTreeMap<String, RouteIn> = serde_json::from_str(&routes_json).expect("routes.json parse");

    let mut out: BTreeMap<String, Vec<LegOut>> = BTreeMap::new();
    for (key, route) in &routes {
        let mut legs = Vec::with_capacity(route.points.len().saturating_sub(1));
        for i in 0..route.points.len().saturating_sub(1) {
            let a = &route.points[i];
            let b = &route.points[i + 1];
            let _ = router.find_route(a.lon, a.lat, b.lon, b.lat);
            let real_seconds = router.last_route_time_seconds();
            let distance_m = router.last_route_distance_m();
            legs.push(LegOut { real_seconds, distance_m });
        }
        eprintln!("route {} (id {}): {} legs computed", key, route.id, legs.len());
        out.insert(key.clone(), legs);
    }

    fs::write(out_path, serde_json::to_string(&out).unwrap()).expect("write leg_times.json");
    eprintln!("wrote {out_path}");
}
