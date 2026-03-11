import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  tokenizeBankAccount,
  tokenizeBankAccountSchema,
} from '@oppsera/module-payments';

// POST /api/v1/payments/bank-accounts/tokenize
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = tokenizeBankAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await tokenizeBankAccount(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 200 });
  },
  { entitlement: 'payments', permission: 'customers.manage', writeAccess: true },
);
