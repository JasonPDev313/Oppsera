import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, sql } from '@oppsera/db';

// GET /api/v1/accounting/mappings/payment-types — list payment type GL defaults
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT
          pt.payment_type_id,
          pt.cash_account_id,
          pt.clearing_account_id,
          pt.fee_expense_account_id,
          pt.created_at,
          pt.updated_at
        FROM payment_type_gl_defaults pt
        WHERE pt.tenant_id = ${ctx.tenantId}
        ORDER BY pt.payment_type_id
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
        paymentTypeId: String(row.payment_type_id),
        cashAccountId: row.cash_account_id ? String(row.cash_account_id) : null,
        clearingAccountId: row.clearing_account_id ? String(row.clearing_account_id) : null,
        feeExpenseAccountId: row.fee_expense_account_id ? String(row.fee_expense_account_id) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
