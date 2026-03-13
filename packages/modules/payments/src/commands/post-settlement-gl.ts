import { z } from 'zod';
import { withTenant } from '@oppsera/db';
import { paymentSettlements, paymentTypeGlDefaults, bankAccounts } from '@oppsera/db';
import { eq, and, ne, sql } from 'drizzle-orm';
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
 * Post GL journal entry for a settlement batch (payments module path).
 *
 * This is the CANONICAL settlement GL posting path. It:
 * - Requires 'matched' status (all lines reconciled)
 * - Calculates from line-level cents (integer math)
 * - Uses 3-phase design to avoid Vercel connection pool exhaustion
 * - Accepts bankAccountId per-request (explicit bank selection)
 * - Idempotent via settlement.glJournalEntryId + status checks
 *
 * The accounting module also has postSettlement() which:
 * - Allows force-posting unmatched settlements
 * - Uses dollar amounts from settlement header (NUMERIC strings)
 * - Uses publishWithOutbox (single transaction — not Vercel-safe for large settlements)
 * - Has formal clientRequestId idempotency
 *
 * Standard settlement GL:
 *   DR Bank Account ........... net amount (gross - fees)
 *   DR Processing Fee Expense . fee amount
 *   CR Payment Clearing ....... gross amount
 *
 * If chargebacks exist:
 *   DR Chargeback Loss ........ chargeback amount
 *   CR Bank Account ........... chargeback amount
 */
export async function postSettlementGl(
  ctx: RequestContext,
  input: PostSettlementGlInput,
): Promise<PostSettlementGlResult> {
  const { settlementId, bankAccountId } = input;

  // Bug 5 fix: split into three phases so the external accountingApi.postEntry() call
  // is NOT inside a DB transaction. Holding an open DB connection during network I/O
  // exhausts the Vercel pool (max: 2 connections).

  // Phase 1: read-only — validate + collect data needed to build the GL entry
  const readData = await withTenant(ctx.tenantId, async (tx) => {
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

    // 4. Resolve bankAccountId → GL account ID via bank_accounts table.
    // bankAccountId is a bank_accounts.id — we need bank_accounts.gl_account_id
    // for the actual GL posting. Using bankAccountId directly would post to a
    // non-existent GL account (bank_accounts.id ≠ gl_accounts.id).
    let bankGlAccountId: string | null = null;
    const [bankRow] = await tx
      .select({ glAccountId: bankAccounts.glAccountId })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.tenantId, ctx.tenantId),
          eq(bankAccounts.id, bankAccountId),
        ),
      )
      .limit(1);
    bankGlAccountId = bankRow?.glAccountId ?? null;

    if (!bankGlAccountId) {
      throw new AppError(
        'MISSING_BANK_GL_ACCOUNT',
        'Bank account has no linked GL account. Configure the GL account in bank account settings before posting.',
        422,
      );
    }

    return {
      settlement,
      grossCents,
      feeCents,
      netCents,
      clearingAccountId,
      feeAccountId,
      bankGlAccountId,
    };
  });

  const { settlement, grossCents, feeCents, netCents, clearingAccountId, feeAccountId, bankGlAccountId } = readData;

  const grossDollars = (grossCents / 100).toFixed(2);
  const feeDollars = (feeCents / 100).toFixed(2);
  const netDollars = (netCents / 100).toFixed(2);
  const chargebackDollars = parseFloat(settlement.chargebackAmount ?? '0').toFixed(2);

  // Phase 2 (external I/O — outside any DB transaction): build GL lines and post to GL
  const lines: AccountingPostJournalInput['lines'] = [];

  // DR Bank Account — net settlement deposit (always add if gross > 0, even if net <= 0)
  if (grossCents > 0) {
    lines.push({
      accountId: bankGlAccountId,
      debitAmount: netCents > 0 ? netDollars : '0',
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
  } else if (feeCents > 0 && lines.length > 0) {
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
    const chargebackAccountId = feeAccountId ?? bankGlAccountId;
    lines.push({
      accountId: chargebackAccountId,
      debitAmount: chargebackDollars,
      locationId: settlement.locationId ?? undefined,
      channel: 'settlement',
      memo: `Chargebacks — ${settlement.processorName}`,
    });

    // CR Bank — chargeback reduces bank balance
    lines.push({
      accountId: bankGlAccountId,
      creditAmount: chargebackDollars,
      locationId: settlement.locationId ?? undefined,
      channel: 'settlement',
      memo: `Chargeback deduction — ${settlement.processorName}`,
    });
  }

  // Guard: must have at least 2 lines (one debit, one credit) for a valid GL entry
  if (lines.length < 2) {
    throw new AppError(
      'INVALID_GL_ENTRY',
      'Settlement GL entry requires at least one debit and one credit line. Check settlement amounts.',
      422,
    );
  }

  // External API call — must be outside any DB transaction to avoid holding connections
  const accountingApi = getAccountingPostingApi();

  const glInput: AccountingPostJournalInput = {
    businessDate: settlement.settlementDate,
    sourceModule: 'settlement',
    sourceReferenceId: settlementId,
    sourceIdempotencyKey: `payments:settlement-gl:${settlementId}`,
    memo: `Card settlement — ${settlement.processorName} — ${settlement.settlementDate} — Batch ${settlement.processorBatchId ?? 'N/A'}`,
    lines,
    forcePost: true, // automated posting bypasses draft mode
  };

  const glResult = await accountingApi.postEntry(ctx, glInput);

  // Phase 3: write-back — update settlement record with GL reference in a new transaction
  await withTenant(ctx.tenantId, async (tx) => {
    const updated = await tx
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
          ne(paymentSettlements.status, 'posted'),
        ),
      )
      .returning({ id: paymentSettlements.id });

    if (updated.length === 0) {
      throw new AppError(
        'ALREADY_POSTED',
        'Settlement was already posted by a concurrent request',
        409,
      );
    }
  });

  return {
    settlementId,
    journalEntryId: glResult.id,
    journalNumber: glResult.journalNumber,
    grossDollars,
    feeDollars,
    netDollars,
  };
}
