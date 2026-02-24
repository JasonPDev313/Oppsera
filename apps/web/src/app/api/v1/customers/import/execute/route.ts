import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseCsvContent } from '@oppsera/module-customers/services/csv-import/csv-parser';
import { validateAndMapRows } from '@oppsera/module-customers/services/csv-import/row-validator';
import { bulkImportCustomers } from '@oppsera/module-customers/commands/bulk-import-customers';
import type { ColumnMapping, DetectedTransform, DuplicateResolution } from '@oppsera/module-customers/services/csv-import/import-types';

// POST /api/v1/customers/import/execute
// Execute the import with final mappings + duplicate resolutions
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const {
      csvContent,
      mappings,
      transforms,
      duplicateResolutions,
      fileName,
      fileSizeBytes,
    } = body as {
      csvContent?: string;
      mappings?: ColumnMapping[];
      transforms?: DetectedTransform[];
      duplicateResolutions?: Record<number, DuplicateResolution>;
      fileName?: string;
      fileSizeBytes?: number;
    };

    if (!csvContent || !mappings || !fileName) {
      throw new ValidationError('csvContent, mappings, and fileName are required');
    }

    // Re-parse CSV
    const parsed = parseCsvContent(csvContent);
    if ('error' in parsed) {
      return NextResponse.json(
        { error: { code: 'PARSE_ERROR', message: parsed.error.message } },
        { status: 400 },
      );
    }

    // Validate and map rows
    const { validRows } = validateAndMapRows(
      parsed.data.rows,
      mappings,
      transforms ?? [],
    );

    // Execute bulk import
    const result = await bulkImportCustomers(ctx, {
      fileName,
      fileSizeBytes,
      mappedRows: validRows,
      columnMappings: mappings,
      duplicateResolutions: duplicateResolutions ?? {},
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage', writeAccess: true },
);
