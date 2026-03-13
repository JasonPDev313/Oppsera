/**
 * PMS Deposit → GL Posting Adapter
 *
 * Posts GL journal entries for deposit authorization and capture events.
 *
 * Authorization (hold):  Dr Undeposited Funds, Cr Guest Deposits Liability
 * Capture (charge):      Dr Guest Deposits Liability, Cr Guest Ledger (applies to folio)
 *
 * Permanent errors (bad config/mapping) are swallowed — retry won't help.
 * Transient errors are re-thrown so the outbox retries this event.
 */
import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { handleGlPostingError } from '../helpers/handle-gl-posting-error';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
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
 * Handles deposit authorization — creates a liability for the held deposit.
 * Dr Undeposited Funds (asset - card hold), Cr Guest Deposits (liability)
 */
export async function handleDepositAuthorizedForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as DepositAuthorizedPayload;

  try {
    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'pms.payment.authorized.v1',
          sourceModule: 'pms',
          sourceReferenceId: data.transactionId,
          entityType: 'accounting_settings',
          entityId: tenantId,
          reason: 'CRITICAL: GL deposit authorization posting skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block PMS ops */ }
      console.error(`[deposit-gl] CRITICAL: accounting settings missing for tenant=${tenantId} after ensureAccountingSettings`);
      return;
    }

    const accountingApi = getAccountingPostingApi();

    const undepositedFundsAccountId = settings.defaultUndepositedFundsAccountId;
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
      sourceIdempotencyKey: `deposits:authorize:${data.transactionId}`,
      memo: `PMS Deposit Authorization (Res: ${data.reservationId})`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    await handleGlPostingError(error, db, tenantId, {
      eventType: 'pms.payment.authorized.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      entityId: data.transactionId,
    }, 'deposit-gl');
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
    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'pms.payment.captured.v1',
          sourceModule: 'pms',
          sourceReferenceId: data.transactionId,
          entityType: 'accounting_settings',
          entityId: tenantId,
          reason: 'CRITICAL: GL deposit capture posting skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block PMS ops */ }
      console.error(`[deposit-gl] CRITICAL: accounting settings missing for tenant=${tenantId} after ensureAccountingSettings`);
      return;
    }

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

    const guestLedgerAccountId = settings.defaultPmsGuestLedgerAccountId;
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
      sourceIdempotencyKey: `deposits:capture:${data.transactionId}`,
      memo: `PMS Deposit Capture (Res: ${data.reservationId})`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    await handleGlPostingError(error, db, tenantId, {
      eventType: 'pms.payment.captured.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      entityId: data.transactionId,
    }, 'deposit-gl');
  }
}
