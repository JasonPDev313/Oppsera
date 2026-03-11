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

    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = terminalReadCardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }

    const result = await terminalReadCard(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
