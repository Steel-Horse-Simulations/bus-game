/// Data model for the "land use and POI demand points" artefact (CLAUDE.md
/// data pipeline, step 3). Feeds DESIGN.md §2's demand model in Phase 4 —
/// this pass only classifies and extracts raw geometry, it doesn't compute
/// any demand figures.
///
/// **Scope agreed 2026-09-03**: landuse zone polygons (centroid only, not
/// full footprints) plus selected POI points, not individual building
/// extraction — Scotland+border likely has millions of buildings, and
/// Phase 1 only needs classified geometry for Phase 4 to consume later.
/// Multipolygon-relation land use/POIs are a known, documented gap, same as
/// the equivalent simplification in `stops.rs`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum DemandCategory {
    Housing,
    Retail,
    Schools,
    Workplaces,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct LandUseZone {
    pub osm_id: i64,
    pub category: DemandCategory,
    pub centroid_lon_e7: i32,
    pub centroid_lat_e7: i32,
    pub name: Option<String>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct Poi {
    pub osm_id: i64,
    pub category: DemandCategory,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct LandUseData {
    pub zones: Vec<LandUseZone>,
    pub pois: Vec<Poi>,
}

pub fn save(data: &LandUseData, path: &str) -> std::io::Result<usize> {
    use std::io::Write;
    let config = bincode::config::standard();
    let bytes = bincode::encode_to_vec(data, config).expect("encode land use data");
    let mut file = std::fs::File::create(path)?;
    file.write_all(&bytes)?;
    Ok(bytes.len())
}

/// `landuse=*` zone classification — agreed 2026-09-03: residential is
/// housing, retail is retail, industrial and commercial are both workplaces.
pub(crate) fn classify_zone_tags<'a>(
    tags: impl Iterator<Item = (&'a str, &'a str)>,
) -> Option<DemandCategory> {
    for (k, v) in tags {
        if k == "landuse" {
            return match v {
                "residential" => Some(DemandCategory::Housing),
                "retail" => Some(DemandCategory::Retail),
                "industrial" | "commercial" => Some(DemandCategory::Workplaces),
                _ => None,
            };
        }
    }
    None
}

/// POI classification, agreed 2026-09-03. Priority where a POI is (rarely)
/// tagged as more than one kind at once: schools first (most specific and
/// important), then retail, then workplaces, then the housing-adjacent
/// `nursing_home` case.
pub(crate) fn classify_poi_tags<'a>(
    tags: impl Iterator<Item = (&'a str, &'a str)>,
) -> Option<DemandCategory> {
    let mut is_school = false;
    let mut is_shop = false;
    let mut is_marketplace = false;
    let mut is_office = false;
    let mut is_hospital = false;
    let mut is_nursing_home = false;

    for (k, v) in tags {
        match (k, v) {
            ("amenity", "school" | "college" | "university" | "kindergarten") => {
                is_school = true
            }
            ("shop", _) => is_shop = true,
            ("amenity", "marketplace") => is_marketplace = true,
            ("office", _) => is_office = true,
            ("amenity", "hospital") => is_hospital = true,
            ("amenity", "nursing_home") => is_nursing_home = true,
            _ => {}
        }
    }

    if is_school {
        Some(DemandCategory::Schools)
    } else if is_shop || is_marketplace {
        Some(DemandCategory::Retail)
    } else if is_office || is_hospital {
        Some(DemandCategory::Workplaces)
    } else if is_nursing_home {
        Some(DemandCategory::Housing)
    } else {
        None
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
    fn zone_classifies_the_four_landuse_values() {
        assert_eq!(
            classify_zone_tags([("landuse", "residential")].into_iter()),
            Some(DemandCategory::Housing)
        );
        assert_eq!(
            classify_zone_tags([("landuse", "retail")].into_iter()),
            Some(DemandCategory::Retail)
        );
        assert_eq!(
            classify_zone_tags([("landuse", "industrial")].into_iter()),
            Some(DemandCategory::Workplaces)
        );
        assert_eq!(
            classify_zone_tags([("landuse", "commercial")].into_iter()),
            Some(DemandCategory::Workplaces)
        );
    }

    #[test]
    fn zone_ignores_unrecognized_landuse_values() {
        assert_eq!(
            classify_zone_tags([("landuse", "forest")].into_iter()),
            None
        );
    }

    #[test]
    fn poi_classifies_schools_shops_offices_and_hospitals() {
        assert_eq!(
            classify_poi_tags([("amenity", "school")].into_iter()),
            Some(DemandCategory::Schools)
        );
        assert_eq!(
            classify_poi_tags([("amenity", "university")].into_iter()),
            Some(DemandCategory::Schools)
        );
        assert_eq!(
            classify_poi_tags([("shop", "supermarket")].into_iter()),
            Some(DemandCategory::Retail)
        );
        assert_eq!(
            classify_poi_tags([("amenity", "marketplace")].into_iter()),
            Some(DemandCategory::Retail)
        );
        assert_eq!(
            classify_poi_tags([("office", "company")].into_iter()),
            Some(DemandCategory::Workplaces)
        );
        assert_eq!(
            classify_poi_tags([("amenity", "hospital")].into_iter()),
            Some(DemandCategory::Workplaces)
        );
        assert_eq!(
            classify_poi_tags([("amenity", "nursing_home")].into_iter()),
            Some(DemandCategory::Housing)
        );
    }

    #[test]
    fn poi_school_tag_wins_over_shop_tag() {
        let tags = [("shop", "books"), ("amenity", "school")];
        assert_eq!(
            classify_poi_tags(tags.into_iter()),
            Some(DemandCategory::Schools)
        );
    }

    #[test]
    fn poi_unrelated_tags_classify_as_none() {
        assert_eq!(
            classify_poi_tags([("leisure", "park")].into_iter()),
            None
        );
    }
}
