import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin only' } },
        { status: 403 },
      );
    }

    const [activeTenants, ordersToday, errorRate, connections, topTenants, tenantGrowth] =
      await Promise.all([
        // Active tenants (API activity in last 24h) — from event_outbox as proxy
        db.execute(sql`
          SELECT COUNT(DISTINCT tenant_id) AS count
          FROM event_outbox
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `),
        // Total orders today (all tenants)
        db.execute(sql`
          SELECT COUNT(*) AS count
          FROM orders
          WHERE created_at >= CURRENT_DATE
        `),
        // Outbox error proxy: unpublished events older than 5 min
        db.execute(sql`
          SELECT COUNT(*) AS count
          FROM event_outbox
          WHERE published_at IS NULL
            AND created_at < NOW() - INTERVAL '5 minutes'
        `),
        // Connection utilization
        db.execute(sql`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE state = 'active') AS active,
            COUNT(*) FILTER (WHERE state = 'idle') AS idle,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conn
          FROM pg_stat_activity
          WHERE datname = current_database()
        `),
        // Top 5 tenants by event volume (noisy neighbor detection)
        db.execute(sql`
          SELECT tenant_id, COUNT(*) AS event_count
          FROM event_outbox
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY tenant_id
          ORDER BY event_count DESC
          LIMIT 5
        `),
        // Tenant growth: new tenants this week/month
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_this_month,
            COUNT(*) AS total
          FROM tenants
        `),
      ]);

    const toRows = (r: unknown) => Array.from(r as Iterable<Record<string, unknown>>);

    return NextResponse.json({
      data: {
        activeTenants24h: Number(toRows(activeTenants)[0]?.count ?? 0),
        ordersToday: Number(toRows(ordersToday)[0]?.count ?? 0),
        staleOutboxEvents: Number(toRows(errorRate)[0]?.count ?? 0),
        connections: toRows(connections)[0] ?? {},
        topTenantsByVolume: toRows(topTenants),
        tenantGrowth: toRows(tenantGrowth)[0] ?? {},
        timestamp: new Date().toISOString(),
      },
    });
  },
  { permission: 'platform.admin' },
);
