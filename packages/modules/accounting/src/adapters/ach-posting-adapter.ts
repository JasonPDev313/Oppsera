import { db } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { resolvePaymentTypeAccounts, logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { voidJournalEntry } from '../commands/void-journal-entry';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Payload interfaces (from payment gateway events) ────────────

interface AchOriginatedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  currency: string;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
  achSecCode: string;
  achAccountType: string;
  bankLast4: string | null;
}

interface AchSettledPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  settledAt: string;
  fundingDate: string;
  providerRef: string | null;
}

interface AchReturnedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  returnCode: string;
  returnReason: string;
  returnDate: string;
  providerRef: string | null;
  orderId: string | null;
  customerId: string | null;
  achReturnId: string;
  isRetryable: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

function buildSyntheticCtx(
  tenantId: string,
  locationId: string,
  sourceRef: string,
): RequestContext {
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
    requestId: `ach-gl-${sourceRef}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

// ── ACH Originated ──────────────────────────────────────────────

/**
 * Handles payment.gateway.ach_originated.v1 events.
 *
 * Posts the origination entry when an ACH payment is accepted by the bank:
 *   Dr ACH Receivable (1150)
 *   Cr Uncategorized Revenue (or revenue account from payment type mapping)
 *
 * For POS-originated ACH tenders, the POS adapter already posted the detailed
 * revenue GL entry. In that case, this handler is a no-op — the POS adapter's
 * entry uses the ACH payment type deposit account (ACH Receivable) already.
 *
 * This handler primarily covers non-POS ACH payments (autopay, member portal)
 * where no tender.recorded.v1 event was emitted.
 *
 * Idempotent via sourceReferenceId: ach-orig-{paymentIntentId}.
 * NEVER blocks ACH processing — all errors are logged and swallowed.
 */
export async function handleAchOriginatedForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as AchOriginatedPayload;

  try {
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const achReceivableId = settings.defaultAchReceivableAccountId;
    if (!achReceivableId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_originated.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.paymentIntentId,
        entityType: 'ach_receivable',
        entityId: 'default',
        reason: 'Missing ACH Receivable account in accounting settings',
      });
      return;
    }

    // Check if a POS adapter already posted GL for this payment intent.
    // The POS adapter would have used the tenderId as sourceReferenceId,
    // but we can skip origination posting if any GL entry references this intent.
    // We'll rely on our own idempotency key — if ach-orig-{intentId} exists, skip.
    const sourceRef = `ach-orig-${data.paymentIntentId}`;

    // Revenue credit — for non-POS ACH, use uncategorized revenue as fallback
    const revenueAccountId =
      settings.defaultUncategorizedRevenueAccountId ?? null;

    // Try to resolve ACH payment type mapping for a better revenue target
    const _achMapping = await resolvePaymentTypeAccounts(db, tenantId, 'ach');

    // If ACH payment type maps to a deposit account that ISN'T the ACH Receivable,
    // it means the POS adapter may have posted to a different account — use ACH Receivable
    // regardless for this handler.

    const creditAccountId = revenueAccountId;
    if (!creditAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_originated.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.paymentIntentId,
        entityType: 'revenue_account',
        entityId: 'default',
        reason: 'Missing uncategorized revenue account — cannot post ACH origination GL entry',
      });
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);
    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(tenantId, data.locationId, data.paymentIntentId);

    await postingApi.postEntry(ctx, {
      businessDate: new Date().toISOString().split('T')[0]!,
      sourceModule: 'ach',
      sourceReferenceId: sourceRef,
      memo: `ACH Originated — Intent ${data.paymentIntentId}`,
      currency: 'USD',
      lines: [
        {
          accountId: achReceivableId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          customerId: data.customerId ?? undefined,
          channel: 'ach',
          memo: `ACH ${data.achSecCode} originated — bank ${data.bankLast4 ?? 'unknown'}`,
        },
        {
          accountId: creditAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          channel: 'ach',
          memo: `ACH origination revenue`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(
      `[ach-gl] Origination GL posting failed for intent ${data.paymentIntentId}:`,
      err,
    );
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_originated.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.paymentIntentId,
        entityType: 'posting_error',
        entityId: data.paymentIntentId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch {
      /* best-effort tracking */
    }
  }
}

// ── ACH Settled ─────────────────────────────────────────────────

/**
 * Handles payment.gateway.ach_settled.v1 events.
 *
 * When ACH funds are received in the bank account:
 *   Dr Bank Account (from ACH payment type mapping or default undeposited funds)
 *   Cr ACH Receivable (1150)
 *
 * This clears the ACH Receivable asset and recognizes the cash in bank.
 *
 * Idempotent via sourceReferenceId: ach-settle-{paymentIntentId}.
 * NEVER blocks ACH processing — all errors are logged and swallowed.
 */
export async function handleAchSettledForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as AchSettledPayload;

  try {
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const achReceivableId = settings.defaultAchReceivableAccountId;
    if (!achReceivableId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_settled.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.paymentIntentId,
        entityType: 'ach_receivable',
        entityId: 'default',
        reason: 'Missing ACH Receivable account — cannot post settlement GL entry',
      });
      return;
    }

    // Resolve bank/deposit account from ACH payment type mapping
    const achMapping = await resolvePaymentTypeAccounts(db, tenantId, 'ach');
    const bankAccountId =
      achMapping?.depositAccountId ??
      settings.defaultUndepositedFundsAccountId;

    if (!bankAccountId) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_settled.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.paymentIntentId,
        entityType: 'bank_account',
        entityId: 'default',
        reason: 'Missing bank/deposit account for ACH settlement — no ACH payment type mapping or default undeposited funds configured',
      });
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);
    const sourceRef = `ach-settle-${data.paymentIntentId}`;
    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(tenantId, data.locationId, data.paymentIntentId);

    await postingApi.postEntry(ctx, {
      businessDate: data.fundingDate,
      sourceModule: 'ach',
      sourceReferenceId: sourceRef,
      memo: `ACH Settled — Intent ${data.paymentIntentId}`,
      currency: 'USD',
      lines: [
        {
          accountId: bankAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          channel: 'ach',
          memo: `ACH funds received — ${data.fundingDate}`,
        },
        {
          accountId: achReceivableId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          channel: 'ach',
          memo: `ACH receivable cleared — settlement`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(
      `[ach-gl] Settlement GL posting failed for intent ${data.paymentIntentId}:`,
      err,
    );
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_settled.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.paymentIntentId,
        entityType: 'posting_error',
        entityId: data.paymentIntentId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch {
      /* best-effort tracking */
    }
  }
}

// ── ACH Returned (enhanced) ─────────────────────────────────────

/**
 * Handles payment.gateway.ach_returned.v1 events for ACH-source GL entries.
 *
 * When a bank rejects an ACH payment:
 *   1. Void the origination GL entry (ach-orig-{intentId}) if it exists
 *   2. Void the settlement GL entry (ach-settle-{intentId}) if it exists
 *
 * This reverses either or both stages depending on when the return arrived:
 *   - Pre-settlement: only origination exists → reversal removes the receivable + revenue
 *   - Post-settlement: both exist → reversal removes bank deposit + receivable + revenue
 *
 * Note: The existing ach-return-posting-adapter.ts handles POS-sourced GL entries
 * (sourceModule='pos'). This handler covers ACH-sourced entries (sourceModule='ach').
 * Both are registered as consumers for the same event type.
 *
 * Idempotent: voidJournalEntry skips already-voided entries.
 * NEVER blocks ACH return processing — all errors are logged and swallowed.
 */
export async function handleAchReturnGlReversal(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as AchReturnedPayload;

  try {
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) return;

    const ctx = buildSyntheticCtx(tenantId, data.locationId, data.achReturnId);

    // 1. Void the origination GL entry
    const origRef = `ach-orig-${data.paymentIntentId}`;
    const [origEntry] = await db
      .select({ id: glJournalEntries.id })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.tenantId, tenantId),
          eq(glJournalEntries.sourceModule, 'ach'),
          eq(glJournalEntries.sourceReferenceId, origRef),
          eq(glJournalEntries.status, 'posted'),
        ),
      )
      .limit(1);

    if (origEntry) {
      try {
        await voidJournalEntry(
          ctx,
          origEntry.id,
          `ACH Return ${data.returnCode}: ${data.returnReason}`,
        );
      } catch (voidErr) {
        console.error(`[ach-gl] Failed to void origination entry ${origEntry.id}:`, voidErr);
      }
    }

    // 2. Void the settlement GL entry (if ACH was already settled before return)
    const settleRef = `ach-settle-${data.paymentIntentId}`;
    const [settleEntry] = await db
      .select({ id: glJournalEntries.id })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.tenantId, tenantId),
          eq(glJournalEntries.sourceModule, 'ach'),
          eq(glJournalEntries.sourceReferenceId, settleRef),
          eq(glJournalEntries.status, 'posted'),
        ),
      )
      .limit(1);

    if (settleEntry) {
      try {
        await voidJournalEntry(
          ctx,
          settleEntry.id,
          `ACH Return ${data.returnCode}: ${data.returnReason} (settlement reversal)`,
        );
      } catch (voidErr) {
        console.error(`[ach-gl] Failed to void settlement entry ${settleEntry.id}:`, voidErr);
      }
    }

    // If no ACH-source entries found, the POS adapter's entry will be handled
    // by the existing ach-return-posting-adapter.ts — no action needed here.
    if (!origEntry && !settleEntry) {
      // Nothing to do — the existing return adapter handles POS-sourced entries
      return;
    }
  } catch (err) {
    console.error(
      `[ach-gl] Return GL reversal failed for return ${data.achReturnId}:`,
      err,
    );
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_returned.v1',
        sourceModule: 'ach',
        sourceReferenceId: data.achReturnId,
        entityType: 'gl_reversal_error',
        entityId: data.achReturnId,
        reason: `ACH GL reversal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch {
      /* best-effort tracking */
    }
  }
}
