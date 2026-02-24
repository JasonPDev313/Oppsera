import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getImportJob, getImportJobSchema } from '@oppsera/module-import';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // .../jobs/[id] → id is the last segment
  return parts[parts.length - 1]!;
}

// GET /api/v1/import/jobs/:id — get job detail with mappings
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const input = getImportJobSchema.parse({
      tenantId: ctx.tenantId,
      importJobId: id,
    });

    const job = await getImportJob(input);

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Import job '${id}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: job });
  },
  { entitlement: 'legacy_import', permission: 'import.view' },
);
