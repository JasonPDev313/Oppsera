import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { tipPayouts, tenders } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import type { CreateTipPayoutInput } from '../validation';

/**
 * Create a tip payout for an employee.
 *
 * GL posting:
 * - Cash payout:   Dr Tips Payable / Cr Cash
 * - Payroll:       Dr Tips Payable / Cr Payroll Clearing
 * - Check:         Dr Tips Payable / Cr Cash (same as cash for GL)
 *
 * Validates that payout amount does not exceed the employee's outstanding tip balance.
 */
export async function createTipPayout(
  ctx: RequestContext,
  input: CreateTipPayoutInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createTipPayout');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Compute outstanding tip balance for this employee
    const tipBalance = await computeTipBalance(
      tx,
      ctx.tenantId,
      input.employeeId,
      input.businessDate,
    );

    if (input.amountCents > tipBalance) {
      throw new Error(
        `Payout amount (${input.amountCents}) exceeds outstanding tip balance (${tipBalance})`,
      );
    }

    // Get accounting settings for GL accounts
    const settings = await getAccountingSettings(tx, ctx.tenantId);
    if (!settings) {
      throw new Error('Accounting settings not configured');
    }

    const tipsPayableAccountId = settings.defaultTipsPayableAccountId;
    if (!tipsPayableAccountId) {
      throw new Error('Tips Payable GL account not configured in accounting settings');
    }

    // Resolve credit account based on payout type
    let creditAccountId: string | null = null;
    let creditMemo = '';

    if (input.payoutType === 'cash' || input.payoutType === 'check') {
      // For cash/check payouts, we need a cash account
      // Use payment type GL mapping for 'cash'
      creditAccountId = await resolveCashAccount(tx, ctx.tenantId);
      creditMemo = input.payoutType === 'cash' ? 'Cash tip payout' : 'Check tip payout';
    } else if (input.payoutType === 'payroll') {
      creditAccountId = settings.defaultPayrollClearingAccountId;
      creditMemo = 'Payroll tip clearing';
    }

    if (!creditAccountId) {
      throw new Error(
        `Cannot resolve GL credit account for payout type "${input.payoutType}". ` +
        (input.payoutType === 'payroll'
          ? 'Configure Payroll Clearing account in accounting settings.'
          : 'Configure Cash GL account in payment type mappings.'),
      );
    }

    const amountDollars = (input.amountCents / 100).toFixed(2);

    // Post GL journal entry
    const postingApi = getAccountingPostingApi();
    const journalResult = await postingApi.postEntry(ctx, {
      businessDate: input.businessDate,
      sourceModule: 'tip_payout',
      sourceReferenceId: `tip-payout-${input.clientRequestId}`,
      memo: `Tip payout - ${input.payoutType} - employee ${input.employeeId}`,
      lines: [
        {
          accountId: tipsPayableAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: input.locationId,
          memo: `Tips payable clearing - ${input.payoutType}`,
        },
        {
          accountId: creditAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: input.locationId,
          memo: creditMemo,
        },
      ],
      forcePost: true,
    });

    // Create the tip payout record
    const [payout] = await tx
      .insert(tipPayouts)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        employeeId: input.employeeId,
        payoutType: input.payoutType,
        amountCents: input.amountCents,
        businessDate: input.businessDate,
        drawerSessionId: input.drawerSessionId ?? null,
        payrollPeriod: input.payrollPeriod ?? null,
        status: 'completed',
        approvedBy: input.approvedBy ?? ctx.user.id,
        glJournalEntryId: journalResult.id,
        notes: input.notes ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'tip.payout.completed.v1', {
      payoutId: payout!.id,
      employeeId: input.employeeId,
      payoutType: input.payoutType,
      amountCents: input.amountCents,
      locationId: input.locationId,
      businessDate: input.businessDate,
      journalEntryId: journalResult.id,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createTipPayout', payout!);

    return { result: payout!, events: [event] };
  });

  await auditLog(ctx, 'accounting.tip_payout.created', 'tip_payout', result.id);
  return result;
}

/**
 * Compute outstanding tip balance for an employee:
 * SUM(tenders.tipAmount) - SUM(tip_payouts.amountCents WHERE status != 'voided')
 */
async function computeTipBalance(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  tenantId: string,
  employeeId: string,
  asOfDate: string,
): Promise<number> {
  // Sum tips from tenders
  const tipsResult = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${tenders.tipAmount}), 0)`,
    })
    .from(tenders)
    .where(
      and(
        eq(tenders.tenantId, tenantId),
        eq(tenders.employeeId, employeeId),
        sql`${tenders.businessDate} <= ${asOfDate}`,
        eq(tenders.status, 'captured'),
      ),
    );

  const totalTips = Number(tipsResult[0]?.total ?? 0);

  // Sum completed payouts
  const payoutsResult = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${tipPayouts.amountCents}), 0)`,
    })
    .from(tipPayouts)
    .where(
      and(
        eq(tipPayouts.tenantId, tenantId),
        eq(tipPayouts.employeeId, employeeId),
        sql`${tipPayouts.businessDate} <= ${asOfDate}`,
        sql`${tipPayouts.status} != 'voided'`,
      ),
    );

  const totalPaid = Number(payoutsResult[0]?.total ?? 0);

  return totalTips - totalPaid;
}

/**
 * Resolve cash GL account from payment type mapping for 'cash'.
 */
async function resolveCashAccount(
  tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0],
  tenantId: string,
): Promise<string | null> {
  const rows = await tx.execute(sql`
    SELECT cash_account_id
    FROM payment_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND payment_type_id = 'cash'
    LIMIT 1
  `);
  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length > 0 && arr[0]!.cash_account_id) {
    return String(arr[0]!.cash_account_id);
  }
  return null;
}
