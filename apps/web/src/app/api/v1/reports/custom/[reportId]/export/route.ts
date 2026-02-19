import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { runReport, toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

function extractReportId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/reports/custom/{reportId}/export → reportId is at parts[-2]
  return parts[parts.length - 2]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const reportId = extractReportId(request);

    const result = await runReport({
      tenantId: ctx.tenantId,
      reportId,
    });

    const csvColumns: CsvColumn[] = result.columns.map((col) => {
      // Strip dataset prefix for human-readable CSV headers
      const bareKey = col.includes(':') ? col.slice(col.indexOf(':') + 1) : col;
      return {
        key: col,
        label: bareKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      };
    });

    const buffer = toCsv(csvColumns, result.rows as unknown as Record<string, unknown>[]);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-${reportId}.csv"`,
      },
    });
  },
  { entitlement: 'reporting', permission: 'reports.export' },
);
