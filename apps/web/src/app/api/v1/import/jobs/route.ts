import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseLimit } from '@/lib/api-params';
import {
  createImportJob,
  createImportJobSchema,
  listImportJobs,
  listImportJobsSchema,
} from '@oppsera/module-import';

// GET /api/v1/import/jobs — list import jobs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const input = listImportJobsSchema.parse({
      tenantId: ctx.tenantId,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });

    const result = await listImportJobs(input);

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'legacy_import', permission: 'import.view' },
);

// POST /api/v1/import/jobs — create import job (upload + analyze)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createImportJobSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createImportJob(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'legacy_import', permission: 'import.manage', writeAccess: true },
);
