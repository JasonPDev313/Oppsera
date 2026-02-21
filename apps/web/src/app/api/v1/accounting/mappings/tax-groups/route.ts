import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, sql } from '@oppsera/db';

// GET /api/v1/accounting/mappings/tax-groups — list tax group GL defaults
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT
          tg.tax_group_id,
          tg.tax_payable_account_id,
          tg.created_at,
          tg.updated_at
        FROM tax_group_gl_defaults tg
        WHERE tg.tenant_id = ${ctx.tenantId}
        ORDER BY tg.tax_group_id
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
        taxGroupId: String(row.tax_group_id),
        taxPayableAccountId: row.tax_payable_account_id ? String(row.tax_payable_account_id) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
