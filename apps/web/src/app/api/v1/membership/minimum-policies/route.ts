import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listMinimumPolicies,
  configureMinimumPolicy,
  configureMinimumPolicySchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const entries = await listMinimumPolicies({
      tenantId: ctx.tenantId,
    });

    return NextResponse.json({ data: entries });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = configureMinimumPolicySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await configureMinimumPolicy(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
