import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import { terminalAuthCard, terminalAuthCardSchema } from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/auth-card
 * Card-present authorization or sale via physical terminal.
 * Body: { clientRequestId, terminalId, amountCents, tipCents?, capture?, orderId?, ... }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!isEnabled('PAYMENTS_TERMINAL_ENABLED')) {
      throw new AppError('FEATURE_DISABLED', 'Card-present payments are not enabled', 403);
    }

    const body = await request.json();
    const input = terminalAuthCardSchema.parse(body);

    const result = await terminalAuthCard(ctx, input);

    const status = result.status === 'authorized' || result.status === 'captured' ? 201 : 200;
    return NextResponse.json({ data: result }, { status });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
