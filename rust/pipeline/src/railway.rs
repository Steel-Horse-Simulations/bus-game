/// Data model for the "railway stations and platforms" artefact (CLAUDE.md
/// data pipeline, step 3) — lines already render from the existing vector
/// tiles. Station extraction happens inline in `road_graph.rs`'s existing
/// node pass (points) and way-scan pass (station buildings/areas), same
/// reasoning as `stops.rs` and `venues.rs`. Platforms are way-only (a
/// platform edge or area always has real shape; a bare point wouldn't be
/// this module's "full physical shape" choice), extracted in the way-scan
/// pass alongside bus station/venue/POI ways.
pub use game_data::{Platform, RailwayData, RailwayStation, RailwayStationKind, TramStop};

pub fn save(data: &RailwayData, path: &str) -> std::io::Result<usize> {
    let bytes = game_data::encode_railway(data);
    std::fs::write(path, &bytes)?;
    Ok(bytes.len())
}

/// Classifies a node's tags as a railway station/halt/subway station.
/// Point-mapped only — see the module doc comment. `station=subway`
/// (OSM's own documented convention for distinguishing a metro/underground
/// station from a National Rail one, both under the same `railway=station`
/// primary tag) overrides `Station`/`Halt` to `Subway` — checked in one
/// pass over the tags since a station's own kind and its `station=*`
/// sub-tag can appear in either order.
pub(crate) fn classify_railway_station_tags<'a>(
    tags: impl Iterator<Item = (&'a str, &'a str)>,
) -> Option<RailwayStationKind> {
    let mut railway_kind = None;
    let mut is_subway = false;
    for (k, v) in tags {
        match (k, v) {
            ("railway", "station") => railway_kind = Some(RailwayStationKind::Station),
            ("railway", "halt") => railway_kind = Some(RailwayStationKind::Halt),
            ("station", "subway") => is_subway = true,
            _ => {}
        }
    }
    if is_subway && railway_kind.is_some() {
        Some(RailwayStationKind::Subway)
    } else {
        railway_kind
    }
}

/// Whether a way is tagged as a railway platform — checked on the way's
/// own tags directly (not via this function) since the caller already
/// walks every tag once for its other classifications; kept here as a
/// single source of truth for the tag value itself.
pub(crate) fn is_platform_tag(key: &str, value: &str) -> bool {
    key == "railway" && value == "platform"
}

/// A tram stop — `railway=tram_stop`, a wholly separate primary tag from
/// `railway=station` (see the module doc comment on `TramStop`).
pub(crate) fn is_tram_stop_tag(key: &str, value: &str) -> bool {
    key == "railway" && value == "tram_stop"
}

fn haversine_m(a: (i32, i32), b: (i32, i32)) -> f64 {
    const EARTH_RADIUS_M: f64 = 6_371_000.0;
    let (lon1, lat1) = (a.0 as f64 * 1e-7, a.1 as f64 * 1e-7);
    let (lon2, lat2) = (b.0 as f64 * 1e-7, b.1 as f64 * 1e-7);
    let (lat1r, lat2r) = (lat1.to_radians(), lat2.to_radians());
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let h = (dlat / 2.0).sin().powi(2) + lat1r.cos() * lat2r.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * h.sqrt().asin()
}

/// A station's real "middle" is the centroid of its own platforms, not
/// wherever its own point (or building footprint) happens to sit — this
/// is the reason platforms were extracted with full shape at all. Finds
/// every platform with at least one point within `radius_m` of `station`
/// (not just the platform's own centroid — a long platform could have its
/// centroid outside radius while its near end is well inside) and returns
/// the centroid of every point across all of them combined. `None` when
/// no platform is found nearby, leaving the caller's existing position
/// (way-centroid, or the plain point) untouched.
pub fn recentre_on_nearby_platforms(
    station: (i32, i32),
    platforms: &[Platform],
    radius_m: f64,
) -> Option<(i32, i32)> {
    let mut sum_lon: i64 = 0;
    let mut sum_lat: i64 = 0;
    let mut n: i64 = 0;
    for platform in platforms {
        let near = platform.geometry.iter().any(|&p| haversine_m(station, p) <= radius_m);
        if !near {
            continue;
        }
        for &(lon_e7, lat_e7) in &platform.geometry {
            sum_lon += lon_e7 as i64;
            sum_lat += lat_e7 as i64;
            n += 1;
        }
    }
    if n == 0 {
        None
    } else {
        Some(((sum_lon / n) as i32, (sum_lat / n) as i32))
    }
}

