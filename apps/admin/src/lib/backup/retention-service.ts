import { db } from '@oppsera/db';
import { platformBackups } from '@oppsera/db/schema';
import { sql, eq } from 'drizzle-orm';
import { getBackupStorage } from './storage';

/**
 * Compute the retention tag for a new scheduled backup.
 * - First backup of the month (day 1) → 'monthly'
 * - First backup of the week (Monday) → 'weekly'
 * - First backup of the day → 'daily'
 * - Otherwise → null (transient, expires in 24h)
 */
export function computeRetentionTag(
  now: Date,
  lastScheduledAt: Date | null,
): 'daily' | 'weekly' | 'monthly' | null {
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon

  // First backup of the month
  if (dayOfMonth === 1) {
    if (!lastScheduledAt || lastScheduledAt.getMonth() !== now.getMonth()) {
      return 'monthly';
    }
  }

  // First backup of the week (Monday)
  if (dayOfWeek === 1) {
    if (!lastScheduledAt || getWeekNumber(lastScheduledAt) !== getWeekNumber(now)) {
      return 'weekly';
    }
  }

  // First backup of the day
  if (!lastScheduledAt || lastScheduledAt.toDateString() !== now.toDateString()) {
    return 'daily';
  }

  // Transient (not the first of any period)
  return null;
}

/**
 * Compute the expiration date for a backup based on its retention tag.
 */
export function computeExpiresAt(
  tag: string | null,
  settings: {
    retentionDailyDays: number;
    retentionWeeklyWeeks: number;
    retentionMonthlyMonths: number;
  },
  now: Date = new Date(),
): Date | null {
  if (tag === 'monthly') {
    const d = new Date(now);
    d.setMonth(d.getMonth() + settings.retentionMonthlyMonths);
    return d;
  }
  if (tag === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() + settings.retentionWeeklyWeeks * 7);
    return d;
  }
  if (tag === 'daily') {
    const d = new Date(now);
    d.setDate(d.getDate() + settings.retentionDailyDays);
    return d;
  }
  // Transient: expire in 24 hours
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Apply the retention policy: delete expired backups.
 * Manual and pre_restore backups are never auto-expired.
 * Returns count of deleted backups.
 */
export async function applyRetentionPolicy(): Promise<{ expired: number }> {
  const now = new Date();

  // Find expired scheduled backups
  const result = await db.execute(sql`
    SELECT id, storage_driver, storage_path
    FROM platform_backups
    WHERE expires_at IS NOT NULL
      AND expires_at < ${now.toISOString()}
      AND type = 'scheduled'
      AND status = 'completed'
  `);

  const expired = Array.from(result as Iterable<{
    id: string;
    storage_driver: string;
    storage_path: string | null;
  }>);

  let deletedCount = 0;

  for (const backup of expired) {
    try {
      // Delete storage file
      if (backup.storage_path) {
        const storage = getBackupStorage(backup.storage_driver);
        await storage.delete(backup.storage_path);
      }

      // Delete DB record
      await db.delete(platformBackups).where(eq(platformBackups.id, backup.id));
      deletedCount++;
    } catch (err) {
      console.error(`[retention] Failed to delete backup ${backup.id}:`, err);
    }
  }

  return { expired: deletedCount };
}

/**
 * Get the backup settings singleton.
 */
export async function getBackupSettingsFromDb(): Promise<{
  id: string;
  schedulingEnabled: boolean;
  intervalMinutes: number;
  retentionDailyDays: number;
  retentionWeeklyWeeks: number;
  retentionMonthlyMonths: number;
  storageDriver: string;
  dualApprovalRequired: boolean;
  lastScheduledBackupAt: Date | null;
}> {
  const result = await db.execute(sql`
    SELECT * FROM platform_backup_settings LIMIT 1
  `);
  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  if (rows.length === 0) {
    // Return defaults if no settings row exists
    return {
      id: 'default',
      schedulingEnabled: false,
      intervalMinutes: 15,
      retentionDailyDays: 7,
      retentionWeeklyWeeks: 4,
      retentionMonthlyMonths: 12,
      storageDriver: 'local',
      dualApprovalRequired: true,
      lastScheduledBackupAt: null,
    };
  }

  const row = rows[0]!;
  return {
    id: String(row.id),
    schedulingEnabled: Boolean(row.scheduling_enabled),
    intervalMinutes: Number(row.interval_minutes),
    retentionDailyDays: Number(row.retention_daily_days),
    retentionWeeklyWeeks: Number(row.retention_weekly_weeks),
    retentionMonthlyMonths: Number(row.retention_monthly_months),
    storageDriver: String(row.storage_driver),
    dualApprovalRequired: Boolean(row.dual_approval_required),
    lastScheduledBackupAt: row.last_scheduled_backup_at
      ? new Date(row.last_scheduled_backup_at as string)
      : null,
  };
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
