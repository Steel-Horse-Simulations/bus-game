/// Data model for the ferry-route-geometry artefact (`ferry_routes.bin`) —
/// genuinely new pipeline work (2026-10-31), separate from `venues.rs`'s
/// existing ferry *terminal* point extraction (Phase 1, CLAUDE.md data
/// pipeline step 3). A real sailing line's exact distance is needed for
/// fare/timing calculations (T107/T108, OPEN-ITEMS.md — per-mile ferry
/// tickets, long-distance through-fares) and that distance can't be read
/// back out of the rendered MapLibre vector tiles reliably — this project
/// already learned that the hard way (T65, OPEN-ITEMS.md:
/// `querySourceFeatures` returns zoom-simplified geometry, not the real
/// data) — so this extracts the real OSM-sourced geometry directly, the
/// same architectural reasoning as `railway.rs`'s own platform shapes.
///
/// Scope, a real simplification flagged rather than silently assumed: this
/// only picks up a ferry route mapped as a single way carrying `route=ferry`
/// directly — the near-universal real-world OSM convention for an
/// individual crossing, and the same tag OpenMapTiles itself reads to
/// render the `class=ferry` line in `basemap-style.json`'s new paint rule.
/// A `type=route` + `route=ferry` *relation* grouping several way segments
/// into one longer route is a separate, rarer tagging pattern this pass
/// does not follow: ways are read before relations in this pipeline's pass
/// order (`road_graph.rs::scan_ways_and_relations`'s own doc comment), but
/// a relation's member way ids aren't known until the relation itself is
/// reached, so resolving one would need either a second file read or
/// speculatively keeping every way's geometry in memory — not done here.
/// Worth a follow-up if a real UK crossing turns out to need it.
pub use game_data::{FerryRoute, FerryRouteData};

pub fn save(data: &FerryRouteData, path: &str) -> std::io::Result<usize> {
    let bytes = game_data::encode_ferry_routes(data);
    std::fs::write(path, &bytes)?;
    Ok(bytes.len())
}

/// Whether a way is tagged as a ferry route — checked on the way's own tags
/// directly by the caller (same convention as `railway::is_platform_tag`),
/// kept here as the single source of truth for the tag value itself.
pub(crate) fn is_ferry_route_tag(key: &str, value: &str) -> bool {
    key == "route" && value == "ferry"
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

/// Real distance along a sailing line — the sum of each consecutive
/// point-to-point haversine leg, not a single straight-line endpoint
/// distance, since a real ferry route is rarely a perfectly straight line
/// (threading between islands, round a headland, avoiding shallows).
pub(crate) fn route_distance_m(geometry: &[(i32, i32)]) -> f64 {
    geometry.windows(2).map(|w| haversine_m(w[0], w[1])).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_ferry_route_tag() {
        assert!(is_ferry_route_tag("route", "ferry"));
        assert!(!is_ferry_route_tag("route", "bus"));
        assert!(!is_ferry_route_tag("highway", "ferry"));
    }

    #[test]
    fn distance_of_a_single_leg_is_plain_haversine() {
        // 0.01 degrees of latitude, using this module's own EARTH_RADIUS_M
        // (6,371,000m, the mean-radius spherical approximation this
        // codebase uses throughout — e.g. railway.rs's identical
        // haversine_m) rather than WGS84's equatorial radius, which gives
        // a close but different figure (~1113.2m) that would be the wrong
        // reference here: 2*pi*6,371,000/360 * 0.01 = 1111.95m.
        let a = (0, 0);
        let b = (0, 100_000); // 0.01 deg north, lon unchanged
        let d = route_distance_m(&[a, b]);
        assert!((d - 1111.95).abs() < 0.5, "expected ~1111.95m, got {d}m");
    }

    #[test]
    fn distance_sums_multiple_legs_not_just_endpoints() {
        let a = (0, 0);
        let b = (0, 100_000);
        let c = (0, 200_000);
        let endpoint_only = haversine_m(a, c);
        let summed = route_distance_m(&[a, b, c]);
        // A straight run north: summed should equal the endpoint distance
        // almost exactly (same direction, no detour) — this proves summing
        // legs works correctly for the simple case; a genuinely bent route
        // is exercised by the real pipeline spot-check against Ardrossan–
        // Brodick once real data is extracted, not faked here.
        assert!((summed - endpoint_only).abs() < 1.0, "summed {summed} vs endpoint {endpoint_only}");
    }

    #[test]
    fn a_bent_route_sums_to_more_than_its_straight_line_distance() {
        let a = (0, 0);
        let b = (100_000, 0); // east
        let c = (100_000, 100_000); // then north — an L-shape, not a line
        let straight_line = haversine_m(a, c);
        let summed = route_distance_m(&[a, b, c]);
        assert!(summed > straight_line, "an L-shaped route ({summed}m) must be longer than its straight-line distance ({straight_line}m)");
    }
}
