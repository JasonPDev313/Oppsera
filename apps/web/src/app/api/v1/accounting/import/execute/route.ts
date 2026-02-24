import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { importCoaFromCsv, importCoaFromCsvSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/import/execute — validate + import CSV
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = importCoaFromCsvSchema.parse(body);
    const result = await importCoaFromCsv(ctx, input);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
