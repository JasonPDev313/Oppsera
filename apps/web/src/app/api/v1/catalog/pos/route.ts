import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCatalogForPOS } from '@oppsera/module-catalog';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// GET /api/v1/catalog/pos — lean POS catalog (items + categories in one call)
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await getCatalogForPOS(ctx.tenantId);

    // Batch-fetch on-hand for trackable items from inventory_movements.
    // Orchestration layer can cross module boundaries (catalog + inventory).
    const trackableIds = result.items
      .filter((i) => i.isTrackable)
      .map((i) => i.id);

    let onHandByCatalogItemId: Record<string, number> = {};
    if (trackableIds.length > 0) {
      try {
        const onHandRows = await withTenant(ctx.tenantId, async (tx) => {
          const idList = sql.join(trackableIds.map((id) => sql`${id}`), sql`, `);
          return (tx as any).execute(sql`
            SELECT ii.catalog_item_id,
                   COALESCE(SUM(im.quantity_delta), 0) AS on_hand
            FROM inventory_items ii
            LEFT JOIN inventory_movements im
              ON im.inventory_item_id = ii.id
              AND im.tenant_id = ii.tenant_id
            WHERE ii.tenant_id = ${ctx.tenantId}
              AND ii.catalog_item_id IN (${idList})
              AND ii.status = 'active'
              AND ii.track_inventory = true
            GROUP BY ii.catalog_item_id
          `);
        });
        const rows = Array.from(onHandRows as Iterable<{ catalog_item_id: string; on_hand: string }>);
        for (const row of rows) {
          onHandByCatalogItemId[row.catalog_item_id] = parseFloat(row.on_hand);
        }
      } catch (err) {
        // Non-critical — POS works without on-hand; log and continue
        console.error('POS on-hand lookup failed:', err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json(
      { data: { ...result, onHandByCatalogItemId } },
      { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } },
    );
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);
