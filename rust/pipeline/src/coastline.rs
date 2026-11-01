/// Data model for the coastline artefact (`coastline.bin`) — real OSM
/// `natural=coastline` way geometry, assembled into longer continuous
/// chains at build time by joining ways that share an end node (OSM
/// commonly splits one real coastline into many separate ways purely for
/// file-size reasons). Built for item 2 of the 31 October hand-off
/// (OPEN-ITEMS.md): fare zones can be drawn with a straight (Shift-click)
/// segment out over open water, then clipped back to the real coastline
/// when the zone is finished, so the saved zone stays land-only — the
/// clipping itself happens client-side (`fare-zone-drawing.ts`), this
/// artefact only supplies the real geometry to clip against.
///
/// Scope, flagged rather than silently assumed: `assemble_chains` joins
/// ways head-to-tail, trying both directions at each end (a way's first
/// node matching where the chain currently is, or its last node matching
/// — the latter needs that way walked in reverse to continue). Real OSM
/// coastline tagging conventionally keeps a consistent direction along
/// one coast, but not perfectly everywhere a real extract has been edited
/// by different contributors over time — live user report, 2026-11-01,
/// confirmed by reading this function: drawing a fare zone along a real
/// stretch of Skye's coast kept falling back to a straight line in
/// places it shouldn't have, because ways needing a reversed join were
/// splitting one real continuous coastline into several separate chain
/// objects. A genuine branch point is still not handled: the chain picks
/// whichever unused candidate it finds first rather than guessing which
/// branch is "the" coastline. A gap in the real data (a missing way, or a
/// dangling end at the extract boundary) likewise just ends that chain
/// early — except for a genuinely small real gap, which `main.rs` closes
/// as a separate step straight after, via this module's own
/// `bridge_nearby_chain_ends` (confirmed from the same live report: even
/// with the reversed-join fix above, some real stretches of Skye's coast
/// were STILL falling back to straight lines, because two ways' own
/// endpoints were a few metres apart rather than the exact same node —
/// real OSM digitisation slop, not a direction problem at all). For the
/// whole-UK+Ireland+IoM extract this covers the common case without
/// attempting a fully general, planet-scale coastline assembler — a
/// bounded, pragmatic approach, not a complete one.
use std::collections::HashMap;

pub use game_data::{CoastlineChain, CoastlineData};

pub fn save(data: &CoastlineData, path: &str) -> std::io::Result<usize> {
    let bytes = game_data::encode_coastline(data);
    std::fs::write(path, &bytes)?;
    Ok(bytes.len())
}

pub(crate) fn is_coastline_tag(key: &str, value: &str) -> bool {
    key == "natural" && value == "coastline"
}

/// One coastline way as read directly off the .osm.pbf, before chain
/// assembly — the raw first/last node ids are needed to match shared
/// endpoints exactly (comparing resolved lon/lat floats for "the same
/// point" would be fragile), the resolved geometry is what actually gets
/// chained and saved.
pub struct RawCoastlineWay {
    pub first_node: i64,
    pub last_node: i64,
    pub geometry: Vec<(i32, i32)>,
}

