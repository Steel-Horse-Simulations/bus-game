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
/// Scope, flagged rather than silently assumed: `assemble_chains` only
/// joins ways head-to-tail in a consistent direction (one way's own last
/// node exactly matching another way's own first node) — real OSM
/// coastline tagging conventionally keeps a consistent direction along
/// one coast (sea on the right of the way), so consecutive ways along a
/// real stretch usually do chain this way, but a way needing to be
/// *reversed* to join, or a genuine branch point, is not handled: the
/// chain simply stops there rather than guessing. A gap in the real data
/// (a missing way, or a dangling end at the extract boundary) likewise
/// just ends that chain early. For the Scotland+border extract this
/// covers the common case without attempting a fully general, planet-
/// scale coastline assembler — a bounded, pragmatic approach, not a
/// complete one.
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
            // chain currently ends.
            if let Some(&next_idx) = by_start.get(&last_node).and_then(|c| c.iter().find(|&&idx| !used[idx])) {
                used[next_idx] = true;
                geometry.extend(raw[next_idx].geometry.iter().skip(1));
                last_node = raw[next_idx].last_node;
                continue;
            }
            // Grow backward: some unused way ends exactly where this chain
            // currently starts.
            if let Some(&prev_idx) = by_end.get(&first_node).and_then(|c| c.iter().find(|&&idx| !used[idx])) {
                used[prev_idx] = true;
                let mut prefix = raw[prev_idx].geometry.clone();
                prefix.extend(geometry.into_iter().skip(1));
                geometry = prefix;
                first_node = raw[prev_idx].first_node;
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
}
