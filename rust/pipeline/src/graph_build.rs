use crate::road_graph::{NodeCoords, RestrictionRecord, WayRecord};
use game_data::{Edge, GraphNode, Restriction, RestrictionKind, RoadGraph};
use std::collections::{HashMap, HashSet};

fn restriction_kind_from_tag(v: &str) -> Option<RestrictionKind> {
    Some(match v {
        "no_left_turn" => RestrictionKind::NoLeftTurn,
        "no_right_turn" => RestrictionKind::NoRightTurn,
        "no_straight_on" => RestrictionKind::NoStraightOn,
        "no_u_turn" => RestrictionKind::NoUTurn,
        "only_left_turn" => RestrictionKind::OnlyLeftTurn,
        "only_right_turn" => RestrictionKind::OnlyRightTurn,
        "only_straight_on" => RestrictionKind::OnlyStraightOn,
        _ => return None,
    })
}

/// Haversine distance in metres between two nanodegree-encoded points.
fn distance_m(a: (i32, i32), b: (i32, i32)) -> f64 {
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let (lon1, lat1) = (a.0 as f64 * 1e-7, a.1 as f64 * 1e-7);
    let (lon2, lat2) = (b.0 as f64 * 1e-7, b.1 as f64 * 1e-7);
    let (lat1r, lat2r) = (lat1.to_radians(), lat2.to_radians());
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2) + lat1r.cos() * lat2r.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * a.sqrt().asin()
}

/// Pass 3 (in-memory, no file I/O): decide which nodes are real junctions —
/// a way endpoint, or a node shared by 2+ ways — then split every way into
/// one edge per junction-to-junction segment, carrying the intermediate
/// shape points and summed length. Also resolves `type=restriction`
/// relations to edge/node indices where the from/via/to ways and node are
/// all part of the graph; anything else (via-way restrictions, or members
/// outside our extract) is dropped and counted, not silently mismodelled.
pub struct BuildReport {
    pub graph: RoadGraph,
    pub restrictions_seen: usize,
    pub restrictions_resolved: usize,
    pub restrictions_via_way_skipped: usize,
    /// `from`/`via`/`to` roles missing or via wasn't a node reference at all.
    pub restrictions_missing_members: usize,
    /// `restriction=*` value wasn't one of the seven kinds we model.
    pub restrictions_unrecognized_kind: usize,
    /// Via node exists in OSM but wasn't kept as a graph junction.
    pub restrictions_via_not_in_graph: usize,
    /// Via node is a junction, but no edge from the named way touches it.
    pub restrictions_edge_not_found: usize,
    /// Edges where a middle shape point lay outside the extract boundary
    /// (so had no known coordinate) and was skipped — a straight line
    /// substitutes for that stretch of the real geometry.
    pub edges_with_gap: usize,
}

