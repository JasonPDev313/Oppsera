import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseCsvContent, extractSampleRows } from '@oppsera/module-customers/services/csv-import/csv-parser';
import { detectColumns } from '@oppsera/module-customers/services/csv-import/column-detector';
import type { DetectColumnsResult } from '@oppsera/module-customers/services/csv-import/import-types';

// POST /api/v1/customers/import/detect-columns
// Parse CSV + detect column mappings (Tier 1 alias + Tier 2 AI)
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const body = await request.json();
    const { csvContent } = body as { csvContent?: string };

    if (!csvContent || typeof csvContent !== 'string') {
      throw new ValidationError('csvContent is required');
    }

    // Parse the CSV
    const parsed = parseCsvContent(csvContent);
    if ('error' in parsed) {
      return NextResponse.json(
        { error: { code: 'PARSE_ERROR', message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { headers, rows, totalRows } = parsed.data;
    const sampleRows = extractSampleRows(rows);

    // Run two-tier column detection
    const { mappings, transforms } = await detectColumns(headers, sampleRows);

    const result: DetectColumnsResult = {
      headers,
      sampleRows,
      mappings,
      transforms,
      totalRows,
    };

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
