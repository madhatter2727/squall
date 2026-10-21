import {
  PRESETS,
  barScale,
  clockLabel,
  conditionLabel,
  findWindows,
  formatStamp,
  goldenWindow,
  headline,
  heatCopy,
  hourReadout,
  kindFrom,
  lightning,
  lightningNote,
  outlookNote,
  peakLine,
  phaseFrom,
  sliceDays,
  sliceHours,
  sliceMinutes,
  slotLabel,
  soonLine,
  weekday,
} from "./copy.js";
import { activeAlerts } from "./alerts.js";
import { airCopy, pmLine, uvSentence } from "./air.js";
import { loadPack, savePack } from "./cache.js";
import { mountRadar } from "./radar.js";
import {
  HOME,
  activePlace,
  loadPlaces,
  placeFromCoords,
  placeLine,
  savePlaces,
  searchPlaces,
} from "./places.js";
import { shouldRefresh } from "./refresh.js";
import { describeStorm } from "./storms.js";
import { formatEt, formatEtShort, formatWhen } from "./time.js";

const app = document.querySelector("#app");

let placesState = loadPlaces();
let bootSeq = 0;
let radarHandle = null;
let clockZone = "America/New_York";
let searchAbort = null;
let searchTimer = 0;
let searchSeq = 0;
const ui = { preset: "walk", index: 0, open: null };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

async function fetchJson(url, headers, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function forecastUrl(place) {
  const q = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover",
    hourly: [
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "dew_point_2m",
      "wind_speed_10m",
      "wind_gusts_10m",
      "cloud_cover",
      "cape",
      "is_day",
    ].join(","),
    minutely_15: ["precipitation", "precipitation_probability", "weather_code", "temperature_2m", "cape"].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "precipitation_probability_max",
      "precipitation_sum",
      "sunrise",
      "sunset",
      "uv_index_max",
    ].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: place.tz && place.tz !== "auto" ? place.tz : "auto",
    forecast_days: "10",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

function loadForecast(place) {
  return fetchJson(forecastUrl(place)).then((data) => {
    if (!Number.isFinite(data?.current?.temperature_2m)) {
      throw new Error("Forecast was missing a temperature");
    }
    return data;
  });
}

function loadAir(place) {
  const q = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "us_aqi,uv_index,pm2_5,pm10",
    timezone: place.tz && place.tz !== "auto" ? place.tz : "auto",
  });
  return fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`).then((data) => {
    if (!data?.current || !Number.isFinite(Number(data.current.us_aqi))) {
      throw new Error("Air quality was missing an AQI");
    }
    return data.current;
  });
}

function loadTropics() {
  return fetchJson("/api/tropics").then((data) => {
    if (!Array.isArray(data?.activeStorms)) throw new Error("Tropics list was unreadable");
    return data;
  });
}

function loadAlerts(place) {
  const url = `https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`;
  return fetchJson(url, { Accept: "application/geo+json" }).then((data) => {
    if (!Array.isArray(data?.features)) throw new Error("Alerts were unreadable");
    return data;
  });
}

function loadRadar() {
  return fetchJson("https://api.rainviewer.com/public/weather-maps.json").then((data) => {
    const host = data?.host;
    const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
    const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
    const frames = [
      ...past.map((frame) => ({ time: frame.time, path: frame.path, kind: "Observed" })),
      ...nowcast.map((frame) => ({ time: frame.time, path: frame.path, kind: "Forecast" })),
    ].filter((frame) => frame.path && Number.isFinite(Number(frame.time)));
    if (!host) throw new Error("Radar host was missing");
    return { host, frames };
  });
}

function settled(promise) {
  return promise.then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: null }));
}

function loadAll(place) {
  return Promise.all([
    loadForecast(place),
    settled(loadAir(place)),
    settled(loadTropics()),
    settled(loadAlerts(place)),
    settled(loadRadar()),
  ]).then(([forecast, air, tropics, alerts, radar]) => ({ forecast, air, tropics, alerts, radar }));
}

function dropRadar() {
  if (!radarHandle) return;
  try {
    radarHandle.destroy();
  } catch {
    /* the map node is already gone */
  }
  radarHandle = null;
}

function applySky(phase, kind, cloudCover) {
  document.body.dataset.phase = phase;
  document.body.dataset.kind = kind;
  const night = phase === "night";
  const falling = kind === "rain" || kind === "storm";
  document.body.classList.toggle("show-stars", night && kind === "clear");
  document.body.classList.toggle("show-moon", night && (kind === "clear" || kind === "cloud"));
  document.body.classList.toggle("show-sun", !night && (kind === "clear" || kind === "cloud"));
  document.body.classList.toggle("show-rain", falling);
  let cloud = Math.max(0, Math.min(1, Number(cloudCover) / 100 || 0));
  if (kind === "overcast" || kind === "fog") cloud = Math.max(cloud, 0.75);
  if (kind === "storm") cloud = Math.max(cloud, 0.65);
  if (kind === "clear") cloud *= 0.4;
  document.documentElement.style.setProperty("--cloud", cloud.toFixed(2));
  const pos =
    phase === "dawn" ? ["20%", "60%"] : phase === "dusk" ? ["82%", "56%"] : ["70%", "26%"];
  document.documentElement.style.setProperty("--sun-x", pos[0]);
  document.documentElement.style.setProperty("--sun-y", pos[1]);
}

function tempSpan(hours) {
  const temps = hours.map((h) => h.temp);
  return { min: Math.min(...temps) - 1, max: Math.max(...temps) + 1 };
}

function tempY(temp, span) {
  const range = Math.max(1, span.max - span.min);
  const t = (temp - span.min) / range;
  return 8 + (1 - t) * 46;
}

function barsHtml(items) {
  return items
    .map((h) => {
      const pop = Math.max(0, Math.min(100, h.pop));
      const cls = pop >= 50 ? "hi" : pop >= 20 ? "mid" : pop > 0 ? "lo" : "z";
      const bolt = lightning(h.cape, h.code, h.pop).level > 0 ? " bolt" : "";
      return `<i class="${cls}${bolt}" style="--p:${barScale(pop).toFixed(3)}" data-pop="${Math.round(pop)}"><b></b></i>`;
    })
    .join("");
}

function hourShort(iso) {
  const h = Number(iso.slice(11, 13));
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
}

function mastHtml(place, stamp, offline, fetchedAt) {
  return `<header class="mast" data-place="${esc(place.name)}" data-lat="${place.lat}" data-lon="${place.lon}" data-fetched-at="${esc(fetchedAt || "")}" data-offline="${offline ? "true" : "false"}">
      <button type="button" class="place" id="place-btn" aria-haspopup="dialog" aria-expanded="false">${esc(place.name)}<i class="caret" aria-hidden="true"></i></button>
      ${stamp ? `<button type="button" class="updated" id="refresh-btn" aria-label="Refresh forecast">${esc(stamp)}</button>` : ""}
    </header>`;
}

function offlineHtml(offline, fetchedAt, stamp) {
  if (!offline) return "";
  const saved = formatWhen(fetchedAt, clockZone) || stamp;
  if (!saved) return "";
  const text = navigator.onLine ? `Saved ${saved}. Couldn't refresh.` : `Offline · saved ${saved}`;
  return `<p class="offline" id="offline-note">${esc(text)}</p>`;
}

