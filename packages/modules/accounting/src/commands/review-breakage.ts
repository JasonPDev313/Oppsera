import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pendingBreakageReview } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { ReviewBreakageInput } from '../validation';

export interface BreakageReviewItem {
  id: string;
  tenantId: string;
  voucherId: string;
  voucherNumber: string;
  amountCents: number;
  expiredAt: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  glJournalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: typeof pendingBreakageReview.$inferSelect): BreakageReviewItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    voucherId: row.voucherId,
    voucherNumber: row.voucherNumber,
    amountCents: row.amountCents,
    expiredAt: row.expiredAt.toISOString(),
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNotes: row.reviewNotes,
    glJournalEntryId: row.glJournalEntryId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Approve or decline a pending breakage review item.
 *
 * When approved:
 *   - Posts GL entry: Dr Deferred Revenue Liability / Cr Breakage Income
 *   - Uses breakageIncomeAccountId from settings, or falls back to voucher type's expirationIncomeChartOfAccountId
 *
 * When declined:
 *   - Marks as declined, no GL posting (liability stays on books)
 */
export async function reviewBreakage(
  ctx: RequestContext,
  input: ReviewBreakageInput,
): Promise<BreakageReviewItem> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [item] = await tx
      .select()
      .from(pendingBreakageReview)
      .where(
        and(
          eq(pendingBreakageReview.id, input.reviewItemId),
          eq(pendingBreakageReview.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!item) {
      throw new AppError('NOT_FOUND', `Pending breakage review item not found: ${input.reviewItemId}`, 404);
    }

    if (item.status !== 'pending') {
      throw new AppError('INVALID_STATUS', `Item already ${item.status}`, 409);
    }

    const now = new Date();
    let glJournalEntryId: string | null = null;

    if (input.action === 'approve') {
      const settings = await getAccountingSettings(tx, ctx.tenantId);
      if (!settings) {
        throw new AppError('SETTINGS_NOT_FOUND', 'Accounting settings not configured', 400);
      }

      const breakageAccountId = settings.breakageIncomeAccountId;
      if (!breakageAccountId) {
        throw new AppError('MISSING_ACCOUNT', 'Breakage income account not configured in accounting settings', 400);
      }

      // We need the liability account — look up the voucher type's liability account
      // For now, use the general voucher liability (UDF or similar)
      // The voucher type's account was in the event payload. Since we're reviewing after the fact,
      // we use the default undeposited funds / voucher liability from settings
      const liabilityAccountId = settings.defaultUndepositedFundsAccountId;
      if (!liabilityAccountId) {
        throw new AppError('MISSING_ACCOUNT', 'Undeposited funds (voucher liability) account not configured', 400);
      }

      const amountDollars = (item.amountCents / 100).toFixed(2);

      const postingApi = getAccountingPostingApi();
      const journalEntry = await postingApi.postEntry(ctx, {
        businessDate: item.expiredAt.toISOString().split('T')[0]!,
        sourceModule: 'voucher',
        sourceReferenceId: `breakage-approved-${item.id}`,
        memo: `Breakage income approved: voucher ${item.voucherNumber}`,
        currency: 'USD',
        lines: [
          {
            accountId: liabilityAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `Voucher ${item.voucherNumber} — liability released (breakage approved)`,
          },
          {
            accountId: breakageAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Voucher ${item.voucherNumber} — breakage income recognized`,
          },
        ],
        forcePost: true,
      });

      glJournalEntryId = journalEntry.id;
    }

    const [updated] = await tx
      .update(pendingBreakageReview)
      .set({
        status: input.action === 'approve' ? 'approved' : 'declined',
        reviewedBy: ctx.user.id,
        reviewedAt: now,
        reviewNotes: input.notes ?? null,
        glJournalEntryId,
        updatedAt: now,
      })
      .where(eq(pendingBreakageReview.id, item.id))
      .returning();

    return { result: mapRow(updated!), events: [] };
  });

  await auditLog(ctx, `accounting.breakage.${input.action}d`, 'pending_breakage_review', input.reviewItemId, undefined, {
    amountCents: result.amountCents,
    voucherNumber: result.voucherNumber,
    action: input.action,
  });

  return result;
}
