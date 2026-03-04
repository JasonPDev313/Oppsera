import type { EventEnvelope } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { db, initiationContracts, membershipAccountingSettings } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

// ── Event payload types ──────────────────────────────────────────

interface InitiationContractCreatedPayload {
  contractId: string;
  membershipAccountId: string;
  initiationFeeCents: number;
  downPaymentCents: number;
  financedPrincipalCents: number;
  aprBps: number;
  termMonths: number;
  scheduleEntries: number;
}

interface InitiationInstallmentBilledPayload {
  contractId: string;
  membershipAccountId: string;
  scheduleEntryId: string;
  periodIndex: number;
  dueDate: string;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
}

interface InitiationExtraPrincipalPayload {
  contractId: string;
  membershipAccountId: string;
  amountCents: number;
  effectiveDate: string;
  previousPaidPrincipalCents: number;
  newPaidPrincipalCents: number;
  remainingPrincipalCents: number;
  newStatus: string;
}

// ── Helper: load contract GL accounts ────────────────────────────

async function loadContractGlAccounts(tenantId: string, contractId: string) {
  const [contract] = await db
    .select({
      id: initiationContracts.id,
      recognitionPolicySnapshot: initiationContracts.recognitionPolicySnapshot,
      glNotesReceivableAccountId: initiationContracts.glNotesReceivableAccountId,
      glInterestIncomeAccountId: initiationContracts.glInterestIncomeAccountId,
      glCapitalContributionAccountId: initiationContracts.glCapitalContributionAccountId,
      glDeferredRevenueAccountId: initiationContracts.glDeferredRevenueAccountId,
      glInitiationRevenueAccountId: initiationContracts.glInitiationRevenueAccountId,
    })
    .from(initiationContracts)
    .where(and(
      eq(initiationContracts.id, contractId),
      eq(initiationContracts.tenantId, tenantId),
    ))
    .limit(1);

  return contract ?? null;
}

// ── A. Contract Created ──────────────────────────────────────────

/**
 * Handles membership.initiation.contract.created.v1
 *
 * GL posting for initiation contract creation:
 *   For-profit:    Dr Notes Receivable / Cr Deferred Initiation Revenue
 *   Member-owned:  Dr Notes Receivable / Cr Capital Contributions
 *   Down payment:  Dr Cash (Undeposited Funds) — added when downPaymentCents > 0
 *
 * Never throws — catches all errors.
 */
