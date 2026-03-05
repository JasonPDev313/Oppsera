import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { AppError } from '@oppsera/shared';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getTabDetail, getCheckSummary } from '@oppsera/module-fnb';
import { openOrder, addLineItemsBatch, placeOrder } from '@oppsera/module-orders';

function extractTabId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  // URL: /api/v1/fnb/tabs/:id/prepare-check → id is at index -2
  return parts[parts.length - 2]!;
}

// POST /api/v1/fnb/tabs/:id/prepare-check
// Creates an order from tab items if primaryOrderId is null,
// then returns the check summary for the payment screen.
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const tabId = extractTabId(request);

    // 1. Fetch full tab detail (includes lines)
    const tab = await getTabDetail({ tenantId: ctx.tenantId, tabId });
    if (!tab) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tab not found' } },
        { status: 404 },
      );
    }

    // 2. If order already exists, just return the check
    if (tab.primaryOrderId) {
      const check = await getCheckSummary({ tenantId: ctx.tenantId, orderId: tab.primaryOrderId });
      return NextResponse.json({ data: { orderId: tab.primaryOrderId, check } });
    }

    // 3. Validate tab has items
    const activeLines = tab.lines.filter((l) => l.status !== 'voided');
    if (activeLines.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Tab has no items to charge' } },
        { status: 400 },
      );
    }

    // 4. Lock tab row to prevent concurrent double-prepare (F4 fix)
    const orderId = await withTenant(ctx.tenantId, async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT id, primary_order_id FROM fnb_tabs
            WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}
            FOR UPDATE`,
      );
      const lockedTab = Array.from(lockedRows as Iterable<Record<string, unknown>>)[0];
      if (!lockedTab) {
        throw new Error('TAB_NOT_FOUND');
      }
      // Re-check after acquiring lock — another request may have already prepared the check
      if (lockedTab.primary_order_id) {
        return String(lockedTab.primary_order_id);
      }

      // 5. Create order from tab items
      const clientBase = `fnb-prepare-${tabId}`;
      const order = await openOrder(ctx, {
        clientRequestId: `${clientBase}-open`,
        source: 'pos',
        businessDate: tab.businessDate,
        notes: `F&B Tab #${tab.tabNumber}`,
        customerId: tab.customerId ?? undefined,
        metadata: { fnbTabId: tabId, fnbTabNumber: tab.tabNumber },
      });

      // 6. Add all tab items as order lines (batch)
      const batchItems = activeLines.map((line) => {
        const modifiers = Array.isArray(line.modifiers)
          ? (line.modifiers as Array<Record<string, unknown>>).map((m) => {
              const modifierId = String(m.modifierId ?? m.modifier_id ?? '');
              if (!modifierId) {
                console.warn(`[prepare-check] Tab ${tabId}: modifier missing ID on line ${line.id}`);
              }
              return {
                modifierId,
                name: String(m.name ?? ''),
                priceAdjustment: Number(m.priceAdjustment ?? m.price_adjustment ?? 0),
              };
            })
          : [];

        return {
          clientRequestId: `${clientBase}-line-${line.id}`,
          catalogItemId: line.catalogItemId,
          qty: line.qty,
          modifiers: modifiers.length > 0 ? modifiers : undefined,
          specialInstructions: line.specialInstructions ?? undefined,
        };
      });

      await addLineItemsBatch(ctx, order.id, batchItems);

      // 7. Place the order (finalizes totals, creates receipt snapshot)
      await placeOrder(ctx, order.id, { clientRequestId: `${clientBase}-place` });

      // 8. Link order to tab atomically (same withTenant connection holds the FOR UPDATE lock)
      await tx.execute(
        sql`UPDATE fnb_tabs
            SET primary_order_id = ${order.id}, updated_at = NOW()
            WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}`,
      );

      // 9. Backfill orderId on kitchen tickets created at send time (before order existed)
      await tx.execute(
        sql`UPDATE fnb_kitchen_tickets
            SET order_id = ${order.id}, updated_at = NOW()
            WHERE tab_id = ${tabId} AND tenant_id = ${ctx.tenantId} AND order_id IS NULL`,
      );

      return order.id;
    });

    // 10. Return check summary
    const check = await getCheckSummary({ tenantId: ctx.tenantId, orderId });
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: { orderId, check } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
