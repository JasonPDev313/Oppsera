import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { cancelGroup, cancelGroupSchema, PMS_PERMISSIONS } from '@oppsera/module-pms';

// POST /api/v1/pms/groups/[id]/cancel
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 2]!;

    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = cancelGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await cancelGroup(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GROUPS_MANAGE, writeAccess: true },
);