export async function handleInitiationContractForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as InitiationContractCreatedPayload;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      console.error(`[initiation-gl] Accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    const contract = await loadContractGlAccounts(event.tenantId, data.contractId);
    if (!contract) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.contract.created.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.contractId,
          entityType: 'initiation_contract',
          entityId: data.contractId,
          reason: 'Initiation contract not found for GL posting',
        });
      } catch { /* best-effort */ }
      return;
    }

    const notesReceivableId = contract.glNotesReceivableAccountId;
    if (!notesReceivableId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.contract.created.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.contractId,
          entityType: 'notes_receivable',
          entityId: data.contractId,
          reason: 'Missing Notes Receivable GL account on initiation contract',
        });
      } catch { /* best-effort */ }
      return;
    }

    // Determine club model from the frozen recognition policy snapshot
    const snapshot = contract.recognitionPolicySnapshot as Record<string, unknown> | null;
    const clubModel = (snapshot?.clubModel as string) ?? 'for_profit';

    // Credit side depends on club model
    let creditAccountId: string | null;
    let creditMemo: string;

    if (clubModel === 'member_owned') {
      creditAccountId = contract.glCapitalContributionAccountId;
      creditMemo = 'Initiation fee — capital contribution';
      if (!creditAccountId) {
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'membership.initiation.contract.created.v1',
            sourceModule: 'membership',
            sourceReferenceId: data.contractId,
            entityType: 'capital_contribution',
            entityId: data.contractId,
            reason: 'Missing Capital Contribution GL account on initiation contract (member-owned club)',
          });
        } catch { /* best-effort */ }
        return;
      }
    } else {
      // for_profit — credit Deferred Initiation Revenue
      creditAccountId = contract.glDeferredRevenueAccountId;
      creditMemo = 'Initiation fee — deferred revenue';
      if (!creditAccountId) {
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'membership.initiation.contract.created.v1',
            sourceModule: 'membership',
            sourceReferenceId: data.contractId,
            entityType: 'deferred_initiation_revenue',
            entityId: data.contractId,
            reason: 'Missing Deferred Revenue GL account on initiation contract (for-profit club)',
          });
        } catch { /* best-effort */ }
        return;
      }
    }

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.contractId);

    const initiationFeeDollars = (data.initiationFeeCents / 100).toFixed(2);
    const financedDollars = (data.financedPrincipalCents / 100).toFixed(2);

    const lines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      memo: string;
    }> = [
      {
        accountId: notesReceivableId,
        debitAmount: financedDollars,
        creditAmount: '0',
        memo: 'Initiation fee — notes receivable (financed portion)',
      },
      {
        accountId: creditAccountId,
        debitAmount: '0',
        creditAmount: initiationFeeDollars,
        memo: creditMemo,
      },
    ];

    // Down payment: Dr Cash/Undeposited Funds
    if (data.downPaymentCents > 0) {
      const cashAccountId = settings.defaultUndepositedFundsAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;
      if (!cashAccountId) {
        // Cannot skip the down payment line — journal would be unbalanced
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'membership.initiation.contract.created.v1',
            sourceModule: 'membership',
            sourceReferenceId: data.contractId,
            entityType: 'undeposited_funds',
            entityId: 'default',
            reason: 'Missing Undeposited Funds GL account — cannot post initiation contract with down payment (journal would be unbalanced)',
          });
        } catch { /* best-effort */ }
        return;
      }
      const downPaymentDollars = (data.downPaymentCents / 100).toFixed(2);
      lines.push({
        accountId: cashAccountId,
        debitAmount: downPaymentDollars,
        creditAmount: '0',
        memo: 'Initiation fee — down payment received',
      });
    }

    await postingApi.postEntry(ctx, {
      businessDate: new Date().toISOString().split('T')[0]!,
      sourceModule: 'membership',
      sourceReferenceId: `initiation-contract-${data.contractId}`,
      memo: `Initiation contract created: ${data.contractId}`,
      currency: 'USD',
      lines,
      forcePost: true,
    });
  } catch (err) {
    console.error(`[initiation-gl] Contract GL posting failed for ${data.contractId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'membership.initiation.contract.created.v1',
        sourceModule: 'membership',
        sourceReferenceId: data.contractId,
        entityType: 'posting_error',
        entityId: data.contractId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort */ }
  }
}

// ── B. Installment Billed ────────────────────────────────────────

/**
 * Handles membership.initiation.installment.billed.v1
 *
 * GL posting for installment billing:
 *   Dr Dues Receivable (or AR control fallback) — total payment amount
 *   Cr Notes Receivable — principal portion
 *   Cr Interest Income — interest portion (if > 0)
 *
 * Never throws — catches all errors.
 */
export async function handleInitiationInstallmentForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as InitiationInstallmentBilledPayload;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      console.error(`[initiation-gl] Accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    const contract = await loadContractGlAccounts(event.tenantId, data.contractId);
    if (!contract) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.installment.billed.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.scheduleEntryId,
          entityType: 'initiation_contract',
          entityId: data.contractId,
          reason: 'Initiation contract not found for installment GL posting',
        });
      } catch { /* best-effort */ }
      return;
    }

    const notesReceivableId = contract.glNotesReceivableAccountId;
    if (!notesReceivableId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.installment.billed.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.scheduleEntryId,
          entityType: 'notes_receivable',
          entityId: data.contractId,
          reason: 'Missing Notes Receivable GL account on initiation contract',
        });
      } catch { /* best-effort */ }
      return;
    }

    // Resolve dues receivable — prefer membership-specific, fall back to general AR
    let duesReceivableId: string | null = null;
    try {
      const [membershipSettings] = await db
        .select({ defaultDuesReceivableAccountId: membershipAccountingSettings.defaultDuesReceivableAccountId })
        .from(membershipAccountingSettings)
        .where(eq(membershipAccountingSettings.tenantId, event.tenantId))
        .limit(1);
      duesReceivableId = membershipSettings?.defaultDuesReceivableAccountId ?? null;
    } catch { /* best-effort */ }

    const arAccountId = duesReceivableId ?? settings.defaultARControlAccountId;
    if (!arAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.installment.billed.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.scheduleEntryId,
          entityType: 'ar_control',
          entityId: 'default',
          reason: 'Missing dues receivable and AR control account for installment billing',
        });
      } catch { /* best-effort */ }
      return;
    }

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.contractId);

    const paymentDollars = (data.paymentCents / 100).toFixed(2);
    const principalDollars = (data.principalCents / 100).toFixed(2);

    const lines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      memo: string;
    }> = [
      {
        accountId: arAccountId,
        debitAmount: paymentDollars,
        creditAmount: '0',
        memo: `Initiation installment ${data.periodIndex + 1} — dues receivable`,
      },
      {
        accountId: notesReceivableId,
        debitAmount: '0',
        creditAmount: principalDollars,
        memo: `Initiation installment ${data.periodIndex + 1} — principal reduction`,
      },
    ];

    // Interest income line (only if interest > 0)
    if (data.interestCents > 0) {
      const interestAccountId = contract.glInterestIncomeAccountId;
      if (!interestAccountId) {
        // Cannot skip the interest line — journal would be unbalanced
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'membership.initiation.installment.billed.v1',
            sourceModule: 'membership',
            sourceReferenceId: data.scheduleEntryId,
            entityType: 'interest_income',
            entityId: data.contractId,
            reason: 'Missing Interest Income GL account — cannot post installment with interest (journal would be unbalanced)',
          });
        } catch { /* best-effort */ }
        return;
      }
      const interestDollars = (data.interestCents / 100).toFixed(2);
      lines.push({
        accountId: interestAccountId,
        debitAmount: '0',
        creditAmount: interestDollars,
        memo: `Initiation installment ${data.periodIndex + 1} — interest income`,
      });
    }

    await postingApi.postEntry(ctx, {
      businessDate: data.dueDate,
      sourceModule: 'membership',
      sourceReferenceId: `initiation-installment-${data.scheduleEntryId}`,
      memo: `Initiation installment ${data.periodIndex + 1} billed: contract ${data.contractId}`,
      currency: 'USD',
      lines,
      forcePost: true,
    });
  } catch (err) {
    console.error(`[initiation-gl] Installment GL posting failed for ${data.scheduleEntryId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'membership.initiation.installment.billed.v1',
        sourceModule: 'membership',
        sourceReferenceId: data.scheduleEntryId,
        entityType: 'posting_error',
        entityId: data.scheduleEntryId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort */ }
  }
}

