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

    // Validate request body BEFORE any gateway calls to prevent
    // external payment side effects on malformed requests
    body.employeeId = body.employeeId || ctx.user.id;

    const parsed = recordTenderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Use validated data from this point forward — never raw body for gateway calls
    let finalInput = parsed.data;

    // Card tenders with token/paymentMethodId go through the gateway
    const tenderType = parsed.data.tenderType;
    const token = (parsed.data as Record<string, unknown>).token as string | undefined;
    const paymentMethodId = (parsed.data as Record<string, unknown>).paymentMethodId as string | undefined;
    const customerId = (parsed.data as Record<string, unknown>).customerId as string | undefined;

    if (tenderType === 'card' && (token || paymentMethodId) && hasPaymentsGateway()) {
      const gateway = getPaymentsGatewayApi();
      const amountCents = parsed.data.amountGiven;
      const tipCents = parsed.data.tipAmount ?? 0;

      const gatewayResult = await gateway.sale(ctx, {
        amountCents: amountCents + tipCents,
        token,
        paymentMethodId,
        orderId,
        customerId,
        tipCents,
        ecomind: 'R',
        metadata: { source: 'retail_pos', terminalId: parsed.data.terminalId },
        clientRequestId: parsed.data.clientRequestId ?? `retail-tender-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Merge gateway metadata into validated input
      finalInput = {
        ...finalInput,
        metadata: {
          ...((finalInput.metadata as Record<string, unknown>) ?? {}),
          paymentIntentId: gatewayResult.id,
          providerRef: gatewayResult.providerRef ?? undefined,
          cardLast4: gatewayResult.cardLast4 ?? undefined,
          cardBrand: gatewayResult.cardBrand ?? undefined,
        },
      };
    }

    // If gateway was charged, wrap recordTender so we void the charge on failure
    const gatewayId = (finalInput.metadata as Record<string, unknown> | undefined)?.paymentIntentId as string | undefined;
    let result;
    try {
      result = await recordTender(ctx, orderId, finalInput);
    } catch (err) {
      if (gatewayId && hasPaymentsGateway()) {
        try { await getPaymentsGatewayApi().void(ctx, { paymentIntentId: gatewayId, clientRequestId: `void-${gatewayId}` }); } catch { /* best-effort void */ }
      }
      throw err;
    }
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
