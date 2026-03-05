import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withDistributedLock } from '@oppsera/core';
import { LOCK_KEYS } from '@oppsera/shared';

/** Max batches per cron run — sequential processing on Vercel (pool max: 2). */
const BATCH_CAP = 50;
/** Bail out if wall-clock exceeds this (Vercel Pro function timeout = 60s). */
const TIME_BUDGET_MS = 55_000;
const LOG_PREFIX = '[fnb-auto-close]';

interface BatchRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  location_id: string;
  location_name: string;
  business_date: string;
  status: string;
}

interface BatchResult {
  batchId: string;
  tenantId: string;
  tenantName: string;
  locationId: string;
  locationName: string;
  businessDate: string;
  initialStatus: string;
  finalStatus: string;
  reconciledByJob: boolean;
  postedByJob: boolean;
  openTabCount: number;
  error: string | null;
  errorCode: string | null;
}

/**
 * POST /api/v1/fnb/cron/auto-close-batches
 *
 * Daily Vercel Cron that auto-progresses overdue F&B close batches through
 * the state machine: open/in_progress → reconciled → posted.
 *
 * "Overdue" = business_date < current date in the location's timezone.
 * Does NOT auto-start batches (requires operational data like startingFloatCents).
 * Does NOT force-close open tabs (risk of recognizing revenue for unpaid checks).
 *
 * Auth: CRON_SECRET bearer token.
 * Schedule: daily at 04:00 UTC (configured in vercel.json).
 */
