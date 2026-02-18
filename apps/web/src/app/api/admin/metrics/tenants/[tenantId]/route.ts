import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';

function extractTenantIdFromUrl(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin only' } },
        { status: 403 },
      );
    }

    const targetTenantId = extractTenantIdFromUrl(request);

    const [info, orderStats, eventStats, jobStats, dataSizes] = await Promise.all([
      // Tenant info
      db.execute(sql`
        SELECT id, name, status, plan, created_at, updated_at
        FROM tenants
        WHERE id = ${targetTenantId}
      `),
      // Order stats
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS this_week,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS this_month,
          COUNT(*) AS total
        FROM orders
        WHERE tenant_id = ${targetTenantId}
      `),
      // Event stats (24h)
      db.execute(sql`
        SELECT
          COUNT(*) AS total_24h,
          COUNT(*) FILTER (WHERE published_at IS NULL) AS pending,
          MAX(created_at) AS last_event_at
        FROM event_outbox
        WHERE tenant_id = ${targetTenantId}
          AND created_at > NOW() - INTERVAL '24 hours'
      `),
      // Processed events by consumer
      db.execute(sql`
        SELECT
          p.consumer_name,
          COUNT(*) AS processed_count,
          MAX(p.processed_at) AS last_processed_at
        FROM processed_events p
        JOIN event_outbox e ON e.event_id = p.event_id
        WHERE e.tenant_id = ${targetTenantId}
          AND p.processed_at > NOW() - INTERVAL '24 hours'
        GROUP BY p.consumer_name
      `),
      // Data volume (row counts for key tables)
      db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM customers WHERE tenant_id = ${targetTenantId}) AS customers,
          (SELECT COUNT(*) FROM orders WHERE tenant_id = ${targetTenantId}) AS orders,
          (SELECT COUNT(*) FROM catalog_items WHERE tenant_id = ${targetTenantId}) AS catalog_items,
          (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = ${targetTenantId}) AS inventory_movements,
          (SELECT COUNT(*) FROM tenders WHERE tenant_id = ${targetTenantId}) AS tenders
      `),
    ]);

    const toRows = (r: unknown) => Array.from(r as Iterable<Record<string, unknown>>);
    const tenantInfo = toRows(info)[0];

    if (!tenantInfo) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        tenant: tenantInfo,
        orders: toRows(orderStats)[0] ?? {},
        events: toRows(eventStats)[0] ?? {},
        consumers: toRows(jobStats),
        dataVolume: toRows(dataSizes)[0] ?? {},
        timestamp: new Date().toISOString(),
      },
    });
  },
  { permission: 'platform.admin' },
);
