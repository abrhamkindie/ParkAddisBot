// Pure parsers/validators for the host listing wizard. Each returns the cleaned
// value or null when the input is invalid, so handlers can re-prompt.

// Price per hour: a positive number under a sane ceiling. Accepts "40", "40.5",
// "40 ETB", "40 birr" — strips non-numeric trailing text.
export function parsePrice(text) {
  // Keep the sign so "-5" parses negative and gets rejected below, while still
  // tolerating currency text like "40 ETB" or "ETB 40".
  const n = parseFloat(String(text).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n >= 100000) return null;
  return Math.round(n * 100) / 100;
}

// Capacity: a whole number of cars, 1..1000.
export function parseCapacity(text) {
  const n = parseInt(String(text).replace(/[^\d]/g, ''), 10);
  if (!Number.isInteger(n) || n < 1 || n > 1000) return null;
  return n;
}
