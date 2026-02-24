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
  const setParts: ReturnType<typeof sql>[] = [];

  if (updates.schedulingEnabled !== undefined) {
    setParts.push(sql`scheduling_enabled = ${updates.schedulingEnabled}`);
  }
  if (updates.intervalMinutes !== undefined) {
    setParts.push(sql`interval_minutes = ${updates.intervalMinutes}`);
  }
  if (updates.retentionDailyDays !== undefined) {
    setParts.push(sql`retention_daily_days = ${updates.retentionDailyDays}`);
  }
  if (updates.retentionWeeklyWeeks !== undefined) {
    setParts.push(sql`retention_weekly_weeks = ${updates.retentionWeeklyWeeks}`);
  }
  if (updates.retentionMonthlyMonths !== undefined) {
    setParts.push(sql`retention_monthly_months = ${updates.retentionMonthlyMonths}`);
  }
  if (updates.storageDriver !== undefined) {
    setParts.push(sql`storage_driver = ${updates.storageDriver}`);
  }
  if (updates.dualApprovalRequired !== undefined) {
    setParts.push(sql`dual_approval_required = ${updates.dualApprovalRequired}`);
  }

  if (setParts.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } },
      { status: 400 },
    );
  }

  setParts.push(sql`updated_at = NOW()`);

  await db.execute(
    sql`UPDATE platform_backup_settings SET ${sql.join(setParts, sql`, `)} WHERE id = 'default'`,
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
