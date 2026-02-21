import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { releaseSoftLock, releaseSoftLockSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/locks/[id]/release — release a soft lock
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const lockId = parts[parts.length - 2]!;
    const parsed = releaseSoftLockSchema.safeParse({ lockId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await releaseSoftLock(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' },
);
