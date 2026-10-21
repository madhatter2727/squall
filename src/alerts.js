const RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

export function activeAlerts(geo) {
  const features = Array.isArray(geo?.features) ? geo.features : [];
  return features
    .map((feature) => feature?.properties || null)
    .filter((props) => props && props.event)
    .sort((a, b) => (RANK[a.severity] ?? 4) - (RANK[b.severity] ?? 4));
}
