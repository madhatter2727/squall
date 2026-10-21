export const STALE_MS = 15 * 60 * 1000;

export function shouldRefresh(fetchedAt, now = Date.now()) {
  const t = typeof fetchedAt === "number" ? fetchedAt : Date.parse(fetchedAt || "");
  if (!Number.isFinite(t)) return true;
  return now - t >= STALE_MS;
}
