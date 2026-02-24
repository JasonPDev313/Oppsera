import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { ValidationError, AppError } from '@oppsera/shared';
import {
  listOpenPreauths,
  createPreauth,
  listOpenPreauthsSchema,
  createPreauthSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/preauth — list open pre-auths
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listOpenPreauthsSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') || undefined,
      status: url.searchParams.get('status') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listOpenPreauths(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);

// POST /api/v1/fnb/preauth — create pre-auth (with gateway authorization when configured)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPreauthSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;
    let providerRef: string | undefined = input.providerRef;

    // If gateway is configured and we have a card token, authorize through the gateway
    if (hasPaymentsGateway() && input.cardToken && !providerRef) {
      const gateway = getPaymentsGatewayApi();
      const gatewayResult = await gateway.authorize(ctx, {
        amountCents: input.authAmountCents,
        token: input.cardToken,
        ecomind: 'T',
        metadata: { source: 'fnb_preauth', tabId: input.tabId },
        clientRequestId: `preauth-${input.tabId}-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PREAUTH_DECLINED',
          gatewayResult.errorMessage ?? 'Card pre-authorization was declined',
          402,
        );
      }

      providerRef = gatewayResult.providerRef ?? undefined;

      // Enrich with gateway card details if not provided
      if (!input.cardLast4 && gatewayResult.cardLast4) {
        input.cardLast4 = gatewayResult.cardLast4;
      }
      if (!input.cardBrand && gatewayResult.cardBrand) {
        input.cardBrand = gatewayResult.cardBrand;
      }
    }

    const result = await createPreauth(ctx, ctx.locationId ?? '', {
      ...input,
      providerRef,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
