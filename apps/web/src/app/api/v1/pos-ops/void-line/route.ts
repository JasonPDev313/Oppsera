import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { voidOrderLine, voidOrderLineSchema } from '@oppsera/core/pos-ops';

// POST /api/v1/pos-ops/void-line — Void a single order line
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = voidOrderLineSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await voidOrderLine(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 200 });
  },
  { entitlement: 'orders', permission: 'orders.void' },
);
