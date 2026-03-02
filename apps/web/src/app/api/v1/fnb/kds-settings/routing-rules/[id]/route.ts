import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateRoutingRule,
  updateKdsRoutingRuleSchema,
} from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/kds-settings/routing-rules/[id] — update routing rule
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ruleId = parts[parts.indexOf('routing-rules') + 1]!;

    const body = await request.json();
    const parsed = updateKdsRoutingRuleSchema.safeParse({ ...body, ruleId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const rule = await updateRoutingRule(ctx, ruleId, parsed.data);
    return NextResponse.json({ data: rule });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);

// DELETE /api/v1/fnb/kds-settings/routing-rules/[id] — deactivate routing rule
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ruleId = parts[parts.indexOf('routing-rules') + 1]!;

    const rule = await updateRoutingRule(ctx, ruleId, {
      ruleId,
      isActive: false,
    });
    return NextResponse.json({ data: rule });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);
