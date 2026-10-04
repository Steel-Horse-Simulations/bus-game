// TEMPORARY-ish layer (T62, OPEN-ITEMS.md). Two live user requests shaped
// this:
// 1. "place rough temporary locations/dots on the map and I can manually
//    add the correct locations and entrances/exits then once all done the
//    temporary parts including the way to place them can be removed" —
//    the original ask, when dealers still had to be placed one at a time.
// 2. "add all dealers exactly where there plus codes place them but make
//    the reference show on the map until I have added entrance and/or
//    exits" — superseded (1)'s manual-placement half: every dealer in
//    REFERENCE_PINS below is now seeded directly into the real `dealers`
//    table (`seedRealDealers`, idempotent — skipped if already present by
//    name) at its own precise decoded position, so there's no "place the
//    site" step left to do by hand at all. What's left is genuinely
//    manual and SHOULD stay that way: which real road a dealer's own
//    entrance/exit sits on needs a person looking at the map, not a
//    guess. The reference-pin layer is now a checklist for exactly that —
//    a pin stays visible for any seeded dealer with zero entrances yet,
//    and drops off the list the moment the player adds its first one
//    (`refreshReferencePinsData`, re-run on every toggle-show so it stays
//    current through a session). The Loughborough repaint/bodyshop entry
//    is not a dealer at all (UK-EXPANSION.md §2 says so explicitly) and
//    has no manufacturer the `dealers` table's own CHECK constraint
//    accepts, so it's never seeded and always stays on the list — a
//    future T63 (repaint shops) concern, not this one's.
//
// Every dot sits at the real Plus Code position UK-EXPANSION.md §2 gives
// for that dealer, not a rough town-centre approximation — a live user
// correction after an earlier version used town-centre settlement lookups
// for 64 of 66 entries. Decoded with a from-scratch Open Location Code
// decoder (no local package available; Nominatim doesn't resolve Plus
// Codes either, confirmed by trying it directly) — each short code's
// missing leading digits are recovered using that dealer's already-known
// settlement-town coordinate (whole-UK settlements.bin, T55) as the
// reference point, exactly the recoverNearest algorithm the real Open
// Location Code spec defines. Validated before trusting it on the real
// data: decoding Castleford's own Plus Code independently landed 1.8km
// from its already-verified real town centre, well within the town —
// then every one of the other 67 codes decoded to within 0.4-12.3km of
// its own reference town (industrial-estate-from-town-centre distances,
// not the ~100km+ a decode bug would produce), checked directly rather
// than assumed correct.
//
// DELETE THIS WHOLE FILE (and its mount call in main.ts, and the toggle
// button it creates) once every seeded dealer has at least one entrance
// — `seedRealDealers` itself can go at the same time, its job done.
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";

const emptyGeojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface ReferencePin {
  manufacturer: string;
  label: string;
  plusCode: string;
  lon: number;
  lat: number;
}

const MANUFACTURER_COLORS: Record<string, string> = {
  volvo: "#1d4ed8",
  adl: "#15803d",
  western_commercial: "#a16207",
  wrightbus: "#b91c1c",
  yutong: "#be185d",
  repaint: "#64748b",
};

