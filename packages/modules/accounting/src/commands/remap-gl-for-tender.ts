import { sql, eq, and } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { EventEnvelope } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
import { voidJournalEntry } from './void-journal-entry';
import { handleTenderForAccounting } from '../adapters/pos-posting-adapter';
import { handleTenderReversalForAccounting } from '../adapters/tender-reversal-posting-adapter';

export interface RemapResult {
  tenderId: string;
  success: boolean;
  voidedEntryId?: string;
  newEntryId?: string;
  resolvedEventCount?: number;
  error?: string;
}

/**
 * Retroactively remap GL for a single tender:
 *   1. Void the original posted GL entry (if one exists)
 *   2. Reconstruct the tender event payload via ReconciliationReadApi
 *   3. Re-run handleTenderForAccounting (which now posts with current mappings)
 *   4. Mark related gl_unmapped_events as resolved
 *
 * For posting_error events (no GL entry ever created), skips the void step
 * and posts fresh.
 */
export async function remapGlForTender(
  ctx: RequestContext,
  tenderId: string,
  reason?: string,
): Promise<RemapResult> {
  const voidReason = reason ?? 'GL remap: retroactive mapping correction';

  // 1. Find the original posted GL entry for this tender (may not exist for posting_error)
  const [originalEntry] = await db
    .select({ id: glJournalEntries.id, status: glJournalEntries.status })
    .from(glJournalEntries)
    .where(
      and(
        eq(glJournalEntries.tenantId, ctx.tenantId),
        eq(glJournalEntries.sourceReferenceId, tenderId),
        eq(glJournalEntries.status, 'posted'),
      ),
    )
    .limit(1);

  let voidedEntryId: string | undefined;

  // 2. Void the original entry if it exists (skip for posting_error scenarios)
  if (originalEntry) {
    try {
      await voidJournalEntry(ctx, originalEntry.id, voidReason);
      voidedEntryId = originalEntry.id;
    } catch (error) {
      return {
        tenderId,
        success: false,
        error: `Failed to void GL entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // 3. Reconstruct tender payload via ReconciliationReadApi
  const api = getReconciliationReadApi();
  const tenderData = await api.getTenderForGlRepost(ctx.tenantId, tenderId);

  if (!tenderData) {
    return {
      tenderId,
      success: false,
      voidedEntryId,
      error: 'Could not reconstruct tender data for GL repost',
    };
  }

  // 4. Build a synthetic event envelope and re-run the POS adapter
  const syntheticEvent: EventEnvelope = {
    eventId: generateUlid(),
    eventType: 'tender.recorded.v1',
    occurredAt: new Date().toISOString(),
    tenantId: ctx.tenantId,
    locationId: tenderData.locationId,
    actorUserId: ctx.user.id,
    idempotencyKey: `remap-${tenderId}-${Date.now()}`,
    data: {
      tenderId: tenderData.tenderId,
      orderId: tenderData.orderId,
      tenantId: tenderData.tenantId,
      locationId: tenderData.locationId,
      tenderType: tenderData.tenderType,
      paymentMethod: tenderData.paymentMethod,
      amount: tenderData.amount,
      tipAmount: tenderData.tipAmount,
      customerId: tenderData.customerId,
      terminalId: tenderData.terminalId,
      tenderSequence: tenderData.tenderSequence,
      isFullyPaid: tenderData.isFullyPaid,
      orderTotal: tenderData.orderTotal,
      subtotal: tenderData.subtotal,
      taxTotal: tenderData.taxTotal,
      discountTotal: tenderData.discountTotal,
      serviceChargeTotal: tenderData.serviceChargeTotal,
      totalTendered: tenderData.totalTendered,
      businessDate: tenderData.businessDate,
      lines: tenderData.lines,
    },
  };

  // Re-run the POS adapter — it will use current mappings
  // The unique index fix (migration 0142) now excludes voided entries,
  // so the new posting won't collide with the voided one.
  await handleTenderForAccounting(syntheticEvent);

  // 5. Find the newly created GL entry
  const [newEntry] = await db
    .select({ id: glJournalEntries.id })
    .from(glJournalEntries)
    .where(
      and(
        eq(glJournalEntries.tenantId, ctx.tenantId),
        eq(glJournalEntries.sourceReferenceId, tenderId),
        eq(glJournalEntries.status, 'posted'),
      ),
    )
    .limit(1);

  // 6. Re-process any reversal_no_original events for this tender.
  //    Now that the tender has a GL entry, the reversal adapter can find
  //    the original and post the reversal correctly.
  const pendingReversals = await db.execute(sql`
    SELECT id, source_reference_id AS reversal_id
    FROM gl_unmapped_events
    WHERE tenant_id = ${ctx.tenantId}
      AND entity_id = ${tenderId}
      AND entity_type = 'reversal_no_original'
      AND resolved_at IS NULL
  `);
  const reversalRows = Array.from(pendingReversals as Iterable<Record<string, unknown>>);

  for (const row of reversalRows) {
    const reversalId = String(row.reversal_id);
    try {
      const reversalData = await api.getReversalForGlRepost(ctx.tenantId, reversalId);
      if (reversalData) {
        const reversalEvent: EventEnvelope = {
          eventId: generateUlid(),
          eventType: 'tender.reversed.v1',
          occurredAt: new Date().toISOString(),
          tenantId: ctx.tenantId,
          locationId: reversalData.locationId,
          actorUserId: ctx.user.id,
          idempotencyKey: `remap-reversal-${reversalId}`,
          data: {
            reversalId: reversalData.reversalId,
            originalTenderId: reversalData.originalTenderId,
            orderId: reversalData.orderId,
            amount: reversalData.amount,
            reason: reversalData.reason,
            reversalType: reversalData.reversalType,
            refundMethod: reversalData.refundMethod,
            businessDate: reversalData.businessDate,
          },
        };
        await handleTenderReversalForAccounting(reversalEvent);

        // Only resolve after successful repost
        await db.execute(sql`
          UPDATE gl_unmapped_events
          SET resolved_at = NOW(),
              resolved_by = ${ctx.user.id},
              resolution_method = 'remapped',
              remapped_journal_entry_id = ${newEntry?.id ?? null}
          WHERE id = ${String(row.id)}
        `);
      } else {
        // Reversal record not found — update reason but leave unresolved
        await db.execute(sql`
          UPDATE gl_unmapped_events
          SET reason = 'reversal_no_original: reversal record not found for repost'
          WHERE id = ${String(row.id)}
        `);
      }
    } catch (err) {
      console.warn(
        `[gl-remap] Failed to re-process reversal ${reversalId} for tender ${tenderId}:`,
        err instanceof Error ? err.message : err,
      );
      // Non-fatal: leave the unmapped event unresolved for manual investigation
    }
  }

  // 7. Mark remaining unmapped events as resolved (excluding reversal_no_original
  //    which were handled individually above)
  const resolveResult = await db.execute(sql`
    UPDATE gl_unmapped_events
    SET resolved_at = NOW(),
        resolved_by = ${ctx.user.id},
        resolution_method = 'remapped',
        remapped_journal_entry_id = ${newEntry?.id ?? null}
    WHERE tenant_id = ${ctx.tenantId}
      AND source_reference_id = ${tenderId}
      AND resolved_at IS NULL
  `);

  const resolvedCount = (resolveResult as any)?.count ?? 0;

  // 8. Audit log
  auditLogDeferred(ctx, 'accounting.gl.remapped', 'tender', tenderId);

  return {
    tenderId,
    success: true,
    voidedEntryId,
    newEntryId: newEntry?.id ?? undefined,
    resolvedEventCount: Number(resolvedCount),
  };
}

/**
 * Batch remap: processes multiple tenders with limited concurrency.
 * Returns results for each tender — never blocks the batch on a single failure.
 *
 * Concurrency is capped at 3 to stay within Vercel's DB pool limits (max: 2
 * connections). Queries interleave across the pool while waiting for responses,
 * giving ~3× throughput vs sequential without exhausting connections.
 */
export async function batchRemapGlForTenders(
  ctx: RequestContext,
  tenderIds: string[],
  reason?: string,
): Promise<RemapResult[]> {
  if (tenderIds.length === 0) return [];

  const CONCURRENCY = 3;
  const results: RemapResult[] = [];

  for (let i = 0; i < tenderIds.length; i += CONCURRENCY) {
    const wave = tenderIds.slice(i, i + CONCURRENCY);
    const waveResults = await Promise.all(
      wave.map((tenderId) =>
        remapGlForTender(ctx, tenderId, reason).catch(
          (error): RemapResult => ({
            tenderId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        ),
      ),
    );
    results.push(...waveResults);
  }

  return results;
}
