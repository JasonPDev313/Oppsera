/**
 * Phase 7A: Auto-clear register tabs after payment or void.
 *
 * - tender.recorded.v1  → if isFullyPaid, clear tab's orderId + label + folioId + guestName
 * - order.voided.v1     → clear tab's orderId + label + folioId + guestName
 *
 * Both update version + updatedAt so the SSE poll picks up the change.
 */

import { withTenant } from '@oppsera/db';
import { registerTabs } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';

// ── Shared ───────────────────────────────────────────────────────────

async function clearTabForOrder(tenantId: string, orderId: string): Promise<void> {
  try {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(registerTabs)
        .set({
          orderId: null,
          label: null,
          folioId: null,
          guestName: null,
          version: sql`${registerTabs.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(registerTabs.orderId, orderId),
            eq(registerTabs.status, 'active'),
          ),
        );
    });
  } catch (err) {
    // Never throw in event consumers — log and move on
    console.error('[tab-auto-clear] Failed to clear tab for order:', orderId, err);
  }
}

// ── Consumer: tender.recorded.v1 ─────────────────────────────────────

export async function handleTabAutoClearOnTender(
  event: { tenantId: string; data: Record<string, unknown> },
): Promise<void> {
  const data = event.data;
  const isFullyPaid = data.isFullyPaid as boolean;
  if (!isFullyPaid) return; // Not fully paid yet — nothing to clear

  const orderId = data.orderId as string;
  const tenantId = event.tenantId;
  if (!orderId || !tenantId) return;

  await clearTabForOrder(tenantId, orderId);
}

// ── Consumer: order.voided.v1 ────────────────────────────────────────

export async function handleTabAutoClearOnVoid(
  event: { tenantId: string; aggregateId?: string; data: Record<string, unknown> },
): Promise<void> {
  const orderId = (event.data.orderId as string) ?? event.aggregateId;
  const tenantId = event.tenantId;
  if (!orderId || !tenantId) return;

  await clearTabForOrder(tenantId, orderId);
}
