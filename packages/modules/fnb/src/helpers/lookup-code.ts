import { randomBytes } from 'node:crypto';

// Uppercase alpha + digits, excluding ambiguous chars: 0/O, 1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates a human-readable lookup code for guest pay sessions.
 * 6 chars from a 30-char alphabet = ~729M combinations.
 */
export function generateLookupCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}
