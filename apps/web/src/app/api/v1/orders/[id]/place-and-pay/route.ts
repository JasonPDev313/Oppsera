import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError, ConflictError } from '@oppsera/shared';
import { placeOrder, placeOrderSchema, getOrder } from '@oppsera/module-orders';
import { recordTender, recordTenderSchema } from '@oppsera/module-payments';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';

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
 *
 * For card tenders: if token or paymentMethodId is included and gateway
 * is configured, processes through PaymentsGatewayApi.sale() before recording.
 * Cash/check/voucher tenders bypass the gateway entirely.
 */
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
        clientRequestId: body.clientRequestId ?? `retail-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Enrich tender metadata with gateway details
      body.metadata = {
        ...(body.metadata ?? {}),
        paymentIntentId: gatewayResult.id,
        providerRef: gatewayResult.providerRef,
        cardLast4: gatewayResult.cardLast4,
        cardBrand: gatewayResult.cardBrand,
      };

      // Remove card token fields before passing to recordTender
      delete body.token;
      delete body.paymentMethodId;
      delete body.customerId;
    }

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