function stormArticle(storm) {
  return `<article class="storm" data-id="${esc(storm.id)}">
    <p class="storm-name">${esc(storm.title)}</p>
    ${storm.meta ? `<p class="storm-meta">${esc(storm.meta)}</p>` : ""}
    <p class="storm-where">${esc(storm.where)}</p>
    ${storm.move ? `<p class="storm-move">${esc(storm.move)}</p>` : ""}
    ${storm.threat ? `<p class="threat-line">Headed this way.</p>` : ""}
  </article>`;
}

function alertsMarkup(alerts) {
  if (!alerts?.ok) return `<p class="alerts-miss">Alerts didn't load.</p>`;
  const list = activeAlerts(alerts.v);
  if (!list.length) return "";
  const shown = list.slice(0, 2);
  const extra = list.length - shown.length;
  const cards = shown
    .map((props) => {
      const severe = props.severity === "Extreme" || props.severity === "Severe";
      const until = props.ends ? `Until ${formatEt(props.ends, clockZone)}` : "";
      return `<article class="alerts${severe ? "" : " moderate"}">
        <div class="dock-head">
          <p class="alert-kicker">${esc(props.severity || "Alert")}</p>
          ${until ? `<p class="peak">${esc(until)}</p>` : ""}
        </div>
        <h2 class="alert-title">${esc(props.event)}</h2>
        ${props.headline ? `<p class="alert-body">${esc(props.headline)}</p>` : ""}
      </article>`;
    })
    .join("");
  return extra > 0 ? `${cards}<p class="alerts-more">${extra} more active</p>` : cards;
}

