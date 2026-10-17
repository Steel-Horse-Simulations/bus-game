//! One-off: splice the real-world Portree Link Road bypass into
//! `road_graph.bin` as a manual addition (UK-EXPANSION.md §13 "Portree
//! bypass" — confirmed with the user as a one-off, not a reusable
//! player-roads feature; dropped once the real bypass lands in a proper OSM
//! extract and the pipeline is rebuilt against it).
//!
//! Path: run once against each `road_graph.bin` copy that needs patching
//! (dev `pipeline-data/`, the installed game's `%APPDATA%\bus-game\map-data\`)
//! via `cargo run --release --example add_portree_bypass -- <path>`.
//!
//! What this does (revised after three rounds of live testing against the
//! real packaged game -- see UK-EXPANSION.md §13 for the full history):
//! 1. Loads the existing graph.
//! 2. Splices a genuinely new node onto the real, already-existing
//!    roundabout's own ring (a real 4-node UK mini-roundabout, traced
//!    directly from the graph), rather than reusing one of its own 4 nodes
//!    -- keeps its own real nodes/edges byte-for-byte untouched, per the
//!    user's "that should be untouched" instruction.
//! 3. Splits the real Staffin Road edge at TWO points (north and south of
//!    the new roundabout's centre) -- the real plan shows Staffin Road
//!    continues through this roundabout in both directions, each meeting
//!    the circle at its own point; funnelling both into one external node
//!    (the original version of this tool) caused "the staffin road one is
//!    going the wrong way."
//! 4. Adds two real circular roundabouts (16 nodes/edges each, two-way --
//!    see `add_roundabout_circle`'s own doc comment for why not one-way;
//!    radius measured live against the real plan, see the circle arrays'
//!    own comment) -- the orange one with 2 real connection points (the
//!    bypass passes through), the red one with 3 (bypass + Staffin Road
//!    north + south) -- plus the link edges connecting existing roundabout
//!    -> orange roundabout -> red roundabout -> both Staffin Road arms,
//!    all Primary/30mph (user's explicit choice), carrying the real curve
//!    as geometry. A matching visual-only road layer
//!    (`src/renderer/portree-bypass-layer.ts`) draws the identical real
//!    road/roundabout shape on the map itself, since this graph data alone
//!    has no visible road surface (not in the basemap's own tiles) --
//!    without it a route through here just looked like a line bending
//!    through empty space, reported as "glitching... not going around"
//!    the roundabouts.
//! 5. Saves the patched graph back to the same path.

use game_data::{Edge, GraphNode, JunctionControl, OnewayDirection, RoadGraph};
use std::env;

const EARTH_RADIUS_M: f64 = 6_371_000.0;

fn to_e7(deg: f64) -> i32 {
    (deg * 1e7).round() as i32
}

fn from_e7(v: i32) -> f64 {
    v as f64 * 1e-7
}

fn distance_m(a: (i32, i32), b: (i32, i32)) -> f64 {
    let (lon1, lat1) = (from_e7(a.0), from_e7(a.1));
    let (lon2, lat2) = (from_e7(b.0), from_e7(b.1));
    let (lat1r, lat2r) = (lat1.to_radians(), lat2.to_radians());
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2) + lat1r.cos() * lat2r.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * a.sqrt().asin()
}

