import { eq, and } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { retailCloseBatches, accountingSettings } from '@oppsera/db';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { getAccountingPostingApi } from '../../helpers/accounting-posting-api';
import type { RequestContext } from '../../auth/context';
import type { PostRetailCloseInput } from '../validation';
import type { RetailCloseBatch, TenderBreakdownEntry, DepartmentSalesEntry, TaxGroupEntry } from '../types';
import { buildRetailBatchJournalLines } from '../helpers/build-retail-batch-journal-lines';

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
 * Post a reconciled retail close batch to the GL.
 * Uses the AccountingPostingApi to create journal entries.
 * Best-effort: never blocks the close if GL posting fails.
 */
export async function postRetailClose(
  ctx: RequestContext,
  input: PostRetailCloseInput,
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
    if (batch.status !== 'reconciled') {
      throw new AppError('INVALID_BATCH_STATUS', `Cannot post batch in '${batch.status}' status. Must be reconciled first.`, 409);
    }

    const mapped = mapRow(batch);
    const journalLines = buildRetailBatchJournalLines(mapped);

    // Try to post to GL — best effort
    let glJournalEntryId: string | null = null;
    try {
      const accountingApi = getAccountingPostingApi();

      // Read full settings directly from DB (AccountingPostingApi.getSettings returns limited fields)
      const [settingsRow] = await tx
        .select()
        .from(accountingSettings)
        .where(eq(accountingSettings.tenantId, ctx.tenantId))
        .limit(1);

      if (settingsRow) {
        // Build GL lines with resolved account IDs
        const glLines: Array<{
          accountId: string;
          debitAmount?: string;
          creditAmount?: string;
          locationId?: string;
          memo?: string;
        }> = [];

        for (const line of journalLines) {
          let accountId: string | null = null;

          // Resolve account ID based on category
          switch (line.category) {
            case 'cash_over_short':
              accountId = settingsRow.defaultCashOverShortAccountId ?? null;
              break;
            case 'tax_payable':
              accountId = settingsRow.defaultSalesTaxPayableAccountId ?? null;
              break;
            case 'tips_payable':
              accountId = settingsRow.defaultTipsPayableAccountId ?? null;
              break;
            case 'service_charge_revenue':
              accountId = settingsRow.defaultServiceChargeRevenueAccountId ?? null;
              break;
            case 'undeposited_funds':
              accountId = settingsRow.defaultUndepositedFundsAccountId ?? null;
              break;
            // cash_on_hand and sales_revenue need more specific resolution
            // For now, skip if no default — the per-tender POS adapter already posts these
            default:
              break;
          }

          if (!accountId) continue;

          glLines.push({
            accountId,
            debitAmount: line.debitCents > 0 ? (line.debitCents / 100).toFixed(2) : undefined,
            creditAmount: line.creditCents > 0 ? (line.creditCents / 100).toFixed(2) : undefined,
            memo: line.description,
            locationId: batch.locationId,
          });
        }

        if (glLines.length > 0) {
          const entry = await accountingApi.postEntry(ctx, {
            businessDate: batch.businessDate,
            memo: `Retail close batch — ${batch.businessDate}`,
            sourceModule: 'retail_close',
            sourceReferenceId: batch.id,
            lines: glLines,
            forcePost: true,
          });
          glJournalEntryId = entry?.id ?? null;
        }
      }
    } catch (err) {
      // Best-effort: log but don't block
      console.error('[retail-close] GL posting failed:', err);
    }

    const [updated] = await tx
      .update(retailCloseBatches)
      .set({
        status: 'posted',
        postedAt: new Date(),
        postedBy: ctx.user.id,
        glJournalEntryId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(retailCloseBatches.id, input.batchId),
          eq(retailCloseBatches.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'retail.close.posted.v1', {
      batchId: input.batchId,
      glJournalEntryId,
      businessDate: batch.businessDate,
      netSalesCents: batch.netSalesCents,
      cashOverShortCents: batch.cashOverShortCents,
    });

    return { result: mapRow(updated!), events: [event] };
  });

  await auditLog(ctx, 'retail.close.posted', 'retail_close_batch', result.id);
  return result;
}
