/**
 * Session flow constants and typed helpers for bot conversation state.
 *
 * Provides named constants for all multi-step flows so string literals are
 * never scattered across handlers.
 *
 * @module bot/utils/session
 */

import { getSession, setSession, clearSession } from '../session.js';

// ── Flow names ─────────────────────────────────────────────────────────────

/** @readonly @enum {string} */
export const Flow = {
  /** Host listing a new spot wizard (steps: location → address → price → capacity → amenities → photo) */
  LIST_SPOT: 'list_spot',
  /** Host editing a spot price (single step) */
  EDIT_PRICE: 'edit_price',
  /** Booking just confirmed, awaiting payment selection */
  BOOKING_COMPLETE: 'booking_complete',
  /** Payment in progress (method selected, awaiting confirmation/receipt) */
  PAYMENT: 'payment',
  /** Rating flow — awaiting comment after score selection */
  RATING: 'rating',
};

// ── Step names ─────────────────────────────────────────────────────────────

/** @readonly @enum {string} */
export const ListingStep = {
  LOCATION: 'location',
  ADDRESS: 'address',
  PRICE: 'price',
  CAPACITY: 'capacity',
  AMENITIES: 'amenities',
  PHOTO: 'photo',
};

// ── Payment method constants ───────────────────────────────────────────────

/** @readonly @enum {string} */
export const PaymentMethod = {
  CHAPA: 'chapa',
  MANUAL: 'manual',
};

// ── Typed accessors ────────────────────────────────────────────────────────

/**
 * Safely retrieves the current session for a user.
 * @param {number|string} userId - Telegram user ID
 * @returns {import('../session.js').BotSession|null}
 */
export function getFlowSession(userId) {
  return getSession(userId);
}

/**
 * Sets the session for a user.
 * @param {number|string} userId - Telegram user ID
 * @param {import('../session.js').BotSession} data - Session data
 * @returns {import('../session.js').BotSession}
 */
export function setFlowSession(userId, data) {
  return setSession(userId, data);
}

/**
 * Clears the session for a user.
 * @param {number|string} userId - Telegram user ID
 */
export function clearFlowSession(userId) {
  clearSession(userId);
}

/**
 * Type guard — checks if the user is currently in the given flow.
 * @param {import('../session.js').BotSession|null} session
 * @param {string} flow - Expected flow name (from {@link Flow})
 * @returns {boolean}
 */
export function isInFlow(session, flow) {
  return session != null && session.flow === flow;
}

/**
 * Checks if the user is at a specific step within their current flow.
 * @param {import('../session.js').BotSession|null} session
 * @param {string} step - Expected step name
 * @returns {boolean}
 */
export function isAtStep(session, step) {
  return session != null && session.step === step;
}
