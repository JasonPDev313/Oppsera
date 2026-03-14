import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@oppsera/db';
import { withDistributedLock } from '@oppsera/core';
import { LOCK_KEYS } from '@oppsera/shared';

/** Max tenants per cron run — sequential processing on Vercel (pool max: 2). */
const TENANT_CAP = 50;
/** Bail out if wall-clock exceeds this (Vercel Pro function timeout = 60s). */
const TIME_BUDGET_MS = 55_000;
const LOG_PREFIX = '[smart-tag-cron]';

/**
 * POST /api/v1/customers/smart-tag-rules/cron
 *
 * Vercel Cron endpoint for smart tag scheduled evaluation + expiration.
 *
 * 1. Process scheduled rules (evaluationMode = 'scheduled' or 'hybrid')
 *    where nextScheduledRunAt <= now()
 * 2. Process expired tags (expiresAt <= now() AND removedAt IS NULL)
 * 3. Fire on_expire actions for newly-expired tags
 *
 * Auth: CRON_SECRET header (not user auth — this is a system job).
 * Frequency: Recommended every 15 minutes on Vercel Pro.
 */
export async function POST(request: NextRequest) {
  const startMs = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`${LOG_PREFIX} CRON_SECRET not configured`);
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Acquire distributed lock — prevents concurrent smart-tag cron runs across Vercel instances.
  const lockResult = await withDistributedLock(
    LOCK_KEYS.TAG_EVALUATION_CRON,
    14 * 60 * 1000, // 14-minute TTL (just under 15-minute cron interval)
    async () => {
      const results: TenantCronResult[] = [];

      // Find all active tenants that have the customers entitlement
      const rows = await db.execute(sql`
        SELECT DISTINCT e.tenant_id
        FROM entitlements e
        JOIN tenants t ON t.id = e.tenant_id AND t.status = 'active'
        WHERE e.module_key = 'customers'
          AND e.access_mode IN ('view', 'full')
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
        LIMIT ${TENANT_CAP + 1}
      `);

      const allTenants = Array.from(rows as Iterable<Record<string, unknown>>);
      const capped = allTenants.length > TENANT_CAP;
      const tenants = allTenants.slice(0, TENANT_CAP);

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
          const tenantResult = await processTenant(tenantId);
          results.push(tenantResult);
        } catch (err) {
          console.error(`${LOG_PREFIX} Error processing tenant ${tenantId}:`, err);
          results.push({
            tenantId,
            scheduledRulesProcessed: 0,
            scheduledRulesErrors: 0,
            tagsExpired: 0,
            expireActionsRun: 0,
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
        checkedAt: now.toISOString(),
        durationMs: Date.now() - startMs,
        tenantsChecked: 0,
        totalScheduledRulesProcessed: 0,
        totalTagsExpired: 0,
        results: [],
        skipped: 'Lock held by another instance',
      },
    });
  }

  const { results, capped } = lockResult;
  const durationMs = Date.now() - startMs;
  const totalProcessed = results.reduce((sum, r) => sum + r.scheduledRulesProcessed, 0);
  const totalExpired = results.reduce((sum, r) => sum + r.tagsExpired, 0);

  return NextResponse.json({
    data: {
      checkedAt: now.toISOString(),
      durationMs,
      tenantsChecked: results.length,
      totalScheduledRulesProcessed: totalProcessed,
      totalTagsExpired: totalExpired,
      capped,
      results,
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────

interface TenantCronResult {
  tenantId: string;
  scheduledRulesProcessed: number;
  scheduledRulesErrors: number;
  tagsExpired: number;
  expireActionsRun: number;
  error?: string;
}

// ── Per-Tenant Processing ────────────────────────────────────────────

async function processTenant(tenantId: string): Promise<TenantCronResult> {
  const result: TenantCronResult = {
    tenantId,
    scheduledRulesProcessed: 0,
    scheduledRulesErrors: 0,
    tagsExpired: 0,
    expireActionsRun: 0,
  };

  // 1. Process scheduled smart tag rules
  try {
    const { processScheduledRules } = await import('@oppsera/module-customers');
    const schedResult = await processScheduledRules(tenantId, 50);
    result.scheduledRulesProcessed = schedResult.processed;
    result.scheduledRulesErrors = schedResult.errors;
  } catch (err) {
    console.error(`[smart-tag-cron] Scheduled rules error for tenant ${tenantId}:`, err);
    result.scheduledRulesErrors++;
  }

  // 2. Process expired tags + fire on_expire actions
  try {
    const { processExpiredTags, executeTagActions } = await import('@oppsera/module-customers');

    await withTenant(tenantId, async (tx) => {
      const expResult = await processExpiredTags(tx, tenantId, 200);
      result.tagsExpired = expResult.processed;

      // Fire on_expire actions for each expired tag
      for (const expiredTag of expResult.expired) {
        try {
          await executeTagActions(
            tx,
            tenantId,
            expiredTag.customerId,
            expiredTag.tagId,
            'on_expire',
          );
          result.expireActionsRun++;
        } catch (err) {
          // Per-tag error — log and continue
          console.error(
            `[smart-tag-cron] on_expire action error for tag ${expiredTag.tagId}, customer ${expiredTag.customerId}:`,
            err,
          );
        }
      }
    });
  } catch (err) {
    console.error(`[smart-tag-cron] Expiration processing error for tenant ${tenantId}:`, err);
  }

  return result;
}
