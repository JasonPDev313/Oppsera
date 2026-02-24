import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getImportErrors, getImportErrorsSchema } from '@oppsera/module-import';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/import/jobs/:id/errors — get paginated error list
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);
    const url = new URL(request.url);

    const input = getImportErrorsSchema.parse({
      tenantId: ctx.tenantId,
      importJobId,
      severity: url.searchParams.get('severity') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit')
        ? Math.min(parseInt(url.searchParams.get('limit')!, 10), 100)
        : undefined,
    });

    const result = await getImportErrors(input);

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'legacy_import', permission: 'import.view' },
);
