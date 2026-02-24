import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { voidOrder, voidOrderSchema } from '@oppsera/module-orders';
import { getTendersByOrder } from '@oppsera/module-payments';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { withTenant, orders } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/void — void order (with gateway void for card tenders)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = voidOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Best-effort: void card payments on the gateway before voiding the order locally.
    // Gateway void failures do NOT block the local void (gotcha #249: adapters never throw).
    if (hasPaymentsGateway()) {
      try {
        // Fetch order total for tender lookup
        const order = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx.select({ total: orders.total }).from(orders)
            .where(and(eq(orders.tenantId, ctx.tenantId), eq(orders.id, orderId)));
          return row;
        });

        if (order) {
          const tenders = await getTendersByOrder(ctx.tenantId, orderId, order.total);

          // Find card tenders that have a linked payment intent
          for (const tender of tenders.tenders) {
            const metadata = (tender as any).metadata as Record<string, unknown> | null;
            const paymentIntentId = metadata?.paymentIntentId as string | undefined;
            if (paymentIntentId) {
              try {
                const gateway = getPaymentsGatewayApi();
                await gateway.void(ctx, {
                  paymentIntentId,
                  clientRequestId: `void-order-${orderId}-${tender.id}-${Date.now()}`,
                });
              } catch {
                // Best-effort: gateway void failure should not block local void
                console.error(`Failed to void gateway payment ${paymentIntentId} for tender ${tender.id}`);
              }
            }
          }
        }
      } catch {
        // Best-effort: if we can't look up tenders, still proceed with local void
        console.error(`Failed to look up tenders for gateway void on order ${orderId}`);
      }
    }

    const result = await voidOrder(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage' , writeAccess: true },
);
