const LABELS = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorms",
  96: "Thunderstorms",
  99: "Thunderstorms",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function conditionLabel(code) {
  return LABELS[code] || "Unknown conditions";
}

export function clock(iso) {
  const h = Number(iso.slice(11, 13));
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}

export function shortHour(iso) {
  const h = Number(iso.slice(11, 13));
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
}

export function formatStamp(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const hh = Number(iso.slice(11, 13));
  const mm = iso.slice(14, 16);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  const ap = hh >= 12 ? "pm" : "am";
  const h12 = hh % 12 || 12;
  return `${dow} · ${h12}:${mm} ${ap}`;
}

function minutes(iso) {
  if (!iso || iso.length < 16) return NaN;
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

export function phaseFrom(nowIso, sunriseIso, sunsetIso, isDay) {
  const n = minutes(nowIso);
  const rise = minutes(sunriseIso);
  const set = minutes(sunsetIso);
  if (Number.isFinite(rise) && n >= rise - 40 && n < rise + 50) return "dawn";
  if (Number.isFinite(set) && n >= set - 50 && n < set + 40) return "dusk";
  if (Number.isFinite(rise) && Number.isFinite(set) && n >= rise && n < set) return "day";
  if (Number.isFinite(rise) || Number.isFinite(set)) return "night";
  return isDay ? "day" : "night";
}

export function kindFrom(code, cloud) {
  if (code >= 95) return "storm";
  if (
    (code >= 51 && code <= 67) ||
    (code >= 71 && code <= 77) ||
    (code >= 80 && code <= 86)
  ) {
    return "rain";
  }
  if (code === 45 || code === 48) return "fog";
  if (code === 3 || cloud >= 85) return "overcast";
  if (code === 2 || cloud >= 45) return "cloud";
  return "clear";
}

function maybe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function sliceHours(data, count = 24) {
  const hourly = data.hourly || {};
  const time = hourly.time || [];
  const key = String(data.current?.time || "").slice(0, 13);
  let idx = time.findIndex((t) => t.slice(0, 13) === key);
  if (idx < 0) idx = 0;
  const out = [];
  const limit = count == null ? time.length : count;
  for (let i = idx; i < time.length && out.length < limit; i++) {
    const temp = maybe(hourly.temperature_2m?.[i]);
    const feels = maybe(hourly.apparent_temperature?.[i]);
    out.push({
      iso: time[i],
      pop: num(hourly.precipitation_probability?.[i]),
      precip: num(hourly.precipitation?.[i]),
      code: num(hourly.weather_code?.[i]),
      temp: temp ?? 0,
      feels: feels ?? temp ?? 0,
      hum: maybe(hourly.relative_humidity_2m?.[i]),
      dew: maybe(hourly.dew_point_2m?.[i]),
      wind: num(hourly.wind_speed_10m?.[i]),
      gust: num(hourly.wind_gusts_10m?.[i]),
      cloud: num(hourly.cloud_cover?.[i]),
      cape: num(hourly.cape?.[i]),
      day: num(hourly.is_day?.[i]),
    });
  }
  return out;
}

export function sliceMinutes(data, count = 8) {
  const m = data.minutely_15;
  if (!m?.time?.length) return [];
  const now = String(data.current?.time || "");
  let idx = m.time.findIndex((t) => t >= now);
  if (idx < 0) idx = Math.max(0, m.time.length - count);
  const out = [];
  for (let i = idx; i < m.time.length && out.length < count; i++) {
    out.push({
      iso: m.time[i],
      pop: num(m.precipitation_probability?.[i]),
      precip: num(m.precipitation?.[i]),
      temp: maybe(m.temperature_2m?.[i]) ?? 0,
      code: num(m.weather_code?.[i]),
      cape: num(m.cape?.[i]),
    });
  }
  return out;
}

function isWet(h) {
  return h.code >= 95 || h.pop >= 55 || h.precip >= 0.05;
}

export function blocksOf(hours) {
  const blocks = [];
  for (let i = 0; i < hours.length; i += 3) {
    const slice = hours.slice(i, i + 3);
    if (!slice.length) break;
    const pop = Math.round(Math.max(...slice.map((h) => h.pop)));
    blocks.push({
      pop,
      label: i === 0 ? "Now" : shortHour(slice[0].iso),
    });
  }
  return blocks;
}

export function peakLine(hours) {
  if (!hours.length) return "Rain chance unavailable";
  let best = hours[0];
  for (const h of hours) if (h.pop > best.pop) best = h;
  const pop = Math.round(best.pop);
  if (pop <= 0) return "No rain expected";
  if (best.iso.slice(0, 13) === hours[0].iso.slice(0, 13)) return `Peak ${pop}% this hour`;
  return `Peak ${pop}% at ${clock(best.iso)}`;
}

export function headline(hours, ctx = {}) {
  const span = (hours || []).slice(0, 24);
  if (!span.length) return "Forecast unavailable.";
  const phase = ctx.phase || "day";
  const kind = ctx.kind || "clear";
  const nowIso = span[0].iso;
  const night = phase === "night" || phase === "dusk";

  const wetEnd = (from) => {
    let j = from;
    while (j + 1 < span.length && isWet(span[j + 1])) j++;
    return j;
  };

  if (kind === "storm" || kind === "rain" || isWet(span[0])) {
    const j = wetEnd(0);
    const storms = kind === "storm" || span.slice(0, j + 1).some((h) => h.code >= 95);
    if (j >= span.length - 1) {
      return storms
        ? "Storms hold on through the next 24 hours."
        : "Rain holds on through the next 24 hours.";
    }
    if (j === 0) return storms ? "Storms this hour, then easing." : "Rain this hour, then easing.";
    const end = clock(span[j].iso);
    const tomorrow = span[j].iso.slice(0, 10) !== nowIso.slice(0, 10);
    if (tomorrow) {
      return storms
        ? `Storms into tomorrow, easing around ${end}.`
        : `Rain into tomorrow, easing around ${end}.`;
    }
    return storms ? `Storms through ${end}, then easing.` : `Rain through ${end}, then easing.`;
  }

  const wetAt = span.findIndex(isWet);
  if (wetAt > 0) {
    const j = wetEnd(wetAt);
    const storms = span.slice(wetAt, j + 1).some((h) => h.code >= 95);
    const start = span[wetAt].iso;
    const end = span[j].iso;
    const tomorrow = start.slice(0, 10) !== nowIso.slice(0, 10);
    const lead = tomorrow ? (night ? "Dry tonight." : "Dry the rest of the day.") : "";
    if (tomorrow && wetAt === j) {
      return storms
        ? `${lead} Storms likely tomorrow around ${clock(start)}.`.replace("  ", " ")
        : `${lead} A shower likely tomorrow around ${clock(start)}.`.replace("  ", " ");
    }
    if (tomorrow) {
      return storms
        ? `${lead} Storms likely tomorrow from ${clock(start)} through ${clock(end)}.`
        : `${lead} Rain likely tomorrow from ${clock(start)} through ${clock(end)}.`;
    }
    if (wetAt === j) {
      return storms
        ? `Dry until ${clock(start)}, then storms around then.`
        : `Dry until ${clock(start)}, then a shower.`;
    }
    return storms
      ? `Dry until ${clock(start)}, then storms likely through ${clock(end)}.`
      : `Dry until ${clock(start)}, then rain likely through ${clock(end)}.`;
  }

  const slight = span.find((h) => h.pop >= 20);
  if (slight) {
    const t = clock(slight.iso);
    const tomorrow = slight.iso.slice(0, 10) !== nowIso.slice(0, 10);
    return tomorrow
      ? `Mostly dry. A slight chance of rain tomorrow around ${t}.`
      : `Mostly dry. A slight chance of rain around ${t}.`;
  }

  const max = Math.round(Math.max(...span.map((h) => h.pop)));
  if (kind === "fog") {
    return night ? "Foggy tonight, and dry through tomorrow." : "Foggy, and no rain on the way.";
  }
  if (kind === "cloud" || kind === "overcast") {
    if (night) {
      return max > 0
        ? `Cloudy overnight. Rain stays at ${max}% or less through tomorrow.`
        : "Cloudy overnight. Dry through tomorrow.";
    }
    return max > 0
      ? `Cloudy, and rain stays at ${max}% or less.`
      : "Cloudy, and dry for the next long stretch.";
  }
  if (night) {
    return max > 0
      ? `A dry night. Rain stays at ${max}% or less through tomorrow.`
      : "A dry night, and a dry day tomorrow.";
  }
  return max > 0
    ? `Dry for now. Rain stays at ${max}% or less.`
    : "Dry through the rest of the day.";
}

function wetCode(code) {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 71 && code <= 82) ||
    (code >= 85 && code <= 86) ||
    code >= 95
  );
}

