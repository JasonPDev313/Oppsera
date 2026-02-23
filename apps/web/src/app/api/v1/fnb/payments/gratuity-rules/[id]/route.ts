import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateAutoGratuityRule, updateAutoGratuityRuleSchema } from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/payments/gratuity-rules/[id] — update auto-gratuity rule
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ruleId = parts[parts.length - 1]!;

    const body = await request.json();
    const parsed = updateAutoGratuityRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateAutoGratuityRule(ctx, ruleId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tips.manage' , writeAccess: true },
);
