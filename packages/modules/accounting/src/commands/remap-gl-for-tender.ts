import { sql, eq, and, isNull } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { EventEnvelope } from '@oppsera/shared';
import { generateUlid, AppError } from '@oppsera/shared';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
import { voidJournalEntry } from './void-journal-entry';
import { handleTenderForAccounting } from '../adapters/pos-posting-adapter';

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
 *   1. Void the original posted GL entry
 *   2. Reconstruct the tender event payload via ReconciliationReadApi
 *   3. Re-run handleTenderForAccounting (which now posts with current mappings)
 *   4. Mark related gl_unmapped_events as resolved
 */
export async function remapGlForTender(
  ctx: RequestContext,
  tenderId: string,
  reason?: string,
): Promise<RemapResult> {
  const voidReason = reason ?? 'GL remap: retroactive mapping correction';

  // 1. Find the original posted GL entry for this tender
  const [originalEntry] = await db
    .select({ id: glJournalEntries.id, status: glJournalEntries.status })
    .from(glJournalEntries)
    .where(
      and(
        eq(glJournalEntries.tenantId, ctx.tenantId),
        eq(glJournalEntries.sourceModule, 'pos'),
        eq(glJournalEntries.sourceReferenceId, tenderId),
        eq(glJournalEntries.status, 'posted'),
      ),
    )
    .limit(1);

  if (!originalEntry) {
    return {
      tenderId,
      success: false,
      error: 'No posted GL entry found for this tender',
    };
  }

  // 2. Void the original entry
  try {
    await voidJournalEntry(ctx, originalEntry.id, voidReason);
  } catch (error) {
    return {
      tenderId,
      success: false,
      error: `Failed to void GL entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // 3. Reconstruct tender payload via ReconciliationReadApi
  const api = getReconciliationReadApi();
  const tenderData = await api.getTenderForGlRepost(ctx.tenantId, tenderId);

  if (!tenderData) {
    return {
      tenderId,
      success: false,
      voidedEntryId: originalEntry.id,
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
        eq(glJournalEntries.sourceModule, 'pos'),
        eq(glJournalEntries.sourceReferenceId, tenderId),
        eq(glJournalEntries.status, 'posted'),
      ),
    )
    .limit(1);

  // 6. Mark related unmapped events as resolved
  const resolveResult = await db.execute(sql`
    UPDATE gl_unmapped_events
    SET resolved_at = NOW(),
        resolved_by = ${ctx.user.id},
        resolution_method = 'remapped',
        remapped_journal_entry_id = ${newEntry?.id ?? null}
    WHERE tenant_id = ${ctx.tenantId}
      AND source_reference_id = ${tenderId}
      AND source_module = 'pos'
      AND resolved_at IS NULL
  `);

  const resolvedCount = (resolveResult as any)?.count ?? 0;

  // 7. Audit log
  await auditLog(ctx, 'accounting.gl.remapped', 'tender', tenderId);

  return {
    tenderId,
    success: true,
    voidedEntryId: originalEntry.id,
    newEntryId: newEntry?.id ?? undefined,
    resolvedEventCount: Number(resolvedCount),
  };
}

/**
 * Batch remap: processes multiple tenders, catches errors per-tender.
 * Returns results for each tender — never blocks the batch on a single failure.
 */
export async function batchRemapGlForTenders(
  ctx: RequestContext,
  tenderIds: string[],
  reason?: string,
): Promise<RemapResult[]> {
  const results: RemapResult[] = [];

  for (const tenderId of tenderIds) {
    try {
      const result = await remapGlForTender(ctx, tenderId, reason);
      results.push(result);
    } catch (error) {
      results.push({
        tenderId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