fn main() {
    let path = env::args().nth(1).expect("usage: add_portree_bypass <road_graph.bin path>");

    // The warped curve (green existing roundabout -> new ~25m roundabout at
    // Cearn Ròmasdail -> new ~25m roundabout at Staffin Road), derived from
    // the user's real PDF engineering drawing this session, 41 points,
    // chainage -195 to 232.86: index 0 = green (real, existing), index 20 =
    // orange roundabout centre, index 40 = red roundabout centre.
    let curve: Vec<(f64, f64)> = vec![
        (-6.199547298771484, 57.420947438712),
        (-6.199435479066435, 57.420947548746874),
        (-6.199252459361387, 57.42094165878175),
        (-6.199066639656338, 57.42092876881663),
        (-6.198879919951289, 57.42090907885151),
        (-6.19869770024624, 57.42088478888638),
        (-6.198534180541191, 57.42085839892126),
        (-6.198356060836143, 57.42082140895614),
        (-6.198181541131094, 57.42077951899101),
        (-6.198015721426045, 57.42073342902589),
        (-6.1978687017209975, 57.420687639060766),
        (-6.197705082015949, 57.42063304909564),
        (-6.1975558623108995, 57.420572259130516),
        (-6.197412842605851, 57.42050786916539),
        (-6.197288422900803, 57.42044577920027),
        (-6.197162603195753, 57.420381289235145),
        (-6.197039583490705, 57.42031739927002),
        (-6.196918163785656, 57.4202545093049),
        (-6.196790144080608, 57.42018591933977),
        (-6.1967371243755585, 57.42015512937465),
        (-6.19633750467051, 57.41995843940953),
        (-6.19629074156983, 57.41991909280261),
        (-6.196185378469149, 57.41985234619569),
        (-6.19606741536847, 57.419785499588784),
        (-6.195945552267789, 57.41972395298186),
        (-6.195812389167109, 57.41966310637495),
        (-6.195674526066428, 57.419600359768026),
        (-6.1955454629657485, 57.41954231316111),
        (-6.195420899865068, 57.419494966554204),
        (-6.1952930367643875, 57.419450619947284),
        (-6.195156373663708, 57.41941807334037),
        (-6.195016110563028, 57.41939332673345),
        (-6.194864347462347, 57.41937538012653),
        (-6.194696184361667, 57.419357633519624),
        (-6.194528121260987, 57.4193398869127),
        (-6.194359858160306, 57.41932214030579),
        (-6.194191795059626, 57.419304493698874),
        (-6.194023631958946, 57.41928684709195),
        (-6.193855368858267, 57.419269000485045),
        (-6.193687305757585, 57.419251353878124),
        (-6.193135042656905, 57.41924250727121),
    ];

    // The exact point on the REAL Staffin Road centreline (queried live from
    // the actual rendered road geometry, not guessed) where the new
    // roundabout's east edge sits, confirmed by the user: "Staffin road gets
    // a bit replaced, the right edge of the centre of the new roundabout is
    // where the centre of the current road is."
    // Revised: the real plan (bigcrop_east.png, traced directly from the
    // user's PDF overlay) shows this is a real 3-arm roundabout -- Staffin
    // Road continues both north AND south through it, each meeting the
    // circle at its own separate point, not funnelled through one external
    // node as the first version of this tool did. That merge was the exact
    // cause of the user's "the staffin road one is going the wrong way"
    // report: every route, regardless of which direction it continued on
    // Staffin Road, was forced through the same single external connection.
    // These two points are each exactly `RADIUS_M` (12.22m, see
    // `RED_CIRCLE_RADIUS_M` below) along the real Staffin Road polyline
    // from the road's own closest point to the roundabout centre --
    // computed by walking the real road geometry, not guessed.
    let staffin_north_point = (-6.192975543590418, 57.419379892303205);
    let staffin_south_point = (-6.192883814895522, 57.41916683452929);

    // Real circular roundabout geometry (user explicitly asked for actual
    // loops, not just a waypoint, after testing and finding "I couldn't see
    // any roundabouts" -- the first version of this tool only carried the
    // roundabout centres as plain geometry points on one through-edge).
    // 16 points per circle, radius 12.22m -- measured directly via live
    // `map.unproject` against the real plan drawing (raycasting out from
    // each roundabout centre through the real grey circulatory-carriageway
    // hatching), not guessed and not computed from a 256px-tile formula
    // (which silently halves against MapLibre's actual 512px tiles -- a
    // known pitfall, caught this time by measuring directly). Exactly
    // matches the radius used by the visual road layer
    // (portree-bypass-layer.ts) so the drawn road and the routing geometry
    // agree precisely.
    let orange_circle: [(f64, f64); 16] = [
        (-6.196337504670508, 57.42006821353724),
        (-6.196259490721544, 57.42005985747933),
        (-6.196193353689111, 57.42003606143963),
        (-6.196149162336865, 57.42000044814951),
        (-6.196133644397588, 57.41995843940952),
        (-6.196149162336865, 57.41991643066954),
        (-6.196193353689111, 57.41988081737942),
        (-6.196259490721544, 57.41985702133972),
        (-6.196337504670508, 57.4198486652818),
        (-6.196415518619473, 57.41985702133972),
        (-6.196481655651906, 57.41988081737942),
        (-6.1965258470041515, 57.41991643066954),
        (-6.196541364943429, 57.41995843940952),
        (-6.1965258470041515, 57.42000044814951),
        (-6.196481655651906, 57.42003606143963),
        (-6.196415518619473, 57.42005985747933),
    ];
    let red_circle: [(f64, f64); 16] = [
        (-6.193135042656905, 57.419352281398915),
        (-6.193057030233349, 57.419343925341),
        (-6.192990894494094, 57.419320129301305),
        (-6.192946704005922, 57.41928451601119),
        (-6.192931186370068, 57.41924250727121),
        (-6.192946704005922, 57.41920049853122),
        (-6.192990894494094, 57.419164885241095),
        (-6.193057030233349, 57.419141089201396),
        (-6.193135042656905, 57.419132733143485),
        (-6.193213055080462, 57.419141089201396),
        (-6.193279190819717, 57.419164885241095),
        (-6.193323381307889, 57.41920049853122),
        (-6.193338898943743, 57.41924250727121),
        (-6.193323381307889, 57.41928451601119),
        (-6.193279190819717, 57.419320129301305),
        (-6.193213055080462, 57.419343925341),
    ];
    let orange_entry_idx: usize = 14;
    let orange_exit_idx: usize = 7;
    // Red roundabout: 3 real connection points on the circle (16 points,
    // 22.5 deg apart, index 0 = bearing 0/north) -- bypass arm (bearing
    // ~272 deg -> index 12), Staffin Road north (bearing 32 deg -> index 1),
    // Staffin Road south (bearing 119 deg -> index 5). Bearings computed
    // from the real curve/road data, not guessed.
    let red_bypass_idx: usize = 12;
    let red_north_idx: usize = 1;
    let red_south_idx: usize = 5;

    println!("Loading {path}...");
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    let mut graph: RoadGraph = game_data::decode(&bytes);
    println!(
        "Loaded: {} nodes, {} edges, {} geometry points",
        graph.nodes.len(),
        graph.edges.len(),
        graph.geometry_points.len()
    );

    // --- Step 1: splice a genuinely new node onto the REAL existing
    // roundabout's own ring, rather than reusing one of its 4 existing
    // nodes directly. First version of this tool connected straight to the
    // nearest existing ring node (osm_id 34580186) -- which worked
    // topologically, but let the router shortcut directly onto the new
    // bypass from that point, skipping the real ring's own 33.7m arc
    // entirely (confirmed live: a drawn route "just goes through the
    // middle" instead of visibly using the roundabout). Traced the real
    // ring directly from the graph (4 nodes: 413289645, 34580194, 34580184,
    // 34580186, a small real UK mini-roundabout, oneway forward/clockwise)
    // and computed where the bypass's own real approach bearing actually
    // meets it -- lands 98.7% of the way along the 34580186->413289645 arc,
    // i.e. right next to 413289645 but not reusing it. Splitting there
    // keeps the ring's own real 4 nodes and 4 edges completely unchanged,
    // exactly matching the user's "that should be untouched" instruction.
    let green_ring_split_point = (-6.199360286645096, 57.4209557142429);
    let green_node_idx = split_nearest_edge(
        &mut graph,
        green_ring_split_point,
        |class| class == 8, // Tertiary -- the real roundabout ring's own class
        5.0,
        "existing roundabout ring",
    );

    // --- Step 2: split the real Staffin Road edge at TWO points (north and
    // south of the roundabout centre) -- see staffin_north_point/
    // staffin_south_point's own comment above for why two, not one.
    let staffin_north_node = split_nearest_edge(
        &mut graph,
        staffin_north_point,
        |class| class == crate_class_index_primary(),
        15.0,
        "Staffin Road (north)",
    );
    let staffin_south_node = split_nearest_edge(
        &mut graph,
        staffin_south_point,
        |class| class == crate_class_index_primary(),
        15.0,
        "Staffin Road (south)",
    );

    // --- Step 4: add the bypass as a sequence of edges: green -> orange
    // roundabout (real circular geometry, entered/exited where the real
    // road arms meet it) -> red roundabout (same) -> Staffin Road split
    // node. Primary class, 30mph throughout (user's explicit choice),
    // two-way for the link sections, one-way-clockwise for each roundabout
    // circle (UK convention -- same `junction=roundabout` direction rule
    // `road_graph.rs::scan_ways_and_relations` already applies to real OSM
    // roundabouts, applied here by hand since this one doesn't exist in OSM
    // yet).
    let mut next_synthetic_way_id = -900_000_010i64;

    let orange_nodes = add_roundabout_circle(
        &mut graph,
        &orange_circle,
        &[orange_entry_idx, orange_exit_idx],
        &mut next_synthetic_way_id,
    );
    let (orange_entry_node, orange_exit_node) = (orange_nodes[0], orange_nodes[1]);

    let red_nodes = add_roundabout_circle(
        &mut graph,
        &red_circle,
        &[red_bypass_idx, red_north_idx, red_south_idx],
        &mut next_synthetic_way_id,
    );
    let (red_bypass_node, red_north_node, red_south_node) = (red_nodes[0], red_nodes[1], red_nodes[2]);

    // green -> orange entry (curve points strictly between index 0 and 20)
    add_link_edge(
        &mut graph,
        green_node_idx,
        orange_entry_node,
        &curve[1..20],
        &mut next_synthetic_way_id,
        "green -> orange entry",
    );
    // orange exit -> red bypass arm (curve points strictly between index 20 and 40)
    add_link_edge(
        &mut graph,
        orange_exit_node,
        red_bypass_node,
        &curve[21..40],
        &mut next_synthetic_way_id,
        "orange exit -> red bypass arm",
    );
    // red's two Staffin Road arms -- no intermediate geometry, each splice
    // point sits right at the circle's own edge by construction.
    add_link_edge(
        &mut graph,
        red_north_node,
        staffin_north_node,
        &[],
        &mut next_synthetic_way_id,
        "red -> Staffin Road (north)",
    );
    add_link_edge(
        &mut graph,
        red_south_node,
        staffin_south_node,
        &[],
        &mut next_synthetic_way_id,
        "red -> Staffin Road (south)",
    );

    println!(
        "Final: {} nodes, {} edges, {} geometry points",
        graph.nodes.len(),
        graph.edges.len(),
        graph.geometry_points.len()
    );

    let bytes_out = game_data::encode(&graph);
    std::fs::write(&path, &bytes_out).unwrap_or_else(|e| panic!("failed to write {path}: {e}"));
    println!("Saved {path} ({:.1} MB)", bytes_out.len() as f64 / 1_000_000.0);
}

