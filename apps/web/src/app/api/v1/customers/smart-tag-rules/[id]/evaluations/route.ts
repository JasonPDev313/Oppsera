import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSmartTagEvaluationHistory } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/smart-tag-rules/{id}/evaluations → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/smart-tag-rules/:id/evaluations
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ruleId = extractId(request);
    const { searchParams } = new URL(request.url);
    const result = await getSmartTagEvaluationHistory({
      tenantId: ctx.tenantId,
      ruleId,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.view' },
);
