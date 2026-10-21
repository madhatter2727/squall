const TITLE = {
  HU: "Hurricane",
  MH: "Major hurricane",
  TS: "Tropical storm",
  TD: "Tropical depression",
  STS: "Subtropical storm",
  STD: "Subtropical depression",
  PT: "Post-tropical cyclone",
  EX: "Extratropical cyclone",
  PC: "Potential cyclone",
  DB: "Disturbance",
  LO: "Low",
  WV: "Tropical wave",
  TY: "Typhoon",
};

const POINTS = [
  "north",
  "north-northeast",
  "northeast",
  "east-northeast",
  "east",
  "east-southeast",
  "southeast",
  "south-southeast",
  "south",
  "south-southwest",
  "southwest",
  "west-southwest",
  "west",
  "west-northwest",
  "northwest",
  "north-northwest",
];

function coord(storm, numericKey, rawKey) {
  const n = Number(storm?.[numericKey]);
  if (Number.isFinite(n)) return n;
  const raw = String(storm?.[rawKey] || "");
  const match = raw.match(/([0-9.]+)\s*([NSEW])?/i);
  if (!match) return NaN;
  const value = Number(match[1]);
  const hemi = (match[2] || "").toUpperCase();
  if (!Number.isFinite(value)) return NaN;
  return hemi === "S" || hemi === "W" ? -value : value;
}

export function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function compass(deg) {
  const n = ((Number(deg) % 360) + 360) % 360;
  if (!Number.isFinite(n)) return "";
  return POINTS[Math.round(n / 22.5) % 16];
}

function angleDelta(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function basinName(storm) {
  const tokens = `${storm?.id || ""} ${storm?.binNumber || ""}`.toLowerCase().split(/\s+/);
  const hit = (prefix) => tokens.some((token) => token.startsWith(prefix));
  if (hit("al")) return "Atlantic";
  if (hit("ep")) return "Eastern Pacific";
  if (hit("cp")) return "Central Pacific";
  return "";
}

export function hurricaneCategory(knots) {
  const k = Number(knots);
  if (!Number.isFinite(k) || k < 64) return null;
  if (k >= 137) return 5;
  if (k >= 113) return 4;
  if (k >= 96) return 3;
  if (k >= 83) return 2;
  return 1;
}

function windMph(knots) {
  const k = Number(knots);
  if (!Number.isFinite(k) || k <= 0) return null;
  return Math.round((k * 1.15078) / 5) * 5;
}

export function describeStorm(storm, place) {
  if (!storm) return null;
  const lat = coord(storm, "latitudeNumeric", "latitude");
  const lon = coord(storm, "longitudeNumeric", "longitude");
  const basin = basinName(storm);
  const cls = String(storm.classification || "").toUpperCase();
  const prefix = TITLE[cls] || "Storm";
  const name = storm.name ? String(storm.name) : "Unnamed";
  const title = `${prefix} ${name}`.replace(/\s+/g, " ").trim();
  const knots = Number(storm.intensity);
  const mph = windMph(knots);
  const cat = cls === "HU" || cls === "MH" || cls === "TY" ? hurricaneCategory(knots) : null;
  const placed = Number.isFinite(lat) && Number.isFinite(lon) && place;
  const miles = placed ? distanceMiles(place.lat, place.lon, lat, lon) : null;
  const dir = miles == null ? "" : compass(bearingDeg(place.lat, place.lon, lat, lon));
  const moveDir = Number(storm.movementDir);
  const moveSpd = Number(storm.movementSpeed);
  let move = "";
  if (Number.isFinite(moveSpd) && moveSpd <= 1) move = "Nearly stationary";
  else if (Number.isFinite(moveSpd) && Number.isFinite(moveDir)) {
    move = `Moving ${compass(moveDir)} at ${Math.round(moveSpd)} mph`;
  }
  const toward = placed ? bearingDeg(lat, lon, place.lat, place.lon) : null;
  const closing = toward == null || !Number.isFinite(moveDir) ? 180 : angleDelta(moveDir, toward);
  const threat =
    basin === "Atlantic" &&
    miles != null &&
    miles < 1600 &&
    (Number.isFinite(moveSpd) && moveSpd <= 1 ? miles < 400 : closing <= 40);
  const bits = [];
  if (cat) bits.push(`Category ${cat}`);
  if (basin) bits.push(basin);
  if (mph != null) bits.push(`${mph} mph sustained`);
  const pressure = Number(storm.pressure);
  if (Number.isFinite(pressure) && pressure > 0) bits.push(`${Math.round(pressure)} mb`);
  const where =
    miles == null ? "Position unavailable" : `${Math.round(miles).toLocaleString("en-US")} miles ${dir}`;
  return {
    id: String(storm.id || name),
    name,
    title,
    meta: bits.join(" · "),
    where,
    move,
    threat,
    basin,
    miles,
    atlantic: basin === "Atlantic",
  };
}
