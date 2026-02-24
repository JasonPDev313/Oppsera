import { pgTable, text, boolean, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { platformAdmins } from './platform';

// ── Platform Backups ─────────────────────────────────────────────
// SQL-based database backups. NOT tenant-scoped, NO RLS.
// Each row represents a single backup snapshot (.json.gz file).

export const platformBackups = pgTable(
  'platform_backups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    type: text('type').notNull(),
    // 'manual' | 'scheduled' | 'pre_restore'
    status: text('status').notNull().default('pending'),
    // 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired'
    label: text('label'),
    tableCount: integer('table_count'),
    rowCount: integer('row_count'),
    sizeBytes: integer('size_bytes'),
    checksum: text('checksum'),
    // SHA-256 of the compressed file
    storageDriver: text('storage_driver').notNull().default('local'),
    // 'local' | 's3'
    storagePath: text('storage_path'),
    retentionTag: text('retention_tag'),
    // 'daily' | 'weekly' | 'monthly' | null (transient)
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'),
    // { tableManifest: [...], schemaVersion, pgVersion }
    initiatedByAdminId: text('initiated_by_admin_id')
      .references(() => platformAdmins.id),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_platform_backups_status').on(table.status, table.createdAt),
    index('idx_platform_backups_retention').on(table.retentionTag, table.expiresAt),
  ],
);

// ── Platform Restore Operations ──────────────────────────────────
// One row per restore attempt. Tracks dual-admin approval workflow.

export const platformRestoreOperations = pgTable(
  'platform_restore_operations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    backupId: text('backup_id').notNull()
      .references(() => platformBackups.id),
    status: text('status').notNull().default('pending_approval'),
    // 'pending_approval' | 'approved' | 'in_progress' | 'completed' | 'failed' | 'rejected'
    safetyBackupId: text('safety_backup_id')
      .references(() => platformBackups.id),
    requestedByAdminId: text('requested_by_admin_id').notNull()
      .references(() => platformAdmins.id),
    approvedByAdminId: text('approved_by_admin_id')
      .references(() => platformAdmins.id),
    rejectedByAdminId: text('rejected_by_admin_id')
      .references(() => platformAdmins.id),
    rejectionReason: text('rejection_reason'),
    confirmationPhrase: text('confirmation_phrase'),
    tablesRestored: integer('tables_restored'),
    rowsRestored: integer('rows_restored'),
    errorMessage: text('error_message'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_platform_restores_status').on(table.status, table.createdAt),
    index('idx_platform_restores_backup').on(table.backupId),
  ],
);

// ── Platform Backup Settings ─────────────────────────────────────
// Singleton row — one per system. Controls scheduling, retention, storage.

export const platformBackupSettings = pgTable('platform_backup_settings', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  schedulingEnabled: boolean('scheduling_enabled').notNull().default(false),
  intervalMinutes: integer('interval_minutes').notNull().default(15),
  retentionDailyDays: integer('retention_daily_days').notNull().default(7),
  retentionWeeklyWeeks: integer('retention_weekly_weeks').notNull().default(4),
  retentionMonthlyMonths: integer('retention_monthly_months').notNull().default(12),
  storageDriver: text('storage_driver').notNull().default('local'),
  dualApprovalRequired: boolean('dual_approval_required').notNull().default(true),
  lastScheduledBackupAt: timestamp('last_scheduled_backup_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
