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
                junction_control: nodes.junction_control(id),
            });
        }
    }

    // way id -> indices of edges it produced, needed to resolve restrictions
    let mut edges_by_way: HashMap<i64, Vec<u32>> = HashMap::new();
    let mut edges = Vec::new();
    let mut edges_with_gap = 0usize;
    // Shared flat buffer every edge's own geometry slices into — see
    // `Edge::geometry_start`'s own doc comment for why.
    let mut geometry_points: Vec<(i32, i32)> = Vec::new();

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

            let geometry_start = geometry_points.len() as u32;
            let mut length_m = 0.0f64;
            let mut prev = nodes.get(from_id).expect("from_id resolved above");
            let mut gap = false;
            for &mid_id in &way.refs[segment_start + 1..i] {
                match nodes.get(mid_id) {
                    Some(coord) => {
                        length_m += distance_m(prev, coord);
                        geometry_points.push(coord);
                        prev = coord;
                    }
                    None => gap = true, // known simplification: boundary-edge gap
                }
            }
            let geometry_len = geometry_points.len() as u32 - geometry_start;
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
                geometry_start,
                geometry_len,
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
        geometry_points,
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

/// Appends `other`'s own nodes/edges/restrictions onto `into`, renumbering
/// every index `other` carries (`Edge::from`/`to`, `Restriction::via`/
/// `from_edge`/`to_edge`) by `into`'s own pre-merge node/edge counts —
/// UK-EXPANSION.md §1's multi-source map build (GB + Ireland/NI + Isle of
/// Man). Building each source's own complete `RoadGraph` first and merging
/// *those* (small — just nodes/edges/restrictions), rather than merging the
/// raw per-source node-coordinate maps and way lists before ever calling
/// `build_graph` once, is what makes a multi-source build actually fit in
/// memory: a source's own raw pass-1/2 data (up to hundreds of millions of
/// node coordinates for an unclipped GB) is freed as soon as that source's
/// own graph is built, never held alongside another source's. Safe simply
/// because real OSM ids are already globally unique across separate
/// regional extracts (`NodeCoords::merge`'s own doc comment) — this merge
/// doesn't need to detect or dedupe anything, only shift index spaces so
/// they don't collide.
pub fn merge_road_graphs(into: &mut RoadGraph, other: RoadGraph) {
    let node_offset = into.nodes.len() as u32;
    let edge_offset = into.edges.len() as u32;
    let geometry_offset = into.geometry_points.len() as u32;

    into.nodes.extend(other.nodes);
    into.edges.extend(other.edges.into_iter().map(|mut e| {
        e.from += node_offset;
        e.to += node_offset;
        e.geometry_start += geometry_offset;
        e
    }));
    into.restrictions.extend(other.restrictions.into_iter().map(|mut r| {
        r.via += node_offset;
        r.from_edge += edge_offset;
        r.to_edge += edge_offset;
        r
    }));
    into.geometry_points.extend(other.geometry_points);
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
                edge.geometry_len == 0,
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
            report.graph.edges[0].geometry_len,
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

    /// The whole point of building per-source graphs separately and merging
    /// *those* (UK-EXPANSION.md §1) rather than merging raw node/way data
    /// first: graph B's own node/edge indices must be correctly renumbered,
    /// not just concatenated blindly, or its own edges/restrictions would
    /// silently point at graph A's nodes instead of its own.
    #[test]
    fn merge_road_graphs_renumbers_the_second_graph_s_own_indices() {
        // Graph A: two separate 3-node/2-edge/1-restriction graphs, built
        // exactly like restriction_resolves_to_correct_edges above but with
        // different real osm ids so a mix-up would be obviously wrong.
        let a_ids = [1i64, 2, 3];
        let a_nodes = NodeCoords::from_pairs(a_ids.iter().map(|&id| (id, coord(id))));
        let a_ways = vec![way(100, &[1, 2]), way(200, &[2, 3])];
        let a_ref_counts = ref_counts_for(&a_ways);
        let a_restrictions = vec![RestrictionRecord {
            id: 1,
            restriction_type: "no_left_turn".to_string(),
            from_way: Some(100),
            via_node: Some(2),
            via_way: None,
            to_way: Some(200),
        }];
        let a_report = build_graph(&a_nodes, &a_ways, &a_ref_counts, &a_restrictions);

        // Graph B: a completely separate graph (different osm ids — real
        // regional extracts never share ids, but even if they collided this
        // merge doesn't care, since it never looks at osm ids to decide
        // indices).
        let b_ids = [901i64, 902, 903];
        let b_nodes = NodeCoords::from_pairs(b_ids.iter().map(|&id| (id, coord(id))));
        let b_ways = vec![way(9100, &[901, 902]), way(9200, &[902, 903])];
        let b_ref_counts = ref_counts_for(&b_ways);
        let b_restrictions = vec![RestrictionRecord {
            id: 2,
            restriction_type: "no_right_turn".to_string(),
            from_way: Some(9100),
            via_node: Some(902),
            via_way: None,
            to_way: Some(9200),
        }];
        let b_report = build_graph(&b_nodes, &b_ways, &b_ref_counts, &b_restrictions);
        // HashSet-ordered internally, so node 902's own index within B's
        // own graph (before merging) isn't assumed — found by osm_id, the
        // same way the post-merge assertion below does.
        let b_node_902_index_before_merge =
            b_report.graph.nodes.iter().position(|n| n.osm_id == 902).unwrap();

        let a_node_count = a_report.graph.nodes.len();
        let mut merged = a_report.graph;
        merge_road_graphs(&mut merged, b_report.graph);

        assert_eq!(merged.nodes.len(), 6, "3 + 3 nodes");
        assert_eq!(merged.edges.len(), 4, "2 + 2 edges");
        assert_eq!(merged.restrictions.len(), 2, "1 + 1 restrictions");

        // Graph A's own restriction is untouched (it was first, offset 0).
        let ra = &merged.restrictions[0];
        assert_eq!(merged.nodes[ra.via as usize].osm_id, 2, "A's restriction still points at A's own via node");
        assert_eq!(merged.edges[ra.from_edge as usize].osm_way_id, 100);
        assert_eq!(merged.edges[ra.to_edge as usize].osm_way_id, 200);

        // Graph B's own restriction must have been renumbered to point at
        // its own nodes/edges in their NEW positions, not A's.
        let rb = &merged.restrictions[1];
        assert_eq!(
            merged.nodes[rb.via as usize].osm_id, 902,
            "B's restriction should still resolve to B's own via node (osm id 902) at its new, offset index"
        );
        assert_eq!(merged.edges[rb.from_edge as usize].osm_way_id, 9100, "B's restriction's from_edge should still be B's own way 9100");
        assert_eq!(merged.edges[rb.to_edge as usize].osm_way_id, 9200, "B's restriction's to_edge should still be B's own way 9200");

        // Every one of B's own nodes should have moved by exactly A's own
        // node count — spot-checked via osm_id lookup rather than assuming
        // a position (node order within a single build_graph call is
        // HashSet-derived, so not something to hardcode either).
        let b_node_902_new_index = merged.nodes.iter().position(|n| n.osm_id == 902).unwrap();
        assert_eq!(
            b_node_902_new_index,
            b_node_902_index_before_merge + a_node_count,
            "node 902 should have moved by exactly A's own node count ({a_node_count})",
        );
    }

    /// `merge_road_graphs` must shift a merged-in edge's own `geometry_start`
    /// by the first graph's own `geometry_points` length, the same way it
    /// already shifts node/edge indices — a real, separate index space this
    /// refactor introduced (OPEN-ITEMS.md T55-map-boundary's WASM-allocator
    /// fix), not covered by the node/edge/restriction renumbering test
    /// above since that test's own ways have no intermediate geometry at
    /// all (adjacent-node ways only, geometry_len always 0 there).
    #[test]
    fn merge_road_graphs_shifts_the_second_graph_s_own_geometry_offsets() {
        // Graph A: one way with an unshared middle node (ref count 1), so
        // it keeps a real geometry point instead of being promoted to a
        // junction — same shape `unshared_middle_node_does_not_split_the_way`
        // above already proves in isolation.
        let a_ids = [1i64, 2, 3];
        let a_nodes = NodeCoords::from_pairs(a_ids.iter().map(|&id| (id, coord(id))));
        let a_ways = vec![way(100, &[1, 2, 3])];
        let a_ref_counts = ref_counts_for(&a_ways);
        let a_report = build_graph(&a_nodes, &a_ways, &a_ref_counts, &[]);
        assert_eq!(a_report.graph.geometry_points.len(), 1, "A's own single edge keeps node 2 as a geometry point");

        // Graph B: the same shape, different real osm ids.
        let b_ids = [901i64, 902, 903];
        let b_nodes = NodeCoords::from_pairs(b_ids.iter().map(|&id| (id, coord(id))));
        let b_ways = vec![way(9100, &[901, 902, 903])];
        let b_ref_counts = ref_counts_for(&b_ways);
        let b_report = build_graph(&b_nodes, &b_ways, &b_ref_counts, &[]);
        assert_eq!(b_report.graph.geometry_points.len(), 1);
        let b_geometry_point = b_report.graph.geometry_points[0];

        let mut merged = a_report.graph;
        merge_road_graphs(&mut merged, b_report.graph);

        assert_eq!(merged.geometry_points.len(), 2, "1 + 1 geometry points");
        let b_edge = merged.edges.iter().find(|e| e.osm_way_id == 9100).unwrap();
        assert_eq!(
            b_edge.geometry_start, 1,
            "B's own edge should point 1 past A's own geometry_points (A contributed exactly 1)"
        );
        assert_eq!(
            merged.edge_geometry(b_edge),
            &[b_geometry_point],
            "B's own edge should still resolve to its own real geometry point at the new, offset position, not A's"
        );
    }

    #[test]
    fn junction_control_carries_from_node_tags_into_the_built_graph_node() {
        // Node 2 must actually become a graph junction to appear in the
        // output at all — shared by two ways, same as
        // `shared_node_splits_both_ways_into_two_edges` above.
        let ids = [1i64, 2, 3, 4, 5];
        let nodes = NodeCoords::from_pairs_with_junction_control(
            ids.iter().map(|&id| (id, coord(id))),
            [(2, game_data::JunctionControl::TrafficSignals)],
        );
        let ways = vec![way(100, &[1, 2, 3]), way(200, &[4, 2, 5])];
        let ref_counts = ref_counts_for(&ways);

        let report = build_graph(&nodes, &ways, &ref_counts, &[]);

        let node2 = report
            .graph
            .nodes
            .iter()
            .find(|n| n.osm_id == 2)
            .expect("node 2 should be a junction (shared by both segments)");
        assert_eq!(node2.junction_control, game_data::JunctionControl::TrafficSignals);

        let node1 = report.graph.nodes.iter().find(|n| n.osm_id == 1).unwrap();
        assert_eq!(
            node1.junction_control,
            game_data::JunctionControl::None,
            "a node with no explicit tag defaults to None"
        );
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
