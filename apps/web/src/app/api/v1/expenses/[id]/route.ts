import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getExpense,
  updateExpense,
  updateExpenseSchema,
} from '@oppsera/module-expenses';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const result = await getExpense(ctx.tenantId, id);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Expense not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'expenses.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateExpense(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'expenses.create', writeAccess: true },
);
