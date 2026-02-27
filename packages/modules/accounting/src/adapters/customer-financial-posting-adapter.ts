import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface LedgerEntryPostedData {
  transactionId: string;
  billingAccountId: string;
  customerId: string;
  type: 'manual_charge' | 'credit_memo' | 'writeoff';
  amountCents: number;
  newBalance: number;
  reason: string | null;
}

interface AccountTransferData {
  fromAccountId: string;
  toAccountId: string;
  customerId: string;
  amountCents: number;
  reason: string;
  debitTransactionId: string;
  creditTransactionId: string;
  newFromBalance: number;
  newToBalance: number;
}

interface WalletAdjustedData {
  customerId: string;
  walletAccountId: string;
  walletType: string;
  amountCents: number;
  newBalanceCents: number;
  customerWalletBalanceCents: number;
}

/**
 * GL posting for customer ledger adjustments (writeoff, credit memo, manual charge).
 *
 * writeoff (reduces AR, recognizes bad debt):
 *   Dr Bad Debt Expense (or Uncategorized)  / Cr Accounts Receivable
 *
 * credit_memo (reduces AR, returns revenue):
 *   Dr Revenue (or Uncategorized)           / Cr Accounts Receivable
 *
 * manual_charge (increases AR, recognizes revenue):
 *   Dr Accounts Receivable                  / Cr Revenue (or Uncategorized)
 *
 * Never throws — GL failures never block customer operations.
 */
export async function handleLedgerEntryForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as LedgerEntryPostedData;

  try {
    // Zero-amount entries skip GL
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.ledger_entry.posted.v1',
          sourceModule: 'customers',
          sourceReferenceId: data.transactionId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: `CRITICAL: GL ledger entry (${data.type}) posting skipped — accounting settings missing even after ensureAccountingSettings.`,
        });
      } catch { /* best-effort */ }
      console.error(`[customer-financial-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const arAccountId = settings.defaultARControlAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;

    if (!arAccountId || !revenueAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.ledger_entry.posted.v1',
          sourceModule: 'customers',
          sourceReferenceId: data.transactionId,
          entityType: 'gl_account',
          entityId: !arAccountId ? 'ar_control' : 'revenue',
          reason: `Ledger entry (${data.type}) of $${(Math.abs(data.amountCents) / 100).toFixed(2)} has no ${!arAccountId ? 'AR Control' : 'Revenue'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const absDollars = (Math.abs(data.amountCents) / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();

    if (data.type === 'manual_charge') {
      // Charge increases AR: Dr AR / Cr Revenue
      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: 'system', email: '' },
          requestId: `ledger-entry-gl-${data.transactionId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'customers',
          sourceReferenceId: `ledger-${data.transactionId}`,
          memo: `Manual charge: $${absDollars} — customer ${data.customerId}`,
          lines: [
            { accountId: arAccountId, debitAmount: absDollars, creditAmount: '0', memo: 'AR manual charge' },
            { accountId: revenueAccountId, debitAmount: '0', creditAmount: absDollars, memo: 'Revenue — manual charge' },
          ],
          forcePost: true,
        },
      );
    } else if (data.type === 'credit_memo') {
      // Credit memo reduces AR: Dr Revenue / Cr AR
      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: 'system', email: '' },
          requestId: `ledger-entry-gl-${data.transactionId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'customers',
          sourceReferenceId: `ledger-${data.transactionId}`,
          memo: `Credit memo: $${absDollars} — customer ${data.customerId}`,
          lines: [
            { accountId: revenueAccountId, debitAmount: absDollars, creditAmount: '0', memo: 'Revenue reversal — credit memo' },
            { accountId: arAccountId, debitAmount: '0', creditAmount: absDollars, memo: 'AR credit memo' },
          ],
          forcePost: true,
        },
      );
    } else if (data.type === 'writeoff') {
      // Writeoff reduces AR: Dr Bad Debt (or Uncategorized) / Cr AR
      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: 'system', email: '' },
          requestId: `ledger-entry-gl-${data.transactionId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'customers',
          sourceReferenceId: `ledger-${data.transactionId}`,
          memo: `Writeoff: $${absDollars} — customer ${data.customerId}`,
          lines: [
            { accountId: revenueAccountId, debitAmount: absDollars, creditAmount: '0', memo: 'Bad debt expense — writeoff' },
            { accountId: arAccountId, debitAmount: '0', creditAmount: absDollars, memo: 'AR writeoff' },
          ],
          forcePost: true,
        },
      );
    }
  } catch (error) {
    console.error(`[customer-financial-gl] GL posting failed for ledger entry ${data.transactionId}:`, error);
  }
}

/**
 * GL posting for AR balance transfer between billing accounts.
 *
 * Transfer moves AR from one sub-account to another:
 *   Dr AR Sub-Account A  / Cr AR Sub-Account B
 *
 * Since both sides are AR, this is typically GL-neutral if using a single AR control account.
 * We still post for audit trail and in case sub-accounts map to different GL accounts.
 *
 * Never throws — GL failures never block customer operations.
 */
export async function handleAccountTransferForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as AccountTransferData;

  try {
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.account_transfer.completed.v1',
          sourceModule: 'customers',
          sourceReferenceId: data.debitTransactionId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL account transfer posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[customer-financial-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const arAccountId = settings.defaultARControlAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!arAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer.account_transfer.completed.v1',
          sourceModule: 'customers',
          sourceReferenceId: data.debitTransactionId,
          entityType: 'gl_account',
          entityId: 'ar_control',
          reason: `Account transfer of $${(data.amountCents / 100).toFixed(2)} has no AR Control GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    // GL-neutral posting (Dr AR / Cr AR) for audit trail
    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `account-transfer-gl-${data.debitTransactionId}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'customers',
        sourceReferenceId: `acct-transfer-${data.debitTransactionId}`,
        memo: `AR transfer: $${amountDollars} between billing accounts — customer ${data.customerId}`,
        lines: [
          { accountId: arAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `AR transfer debit — from ${data.fromAccountId}` },
          { accountId: arAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `AR transfer credit — to ${data.toAccountId}` },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[customer-financial-gl] GL posting failed for account transfer ${data.debitTransactionId}:`, error);
  }
}

