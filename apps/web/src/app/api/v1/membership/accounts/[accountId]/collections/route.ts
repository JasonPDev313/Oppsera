import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCollectionsTimeline } from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const result = await getCollectionsTimeline({
      tenantId: ctx.tenantId,
      membershipAccountId: accountId,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
