import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { broadcastFnb } from '@oppsera/core/realtime';
import { AppError, ValidationError } from '@oppsera/shared';
import { recordSplitTender, recordSplitTenderSchema } from '@oppsera/module-fnb';

/**
 * POST /api/v1/fnb/payments/tender — record a split tender
 *
 * For card tenders: if a token or paymentMethodId is included and gateway is configured,
 * processes through PaymentsGatewayApi.sale() before recording.
 * For cash/gift_card/house_account: records directly without gateway.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    // Validate input before any processing
    const parsed = recordSplitTenderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;

    // Card tenders with token/paymentMethodId go through the gateway
    if (input.tenderType === 'card' && (body.token || body.paymentMethodId) && hasPaymentsGateway()) {
      const gateway = getPaymentsGatewayApi();
      const tipCents = Number(body.tipCents ?? 0);

      const gatewayResult = await gateway.sale(ctx, {
        amountCents: input.amountCents + tipCents,
        token: body.token,
        paymentMethodId: body.paymentMethodId,
        orderId: body.orderId,
        customerId: body.customerId,
        tipCents,
        ecomind: 'T',
        metadata: { source: 'fnb_pos', sessionId: input.sessionId },
        clientRequestId: input.clientRequestId ?? `tender-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Use the payment intent ID as the tender ID for cross-reference
      input.tenderId = input.tenderId ?? gatewayResult.id;
    }

    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const result = await recordSplitTender(ctx, ctx.locationId, input);
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
