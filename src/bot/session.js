// Minimal in-memory conversation state, keyed by Telegram user id. Used by the
// multi-step host flows (list a spot, edit a price) to remember which step the
// user is on between messages. State is intentionally ephemeral — a bot restart
// just drops any half-finished draft, which is fine for these short flows.
const sessions = new Map();

export function getSession(userId) {
  return sessions.get(userId) || null;
}

export function setSession(userId, data) {
  sessions.set(userId, data);
  return data;
}

export function clearSession(userId) {
  sessions.delete(userId);
}
