// Small geo formatting helpers.

// Human-readable distance: "320 m" or "1.4 km".
export function formatDistance(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Build an OpenStreetMap link for a coordinate (no API key needed).
export function osmLink(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}
