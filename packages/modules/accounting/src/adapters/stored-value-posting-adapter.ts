import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface StoredValueIssuedData {
  instrumentId: string;
  customerId: string | null;
  instrumentType: string;
  code: string;
  initialValueCents: number;
  unitCount: number | null;
  liabilityGlAccountId: string | null;
}

interface StoredValueRedeemedData {
  instrumentId: string;
  customerId: string | null;
  instrumentType: string;
  code: string;
  amountCents: number;
  newBalance: number;
  newStatus: string;
  sourceModule: string | null;
  sourceId: string | null;
  liabilityGlAccountId: string | null;
}

/**
 * GL posting for stored value issuance.
 *
 * When a gift card / credit book / range card is issued with monetary value:
 *   Dr Cash (or Undeposited Funds)  / Cr Stored Value Liability
 *
 * Never throws — GL failures never block stored value operations.
 */
export async function handleStoredValueIssuedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as StoredValueIssuedData;

  try {
    // Zero-value instruments (e.g., unit-only range cards) skip GL
    if (data.initialValueCents === 0) return;

    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.issued.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL stored value issuance posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[stored-value-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Liability account: prefer instrument-specific, fall back to settings default
    const settingsAny = settings as Record<string, any>;
    const liabilityAccountId = data.liabilityGlAccountId
      ?? (settingsAny.defaultStoredValueLiabilityAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    // Debit: cash/undeposited funds
    const debitAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!liabilityAccountId || !debitAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.issued.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'gl_account',
          entityId: !liabilityAccountId ? 'stored_value_liability' : 'undeposited_funds',
          reason: `Stored value issuance of $${(data.initialValueCents / 100).toFixed(2)} (${data.instrumentType} ${data.code}) has no ${!liabilityAccountId ? 'liability' : 'cash'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.initialValueCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `stored-value-gl-issue-${data.instrumentId}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'stored_value',
        sourceReferenceId: `issue-${data.instrumentId}`,
        memo: `Stored value issued: ${data.instrumentType} ${data.code} ($${amountDollars})`,
        lines: [
          {
            accountId: debitAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `${data.instrumentType} sale - ${data.code}`,
          },
          {
            accountId: liabilityAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Stored value liability - ${data.code}`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    // GL failures NEVER block stored value operations
    console.error(`[stored-value-gl] GL posting failed for issuance ${data.instrumentId}:`, error);
  }
}

/**
 * GL posting for stored value redemption.
 *
 * When a gift card / credit book is redeemed:
 *   Dr Stored Value Liability  / Cr Revenue
 *
 * Never throws — GL failures never block stored value operations.
 */
export async function handleStoredValueRedeemedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as StoredValueRedeemedData;

  try {
    // Zero-amount redemptions skip GL
    if (data.amountCents === 0) return;

    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.redeemed.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL stored value redemption posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[stored-value-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Liability account: prefer instrument-specific, fall back to settings default
    const settingsAny2 = settings as Record<string, any>;
    const liabilityAccountId = data.liabilityGlAccountId
      ?? (settingsAny2.defaultStoredValueLiabilityAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    // Credit: revenue
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;

    if (!liabilityAccountId || !revenueAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.redeemed.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'gl_account',
          entityId: !liabilityAccountId ? 'stored_value_liability' : 'revenue',
          reason: `Stored value redemption of $${(data.amountCents / 100).toFixed(2)} (${data.instrumentType} ${data.code}) has no ${!liabilityAccountId ? 'liability' : 'revenue'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `stored-value-gl-redeem-${data.instrumentId}-${Date.now()}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'stored_value',
        sourceReferenceId: `redeem-${data.instrumentId}-${event.eventId}`,
        memo: `Stored value redeemed: ${data.instrumentType} ${data.code} ($${amountDollars})`,
        lines: [
          {
            accountId: liabilityAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `Stored value liability clearing - ${data.code}`,
          },
          {
            accountId: revenueAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Stored value revenue recognition - ${data.code}`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    // GL failures NEVER block stored value operations
    console.error(`[stored-value-gl] GL posting failed for redemption ${data.instrumentId}:`, error);
  }
}

interface StoredValueVoidedData {
  instrumentId: string;
  customerId: string | null;
  instrumentType: string;
  code: string;
  previousBalance: number; // cents
  approvedBy: string | null;
  liabilityGlAccountId: string | null;
}

interface StoredValueReloadedData {
  instrumentId: string;
  customerId: string | null;
  instrumentType: string;
  code: string;
  amountCents: number;
  newBalance: number;
  liabilityGlAccountId: string | null;
}

interface StoredValueTransferredData {
  sourceInstrumentId: string;
  targetInstrumentId: string;
  sourceCustomerId: string | null;
  targetCustomerId: string | null;
  amountCents: number;
  newSourceBalance: number;
  newTargetBalance: number;
  newSourceStatus: string;
  approvedBy: string | null;
}

/**
 * GL posting for stored value void (gift card cancelled, credit book voided).
 *
 * Reverses the original liability:
 *   Dr Stored Value Liability  / Cr Cash (return to customer) or Breakage Income
 *
 * Never throws — GL failures never block stored value operations.
 */
export async function handleStoredValueVoidedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as StoredValueVoidedData;

  try {
    // Zero-balance voids skip GL
    if (data.previousBalance === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.voided.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL stored value void posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[stored-value-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const settingsAny = settings as Record<string, any>;
    const liabilityAccountId = data.liabilityGlAccountId
      ?? (settingsAny.defaultStoredValueLiabilityAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    // Credit side: return cash or recognize breakage income
    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!liabilityAccountId || !cashAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.voided.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'gl_account',
          entityId: !liabilityAccountId ? 'stored_value_liability' : 'cash',
          reason: `Stored value void of $${(data.previousBalance / 100).toFixed(2)} (${data.instrumentType} ${data.code}) has no ${!liabilityAccountId ? 'liability' : 'cash'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.previousBalance / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `stored-value-gl-void-${data.instrumentId}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'stored_value',
        sourceReferenceId: `void-${data.instrumentId}`,
        memo: `Stored value voided: ${data.instrumentType} ${data.code} ($${amountDollars})`,
        lines: [
          {
            accountId: liabilityAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `Stored value liability reversal - ${data.code}`,
          },
          {
            accountId: cashAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Stored value void — cash returned - ${data.code}`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[stored-value-gl] GL posting failed for void ${data.instrumentId}:`, error);
  }
}

/**
 * GL posting for stored value reload (add balance to existing gift card / credit book).
 *
 * Same as issuance:
 *   Dr Cash (Undeposited Funds)  / Cr Stored Value Liability
 *
 * Never throws — GL failures never block stored value operations.
 */
export async function handleStoredValueReloadedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as StoredValueReloadedData;

  try {
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.reloaded.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL stored value reload posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[stored-value-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const settingsAny = settings as Record<string, any>;
    const liabilityAccountId = data.liabilityGlAccountId
      ?? (settingsAny.defaultStoredValueLiabilityAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    const debitAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!liabilityAccountId || !debitAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.reloaded.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.instrumentId,
          entityType: 'gl_account',
          entityId: !liabilityAccountId ? 'stored_value_liability' : 'undeposited_funds',
          reason: `Stored value reload of $${(data.amountCents / 100).toFixed(2)} (${data.instrumentType} ${data.code}) has no ${!liabilityAccountId ? 'liability' : 'cash'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `stored-value-gl-reload-${data.instrumentId}-${Date.now()}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'stored_value',
        sourceReferenceId: `reload-${data.instrumentId}-${event.eventId}`,
        memo: `Stored value reloaded: ${data.instrumentType} ${data.code} ($${amountDollars})`,
        lines: [
          {
            accountId: debitAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `${data.instrumentType} reload - ${data.code}`,
          },
          {
            accountId: liabilityAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Stored value liability increase - ${data.code}`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[stored-value-gl] GL posting failed for reload ${data.instrumentId}:`, error);
  }
}

/**
 * GL posting for stored value transfer (move balance between instruments).
 *
 * Transfer between liability accounts:
 *   Dr Stored Value Liability (source)  / Cr Stored Value Liability (target)
 *
 * Since both sides are liability, this is GL-neutral if using a single liability account.
 * We still post for audit trail.
 *
 * Never throws — GL failures never block stored value operations.
 */
export async function handleStoredValueTransferredForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as StoredValueTransferredData;

  try {
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.transferred.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.sourceInstrumentId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL stored value transfer posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[stored-value-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const settingsAny = settings as Record<string, any>;
    const liabilityAccountId = (settingsAny.defaultStoredValueLiabilityAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!liabilityAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.stored_value.transferred.v1',
          sourceModule: 'stored_value',
          sourceReferenceId: data.sourceInstrumentId,
          entityType: 'gl_account',
          entityId: 'stored_value_liability',
          reason: `Stored value transfer of $${(data.amountCents / 100).toFixed(2)} has no liability GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `stored-value-gl-transfer-${data.sourceInstrumentId}-${Date.now()}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'stored_value',
        sourceReferenceId: `transfer-${data.sourceInstrumentId}-to-${data.targetInstrumentId}-${event.eventId}`,
        memo: `Stored value transfer: $${amountDollars} from ${data.sourceInstrumentId} to ${data.targetInstrumentId}`,
        lines: [
          {
            accountId: liabilityAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `SV transfer debit — source ${data.sourceInstrumentId}`,
          },
          {
            accountId: liabilityAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `SV transfer credit — target ${data.targetInstrumentId}`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[stored-value-gl] GL posting failed for transfer from ${data.sourceInstrumentId}:`, error);
  }
}
