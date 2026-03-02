import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { withDistributedLock } from '@oppsera/core';
import { LOCK_KEYS } from '@oppsera/shared';
import { createBackup } from './backup-service';
import { computeRetentionTag, computeExpiresAt, applyRetentionPolicy, getBackupSettingsFromDb } from './retention-service';

// Lock TTL: 15 minutes — generous since backups can take a while on large DBs.
// If a backup takes longer than this, the lock expires and another instance can try.
const BACKUP_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Check if a scheduled backup is due and run it if so.
 *
 * Uses row-based distributed lock (works with Supavisor, unlike advisory locks).
 * Returns true if a backup was created, false if skipped.
 *
 * Called exclusively from the Vercel Cron route — never from setInterval.
 */
export async function maybeRunScheduledBackup(): Promise<boolean> {
  const settings = await getBackupSettingsFromDb();

  if (!settings.schedulingEnabled) return false;

  // Check if interval has elapsed (quick check before acquiring lock)
  const now = new Date();
  if (settings.lastScheduledBackupAt) {
    const elapsed = now.getTime() - settings.lastScheduledBackupAt.getTime();
    const intervalMs = settings.intervalMinutes * 60 * 1000;
    if (elapsed < intervalMs) return false;
  }

  // Acquire distributed lock — returns null if already held by another instance
  const result = await withDistributedLock(
    LOCK_KEYS.BACKUP_SCHEDULER,
    BACKUP_LOCK_TTL_MS,
    async () => {
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

      // Run retention cleanup (best-effort, non-fatal)
      try {
        await applyRetentionPolicy();
      } catch (err) {
        console.error('[backup-scheduler] Retention cleanup failed:', err);
      }

      return true;
    },
    { trigger: 'cron', businessDate: now.toISOString().split('T')[0] },
  );

  // result is null if lock was not acquired, or the return value of the fn
  if (result === null) {
    console.log('[backup-scheduler] Lock held by another instance, skipping');
    return false;
  }

  return result;
}
