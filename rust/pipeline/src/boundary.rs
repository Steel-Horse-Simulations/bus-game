use std::path::{Path, PathBuf};

/// A single outer ring from an Osmosis .poly file, as (lon, lat) pairs.
pub struct Ring {
    points: Vec<(f64, f64)>,
}

/// Parses an Osmosis polygon filter file (the format Geofabrik publishes its
/// extract boundaries in). Every numbered section is treated as an outer
/// ring; the boundary is the union of all rings. `!`-prefixed (hole) sections
/// are not needed for our extract and are rejected rather than silently
/// mishandled.
pub fn parse_poly(path: &Path) -> Vec<Ring> {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read boundary file {path:?}: {e}"));
    let mut lines = text.lines();
    lines.next(); // polygon file name, unused

    let mut rings = Vec::new();
    let mut current: Option<Vec<(f64, f64)>> = None;

    for raw_line in lines {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if line == "END" {
            if let Some(points) = current.take() {
                rings.push(Ring { points });
            }
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        match parts.as_slice() {
            [section] => {
                assert!(
                    !section.starts_with('!'),
                    "hole sections are not supported in {path:?}"
                );
                current = Some(Vec::new());
            }
            [lon, lat] => {
                let lon: f64 = lon.parse().expect("longitude");
                let lat: f64 = lat.parse().expect("latitude");
                current
                    .as_mut()
                    .expect("coordinate line before ring header")
                    .push((lon, lat));
            }
            _ => panic!("unexpected line in {path:?}: {raw_line:?}"),
        }
    }

    assert!(!rings.is_empty(), "no rings found in {path:?}");
    rings
}

/// Ray-casting point-in-polygon test against a single ring.
fn point_in_ring(lon: f64, lat: f64, ring: &[(f64, f64)]) -> bool {
    let mut inside = false;
    let n = ring.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = ring[i];
        let (xj, yj) = ring[j];
        if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// A point is in the extract area if it falls inside any ring — the boundary
/// is the union of Scotland's real border/coastline plus the hand-drawn
/// Carlisle/Berwick corridor.
pub fn point_in_boundary(lon: f64, lat: f64, rings: &[Ring]) -> bool {
    rings.iter().any(|ring| point_in_ring(lon, lat, &ring.points))
}

pub fn boundary_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("data/extract-boundary.poly")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rings() -> Vec<Ring> {
        parse_poly(&boundary_path())
    }

    // (name, lon, lat, expected inside the extract boundary)
    const CASES: &[(&str, f64, f64, bool)] = &[
        ("Edinburgh", -3.1883, 55.9533, true),
        ("Dumfries", -3.6172, 55.0705, true),
        ("Carlisle", -2.9382, 54.8951, true),
        ("Berwick-upon-Tweed", -1.9994, 55.7710, true),
        ("Newcastle upon Tyne", -1.6178, 54.9783, false),
        ("Manchester", -2.2426, 53.4808, false),
        ("Isle of Man (Douglas)", -4.4816, 54.1509, false),
    ];

    #[test]
    fn boundary_classifies_reference_towns_correctly() {
        let rings = rings();
        let mut failures = Vec::new();
        for &(name, lon, lat, expected) in CASES {
            let actual = point_in_boundary(lon, lat, &rings);
            if actual != expected {
                failures.push(format!(
                    "{name}: expected inside={expected}, got inside={actual}"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
