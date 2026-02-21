import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getCloseBatch, getCloseBatchSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/close-batch/[id] — get close batch detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const closeBatchId = parts[parts.length - 1]!;

    const parsed = getCloseBatchSchema.safeParse({
      tenantId: ctx.tenantId,
      closeBatchId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await getCloseBatch(parsed.data);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Close batch not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.close_batch.view' },
);
