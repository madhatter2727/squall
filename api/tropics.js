const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
const TTL_MS = 15 * 60 * 1000;

let cached = null;

function send(res, status, body, cacheControl) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}

export default async function handler(_req, res) {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) {
    send(res, 200, cached.body, "public, s-maxage=900, stale-while-revalidate=300");
    return;
  }

  try {
    const upstream = await fetch(NHC_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Squall/1.0 (weather app)",
      },
    });
    const body = await upstream.text();
    let data = null;
    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }
    if (!upstream.ok || !data || !Array.isArray(data.activeStorms)) {
      const fallback = JSON.stringify({ error: "NHC did not answer", activeStorms: [] });
      send(res, upstream.ok ? 502 : upstream.status, upstream.ok ? fallback : body || fallback, "public, s-maxage=60");
      return;
    }
    const json = JSON.stringify(data);
    cached = { at: now, body: json };
    send(res, 200, json, "public, s-maxage=900, stale-while-revalidate=300");
  } catch {
    send(res, 502, JSON.stringify({ error: "NHC unreachable", activeStorms: [] }), "public, s-maxage=30");
  }
}
