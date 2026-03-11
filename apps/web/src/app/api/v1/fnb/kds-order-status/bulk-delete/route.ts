import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { bulkSoftDeleteKdsSends, bulkSoftDeleteKdsSendsSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/kds-order-status/bulk-delete — bulk soft-delete sends
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = bulkSoftDeleteKdsSendsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await bulkSoftDeleteKdsSends(ctx, parsed.data.sendIds, parsed.data.reason);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
