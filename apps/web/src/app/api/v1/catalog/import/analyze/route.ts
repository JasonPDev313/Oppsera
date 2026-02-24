import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseCsv, isParseError } from '@oppsera/module-catalog/services/inventory-import-parser';
import { analyzeColumns } from '@oppsera/module-catalog/services/inventory-import-analyzer';
import { analyzeImportSchema } from '@oppsera/module-catalog/validation-import';

export const POST = withMiddleware(
  async (request: NextRequest) => {
    const body = await request.json();
    const parsed = analyzeImportSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Parse CSV
    const csvResult = parseCsv(parsed.data.csvContent);
    if (isParseError(csvResult)) {
      throw new ValidationError(csvResult.message, []);
    }

    // Analyze columns
    const sampleRows = csvResult.rows.slice(0, 20);
    const columns = analyzeColumns(csvResult.headers, sampleRows);

    return NextResponse.json({
      data: {
        columns,
        sampleData: csvResult.rows.slice(0, 5),
        totalRows: csvResult.totalRows,
        delimiter: csvResult.delimiter,
      },
    });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
