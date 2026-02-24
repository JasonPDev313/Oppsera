import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'PAYMENT_ENCRYPTION_KEY environment variable is required for credential encryption',
    );
  }
  // Key must be 32 bytes (256 bits) — accept hex or base64
  if (key.length === 64) return Buffer.from(key, 'hex');
  if (key.length === 44) return Buffer.from(key, 'base64');
  throw new Error(
    'PAYMENT_ENCRYPTION_KEY must be 32 bytes encoded as hex (64 chars) or base64 (44 chars)',
  );
}

/**
 * Encrypt a credentials object (site, username, password) using AES-256-GCM.
 * Returns a string: base64(iv + authTag + ciphertext)
 */
export function encryptCredentials(credentials: {
  site: string;
  username: string;
  password: string;
}): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (16) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a credentials blob back to the original object.
 */
export function decryptCredentials(encryptedBlob: string): {
  site: string;
  username: string;
  password: string;
} {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedBlob, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}
