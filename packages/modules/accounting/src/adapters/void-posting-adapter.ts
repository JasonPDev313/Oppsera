import { db } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
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
    // Find all posted GL entries for this order.
    // POS adapter creates entries with sourceModule='pos' and memo exactly
    // matching 'POS Sale - Order {orderId}'. Use exact memo match (deterministic)
    // instead of LIKE pattern which is fragile against memo format changes.
    // Only status='posted' entries are candidates — already voided entries are skipped.
    const exactMemo = `POS Sale - Order ${data.orderId}`;
    const postedEntries = await db
      .select({ id: glJournalEntries.id })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.tenantId, tenantId),
          eq(glJournalEntries.sourceModule, 'pos'),
          eq(glJournalEntries.status, 'posted'),
          eq(glJournalEntries.memo, exactMemo),
        ),
      );

    if (postedEntries.length === 0) {
      // Fallback: try LIKE pattern for backward compatibility with GL entries
      // posted before the memo format was standardized.
      const fallbackEntries = await db
        .select({ id: glJournalEntries.id })
        .from(glJournalEntries)
        .where(
          and(
            eq(glJournalEntries.tenantId, tenantId),
            eq(glJournalEntries.sourceModule, 'pos'),
            eq(glJournalEntries.status, 'posted'),
            sql`${glJournalEntries.memo} LIKE ${'%Order ' + data.orderId + '%'}`,
          ),
        );

      if (fallbackEntries.length > 0) {
        // Process fallback entries
        for (const entry of fallbackEntries) {
          try {
            await voidJournalEntry(
              ctx,
              entry.id,
              `Order voided: ${data.reason || 'No reason provided'}`,
            );
          } catch (error) {
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
        return;
      }

      // No entries found by either method — log unmapped event for admin visibility
      if (data.total > 0) {
        console.warn(`No GL entries found to void for order ${data.orderId} (total=${data.total})`);
        await logUnmappedEvent(db, tenantId, {
          eventType: 'order.voided.v1',
          sourceModule: 'pos',
          sourceReferenceId: data.orderId,
          entityType: 'void_gl_missing',
          entityId: data.orderId,
          reason: `No posted GL entries found to void for order (total=${data.total}). POS adapter may have failed or been disabled.`,
        });
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