function tropicsMarkup(tropics, place) {
  if (!tropics?.ok) {
    return `<section class="card tropics" id="tropics" data-state="error" aria-label="Tropics">
      <h2>Tropics</h2>
      <p class="none">Tropics didn't load.</p>
      <p class="detail">The hurricane center didn't answer.</p>
    </section>`;
  }
  const storms = (tropics.v.activeStorms || []).map((storm) => describeStorm(storm, place)).filter(Boolean);
  const atlantic = storms.filter((storm) => storm.atlantic);
  const other = storms.filter((storm) => !storm.atlantic);
  const loud = atlantic.some((storm) => storm.threat);
  const names = storms.map((storm) => storm.name).join(",");
  const quiet = atlantic.length
    ? ""
    : `<p class="none">Quiet in the Atlantic.</p>${
        storms.length ? "" : `<p class="detail">No active storms on the hurricane center's list.</p>`
      }`;
  const also = other.length ? `<p class="kicker also">Also active</p>${other.map(stormArticle).join("")}` : "";
  return `<section class="card tropics${loud ? " loud" : ""}" id="tropics" data-state="${
    atlantic.length ? "active" : "quiet"
  }" data-storms="${esc(names)}" aria-label="Tropics">
    <h2>Tropics</h2>
    ${quiet}
    ${atlantic.map(stormArticle).join("")}
    ${also}
  </section>`;
}

function airMarkup(air) {
  if (!air?.ok) {
    return `<section class="card air" id="air" data-state="error" aria-label="Air quality">
      <h2>Air</h2>
      <p class="none">Air didn't load.</p>
      <p class="detail">The air quality feed didn't answer.</p>
    </section>`;
  }
  const copy = airCopy(air.v.us_aqi);
  const particles = pmLine(air.v);
  return `<section class="card air" id="air" data-aqi="${copy.value}" data-band="${esc(copy.label)}" aria-label="Air quality">
    <div class="dock-head"><h2>Air</h2><p class="peak">US AQI</p></div>
    <div class="air-main">
      <p class="air-num ${copy.tone}">${copy.value}</p>
      <div>
        <p class="air-band">${esc(copy.label)}</p>
        <p class="detail">${esc(copy.advice)}</p>
      </div>
    </div>
    ${particles ? `<p class="detail air-pm">${esc(particles)}</p>` : ""}
  </section>`;
}

function radarMarkup(radar) {
  if (!radar?.ok) {
    return `<section class="card radar" id="radar" data-state="error" aria-label="Radar">
      <h2>Radar</h2>
      <p class="none">Radar didn't load.</p>
      <p class="detail">RainViewer didn't answer.</p>
    </section>`;
  }
  const frames = radar.v.frames;
  if (!frames.length) {
    return `<section class="card radar" id="radar" data-state="empty" data-frames="0" aria-label="Radar">
      <h2>Radar</h2>
      <p class="none">No radar frames right now.</p>
    </section>`;
  }
  const last = frames[frames.length - 1];
  const start = formatEtShort(frames[0].time * 1000, clockZone);
  const end = formatEtShort(last.time * 1000, clockZone);
  return `<section class="card radar" id="radar" data-state="ready" data-frames="${frames.length}" data-time="${last.time}" aria-label="Radar">
    <div class="dock-head">
      <h2>Radar</h2>
      <p class="peak" id="radar-kind">${esc(last.kind)}</p>
    </div>
    <div class="radar-map" id="radar-map"></div>
    <div class="radar-controls">
      <button type="button" class="radar-play" id="radar-play" aria-pressed="false" aria-label="Play radar loop">
        <svg class="ico-play" viewBox="0 0 12 14" width="12" height="14" aria-hidden="true"><path d="M1 1.2v11.6L11 7 1 1.2z" fill="currentColor"/></svg>
        <svg class="ico-pause" viewBox="0 0 12 14" width="12" height="14" aria-hidden="true"><path d="M1 1h3.2v12H1zM7.8 1H11v12H7.8z" fill="currentColor"/></svg>
      </button>
      <p class="radar-when" id="radar-when">${esc(formatEt(last.time * 1000, clockZone))}</p>
    </div>
    <input class="radar-range" id="radar-range" type="range" min="0" max="${frames.length - 1}" value="${
      frames.length - 1
    }" style="--radar-pct: 100%" aria-label="Radar time" aria-valuemin="0" aria-valuemax="${frames.length - 1}" aria-valuenow="${
      frames.length - 1
    }" aria-valuetext="${esc(formatEt(last.time * 1000, clockZone))}" />
    <div class="radar-ends"><span>${esc(start)}</span><span>${esc(end)}</span></div>
  </section>`;
}

function heatMarkup(current, days, air) {
  const heat = heatCopy(current?.apparent_temperature);
  const today = days[0];
  const gold = today ? goldenWindow(current.time, today.sunrise, today.sunset) : null;
  const uv = uvSentence(air?.ok ? air.v.uv_index : null, today?.uv);
  if (!heat && !today?.sunrise && !uv) return "";
  const peak =
    today?.feels != null && heat && Math.round(today.feels) > heat.value + 1
      ? `Up to ${Math.round(today.feels)}°`
      : "Now";
  const sun =
    today?.sunrise && today?.sunset
      ? `<div class="sun-grid">
          <p><span>Sunrise</span><b>${esc(clockLabel(today.sunrise))}</b></p>
          <p><span>Sunset</span><b>${esc(clockLabel(today.sunset))}</b></p>
        </div>
        ${gold ? `<p class="gold-line"><span>${esc(gold.label)}</span> ${esc(gold.range)}</p>` : ""}`
      : "";
  return `<section class="card heat" id="heat" aria-label="Heat and sun">
    <div class="dock-head"><h2>Heat</h2><p class="peak">${esc(peak)}</p></div>
    ${
      heat
        ? `<div class="air-main">
            <p class="air-num ${heat.tone}" data-heat="${heat.value}">${heat.value}</p>
            <div>
              <p class="air-band">${esc(heat.label)}</p>
              <p class="detail">${esc(heat.advice)}</p>
            </div>
          </div>`
        : ""
    }
    ${sun}
    ${uv ? `<p class="detail heat-uv">${esc(uv)}</p>` : ""}
  </section>`;
}

function outlookMarkup(days, todayIso) {
  if (!days.length) return "";
  const today = todayIso.slice(0, 10);
  const cols = days
    .slice(0, 10)
    .map((day) => {
      const date = day.iso.slice(0, 10);
      const name = date === today ? "Today" : weekday(day.iso.length > 10 ? day.iso : `${day.iso}T12:00`);
      const pop = day.pop == null ? "" : Math.round(day.pop) <= 0 ? "Dry" : `${Math.round(day.pop)}%`;
      const hi = day.max == null ? "—" : `${Math.round(day.max)}°`;
      const lo = day.min == null ? "" : `${Math.round(day.min)}°`;
      const dry = pop === "Dry" || !pop ? " dry" : "";
      return `<div class="daycol${date === today ? " is-today" : ""}">
        <span class="dow">${esc(name)}</span>
        <span class="hi">${hi}</span>
        <span class="lo">${lo}</span>
        <span class="pop${dry}">${esc(pop)}</span>
      </div>`;
    })
    .join("");
  return `<section class="card outlook" id="outlook" aria-label="10-day outlook">
    <div class="dock-head"><h2>10 days</h2><p class="peak">${esc(outlookNote(days))}</p></div>
    <div class="days">${cols}</div>
  </section>`;
}

function render(place, pack, meta) {
  const data = pack.forecast;
  if (!Number.isFinite(data?.current?.temperature_2m)) {
    renderError(place);
    return;
  }
  dropRadar();
  const offline = Boolean(meta?.offline);
  const fetchedAt = meta?.fetchedAt || pack.fetchedAt || "";
  clockZone = data.timezone || place.tz || "America/New_York";
  const hours = sliceHours(data, 24);
  const days = sliceHours(data, 48);
  const outlook = sliceDays(data);
  const minutes = sliceMinutes(data, 8);
  const current = data.current;
  const nowIso = current.time;
  const phase = phaseFrom(nowIso, data.daily?.sunrise?.[0], data.daily?.sunset?.[0], current.is_day);
  const kind = kindFrom(current.weather_code, current.cloud_cover);
  const line = headline(hours, { phase, kind });
  const rounded = Math.round(current.temperature_2m);
  const feelsRounded = Math.round(current.apparent_temperature);

  applySky(phase, kind, current.cloud_cover);
  document.title = `${rounded}° · Squall`;

  const span = hours.length ? tempSpan(hours) : { min: 0, max: 1 };
  const pts = hours
    .map((h, i) => {
      const x = ((i + 0.5) / hours.length) * 100;
      const y = tempY(h.temp, span);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const floor = "54";
  const fill = hours.length
    ? `${((0.5 / hours.length) * 100).toFixed(2)},${floor} ${pts} ${(((hours.length - 0.5) / hours.length) * 100).toFixed(2)},${floor}`
    : "";

  const axis = hours
    .map((h, i) => {
      if (i % 3 !== 0) return "";
      const text = i === 0 ? "Now" : hourShort(h.iso);
      const edge = i === 0 ? "edge-l" : i + 3 >= hours.length ? "edge-r" : "";
      const left = ((i + 0.5) / hours.length) * 100;
      return `<span class="${edge}" style="left:${left.toFixed(2)}%">${text}</span>`;
    })
    .join("");

  const slots = minutes
    .map((s) => {
      const pop = Math.round(s.pop);
      return `<i style="--p:${barScale(s.pop).toFixed(3)}" data-pop="${pop}" data-iso="${s.iso}"><b></b><span>${slotLabel(s.iso)}</span></i>`;
    })
    .join("");

  const note = hours.length ? lightningNote(hours) : "";
  const noteHot = hours.some((h) => h.code >= 95 || h.cape >= 1500);
  const chips = PRESETS.map(
    (p) =>
      `<button type="button" data-preset="${p.id}" aria-pressed="${p.id === ui.preset ? "true" : "false"}" aria-label="${p.aria}">${p.label}</button>`
  ).join("");

  app.dataset.place = place.name;
  app.dataset.lat = String(place.lat);
  app.dataset.lon = String(place.lon);
  app.innerHTML = `
    <p class="brand">Squall</p>
    ${mastHtml(place, formatStamp(nowIso), offline, fetchedAt)}
    ${alertsMarkup(pack.alerts)}
    <p class="temp" data-temp="${current.temperature_2m}" data-feels="${current.apparent_temperature}">
      <span class="num">${rounded}</span><sup>°</sup>
    </p>
    <p class="meta">Feels like ${feelsRounded}° · ${conditionLabel(current.weather_code)}</p>
    ${offlineHtml(offline, fetchedAt, formatStamp(nowIso))}
    <h1 class="headline">${line}</h1>
    <section class="card timeline" aria-label="Rain timeline">
      <div class="dock-head">
        <h2>Next 2 hours</h2>
        <p class="peak" id="soon-line">${soonLine(minutes)}</p>
      </div>
      <div class="quarters" id="quarters">${slots || `<p class="quiet">15-minute rain isn't in this forecast.</p>`}</div>
      <div class="split"></div>
      <div class="dock-head hours-head">
        <h2>Next 24 hours</h2>
        <p class="peak">${hours.length ? peakLine(hours) : ""}</p>
      </div>
      <div class="readout" id="hour-readout" data-iso="">
        <p class="when" id="hour-when"></p>
        <p class="read-temp" id="hour-temp"></p>
      </div>
      <p class="detail" id="hour-detail"></p>
      <div
        class="chart"
        id="chart"
        role="slider"
        tabindex="0"
        aria-label="Next 24 hours"
        aria-valuemin="0"
        aria-valuemax="${Math.max(0, hours.length - 1)}"
        aria-valuenow="0"
      >
        <div class="cols" id="cols">${barsHtml(hours)}</div>
        <svg class="line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="${fill}"></polygon>
          <polyline points="${pts}"></polyline>
        </svg>
        <div class="play" id="playhead"><i></i></div>
      </div>
      <div class="axis" id="axis">${axis}</div>
      <p class="bolt-note${noteHot ? " hot" : ""}" id="lightning-note">${note}</p>
    </section>
    <section class="card windows" id="windows" aria-label="Dry windows">
      <h2>Dry windows</h2>
      <div class="presets" role="group">${chips}</div>
      <p class="rule" id="preset-rule"></p>
      <div id="window-list"></div>
    </section>
    ${heatMarkup(current, outlook, pack.air)}
    ${outlookMarkup(outlook, nowIso)}
    ${radarMarkup(pack.radar)}
    ${tropicsMarkup(pack.tropics, place)}
    ${airMarkup(pack.air)}
  `;

  const state = {
    hours,
    days,
    nowIso,
    span,
    index: Math.min(ui.index, Math.max(0, hours.length - 1)),
    preset: ui.preset,
    open: ui.open,
  };
  const chart = document.querySelector("#chart");
  const list = document.querySelector("#window-list");

  const paintHour = (index) => {
    if (!hours.length || !chart) return;
    const i = Math.max(0, Math.min(hours.length - 1, index));
    state.index = i;
    ui.index = i;
    const read = hourReadout(hours[i], nowIso);
    document.querySelector("#hour-when").textContent = read.when;
    document.querySelector("#hour-temp").textContent = `${read.temp}°`;
    document.querySelector("#hour-detail").textContent = read.detail;
    const readout = document.querySelector("#hour-readout");
    readout.dataset.iso = read.iso;
    readout.dataset.when = read.when;
    chart.setAttribute("aria-valuenow", String(i));
    chart.setAttribute("aria-valuetext", `${read.when}, ${read.temp} degrees, ${read.detail}`);
    const y = tempY(hours[i].temp, span);
    const left = ((i + 0.5) / hours.length) * 100;
    const play = document.querySelector("#playhead");
    play.style.left = `${left}%`;
    play.style.setProperty("--dot", `${y}%`);
    document.querySelectorAll("#cols i").forEach((el, n) => el.classList.toggle("on", n === i));
  };

  const indexFromEvent = (event) => {
    const rect = chart.getBoundingClientRect();
    const x = Math.min(Math.max(0, event.clientX - rect.left), rect.width - 0.01);
    return Math.floor((x / rect.width) * hours.length);
  };

  if (chart && hours.length) {
    let dragging = false;
    chart.addEventListener("pointerdown", (event) => {
      dragging = true;
      chart.setPointerCapture(event.pointerId);
      paintHour(indexFromEvent(event));
    });
    chart.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      paintHour(indexFromEvent(event));
    });
    const endDrag = () => {
      dragging = false;
    };
    chart.addEventListener("pointerup", endDrag);
    chart.addEventListener("pointercancel", endDrag);
    chart.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        paintHour(state.index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        paintHour(state.index - 1);
      }
    });
  }

  const paintPresets = () => {
    const preset = PRESETS.find((p) => p.id === state.preset) || PRESETS[0];
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.preset === state.preset ? "true" : "false");
    });
    const rule = document.querySelector("#preset-rule");
    if (rule) rule.textContent = preset.rule;
  };

  const dayBlock = (name, windows) => {
    if (!windows.length) {
      const extra =
        name === "Tomorrow" && state._none.length
          ? state._none.map((line) => `<p>${line}</p>`).join("")
          : "";
      const word = name === "Today" ? "None today." : "None tomorrow.";
      return `<div class="day"><p class="kicker">${name}</p><p class="none">${word}</p>${extra ? `<div class="why static">${extra}</div>` : ""}</div>`;
    }
    const rows = windows
      .map((w) => {
        const open = state.open === w.start;
        const why = w.why.map((row) => `<p>${row}</p>`).join("");
        return `<button type="button" class="win" data-start="${w.start}" aria-expanded="${open ? "true" : "false"}">
          <span class="span">${w.label}</span>
          <span class="aside"><span class="hint">${w.hint}</span><i class="chev" aria-hidden="true"></i></span>
        </button>${open ? `<div class="why">${why}</div>` : ""}`;
      })
      .join("");
    return `<div class="day"><p class="kicker">${name}</p>${rows}</div>`;
  };

  const paintWindows = () => {
    if (!list) return;
    const found = findWindows(state.preset, days, nowIso);
    state._none = found.noneLines;
    list.innerHTML = dayBlock("Today", found.today) + dayBlock("Tomorrow", found.tomorrow);
  };

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.preset = btn.dataset.preset;
      ui.preset = state.preset;
      state.open = null;
      ui.open = null;
      paintPresets();
      paintWindows();
    });
  });
  list?.addEventListener("click", (event) => {
    const btn = event.target.closest(".win");
    if (!btn) return;
    state.open = state.open === btn.dataset.start ? null : btn.dataset.start;
    ui.open = state.open;
    paintWindows();
  });

  paintHour(state.index);
  paintPresets();
  paintWindows();
  const alertCount = pack.alerts?.ok ? activeAlerts(pack.alerts.v).length : -1;
  document.documentElement.dataset.alerts = alertCount < 0 ? "error" : String(alertCount);
  document.documentElement.dataset.offline = offline ? "true" : "false";
  document.documentElement.dataset.fetchedAt = fetchedAt || "";
  delete document.documentElement.dataset.error;
  wireRadar(pack.radar, place);
  bindChrome();
  document.documentElement.dataset.ready = "true";
}

function wireRadar(radar, place) {
  const frames = radar?.ok ? radar.v.frames : [];
  const mapEl = document.querySelector("#radar-map");
  if (!mapEl || !frames.length) return;

  const when = document.querySelector("#radar-when");
  const kind = document.querySelector("#radar-kind");
  const range = document.querySelector("#radar-range");
  const section = document.querySelector("#radar");
  const playBtn = document.querySelector("#radar-play");
  if (section) section.dataset.place = place.name;

  const paint = (frame, index) => {
    const stamp = formatEt(frame.time * 1000, clockZone);
    if (when) when.textContent = stamp;
    if (kind) kind.textContent = frame.kind;
    if (range) {
      range.value = String(index);
      const denom = Math.max(1, frames.length - 1);
      range.style.setProperty("--radar-pct", `${(index / denom) * 100}%`);
      range.setAttribute("aria-valuenow", String(index));
      range.setAttribute("aria-valuetext", `${stamp}, ${frame.kind}`);
    }
    if (section) section.dataset.time = String(frame.time);
  };

  if (!navigator.onLine) {
    mapEl.classList.add("is-offline");
    mapEl.replaceChildren(Object.assign(document.createElement("p"), {
      className: "radar-offline",
      textContent: "Radar imagery needs a connection.",
    }));
    range?.addEventListener("input", () => {
      const index = Number(range.value);
      paint(frames[index], index);
    });
    if (playBtn) playBtn.disabled = true;
    return;
  }

  let ctl = null;
  try {
    ctl = mountRadar(mapEl, {
      lat: place.lat,
      lon: place.lon,
      name: place.name,
      host: radar.v.host,
      frames,
      onFrame: paint,
    });
    radarHandle = ctl;
  } catch {
    mapEl.replaceWith(Object.assign(document.createElement("p"), { className: "none", textContent: "Radar didn't load." }));
    return;
  }

  let timer = null;
  const setPlaying = (on) => {
    if (!playBtn) return;
    playBtn.setAttribute("aria-pressed", on ? "true" : "false");
    playBtn.setAttribute("aria-label", on ? "Pause radar loop" : "Play radar loop");
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    setPlaying(false);
  };
  const play = () => {
    if (!ctl || ctl.count < 2) return;
    setPlaying(true);
    timer = setInterval(() => {
      ctl.show((ctl.index + 1) % ctl.count);
    }, 650);
  };

  playBtn?.addEventListener("click", () => {
    if (playBtn.getAttribute("aria-pressed") === "true") stop();
    else play();
  });
  range?.addEventListener("input", () => {
    stop();
    ctl.show(Number(range.value));
  });
  if (ctl.count < 2 && playBtn) playBtn.disabled = true;
}

function renderError(place) {
  dropRadar();
  clockZone = place?.tz || "America/New_York";
  const here = place || activePlace(placesState);
  app.dataset.place = here.name;
  app.innerHTML = `
    <p class="brand">Squall</p>
    ${mastHtml(here, "", false, "")}
    <h1 class="headline">The forecast didn't load.</h1>
    <p class="meta">Open-Meteo didn't answer. The temperature isn't available.</p>
  `;
  document.documentElement.dataset.error = "true";
  document.documentElement.dataset.offline = "false";
  document.documentElement.dataset.ready = "true";
  bindChrome();
}

function showPending(place) {
  dropRadar();
  app.dataset.place = place.name;
  app.innerHTML = `
    <p class="brand">Squall</p>
    ${mastHtml(place, "", false, "")}
    <p class="loading">Loading the forecast…</p>
  `;
  bindChrome();
}

function rememberPlace(place) {
  const idx = placesState.places.findIndex((row) => row.id === place.id);
  if (idx >= 0) placesState.places[idx] = { ...placesState.places[idx], ...place };
  else placesState.places.push(place);
  placesState.activeId = place.id;
  savePlaces(placesState);
}

function selectPlace(place) {
  rememberPlace(place);
  closeSheet();
  ui.index = 0;
  ui.open = null;
  return boot(activePlace(placesState));
}

function removePlace(id) {
  if (id === HOME.id) return;
  const wasActive = placesState.activeId === id;
  placesState.places = placesState.places.filter((place) => place.id !== id);
  if (!placesState.places.length) placesState.places.push({ ...HOME });
  if (wasActive) placesState.activeId = HOME.id;
  savePlaces(placesState);
  paintSaved();
  if (wasActive) {
    closeSheet();
    ui.index = 0;
    ui.open = null;
    boot(activePlace(placesState));
  }
}

function cyclePlace(dir) {
  const list = placesState.places;
  if (list.length < 2) return;
  const index = list.findIndex((place) => place.id === placesState.activeId);
  const next = list[(index + dir + list.length) % list.length];
  selectPlace(next);
}

function bindSwipe(el) {
  let x = 0;
  let y = 0;
  let armed = false;
  el.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    x = event.clientX;
    y = event.clientY;
    armed = true;
  });
  el.addEventListener("pointerup", (event) => {
    if (!armed) return;
    armed = false;
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    el.dataset.swiped = "1";
    cyclePlace(dx < 0 ? 1 : -1);
    setTimeout(() => {
      delete el.dataset.swiped;
    }, 400);
  });
}

function bindChrome() {
  const mast = document.querySelector(".mast");
  document.querySelector("#place-btn")?.addEventListener("click", () => {
    if (mast?.dataset.swiped) return;
    openSheet();
  });
  document.querySelector("#refresh-btn")?.addEventListener("click", () => {
    boot(activePlace(placesState));
  });
  if (mast) bindSwipe(mast);
  const expanded = document.body.classList.contains("sheet-open");
  document.querySelector("#place-btn")?.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function paintSaved() {
  const box = document.querySelector("#saved-list");
  if (!box) return;
  box.innerHTML = placesState.places
    .map((place) => {
      const on = place.id === placesState.activeId;
      const remove =
        place.id === HOME.id
          ? ""
          : `<button type="button" class="remove" data-remove="${esc(place.id)}" aria-label="Remove ${esc(place.name)}">Remove</button>`;
      return `<div class="saved-row">
        <button type="button" class="saved" data-open="${esc(place.id)}" aria-current="${on ? "true" : "false"}">
          <span class="saved-name">${esc(place.name)}</span>
          <span class="hit-meta">${esc(placeLine(place))}</span>
        </button>
        ${remove}
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const place = placesState.places.find((row) => row.id === btn.dataset.open);
      if (place) selectPlace(place);
    });
  });
  box.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removePlace(btn.dataset.remove));
  });
}

