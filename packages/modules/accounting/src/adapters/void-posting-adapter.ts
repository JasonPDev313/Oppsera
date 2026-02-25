import { db } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';
import { eq, and, like } from 'drizzle-orm';
import type { EventEnvelope } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
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

  // Check if accounting is enabled for this tenant
  const settings = await getAccountingSettings(db, tenantId);
  if (!settings) return; // no accounting — skip silently

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
    // Find all posted GL entries for this order.
    // POS adapter creates entries with sourceModule='pos' and memo containing the orderId.
    // Use LIKE for resilience against minor memo format changes.
    // Only status='posted' entries are candidates — already voided entries are skipped.
    const postedEntries = await db
      .select({ id: glJournalEntries.id })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.tenantId, tenantId),
          eq(glJournalEntries.sourceModule, 'pos'),
          eq(glJournalEntries.status, 'posted'),
          like(glJournalEntries.memo, `%Order ${data.orderId}%`),
        ),
      );

    if (postedEntries.length === 0) {
      // Log when an order with a non-zero total has no GL entries — indicates
      // the POS adapter failed or was disabled when the tender was recorded.
      if (data.total > 0) {
        console.warn(`No GL entries found to void for order ${data.orderId} (total=${data.total})`);
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
        await logUnmappedEvent(db, tenantId, {
          eventType: 'order.voided.v1',
          sourceModule: 'pos',
          sourceReferenceId: data.orderId,
          entityType: 'void_gl_error',
          entityId: entry.id,
          reason: `GL void failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
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
