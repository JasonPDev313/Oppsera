import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getMembershipAccount,
  updateMembershipAccount,
  updateMembershipAccountSchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = request.url.split('/accounts/')[1]?.split('/')[0]?.split('?')[0];
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const result = await getMembershipAccount({ tenantId: ctx.tenantId, accountId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = request.url.split('/accounts/')[1]?.split('/')[0]?.split('?')[0];
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateMembershipAccountSchema.safeParse({ ...body, accountId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateMembershipAccount(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
