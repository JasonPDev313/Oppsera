import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { runReport } from '@oppsera/module-reporting';

function extractReportId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/reports/custom/{reportId}/run → reportId is at parts[-2]
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const reportId = extractReportId(request);
    const body = await request.json().catch(() => ({}));

    const result = await runReport({
      tenantId: ctx.tenantId,
      reportId,
      overrides: body.overrides,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'reporting', permission: 'reports.custom.view' },
);
