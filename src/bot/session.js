/**
 * @typedef {Object|null} BotSession
 * @property {string} flow - Current flow name (e.g. "list_spot", "edit_price", "payment")
 * @property {string} [step] - Current step within the flow (e.g. "location", "price")
 * @property {Object} [draft] - Accumulated draft data (host listing wizard)
 * @property {number} [draft.lat] - Spot latitude
 * @property {number} [draft.lng] - Spot longitude
 * @property {string} [draft.address] - Spot address
 * @property {number} [draft.price] - Price per hour
 * @property {number} [draft.capacity] - Number of cars
 * @property {boolean} [draft.covered] - Covered parking
 * @property {boolean} [draft.guarded] - Guarded parking
 * @property {boolean} [draft.ev_charging] - EV charging available
 * @property {string|null} [draft.photoFileId] - Telegram file ID for spot photo
 * @property {number} [spotId] - Spot ID (edit_price flow)
 * @property {number} [bookingId] - Booking ID (payment flow)
 * @property {number} [paymentId] - Payment ID (payment flow)
 * @property {string} [txRef] - Chapa transaction reference (payment flow)
 * @property {string} [method] - Payment method ("chapa" | "manual")
 * @property {boolean} [waitingForReceipt] - Awaiting receipt photo (manual payment)
 * @property {Object} [rateState] - Rating state
 * @property {number} [rateState.bookingId] - Booking being rated
 * @property {number} [rateState.score] - Selected rating score
 */

// Minimal in-memory conversation state, keyed by Telegram user id. Used by the
// multi-step host flows (list a spot, edit a price) to remember which step the
// user is on between messages. State is intentionally ephemeral — a bot restart
// just drops any half-finished draft, which is fine for these short flows.
const sessions = new Map();

/**
 * Retrieves the current session for a user.
 * @param {number|string} userId - Telegram user ID
 * @returns {BotSession}
 */
export function getSession(userId) {
  return sessions.get(userId) || null;
}

/**
 * Sets the session data for a user.
 * @param {number|string} userId - Telegram user ID
 * @param {BotSession} data - Session data
 * @returns {BotSession}
 */
export function setSession(userId, data) {
  sessions.set(userId, data);
  return data;
}

/**
 * Clears the session for a user.
 * @param {number|string} userId - Telegram user ID
 */
export function clearSession(userId) {
  sessions.delete(userId);
}
