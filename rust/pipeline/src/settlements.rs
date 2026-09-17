/// Data model for the "settlements" artefact — `place=city/town/village/
/// hamlet` nodes, used as the direction-rule fallback reference (DESIGN.md
/// §6: "On a route touching no bus station, the largest settlement in the
/// depot group is the reference, even if the route never reaches it")
/// until depot groups have a real stored location of their own (Phase 3
/// depot placement) — see route-draw.ts's own comment for how the
/// fallback actually picks one given that gap. Point-mapped only: `place=*`
/// is overwhelmingly tagged on a node in practice; a boundary-relation-
/// mapped settlement is a known, deliberate gap, not silently
/// mismodelled, same reasoning as `stops.rs`'s own scoping note.
///
/// Actual struct definitions live in `game_data` (shared with game-wasm,
/// which needs them to decode this artefact for the renderer) — re-
/// exported here so pipeline code can refer to them locally, same pattern
/// as `railway.rs`.
pub use game_data::{PlaceRank, Settlement, SettlementData};

pub fn save(data: &SettlementData, path: &str) -> std::io::Result<usize> {
    let bytes = game_data::encode_settlements(data);
    std::fs::write(path, &bytes)?;
    Ok(bytes.len())
}

pub(crate) fn classify_place_tag(value: &str) -> Option<PlaceRank> {
    match value {
        "city" => Some(PlaceRank::City),
        "town" => Some(PlaceRank::Town),
        "village" => Some(PlaceRank::Village),
        "hamlet" => Some(PlaceRank::Hamlet),
        _ => None,
    }
}

pub(crate) fn population_tag<'a>(tags: impl Iterator<Item = (&'a str, &'a str)>) -> Option<u32> {
    tags.into_iter().find(|(k, _)| *k == "population").and_then(|(_, v)| v.parse().ok())
}

pub(crate) fn name_tag<'a>(tags: impl Iterator<Item = (&'a str, &'a str)>) -> Option<String> {
    tags.into_iter().find(|(k, _)| *k == "name").map(|(_, v)| v.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_the_four_place_ranks() {
        assert_eq!(classify_place_tag("city"), Some(PlaceRank::City));
        assert_eq!(classify_place_tag("town"), Some(PlaceRank::Town));
        assert_eq!(classify_place_tag("village"), Some(PlaceRank::Village));
        assert_eq!(classify_place_tag("hamlet"), Some(PlaceRank::Hamlet));
    }

    #[test]
    fn unrelated_or_other_place_values_classify_as_none() {
        // `place=suburb`/`locality`/`island` etc. exist in real data but
        // aren't settlements this fallback should ever pick.
        assert_eq!(classify_place_tag("suburb"), None);
        assert_eq!(classify_place_tag("locality"), None);
        assert_eq!(classify_place_tag("island"), None);
    }

    #[test]
    fn city_outranks_town_outranks_village_outranks_hamlet() {
        assert!(PlaceRank::City < PlaceRank::Town);
        assert!(PlaceRank::Town < PlaceRank::Village);
        assert!(PlaceRank::Village < PlaceRank::Hamlet);
    }

    #[test]
    fn population_tag_parses_a_plain_integer() {
        assert_eq!(population_tag([("population", "54000")].into_iter()), Some(54000));
    }

    #[test]
    fn population_tag_is_none_when_absent_or_unparseable() {
        assert_eq!(population_tag(std::iter::empty()), None);
        assert_eq!(population_tag([("population", "about 5000")].into_iter()), None);
    }
}
