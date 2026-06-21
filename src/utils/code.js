import { randomBytes, randomInt } from 'node:crypto';

// Human-friendly confirmation code, e.g. "PK-7F3K9". Avoids ambiguous chars.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateConfirmationCode(prefix = 'PK') {
  let body = '';
  for (let i = 0; i < 5; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${prefix}-${body}`;
}

// Opaque, unguessable token for QR check-in deep links (~22 url-safe chars).
export function generateCheckinToken() {
  return randomBytes(16).toString('base64url');
}
