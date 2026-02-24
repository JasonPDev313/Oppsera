import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { evaluateSmartTags } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/smart-tag-rules/{id}/evaluate → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/smart-tag-rules/:id/evaluate
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ruleId = extractId(request);
    const result = await evaluateSmartTags({
      tenantId: ctx.tenantId,
      ruleId,
      triggerType: 'manual',
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.manage', writeAccess: true },
);
