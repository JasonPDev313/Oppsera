import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { toggleSmartTagRule, toggleSmartTagRuleSchema } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/smart-tag-rules/{id}/toggle → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/smart-tag-rules/:id/toggle
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ruleId = extractId(request);
    const body = await request.json();
    const parsed = toggleSmartTagRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const rule = await toggleSmartTagRule(ctx, ruleId, parsed.data);
    return NextResponse.json({ data: rule });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.manage', writeAccess: true },
);