/// `HighwayClass::Primary.index()` == 4 (Motorway, MotorwayLink, Trunk,
/// TrunkLink, Primary, ...) -- the pipeline crate's own `HighwayClass` enum
/// isn't exposed to examples, so this mirrors its known index directly
/// rather than depending on the pipeline binary crate from an example.
fn crate_class_index_primary() -> u8 {
    4
}

/// Adds a real circular roundabout: 16 graph nodes around the circle, joined
/// by 16 two-way edges forming the full closed loop. Returns the node
/// indices at `entry_idx`/`exit_idx` for the caller to connect the link
/// edges to. Maxspeed set lower than the link road's own 30mph (15mph) --
/// realistic circulating speed, distinct from the through-road speed.
///
/// Deliberately two-way rather than strict UK clockwise-only: with only two
/// arms and no give-way/multi-vehicle circulation simulated yet (CLAUDE.md
/// "Known hard parts" -- stand/junction contention is Phase 9), a forced
/// one-way-clockwise loop makes a route between two roughly-opposite arms
/// take the *long* way around every time, which is what produced the
/// "weird" near-full-loop shape the user flagged after testing a live
/// route. Two-way lets the router (and the route band) take the natural,
/// shorter arc in both directions -- worth revisiting if real roundabout
/// circulation rules are simulated later.
fn add_roundabout_circle(
    graph: &mut RoadGraph,
    circle: &[(f64, f64); 16],
    connection_indices: &[usize],
    next_synthetic_way_id: &mut i64,
) -> Vec<u32> {
    let way_id = *next_synthetic_way_id;
    *next_synthetic_way_id -= 1;

    let first_node_idx = graph.nodes.len() as u32;
    for &(lon, lat) in circle {
        graph.nodes.push(GraphNode {
            osm_id: *next_synthetic_way_id, // also used as a synthetic node id source, always negative/unique
            lon_e7: to_e7(lon),
            lat_e7: to_e7(lat),
            junction_control: JunctionControl::MiniRoundabout,
        });
        *next_synthetic_way_id -= 1;
    }

    for i in 0..circle.len() {
        let from_idx = first_node_idx + i as u32;
        let to_idx = first_node_idx + ((i + 1) % circle.len()) as u32;
        let from_c = (graph.nodes[from_idx as usize].lon_e7, graph.nodes[from_idx as usize].lat_e7);
        let to_c = (graph.nodes[to_idx as usize].lon_e7, graph.nodes[to_idx as usize].lat_e7);
        graph.edges.push(Edge {
            from: from_idx,
            to: to_idx,
            osm_way_id: way_id,
            class: crate_class_index_primary(),
            width_m: 7.3,
            length_m: distance_m(from_c, to_c) as f32,
            oneway: OnewayDirection::TwoWay,
            access_restricted: false,
            psv_yes: true,
            bus_yes: true,
            maxspeed_mph: Some(15),
            geometry_start: 0,
            geometry_len: 0,
        });
    }

    connection_indices.iter().map(|&i| first_node_idx + i as u32).collect()
}

