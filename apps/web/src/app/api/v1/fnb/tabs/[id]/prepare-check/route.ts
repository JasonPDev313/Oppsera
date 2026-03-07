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
//
// Connection safety: commands (openOrder, addLineItemsBatch, placeOrder) each
// acquire their own connection via publishWithOutbox. Running them inside an
// outer withTenant (which also holds a connection) would need 2 simultaneous
// connections against a pool of 2 — guaranteed starvation under any concurrency.
// Instead we: (1) check fast, (2) run commands outside any wrapping tx, (3) link
// the order with an atomic UPDATE ... WHERE primary_order_id IS NULL. Idempotency
// keys on each command handle concurrent double-prepare safely.
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

    // 4. Create order from tab items (each command manages its own transaction).
    //    Deterministic clientRequestIds make every step idempotent — safe to retry
    //    or race with a concurrent prepare-check for the same tab.
    const clientBase = `fnb-prepare-${tabId}`;
    const order = await openOrder(ctx, {
      clientRequestId: `${clientBase}-open`,
      source: 'pos',
      businessDate: tab.businessDate,
      notes: `F&B Tab #${tab.tabNumber}`,
      customerId: tab.customerId ?? undefined,
      metadata: { fnbTabId: tabId, fnbTabNumber: tab.tabNumber },
    });

    // 5. Add all tab items as order lines (batch)
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

    // 6. Place the order (finalizes totals, creates receipt snapshot)
    await placeOrder(ctx, order.id, { clientRequestId: `${clientBase}-place` });

    // 7. Link order to tab + backfill kitchen tickets in one short transaction.
    //    WHERE primary_order_id IS NULL acts as compare-and-swap — if a concurrent
    //    request already linked an order, this is a no-op (idempotency keys above
    //    ensure we reused the same order anyway).
    const linkedOrderId = await withTenant(ctx.tenantId, async (tx) => {
      const linkResult = await tx.execute(
        sql`UPDATE fnb_tabs
            SET primary_order_id = ${order.id}, updated_at = NOW()
            WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}
              AND primary_order_id IS NULL
            RETURNING primary_order_id`,
      );
      const linked = Array.from(linkResult as Iterable<Record<string, unknown>>);

      if (linked.length > 0) {
        // We won the race — backfill kitchen tickets
        await tx.execute(
          sql`UPDATE fnb_kitchen_tickets
              SET order_id = ${order.id}, updated_at = NOW()
              WHERE tab_id = ${tabId} AND tenant_id = ${ctx.tenantId} AND order_id IS NULL`,
        );
        return order.id;
      }

      // Another request already linked — read whichever order was set
      const existing = await tx.execute(
        sql`SELECT primary_order_id FROM fnb_tabs
            WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}`,
      );
      const row = Array.from(existing as Iterable<Record<string, unknown>>)[0];
      return String(row?.primary_order_id ?? order.id);
    });

    // 8. Return check summary
    const check = await getCheckSummary({ tenantId: ctx.tenantId, orderId: linkedOrderId });
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: { orderId: linkedOrderId, check } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
