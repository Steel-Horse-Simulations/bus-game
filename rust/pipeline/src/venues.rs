/// Data model for the "stadiums, ferry terminals and park-and-ride sites"
/// artefact (CLAUDE.md data pipeline, step 3). Feeds event contracts
/// (DESIGN.md §10) — full ferry route/timetable modelling is Phase 9, not
/// this pass; here we only need the terminal's location.
#[derive(Clone, Copy, Debug, PartialEq, Eq, bincode::Encode, bincode::Decode)]
pub enum VenueKind {
    /// `leisure=stadium`
    Stadium,
    /// `amenity=ferry_terminal`
    FerryTerminal,
    /// `amenity=parking` + `park_ride=*` (any value other than `no`)
    ParkAndRide,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct Venue {
    pub osm_id: i64,
    pub kind: VenueKind,
    pub lon_e7: i32,
    pub lat_e7: i32,
    pub name: Option<String>,
}

#[derive(bincode::Encode, bincode::Decode)]
pub struct VenueData {
    pub venues: Vec<Venue>,
}

pub fn save(data: &VenueData, path: &str) -> std::io::Result<usize> {
    use std::io::Write;
    let config = bincode::config::standard();
    let bytes = bincode::encode_to_vec(data, config).expect("encode venue data");
    let mut file = std::fs::File::create(path)?;
    file.write_all(&bytes)?;
    Ok(bytes.len())
}

/// Priority where (rarely) more than one applies: stadium, then ferry
/// terminal, then park-and-ride.
pub(crate) fn classify_venue_tags<'a>(
    tags: impl Iterator<Item = (&'a str, &'a str)>,
) -> Option<VenueKind> {
    let mut is_stadium = false;
    let mut is_ferry_terminal = false;
    let mut is_park_ride = false;

    for (k, v) in tags {
        match (k, v) {
            ("leisure", "stadium") => is_stadium = true,
            ("amenity", "ferry_terminal") => is_ferry_terminal = true,
            ("park_ride", pr) if pr != "no" => is_park_ride = true,
            _ => {}
        }
    }

    if is_stadium {
        Some(VenueKind::Stadium)
    } else if is_ferry_terminal {
        Some(VenueKind::FerryTerminal)
    } else if is_park_ride {
        Some(VenueKind::ParkAndRide)
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
    fn classifies_stadium() {
        assert_eq!(
            classify_venue_tags([("leisure", "stadium")].into_iter()),
            Some(VenueKind::Stadium)
        );
    }

    #[test]
    fn classifies_ferry_terminal() {
        assert_eq!(
            classify_venue_tags([("amenity", "ferry_terminal")].into_iter()),
            Some(VenueKind::FerryTerminal)
        );
    }

    #[test]
    fn classifies_park_and_ride() {
        let tags = [("amenity", "parking"), ("park_ride", "yes")];
        assert_eq!(
            classify_venue_tags(tags.into_iter()),
            Some(VenueKind::ParkAndRide)
        );
    }

    #[test]
    fn park_ride_no_does_not_count() {
        let tags = [("amenity", "parking"), ("park_ride", "no")];
        assert_eq!(classify_venue_tags(tags.into_iter()), None);
    }

    #[test]
    fn stadium_wins_over_ferry_terminal() {
        let tags = [("amenity", "ferry_terminal"), ("leisure", "stadium")];
        assert_eq!(
            classify_venue_tags(tags.into_iter()),
            Some(VenueKind::Stadium)
        );
    }

    #[test]
    fn unrelated_tags_classify_as_none() {
        assert_eq!(
            classify_venue_tags([("amenity", "cafe")].into_iter()),
            None
        );
    }
}