export function weekday(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
}

export function nextDate(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export function plusMinutes(iso, add) {
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  let h = Number(iso.slice(11, 13));
  let m = Number(iso.slice(14, 16)) + add;
  h += Math.floor(m / 60);
  m = ((m % 60) + 60) % 60;
  const dayAdd = Math.floor(h / 24);
  h = ((h % 24) + 24) % 24;
  const dt = new Date(Date.UTC(y, mo - 1, d + dayAdd));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  const mi = String(m).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}T${hh}:${mi}`;
}

export function hourName(iso) {
  const h = Number(iso.slice(11, 13));
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return `${h12}${ap}`;
}

export function clockMinutes(iso) {
  const h = Number(iso.slice(11, 13));
  const min = Number(iso.slice(14, 16));
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  if (min === 0 && h === 0) return "midnight";
  if (min === 0 && h === 12) return "noon";
  if (min === 0) return `${h12}${ap}`;
  const mm = String(min).padStart(2, "0");
  return `${h12}:${mm}${ap}`;
}

export function slotLabel(iso) {
  const h = Number(iso.slice(11, 13));
  const min = iso.slice(14, 16);
  const h12 = h % 12 || 12;
  return `${h12}:${min}`;
}

export function lightning(cape, code, pop = 0) {
  const c = Number(cape) || 0;
  const p = Number(pop) || 0;
  if (code >= 95 || (c >= 2000 && p >= 20)) return { level: 3, label: "Lightning likely" };
  if (c >= 1000 && p >= 20) return { level: 2, label: "Lightning possible" };
  if ((c >= 500 && p >= 30) || c >= 1500) return { level: 1, label: "Slight lightning risk" };
  return { level: 0, label: "No lightning risk" };
}

export function hourReadout(h, nowIso) {
  const same = h.iso.slice(0, 10) === nowIso.slice(0, 10);
  const when = same ? hourName(h.iso) : `${weekday(h.iso)} ${hourName(h.iso)}`;
  const bolt = lightning(h.cape, h.code, h.pop);
  const parts = [`${Math.round(h.pop)}% rain`, bolt.label];
  if (h.precip >= 0.01) parts.push(`${h.precip.toFixed(2)} in`);
  parts.push(`gusts ${Math.round(h.gust)} mph`);
  return { when, temp: Math.round(h.temp), detail: parts.join(" · "), iso: h.iso, level: bolt.level };
}

export function lightningNote(hours) {
  let best = null;
  let bestL = { level: 0, label: "No lightning risk" };
  for (const h of hours) {
    const L = lightning(h.cape, h.code, h.pop);
    if (L.level > bestL.level) {
      bestL = L;
      best = h;
    }
  }
  if (!best || bestL.level === 0) return "No lightning risk in the next 24 hours.";
  return `${bestL.label} around ${hourName(best.iso)}.`;
}

export function soonLine(slots) {
  if (!slots.length) return "15-minute rain isn't in this forecast.";
  const end = plusMinutes(slots[slots.length - 1].iso, 15);
  const max = Math.max(...slots.map((s) => s.pop));
  if (max <= 0) return `Dry through ${clockMinutes(end)}.`;
  const worst = slots.reduce((a, b) => (b.pop > a.pop ? b : a));
  return `Up to ${Math.round(max)}% around ${clockMinutes(worst.iso)}.`;
}

export function barScale(pop) {
  const p = Math.max(0, Math.min(100, pop));
  if (p <= 0) return 0.045;
  return Math.max(0.1, Math.pow(p / 100, 0.62));
}

export const PRESETS = [
  {
    id: "walk",
    label: "Walk",
    aria: "Walk",
    rule: "Under 30% rain, feels under 95°, gusts under 25 mph. Daylight or dusk.",
    min: 1,
    pop: 30,
    precip: 0.02,
    feels: 95,
    gust: 25,
    wind: 20,
    light: "edge",
  },
  {
    id: "errands",
    label: "Errands",
    aria: "Errands",
    rule: "Under 40% rain, feels under 105°, gusts under 35 mph. Between 8am and 8pm.",
    min: 1,
    pop: 40,
    precip: 0.05,
    feels: 105,
    gust: 35,
    wind: 30,
    hours: [8, 20],
  },
  {
    id: "mow",
    label: "Mow",
    aria: "Mow the lawn",
    rule: "Dry grass, feels under 90°, gusts under 25 mph, wind under 16. Daylight only.",
    min: 1,
    pop: 20,
    precip: 0.01,
    feels: 90,
    gust: 25,
    wind: 16,
    light: "strict",
    dryGround: true,
  },
  {
    id: "laundry",
    label: "Laundry",
    aria: "Laundry on the line",
    rule: "Two hours under 15% rain, humidity under 75%, gusts under 22 mph. Daylight only.",
    min: 2,
    pop: 15,
    precip: 0.01,
    feels: 120,
    gust: 22,
    wind: 20,
    hum: 75,
    light: "strict",
  },
  {
    id: "grill",
    label: "Grill",
    aria: "Grill",
    rule: "Under 30% rain, feels under 100°, gusts under 25 mph. From 4pm to 10pm.",
    min: 1,
    pop: 30,
    precip: 0.02,
    feels: 100,
    gust: 25,
    wind: 18,
    hours: [16, 22],
  },
];

function hourOf(iso) {
  return Number(iso.slice(11, 13));
}

function inLight(preset, h, hours, i) {
  if (preset.light === "strict") return h.day === 1;
  if (preset.light === "edge") {
    const prev = hours[i - 1];
    const next = hours[i + 1];
    return h.day === 1 || prev?.day === 1 || next?.day === 1;
  }
  return true;
}

function inHours(preset, h) {
  if (!preset.hours) return true;
  const hh = hourOf(h.iso);
  return hh >= preset.hours[0] && hh < preset.hours[1];
}

function reasonFor(preset, h, hours, i) {
  if (!inHours(preset, h)) return "hours";
  if (!inLight(preset, h, hours, i)) return "dark";
  if (h.pop > preset.pop || h.precip >= preset.precip) return "rain";
  if (wetCode(h.code) && h.precip > 0) return "rain";
  if (h.feels > preset.feels) return "heat";
  if (h.gust > preset.gust || h.wind > preset.wind) return "wind";
  if (preset.hum != null && h.hum != null && h.hum > preset.hum) return "humid";
  if (preset.dryGround) {
    const prev = hours[i - 1];
    if (prev && (prev.precip >= 0.01 || prev.pop >= 50)) return "wet";
  }
  return null;
}

function takeBest(blocks, n) {
  if (blocks.length <= n) return blocks;
  return blocks
    .map((b, i) => ({ b, i, score: b.length * 100 - i }))
    .sort((a, c) => c.score - a.score)
    .slice(0, n)
    .sort((a, c) => a.i - c.i)
    .map((x) => x.b);
}

export function rangeLabel(startIso, endIso) {
  const until = plusMinutes(endIso, 60);
  const part = (iso) => {
    const h = Number(iso.slice(11, 13));
    return { h: h % 12 || 12, ap: h < 12 ? "am" : "pm" };
  };
  const a = part(startIso);
  const b = part(until);
  if (a.ap === b.ap) return `${a.h}–${b.h}${b.ap}`;
  return `${a.h}${a.ap}–${b.h}${b.ap}`;
}

export function windowHint(block) {
  const pop = Math.max(...block.map((h) => h.pop));
  const feels = Math.round(Math.max(...block.map((h) => h.feels)));
  const rain = pop <= 0 ? "Dry" : pop < 20 ? "Mostly dry" : `${Math.round(pop)}% rain`;
  const heat = feels < 75 ? "cool" : feels < 85 ? "mild" : feels < 95 ? "warm" : "hot";
  return `${rain} · ${heat}`;
}

export function whyLines(block) {
  const pops = block.map((h) => h.pop);
  const feels = block.map((h) => h.feels);
  const pop0 = Math.round(Math.min(...pops));
  const pop1 = Math.round(Math.max(...pops));
  const f0 = Math.round(Math.min(...feels));
  const f1 = Math.round(Math.max(...feels));
  const gust = Math.round(Math.max(...block.map((h) => h.gust)));
  const wind = Math.round(Math.max(...block.map((h) => h.wind)));
  const lines = [
    pop0 === pop1 ? `Rain stays at ${pop0}%.` : `Rain stays between ${pop0}% and ${pop1}%.`,
    f0 === f1 ? `Feels like ${f0}°.` : `Feels like ${f0}–${f1}°.`,
    `Wind ${wind} mph, gusts up to ${gust}.`,
  ];
  const lit = block.filter((h) => h.day === 1).length;
  if (lit === block.length) lines.push("Full daylight.");
  else if (lit === 0) lines.push("Right at the edge of daylight.");
  else lines.push("Daylight for part of it.");
  return lines;
}

function explainNone(preset, hours, today, tomorrow) {
  const timed = [];
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    const d = h.iso.slice(0, 10);
    if (d !== today && d !== tomorrow) continue;
    if (!inHours(preset, h) || !inLight(preset, h, hours, i)) continue;
    timed.push(h);
  }
  if (!timed.length) return ["No daylight left in the hours this needs."];
  const lines = [];
  const windFails = timed.filter((h) => h.gust > preset.gust || h.wind > preset.wind);
  const rainFails = timed.filter((h) => h.pop > preset.pop || h.precip >= preset.precip);
  const heatFails = timed.filter((h) => h.feels > preset.feels);
  const humFails = preset.hum != null ? timed.filter((h) => h.hum != null && h.hum > preset.hum) : [];
  if (rainFails.length) {
    const mx = Math.round(Math.max(...rainFails.map((h) => h.pop)));
    lines.push(`Rain chance reaches ${mx}% in the hours that would otherwise work.`);
  }
  if (heatFails.length) {
    const mx = Math.round(Math.max(...heatFails.map((h) => h.feels)));
    lines.push(`It feels like ${mx}° — too hot for this.`);
  }
  if (windFails.length) {
    const g = windFails.map((h) => Math.round(h.gust));
    const lo = Math.min(...g);
    const hi = Math.max(...g);
    lines.push(lo === hi ? `Gusts are ${hi} mph.` : `Gusts run ${lo}–${hi} mph.`);
  }
  if (humFails.length) {
    const hs = humFails.map((h) => Math.round(h.hum));
    const lo = Math.min(...hs);
    const hi = Math.max(...hs);
    lines.push(lo === hi ? `Humidity stays at ${hi}%.` : `Humidity stays at ${lo}–${hi}%.`);
  }
  if (!lines.length) lines.push(`Nothing lasts ${preset.min} hours in a row.`);
  return lines.slice(0, 3);
}

export function sliceDays(data) {
  const daily = data.daily || {};
  const time = daily.time || [];
  const out = [];
  for (let i = 0; i < time.length; i++) {
    out.push({
      iso: time[i],
      code: num(daily.weather_code?.[i]),
      max: maybe(daily.temperature_2m_max?.[i]),
      min: maybe(daily.temperature_2m_min?.[i]),
      feels: maybe(daily.apparent_temperature_max?.[i]),
      pop: maybe(daily.precipitation_probability_max?.[i]),
      rain: maybe(daily.precipitation_sum?.[i]),
      sunrise: daily.sunrise?.[i] || "",
      sunset: daily.sunset?.[i] || "",
      uv: maybe(daily.uv_index_max?.[i]),
    });
  }
  return out;
}

export function heatCopy(feels) {
  const n = Math.round(Number(feels));
  if (!Number.isFinite(n)) return null;
  if (n >= 105) return { value: n, label: "Dangerous", advice: "Stay inside through the peak.", tone: "bad" };
  if (n >= 100) return { value: n, label: "Very hot", advice: "Limit the hard work. Stay in the shade.", tone: "bad" };
  if (n >= 90) return { value: n, label: "Hot", advice: "Shade and water. Ease up at midday.", tone: "mod" };
  if (n >= 80) return { value: n, label: "Warm", advice: "Fine outside. Water if you're working.", tone: "mod" };
  if (n >= 60) return { value: n, label: "Comfortable", advice: "Heat isn't the constraint.", tone: "" };
  return { value: n, label: "Cool", advice: "A layer is enough.", tone: "" };
}

export function clockLabel(iso) {
  if (!iso || iso.length < 16) return "";
  const hh = Number(iso.slice(11, 13));
  const mm = iso.slice(14, 16);
  if (!Number.isFinite(hh)) return "";
  const ap = hh >= 12 ? "pm" : "am";
  return `${hh % 12 || 12}:${mm} ${ap}`;
}

export function goldenWindow(nowIso, sunrise, sunset) {
  if (!sunrise || !sunset) return null;
  const now = minutes(nowIso);
  const rise = minutes(sunrise);
  if (Number.isFinite(now) && Number.isFinite(rise) && now < rise + 70) {
    return {
      label: "Morning gold",
      range: `${clockLabel(sunrise)} – ${clockLabel(plusMinutes(sunrise, 60))}`,
    };
  }
  return {
    label: "Golden hour",
    range: `${clockLabel(plusMinutes(sunset, -60))} – ${clockLabel(sunset)}`,
  };
}

export function outlookNote(days) {
  if (!days.length) return "";
  let wet = null;
  for (const day of days) {
    if (day.pop == null) continue;
    if (!wet || day.pop > wet.pop) wet = day;
  }
  if (!wet || wet.pop < 20) return "Mostly dry";
  const name = weekday(wet.iso.length > 10 ? wet.iso : `${wet.iso}T12:00`);
  return `Wettest ${name} · ${Math.round(wet.pop)}%`;
}

export function findWindows(presetId, hours, nowIso) {
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const today = nowIso.slice(0, 10);
  const tomorrow = nextDate(today);
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= preset.min) blocks.push(cur.map((i) => hours[i]));
    cur = [];
  };
  for (let i = 0; i < hours.length; i++) {
    const ok = reasonFor(preset, hours[i], hours, i) === null;
    if (!ok) {
      flush();
      continue;
    }
    if (cur.length) {
      const prev = hours[cur[cur.length - 1]];
      const broken = i !== cur[cur.length - 1] + 1 || prev.iso.slice(0, 10) !== hours[i].iso.slice(0, 10);
      if (broken) flush();
    }
    cur.push(i);
  }
  flush();
  const on = (day) => blocks.filter((b) => b[0].iso.slice(0, 10) === day);
  const todayBlocks = takeBest(on(today), 3);
  const tomorrowBlocks = takeBest(on(tomorrow), 3);
  const noneLines =
    todayBlocks.length || tomorrowBlocks.length ? [] : explainNone(preset, hours, today, tomorrow);
  const view = (b) => ({
    start: b[0].iso,
    day: b[0].iso.slice(0, 10) === today ? "Today" : "Tomorrow",
    label: rangeLabel(b[0].iso, b[b.length - 1].iso),
    hint: windowHint(b),
    why: whyLines(b),
  });
  return {
    preset,
    today: todayBlocks.map(view),
    tomorrow: tomorrowBlocks.map(view),
    noneLines,
  };
}
