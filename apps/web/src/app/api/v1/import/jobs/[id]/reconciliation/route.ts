import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReconciliation } from '@oppsera/module-import';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/import/jobs/:id/reconciliation — get reconciliation totals
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);

    const result = await getReconciliation(ctx.tenantId, importJobId);

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Import job '${importJobId}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'legacy_import', permission: 'import.view' },
);
