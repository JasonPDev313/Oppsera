import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import {
  resolveTerminalContext,
  getTerminalSession,
  CardPointeTerminalClient,
  terminalTipSchema,
} from '@oppsera/module-payments';
import { centsToDollars, dollarsToCents } from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/tip
 * Prompt for tip on the physical terminal screen.
 * Body: { terminalId, amountCents, tipOptions? }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!isEnabled('PAYMENTS_TERMINAL_ENABLED')) {
      throw new AppError('FEATURE_DISABLED', 'Card-present payments are not enabled', 403);
    }

    const body = await request.json();
    const input = terminalTipSchema.parse(body);

    if (!ctx.locationId) {
      throw new AppError('VALIDATION_ERROR', 'Location context is required for terminal operations', 400);
    }
    const termCtx = await resolveTerminalContext(ctx.tenantId, ctx.locationId, input.terminalId);

    const session = await getTerminalSession({
      tenantId: ctx.tenantId,
      hsn: termCtx.device.hsn,
      merchantId: termCtx.merchantId,
      credentials: termCtx.credentials,
    });

    const client = new CardPointeTerminalClient({
      site: termCtx.credentials.site,
      merchantId: termCtx.merchantId,
      username: termCtx.credentials.username,
      password: termCtx.credentials.password,
    });

    const tipResponse = await client.tipPrompt(session.sessionKey, {
      hsn: termCtx.device.hsn,
      amount: centsToDollars(input.amountCents),
      tipOptions: input.tipOptions,
    });

    return NextResponse.json({
      data: {
        tipAmountCents: dollarsToCents(tipResponse.tipAmount),
        tipAmountDollars: tipResponse.tipAmount,
      },
    });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
