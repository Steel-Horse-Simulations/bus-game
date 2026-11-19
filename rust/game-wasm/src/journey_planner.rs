// RAPTOR journey planner (DESIGN.md §2 "Journey planning") — increment 1.
// Earliest-arrival only (transfer count as tiebreaker), straight-line
// walking distance for stop access/egress/transfers, no demand or
// passenger-simulation wiring yet. See OPEN-ITEMS.md for the scope this
// increment deliberately stops at.
use serde::Deserialize;
use wasm_bindgen::prelude::*;

// The looser of DESIGN.md §8's two access/wait figures (400m urban / 600m
// rural) — applied uniformly to every walk leg (origin access, destination
// egress, footpath transfer, and a direct origin-to-destination walk with
// no transit at all) rather than threading an urban/rural classification
// through, which nothing in this increment's scope needs yet.
const MAX_WALK_M: f64 = 600.0;
// An average adult walking pace — not sourced from DESIGN.md (it gives
// distance/time tolerances, not a speed to derive one from a distance), a
// plain placeholder worth revisiting the same way the road router's own
// junction-delay constants are flagged as such.
const WALK_SPEED_MPS: f64 = 1.3;
// A transfer cap, not a correctness requirement — RAPTOR terminates on its
// own once a round improves nothing, this just bounds worst-case work
// against a pathological network.
const MAX_ROUNDS: usize = 8;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransitStop {
    #[allow(dead_code)]
    osm_id: i64,
    lon: f64,
    lat: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JourneyStopTime {
    stop_index: usize,
    arrival_seconds: u32,
    departure_seconds: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JourneyTrip {
    route_id: i64,
    stop_times: Vec<JourneyStopTime>,
}

#[derive(Deserialize)]
struct TransitData {
    stops: Vec<TransitStop>,
    trips: Vec<JourneyTrip>,
}

fn haversine_distance_m(a_lon: f64, a_lat: f64, b_lon: f64, b_lat: f64) -> f64 {
    const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let lat1 = a_lat * DEG_TO_RAD;
    let lat2 = b_lat * DEG_TO_RAD;
    let dlat = lat2 - lat1;
    let dlon = (b_lon - a_lon) * DEG_TO_RAD;
    let a = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * a.sqrt().clamp(0.0, 1.0).asin()
}

fn walk_seconds(distance_m: f64) -> u32 {
    (distance_m / WALK_SPEED_MPS).ceil() as u32
}

// How a stop's own earliest-arrival record was reached — kept per stop so
// the winning journey can be replayed backwards from the destination once
// the round-based scan finishes, rather than re-deriving it.
#[derive(Clone)]
enum Arrival {
    // The very first hop from the queried origin point.
    WalkFromOrigin,
    // A footpath transfer from another stop (kerb-crossing, or two nearby
    // stops with no shared trip — DESIGN.md §4: "a stop on the far kerb is
    // a different stop, so the planner must handle someone crossing the
    // road to travel back").
    WalkFromStop { from_stop: usize },
    // Boarded `trip` at `board_stop`'s own position in its stop list and
    // rode to this stop.
    Ride { trip: usize, board_pos: usize },
}

#[derive(Clone)]
struct StopState {
    earliest_arrival: u32,
    arrival: Arrival,
}

#[wasm_bindgen]
pub struct JourneyPlanner {
    stops: Vec<TransitStop>,
    trips: Vec<JourneyTrip>,
    // For each stop, every (trip, position-within-that-trip) where this
    // stop is served, sorted by that trip's own departure time at this
    // stop — the standard RAPTOR "which trips call here, in order" index,
    // built once so each round's scan never has to search every trip.
    stop_trips: Vec<Vec<(usize, usize)>>,
    // For each stop, every other stop within MAX_WALK_M and the walk time
    // to it — precomputed once rather than re-measured every query, since
    // the stop set only changes when the caller rebuilds the planner.
    footpaths: Vec<Vec<(usize, u32)>>,
}

#[wasm_bindgen]
impl JourneyPlanner {
    #[wasm_bindgen(constructor)]
    pub fn new(transit_json: &str) -> Result<JourneyPlanner, JsValue> {
        let data: TransitData =
            serde_json::from_str(transit_json).map_err(|e| JsValue::from_str(&format!("invalid transit data: {e}")))?;

        let mut stop_trips: Vec<Vec<(usize, usize)>> = vec![Vec::new(); data.stops.len()];
        for (trip_index, trip) in data.trips.iter().enumerate() {
            for (pos, st) in trip.stop_times.iter().enumerate() {
                stop_trips[st.stop_index].push((trip_index, pos));
            }
        }
        for calls in &mut stop_trips {
            calls.sort_by_key(|&(trip_index, pos)| data.trips[trip_index].stop_times[pos].departure_seconds);
        }

        // O(stops^2) — fine at the scale this increment targets (one
        // depot group's real network, not whole-UK); the road router's own
        // spatial grid (game-wasm/src/lib.rs's `edge_grid`) is the pattern
        // to reach for if this ever needs to scale further.
        let mut footpaths: Vec<Vec<(usize, u32)>> = vec![Vec::new(); data.stops.len()];
        for i in 0..data.stops.len() {
            for j in (i + 1)..data.stops.len() {
                let d = haversine_distance_m(data.stops[i].lon, data.stops[i].lat, data.stops[j].lon, data.stops[j].lat);
                if d <= MAX_WALK_M {
                    let s = walk_seconds(d);
                    footpaths[i].push((j, s));
                    footpaths[j].push((i, s));
                }
            }
        }

        Ok(JourneyPlanner { stops: data.stops, trips: data.trips, stop_trips, footpaths })
    }

    pub fn plan(&self, origin_lon: f64, origin_lat: f64, dest_lon: f64, dest_lat: f64, departure_seconds: u32) -> JsValue {
        match self.plan_internal(origin_lon, origin_lat, dest_lon, dest_lat, departure_seconds) {
            Some(legs) => build_found_result(&legs),
            None => build_not_found_result(),
        }
    }
}

// `pub`/`Debug` purely so a native `cargo run --example` (no wasm/JS
// runtime available to decode a `JsValue`) can call `plan_internal`
// directly and print a real result — the project's own "replay real save
// against real pipeline data" convention (OPEN-ITEMS.md T74) needs a plain
// Rust value to inspect, not the wasm-bindgen boundary type.
#[derive(Debug)]
pub enum Leg {
    Walk { from_lon: f64, from_lat: f64, to_lon: f64, to_lat: f64, seconds: u32 },
    Ride { route_id: i64, board_stop_osm_id: i64, board_seconds: u32, alight_stop_osm_id: i64, alight_seconds: u32 },
}

impl JourneyPlanner {
    pub fn plan_internal(&self, origin_lon: f64, origin_lat: f64, dest_lon: f64, dest_lat: f64, departure_seconds: u32) -> Option<Vec<Leg>> {
        let stop_count = self.stops.len();
        let mut state: Vec<Option<StopState>> = vec![None; stop_count];

        // Round 0: every stop walkable from the origin, plus — just as
        // important — every stop reachable from *those* by a further
        // footpath with no vehicle involved at all. Two origin-walkable
        // stops a footpath apart (each within MAX_WALK_M of the origin,
        // neither on its own covering the origin-to-destination distance)
        // is a real, not degenerate, case: the triangle inequality means
        // their *combined* walk can legitimately exceed what a single
        // direct hop could ever cover, even though each individual leg
        // stays inside the same tolerance DESIGN.md §4's kerb-crossing
        // case already requires handling mid-journey.
        let mut marked: Vec<usize> = Vec::new();
        for (i, s) in self.stops.iter().enumerate() {
            let d = haversine_distance_m(origin_lon, origin_lat, s.lon, s.lat);
            if d <= MAX_WALK_M {
                let arrival = departure_seconds + walk_seconds(d);
                state[i] = Some(StopState { earliest_arrival: arrival, arrival: Arrival::WalkFromOrigin });
                marked.push(i);
            }
        }
        for newly in self.propagate_footpaths(&marked.clone(), &mut state) {
            marked.push(newly);
        }

        for _round in 0..MAX_ROUNDS {
            if marked.is_empty() {
                break;
            }
            // Snapshot: this round only boards using arrivals known at the
            // *start* of the round, so a ride taken this round can't itself
            // become a boarding point for a second ride the same round
            // (that's what makes round k "at most k transfers", the
            // defining RAPTOR invariant — not just an optimisation).
            let snapshot: Vec<Option<u32>> = state.iter().map(|s| s.as_ref().map(|s| s.earliest_arrival)).collect();
            let mut next_marked: Vec<usize> = Vec::new();
            let mut improved = vec![false; stop_count];

            for &from_stop in &marked {
                let Some(arrive_at_from) = snapshot[from_stop] else { continue };
                // Every catchable departure at this stop, not just the
                // earliest one — `stop_trips` is sorted by departure time
                // across *all* trips regardless of route, so the earliest
                // catchable entry can be a different trip's own last stop
                // (nothing further to ride), while a later-sorted entry is
                // a different route that actually goes somewhere. The real
                // RAPTOR optimisation (only the earliest trip *per route*
                // can ever matter) needs grouping by route id to apply
                // safely; skipped for this increment's scope in favour of
                // the plain, obviously-correct version.
                for &(trip_index, pos) in &self.stop_trips[from_stop] {
                    let trip = &self.trips[trip_index];
                    if trip.stop_times[pos].departure_seconds < arrive_at_from {
                        continue; // can't catch a trip that's already left
                    }
                    // Ride forward, relaxing every later stop on this trip.
                    for later_pos in (pos + 1)..trip.stop_times.len() {
                        let st = &trip.stop_times[later_pos];
                        let better = match &state[st.stop_index] {
                            Some(s) => st.arrival_seconds < s.earliest_arrival,
                            None => true,
                        };
                        if better {
                            state[st.stop_index] = Some(StopState {
                                earliest_arrival: st.arrival_seconds,
                                arrival: Arrival::Ride { trip: trip_index, board_pos: pos },
                            });
                            if !improved[st.stop_index] {
                                improved[st.stop_index] = true;
                                next_marked.push(st.stop_index);
                            }
                        }
                    }
                }
            }

            // Footpath transfers from whatever this round's rides just
            // improved — same "stay within this round, snapshot-free"
            // reasoning as riding above doesn't apply here, since a
            // transfer doesn't consume a vehicle boarding; propagating
            // immediately within the round just means "no further vehicle
            // needed" journeys settle faster, without affecting the
            // transfer-count meaning of the round the way reusing a ride's
            // own output would.
            let just_improved = next_marked.clone();
            for newly in self.propagate_footpaths(&just_improved, &mut state) {
                if !improved[newly] {
                    improved[newly] = true;
                    next_marked.push(newly);
                }
            }

            marked = next_marked;
        }

        // Best stop to leave the network from: earliest (arrival + walk to
        // destination), among stops within walking range of it.
        let mut best: Option<(usize, u32)> = None; // (stop_index, total arrival at destination)
        for (i, s) in self.stops.iter().enumerate() {
            let Some(stop_state) = &state[i] else { continue };
            let d = haversine_distance_m(s.lon, s.lat, dest_lon, dest_lat);
            if d > MAX_WALK_M {
                continue;
            }
            let total = stop_state.earliest_arrival + walk_seconds(d);
            if best.is_none_or(|(_, b)| total < b) {
                best = Some((i, total));
            }
        }

        let direct_d = haversine_distance_m(origin_lon, origin_lat, dest_lon, dest_lat);
        let direct_total = if direct_d <= MAX_WALK_M { Some(departure_seconds + walk_seconds(direct_d)) } else { None };

        match (best, direct_total) {
            (None, None) => None,
            (None, Some(_)) => Some(vec![Leg::Walk {
                from_lon: origin_lon,
                from_lat: origin_lat,
                to_lon: dest_lon,
                to_lat: dest_lat,
                seconds: walk_seconds(direct_d),
            }]),
            (Some((stop, total)), direct) => {
                if direct.is_some_and(|d| d <= total) {
                    Some(vec![Leg::Walk {
                        from_lon: origin_lon,
                        from_lat: origin_lat,
                        to_lon: dest_lon,
                        to_lat: dest_lat,
                        seconds: walk_seconds(direct_d),
                    }])
                } else {
                    let mut legs = self.reconstruct(stop, &state, origin_lon, origin_lat);
                    let s = &self.stops[stop];
                    let egress_d = haversine_distance_m(s.lon, s.lat, dest_lon, dest_lat);
                    if egress_d > 0.0 {
                        legs.push(Leg::Walk { from_lon: s.lon, from_lat: s.lat, to_lon: dest_lon, to_lat: dest_lat, seconds: walk_seconds(egress_d) });
                    }
                    Some(legs)
                }
            }
        }
    }

    // Relaxes footpath transfers out of `seeds` to a fixpoint (a walk from
    // a newly-reached stop can itself open up a further walk, e.g. two
    // consecutive kerb-crossings) and returns every stop index genuinely
    // improved in the process — `seeds` themselves are never returned even
    // if also reachable some other way, since they were already marked
    // before this call.
    fn propagate_footpaths(&self, seeds: &[usize], state: &mut [Option<StopState>]) -> Vec<usize> {
        let mut newly_marked: Vec<usize> = Vec::new();
        let mut worklist: Vec<usize> = seeds.to_vec();
        while let Some(from_stop) = worklist.pop() {
            let arrive = state[from_stop].as_ref().unwrap().earliest_arrival;
            for &(to_stop, walk_s) in &self.footpaths[from_stop] {
                let candidate = arrive + walk_s;
                let better = match &state[to_stop] {
                    Some(s) => candidate < s.earliest_arrival,
                    None => true,
                };
                if better {
                    state[to_stop] = Some(StopState { earliest_arrival: candidate, arrival: Arrival::WalkFromStop { from_stop } });
                    newly_marked.push(to_stop);
                    worklist.push(to_stop);
                }
            }
        }
        newly_marked
    }

    // Walks `state`'s own predecessor chain backwards from `stop` to the
    // origin, then reverses it into departure order.
    fn reconstruct(&self, mut stop: usize, state: &[Option<StopState>], origin_lon: f64, origin_lat: f64) -> Vec<Leg> {
        let mut legs: Vec<Leg> = Vec::new();
        loop {
            let s = state[stop].as_ref().expect("every stop on the reconstructed path was reached during the scan");
            match &s.arrival {
                Arrival::WalkFromOrigin => {
                    // A real access leg unless the origin sits exactly on
                    // this stop (the common case: `plan` is so often
                    // called with the origin already snapped to a real
                    // stop that silently emitting a 0m/0s leg here would
                    // make that the *typical* result, not an edge case —
                    // every other 0-distance walk in this file (the egress
                    // leg just above, and the single-hop reconstruct
                    // itself) is skipped the same way).
                    let to = &self.stops[stop];
                    let d = haversine_distance_m(origin_lon, origin_lat, to.lon, to.lat);
                    if d > 0.0 {
                        legs.push(Leg::Walk { from_lon: origin_lon, from_lat: origin_lat, to_lon: to.lon, to_lat: to.lat, seconds: walk_seconds(d) });
                    }
                    break;
                }
                Arrival::WalkFromStop { from_stop } => {
                    let from = &self.stops[*from_stop];
                    let to = &self.stops[stop];
                    let d = haversine_distance_m(from.lon, from.lat, to.lon, to.lat);
                    legs.push(Leg::Walk { from_lon: from.lon, from_lat: from.lat, to_lon: to.lon, to_lat: to.lat, seconds: walk_seconds(d) });
                    stop = *from_stop;
                }
                Arrival::Ride { trip, board_pos } => {
                    let trip_ref = &self.trips[*trip];
                    let board_st = &trip_ref.stop_times[*board_pos];
                    let alight_st = trip_ref.stop_times.iter().find(|st| st.stop_index == stop).unwrap();
                    legs.push(Leg::Ride {
                        route_id: trip_ref.route_id,
                        board_stop_osm_id: self.stops[board_st.stop_index].osm_id,
                        board_seconds: board_st.departure_seconds,
                        alight_stop_osm_id: self.stops[stop].osm_id,
                        alight_seconds: alight_st.arrival_seconds,
                    });
                    stop = board_st.stop_index;
                }
            }
        }
        legs.reverse();
        legs
    }
}

fn build_not_found_result() -> JsValue {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &"found".into(), &false.into()).unwrap();
    obj.into()
}

fn build_found_result(legs: &[Leg]) -> JsValue {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &"found".into(), &true.into()).unwrap();
    let arr = js_sys::Array::new();
    for leg in legs {
        let leg_obj = js_sys::Object::new();
        match leg {
            Leg::Walk { from_lon, from_lat, to_lon, to_lat, seconds } => {
                js_sys::Reflect::set(&leg_obj, &"kind".into(), &"walk".into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"fromLon".into(), &(*from_lon).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"fromLat".into(), &(*from_lat).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"toLon".into(), &(*to_lon).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"toLat".into(), &(*to_lat).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"seconds".into(), &(*seconds as f64).into()).unwrap();
            }
            Leg::Ride { route_id, board_stop_osm_id, board_seconds, alight_stop_osm_id, alight_seconds } => {
                js_sys::Reflect::set(&leg_obj, &"kind".into(), &"ride".into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"routeId".into(), &(*route_id as f64).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"boardStopOsmId".into(), &(*board_stop_osm_id as f64).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"boardSeconds".into(), &(*board_seconds as f64).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"alightStopOsmId".into(), &(*alight_stop_osm_id as f64).into()).unwrap();
                js_sys::Reflect::set(&leg_obj, &"alightSeconds".into(), &(*alight_seconds as f64).into()).unwrap();
            }
        }
        arr.push(&leg_obj);
    }
    js_sys::Reflect::set(&obj, &"legs".into(), &arr).unwrap();
    obj.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stop(osm_id: i64, lon: f64, lat: f64) -> TransitStop {
        TransitStop { osm_id, lon, lat }
    }

    fn st(stop_index: usize, arrival_seconds: u32, departure_seconds: u32) -> JourneyStopTime {
        JourneyStopTime { stop_index, arrival_seconds, departure_seconds }
    }

    fn planner_from(stops: Vec<TransitStop>, trips: Vec<JourneyTrip>) -> JourneyPlanner {
        let mut stop_trips: Vec<Vec<(usize, usize)>> = vec![Vec::new(); stops.len()];
        for (trip_index, trip) in trips.iter().enumerate() {
            for (pos, s) in trip.stop_times.iter().enumerate() {
                stop_trips[s.stop_index].push((trip_index, pos));
            }
        }
        for calls in &mut stop_trips {
            calls.sort_by_key(|&(trip_index, pos)| trips[trip_index].stop_times[pos].departure_seconds);
        }
        let mut footpaths: Vec<Vec<(usize, u32)>> = vec![Vec::new(); stops.len()];
        for i in 0..stops.len() {
            for j in (i + 1)..stops.len() {
                let d = haversine_distance_m(stops[i].lon, stops[i].lat, stops[j].lon, stops[j].lat);
                if d <= MAX_WALK_M {
                    let s = walk_seconds(d);
                    footpaths[i].push((j, s));
                    footpaths[j].push((i, s));
                }
            }
        }
        JourneyPlanner { stops, trips, stop_trips, footpaths }
    }

    #[test]
    fn direct_single_trip_journey() {
        let stops = vec![stop(1, 0.0, 0.0), stop(2, 0.01, 0.0)];
        let trips = vec![JourneyTrip { route_id: 100, stop_times: vec![st(0, 1000, 1000), st(1, 1200, 1200)] }];
        let planner = planner_from(stops, trips);
        let legs = planner.plan_internal(0.0, 0.0, 0.01, 0.0, 900).expect("a journey should be found");
        assert_eq!(legs.len(), 1, "origin/destination sit exactly on the two stops, so no walk legs are needed");
        match &legs[0] {
            Leg::Ride { route_id, board_seconds, alight_seconds, .. } => {
                assert_eq!(*route_id, 100);
                assert_eq!(*board_seconds, 1000);
                assert_eq!(*alight_seconds, 1200);
            }
            _ => panic!("expected a single ride leg"),
        }
    }

    #[test]
    fn journey_requiring_one_transfer() {
        // A -> B on trip 1, B -> C on trip 2 (a different route), trip 2
        // departing after trip 1 arrives.
        let stops = vec![stop(1, 0.0, 0.0), stop(2, 0.01, 0.0), stop(3, 0.02, 0.0)];
        let trips = vec![
            JourneyTrip { route_id: 100, stop_times: vec![st(0, 1000, 1000), st(1, 1200, 1200)] },
            JourneyTrip { route_id: 200, stop_times: vec![st(1, 1300, 1300), st(2, 1500, 1500)] },
        ];
        let planner = planner_from(stops, trips);
        let legs = planner.plan_internal(0.0, 0.0, 0.02, 0.0, 900).expect("a journey should be found");
        let rides: Vec<&Leg> = legs.iter().filter(|l| matches!(l, Leg::Ride { .. })).collect();
        assert_eq!(rides.len(), 2, "reaching C from A needs both trips, got legs with {} ride(s)", rides.len());
        if let Leg::Ride { route_id, .. } = rides[0] {
            assert_eq!(*route_id, 100);
        }
        if let Leg::Ride { route_id, .. } = rides[1] {
            assert_eq!(*route_id, 200);
        }
    }

    #[test]
    fn walking_beats_a_slow_indirect_trip() {
        // Origin and destination are 50m apart (well within MAX_WALK_M),
        // but the only trip connecting their nearest stops takes a very
        // long time to arrive — walking straight there should win.
        let stops = vec![stop(1, 0.0, 0.0), stop(2, 0.0005, 0.0)]; // ~55m apart
        let trips = vec![JourneyTrip { route_id: 100, stop_times: vec![st(0, 1000, 1000), st(1, 100_000, 100_000)] }];
        let planner = planner_from(stops, trips);
        let legs = planner.plan_internal(0.0, 0.0, 0.0005, 0.0, 900).expect("a journey should be found");
        assert_eq!(legs.len(), 1, "a direct walk should win outright over the much slower transit option");
        assert!(matches!(legs[0], Leg::Walk { .. }), "expected a walk-only journey");
    }

    #[test]
    fn infeasible_returns_none() {
        // Origin and destination are both far from the only stops, and far
        // from each other — nothing reachable by foot or by transit.
        let stops = vec![stop(1, 0.0, 0.0), stop(2, 0.01, 0.0)];
        let trips = vec![JourneyTrip { route_id: 100, stop_times: vec![st(0, 1000, 1000), st(1, 1200, 1200)] }];
        let planner = planner_from(stops, trips);
        let result = planner.plan_internal(5.0, 5.0, 5.01, 5.01, 900);
        assert!(result.is_none(), "nothing within walking range of either end, and no transit reaches it either");
    }

    #[test]
    fn footpath_transfer_between_nearby_stops() {
        // Stop A (served by trip 1, ending there) and stop A' (serving
        // trip 2, starting there) are 40m apart but share no trip — the
        // kerb-crossing case DESIGN.md §4 calls out explicitly.
        let stops = vec![
            stop(1, 0.0, 0.0),    // X
            stop(2, 0.01, 0.0),   // A
            stop(3, 0.0104, 0.0), // A' (~44m from A)
            stop(4, 0.02, 0.0),   // Y
        ];
        let trips = vec![
            JourneyTrip { route_id: 100, stop_times: vec![st(0, 1000, 1000), st(1, 1200, 1200)] }, // X -> A
            JourneyTrip { route_id: 200, stop_times: vec![st(2, 1400, 1400), st(3, 1600, 1600)] }, // A' -> Y
        ];
        let planner = planner_from(stops, trips);
        let legs = planner.plan_internal(0.0, 0.0, 0.02, 0.0, 900).expect("a journey crossing via the footpath should be found");
        let kinds: Vec<&str> = legs
            .iter()
            .map(|l| match l {
                Leg::Walk { .. } => "walk",
                Leg::Ride { .. } => "ride",
            })
            .collect();
        assert_eq!(kinds, vec!["ride", "walk", "ride"], "expected ride X->A, footpath A->A', ride A'->Y, got {kinds:?}");
    }

    #[test]
    fn footpath_chained_straight_from_the_origin_with_no_ride_at_all() {
        // A real case found against the real save: origin sits exactly on
        // stop P, and stop Q is close enough to *walk* to directly from
        // the origin too (within MAX_WALK_M) — but Q is placed so that it,
        // in turn, is within footpath range of the destination, while a
        // *direct* origin-to-destination walk is just over MAX_WALK_M
        // (triangle inequality: two short legs don't have to sum to
        // something short). No trip exists at all; the only way to the
        // destination is to walk from the origin to Q, then from Q to the
        // destination — and this must be found without ever boarding
        // anything, which needs footpaths seeded from the *initial*
        // origin-walk set, not only from ride-caused improvements.
        let stops = vec![stop(1, 0.0, 0.0), stop(2, 0.0035, 0.0013)];
        // P(origin) -> Q: ~430m. Q -> destination (0.0068, 0.0042): ~440m.
        // P(origin) -> destination directly: ~770m, over MAX_WALK_M.
        let planner = planner_from(stops, vec![]);
        let legs = planner
            .plan_internal(0.0, 0.0, 0.0068, 0.0042, 900)
            .expect("walking via the intermediate stop should be found even with zero trips in the network");
        assert!(legs.iter().all(|l| matches!(l, Leg::Walk { .. })), "every leg should be a walk — there are no trips to ride");
        assert!(legs.len() >= 2, "a direct walk alone can't cover it (over MAX_WALK_M) — expected at least two walk legs via the intermediate stop");
    }
}