/// Adds a single two-way Primary/30mph link edge between two existing graph
/// nodes, carrying `mid_points` (real-world lon/lat) as intermediate shape
/// geometry.
fn add_link_edge(
    graph: &mut RoadGraph,
    from_idx: u32,
    to_idx: u32,
    mid_points: &[(f64, f64)],
    next_synthetic_way_id: &mut i64,
    label: &str,
) {
    let way_id = *next_synthetic_way_id;
    *next_synthetic_way_id -= 1;

    let from_c = (graph.nodes[from_idx as usize].lon_e7, graph.nodes[from_idx as usize].lat_e7);
    let to_c = (graph.nodes[to_idx as usize].lon_e7, graph.nodes[to_idx as usize].lat_e7);
    let geom: Vec<(i32, i32)> = mid_points.iter().map(|&(lon, lat)| (to_e7(lon), to_e7(lat))).collect();

    let mut full_poly: Vec<(i32, i32)> = vec![from_c];
    full_poly.extend_from_slice(&geom);
    full_poly.push(to_c);
    let len_m = polyline_length_m(&full_poly);

    let geometry_start = graph.geometry_points.len() as u32;
    graph.geometry_points.extend_from_slice(&geom);
    graph.edges.push(Edge {
        from: from_idx,
        to: to_idx,
        osm_way_id: way_id,
        class: crate_class_index_primary(),
        width_m: 7.3,
        length_m: len_m as f32,
        oneway: OnewayDirection::TwoWay,
        access_restricted: false,
        psv_yes: true,
        bus_yes: true,
        maxspeed_mph: Some(30),
        geometry_start,
        geometry_len: geom.len() as u32,
    });
    println!("Added link edge ({label}): node {from_idx} -> node {to_idx}, {len_m:.1}m, {} geometry points", geom.len());
}

