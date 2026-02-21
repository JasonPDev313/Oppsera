import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { retryBatchPosting, retryBatchPostingSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/gl/retry-batch
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = retryBatchPostingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await retryBatchPosting(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.gl.manage' },
);
