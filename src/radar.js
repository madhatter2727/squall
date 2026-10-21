import L from "leaflet";
import "leaflet/dist/leaflet.css";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

const DARK =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

export function mountRadar(el, { lat, lon, name, host, frames, onFrame }) {
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    zoomSnap: 0.25,
    minZoom: 4,
    maxZoom: 11,
  }).setView([lat, lon], 6);

  map.attributionControl.setPrefix(false);

  L.tileLayer(DARK, {
    attribution: "© Esri, OSM, RainViewer",
    maxZoom: 16,
  }).addTo(map);

  const layers = frames.map((frame) => {
    const layer = L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0,
      maxZoom: 12,
      tileSize: 256,
      zIndex: 2,
    });
    layer.addTo(map);
    return layer;
  });

  L.tileLayer(LABELS, { maxZoom: 16, opacity: 0.9, zIndex: 3 }).addTo(map);

  const icon = L.divIcon({
    className: "pin",
    html: `<span class="pin-dot" aria-label="${esc(name)}"></span>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
  L.marker([lat, lon], { icon, interactive: false, keyboard: false }).addTo(map);

  let index = Math.max(0, frames.length - 1);

  function show(next) {
    if (!frames.length) return null;
    index = Math.max(0, Math.min(frames.length - 1, next));
    layers.forEach((layer, i) => layer.setOpacity(i === index ? 0.88 : 0));
    const frame = frames[index];
    if (onFrame) onFrame(frame, index);
    return frame;
  }

  show(index);
  requestAnimationFrame(() => map.invalidateSize());

  return {
    show,
    get index() {
      return index;
    },
    get count() {
      return frames.length;
    },
    destroy() {
      map.remove();
    },
  };
}