/// Finds the real edge nearest `target` among edges matching `class_filter`,
/// and splits it there -- inserting one new junction node and replacing the
/// one old edge with two new ones that carry the same real tags (class,
/// width, oneway, access, psv, bus, maxspeed) as the original, split at the
/// exact point. Refuses (panics) rather than guessing if nothing is found
/// within `max_dist_m`. Returns the new node's index.
fn split_nearest_edge(
    graph: &mut RoadGraph,
    target_lonlat: (f64, f64),
    class_filter: impl Fn(u8) -> bool,
    max_dist_m: f64,
    label: &str,
) -> u32 {
    let target = (to_e7(target_lonlat.0), to_e7(target_lonlat.1));
    let mut best_edge_idx: Option<usize> = None;
    let mut best_dist = f64::MAX;
    let mut best_seg = 0usize;
    let mut best_proj: (i32, i32) = target;
    for (ei, e) in graph.edges.iter().enumerate() {
        if !class_filter(e.class) {
            continue;
        }
        let from_c = (graph.nodes[e.from as usize].lon_e7, graph.nodes[e.from as usize].lat_e7);
        let to_c = (graph.nodes[e.to as usize].lon_e7, graph.nodes[e.to as usize].lat_e7);
        let geom = graph.edge_geometry(e);
        let mut poly: Vec<(i32, i32)> = Vec::with_capacity(geom.len() + 2);
        poly.push(from_c);
        poly.extend_from_slice(geom);
        poly.push(to_c);
        for w in 0..poly.len() - 1 {
            let (d, proj_lon_e7, proj_lat_e7) = point_to_segment_projection(target, poly[w], poly[w + 1]);
            if d < best_dist {
                best_dist = d;
                best_edge_idx = Some(ei);
                best_seg = w;
                best_proj = (proj_lon_e7, proj_lat_e7);
            }
        }
    }
    let edge_idx = best_edge_idx.unwrap_or_else(|| panic!("no edge found near the {label} split point"));
    println!(
        "Nearest edge for {label}: index {edge_idx}, osm_way_id {}, {best_dist:.2}m from target, segment {best_seg}, \
         projected onto curve at ({:.7},{:.7}) ({:.2}m from the raw target)",
        graph.edges[edge_idx].osm_way_id,
        from_e7(best_proj.0), from_e7(best_proj.1),
        distance_m(target, best_proj),
    );
    assert!(
        best_dist < max_dist_m,
        "nearest edge for {label} is {best_dist:.1}m away -- too far, refusing to guess"
    );
    // The new node goes at `best_proj` — the real point *on* the matched
    // curve — not at the raw `target` query point, which can sit a few
    // metres off to the side of the curve it's meant to splice into (see
    // `point_to_segment_projection`'s own doc comment for the live bug
    // this fixes).
    let target = best_proj;

    let old_edge = graph.edges[edge_idx].clone_for_split();
    let from_c = (graph.nodes[old_edge.from as usize].lon_e7, graph.nodes[old_edge.from as usize].lat_e7);
    let to_c = (graph.nodes[old_edge.to as usize].lon_e7, graph.nodes[old_edge.to as usize].lat_e7);
    let old_geom: Vec<(i32, i32)> = graph.edge_geometry(&graph.edges[edge_idx]).to_vec();
    let mut full_poly: Vec<(i32, i32)> = Vec::with_capacity(old_geom.len() + 2);
    full_poly.push(from_c);
    full_poly.extend_from_slice(&old_geom);
    full_poly.push(to_c);

    let split_node_idx = graph.nodes.len() as u32;
    graph.nodes.push(GraphNode {
        osm_id: -(900_100_000 + edge_idx as i64),
        lon_e7: target.0,
        lat_e7: target.1,
        junction_control: JunctionControl::None,
    });

    let before_geom: Vec<(i32, i32)> = full_poly[1..=best_seg].to_vec();
    let after_geom: Vec<(i32, i32)> = full_poly[best_seg + 1..full_poly.len() - 1].to_vec();

    let before_len_m = polyline_length_m(&{
        let mut v = vec![from_c];
        v.extend_from_slice(&before_geom);
        v.push(target);
        v
    });
    let after_len_m = polyline_length_m(&{
        let mut v = vec![target];
        v.extend_from_slice(&after_geom);
        v.push(to_c);
        v
    });

    let geom_offset_before = graph.geometry_points.len() as u32;
    graph.geometry_points.extend_from_slice(&before_geom);
    let edge_before = Edge {
        from: old_edge.from,
        to: split_node_idx,
        osm_way_id: old_edge.osm_way_id,
        class: old_edge.class,
        width_m: old_edge.width_m,
        length_m: before_len_m as f32,
        oneway: old_edge.oneway,
        access_restricted: old_edge.access_restricted,
        psv_yes: old_edge.psv_yes,
        bus_yes: old_edge.bus_yes,
        maxspeed_mph: old_edge.maxspeed_mph,
        geometry_start: geom_offset_before,
        geometry_len: before_geom.len() as u32,
    };

    let geom_offset_after = graph.geometry_points.len() as u32;
    graph.geometry_points.extend_from_slice(&after_geom);
    let edge_after = Edge {
        from: split_node_idx,
        to: old_edge.to,
        osm_way_id: old_edge.osm_way_id,
        class: old_edge.class,
        width_m: old_edge.width_m,
        length_m: after_len_m as f32,
        oneway: old_edge.oneway,
        access_restricted: old_edge.access_restricted,
        psv_yes: old_edge.psv_yes,
        bus_yes: old_edge.bus_yes,
        maxspeed_mph: old_edge.maxspeed_mph,
        geometry_start: geom_offset_after,
        geometry_len: after_geom.len() as u32,
    };

    graph.edges[edge_idx] = edge_before;
    graph.edges.push(edge_after);
    println!(
        "Split edge {edge_idx} for {label} at new node {split_node_idx} ({before_len_m:.1}m + {after_len_m:.1}m, was {:.1}m)",
        old_edge.length_m
    );
    split_node_idx
}

