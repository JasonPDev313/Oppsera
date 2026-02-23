import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateDiscountRule,
  updateDiscountRuleSchema,
} from '@oppsera/module-customers';

function extractRuleId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('discount-rules');
  return parts[idx + 1]!;
}

// PATCH /api/v1/customers/discount-rules/:ruleId — update a discount rule
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ruleId = extractRuleId(request);
    const body = await request.json();
    const parsed = updateDiscountRuleSchema.safeParse({ ...body, ruleId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateDiscountRule(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.discount_rules.manage' , writeAccess: true },
);
