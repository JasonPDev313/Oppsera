import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { depositSlips, bankAccounts } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { DenominationBreakdown } from '@oppsera/core/drawer-sessions/types';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

export interface CreateDepositSlipInput {
  locationId: string;
  businessDate: string;
  depositType?: string;
  totalAmountCents: number;
  bankAccountId?: string;
  retailCloseBatchIds?: string[];
  fnbCloseBatchId?: string;
  notes?: string;
}

export interface PrepareDepositSlipInput {
  depositSlipId: string;
  denominationBreakdown: DenominationBreakdown;
  slipNumber?: string;
  totalAmountCents: number;
}

export interface DepositSlip {
  id: string;
  tenantId: string;
  locationId: string;
  businessDate: string;
  depositType: string;
  totalAmountCents: number;
  bankAccountId: string | null;
  status: string;
  retailCloseBatchIds: string[];
  fnbCloseBatchId: string | null;
  denominationBreakdown: DenominationBreakdown | null;
  slipNumber: string | null;
  preparedBy: string | null;
  preparedAt: string | null;
  depositedAt: string | null;
  depositedBy: string | null;
  reconciledAt: string | null;
  reconciledBy: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: typeof depositSlips.$inferSelect): DepositSlip {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    businessDate: row.businessDate,
    depositType: row.depositType,
    totalAmountCents: row.totalAmountCents,
    bankAccountId: row.bankAccountId,
    status: row.status,
    retailCloseBatchIds: (row.retailCloseBatchIds as string[]) ?? [],
    fnbCloseBatchId: row.fnbCloseBatchId,
    denominationBreakdown: (row.denominationBreakdown as DenominationBreakdown) ?? null,
    slipNumber: row.slipNumber,
    preparedBy: row.preparedBy,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    depositedAt: row.depositedAt?.toISOString() ?? null,
    depositedBy: row.depositedBy,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    reconciledBy: row.reconciledBy,
    glJournalEntryId: row.glJournalEntryId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createDepositSlip(
  ctx: RequestContext,
  input: CreateDepositSlipInput,
): Promise<DepositSlip> {
  return withTenant(ctx.tenantId, async (tx) => {
    const id = generateUlid();
    const [created] = await tx
      .insert(depositSlips)
      .values({
        id,
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        businessDate: input.businessDate,
        depositType: input.depositType ?? 'cash',
        totalAmountCents: input.totalAmountCents,
        bankAccountId: input.bankAccountId ?? null,
        retailCloseBatchIds: input.retailCloseBatchIds ?? [],
        fnbCloseBatchId: input.fnbCloseBatchId ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    await auditLog(ctx, 'accounting.deposit.created', 'deposit_slip', created!.id, undefined, {
      amountCents: input.totalAmountCents,
      businessDate: input.businessDate,
      locationId: input.locationId,
    });

    return mapRow(created!);
  });
}

export async function prepareDepositSlip(
  ctx: RequestContext,
  input: PrepareDepositSlipInput,
): Promise<DepositSlip> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(depositSlips)
      .where(and(eq(depositSlips.id, input.depositSlipId), eq(depositSlips.tenantId, ctx.tenantId)))
      .limit(1);

    if (!row) throw new AppError('NOT_FOUND', 'Deposit slip not found', 404);
    if (row.status !== 'pending') {
      throw new AppError('VALIDATION_ERROR', `Cannot prepare: status is '${row.status}'`, 400);
    }

    const [updated] = await tx
      .update(depositSlips)
      .set({
        status: 'prepared',
        denominationBreakdown: input.denominationBreakdown,
        slipNumber: input.slipNumber ?? null,
        totalAmountCents: input.totalAmountCents,
        preparedBy: ctx.user.id,
        preparedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(depositSlips.id, input.depositSlipId))
      .returning();

    await auditLog(ctx, 'accounting.deposit.prepared', 'deposit_slip', input.depositSlipId, undefined, {
      amountCents: input.totalAmountCents,
      businessDate: row.businessDate,
      slipNumber: input.slipNumber,
    });

    return mapRow(updated!);
  });
}

export async function markDeposited(
  ctx: RequestContext,
  depositSlipId: string,
): Promise<DepositSlip> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(depositSlips)
      .where(and(eq(depositSlips.id, depositSlipId), eq(depositSlips.tenantId, ctx.tenantId)))
      .limit(1);

    if (!row) throw new AppError('NOT_FOUND', 'Deposit slip not found', 404);
    if (row.status !== 'pending' && row.status !== 'prepared') {
      throw new AppError('VALIDATION_ERROR', `Cannot mark as deposited: status is '${row.status}'`, 400);
    }

    // Post GL: Dr Bank / Cr Undeposited Funds (Cash On Hand)
    let glJournalEntryId: string | null = null;
    try {
      // Ensure accounting settings exist (auto-bootstrap if needed)
      try { await ensureAccountingSettings(tx, ctx.tenantId); } catch { /* non-fatal */ }
      const settings = await getAccountingSettings(tx, ctx.tenantId);

      if (!settings) {
        try {
          await logUnmappedEvent(tx, ctx.tenantId, {
            eventType: 'accounting.deposit.deposited',
            sourceModule: 'deposit_slip',
            sourceReferenceId: depositSlipId,
            entityType: 'accounting_settings',
            entityId: ctx.tenantId,
            reason: 'CRITICAL: GL deposit posting skipped — accounting settings missing even after ensureAccountingSettings.',
          });
        } catch { /* best-effort */ }
        console.error(`[deposit-slip-gl] CRITICAL: accounting settings missing for tenant=${ctx.tenantId}`);
      } else {
        // Resolve bank account GL ID
        let bankGlAccountId: string | null = null;
        if (row.bankAccountId) {
          const [bank] = await tx
            .select({ glAccountId: bankAccounts.glAccountId })
            .from(bankAccounts)
            .where(and(eq(bankAccounts.tenantId, ctx.tenantId), eq(bankAccounts.id, row.bankAccountId)))
            .limit(1);
          bankGlAccountId = bank?.glAccountId ?? null;
        }

        const creditAccountId = settings.defaultUndepositedFundsAccountId
          ?? settings.defaultUncategorizedRevenueAccountId;

        if (!bankGlAccountId || !creditAccountId) {
          try {
            await logUnmappedEvent(tx, ctx.tenantId, {
              eventType: 'accounting.deposit.deposited',
              sourceModule: 'deposit_slip',
              sourceReferenceId: depositSlipId,
              entityType: 'gl_account',
              entityId: row.bankAccountId ?? 'no-bank-account',
              reason: `Deposit slip GL posting skipped: ${!bankGlAccountId ? 'No bank GL account' : 'No cash/undeposited funds GL account'}. Amount: $${(row.totalAmountCents / 100).toFixed(2)}.`,
            });
          } catch { /* best-effort */ }
        } else {
          const amountDollars = (row.totalAmountCents / 100).toFixed(2);
          const postingApi = getAccountingPostingApi();
          const journalResult = await postingApi.postEntry(ctx, {
            businessDate: row.businessDate,
            sourceModule: 'deposit_slip',
            sourceReferenceId: depositSlipId,
            memo: `Cash deposit - ${row.businessDate}${row.slipNumber ? ` (#${row.slipNumber})` : ''}`,
            lines: [
              {
                accountId: bankGlAccountId,
                debitAmount: amountDollars,
                creditAmount: '0',
                locationId: row.locationId,
                memo: 'Bank deposit',
              },
              {
                accountId: creditAccountId,
                debitAmount: '0',
                creditAmount: amountDollars,
                locationId: row.locationId,
                memo: 'Cash on hand clearing',
              },
            ],
            forcePost: true,
          });
          glJournalEntryId = journalResult.id;
        }
      }
    } catch (glError) {
      // GL failures never block deposit operations
      console.error('[deposit-slip-gl] GL posting failed:', glError);
    }

    const [updated] = await tx
      .update(depositSlips)
      .set({
        status: 'deposited',
        depositedAt: new Date(),
        depositedBy: ctx.user.id,
        glJournalEntryId,
        updatedAt: new Date(),
      })
      .where(eq(depositSlips.id, depositSlipId))
      .returning();

    await auditLog(ctx, 'accounting.deposit.deposited', 'deposit_slip', depositSlipId, undefined, {
      amountCents: row.totalAmountCents,
      businessDate: row.businessDate,
      glJournalEntryId,
    });

    return mapRow(updated!);
  });
}

export async function reconcileDeposit(
  ctx: RequestContext,
  depositSlipId: string,
): Promise<DepositSlip> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(depositSlips)
      .where(and(eq(depositSlips.id, depositSlipId), eq(depositSlips.tenantId, ctx.tenantId)))
      .limit(1);

    if (!row) throw new AppError('NOT_FOUND', 'Deposit slip not found', 404);
    if (row.status !== 'deposited') {
      throw new AppError('VALIDATION_ERROR', `Cannot reconcile: status is '${row.status}'`, 400);
    }

    const [updated] = await tx
      .update(depositSlips)
      .set({
        status: 'reconciled',
        reconciledAt: new Date(),
        reconciledBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(depositSlips.id, depositSlipId))
      .returning();

    await auditLog(ctx, 'accounting.deposit.reconciled', 'deposit_slip', depositSlipId, undefined, {
      amountCents: row.totalAmountCents,
      businessDate: row.businessDate,
    });

    return mapRow(updated!);
  });
}