// ── C. Extra Principal Payment ───────────────────────────────────

/**
 * Handles membership.initiation.extra_principal.recorded.v1
 *
 * GL posting for extra principal payments:
 *   Dr Cash (Undeposited Funds)
 *   Cr Notes Receivable
 *
 * Never throws — catches all errors.
 */
export async function handleInitiationExtraPrincipalForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as InitiationExtraPrincipalPayload;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      console.error(`[initiation-gl] Accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    const contract = await loadContractGlAccounts(event.tenantId, data.contractId);
    if (!contract) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.extra_principal.recorded.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.contractId,
          entityType: 'initiation_contract',
          entityId: data.contractId,
          reason: 'Initiation contract not found for extra principal GL posting',
        });
      } catch { /* best-effort */ }
      return;
    }

    const notesReceivableId = contract.glNotesReceivableAccountId;
    if (!notesReceivableId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.extra_principal.recorded.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.contractId,
          entityType: 'notes_receivable',
          entityId: data.contractId,
          reason: 'Missing Notes Receivable GL account on initiation contract',
        });
      } catch { /* best-effort */ }
      return;
    }

    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;
    if (!cashAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.initiation.extra_principal.recorded.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.contractId,
          entityType: 'undeposited_funds',
          entityId: 'default',
          reason: 'Missing Undeposited Funds GL account for extra principal payment',
        });
      } catch { /* best-effort */ }
      return;
    }

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.contractId);
    const amountDollars = (data.amountCents / 100).toFixed(2);

    await postingApi.postEntry(ctx, {
      businessDate: data.effectiveDate,
      sourceModule: 'membership',
      sourceReferenceId: `initiation-extra-principal-${data.contractId}-${data.effectiveDate}`,
      memo: `Extra principal payment on initiation contract ${data.contractId}`,
      currency: 'USD',
      lines: [
        {
          accountId: cashAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          memo: 'Initiation fee — extra principal payment received',
        },
        {
          accountId: notesReceivableId,
          debitAmount: '0',
          creditAmount: amountDollars,
          memo: 'Initiation fee — notes receivable reduction',
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`[initiation-gl] Extra principal GL posting failed for ${data.contractId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'membership.initiation.extra_principal.recorded.v1',
        sourceModule: 'membership',
        sourceReferenceId: data.contractId,
        entityType: 'posting_error',
        entityId: data.contractId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort */ }
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function buildSyntheticCtx(tenantId: string, sourceRef?: string) {
  return {
    tenantId,
    locationId: null,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `initiation-gl-${sourceRef ?? 'unknown'}`,
    isPlatformAdmin: false,
  } as any;
}