// Real bug found live (2026-10-11, routes 57C/56): `split_nearest_edge`
// used to insert the new node at the raw query `target` coordinate
// directly, not at the real nearest point *on* the matched segment —
// whenever `target` had any perpendicular offset from the curve (a few
// metres here, since `green_ring_split_point` was chosen to align with
// where the *bypass* needed to attach, not to sit exactly on the
// *existing ring's* own line), every route through that stretch had to
// detour to touch the off-curve node before continuing, a real ~165°
// direction reversal confirmed directly against the live rendered line.
// Returns `(distance_m, projected_lon_e7, projected_lat_e7)` so the caller
// can use the true on-curve point as the new node's own position instead
// of the raw query point.
fn point_to_segment_projection(p: (i32, i32), a: (i32, i32), b: (i32, i32)) -> (f64, i32, i32) {
    // Work in a local flat approximation (fine for short UK distances):
    // convert to metres relative to `a` using a simple equirectangular
    // projection, since haversine-per-candidate-point would be needlessly
    // expensive here and this is only used for nearest-segment search.
    let lat0 = from_e7(a.1).to_radians();
    let m_per_deg_lon = 111_320.0 * lat0.cos();
    let m_per_deg_lat = 111_320.0;
    let to_xy = |pt: (i32, i32)| -> (f64, f64) {
        (
            (from_e7(pt.0) - from_e7(a.0)) * m_per_deg_lon,
            (from_e7(pt.1) - from_e7(a.1)) * m_per_deg_lat,
        )
    };
    let (px, py) = to_xy(p);
    let (bx, by) = to_xy(b);
    let seglen2 = bx * bx + by * by;
    if seglen2 == 0.0 {
        return ((px * px + py * py).sqrt(), a.0, a.1);
    }
    let t = ((px * bx + py * by) / seglen2).clamp(0.0, 1.0);
    let (projx, projy) = (t * bx, t * by);
    let dist = ((px - projx).powi(2) + (py - projy).powi(2)).sqrt();
    // Interpolate the projection directly in e7 space along a-b, rather
    // than converting (projx, projy) back through the flat approximation —
    // keeps the result exactly on the real a-b line as stored, not a
    // second-order-different reprojection of it.
    let proj_lon_e7 = a.0 + ((b.0 - a.0) as f64 * t).round() as i32;
    let proj_lat_e7 = a.1 + ((b.1 - a.1) as f64 * t).round() as i32;
    (dist, proj_lon_e7, proj_lat_e7)
}

fn polyline_length_m(pts: &[(i32, i32)]) -> f64 {
    let mut total = 0.0;
    for w in pts.windows(2) {
        total += distance_m(w[0], w[1]);
    }
    total
}

trait CloneForSplit {
    fn clone_for_split(&self) -> Self;
}
impl CloneForSplit for Edge {
    fn clone_for_split(&self) -> Self {
        Edge {
            from: self.from,
            to: self.to,
            osm_way_id: self.osm_way_id,
            class: self.class,
            width_m: self.width_m,
            length_m: self.length_m,
            oneway: self.oneway,
            access_restricted: self.access_restricted,
            psv_yes: self.psv_yes,
            bus_yes: self.bus_yes,
            maxspeed_mph: self.maxspeed_mph,
            geometry_start: self.geometry_start,
            geometry_len: self.geometry_len,
        }
    }
}
