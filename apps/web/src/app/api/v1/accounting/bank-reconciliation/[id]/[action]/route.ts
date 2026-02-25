import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  addBankAdjustment,
  addBankAdjustmentSchema,
  clearReconciliationItems,
  clearReconciliationItemsSchema,
  completeBankReconciliation,
  completeBankReconciliationSchema,
} from '@oppsera/module-accounting';

const ACTIONS: Record<string, true> = {
  adjustment: true,
  clear: true,
  complete: true,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/accounting/bank-reconciliation/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const reconciliationId = extractId(request);
    const body = await request.json();

    switch (action) {
      case 'adjustment': {
        const parsed = addBankAdjustmentSchema.safeParse({ ...body, reconciliationId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await addBankAdjustment(ctx, parsed.data);
        return NextResponse.json({ data: result }, { status: 201 });
      }
      case 'clear': {
        const parsed = clearReconciliationItemsSchema.safeParse({ ...body, reconciliationId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        await clearReconciliationItems(ctx, parsed.data);
        return NextResponse.json({ data: { success: true } });
      }
      case 'complete': {
        const parsed = completeBankReconciliationSchema.safeParse({ ...body, reconciliationId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await completeBankReconciliation(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
