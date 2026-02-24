import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { createBackup } from './backup-service';
import { computeRetentionTag, computeExpiresAt, applyRetentionPolicy, getBackupSettingsFromDb } from './retention-service';

// Fixed advisory lock ID for backup scheduling (prevents concurrent runs)
const BACKUP_ADVISORY_LOCK_ID = 987654321;

/**
 * Check if a scheduled backup is due and run it if so.
 * Uses PostgreSQL advisory lock to prevent concurrent runs across instances.
 * Returns true if a backup was created.
 */
export async function maybeRunScheduledBackup(): Promise<boolean> {
  const settings = await getBackupSettingsFromDb();

  if (!settings.schedulingEnabled) return false;

  // Check if interval has elapsed
  const now = new Date();
  if (settings.lastScheduledBackupAt) {
    const elapsed = now.getTime() - settings.lastScheduledBackupAt.getTime();
    const intervalMs = settings.intervalMinutes * 60 * 1000;
    if (elapsed < intervalMs) return false;
  }

  // Try to acquire advisory lock (non-blocking)
  const lockResult = await db.execute(
    sql`SELECT pg_try_advisory_lock(${BACKUP_ADVISORY_LOCK_ID}) AS acquired`,
  );
  const lockRows = Array.from(lockResult as Iterable<{ acquired: boolean }>);
  if (!lockRows[0]?.acquired) return false;

  try {
    // Double-check after acquiring lock (another instance may have just run)
    const freshSettings = await getBackupSettingsFromDb();
    if (freshSettings.lastScheduledBackupAt) {
      const elapsed = now.getTime() - freshSettings.lastScheduledBackupAt.getTime();
      const intervalMs = freshSettings.intervalMinutes * 60 * 1000;
      if (elapsed < intervalMs) return false;
    }

    // Compute retention tag
    const retentionTag = computeRetentionTag(now, freshSettings.lastScheduledBackupAt);
    const expiresAt = computeExpiresAt(retentionTag, freshSettings);

    // Create backup
    await createBackup({
      type: 'scheduled',
      label: `Scheduled backup ${now.toISOString()}`,
      retentionTag,
      expiresAt,
    });

    // Update last run time
    await db.execute(sql`
      UPDATE platform_backup_settings
      SET last_scheduled_backup_at = ${now.toISOString()},
          updated_at = ${now.toISOString()}
      WHERE id = ${freshSettings.id}
    `);

    // Run retention cleanup (best-effort)
    try {
      await applyRetentionPolicy();
    } catch (err) {
      console.error('[backup-scheduler] Retention cleanup failed:', err);
    }

    return true;
  } finally {
    // Always release the advisory lock
    await db.execute(sql`SELECT pg_advisory_unlock(${BACKUP_ADVISORY_LOCK_ID})`);
  }
}
