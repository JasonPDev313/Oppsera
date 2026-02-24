import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, customerImportLogs } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/import/{id}/report → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/import/[id]/report
// Download import results as CSV
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const log = await withTenant(ctx.tenantId, async (tx: any) => {
      const [row] = await tx
        .select()
        .from(customerImportLogs)
        .where(and(
          eq(customerImportLogs.id, id),
          eq(customerImportLogs.tenantId, ctx.tenantId),
        ))
        .limit(1);
      return row ?? null;
    });

    if (!log) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Import log not found' } },
        { status: 404 },
      );
    }

    // Build CSV report
    const BOM = '\uFEFF';
    const headers = ['Row', 'Status', 'Message'];
    const lines = [headers.join(',')];

    // Add error rows
    const errors = (log.errors ? JSON.parse(JSON.stringify(log.errors)) : []) as Array<{ row: number; message: string }>;
    for (const err of errors) {
      lines.push(`${err.row},"error","${escapeCsvField(err.message)}"`);
    }

    // Summary row
    lines.push('');
    lines.push(`"Summary","Total: ${log.totalRows}","Success: ${log.successRows}, Updated: ${log.updatedRows}, Skipped: ${log.skippedRows}, Errors: ${log.errorRows}"`);

    const csvContent = BOM + lines.join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="import-report-${id}.csv"`,
      },
    });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

function escapeCsvField(value: string): string {
  return value.replace(/"/g, '""');
}
