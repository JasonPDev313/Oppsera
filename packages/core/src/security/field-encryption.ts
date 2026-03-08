/**
 * Application-level field encryption for PII at rest.
 *
 * Uses AES-256-GCM (same algorithm as payment credential encryption) with a
 * separate key (PII_ENCRYPTION_KEY) to isolate PII encryption from payment
 * credential encryption — compromise of one key doesn't expose the other.
 *
 * Encrypted values are stored with an `enc$` prefix so reads can distinguish
 * encrypted from plaintext data (graceful migration — old rows work as-is).
 *
 * For searchable encrypted fields, use `blindIndex()` to create a deterministic
 * HMAC-SHA256 hash that can be stored alongside the encrypted value for lookups.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc$';

// ── Key Management ──────────────────────────────────────────────

let _encryptionKey: Buffer | null = null;
let _hmacKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_encryptionKey) return _encryptionKey;
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'PII_ENCRYPTION_KEY environment variable is required for field encryption. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (raw.length === 64) _encryptionKey = Buffer.from(raw, 'hex');
  else if (raw.length === 44) _encryptionKey = Buffer.from(raw, 'base64');
  else {
    throw new Error(
      'PII_ENCRYPTION_KEY must be 32 bytes encoded as hex (64 chars) or base64 (44 chars)',
    );
  }
  return _encryptionKey;
}

function getHmacKey(): Buffer {
  if (_hmacKey) return _hmacKey;
  // Derive HMAC key from encryption key + fixed context to ensure deterministic
  // hashing while keeping the HMAC key separate from the encryption key.
  const hmac = createHmac('sha256', getEncryptionKey());
  hmac.update('oppsera-pii-blind-index-v1');
  _hmacKey = hmac.digest();
  return _hmacKey;
}

// ── Encryption / Decryption ─────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: `enc$<base64(iv + authTag + ciphertext)>`
 *
 * Returns null/undefined pass-through for nullable fields.
 */
export function encryptField(value: string): string;
export function encryptField(value: string | null): string | null;
export function encryptField(value: string | undefined): string | undefined;
export function encryptField(value: string | null | undefined): string | null | undefined;
export function encryptField(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (value === '') return value;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([iv, authTag, encrypted]);
  return `${ENCRYPTED_PREFIX}${packed.toString('base64')}`;
}

/**
 * Decrypt an encrypted field value.
 * If the value doesn't have the `enc$` prefix, returns it as-is (plaintext fallback
 * for pre-encryption data during migration).
 *
 * Returns null/undefined pass-through for nullable fields.
 */
export function decryptField(value: string): string;
export function decryptField(value: string | null): string | null;
export function decryptField(value: string | undefined): string | undefined;
export function decryptField(value: string | null | undefined): string | null | undefined;
export function decryptField(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (value === '') return value;

  // Graceful fallback: if not encrypted, return as-is
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;

  const key = getEncryptionKey();
  const packed = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    // Corrupted — return redacted value rather than crashing
    console.error('[field-encryption] Corrupted encrypted value detected (too short)');
    return '[DECRYPTION_ERROR]';
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    // Auth tag mismatch or key mismatch — data corrupted or wrong key
    console.error('[field-encryption] Decryption failed:', (err as Error).message);
    return '[DECRYPTION_ERROR]';
  }
}

/**
 * Check if a value is encrypted (has the enc$ prefix).
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

// ── Blind Index (for searchable encrypted fields) ───────────────

/**
 * Create a deterministic blind index for an encrypted field value.
 * Uses HMAC-SHA256 so the same plaintext always produces the same hash,
 * enabling WHERE clause lookups without decrypting every row.
 *
 * The blind index reveals nothing about the plaintext without the HMAC key.
 * Store this alongside the encrypted field for search.
 *
 * @param value — The plaintext value (before encryption)
 * @param normalize — Optional normalizer (e.g., toLowerCase for case-insensitive search)
 */
export function blindIndex(value: string, normalize?: (v: string) => string): string {
  const normalized = normalize ? normalize(value) : value;
  const hmac = createHmac('sha256', getHmacKey());
  hmac.update(normalized);
  return hmac.digest('hex');
}

// ── Batch Helpers ───────────────────────────────────────────────

/**
 * Encrypt multiple fields at once. Convenience for encrypting several PII
 * fields before a DB write.
 */
export function encryptFields<T extends Record<string, string | null | undefined>>(
  obj: T,
  fieldNames: (keyof T)[],
): T {
  const result = { ...obj };
  for (const field of fieldNames) {
    const val = result[field];
    if (typeof val === 'string' && val !== '') {
      (result as Record<string, unknown>)[field as string] = encryptField(val);
    }
  }
  return result;
}

/**
 * Decrypt multiple fields at once. Convenience for decrypting PII fields
 * after a DB read.
 */
export function decryptFields<T extends Record<string, string | null | undefined>>(
  obj: T,
  fieldNames: (keyof T)[],
): T {
  const result = { ...obj };
  for (const field of fieldNames) {
    const val = result[field];
    if (typeof val === 'string' && val !== '') {
      (result as Record<string, unknown>)[field as string] = decryptField(val);
    }
  }
  return result;
}

// ── Testing Support ─────────────────────────────────────────────

/** Reset cached keys (for testing only). */
export function _resetKeyCache(): void {
  _encryptionKey = null;
  _hmacKey = null;
}
