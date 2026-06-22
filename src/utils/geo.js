// Small geo formatting helpers.

// Human-readable distance: "320 m" or "1.4 km".
export function formatDistance(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Rough walking time at ~80 m/min (a brisk city pace). Always at least 1 min so
// a spot across the street still reads as "1 min walk". Returns minutes (number)
// or null when distance is unknown — callers format via i18n.
export function walkMinutes(meters) {
  if (meters == null) return null;
  return Math.max(1, Math.ceil(meters / 80));
}

// Build an OpenStreetMap link for a coordinate (no API key needed).
export function osmLink(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}
