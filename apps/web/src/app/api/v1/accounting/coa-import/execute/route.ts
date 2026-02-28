import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { executeImport } from '@oppsera/module-accounting';
import type { AccountPreview, ImportOptions } from '@oppsera/module-accounting';

// POST /api/v1/accounting/coa-import/execute — execute import with previewed accounts
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { accounts, options } = body as {
      accounts: AccountPreview[];
      options?: ImportOptions;
    };

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'accounts array is required' } },
        { status: 400 },
      );
    }

    const result = await executeImport(ctx, accounts, options ?? {});

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true, replayGuard: true, stepUp: 'bulk_operations' },
);
