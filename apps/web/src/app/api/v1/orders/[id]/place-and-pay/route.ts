import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { placeOrderSchema } from '@oppsera/module-orders';
import { recordTenderSchema, listPaymentMethods } from '@oppsera/module-payments';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { placeAndRecordTender } from './place-and-pay-fast';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/orders/{id}/place-and-pay → id is at index -2
  return parts[parts.length - 2]!;
}

/**
 * POST /api/v1/orders/:id/place-and-pay
 *
 * Combined endpoint: places the order (if still open) and records a tender
 * in a SINGLE DB TRANSACTION. This eliminates ~8 redundant DB round-trips
 * vs the old 2-transaction approach.
 *
 * Card payment modes:
 *   1. Card-present (physical terminal): `paymentIntentId` + `entryMode: 'terminal'`
 *      — payment already captured by terminal, just records tender.
 *   2. Card-on-file (stored payment method): `paymentMethodId` — resolves stored
 *      token from customer_payment_methods and charges via gateway.
 *   3. Token (CNP): `token` — charges via gateway directly.
 *
 * Cash/check/voucher tenders bypass the gateway entirely.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const tenderType = body.tenderType as string | undefined;

    // Card-on-file: resolve paymentMethodId → stored token before gateway call
    if (tenderType === 'card' && body.paymentMethodId && !body.token && !body.paymentIntentId) {
      const methods = await listPaymentMethods(ctx.tenantId, body.customerId);
      const method = methods.find((m) => m.id === body.paymentMethodId);
      if (!method) {
        throw new AppError('PAYMENT_METHOD_NOT_FOUND', 'Stored payment method not found', 404);
      }
      // Use the stored CardSecure token for the gateway charge
      body.token = method.providerProfileId
        ? `${method.providerProfileId}/${method.providerAccountId ?? ''}`
        : undefined;
      // Enrich metadata with card-on-file details for receipt/audit
      body.metadata = {
        ...(body.metadata ?? {}),
        entryMode: 'card_on_file',
        storedCardBrand: method.brand,
        storedCardLast4: method.last4,
        paymentMethodId: body.paymentMethodId,
      };
    }

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
        metadata: { source: 'retail_pos', terminalId: body.terminalId, entryMode: body.metadata?.entryMode ?? 'keyed' },
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

    // Parse tender data
    const tenderParsed = recordTenderSchema.safeParse(body);
    if (!tenderParsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: tenderParsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }

    const placeBody = { clientRequestId: body.placeClientRequestId ?? crypto.randomUUID() };
    const placeParsed = placeOrderSchema.safeParse(placeBody);

    // Single-transaction fast path: place + tender atomically
    const tenderResult = await placeAndRecordTender(
      ctx,
      orderId,
      placeParsed.success ? placeParsed.data : { clientRequestId: crypto.randomUUID() },
      tenderParsed.data,
    );

    return NextResponse.json({ data: tenderResult }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.create' , writeAccess: true },
);
