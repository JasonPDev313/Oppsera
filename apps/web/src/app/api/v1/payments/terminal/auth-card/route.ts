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

    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = terminalAuthCardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }

    const result = await terminalAuthCard(ctx, parsed.data);

    const status = result.status === 'authorized' || result.status === 'captured' ? 201 : 200;
    return NextResponse.json({ data: result }, { status });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