pub fn build_graph(
    nodes: &NodeCoords,
    ways: &[WayRecord],
    node_ref_counts: &HashMap<i64, u32>,
    restrictions_in: &[RestrictionRecord],
) -> BuildReport {
    let mut junction_ids: HashSet<i64> = HashSet::new();
    for way in ways {
        if let (Some(&first), Some(&last)) = (way.refs.first(), way.refs.last()) {
            junction_ids.insert(first);
            junction_ids.insert(last);
        }
        for &id in &way.refs {
            if node_ref_counts.get(&id).copied().unwrap_or(0) > 1 {
                junction_ids.insert(id);
            }
        }
    }

    let mut node_index: HashMap<i64, u32> = HashMap::with_capacity(junction_ids.len());
    let mut graph_nodes = Vec::with_capacity(junction_ids.len());
    for &id in &junction_ids {
        if let Some((lon_e7, lat_e7)) = nodes.get(id) {
            node_index.insert(id, graph_nodes.len() as u32);
            graph_nodes.push(GraphNode {
                osm_id: id,
                lon_e7,
                lat_e7,
            });
        }
    }

    // way id -> indices of edges it produced, needed to resolve restrictions
    let mut edges_by_way: HashMap<i64, Vec<u32>> = HashMap::new();
    let mut edges = Vec::new();
    let mut edges_with_gap = 0usize;

    for way in ways {
        if way.refs.len() < 2 {
            continue;
        }
        let width_m = way.inferred_width_m();
        let mut segment_start = 0usize;
        for i in 1..way.refs.len() {
            let is_junction = junction_ids.contains(&way.refs[i]);
            let is_last = i == way.refs.len() - 1;
            if !is_junction && !is_last {
                continue;
            }

            let from_id = way.refs[segment_start];
            let to_id = way.refs[i];
            let (Some(&from_idx), Some(&to_idx)) =
                (node_index.get(&from_id), node_index.get(&to_id))
            else {
                // One end lies outside the extract boundary (no known
                // coordinate) — drop this segment rather than guess.
                segment_start = i;
                continue;
            };

            let mut geometry = Vec::new();
            let mut length_m = 0.0f64;
            let mut prev = nodes.get(from_id).expect("from_id resolved above");
            let mut gap = false;
            for &mid_id in &way.refs[segment_start + 1..i] {
                match nodes.get(mid_id) {
                    Some(coord) => {
                        length_m += distance_m(prev, coord);
                        geometry.push(coord);
                        prev = coord;
                    }
                    None => gap = true, // known simplification: boundary-edge gap
                }
            }
            let to_coord = nodes.get(to_id).expect("to_id resolved above");
            length_m += distance_m(prev, to_coord);
            if gap {
                edges_with_gap += 1;
            }

            let edge_idx = edges.len() as u32;
            edges_by_way.entry(way.id).or_default().push(edge_idx);
            edges.push(Edge {
                from: from_idx,
                to: to_idx,
                osm_way_id: way.id,
                class: way.class.index() as u8,
                width_m,
                length_m: length_m as f32,
                oneway: way.oneway,
                access_restricted: way.access_restricted,
                psv_yes: way.psv_yes,
                bus_yes: way.bus_yes,
                maxspeed_mph: way.maxspeed_mph,
                geometry,
            });

            segment_start = i;
        }
    }

    let find_edge_at = |way_id: i64, via_idx: u32| -> Option<u32> {
        edges_by_way.get(&way_id)?.iter().copied().find(|&edge_idx| {
            let edge = &edges[edge_idx as usize];
            edge.from == via_idx || edge.to == via_idx
        })
    };

    let mut restrictions = Vec::new();
    let mut restrictions_resolved = 0usize;
    let mut restrictions_via_way_skipped = 0usize;
    let mut restrictions_unrecognized_kind = 0usize;
    let mut restrictions_missing_members = 0usize;
    let mut restrictions_via_not_in_graph = 0usize;
    let mut restrictions_edge_not_found = 0usize;

    for r in restrictions_in {
        if r.via_way.is_some() {
            restrictions_via_way_skipped += 1;
            continue;
        }
        let (Some(from_way), Some(via_node), Some(to_way)) = (r.from_way, r.via_node, r.to_way)
        else {
            restrictions_missing_members += 1;
            continue;
        };
        let Some(kind) = restriction_kind_from_tag(&r.restriction_type) else {
            restrictions_unrecognized_kind += 1;
            continue;
        };
        let Some(&via_idx) = node_index.get(&via_node) else {
            // The via node wasn't kept as a junction — usually because the
            // restriction sits right at the extract boundary, where one of
            // its ways didn't make it into the graph at all.
            restrictions_via_not_in_graph += 1;
            continue;
        };
        let (Some(from_edge), Some(to_edge)) =
            (find_edge_at(from_way, via_idx), find_edge_at(to_way, via_idx))
        else {
            restrictions_edge_not_found += 1;
            continue;
        };

        restrictions.push(Restriction {
            via: via_idx,
            from_edge,
            to_edge,
            kind,
        });
        restrictions_resolved += 1;
    }

    let graph = RoadGraph {
        nodes: graph_nodes,
        edges,
        restrictions,
    };

    BuildReport {
        graph,
        restrictions_seen: restrictions_in.len(),
        restrictions_resolved,
        restrictions_via_way_skipped,
        restrictions_missing_members,
        restrictions_unrecognized_kind,
        restrictions_via_not_in_graph,
        restrictions_edge_not_found,
        edges_with_gap,
    }
}

