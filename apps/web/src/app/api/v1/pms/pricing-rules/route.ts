import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listPricingRules,
  createPricingRule,
  createPricingRuleSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/pricing-rules?propertyId=&isActive?=
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'required' },
      ]);
    }

    const isActiveStr = url.searchParams.get('isActive');
    const isActive = isActiveStr === 'true' ? true : isActiveStr === 'false' ? false : undefined;

    const data = await listPricingRules(ctx.tenantId, propertyId, { isActive });
    return NextResponse.json({ data: data.items });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_VIEW },
);

// POST /api/v1/pms/pricing-rules
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPricingRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createPricingRule(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_MANAGE, writeAccess: true },
);
