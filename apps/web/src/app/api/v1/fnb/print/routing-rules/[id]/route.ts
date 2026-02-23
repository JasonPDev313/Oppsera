import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateRoutingRuleS14, updateRoutingRuleS14Schema } from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/print/routing-rules/[id]
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parts = request.nextUrl.pathname.split('/');
    const ruleId = parts[parts.length - 1]!;
    const parsed = updateRoutingRuleS14Schema.safeParse({ ...body, ruleId });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await updateRoutingRuleS14(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' , writeAccess: true },
);
