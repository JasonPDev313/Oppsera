import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanVoid } from '@oppsera/core/auth/impersonation-safety';
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
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = voidOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Fetch order total (needed for impersonation check + gateway void)
    const orderRow = await withTenant(ctx.tenantId, async (tx) => {
      const [row] = await tx.select({ total: orders.total }).from(orders)
        .where(and(eq(orders.tenantId, ctx.tenantId), eq(orders.id, orderId)));
      return row;
    });

    // Impersonation safety: block voids over $500
    if (orderRow) {
      assertImpersonationCanVoid(ctx, orderRow.total);
    }

    // Void the order locally FIRST to ensure local state is always consistent.
    // If gateway voids were done first and voidOrder() failed, we'd have voided
    // card payments attached to a still-active order — hard to reconcile.
    const result = await voidOrder(ctx, orderId, parsed.data);

    // Best-effort: void card payments on the gateway AFTER local void succeeds.
    // Gateway void failures are logged but do not revert the local void
    // (gotcha #249: adapters never throw). Un-voided gateway payments on a
    // locally-voided order are easy to reconcile via manual refund.
    if (hasPaymentsGateway()) {
      try {
        if (orderRow) {
          const tenderList = await getTendersByOrder(ctx.tenantId, orderId, orderRow.total);

          for (const tender of tenderList.tenders) {
            const metadata = (tender as unknown as { metadata: Record<string, unknown> | null }).metadata;
            const paymentIntentId = metadata?.paymentIntentId as string | undefined;
            if (paymentIntentId) {
              try {
                const gateway = getPaymentsGatewayApi();
                await gateway.void(ctx, {
                  paymentIntentId,
                  clientRequestId: `void-order-${orderId}-${tender.id}-${Date.now()}`,
                });
              } catch {
                console.error(`Failed to void gateway payment ${paymentIntentId} for tender ${tender.id}`);
              }
            }
          }
        }
      } catch {
        console.error(`Failed to look up tenders for gateway void on order ${orderId}`);
      }
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.manage', writeAccess: true, replayGuard: true },
);