/// Joins raw coastline ways head-to-tail wherever one way's own last node
/// is exactly another (unused) way's own first node, repeatedly, growing a
/// chain in BOTH directions (appending a way that continues where the
/// chain currently ends, and prepending one that leads into where it
/// currently starts) — a real .osm.pbf gives no guarantee ways appear in
/// any particular geographic order, so growing one direction only would
/// make the result depend on arbitrary file order rather than the real
/// geometry. See this module's own doc comment for what this deliberately
/// does not attempt (reversed-direction joins, branches, closing a ring).
pub fn assemble_chains(raw: Vec<RawCoastlineWay>) -> Vec<CoastlineChain> {
    let mut by_start: HashMap<i64, Vec<usize>> = HashMap::new();
    let mut by_end: HashMap<i64, Vec<usize>> = HashMap::new();
    for (i, w) in raw.iter().enumerate() {
        by_start.entry(w.first_node).or_default().push(i);
        by_end.entry(w.last_node).or_default().push(i);
    }
    let mut used = vec![false; raw.len()];
    let mut chains = Vec::new();

    for seed_idx in 0..raw.len() {
        if used[seed_idx] {
            continue;
        }
        used[seed_idx] = true;
        let mut geometry = raw[seed_idx].geometry.clone();
        let mut first_node = raw[seed_idx].first_node;
        let mut last_node = raw[seed_idx].last_node;

        loop {
            // Grow forward: some unused way starts exactly where this
            // chain currently ends (joined as drawn)...
            if let Some(&next_idx) = by_start.get(&last_node).and_then(|c| c.iter().find(|&&idx| !used[idx])) {
                used[next_idx] = true;
                geometry.extend(raw[next_idx].geometry.iter().skip(1));
                last_node = raw[next_idx].last_node;
                continue;
            }
            // ...or some unused way ENDS exactly where this chain
            // currently ends — that way continues the real coastline too,
            // just walked in reverse.
            if let Some(&next_rev_idx) = by_end.get(&last_node).and_then(|c| c.iter().find(|&&idx| !used[idx])) {
                used[next_rev_idx] = true;
                geometry.extend(raw[next_rev_idx].geometry.iter().rev().skip(1));
                last_node = raw[next_rev_idx].first_node;
                continue;
            }
            // Grow backward: some unused way ends exactly where this chain
            // currently starts (joined as drawn)...
            if let Some(&prev_idx) = by_end.get(&first_node).and_then(|c| c.iter().find(|&&idx| !used[idx])) {
                used[prev_idx] = true;
                let mut prefix = raw[prev_idx].geometry.clone();
                prefix.extend(geometry.into_iter().skip(1));
                geometry = prefix;
                first_node = raw[prev_idx].first_node;
                continue;
            }
            // ...or some unused way STARTS exactly where this chain
            // currently starts — needs to be reversed and prepended.
            if let Some(&prev_rev_idx) = by_start.get(&first_node).and_then(|c| c.iter().find(|&&idx| !used[idx])) {
                used[prev_rev_idx] = true;
                let mut prefix: Vec<(i32, i32)> = raw[prev_rev_idx].geometry.iter().rev().cloned().collect();
                prefix.extend(geometry.into_iter().skip(1));
                geometry = prefix;
                first_node = raw[prev_rev_idx].last_node;
                continue;
            }
            break;
        }

        if geometry.len() >= 2 {
            chains.push(CoastlineChain { geometry });
        }
    }

    chains
}

