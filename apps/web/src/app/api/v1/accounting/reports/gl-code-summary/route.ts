import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getGlCodeSummary } from '@oppsera/module-accounting';
import { toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const CSV_COLUMNS: CsvColumn[] = [
  { key: 'section', label: 'Section' },
  { key: 'memo', label: 'Memo' },
  { key: 'accountNumber', label: 'Account #' },
  { key: 'accountName', label: 'Account Name' },
  { key: 'totalDebit', label: 'Debit' },
  { key: 'totalCredit', label: 'Credit' },
];

// GET /api/v1/accounting/reports/gl-code-summary
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!startDate || !endDate) {
      throw new AppError('VALIDATION_ERROR', 'startDate and endDate are required', 400);
    }

    const locationId = url.searchParams.get('locationId') ?? undefined;
    const format = url.searchParams.get('format');

    const result = await getGlCodeSummary({
      tenantId: ctx.tenantId,
      startDate,
      endDate,
      locationId,
    });

    if (format === 'csv') {
      const buffer = toCsv(CSV_COLUMNS, result.lines as unknown as Record<string, unknown>[]);
      const filename = `gl-code-summary_${startDate}_${endDate}.csv`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      data: {
        lines: result.lines,
        grandTotalDebit: result.grandTotalDebit,
        grandTotalCredit: result.grandTotalCredit,
      },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
