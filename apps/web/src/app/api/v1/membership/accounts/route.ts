import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listMembershipAccounts,
  createMembershipAccount,
  createMembershipAccountSchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listMembershipAccounts({
      tenantId: ctx.tenantId,
      status: url.searchParams.get('status') ?? undefined,
      customerId: url.searchParams.get('customerId') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined,
    });
    return NextResponse.json({
      data: result.accounts,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createMembershipAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createMembershipAccount(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' },
);
