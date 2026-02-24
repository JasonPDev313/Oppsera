import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getBackupSettingsFromDb } from '@/lib/backup/retention-service';

// ── GET /api/v1/admin/backups/settings — Get backup settings ─────

export const GET = withAdminAuth(async () => {
  const settings = await getBackupSettingsFromDb();
  return NextResponse.json({
    data: {
      id: settings.id,
      schedulingEnabled: settings.schedulingEnabled,
      intervalMinutes: settings.intervalMinutes,
      retentionDailyDays: settings.retentionDailyDays,
      retentionWeeklyWeeks: settings.retentionWeeklyWeeks,
      retentionMonthlyMonths: settings.retentionMonthlyMonths,
      storageDriver: settings.storageDriver,
      dualApprovalRequired: settings.dualApprovalRequired,
      lastScheduledBackupAt: settings.lastScheduledBackupAt?.toISOString() ?? null,
    },
  });
}, 'super_admin');

// ── PATCH /api/v1/admin/backups/settings — Update settings ───────

const updateSchema = z.object({
  schedulingEnabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  retentionDailyDays: z.number().int().min(1).max(365).optional(),
  retentionWeeklyWeeks: z.number().int().min(1).max(52).optional(),
  retentionMonthlyMonths: z.number().int().min(1).max(120).optional(),
  storageDriver: z.enum(['local']).optional(),
  dualApprovalRequired: z.boolean().optional(),
});

export const PATCH = withAdminAuth(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (updates.schedulingEnabled !== undefined) {
    setClauses.push(`scheduling_enabled = $${paramIdx}`);
    values.push(updates.schedulingEnabled);
    paramIdx++;
  }
  if (updates.intervalMinutes !== undefined) {
    setClauses.push(`interval_minutes = $${paramIdx}`);
    values.push(updates.intervalMinutes);
    paramIdx++;
  }
  if (updates.retentionDailyDays !== undefined) {
    setClauses.push(`retention_daily_days = $${paramIdx}`);
    values.push(updates.retentionDailyDays);
    paramIdx++;
  }
  if (updates.retentionWeeklyWeeks !== undefined) {
    setClauses.push(`retention_weekly_weeks = $${paramIdx}`);
    values.push(updates.retentionWeeklyWeeks);
    paramIdx++;
  }
  if (updates.retentionMonthlyMonths !== undefined) {
    setClauses.push(`retention_monthly_months = $${paramIdx}`);
    values.push(updates.retentionMonthlyMonths);
    paramIdx++;
  }
  if (updates.storageDriver !== undefined) {
    setClauses.push(`storage_driver = $${paramIdx}`);
    values.push(updates.storageDriver);
    paramIdx++;
  }
  if (updates.dualApprovalRequired !== undefined) {
    setClauses.push(`dual_approval_required = $${paramIdx}`);
    values.push(updates.dualApprovalRequired);
    paramIdx++;
  }

  if (setClauses.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } },
      { status: 400 },
    );
  }

  setClauses.push(`updated_at = NOW()`);

  await db.execute(
    sql.raw(`UPDATE platform_backup_settings SET ${setClauses.join(', ')} WHERE id = 'default'`),
    values as never,
  );

  const settings = await getBackupSettingsFromDb();
  return NextResponse.json({
    data: {
      id: settings.id,
      schedulingEnabled: settings.schedulingEnabled,
      intervalMinutes: settings.intervalMinutes,
      retentionDailyDays: settings.retentionDailyDays,
      retentionWeeklyWeeks: settings.retentionWeeklyWeeks,
      retentionMonthlyMonths: settings.retentionMonthlyMonths,
      storageDriver: settings.storageDriver,
      dualApprovalRequired: settings.dualApprovalRequired,
      lastScheduledBackupAt: settings.lastScheduledBackupAt?.toISOString() ?? null,
    },
  });
}, 'super_admin');
