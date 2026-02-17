import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  enrollMember,
  enrollMemberSchema,
  listMemberships,
} from '@oppsera/module-customers';

// GET /api/v1/memberships — list memberships with filters
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const customerId = url.searchParams.get('customerId') ?? undefined;
    const planId = url.searchParams.get('planId') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;

    const result = await listMemberships({
      tenantId: ctx.tenantId,
      cursor,
      limit,
      customerId,
      planId,
      status,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/memberships — enroll member
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = enrollMemberSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const membership = await enrollMember(ctx, parsed.data);

    return NextResponse.json({ data: membership }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