const REFERENCE_PINS: ReferencePin[] = [
  { manufacturer: "yutong", label: "Pelican Bus and Coach", plusCode: "PJCC+3X", lon: -1.377622, lat: 53.720128 },
  { manufacturer: "wrightbus", label: "Wrightbus HQ", plusCode: "VM4F+RF", lon: -6.326372, lat: 54.857003 },
  // Real-world data supplied directly by the user (2026-10-02) — decoded
  // the same validated way as everything else (2.75km drift from
  // Falkirk's own town centre, well within the plausible real-site range
  // every other entry in this file landed in). OPERATIONS.md's own
  // "1 location, near Falkirk" description, now with an exact position.
  { manufacturer: "adl", label: "Alexander Dennis", plusCode: "254F+F2", lon: -3.827497, lat: 56.006128 },
  // Real-world data supplied directly by the user (2026-10-02), all 4 of
  // OPERATIONS.md's own "4 locations: Dundee, Edinburgh (Broxburn),
  // Bellshill, Glasgow" now with exact positions — same validated decoder,
  // each landing 1.4-5.5km from its own town reference, consistent with
  // every other entry in this file.
  { manufacturer: "western_commercial", label: "Western Commercial (Glasgow)", plusCode: "VM4Q+J8", lon: -4.311747, lat: 55.856503 },
  { manufacturer: "western_commercial", label: "Western Commercial (Broxburn)", plusCode: "WHR2+86", lon: -3.449497, lat: 55.940753 },
  { manufacturer: "western_commercial", label: "Western Commercial (Bellshill)", plusCode: "RXH4+58", lon: -4.044247, lat: 55.827878 },
  { manufacturer: "western_commercial", label: "Western Commercial (Dundee)", plusCode: "F4M5+PW", lon: -2.890247, lat: 56.484253 },
  { manufacturer: "volvo", label: "Inverness", plusCode: "FQRJ+H3", lon: -4.219872, lat: 57.491378 },
  { manufacturer: "volvo", label: "Aberdeen", plusCode: "3V89+J9", lon: -2.131622, lat: 57.066503 },
  { manufacturer: "volvo", label: "Perth", plusCode: "CG8C+4Q", lon: -3.478122, lat: 56.415253 },
  { manufacturer: "volvo", label: "Edinburgh/Broxburn", plusCode: "WGPV+WF", lon: -3.456372, lat: 55.937253 },
  { manufacturer: "volvo", label: "Glasgow", plusCode: "VJ5X+6P", lon: -4.350747, lat: 55.858003 },
  { manufacturer: "volvo", label: "Glasgow East/Hamilton", plusCode: "QWRG+98", lon: -4.074247, lat: 55.790878 },
  { manufacturer: "volvo", label: "Ayr", plusCode: "FCQC+FM", lon: -4.578372, lat: 55.488628 },
  { manufacturer: "volvo", label: "Carlisle", plusCode: "W2FW+X9", lon: -2.954122, lat: 54.924878 },
  { manufacturer: "volvo", label: "Newcastle-upon-Tyne (Washington)", plusCode: "VCXV+J3", lon: -1.557372, lat: 54.899003 },
  { manufacturer: "volvo", label: "Stockton-on-Tees", plusCode: "HPHG+7Q", lon: -1.273122, lat: 54.578128 },
  { manufacturer: "volvo", label: "York (Roecliffe)", plusCode: "3HQQ+PG", lon: -1.411247, lat: 54.089253 },
  { manufacturer: "volvo", label: "Batley", plusCode: "P9Q3+MP", lon: -1.645747, lat: 53.739128 },
  { manufacturer: "volvo", label: "Castleford", plusCode: "PJ82+9P", lon: -1.398247, lat: 53.715878 },
  { manufacturer: "volvo", label: "Pontefract", plusCode: "JP2C+PP", lon: -1.278247, lat: 53.601753 },
  { manufacturer: "volvo", label: "Rotherham", plusCode: "CJ4R+V9", lon: -1.359122, lat: 53.407128 },
  { manufacturer: "volvo", label: "Leicester (Coalville)", plusCode: "MMX8+Q2", lon: -1.334997, lat: 52.699378 },
  { manufacturer: "volvo", label: "Wellingborough", plusCode: "8746+22", lon: -0.739997, lat: 52.305003 },
  { manufacturer: "volvo", label: "Cambridge (Ely)", plusCode: "96QH+2J", lon: 0.229003, lat: 52.387503 },
  { manufacturer: "volvo", label: "Milton Keynes (Bedford)", plusCode: "3GQJ+WF", lon: -0.468872, lat: 52.089753 },
  { manufacturer: "volvo", label: "Banbury", plusCode: "2PP4+HJ", lon: -1.293497, lat: 52.036378 },
  { manufacturer: "volvo", label: "London North (Enfield)", plusCode: "MX3C+GQ", lon: -0.028122, lat: 51.653753 },
  { manufacturer: "volvo", label: "London East (Grays)", plusCode: "F7JC+VW", lon: 0.272253, lat: 51.482128 },
  { manufacturer: "volvo", label: "London South (Croydon)", plusCode: "9VJC+98", lon: -0.129247, lat: 51.380878 },
  { manufacturer: "volvo", label: "Reading", plusCode: "C2FF+2R", lon: -0.975497, lat: 51.422503 },
  { manufacturer: "volvo", label: "London West (Hayes)", plusCode: "GH2R+6W", lon: -0.407747, lat: 51.500503 },
  { manufacturer: "volvo", label: "Lincoln (North Hykeham)", plusCode: "5CV4+FG", lon: -0.593747, lat: 53.193628 },
  { manufacturer: "volvo", label: "Nottingham", plusCode: "VQ3H+H8", lon: -1.221747, lat: 52.853878 },
  { manufacturer: "volvo", label: "Walsall", plusCode: "HXMH+2M", lon: -2.020872, lat: 52.582503 },
  { manufacturer: "volvo", label: "Rugby", plusCode: "9PRR+H3", lon: -1.259872, lat: 52.391378 },
  { manufacturer: "volvo", label: "Coventry", plusCode: "9G9J+C9", lon: -1.469122, lat: 52.368503 },
  { manufacturer: "volvo", label: "Warwick", plusCode: "7CV2+43", lon: -1.599872, lat: 52.292753 },
  { manufacturer: "volvo", label: "Peterborough", plusCode: "GPWX+R9", lon: -0.251622, lat: 52.547003 },
  { manufacturer: "volvo", label: "Swindon", plusCode: "H6JR+H5", lon: -1.759622, lat: 51.581378 },
  { manufacturer: "volvo", label: "Witham", plusCode: "RJ3X+F7", lon: 0.648128, lat: 51.803628 },
  { manufacturer: "volvo", label: "Aylesford", plusCode: "8F3V+27", lon: 0.493128, lat: 51.302503 },
  { manufacturer: "volvo", label: "Hythe", plusCode: "32J6+XV", lon: 1.012128, lat: 51.082378 },
  { manufacturer: "volvo", label: "Burgess Hill", plusCode: "XV34+86", lon: -0.144497, lat: 50.953253 },
  { manufacturer: "volvo", label: "Southampton", plusCode: "WGJG+28", lon: -1.474247, lat: 50.930003 },
  { manufacturer: "volvo", label: "Exeter", plusCode: "PH5P+RG", lon: -3.413747, lat: 50.709503 },
  { manufacturer: "volvo", label: "Plymouth", plusCode: "CV8C+C7", lon: -4.129372, lat: 50.416003 },
  { manufacturer: "volvo", label: "Saint Austell", plusCode: "C5CC+QF", lon: -4.828872, lat: 50.421878 },
  { manufacturer: "volvo", label: "Redruth", plusCode: "6QPG+W4", lon: -5.224747, lat: 50.237253 },
  { manufacturer: "volvo", label: "Bridgwater", plusCode: "5226+PR", lon: -2.987997, lat: 51.151753 },
  { manufacturer: "volvo", label: "Bristol", plusCode: "G8HP+RW", lon: -2.662747, lat: 51.529503 },
  { manufacturer: "volvo", label: "Newport", plusCode: "H392+Q6", lon: -2.949497, lat: 51.569378 },
  { manufacturer: "volvo", label: "Swansea (Winch Wen)", plusCode: "M33W+7V", lon: -3.902872, lat: 51.653128 },
  { manufacturer: "volvo", label: "Frome", plusCode: "5HRC+FP", lon: -2.428247, lat: 51.191128 },
  { manufacturer: "volvo", label: "Gloucester", plusCode: "RPQM+9V", lon: -2.265372, lat: 51.838378 },
  { manufacturer: "volvo", label: "Evesham", plusCode: "33C8+WH", lon: -1.933622, lat: 52.072253 },
  { manufacturer: "volvo", label: "Hull", plusCode: "PPXV+66", lon: -0.256997, lat: 53.748003 },
  { manufacturer: "volvo", label: "Birmingham East", plusCode: "G59W+W7", lon: -1.804372, lat: 52.519753 },
  { manufacturer: "volvo", label: "Birmingham West (Kingswinford)", plusCode: "GV34+HJ", lon: -2.143497, lat: 52.503878 },
  { manufacturer: "volvo", label: "Alfreton", plusCode: "3JMM+65", lon: -1.367122, lat: 53.083003 },
  { manufacturer: "volvo", label: "Newcastle (second point)", plusCode: "2QW2+FJ", lon: -2.248497, lat: 53.046128 },
  { manufacturer: "volvo", label: "Deeside", plusCode: "6XHM+MR", lon: -3.015497, lat: 53.229128 },
  { manufacturer: "volvo", label: "Manchester", plusCode: "FM8P+GC", lon: -2.313997, lat: 53.466253 },
  { manufacturer: "volvo", label: "Liverpool", plusCode: "F4MR+GP", lon: -2.858247, lat: 53.483753 },
  { manufacturer: "volvo", label: "Chorley", plusCode: "M82V+97", lon: -2.656872, lat: 53.650878 },
  { manufacturer: "volvo", label: "Bury Saint Edmunds", plusCode: "5JPC+CC", lon: 0.621003, lat: 52.186003 },
  { manufacturer: "volvo", label: "Ipswich", plusCode: "26H4+H7", lon: 1.205628, lat: 52.028878 },
  { manufacturer: "volvo", label: "Thetford", plusCode: "CPFX+58", lon: 0.748253, lat: 52.422878 },
  { manufacturer: "volvo", label: "Norwich", plusCode: "J7V6+JJ", lon: 1.261503, lat: 52.644003 },
  { manufacturer: "volvo", label: "Ballyclare", plusCode: "P2X4+FW", lon: -5.992747, lat: 54.748628 },
  { manufacturer: "volvo", label: "Dungannon", plusCode: "F7M7+G7", lon: -6.736872, lat: 54.483753 },
  { manufacturer: "volvo", label: "Coleraine", plusCode: "48VV+2V", lon: -6.655372, lat: 55.142503 },
  { manufacturer: "volvo", label: "Newry", plusCode: "5JGR+W9", lon: -6.359122, lat: 54.177253 },
  { manufacturer: "repaint", label: "Loughborough repaint/bodyshop", plusCode: "QQHG+HR", lon: -1.222997, lat: 52.778878 },
];

