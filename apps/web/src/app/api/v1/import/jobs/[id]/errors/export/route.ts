import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getImportErrors } from '@oppsera/module-import';
import { toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // .../jobs/[id]/errors/export → id is parts[-3]
  return parts[parts.length - 3]!;
}

const ERROR_COLUMNS: CsvColumn[] = [
  { key: 'rowNumber', label: 'Row Number' },
  { key: 'severity', label: 'Severity' },
  { key: 'category', label: 'Category' },
  { key: 'message', label: 'Message' },
];

// GET /api/v1/import/jobs/:id/errors/export — download errors as CSV
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);

    // Fetch all errors (up to 10K for export)
    const result = await getImportErrors({
      tenantId: ctx.tenantId,
      importJobId,
      limit: 10000,
    });

    const buffer = toCsv(ERROR_COLUMNS, result.items as unknown as Record<string, unknown>[]);
    const filename = `import-errors_${importJobId}.csv`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { entitlement: 'legacy_import', permission: 'import.export' },
);
