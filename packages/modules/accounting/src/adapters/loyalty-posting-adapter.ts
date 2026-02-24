/**
 * PMS Loyalty Redemption → GL Posting Adapter
 *
 * Posts GL journal entries when loyalty points are redeemed for folio credits.
 * Pattern: Debit Loyalty Points Liability, Credit Guest Ledger
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

interface LoyaltyPointsRedeemedPayload {
  memberId: string;
  transactionId: string;
  points: number;
  dollarValue: number; // in cents
  reservationId: string | null;
  guestId: string;
}

/**
 * Resolve the Loyalty Points Liability account.
 * Uses a PMS-specific setting or falls back to general liability.
 */
async function resolveLoyaltyLiabilityAccount(
  tenantId: string,
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT account_id
    FROM pms_folio_entry_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND entry_type = 'LOYALTY_REDEMPTION'
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.account_id ? String(arr[0]!.account_id) : null;
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

export async function handleLoyaltyRedemptionForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as LoyaltyPointsRedeemedPayload;

  try {
    // Check if accounting is enabled for this tenant
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const accountingApi = getAccountingPostingApi();

    // Resolve accounts
    const guestLedgerAccountId = await resolveGuestLedgerAccount(tenantId);
    if (!guestLedgerAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.loyalty.points_redeemed.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'pms_guest_ledger',
        entityId: 'settings',
        reason: 'Missing PMS Guest Ledger control account in accounting settings',
      });
      return;
    }

    const loyaltyLiabilityAccountId = await resolveLoyaltyLiabilityAccount(tenantId);
    if (!loyaltyLiabilityAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.loyalty.points_redeemed.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.transactionId,
        entityType: 'folio_entry_type',
        entityId: 'LOYALTY_REDEMPTION',
        reason: 'Missing GL mapping for PMS LOYALTY_REDEMPTION entry type',
      });
      return;
    }

    const amountDollars = Math.abs(data.dollarValue / 100).toFixed(2);

    // Loyalty redemption = credit to guest folio
    // Dr Loyalty Points Liability (reduce liability)
    // Cr Guest Ledger (reduce guest receivable)
    const glLines = [
      {
        accountId: loyaltyLiabilityAccountId,
        debitAmount: amountDollars,
        creditAmount: '0',
        memo: `Loyalty redemption - ${data.points} points`,
      },
      {
        accountId: guestLedgerAccountId,
        debitAmount: '0',
        creditAmount: amountDollars,
        memo: `Guest Ledger - loyalty redemption`,
      },
    ];

    const ctx = {
      tenantId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `pms-loyalty-gl-${data.transactionId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    const businessDate = event.occurredAt
      ? new Date(event.occurredAt as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'pms',
      sourceReferenceId: `loyalty-redeem-${data.transactionId}`,
      memo: `PMS Loyalty Redemption - ${data.points} pts${data.reservationId ? ` (Res: ${data.reservationId})` : ''}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    // Never block PMS operations
    console.error(`PMS Loyalty GL posting failed for transaction ${data.transactionId}:`, error);
    await logUnmappedEvent(db, tenantId, {
      eventType: 'pms.loyalty.points_redeemed.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.transactionId,
      entityType: 'posting_error',
      entityId: data.transactionId,
      reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }).catch(() => {}); // double-safety: even logging must not throw
  }
}