/**
 * GL posting for wallet balance adjustments (monetary wallets).
 *
 * If walletType is 'loyalty_points', skip GL (points are not monetary).
 * For monetary wallets (stored_value, credit, etc.):
 *   Increase (amountCents > 0):
 *     Dr Cash/Undeposited  / Cr Stored Value Liability (or Uncategorized)
 *   Decrease (amountCents < 0):
 *     Dr Stored Value Liability  / Cr Cash/Undeposited
 *
 * Never throws — GL failures never block customer operations.
 */
export async function handleWalletAdjustedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as WalletAdjustedData;

  try {
    // Loyalty points are not monetary — no GL
    if (data.walletType === 'loyalty_points') return;

    // Zero-amount adjustments skip GL
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer_wallet.adjusted.v1',
          sourceModule: 'customers',
          sourceReferenceId: data.walletAccountId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL wallet adjustment posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[customer-financial-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const settingsAny = settings as Record<string, any>;
    const liabilityAccountId = (settingsAny.defaultStoredValueLiabilityAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;
    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!liabilityAccountId || !cashAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'customer_wallet.adjusted.v1',
          sourceModule: 'customers',
          sourceReferenceId: data.walletAccountId,
          entityType: 'gl_account',
          entityId: !liabilityAccountId ? 'wallet_liability' : 'cash',
          reason: `Wallet adjustment of $${(Math.abs(data.amountCents) / 100).toFixed(2)} (${data.walletType}) has no ${!liabilityAccountId ? 'liability' : 'cash'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const absDollars = (Math.abs(data.amountCents) / 100).toFixed(2);
    const isIncrease = data.amountCents > 0;

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `wallet-adjust-gl-${data.walletAccountId}-${Date.now()}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'customers',
        sourceReferenceId: `wallet-adjust-${data.walletAccountId}-${event.eventId}`,
        memo: `Wallet ${isIncrease ? 'increase' : 'decrease'}: $${absDollars} (${data.walletType}) — customer ${data.customerId}`,
        lines: isIncrease
          ? [
              { accountId: cashAccountId, debitAmount: absDollars, creditAmount: '0', memo: `Wallet ${data.walletType} — cash received` },
              { accountId: liabilityAccountId, debitAmount: '0', creditAmount: absDollars, memo: `Wallet ${data.walletType} — liability increase` },
            ]
          : [
              { accountId: liabilityAccountId, debitAmount: absDollars, creditAmount: '0', memo: `Wallet ${data.walletType} — liability decrease` },
              { accountId: cashAccountId, debitAmount: '0', creditAmount: absDollars, memo: `Wallet ${data.walletType} — cash returned` },
            ],
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[customer-financial-gl] GL posting failed for wallet adjustment ${data.walletAccountId}:`, error);
  }
}
