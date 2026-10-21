const KEY = "squall.pack.v1";

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function loadPack(id) {
  const row = readAll()[id];
  if (!row?.forecast || !row.fetchedAt) return null;
  return row;
}

export function savePack(id, pack) {
  const all = readAll();
  all[id] = {
    fetchedAt: pack.fetchedAt,
    forecast: pack.forecast,
    air: pack.air,
    tropics: pack.tropics,
    alerts: pack.alerts,
    radar: pack.radar,
  };
  const ids = Object.keys(all).sort(
    (a, b) => Date.parse(all[a]?.fetchedAt || 0) - Date.parse(all[b]?.fetchedAt || 0)
  );
  for (const old of ids.slice(0, Math.max(0, ids.length - 8))) delete all[old];
  const write = (body) => localStorage.setItem(KEY, JSON.stringify(body));
  try {
    write(all);
  } catch {
    try {
      if (all[id]) all[id].radar = { ok: false, v: null };
      write(all);
    } catch {
      /* keep the forecast on screen even if storage is full */
    }
  }
}
