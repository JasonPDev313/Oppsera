import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateAuthorizedUser,
  updateAuthorizedUserSchema,
} from '@oppsera/module-membership';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = request.url.split('/authorized-users/');
    const userId = segments[1]?.split('/')[0]?.split('?')[0];
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Authorized user ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateAuthorizedUserSchema.safeParse({
      ...body,
      authorizedUserId: userId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateAuthorizedUser(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
