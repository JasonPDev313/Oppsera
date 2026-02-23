import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ConflictError } from '@oppsera/shared';
import { placeOrder, placeOrderSchema, getOrder } from '@oppsera/module-orders';
import { recordTender, recordTenderSchema } from '@oppsera/module-payments';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/orders/{id}/place-and-pay → id is at index -2
  return parts[parts.length - 2]!;
}

/**
 * POST /api/v1/orders/:id/place-and-pay
 *
 * Combined endpoint: places the order (if still open) and records a tender
 * in a single HTTP round-trip. Eliminates the 2-call race condition that
 * caused "Payment conflict" and "Order is placed, expected open" errors.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();

    // Parse tender data (the main payload)
    const tenderParsed = recordTenderSchema.safeParse(body);
    if (!tenderParsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: tenderParsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }

    // Step 1: Place the order (if not already placed)
    let orderVersion: number;
    const placeBody = { clientRequestId: body.placeClientRequestId ?? crypto.randomUUID() };
    const placeParsed = placeOrderSchema.safeParse(placeBody);

    try {
      const placed = await placeOrder(ctx, orderId, placeParsed.success ? placeParsed.data : { clientRequestId: crypto.randomUUID() });
      orderVersion = (placed as any).version ?? 0;
    } catch (err) {
      if (err instanceof ConflictError && err.message.includes('Order is placed')) {
        // Already placed — fetch the current version
        const existing = await getOrder(ctx.tenantId, orderId);
        if (!existing || existing.status !== 'placed') {
          throw err;
        }
        orderVersion = existing.version;
      } else {
        throw err;
      }
    }

    // Step 2: Record tender with the correct version from step 1
    const tenderResult = await recordTender(ctx, orderId, {
      ...tenderParsed.data,
      version: orderVersion,
    });

    return NextResponse.json({ data: tenderResult }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.create' , writeAccess: true },
);
