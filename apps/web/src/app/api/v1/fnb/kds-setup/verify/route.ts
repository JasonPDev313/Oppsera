import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { resolveKdsLocationId } from '@oppsera/module-fnb';
/**
 * GET /api/v1/fnb/kds-setup/verify
 *
 * Runs diagnostic checks for KDS setup at the current location.
 * Returns structured pass/fail results for the wizard verification step.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const rawLocationId = ctx.locationId;
    if (!rawLocationId) {
      return NextResponse.json({
        data: {
          checks: [{ key: 'location', pass: false, message: 'No location selected' }],
          canLaunch: false,
        },
      });
    }

    // Resolve site → venue (stations live at venues, not sites)
    const kdsLoc = await resolveKdsLocationId(ctx.tenantId, rawLocationId);
    const locationId = kdsLoc.locationId;

    const results = await withTenant(ctx.tenantId, async (tx) => {
      // All three counts in one query to minimize round-trips
      const rows = Array.from(
        (await tx.execute(
          sql`SELECT
                (SELECT COUNT(*) FROM fnb_kitchen_stations
                 WHERE tenant_id = ${ctx.tenantId}
                   AND location_id = ${locationId}
                   AND is_active = true) AS station_count,
                (SELECT COUNT(*) FROM catalog_items
                 WHERE tenant_id = ${ctx.tenantId}
                   AND item_type IN ('food', 'beverage')
                   AND archived_at IS NULL) AS food_item_count,
                (SELECT COUNT(*) FROM fnb_kitchen_routing_rules
                 WHERE tenant_id = ${ctx.tenantId}
                   AND location_id = ${locationId}
                   AND is_active = true) AS rule_count`,
        )) as Iterable<Record<string, unknown>>,
      );
      const counts = rows[0] ?? {};

      return {
        stationCount: Number(counts.station_count ?? 0),
        foodItemCount: Number(counts.food_item_count ?? 0),
        ruleCount: Number(counts.rule_count ?? 0),
      };
    });

    const checks = [
      {
        key: 'stations_active',
        pass: results.stationCount > 0,
        message: results.stationCount > 0
          ? `${results.stationCount} active station${results.stationCount > 1 ? 's' : ''} found`
          : 'No active KDS stations at this location',
      },
      {
        key: 'food_items_exist',
        pass: results.foodItemCount > 0,
        message: results.foodItemCount > 0
          ? `${results.foodItemCount} food/beverage item${results.foodItemCount > 1 ? 's' : ''} in catalog`
          : 'No food or beverage items found — items typed as "retail" will not appear on KDS',
      },
      {
        key: 'routing_configured',
        pass: results.ruleCount > 0,
        message: results.ruleCount > 0
          ? `${results.ruleCount} routing rule${results.ruleCount > 1 ? 's' : ''} configured`
          : 'No routing rules — all items will route to the fallback station',
      },
    ];

    // Can launch if stations exist and food items exist; routing is optional (fallback works)
    const canLaunch = results.stationCount > 0 && results.foodItemCount > 0;

    return NextResponse.json({ data: { checks, canLaunch } });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
