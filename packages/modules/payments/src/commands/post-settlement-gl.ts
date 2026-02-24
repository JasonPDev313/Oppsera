import { z } from 'zod';
import { withTenant } from '@oppsera/db';
import { paymentSettlements, paymentTypeGlDefaults } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { AccountingPostJournalInput } from '@oppsera/core/helpers/accounting-posting-api';

// ── Validation ─────────────────────────────────────────────────────

export const postSettlementGlSchema = z.object({
  settlementId: z.string().min(1),
  bankAccountId: z.string().min(1),
});

export type PostSettlementGlInput = z.input<typeof postSettlementGlSchema>;

export interface PostSettlementGlResult {
  settlementId: string;
  journalEntryId: string;
  journalNumber: number;
  grossDollars: string;
  feeDollars: string;
  netDollars: string;
}

/**
 * Post GL journal entry for a settlement batch.
 *
 * Standard settlement GL:
 *   DR Bank Account ........... net amount (gross - fees)
 *   DR Processing Fee Expense . fee amount
 *   CR Payment Clearing ....... gross amount
 *
 * If chargebacks exist:
 *   DR Chargeback Loss ........ chargeback amount
 *   CR Bank Account ........... chargeback amount
 *
 * Settlement must be in 'matched' status. All lines must be matched.
 * Uses the existing AccountingPostingApi singleton.
 *
 * GL adapter pattern: never throws — GL failures log but don't block.
 * However, settlement GL is explicit (admin-initiated), so we DO throw on failure.
 */
