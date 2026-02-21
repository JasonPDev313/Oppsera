import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, sql } from '@oppsera/db';

// GET /api/v1/accounting/mappings/sub-departments — list sub-department GL defaults
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT
          sd.sub_department_id,
          sd.revenue_account_id,
          sd.cogs_account_id,
          sd.inventory_asset_account_id,
          sd.discount_account_id,
          sd.returns_account_id,
          sd.created_at,
          sd.updated_at
        FROM sub_department_gl_defaults sd
        WHERE sd.tenant_id = ${ctx.tenantId}
        ORDER BY sd.sub_department_id
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
        subDepartmentId: String(row.sub_department_id),
        revenueAccountId: row.revenue_account_id ? String(row.revenue_account_id) : null,
        cogsAccountId: row.cogs_account_id ? String(row.cogs_account_id) : null,
        inventoryAssetAccountId: row.inventory_asset_account_id ? String(row.inventory_asset_account_id) : null,
        discountAccountId: row.discount_account_id ? String(row.discount_account_id) : null,
        returnsAccountId: row.returns_account_id ? String(row.returns_account_id) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
