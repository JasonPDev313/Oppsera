import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, AppError } from '@oppsera/shared';
import {
  submitExpense,
  approveExpense,
  rejectExpense,
  postExpense,
  voidExpense,
  markReimbursed,
  rejectExpenseSchema,
  voidExpenseSchema,
  markReimbursedSchema,
} from '@oppsera/module-expenses';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const action = parts[parts.length - 1]!;
    const id = parts[parts.length - 2]!;

    switch (action) {
      case 'submit': {
        const result = await submitExpense(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'approve': {
        const result = await approveExpense(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'reject': {
        const body = await request.json().catch(() => ({}));
        const parsed = rejectExpenseSchema.safeParse({ expenseId: id, ...body });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await rejectExpense(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'post': {
        const result = await postExpense(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'void': {
        const body = await request.json().catch(() => ({}));
        const parsed = voidExpenseSchema.safeParse({ expenseId: id, ...body });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await voidExpense(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'reimburse': {
        const body = await request.json().catch(() => ({}));
        const parsed = markReimbursedSchema.safeParse({ expenseId: id, ...body });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await markReimbursed(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown action: ${action}`, 404);
    }
  },
  { entitlement: 'expense_management', permission: 'expenses.manage', writeAccess: true },
);
