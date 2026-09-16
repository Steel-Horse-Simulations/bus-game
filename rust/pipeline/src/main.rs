mod boundary;
mod graph_build;
mod landuse;
mod railway;
mod road_avoidance;
mod road_graph;
mod stops;
mod venues;

use road_graph::HighwayClass;
use std::time::Instant;

fn main() {
    let rings = boundary::parse_poly(&boundary::boundary_path());
    eprintln!("Loaded extract boundary: {} ring(s)", rings.len());

    let pbf_path = match std::env::args().nth(1) {
        Some(p) => p,
        None => {
            eprintln!(
                "usage: pipeline <path-to-great-britain-latest.osm.pbf>\n\
                 (boundary self-check only ran; pass a .pbf path to clip and scan)"
            );
            return;
        }
    };

    let t0 = Instant::now();
    let node_pass = road_graph::collect_boundary_node_coords(&pbf_path, &rings);
    let nodes = node_pass.coords;
    eprintln!(
        "Pass 1: {} node(s) in boundary, {} point-mapped stop(s), {} bus station node(s), \
         {} POI node(s), {} venue node(s) ({:.1}s)",
        nodes.len(),
        node_pass.stops.len(),
        node_pass.bus_station_nodes.len(),
        node_pass.poi_nodes.len(),
        node_pass.venue_nodes.len(),
        t0.elapsed().as_secs_f64()
    );

    let t1 = Instant::now();
    let scan = road_graph::scan_ways_and_relations(&pbf_path, &nodes);
    eprintln!(
        "Pass 2: {} qualifying way(s), {} restriction relation(s), {} bus station way(s), \
         {} stop_area relation(s), {} landuse zone(s), {} POI way(s), {} venue way(s) ({:.1}s)",
        scan.ways.len(),
        scan.restrictions.len(),
        scan.bus_station_ways.len(),
        scan.stop_areas.len(),
        scan.landuse_zones.len(),
        scan.poi_ways.len(),
        scan.venue_ways.len(),
        t1.elapsed().as_secs_f64()
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

    let t2 = Instant::now();
    let report = graph_build::build_graph(
        &nodes,
        &scan.ways,
        &scan.node_ref_counts,
        &scan.restrictions,
    );
    eprintln!("Pass 3: built graph in {:.1}s", t2.elapsed().as_secs_f64());

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

    let pbf_dir = std::path::Path::new(&pbf_path)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));

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
    let mut nudged_off_road = 0usize;
    for s in &mut railway_stations {
        let original = (s.lon_e7, s.lat_e7);
        let adjusted =
            road_avoidance::keep_off_roads(original, &report.graph, RAILWAY_STATION_ROAD_CLEARANCE_M);
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
}
