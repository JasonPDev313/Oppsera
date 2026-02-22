import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listDiscountRules,
  createDiscountRule,
  createDiscountRuleSchema,
} from '@oppsera/module-customers';

// GET /api/v1/customers/discount-rules — list all discount rules
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const scopeType = url.searchParams.get('scopeType') ?? undefined;
    const isActiveParam = url.searchParams.get('isActive');
    const isActive = isActiveParam != null ? isActiveParam === 'true' : undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;

    const data = await listDiscountRules({
      tenantId: ctx.tenantId,
      scopeType,
      isActive,
      cursor,
      limit,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.discount_rules.view' },
);

// POST /api/v1/customers/discount-rules — create a discount rule
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createDiscountRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createDiscountRule(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.discount_rules.manage' },
);
