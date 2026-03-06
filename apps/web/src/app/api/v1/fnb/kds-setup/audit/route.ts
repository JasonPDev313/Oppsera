import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';

/**
 * GET /api/v1/fnb/kds-setup/audit
 *
 * Scans catalog items typed as 'retail' that may actually be food/beverage.
 * Used by the KDS Setup Wizard menu audit step.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const items = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT ci.id,
                   ci.name,
                   ci.item_type AS item_type,
                   cc.name AS category_name
            FROM catalog_items ci
            LEFT JOIN catalog_categories cc ON cc.id = ci.category_id
            WHERE ci.tenant_id = ${ctx.tenantId}
              AND ci.item_type = 'retail'
              AND ci.archived_at IS NULL
            ORDER BY ci.name ASC
            LIMIT 500`,
      );
      return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        itemType: r.item_type as string,
        categoryName: (r.category_name as string) ?? null,
      }));
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);
