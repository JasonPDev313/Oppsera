/**
 * POST /api/v1/import/staff/analyze
 *
 * Accepts a CSV file (multipart/form-data or raw text body),
 * parses it, runs the intelligent column mapping engine,
 * and returns analysis results with confidence-scored mappings.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { parseStaffCsv } from '@oppsera/core/import/staff-import-csv-parser';
import { analyzeStaffColumns } from '@oppsera/core/import/staff-import-analyzer';

async function handler(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  let csvText: string;

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: { code: 'MISSING_FILE', message: 'No file uploaded' } },
        { status: 400 },
      );
    }
    csvText = await file.text();
  } else {
    csvText = await req.text();
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      { error: { code: 'EMPTY_FILE', message: 'File is empty' } },
      { status: 400 },
    );
  }

  try {
    const { headers, rows, delimiter } = parseStaffCsv(csvText);
    const sampleRows = rows.slice(0, 20);
    const analysis = analyzeStaffColumns(headers, sampleRows, rows);

    return NextResponse.json({
      data: {
        ...analysis,
        delimiter,
        fileName: contentType.includes('multipart/form-data')
          ? ((await req.formData?.()) as any)?.get?.('file')?.name ?? 'upload.csv'
          : 'upload.csv',
        rawRowCount: rows.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse CSV';
    return NextResponse.json(
      { error: { code: 'PARSE_ERROR', message } },
      { status: 400 },
    );
  }
}

export const POST = withMiddleware(handler, {
  entitlement: 'platform_core',
  permission: 'users.manage',
});
