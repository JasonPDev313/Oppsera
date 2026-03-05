import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import { terminalCancel, terminalCancelSchema } from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/cancel
 * Cancel any pending terminal operation (e.g., waiting for card).
 * Body: { terminalId }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!isEnabled('PAYMENTS_TERMINAL_ENABLED')) {
      throw new AppError('FEATURE_DISABLED', 'Card-present payments are not enabled', 403);
    }

    const body = await request.json();
    const parsed = terminalCancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }

    const result = await terminalCancel(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
