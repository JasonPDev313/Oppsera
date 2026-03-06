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
          tg.id AS tax_group_id,
          tg.name AS tax_group_name,
          tg.rate,
          gd.tax_payable_account_id,
          COALESCE(gd.updated_at, tg.updated_at) AS updated_at,
          COALESCE(gd.created_at, tg.created_at) AS created_at
        FROM tax_groups tg
        LEFT JOIN tax_group_gl_defaults gd
          ON gd.tenant_id = tg.tenant_id
          AND gd.tax_group_id = tg.id
        WHERE tg.tenant_id = ${ctx.tenantId}
          AND tg.is_active = true
        ORDER BY tg.name
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
        taxGroupId: String(row.tax_group_id),
        taxGroupName: row.tax_group_name ? String(row.tax_group_name) : null,
        rate: row.rate != null ? Number(row.rate) : null,
        taxPayableAccountId: row.tax_payable_account_id ? String(row.tax_payable_account_id) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
