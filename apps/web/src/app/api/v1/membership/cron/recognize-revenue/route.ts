import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withDistributedLock } from '@oppsera/core';
import { LOCK_KEYS } from '@oppsera/shared';

/** Max tenants per cron run — sequential processing on Vercel (pool max: 2). */
const TENANT_CAP = 50;
/** Bail out if wall-clock exceeds this (Vercel Pro function timeout = 60s). */
const TIME_BUDGET_MS = 55_000;
const LOG_PREFIX = '[membership/cron/recognize-revenue]';

/**
 * POST /api/v1/membership/cron/recognize-revenue
 *
 * Daily Vercel Cron trigger for ASC 606 membership dues revenue recognition.
 * For each active tenant with membership accounting settings, runs the
 * recognition batch for all active schedule rows through today's date.
 *
 * Auth: CRON_SECRET bearer token.
 * Schedule: daily at 01:00 UTC (configured in vercel.json).
 */
export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`${LOG_PREFIX} CRON_SECRET is not configured`);
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const throughDate = now.toISOString().split('T')[0]!;

  const lockResult = await withDistributedLock(
    LOCK_KEYS.MEMBERSHIP_REVENUE_RECOGNITION,
    23 * 60 * 60 * 1000, // 23-hour TTL — prevents double-run
    async () => {
      // Query all active tenants that have membership accounting configured
      const rows = await db.execute(sql`
        SELECT DISTINCT mas.tenant_id
        FROM membership_accounting_settings mas
        JOIN tenants t ON t.id = mas.tenant_id AND t.status = 'active'
        LIMIT ${TENANT_CAP + 1}
      `);

      const allTenants = Array.from(rows as Iterable<Record<string, unknown>>);
      const capped = allTenants.length > TENANT_CAP;
      const tenants = allTenants.slice(0, TENANT_CAP);

      const results: Array<{
        tenantId: string;
        throughDate: string;
        processed: number;
        skipped: number;
        totalRecognizedCents: number;
        errors: string[];
        status: string;
        error?: string;
      }> = [];

      for (const tenant of tenants) {
        // Time budget guard — bail before Vercel kills the function
        if (Date.now() - startMs > TIME_BUDGET_MS) {
          console.warn(
            `${LOG_PREFIX} Time budget exhausted after ${results.length} tenant(s) — remaining will be retried next run`,
          );
          break;
        }

        const tenantId = String(tenant.tenant_id);
        try {
          const ctx = buildSystemContext(tenantId);
          const { runMembershipRevenueRecognition } = await import('@oppsera/module-accounting');
          const result = await runMembershipRevenueRecognition(ctx, { throughDate });
          results.push({
            tenantId,
            throughDate,
            ...result,
            status: result.errors.length > 0 ? 'partial' : 'ok',
          });
        } catch (err) {
          results.push({
            tenantId,
            throughDate,
            processed: 0,
            skipped: 0,
            totalRecognizedCents: 0,
            errors: [],
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return { results, capped };
    },
    { trigger: 'vercel-cron' },
  );

  if (lockResult === null) {
    return NextResponse.json({
      data: {
        ranAt: now.toISOString(),
        durationMs: Date.now() - startMs,
        throughDate,
        tenantCount: 0,
        results: [],
        skipped: 'Lock held by another instance',
      },
    });
  }

  return NextResponse.json({
    data: {
      ranAt: now.toISOString(),
      durationMs: Date.now() - startMs,
      throughDate,
      tenantCount: lockResult.results.length,
      capped: lockResult.capped,
      results: lockResult.results,
    },
  });
}

function buildSystemContext(tenantId: string): RequestContext {
  return {
    tenantId,
    locationId: null as unknown as string,
    requestId: `membership-recognition-cron-${Date.now()}`,
    user: {
      id: 'system-cron',
      email: 'system@oppsera.com',
      name: 'System',
      tenantId,
      tenantStatus: 'active' as const,
      membershipStatus: 'none' as const,
    },
    permissions: ['*'],
  } as unknown as RequestContext;
}
