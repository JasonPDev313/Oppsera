import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { addLineItemsBatch, addLineItemsBatchSchema } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/orders/:id/lines/batch → id is 3 segments before end
  return parts[parts.length - 3]!;
}

// POST /api/v1/orders/:id/lines/batch — add multiple line items in one transaction
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = addLineItemsBatchSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const itemIds = parsed.data.items.map((i) => i.catalogItemId);
    console.log(`[POST /orders/${orderId}/lines/batch] Adding ${parsed.data.items.length} items: [${itemIds.join(', ')}]`);

    try {
      const result = await addLineItemsBatch(ctx, orderId, parsed.data.items);
      return NextResponse.json({ data: result }, { status: 201 });
    } catch (err) {
      console.error(`[POST /orders/${orderId}/lines/batch] Failed:`, {
        itemIds,
        tenant: ctx.tenantId,
        location: ctx.locationId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
  { entitlement: 'orders', permission: 'orders.manage', writeAccess: true },
);
