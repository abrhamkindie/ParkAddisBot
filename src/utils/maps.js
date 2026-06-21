// Google Maps directions deep link to a destination. Opens the user's default
// maps app with turn-by-turn nav (origin = the user's current location).
export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