export async function postSettlementGl(
  ctx: RequestContext,
  input: PostSettlementGlInput,
): Promise<PostSettlementGlResult> {
  const { settlementId, bankAccountId } = input;

  return withTenant(ctx.tenantId, async (tx) => {
    // 1. Load settlement
    const [settlement] = await tx
      .select()
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, settlementId),
        ),
      )
      .limit(1);

    if (!settlement) {
      throw new AppError('NOT_FOUND', 'Settlement not found', 404);
    }

    if (settlement.status === 'posted') {
      throw new AppError('ALREADY_POSTED', 'Settlement has already been posted to GL', 409);
    }

    if (settlement.status !== 'matched') {
      throw new AppError(
        'NOT_MATCHED',
        'Settlement must be fully matched before posting to GL. Resolve unmatched transactions first.',
        422,
      );
    }

    // Check if already posted (idempotent check via existing GL entry)
    if (settlement.glJournalEntryId) {
      throw new AppError('ALREADY_POSTED', 'Settlement has already been posted to GL', 409);
    }

    // 2. Calculate totals from matched lines
    const totalRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(settled_amount_cents), 0)::integer AS gross_cents,
        COALESCE(SUM(fee_cents), 0)::integer AS fee_cents,
        COALESCE(SUM(net_cents), 0)::integer AS net_cents
      FROM payment_settlement_lines
      WHERE tenant_id = ${ctx.tenantId}
        AND settlement_id = ${settlementId}
    `);
    const totalArr = Array.from(totalRows as Iterable<Record<string, unknown>>);
    const grossCents = Number(totalArr[0]!.gross_cents);
    const feeCents = Number(totalArr[0]!.fee_cents);
    const netCents = Number(totalArr[0]!.net_cents);

    const grossDollars = (grossCents / 100).toFixed(2);
    const feeDollars = (feeCents / 100).toFixed(2);
    const netDollars = (netCents / 100).toFixed(2);
    const chargebackDollars = settlement.chargebackAmount ?? '0.00';

    // 3. Resolve GL accounts
    // Use payment_type_gl_defaults for 'credit_card' to find clearing + fee accounts
    const [cardMapping] = await tx
      .select({
        clearingAccountId: paymentTypeGlDefaults.clearingAccountId,
        feeExpenseAccountId: paymentTypeGlDefaults.feeExpenseAccountId,
      })
      .from(paymentTypeGlDefaults)
      .where(
        and(
          eq(paymentTypeGlDefaults.tenantId, ctx.tenantId),
          eq(paymentTypeGlDefaults.paymentTypeId, 'credit_card'),
        ),
      )
      .limit(1);

    // Also try 'card' as alternate payment type key
    let clearingAccountId = cardMapping?.clearingAccountId ?? null;
    let feeAccountId = cardMapping?.feeExpenseAccountId ?? null;

    if (!clearingAccountId) {
      const [altMapping] = await tx
        .select({
          clearingAccountId: paymentTypeGlDefaults.clearingAccountId,
          feeExpenseAccountId: paymentTypeGlDefaults.feeExpenseAccountId,
        })
        .from(paymentTypeGlDefaults)
        .where(
          and(
            eq(paymentTypeGlDefaults.tenantId, ctx.tenantId),
            eq(paymentTypeGlDefaults.paymentTypeId, 'card'),
          ),
        )
        .limit(1);

      clearingAccountId = altMapping?.clearingAccountId ?? null;
      feeAccountId = feeAccountId ?? altMapping?.feeExpenseAccountId ?? null;
    }

    if (!clearingAccountId) {
      throw new AppError(
        'MISSING_GL_MAPPING',
        'No clearing account mapped for card payments. Configure payment type GL mappings in Accounting settings.',
        422,
      );
    }

    // 4. Build GL journal lines
    const lines: AccountingPostJournalInput['lines'] = [];

    // DR Bank Account — net settlement deposit
    if (netCents > 0) {
      lines.push({
        accountId: bankAccountId,
        debitAmount: netDollars,
        locationId: settlement.locationId ?? undefined,
        channel: 'settlement',
        memo: `Settlement deposit — ${settlement.processorName} batch ${settlement.processorBatchId ?? ''}`.trim(),
      });
    }

    // DR Processing Fee Expense — if fees exist and fee account is configured
    if (feeCents > 0 && feeAccountId) {
      lines.push({
        accountId: feeAccountId,
        debitAmount: feeDollars,
        locationId: settlement.locationId ?? undefined,
        channel: 'settlement',
        memo: `Processing fees — ${settlement.processorName}`,
      });
    } else if (feeCents > 0) {
      // No fee account configured — fold fee into bank debit
      // The net already accounts for this, so we need to adjust: DR Bank = gross
      // This handles the case where fees aren't tracked separately in GL
      lines[0] = {
        ...lines[0]!,
        debitAmount: grossDollars,
      };
    }

    // CR Payment Clearing — gross amount
    lines.push({
      accountId: clearingAccountId,
      creditAmount: grossDollars,
      locationId: settlement.locationId ?? undefined,
      channel: 'settlement',
      memo: `Settlement clearing — ${settlement.processorName} batch ${settlement.processorBatchId ?? ''}`.trim(),
    });

    // Handle chargebacks (if any)
    const chargebackCents = Math.round(parseFloat(chargebackDollars) * 100);
    if (chargebackCents > 0) {
      // DR Chargeback Loss — we'd need a chargeback account mapping
      // For now, use the fee account as a fallback
      const chargebackAccountId = feeAccountId ?? bankAccountId;
      lines.push({
        accountId: chargebackAccountId,
        debitAmount: chargebackDollars,
        locationId: settlement.locationId ?? undefined,
        channel: 'settlement',
        memo: `Chargebacks — ${settlement.processorName}`,
      });

      // CR Bank — chargeback reduces bank balance
      lines.push({
        accountId: bankAccountId,
        creditAmount: chargebackDollars,
        locationId: settlement.locationId ?? undefined,
        channel: 'settlement',
        memo: `Chargeback deduction — ${settlement.processorName}`,
      });
    }

    // 5. Post to GL via AccountingPostingApi
    const accountingApi = getAccountingPostingApi();

    const glInput: AccountingPostJournalInput = {
      businessDate: settlement.settlementDate,
      sourceModule: 'settlement',
      sourceReferenceId: settlementId,
      memo: `Card settlement — ${settlement.processorName} — ${settlement.settlementDate} — Batch ${settlement.processorBatchId ?? 'N/A'}`,
      lines,
      forcePost: true, // automated posting bypasses draft mode
    };

    const glResult = await accountingApi.postEntry(ctx, glInput);

    // 6. Update settlement with GL reference and status
    await tx
      .update(paymentSettlements)
      .set({
        status: 'posted',
        bankAccountId,
        glJournalEntryId: glResult.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSettlements.id, settlementId),
          eq(paymentSettlements.tenantId, ctx.tenantId),
        ),
      );

    return {
      settlementId,
      journalEntryId: glResult.id,
      journalNumber: glResult.journalNumber,
      grossDollars,
      feeDollars,
      netDollars,
    };
  });
}
