import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReorderSuggestions } from '@oppsera/module-inventory';
import { withTenant, sql } from '@oppsera/db';
import { semanticAlertNotifications } from '@oppsera/db';
import { and, eq, gte, desc } from 'drizzle-orm';

/**
 * GET /api/v1/inventory/stock-alerts
 *
 * Returns live stock alert data:
 * - items: current items below reorder point or negative (live query)
 * - recentAlerts: recent notification history from the alert system
 * - summary: counts by severity
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') ?? ctx.locationId ?? '';
    const daysBack = Math.min(Number(url.searchParams.get('daysBack') || '30'), 90);

    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'MISSING_LOCATION', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    // 1. Live stock items below reorder point
    const suggestions = await getReorderSuggestions(ctx.tenantId, locationId);

    // 2. Negative stock items (onHand < 0, even if no reorder point set)
    const negativeItems = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT
              ii.id AS "inventoryItemId",
              ii.name AS "itemName",
              ii.sku,
              ii.location_id AS "locationId",
              COALESCE(SUM(im.quantity_delta), 0) AS "onHand"
            FROM inventory_items ii
            LEFT JOIN inventory_movements im ON im.inventory_item_id = ii.id AND im.tenant_id = ii.tenant_id
            WHERE ii.tenant_id = ${ctx.tenantId}
              AND ii.location_id = ${locationId}
              AND ii.status = 'active'
            GROUP BY ii.id, ii.name, ii.sku, ii.location_id
            HAVING COALESCE(SUM(im.quantity_delta), 0) < 0`,
      );
      return Array.from(rows as Iterable<{
        inventoryItemId: string;
        itemName: string;
        sku: string | null;
        locationId: string;
        onHand: string;
      }>);
    });

    // 3. Recent alert notifications
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const recentAlerts = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select({
          id: semanticAlertNotifications.id,
          title: semanticAlertNotifications.title,
          body: semanticAlertNotifications.body,
          severity: semanticAlertNotifications.severity,
          metricSlug: semanticAlertNotifications.metricSlug,
          metricValue: semanticAlertNotifications.metricValue,
          baselineValue: semanticAlertNotifications.baselineValue,
          locationId: semanticAlertNotifications.locationId,
          isRead: semanticAlertNotifications.isRead,
          isDismissed: semanticAlertNotifications.isDismissed,
          createdAt: semanticAlertNotifications.createdAt,
        })
        .from(semanticAlertNotifications)
        .where(
          and(
            eq(semanticAlertNotifications.tenantId, ctx.tenantId),
            gte(semanticAlertNotifications.createdAt, cutoff),
            sql`${semanticAlertNotifications.metricSlug} LIKE 'inventory.%'`,
          ),
        )
        .orderBy(desc(semanticAlertNotifications.createdAt))
        .limit(100);
    });

    // 4. Summary
    const criticalCount = negativeItems.length;
    const warningCount = suggestions.length;
    const unreadAlertCount = recentAlerts.filter((a) => !a.isRead && !a.isDismissed).length;

    return NextResponse.json({
      data: {
        lowStockItems: suggestions,
        negativeStockItems: negativeItems.map((r) => ({
          inventoryItemId: r.inventoryItemId,
          itemName: r.itemName,
          sku: r.sku,
          locationId: r.locationId,
          onHand: Number(r.onHand),
        })),
        recentAlerts,
      },
      meta: {
        summary: {
          criticalCount,
          warningCount,
          totalIssues: criticalCount + warningCount,
          unreadAlertCount,
        },
      },
    });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
