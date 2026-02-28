import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listExpensePolicies,
  createExpensePolicy,
  createExpensePolicySchema,
} from '@oppsera/module-expenses';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await listExpensePolicies(ctx.tenantId);
    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'expense_management', permission: 'expenses.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createExpensePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createExpensePolicy(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'expense_management', permission: 'expenses.manage', writeAccess: true },
);
