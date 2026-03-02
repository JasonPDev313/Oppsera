import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listRoutingRules,
  createRoutingRule,
  createKdsRoutingRuleSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/routing-rules — list enhanced routing rules
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rules = await listRoutingRules({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      stationId: url.searchParams.get('stationId') ?? undefined,
      ruleType: (url.searchParams.get('ruleType') as any) ?? undefined,
    });
    return NextResponse.json({ data: rules });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/kds-settings/routing-rules — create enhanced routing rule
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createKdsRoutingRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const rule = await createRoutingRule(ctx, parsed.data);
    return NextResponse.json({ data: rule }, { status: 201 });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
