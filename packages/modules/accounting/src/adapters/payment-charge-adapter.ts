/**
 * PMS Card Charge / Refund → GL Posting Adapter
 *
 * Handles pms.payment.charged.v1 and pms.payment.refunded.v1 events.
 * These events fire when card charges/refunds are processed directly on a folio
 * (not via the folio.charge_posted path which handles the PAYMENT folio entry).
 *
 * GL entries:
 *   Charge (succeeded): Dr Cash/Bank (PAYMENT mapping), Cr Guest Ledger
 *   Refund (refunded):  Dr Guest Ledger, Cr Cash/Bank (PAYMENT mapping)
 *
 * Never throws — GL adapter safety rule (Gotcha #9).
 */
import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { sql } from 'drizzle-orm';

interface PaymentChargedPayload {
  transactionId: string;
  reservationId: string;
  folioId: string;
  amountCents: number;
  status: 'succeeded' | 'failed';
}

interface PaymentRefundedPayload {
  transactionId: string;
  originalTransactionId: string;
  reservationId: string;
  amountCents: number;
  status: 'refunded' | 'failed';
}

async function resolvePaymentGlAccount(tenantId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT account_id
    FROM pms_folio_entry_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND entry_type = 'PAYMENT'
    LIMIT 1
  `);
  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.account_id ? String(arr[0]!.account_id) : null;
}

async function resolveGuestLedgerAccount(tenantId: string): Promise<string | null> {
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

export async function handlePaymentChargedForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as PaymentChargedPayload;

  // Only post GL for successful charges
  if (data.status !== 'succeeded') return;

  try {
    try { await ensureAccountingSettings(db, tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const guestLedgerAccountId = await resolveGuestLedgerAccount(tenantId);
    if (!guestLedgerAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.charged.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'pms_guest_ledger',
        entityId: 'settings',
        reason: 'Missing PMS Guest Ledger control account in accounting settings',
      });
      return;
    }

    const paymentAccountId = await resolvePaymentGlAccount(tenantId);
    if (!paymentAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.charged.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'folio_entry_type',
        entityId: 'PAYMENT',
        reason: 'Missing GL mapping for PMS PAYMENT entry type',
      });
      return;
    }

    const amountDollars = Math.abs(data.amountCents / 100).toFixed(2);
    const accountingApi = getAccountingPostingApi();

    const ctx = {
      tenantId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `pms-charge-gl-${data.transactionId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    const businessDate = event.occurredAt
      ? new Date(event.occurredAt as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Card charge: Dr Cash/Bank, Cr Guest Ledger
    await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      memo: `PMS Card Charge - Folio ${data.folioId}${data.reservationId ? ` (Res: ${data.reservationId})` : ''}`,
      currency: settings.baseCurrency,
      lines: [
        { accountId: paymentAccountId, debitAmount: amountDollars, creditAmount: '0', memo: 'PMS Card payment received' },
        { accountId: guestLedgerAccountId, debitAmount: '0', creditAmount: amountDollars, memo: 'Guest Ledger - card payment' },
      ],
      forcePost: true,
    });
  } catch (error) {
    console.error(`PMS card charge GL posting failed for txn ${data.transactionId}:`, error);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.charged.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'posting_error',
        entityId: data.transactionId,
        reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch { /* best-effort */ }
  }
}

export async function handlePaymentRefundedForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as PaymentRefundedPayload;

  // Only post GL for successful refunds
  if (data.status !== 'refunded') return;

  try {
    try { await ensureAccountingSettings(db, tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const guestLedgerAccountId = await resolveGuestLedgerAccount(tenantId);
    if (!guestLedgerAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.refunded.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'pms_guest_ledger',
        entityId: 'settings',
        reason: 'Missing PMS Guest Ledger control account in accounting settings',
      });
      return;
    }

    const paymentAccountId = await resolvePaymentGlAccount(tenantId);
    if (!paymentAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.refunded.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'folio_entry_type',
        entityId: 'PAYMENT',
        reason: 'Missing GL mapping for PMS PAYMENT entry type',
      });
      return;
    }

    const amountDollars = Math.abs(data.amountCents / 100).toFixed(2);
    const accountingApi = getAccountingPostingApi();

    const ctx = {
      tenantId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `pms-refund-gl-${data.transactionId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    const businessDate = event.occurredAt
      ? new Date(event.occurredAt as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Refund: Dr Guest Ledger, Cr Cash/Bank
    await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      memo: `PMS Card Refund - Res ${data.reservationId} (orig: ${data.originalTransactionId})`,
      currency: settings.baseCurrency,
      lines: [
        { accountId: guestLedgerAccountId, debitAmount: amountDollars, creditAmount: '0', memo: 'Guest Ledger - refund' },
        { accountId: paymentAccountId, debitAmount: '0', creditAmount: amountDollars, memo: 'PMS Card refund issued' },
      ],
      forcePost: true,
    });
  } catch (error) {
    console.error(`PMS card refund GL posting failed for txn ${data.transactionId}:`, error);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.payment.refunded.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'posting_error',
        entityId: data.transactionId,
        reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch { /* best-effort */ }
  }
}
