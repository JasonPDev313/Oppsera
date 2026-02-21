import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { forceReleaseSoftLock, forceReleaseSoftLockSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/locks/[id]/force-release — force release by entity (manager only)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = forceReleaseSoftLockSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await forceReleaseSoftLock(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' },
);
