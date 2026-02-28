import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getExpensePolicy,
  updateExpensePolicy,
  updateExpensePolicySchema,
} from '@oppsera/module-expenses';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const result = await getExpensePolicy(ctx.tenantId, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'expense_management', permission: 'expenses.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateExpensePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateExpensePolicy(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'expense_management', permission: 'expenses.manage', writeAccess: true },
);
