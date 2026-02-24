/**
 * PMS Deposit → GL Posting Adapter
 *
 * Posts GL journal entries for deposit authorization and capture events.
 *
 * Authorization (hold):  Dr Undeposited Funds, Cr Guest Deposits Liability
 * Capture (charge):      Dr Guest Deposits Liability, Cr Guest Ledger (applies to folio)
 *
 * Follows the never-throw pattern — GL failures are logged, never block PMS operations.
 */
import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { sql } from 'drizzle-orm';

interface DepositAuthorizedPayload {
  transactionId: string;
  reservationId: string;
  amountCents: number;
  guestId: string;
  paymentMethodId: string | null;
}

interface DepositCapturedPayload {
  transactionId: string;
  reservationId: string;
  amountCents: number;
  guestId: string;
}

/**
 * Resolve the Guest Deposits Liability account.
 * Uses pms_folio_entry_type_gl_defaults with entry_type = 'DEPOSIT'.
 */
async function resolveDepositLiabilityAccount(
  tenantId: string,
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT account_id
    FROM pms_folio_entry_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND entry_type = 'DEPOSIT'
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.account_id ? String(arr[0]!.account_id) : null;
}

/**
 * Resolve the Undeposited Funds account from settings.
 */
async function resolveUndepositedFundsAccount(
  tenantId: string,
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT default_undeposited_funds_account_id
    FROM accounting_settings
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.default_undeposited_funds_account_id
    ? String(arr[0]!.default_undeposited_funds_account_id)
    : null;
}

/**
 * Resolve the PMS Guest Ledger control account from settings.
 */
async function resolveGuestLedgerAccount(
  tenantId: string,
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT default_pms_guest_ledger_account_id
    FROM accounting_settings
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.default_pms_guest_ledger_account_id
    ? String(arr[0]!.default_pms_guest_ledger_account_id)
    : null;
}

/**
 * Handles deposit authorization — creates a liability for the held deposit.
 * Dr Undeposited Funds (asset - card hold), Cr Guest Deposits (liability)
 */
export async function handleDepositAuthorizedForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as DepositAuthorizedPayload;

  try {
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const accountingApi = getAccountingPostingApi();

    const undepositedFundsAccountId = await resolveUndepositedFundsAccount(tenantId);
    if (!undepositedFundsAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.authorized.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'undeposited_funds',
        entityId: 'settings',
        reason: 'Missing Undeposited Funds account in accounting settings',
      });
      return;
    }

    const depositLiabilityAccountId = await resolveDepositLiabilityAccount(tenantId);
    if (!depositLiabilityAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.authorized.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'folio_entry_type',
        entityId: 'DEPOSIT',
        reason: 'Missing GL mapping for PMS DEPOSIT entry type',
      });
      return;
    }

    const amountDollars = Math.abs(data.amountCents / 100).toFixed(2);

    const glLines = [
      {
        accountId: undepositedFundsAccountId,
        debitAmount: amountDollars,
        creditAmount: '0',
        memo: `Deposit authorization hold`,
      },
      {
        accountId: depositLiabilityAccountId,
        debitAmount: '0',
        creditAmount: amountDollars,
        memo: `Guest Deposits liability`,
      },
    ];

    const ctx = {
      tenantId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `pms-deposit-auth-gl-${data.transactionId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    const businessDate = event.occurredAt
      ? new Date(event.occurredAt as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'pms',
      sourceReferenceId: `deposit-auth-${data.transactionId}`,
      memo: `PMS Deposit Authorization (Res: ${data.reservationId})`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    console.error(`PMS Deposit auth GL posting failed for ${data.transactionId}:`, error);
    await logUnmappedEvent(db, tenantId, {
      eventType: 'pms.payment.authorized.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      entityType: 'posting_error',
      entityId: data.transactionId,
      reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }).catch(() => {});
  }
}

/**
 * Handles deposit capture — releases liability and applies to guest folio.
 * Dr Guest Deposits (reduce liability), Cr Guest Ledger (apply to folio balance)
 */
export async function handleDepositCapturedForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as DepositCapturedPayload;

  try {
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const accountingApi = getAccountingPostingApi();

    const depositLiabilityAccountId = await resolveDepositLiabilityAccount(tenantId);
    if (!depositLiabilityAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.captured.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'folio_entry_type',
        entityId: 'DEPOSIT',
        reason: 'Missing GL mapping for PMS DEPOSIT entry type',
      });
      return;
    }

    const guestLedgerAccountId = await resolveGuestLedgerAccount(tenantId);
    if (!guestLedgerAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.captured.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'pms_guest_ledger',
        entityId: 'settings',
        reason: 'Missing PMS Guest Ledger control account in accounting settings',
      });
      return;
    }

    const amountDollars = Math.abs(data.amountCents / 100).toFixed(2);

    const glLines = [
      {
        accountId: depositLiabilityAccountId,
        debitAmount: amountDollars,
        creditAmount: '0',
        memo: `Deposit captured - liability released`,
      },
      {
        accountId: guestLedgerAccountId,
        debitAmount: '0',
        creditAmount: amountDollars,
        memo: `Guest Ledger - deposit applied`,
      },
    ];

    const ctx = {
      tenantId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `pms-deposit-cap-gl-${data.transactionId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    const businessDate = event.occurredAt
      ? new Date(event.occurredAt as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'pms',
      sourceReferenceId: `deposit-capture-${data.transactionId}`,
      memo: `PMS Deposit Capture (Res: ${data.reservationId})`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    console.error(`PMS Deposit capture GL posting failed for ${data.transactionId}:`, error);
    await logUnmappedEvent(db, tenantId, {
      eventType: 'pms.payment.captured.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      entityType: 'posting_error',
      entityId: data.transactionId,
      reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }).catch(() => {});
  }
}
