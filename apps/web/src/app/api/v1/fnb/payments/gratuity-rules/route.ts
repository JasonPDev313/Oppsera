import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listAutoGratuityRules,
  createAutoGratuityRule,
  listAutoGratuityRulesSchema,
  createAutoGratuityRuleSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/payments/gratuity-rules — list auto-gratuity rules
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listAutoGratuityRulesSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') || undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listAutoGratuityRules(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tips.view' },
);

// POST /api/v1/fnb/payments/gratuity-rules — create auto-gratuity rule
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createAutoGratuityRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createAutoGratuityRule(ctx, ctx.locationId ?? '', parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tips.manage' },
);
