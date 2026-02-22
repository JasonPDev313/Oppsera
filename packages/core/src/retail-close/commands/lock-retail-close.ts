import { eq, and } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { retailCloseBatches } from '@oppsera/db';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import type { RequestContext } from '../../auth/context';
import type { LockRetailCloseInput } from '../validation';
import type { RetailCloseBatch, TenderBreakdownEntry, DepartmentSalesEntry, TaxGroupEntry } from '../types';

function mapRow(row: typeof retailCloseBatches.$inferSelect): RetailCloseBatch {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    businessDate: row.businessDate,
    drawerSessionId: row.drawerSessionId,
    status: row.status as RetailCloseBatch['status'],
    grossSalesCents: row.grossSalesCents,
    netSalesCents: row.netSalesCents,
    taxCollectedCents: row.taxCollectedCents,
    discountTotalCents: row.discountTotalCents,
    voidTotalCents: row.voidTotalCents,
    voidCount: row.voidCount,
    serviceChargeCents: row.serviceChargeCents,
    tipsCreditCents: row.tipsCreditCents,
    tipsCashCents: row.tipsCashCents,
    orderCount: row.orderCount,
    refundTotalCents: row.refundTotalCents,
    refundCount: row.refundCount,
    tenderBreakdown: (row.tenderBreakdown ?? []) as TenderBreakdownEntry[],
    salesByDepartment: row.salesByDepartment as DepartmentSalesEntry[] | null,
    taxByGroup: row.taxByGroup as TaxGroupEntry[] | null,
    cashExpectedCents: row.cashExpectedCents,
    cashCountedCents: row.cashCountedCents,
    cashOverShortCents: row.cashOverShortCents,
    startedAt: row.startedAt?.toISOString() ?? null,
    startedBy: row.startedBy,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    reconciledBy: row.reconciledBy,
    postedAt: row.postedAt?.toISOString() ?? null,
    postedBy: row.postedBy,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedBy: row.lockedBy,
    glJournalEntryId: row.glJournalEntryId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lock a posted retail close batch (final, no further modifications).
 */
export async function lockRetailClose(
  ctx: RequestContext,
  input: LockRetailCloseInput,
): Promise<RetailCloseBatch> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(retailCloseBatches)
      .where(
        and(
          eq(retailCloseBatches.id, input.batchId),
          eq(retailCloseBatches.tenantId, ctx.tenantId),
        ),
      )
      .for('update');

    if (rows.length === 0) {
      throw new AppError('BATCH_NOT_FOUND', 'Close batch not found', 404);
    }

    const batch = rows[0]!;
    if (batch.status !== 'posted') {
      throw new AppError('INVALID_BATCH_STATUS', `Cannot lock batch in '${batch.status}' status. Must be posted first.`, 409);
    }

    const [updated] = await tx
      .update(retailCloseBatches)
      .set({
        status: 'locked',
        lockedAt: new Date(),
        lockedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(retailCloseBatches.id, input.batchId),
          eq(retailCloseBatches.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'retail.close.locked.v1', {
      batchId: input.batchId,
      businessDate: batch.businessDate,
    });

    return { result: mapRow(updated!), events: [event] };
  });

  await auditLog(ctx, 'retail.close.locked', 'retail_close_batch', result.id);
  return result;
}
