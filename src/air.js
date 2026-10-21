const BANDS = [
  [50, "Good", "Fine to be outside.", ""],
  [100, "Moderate", "Sensitive groups should ease up.", "mod"],
  [150, "Unhealthy for some", "Limit a long effort outside if you're sensitive.", "bad"],
  [200, "Unhealthy", "Limit time outside.", "bad"],
  [300, "Very unhealthy", "Stay inside if you can.", "bad"],
  [Infinity, "Hazardous", "Stay inside.", "bad"],
];

function one(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const rounded = Math.round(x * 10) / 10;
  return String(rounded);
}

export function airCopy(usAqi) {
  const n = Number(usAqi);
  if (!Number.isFinite(n)) return null;
  const value = Math.round(n);
  const band = BANDS.find(([max]) => value <= max) || BANDS[BANDS.length - 1];
  return { value, label: band[1], advice: band[2], tone: band[3] };
}

export function pmLine(current) {
  const fine = one(current?.pm2_5);
  const coarse = one(current?.pm10);
  const bits = [];
  if (fine != null) bits.push(`PM2.5 ${fine}`);
  if (coarse != null) bits.push(`PM10 ${coarse}`);
  return bits.join(" · ");
}

function shownUv(n) {
  return n < 10 ? String(Math.round(n * 10) / 10).replace(/\.0$/, "") : String(Math.round(n));
}

export function uvLine(uv) {
  const n = Number(uv);
  if (!Number.isFinite(n)) return "";
  const shown = shownUv(n);
  if (n < 1) return "UV index 0. No burn risk right now.";
  const minutes = Math.max(8, Math.round(200 / n));
  if (n < 3) return `UV index ${shown}. Low, about ${minutes} minutes to burn.`;
  if (n < 6) return `UV index ${shown}. About ${minutes} minutes to burn.`;
  if (n < 8) return `UV index ${shown}. High. About ${minutes} minutes to burn.`;
  if (n < 11) return `UV index ${shown}. Very high. About ${minutes} minutes to burn.`;
  return `UV index ${shown}. Extreme. About ${minutes} minutes to burn.`;
}

export function uvSentence(current, dailyMax) {
  const cur = Number(current);
  const peak = Number(dailyMax);
  const hasCur = Number.isFinite(cur);
  const hasPeak = Number.isFinite(peak);
  if (!hasCur && !hasPeak) return "";
  if (!hasCur) return `UV peaks near ${shownUv(peak)} today. About ${Math.max(8, Math.round(200 / peak))} minutes to burn at the peak.`;
  const base = uvLine(cur);
  if (hasPeak && peak >= 3 && cur < peak - 0.4) return `${base} Peaks near ${shownUv(peak)} today.`;
  return base;
}
