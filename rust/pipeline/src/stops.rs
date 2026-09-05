/// Data model for the "stops, stations and stand data" and
/// "`public_transport=stop_area` groupings" artefacts (CLAUDE.md data
/// pipeline, step 3). Extraction happens inline in `road_graph.rs`'s
/// existing two passes rather than a dedicated third file read — pass 1
/// already visits every node, and pass 2 already visits every way and
/// relation, so classifying tags there is nearly free.
///
/// **Scope of this pass**: point-mapped stops only (the overwhelming UK
/// convention for bus stops). Way- or relation-mapped platforms, and
/// bus stations mapped as multipolygon relations, are a known gap —
/// documented, not silently mismodelled, and left for a follow-up.
///
/// The struct definitions themselves live in `game_data` — shared with the
/// WASM reader so the two can never drift apart, same as `road_graph.rs`.
pub use game_data::{BusStation, Stop, StopArea, StopData, StopKind};

pub fn save(data: &StopData, path: &str) -> std::io::Result<usize> {
    let bytes = game_data::encode_stops(data);
    std::fs::write(path, &bytes)?;
    Ok(bytes.len())
}

pub(crate) enum NodeClassification {
    Stop(StopKind),
    BusStation,
    None,
}

/// Classifies a node's tags. Priority order where a node is (mis)tagged as
/// more than one thing at once: `amenity=bus_station` wins over
/// `highway=bus_stop`/`public_transport=platform`, since a station is the
/// more specific and more valuable classification to keep.
pub(crate) fn classify_node_tags<'a>(
    tags: impl Iterator<Item = (&'a str, &'a str)>,
) -> NodeClassification {
    let mut is_bus_stop = false;
    let mut is_platform = false;
    let mut is_bus_station = false;
    for (k, v) in tags {
        match (k, v) {
            ("highway", "bus_stop") => is_bus_stop = true,
            ("public_transport", "platform") => is_platform = true,
            ("amenity", "bus_station") => is_bus_station = true,
            _ => {}
        }
    }
    if is_bus_station {
        NodeClassification::BusStation
    } else if is_bus_stop {
        NodeClassification::Stop(StopKind::BusStop)
    } else if is_platform {
        NodeClassification::Stop(StopKind::Platform)
    } else {
        NodeClassification::None
    }
}

pub(crate) fn name_tag<'a>(tags: impl Iterator<Item = (&'a str, &'a str)>) -> Option<String> {
    tags.into_iter()
        .find(|(k, _)| *k == "name")
        .map(|(_, v)| v.to_string())
}

pub(crate) fn is_stop_area_relation<'a>(tags: impl Iterator<Item = (&'a str, &'a str)>) -> bool {
    tags.into_iter()
        .any(|(k, v)| k == "public_transport" && v == "stop_area")
}

/// Centroid of a closed way's resolved nodes — good enough for a bus
/// station's map position. Nodes outside the extract boundary (so with no
/// known coordinate) are simply excluded from the average; `None` only if
/// every node was outside it. Takes a lookup closure rather than a concrete
/// map so callers can pass `NodeCoords::get` directly.
pub(crate) fn way_centroid_e7(
    refs: &[i64],
    coord_of: impl Fn(i64) -> Option<(i32, i32)>,
) -> Option<(i32, i32)> {
    let mut sum_lon = 0i64;
    let mut sum_lat = 0i64;
    let mut n = 0i64;
    for &id in refs {
        if let Some((lon, lat)) = coord_of(id) {
            sum_lon += lon as i64;
            sum_lat += lat as i64;
            n += 1;
        }
    }
    if n == 0 {
        return None;
    }
    Some(((sum_lon / n) as i32, (sum_lat / n) as i32))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_bus_stop() {
        let tags = [("highway", "bus_stop"), ("name", "Main Street")];
        assert!(matches!(
            classify_node_tags(tags.into_iter()),
            NodeClassification::Stop(StopKind::BusStop)
        ));
    }

    #[test]
    fn classifies_platform() {
        let tags = [("public_transport", "platform")];
        assert!(matches!(
            classify_node_tags(tags.into_iter()),
            NodeClassification::Stop(StopKind::Platform)
        ));
    }

    #[test]
    fn classifies_bus_station() {
        let tags = [("amenity", "bus_station"), ("name", "St Andrew Square")];
        assert!(matches!(
            classify_node_tags(tags.into_iter()),
            NodeClassification::BusStation
        ));
    }

    #[test]
    fn bus_station_tag_wins_over_bus_stop_tag() {
        let tags = [("amenity", "bus_station"), ("highway", "bus_stop")];
        assert!(matches!(
            classify_node_tags(tags.into_iter()),
            NodeClassification::BusStation
        ));
    }

    #[test]
    fn unrelated_tags_classify_as_none() {
        let tags = [("shop", "supermarket")];
        assert!(matches!(
            classify_node_tags(tags.into_iter()),
            NodeClassification::None
        ));
    }

    #[test]
    fn way_centroid_averages_known_coordinates_and_skips_unknown() {
        let coords = std::collections::HashMap::from([(1i64, (0, 0)), (2, (10, 10))]);
        // node 3 deliberately missing — outside the extract boundary
        let refs = [1, 2, 3];
        assert_eq!(
            way_centroid_e7(&refs, |id| coords.get(&id).copied()),
            Some((5, 5))
        );
    }

    #[test]
    fn way_centroid_is_none_when_nothing_resolves() {
        assert_eq!(way_centroid_e7(&[1, 2], |_| None), None);
    }
}
