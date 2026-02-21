import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getBatchPostingStatus, getBatchPostingStatusSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/gl/batches/[closeBatchId]/posting-status
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const closeBatchId = parts[parts.length - 2]!;
    const parsed = getBatchPostingStatusSchema.safeParse({
      tenantId: ctx.tenantId,
      closeBatchId,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getBatchPostingStatus(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.gl.view' },
);
