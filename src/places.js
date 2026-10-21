export const HOME = {
  id: "home",
  name: "Apopka",
  admin: "Florida",
  country: "United States",
  lat: 28.6934,
  lon: -81.5322,
  tz: "America/New_York",
};

const KEY = "squall.places.v1";

function finite(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

export function placeId(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function asPlace(raw) {
  const lat = finite(raw?.lat);
  const lon = finite(raw?.lon);
  const name = String(raw?.name || "").trim();
  if (lat == null || lon == null || !name) return null;
  return {
    id: raw.id === HOME.id ? HOME.id : String(raw.id || placeId(lat, lon)),
    name,
    admin: String(raw.admin || ""),
    country: String(raw.country || ""),
    lat,
    lon,
    tz: String(raw.tz || "auto"),
  };
}

export function loadPlaces() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(KEY) || "");
  } catch {
    parsed = null;
  }
  const places = [];
  const seen = new Set();
  for (const raw of Array.isArray(parsed?.places) ? parsed.places : []) {
    const place = asPlace(raw);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place.id === HOME.id ? { ...HOME } : place);
  }
  if (!seen.has(HOME.id)) places.unshift({ ...HOME });
  let activeId = String(parsed?.activeId || HOME.id);
  if (!places.some((place) => place.id === activeId)) activeId = HOME.id;
  return { places, activeId };
}

export function savePlaces(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ activeId: state.activeId, places: state.places })
    );
  } catch {
    /* private mode or a full disk */
  }
}

export function activePlace(state) {
  return state.places.find((place) => place.id === state.activeId) || state.places[0];
}

function fromGeocode(row) {
  const lat = finite(row?.latitude);
  const lon = finite(row?.longitude);
  const name = String(row?.name || "").trim();
  if (lat == null || lon == null || !name) return null;
  return {
    id: placeId(lat, lon),
    name,
    admin: String(row.admin1 || ""),
    country: String(row.country || ""),
    lat,
    lon,
    tz: String(row.timezone || "auto"),
    population: finite(row.population) || 0,
  };
}

export async function searchPlaces(query, signal) {
  const name = String(query || "").trim();
  if (name.length < 2) return [];
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const q = name.toLowerCase();
    const rows = (Array.isArray(data?.results) ? data.results : [])
      .map(fromGeocode)
      .filter(Boolean);
    rows.sort((a, b) => b.population - a.population);
    const named = rows.filter((row) => row.name.toLowerCase().includes(q));
    return (named.length ? named : rows).slice(0, 5);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function placeFromCoords(lat, lon) {
  const place = {
    id: placeId(lat, lon),
    name: "My location",
    admin: "",
    country: "",
    lat: Number(lat),
    lon: Number(lon),
    tz: "auto",
  };
  try {
    const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const res = await fetch(url);
    if (!res.ok) return place;
    const data = await res.json();
    const props = data?.features?.[0]?.properties || {};
    const name = props.city || props.locality || props.town || props.county || props.name;
    if (name) place.name = String(name);
    place.admin = String(props.state || "");
    place.country = String(props.country || "");
  } catch {
    /* coordinates still work without a name */
  }
  return place;
}

export function placeLine(place) {
  const admin = place.admin || "";
  const country = place.country && place.country !== "United States" ? place.country : "";
  return [admin, country].filter(Boolean).join(" · ");
}
