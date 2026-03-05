import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

const TipPoolDistributedPayloadSchema = z.object({
  distributionId: z.string(),
  poolId: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  totalPoolAmountCents: z.number(),
  participantCount: z.number(),
  distributions: z
    .array(
      z.object({
        staffId: z.string(),
        amountCents: z.number(),
      }),
    )
    .optional(),
});

type TipPoolDistributedPayload = z.infer<typeof TipPoolDistributedPayloadSchema>;

function buildSyntheticCtx(tenantId: string, locationId: string, distributionId: string): RequestContext {
  return {
    tenantId,
    locationId,
    user: {
      id: 'system',
      email: 'system@oppsera.io',
      name: 'System',
      tenantId,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    requestId: `fnb-tip-pool-gl-${distributionId}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles fnb.tip.pool_distributed.v1 events.
 *
 * GL posting for tip pool distribution payout:
 *   Dr Tip Liability   (tips collected but not yet paid out to staff)
 *   Cr Tip Payable / Cash  (tips paid out — wages payable or undeposited funds)
 *
 * Account resolution:
 *   - Debit  → defaultTipsPayableAccountId (tip liability account)
 *   - Credit → defaultPayrollClearingAccountId if available,
 *              otherwise defaultTipsPayableAccountId,
 *              otherwise defaultUndepositedFundsAccountId
 *
 * Zero-amount distributions are silently skipped.
 * Per gotcha #9, this adapter NEVER throws — all errors are caught and logged.
 */
export async function handleFnbTipPoolDistributedForAccounting(event: EventEnvelope): Promise<void> {
  const parsed = TipPoolDistributedPayloadSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[fnb-tip-pool-gl] Invalid event payload for fnb.tip.pool_distributed.v1:`,
      parsed.error.message,
    );
    return;
  }
  const data: TipPoolDistributedPayload = parsed.data;

  try {
    // Skip zero-amount distributions — nothing to post to GL
    if (data.totalPoolAmountCents === 0) return;

    try {
      await ensureAccountingSettings(db, event.tenantId);
    } catch {
      /* non-fatal */
    }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.tip.pool_distributed.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.distributionId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason:
            'CRITICAL: GL tip pool distribution posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch {
        /* never block tip pool operations */
      }
      console.error(
        `[fnb-tip-pool-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`,
      );
      return;
    }

    // Debit side: tip liability account (the balance of tips owed to staff)
    const debitAccountId = settings.defaultTipsPayableAccountId ?? null;
    if (!debitAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.tip.pool_distributed.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.distributionId,
          entityType: 'gl_account',
          entityId: 'tip_liability',
          reason: `Tip pool distribution of $${(data.totalPoolAmountCents / 100).toFixed(2)} (pool ${data.poolId}) skipped — no Tips Payable GL account configured. Configure a tip liability account in accounting settings.`,
        });
      } catch {
        /* best-effort */
      }
      return;
    }

    // Credit side: payroll clearing (if configured), otherwise undeposited funds as last resort
    // NOTE: we explicitly skip defaultTipsPayableAccountId in the fallback chain because it
    // would be the same as debitAccountId, creating a self-canceling Dr/Cr entry.
    const creditAccountId: string | null =
      settings.defaultPayrollClearingAccountId ??
      settings.defaultUndepositedFundsAccountId ??
      null;

    // Guard: self-canceling entry when credit resolves to same account as debit
    if (creditAccountId && creditAccountId === debitAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.tip.pool_distributed.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.distributionId,
          entityType: 'gl_account',
          entityId: 'payroll_clearing',
          reason: `Tip pool distribution of $${(data.totalPoolAmountCents / 100).toFixed(2)} skipped — debit and credit accounts are the same (${debitAccountId}). Configure a dedicated Payroll Clearing GL account.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    if (!creditAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.tip.pool_distributed.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.distributionId,
          entityType: 'gl_account',
          entityId: 'tip_payable_or_cash',
          reason: `Tip pool distribution of $${(data.totalPoolAmountCents / 100).toFixed(2)} (pool ${data.poolId}) skipped — no Payroll Clearing, Tips Payable, or Undeposited Funds GL account configured.`,
        });
      } catch {
        /* best-effort */
      }
      return;
    }

    const amountDollars = (data.totalPoolAmountCents / 100).toFixed(2);
    const participantCount = data.participantCount;
    const creditMemo =
      settings.defaultPayrollClearingAccountId
        ? `Tip pool payout — ${participantCount} staff (payroll clearing)`
        : `Tip pool payout — ${participantCount} staff (cash/bank)`;

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.distributionId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'fnb',
      sourceReferenceId: `tip-pool-dist-${data.distributionId}`,
      memo: `F&B Tip Pool Distribution — pool ${data.poolId} — $${amountDollars} to ${participantCount} staff (${data.businessDate})`,
      currency: 'USD',
      lines: [
        {
          accountId: debitAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          channel: 'fnb',
          memo: `Tip liability cleared — pool ${data.poolId}`,
        },
        {
          accountId: creditAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          channel: 'fnb',
          memo: creditMemo,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    // Never block F&B tip pool operations
    console.error(`[fnb-tip-pool-gl] GL posting failed for tip pool distribution ${data.distributionId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'fnb.tip.pool_distributed.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.distributionId,
        entityType: 'posting_error',
        entityId: data.distributionId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch {
      /* best-effort tracking */
    }
  }
}
