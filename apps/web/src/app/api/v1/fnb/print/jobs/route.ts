import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createPrintJob,
  listPrintJobs,
  createPrintJobSchema,
  listPrintJobsSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/print/jobs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listPrintJobsSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? '',
      printerId: url.searchParams.get('printerId') || undefined,
      status: url.searchParams.get('status') || undefined,
      printJobType: url.searchParams.get('printJobType') || undefined,
      cursor: url.searchParams.get('cursor') || undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await listPrintJobs(parsed.data);
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);

// POST /api/v1/fnb/print/jobs
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPrintJobSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await createPrintJob(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' },
);
