import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseCsvContent } from '@oppsera/module-customers/services/csv-import/csv-parser';
import { validateAndMapRows } from '@oppsera/module-customers/services/csv-import/row-validator';
import { detectDuplicates } from '@oppsera/module-customers/services/csv-import/duplicate-detector';
import type { ColumnMapping, DetectedTransform, ImportValidationResult } from '@oppsera/module-customers/services/csv-import/import-types';

// POST /api/v1/customers/import/validate
// Validate mapped data + detect duplicates
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { csvContent, mappings, transforms } = body as {
      csvContent?: string;
      mappings?: ColumnMapping[];
      transforms?: DetectedTransform[];
    };

    if (!csvContent || !mappings) {
      throw new ValidationError('csvContent and mappings are required');
    }

    // Re-parse CSV
    const parsed = parseCsvContent(csvContent);
    if ('error' in parsed) {
      return NextResponse.json(
        { error: { code: 'PARSE_ERROR', message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { rows, totalRows } = parsed.data;

    // Validate and map all rows
    const { validRows, errors, warnings, validCount } = validateAndMapRows(
      rows,
      mappings,
      transforms ?? [],
    );

    // Detect duplicates against existing customers
    const duplicates = await detectDuplicates(ctx.tenantId, validRows);

    // Build preview (first 50 rows)
    const preview = validRows.slice(0, 50);

    const result: ImportValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      totalRows,
      validRows: validCount,
      duplicates,
      preview,
    };

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
