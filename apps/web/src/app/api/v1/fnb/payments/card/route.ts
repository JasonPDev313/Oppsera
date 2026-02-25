import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { AppError, ValidationError } from '@oppsera/shared';
import { recordSplitTender } from '@oppsera/module-fnb';
import { z } from 'zod';

const processCardPaymentSchema = z.object({
  sessionId: z.string().min(1),
  amountCents: z.number().int().min(1),
  tipCents: z.number().int().min(0).default(0),
  token: z.string().min(1).optional(),
  paymentMethodId: z.string().min(1).optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  clientRequestId: z.string().min(1),
}).refine(
  (data) => data.token || data.paymentMethodId,
  { message: 'Either token or paymentMethodId is required', path: ['token'] },
);

/**
 * POST /api/v1/fnb/payments/card — process a card payment through the gateway
 *
 * Flow:
 * 1. Validate input
 * 2. Call PaymentsGatewayApi.sale() to process the card
 * 3. If approved, call recordSplitTender() to record the tender in the F&B session
 * 4. Return combined result with gateway + session status
 *
 * Cash payments bypass this entirely — they go directly to /api/v1/fnb/payments/tender.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = processCardPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;

    if (!hasPaymentsGateway()) {
      throw new AppError(
        'GATEWAY_NOT_CONFIGURED',
        'Payment gateway is not configured. Set up a merchant account in Merchant Services settings.',
        503,
      );
    }

    const gateway = getPaymentsGatewayApi();

    // 1. Process card through the gateway
    const gatewayResult = await gateway.sale(ctx, {
      amountCents: input.amountCents + input.tipCents,
      token: input.token,
      paymentMethodId: input.paymentMethodId,
      orderId: input.orderId,
      customerId: input.customerId,
      tipCents: input.tipCents,
      ecomind: 'T',
      metadata: { source: 'fnb_pos', sessionId: input.sessionId },
      clientRequestId: input.clientRequestId,
    });

    // 2. If declined or error, return the failure
    if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
      throw new AppError(
        'PAYMENT_DECLINED',
        gatewayResult.errorMessage ?? 'Card payment was declined',
        402,
      );
    }

    // 3. Record the tender in the F&B payment session
    const tenderResult = await recordSplitTender(ctx, ctx.locationId ?? '', {
      sessionId: input.sessionId,
      tenderId: gatewayResult.id,
      amountCents: input.amountCents + input.tipCents,
      tenderType: 'card',
      clientRequestId: `tender-${input.clientRequestId}`,
    });

    return NextResponse.json({
      data: {
        ...tenderResult,
        gateway: {
          paymentIntentId: gatewayResult.id,
          status: gatewayResult.status,
          providerRef: gatewayResult.providerRef,
          cardLast4: gatewayResult.cardLast4,
          cardBrand: gatewayResult.cardBrand,
          amountCents: gatewayResult.amountCents,
        },
      },
    }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
