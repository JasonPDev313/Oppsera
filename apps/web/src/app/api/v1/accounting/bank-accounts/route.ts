import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listBankAccounts, saveBankAccount, saveBankAccountSchema } from '@oppsera/module-accounting';

// GET /api/v1/accounting/bank-accounts — list bank accounts
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await listBankAccounts({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/bank-accounts — create or update bank account
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = saveBankAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const bankAccount = await saveBankAccount(ctx, parsed.data);
    return NextResponse.json({ data: bankAccount }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