function paintHits(rows) {
  const box = document.querySelector("#place-results");
  if (!rows.length) {
    box.innerHTML = `<p class="search-empty">No places match that.</p>`;
    return;
  }
  box.innerHTML = rows
    .map((row) => {
      const saved = placesState.places.some((place) => place.id === row.id);
      return `<button type="button" class="hit" data-id="${esc(row.id)}">
        <span class="hit-name">${esc(row.name)}</span>
        <span class="hit-meta">${esc(placeLine(row))}</span>
        <span class="hit-act">${saved ? "Open" : "Save"}</span>
      </button>`;
    })
    .join("");
  box.querySelectorAll(".hit").forEach((btn, index) => {
    btn.addEventListener("click", () => selectPlace(rows[index]));
  });
}

async function runSearch(query) {
  const seq = ++searchSeq;
  searchAbort?.abort();
  const box = document.querySelector("#place-results");
  const name = query.trim();
  if (name.length < 2) {
    box.innerHTML = "";
    return;
  }
  const ctrl = new AbortController();
  searchAbort = ctrl;
  try {
    const rows = await searchPlaces(name, ctrl.signal);
    if (seq !== searchSeq) return;
    paintHits(rows);
  } catch (err) {
    if (err?.name === "AbortError" || seq !== searchSeq) return;
    box.innerHTML = `<p class="search-empty">Search didn't answer.</p>`;
  }
}

