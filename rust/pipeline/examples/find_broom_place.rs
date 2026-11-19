// Throwaway: find the real OSM way(s) named "Broom Place" near Portree
// Depot (lon=-6.2106972, lat=57.4202675) and dump their tags + node
// coordinates, to investigate a reported route-rendering spike near there.
//
// Two passes over the extract (osmpbf lets us call for_each more than once
// on separate ElementReader instances from the same path):
//   1. collect coords for every node within a bounding box around the
//      depot (generous, 0.05 deg ~ 5.5km), keyed by osm node id.
//   2. scan ways; for any whose `name` tag contains "Broom", print every
//      tag plus the resolved coordinates of its node refs (using the map
//      from pass 1 -- refs outside the bbox print as "no coord").
//
// Usage: cargo run --release --example find_broom_place -- <path-to.osm.pbf>

use osmpbf::{Element, ElementReader};
use std::collections::HashMap;

const DEPOT_LON: f64 = -6.2106972;
const DEPOT_LAT: f64 = 57.4202675;
const BBOX_DEG: f64 = 0.05;

fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "pipeline-data/great-britain-latest.osm.pbf".to_string());

    let min_lon = DEPOT_LON - BBOX_DEG;
    let max_lon = DEPOT_LON + BBOX_DEG;
    let min_lat = DEPOT_LAT - BBOX_DEG;
    let max_lat = DEPOT_LAT + BBOX_DEG;

    println!("Pass 1: collecting node coords in bbox [{min_lon},{min_lat}]..[{max_lon},{max_lat}]");
    let mut coords: HashMap<i64, (f64, f64)> = HashMap::new();
    {
        let reader = ElementReader::from_path(&path).unwrap_or_else(|e| panic!("open {path}: {e}"));
        reader
            .for_each(|element| match element {
                Element::Node(n) => {
                    let (lon, lat) = (n.lon(), n.lat());
                    if lon >= min_lon && lon <= max_lon && lat >= min_lat && lat <= max_lat {
                        coords.insert(n.id(), (lon, lat));
                    }
                }
                Element::DenseNode(n) => {
                    let (lon, lat) = (n.lon(), n.lat());
                    if lon >= min_lon && lon <= max_lon && lat >= min_lat && lat <= max_lat {
                        coords.insert(n.id(), (lon, lat));
                    }
                }
                _ => {}
            })
            .expect("pass 1 failed");
    }
    println!("Collected {} node coords in bbox", coords.len());

    println!("Pass 2: scanning ways for name containing 'Broom'");
    let reader = ElementReader::from_path(&path).unwrap_or_else(|e| panic!("open {path}: {e}"));
    let mut found = 0;
    reader
        .for_each(|element| {
            if let Element::Way(way) = element {
                let mut name: Option<String> = None;
                let mut tags: Vec<(String, String)> = Vec::new();
                for (k, v) in way.tags() {
                    tags.push((k.to_string(), v.to_string()));
                    if k == "name" {
                        name = Some(v.to_string());
                    }
                }
                if let Some(n) = &name {
                    if n.to_lowercase().contains("broom") {
                        let refs: Vec<i64> = way.refs().collect();
                        let any_in_bbox = refs.iter().any(|r| coords.contains_key(r));
                        if any_in_bbox {
                            found += 1;
                            println!("=== way id {} name={:?} (HAS BBOX COORD) ===", way.id(), n);
                            for (k, v) in &tags {
                                println!("  tag {k}={v}");
                            }
                            println!("  {} node refs", refs.len());
                            for r in &refs {
                                match coords.get(r) {
                                    Some((lon, lat)) => println!("    node {r}: {lon:.7},{lat:.7}"),
                                    None => println!("    node {r}: no coord (outside bbox or not seen)"),
                                }
                            }
                        }
                    }
                }
            }
        })
        .expect("pass 2 failed");
    println!("Found {found} way(s) with 'broom' in name");
}