// Seeds every real dealer in REFERENCE_PINS directly into the `dealers`
// table at its own precise decoded position — idempotent (matched by
// name, so safe to call on every launch; a second run creates nothing
// new). Skips "repaint" entries (Loughborough), which aren't a dealer at
// all and have no manufacturer the table's own CHECK constraint accepts.
// No entrances are created here — which real road a dealer's own
// entrance/exit sits on needs a person looking at the map, not a guess.
export async function seedRealDealers(): Promise<void> {
  const existing = await window.dealers.list();
  const existingNames = new Set(existing.map((d) => d.name));
  for (const pin of REFERENCE_PINS) {
    if (pin.manufacturer === "repaint" || existingNames.has(pin.label)) continue;
    await window.dealers.create(pin.label, pin.manufacturer as DealerManufacturer, pin.lon, pin.lat, []);
  }
}

export async function mountDealerReferencePins(map: maplibregl.Map): Promise<void> {
  map.addSource("dealer-reference-pins", { type: "geojson", data: emptyGeojson });
  map.addLayer({
    id: "dealer-reference-pins-points",
    type: "circle",
    source: "dealer-reference-pins",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": 7,
      "circle-color": [
        "match",
        ["get", "manufacturer"],
        "volvo",
        MANUFACTURER_COLORS.volvo,
        "adl",
        MANUFACTURER_COLORS.adl,
        "western_commercial",
        MANUFACTURER_COLORS.western_commercial,
        "wrightbus",
        MANUFACTURER_COLORS.wrightbus,
        "yutong",
        MANUFACTURER_COLORS.yutong,
        MANUFACTURER_COLORS.repaint,
      ],
      "circle-opacity": 0.55,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": 0.8,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "dealer-reference-pins-labels",
    type: "symbol",
    source: "dealer-reference-pins",
    layout: {
      visibility: "none",
      "text-field": ["concat", "~ ", ["get", "label"]],
      "text-size": 11,
      "text-offset": [0, 1.2],
      "text-allow-overlap": false,
    },
    paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 },
  });

  // Shows a pin only for a dealer that still has zero entrances — re-run
  // every time the layer is shown so it reflects entrances added earlier
  // in the same session (a live user request: "make the reference show
  // on the map until I have added entrance and/or exits").
  const refreshReferencePinsData = async (): Promise<void> => {
    const dealers = await window.dealers.list();
    const entrances = await window.dealers.listAllEntrances();
    const entranceCountByDealerId = new Map<number, number>();
    for (const e of entrances) entranceCountByDealerId.set(e.dealerId, (entranceCountByDealerId.get(e.dealerId) ?? 0) + 1);
    const dealerByName = new Map(dealers.map((d) => [d.name, d]));
    const features: GeoJSON.Feature[] = REFERENCE_PINS.filter((p) => {
      if (p.manufacturer === "repaint") return true; // no matching dealer concept yet (T63)
      const dealer = dealerByName.get(p.label);
      return !dealer || (entranceCountByDealerId.get(dealer.id) ?? 0) === 0;
    }).map((p) => ({
      type: "Feature",
      properties: { manufacturer: p.manufacturer, label: p.label, plusCode: p.plusCode },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    }));
    (map.getSource("dealer-reference-pins") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });
  };

  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Show dealers needing entrances";
  toggle.title = "Dealers already placed at their own real Plus Code position but with no entrance/exit added yet — a pin disappears once you add its first one";
  toggle.style.position = "absolute";
  toggle.style.bottom = "8px";
  toggle.style.left = "800px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  let visible = false;
  toggle.addEventListener("click", () => {
    visible = !visible;
    toggle.classList.toggle("is-active", visible);
    const visibility = visible ? "visible" : "none";
    map.setLayoutProperty("dealer-reference-pins-points", "visibility", visibility);
    map.setLayoutProperty("dealer-reference-pins-labels", "visibility", visibility);
    if (visible) void refreshReferencePinsData();
  });

  map.on("click", "dealer-reference-pins-points", (e) => {
    const feature = e.features?.[0];
    const label = feature?.properties?.label as string | undefined;
    const manufacturer = feature?.properties?.manufacturer as string | undefined;
    const plusCode = feature?.properties?.plusCode as string | undefined;
    if (!label) return;
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div style="min-width:160px"><div style="font-weight:600">${label}</div><div style="color:var(--text-muted)">${manufacturer} — ${plusCode}</div></div>`,
      )
      .addTo(map);
  });
  map.on("mouseenter", "dealer-reference-pins-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "dealer-reference-pins-points", () => {
    map.getCanvas().style.cursor = "";
  });
}