pub(crate) fn name_tag<'a>(tags: impl Iterator<Item = (&'a str, &'a str)>) -> Option<String> {
    tags.into_iter()
        .find(|(k, _)| *k == "name")
        .map(|(_, v)| v.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_station() {
        assert_eq!(
            classify_railway_station_tags([("railway", "station")].into_iter()),
            Some(RailwayStationKind::Station)
        );
    }

    #[test]
    fn classifies_halt() {
        assert_eq!(
            classify_railway_station_tags([("railway", "halt")].into_iter()),
            Some(RailwayStationKind::Halt)
        );
    }

    #[test]
    fn unrelated_or_other_railway_tags_classify_as_none() {
        assert_eq!(classify_railway_station_tags([("railway", "rail")].into_iter()), None);
        assert_eq!(classify_railway_station_tags([("amenity", "cafe")].into_iter()), None);
        assert_eq!(classify_railway_station_tags(std::iter::empty()), None);
    }

    #[test]
    fn recognises_platform_tag_only() {
        assert!(is_platform_tag("railway", "platform"));
        assert!(!is_platform_tag("railway", "station"));
        assert!(!is_platform_tag("public_transport", "platform"));
    }

    #[test]
    fn recognises_tram_stop_tag_only() {
        assert!(is_tram_stop_tag("railway", "tram_stop"));
        assert!(!is_tram_stop_tag("railway", "station"));
        assert!(!is_tram_stop_tag("railway", "halt"));
    }

    #[test]
    fn station_with_subway_subtag_classifies_as_subway() {
        assert_eq!(
            classify_railway_station_tags([("railway", "station"), ("station", "subway")].into_iter()),
            Some(RailwayStationKind::Subway)
        );
        // Order shouldn't matter.
        assert_eq!(
            classify_railway_station_tags([("station", "subway"), ("railway", "station")].into_iter()),
            Some(RailwayStationKind::Subway)
        );
    }

    #[test]
    fn station_without_subway_subtag_stays_plain_station() {
        assert_eq!(
            classify_railway_station_tags([("railway", "station")].into_iter()),
            Some(RailwayStationKind::Station)
        );
    }

    #[test]
    fn subway_subtag_alone_with_no_railway_station_tag_classifies_as_none() {
        // station=subway with no railway=station/halt at all isn't a real
        // station node (e.g. it might appear on an unrelated feature) —
        // the sub-tag alone shouldn't manufacture a station out of nothing.
        assert_eq!(classify_railway_station_tags([("station", "subway")].into_iter()), None);
    }

    // Edinburgh-ish coordinates. One degree of longitude at this latitude
    // is ~63.5km, so 0.001 deg lon is ~63.5m and 0.001 deg lat is ~111m —
    // rough figures used just to place test points a known rough distance
    // apart, not for the assertions themselves (those check exact centroid
    // arithmetic and near/far inclusion, not particular metre values).
    fn e7(deg: f64) -> i32 {
        (deg * 1e7).round() as i32
    }

    #[test]
    fn recentres_on_the_combined_centroid_of_every_nearby_platform() {
        let station = (e7(-3.1900), e7(55.9520));
        // Two platforms close to the station, forming a simple symmetric
        // shape so the combined centroid is easy to hand-verify.
        let platform_a = Platform {
            osm_id: 1,
            geometry: vec![(e7(-3.1910), e7(55.9520)), (e7(-3.1908), e7(55.9520))],
        };
        let platform_b = Platform {
            osm_id: 2,
            geometry: vec![(e7(-3.1892), e7(55.9520)), (e7(-3.1890), e7(55.9520))],
        };
        let platforms = vec![platform_a, platform_b];

        let result = recentre_on_nearby_platforms(station, &platforms, 250.0);
        assert!(result.is_some(), "expected both platforms to be found within radius");
        let (lon_e7, lat_e7) = result.unwrap();
        // Mean of the four longitudes above, exactly.
        let expected_lon = (e7(-3.1910) as i64 + e7(-3.1908) as i64 + e7(-3.1892) as i64 + e7(-3.1890) as i64) / 4;
        assert_eq!(lon_e7 as i64, expected_lon);
        assert_eq!(lat_e7, e7(55.9520));
    }

    #[test]
    fn a_distant_platform_is_excluded_even_if_others_are_close() {
        let station = (e7(-3.1900), e7(55.9520));
        let near = Platform { osm_id: 1, geometry: vec![(e7(-3.1901), e7(55.9520))] };
        // Roughly 3km east — well outside any sane search radius.
        let far = Platform { osm_id: 2, geometry: vec![(e7(-3.14), e7(55.9520))] };
        let platforms = vec![near, far];

        let result = recentre_on_nearby_platforms(station, &platforms, 250.0).unwrap();
        assert_eq!(result, (e7(-3.1901), e7(55.9520)), "only the near platform's own point should count");
    }

    #[test]
    fn no_nearby_platform_returns_none() {
        let station = (e7(-3.1900), e7(55.9520));
        let far = Platform { osm_id: 1, geometry: vec![(e7(-3.14), e7(55.9520))] };
        assert_eq!(recentre_on_nearby_platforms(station, &[far], 250.0), None);
    }

    #[test]
    fn a_platform_counts_if_any_one_point_is_within_radius_even_if_its_own_centroid_is_not() {
        // A long platform stretching from right next to the station out to
        // ~1km away — its own centroid would be ~500m out (outside a 250m
        // radius), but its near end is well inside.
        let station = (e7(-3.1900), e7(55.9520));
        let long_platform = Platform {
            osm_id: 1,
            geometry: vec![(e7(-3.1901), e7(55.9520)), (e7(-3.18), e7(55.9520))],
        };
        let result = recentre_on_nearby_platforms(station, &[long_platform], 250.0);
        assert!(result.is_some(), "a platform with any point inside the radius should count, not just its own centroid");
    }
}
