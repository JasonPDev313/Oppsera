import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { AppError } from '@oppsera/shared';
import { recordSplitTender } from '@oppsera/module-fnb';

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
    const tenderType = body.tenderType as string | undefined;

    // Card tenders with token/paymentMethodId go through the gateway
    if (tenderType === 'card' && (body.token || body.paymentMethodId) && hasPaymentsGateway()) {
      const gateway = getPaymentsGatewayApi();
      const amountCents = Number(body.amountCents ?? 0);
      const tipCents = Number(body.tipCents ?? 0);

      const gatewayResult = await gateway.sale(ctx, {
        amountCents: amountCents + tipCents,
        token: body.token,
        paymentMethodId: body.paymentMethodId,
        orderId: body.orderId,
        customerId: body.customerId,
        tipCents,
        ecomind: 'T',
        metadata: { source: 'fnb_pos', sessionId: body.sessionId },
        clientRequestId: body.clientRequestId ?? `tender-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Use the payment intent ID as the tender ID for cross-reference
      body.tenderId = body.tenderId ?? gatewayResult.id;
    }

    const result = await recordSplitTender(ctx, ctx.locationId ?? '', body);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
