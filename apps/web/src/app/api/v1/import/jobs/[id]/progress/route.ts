import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getImportProgress } from '@oppsera/module-import';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/import/jobs/:id/progress — get live import progress
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);

    const progress = await getImportProgress({
      tenantId: ctx.tenantId,
      importJobId,
    });

    if (!progress) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Import job '${importJobId}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: progress });
  },
  { entitlement: 'legacy_import', permission: 'import.view' },
);