export async function POST(request: NextRequest) {
  const startMs = Date.now();
  const now = new Date();

  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error(`${LOG_PREFIX} CRON_SECRET is not configured`);
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lockResult = await withDistributedLock(
      LOCK_KEYS.FNB_AUTO_CLOSE_BATCHES,
      23 * 60 * 60 * 1000, // 23-hour TTL — prevents double-run within a day
      async () => processOverdueBatches(startMs),
      { trigger: 'vercel-cron' },
    );

    if (lockResult === null) {
      return NextResponse.json({
        data: {
          ranAt: now.toISOString(),
          durationMs: Date.now() - startMs,
          processedCount: 0,
          skipped: 'Lock held by another instance',
        },
      });
    }

    return NextResponse.json({
      data: {
        ranAt: now.toISOString(),
        durationMs: Date.now() - startMs,
        ...lockResult,
      },
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Unhandled error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── Core processing ────────────────────────────────────────────────

async function processOverdueBatches(startMs: number) {
  // Date stamp for idempotency keys — scoped per day so reversed batches
  // can be re-processed on subsequent runs.
  const runDate = new Date().toISOString().split('T')[0]!;

  // Find all overdue F&B batches across active tenants.
  // "Overdue" = business_date is before today in the location's timezone.
  const rows = await db.execute(sql`
    SELECT
      b.id,
      b.tenant_id,
      t.name AS tenant_name,
      b.location_id,
      l.name AS location_name,
      b.business_date,
      b.status
    FROM fnb_close_batches b
    JOIN locations l ON l.id = b.location_id
    JOIN tenants t ON t.id = b.tenant_id AND t.status = 'active'
    WHERE b.status IN ('open', 'in_progress', 'reconciled')
      AND b.business_date < (NOW() AT TIME ZONE COALESCE(l.timezone, 'America/New_York'))::date
    ORDER BY b.business_date ASC
    LIMIT ${BATCH_CAP + 1}
  `);

  const allBatches = Array.from(rows as Iterable<BatchRow>);
  const capped = allBatches.length > BATCH_CAP;
  const batches = allBatches.slice(0, BATCH_CAP);

  if (batches.length === 0) {
    console.log(`${LOG_PREFIX} No overdue batches found`);
    return { processedCount: 0, reconciledCount: 0, postedCount: 0, errorCount: 0, capped: false, results: [] };
  }

  console.log(
    `${LOG_PREFIX} Found ${batches.length} overdue batch(es)${capped ? ` (capped at ${BATCH_CAP}, more remain)` : ''}`,
  );

  // Dynamic import to avoid loading fnb module on every cold start
  const {
    reconcileCloseBatch,
    postBatchToGl,
    CloseBatchStatusConflictError,
    BatchAlreadyPostedError,
    CloseBatchNotFoundError,
  } = await import('@oppsera/module-fnb');

  const results: BatchResult[] = [];

  for (const batch of batches) {
    // Time budget guard — bail before Vercel kills the function
    const elapsed = Date.now() - startMs;
    if (elapsed > TIME_BUDGET_MS) {
      console.warn(
        `${LOG_PREFIX} Time budget exhausted (${elapsed}ms) after ${results.length} batch(es) — ` +
        `${batches.length - results.length} remaining will be retried next run`,
      );
      break;
    }

    const result: BatchResult = {
      batchId: batch.id,
      tenantId: batch.tenant_id,
      tenantName: batch.tenant_name,
      locationId: batch.location_id,
      locationName: batch.location_name,
      businessDate: batch.business_date,
      initialStatus: batch.status,
      finalStatus: batch.status,
      reconciledByJob: false,
      postedByJob: false,
      openTabCount: 0,
      error: null,
      errorCode: null,
    };

    try {
      const ctx = buildSystemContext(batch.tenant_id, batch.location_id);

      // Count open tabs — only relevant when we're about to reconcile (not for already-reconciled)
      if (batch.status === 'open' || batch.status === 'in_progress') {
        const tabRows = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM fnb_tabs
          WHERE tenant_id = ${batch.tenant_id}
            AND location_id = ${batch.location_id}
            AND business_date = ${batch.business_date}
            AND status NOT IN ('closed', 'voided', 'abandoned')
        `);
        const openTabCount = Number(
          Array.from(tabRows as Iterable<Record<string, unknown>>)[0]?.count ?? 0,
        );
        result.openTabCount = openTabCount;

        if (openTabCount > 0) {
          console.warn(
            `${LOG_PREFIX} ${batch.tenant_name} / ${batch.location_name} — batch ${batch.id} ` +
            `(${batch.business_date}) has ${openTabCount} non-closed tab(s). ` +
            `Revenue from these tabs will NOT be included in GL posting.`,
          );
        }
      }

      // ── Reconcile if open/in_progress ──────────────────────────────
      if (batch.status === 'open' || batch.status === 'in_progress') {
        try {
          await reconcileCloseBatch(ctx, {
            closeBatchId: batch.id,
            notes: `Auto-reconciled by system cron (${runDate})`,
            clientRequestId: `fnb-auto-close-${batch.id}-reconcile-${runDate}`,
          });
          result.reconciledByJob = true;
          result.finalStatus = 'reconciled';
          console.log(
            `${LOG_PREFIX} Reconciled batch ${batch.id} — ${batch.tenant_name} / ${batch.location_name} (${batch.business_date})`,
          );
        } catch (reconcileErr) {
          if (reconcileErr instanceof CloseBatchStatusConflictError) {
            // Race: someone reconciled between our query and this command — continue to post
            console.log(`${LOG_PREFIX} Batch ${batch.id} already reconciled, skipping reconcile step`);
            result.finalStatus = 'reconciled';
          } else if (reconcileErr instanceof CloseBatchNotFoundError) {
            // Batch deleted between query and command — skip entirely
            console.warn(`${LOG_PREFIX} Batch ${batch.id} no longer exists, skipping`);
            result.error = 'Batch not found (deleted between discovery and processing)';
            result.errorCode = 'CLOSE_BATCH_NOT_FOUND';
            results.push(result);
            continue;
          } else {
            throw reconcileErr;
          }
        }
      }

      // ── Post to GL ─────────────────────────────────────────────────
      try {
        await postBatchToGl(ctx, {
          closeBatchId: batch.id,
          clientRequestId: `fnb-auto-close-${batch.id}-post-${runDate}`,
        });
        result.postedByJob = true;
        result.finalStatus = 'posted';
        console.log(
          `${LOG_PREFIX} Posted batch ${batch.id} to GL — ${batch.tenant_name} / ${batch.location_name} (${batch.business_date})`,
        );
      } catch (postErr) {
        if (postErr instanceof BatchAlreadyPostedError) {
          // Real GL ULID already exists — batch is done, not an error
          console.log(`${LOG_PREFIX} Batch ${batch.id} already posted to GL`);
          result.finalStatus = 'posted';
        } else if (postErr instanceof CloseBatchNotFoundError) {
          console.warn(`${LOG_PREFIX} Batch ${batch.id} or its summary not found during GL post`);
          result.error = 'Batch or summary not found during GL posting';
          result.errorCode = 'CLOSE_BATCH_NOT_FOUND';
        } else if (postErr instanceof CloseBatchStatusConflictError) {
          // Batch not in 'reconciled' state — reconcile may have failed silently
          console.error(`${LOG_PREFIX} Batch ${batch.id} not in reconciled state for GL post`);
          result.error = 'Batch not in reconciled state — reconcile step may have failed';
          result.errorCode = 'CLOSE_BATCH_STATUS_CONFLICT';
        } else {
          throw postErr;
        }
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Unknown error';
      result.errorCode = (err as { code?: string }).code ?? null;
      console.error(
        `${LOG_PREFIX} Failed to process batch ${batch.id} (${batch.tenant_name} / ${batch.location_name}): ${result.error}`,
      );
    }

    results.push(result);
  }

  const summary = {
    processedCount: results.length,
    reconciledCount: results.filter((r) => r.reconciledByJob).length,
    postedCount: results.filter((r) => r.postedByJob).length,
    errorCount: results.filter((r) => r.error !== null).length,
    capped,
    results,
  };

  console.log(
    `${LOG_PREFIX} Done — processed=${summary.processedCount} reconciled=${summary.reconciledCount} ` +
    `posted=${summary.postedCount} errors=${summary.errorCount} elapsed=${Date.now() - startMs}ms`,
  );

  return summary;
}

// ── Helpers ────────────────────────────────────────────────────────

function buildSystemContext(tenantId: string, locationId: string): RequestContext {
  return {
    tenantId,
    locationId,
    requestId: `cron-fnb-auto-close-${Date.now()}`,
    user: {
      id: 'fnb-auto-close',
      email: 'system@oppsera.com',
      name: 'System',
      tenantId,
      tenantStatus: 'active' as const,
      membershipStatus: 'none' as const,
    },
    permissions: ['*'],
  } as unknown as RequestContext;
}
