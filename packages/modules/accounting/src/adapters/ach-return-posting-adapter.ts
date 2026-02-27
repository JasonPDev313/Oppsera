import { db } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { EventEnvelope } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { voidJournalEntry } from '../commands/void-journal-entry';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface AchReturnPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  amountCents: number;
  returnCode: string;
  returnReason: string;
  returnDate: string;
  orderId: string | null;
  customerId: string | null;
  achReturnId: string;
  isRetryable: boolean;
  tenderId: string | null; // enriched by payments module for GL lookup
}

/**
 * ACH Return GL reversal adapter — consumes payment.gateway.ach_returned.v1 events.
 *
 * When a bank rejects an ACH payment (R01 insufficient funds, R02 account closed, etc.),
 * this adapter reverses the original tender's GL entry.
 *
 * Flow:
 *   1. Use tenderId from event to find original GL entry (sourceModule='pos', sourceReferenceId=tenderId)
 *   2. Void the GL entry (creates automatic reversal)
 *
 * If tenderId is not available (legacy events), falls back to searching by orderId memo.
 *
 * NEVER blocks ACH return processing — all failures are logged and swallowed.
 */
export async function handleAchReturnForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as AchReturnPayload;

  try {
    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'payment.gateway.ach_returned.v1',
          sourceModule: 'ach_return',
          sourceReferenceId: data.achReturnId,
          entityType: 'accounting_settings',
          entityId: tenantId,
          reason: 'CRITICAL: GL ACH return reversal skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block ACH returns */ }
      console.error(`[ach-return-gl] CRITICAL: accounting settings missing for tenant=${tenantId} after ensureAccountingSettings`);
      return;
    }

    // Build synthetic context for GL void operations
    const ctx: RequestContext = {
      tenantId,
      locationId: data.locationId,
      user: {
        id: 'system',
        email: 'system@oppsera.io',
        name: 'System',
        tenantId,
        tenantStatus: 'active',
        membershipStatus: 'active',
      },
      requestId: `ach-return-gl-${data.achReturnId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    // Strategy 1: Find GL entry by tenderId (preferred — direct sourceReferenceId lookup)
    if (data.tenderId) {
      const [entry] = await db
        .select({ id: glJournalEntries.id })
        .from(glJournalEntries)
        .where(
          and(
            eq(glJournalEntries.tenantId, tenantId),
            eq(glJournalEntries.sourceModule, 'pos'),
            eq(glJournalEntries.sourceReferenceId, data.tenderId),
            eq(glJournalEntries.status, 'posted'),
          ),
        )
        .limit(1);

      if (entry) {
        await voidJournalEntry(
          ctx,
          entry.id,
          `ACH Return ${data.returnCode}: ${data.returnReason}`,
        );
        return;
      }
    }

    // Strategy 2: Find GL entry by orderId memo (fallback for events without tenderId)
    if (data.orderId) {
      const postedEntries = await db
        .select({ id: glJournalEntries.id })
        .from(glJournalEntries)
        .where(
          and(
            eq(glJournalEntries.tenantId, tenantId),
            eq(glJournalEntries.sourceModule, 'pos'),
            eq(glJournalEntries.status, 'posted'),
            eq(glJournalEntries.memo, `POS Sale - Order ${data.orderId}`),
          ),
        );

      // Void all entries for this order (there may be split tenders, but ACH would
      // typically be a single tender per intent — void all associated entries)
      for (const entry of postedEntries) {
        try {
          await voidJournalEntry(
            ctx,
            entry.id,
            `ACH Return ${data.returnCode}: ${data.returnReason}`,
          );
        } catch (error) {
          console.error(`[ach-return-gl] Failed to void GL entry ${entry.id}:`, error);
        }
      }

      if (postedEntries.length > 0) return;
    }

    // No GL entry found — log as unmapped for manual resolution
    await logUnmappedEvent(db, tenantId, {
      eventType: 'payment.gateway.ach_returned.v1',
      sourceModule: 'ach_return',
      sourceReferenceId: data.achReturnId,
      entityType: 'missing_gl_entry',
      entityId: data.paymentIntentId,
      reason: `ACH Return ${data.returnCode} — no GL entry found to reverse (tenderId=${data.tenderId ?? 'none'}, orderId=${data.orderId ?? 'none'})`,
    });
  } catch (error) {
    // ACH return GL adapter must NEVER block payment processing — log and continue
    console.error(`[ach-return-gl] GL reversal failed for ACH return ${data.achReturnId}:`, error);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'payment.gateway.ach_returned.v1',
        sourceModule: 'ach_return',
        sourceReferenceId: data.achReturnId,
        entityType: 'gl_reversal_error',
        entityId: data.achReturnId,
        reason: `GL reversal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch {
      // double-swallow — never fail the ACH return
    }
  }
}
