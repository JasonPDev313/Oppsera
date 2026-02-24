import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import {
  getPricingRule,
  updatePricingRule,
  deactivatePricingRule,
  updatePricingRuleSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/pricing-rules/[id]
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const data = await getPricingRule(ctx.tenantId, id);
    if (!data) throw new NotFoundError('Pricing rule', id);

    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_VIEW },
);

// PATCH /api/v1/pms/pricing-rules/[id]
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const body = await request.json();
    const parsed = updatePricingRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updatePricingRule(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_MANAGE, writeAccess: true },
);

// DELETE /api/v1/pms/pricing-rules/[id]
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const result = await deactivatePricingRule(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_MANAGE, writeAccess: true },
);
