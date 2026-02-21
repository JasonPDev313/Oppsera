import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getPostingReconciliation, getPostingReconciliationSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/gl/reconciliation
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = getPostingReconciliationSchema.safeParse({
      tenantId: ctx.tenantId,
      businessDate: url.searchParams.get('businessDate') ?? '',
      locationId: url.searchParams.get('locationId') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getPostingReconciliation(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.gl.view' },
);
