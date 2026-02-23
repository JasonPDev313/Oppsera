import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createMembershipPlan,
  createMembershipPlanSchema,
  listMembershipPlans,
} from '@oppsera/module-customers';

// GET /api/v1/memberships/plans — list membership plans
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const isActiveParam = url.searchParams.get('isActive');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

    const result = await listMembershipPlans({
      tenantId: ctx.tenantId,
      isActive,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/memberships/plans — create membership plan
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createMembershipPlanSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const plan = await createMembershipPlan(ctx, parsed.data);

    return NextResponse.json({ data: plan }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
