import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listUnpostedBatches, listUnpostedBatchesSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/gl/unposted-batches
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listUnpostedBatchesSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await listUnpostedBatches(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.gl.view' },
);
