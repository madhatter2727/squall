export function zoneOr(timeZone) {
  const zone = timeZone || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
    return zone;
  } catch {
    return "America/New_York";
  }
}

function partsOf(input, timeZone) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneOr(timeZone),
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    hour: get("hour"),
    minute: get("minute"),
    ap: get("dayPeriod").toLowerCase(),
  };
}

export function formatWhen(input, timeZone) {
  const p = partsOf(input, timeZone);
  if (!p) return "";
  return `${p.weekday} · ${p.hour}:${p.minute} ${p.ap}`;
}

export function formatEt(input, timeZone) {
  return formatWhen(input, timeZone);
}

export function formatEtShort(input, timeZone) {
  const p = partsOf(input, timeZone);
  if (!p) return "";
  const mark = p.ap.startsWith("a") ? "a" : "p";
  return `${p.hour}:${p.minute}${mark}`;
}
