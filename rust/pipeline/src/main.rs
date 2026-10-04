mod boundary;
mod graph_build;
mod landuse;
mod railway;
mod road_avoidance;
mod road_graph;
mod settlements;
mod stops;
mod venues;

use boundary::Ring;
use road_graph::{HighwayClass, NodePassResult, ScanResult};
use std::time::Instant;

/// One input file plus the boundary it should be clipped to (empty = no
/// clip at all — see `boundary::point_in_boundary`'s own doc comment).
struct Source {
    label: &'static str,
    pbf_path: String,
    rings: Vec<Ring>,
}

/// UK-EXPANSION.md §1: the playable area expands to the whole UK plus the
/// Isle of Man, from three separate Geofabrik files rather than one —
/// `--full-uk` drops the GB extract's old Scotland-only clip entirely
/// (unclipped, the whole file), `--ireland <path>` adds Geofabrik's
/// combined "Ireland and Northern Ireland" extract **whole, unclipped —
/// the Republic of Ireland included too**, and `--iom <path>` adds the
/// Isle of Man's own self-contained file unclipped. None of the three
/// flags are required — with none passed, behaviour is unchanged from
/// before this feature existed (GB only, the original Scotland+border
/// clip), so existing dev/test invocations keep working exactly as
/// before.
///
/// A real direct instruction, not an oversight: an earlier version of
/// this clipped the Republic of Ireland out (Northern Ireland only, since
/// that's the actual UK-EXPANSION.md §1 scope), using a real simplified NI
/// boundary derived from OSM's own admin relation (id 156393, via
/// Nominatim's polygon_geojson, Ramer-Douglas-Peucker simplified to ~400
/// points) — but the user asked for the whole island included regardless:
/// "it will be a bit weird having it there but unusable" (Ireland sits
/// right next to Northern Ireland on a real map; NI's road network
/// stopping dead at the border with a blank landmass next to it would
/// look broken, worse than including real road data for a country the
/// game doesn't yet model any systems for). The NI-only boundary code was
/// removed rather than kept unused (CLAUDE.md: don't design for
/// hypothetical future requirements) — if a real need to separate
/// Ireland/NI later comes up (a nation-specific fare cap, currency), the
/// exact rebuild steps are in OPEN-ITEMS.md.
fn parse_sources(args: &[String]) -> Vec<Source> {
    let gb_path = args.first().unwrap_or_else(|| {
        eprintln!(
            "usage: pipeline <path-to-great-britain-latest.osm.pbf> [--full-uk] \
             [--ireland <path-to-ireland-and-northern-ireland-latest.osm.pbf>] \
             [--iom <path-to-isle-of-man-latest.osm.pbf>]\n\
             (boundary self-check only ran; pass a .pbf path to clip and scan)"
        );
        std::process::exit(0);
    });

    let full_uk = args.iter().any(|a| a == "--full-uk");
    let gb_rings = if full_uk {
        Vec::new()
    } else {
        boundary::parse_poly(&boundary::boundary_path())
    };
    let mut sources = vec![Source {
        label: if full_uk { "Great Britain (unclipped)" } else { "Great Britain (Scotland + border strip)" },
        pbf_path: gb_path.clone(),
        rings: gb_rings,
    }];

    if let Some(ireland_path) = args.iter().position(|a| a == "--ireland").and_then(|i| args.get(i + 1)) {
        sources.push(Source {
            label: "Ireland and Northern Ireland (unclipped, whole island)",
            pbf_path: ireland_path.clone(),
            rings: Vec::new(),
        });
    }
    if let Some(iom_path) = args.iter().position(|a| a == "--iom").and_then(|i| args.get(i + 1)) {
        sources.push(Source { label: "Isle of Man (unclipped)", pbf_path: iom_path.clone(), rings: Vec::new() });
    }

    sources
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let sources = parse_sources(&args);

    // Each source's own pass-1/2 data (up to hundreds of millions of node
    // coordinates for an unclipped GB) is built into that source's own
    // complete RoadGraph and then immediately dropped, one source at a
    // time — never held alongside another source's. A real full-UK
    // verification run was killed by the host running critically low on
    // memory before this fix, holding GB's raw ~232M nodes/5.2M ways and
    // Ireland/NI's raw ~10M nodes/269K ways at once; merging the much
    // smaller *built graphs* instead (graph_build::merge_road_graphs) is
    // what makes this fit. Everything genuinely small (stops, landuse,
    // venues, railway, settlements — thousands of entries, not hundreds of
    // millions) is still accumulated across every source the ordinary way.
    let t0 = Instant::now();
    let mut combined_stops: Vec<crate::stops::Stop> = Vec::new();
    let mut combined_bus_station_nodes: Vec<crate::stops::BusStation> = Vec::new();
    let mut combined_poi_nodes: Vec<crate::landuse::Poi> = Vec::new();
    let mut combined_venue_nodes: Vec<crate::venues::Venue> = Vec::new();
    let mut combined_railway_station_nodes: Vec<crate::railway::RailwayStation> = Vec::new();
    let mut combined_tram_stop_nodes: Vec<crate::railway::TramStop> = Vec::new();
    let mut combined_settlement_nodes: Vec<crate::settlements::Settlement> = Vec::new();
    let mut combined_bus_station_ways: Vec<crate::stops::BusStation> = Vec::new();
    let mut combined_stop_areas: Vec<crate::stops::StopArea> = Vec::new();
    let mut combined_landuse_zones: Vec<crate::landuse::LandUseZone> = Vec::new();
    let mut combined_poi_ways: Vec<crate::landuse::Poi> = Vec::new();
    let mut combined_venue_ways: Vec<crate::venues::Venue> = Vec::new();
    let mut combined_railway_station_ways: Vec<crate::railway::RailwayStation> = Vec::new();
    let mut combined_platform_ways: Vec<crate::railway::Platform> = Vec::new();
    let mut combined_way_stats = road_graph::WayStats::default();

    let mut node_count = 0usize;
    let mut way_count = 0usize;
    let mut restriction_relation_count = 0usize;
    let mut combined_graph: Option<game_data::RoadGraph> = None;
    let mut restrictions_seen = 0usize;
    let mut restrictions_resolved = 0usize;
    let mut restrictions_via_way_skipped = 0usize;
    let mut restrictions_missing_members = 0usize;
    let mut restrictions_unrecognized_kind = 0usize;
    let mut restrictions_via_not_in_graph = 0usize;
    let mut restrictions_edge_not_found = 0usize;
    let mut edges_with_gap = 0usize;

    for src in &sources {
        eprintln!("--- Source: {} ({}) ---", src.label, src.pbf_path);
        let np = road_graph::collect_boundary_node_coords(&src.pbf_path, &src.rings);
        eprintln!(
            "  pass 1: {} node(s) in boundary, {} point-mapped stop(s), {} bus station node(s), \
             {} POI node(s), {} venue node(s)",
            np.coords.len(),
            np.stops.len(),
            np.bus_station_nodes.len(),
            np.poi_nodes.len(),
            np.venue_nodes.len(),
        );
        let sc = road_graph::scan_ways_and_relations(&src.pbf_path, &np.coords);
        eprintln!(
            "  pass 2: {} qualifying way(s), {} restriction relation(s)",
            sc.ways.len(),
            sc.restrictions.len(),
        );

        node_count += np.coords.len();
        way_count += sc.ways.len();
        restriction_relation_count += sc.restrictions.len();
        combined_way_stats.merge(&sc.stats);

        let t_build = Instant::now();
        let report = graph_build::build_graph(&np.coords, &sc.ways, &sc.node_ref_counts, &sc.restrictions);
        eprintln!("  pass 3: built this source's own graph in {:.1}s", t_build.elapsed().as_secs_f64());
        restrictions_seen += report.restrictions_seen;
        restrictions_resolved += report.restrictions_resolved;
        restrictions_via_way_skipped += report.restrictions_via_way_skipped;
        restrictions_missing_members += report.restrictions_missing_members;
        restrictions_unrecognized_kind += report.restrictions_unrecognized_kind;
        restrictions_via_not_in_graph += report.restrictions_via_not_in_graph;
        restrictions_edge_not_found += report.restrictions_edge_not_found;
        edges_with_gap += report.edges_with_gap;
        match &mut combined_graph {
            None => combined_graph = Some(report.graph),
            Some(g) => graph_build::merge_road_graphs(g, report.graph),
        }
        // np/sc (and their own large coords/ways/node_ref_counts/
        // restrictions) drop here, at the end of this iteration — freed
        // before the next source's own pass 1 even starts.

        combined_stops.extend(np.stops);
        combined_bus_station_nodes.extend(np.bus_station_nodes);
        combined_poi_nodes.extend(np.poi_nodes);
        combined_venue_nodes.extend(np.venue_nodes);
        combined_railway_station_nodes.extend(np.railway_station_nodes);
        combined_tram_stop_nodes.extend(np.tram_stop_nodes);
        combined_settlement_nodes.extend(np.settlement_nodes);
        combined_bus_station_ways.extend(sc.bus_station_ways);
        combined_stop_areas.extend(sc.stop_areas);
        combined_landuse_zones.extend(sc.landuse_zones);
        combined_poi_ways.extend(sc.poi_ways);
        combined_venue_ways.extend(sc.venue_ways);
        combined_railway_station_ways.extend(sc.railway_station_ways);
        combined_platform_ways.extend(sc.platform_ways);
    }

    // Reassembled into the same shapes the rest of this file already
    // expects, so nothing downstream of this point needed to change.
    // `coords` is genuinely empty and never queried again — every source's
    // own real coordinates were already consumed into that source's own
    // graph above, and the combined graph itself carries every node this
    // build actually needs from here on.
    let node_pass = NodePassResult {
        coords: road_graph::NodeCoords::empty(),
        stops: combined_stops,
        bus_station_nodes: combined_bus_station_nodes,
        poi_nodes: combined_poi_nodes,
        venue_nodes: combined_venue_nodes,
        railway_station_nodes: combined_railway_station_nodes,
        tram_stop_nodes: combined_tram_stop_nodes,
        settlement_nodes: combined_settlement_nodes,
    };
    let scan = ScanResult {
        stats: combined_way_stats,
        ways: Vec::new(),
        restrictions: Vec::new(),
        node_ref_counts: std::collections::HashMap::new(),
        bus_station_ways: combined_bus_station_ways,
        stop_areas: combined_stop_areas,
        landuse_zones: combined_landuse_zones,
        poi_ways: combined_poi_ways,
        venue_ways: combined_venue_ways,
        railway_station_ways: combined_railway_station_ways,
        platform_ways: combined_platform_ways,
    };

    eprintln!(
        "\nCombined across {} source(s): {} node(s) in boundary, {} point-mapped stop(s), \
         {} bus station node(s), {} POI node(s), {} venue node(s) ({:.1}s)",
        sources.len(),
        node_count,
        node_pass.stops.len(),
        node_pass.bus_station_nodes.len(),
        node_pass.poi_nodes.len(),
        node_pass.venue_nodes.len(),
        t0.elapsed().as_secs_f64()
    );

    eprintln!(
        "Combined pass 2: {} qualifying way(s), {} restriction relation(s), {} bus station way(s), \
         {} stop_area relation(s), {} landuse zone(s), {} POI way(s), {} venue way(s) ({:.1}s total)",
        way_count,
        restriction_relation_count,
        scan.bus_station_ways.len(),
        scan.stop_areas.len(),
        scan.landuse_zones.len(),
        scan.poi_ways.len(),
        scan.venue_ways.len(),
        t0.elapsed().as_secs_f64()
    );

    let stats = &scan.stats;
    println!(
        "\n{} highway way(s) touch the extract boundary:",
        stats.total_matched
    );
    for class in HighwayClass::ALL {
        let count = stats.by_class[class as usize];
        if count > 0 {
            println!("  {:<15} {count}", class.label());
        }
    }
    println!();
    println!("  oneway (forward)   {}", stats.oneway_forward);
    println!("  oneway (reverse)   {}", stats.oneway_reverse);
    println!("  access=no/private  {}", stats.access_restricted);
    println!("  psv=yes            {}", stats.psv_yes);
    println!("  bus=yes            {}", stats.bus_yes);
    println!("  maxspeed present   {}", stats.maxspeed_present);

    let report = graph_build::BuildReport {
        graph: combined_graph.expect("parse_sources always returns at least the GB source"),
        restrictions_seen,
        restrictions_resolved,
        restrictions_via_way_skipped,
        restrictions_missing_members,
        restrictions_unrecognized_kind,
        restrictions_via_not_in_graph,
        restrictions_edge_not_found,
        edges_with_gap,
    };
    eprintln!("Pass 3 (combined across all sources) done in {:.1}s total", t0.elapsed().as_secs_f64());

    let total_length_km: f64 = report
        .graph
        .edges
        .iter()
        .map(|e| e.length_m as f64)
        .sum::<f64>()
        / 1000.0;

    println!("\nRoad graph:");
    println!("  junction nodes     {}", report.graph.nodes.len());
    println!("  edges              {}", report.graph.edges.len());
    println!("  total length       {total_length_km:.0} km");
    println!("  edges with a gap   {}", report.edges_with_gap);
    println!(
        "  restrictions       {} seen, {} resolved",
        report.restrictions_seen, report.restrictions_resolved
    );
    println!(
        "    via-way (skipped)      {}",
        report.restrictions_via_way_skipped
    );
    println!(
        "    missing member roles   {}",
        report.restrictions_missing_members
    );
    println!(
        "    unrecognized kind      {}",
        report.restrictions_unrecognized_kind
    );
    println!(
        "    via not a junction     {}",
        report.restrictions_via_not_in_graph
    );
    println!(
        "    from/to edge not found {}",
        report.restrictions_edge_not_found
    );

    // Output files land beside the GB source by default (sources[0],
    // always present — parse_sources guarantees it), same as always — or
    // in `--out-dir <dir>` if given, so a verification run of a much
    // bigger combined build (UK-EXPANSION.md §1) can be checked without
    // overwriting the live pipeline-data/*.bin the packaged game actually
    // reads, a real hard-to-reverse step worth its own explicit check.
    let out_dir_arg = args.iter().position(|a| a == "--out-dir").and_then(|i| args.get(i + 1));
    let default_dir = std::path::Path::new(&sources[0].pbf_path)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();
    let pbf_dir: &std::path::Path = out_dir_arg.map(std::path::Path::new).unwrap_or(&default_dir);
    std::fs::create_dir_all(pbf_dir).expect("failed to create --out-dir");

    let graph_path = pbf_dir.join("road_graph.bin").to_string_lossy().to_string();
    let graph_bytes =
        graph_build::save(&report.graph, &graph_path).expect("failed to save road graph");
    println!(
        "  saved              {graph_path} ({:.1} MB)",
        graph_bytes as f64 / 1_000_000.0
    );

    let mut bus_stations = node_pass.bus_station_nodes;
    bus_stations.extend(scan.bus_station_ways);
    let stop_count = node_pass.stops.len();
    let stop_data = stops::StopData {
        stops: node_pass.stops,
        bus_stations,
        stop_areas: scan.stop_areas,
    };

    // A relation's raw Node members include `stop_position` nodes as well as
    // the `bus_stop`/`platform` nodes we actually kept as `Stop` records —
    // an ordinary single stop routinely has both (standard PTv2 modeling),
    // which would make every plain stop look like a "2-member group" if
    // counted naively. Only count members that resolve to a real Stop.
    let stop_ids: std::collections::HashSet<i64> =
        stop_data.stops.iter().map(|s| s.osm_id).collect();
    let real_groupings = stop_data
        .stop_areas
        .iter()
        .filter(|a| {
            a.member_stop_osm_ids
                .iter()
                .filter(|id| stop_ids.contains(id))
                .count()
                > 1
        })
        .count();

    println!("\nStops:");
    println!("  stops              {stop_count}");
    println!("  bus stations       {}", stop_data.bus_stations.len());
    println!(
        "  stop_area relations {} ({} genuinely group 2+ extracted stops — the rest are \
         routine one-stop PTv2 relations pairing a stop_position with its platform)",
        stop_data.stop_areas.len(),
        real_groupings
    );

    let stops_path = pbf_dir.join("stops.bin").to_string_lossy().to_string();
    let stops_bytes = stops::save(&stop_data, &stops_path).expect("failed to save stop data");
    println!(
        "  saved              {stops_path} ({:.1} MB)",
        stops_bytes as f64 / 1_000_000.0
    );

    let mut pois = node_pass.poi_nodes;
    pois.extend(scan.poi_ways);
    let landuse_data = landuse::LandUseData {
        zones: scan.landuse_zones,
        pois,
    };

    let mut zone_counts = [0usize; 4];
    for z in &landuse_data.zones {
        zone_counts[z.category as usize] += 1;
    }
    let mut poi_counts = [0usize; 4];
    for p in &landuse_data.pois {
        poi_counts[p.category as usize] += 1;
    }
    let category_label = |i: usize| match i {
        0 => "housing",
        1 => "retail",
        2 => "schools",
        3 => "workplaces",
        _ => unreachable!(),
    };

    println!("\nLand use and POIs:");
    println!("  zones              {}", landuse_data.zones.len());
    for i in 0..4 {
        if zone_counts[i] > 0 {
            println!("    {:<11} {}", category_label(i), zone_counts[i]);
        }
    }
    println!("  POIs               {}", landuse_data.pois.len());
    for i in 0..4 {
        if poi_counts[i] > 0 {
            println!("    {:<11} {}", category_label(i), poi_counts[i]);
        }
    }

    let landuse_path = pbf_dir.join("landuse.bin").to_string_lossy().to_string();
    let landuse_bytes =
        landuse::save(&landuse_data, &landuse_path).expect("failed to save land use data");
    println!(
        "  saved              {landuse_path} ({:.1} MB)",
        landuse_bytes as f64 / 1_000_000.0
    );

    let mut venues = node_pass.venue_nodes;
    venues.extend(scan.venue_ways);
    let mut venue_counts = [0usize; 3];
    for v in &venues {
        venue_counts[v.kind as usize] += 1;
    }
    let venue_label = |i: usize| match i {
        0 => "stadiums",
        1 => "ferry terminals",
        2 => "park-and-ride",
        _ => unreachable!(),
    };
    let venue_data = venues::VenueData { venues };

    println!("\nVenues:");
    println!("  total              {}", venue_data.venues.len());
    for i in 0..3 {
        if venue_counts[i] > 0 {
            println!("    {:<16} {}", venue_label(i), venue_counts[i]);
        }
    }

    let venues_path = pbf_dir.join("venues.bin").to_string_lossy().to_string();
    let venues_bytes = venues::save(&venue_data, &venues_path).expect("failed to save venue data");
    println!(
        "  saved              {venues_path} ({:.1} MB)",
        venues_bytes as f64 / 1_000_000.0
    );

    // Point-mapped stations plus any mapped as a closed way (station
    // building/platform-area footprint) — see `railway.rs`'s module doc
    // comment.
    let mut railway_stations = node_pass.railway_station_nodes;
    railway_stations.extend(scan.railway_station_ways);
    let platforms = scan.platform_ways;

    // Recentre every station on the combined centroid of its own nearby
    // platforms where any are found — a station's real "middle" is its
    // platforms, not wherever its own point (or building footprint)
    // happens to sit. Radius wide enough to span a long station's full
    // platform spread, tight enough not to pull in a different nearby
    // station's platforms; worth revisiting if it looks wrong on a
    // particular station, the same as the other approximated figures in
    // this pipeline.
    const PLATFORM_SEARCH_RADIUS_M: f64 = 250.0;
    let mut recentred_on_platforms = 0usize;
    for s in &mut railway_stations {
        if let Some((lon_e7, lat_e7)) =
            railway::recentre_on_nearby_platforms((s.lon_e7, s.lat_e7), &platforms, PLATFORM_SEARCH_RADIUS_M)
        {
            recentred_on_platforms += 1;
            s.lon_e7 = lon_e7;
            s.lat_e7 = lat_e7;
        }
    }

    // A station's chosen position — from its platforms if any were found
    // nearby, otherwise its own point/building centroid — sometimes still
    // sits right on a road (Edinburgh Waverley's original OSM node is on
    // "South Ramp", its own access road) rather than clear space; nudge
    // those off the road network too, same clearance for every station.
    const RAILWAY_STATION_ROAD_CLEARANCE_M: f64 = 15.0;
    // Built once, reused for every station — checking every edge in the
    // whole graph per station (the original approach) was the actual
    // bottleneck in a real full-UK build once the graph itself stopped
    // being Scotland-sized (road_avoidance.rs's own doc comment has the
    // full story).
    let edge_grid = road_avoidance::build_edge_grid(&report.graph);
    let mut nudged_off_road = 0usize;
    for s in &mut railway_stations {
        let original = (s.lon_e7, s.lat_e7);
        let adjusted =
            road_avoidance::keep_off_roads(original, &report.graph, &edge_grid, RAILWAY_STATION_ROAD_CLEARANCE_M);
        if adjusted != original {
            nudged_off_road += 1;
            s.lon_e7 = adjusted.0;
            s.lat_e7 = adjusted.1;
        }
    }

    // Tram stops are frequently legitimately positioned right beside or in
    // the middle of a road (trams run in-street) — unlike a railway
    // station, "sitting on a road" isn't a data problem for these, so no
    // road-avoidance nudge; plain extracted positions.
    let tram_stops = node_pass.tram_stop_nodes;

    let platform_count = platforms.len();
    let tram_stop_count = tram_stops.len();
    let railway_data = game_data::RailwayData { stations: railway_stations, platforms, tram_stops };
    let mut railway_counts = [0usize; 3];
    for s in &railway_data.stations {
        railway_counts[s.kind as usize] += 1;
    }
    println!("\nRailway stations:");
    println!("  stations              {}", railway_counts[0]);
    println!("  halts                 {}", railway_counts[1]);
    println!("  subway stations       {}", railway_counts[2]);
    println!("  platforms             {platform_count}");
    println!("  tram stops            {tram_stop_count}");
    println!(
        "  recentred on platforms {recentred_on_platforms} (within {PLATFORM_SEARCH_RADIUS_M}m of one)"
    );
    println!(
        "  nudged off a road     {nudged_off_road} (within {RAILWAY_STATION_ROAD_CLEARANCE_M}m of one)"
    );

    let railway_path = pbf_dir.join("railway.bin").to_string_lossy().to_string();
    let railway_bytes =
        railway::save(&railway_data, &railway_path).expect("failed to save railway data");
    println!(
        "  saved              {railway_path} ({:.1} MB)",
        railway_bytes as f64 / 1_000_000.0
    );

    let settlement_data = settlements::SettlementData { settlements: node_pass.settlement_nodes };
    let mut settlement_counts = [0usize; 4];
    for s in &settlement_data.settlements {
        settlement_counts[s.rank as usize] += 1;
    }
    println!("\nSettlements:");
    println!("  cities             {}", settlement_counts[0]);
    println!("  towns              {}", settlement_counts[1]);
    println!("  villages           {}", settlement_counts[2]);
    println!("  hamlets            {}", settlement_counts[3]);

    let settlements_path = pbf_dir.join("settlements.bin").to_string_lossy().to_string();
    let settlements_bytes =
        settlements::save(&settlement_data, &settlements_path).expect("failed to save settlement data");
    println!(
        "  saved              {settlements_path} ({:.1} MB)",
        settlements_bytes as f64 / 1_000_000.0
    );
}
