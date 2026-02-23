import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { renewSoftLock, renewSoftLockSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/locks/[id]/renew — renew a soft lock
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parts = request.nextUrl.pathname.split('/');
    const lockId = parts[parts.length - 2]!;
    const parsed = renewSoftLockSchema.safeParse({ ...body, lockId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await renewSoftLock(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' , writeAccess: true },
);
