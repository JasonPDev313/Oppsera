import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
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

    // 4. Create order from tab items
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
        ? (line.modifiers as Array<Record<string, unknown>>).map((m) => ({
            modifierId: String(m.modifierId ?? m.modifier_id ?? ''),
            name: String(m.name ?? ''),
            priceAdjustment: Number(m.priceAdjustment ?? m.price_adjustment ?? 0),
          }))
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

    // 7. Link order to tab
    await db.execute(
      sql`UPDATE fnb_tabs
          SET primary_order_id = ${order.id}, updated_at = NOW()
          WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    // 8. Return check summary
    const check = await getCheckSummary({ tenantId: ctx.tenantId, orderId: order.id });

    return NextResponse.json({ data: { orderId: order.id, check } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
