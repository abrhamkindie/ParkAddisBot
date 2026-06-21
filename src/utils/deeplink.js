import { config } from '../config/index.js';

// Deep link the owner scans to check a booking in. Opens the bot with the
// payload, which start.js routes to the check-in handler.
export function checkinLink(token) {
  return `https://t.me/${config.botUsername}?start=checkin_${token}`;
}
