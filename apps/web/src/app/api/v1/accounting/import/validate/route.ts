import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { parseCsvImport, validateCsvPreviewSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/import/validate — validate CSV without importing
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const body = await request.json();
    const input = validateCsvPreviewSchema.parse(body);
    const result = parseCsvImport(input.csvContent, input.stateName);

    return NextResponse.json({
      data: {
        isValid: result.isValid,
        errors: result.errors,
        warnings: result.warnings,
        accountCount: result.parsedAccounts.length,
        stateDetections: result.stateDetections,
        preview: result.parsedAccounts.slice(0, 50).map((a) => ({
          accountNumber: a.accountNumber,
          name: a.name,
          accountType: a.accountType,
          parentAccountNumber: a.parentAccountNumber ?? null,
        })),
      },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
