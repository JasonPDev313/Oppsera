import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRecurringTemplateHistory } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  // /api/v1/accounting/recurring/{id}/history
  return parts[parts.length - 2]!;
}

// GET /api/v1/accounting/recurring/:id/history — journal entries created from this template
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const url = new URL(request.url);
    const limit = url.searchParams.has('limit')
      ? parseInt(url.searchParams.get('limit')!, 10)
      : 20;

    const result = await getRecurringTemplateHistory(ctx.tenantId, id, limit);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
