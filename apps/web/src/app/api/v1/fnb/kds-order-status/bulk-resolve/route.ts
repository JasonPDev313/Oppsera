import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { bulkResolveKdsSends, bulkResolveKdsSendsSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/kds-order-status/bulk-resolve — bulk resolve sends
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bulkResolveKdsSendsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await bulkResolveKdsSends(ctx, parsed.data.sendIds, parsed.data.reason);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