function openSheet() {
  document.body.classList.add("sheet-open");
  document.querySelector("#sheet-back")?.classList.add("open");
  document.querySelector("#place-btn")?.setAttribute("aria-expanded", "true");
  const note = document.querySelector("#loc-note");
  if (note) note.textContent = "";
  paintSaved();
  const input = document.querySelector("#place-q");
  if (input) {
    input.value = "";
    document.querySelector("#place-results").innerHTML = "";
    setTimeout(() => input.focus(), 40);
  }
}

function closeSheet() {
  document.body.classList.remove("sheet-open");
  document.querySelector("#sheet-back")?.classList.remove("open");
  document.querySelector("#place-btn")?.setAttribute("aria-expanded", "false");
  searchAbort?.abort();
}

function setPull(mode) {
  const el = document.querySelector("#pull");
  if (!el) return;
  const show = mode !== "hide";
  el.classList.toggle("on", show);
  el.classList.toggle("armed", mode === "refresh" || mode === "work");
  document.body.classList.toggle("pulling", show);
  el.textContent =
    mode === "work" ? "Updating…" : mode === "refresh" ? "Release to refresh" : "Pull to refresh";
}

function bindShell() {
  const back = document.querySelector("#sheet-back");
  back?.addEventListener("click", (event) => {
    if (event.target === back) closeSheet();
  });
  document.querySelector("#sheet-close")?.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSheet();
  });

  const input = document.querySelector("#place-q");
  input?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const value = input.value;
    searchTimer = setTimeout(() => runSearch(value), 180);
  });
  document.querySelector("#place-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#place-results .hit")?.click();
  });

  document.querySelector("#use-loc")?.addEventListener("click", () => {
    const note = document.querySelector("#loc-note");
    if (!navigator.geolocation) {
      if (note) note.textContent = "This browser can't share a location.";
      return;
    }
    if (note) note.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await placeFromCoords(pos.coords.latitude, pos.coords.longitude);
        if (note) note.textContent = "";
        await selectPlace(place);
      },
      (err) => {
        if (!note) return;
        note.textContent =
          err?.code === 1 ? "Location is off. Search for a place instead." : "Location didn't come through.";
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
    );
  });

  let startY = null;
  let armed = false;
  const blocked = (target) => target?.closest?.("input, a, .chart, .radar-range, .days, .sheet, .radar-play");
  window.addEventListener(
    "touchstart",
    (event) => {
      if (document.body.classList.contains("sheet-open")) return;
      if (window.scrollY > 2) return;
      if (blocked(event.target)) return;
      startY = event.touches[0].clientY;
      armed = false;
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    (event) => {
      if (startY == null) return;
      const dy = event.touches[0].clientY - startY;
      if (dy < 10 || window.scrollY > 2) {
        if (dy < 0) setPull("hide");
        return;
      }
      armed = dy > 72;
      setPull(armed ? "refresh" : "on");
    },
    { passive: true }
  );
  window.addEventListener("touchend", () => {
    if (startY == null) return;
    const go = armed;
    startY = null;
    armed = false;
    if (go) {
      setPull("work");
      boot(activePlace(placesState)).finally(() => setPull("hide"));
    } else {
      setPull("hide");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (document.body.classList.contains("sheet-open")) return;
    const place = activePlace(placesState);
    const cached = loadPack(place.id);
    if (!cached || shouldRefresh(cached.fetchedAt)) boot(place);
  });
}

async function boot(place) {
  const seq = ++bootSeq;
  document.documentElement.dataset.refreshing = "true";
  const cached = loadPack(place.id);
  const shown = document.querySelector(".mast")?.dataset.place;
  const hasTemp = Boolean(document.querySelector(".temp"));
  if (!hasTemp || shown !== place.name) {
    if (cached?.forecast) render(place, cached, { offline: !navigator.onLine, fetchedAt: cached.fetchedAt });
    else if (shown !== place.name) showPending(place);
  } else {
    const stamp = document.querySelector("#refresh-btn");
    if (stamp) stamp.textContent = "Updating…";
  }

  try {
    const pack = await loadAll(place);
    if (seq !== bootSeq) return;
    const zone = pack.forecast.timezone;
    if (zone && zone !== place.tz) {
      place.tz = zone;
      const stored = placesState.places.find((row) => row.id === place.id);
      if (stored) stored.tz = zone;
      savePlaces(placesState);
    }
    const fetchedAt = new Date().toISOString();
    const row = { ...pack, fetchedAt };
    savePack(place.id, row);
    render(place, row, { offline: false, fetchedAt });
  } catch {
    if (seq !== bootSeq) return;
    if (cached?.forecast) render(place, cached, { offline: true, fetchedAt: cached.fetchedAt });
    else if (!document.querySelector(".temp")) renderError(place);
  } finally {
    if (seq === bootSeq) delete document.documentElement.dataset.refreshing;
  }
}

function registerSw() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

bindShell();
registerSw();
boot(activePlace(placesState));
