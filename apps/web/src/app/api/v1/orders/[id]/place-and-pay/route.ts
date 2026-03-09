import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { placeOrderSchema } from '@oppsera/module-orders';
import { recordTenderSchema, listPaymentMethods } from '@oppsera/module-payments';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { validateHouseAccountCharge } from '@oppsera/module-fnb/helpers/house-account-validation';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
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
 *
 * House account tenders:
 *   Requires `billingAccountId` + `customerId` (+ optional `signatureData`).
 *   CMAA validation gates are re-checked at charge time. Creates an AR
 *   transaction against the billing account inside the same DB transaction.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const tenderType = body.tenderType as string | undefined;

    // Validate tender schema BEFORE any gateway/external calls.
    // This ensures invalid input never triggers a real payment charge.
    body.employeeId = body.employeeId || ctx.user.id;
    const tenderParsed = recordTenderSchema.safeParse(body);
    if (!tenderParsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: tenderParsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }

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

    // Card tenders with token/paymentMethodId go through the gateway.
    // Use validated (parsed) values — never raw body — for gateway calls.
    if (tenderType === 'card' && (body.token || body.paymentMethodId) && hasPaymentsGateway()) {
      const gateway = getPaymentsGatewayApi();
      const amountCents = tenderParsed.data.amountGiven;
      const tipCents = tenderParsed.data.tipAmount ?? 0;

      const gatewayResult = await gateway.sale(ctx, {
        amountCents: amountCents + tipCents,
        token: body.token,
        paymentMethodId: body.paymentMethodId,
        orderId,
        customerId: body.customerId,
        tipCents,
        ecomind: 'R',
        metadata: { source: 'retail_pos', terminalId: tenderParsed.data.terminalId, entryMode: body.metadata?.entryMode ?? 'keyed' },
        clientRequestId: tenderParsed.data.clientRequestId ?? `retail-${orderId}-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Enrich validated tender metadata with gateway details
      tenderParsed.data.metadata = {
        ...(tenderParsed.data.metadata ?? {}),
        ...(body.metadata ?? {}),
        paymentIntentId: gatewayResult.id,
        providerRef: gatewayResult.providerRef,
        cardLast4: gatewayResult.cardLast4,
        cardBrand: gatewayResult.cardBrand,
      };
    }

    // ── House account: CMAA re-validation at charge time ──
    if (tenderType === 'house_account') {
      if (!body.billingAccountId || !body.customerId) {
        throw new AppError(
          'MISSING_HOUSE_ACCOUNT_DATA',
          'billingAccountId and customerId are required for house account tenders',
          400,
        );
      }

      // Re-validate all CMAA gates (account status, collections, credit, limits, hours, tip cap)
      await validateHouseAccountCharge(ctx, {
        billingAccountId: body.billingAccountId,
        customerId: body.customerId,
        amountCents: tenderParsed.data.amountGiven,
        tipCents: tenderParsed.data.tipAmount ?? 0,
      });

      // Store house account metadata on the tender for audit trail
      tenderParsed.data.metadata = {
        ...(tenderParsed.data.metadata ?? {}),
        billingAccountId: body.billingAccountId,
        customerId: body.customerId,
        hasSignature: !!body.signatureData,
      };

      auditLogDeferred(ctx, 'house_account.charge_validated', 'billing_account', body.billingAccountId, undefined, {
        amountCents: tenderParsed.data.amountGiven,
        tipCents: tenderParsed.data.tipAmount ?? 0,
        customerId: body.customerId,
        orderId,
        source: 'retail_pos',
        hasSignature: !!body.signatureData,
      });
    }

    const placeBody = { clientRequestId: body.placeClientRequestId ?? crypto.randomUUID() };
    const placeParsed = placeOrderSchema.safeParse(placeBody);
    if (!placeParsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Place validation failed', details: placeParsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }

    // Single-transaction fast path: place + tender atomically
    const { data, runDeferredWork } = await placeAndRecordTender(
      ctx,
      orderId,
      placeParsed.data,
      tenderParsed.data,
      { payExact: body.payExact === true },
    );

    // GL + audit logs run AFTER the response is sent — Vercel keeps the
    // function alive until after() callbacks complete (Next.js 15 stable API).
    after(runDeferredWork);

    return NextResponse.json({ data }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.create' , writeAccess: true },
);
