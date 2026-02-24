import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getSmartTagRule,
  updateSmartTagRule,
  updateSmartTagRuleSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/customers/smart-tag-rules/:id
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ruleId = extractId(request);
    const rule = await getSmartTagRule({ tenantId: ctx.tenantId, ruleId });
    if (!rule) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Smart tag rule not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: rule });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.view' },
);

// PATCH /api/v1/customers/smart-tag-rules/:id
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ruleId = extractId(request);
    const body = await request.json();
    const parsed = updateSmartTagRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const rule = await updateSmartTagRule(ctx, ruleId, parsed.data);
    return NextResponse.json({ data: rule });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.manage', writeAccess: true },
);
