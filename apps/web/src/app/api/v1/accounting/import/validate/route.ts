import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { parseCsvImport, validateCsvPreviewSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/import/validate — validate CSV without importing
export const POST = withMiddleware(
  async (request: NextRequest, _ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = validateCsvPreviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }
    const result = parseCsvImport(parsed.data.csvContent, parsed.data.stateName);

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
