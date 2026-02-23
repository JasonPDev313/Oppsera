import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getMembershipPlan,
  updateMembershipPlan,
  updateMembershipPlanSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/memberships/plans/:id — membership plan detail with enrollment count
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const plan = await getMembershipPlan({ tenantId: ctx.tenantId, planId: id });
    return NextResponse.json({ data: plan });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// PATCH /api/v1/memberships/plans/:id — update membership plan
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateMembershipPlanSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const plan = await updateMembershipPlan(ctx, id, parsed.data);
    return NextResponse.json({ data: plan });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
