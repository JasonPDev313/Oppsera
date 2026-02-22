import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getAutopayProfile,
  configureAutopayProfile,
  configureAutopayProfileSchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const result = await getAutopayProfile({
      tenantId: ctx.tenantId,
      membershipAccountId: accountId,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = configureAutopayProfileSchema.safeParse({
      ...body,
      membershipAccountId: accountId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await configureAutopayProfile(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);
