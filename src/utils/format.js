import { config } from '../config/index.js';

// Format a Date/ISO string in Addis Ababa time (UTC+3), e.g. "Jun 21, 14:30".
export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

// Money like "120 ETB" (no trailing .00 when whole).
export function formatMoney(amount) {
  const n = Number(amount);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return s;
}

export const currency = config.business.currency;

// Escape text for Telegram MarkdownV2-free "Markdown" (legacy) — we use plain
// Markdown, so just guard the few chars that break it in our templates.
export function mdEscape(text = '') {
  return String(text).replace(/([_*`\[])/g, '\\$1');
}
