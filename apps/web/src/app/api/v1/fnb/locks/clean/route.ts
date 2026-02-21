import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { cleanExpiredLocks } from '@oppsera/module-fnb';

// POST /api/v1/fnb/locks/clean — clean expired locks (background job / manager action)
export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await cleanExpiredLocks({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' },
);
