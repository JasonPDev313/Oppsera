import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import { terminalReadCard, terminalReadCardSchema } from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/read-card
 * Read card data from physical terminal without authorizing payment.
 * Used for BIN check (credit/debit/prepaid) before surcharge calculation.
 * Body: { terminalId, amountCents? }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!isEnabled('PAYMENTS_TERMINAL_ENABLED')) {
      throw new AppError('FEATURE_DISABLED', 'Card-present payments are not enabled', 403);
    }

    const body = await request.json();
    const input = terminalReadCardSchema.parse(body);

    const result = await terminalReadCard(ctx, input);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
