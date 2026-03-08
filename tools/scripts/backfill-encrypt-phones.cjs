/**
 * Backfill script: encrypt existing plaintext phone numbers in the users table.
 *
 * This script reads all users with non-null, non-encrypted phone numbers and
 * encrypts them in place using AES-256-GCM (same as field-encryption.ts).
 *
 * Safe to run multiple times — skips already-encrypted values (enc$ prefix).
 *
 * Usage:
 *   PII_ENCRYPTION_KEY=<hex-key> node tools/scripts/backfill-encrypt-phones.cjs
 *
 * Dry run (preview only):
 *   PII_ENCRYPTION_KEY=<hex-key> node tools/scripts/backfill-encrypt-phones.cjs --dry-run
 */
const { createCipheriv, randomBytes } = require('node:crypto');
const postgres = require('postgres');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc$';
const BATCH_SIZE = 500;

// ── Key ─────────────────────────────────────────────────────────

function getEncryptionKey() {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    console.error('ERROR: PII_ENCRYPTION_KEY environment variable is required.');
    console.error('Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  if (raw.length === 64) return Buffer.from(raw, 'hex');
  if (raw.length === 44) return Buffer.from(raw, 'base64');
  console.error('ERROR: PII_ENCRYPTION_KEY must be 32 bytes as hex (64 chars) or base64 (44 chars)');
  process.exit(1);
}

// ── Encrypt (mirrors packages/core/src/security/field-encryption.ts) ──

function encryptField(value, key) {
  if (!value || value.startsWith(ENCRYPTED_PREFIX)) return null; // skip
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return `${ENCRYPTED_PREFIX}${packed.toString('base64')}`;
}

// ── Main ────────────────────────────────────────────────────────

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const connStr = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const sql = postgres(connStr, { max: 2, idle_timeout: 10 });
  const key = getEncryptionKey();

  try {
    // Count rows needing encryption (non-null phone without enc$ prefix)
    const [{ total }] = await sql`
      SELECT count(*)::int AS total
      FROM users
      WHERE phone IS NOT NULL
        AND phone <> ''
        AND phone NOT LIKE 'enc$%'
    `;

    console.log(`Found ${total} users with plaintext phone numbers`);
    if (total === 0) {
      console.log('Nothing to do — all phone numbers are already encrypted or null.');
      process.exit(0);
    }

    if (dryRun) {
      console.log('[DRY RUN] Would encrypt %d phone numbers. No changes made.', total);

      // Show a sample
      const sample = await sql`
        SELECT id, phone
        FROM users
        WHERE phone IS NOT NULL AND phone <> '' AND phone NOT LIKE 'enc$%'
        LIMIT 5
      `;
      for (const row of sample) {
        const encrypted = encryptField(row.phone, key);
        console.log('  %s: "%s" → "%s..."', row.id, row.phone, encrypted.slice(0, 30));
      }
      process.exit(0);
    }

    // Process in batches
    let processed = 0;
    let cursor = '';

    while (processed < total) {
      const rows = cursor
        ? await sql`
            SELECT id, phone
            FROM users
            WHERE phone IS NOT NULL
              AND phone <> ''
              AND phone NOT LIKE 'enc$%'
              AND id > ${cursor}
            ORDER BY id ASC
            LIMIT ${BATCH_SIZE}
          `
        : await sql`
            SELECT id, phone
            FROM users
            WHERE phone IS NOT NULL
              AND phone <> ''
              AND phone NOT LIKE 'enc$%'
            ORDER BY id ASC
            LIMIT ${BATCH_SIZE}
          `;

      if (rows.length === 0) break;

      // Build batch update
      for (const row of rows) {
        const encrypted = encryptField(row.phone, key);
        if (encrypted) {
          await sql`
            UPDATE users
            SET phone = ${encrypted}, updated_at = NOW()
            WHERE id = ${row.id}
              AND phone NOT LIKE 'enc$%'
          `;
          processed++;
        }
      }

      cursor = rows[rows.length - 1].id;
      console.log('  Encrypted %d / %d phone numbers...', processed, total);
    }

    console.log('\nDone! Encrypted %d phone numbers.', processed);

    // Verify
    const [{ remaining }] = await sql`
      SELECT count(*)::int AS remaining
      FROM users
      WHERE phone IS NOT NULL
        AND phone <> ''
        AND phone NOT LIKE 'enc$%'
    `;
    console.log('Remaining plaintext: %d', remaining);

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
