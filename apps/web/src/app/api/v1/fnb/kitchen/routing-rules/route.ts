import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listRoutingRules, createRoutingRule, createRoutingRuleSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/routing-rules — list routing rules
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rules = await listRoutingRules({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      stationId: url.searchParams.get('stationId') ?? undefined,
      ruleType: (url.searchParams.get('ruleType') as any) ?? undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : undefined,
    });
    return NextResponse.json({ data: rules });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.view' },
);

// POST /api/v1/fnb/kitchen/routing-rules — create routing rule
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createRoutingRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const rule = await createRoutingRule(ctx, parsed.data);
    return NextResponse.json({ data: rule }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage' },
);
