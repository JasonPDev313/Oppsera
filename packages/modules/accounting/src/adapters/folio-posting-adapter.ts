/**
 * PMS Folio → GL Posting Adapter
 *
 * Posts GL journal entries when folio charges are recorded.
 * Follows the same pattern as pos-posting-adapter.ts — never blocks PMS operations.
 *
 * Entry type GL mapping:
 *   ROOM_CHARGE, TAX, FEE → Debit Guest Ledger, Credit mapped account
 *   PAYMENT               → Debit mapped account (cash/bank), Credit Guest Ledger
 *   REFUND                → Debit Guest Ledger, Credit mapped account (cash/bank)
 *   ADJUSTMENT            → Direction depends on sign (positive = charge, negative = credit)
 */
import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { sql } from 'drizzle-orm';

interface FolioChargePostedPayload {
  folioId: string;
  reservationId: string | null;
  entryId: string;
  entryType: string; // ROOM_CHARGE, TAX, FEE, ADJUSTMENT, PAYMENT, REFUND
  amountCents: number;
}

/**
 * Resolve the GL account for a PMS folio entry type.
 * Returns null if no mapping exists.
 */
async function resolveFolioEntryTypeAccount(
  tenantId: string,
  entryType: string,
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT account_id
    FROM pms_folio_entry_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND entry_type = ${entryType}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.account_id ? String(arr[0]!.account_id) : null;
}

/**
 * Resolve the PMS Guest Ledger control account from settings.
 * Returns null if not configured.
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

export async function handleFolioChargeForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as FolioChargePostedPayload;

  try {
    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'pms.folio.charge_posted.v1',
          sourceModule: 'pms',
          sourceReferenceId: data.entryId,
          entityType: 'accounting_settings',
          entityId: tenantId,
          reason: 'CRITICAL: GL folio posting skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block PMS ops */ }
      console.error(`[folio-gl] CRITICAL: accounting settings missing for tenant=${tenantId} after ensureAccountingSettings`);
      return;
    }

    const accountingApi = getAccountingPostingApi();

  // Resolve guest ledger control account
  const guestLedgerAccountId = await resolveGuestLedgerAccount(tenantId);
  if (!guestLedgerAccountId) {
    await logUnmappedEvent(db, tenantId, {
      eventType: 'pms.folio.charge_posted.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.entryId,
      entityType: 'pms_guest_ledger',
      entityId: 'settings',
      reason: 'Missing PMS Guest Ledger control account in accounting settings',
    });
    return;
  }

  // Resolve the entry type → GL account
  const mappedAccountId = await resolveFolioEntryTypeAccount(tenantId, data.entryType);
  if (!mappedAccountId) {
    await logUnmappedEvent(db, tenantId, {
      eventType: 'pms.folio.charge_posted.v1',
      sourceModule: 'pms',
      sourceReferenceId: data.entryId,
      entityType: 'folio_entry_type',
      entityId: data.entryType,
      reason: `Missing GL mapping for PMS folio entry type: ${data.entryType}`,
    });
    return;
  }

  // Build GL lines based on entry type
  const amountDollars = Math.abs(data.amountCents / 100).toFixed(2);
  const isNegative = data.amountCents < 0;

  const glLines: Array<{
    accountId: string;
    debitAmount: string;
    creditAmount: string;
    memo?: string;
  }> = [];

  switch (data.entryType) {
    case 'ROOM_CHARGE':
    case 'TAX':
    case 'FEE': {
      // Charge to guest: Debit Guest Ledger, Credit Revenue/Tax account
      if (isNegative) {
        // Negative charge = credit memo / reversal
        glLines.push({ accountId: mappedAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `PMS ${data.entryType} reversal` });
        glLines.push({ accountId: guestLedgerAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `Guest Ledger - ${data.entryType} reversal` });
      } else {
        glLines.push({ accountId: guestLedgerAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `Guest Ledger - ${data.entryType}` });
        glLines.push({ accountId: mappedAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `PMS ${data.entryType}` });
      }
      break;
    }
    case 'PAYMENT': {
      // Guest payment: Debit Cash/Bank, Credit Guest Ledger
      glLines.push({ accountId: mappedAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `PMS Payment received` });
      glLines.push({ accountId: guestLedgerAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `Guest Ledger - payment` });
      break;
    }
    case 'REFUND': {
      // Guest refund: Debit Guest Ledger, Credit Cash/Bank
      glLines.push({ accountId: guestLedgerAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `Guest Ledger - refund` });
      glLines.push({ accountId: mappedAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `PMS Refund issued` });
      break;
    }
    case 'ADJUSTMENT': {
      // Adjustment: direction depends on sign
      if (isNegative) {
        // Negative adjustment = credit to guest
        glLines.push({ accountId: mappedAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `PMS Adjustment (credit)` });
        glLines.push({ accountId: guestLedgerAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `Guest Ledger - adjustment credit` });
      } else {
        glLines.push({ accountId: guestLedgerAccountId, debitAmount: amountDollars, creditAmount: '0', memo: `Guest Ledger - adjustment` });
        glLines.push({ accountId: mappedAccountId, debitAmount: '0', creditAmount: amountDollars, memo: `PMS Adjustment (debit)` });
      }
      break;
    }
    default: {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.folio.charge_posted.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.entryId,
        entityType: 'folio_entry_type',
        entityId: data.entryType,
        reason: `Unknown PMS folio entry type: ${data.entryType}`,
      });
      return;
    }
  }

  // Build synthetic context for GL posting
  const ctx = {
    tenantId,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `pms-gl-${data.entryId}`,
    isPlatformAdmin: false,
  } as RequestContext;

  // Determine business date from event timestamp
  const businessDate = event.occurredAt
    ? new Date(event.occurredAt as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

    await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'pms',
      sourceReferenceId: data.entryId,
      memo: `PMS Folio ${data.folioId} - ${data.entryType}${data.reservationId ? ` (Res: ${data.reservationId})` : ''}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    // PMS adapter must NEVER block folio operations — log and continue
    console.error(`PMS GL posting failed for folio entry ${data.entryId}:`, error);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'pms.folio.charge_posted.v1',
        sourceModule: 'pms',
        sourceReferenceId: data.entryId,
        entityType: 'posting_error',
        entityId: data.entryId,
        reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
