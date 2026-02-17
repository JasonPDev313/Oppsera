import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { adjustTip, adjustTipSchema } from '@oppsera/module-payments';

function extractTenderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// PATCH /api/v1/tenders/:tenderId/tip — adjust tip on a tender
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tenderId = extractTenderId(request);
    const body = await request.json();
    const parsed = adjustTipSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await adjustTip(ctx, tenderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.adjust' },
);
