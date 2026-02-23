import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getPrintJob, updatePrintJobStatus, getPrintJobSchema, updatePrintJobStatusSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/print/jobs/[id]
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const jobId = parts[parts.length - 1]!;
    const parsed = getPrintJobSchema.safeParse({ tenantId: ctx.tenantId, jobId });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getPrintJob(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);

// PATCH /api/v1/fnb/print/jobs/[id] — update status
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parts = request.nextUrl.pathname.split('/');
    const jobId = parts[parts.length - 1]!;
    const parsed = updatePrintJobStatusSchema.safeParse({ ...body, jobId });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await updatePrintJobStatus(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' , writeAccess: true },
);
