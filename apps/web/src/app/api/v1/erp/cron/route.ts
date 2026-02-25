import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { runCloseOrchestrator } from '@oppsera/module-accounting';
import type { RequestContext } from '@oppsera/core/auth/context';

/**
 * POST /api/v1/erp/cron — Vercel Cron trigger for auto-close and day-end close.
 *
 * Called every 15 minutes by Vercel Cron. For each tenant with auto_close_enabled
 * or day_end_close_enabled, checks if the current time in the tenant's timezone
 * falls within the 15-minute window of the configured close time, then triggers
 * the close orchestrator.
 *
 * Auth: CRON_SECRET header (not user auth — this is a system job).
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results: Array<{
    tenantId: string;
    trigger: 'auto_close' | 'day_end_close';
    businessDate: string;
    status: string;
    error?: string;
  }> = [];

  try {
    // Query all tenants that have either auto-close or day-end close enabled,
    // joined with their primary location's timezone.
    const rows = await db.execute(sql`
      SELECT
        s.tenant_id,
        s.auto_close_enabled,
        s.auto_close_time,
        s.auto_close_skip_holidays,
        s.day_end_close_enabled,
        s.day_end_close_time,
        COALESCE(
          (SELECT l.timezone FROM locations l WHERE l.tenant_id = s.tenant_id LIMIT 1),
          'America/New_York'
        ) AS timezone
      FROM accounting_settings s
      JOIN tenants t ON t.id = s.tenant_id AND t.status = 'active'
      WHERE s.auto_close_enabled = true OR s.day_end_close_enabled = true
    `);

    const tenants = Array.from(rows as Iterable<Record<string, unknown>>);

    for (const tenant of tenants) {
      const tenantId = String(tenant.tenant_id);
      const timezone = String(tenant.timezone);

      // Get the current time in the tenant's timezone
      const tenantNow = getTenantLocalTime(now, timezone);
      const tenantHHMM = `${String(tenantNow.hours).padStart(2, '0')}:${String(tenantNow.minutes).padStart(2, '0')}`;

      // Check auto-close (runs the full close orchestrator — posts drafts, checks all steps)
      if (tenant.auto_close_enabled) {
        const autoCloseTime = String(tenant.auto_close_time ?? '02:00');
        if (isWithinWindow(tenantHHMM, autoCloseTime, 15)) {
          // Business date for auto-close is "yesterday" if close time is after midnight
          const businessDate = computeBusinessDateForClose(tenantNow, autoCloseTime);

          // Check idempotency — don't re-run if already ran for this business date
          const existingRun = await db.execute(sql`
            SELECT id FROM erp_close_orchestrator_runs
            WHERE tenant_id = ${tenantId}
              AND business_date = ${businessDate}
              AND triggered_by = 'auto'
              AND location_id IS NULL
            LIMIT 1
          `);
          const existing = Array.from(existingRun as Iterable<Record<string, unknown>>);

          if (existing.length === 0) {
            try {
              const ctx = buildSystemContext(tenantId);
              const result = await runCloseOrchestrator(ctx, { businessDate });
              results.push({
                tenantId,
                trigger: 'auto_close',
                businessDate,
                status: result.status,
              });
            } catch (err) {
              results.push({
                tenantId,
                trigger: 'auto_close',
                businessDate,
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            }
          }
        }
      }

      // Check day-end close (same orchestrator, different trigger time + triggeredBy label)
      if (tenant.day_end_close_enabled) {
        const dayEndCloseTime = String(tenant.day_end_close_time ?? '23:00');
        if (isWithinWindow(tenantHHMM, dayEndCloseTime, 15)) {
          // Day-end close uses "today" as the business date (closing out the current day)
          const businessDate = formatDate(tenantNow.year, tenantNow.month, tenantNow.day);

          const existingRun = await db.execute(sql`
            SELECT id FROM erp_close_orchestrator_runs
            WHERE tenant_id = ${tenantId}
              AND business_date = ${businessDate}
              AND triggered_by = 'day_end'
              AND location_id IS NULL
            LIMIT 1
          `);
          const existing = Array.from(existingRun as Iterable<Record<string, unknown>>);

          if (existing.length === 0) {
            try {
              const ctx = buildSystemContext(tenantId, 'day_end');
              const result = await runCloseOrchestrator(ctx, { businessDate });
              results.push({
                tenantId,
                trigger: 'day_end_close',
                businessDate,
                status: result.status,
              });
            } catch (err) {
              results.push({
                tenantId,
                trigger: 'day_end_close',
                businessDate,
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[erp/cron] Fatal error:', err);
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      checkedAt: now.toISOString(),
      triggered: results.length,
      results,
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────────

interface TenantLocalTime {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

/**
 * Convert a UTC Date to the tenant's local time components using Intl.DateTimeFormat.
 */
function getTenantLocalTime(utcDate: Date, timezone: string): TenantLocalTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
  };
}

/**
 * Check if current HH:MM is within `windowMinutes` of the target HH:MM.
 * E.g., isWithinWindow('02:07', '02:00', 15) → true
 */
function isWithinWindow(currentHHMM: string, targetHHMM: string, windowMinutes: number): boolean {
  const [cH = 0, cM = 0] = currentHHMM.split(':').map(Number);
  const [tH = 0, tM = 0] = targetHHMM.split(':').map(Number);
  const currentMins = cH * 60 + cM;
  const targetMins = tH * 60 + tM;

  // Handle wrap-around midnight (e.g., target=23:50, current=00:05)
  let diff = currentMins - targetMins;
  if (diff < -720) diff += 1440; // wrap forward
  if (diff > 720) diff -= 1440;  // wrap backward

  return diff >= 0 && diff < windowMinutes;
}

/**
 * For auto-close at e.g. 02:00 AM, the business date being closed is "yesterday"
 * (the day that just ended). For times before noon we treat it as closing the
 * previous day. For times at/after noon, it's the current day.
 */
function computeBusinessDateForClose(local: TenantLocalTime, closeTime: string): string {
  const [closeH] = closeTime.split(':').map(Number);

  // If close time is in the early morning (before noon), we're closing "yesterday's" business
  if (closeH < 12) {
    const d = new Date(local.year, local.month - 1, local.day);
    d.setDate(d.getDate() - 1);
    return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return formatDate(local.year, local.month, local.day);
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Build a synthetic system RequestContext for cron-triggered orchestration.
 *
 * The close orchestrator stores `ctx.user.id` as `triggeredBy` in the run record.
 * We set user.id to 'auto' or 'day_end' so the idempotency check can distinguish
 * between cron-triggered auto-close and day-end close runs.
 */
function buildSystemContext(tenantId: string, triggeredBy: string = 'auto'): RequestContext {
  return {
    tenantId,
    locationId: null as unknown as string,
    requestId: `cron-${triggeredBy}-${Date.now()}`,
    user: {
      id: triggeredBy, // 'auto' or 'day_end' — stored as triggeredBy in the run record
      email: 'system@oppsera.com',
      role: 'system' as any,
      tenantId,
    },
    permissions: ['*'],
  } as unknown as RequestContext;
}
