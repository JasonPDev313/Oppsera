import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getReport, saveReport, deleteReport } from '@oppsera/module-reporting';

function extractReportId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/reports/custom/{reportId} → last segment
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const reportId = extractReportId(request);
    const report = await getReport(ctx.tenantId, reportId);
    if (!report) {
      throw new AppError('NOT_FOUND', 'Report not found', 404);
    }
    return NextResponse.json({ data: report });
  },
  { entitlement: 'reporting', permission: 'reports.custom.view' },
);

export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const reportId = extractReportId(request);
    const body = await request.json();

    if (!body.name || !body.dataset || !body.definition) {
      throw new AppError('VALIDATION_ERROR', 'name, dataset, and definition are required', 400);
    }

    const result = await saveReport(ctx, {
      id: reportId,
      name: body.name,
      description: body.description,
      dataset: body.dataset,
      definition: body.definition,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'reporting', permission: 'reports.custom.manage', writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const reportId = extractReportId(request);
    await deleteReport(ctx, reportId);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'reporting', permission: 'reports.custom.manage' , writeAccess: true },
);
