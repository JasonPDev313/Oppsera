import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { importCoaFromCsv, importCoaFromCsvSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/import/execute — validate + import CSV
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = importCoaFromCsvSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }
    const result = await importCoaFromCsv(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true, replayGuard: true, stepUp: 'bulk_operations' },
);