pub fn save(graph: &RoadGraph, path: &str) -> std::io::Result<usize> {
    let bytes = game_data::encode(graph);
    std::fs::write(path, &bytes)?;
    Ok(bytes.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::road_graph::HighwayClass;
    use game_data::OnewayDirection;

    fn coord(id: i64) -> (i32, i32) {
        (-30_000_000 + id as i32 * 1000, 550_000_000 + id as i32 * 1000)
    }

    fn way(id: i64, refs: &[i64]) -> WayRecord {
        WayRecord {
            id,
            class: HighwayClass::Residential,
            oneway: OnewayDirection::TwoWay,
            access_restricted: false,
            psv_yes: false,
            bus_yes: false,
            maxspeed_mph: None,
            width_tag_m: None,
            lanes: None,
            refs: refs.to_vec(),
        }
    }

    fn ref_counts_for(ways: &[WayRecord]) -> HashMap<i64, u32> {
        let mut counts = HashMap::new();
        for w in ways {
            for &id in &w.refs {
                *counts.entry(id).or_insert(0u32) += 1;
            }
        }
        counts
    }

    #[test]
    fn shared_node_splits_both_ways_into_two_edges() {
        let ids = [1i64, 2, 3, 4, 5];
        let nodes = NodeCoords::from_pairs(ids.iter().map(|&id| (id, coord(id))));
        let ways = vec![way(100, &[1, 2, 3]), way(200, &[4, 2, 5])];
        let ref_counts = ref_counts_for(&ways);

        let report = build_graph(&nodes, &ways, &ref_counts, &[]);

        assert_eq!(report.graph.nodes.len(), 5, "all 5 nodes should be junctions");
        assert_eq!(
            report.graph.edges.len(),
            4,
            "each way should split into 2 edges at the shared node"
        );
        for edge in &report.graph.edges {
            assert!(
                edge.geometry.is_empty(),
                "adjacent-node edges carry no intermediate geometry"
            );
        }
    }

    #[test]
    fn unshared_middle_node_does_not_split_the_way() {
        let ids = [10i64, 11, 12];
        let nodes = NodeCoords::from_pairs(ids.iter().map(|&id| (id, coord(id))));
        let ways = vec![way(300, &[10, 11, 12])];
        let ref_counts = ref_counts_for(&ways);

        let report = build_graph(&nodes, &ways, &ref_counts, &[]);

        assert_eq!(
            report.graph.nodes.len(),
            2,
            "only the two endpoints are junctions"
        );
        assert_eq!(report.graph.edges.len(), 1, "the whole way stays one edge");
        assert_eq!(
            report.graph.edges[0].geometry.len(),
            1,
            "middle node kept as shape geometry, not promoted to a graph node"
        );
        assert!(report.graph.edges[0].length_m > 0.0);
    }

    #[test]
    fn restriction_resolves_to_correct_edges() {
        // from-way 100 runs 1->2, to-way 200 runs 2->3; node 2 is the via.
        let ids = [1i64, 2, 3];
        let nodes = NodeCoords::from_pairs(ids.iter().map(|&id| (id, coord(id))));
        let ways = vec![way(100, &[1, 2]), way(200, &[2, 3])];
        let ref_counts = ref_counts_for(&ways);

        let restrictions_in = vec![RestrictionRecord {
            id: 1,
            restriction_type: "no_left_turn".to_string(),
            from_way: Some(100),
            via_node: Some(2),
            via_way: None,
            to_way: Some(200),
        }];

        let report = build_graph(&nodes, &ways, &ref_counts, &restrictions_in);

        assert_eq!(report.restrictions_resolved, 1);
        assert_eq!(report.graph.restrictions.len(), 1);
        let r = &report.graph.restrictions[0];
        assert_eq!(r.kind, RestrictionKind::NoLeftTurn);
        assert_eq!(report.graph.nodes[r.via as usize].osm_id, 2);
        assert_eq!(report.graph.edges[r.from_edge as usize].osm_way_id, 100);
        assert_eq!(report.graph.edges[r.to_edge as usize].osm_way_id, 200);
    }

    #[test]
    fn via_way_restrictions_are_skipped_not_mismodelled() {
        let ids = [1i64, 2, 3];
        let nodes = NodeCoords::from_pairs(ids.iter().map(|&id| (id, coord(id))));
        let ways = vec![way(100, &[1, 2]), way(200, &[2, 3])];
        let ref_counts = ref_counts_for(&ways);

        let restrictions_in = vec![RestrictionRecord {
            id: 1,
            restriction_type: "no_u_turn".to_string(),
            from_way: Some(100),
            via_node: None,
            via_way: Some(999),
            to_way: Some(200),
        }];

        let report = build_graph(&nodes, &ways, &ref_counts, &restrictions_in);

        assert_eq!(report.restrictions_via_way_skipped, 1);
        assert_eq!(report.restrictions_resolved, 0);
        assert!(report.graph.restrictions.is_empty());
    }
}