/// Bridges remaining dangling chain ends that are within a small real-
/// world tolerance of each other but don't share an exact node id — real
/// OSM coastline digitization isn't always perfectly snapped where two
/// contributors' own edits meet. Confirmed directly against the real
/// data (2026-11-01, live report with screenshots — a fare zone drawn
/// along Skye's coast kept falling back to straight lines across small,
/// genuine gaps assemble_chains alone couldn't close): many chain-ends
/// sit within 1-5m of another chain's own end, clearly the same real
/// point, not a coincidence. Kept conservative (a small tolerance, not a
/// wide catch-everything radius) because Skye's own coast also has
/// plenty of genuinely separate small skerries close together that must
/// stay separate chains. Greedy nearest-pair-first: repeatedly finds the
/// single closest pair of still-open ends across every remaining chain
/// and merges them (reversing one side if needed, the same four-case
/// direction logic `assemble_chains`'s own loop already uses, just
/// between two whole chains instead of a way and a growing one), until
/// no pair is left within tolerance. O(n^2) per round — fine at the
/// Scotland+border extract's scale (a few thousand ends); a future
/// whole-UK run with many more chains would want a spatial grid instead
/// of a flat scan.
pub fn bridge_nearby_chain_ends(chains: Vec<CoastlineChain>, tolerance_m: f64) -> Vec<CoastlineChain> {
    const DEG_TO_M_LAT: f64 = 111_000.0;
    fn dist_m(a: (i32, i32), b: (i32, i32)) -> f64 {
        let lat = (a.1 as f64 / 1e7 + b.1 as f64 / 1e7) * 0.5;
        let deg_to_m_lon = DEG_TO_M_LAT * lat.to_radians().cos();
        let dx = (a.0 - b.0) as f64 / 1e7 * deg_to_m_lon;
        let dy = (a.1 - b.1) as f64 / 1e7 * DEG_TO_M_LAT;
        (dx * dx + dy * dy).sqrt()
    }

    let mut chains: Vec<Vec<(i32, i32)>> = chains.into_iter().map(|c| c.geometry).collect();

    loop {
        // (chain i, i's matching end is its LAST point, chain j, j's
        // matching end is its LAST point, distance)
        let mut best: Option<(usize, bool, usize, bool, f64)> = None;
        for i in 0..chains.len() {
            for j in (i + 1)..chains.len() {
                let i_ends = [(chains[i][0], false), (*chains[i].last().unwrap(), true)];
                let j_ends = [(chains[j][0], false), (*chains[j].last().unwrap(), true)];
                for &(i_pt, i_is_last) in &i_ends {
                    for &(j_pt, j_is_last) in &j_ends {
                        let d = dist_m(i_pt, j_pt);
                        if d <= tolerance_m && best.is_none_or(|(_, _, _, _, bd)| d < bd) {
                            best = Some((i, i_is_last, j, j_is_last, d));
                        }
                    }
                }
            }
        }
        let Some((i, i_is_last, j, j_is_last, _)) = best else { break };

        // Unlike assemble_chains's own exact-node-id joins, the two ends
        // being bridged here are NOT the same point (that gap is exactly
        // what's being bridged) — both real points are kept, nothing
        // skipped as a duplicate.
        let chain_j = chains.remove(j);
        let chain_i = std::mem::take(&mut chains[i]);
        chains[i] = match (i_is_last, j_is_last) {
            (true, false) => {
                let mut m = chain_i;
                m.extend(chain_j);
                m
            }
            (true, true) => {
                let mut m = chain_i;
                m.extend(chain_j.into_iter().rev());
                m
            }
            (false, false) => {
                let mut m: Vec<(i32, i32)> = chain_j.into_iter().rev().collect();
                m.extend(chain_i);
                m
            }
            (false, true) => {
                let mut m = chain_j;
                m.extend(chain_i);
                m
            }
        };
    }

    chains.into_iter().map(|geometry| CoastlineChain { geometry }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn way(first: i64, last: i64, geom: &[(i32, i32)]) -> RawCoastlineWay {
        RawCoastlineWay { first_node: first, last_node: last, geometry: geom.to_vec() }
    }

    #[test]
    fn classifies_coastline_tag() {
        assert!(is_coastline_tag("natural", "coastline"));
        assert!(!is_coastline_tag("natural", "water"));
        assert!(!is_coastline_tag("waterway", "coastline"));
    }

    #[test]
    fn two_ways_sharing_an_end_node_join_into_one_chain() {
        // Way A: node 1 -> node 2. Way B: node 2 -> node 3. A real OSM
        // coastline split at node 2 purely for file size.
        let raw = vec![way(1, 2, &[(0, 0), (10, 10)]), way(2, 3, &[(10, 10), (20, 20)])];
        let chains = assemble_chains(raw);
        assert_eq!(chains.len(), 1, "two joinable ways become one chain, not two");
        assert_eq!(chains[0].geometry, vec![(0, 0), (10, 10), (20, 20)], "the shared point isn't duplicated");
    }

    #[test]
    fn three_ways_chain_in_sequence_regardless_of_input_order() {
        // Deliberately out of order in the input — a real .osm.pbf gives no
        // guarantee ways appear in any particular geographic sequence.
        let raw = vec![way(2, 3, &[(10, 10), (20, 20)]), way(3, 4, &[(20, 20), (30, 30)]), way(1, 2, &[(0, 0), (10, 10)])];
        let chains = assemble_chains(raw);
        assert_eq!(chains.len(), 1, "all three join into a single chain");
        assert_eq!(chains[0].geometry, vec![(0, 0), (10, 10), (20, 20), (30, 30)]);
    }

    #[test]
    fn a_way_needing_a_reversed_join_still_chains_forward() {
        // Way A: node 1 -> node 2. Way B: node 3 -> node 2 (its own LAST
        // node, not first, matches where the chain currently ends) —
        // real OSM coastline tagging direction isn't perfectly consistent
        // everywhere a real extract has been edited over time. B must be
        // walked in reverse (2 -> 3) to continue the real coastline.
        let raw = vec![way(1, 2, &[(0, 0), (10, 10)]), way(3, 2, &[(20, 20), (10, 10)])];
        let chains = assemble_chains(raw);
        assert_eq!(chains.len(), 1, "a way needing a reversed join still joins into one chain, not two");
        assert_eq!(chains[0].geometry, vec![(0, 0), (10, 10), (20, 20)], "the reversed way's own geometry is walked in the right direction, not just appended as-is");
    }

    #[test]
    fn a_way_needing_a_reversed_join_still_chains_backward() {
        // Way A (the seed): node 2 -> node 3. Way B: node 2 -> node 1 —
        // its own FIRST node matches where the chain currently starts, so
        // a normal backward join (which looks for a LAST-node match)
        // wouldn't find it; B needs to be reversed (1 -> 2) and prepended.
        let raw = vec![way(2, 3, &[(10, 10), (20, 20)]), way(2, 1, &[(10, 10), (0, 0)])];
        let chains = assemble_chains(raw);
        assert_eq!(chains.len(), 1, "a way needing a reversed backward join still joins into one chain");
        assert_eq!(chains[0].geometry, vec![(0, 0), (10, 10), (20, 20)], "the reversed-and-prepended way's own geometry reads in the right direction");
    }

    #[test]
    fn unrelated_ways_stay_as_separate_chains() {
        // No shared node at all — two genuinely separate stretches of
        // coast (e.g. opposite sides of the extract).
        let raw = vec![way(1, 2, &[(0, 0), (10, 10)]), way(100, 101, &[(500, 500), (510, 510)])];
        let chains = assemble_chains(raw);
        assert_eq!(chains.len(), 2, "ways with no shared endpoint never get joined");
    }

    #[test]
    fn a_gap_in_the_data_stops_a_chain_rather_than_bridging_it() {
        // Way A ends at node 2; the way that would start at node 2 is
        // simply missing from this extract (e.g. a dangling end at the
        // extract boundary) — the chain just ends, it isn't bridged.
        let raw = vec![way(1, 2, &[(0, 0), (10, 10)]), way(50, 51, &[(900, 900), (910, 910)])];
        let chains = assemble_chains(raw);
        assert_eq!(chains.len(), 2, "a missing join partner leaves the chain exactly where the data stops");
    }

    fn chain(geom: &[(i32, i32)]) -> CoastlineChain {
        CoastlineChain { geometry: geom.to_vec() }
    }

    // ~90 e7 units at the equator is ~1m (real distances, not node-id
    // matches, so plain e7 integer deltas rather than named node ids).
    const ABOUT_1M: i32 = 90;

    #[test]
    fn two_chain_ends_a_real_digitisation_gap_apart_get_bridged() {
        // Chain A's own end and chain B's own start are ~1m apart — not
        // the same node id at all, but confirmed (2026-11-01, real data
        // measurement) to be exactly the kind of gap real OSM coastline
        // digitisation leaves behind.
        let chains = vec![chain(&[(0, 0), (1000, 0)]), chain(&[(1000 + ABOUT_1M, 0), (2000, 0)])];
        let bridged = bridge_nearby_chain_ends(chains, 5.0);
        assert_eq!(bridged.len(), 1, "two ends within tolerance are bridged into one chain");
        assert_eq!(bridged[0].geometry, vec![(0, 0), (1000, 0), (1000 + ABOUT_1M, 0), (2000, 0)], "both chains' own real geometry is kept, including the small real gap itself");
    }

    #[test]
    fn bridging_reverses_a_chain_when_its_matching_end_needs_it() {
        // Chain A ends at (1000,0). Chain B's own LAST point (not first)
        // is the one ~1m away — B needs to be walked in reverse to
        // continue, same direction logic as assemble_chains's own joins.
        let chains = vec![chain(&[(0, 0), (1000, 0)]), chain(&[(2000, 0), (1000 + ABOUT_1M, 0)])];
        let bridged = bridge_nearby_chain_ends(chains, 5.0);
        assert_eq!(bridged.len(), 1, "a reversed match still bridges into one chain");
        assert_eq!(bridged[0].geometry, vec![(0, 0), (1000, 0), (1000 + ABOUT_1M, 0), (2000, 0)], "the reversed chain's own geometry reads in the right direction");
    }

    #[test]
    fn ends_genuinely_far_apart_are_left_as_separate_chains() {
        // ~1km apart — a real, deliberately separate feature (e.g. a
        // genuinely separate small skerry close to the mainland), not a
        // digitisation gap. Must stay unbridged at a conservative
        // tolerance.
        let chains = vec![chain(&[(0, 0), (1000, 0)]), chain(&[(1000 + ABOUT_1M * 1000, 0), (2000, 0)])];
        let bridged = bridge_nearby_chain_ends(chains, 5.0);
        assert_eq!(bridged.len(), 2, "ends well beyond the tolerance are never bridged");
    }

    #[test]
    fn bridging_is_transitive_across_more_than_two_chains() {
        // A real gap followed by another real gap a little further along
        // — three originally-separate chains should end up as one.
        let chains = vec![
            chain(&[(0, 0), (1000, 0)]),
            chain(&[(1000 + ABOUT_1M, 0), (2000, 0)]),
            chain(&[(2000 + ABOUT_1M, 0), (3000, 0)]),
        ];
        let bridged = bridge_nearby_chain_ends(chains, 5.0);
        assert_eq!(bridged.len(), 1, "a chain of real gaps all bridge together into a single chain, not just the first pair");
    }
}
