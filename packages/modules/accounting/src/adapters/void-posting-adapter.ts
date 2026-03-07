import { db } from '@oppsera/db';
import { glJournalEntries, tenders } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import type { EventEnvelope } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { voidJournalEntry } from '../commands/void-journal-entry';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface OrderVoidedPayload {
  orderId: string;
  orderNumber?: number;
  reason: string;
  voidedBy?: string;
  locationId: string;
  businessDate: string;
  total: number;
  customerId?: string | null;
}

/**
 * GL void adapter — consumes order.voided.v1 events.
 *
 * Finds all GL journal entries posted by the POS adapter for this order
 * and creates reversal entries via voidJournalEntry().
 *
 * Handles multi-tender orders: each tender's GL entry is reversed separately.
 * Idempotent: already-voided entries are skipped (query filters status='posted').
 * NEVER blocks voids — all failures are logged and swallowed.
 */
export async function handleOrderVoidForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as OrderVoidedPayload;

  // Ensure accounting settings exist (same guarantee as POS adapter).
  // This creates settings + fallback accounts if missing, so void reversals
  // always have context even when accounting wasn't formally bootstrapped.
  try {
    await ensureAccountingSettings(db, tenantId);
  } catch {
    // Non-fatal — settings may already exist, or auto-creation may have
    // hit a race. Proceed to check settings below.
  }

  // Check if accounting is enabled for this tenant
  const settings = await getAccountingSettings(db, tenantId);
  if (!settings) {
    // After ensureAccountingSettings, this should never happen.
    // Log CRITICAL unmapped event so admin can investigate.
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'order.voided.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.orderId,
        entityType: 'accounting_settings',
        entityId: tenantId,
        reason: 'CRITICAL: GL void skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
      });
    } catch {
      // never block void
    }
    console.error(`[void-gl] CRITICAL: accounting settings missing for tenant=${tenantId} after ensureAccountingSettings`);
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
    requestId: `pos-void-gl-${data.orderId}`,
    isPlatformAdmin: false,
  } as RequestContext;

  try {
    // Find all posted GL entries for this order by structural relation:
    // 1. Query tenders table for all tender IDs belonging to this order
    // 2. Find GL entries where source_reference_id matches those tender IDs
    // This is a reliable FK-style lookup, not dependent on memo format.
    const orderTenders = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, tenantId),
          eq(tenders.orderId, data.orderId),
        ),
      );

    const tenderIds = orderTenders.map((t) => t.id);

    let postedEntries: Array<{ id: string }> = [];

    if (tenderIds.length > 0) {
      // Find GL entries posted by POS adapter for these tenders
      postedEntries = await db
        .select({ id: glJournalEntries.id })
        .from(glJournalEntries)
        .where(
          and(
            eq(glJournalEntries.tenantId, tenantId),
            eq(glJournalEntries.sourceModule, 'pos'),
            eq(glJournalEntries.status, 'posted'),
            inArray(glJournalEntries.sourceReferenceId, tenderIds),
          ),
        );
    }

    if (postedEntries.length === 0) {
      // No GL entries found — log unmapped event for admin visibility
      if (data.total > 0) {
        console.warn(`No GL entries found to void for order ${data.orderId} (total=${data.total}, tenders=${tenderIds.length})`);
        try {
          await logUnmappedEvent(db, tenantId, {
            eventType: 'order.voided.v1',
            sourceModule: 'pos',
            sourceReferenceId: data.orderId,
            entityType: 'void_gl_missing',
            entityId: data.orderId,
            reason: `No posted GL entries found to void for order (total=${data.total}, tenders=${tenderIds.length}). POS adapter may have failed or been disabled.`,
          });
        } catch {
          // never block void
        }
      }
      return;
    }

    // Void each GL entry (one per tender for split-tender orders)
    for (const entry of postedEntries) {
      try {
        await voidJournalEntry(
          ctx,
          entry.id,
          `Order voided: ${data.reason || 'No reason provided'}`,
        );
      } catch (error) {
        // Log individual void failures but continue processing others
        console.error(`Failed to void GL entry ${entry.id} for order ${data.orderId}:`, error);
        try {
          await logUnmappedEvent(db, tenantId, {
            eventType: 'order.voided.v1',
            sourceModule: 'pos',
            sourceReferenceId: data.orderId,
            entityType: 'void_gl_error',
            entityId: entry.id,
            reason: `GL void failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        } catch {
          // never block remaining voids
        }
      }
    }
  } catch (error) {
    // Never block voids — log and continue
    console.error(`GL void processing failed for order ${data.orderId}:`, error);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'order.voided.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.orderId,
        entityType: 'void_processing_error',
        entityId: data.orderId,
        reason: `GL void processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch {
      // double-swallow — never fail the void
    }
  }
}
