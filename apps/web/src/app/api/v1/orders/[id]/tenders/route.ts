import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError, ValidationError, NotFoundError } from '@oppsera/shared';
import { orders, withTenant } from '@oppsera/db';
import { recordTender, recordTenderSchema, getTendersByOrder } from '@oppsera/module-payments';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/orders/{id}/tenders → id is at parts[parts.length - 2]
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/tenders — record a tender payment (with gateway for card)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const tenderType = body.tenderType as string | undefined;

    // Card tenders with token/paymentMethodId go through the gateway
    if (tenderType === 'card' && (body.token || body.paymentMethodId) && hasPaymentsGateway()) {
      const gateway = getPaymentsGatewayApi();
      const amountCents = Number(body.amountGiven ?? 0);
      const tipCents = Number(body.tipAmount ?? 0);

      const gatewayResult = await gateway.sale(ctx, {
        amountCents: amountCents + tipCents,
        token: body.token,
        paymentMethodId: body.paymentMethodId,
        orderId,
        customerId: body.customerId,
        tipCents,
        ecomind: 'R',
        metadata: { source: 'retail_pos', terminalId: body.terminalId },
        clientRequestId: body.clientRequestId ?? `retail-tender-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      body.metadata = {
        ...(body.metadata ?? {}),
        paymentIntentId: gatewayResult.id,
        providerRef: gatewayResult.providerRef,
        cardLast4: gatewayResult.cardLast4,
        cardBrand: gatewayResult.cardBrand,
      };

      delete body.token;
      delete body.paymentMethodId;
      delete body.customerId;
    }

    const parsed = recordTenderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await recordTender(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.create' , writeAccess: true },
);

// GET /api/v1/orders/:id/tenders — get tenders for an order
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const order = await withTenant(ctx.tenantId, async (tx) => {
      const [row] = await tx.select({ total: orders.total }).from(orders)
        .where(and(eq(orders.tenantId, ctx.tenantId), eq(orders.id, orderId)));
      return row;
    });
    if (!order) {
      throw new NotFoundError('Order');
    }
    const result = await getTendersByOrder(ctx.tenantId, orderId, order.total);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.view' },
);
