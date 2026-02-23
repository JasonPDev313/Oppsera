import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateMembershipMember,
  updateMembershipMemberSchema,
  removeMembershipMember,
} from '@oppsera/module-membership';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = request.url.split('/members/');
    const memberId = segments[1]?.split('/')[0]?.split('?')[0];
    if (!memberId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Member ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateMembershipMemberSchema.safeParse({ ...body, memberId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateMembershipMember(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = request.url.split('/members/');
    const memberId = segments[1]?.split('/')[0]?.split('?')[0];
    if (!memberId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Member ID is required' } },
        { status: 400 },
      );
    }

    const result = await removeMembershipMember(ctx, { memberId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
